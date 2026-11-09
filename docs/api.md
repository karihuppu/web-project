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

## Virheet

```json
{ "error": { "message": "Movie not found", "status": 404 } }
```

| Tilanne | Status |
| --- | --- |
| Virheellinen parametri, tietokannan CHECK/NOT NULL | 400 |
| Ei löydy | 404 |
| Jo olemassa (UNIQUE), käytössä oleva rivi (RESTRICT) | 409 (+ `constraint`, esim. `users_email_lower_uq`) |
| Palvelimen virhe | 500, yleinen viesti; yksityiskohdat vain palvelimen lokiin |
