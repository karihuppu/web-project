# Vaatimusmäärittely: Elokuvasivu

**Versio:** 1.0
**Päivämäärä:** 30.10.2026  
**Laatija:** Ryhmä 13  
**Tila:** Keskeneräinen dokumentti


## 1. Tausta ja tavoite

Elokuvaharrastajilla on usein vaikeuksia löytää kiinnostavia elokuvia. Elokuvasuosituksia ja tietoja tallennetaan muun muassa puhelimen muistiinpanoihin. Tiedot ovat usein hajallaan, joten niitä on vaikea jakaa muiden kanssa.

**Tavoite:** Kehittää elokuvaharrastajille suunnattu verkkopalvelu, jossa käyttäjät voivat selata ja hakea elokuvia, tallentaa niitä omiin toivelistoihinsa sekä arvioida elokuvia. Palvelussa voi myös luoda ryhmiä, joissa jäsenet voivat jakaa elokuvasuosituksia ja nähdä toistensa arvosteluja.

**Onnistumisen mittarit (sovittava asiakkaan kanssa):**
- Käyttäjä löytää elokuvan ja näkee sen keskeiset tiedot.
- Käyttäjä pystyy luomaan tilin ja tallentamaan elokuvia omaan toivelistaansa.
- Kirjautunut käyttäjä pystyy arvioimaan elokuvan ja lisäämään siihen kommentin.
- Verkkopalvelua voidaan käyttää sujuvasti myös puhelimen selaimella ilman erillistä asennusta.
## 2. Käyttäjät ja roolit

| Rooli             | Tarve                         | Oikeudet                                       |
| ----------------- | ----------------------------- | ---------------------------------------------- |
| Sivun käyttäjä    | Nähdä elokuvat ja arvioida ne | Kommentoida arviointeja elokuviin              |
| Ryhmän ylläpitäjä | Hallinnoida ryhmää            | Poistaa ryhmässä viestejä tai jäseniä ryhmästä |

**Esimerkin rajaus:** Palvelu on tarkoitettu useille elokuvaharrastajille ja heidän muodostamilleen ryhmille. Elokuvien selaaminen ei vaadi käyttäjätiliä, mutta arvostelujen kirjoittaminen ja henkilökohtaisten listojen tallentaminen vaativat käyttäjätilin. Ryhmät voivat olla julkisia tai yksityisiä. Yksityiseen ryhmään pääseminen edellyttää kutsua tai ylläpitäjän hyväksyntää.

## 3. Käyttötilanne

1. Käyttäjä avaa elokuvasivuston ja selaa etusivulla näkyviä ajankohtaisia sekä suosittuja elokuvia.
2. Käyttäjä hakee elokuvaa nimellä tai selaa elokuvia esimerkiksi genren perusteella.
3. Käyttäjä avaa elokuvan sivun ja tutustuu sen kuvaukseen ja muihin tietoihin.
4. Käyttäjä kirjautuu sisään ja lisää elokuvan omaan toivelistaansa.
5. Käyttäjä arvioi elokuvan ja kirjoittaa halutessaan kommentin.
6. Käyttäjä avaa oman elokuvaryhmänsä sivun, jossa muut ryhmän jäsenet voivat nähdä hänen arvostelunsa.
7. Ryhmän ylläpitäjä voi halutessaan lisätä ryhmään uusia jäseniä tai poistaa niitä.

## 4. Toiminnalliset vaatimukset

Jokaisella vaatimuksella on yksilöllinen tunniste. **Must** tarkoittaa ensimmäisen käyttökelpoisen version kannalta välttämätöntä, **Should** tärkeää mutta lykättävissä olevaa ja **Could** mahdollista lisäominaisuutta.

| ID    | Vaatimus                                                                                               | Prioriteetti |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------ |
| FR-01 | Käyttäjä voi hakea elokuvia                                                                            | Must         |
| FR-02 | Sivu näyttää etusivulla ajankohtaisia elokuvia (uusin, suosituin kk)                                   | Must         |
| FR-03 | Elokuvista näkee tiedot ja kuvat                                                                       | Must         |
| FR-04 | Käyttäjä voi luoda ja poistaa tilin sekä muokata nimimerkkiä                                           | Must         |
| FR-05 | Käyttäjä voi tehdä ja poistaa toivelistan, jossa voi lisätä ja poistaa elokuvia                        | Must         |
| FR-06 | Ei kirjautunut käyttäjä voi arvioida elokuvia (1-5 tähteä) ja kirjautunut voi lisäksi lisätä kommentin | Must         |
| FR-07 | Käyttäjä voi luoda julkisen tai yksityisen ryhmän, jossa voi lisätä ja poistaa henkilöitä              | Must         |
| FR-08 | Sivu toimii myös puhelimella                                                                           | Must         |
| FR-09 | Käyttäjä voi hakea elokuvia genreittäin                                                                | Should       |
| FR-10 | Käyttäjä voi jakaa toivelistan, jonka toinen käyttäjä voi tallentaa                                    | Should       |
| FR-11 | Käyttäjä näkee muiden ryhmän jäsenten arvostelut elokuvista                                            | Should       |
| FR-12 | Käyttäjät voivat viestitellä ryhmissä                                                                  | Should       |
| FR-13 | Käyttäjä voi hakea ryhmiä ja liittyä tai pyytää liittymistä siihen                                     | Should       |
| FR-14 | Sivu näyttää, missä elokuvateattereissa elokuva pyörii                                                 | Could        |

