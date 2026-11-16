# Kirjautuminen: muutokset Lucaksen frontendiin ja backend

**Haara:** `feature/auth` (pohjana `7090eb3` "Login, register and user page frontend")
**Tavoite:** kirjautuminen toimii esittelyssä päästä päähän; frontendiin vain pienet muutokset.

## Miksi julkaisu epäonnistui

GitHub Actions -ajo commitissa `7090eb3` pysähtyi **Lint**-vaiheeseen; build ja julkaisu jäivät väliin, joten Azuressa oli edelleen edellinen versio. Syy:

```
src/auth/AuthContext.jsx 52:14  error  react-refresh/only-export-components
```

Tiedosto vei ulos sekä komponentin (`AuthProvider`) että hookin (`useAuth`). Vite Fast Refresh ja lint-sääntö vaativat, että komponenttitiedosto vie ulos vain komponentteja.

## Muutokset frontendiin (`src/auth/`)

| Tiedosto | Muutos | Miksi |
| --- | --- | --- |
| `useAuth.js` (uusi) | `AuthContext` ja `useAuth` siirretty tänne | Lint-virhe → julkaisu toimii taas |
| `AuthContext.jsx` | Tuo kontekstin tiedostosta `useAuth.js`; vie ulos vain `AuthProvider` | Sama syy |
| `AuthContext.jsx` → `request()` | Lukee backendin virhemuodon `{ error: { message, fields } }`; 5xx-virheissä näytetään oma suomenkielinen teksti | Ennen 409 näytti aina "sähköposti on jo käytössä", vaikka varattu olisi ollut nimimerkki |
| `AuthContext.jsx` → `register()` | Käyttää rekisteröinnin palauttamaa tokenia; erillistä kirjautumispyyntöä ei tarvita | Yksi pyyntö kahden sijaan |
| `AuthContext.jsx` → `MESSAGES` | 404-teksti ("Onko backendin kirjautumisreitti jo valmis?") poistettu, 409 yleisemmäksi, 503 lisätty | Backend on nyt olemassa |
| `AuthPages.jsx` | `useAuth` tuodaan tiedostosta `./useAuth`; `navigate` lisätty `useEffect`-riippuvuuksiin | Lint-varoitukset |

Ulkoasuun, sivujen rakenteeseen, validointisääntöihin ja tekstikenttiin **ei tehty muutoksia**. Jos muokkaat `src/auth/`-tiedostoja, tuo `useAuth` jatkossa näin:

```js
import { useAuth } from "./useAuth";
```

## Backend (uusi)

| Tiedosto | Sisältö |
| --- | --- |
| `api/routes/authRouter.js` | `POST /register`, `POST /login`, `GET /me` polun `/api/auth` alla |
| `api/controllers/AuthController.js` | Validointi (samat säännöt kuin frontendissä), bcrypt-tiivistys, JWT |
| `api/models/User.js` | SQL-kyselyt `users`-tauluun; `password_hash` ei koskaan palaudu asiakkaalle |
| `api/middleware/requireAuth.js` | Tarkistaa `Authorization: Bearer <token>` |
| `api/config/auth.js` | `JWT_SECRET`, tokenin voimassaolo (24 h), bcrypt cost (10) |
| `api/middleware/errorHandler.js` | Lisätty `fields`; varattu sähköposti/nimimerkki → oikean kentän viesti |
| `api/app.js` | Express-sovellus erotettu tiedostosta `index.js` (testejä varten); reitit ennallaan |
| `api/tests/auth.test.js` | 8 integraatiotestiä (`npm test` kansiossa `api`) |

Uudet riippuvuudet (`api/package.json`): `bcryptjs` (puhdas JavaScript, ei natiivia käännöstä) ja `jsonwebtoken`. Tietokantaan ei tarvittu muutoksia: `users.password_hash` oli jo olemassa.

## Sopimus frontendin ja backendin välillä

| Pyyntö | Vastaus |
| --- | --- |
| `POST /api/auth/register { email, nickname, password }` | `201 { token, user }` |
| `POST /api/auth/login { email, password }` | `200 { token, user }` tai `401` |
| `GET /api/auth/me` + `Authorization: Bearer <token>` | `200 { user }` tai `401` |
| Virhe | `{ error: { message, status, fields? } }` |

`user` = `{ id, email, nickname, created_at }`. Säännöt: nimimerkki 3–20 merkkiä (tiimin päätös), salasana vähintään 8 merkkiä ja enintään 72 tavua. Sähköposti tallennetaan pienillä kirjaimilla. Token säilyy selaimessa (`localStorage`) 24 tuntia tai uloskirjautumiseen asti. Tarkemmin: [api.md](api.md).

## Paikallinen kehitys

- `.env`:ssä pitää olla `JWT_SECRET`, jossa on vähintään 32 merkkiä (`.env.example`:n arvo kelpaa paikallisesti).
- Docker: uudet riippuvuudet asennetaan vasta, kun backend-kontti rakennetaan uudelleen: `docker compose build backend` ja sitten `docker compose up`.
- Demodatan käyttäjät (Anna, Mikko, Laura) **eivät voi kirjautua**; luo testitili rekisteröitymällä.

## Tunnetut rajaukset

- Uloskirjautuminen tapahtuu vain selaimessa; palvelin ei mitätöi tokenia ennen sen vanhenemista (tiimin päätös).
- Token `localStorage`:ssa on alttiimpi XSS-hyökkäyksille kuin httpOnly-eväste; hyväksytty opintoprojektissa.
- Kirjautumisyrityksiä ei vielä rajoiteta (rate limit); kannattaa lisätä ennen oikeaa käyttöä.
- Tilin poisto ja nimimerkin muokkaus (loput FR-04:stä) eivät sisälly tähän muutokseen.
