# Viikon 2 esittely: elokuvien selaaminen

Tämä muutos yhdistää React-käyttöliittymän olemassa olevaan Express-rajapintaan ja PostgreSQL-tietokantaan. Se ei muuta tietokannan rakennetta eikä lisää riippuvuuksia.

## Toimivat käyttäjäpolut

1. Etusivu näyttää tietokantaan tallennetut elokuvat.
2. Käyttäjä hakee elokuvan nimellä, rajaa tuloksia genren perusteella ja vaihtaa järjestystä.
3. Käyttäjä avaa elokuvan tiedot ja lukee tietokannasta haetut arvostelut. Genret toimivat linkkeinä takaisin suodatettuun valikoimaan.

Haku koskee tällä hetkellä **projektin omaan tietokantaan tallennettuja elokuvia**, ei koko TMDB-palvelua. `newest` tarkoittaa julkaisupäivän mukaista järjestystä. TMDB-arvion mukainen järjestys ei ole kuukauden suosituimpien lista.

## API ja osoitteet

| Käyttö | Rajapinta / sivu |
| --- | --- |
| Elokuvat ja haku | `GET /api/movies?q=Matrix&genre=<id>&sort=title&limit=13&offset=0` |
| Genret | `GET /api/genres` |
| Elokuvan tiedot | `GET /api/movies/:id` |
| Arvostelut | `GET /api/movies/:id/reviews` |
| Etusivu | `/` |
| Jaettava elokuvasivu | `/movies/:id` |

Haku ja suodattimet tallentuvat URL-parametreihin. Selaimen Takaisin/Eteenpäin toimii. Sivun voi päivittää tai avata suorasta linkistä. Sovellus näyttää lataustilan, tyhjän tuloksen, API-virheen ja puuttuvan elokuvan. Luetteloissa on 12 kohdetta sivulla; seuraavan sivun olemassaolo tarkistetaan hakemalla yksi ylimääräinen rivi.

## Käynnistys

- Docker: nykyinen `docker compose up --build`. Frontend käyttää `.env`:n `VITE_API_URL`-asetusta. Uutta migraatiota ei tarvita.
- Ilman Dockeria: käynnistä nykyinen backend ja aja projektin juuressa `npm ci` ja `npm run dev`. Oletusarvoinen API-osoite on `http://localhost:3000`.
- Azure: tuotantoversio käyttää saman palvelimen suhteellisia `/api/...`-osoitteita. Azure-osoitetta tai tietokannan tunnuksia ei lisätä React-koodiin. Nykyinen GitHub Actions rakentaa frontendin ja julkaisee sen Expressin kanssa.

`npm run lint` ja `npm run build` suoritetaan projektin juuressa. API tarvitsee edelleen omat riippuvuutensa (`npm --prefix api ci`).

## Esittelyn tarkistuslista

- [ ] `/api/health` palauttaa 200 ja `connected`.
- [ ] Etusivu näyttää kuusi seed-elokuvaa.
- [ ] Haku `Matrix` palauttaa The Matrix -elokuvan.
- [ ] Action-genre näyttää Inceptionin ja The Matrixin nykyisellä demodatalla.
- [ ] Nimijärjestys alkaa Fight Club -elokuvasta.
- [ ] Olematon hakusana näyttää tyhjän tuloksen ilman kaatumista.
- [ ] Elokuvaa napsauttamalla avautuvat tiedot ja arvostelut.
- [ ] The Matrix näyttää Annan ja Mikon arvostelut; ID:tä ei oleteta numeroksi 1.
- [ ] Takaisin elokuviin palauttaa hakuehdot.
- [ ] Suoran elokuvaosoitteen päivitys toimii Azure-julkaisussa.
- [ ] Puuttuva elokuva näyttää ymmärrettävän virheen.
- [ ] Puhelimella (360–430 px) kentät ja kortit eivät aiheuta vaakavieritystä.

## Rajaus ja jatkotyö

- Demoseed ei sisällä julisteita tai TMDB-keskiarvoja. Käyttöliittymä näyttää paikkamerkin ja puuttuvan arvon; se ei keksi arvosanoja. Oikea `poster_path` näytetään automaattisesti TMDB:n kuvapalvelusta, kun backend tallentaa sen.
- TMDB-haku, ajankohtaiset elokuvat ja kuukausisuosio toteutetaan erikseen palvelinpuolella. TMDB-avain tallennetaan Azure App Settingsiin, ei `VITE_*`-muuttujaan.
- Rekisteröinti, kirjautuminen, arvostelujen kirjoittaminen, toivelistat ja ryhmät eivät sisälly tähän muutokseen. Niihin ei lisätä toimimattomia painikkeita.
- Tämä toteutus ei yksin sulje kokonaan GitHub-issueita #1–#3: niiden TMDB-vaatimukset ovat vielä kesken.
- ERD, arkkitehtuurikaavio ja havaittujen ryhmätriggerien korjaukset tehdään erillisinä muutoksina.

Nimi **Elokuvailta** ja ulkoasu ovat esittelyversion ehdotuksia, jotka tiimi voi vaihtaa.
