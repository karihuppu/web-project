# ERD – tietokannan rakenne

**Lähde:** migraatiot [001_users_movies_reviews.sql](../api/db/migrations/001_users_movies_reviews.sql) ja [002_watchlists_groups.sql](../api/db/migrations/002_watchlists_groups.sql), commit `e75678029267515888ea39b5e557dcfcac5db933`.

> Kaavio on piirretty **lähdekoodin perusteella**. Azuren `cinema_db`:tä ei ole tarkistettu: ei tiedetä, onko migraatiot ajettu siellä. Rakenne on tarkistettu ajamalla migraatiot väliaikaiseen paikalliseen PostgreSQL 18.6 -kantaan.

Kaaviossa on vain nykyinen toteutus. Suunnitellut taulut (ryhmäviestit, liittymispyynnöt, jaetut listat, teatterit) puuttuvat tarkoituksella.

## Kaavio

```mermaid
erDiagram
    users |o--o{ reviews : "kirjoittaa (SET NULL)"
    movies ||--o{ reviews : "saa (RESTRICT)"
    movies ||--o{ movie_genres : "kuuluu (CASCADE)"
    genres ||--o{ movie_genres : "luokittelee (CASCADE)"
    users ||--o{ watchlists : "omistaa (CASCADE)"
    watchlists ||--o{ watchlist_movies : "sisältää (CASCADE)"
    movies ||--o{ watchlist_movies : "on listalla (RESTRICT)"
    users |o--o{ groups : "loi (SET NULL)"
    groups ||--o{ group_members : "jäsenet (CASCADE)"
    users ||--o{ group_members : "jäsenyydet (CASCADE)"

    users {
        int id PK
        text email UK "lower(email) uniikki"
        text nickname UK "lower(nickname) uniikki, 2-30"
        text password_hash "vain tiiviste"
        timestamptz created_at
        timestamptz updated_at
    }
    movies {
        int id PK
        int tmdb_id UK "TMDB-tunniste"
        text title
        text original_title "NULL sallittu"
        text overview "NULL sallittu"
        date release_date "NULL sallittu"
        smallint runtime_minutes "NULL tai yli 0"
        text poster_path "TMDB-polku, NULL sallittu"
        text backdrop_path "TMDB-polku, NULL sallittu"
        numeric tmdb_vote_average "0-10, NULL sallittu"
        int tmdb_vote_count "NULL tai vähintään 0"
        timestamptz tmdb_synced_at "NULL sallittu"
        timestamptz created_at
        timestamptz updated_at
    }
    genres {
        int id PK
        int tmdb_id UK "TMDB:n genretunniste"
        text name
    }
    movie_genres {
        int movie_id PK, FK
        int genre_id PK, FK
    }
    reviews {
        int id PK
        int user_id FK "NULL vain poistetulla käyttäjällä"
        int movie_id FK
        smallint rating "1-5"
        text comment "NULL tai 1-2000 merkkiä"
        timestamptz author_deleted_at "NULL sallittu"
        timestamptz created_at
        timestamptz updated_at
    }
    watchlists {
        int id PK
        int user_id FK
        text name "1-100, uniikki käyttäjälle"
        timestamptz created_at
        timestamptz updated_at
    }
    watchlist_movies {
        int watchlist_id PK, FK
        int movie_id PK, FK
        timestamptz added_at
    }
    groups {
        int id PK
        text name "2-100"
        text description "NULL tai max 1000"
        text visibility "public tai private"
        int created_by FK "NULL sallittu"
        timestamptz created_at
        timestamptz updated_at
    }
    group_members {
        int group_id PK, FK
        int user_id PK, FK
        text role "admin tai member"
        timestamptz joined_at
    }
```

Merkinnät: `||` = täsmälleen yksi, `|o` = nolla tai yksi (viiteavain voi olla `NULL`), `o{` = nolla tai useampi. Suluissa on poistosääntö: mitä lapsiriville tapahtuu, kun vanhempi poistetaan.

