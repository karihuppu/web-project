# API-rajapinnat

Kaikki vastaukset ovat JSONia. Kenttien nimet ovat samat kuin tietokannassa (`snake_case`).
Kehityksessä perusosoite on `VITE_API_URL` (oletus `http://localhost:3000`), tuotannossa sama domain (`/api/...`).

## Yleiskatsaus

| Metodi | Polku | Kuvaus | Issue |
| --- | --- | --- | --- |
| GET | `/api/health` | Tietokantayhteyden tarkistus (200 / 503) | – |
| GET | `/api/tests` | Vanha esimerkkitaulu (poistetaan, kun frontend ei enää käytä sitä) | – |
| GET | `/api/movies` | Elokuvalista: etusivu, haku, genre-suodatus | #1, #2, #9 |
| GET | `/api/movies/:id` | Elokuvan tiedot | #3 |
| GET | `/api/movies/:id/reviews` | Elokuvan arvostelut (julkinen) | #6 |
| POST | `/api/movies/:id/reviews` | Oman arvostelun luonti (vaatii tokenin) | #6 |
| GET | `/api/movies/:id/review` | Oma arvostelu tai `null` (vaatii tokenin) | #6 |
| PUT | `/api/movies/:id/review` | Oman arvostelun muokkaus (vaatii tokenin) | #6 |
| DELETE | `/api/movies/:id/review` | Oman arvostelun poisto (vaatii tokenin) | #6 |
| GET | `/api/genres` | Genret suodatusta varten | #9 |
| POST | `/api/auth/register` | Rekisteröinti → token + käyttäjä | #4 |
| POST | `/api/auth/login` | Kirjautuminen → token + käyttäjä | #4 |
| GET | `/api/auth/me` | Kirjautunut käyttäjä (vaatii tokenin) | #4 |
| PATCH | `/api/auth/me` | Nimimerkin muutos (vaatii tokenin) | #4 |
| DELETE | `/api/auth/me` | Tilin poisto salasanalla vahvistaen (vaatii tokenin) | #4 |
| GET | `/api/groups` | Julkiset ryhmät (haku `q`, sivutus) | #13 |
| GET | `/api/groups/mine` | Omat ryhmät ja oma rooli (vaatii tokenin) | #7 |
| GET | `/api/groups/:id` | Ryhmä, oma rooli ja jäsenet (token valinnainen) | #7 |
| POST | `/api/groups` | Ryhmän luonti; luojasta tulee ylläpitäjä (vaatii tokenin) | #7 |
| POST | `/api/groups/:id/join` | Liittyminen julkiseen ryhmään (vaatii tokenin) | #13 |
| DELETE | `/api/groups/:id/membership` | Oma eroaminen ryhmästä (vaatii tokenin) | #7 |
| POST | `/api/groups/:id/members` | Ylläpitäjä lisää jäsenen nimimerkillä | #7 |
| DELETE | `/api/groups/:id/members/:userId` | Ylläpitäjä poistaa tavallisen jäsenen | #7 |
| GET | `/api/groups/private?name=` | Yksityisen ryhmän haku koko nimellä (vaatii tokenin) | #13 |
| POST | `/api/groups/:id/requests` | Liittymispyyntö yksityiseen ryhmään (vaatii tokenin) | #13 |
| GET | `/api/groups/:id/requests` | Odottavat pyynnöt (ryhmän ylläpitäjä) | #13 |
| POST | `/api/groups/:id/requests/:requestId/approve` | Pyynnön hyväksyntä (ryhmän ylläpitäjä) | #13 |
| POST | `/api/groups/:id/requests/:requestId/reject` | Pyynnön hylkäys (ryhmän ylläpitäjä) | #13 |

## GET /api/movies

Kyselyparametrit (kaikki valinnaisia):

| Parametri | Arvot | Oletus |
| --- | --- | --- |
| `sort` | `newest`, `rating` (TMDB-keskiarvo), `title` | `newest` |
| `genre` | genren `id` (`/api/genres`) | – |
| `q` | hakusana elokuvan nimestä (enint. 100 merkkiä) | – |
| `limit` | 1–50 | 20 |
| `offset` | 0– | 0 |

```json
{
  "items": [
    {
      "id": 5,
      "tmdb_id": 496243,
      "title": "Parasite",
      "original_title": "Gisaengchung",
      "release_date": "2019-05-30",
      "runtime_minutes": 133,
      "poster_path": null,
      "backdrop_path": null,
      "tmdb_vote_average": null,
      "tmdb_vote_count": null,
      "genres": ["Comedy", "Drama", "Thriller"]
    }
  ],
  "limit": 20,
  "offset": 0
}
```

