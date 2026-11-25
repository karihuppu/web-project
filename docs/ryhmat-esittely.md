# Ryhmät: toteutus ja esittely

**Haarat:** `feature/groups` (PR #18, yhdistetty `main`iin) ja `feature/group-requests` (yksityisen ryhmän haku ja liittymispyynnöt, migraatio 004)
**Tehtävä (opettaja):** "Alex — ryhmien luonti, jäsenten liittyminen, jäsenten käyttötasot (admin ja tavallinen käyttäjä), ryhmästä poistuminen".
**Tila:** valmis julkaisuun, testattu paikallisesti; **ei vielä tarkistettu Azuressa**.

## Mitä issueista katetaan

| Issue | Katettu tässä | Jäljellä |
| --- | --- | --- |
| **#7** Käyttäjä voi luoda julkisen tai yksityisen ryhmän, jossa voi lisätä ja poistaa henkilöitä | Ryhmän luonti (julkinen/yksityinen), luoja = ylläpitäjä; roolit *Ylläpitäjä*/*Jäsen*; ylläpitäjä lisää jäsenen nimimerkillä ja poistaa tavallisen jäsenen; eroaminen; ylläpito siirtyy, tyhjä ryhmä poistuu | Roolien vaihto käsin (useampi ylläpitäjä, Q-05), ryhmän nimen/kuvauksen muokkaus, ryhmän poisto ylläpitäjän toimesta |
| **#13** Käyttäjä voi hakea ryhmiä ja liittyä tai pyytää liittymistä | Julkisten ryhmien lista ja haku nimellä; liittyminen julkiseen ryhmään; **yksityisen ryhmän haku koko nimellä (*Etsi yksityistä ryhmää*), liittymispyyntö (*Pyydä liittymistä* → *Pyyntö lähetetty*), ylläpitäjän *Liittymispyynnöt*: *Hyväksy* / *Hylkää*** | Kutsulinkit/-koodit (Q-02), ilmoitukset pyynnön käsittelystä |
| #11, #12 | – | Jäsenten arvostelut ryhmässä, viestit |

## Toteutus lyhyesti

- **Backend:** `api/routes/groupRouter.js`, `api/controllers/GroupController.js`, `api/models/Group.js`, `api/middleware/optionalAuth.js`. Rajapinta: [api.md, Ryhmät](api.md#ryhmät-apigroups).
- **Frontend:** `src/groups/` (`GroupsPage.jsx` = *Ryhmät / Omat ryhmät / Luo ryhmä / Julkiset ryhmät*, `GroupPage.jsx` = ryhmän sivu), ylävalikossa linkki **Ryhmät**.
- **Tietokanta:** säännöt (luoja ylläpitäjäksi, ylläpidon siirto, tyhjän ryhmän poisto) migraatioissa 002–003; migraatio **004** lisää yksityisen ryhmän nimen yksilöllisyyden ja taulun `group_join_requests` ([tietokanta.md, luku 5.4](tietokanta.md)).
- **Oikeudet:** käyttäjä tokenista; rooli luetaan tietokannasta samassa transaktiossa, jossa ryhmä on lukittu. Yksityinen ryhmä näkyy ulkopuolisille kuin sitä ei olisi (404).

## Esittely kahdella tilillä

Käytä kahta uutta esittelytiliä, esim. **A** ja **B** (kaksi selainta tai tavallinen + yksityinen ikkuna). Älä näytä salasanoja.

1. **A** kirjautuu → ylävalikko **Ryhmät** → *Omat ryhmät* on tyhjä.
2. **A** luo ryhmän *Scifi-ilta*, näkyvyys **Julkinen** → ryhmän sivulla "Roolisi: **Ylläpitäjä**".
3. **A** luo toisen ryhmän *Salainen*, näkyvyys **Yksityinen**.
4. **B** avaa **Ryhmät** → *Julkiset ryhmät* -listassa näkyy *Scifi-ilta*, mutta ei *Salainen*.
5. **B** avaa *Scifi-ilta* → **Liity ryhmään** → "Roolisi: **Jäsen**", jäseniä 2. B:llä ei ole ylläpitotyökaluja.
6. **B** yrittää avata *Salainen*-ryhmän suoralla osoitteella → "Ryhmää ei löytynyt".
7. **A** avaa *Salainen* → *Ylläpito* → kirjoittaa B:n nimimerkin → **Lisää** → B näkyy jäsenenä. (B voi nyt avata ryhmän.)
8. **A** avaa *Scifi-ilta* → **Poistu ryhmästä** → vahvistus kertoo, että ylläpito siirtyy → **Kyllä, poistu**.
9. **B** päivittää *Scifi-ilta*-sivun → "Roolisi: **Ylläpitäjä**" (pisimpään ollut jäsen).
10. **B** eroaa *Scifi-ilta*-ryhmästä ainoana jäsenenä → vahvistus kertoo, että ryhmä poistetaan → ryhmä katoaa listoista.

### Jatko: yksityiseen ryhmään liittymispyynnöllä

Jatka samoilla tileillä. (Jos edellinen kulku jäi väliin, A luo uuden yksityisen ryhmän, esim. *Leffakerho*.)

11. **A** luo yksityisen ryhmän *Leffakerho* ja vielä julkisen ryhmän samalla nimellä *Leffakerho* (sallittu).
12. **B** → **Ryhmät** → *Julkiset ryhmät*: haku *Leffakerho* näyttää vain julkisen ryhmän.
13. **B** → *Etsi yksityistä ryhmää*: *Leffa* → "Yksityistä ryhmää ei löytynyt". Koko nimi *LEFFAKERHO* → näkyy nimi,
    merkki **Yksityinen** ja **Pyydä liittymistä**.
14. **B** painaa **Pyydä liittymistä** → **Pyyntö lähetetty**. Suora osoite ryhmään näyttää yhä "Ryhmää ei löytynyt".
15. **A** avaa *Leffakerho* (yksityinen) → *Liittymispyynnöt* → B:n nimimerkki → **Hyväksy** → B näkyy jäsenissä roolilla **Jäsen**.
16. **B** → **Ryhmät** → *Omat ryhmät* näyttää *Leffakerho* roolilla **Jäsen**; haku näyttää nyt linkin **Avaa ryhmä**.

(Valinnainen: näytä myös **Hylkää** – B ei tule jäseneksi ja voi pyytää uudelleen.)

Varasuunnitelma: sama kulku paikallisesti (`docker compose up` tai `npm run dev` + backend).
