# Arkkitehtuuri

**Analysoitu commit:** `e75678029267515888ea39b5e557dcfcac5db933`. Kaaviot kuvaavat koodin ja workflow-tiedoston mukaista toteutusta. Azure-asetuksia (App Settings, palomuuri, Health check) ei ole tarkistettu tästä repositoriosta.

## 1. Tuotanto (Azure)

```mermaid
flowchart LR
    subgraph Client["Käyttäjän laite"]
        B["Selain<br/>React-sovellus suoritetaan täällä"]
    end

    subgraph AS["Azure App Service (Linux, Node.js)"]
        direction TB
        E["Express<br/>api/index.js<br/>kuuntelee PORT"]
        S["express.static<br/>dist/ (React build)"]
        R["/api/* reitit<br/>routes → controllers → models"]
        P["pg Pool<br/>api/models/db.js"]
        E --> S
        E --> R --> P
    end

    DB[("Azure Database for PostgreSQL<br/>Flexible Server<br/>tietokanta cinema_db")]
    TMDBIMG["TMDB-kuvapalvelu<br/>image.tmdb.org"]

    B -->|"HTTPS GET /, /movies/:id<br/>HTML, JS, CSS"| E
    B -->|"HTTPS GET /api/... (sama domain)<br/>JSON"| E
    P -->|"TCP 5432 + TLS<br/>SQL"| DB
    B -.->|"HTTPS-kuvat vain jos poster_path on asetettu<br/>(demodatassa ei ole)"| TMDBIMG
```

**Missä mikäkin suoritetaan:**
- React-koodi käännetään GitHub Actionsissa (`npm run build`) staattisiksi tiedostoiksi `dist/`-kansioon. Selain lataa ne Expressiltä ja **suorittaa Reactin käyttäjän laitteessa**.
- Express ([api/index.js](../api/index.js)) palvelee samassa prosessissa sekä API:a (`/api/...`) että `dist/`-tiedostoja (`express.static`). Jos polku ei ole `/api/...` ja selain pyytää HTML:ää, Express palauttaa `dist/index.html` (esim. `/movies/7` suoralla linkillä), ja React päättää näytettävän sivun.
- Express ottaa yhteyden tietokantaan `pg.Pool`-olion kautta. Selain ei koskaan ota yhteyttä tietokantaan.

**TMDB:** palvelimella ei ole TMDB-integraatiota (ei API-avainta eikä kutsuja `api.themoviedb.org`:iin). Frontend muodostaa vain kuvan osoitteen `https://image.tmdb.org/t/p/w500` + `poster_path` ja linkin TMDB:n sivulle. Seuraava vaihe on TMDB-haku palvelimella (avain App Settingsiin, ei `VITE_*`-muuttujaan).

### Sama domain ja `VITE_API_URL`
[src/App.jsx](../src/App.jsx): `baseURL` on tuotannossa `""`, joten pyynnöt menevät samaan osoitteeseen (`/api/movies`). Silloin CORSia ei tarvita, eikä Azure-osoitetta kirjoiteta koodiin. Kehityksessä (`npm run dev`, Docker) `baseURL` on `VITE_API_URL`, oletuksena `http://localhost:3000`. `VITE_*`-arvot leivotaan JavaScript-pakettiin buildin aikana, joten niihin **ei saa laittaa salaisuuksia**.

### `PORT`
App Service ohjaa liikenteen sovellukselle ja kertoo portin ympäristömuuttujassa `PORT`. Express kuuntelee `Number(process.env.PORT || 3000)` osoitteessa `0.0.0.0`. HTTPS päättyy App Servicen etupäähän; sovellus itse kuuntelee HTTP:tä sisäverkossa.

### `/api/health`
Ajaa `SELECT 1`: 200 `healthy/connected` tai 503 `unhealthy/disconnected`. Docker Compose käyttää sitä backendin healthcheckinä. Azuressa sitä voi käyttää App Servicen Health checkinä; käyttöönottoa ei ole tarkistettu.

