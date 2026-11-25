# Ryhmät: ohje toteuttajalle

Tämä kuvaa tietokannan säännöt (migraatiot 002 ja 003), joiden päälle ryhmien API ja käyttöliittymä on rakennettu.
Ensimmäinen versio (luonti, liittyminen, roolit, eroaminen, jäsenten lisäys/poisto) on haarassa `feature/groups`:
`api/models/Group.js` noudattaa alla olevaa lukitusjärjestystä, ja se on hyvä malli jatkokehitykselle.
Sopikaa API-sopimus (`docs/api.md`) ennen kuin lisäätte uusia tauluja (viestit, kutsut, liittymispyynnöt).

## Taulut

| Taulu | Sarakkeet | Huom. |
| --- | --- | --- |
| `groups` | `id`, `name` (2–100), `description` (≤1000), `visibility` (`public`/`private`, oletus `private`), `created_by`, `created_at`, `updated_at` | `created_by` → `users` ON DELETE SET NULL |
| `group_members` | `group_id`, `user_id`, `role` (`admin`/`member`), `joined_at` | PK `(group_id, user_id)`; molemmat viiteavaimet CASCADE |

Kaavio: [erd.md](erd.md).

## Säännöt, jotka tietokanta takaa (triggerit)

1. Ryhmä luodaan `INSERT INTO groups (name, …, created_by)`; luoja lisätään automaattisesti adminiksi.
   **Älä lisää luojaa itse** (`group_members`-INSERT antaisi 23505). Ilman `created_by`:tä → 23502.
2. Ryhmällä, jossa on jäseniä, on aina vähintään yksi admin. Ylläpitäjiä voi olla useita.
3. Kun viimeinen admin lähtee (eroaa, poistetaan, poistaa tilinsä), pisimpään ollut jäsen nousee adminiksi
   (`joined_at`, tasatilanteessa pienempi `user_id`).
4. Kun viimeinen jäsen lähtee, ryhmä poistetaan. Backendin ei tarvitse poistaa tyhjää ryhmää itse.
5. Viimeistä adminia ei voi alentaa (`UPDATE … SET role = 'member'` → 23514). Nimeä ensin toinen admin.
6. Jäsenyyttä ei voi siirtää (`UPDATE group_id/user_id` → 23514): poista ja lisää uusi rivi.
7. Tilin poisto: jäsenyydet poistuvat, säännöt 3–4 pätevät; `created_by` muuttuu `NULL`:ksi.

## Transaktiot ja lukitus

- **Eristystaso READ COMMITTED** (node-postgresin oletus). Muilla tasoilla trigger keskeyttää (`40001`).
- **Lukitusjärjestys: `groups` → `users` → `group_members`.** Kun transaktio muuttaa jäsenyyksiä, lukitse ensin ryhmä:

  ```js
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM groups WHERE id = $1 FOR UPDATE', [groupId]) // 1. ryhmä
    // 2. oikeustarkistus SAMASSA transaktiossa, esim. onko pyytäjä admin:
    const { rows } = await client.query(
      'SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, req.userId])
    if (rows[0]?.role !== 'admin') { /* 403 */ }
    await client.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, memberId])
    await client.query('COMMIT')
  } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
  ```

  Jos lukitset useita ryhmiä, tee se `id`-järjestyksessä (kuten tilin poisto `api/models/User.js`:ssä).
- Tee oikeustarkistus (onko admin, onko jäsen) **lukon jälkeen samassa transaktiossa**; muuten tarkistus voi vanhentua.
- Käyttäjä otetaan aina tokenista (`req.userId` / `requireAuth`), ei pyynnön rungosta.
- Älä pidä yhteyttä auki hitaiden asioiden ajan (esim. bcrypt) – tee ne ennen `BEGIN`:iä.
- `40P01` (deadlock), `40001`, `55P03` muuttuvat API:ssa 503:ksi; asiakas voi yrittää uudelleen.

## Yksityiset ryhmät

`visibility = 'private'` on vain lippu. Kutsut ja liittymispyynnöt (Q-02, FR-13) vaativat uusia tauluja; niistä
sovitaan ensin. Päätä myös, mitä ei-jäsen saa nähdä yksityisestä ryhmästä (NFR-04).

## Testaus

- `api/tests/concurrency.test.js` näyttää kahden yhteyden testitavan (`pool.connect()` kahdesti, avoin
  transaktio pakottaa järjestyksen, `stillWaiting` varmistaa, että toinen odottaa).
- `npm --prefix api run db:check` sisältää ryhmäsääntöjen yhden yhteyden tarkistukset.
- Testit ajetaan aina erillisessä testikannassa, ei Azuren `cinema_db`:ssä.
