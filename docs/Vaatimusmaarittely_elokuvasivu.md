# Vaatimusmäärittely: Elokuvasivu

**Versio:** 1.0
**Päivämäärä:** 30.10.2026  
**Laatija:** Ryhmä 13  
**Tila:** Keskeneräinen dokumentti


## 1. Tausta ja tavoite

Harrastusjoukkueen harjoitusten ja otteluiden osallistujamääriä on vaikea seurata viestiryhmässä. Viestit hukkuvat, ilmoittautumistilanne muuttuu ja valmentaja joutuu kyselemään osallistumista erikseen.

**Tavoite:** Joukkueen jäsenet näkevät tulevat tapahtumat ja ilmoittavat osallistumisestaan. Valmentaja näkee nopeasti, montako osallistujaa on tulossa.

**Onnistumisen mittarit (sovittava asiakkaan kanssa):**
- Valmentaja näkee yksittäisen tapahtuman osallistujat yhdeltä sivulta.
- Jäsen voi ilmoittaa osallistumisensa tapahtumaan enintään kolmella toiminnolla tapahtuman avaamisesta.
- Sovellusta voidaan käyttää puhelimen selaimessa ilman erillistä asennusta.

## 2. Käyttäjät ja roolit

| Rooli                   | Tarve                                                 | Oikeudet                                                              |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Joukkueen jäsen         | Nähdä tapahtumat ja ilmoittaa osallistumisensa        | Katsella oman joukkueensa tapahtumia; muuttaa omaa ilmoittautumistaan |
| Valmentaja / ylläpitäjä | Suunnitella tapahtumat ja tarkistaa osallistujamäärät | Jäsenen oikeuksien lisäksi luoda, muokata ja peruuttaa tapahtumia     |

**Esimerkin rajaus:** Sovellus palvelee aluksi yhtä joukkuetta. Käyttäjätunnukset luodaan alkuvaiheessa ylläpitäjän toimesta. Monen joukkueen tuki on jatkokehitysidea.

## 3. Käyttötilanne

1. Valmentaja luo tapahtuman: *Tiistain harjoitukset*, 3.11. klo 18.00–19.30, liikuntahalli.
2. Jäsen avaa tapahtumaluettelon, valitsee harjoitukset ja painaa **Tulossa**.
3. Jäsenen tila näkyy tapahtuman osallistujaluettelossa.
4. Jäsen muuttaa myöhemmin tilaksi **En pääse**.
5. Valmentaja tarkistaa ennen harjoituksia osallistujamäärät.

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
| FR-10 | Jäsen voi kirjoittaa ilmoittautumisen yhteyteen lyhyen kommentin (enintään 300 merkkiä).               | Should       |
| FR-11 | Käyttäjä saa sähköposti-ilmoituksen uudesta tapahtumasta.                                              | Could        |
| FR-12 | Valmentaja voi luoda viikoittain toistuvan tapahtuman.                                                 | Could        |

### 4.1 Tarkemmat hyväksymiskriteerit: FR-03 (ilmoittautuminen)

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

| ID | Vaatimus | Todentaminen |
|---|---|---|
| NFR-01 | Tapahtumalista avautuu enintään 3 sekunnissa testattaessa 50 tapahtumalla ja 20 samanaikaisella käyttäjällä sovitussa testiympäristössä. | Suorituskykytesti |
| NFR-02 | Sovelluksen tapahtumat ja ilmoittautumiset ovat käytettävissä 360–430 pikselin levyisellä puhelinnäytöllä ilman vaakasuuntaista vieritystä. | Käyttöliittymätesti |
| NFR-03 | Salasanat tallennetaan vain turvallisella yksisuuntaisella salasanatiivisteellä. | Toteutuksen ja tietokannan tarkistus |
| NFR-04 | Käyttäjä ei voi hakea tai muuttaa toisen käyttäjän tietoja ilman roolinsa mukaista oikeutta. | API:n käyttöoikeustestit |
| NFR-05 | Sovellusta käytetään tuotantoympäristössä HTTPS-yhteydellä. | Julkaistun osoitteen tarkistus |

## 6. Tiedot ja alustava tietomalli

Sovellus tallentaa vähintään seuraavat tiedot:

- **Käyttäjä:** tunniste, nimi, sähköposti, salasanatiiviste ja rooli.
- **Tapahtuma:** tunniste, nimi, paikka, aloitus, lopetus, tila (aktiivinen/peruutettu) ja luoja.
- **Ilmoittautuminen:** käyttäjän tunniste, tapahtuman tunniste, osallistumistila ja viimeisin muutosajankohta.

Samalla käyttäjällä voi olla kuhunkin tapahtumaan vain yksi voimassa oleva ilmoittautuminen. Tarkempi ER-kaavio tehdään erilliseen tietokantasuunnitelmaan.

## 7. Projektin rajaus

**Ensimmäiseen julkaisuun (MVP) sisältyvät:** tapahtumien näyttäminen ja luominen, osallistumistilan tallentaminen, osallistujalista sekä tarvittavat käyttöoikeudet. Käyttöliittymän toimivuus puhelimessa ja julkaisu Azureen kuuluvat myös valmiin tuotteen vaatimuksiin.

**Ei toteuteta tässä kahdeksan viikon projektissa:** maksut, chat, mobiilisovellus sovelluskauppaan, usean seuran hallinta, kalenterisynkronointi ja monimutkaiset tilastoraportit.

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

| ID | Kysymys asiakkaalle | Tila |
|---|---|---|
| Q-01 | Saako jäsen nähdä kaikkien osallistumistilat vai vain osallistujien määrät? | Avoin |
| Q-02 | Voiko valmentaja muuttaa jäsenen ilmoittautumista hänen puolestaan? | Avoin |
| Q-03 | Pitääkö jäsenen pystyä ilmoittautumaan ilman käyttäjätiliä? | Avoin |
| Q-04 | Näytetäänkö menneet tapahtumat ja kuinka kauan niitä säilytetään? | Avoin |
| Q-05 | Voiko joukkueessa olla useita valmentajia? | Avoin |

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

| Versio | Päivä | Muutos |
|---|---|---|
| 0.1 | 26.10.2026 | Alustava vaatimusmäärittely |
| 1.0 | 26.10.2026 | Opetuskäyttöön viimeistelty esimerkki (ei hyväksytty oikealla asiakkaalla) |
