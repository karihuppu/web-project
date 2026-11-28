# Tietokanta: rakenne, migraatiot ja demodata

**Tila:** ehdotus tiimin hyväksyttäväksi (9.11.2026)
**Perusta:** [Vaatimusmaarittely_elokuvasivu.md](Vaatimusmaarittely_elokuvasivu.md), luku 6 "Tiedot ja alustava tietomalli"

Graafinen ERD ja arkkitehtuurikaavio tehdään, kun rakenne on hyväksytty.

## 1. Tiedostot

| Polku | Sisältö |
| --- | --- |
| `api/db/migrations/001_users_movies_reviews.sql` | `users`, `movies`, `genres`, `movie_genres`, `reviews` |
| `api/db/migrations/002_watchlists_groups.sql` | `watchlists`, `watchlist_movies`, `groups`, `group_members` |
| `api/db/migrations/003_group_admin_concurrency.sql` | Ryhmätriggerien korjaus (rinnakkaisuus), ei uusia tauluja; ks. luku 5.3 |
| `api/db/migrations/004_private_group_requests.sql` | Yksityisen ryhmän nimen yksilöllisyys, taulu `group_join_requests`; ks. luku 5.4 |
| `api/db/seeds/demo_seed.sql` | Esittelydata (voi ajaa monta kertaa) |
| `api/db/checks/schema_checks.sql` | Rajoitteiden tarkistukset (aina ROLLBACK) |
| `api/db/migrate.js` | Migraatiotyökalu (`pg` + `dotenv`, ei uusia riippuvuuksia) |
| `api/init.sql` | Vanha testitaulu `test` Docker-kannan luontiin. **Ei ajeta Azureen.** |

## 2. Taulut ja suhteet

```text
users 0..1───* reviews *───1 movies *───* genres     (movie_genres)
users 1───* watchlists 1───* watchlist_movies *───1 movies
users *───* groups                                    (group_members, role)
users 1───* groups.created_by                         (SET NULL)
```

`reviews.user_id` on NULL vain poistetun käyttäjän anonymisoidussa arvostelussa (ks. poistot).

| Taulu | Tarkoitus | Vaatimus |
| --- | --- | --- |
| `users` | Käyttäjätili: sähköposti, nimimerkki, salasanatiiviste | FR-04, NFR-03 |
| `movies` | TMDB-elokuvan paikallinen kopio (`tmdb_id`, perustiedot, kuvapolut, TMDB-keskiarvo) | FR-01–FR-03 |
| `genres`, `movie_genres` | Genret ja elokuvan genret (monesta moneen) | FR-09 |
| `reviews` | Tähtiarvio 1–5 ja vapaaehtoinen kommentti | FR-06 |
| `watchlists`, `watchlist_movies` | Käyttäjän nimetyt toivelistat ja niiden elokuvat | FR-05 |
| `groups`, `group_members` | Julkinen/yksityinen ryhmä, jäsenet ja rooli `admin`/`member` | FR-07, FR-11 |
| `schema_migrations` | Ajettujen migraatioiden historia (luo `migrate.js`) | – |
| `test` | Vanha esimerkkitaulu, jota `/api/tests` ja React käyttävät | – |

### Tärkeimmät säännöt

- Kaikki pääavaimet ovat `INTEGER GENERATED ALWAYS AS IDENTITY`.
- **Sähköposti** ja **nimimerkki** ovat yksilöllisiä kirjainkoosta riippumatta
  (`UNIQUE INDEX ... (lower(email))`). Backendin kannattaa silti tallentaa sähköposti pienillä kirjaimilla.
- **Salasana** tallennetaan vain tiivisteenä (`password_hash`, esim. bcrypt). Selväkielistä salasanaa ei ole missään sarakkeessa.
- **Arvostelu:** vain kirjautunut käyttäjä arvioi. `rating` 1–5, yksi arvostelu per käyttäjä ja elokuva
  (`UNIQUE (user_id, movie_id)`). Tyhjä kommentti tallennetaan `NULL`-arvona, enintään 2000 merkkiä.
  Uutta arvostelua ilman käyttäjää ei voi tallentaa (`reviews_author_chk`).
