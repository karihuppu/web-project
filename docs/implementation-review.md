## 1. Frontend

**Tarkoitus:** React-sovellus, jolla selataan elokuvia ja luetaan arvosteluja.

**Tiedostot:** [src/App.jsx](../src/App.jsx), [src/App.css](../src/App.css), [src/index.css](../src/index.css), [src/main.jsx](../src/main.jsx), [index.html](../index.html), [vite.config.js](../vite.config.js)

| Toiminto | Tila | Toteutus |
| --- | --- | --- |
| Elokuvaluettelo | 🟡 | `Catalogue` hakee `GET /api/movies` |
| Haku nimellä | 🟡 | lomake → URL-parametri `q` → API (vain oma tietokanta, ei TMDB) |
| Genre-suodatus | 🟡 | `GET /api/genres` + `genre`-parametri |
| Järjestys | 🟡 | `newest` / `title` / `rating` (TMDB-keskiarvo) |
| Sivutus | 🟡 | 12 riviä sivulla; seuraava sivu tunnistetaan hakemalla 13. rivi |
| Elokuvasivu | 🟡 | `/movies/:id` → `GET /api/movies/:id` |
| Arvostelujen luku | 🟡 | `GET /api/movies/:id/reviews`, "Poistettu käyttäjä" kun `author` = `null` |
| Lataus-, tyhjä- ja virhetila | 🟡 | `Message`-komponentti, uudelleenyritys |
| Reititys ja URL-tila | 🟡 | oma `useLocation` (History API), ei reitityskirjastoa |
| Julisteet | 🧱 | `<img>` TMDB:n kuvapalvelusta *jos* `poster_path` on olemassa; demodatassa kaikki `NULL` → paikkamerkki |
| Mobiilinäkymä | 🟡 | `@media (max-width: 760px)` ja `(max-width: 480px)` ([App.css](../src/App.css)) |
| Arvostelun kirjoitus, toivelistat, ryhmät, kirjautuminen | ❌ | ei käyttöliittymää |

**Tarkistettu:** `npm run lint` ja `npm run build` onnistuvat **[auto]**. Frontendin kutsumat rajapinnat ja parametrit vastaavat API:a (koodiluku). Käyttöliittymää ei avattu selaimessa tässä katselmoinnissa, eikä mobiilileveyttä (360–430 px) mitattu → `demo-week2.md`:n tarkistuslista on edelleen tekemättä.

**Havainnot:**

| Prioriteetti | Havainto |
| --- | --- |
| Ennen esitystä | Käy `demo-week2.md`:n tarkistuslista läpi julkaistussa osoitteessa ja puhelimella. |
| Lähivaihe | Kaikki koodi on yhdessä 560 rivin `App.jsx`:ssä. Kun lomakkeita tulee lisää, jaa komponentit tiedostoihin. |
| Lähivaihe | Ei frontend-testejä. |
| Myöhemmin | Oma reititys toimii nyt, mutta kirjautumisen ja suojattujen sivujen kanssa reitityskirjasto voi olla selkeämpi. |

## 2. API (Express)

**Tarkoitus:** vain lukuoperaatiot elokuville, genreille ja arvosteluille; tietokantayhteyden tarkistus.

**Tiedostot:** [api/index.js](../api/index.js), [api/routes/](../api/routes/), [api/controllers/](../api/controllers/), [api/models/](../api/models/), [api/middleware/errorHandler.js](../api/middleware/errorHandler.js), [api/middleware/validation.js](../api/middleware/validation.js), [api/models/db.js](../api/models/db.js)

| Reitti | Tila | Huom. |
| --- | --- | --- |
| `GET /api/health` | ✅ | `SELECT 1` → 200 / 503 **[manuaalinen]** |
| `GET /api/movies` | ✅ | `sort` valkolistalla, muut arvot parametreina (`$1…$4`), `ILIKE`-erikoismerkit escapetaan **[manuaalinen]** |
| `GET /api/movies/:id` | ✅ | genret + `review_count` **[manuaalinen]** |
| `GET /api/movies/:id/reviews` | ✅ | `author: null` poistetulle käyttäjälle **[manuaalinen]** |
| `GET /api/genres` | ✅ | **[manuaalinen]** |
| `GET /api/tests` | ✅ | vanha esimerkki; **frontend ei enää käytä sitä** (tarkistettu koodista) |
| Fallback `index.html` React-reiteille | ✅ | GET, ei `/api`, `Accept: text/html` **[manuaalinen]** |
| POST / PUT / DELETE -reitit | ❌ | yhtään kirjoittavaa reittiä ei ole |
| Rekisteröinti, kirjautuminen, suojatut reitit | ❌ | ei bcrypt- eikä JWT-riippuvuutta; `JWT_SECRET` on vain `.env.example`:ssa |