Kaikki pääavaimet ovat `INTEGER GENERATED ALWAYS AS IDENTITY`, paitsi liitostaulujen yhdistelmäavaimet. Kaikki sarakkeet ovat `NOT NULL`, ellei kaaviossa lue "NULL sallittu".

## Monesta moneen

| Suhde | Liitostaulu | Avain |
| --- | --- | --- |
| elokuva ↔ genre | `movie_genres` | `(movie_id, genre_id)` |
| toivelista ↔ elokuva | `watchlist_movies` | `(watchlist_id, movie_id)` – sama elokuva vain kerran listalla |
| käyttäjä ↔ ryhmä | `group_members` (+ `role`, `joined_at`) | `(group_id, user_id)` – käyttäjä vain kerran ryhmässä |

## Mitä kaavio ei näytä

### Yksilöllisyys ilman kirjainkokoa
- `users_email_lower_uq` ja `users_nickname_lower_uq` ovat lauseke-indeksejä `lower(email)` ja `lower(nickname)`: `Anna@x.fi` ja `anna@X.fi` ovat sama osoite.
- `watchlists_user_name_uq` = `(user_id, lower(name))`: saman käyttäjän listoilla eri nimet, eri käyttäjillä sama nimi on sallittu.
- `movies.tmdb_id` ja `genres.tmdb_id` ovat tavallisia `UNIQUE`-rajoitteita.

### Kaksi eri arvosanaa
| Arvo | Missä | Asteikko | Lähde |
| --- | --- | --- | --- |
| Oma arvostelu | `reviews.rating` | kokonaisluku **1–5** (CHECK) | sivuston käyttäjät |
| TMDB-keskiarvo | `movies.tmdb_vote_average` | **0–10**, yksi desimaali (`NUMERIC(3,1)`) | TMDB, tallennetaan välimuistiin |

Sivusto näyttää toistaiseksi TMDB-keskiarvon. Omista arvosteluista ei lasketa keskiarvoa. Demodatassa TMDB-arvot ovat `NULL`, koska TMDB-integraatiota ei vielä ole.

### Poistosäännöt

| Poistetaan | `CASCADE` | `SET NULL` | `RESTRICT` (estää poiston) |
| --- | --- | --- | --- |
| `users` | `watchlists` (→ `watchlist_movies`), `group_members` | `reviews.user_id`, `groups.created_by` | – |
| `movies` | `movie_genres` | – | `reviews`, `watchlist_movies` |
| `genres` | `movie_genres` | – | – |
| `watchlists` | `watchlist_movies` | – | – |
| `groups` | `group_members` | – | – |

`RESTRICT`-virheen SQLSTATE PostgreSQL 18:ssa on `23001` (ei `23503`); API palauttaa siitä 409.

### Arvostelut käyttäjän poiston jälkeen
1. `BEFORE DELETE` -trigger `users_anonymize_reviews` asettaa käyttäjän arvosteluihin `comment = NULL` ja `author_deleted_at = now()`.
2. Viiteavain asettaa `user_id = NULL` (`ON DELETE SET NULL`).
3. `reviews_author_chk`: rivi ilman käyttäjää on sallittu vain, jos `author_deleted_at` on asetettu ja kommentti on `NULL`. Uutta arvostelua ilman käyttäjää ei siis voi tallentaa.

Tulos: arvosana säilyy, kommentti häviää ja API näyttää tekijäksi `author: null` ("Poistettu käyttäjä").