- **Elokuvan arvosana sivustolla:** toistaiseksi näytetään TMDB:n keskiarvo (`tmdb_vote_average` 0–10,
  `tmdb_vote_count`, päivitysaika `tmdb_synced_at`). Omat arvostelut tallentuvat jo nyt, ja niistä voidaan
  myöhemmin laskea sivuston oma keskiarvo.
- **Toivelista:** saman käyttäjän listoilla eri nimet; sama elokuva vain kerran listalla.
- **Ryhmä:** `visibility` on `public` tai `private` (oletus `private`); jäsenen `role` on `admin` tai `member`.
  Ylläpitäjiä voi olla useita. Ryhmän luoja lisätään automaattisesti ylläpitäjäksi (trigger), joten
  backend tekee ryhmän luonnissa vain `INSERT INTO groups (..., created_by)`.
- **Ryhmällä on aina ylläpitäjä** (trigger `group_members_keep_admin`): kun viimeinen ylläpitäjä eroaa,
  poistetaan ryhmästä tai poistaa tilinsä, pisimpään ryhmässä ollut jäsen (`joined_at`) nousee ylläpitäjäksi.
  Jos jäseniä ei jää, ryhmä poistetaan. Viimeistä ylläpitäjää ei voi alentaa jäseneksi (virhe `23514`).
- Ajat ovat `TIMESTAMPTZ` (tallennetaan UTC:nä), julkaisupäivä `DATE`. Rahasummia ei tarvita.
- `updated_at` päivitetään backendin `UPDATE`-lauseessa (`updated_at = now()`); triggeriä ei ole.

### Poistojen käyttäytyminen

| Kun poistetaan | Seuraus |
| --- | --- |
| Käyttäjä (FR-04) | **Arvosanat säilyvät, kommentit poistuvat:** `user_id = NULL`, `comment = NULL`, `author_deleted_at` asetetaan (trigger + SET NULL). Käyttöliittymä näyttää tekijäksi "Poistettu käyttäjä". Toivelistat, listojen rivit ja jäsenyydet poistuvat (CASCADE). Ryhmissä ylläpito siirtyy (ks. yllä), `created_by = NULL`. |
| Ryhmän jäsenyys | Jos poistunut oli viimeinen ylläpitäjä, pisimpään ollut jäsen nousee ylläpitäjäksi; tyhjä ryhmä poistetaan. |
| Toivelista | Listan elokuvarivit poistuvat, elokuvat säilyvät. |
| Ryhmä | Jäsenyydet poistuvat. |
| Elokuva | **Estetään**, jos elokuvalla on arvosteluja tai se on jollakin listalla (RESTRICT, SQLSTATE `23001`). Genre-linkit poistuvat. |
| Genre | Genre-linkit poistuvat. |

### Indeksit ja niitä käyttävät kyselyt

| Indeksi | Kysely |
| --- | --- |
| `movies (release_date DESC)` | Etusivun uusimmat elokuvat (FR-02) |
| `movies (tmdb_id)` UNIQUE | Elokuvan haku/lisäys TMDB-tunnisteella |
| `reviews (movie_id, created_at DESC)` | Elokuvan arvostelut ja keskiarvo (FR-03, FR-06) |
| `reviews (user_id, movie_id)` UNIQUE | Käyttäjän omat arvostelut, ryhmän jäsenten arvostelut (FR-11) |
| `movie_genres (genre_id)` | Elokuvat genren mukaan (FR-09) |
| `watchlists (user_id, lower(name))` UNIQUE | Käyttäjän listat |
| `group_members (user_id)` | Käyttäjän ryhmät |