Kuvan osoite: `https://image.tmdb.org/t/p/w500` + `poster_path` (jos ei `null`).

## GET /api/movies/:id

Kuten listan rivi, lisäksi `overview`, `genres` muodossa `[{ "id": 1, "name": "Action" }]`
ja `review_count` (sivuston omien arvostelujen määrä). Tuntematon id → 404, virheellinen id → 400.

## GET /api/movies/:id/reviews

```json
{
  "items": [
    {
      "id": 3,
      "rating": 4,
      "comment": "Efektit toimivat yhä.",
      "created_at": "2026-11-09T09:00:00.000Z",
      "updated_at": "2026-11-09T09:00:00.000Z",
      "author": { "id": 2, "nickname": "Mikko" }
    }
  ],
  "limit": 20,
  "offset": 0
}
```

`author: null` = käyttäjä on poistanut tilinsä → näytä "Poistettu käyttäjä" (kommentti on silloin aina `null`).

## Oma arvostelu (kirjautunut käyttäjä)

Kaikki neljä reittiä vaativat otsakkeen `Authorization: Bearer <token>`. **Tekijä päätellään aina tokenista**:
pyynnön rungon kentät kuten `user_id` tai `author` jätetään huomiotta. Käyttäjä voi lukea, muokata ja poistaa vain
omaa arvosteluaan; muokkaus ja poisto rajataan SQL:ssä sekä elokuvaan että kirjautuneeseen käyttäjään.
Yksi arvostelu per käyttäjä ja elokuva. Issue #6:n anonyymi arviointi ei kuulu tähän versioon (vaatimusmäärittely, Q-06).

**Runko** (POST ja PUT):

| Kenttä | Säännöt |
| --- | --- |
| `rating` | pakollinen JSON-luku 1–5 ilman desimaaleja; merkkijonoa `"5"` ei hyväksytä |
| `comment` | vapaaehtoinen merkkijono; reunojen välilyönnit poistetaan; tyhjä tallennetaan `null`-arvona; yli 2000 merkkiä → 400 (tekstiä ei lyhennetä) |

**Vastauksen muoto** on sama kuin julkisen listan rivi (ei sähköpostia eikä salasanatiivistettä):

```json
{
  "id": 41,
  "rating": 5,
  "comment": "Hieno elokuva!",
  "created_at": "2026-11-16T12:00:00.000Z",
  "updated_at": "2026-11-16T12:05:00.000Z",
  "author": { "id": 7, "nickname": "Anna" }
}
```

| Pyyntö | Onnistuu | Virheet |
| --- | --- | --- |
| `POST /api/movies/:id/reviews` `{ rating, comment }` | `201` + arvostelu | `409` jos oma arvostelu on jo olemassa (olemassa olevaa ei korvata) |
| `GET /api/movies/:id/review` | `200 { "review": { … } }` tai `200 { "review": null }` | – |
| `PUT /api/movies/:id/review` `{ rating, comment }` | `200` + päivitetty arvostelu (`updated_at` päivittyy) | `404` jos omaa arvostelua ei ole |
| `DELETE /api/movies/:id/review` | `204` (ei runkoa) | `404` jos omaa arvostelua ei ole |

Kaikille: `401` ilman tokenia tai vanhentuneella/virheellisellä tokenilla (myös jos tili on poistettu),
`400` virheellisellä `:id`:llä tai rungolla (`fields.rating`, `fields.comment`), `404` jos elokuvaa ei ole.

> **Tarkennus alkuperäiseen ehdotukseen:** `GET /api/movies/:id/review` palauttaa `200 { "review": null }`, kun omaa
> arvostelua ei ole. Näin `404` tarkoittaa aina "elokuvaa ei löytynyt", eikä lomakkeen tarvitse arvata syytä.
> Oma arvostelu haetaan tästä reitistä eikä julkisen listan sivulta, koska se voi olla millä tahansa sivulla.

## Kirjautuminen (`/api/auth`)

Salasana tallennetaan vain bcrypt-tiivisteenä (`bcryptjs`, cost 10). Token on JWT (HS256), voimassa 24 h,
ja se lähetetään otsakkeessa `Authorization: Bearer <token>`. Uloskirjautuminen poistaa tokenin selaimesta;
palvelin ei mitätöi tokenia ennen sen vanhenemista. Allekirjoitusavain on ympäristömuuttujassa `JWT_SECRET`
(vähintään 32 merkkiä). Jos avain puuttuu, kirjautumisreitit vastaavat 503 ja muu sovellus toimii normaalisti.

