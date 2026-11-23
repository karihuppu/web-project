# Tilin hallinta: muutokset, tiimin tiedote ja hyväksyntä

**Haara:** `feature/account` (pohjana `origin/main` `07f0bad`)
**Tila:** valmis julkaisuun, testattu paikallisesti; **ei vielä tarkistettu Azuressa**.

## Tiimille lyhyesti

**Valmis**
- Käyttäjä voi muuttaa nimimerkkiään tilisivulla; uusi nimi näkyy heti ylävalikossa, profiilissa ja kaikissa arvosteluissa.
- Käyttäjä voi poistaa tilinsä nykyisellä salasanalla. Tähtiarviot jäävät nimettöminä, kommentit ja omat listat poistuvat.
- Poistetun tilin vanha token ei enää kelpaa mihinkään.
- Kirjautumisen jälkeen palataan pyydetylle sivulle (esim. elokuvaan), vain sivuston sisäisiin osoitteisiin.
- Ryhmätriggerin rinnakkaisuusvirhe on korjattu migraatiossa 003.

**Tarkistettu**
- 42 API- ja tietokantatestiä (myös kaksi yhtäaikaista yhteyttä), 38 tietokantatarkistusta, lint ja build.
- Koko käyttäjäpolku paikallisessa selaimessa (headless Edge) ja 390 px leveydellä: 38/38.

**Vielä tehtävä**
- Koodikatselmointi (Lucas: `src/auth/`, `src/reviews/`).
- Migraation 003 ajo Azureen (ohje: [tietokanta.md, luku 5.3](tietokanta.md)).
- Julkaisu ja hyväksyntätarkistus Azuressa erillisellä esittelytilillä (alla).

## Lucakselle: frontend-muutokset

Ulkoasua ja olemassa olevia sivuja ei ole suunniteltu uudelleen.

| Tiedosto | Muutos |
| --- | --- |
| `src/auth/AuthContext.jsx` | Uudet funktiot `updateNickname(nickname)` ja `deleteAccount(password)`. `logout()` poistaa tämän käyttäjän tallentamattomat arvosteluluonnokset (`logout({ keepDrafts: true })` säilyttää ne). Jos profiilin lataus epäonnistuu muusta syystä kuin 401:stä, tokenia ei poisteta: `sessionError` + `reloadUser()`. 403-viesti lisätty. |
| `src/auth/useAuth.js` | `safeNextPath()` (turvallinen `?next=`), `loginPathFor(path)`, `DRAFT_PREFIX`, `clearDrafts(userId)` |
| `src/auth/AccountSettings.jsx` (uusi) | `NicknameForm` ja `DeleteAccount` |
| `src/auth/account.css` (uusi) | Tyylit, luokat alkavat `account-`; kentät käyttävät `auth-field`/`auth-error` |
| `src/auth/AuthPages.jsx` | `AccountPage` näyttää uudet osiot; vieras ohjataan `/login?next=/account`; kirjautumisen jälkeen `safeNextPath`; `?next` säilyy kirjautumis- ja rekisteröintisivun välillä; latausvirheelle "Yritä uudelleen" |
| `src/reviews/MyReview.jsx`, `reviewApi.js` | Luonnokset ovat käyttäjäkohtaisia (`review-draft:<userId>:<movieId>`); kirjautumislinkki palaa elokuvaan |

**Miten AuthContext toimii nyt**
- `user` ladataan sivun avautuessa (`GET /api/auth/me`). 401 → token poistetaan. Muu virhe → token säilyy ja tilisivu näyttää "Yritä uudelleen".
- `updateNickname` → `PATCH /api/auth/me`; onnistuessa `user` päivittyy, joten ylävalikko ja profiili päivittyvät heti.
- `deleteAccount` → `DELETE /api/auth/me`; 403 = väärä salasana (käyttäjä pysyy kirjautuneena); onnistuessa token, `user` ja luonnokset poistetaan.
- Jos tilin reitti vastaa 401, AuthContext kirjaa käyttäjän ulos.

## Hyväksyntätarkistus Azuressa (julkaisun jälkeen)

Käytä uutta esittelytiliä. **Älä kirjoita salasanaa tai tokenia minnekään.**

1. [ ] Luo tili → ylävalikossa ja `/account`-sivulla näkyy nimimerkki.
2. [ ] Avaa elokuva ja jätä arvio kommentin kanssa.
3. [ ] Tilisivulla vaihda nimimerkki → "Nimimerkki tallennettiin.", ylävalikko päivittyy.
4. [ ] Elokuvan sivulla arviossa näkyy uusi nimimerkki.
5. [ ] Päivitä sivu (F5), kirjaudu ulos ja takaisin → uusi nimimerkki säilyy.
6. [ ] Poista tili väärällä salasanalla → "Salasana on väärä.", olet yhä kirjautunut, tiedot ennallaan.
7. [ ] Poista tili oikealla salasanalla → siirryt etusivulle kirjautumattomana.
8. [ ] Yritä kirjautua samalla tilillä → "Väärä sähköposti tai salasana."
9. [ ] (Valinnainen, kehittäjä) vanha token: ennen poistoa kopioi selaimen kehitystyökaluista `localStorage.token` ja kokeile poiston jälkeen `GET /api/auth/me` → 401. Älä tallenna tokenia.
10. [ ] Toisessa selaimessa tai yksityisessä ikkunassa: arvio näkyy, tekijä "Poistettu käyttäjä", kommentti "Ei kommenttia".

Ryhmäskenaariot tarkistetaan erillisessä testikannassa (`npm --prefix api test`), kunnes ryhmien käyttöliittymä on olemassa.

## Ehdotuksia backlogiin

Vastuuhenkilöt ovat **ehdotuksia**, eivät sovittuja.

| Tehtävä | Valmis, kun | Riippuvuudet | Ehdotettu vastuu |
| --- | --- | --- | --- |
| Ryhmien API (luonti, liittyminen, eroaminen, jäsenen poisto, ylläpitäjän nimeäminen) | Reitit noudattavat [ryhmat-kehittajalle.md](ryhmat-kehittajalle.md):n lukitusjärjestystä; testit kahdella yhteydellä; dokumentoitu `api.md`:ssä | Migraatio 003 Azuressa | Ryhmien kehittäjä |
| Ryhmien käyttöliittymä | Ryhmän luonti, jäsenlista, eroaminen; virheet suomeksi; mobiili 390 px | Ryhmien API | Lucas |
| Toivelistat (FR-05) | API + UI: lista, lisää/poista elokuva; vain omistaja muokkaa; testit | – | Aleksandr |
| TMDB-integraatio palvelimella (FR-01–FR-03) | Haku, suositut, julisteet; avain App Settingsissä; ei avainta frontendissä | TMDB API -avain | Aleksandr |
| Kirjautumisyritysten rajoitus | Liian monta väärää yritystä → 429; testi | – | Aleksandr |
| API-testit GitHub Actionsiin | PostgreSQL-palvelukontti workflowssa; `npm test` ajetaan ennen julkaisua | – | Aleksandr |
| Selainkulun automaattitesti repositorioon | Rekisteröinti→arvio→nimimerkki→poisto ajettavissa yhdellä komennolla | – | Lucas / Aleksandr |
| Anonyymi arviointi (Q-06) | Asiakkaan päätös kirjattu; jos kyllä: migraatio + API + UI | Asiakkaan päätös | Tiimi |
