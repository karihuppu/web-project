# Ryhmät: toteutus ja esittely

**Haara:** `feature/groups` (pohjana `origin/main` `277f45e`, jossa migraatio 003 on jo mukana)
**Tehtävä (opettaja):** "Alex — ryhmien luonti, jäsenten liittyminen, jäsenten käyttötasot (admin ja tavallinen käyttäjä), ryhmästä poistuminen".
**Tila:** valmis julkaisuun, testattu paikallisesti; **ei vielä tarkistettu Azuressa**.

## Mitä issueista katetaan

| Issue | Katettu tässä | Jäljellä |
| --- | --- | --- |
| **#7** Käyttäjä voi luoda julkisen tai yksityisen ryhmän, jossa voi lisätä ja poistaa henkilöitä | Ryhmän luonti (julkinen/yksityinen), luoja = ylläpitäjä; roolit *Ylläpitäjä*/*Jäsen*; ylläpitäjä lisää jäsenen nimimerkillä ja poistaa tavallisen jäsenen; eroaminen; ylläpito siirtyy, tyhjä ryhmä poistuu | Roolien vaihto käsin (useampi ylläpitäjä, Q-05), ryhmän nimen/kuvauksen muokkaus, ryhmän poisto ylläpitäjän toimesta |
| **#13** Käyttäjä voi hakea ryhmiä ja liittyä tai pyytää liittymistä | Julkisten ryhmien lista ja haku nimellä; liittyminen julkiseen ryhmään | Liittymispyyntö yksityiseen ryhmään ja ylläpitäjän hyväksyntä; kutsut (Q-02) |
| #11, #12 | – | Jäsenten arvostelut ryhmässä, viestit |

## Toteutus lyhyesti

- **Backend:** `api/routes/groupRouter.js`, `api/controllers/GroupController.js`, `api/models/Group.js`, `api/middleware/optionalAuth.js`. Rajapinta: [api.md, Ryhmät](api.md#ryhmät-apigroups).
- **Frontend:** `src/groups/` (`GroupsPage.jsx` = *Ryhmät / Omat ryhmät / Luo ryhmä / Julkiset ryhmät*, `GroupPage.jsx` = ryhmän sivu), ylävalikossa linkki **Ryhmät**.
- **Tietokanta:** ei uutta migraatiota. Säännöt (luoja ylläpitäjäksi, ylläpidon siirto, tyhjän ryhmän poisto) ovat migraatioissa 002–003, jotka ovat jo `main`issa.
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

Varasuunnitelma: sama kulku paikallisesti (`docker compose up` tai `npm run dev` + backend).