Etusivun "suosituimmat" (FR-02) haetaan TMDB:stä (esim. `/discover/movie` aikarajauksella ja
`popularity.desc`-järjestyksellä); omaan tietokantaan ei tarvita siihen indeksiä.
Nimellä haku (FR-01) tehdään ensisijaisesti TMDB:n kautta. Paikallisen `ILIKE '%...%'`-haun nopeuttaminen
vaatisi `pg_trgm`-laajennuksen, joka pitää Azuressa sallia erikseen; sitä ei tarvita pienellä datamäärällä.

## 3. Migraatiot: periaatteet

- Tiedostot nimetään `NNN_kuvaus.sql` ja ajetaan numerojärjestyksessä.
- Jokainen migraatio ajetaan omassa transaktiossaan yhdessä `schema_migrations`-rivin kanssa:
  se onnistuu kokonaan tai ei lainkaan.
- Jo ajettua migraatiota ei ajeta uudelleen. **Ajettua tiedostoa ei saa muokata:**
  työkalu vertaa SHA-256-tarkistussummaa ja pysähtyy, jos tiedosto on muuttunut.
  Muutos tehdään aina uutena tiedostona (`003_...sql`), esim. `ALTER TABLE ...`.
- Migraatiotiedostoon ei kirjoiteta `BEGIN`/`COMMIT`.
- Jos tietokanta ei ole paikallinen (`localhost`, `127.0.0.1`, `database`), kirjoittavat komennot
  vaativat lisäksi `--confirm=<DB_NAME>`.

Komennot ajetaan kansiossa `api`:

| Komento | Mitä tekee |
| --- | --- |
| `npm run db:status` | Näyttää ajetut ja odottavat migraatiot (vain luku) |
| `npm run db:migrate` | Ajaa odottavat migraatiot |
| `npm run db:seed` | Lataa demodatan (ei duplikaatteja, ei muuta olemassa olevia rivejä) |
| `npm run db:check` | Tarkistaa rajoitteet transaktiossa ja tekee ROLLBACKin |

Työkalu lukee yhteystiedot samoista muuttujista kuin sovellus (`DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`, `DB_SSL`): ensin komentorivin ympäristömuuttujat, sitten juuren `.env`.
Ensimmäinen tulostettu rivi `Target: ...` kertoo, mihin kantaan ollaan yhteydessä — tarkista se aina.

## 4. Paikallinen kehitys Dockerilla

### 4.1 Uusi paikallinen kanta

```bash
docker compose up --build
```

PostgreSQL ajaa `api/init.sql`:n vain, kun tietokantavolyymi luodaan ensimmäistä kertaa
(syntyy taulu `test`). Sen jälkeen toisessa terminaalissa:

```bash
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed
docker compose exec backend npm run db:check
```

### 4.2 Olemassa oleva paikallinen kanta

Volyymia **ei tarvitse poistaa** (`docker compose down -v` hävittäisi datan). Riittää:

```bash
docker compose up -d
docker compose exec backend npm run db:status
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed      # tarvittaessa
```

Uudet migraatiot ajetaan samalla tavalla aina, kun joku lisää tiedoston `api/db/migrations`-kansioon
(esim. `git pull`in jälkeen).

### 4.3 Ilman backend-konttia

Jos työkalu ajetaan omalta koneelta, `DB_HOST=database` ei toimi. Aseta muuttujat istunnolle (PowerShell):

```powershell
cd api
$env:DB_HOST = 'localhost'
$env:DB_PORT = '5432'   # sama kuin .env:n DB_EXPOSED_PORT
npm run db:status
npm run db:migrate
```

## 5. Azure (`cinema_db`)

Migraatioita **ei ajeta automaattisesti** sovelluksen käynnistyksessä eikä GitHub Actionsissa.
Ne ajetaan käsin, kun muutos on testattu paikallisesti. **`api/init.sql`:ää ei ajeta Azureen**
(siinä on `DROP TABLE IF EXISTS test`). Tietokantaa `mydb` ei käsitellä.

