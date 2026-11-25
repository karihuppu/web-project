# Toteutuksen katselmointi

**Päivitetty:** 23.11.2026, haara `feature/account` (pohjana `origin/main` `07f0bad`).
Edellinen versio kuvasi tilannetta commitissa `e756780` (9.11.); tämä korvaa sen.
**Tila:** tiimin sisäinen analyysi. Asiakas tai opettaja ei ole hyväksynyt vaatimuksia.

Liittyvät dokumentit: [erd.md](erd.md) · [architecture.md](architecture.md) · [api.md](api.md) · [tietokanta.md](tietokanta.md) · [Vaatimusmäärittely](Vaatimusmaarittely_elokuvasivu.md) · [tili-muutokset.md](tili-muutokset.md) · [ryhmat-kehittajalle.md](ryhmat-kehittajalle.md)

## Tilaluokat

| Merkintä | Merkitys |
| --- | --- |
| ✅ | Toteutettu ja tarkistettu (tapa kerrotaan) |
| 🟡 | Toteutettu, ei tarkistettu (esim. Azuressa) |
| 🧱 | Vain rakenne (taulut/säännöt), ei käyttäjätoimintoa |
| ❌ | Ei toteutettu |

Tarkistustavat: **[auto]** toistettava komento (`npm run lint`, `npm run build`, `npm --prefix api test`, `npm --prefix api run db:check`, erillinen testikanta); **[selain]** paikallinen headless Edge -ajo tuotantobuildia vasten (skripti ei ole repositoriossa); **[Azure]** käyttäjän tarkistus julkaistussa sovelluksessa.

## 1. Frontend

| Toiminto | Tila | Tiedostot |
| --- | --- | --- |
| Elokuvaluettelo, haku omasta kannasta, genre, järjestys, sivutus | ✅ [selain] | `src/App.jsx` |
| Elokuvasivu, arvostelujen luku | ✅ [selain] | `src/App.jsx` |
| Rekisteröinti, kirjautuminen, uloskirjautuminen | ✅ [selain] [Azure 16.11.] | `src/auth/AuthPages.jsx`, `AuthContext.jsx` |
| Oma arvostelu: luonti, muokkaus, poisto | ✅ [selain] [Azure 16.11.] | `src/reviews/` |
| Nimimerkin muutos tilisivulla | ✅ [selain] | `src/auth/AccountSettings.jsx` |
| Tilin poisto salasanalla, vahvistus, peruutus (myös Esc) | ✅ [selain] | `src/auth/AccountSettings.jsx` |
| Paluu kirjautumisen jälkeen (`?next=`, vain sisäiset polut) | ✅ [selain] | `src/auth/useAuth.js` |
| Luonnokset vanhentuneen tokenin jälkeen, käyttäjäkohtaisesti | ✅ [selain] | `src/reviews/`, `src/auth/useAuth.js` |
| Mobiili 390 px: ei vaakavieritystä (`/`, elokuva, tili, kirjautuminen, rekisteröinti) | ✅ [selain] | CSS |
| Julisteet | 🧱 näytetään, jos `poster_path` on; demodatassa ei ole | `src/App.jsx` |
| Ryhmät: Omat ryhmät, luonti, julkiset ryhmät + haku, ryhmän sivu, liittyminen, rooli, eroaminen, ylläpitäjä lisää/poistaa jäsenen | ✅ [selain] (25.11., haara `feature/groups`) | `src/groups/` |
| Toivelistat | ❌ | – |

Huomiot: ei frontend-yksikkötestejä; selainkulku tarkistettiin skriptillä, mutta sitä ei ole vielä lisätty repositorioon.

## 2. API

| Reitit | Tila |
| --- | --- |
| `GET /api/health`, `/api/movies…`, `/api/genres` | ✅ [auto] |
| `POST /api/auth/register`, `/login`, `GET /me` | ✅ [auto] |
| `PATCH /api/auth/me` (nimimerkki), `DELETE /api/auth/me` (tilin poisto) | ✅ [auto] |
| Oma arvostelu: `POST /reviews`, `GET/PUT/DELETE /review` | ✅ [auto] |
| Ryhmät `/api/groups…` (8 reittiä, ks. api.md) | ✅ [auto] (haara `feature/groups`) |
| Toivelistat | ❌ |