### 4.1 Tarkemmat hyväksymiskriteerit: FR-03 (Elokuvan tiedot)

- **Tilanne:** kirjautunut jäsen ja tuleva tapahtuma. **Kun:** jäsen valitsee *Tulossa*. **Niin:** valittu tila tallentuu ja näkyy välittömästi tapahtuman sivulla.
- **Kun:** sama jäsen valitsee *En pääse*. **Niin:** aikaisempi tila korvautuu uudella; jäsen ei näy kahdessa tilassa.
- **Kun:** toinen jäsen avaa saman tapahtuman. **Niin:** hän näkee päivitetyn osallistujamäärän.
- **Kun:** jäsen yrittää muuttaa toisen jäsenen ilmoittautumista. **Niin:** sovellus estää toiminnon.

### 4.2 Tarkemmat hyväksymiskriteerit: FR-06 (tapahtuman luonti)

- Valmentaja voi tallentaa tapahtuman, kun nimi, aloitus- ja päättymisaika sekä paikka on annettu.
- Jos päättymisaika on ennen alkamisaikaa, sovellus näyttää virheilmoituksen eikä tallenna tapahtumaa.
- Tallennettu tapahtuma näkyy jäsenten tulevien tapahtumien listalla.
- Tavallinen jäsen ei voi luoda tapahtumaa.

## 5. Ei-toiminnalliset vaatimukset

Numeeriset rajat ovat **esimerkkitavoitteita**, jotka tulee oikeassa projektissa sopia asiakkaan kanssa ja testata.

| ID     | Vaatimus                                                                                                 | Todentaminen                         |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| NFR-01 | Etusivu ja elokuvien hakutulokset latautuvat enintään 3 sekunnissa sovitussa testiympäristössä.          | Suorituskykytesti                    |
| NFR-02 | Sovellusta voidaan käyttää 360–430 pikselin levyisellä puhelinnäytöllä ilman vaakasuuntaista vieritystä. | Käyttöliittymätesti                  |
| NFR-03 | Salasanat tallennetaan vain turvallisella yksisuuntaisella salasanatiivisteellä.                         | Toteutuksen ja tietokannan tarkistus |
| NFR-04 | Käyttäjä ei voi nähdä tai muuttaa muiden käyttäjien yksityisiä tietoja ilman tarvittavia oikeuksia.      | API:n käyttöoikeustestit             |
| NFR-05 | Sovellusta käytetään tuotantoympäristössä HTTPS-yhteydellä.                                              | Julkaistun osoitteen tarkistus       |

## 6. Tiedot ja alustava tietomalli

Sovellus tallentaa vähintään seuraavat tiedot:

- **Käyttäjä:** tunniste, nimimerkki, sähköposti, salasanatiiviste ja rooli.
- **Elokuva:** TMDB-tunniste ja mahdolliset paikallisesti tallennettavat elokuvan tiedot.
- **Arvostelu:** tunniste, käyttäjän tunniste, elokuvan tunniste, tähtiarvio, kommentti ja luontiajankohta.
- **Toivelista:** tunniste, käyttäjän tunniste ja listan nimi.
- **Toivelistan elokuva:** toivelistan tunniste ja elokuvan tunniste.
- **Ryhmä:** tunniste, nimi, kuvaus, julkisuusasetukset ja luontiajankohta.
- **Ryhmän jäsenyys:** käyttäjän tunniste, ryhmän tunniste ja käyttäjän rooli ryhmässä.

Yhdellä käyttäjällä voi olla useita arvosteluja, mutta samalla käyttäjällä voi olla vain yksi arvostelu samasta elokuvasta.

Elokuvien perustiedot ja julisteet haetaan TMDB -palvelusta.

## 7. Projektin rajaus

**Ensimmäiseen julkaisuun (MVP) sisältyvät:** Elokuvien selaaminen ja hakeminen, käyttäjätilin luominen ja kirjautuminen tilille, elokuvien arviointi ja kommentointi, ryhmien luonti sekä ryhmän jäsenten hallinta, mobiililaitteelle mukautuva käyttöliittymä ja elokuvien tietojen hakeminen TMDB - palvelusta.

**Ei toteuteta tässä kahdeksan viikon projektissa:** Maksulliset lisäpalvelut ja tekoälyyn perustuvat elokuvasuositukset.

Rajaus ja Must-prioriteetit hyväksytetään asiakkaalla. Niitä voidaan muuttaa, kun toteutuksen työmäärä tarkentuu.

## 8. Toteutusjärjestys ja alustava viikkosuunnitelma