**Virheet:** `errorHandler` muuntaa PostgreSQL-koodit: `23505`/`23001` → 409, `23503`/`23514`/`23502`/`22001`/`22P02` → 400 (+ `constraint`), muut → 500 yleisellä viestillä. Tarkistettu yksikkökutsuilla **[manuaalinen]**.

**Yhteys:** yksi `pg.Pool` ([db.js](../api/models/db.js)), `DB_SSL=true` → TLS ja varmenteen tarkistus, `connectionTimeoutMillis` ja `statement_timeout` 5 s.

**Havainnot:**

| Prioriteetti | Havainto |
| --- | --- |
| Lähivaihe | Ei automaattisia API-testejä (`api/package.json`: `"test"` tulostaa vain virheen). Manuaaliset tarkistukset kannattaa muuttaa `node:test` + supertest -testeiksi. |
| Lähivaihe | `cors()` sallii kaikki alkuperät. Tuotannossa frontend ja API ovat samassa osoitteessa, joten CORSia tarvitaan vain paikallisesti; rajaa `origin` ennen kirjautumista. |
| Lähivaihe | Deadlock (`40P01`) ja serialisointivirhe (`40001`) palautuvat yleisenä 500:na; ne voisi kartoittaa 503:ksi, jolloin asiakas tietää yrittää uudelleen. |
| Myöhemmin | `import 'dotenv/config'` ([index.js](../api/index.js)) kirjoittaa lokiin rivin myös silloin, kun `.env`-tiedostoa ei ole (Azure). Ei vaikuta toimintaan. |

## 3. PostgreSQL

**Tarkoitus:** tietomalli koko MVP:lle, vaikka API käyttää toistaiseksi vain osaa siitä.

**Tiedostot:** [001_users_movies_reviews.sql](../api/db/migrations/001_users_movies_reviews.sql), [002_watchlists_groups.sql](../api/db/migrations/002_watchlists_groups.sql), [demo_seed.sql](../api/db/seeds/demo_seed.sql), [schema_checks.sql](../api/db/checks/schema_checks.sql), [migrate.js](../api/db/migrate.js), [init.sql](../api/init.sql)

| Osa | Tila | Huom. |
| --- | --- | --- |
| 9 sovellustaulua, avaimet, CHECK/UNIQUE, indeksit | ✅ | ks. [erd.md](erd.md) |
| Triggerit (arvostelujen anonymisointi, ryhmän luoja adminiksi, adminin siirto) | ✅ / ⚠️ | toimivat yhden yhteyden testeissä; **kaksi rinnakkaisuusvirhettä löytyi**, ks. alla |
| Migraatiotyökalu (`schema_migrations`, tarkistussumma, advisory lock, `--confirm`) | ✅ | **[manuaalinen]** + **[auto]** `db:check` |
| Demodata (idempotentti) | ✅ | ajettu kahdesti ilman kaksoiskappaleita **[manuaalinen]** |
| Rajoitteiden tarkistukset | ✅ | `npm run db:check`: 34/34 **[auto]** (vaatii tietokannan) |
| Azure `cinema_db`:n nykytila | ❓ | ei tarkistettu tästä repositoriosta; ei tiedetä, onko migraatiot ja seed ajettu |
| Taulu `test` | 🧱 | säilytetty; vain `/api/tests` käyttää sitä, frontend ei |

### Rinnakkaisuusvirheet ryhmätriggerissä (vahvistettu)