### Tietokantayhteys: TLS ja verkko
- `DB_SSL=true` → `ssl: { rejectUnauthorized: true }`: yhteys salataan ja palvelimen varmenne tarkistetaan.
- Verkkoyhteys edellyttää, että PostgreSQL-palvelimen palomuuri sallii App Servicen (esim. "Allow public access from Azure services" tai Web Appin lähtevät IP-osoitteet). Asetusta ei näy koodissa.
- Web App (Sweden Central) ja tietokanta (North Europe) ovat eri alueilla, mikä lisää viivettä.

## 2. Asetukset ja salaisuudet

| Missä | Mitä | Huom. |
| --- | --- | --- |
| Azure App Service → Environment variables (App Settings) | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `NODE_ENV` | Näkyvät sovellukselle ympäristömuuttujina. Arvoja ei ole repositoriossa. |
| GitHub → Secrets | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | Tunnisteita OIDC-kirjautumiseen, eivät salasanoja. |
| Paikallinen `.env` (gitignore) | kehityksen ja Dockerin arvot | Malli: [.env.example](../.env.example) |
| Koodi | ei salaisuuksia | `.env` jätetään pois myös julkaisupaketista (`rsync --exclude`) |

## 3. Kaksi eri tunnistautumista

| | Julkaisu (GitHub → Azure) | Sovellus → PostgreSQL |
| --- | --- | --- |
| Kuka | GitHub Actions -ajo | Express-prosessi App Servicessä |
| Miten | **OIDC**: workflow (`id-token: write`) saa GitHubilta lyhytikäisen tokenin, ja `azure/login` vaihtaa sen Entra ID:ssä Azure-tunnukseen. Luottamus perustuu federoituun tunnistetietoon (app registration tai user-assigned **managed identity**). Pysyvää salasanaa ei tallenneta GitHubiin. | PostgreSQL-käyttäjätunnus ja salasana App Settingsistä (`DB_USER`, `DB_PASSWORD`) TLS-yhteyden yli. |
| Oikeudet | julkaista Web Appiin | lukea ja kirjoittaa `cinema_db`:hen |

Managed identityä ei nyt käytetä tietokantayhteyteen. Microsoft Entra -kirjautuminen PostgreSQL:ään olisi mahdollinen myöhempi parannus, jolloin `DB_PASSWORD` ei olisi tarpeen. Kumpi federoitu identiteetti on käytössä, ei näy repositoriosta.

## 4. GitHub Actions → Azure

```mermaid
flowchart LR
    A["push main<br/>tai käsin"] --> B["npm ci<br/>(juuri)"]
    B --> C["npm --prefix api ci<br/>--omit=dev"]
    C --> D["npm run lint"]
    D --> E["npm run build<br/>→ dist/"]
    E --> F["release/<br/>package.json + dist/<br/>+ api/ + api/node_modules"]
    F --> G["cinema-app.zip"]
    G --> H["azure/login<br/>OIDC"]
    H --> I["azure/webapps-deploy<br/>App Service"]
    I --> J["npm start<br/>node api/index.js"]
```

- Laukaisu: push `main`iin, paitsi jos muuttuu vain `docs/**`, `.obsidian/**` tai `*.md` (Obsidianin "vault backup" -commitit eivät julkaise), tai käsin (`workflow_dispatch`).
- **Miksi `dist/` ja `api/node_modules` ovat paketissa:** `npm start` ajaa `node api/index.js`. Expressin, `pg`:n, `cors`:n ja `dotenv`:n riippuvuudet on määritelty vain [api/package.json](../api/package.json):ssa, eivät juuren `package.json`:ssa. Jos Azure asentaisi riippuvuudet itse juuresta, palvelin ei käynnistyisi (`Cannot find module 'express'`). `dist/` on käännetty frontend; Azuressa ei ajeta Vitea.
- Workflow tarkistaa ennen pakkaamista, että `dist/index.html`, `api/index.js`, `express` ja `pg` ovat mukana.
- **Migraatioita ei ajeta workflowssa.** Ne ajetaan käsin ja tarkoituksella ([tietokanta.md, luku 5](tietokanta.md)): `npm run db:migrate -- --confirm=cinema_db`. Syy: skeemamuutos tehdään vain tarkistettuna, eikä julkaisu saa muuttaa tietokantaa vahingossa.