### POST /api/auth/register

```json
{ "email": "anna@example.com", "nickname": "Anna", "password": "vähintään 8 merkkiä" }
```

Säännöt (samat kuin frontendissä): sähköposti muotoa `x@y.z` (tallennetaan pienillä kirjaimilla),
nimimerkki 3–20 merkkiä, salasana vähintään 8 merkkiä ja enintään 72 tavua.
Onnistuessa `201`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs…",
  "user": { "id": 7, "email": "anna@example.com", "nickname": "Anna", "created_at": "2026-11-16T10:00:00.000Z" }
}
```

### POST /api/auth/login

`{ "email", "password" }` → `200` samassa muodossa kuin rekisteröinti. Väärä sähköposti ja väärä salasana
antavat saman vastauksen `401 "Väärä sähköposti tai salasana."`. Demodatan käyttäjät eivät voi kirjautua.

### GET /api/auth/me

Otsake `Authorization: Bearer <token>` → `200 { "user": { … } }`. Puuttuva, vanhentunut tai väärin
allekirjoitettu token → `401`.

**Kaikki suojatut reitit** (`requireAuth`) tarkistavat tokenin lisäksi, että tili on yhä olemassa:
poistetun tilin vanha token → `401`. Jos tietokantaa ei tavoiteta, vastaus on `500`/`503` eikä `401`,
jotta palvelinvika ei näytä virheelliseltä tokenilta.

### PATCH /api/auth/me

```json
{ "nickname": "UusiNimi" }
```

→ `200 { "user": { "id", "email", "nickname", "created_at" } }`. Käyttäjä päätellään **vain tokenista**;
rungon muut kentät (`id`, `user_id`, `email`, `password` …) jätetään huomiotta.

| Tilanne | Vastaus |
| --- | --- |
| Nimimerkki 3–20 merkkiä reunojen välilyöntien poiston jälkeen | `200`, tallennetaan trimmattuna |
| Sama kuin nykyinen | `200`, ei muutosta (`updated_at` ei muutu) |
| Vain kirjainkoko muuttuu (`anna` → `Anna`) | `200`, sallittu (oma nimimerkki ei ole "varattu") |
| Toisen käyttäjän nimimerkki millä tahansa kirjainkoolla | `409`, `fields.nickname` |
| Puuttuu, ei merkkijono, liian lyhyt/pitkä | `400`, `fields.nickname` |

Arvosteluissa nimimerkki haetaan `users`-taulusta liitoksella, joten uusi nimi näkyy heti kaikissa arvosteluissa.

### DELETE /api/auth/me

```json
{ "password": "nykyinen salasana" }
```

→ `204` ilman runkoa.

| Tilanne | Vastaus |
| --- | --- |
| `password` puuttuu, tyhjä tai ei merkkijono | `400`, `fields.password` |
| Väärä salasana | `403`, `fields.password`; tili ja token säilyvät |
| Token puuttuu, vanhentunut tai tili jo poistettu | `401` |
| Rinnakkainen muutos (lukitus, deadlock) | `503`, voi yrittää uudelleen |

Poisto tehdään yhdessä transaktiossa. Tietokannan säännöt: toivelistat ja niiden elokuvat sekä ryhmäjäsenyydet
poistuvat; tähtiarviot säilyvät nimettöminä (`user_id = NULL`, `author_deleted_at`), kommentit poistuvat; ryhmä
saa uuden ylläpitäjän (pisimpään ollut jäsen) tai poistetaan, jos se tyhjenee. Muiden käyttäjien tiedot eivät muutu.

**Tarkennus ehdotukseen:** `DELETE`-pyynnössä on runko (salasana). Express ja Azure App Service välittävät sen;
selaimen `fetch`/Axios tukee sitä. Väärä salasana on tarkoituksella `403` eikä `401`, jotta käyttöliittymä
ei kirjaa käyttäjää ulos väärän vahvistussalasanan takia.

**Rinnakkaisuus:** `requireAuth`-tarkistuksen jälkeen tili voi vielä poistua. Siksi kirjoitukset nojaavat
tietokantaan: arvostelun lisäys lukitsee käyttäjärivin viiteavaimen kautta. Jos arvostelu valmistuu ennen poistoa,
poisto anonymisoi sen; jos poisto valmistuu ensin, lisäys epäonnistuu (`401`). Poisto lukitsee ensin käyttäjän ryhmät
(`id`-järjestyksessä) ja sitten käyttäjärivin, samassa järjestyksessä kuin ryhmätriggerit (migraatio 003).

## Ryhmät (`/api/groups`)

Toimija päätellään aina tokenista (`req.userId`). Rooli luetaan kyseisen ryhmän `group_members`-rivistä; rungon
kentät kuten `role`, `user_id`, `created_by` tai `members` jätetään huomiotta. Jäsenyyttä muuttavat reitit lukitsevat
ensin ryhmän rivin ja tarkistavat oikeuden samassa transaktiossa (ks. [ryhmat-kehittajalle.md](ryhmat-kehittajalle.md)).
Säännöt ylläpitäjästä ja tyhjästä ryhmästä hoitaa tietokanta (migraatio 003).

**Ryhmä** (`group`): `{ id, name, description, visibility, created_at, member_count }`.
**Jäsen** (`members[]`): `{ id, nickname, role, joined_at }` – vain julkiset tilitiedot, ei sähköpostia.
**Ryhmänäkymä** (GET `/:id`, luonti, liittyminen): `{ group, my_role, members }`; `my_role` on `"admin"`, `"member"` tai `null`.

| Pyyntö | Onnistuu | Virheet |
| --- | --- | --- |
| `GET /api/groups?q=&limit=&offset=` | `200 { items, limit, offset }` vain julkiset ryhmät, uusimmat ensin | `400` parametrit |
| `GET /api/groups/mine` | `200 { items: [ryhmä + my_role + joined_at] }` | `401` |
| `GET /api/groups/:id` (token valinnainen) | `200` ryhmänäkymä | `404` jos ryhmää ei ole **tai se on yksityinen eikä kysyjä ole jäsen**; `401` jos lähetetty token on kelvoton |
| `POST /api/groups` `{ name, description?, visibility }` | `201` ryhmänäkymä, `my_role: "admin"` | `400` `fields.name` (2–100), `fields.description` (≤1000), `fields.visibility` (`public`/`private`, oletus `private`) |
| `POST /api/groups/:id/join` | `201` liittyi (`member`), `200` oli jo jäsen (yksi jäsenyys) | `404` jos ryhmää ei ole tai se on yksityinen |
| `DELETE /api/groups/:id/membership` | `204` | `404` ei jäsen / ei ryhmää |
| `POST /api/groups/:id/members` `{ nickname }` | `201 { member }` (`member`-rooli) | `403` ei ylläpitäjä; `404` + `fields.nickname` käyttäjää ei löydy; `409` + `fields.nickname` jo jäsen; `400` tyhjä |
| `DELETE /api/groups/:id/members/:userId` | `204` | `403` ei ylläpitäjä tai kohde on ylläpitäjä; `400` itsensä poisto (käytä eroamista); `404` ei jäsen |

- **Yksityiseen ryhmään** ei voi liittyä suoraan. Ensimmäisessä versiossa ylläpitäjä lisää jäsenen **tarkalla nimimerkillä**
  (kirjainkoko ei ratkaise, osittainen nimi ei kelpaa). Kutsut ja liittymispyynnöt (Q-02, FR-13) ovat jatkotyötä.
  Ulkopuoliselle yksityinen ryhmä on `404`, jotta sen olemassaolo ei paljastu.
- **Eroaminen:** kun viimeinen ylläpitäjä eroaa, pisimpään ollut jäsen (`joined_at`, tasatilanteessa pienempi
  `user_id`) nousee ylläpitäjäksi; kun viimeinen jäsen eroaa, ryhmä poistetaan.
- **Ylläpitäjä** voi poistaa vain tavallisia jäseniä. Roolien vaihto käsin ei kuulu tähän versioon.

### Yksityisen ryhmän haku ja liittymispyynnöt (#13, migraatio 004)

Nimi on **hakuavain**, ryhmän `id` on **toimintojen avain**. Yksityisen ryhmän nimi on yksilöllinen normalisoituna
`lower(btrim(name))` (indeksi `groups_private_name_uq`); haku käyttää samaa normalisointia. Julkinen ryhmä voi olla
saman niminen, ja se näkyy edelleen vain julkisessa haussa (`GET /api/groups?q=`). Saman nimen luominen toiselle
yksityiselle ryhmälle → `409` + `fields.name`.

| Pyyntö | Onnistuu | Virheet |
| --- | --- | --- |
| `GET /api/groups/private?name=<koko nimi>` | `200 { "match": { id, name, visibility, my_role, request_status } }` tai `{ "match": null }` | `401` ilman tokenia; `400` tyhjä/liian pitkä nimi |
| `POST /api/groups/:id/requests` | `201 { request }` uusi; `200 { request }` odottava oli jo olemassa | `404` ei ryhmää; `400` julkinen ryhmä (liity suoraan); `409` jo jäsen |
| `GET /api/groups/:id/requests` | `200 { items: [{ id, created_at, user: { id, nickname } }] }` odottavat, vanhin ensin | `403` jäsen, ei ylläpitäjä; `404` ulkopuolinen (yksityinen) |
| `POST /api/groups/:id/requests/:requestId/approve` | `200 { status: "approved", member }` (`role: "member"`) | `403`/`404` kuten yllä; `404` pyyntöä ei ole tässä ryhmässä; `409` jo käsitelty |
| `POST /api/groups/:id/requests/:requestId/reject` | `200 { status: "rejected" }` | samat |

- Haku palauttaa vain `id`:n, nimen ja oman tilan (`my_role`, viimeisimmän pyynnön `request_status`:
  `pending`/`approved`/`rejected`/`null`). Kuvaus, jäsenmäärä ja jäsenet näkyvät vasta jäsenelle.
- `request` (pyytäjälle): `{ id, status, created_at, decided_at }`. Yhdellä käyttäjällä on enintään yksi odottava
  pyyntö samaan ryhmään; uusi pyyntö hylkäyksen jälkeen on sallittu.
- **Hyväksyntä** tekee yhdessä transaktiossa: lukitsee ryhmän → tarkistaa ylläpitäjän roolin → merkitsee pyynnön
  hyväksytyksi → lisää jäsenyyden (`member`). Kun jäsenyys syntyy millä tahansa tavalla (myös ylläpitäjän lisäys
  nimimerkillä), tietokannan trigger sulkee saman käyttäjän odottavan pyynnön. Rinnakkainen hyväksyntä ja lisäys
  nimimerkillä: toinen onnistuu, toinen saa `409`; jäsenyysrivejä on yksi, eikä pyyntö jää odottamaan.
- Tilin poisto poistaa käyttäjän pyynnöt; ryhmän poisto poistaa ryhmän pyynnöt.
- **Rajaus:** `POST /:id/requests` tunnistaa ryhmän id:llä. Joku, joka arvaa yksityisen ryhmän id:n, voi lähettää
  pyynnön tuntematta nimeä; ryhmän sisältö ei silti näy, ja ylläpitäjä päättää. Kutsulinkit/-koodit eivät kuulu #13:een.

## Virheet

```json
{ "error": { "message": "Movie not found", "status": 404 } }
```

Lomakkeiden virheissä mukana on `fields`, jonka tekstit näytetään kentän vieressä:

```json
{ "error": { "message": "Resource already exists", "status": 409,
             "constraint": "users_email_lower_uq",
             "fields": { "email": "Tällä sähköpostilla on jo tili." } } }