Edellytykset: oma IP on sallittu PostgreSQL-palvelimen *Networking*-asetuksissa
(sama asia, joka vaaditaan DBeaverille). Tarkista aina ensin `npm run db:status`, mitkä migraatiot on jo ajettu.

### 5.1 Komentoriviltä (suositus)

PowerShell, projektin juuresta. Aseta **kaikki** `DB_*`-muuttujat, muuten puuttuvat arvot luetaan
paikallisesta `.env`:stä. Salasanaa ei kirjoiteta tiedostoon eikä komentohistoriaan.

```powershell
cd api
$env:DB_HOST = 'aleksandrcgm-azure-test-db-ne.postgres.database.azure.com'
$env:DB_PORT = '5432'
$env:DB_NAME = 'cinema_db'
$env:DB_USER = 'appadmin'
$env:DB_SSL  = 'true'
$secure = Read-Host 'cinema_db password' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password

npm run db:status                                # Target: appadmin@...:5432/cinema_db (ssl on), 2 pending
npm run db:migrate -- --confirm=cinema_db
npm run db:status                                # 2 applied, 0 pending
npm run db:check   -- --confirm=cinema_db        # valinnainen, tekee ROLLBACKin
npm run db:seed    -- --confirm=cinema_db        # vain jos demodata halutaan esitykseen

Remove-Item Env:DB_PASSWORD, Env:DB_HOST, Env:DB_PORT, Env:DB_NAME, Env:DB_USER, Env:DB_SSL
```

Lopuksi tarkista sovelluksesta `https://<web-app>/api/health` (200) ja `/api/tests` (3 riviä).

### 5.2 DBeaverilla (varavaihtoehto)

Käytä vain, jos komentorivi ei toimi. Historia kirjataan käsin, jotta `npm run db:status` tunnistaa ajon myöhemmin.