## 5. Paikallinen kehitys (Docker Compose)

```mermaid
flowchart LR
    subgraph Host["Kehittäjän kone"]
        BR["Selain"]
    end
    subgraph Compose["Docker Compose -verkko"]
        FE["frontend<br/>Vite dev server :5173"]
        BE["backend<br/>Express + nodemon :PORT"]
        PG[("database<br/>postgres:18.6 :5432<br/>volyymi postgres_data")]
    end
    BR -->|"localhost:FRONTEND_EXPOSED_PORT<br/>sivu + JS"| FE
    BR -->|"VITE_API_URL eli localhost:BACKEND_EXPOSED_PORT<br/>/api/... (CORS)"| BE
    BE -->|"database:5432"| PG
    BR -.->|"työkalut, esim. DBeaver<br/>localhost:DB_EXPOSED_PORT"| PG
```

- **Kontin sisäinen portti ja julkaistu portti** ovat eri asia: `"${BACKEND_EXPOSED_PORT}:${PORT}"` tarkoittaa *isännän portti : kontin portti*. Kontit puhuvat keskenään palvelun nimellä ja sisäisellä portilla (`database:5432`). Selain ja DBeaver käyttävät isännän portteja.
- Selain hakee sivun Vitesta (5173) ja kutsuu API:a eri porttiin (3000), joten kyse on eri alkuperästä; siksi backendissä on `cors()`.
- `init.sql` ajetaan vain, kun volyymi luodaan ensimmäistä kertaa. Sovellustaulut tulevat migraatioista: `docker compose exec backend npm run db:migrate`.
- Lähdekoodi on liitetty kontteihin (bind mount), ja muutokset näkyvät heti (nodemon, Vite HMR).

## 6. Elokuvasivun avaaminen

```mermaid
sequenceDiagram
    autonumber
    actor U as Käyttäjä
    participant B as Selain (React)
    participant E as Express
    participant C as MovieController
    participant M as Movie-malli
    participant P as pg Pool
    participant D as PostgreSQL

    U->>B: napsauttaa elokuvakorttia
    B->>B: history.pushState("/movies/7")
    B->>E: GET /api/movies/7
    E->>C: movieRouter → getMovie
    C->>C: parsePositiveInt(id), virheellinen → 400
    C->>M: getMovieById(7)
    M->>P: pool.query(SQL, [7])
    P->>D: SELECT … FROM movies WHERE id = $1
    D-->>P: rivi (tai ei rivejä)
    P-->>M: result.rows
    M-->>C: elokuva tai null
    alt löytyi
        C-->>B: 200 JSON
    else ei löytynyt
        C-->>B: 404 JSON (error)
    end
    B->>E: GET /api/movies/7/reviews?limit=13&offset=0
    E-->>B: 200 JSON (items, limit, offset)
    B->>U: näyttää tiedot ja arvostelut
```

Jos SQL-kysely epäonnistuu, controller kutsuu `next(error)`, ja [errorHandler](../api/middleware/errorHandler.js) muuttaa virheen HTTP-vastaukseksi (400/409/500). Luettelosivu toimii samoin: `GET /api/genres` ja `GET /api/movies?...` (haku, genre, järjestys ja sivutus URL-parametreina).

## 7. Mitä kaavioissa ei ole

- **TMDB API** (haku, suositut, julisteet): ei toteutettu.
- **Kirjautuminen** (JWT, salasanojen tiivistys): ei toteutettu.
- **Kirjoittavat operaatiot** (arvostelut, listat, ryhmät): tietokannassa on taulut, mutta API:ssa ei ole reittejä.
