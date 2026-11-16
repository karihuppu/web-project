# Arvostelujen kirjoittaminen: muutokset ja esittelyn tarkistuslista

**Haara:** `feature/reviews` (pohjana `origin/main` `3c14f0c`)
**Tila:** valmis julkaisuun, ei vielä tarkistettu Azuressa.
**Rajaus:** vain kirjautuneet käyttäjät arvioivat. Issue #6:n anonyymi arviointi ei kuulu tähän versioon (vaatimusmäärittely, FR-06 ja Q-06). Vastaukset kommentteihin, ryhmät, listat ja TMDB eivät kuulu tähän.

## Lucakselle: mitä frontendissä muuttui

Kirjautumista, navigaatiota ja ulkoasua **ei ole muutettu**.

| Tiedosto | Muutos |
| --- | --- |
| `src/reviews/MyReview.jsx` (uusi) | Lomake elokuvan sivulla: vieraalle kehotus kirjautua; kirjautuneelle tähdet 1–5 ja kommentti; omalle arviolle muokkaus ja poisto (vahvistus) |
| `src/reviews/reviewApi.js` (uusi) | API-kutsut, suomenkieliset virheet, luonnoksen tallennus `sessionStorage`en |
| `src/reviews/myReview.css` (uusi) | Tyylit, kaikki luokat alkavat `my-review`; napit ja viestit käyttävät olemassa olevia `.button`- ja `.message`-luokkia |
| `src/auth/useAuth.js` | Lisätty `TOKEN_KEY` ja `authHeaders()`, jotta tokenin nimi on vain yhdessä paikassa |
| `src/auth/AuthContext.jsx` | Tuo `TOKEN_KEY`:n tiedostosta `useAuth.js` (yksi rivi; toiminta sama) |
| `src/App.jsx` → `MoviePage` | Näyttää `<MyReview>`-lomakkeen; oman arvion muuttuessa päivittää arvostelujen määrän ja lataa julkisen listan uudelleen ilman koko sivun latausta |

Lomakkeen toiminta:
- Oma arvio haetaan reitiltä `GET /api/movies/:id/review`, ei julkisen listan sivulta, koska oma arvio voi olla millä tahansa sivulla.
- Tallennusnappi on pois käytöstä pyynnön ajan, joten samaa arviota ei voi lähettää kahdesti.
- Jos token on vanhentunut (401), kirjoitettu teksti tallennetaan tämän välilehden `sessionStorage`en, käyttäjä kirjataan ulos ja häntä pyydetään kirjautumaan. Kun hän palaa samaan elokuvaan, luonnos palautetaan lomakkeelle.
- Jos arvio on ehditty luoda tai poistaa toisessa välilehdessä (409/404), lomake vaihtaa tilaa eikä teksti katoa.
- Napin piilottaminen ei ole suojaus: backend tarkistaa tekijän tokenista jokaisessa pyynnössä.

**Ehdotus Lucakselle (ei tehty, koska se muuttaisi kirjautumissivua):** kirjautumisen jälkeen `LoginPage` siirtyy aina etusivulle. Jos se palaisi edelliselle sivulle (esim. `?next=/movies/5`), käyttäjä pääsisi suoraan takaisin arvioimaansa elokuvaan.

## Backend

| Tiedosto | Sisältö |
| --- | --- |
| `api/routes/movieRouter.js` | Neljä uutta reittiä `requireAuth`-middlewaren takana |
| `api/controllers/ReviewController.js` | Validointi (`rating` 1–5 kokonaislukuna, kommentti enint. 2000 merkkiä, trim, tyhjä → `null`), elokuvan olemassaolo, virheet |
| `api/models/Review.js` | Parametrisoidut SQL-kyselyt; UPDATE ja DELETE rajattu `movie_id`:llä **ja** `user_id`:llä |
| `api/middleware/errorHandler.js` | Kaksoisarvostelun 409-viesti suomeksi |
| `api/tests/reviews.test.js` | 11 integraatiotestiä |

Tietokantaan ei tarvittu muutoksia: rajoitteet `reviews_user_movie_uq`, `reviews_rating_chk` ja `reviews_comment_chk` olivat jo olemassa. Rajapinta: [api.md](api.md#oma-arvostelu-kirjautunut-käyttäjä).

## Esittelyn tarkistuslista

Käytä erillistä esittelytiliä (esim. nimimerkki `Esittely1611`). **Älä kirjoita salasanaa tai tokenia dokumentteihin, diaesitykseen tai lokeihin.**

1. [ ] Avaa julkaistu sovellus ja luo uusi tili kohdasta **Luo tili**.
2. [ ] Ylävalikossa näkyy nimimerkki; **/account**-sivulla näkyvät nimimerkki ja sähköposti.
3. [ ] Avaa elokuva, valitse tähdet, kirjoita kommentti ja paina **Tallenna arvio** → "Arviosi tallennettiin.", arvio näkyy listassa ja *Arvostelut sivustolla* kasvaa yhdellä.
4. [ ] Päivitä sivu (F5) → arvio on yhä listassa, ja lomake on muokkaustilassa.
5. [ ] Avaa sama elokuva toisessa selaimessa tai yksityisessä ikkunassa ilman kirjautumista → arvio näkyy, lomakkeen tilalla on kehotus kirjautua.
6. [ ] Palaa tekijän ikkunaan, muuta tähtiä tai kommenttia ja paina **Tallenna muutokset** → muutos näkyy listassa.
7. [ ] Paina **Poista arvio** → **Kyllä, poista** → "Arviosi poistettiin.", arvio katoaa listasta ja määrä pienenee.
8. [ ] Kirjaudu ulos → elokuvan sivulla on taas vain kehotus kirjautua.

Varasuunnitelma, jos julkaisu ei toimi: sama kulku paikallisesti (`docker compose up` tai `npm run dev` + backend).