- `requireAuth` tarkistaa JWT:n **ja** että tili on yhä olemassa; tietokantavirhe ei näy 401:nä.
- Kirjoitukset nojaavat tietokannan viiteavaimiin ja lukkoihin, koska tili voi poistua middleware-tarkistuksen jälkeen.
- Virheet: 400/401/403/404/409/500/503, kentät `fields`. Deadlock ja lukon aikakatkaisu → 503.

## 3. Tietokanta

| Osa | Tila |
| --- | --- |
| Migraatiot 001–002 (9 taulua) | ✅ [auto]; Azuressa ajettu (sovellus toimii) |
| Migraatio 003: ryhmätriggerien korjaus | ✅ [auto] (kaksi yhteyttä); **ei vielä Azuressa** |
| `db:check` 38 tarkistusta | ✅ [auto] |
| Diagnostiikka ennen 003:a (pysähtyy rikkovaan dataan) | ✅ [auto] |

Migraatio 002:n rinnakkaisuusvirhe (ryhmä ilman adminia / tyhjä ryhmä) on korjattu migraatiossa 003; ks. [erd.md](erd.md#rinnakkaisuus).
Takuu: READ COMMITTED. Muilla eristystasoilla trigger kieltäytyy (`40001`).

## 4. Testit

| Tiedosto | Testejä | Sisältö |
| --- | --- | --- |
| `api/tests/auth.test.js` | 8 | rekisteröinti, kirjautuminen, `/me`, tokenit |
| `api/tests/reviews.test.js` | 11 | oma arvostelu, oikeudet, sivutus, poistettu tili |
| `api/tests/account.test.js` | 12 | nimimerkki, tilin poisto, seuraukset, vanha token, DB-vika ≠ 401 |
| `api/tests/concurrency.test.js` | 11 | ryhmät kahdella yhteydellä, tilin poisto vs. arvostelu |

| `api/tests/groups.test.js` | 13 | ryhmät API:n kautta: luonti, liittyminen, oikeudet, yksityinen ryhmä, eroaminen, rinnakkaiset eroamiset ja tilin poisto |

Yhteensä 55/55 [auto], erillisessä `postgres:18.6`-kannassa. Testit eivät aja GitHub Actionsissa (vaativat PostgreSQL:n).

## 5. Azure ja CI/CD

- Workflow `azure-cinema.yml`: lint → build → zip (`dist/`, `api/`, `api/node_modules`) → OIDC → julkaisu. Viimeisimmät ajot onnistuivat (`3c14f0c`, `07f0bad`).
- Käyttäjä tarkisti 16.11. julkaistussa sovelluksessa rekisteröinnin, kirjautumisen ja arvostelut.
- Tämän haaran muutokset (tilin hallinta, migraatio 003) **eivät ole vielä Azuressa**.

## 6. Vaatimukset

| Vaatimus | Tila |
| --- | --- |
| FR-01 haku | 🟡 omasta kannasta; TMDB-haku ❌ |
| FR-02 ajankohtaiset | 🟡 uusimmat; suosituimmat ❌ |
| FR-03 tiedot ja kuvat | 🟡 tiedot ✅, kuvat odottavat TMDB:tä |
| FR-04 tili | ✅ paikallisesti (rekisteröinti, kirjautuminen, nimimerkki, poisto); Azure-tarkistus kesken |
| FR-05 toivelistat | 🧱 |
| FR-06 arviointi | ✅ kirjautuneille; anonyymi arviointi odottaa päätöstä (Q-06) |
| FR-07 ryhmät | ✅ paikallisesti: luonti, roolit, jäsenten lisäys/poisto, eroaminen; roolien vaihto käsin ❌ |
| FR-13 ryhmien haku ja liittyminen | 🟡 julkiset ryhmät: haku + liittyminen ✅; liittymispyyntö yksityiseen ❌ |
| FR-08 mobiili | ✅ 390 px [selain]; oikeilla laitteilla ei testattu |
| FR-09 genre | ✅ omalla datalla |
| FR-10–FR-14 | ❌ |

## 7. Avoimet riskit

- Kirjautumisyrityksiä ei rajoiteta (rate limit); `cors()` sallii kaikki alkuperät.
- JWT `localStorage`:ssa, palvelin ei mitätöi tokenia ennen vanhenemista (tiimin päätös) – poistetun tilin token kuitenkin hylätään.
- Free F1: hidas ensimmäinen pyyntö, CPU-raja. Web App ja kanta eri alueilla.
- API-testit eivät ole CI:ssä.