1. Avaa yhteys `cinema_db` ja tarkista: `SELECT current_database(), current_user;` → `cinema_db | appadmin`.
2. Vaihda SQL-editori **manuaaliseen commit-tilaan** (Transaction mode: Manual Commit).
3. Tarkista historia:
   ```sql
   SELECT to_regclass('public.schema_migrations');   -- NULL = ei vielä luotu
   ```
   Jos `NULL`, luo taulu:
   ```sql
   CREATE TABLE public.schema_migrations (
       version    TEXT PRIMARY KEY,
       checksum   TEXT        NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
4. Avaa `001_users_movies_reviews.sql`, aja koko skripti (*Execute SQL Script*, Alt+X) ja aja perään:
   ```sql
   INSERT INTO public.schema_migrations (version, checksum) VALUES
   ('001_users_movies_reviews', 'beccf4e3ae8cfc51678484533a5b826d3d91714ca307b20a38bda36534b7acb1');
   ```
   Jos kaikki onnistui → **Commit**. Jos tuli virhe → **Rollback** ja selvitä syy.
5. Sama tiedostolle `002_watchlists_groups.sql`:
   ```sql
   INSERT INTO public.schema_migrations (version, checksum) VALUES
   ('002_watchlists_groups', 'fd4ca76e5bf60ca413a9cbfecc5a914bb607555f548becfdef0521e55fb5a727');
   ```
6. Demodata (valinnainen): aja `api/db/seeds/demo_seed.sql` ja Commit.

Tarkistussummat vastaavat tiedostojen nykyistä sisältöä (rivinvaihdot normalisoitu LF:ksi).
Migraatio 003 ajetaan komentoriviltä (luku 5.3); DBeaver-polkua sille ei suositella.

### 5.3 Migraatio 003 (ryhmätriggerien korjaus)

Migraatio 003 korvaa ryhmätriggerit (ks. [erd.md](erd.md#rinnakkaisuus)). Se ei muuta tauluja eikä poista dataa.
Ennen kuin säännöt kiristyvät, migraatio tarkistaa nykyisen datan. Jos löytyy ryhmä, jossa on jäseniä mutta ei
ylläpitäjää, tai tyhjä ryhmä, **migraatio pysähtyy eikä muuta mitään** (virhe "Migration 003 stopped", DETAIL listaa
ryhmien id:t). Korjauksesta päätetään ryhmä kerrallaan; mitään ei poisteta tai nimetä automaattisesti.

1. **Diagnostiikka ensin** (vain luku, DBeaver tai psql `cinema_db`:ssä):
   ```sql
   -- ryhmät, joissa on jäseniä mutta ei ylläpitäjää
   SELECT g.id, g.name, g.created_by,
          (SELECT count(*) FROM group_members m WHERE m.group_id = g.id) AS members
   FROM groups g
   WHERE EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id)
     AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.role = 'admin');

   -- tyhjät ryhmät
   SELECT g.id, g.name, g.created_by, g.created_at
   FROM groups g
   WHERE NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id);
   ```
   Molempien pitäisi palauttaa 0 riviä (demodatassa näin on). Jos rivejä tulee: päätä, kuka on ylläpitäjä
   (`UPDATE group_members SET role = 'admin' WHERE group_id = … AND user_id = …`) tai poistetaanko tyhjä ryhmä
   (`DELETE FROM groups WHERE id = …`). Tee muutos vain yksittäiselle id:lle ja sovi siitä tiimin kanssa.
2. **Ajo** samoilla muuttujilla kuin luvussa 5.1:
   ```powershell
   npm run db:status                              # 001, 002 applied; 003 pending
   npm run db:migrate -- --confirm=cinema_db
   npm run db:status                              # 3 applied, 0 pending
   ```
3. **Paluu:** jos jotain menee vikaan kesken, migraatio peruuntuu kokonaan (yksi transaktio).

Uusi backend-versio (tilin hallinta) toimii myös ilman migraatiota 003, joten järjestys on vapaa. Suositus:
diagnostiikka → migraatio 003 → julkaisu → tarkistus.

### 5.4 Migraatio 004 (yksityisen ryhmän haku ja liittymispyynnöt)

Lisää yksilöllisen indeksin `groups_private_name_uq` (`lower(btrim(name))`, vain `visibility = 'private'`),
taulun `group_join_requests` ja triggerin, joka sulkee odottavan pyynnön, kun jäsenyys syntyy. Dataa ei poisteta.

1. **Diagnostiikka ensin** (vain luku):
   ```sql
   -- yksityiset ryhmät, joilla on sama nimi (kirjainkoko ja reunojen välilyönnit eivät erota)
   SELECT lower(btrim(name)) AS normalized, array_agg(id ORDER BY id) AS ids, array_agg(name ORDER BY id) AS names
   FROM groups
   WHERE visibility = 'private'
   GROUP BY lower(btrim(name))
   HAVING count(*) > 1;
   ```
   Odotettu tulos: 0 riviä. Jos rivejä tulee, migraatio pysähtyy ("Migration 004 stopped", DETAIL listaa nimet ja
   id:t). Sovi uusi nimi ryhmän ylläpitäjän kanssa ja nimeä yksi ryhmä uudelleen
   (`UPDATE groups SET name = '…' WHERE id = …`). Mitään ei nimetä automaattisesti.
2. **Ajo** samoilla muuttujilla kuin luvussa 5.1:
   ```powershell
   npm run db:status                              # 001–003 applied; 004 pending
   npm run db:migrate -- --confirm=cinema_db
   npm run db:status                              # 4 applied, 0 pending
   ```
3. **Järjestys:** aja migraatio 004 **ennen** julkaisua. Uusi backend käyttää taulua `group_join_requests`;
   ilman sitä yksityisen ryhmän haku ja pyynnöt vastaisivat 500. Vanha versio toimii migraation 004 kanssa normaalisti.

### 5.5 Julisteet ja kuvaukset TMDB:stä (issue #3)

Käsin ajettava komento täydentää **jo tietokannassa olevat** elokuvat (`tmdb_id`) TMDB:n Movie Details -rajapinnasta
(`GET /3/movie/{tmdb_id}`). Uusia elokuvia ei lisätä, eikä mitään poisteta; `movies.id`, arvostelut ja toivelistat säilyvät.

- `poster_path`: tallennetaan, jos TMDB palauttaa kelvollisen suhteellisen polun (esim. `/abc123.jpg`).
  Puuttuva tai kelvoton arvo ei koskaan tyhjennä olemassa olevaa julistetta.
- `overview`: täytetään **vain tyhjä** kuvaus, ensin `fi-FI`, sitten `en-US`. Olemassa olevaa tekstiä ei korvata.
- Virhe, aikakatkaisu (10 s) tai tyhjä vastaus → elokuvan tiedot jäävät ennalleen; lopussa yhteenveto
  (päivitetty / ennallaan / virheet). Virheiden jälkeen komennon voi ajaa uudelleen.
- `tmdb_synced_at` päivittyy, kun elokuvaan kirjoitetaan.

Tarvitaan TMDB:n **API Read Access Token** (TMDB-tili → Settings → API) muuttujassa `TMDB_READ_TOKEN`.
Myös sovellus käyttää tokenia elokuvahakuun ja TMDB-elokuvasivuun (`/api/tmdb/...`, ks. `docs/api.md`):
Azuressa se on App Service -sovelluksen App Setting `TMDB_READ_TOKEN` (palvelimen muuttuja). Sitä ei koskaan
lisätä `VITE_*`-muuttujaan eikä frontendiin. Ilman tokenia oma valikoima toimii, TMDB-haku vastaa 503.

```powershell
cd api
# DB_* kuten luvussa 5.1 (Azure) tai paikallinen .env
$tok = Read-Host 'TMDB read token' -AsSecureString
$env:TMDB_READ_TOKEN = [System.Net.NetworkCredential]::new('', $tok).Password

