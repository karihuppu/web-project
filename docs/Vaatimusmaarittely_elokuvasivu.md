# Vaatimusmäärittely: Elokuvasivu

**Versio:** 0.3
**Päivämäärä:** 9.11.2026
**Laatija:** Ryhmä 13
**Tila:** Elokuvapalvelu

## Projektiryhmä

| Nimi | GitHub | Vastuualue |
| --- | --- | --- |
| Marco Kinnunen | `karihuppu` | Repositorion omistaja; vaatimusmäärittelyn pohja ja backlog (GitHub-issuet #1–#14) |
| Lucas Salonen | `LucasSal921` | Frontend |
| Aleksandr Starchenkov | `AleksandrCGM` | Backend (Express, API), PostgreSQL-tietokanta ja migraatiot, Azure-julkaisu ja GitHub Actions |

Vastuualueet perustuvat tähänastiseen työhön, ja tiimi voi tarkentaa niitä.

**Liittyvät dokumentit:** [ERD](erd.md) · [Arkkitehtuuri](architecture.md) · [Tietokanta ja migraatiot](tietokanta.md) · [API](api.md) · [Toteutuksen katselmointi](implementation-review.md) · [Viikon 2 esittely](demo-week2.md)

## 1. Tausta ja tavoite

Elokuvaharrastajien on usein vaikea löytää kiinnostavia elokuvia. Suosituksia ja elokuvien tietoja tallennetaan esimerkiksi puhelimen muistiinpanoihin, joten ne ovat hajallaan ja niitä on vaikea jakaa muiden kanssa.

**Tavoite:** Kehittää elokuvaharrastajille suunnattu verkkopalvelu, jossa käyttäjät voivat selata ja hakea elokuvia, tallentaa niitä omiin toivelistoihinsa sekä arvioida elokuvia. Palvelussa voi myös luoda ryhmiä, joissa jäsenet jakavat elokuvasuosituksia ja näkevät toistensa arvostelut.

**Onnistumisen mittarit (sovittava asiakkaan kanssa):**
- Käyttäjä löytää elokuvan ja näkee sen keskeiset tiedot.
- Käyttäjä pystyy luomaan tilin ja tallentamaan elokuvia omaan toivelistaansa.
- Kirjautunut käyttäjä pystyy arvioimaan elokuvan ja lisäämään siihen kommentin.
- Verkkopalvelua voidaan käyttää sujuvasti myös puhelimen selaimella ilman erillistä asennusta.

## 2. Käyttäjät ja roolit

| Rooli | Tarve | Oikeudet |
| --- | --- | --- |
| Vierailija (ei kirjautunut) | Löytää elokuvia ja lukea arvosteluja | Selata ja hakea elokuvia, avata elokuvan sivun, lukea arvosteluja |
| Rekisteröitynyt käyttäjä | Arvioida elokuvia ja koota omia listoja | Vierailijan oikeudet + arvioida ja kommentoida, hallita omia toivelistoja, luoda ryhmiä ja liittyä niihin, muokata nimimerkkiä, poistaa oma tili |
| Ryhmän ylläpitäjä | Hallinnoida ryhmää | Lisätä ja poistaa jäseniä sekä (FR-12:n myötä) poistaa ryhmän viestejä. Ryhmässä voi olla useita ylläpitäjiä. |

Sivuston laajuista ylläpitäjäroolia ei ole ensimmäisessä versiossa.

**Rajaus:** Palvelu on tarkoitettu elokuvaharrastajille ja heidän muodostamilleen ryhmille. Elokuvien selaaminen ei vaadi käyttäjätiliä, mutta arvostelujen kirjoittaminen ja omien listojen tallentaminen vaativat tilin. Ryhmät voivat olla julkisia tai yksityisiä. Yksityiseen ryhmään pääsee vain kutsulla tai ylläpitäjän hyväksynnällä.

## 3. Käyttötilanne

1. Käyttäjä avaa elokuvasivuston ja selaa etusivulla ajankohtaisia ja suosittuja elokuvia.
2. Käyttäjä hakee elokuvaa nimellä tai selaa elokuvia genren perusteella.
3. Käyttäjä avaa elokuvan sivun ja tutustuu sen kuvaukseen ja muihin tietoihin.
4. Käyttäjä kirjautuu sisään ja lisää elokuvan omaan toivelistaansa.
5. Käyttäjä arvioi elokuvan ja kirjoittaa halutessaan kommentin.
6. Käyttäjä avaa oman elokuvaryhmänsä sivun, jossa muut ryhmän jäsenet näkevät hänen arvostelunsa.
7. Ryhmän ylläpitäjä lisää ryhmään uusia jäseniä tai poistaa niitä.

## 4. Toiminnalliset vaatimukset

Jokaisella vaatimuksella on yksilöllinen tunniste. **Must** tarkoittaa ensimmäisen käyttökelpoisen version kannalta välttämätöntä, **Should** tärkeää mutta lykättävissä olevaa ja **Could** mahdollista lisäominaisuutta. Sarake *Tila 9.11.* kuvaa toteutuksen tilannetta; tarkemmin: [implementation-review.md](implementation-review.md).

| ID | Issue | Vaatimus | Prioriteetti | Tila 9.11. |
| --- | --- | --- | --- | --- |
| FR-01 | #1 | Käyttäjä voi hakea elokuvia | Must | Osittain: haku nimellä omasta tietokannasta, TMDB-haku puuttuu |
| FR-02 | #2 | Etusivulla näkyy ajankohtaisia elokuvia (uusimmat sekä kuukauden suosituimmat TMDB:n mukaan) | Must | Osittain: uusimmat julkaisupäivän mukaan, suosituimmat puuttuvat |
| FR-03 | #3 | Elokuvista näkee tiedot ja kuvat | Must | Osittain: tiedot näkyvät, julisteet odottavat TMDB-integraatiota |
| FR-04 | #4 | Käyttäjä voi luoda ja poistaa tilin sekä muokata nimimerkkiä; käyttäjä voi kirjautua sisään ja ulos | Must | Tietokanta valmis, toiminto ei aloitettu |
| FR-05 | #5 | Käyttäjä voi tehdä ja poistaa toivelistan sekä lisätä ja poistaa siinä elokuvia | Must | Tietokanta valmis, toiminto ei aloitettu |
| FR-06 | #6 | Kirjautunut käyttäjä voi arvioida elokuvan (1–5 tähteä) ja lisätä kommentin ¹ | Must | Arvostelujen luku toimii, kirjoitus puuttuu |
| FR-07 | #7 | Käyttäjä voi luoda julkisen tai yksityisen ryhmän sekä lisätä ja poistaa siinä henkilöitä | Must | Tietokanta valmis, toiminto ei aloitettu |
| FR-08 | #8 | Sivu toimii myös puhelimella | Must | Mukautuva ulkoasu tehty, mittaus puuttuu |
| FR-09 | #9 | Käyttäjä voi hakea elokuvia genreittäin | Should | Toimii omalla datalla |
| FR-10 | #10 | Käyttäjä voi jakaa toivelistan, jonka toinen käyttäjä voi tallentaa | Should | Ei aloitettu |
| FR-11 | #11 | Käyttäjä näkee muiden ryhmän jäsenten arvostelut elokuvista | Should | Ei aloitettu |
| FR-12 | #12 | Käyttäjät voivat viestitellä ryhmissä | Should | Ei aloitettu |
| FR-13 | #13 | Käyttäjä voi hakea ryhmiä ja liittyä tai pyytää liittymistä niihin | Should | Ei aloitettu |
| FR-14 | #14 | Sivu näyttää, missä elokuvateattereissa elokuva pyörii | Could | Ei aloitettu |

¹ **FR-06 muutettu 9.11.2026.** Alkuperäinen muotoilu (myös issuessa #6) oli: "Ei kirjautunut käyttäjä voi arvioida elokuvia (1–5 tähteä) ja kirjautunut voi lisäksi lisätä kommentin." Se oli ristiriidassa lukujen 1, 2 ja 6 kanssa. Tiimi ehdottaa, että ensimmäisessä versiossa arvioi vain kirjautunut käyttäjä ja anonyymi arviointi lisätään tarvittaessa myöhemmin. Asia vahvistetaan asiakkaalta (Q-06).

### 4.1 Tarkemmat hyväksymiskriteerit: FR-03 (Elokuvan tiedot)

- **Kun** käyttäjä avaa elokuvan sivun (`/movies/:id`), **niin** sivulla näkyvät nimi, alkuperäinen nimi (jos eri), julkaisuvuosi, kesto, genret, kuvaus, TMDB-keskiarvo ja juliste.
- **Kun** juliste tai TMDB-keskiarvo puuttuu, **niin** sivu näyttää paikkamerkin tai tekstin "ei saatavilla" eikä keksi arvoa.
- **Kun** elokuvaa ei ole olemassa, **niin** käyttäjä näkee ymmärrettävän ilmoituksen eikä sivu kaadu.
- **Kun** käyttäjä avaa elokuvan sivun suoralla linkillä tai päivittää sivun julkaistussa sovelluksessa, **niin** sama elokuva avautuu.
- **Kun** sivu avataan 360–430 px leveällä puhelinnäytöllä, **niin** vaakasuuntaista vieritystä ei synny.

### 4.2 Tarkemmat hyväksymiskriteerit: FR-06 (Elokuvan arviointi)

- **Kun** kirjautunut käyttäjä valitsee 1–5 tähteä ja tallentaa, **niin** arvio näkyy elokuvan sivulla hänen nimimerkillään. Kommentti on vapaaehtoinen, enintään 2000 merkkiä.
- **Kun** sama käyttäjä arvioi saman elokuvan uudelleen, **niin** aiempaa arviota muokataan; käyttäjällä on enintään yksi arvio elokuvaa kohden.
- **Kun** ei-kirjautunut käyttäjä yrittää arvioida, **niin** sovellus pyytää kirjautumaan eikä tallenna arviota.
- **Kun** käyttäjä yrittää muuttaa tai poistaa toisen käyttäjän arvion, **niin** sovellus estää toiminnon.
- **Kun** käyttäjä poistaa tilinsä, **niin** hänen arvosanansa säilyvät, kommentit poistuvat ja tekijäksi näytetään "Poistettu käyttäjä".

## 5. Ei-toiminnalliset vaatimukset

Numeeriset rajat ovat **tavoitteita**, jotka sovitaan asiakkaan kanssa ja testataan.

| ID | Vaatimus | Todentaminen |
| --- | --- | --- |
| NFR-01 | Etusivu ja elokuvien hakutulokset latautuvat enintään 3 sekunnissa sovitussa testiympäristössä. | Suorituskykytesti |
| NFR-02 | Sovellusta voidaan käyttää 360–430 pikselin levyisellä puhelinnäytöllä ilman vaakasuuntaista vieritystä. | Käyttöliittymätesti |
| NFR-03 | Salasanat tallennetaan vain turvallisella yksisuuntaisella salasanatiivisteellä (esim. bcrypt). | Toteutuksen ja tietokannan tarkistus |
| NFR-04 | Käyttäjä ei voi nähdä tai muuttaa muiden käyttäjien yksityisiä tietoja ilman tarvittavia oikeuksia. | API:n käyttöoikeustestit |
| NFR-05 | Tuotantoympäristössä sovellusta käytetään HTTPS-yhteydellä, ja tietokantayhteys on salattu (TLS). | Julkaistun osoitteen ja asetusten tarkistus |
| NFR-06 | Salaisuuksia (tietokannan salasana, TMDB-avain) ei tallenneta koodiin tai repositorioon. | Koodikatselmointi |

## 6. Tiedot ja tietomalli

Toteutettu PostgreSQL-tietomalli (migraatiot `api/db/migrations/`) on kuvattu tarkemmin [ERD:ssä](erd.md).

- **Käyttäjä:** tunniste, sähköposti ja nimimerkki (kumpikin yksilöllinen kirjainkoosta riippumatta) sekä salasanatiiviste. Sivuston laajuista roolia ei ole; rooli on vain ryhmän jäsenyydessä.
- **Elokuva:** oma tunniste, TMDB-tunniste sekä TMDB:stä tallennetut tiedot: nimi, alkuperäinen nimi, kuvaus, julkaisupäivä, kesto, julisteen polku ja TMDB-keskiarvo (0–10).
- **Genre** ja **elokuvan genre:** TMDB:n genret ja niiden liitos elokuviin.
- **Arvostelu:** tunniste, käyttäjä, elokuva, tähtiarvio (1–5), kommentti, luonti- ja muokkausaika. Jos käyttäjä poistaa tilinsä, arvosana säilyy ilman kommenttia ja tekijää.
- **Toivelista:** tunniste, käyttäjä ja listan nimi (yksilöllinen saman käyttäjän listoissa).
- **Toivelistan elokuva:** toivelista, elokuva ja lisäysaika.
- **Ryhmä:** tunniste, nimi, kuvaus, näkyvyys (julkinen/yksityinen), luoja ja luontiaika.
- **Ryhmän jäsenyys:** käyttäjä, ryhmä, rooli (ylläpitäjä/jäsen) ja liittymisaika. Ryhmän luojasta tulee automaattisesti ylläpitäjä.

Käyttäjällä voi olla useita arvosteluja, mutta samasta elokuvasta vain yksi.

Elokuvien perustiedot ja julisteet haetaan TMDB-palvelusta palvelimen kautta. Sivustolla näytetään toistaiseksi TMDB:n keskiarvo; omien arvostelujen keskiarvo voidaan lisätä myöhemmin.

## 7. Projektin rajaus

**Ensimmäiseen julkaisuun (MVP) sisältyvät:** elokuvien selaaminen ja hakeminen, käyttäjätilin luominen ja kirjautuminen, elokuvien arviointi ja kommentointi, toivelistat, ryhmien luonti ja jäsenten hallinta, mobiililaitteelle mukautuva käyttöliittymä sekä elokuvien tietojen hakeminen TMDB-palvelusta.

**Ei toteuteta tässä kahdeksan viikon projektissa:** maksulliset lisäpalvelut ja tekoälyyn perustuvat elokuvasuositukset.

Rajaus ja Must-prioriteetit hyväksytetään asiakkaalla. Niitä voidaan muuttaa, kun toteutuksen työmäärä tarkentuu.

## 8. Toteutusjärjestys ja alustava viikkosuunnitelma

Tämä on **tiimin alustava suunnitelma**, ei asiakkaan hyväksymä aikataulu. Ensin rakennetaan toimiva pohja (tietokanta, API, julkaisu), sitten kirjautuminen, jonka varaan kirjoittavat toiminnot tehdään.

| Viikko | Tavoite ja näytettävä tulos | Tila 9.11. |
| --- | --- | --- |
| 1 | Vaatimukset, backlog (GitHub-issuet), tietokantasuunnitelma ja Azure-ympäristö | Tehty; vaatimukset odottavat hyväksyntää |
| 2 | Tietokanta migraatioineen, API ja käyttöliittymä: elokuvaluettelo, haku, genre-suodatus ja elokuvasivu arvosteluineen julkaistuna Azuressa. ERD ja arkkitehtuurikaavio. | Toteutettu; julkaistun version tarkistus kesken |
| 3 | Rekisteröinti ja kirjautuminen (FR-04); arvostelun kirjoittaminen (FR-06) | – |
| 4 | TMDB-integraatio palvelimella: haku, ajankohtaiset ja suositut elokuvat, julisteet (FR-01–FR-03) | – |
| 5 | Toivelistat (FR-05); tilin ja nimimerkin hallinta | – |
| 6 | Ryhmät ja jäsenten hallinta (FR-07), mobiilikäytön tarkistus, tärkeimpien käyttötapausten testit | – |
| 7 | Should-vaatimukset aikataulun salliessa (FR-11, FR-13), viimeistely, dokumentit ja tuotantoversion vakauttaminen | – |
| 8 | Loppuesitys ja toimivan julkaistun sovelluksen esittely | – |

**Huom.** Varhaisissa demoissa käytetään demodataa ja demokäyttäjiä (ilman toimivaa salasanaa). Oikeat käyttöoikeudet ja turvallisuusvaatimukset toteutetaan ennen todellisten käyttäjien käyttöönottoa.

## 9. Definition of Done – milloin vaatimus on valmis?

Vaatimusta ei merkitä valmiiksi vain siksi, että se toimii kehittäjän omalla koneella. Valmis ominaisuus täyttää kaikki seuraavat ehdot:

- [ ] Toteutus vastaa hyväksyttyjä vaatimuksia ja hyväksymiskriteerejä.
- [ ] Koodi on GitHubissa, katselmoitu ja yhdistetty yhteiseen haaraan.
- [ ] Tarvittavat automaattiset testit menevät läpi.
- [ ] Ominaisuus toimii oikean palvelimen ja tietokannan kanssa.
- [ ] Ominaisuus on julkaistu Azureen ja testattu julkaistusta osoitteesta.
- [ ] Tiimi osaa esitellä ja selittää toteutuksen.
- [ ] Tarvittava dokumentaatio on päivitetty.

**Esimerkiksi:** FR-06 on valmis vasta, kun kirjautuneen käyttäjän arvio tallentuu julkaistussa sovelluksessa ja toinen käyttäjä näkee sen elokuvan sivulla, ei silloin, kun tähtien valinta muuttuu paikallisessa React-näkymässä.

## 10. Avoimet kysymykset ja oletukset

| ID | Kysymys asiakkaalle | Tila |
| --- | --- | --- |
| Q-01 | Pitääkö ryhmällä olla oma toivelista? | Avoin |
| Q-02 | Voiko ylläpitäjä lähettää käyttäjälle kutsun liittyä ryhmään? | Avoin |
| Q-03 | Pitääkö jäsenen pystyä liittymään ryhmään ilman käyttäjätiliä? | Avoin; tiimin ehdotus: ei |
| Q-04 | Näytetäänkö vanhat ryhmäviestit ja kuinka kauan niitä säilytetään? | Avoin |
| Q-05 | Voiko ryhmässä olla useita ylläpitäjiä? | Tiimin ehdotus: kyllä (tietokanta sallii); vahvistettava |
| Q-06 | Saako ei-kirjautunut käyttäjä arvioida elokuvia (FR-06, issue #6)? | Tiimin ehdotus: ei ensimmäisessä versiossa; vahvistettava |
| Q-07 | Mitä "kuukauden suosituin" tarkoittaa (FR-02)? | Tiimin ehdotus: TMDB:n suosio viimeisen kuukauden ajalta; vahvistettava |
| Q-08 | Mitä ryhmälle tapahtuu, kun viimeinen ylläpitäjä lähtee? | Tiimin ehdotus: pisimpään ollut jäsen nousee ylläpitäjäksi, tyhjä ryhmä poistetaan; vahvistettava |
| Q-09 | Mitä käyttäjän arvosteluille tapahtuu, kun hän poistaa tilinsä? | Tiimin ehdotus: arvosana säilyy, kommentti poistuu ("Poistettu käyttäjä"); vahvistettava |

**Oletukset, jotka pitää varmistaa:** elokuvien selaaminen ei vaadi tiliä; sähköposti-ilmoitukset eivät ole MVP:n välttämätön osa; TMDB:n rajapintaa saa käyttää opintoprojektissa sen käyttöehtojen mukaisesti (lähdemaininta ja oma API-avain).

## 11. Hyväksyntä ja muutosten hallinta

Vaatimusmäärittely käydään asiakkaan kanssa läpi **ennen varsinaisen toteutuksen etenemistä**. Hyväksynnässä tarkistetaan erityisesti tavoitteet, ensimmäisen version rajaus, Must-vaatimukset ja avoimet kysymykset.

| Kenttä | Arvo |
| --- | --- |
| Asiakkaan edustaja | _________________________ |
| Hyväksytty versio | _________________________ |
| Hyväksynnän päivämäärä | _________________________ |
| Mahdolliset ehdot | _________________________ |

Muutokset kirjataan dokumentin versiohistoriaan ja GitHubin backlogiin. Asiakas ja tiimi arvioivat yhdessä niiden vaikutuksen aikatauluun ja prioriteetteihin.

## 12. Versiohistoria

| Versio | Päivä | Muutos |
| --- | --- | --- |
| 0.1 | 30.10.2026 | Alustava vaatimusmäärittely |
| 0.2 | 2.11.2026 | Vaatimuksia tarkennettu ja tavoitteet lisätty |
| 0.3 | 9.11.2026 | Projektiryhmä lisätty; roolit tarkennettu; FR-06 tarkennettu (Q-06); vaatimuksiin issue-numerot ja toteutuksen tila; hyväksymiskriteerit 4.1–4.2 kirjoitettu tälle projektille; tietomalli päivitetty toteutuksen mukaiseksi; NFR-06 lisätty; viikkosuunnitelma päivitetty; avoimet kysymykset Q-06–Q-09 lisätty |