Trigger `ensure_group_has_admin` ([002, rivi 92–](../api/db/migrations/002_watchlists_groups.sql)) lukitsee ryhmän (`SELECT … FOR UPDATE`) vain silloin, kun poistuva rivi on **admin** (`WHEN (OLD.role = 'admin')`). Tavallisen jäsenen poisto ei lukitse ryhmää. Testattu kahdella yhtäaikaisella yhteydellä väliaikaisessa PostgreSQL 18.6 -kannassa:

| Skenaario | Tulos | Oikein? |
| --- | --- | --- |
| S1: jäsen S eroaa (ei vielä commit) ja samaan aikaan viimeinen admin eroaa | trigger valitsee seuraajaksi S:n, `UPDATE` odottaa ja päivittää 0 riviä → **ryhmässä on jäseniä mutta ei adminia** | ❌ |
| S2: viimeinen jäsen ja viimeinen admin eroavat yhtä aikaa | **tyhjä ryhmä jää tietokantaan** | ❌ |
| S3: kaksi adminia eroaa yhtä aikaa (READ COMMITTED) | ryhmä poistetaan oikein, koska lukko sarjallistaa triggerit ja jokainen lause näkee uuden tilanteen | ✅ |
| S3 tasolla REPEATABLE READ | **tyhjä ryhmä jää**: odottava transaktio käyttää vanhaa snapshotia | ❌ (sovellus käyttää oletusta READ COMMITTED) |

**Lukitusjärjestys ja deadlock (analyysi, ei toistettu):** jäsenyyden poisto lukitsee ensin `group_members`-rivin ja triggerissä vasta `groups`-rivin; ryhmän poisto lukitsee ensin `groups`-rivin ja cascade sitten `group_members`-rivit. Vastakkainen järjestys voi johtaa deadlockiin (`40P01`). Samoin kahden käyttäjätilin samanaikainen poisto, jos molemmat kuuluvat samoihin ryhmiin eri järjestyksessä, ja seuraajan `UPDATE`, jos seuraaja poistuu samaan aikaan. PostgreSQL katkaisee deadlockin, joten data ei rikkoudu, mutta toinen pyyntö epäonnistuu.

**Muut kattamattomat tapaukset:** ryhmä, jonka `created_by` on `NULL` lisäyshetkellä, syntyy ilman adminia; `UPDATE group_members SET group_id/user_id` ohittaa triggerin (vain `UPDATE OF role` laukaisee sen); `TRUNCATE` ohittaa rivitriggerit.

**Korjausehdotus (erillinen tehtävä, uusi migraatio `003_…`, ei 002:n muokkausta):**
1. Kaikki jäsenyyksiä muuttavat backend-transaktiot lukitsevat ensin ryhmän (`SELECT id FROM groups WHERE id = $1 FOR UPDATE`; tilin poistossa kaikki käyttäjän ryhmät `id`-järjestyksessä). Yhtenäinen järjestys `groups` → `group_members` poistaa deadlockit.
2. Trigger laukeaa kaikille jäsenpoistoille (ei vain adminille) ja poistaa tyhjän ryhmän myös silloin.
3. Seuraajan valinta `SELECT … FOR UPDATE` + tarkistus `GET DIAGNOSTICS … ROW_COUNT`, silmukka uudelleenvalintaan, jos rivi ehti kadota.
4. Kahden yhteyden testiskripti repositorioon (S1–S3).

### Muut havainnot

| Prioriteetti | Havainto |
| --- | --- |
| Ennen esitystä | Varmista, että `cinema_db`:hen on ajettu migraatiot (ja seed, jos demossa näytetään elokuvia): `npm run db:status` Azure-muuttujilla. |
| Lähivaihe | Ryhmätriggerin korjaus (yllä). Ryhmiä ei vielä käytetä API:ssa, joten virhe ei näy esityksessä. |
| Lähivaihe | `reviews_user_movie_uq` on `UNIQUE (user_id, movie_id)`; poistettujen käyttäjien `NULL`-rivejä se ei rajoita (tarkoituksellista). Anonyymit arviot vaativat myöhemmin osittaiset indeksit. |
| Myöhemmin | Nimihaku `ILIKE '%…%'` lukee koko taulun; pienellä datalla riittää, isommalla `pg_trgm` (vaatii Azuren laajennussallinnan). |

## 4. Docker (paikallinen)