```

| Tilanne | Status |
| --- | --- |
| Virheellinen parametri tai lomakkeen kenttä, tietokannan CHECK/NOT NULL | 400 (+ `fields`) |
| Ei kirjautunut, väärä tunnus tai salasana, kelvoton token, poistettu tili | 401 |
| Väärä vahvistussalasana (tilin poisto) | 403 (+ `fields.password`) |
| Ryhmän toiminto ilman oikeutta (ei ylläpitäjä) | 403 |
| Ei löydy | 404 |
| Jo olemassa (UNIQUE), käytössä oleva rivi (RESTRICT) | 409 (+ `constraint`; sähköposti/nimimerkki myös `fields`) |
| Palvelimen virhe | 500, yleinen viesti; yksityiskohdat vain palvelimen lokiin |
| Kirjautuminen ei käytettävissä (`JWT_SECRET` puuttuu) | 503 |
| Rinnakkainen muutos: deadlock (`40P01`), serialisointi (`40001`), lukon aikakatkaisu (`55P03`) | 503, voi yrittää uudelleen |

## Testit

`api`-kansiossa `npm test` ajaa integraatiotestit: `auth.test.js`, `reviews.test.js`, `account.test.js`,
`groups.test.js` (ryhmät API:n kautta, myös rinnakkaiset eroamiset), `group-requests.test.js`
(yksityisen ryhmän haku ja liittymispyynnöt, myös rinnakkainen hyväksyntä ja lisäys) ja `concurrency.test.js`
(kaksi tietokantayhteyttä: ryhmätriggerit ja tilin poisto vs. kirjoitus).
Ne tarvitsevat erillisen, migroidun PostgreSQL-testitietokannan (`DB_*`-muuttujat, migraatiot 001–004).
**Älä aja testejä Azuren `cinema_db`:hen.** Testidata poistetaan lopuksi.