npm run tmdb:sync-movie-details -- --dry-run                     # näyttää muutokset, ei kirjoita
npm run tmdb:sync-movie-details -- --confirm=cinema_db           # kirjoittaa (Azure vaatii --confirm)
npm run tmdb:sync-movie-details -- --dry-run --only=603,27205    # vain nämä TMDB-id:t

Remove-Item Env:TMDB_READ_TOKEN
```

Tyhjät kuvaukset näkee etukäteen kyselyllä:
`SELECT id, tmdb_id, title FROM movies WHERE overview IS NULL OR btrim(overview) = '' ORDER BY id;`

#### Vain TMDB-arviot: `--ratings-only`

Päivittää **jo tietokannassa olevien** elokuvien (`tmdb_id`) kentät `tmdb_vote_average` ja `tmdb_vote_count`.
Julisteisiin ja kuvauksiin ei kosketa, uusia elokuvia ei lisätä. Toimii yhdessä `--dry-run`-, `--only`- ja `--confirm`-valintojen kanssa.

- Arvot tarkistetaan samoilla säännöillä kuin uutta elokuvaa tuotaessa (`api/services/tmdbValues.js`):
  keskiarvo luku 0–10 pyöristettynä yhteen desimaaliin, äänimäärä kokonaisluku ≥ 0.
- Molempien arvojen on oltava kelvollisia. Jos TMDB palauttaa virheen (HTTP-virhe, aikakatkaisu, 404) tai
  kelvottoman/puuttuvan arvon, elokuvan **molemmat vanhat arvot säilyvät** ja rivi lasketaan virheeksi.
  Hylätty token (401) keskeyttää ajon heti ennen kirjoituksia.
- Jokaisesta elokuvasta tulostetaan vanhat ja uudet arvot, myös `--dry-run`-ajossa, esim.
  `would set  #4 "Inception" (tmdb 27205): 8.3 / 30000 votes -> 8.4 / 37412 votes`.
- `tmdb_synced_at` ja `updated_at` päivittyvät vain, kun arvot muuttuvat. Uusi ajo ilman muutoksia ei kirjoita mitään.