**Tiedostot:** [docker-compose.yml](../docker-compose.yml), [Dockerfile](../Dockerfile), [api/Dockerfile](../api/Dockerfile), [.env.example](../.env.example)

- Kolme palvelua: `database` (postgres:18.6, volyymi `postgres_data`, `init.sql` vain uudelle volyymille), `backend` (nodemon, `npm run dev`), `frontend` (Vite dev server).
- Asetukset tulevat `.env`:stä (`env_file`); `NODE_ENV=development` asetetaan composessa.
- Backend käyttää isäntänimeä `database:5432`; selain käyttää julkaistuja portteja (`BACKEND_EXPOSED_PORT`, `FRONTEND_EXPOSED_PORT`, `DB_EXPOSED_PORT`).
- Healthcheckit: `pg_isready` ja `curl /api/health`.
- Migraatiot ajetaan erikseen: `docker compose exec backend npm run db:migrate` (README).

**Tarkistettu:** ei. `docker compose up` -kokonaisuutta ei ajettu tässä katselmoinnissa (isännän portti 5432 on varattu paikalliselle PostgreSQL:lle). Erillinen `postgres:18.6`-kontti testattiin migraatioilla.

| Prioriteetti | Havainto |
| --- | --- |
| Lähivaihe | Aja kerran koko `docker compose up --build` + `exec backend npm run db:migrate/db:seed` ja kirjaa tulos. |
| Lähivaihe | `VITE_API_URL` on selaimen käyttämä osoite: jos `BACKEND_EXPOSED_PORT` muutetaan, myös `VITE_API_URL` pitää muuttaa. |

## 5. Azure ja CI/CD

**Tiedosto:** [.github/workflows/azure-cinema.yml](../.github/workflows/azure-cinema.yml)

| Vaihe | Tila | Toteutus |
| --- | --- | --- |
| Laukaisu | ✅ | push `main`iin (ei pelkät `docs/`, `.obsidian/`, `*.md`) tai käsin |
| Riippuvuudet | ✅ | `npm ci` (juuri) + `npm --prefix api ci --omit=dev` |
| Laatu | ✅ | `npm run lint` |
| Build | ✅ | `npm run build` → `dist/` |
| Paketointi | ✅ | `release/` = `package.json`, `package-lock.json`, `dist/`, `api/` (+ `api/node_modules`, ilman `.env`) → zip; tarkistaa `express` ja `pg` |
| Kirjautuminen Azureen | ✅ | OIDC (`azure/login@v2`, `id-token: write`), ei salasanaa GitHubissa |
| Julkaisu | ✅ | `azure/webapps-deploy@v3` |
| Ajot | ✅ | `71a90b4` ja `e756780`: *success* **[GitHub]** |
| Sovellus käynnissä Azuressa (`/api/health` = 200) | ❓ | ei tarkistettu tässä katselmoinnissa: onnistunut julkaisu ei todista tietokantayhteyttä |
| Migraatiot Azureen | — | tarkoituksella käsin (`npm run db:migrate -- --confirm=cinema_db`), ei CI:ssä |

| Prioriteetti | Havainto |
| --- | --- |
| Ennen esitystä | Tarkista julkaistusta osoitteesta `/api/health`, `/api/movies` ja suora `/movies/<id>`-linkki. |
| Ennen esitystä | Varmista App Settingsistä, että Azure ei rakenna pakettia uudelleen (`SCM_DO_BUILD_DURING_DEPLOYMENT` ei `true`), koska paketti on jo valmiiksi rakennettu. Workflow ei aseta tätä. |
| Lähivaihe | Ota App Servicen Health check käyttöön polulle `/api/health`. |
| Myöhemmin | Workflow ei aja tietokantatestejä (`db:check`); voisi lisätä PostgreSQL-palvelukontilla. |

## 6. Vaatimukset ja kahden ensimmäisen viikon tavoitteet

### Vaatimukset / issuet

