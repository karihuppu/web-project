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
| Ei kirjautunut, väärä tunnus tai salasana, kelvoton token | 401 |
| Ei löydy | 404 |
| Jo olemassa (UNIQUE), käytössä oleva rivi (RESTRICT) | 409 (+ `constraint`; sähköposti/nimimerkki myös `fields`) |
| Palvelimen virhe | 500, yleinen viesti; yksityiskohdat vain palvelimen lokiin |
| Kirjautuminen ei käytettävissä (`JWT_SECRET` puuttuu) | 503 |

## Testit

`api`-kansiossa `npm test` ajaa integraatiotestit (`api/tests/auth.test.js`, `api/tests/reviews.test.js`).
Ne tarvitsevat migroidun PostgreSQL-tietokannan (`DB_*`-muuttujat). Testikäyttäjät poistetaan lopuksi.