Tämä on **esimerkkisuunnitelma**, ei asiakkaan hyväksymä aikataulu. Ensimmäinen arvo syntyy, kun tapahtumia voi nähdä ja ilmoittautua niihin; tekniset riippuvuudet, kuten tunnistautuminen, toteutetaan hallitusti tämän ympärille.

| Viikko | Tavoite ja näytettävä tulos |
|---|---|
| 1 | Vaatimukset, tietokantasuunnitelma, backlog ja ensimmäinen Azure-julkaisu hyväksyttyyn pohjaan |
| 2 | Julkaistussa sovelluksessa näkyy oikeasta tietokannasta haettu tapahtumalista |
| 3 | Tapahtumaan voi ilmoittautua; ensimmäinen päästä päähän toimiva käyttäjäpolku |
| 4 | Valmentaja luo ja muokkaa tapahtumia; käyttöoikeudet toteutettu |
| 5 | Käyttäjien kirjautuminen ja oman osallistumisen hallinta käytössä, jos niitä ei toteutettu aiemmin riippuvuuksina |
| 6 | Mobiilikäyttö, virhetilanteet ja tärkeimpien käyttötapausten testit |
| 7 | Viimeistely, dokumentit, testaus ja tuotantoversion vakauttaminen |
| 8 | Loppuesitys ja toimivan julkaistun sovelluksen esittely |

**Huom.** Varhaisissa demoissa voidaan käyttää rajattua testikäyttäjää tai testitunnistusta. Oikeat käyttöoikeudet ja turvallisuusvaatimukset on toteutettava ennen todellisten käyttäjien käyttöönottoa.

## 9. Definition of Done – milloin vaatimus on valmis?

Vaatimusta ei merkitä valmiiksi vain siksi, että se toimii kehittäjän omalla koneella. Valmis ominaisuus täyttää kaikki seuraavat ehdot:

- [ ] Toteutus vastaa hyväksyttyjä vaatimuksia ja hyväksymiskriteerejä.
- [ ] Koodi on GitHubissa, katselmoitu ja yhdistetty yhteiseen haaraan.
- [ ] Tarvittavat automaattiset testit menevät läpi.
- [ ] Ominaisuus toimii oikean palvelimen ja tietokannan kanssa.
- [ ] Ominaisuus on julkaistu Azureen ja testattu julkaistusta osoitteesta.
- [ ] Tiimi osaa esitellä ja selittää toteutuksen.
- [ ] Tarvittava dokumentaatio on päivitetty.

**Esimerkiksi:** FR-03 on valmis vasta, kun jäsenen ilmoittautuminen tallentuu julkaistussa sovelluksessa ja toinen käyttäjä näkee sen – ei silloin, kun nappi muuttaa tekstiä paikallisessa React-näkymässä.

## 10. Avoimet kysymykset ja oletukset

| ID   | Kysymys asiakkaalle                                                   | Tila  |
| ---- | --------------------------------------------------------------------- | ----- |
| Q-01 | Pitääkö ryhmällä olla oma toivelista?                                 | Avoin |
| Q-02 | Voiko ylläpitäjä lähettää käyttäjälle kutsun liittyä ryhmään?         | Avoin |
| Q-03 | Pitääkö jäsenen pystyä liittymään ryhmään ilman käyttäjätiliä?        | Avoin |
| Q-04 | Näytetäänkö menneet vanhat viestit ja kuinka kauan niitä säilytetään? | Avoin |
| Q-05 | Voiko ryhmässä olla useita ylläpitäjiä?                               | Avoin |

**Oletukset, jotka pitää varmistaa:** ensimmäinen versio tukee vain yhtä joukkuetta; ilmoittautuminen sulkeutuu tapahtuman päätyttyä; sähköposti-ilmoitukset eivät ole MVP:n välttämätön osa.

## 11. Hyväksyntä ja muutosten hallinta

Vaatimusmäärittely käydään asiakkaan kanssa läpi **ennen varsinaisen toteutuksen etenemistä**. Hyväksynnässä tarkistetaan erityisesti tavoitteet, ensimmäisen version rajaus, Must-vaatimukset ja avoimet kysymykset.

| Kenttä | Arvo |
|---|---|
| Asiakkaan edustaja | _________________________ |
| Hyväksytty versio | _________________________ |
| Hyväksynnän päivämäärä | _________________________ |
| Mahdolliset ehdot | _________________________ |

Muutokset kirjataan dokumentin versiohistoriaan ja GitHubin backlogiin. Asiakas ja tiimi arvioivat yhdessä niiden vaikutuksen aikatauluun ja prioriteetteihin.

## 12. Versiohistoria

| Versio | Päivä      | Muutos                                                                     |
| ------ | ---------- | -------------------------------------------------------------------------- |
| 0.1    | 30.10.2026 | Alustava vaatimusmäärittely                                                |
| 0.2    | 2.11.2026  | Vaatimuksia tarkennettu ja tavoitteet lisätty.                             |
| 1.0    | -          | Opetuskäyttöön viimeistelty esimerkki (ei hyväksytty oikealla asiakkaalla) |