| Vaatimus / issue | Toteutus | Todiste koodissa | Tarkistus | Jäljellä |
| --- | --- | --- | --- | --- |
| FR-01 / #1 Haku | 🟡 Haku **omasta** tietokannasta nimellä | `Movie.js` `getMovies` (`ILIKE`), `Filters` | API [manuaalinen]; UI ei | TMDB-haku palvelimella |
| FR-02 / #2 Ajankohtaiset (uusin, suosituin kk) | 🟡 "Uusin" = julkaisupäivä; "suosituin kk" puuttuu | `SORTS.newest`, `SORTS.rating` | API [manuaalinen] | TMDB discover/trending |
| FR-03 / #3 Tiedot ja kuvat | 🟡 Tiedot omasta tietokannasta; 🧱 kuvat | `getMovieById`, `Poster` | API [manuaalinen] | TMDB-synkronointi (`poster_path`, keskiarvo) |
| FR-04 / #4 Tili, poisto, nimimerkki | 🧱 | taulu `users`, trigger `users_anonymize_reviews` | `db:check` [auto] | rekisteröinti, kirjautuminen, API |
| FR-05 / #5 Toivelistat | 🧱 | `watchlists`, `watchlist_movies` | `db:check` [auto] | API + UI |
| FR-06 / #6 Arviointi ja kommentti | 🟡 luku; ❌ kirjoitus | `getMovieReviews`, `Reviews` | API [manuaalinen] | POST/PUT/DELETE + kirjautuminen |
| FR-07 / #7 Ryhmät | 🧱 (+ triggerivirheet) | `groups`, `group_members`, triggerit | `db:check` [auto], rinnakkaisuus [manuaalinen] | korjaus, API + UI |
| FR-08 / #8 Mobiili | 🟡 | `@media`-säännöt | ei | mittaus 360–430 px |
| FR-09 / #9 Genre | 🟡 | `genre`-parametri, `/api/genres` | API [manuaalinen] | genret TMDB:stä |
| FR-10–FR-13 / #10–#13 | ❌ | – | – | myöhemmin |
| FR-14 / #14 Teatterit | ❌ | – | – | Could |
| NFR-03 salasanatiiviste | 🧱 | `password_hash`, ei selväkielistä saraketta | koodiluku | tiivistys kirjautumisessa |
| NFR-05 HTTPS | 🟡 | App Service tarjoaa HTTPS:n | ei | tarkista julkaistu osoite |

### Kurssin viikot 1–2

| Tavoite | Tila |
| --- | --- |
| Vaatimukset | 🟡 [Vaatimusmäärittely](Vaatimusmaarittely_elokuvasivu.md) v0.3 päivitetty toteutuksen mukaiseksi (projektiryhmä, FR-06-tarkennus, hyväksymiskriteerit, viikkosuunnitelma, Q-06–Q-09). Tila "Luonnos": asiakkaan hyväksyntää ei ole kirjattu. |
| Arkkitehtuuri ja ERD | ✅ tämä muutos ([architecture.md](architecture.md), [erd.md](erd.md)); tiimin hyväksyntä puuttuu |
| Backend + frontend + tietokanta | ✅ paikallisesti; 🟡 Azuressa (julkaisu onnistuu, toimintaa ei tarkistettu tässä) |
| 2–3 päästä päähän -toimintoa | 🟡 (1) selaus/haku/suodatus, (2) elokuvasivu + arvostelut — **vain luku**. Kirjoittavaa toimintoa ei ole. |
| Rekisteröinti ja kirjautuminen | ❌ ei aloitettu |

## 7. Yhteenveto prioriteeteittain

**Ennen esitystä:** julkaistun osoitteen tarkistus (`/api/health`, elokuvat, suora linkki, puhelin); `cinema_db`:n migraatioiden ja seedin tila; `SCM_DO_BUILD_DURING_DEPLOYMENT`; esittelijä kertoo rehellisesti, että haku koskee omaa tietokantaa ja arvostelut ovat vain luettavia.

**Lähivaihe:** rekisteröinti + kirjautuminen; arvostelun kirjoitus; TMDB-integraatio palvelimelle; ryhmätriggerin korjaus migraatiolla 003; automaattiset API-testit; Docker Compose -kokonaistesti; CORS-rajaus.

**Myöhemmin:** toivelistat ja ryhmät API:in, `App.jsx`:n jako, `pg_trgm`, `db:check` CI:hin, Health check, Key Vault -viittaukset salaisuuksille.
