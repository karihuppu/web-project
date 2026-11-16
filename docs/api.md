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
| GET | `/api/movies/:id/reviews` | Elokuvan arvostelut | #6 |
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

`api`-kansiossa `npm test` ajaa kirjautumisen integraatiotestit (`api/tests/auth.test.js`).
Ne tarvitsevat migroidun PostgreSQL-tietokannan (`DB_*`-muuttujat). Testikäyttäjät poistetaan lopuksi.