```powershell
npm run tmdb:sync-movie-details -- --ratings-only --dry-run                    # vanhat ja uudet arvot, ei kirjoita
npm run tmdb:sync-movie-details -- --ratings-only --dry-run --only=603,27205   # vain nämä TMDB-id:t
npm run tmdb:sync-movie-details -- --ratings-only --confirm=cinema_db          # kirjoittaa Azureen
```

## 6. Demodata

`demo_seed.sql` lisää 9 genreä, 6 elokuvaa (oikeat TMDB-tunnisteet), 3 demokäyttäjää
(`anna.demo@example.com`, `mikko.demo@example.com`, `laura.demo@example.com`), 6 arvostelua,
2 toivelistaa ja 2 ryhmää jäsenineen.

- Voi ajaa uudelleen: olemassa olevat rivit ohitetaan, mitään ei päivitetä eikä poisteta.
- Demokäyttäjillä **ei ole toimivaa salasanaa** (`password_hash` alkaa `!`). Kun kirjautuminen toteutetaan,
  demotunnuksille tehdään oikeat tiivisteet erikseen.
- Julisteet (`poster_path`) ja TMDB-keskiarvot (`tmdb_vote_average`) ovat tyhjiä, kunnes TMDB-haku on toteutettu.
  Seed ei keksi TMDB-arvoja.

## 7. Päätökset

**Vaatimuksista suoraan:** käyttäjä, elokuva TMDB-tunnisteella, arvostelu (1–5 + kommentti, yksi per käyttäjä ja elokuva),
toivelista ja sen elokuvat, ryhmä (julkinen/yksityinen) ja jäsenyys roolilla, salasanatiiviste.

**Tiimin päätökset (9.11.2026):**

| # | Kysymys | Päätös | Laajennus myöhemmin |
| --- | --- | --- | --- |
| 1 | Anonyymit arviot (FR-06, issue #6) | Ei vielä: arvion tekee aina kirjautunut käyttäjä. Ennen kirjautumisen valmistumista demoissa käytetään demokäyttäjää. | Uusi migraatio: `guest_token`, osittaiset UNIQUE-indeksit ja laajennettu `reviews_author_chk`. |
| 2 | "Suosituin kk" (FR-02, issue #2) | Suosio ja keskiarvo TMDB:stä (`tmdb_vote_average`). | Sivuston oma keskiarvo `reviews`-taulusta (erillinen näkymä), kun arvioita kertyy. |
| 3 | Viimeinen ylläpitäjä lähtee | Pisimpään ollut jäsen nousee ylläpitäjäksi; tyhjä ryhmä poistetaan (trigger). | Vaihdetaan triggerin logiikkaa uudella migraatiolla. |
| 4 | Arvostelut tilin poiston jälkeen | Arvosana säilyy, kommentti poistuu; tekijä "Poistettu käyttäjä". | – |

**Muut ehdotukset:**

- Nimimerkki on yksilöllinen.
- Elokuvaa ei voi poistaa, jos siihen viitataan.
- Ryhmä on oletuksena yksityinen.
- Genret mukana jo nyt (FR-09 on Should), koska ne ovat halpoja ja tukevat selausta.
- Käyttäjätaulussa ei ole sivuston laajuista `role`-saraketta, koska vaatimuksissa ei ole sivuston ylläpitäjää.
  Lisätään migraationa, jos tarvitaan.

**Huom. vaatimusmäärittelystä:** FR-06 ja issue #6 sallivat anonyymin arvioinnin, luvut 1, 2 ja 6 eivät.
Päätös 1 on väliaikainen ja vaatimus tarkennetaan asiakkaan kanssa.

**Myöhemmin uusina migraatioina:** anonyymit arviot, FR-10 toivelistan jakaminen, FR-12 ryhmäviestit,
FR-13 liittymispyynnöt, FR-14 elokuvateatterit, sivuston ylläpitäjärooli.