### Ryhmien triggerit
- `groups_add_creator_as_admin` (`AFTER INSERT ON groups`): jos `created_by` on annettu, luoja lisätään `group_members`-tauluun roolilla `admin`. Jos `created_by` on `NULL`, ryhmä jää ilman adminia.
- `group_members_keep_admin` (`AFTER DELETE OR UPDATE OF role`, vain kun `OLD.role = 'admin'`):
  - lukitsee ryhmän rivin (`SELECT … FOR UPDATE`);
  - jos jokin admin on jäljellä → ei tehdä mitään;
  - `UPDATE` (alentaminen): virhe `23514`, viimeistä adminia ei voi alentaa;
  - `DELETE`: pisimpään ollut jäsen (`joined_at`, sitten `user_id`) nostetaan adminiksi; jos jäseniä ei ole, ryhmä poistetaan.

### Rinnakkaisuus: mitä triggerit eivät takaa
Testattu kahdella yhtäaikaisella yhteydellä (väliaikainen paikallinen kanta, ei Azure):

| Skenaario | Tulos |
| --- | --- |
| Tavallinen jäsen ja viimeinen admin eroavat yhtä aikaa | ❌ ryhmä voi jäädä **ilman adminia**: valittu seuraaja ehti kadota, `UPDATE` päivitti 0 riviä |
| Viimeinen jäsen ja viimeinen admin eroavat yhtä aikaa | ❌ **tyhjä ryhmä jää** |
| Kaksi adminia eroaa yhtä aikaa (READ COMMITTED) | ✅ ryhmä poistetaan oikein |
| Sama, REPEATABLE READ | ❌ tyhjä ryhmä jää (vanha snapshot) |

Syy: vain adminin poisto lukitsee ryhmän; tavallisen jäsenen poisto ei. Lisäksi lukitusjärjestys on `group_members` → `groups` jäsenyyden poistossa, mutta `groups` → `group_members` ryhmän poistossa. Tämä voi aiheuttaa deadlockin; sitä ei toistettu, se on analyysi. Korjausehdotus: [implementation-review.md, kohta 3](implementation-review.md#rinnakkaisuusvirheet-ryhmätriggerissä-vahvistettu). Ryhmiä ei vielä käytetä API:ssa.

### Indeksit

| Indeksi | Käyttö |
| --- | --- |
| `movies_release_date_idx (release_date DESC NULLS LAST)` | etusivun "uusimmat" (`sort=newest`) |
| `movie_genres_genre_id_idx (genre_id)` | elokuvat genren mukaan (`genre=`) |
| `reviews_movie_created_idx (movie_id, created_at DESC)` | elokuvan arvostelut uusimmasta alkaen, `review_count` |
| `reviews_user_movie_uq (user_id, movie_id)` | yksi arvostelu per käyttäjä + käyttäjän arvostelut |
| `watchlists_user_name_uq (user_id, lower(name))` | käyttäjän listat |
| `watchlist_movies_movie_id_idx (movie_id)` | RESTRICT-tarkistus elokuvaa poistettaessa |
| `groups_created_by_idx (created_by)` | SET NULL käyttäjää poistettaessa |
| `group_members_user_id_idx (user_id)` | käyttäjän ryhmät, CASCADE käyttäjää poistettaessa |

Nimihaku (`ILIKE '%…%'`) ei käytä indeksiä; pienellä datamäärällä se riittää.

## Erilliset taulut

| Taulu | Rooli |
| --- | --- |
| `schema_migrations (version PK, checksum, applied_at)` | Migraatiotyökalun ([migrate.js](../api/db/migrate.js)) historia: mitkä migraatiot on ajettu ja niiden SHA-256-tarkistussumma. Työkalu luo taulun itse; se ei ole osa sovelluksen tietomallia. |
| `test (id PK, description)` | Alkuperäisen esimerkin taulu, jonka [init.sql](../api/init.sql) luo uuteen Docker-kantaan; Azuressa se luotiin käsin. **Vain `GET /api/tests` käyttää sitä. Frontend ei enää kutsu tätä reittiä.** Taulu säilytetään toistaiseksi; poisto on erillinen päätös. Huom. paikallinen (`SERIAL`, `description` voi olla `NULL`) ja Azuren (`IDENTITY`, `NOT NULL UNIQUE`) versio eroavat. |
