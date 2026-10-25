import { p, steps, terms, tip, warn, type GuideTranslation } from '../guide-types';

// Buyer Match -opas suomeksi. Samat osiot ja lohkot kuin englanninkielisessä
// lähteessä (guide-basics.ts ja guide-more.ts). Painikkeiden nimet ovat samat
// kuin buyers/_i18n/fi.ts-tiedostossa.
export const fi: GuideTranslation = {
  what: {
    title: 'Mikä on Buyer Match?',
    summary: 'Älykäs muistikirja ostajillesi, joka löytää heille sopivat kodit.',
    blocks: [
      p('Ajattele Buyer Matchia muistikirjana jokaisesta ihmisestä, joka haluaa ostaa (tai vuokrata) kohteen sinulta. Kirjaat jokaisesta, kuka hän on ja mitä hän etsii.'),
      p('Sitten tietokone tekee tylsän osan. Se käy läpi jokaisen verkkosivusi kohteen ja näyttää ne, jotka sopivat kullekin ostajalle. Valitset parhaat ja lähetät ne sähköpostilla yhdellä klikkauksella.'),
      p('Ostaja saa oman yksityisen verkkosivun, jossa kohteet ovat. Hän voi painaa ”tykkään”, ”ei minulle” tai ”haluan nähdä sen”. Näet jokaisen klikkauksen, joten tiedät, kuka on oikeasti kiinnostunut.'),
      tip('Verkkosivusi lomakkeen täyttäneet ihmiset tulevat kohtaan Uudet liidit (vasen valikko). Anna jokaiselle siellä rooli, niin hän siirtyy Yhteystietoihin. Sinun ei tarvitse kirjoittaa heitä itse.'),
    ],
  },
  'quick-start': {
    title: 'Pikaopas viidessä vaiheessa',
    summary: 'Lyhin tie uudesta ostajasta lähetettyyn sähköpostiin.',
    blocks: [
      steps(
        'Mene Yhteystiedot-välilehdelle ja paina ”Uusi yhteystieto”. Kirjoita nimi ja sähköpostiosoite ja paina sitten ”Lisää yhteystieto”.',
        'Avaa ostaja ja mene Toivelista-välilehdelle. Valitse, mitä hän haluaa: vuokrata vai ostaa, kaupungit, asunnon tyyppi ja budjetti. Paina ”Tallenna toivelista”.',
        'Avaa Sopivat-välilehti. Näet nyt kaikki sopivat kohteet, parhaat ylimpänä.',
        'Rastita kohteet, joista pidät, ja paina ”Lähetä valitut”. Tarkista sähköpostin esikatselu ja paina ”Lähetä sähköposti”.',
        'Odota ostajan reaktiota. Tykkäykset, hylkäykset ja esittelypyynnöt näkyvät ostajan tiedoissa, Toiminta-välilehdellä ja Oma päivä -sivulla.',
      ),
      tip('Pyydä ennen ensimmäistä sähköpostia esihenkilöäsi täyttämään Asetukset → Yleiset → ”Kohdelinkit sähköposteissa”. Ilman sitä sähköpostit eivät voi linkittää kohdesivuillesi.'),
    ],
  },
  words: {
    title: 'Sanoja, joita näet',
    summary: 'Pieni sanasto Buyer Matchin sanoista.',
    blocks: [
      terms(
        ['Ostaja', 'Kuka tahansa listallasi. Se voi olla myös myyjä, vuokranantaja, vuokralainen tai toinen välittäjä: ”Yhteystiedon tyyppi” kertoo kumpi.'],
        ['Välittäjä', 'Tiimisi jäsen, joka hoitaa tätä ostajaa. ”Muut välittäjät” ovat auttavia kollegoita.'],
        ['Vaihe', 'Kuinka pitkällä ostaja on, esimerkiksi ”Uusi”, ”Esittely” tai ”Voitettu”. Vaiheet ovat Taulun sarakkeet.'],
        ['Toivelista', 'Mitä ostaja etsii.'],
        ['Pakolliset', 'Neljä asiaa, joiden kohteen on täsmättävä: ilmoitustyyppi, alue, kohdetyyppi ja budjetti.'],
        ['Toiveet', 'Mukavat lisät, kuten makuuhuoneet, koko, uima-allas tai merinäköala. Ne nostavat pisteitä mutta eivät koskaan piilota kohdetta.'],
        ['Pisteet', 'Luku, joka kertoo, kuinka hyvin kohde sopii. Suurempi on parempi.'],
        ['Kuuma ostaja', 'Joku, joka on ollut viime aikoina hyvin aktiivinen: tykkäyksiä, esittelypyyntöjä, klikkauksia ja kyselyjä.'],
        ['Ostajan sivu', 'Yksityinen verkkosivu yhdelle ostajalle, jossa ovat kaikki hänelle lähettämäsi kohteet.'],
        ['Hälytys', 'Viesti, joka odottaa hyväksyntääsi, kun uusi kohde tai hinnanalennus sopii ostajalle.'],
      ),
    ],
  },
  list: {
    title: 'Yhteystiedot-lista',
    summary: 'Löydä kuka tahansa ostaja nopeasti haun, suodattimien ja lajittelun avulla.',
    linkLabel: 'Avaa Yhteystiedot-lista',
    blocks: [
      p('Yhteystiedot-välilehti näyttää kaikki, jotka saat nähdä. Jokaisessa kortissa on nimi, yhteystiedon tyyppi, sähköposti, välittäjä, vaihe, tähdet ja milloin viimeksi tapahtui jotain.'),
      terms(
        ['Haku', 'Kirjoita osa nimestä, sähköpostista tai puhelinnumerosta.'],
        ['Suodattimet', 'Näytä vain yksi yhteystiedon tyyppi, yksi välittäjä, yksi vaihe, prioriteetti, lähde tai vastaus johonkin kysymykseesi. Paina ”Tyhjennä”, niin näet taas kaikki.'],
        ['Kuumat ostajat', 'Kytke tämä päälle, niin näet vain aktiivisimmat ostajat.'],
        ['Ei viimeaikaista toimintaa', 'Näyttää ostajat, joille kukaan ei ole puhunut vähään aikaan, jotta ketään ei unohdeta.'],
        ['Lajittelu', 'Järjestä viimeisimmän toiminnan, uusimpien, nimen tai prioriteetin mukaan.'],
        ['Kortit / Lista', 'Kaksi tapaa katsoa samoja ostajia: isot kortit tai tiivis taulukko.'],
        ['Vie CSV', 'Esihenkilöt voivat ladata listan (suodattimineen) ja avata sen Excelissä.'],
      ),
      tip('Suodattimet pysyvät verkko-osoitteessa. Kopioi linkki, niin kollega näkee täsmälleen saman listan.'),
    ],
  },
  'new-buyer': {
    title: 'Ostajan lisääminen',
    summary: 'Käsin, verkkosivultasi, Facebook-mainoksista tai Odoo-tiedostosta.',
    blocks: [
      terms(
        ['Käsin', 'Paina ”Uusi yhteystieto”, kirjoita nimi ja sähköposti, valitse yhteystiedon tyyppi ja välittäjä. Yksi sähköpostiosoite = yksi ostaja, joten samaa ihmistä ei voi lisätä kahdesti.'],
        ['Verkkosivultasi', 'Kyselyt, toivelistalomake ja ”lähetä suosikkini sähköpostiin” luovat tai päivittävät ostajan itsestään.'],
        ['Facebook- ja Instagram-mainoksista', 'Mainostesi liidilomakkeet tulevat sisään 15 minuutin välein, kun esihenkilö on yhdistänyt ne Asetuksissa.'],
        ['Odoosta', 'Esihenkilöt voivat tuoda kaikki vanhat ostajansa Tuonti-välilehdellä.'],
      ),
      p('Uudet ostajat verkkosivulta menevät yhdelle välittäjälle tai vuorotellen välittäjien kesken (”round-robin”). Esihenkilö valitsee tämän kohdassa Asetukset → Yleiset.'),
    ],
  },
  record: {
    title: 'Ostajan tiedot',
    summary: 'Sivun yläosa: tyyppi, vaihe, tähdet, välittäjä, WhatsApp ja Tietosuoja.',
    blocks: [
      p('Klikkaa ostajaa avataksesi hänen tietonsa. Yläosa näkyy aina, millä välilehdellä tahansa oletkin.'),
      terms(
        ['Yhteystiedon tyyppi', 'Ostaja, myyjä, vuokranantaja, vuokralainen, ammattilainen ja muita.'],
        ['Vaihe', 'Missä kohtaa prosessiasi ostaja on. Vaihda se tässä tai vedä korttia Taululla.'],
        ['Prioriteettitähdet', 'Anna 1–3 tähteä tärkeimmille ostajille. Klikkaa viimeistä palavaa tähteä uudelleen, niin yksi tähti poistuu.'],
        ['Välittäjä ja muut välittäjät', 'Kuka hoitaa tätä ostajaa ja kuka muu auttaa.'],
        ['WhatsApp', 'Avaa WhatsApp-keskustelun ostajan puhelinnumeroon.'],
        ['Tietosuoja', 'Suostumus, tilauksen peruminen ja poistaminen. Katso alta ”Tietosuoja ja ostajan poistaminen”.'],
        ['Yhteenveto', 'Kun tekoäly on käytössä, kolme lyhyttä riviä siitä, kuka ostaja on ja mitä hän haluaa.'],
      ),
      p('Yläosan alla ovat välilehdet: Tiedot, Toivelista, Sopivat, Läheltä piti, Ehdotetut, Yhteyshenkilöt, Sisäiset muistiinpanot, Matkat ja esittelyt, Tehtävät, Tiedostot, Toiminta ja Historia.'),
    ],
  },
  details: {
    title: 'Tiedot-välilehti',
    summary: 'Yhteystiedot, kuva, omat kysymyksesi, henkilöllisyys ja kaupan tiedot.',
    blocks: [
      terms(
        ['Yhteystiedot', 'Nimi, sähköposti, puhelimet, kieli, miten hän haluaa, että häneen otetaan yhteyttä, osoite ja kuva. Kieli ratkaisee, millä kielellä hänen sähköpostinsa ovat.'],
        ['Kuva', 'Paina ”Lataa kuva” (JPG, PNG tai WebP) ja sitten kortin ”Tallenna”.'],
        ['Kysymykset ostajasta', 'Omat kysymyksesi, kuten ”Onko tämä kakkoskoti?”. Esihenkilösi tekee ne kohdassa Asetukset → Kysymykset. Voit suodattaa listaa vastausten mukaan.'],
        ['Henkilöllisyys ja juridiset tiedot', 'Henkilöllisyystodistuksen tyyppi ja numero sekä ostajan asianajaja, kun kauppa alkaa olla tosissaan.'],
        ['Myyntiputki', 'Alatila, kaupan arvo, mistä lähtien odotat vastausta ja kuka suositteli ostajaa (ja hänen prosenttinsa).'],
      ),
      tip('Jokaisella kortilla on oma Tallenna-painike. Muuta mitä tarvitset ja paina sitten sen kortin Tallenna.'),
    ],
  },
  wishlist: {
    title: 'Toivelista: mitä ostaja haluaa',
    summary: 'Pakolliset ratkaisevat, sopiiko kohde. Toiveet ratkaisevat, kuinka hyvin.',
    blocks: [
      p('Toivelista on Buyer Matchin sydän. Mitä paremmin täytät sen, sitä paremmat osumat saat.'),
      terms(
        ['Ilmoitustyyppi', 'Jälleenmyynti, uudiskohde, pitkäaikainen vuokra tai lomavuokra.'],
        ['Kaupungit tai alueet', 'Valitse alue, niin jokainen sen sisällä oleva kaupunki lasketaan mukaan.'],
        ['Kohdetyypit', 'Valitse ”Huvila”, niin kaikenlaiset huvilat lasketaan mukaan.'],
        ['Budjetti', 'Alkaen ja enintään. Budjetin ulkopuolinen kohde ei koskaan osu.'],
        ['Makuuhuoneet, kylpyhuoneet, koot', 'Vähintään se, mitä ostaja haluaa.'],
        ['Ominaisuudet ja toiveet', 'Uima-allas, merinäköala, autotalli ja niin edelleen. Ne nostavat kohdetta ylemmäs; ne eivät koskaan piilota sitä.'],
        ['Lähetä sopivat kohteet', 'Ostajalle, välittäjälle tai molemmille.'],
      ),
      warn('Pakolliset ovat tiukkoja. Jos valitset vain yhden pienen kaupungin ja pienen budjetin, et ehkä saa yhtään osumaa. Laajenna aluetta tai budjettia hieman.'),
      tip('Jos ostaja tuli verkkosivun kyselyn kautta, toivelista on ehkä arvattu kohteesta, jota hän kysyi. Tarkista se, muuta sitä ja paina sitten Tallenna.'),
    ],
  },
  matched: {
    title: 'Sopivat ja Läheltä piti',
    summary: 'Sopivat kohteet parhaat ensin, ja ne, jotka melkein sopivat.',
    blocks: [
      p('Sopivat näyttää jokaisen verkkosivun kohteen, joka täyttää kaikki pakolliset. Paras pistemäärä on ylimpänä. Jokainen rivi kertoo, mitkä toiveet se täyttää.'),
      steps(
        'Rastita haluamasi kohteet.',
        'Paina ”Lähetä valitut” lähettääksesi ne heti sähköpostilla, tai ”Lisää ehdotettuihin” säästääksesi ne myöhemmäksi.',
      ),
      p('Jo lähettämäsi tai ostajan hylkäämät kohteet on piilotettu, jotta mitään ei lähetetä kahdesti. Paina ”Näytä kaikki”, niin näet ne taas.'),
      p('Läheltä piti -kohteet jäävät vain vähän yhdestä pakollisesta: esimerkiksi 5 % yli budjetin tai naapurikaupungissa. Jokainen kertoo, miksi se ei osu. Esihenkilö päättää, kuinka paljon on ”vähän”.'),
    ],
  },
  suggested: {
    title: 'Ehdotetut kohteet',
    summary: 'Itse valitsemasi lyhytlista tälle ostajalle.',
    blocks: [
      p('Ehdotetut on lyhytlistasi. Lisää kohteita Sopivat-välilehdeltä, tai kirjoita viite, kuten R1234567, ja paina ”Lisää”.'),
      terms(
        ['Tila', 'Ehdotettu, lähetetty, käyty, kiinnostunut tai ei kiinnostunut.'],
        ['Muistiinpano', 'Yksityinen muistiinpano. Vain tiimisi näkee sen.'],
        ['Virtuaaliesittelyn linkki', 'Videoesittelyn linkki lähetettäväksi mukana.'],
        ['Käyntipäivä', 'Milloin ostaja näkee kohteen.'],
        ['Lataa PDF', 'Siisti PDF lyhytlistasta (tai vain rastitetuista) tulostettavaksi tai liitteeksi.'],
        ['Aikajana', 'Jokaiselle lähetetylle kohteelle: lähetetty, avattu, klikattu, tykätty, ei minulle, esittely, tarjous.'],
      ),
      tip('Voit merkitä tapahtuneen itse, esimerkiksi ”Esittely” tai ”Tarjous”, kun ostaja kertoi sen puhelimessa.'),
    ],
  },
  sending: {
    title: 'Kohteiden lähettäminen sähköpostilla',
    summary: 'Brändätty sähköposti ostajan kielellä ja hänen oma sivunsa.',
    blocks: [
      steps(
        'Valitse kohteet Sopivat- tai Ehdotetut-välilehdeltä ja paina ”Lähetä valitut”.',
        'Valitse vastaanottaja: ostaja, välittäjä tai molemmat.',
        'Valitse kieli ja lisää halutessasi henkilökohtainen viesti (”Kirjoita tekoälyllä” voi kirjoittaa sen puolestasi).',
        'Katso esikatselu ja paina sitten ”Lähetä sähköposti”.',
      ),
      p('Jokaisessa sähköpostissa on linkki ostajan omalle sivulle. Siellä hän voi tykätä kohteesta, sanoa ”ei minulle” (syyn kanssa) tai pyytää esittelyä. Saat sähköpostin, kun hän tekee niin.'),
      p('Voit kytkeä sivun pois päältä, tehdä uuden linkin (vanha lakkaa toimimasta) tai kopioida linkin ”Ostajan sivu” -kortilta.'),
      warn('”Avattu” ei aina pidä paikkaansa: jotkin sähköpostiohjelmat avaavat kuvat itsestään. Klikkaus tai tykkäys on paljon parempi merkki.'),
    ],
  },
  ai: {
    title: 'Tekoälyavustajat',
    summary: 'Anna tekoälyn lukea viestejä, kirjoittaa muistiinpanoja ja huomata toistuvia asioita. Sinä tarkistat aina ensin.',
    blocks: [
      p('Tekoälyavustajat käyttävät toimistosi omaa tekoälyavainta (OpenRouter tai Anthropic) (Asetukset → Tekoäly). Mitään tekoälyn ehdottamaa ei tallenneta ennen kuin painat Tallenna.'),
      terms(
        ['Liitä viesti', 'Liitä ostajan sähköposti tai WhatsApp-viesti. Tekoäly lukee, mitä hän haluaa, ja ehdottaa muutoksia toivelistaan.'],
        ['Ääniviesti', 'Puhu puhelun jälkeen enintään 30 sekuntia. Tekoäly kirjoittaa muistiinpanon puolestasi. Äänitettä ei säilytetä.'],
        ['Säännöt muistiinpanoista', 'Kirjoita Sisäisiin muistiinpanoihin, mitä ostaja vaatii tai mistä hän kieltäytyy (”ei pohjakerrosta”). Tekoäly tekee niistä sääntöjä. Sääntöä rikkova kohde saa pienemmät pisteet ja varoituksen; sitä ei koskaan piiloteta.'],
        ['Yhteenveto', 'Kolme lyhyttä riviä ostajasta tietojen yläosassa.'],
        ['Mitä palaute kertoo', 'Muutaman tykkäyksen ja hylkäyksen jälkeen tekoäly näyttää toistuvia asioita, kuten ”hylkäsi 4 pohjakerrosta”, ja tarjoutuu lisäämään säännön.'],
        ['Kirjoita tekoälyllä', 'Lyhyt, ystävällinen aloitusrivi sähköpostiisi.'],
      ),
      tip('”Pakollinen”-säännöt laskevat sääntöä rikkovaa kohdetta 40 pistettä, ”Toive”-säännöt 15 pistettä.'),
    ],
  },
  'more-tabs': {
    title: 'Muistiinpanot, matkat, tehtävät, tiedostot ja historia',
    summary: 'Kaikki muu, mitä pidät ostajasta tallessa.',
    blocks: [
      terms(
        ['Yhteyshenkilöt', 'Muut mukana olevat ihmiset: puoliso, perheenjäsen tai avustaja, puhelimineen ja sähköposteineen.'],
        ['Sisäiset muistiinpanot', 'Vapaita muistiinpanoja, jotka vain tiimisi näkee. Tekoäly voi lukea ne ja tehdä niistä sääntöjä.'],
        ['Matkat ja esittelyt', 'Lisää matka, kun ostaja käy alueella, ja lisää siihen esittelyjä. Ostaja voi saada matkaohjelman sähköpostilla tai PDF:nä, ja välittäjä saa muistutuksen ennen jokaista esittelyä.'],
        ['Tehtävät', 'Tehtäviä, kuten ”Soita takaisin perjantaina”, määräajan ja tekijän kanssa. Myöhässä olevat tehtävät näkyvät punaisella.'],
        ['Tiedostot', 'Kuvia ja PDF-tiedostoja enintään 20 Mt, kuten passin kopio tai allekirjoitettu tarjous.'],
        ['Toiminta', 'Päiväkirja: puhelut, sähköpostit, esittelyt, käynnit verkkosivulla ja hälytykset. Lisää puhelu tai tapaaminen painikkeella ”Kirjaa toiminta”.'],
        ['Historia', 'Jokainen ostajaan tehty muutos: kuka muutti mitä ja milloin. Mikään ei jää arvoitukseksi.'],
      ),
      tip('Merkitse esittely esittelyn jälkeen tilaan ”Tehty” ja kirjoita ostajan palaute. Se auttaa seuraavaa välittäjää ja tekoälyä.'),
    ],
  },
  'my-day': {
    title: 'Oma päivä ja Tänään tehtävää',
    summary: 'Avaa nämä ensimmäisenä joka aamu.',
    linkLabel: 'Avaa Oma päivä',
    blocks: [
      p('”Oma päivä” on aamusivusi. Se näyttää myyntiputkesi, myöhässä olevat tehtävät, tämän päivän tehtävät, seuraavan 7 päivän esittelyt, ostajat joiden vastausta odotat, kuumat ostajasi ja hyväksyttävät hälytykset.'),
      p('”Tänään tehtävää” listaa kaikki tänään erääntyvät tehtävät (myöhässä olevat ensin) ja ostajat, joille kukaan ei ole puhunut vähään aikaan.'),
      tip('Kytke Oma päivä -sivulla päälle ”Päivittäinen sähköposti tästä yhteenvedosta”, niin sama lista tulee sähköpostiisi joka aamu.'),
    ],
  },
  board: {
    title: 'Taulu',
    summary: 'Näe kaikki ostajat kortteina sarakkeissa, yksi sarake per vaihe.',
    linkLabel: 'Avaa Taulu',
    blocks: [
      p('Taulu on kuin muistilappuja seinällä. Jokainen sarake on vaihe. Vedä ostaja sarakkeesta seuraavaan, kun hän etenee.'),
      p('Suodattimet toimivat täälläkin, joten voit katsoa vain omia ostajiasi tai vain kuumia.'),
    ],
  },
  alerts: {
    title: 'Hälytykset: uudet kohteet ja hinnanalennukset',
    summary: 'Järjestelmä löytää uusia osumia puolestasi. Sinä sanot kyllä tai ei.',
    linkLabel: 'Avaa Hälytykset',
    blocks: [
      p('Kun uusi kohde tulee sisään tai hinta laskee, järjestelmä tarkistaa jokaisen ostajan. Jos kohde sopii jollekulle, hälytys odottaa sinua Hälytykset-välilehdellä. Välilehden punainen numero kertoo, kuinka monta niitä on.'),
      steps(
        'Avaa Hälytykset. Jokainen rivi näyttää ostajan, kohteen ja pisteet.',
        'Paina hyville ”Hyväksy” ja muille ”Hylkää”. ”Hyväksy kaikki” hoitaa kaikki kerralla.',
        'Hyväksytyt hälytykset lähetetään joko heti tai yhdessä päivittäisessä sähköpostissa per ostaja (esihenkilösi päättää).',
      ),
      warn('Mitään ei lähetetä ilman hyväksyntääsi. Jos et koskaan hyväksy, ostajat eivät koskaan saa hälytyksiä.'),
    ],
  },
  reverse: {
    title: 'Ostajat tälle kohteelle',
    summary: 'Aloita kohteesta ja löydä jokainen ostaja, joka pitäisi siitä.',
    blocks: [
      p('Avaa kohde Kohteet-sivulla. Kortti ”Ostajat tälle kohteelle” laskee jokaisen ostajan, jonka toivelistaan kohde sopii.'),
      p('Paina ”Näytä ostajat” nähdäksesi, keitä he ovat, ja sitten ”Lähetä kaikille” tai lähetä rastittamillesi. Ostajat, jotka ovat jo saaneet kohteen tai hylänneet sen, ohitetaan.'),
      tip('Erinomainen uudelle kohteelle tai hinnanalennukselle, jota haluat viedä nopeasti eteenpäin.'),
    ],
  },
  reports: {
    title: 'Myyntiputki ja tulot',
    summary: 'Miten toimistolla menee, lukuina ja kaavioina.',
    linkLabel: 'Avaa Myyntiputki ja tulot',
    blocks: [
      terms(
        ['Uudet ostajat', 'Kuinka monta tuli, kuukausittain ja lähteittäin (verkkosivu, puhelin, Facebook…).'],
        ['Voitetut ja menetetyt', 'Kuinka moni ostaja osti ja kuinka monta menetit.'],
        ['Avoimen myyntiputken arvo', 'Vielä kesken olevien ostajien kauppojen yhteisarvo.'],
        ['Odotetut tulot', 'Kauppojen arvot kerrottuna kunkin vaiheen todennäköisyydellä. Hyvä arvio siitä, mitä on tulossa.'],
        ['Myyntisuppilo', 'Kuinka moni uusi ostaja pääsi kuhunkin vaiheeseen.'],
        ['Välittäjittäin', 'Liidit, seuranta, kaupat, voitettu arvo ja konversio välittäjittäin ovat liidiraportissa.'],
      ),
    ],
  },
  settings: {
    title: 'Asetukset',
    summary: 'Miten Buyer Match toimii koko toimistollesi.',
    linkLabel: 'Avaa Asetukset',
    blocks: [
      p('Vain toimiston omistaja tai esihenkilö voi muuttaa näitä. Välittäjät voivat katsoa.'),
      terms(
        ['Yleiset', 'Näkevätkö välittäjät toistensa ostajat? Kuka saa uudet ostajat verkkosivulta? Monenko päivän jälkeen ostaja on ”unohdettu”? Esittelymuistutukset, päivittäisen sähköpostin aika, kuuman ostajan pisteraja, kohdelinkkien osoite ja ostajan sivun osoite.'],
        ['Vaiheet', 'Taulusi sarakkeet. Lisää, nimeä uudelleen, väritä, järjestä ja aseta kunkin todennäköisyys-%. Kun poistat vaiheen, sinulta kysytään, minne sen ostajat siirretään.'],
        ['Kysymykset', 'Omat kysymyksesi ostajista. Voit näyttää ne myös verkkosivun toivelistalomakkeella ja kääntää ne.'],
        ['Sopivuuden painot', 'Kuinka paljon kukin toive vaikuttaa pisteisiin, 0:sta (ei lainkaan) 10:een (paljon). Voit antaa yhdelle ominaisuudelle, kuten merinäköalalle, oman painon.'],
        ['Hälytykset ja läheltä piti -kohteet', 'Kytke hälytykset päälle, valitse ”heti” tai ”päivittäinen kooste” ja kuinka suuri hinnanalennuksen pitää olla. Aseta, kuinka paljon yli budjetin tai kuinka kaukana läheltä piti -kohde saa olla.'],
        ['Ylläpito', 'Etsi mahdolliset kaksoiskappaleet (sama puhelin tai nimi) ja yhdistä ne. Yhdistäminen säilyttää kaiken; mitään ei katoa.'],
        ['Facebook ja Instagram', 'Yhdistä mainostesi liidilomakkeet, niin uusista liideistä tulee ostajia 15 minuutin välein.'],
      ),
      warn('Täytä ensin ”Kohdelinkit sähköposteissa”. Ilman sitä sähköpostit eivät voi linkittää kohdesivuillesi.'),
    ],
  },
  import: {
    title: 'Tuo Odoosta',
    summary: 'Tuo vanhat ostajasi Odoon vientitiedostosta.',
    linkLabel: 'Avaa Tuonti',
    blocks: [
      steps(
        'Vie Odoossa ostajasi .xlsx-tiedostoksi.',
        'Valitse Tuonti-välilehdellä tiedosto ja paina ”Tarkista tiedosto”. Mitään ei vielä tallenneta.',
        'Katso kohta ”Mitä tapahtuu”: uudet ostajat, päivitetyt ostajat ja arvot, jotka eivät täsmänneet.',
        'Valitse jokaiselle täsmäämättömälle arvolle (välittäjä, kaupunki…), mitä se tarkoittaa SPM:ssä, tai jätä ”Säilytä muistiinpanona”.',
        'Paina ”Tuo”. Saman tiedoston tuominen uudelleen päivittää samat ostajat; se ei koskaan tee kopioita.',
      ),
    ],
  },
  privacy: {
    title: 'Tietosuoja ja ostajan poistaminen',
    summary: 'Suostumus, tilauksen peruminen ja henkilötietojen poistaminen (GDPR).',
    blocks: [
      p('Jokaisen ostajan tietojen yläosassa on Tietosuoja-painike.'),
      terms(
        ['Kirjaa suostumus', 'Kirjaa, että ostaja suostui yhteydenottoihin, ja miten (verkkosivu, puhelin, henkilökohtaisesti…).'],
        ['Peru kohdesähköpostien tilaus', 'Ostaja ei saa enää kohdesähköposteja eikä hälytyksiä. Hänen välittäjänsä voi silti ottaa yhteyttä. Ostaja voi tehdä tämän myös minkä tahansa sähköpostin linkistä.'],
        ['Poista henkilötiedot', 'Esihenkilöille. Poistaa nimen, sähköpostin, puhelimet, osoitteen, henkilöllisyystiedot, muistiinpanot, tiedostot ja vastaukset pysyvästi, ja ostaja katoaa listoiltasi. Vain anonyymit luvut jäävät Myyntiputki ja tulot -sivua varten.'],
      ),
      steps(
        'Avaa ostaja ja paina ”Tietosuoja”.',
        'Valitse ”Poista henkilötiedot…”.',
        'Kirjoita ERASE isoilla kirjaimilla ja paina ”Poista pysyvästi”.',
      ),
      warn('Poistoa ei voi perua. Jos ostaja on vain kaksoiskappale, yhdistä hänet sen sijaan kohdassa Asetukset → Ylläpito.'),
    ],
  },
  'who-sees': {
    title: 'Kuka näkee ja tekee mitä',
    summary: 'Välittäjät, esihenkilöt ja omistajat.',
    blocks: [
      terms(
        ['Välittäjät', 'Näkevät omat ostajansa (tai kaikki, jos esihenkilö sallii). Voivat lisätä ostajia, täyttää toivelistoja, lähettää sähköposteja, hyväksyä hälytyksiä ja lisätä tehtäviä.'],
        ['Esihenkilöt ja omistajat', 'Näkevät kaikki ostajat ja saavat lisäksi Myyntiputki ja tulot -sivun, Tuonnin, CSV-viennin, yhdistämisen, poistamisen ja Asetukset.'],
      ),
      p('Ihmisiä, jotka näkyvät vain verkkosivulla tai Buyer Matchissa ilman kirjautumista, hallitaan kohdassa Välittäjät (vasen valikko).'),
    ],
  },
  faq: {
    title: 'Usein kysyttyä',
    summary: 'Nopeat vastaukset kysymyksiin, joita kuulemme eniten.',
    blocks: [
      terms(
        ['Miksi Sopivat ei näytä mitään?', 'Pakolliset ovat liian tiukat. Valitse isompi alue, useampi kohdetyyppi tai laajempi budjetti.'],
        ['Miksi lähettämäni kohde puuttuu Sopivat-välilehdeltä?', 'Lähetetyt ja hylätyt kohteet piilotetaan, jotta kukaan ei saa niitä kahdesti. Paina ”Näytä kaikki”.'],
        ['Sähköpostissa ei ole linkkejä verkkosivulleni.', 'Esihenkilön on täytettävä Asetukset → Yleiset → ”Kohdelinkit sähköposteissa”.'],
        ['Tekoälypainikkeet sanovat, että tarvitsen avaimen.', 'Lisää tekoälyavaimesi (OpenRouter tai Anthropic) kohdassa Asetukset → Tekoäly (omistaja tai esihenkilö).'],
        ['Lisäsin saman ihmisen kahdesti.', 'Käytä kohtaa Asetukset → Ylläpito → Mahdolliset kaksoiskappaleet ja yhdistä heidät.'],
        ['Miten poistan ostajan?', 'Tietosuoja → Poista henkilötiedot (esihenkilöt). Ostaja poistuu listoiltasi pysyvästi.'],
        ['Ostaja sanoo saavansa liikaa sähköposteja.', 'Tietosuoja → Peru kohdesähköpostien tilaus.'],
      ),
      tip('Etkö vieläkään pääse eteenpäin? Avaa tukipyyntö kohdassa Tukipyynnöt ja kerro meille ostajan numero verkko-osoitteesta.'),
    ],
  },
};
