import { p, steps, terms, tip, warn, type GuideTranslation } from '../guide-types';

// The Buyer Match guide in Dutch ("je"). Screen, tab and button names match
// buyers/_i18n/nl.ts and i18n/common/nl.ts.
export const nl: GuideTranslation = {
  what: {
    title: 'Wat is Buyer Match?',
    summary: 'Een slim notitieboek voor je kopers dat de juiste woningen voor ze vindt.',
    blocks: [
      p('Zie Buyer Match als een notitieboek voor iedereen die bij jou een woning wil kopen (of huren). Voor elke persoon schrijf je op wie het is en wat hij of zij zoekt.'),
      p('Daarna doet de computer het saaie werk. Hij bekijkt elke woning op je website en laat je zien welke bij elke koper passen. Jij kiest de beste en verstuurt ze met één klik per e-mail.'),
      p('De koper krijgt een eigen webpagina met die woningen. Daar kan hij op "leuk", "niets voor mij" of "ik wil het zien" drukken. Jij ziet elke klik, dus je weet wie echt interesse heeft.'),
      tip('Mensen die een formulier op je website invullen, komen binnen bij Nieuwe leads (linkermenu). Geef ze daar een rol en ze komen in je Contacten. Je hoeft ze niet zelf in te typen.'),
    ],
  },
  'quick-start': {
    title: 'Snelstart in 5 stappen',
    summary: 'De kortste weg van een nieuwe koper naar een verstuurde e-mail.',
    blocks: [
      steps(
        'Ga naar het tabblad Contacten en druk op "Nieuw contact". Typ een naam en een e-mailadres en druk op "Contact toevoegen".',
        'Open de koper en ga naar het tabblad Wensenlijst. Kies wat hij zoekt: huren of kopen, de plaatsen, het soort woning en het budget. Druk op "Wensenlijst opslaan".',
        'Open het tabblad Matches. Je ziet nu elke woning die past, de beste bovenaan.',
        'Vink de woningen aan die je goed vindt en druk op "Selectie versturen". Bekijk het voorbeeld van de e-mail en druk op "E-mail versturen".',
        'Wacht op de reactie van de koper. Leuk gevonden, afgewezen en verzoeken om een bezichtiging zie je bij de koper, in Activiteit en op "Mijn dag".',
      ),
      tip('Vraag je manager vóór je eerste e-mail om Instellingen → Algemeen → "Woninglinks in e-mails" in te vullen. Zonder dat kunnen de e-mails niet naar je woningpagina\'s linken.'),
    ],
  },
  words: {
    title: 'Woorden die je tegenkomt',
    summary: 'Een klein woordenboek van de woorden in Buyer Match.',
    blocks: [
      terms(
        ['Koper', 'Iedereen in je lijst. Het kan ook een verkoper, verhuurder, huurder of andere makelaar zijn: de "Soort contact" zegt welke.'],
        ['Makelaar', 'De persoon in je team die voor deze koper zorgt. "Betrokken makelaars" zijn collega\'s die helpen.'],
        ['Fase', 'Hoe ver de koper is, zoals "Nieuw", "Bezichtiging" of "Gewonnen". De fasen zijn de kolommen van het Bord.'],
        ['Wensenlijst', 'Wat de koper zoekt.'],
        ['Must-haves', 'De vier dingen waar een woning aan moet voldoen: soort aanbod, gebied, woningtype en budget.'],
        ['Wensen', 'Leuk-om-te-hebben, zoals slaapkamers, oppervlakte, zwembad of zeezicht. Ze verhogen de score maar verbergen nooit een woning.'],
        ['Score', 'Een getal dat laat zien hoe goed een woning past. Hoger is beter.'],
        ['Hete koper', 'Iemand die de laatste tijd heel actief was: leuk gevonden, bezichtigingen aangevraagd, geklikt en vragen gesteld.'],
        ['Koperspagina', 'Een eigen webpagina voor één koper met alle woningen die je hem stuurde.'],
        ['Melding', 'Een bericht dat op jouw OK wacht als een nieuwe woning of een prijsdaling bij een koper past.'],
      ),
    ],
  },
  list: {
    title: 'De lijst Contacten',
    summary: 'Vind elke koper snel met zoeken, filters en sorteren.',
    linkLabel: 'Open de lijst Contacten',
    blocks: [
      p('Het tabblad Contacten toont iedereen die jij mag zien. Elke kaart heeft de naam, soort contact, e-mail, makelaar, fase, sterren en wanneer er voor het laatst iets gebeurde.'),
      terms(
        ['Zoeken', 'Typ een deel van een naam, e-mailadres of telefoonnummer.'],
        ['Filters', 'Toon alleen één soort contact, één makelaar, één fase, een prioriteit, een bron of een antwoord op een van je vragen. Druk op "Wissen" om weer iedereen te zien.'],
        ['Hete kopers', 'Zet dit aan om alleen de meest actieve kopers te zien.'],
        ['Geen recente activiteit', 'Toont kopers met wie al een tijd niemand contact had, zodat niemand vergeten wordt.'],
        ['Sorteren', 'Op laatste activiteit, nieuwste, naam of prioriteit.'],
        ['Kaarten / Lijst', 'Twee manieren om dezelfde kopers te bekijken: grote kaarten of een compacte tabel.'],
        ['CSV exporteren', 'Managers kunnen de lijst (met je filters) downloaden en in Excel openen.'],
      ),
      tip('De filters staan in het webadres. Kopieer de link en een collega ziet precies dezelfde lijst.'),
    ],
  },
  'new-buyer': {
    title: 'Een koper toevoegen',
    summary: 'Met de hand, via je website, via Facebook-advertenties of uit een Odoo-bestand.',
    blocks: [
      terms(
        ['Met de hand', 'Druk op "Nieuw contact", typ de naam en het e-mailadres en kies de soort contact en de makelaar. Eén e-mailadres = één koper, dus je kunt dezelfde persoon niet twee keer toevoegen.'],
        ['Via je website', 'Vragen, het wensenlijstformulier en "mail mijn favorieten" maken vanzelf een koper aan of werken die bij.'],
        ['Via Facebook- en Instagram-advertenties', 'Leadformulieren van je advertenties komen elke 15 minuten binnen zodra een manager ze koppelt in Instellingen.'],
        ['Uit Odoo', 'Managers kunnen al hun oude kopers overzetten met het tabblad Importeren.'],
      ),
      p('Nieuwe kopers van de website gaan naar één makelaar, of om de beurt naar verschillende makelaars ("round-robin"). Een manager kiest dit in Instellingen → Algemeen.'),
    ],
  },
  record: {
    title: 'De kaart van een koper',
    summary: 'Het bovenste deel: soort, fase, sterren, makelaar, WhatsApp en Privacy.',
    blocks: [
      p('Klik op een koper om zijn kaart te openen. Het bovenste deel is altijd zichtbaar, op welk tabblad je ook bent.'),
      terms(
        ['Soort contact', 'Koper, verkoper, verhuurder, huurder, professional en meer.'],
        ['Fase', 'Waar de koper in je proces staat. Wijzig het hier of sleep de kaart op het Bord.'],
        ['Prioriteitssterren', 'Geef 1 tot 3 sterren aan de kopers die het meest tellen. Klik nog eens op de laatste gele ster om er één af te halen.'],
        ['Makelaar en betrokken makelaars', 'Wie voor deze koper zorgt, en wie er nog meer helpt.'],
        ['WhatsApp', 'Opent een WhatsApp-chat met het telefoonnummer van de koper.'],
        ['Privacy', 'Toestemming, afmelden en wissen. Zie "Privacy en een koper verwijderen" hieronder.'],
        ['Samenvatting', 'Met AI aan: drie korte regels over wie deze koper is en wat hij wil.'],
      ),
      p('Onder het bovenste deel staan de tabbladen: Gegevens, Wensenlijst, Matches, Bijna-matches, Voorgesteld, Contacten, Interne notities, Reizen & bezichtigingen, Taken, Bestanden, Activiteit en Geschiedenis.'),
    ],
  },
  details: {
    title: 'Tabblad Gegevens',
    summary: 'Contactgegevens, foto, je eigen vragen, identiteit en deal-informatie.',
    blocks: [
      terms(
        ['Contact', 'Naam, e-mail, telefoons, taal, hoe hij graag benaderd wordt, adres en een foto. De taal bepaalt in welke taal zijn e-mails zijn.'],
        ['Foto', 'Druk op "Foto uploaden" (JPG, PNG of WebP) en dan op "Opslaan" op de kaart.'],
        ['Vragen over de koper', 'Je eigen vragen, zoals "Is dit een tweede woning?". Je manager maakt ze in Instellingen → Vragen. Je kunt de lijst op de antwoorden filteren.'],
        ['Identiteit en juridisch', 'Soort en nummer van het identiteitsbewijs en de advocaat van de koper, voor als een verkoop serieus wordt.'],
        ['Pipeline', 'Substatus, de waarde van de deal, sinds wanneer je op antwoord wacht, en wie de koper aanbracht (met zijn %).'],
      ),
      tip('Elke kaart heeft een eigen knop Opslaan. Wijzig wat nodig is en druk dan op Opslaan op die kaart.'),
    ],
  },
  wishlist: {
    title: 'Wensenlijst: wat de koper wil',
    summary: 'Must-haves bepalen of een woning past. Wensen bepalen hoe goed.',
    blocks: [
      p('De wensenlijst is het hart van Buyer Match. Hoe beter je hem invult, hoe beter de matches.'),
      terms(
        ['Soort aanbod', 'Bestaande bouw, nieuwbouw, langdurige huur of vakantiehuur.'],
        ['Plaatsen of gebieden', 'Kies een gebied en elke plaats daarbinnen telt ook mee.'],
        ['Woningtypes', 'Kies "Villa" en elk soort villa telt ook mee.'],
        ['Budget', 'Van en tot. Een woning buiten het budget wordt nooit gematcht.'],
        ['Slaapkamers, badkamers, oppervlakte', 'Het minimum dat de koper wil.'],
        ['Kenmerken en wensen', 'Zwembad, zeezicht, garage enzovoort. Ze zetten een woning hoger; ze verbergen hem nooit.'],
        ['Passende woningen sturen naar', 'De koper, de makelaar of beide.'],
      ),
      warn('Must-haves zijn streng. Kies je maar één kleine plaats en een laag budget, dan krijg je misschien helemaal geen matches. Maak het gebied of het budget wat ruimer.'),
      tip('Kwam de koper via een vraag op de website, dan is de wensenlijst misschien geraden uit de woning waar hij naar vroeg. Controleer hem, pas hem aan en druk op Opslaan.'),
    ],
  },
  matched: {
    title: 'Matches en Bijna-matches',
    summary: 'De woningen die passen, de beste eerst, en de woningen die bijna passen.',
    blocks: [
      p('Matches toont elke woning van de website die aan alle must-haves voldoet. De beste score staat bovenaan. Op elke regel zie je aan welke wensen hij voldoet.'),
      steps(
        'Vink de woningen aan die je wilt.',
        'Druk op "Selectie versturen" om ze nu te mailen, of op "Toevoegen aan Voorgesteld" om ze te bewaren voor later.',
      ),
      p('Woningen die je al verstuurde, of die de koper afwees, worden verborgen zodat niets twee keer de deur uitgaat. Druk op "Alles tonen" om ze weer te zien.'),
      p('Bijna-matches zijn woningen die net één must-have missen: bijvoorbeeld 5% boven het budget, of in de plaats ernaast. Bij elke woning staat waarom. Een manager bepaalt hoe groot "net" is.'),
    ],
  },
  suggested: {
    title: 'Voorgestelde woningen',
    summary: 'Je eigen shortlist voor deze koper.',
    blocks: [
      p('Voorgesteld is je shortlist. Voeg woningen toe vanuit Matches, of typ een referentie zoals R1234567 en druk op "Toevoegen".'),
      terms(
        ['Status', 'Voorgesteld, verstuurd, bezocht, geïnteresseerd of niet geïnteresseerd.'],
        ['Notitie', 'Een privénotitie. Alleen je team ziet hem.'],
        ['Link naar virtuele bezichtiging', 'Een link naar een videotour om mee te sturen.'],
        ['Bezoekdatum', 'Wanneer de koper hem gaat zien.'],
        ['Pdf downloaden', 'Een nette pdf van de shortlist (of alleen de aangevinkte) om te printen of mee te sturen.'],
        ['Tijdlijn', 'Voor elke verstuurde woning: verstuurd, geopend, geklikt, leuk gevonden, niets voor mij, bezichtiging, bod.'],
      ),
      tip('Je kunt zelf aangeven wat er gebeurde, bijvoorbeeld "Bezichtiging" of "Bod", als de koper het je aan de telefoon vertelde.'),
    ],
  },
  sending: {
    title: 'Woningen per e-mail versturen',
    summary: 'Een e-mail in je eigen huisstijl, in de taal van de koper, met zijn eigen pagina.',
    blocks: [
      steps(
        'Selecteer woningen in Matches of Voorgesteld en druk op "Selectie versturen".',
        'Kies wie hem krijgt: de koper, de makelaar of beide.',
        'Kies de taal en voeg als je wilt een persoonlijk bericht toe ("Schrijven met AI" kan er een voor je schrijven).',
        'Bekijk het voorbeeld en druk op "E-mail versturen".',
      ),
      p('Elke e-mail heeft een link naar de eigen pagina van de koper. Daar kan hij een woning leuk vinden, "niets voor mij" zeggen (met een reden) of vragen om een bezichtiging. Jij krijgt dan een e-mail.'),
      p('Je kunt de pagina uitzetten, een nieuwe link maken (de oude werkt dan niet meer) of de link kopiëren van de kaart "Koperspagina".'),
      warn('"Geopend" klopt niet altijd: sommige mailprogramma\'s openen de plaatjes vanzelf. Een klik of een "leuk" zegt veel meer.'),
    ],
  },
  ai: {
    title: 'AI-hulpjes',
    summary: 'Laat AI berichten lezen, notities schrijven en patronen zien. Jij controleert altijd eerst.',
    blocks: [
      p('De AI-hulpjes gebruiken de eigen AI-sleutel (OpenRouter of Anthropic) van je kantoor (Instellingen → AI). Niets wat de AI voorstelt wordt opgeslagen tot je op Opslaan drukt.'),
      terms(
        ['Bericht plakken', 'Plak een e-mail of WhatsApp-bericht van de koper. AI leest wat hij wil en stelt wijzigingen in de wensenlijst voor.'],
        ['Spraaknotitie', 'Praat na een gesprek maximaal 30 seconden. AI schrijft de notitie voor je. De opname wordt niet bewaard.'],
        ['Regels uit de notities', 'Schrijf in Interne notities waar de koper op staat of wat hij weigert ("geen begane grond"). AI maakt er regels van. Een woning die een regel breekt krijgt een lagere score en een waarschuwing; hij wordt nooit verborgen.'],
        ['Samenvatting', 'Drie korte regels over de koper bovenaan de kaart.'],
        ['Wat de feedback zegt', 'Na een paar keer leuk en afgewezen toont AI patronen, zoals "4 keer begane grond afgewezen", en stelt voor om een regel toe te voegen.'],
        ['Schrijven met AI', 'Een korte, vriendelijke openingszin voor je e-mail.'],
      ),
      tip('Regels met "Moet" halen 40 punten af van een woning die ze breekt, regels met "Liever" 15.'),
    ],
  },
  'more-tabs': {
    title: 'Notities, reizen, taken, bestanden en geschiedenis',
    summary: 'Al het andere dat je over een koper bijhoudt.',
    blocks: [
      terms(
        ['Contacten', 'Andere betrokkenen: een partner, familielid of assistent, met hun telefoon en e-mail.'],
        ['Interne notities', 'Vrije notities die alleen je team ziet. AI kan ze lezen om regels te maken.'],
        ['Reizen & bezichtigingen', 'Voeg een reis toe als de koper naar de streek komt en voeg daar bezichtigingen aan toe. De koper kan een reisschema per e-mail of als pdf krijgen, en de makelaar krijgt vóór elke bezichtiging een herinnering.'],
        ['Taken', 'Dingen om te doen, zoals "Vrijdag terugbellen", met een deadline en een persoon. Te late taken staan in het rood.'],
        ['Bestanden', 'Foto\'s en pdf\'s tot 20 MB, zoals een kopie van een paspoort of een getekend bod.'],
        ['Activiteit', 'Een dagboek: gesprekken, e-mails, bezichtigingen, websitebezoeken en meldingen. Met "Activiteit vastleggen" voeg je een gesprek of afspraak toe.'],
        ['Geschiedenis', 'Elke wijziging aan de koper: wie wat wijzigde, en wanneer. Niets blijft een raadsel.'],
      ),
      tip('Zet een bezichtiging na afloop op "Gedaan" en schrijf de feedback van de koper op. Dat helpt de volgende makelaar en de AI.'),
    ],
  },
  'my-day': {
    title: 'Mijn dag en Vandaag te doen',
    summary: 'Open deze elke ochtend als eerste.',
    linkLabel: 'Open Mijn dag',
    blocks: [
      p('"Mijn dag" is je ochtendpagina. Je ziet je pipeline, te late taken, taken voor vandaag, bezichtigingen in de komende 7 dagen, kopers op wie je wacht, je hete kopers en meldingen om goed te keuren.'),
      p('"Vandaag te doen" toont elke taak voor vandaag (te late eerst) en kopers met wie al een tijd niemand contact had.'),
      tip('Zet "Dagelijkse e-mail met dit overzicht" aan op Mijn dag en je krijgt dezelfde lijst elke ochtend in je inbox.'),
    ],
  },
  board: {
    title: 'Het Bord',
    summary: 'Zie alle kopers als kaarten in kolommen, één kolom per fase.',
    linkLabel: 'Open het Bord',
    blocks: [
      p('Het Bord is als memobriefjes op een muur. Elke kolom is een fase. Sleep een koper naar de volgende kolom als hij een stap verder is.'),
      p('De filters werken hier ook, dus je kunt alleen je eigen kopers of alleen de hete bekijken.'),
    ],
  },
  alerts: {
    title: 'Meldingen: nieuwe woningen en prijsdalingen',
    summary: 'Het systeem vindt nieuwe matches voor je. Jij zegt ja of nee.',
    linkLabel: 'Open Meldingen',
    blocks: [
      p('Als er een nieuwe woning binnenkomt, of een prijs omlaag gaat, controleert het systeem elke koper. Past hij bij iemand, dan wacht er een melding op je in het tabblad Meldingen. Het rode getal op het tabblad zegt hoeveel.'),
      steps(
        'Open Meldingen. Op elke regel zie je de koper, de woning en de score.',
        'Druk op "Goedkeuren" voor de goede en op "Afwijzen" voor de rest. "Alle … goedkeuren" doet ze allemaal tegelijk.',
        'Goedgekeurde meldingen worden verstuurd, meteen of in één dagelijkse e-mail per koper (dat kiest je manager).',
      ),
      warn('Niets wordt verstuurd zonder jouw OK. Keur je nooit iets goed, dan krijgen kopers nooit meldingen.'),
    ],
  },
  reverse: {
    title: 'Kopers voor deze woning',
    summary: 'Begin bij een woning en vind elke koper die hem leuk zou vinden.',
    blocks: [
      p('Open een woning in Woningen. De kaart "Kopers voor deze woning" telt elke koper bij wiens wensenlijst hij past.'),
      p('Druk op "Kopers bekijken" om te zien wie het zijn, en dan op "Naar iedereen versturen" of verstuur naar de kopers die je aanvinkt. Kopers die hem al kregen, of hem afwezen, worden overgeslagen.'),
      tip('Handig voor een nieuwe woning of een prijsdaling die je snel wilt promoten.'),
    ],
  },
  reports: {
    title: 'Pijplijn & omzet',
    summary: 'Hoe het kantoor ervoor staat, in cijfers en grafieken.',
    linkLabel: 'Open Pijplijn & omzet',
    blocks: [
      terms(
        ['Nieuwe kopers', 'Hoeveel er binnenkwamen, per maand en per bron (website, telefoon, Facebook…).'],
        ['Gewonnen en verloren', 'Hoeveel kopers kochten, en hoeveel je verloor.'],
        ['Open pipelinewaarde', 'De totale dealwaarde van kopers die nog lopen.'],
        ['Verwachte omzet', 'Dealwaarden maal de kans van elke fase. Een redelijke schatting van wat er aankomt.'],
        ['Pipeline-trechter', 'Hoeveel nieuwe kopers elke fase bereikten.'],
        ['Per makelaar', 'Leads, opvolging, gewonnen deals, gewonnen waarde en conversie per makelaar staan in het Leadrapport.'],
      ),
    ],
  },
  settings: {
    title: 'Instellingen',
    summary: 'Hoe Buyer Match werkt voor je hele kantoor.',
    linkLabel: 'Open Instellingen',
    blocks: [
      p('Alleen de eigenaar van het kantoor of een manager kan dit wijzigen. Makelaars kunnen meekijken.'),
      terms(
        ['Algemeen', 'Zien makelaars elkaars kopers? Wie krijgt nieuwe kopers van de website? Na hoeveel dagen is een koper "vergeten"? Herinneringen voor bezichtigingen, de tijd van de dagelijkse e-mail, de hete score, het adres voor woninglinks en het adres van de koperspagina.'],
        ['Fasen', 'De kolommen van je Bord. Toevoegen, hernoemen, een kleur geven, de volgorde wijzigen en de kans in % van elke fase instellen. Verwijder je een fase, dan wordt gevraagd waar de kopers heen moeten.'],
        ['Vragen', 'Je eigen vragen over kopers. Je kunt ze ook op het wensenlijstformulier van de website tonen, en ze vertalen.'],
        ['Matchgewichten', 'Hoeveel elke wens meetelt in de score, van 0 (helemaal niet) tot 10 (heel veel). Je kunt één kenmerk, zoals zeezicht, een eigen gewicht geven.'],
        ['Meldingen & bijna-matches', 'Zet meldingen aan, kies "meteen" of "dagelijks overzicht" en hoe groot een prijsdaling moet zijn. Stel in hoeveel een bijna-match boven het budget of hoe ver weg mag zijn.'],
        ['Onderhoud', 'Vind mogelijke dubbele kopers (zelfde telefoon of naam) en voeg ze samen. Samenvoegen bewaart alles; er gaat niets verloren.'],
        ['Facebook & Instagram', 'Koppel de leadformulieren van je advertenties zodat nieuwe leads elke 15 minuten kopers worden.'],
      ),
      warn('Vul eerst "Woninglinks in e-mails" in. Zonder dat kunnen e-mails niet naar je woningpagina\'s linken.'),
    ],
  },
  import: {
    title: 'Importeren uit Odoo',
    summary: 'Zet je oude kopers over uit een exportbestand van Odoo.',
    linkLabel: 'Open Importeren',
    blocks: [
      steps(
        'Exporteer in Odoo je kopers als .xlsx-bestand.',
        'Kies op het tabblad Importeren het bestand en druk op "Bestand controleren". Er wordt nog niets opgeslagen.',
        'Bekijk "Wat er gaat gebeuren": nieuwe kopers, bijgewerkte kopers en waarden die niet pasten.',
        'Kies voor elke waarde die niet paste (een makelaar, een plaats…) wat die in SPM betekent, of laat "Als notitie bewaren" staan.',
        'Druk op de knop "… kopers importeren". Importeer je hetzelfde bestand nog eens, dan worden dezelfde kopers bijgewerkt; er komen nooit kopieën.',
      ),
    ],
  },
  privacy: {
    title: 'Privacy en een koper verwijderen',
    summary: 'Toestemming, afmelden en persoonsgegevens wissen (AVG).',
    blocks: [
      p('Elke koper heeft een knop Privacy bovenaan zijn kaart.'),
      terms(
        ['Toestemming vastleggen', 'Noteer dat de koper akkoord ging met contact, en hoe (website, telefoon, persoonlijk…).'],
        ['Afmelden voor woningmails', 'De koper krijgt geen woningmails of meldingen meer. Zijn makelaar wel. De koper kan dit ook zelf doen via de link in elke e-mail.'],
        ['Persoonsgegevens wissen', 'Voor managers. Haalt de naam, e-mail, telefoons, adres, identiteit, notities, bestanden en antwoorden voorgoed weg, en de koper verdwijnt uit je lijsten. Alleen anonieme cijfers blijven voor Pijplijn & omzet.'],
      ),
      steps(
        'Open de koper en druk op "Privacy".',
        'Kies "Persoonsgegevens wissen…".',
        'Typ ERASE in hoofdletters en druk op "Definitief wissen".',
      ),
      warn('Wissen kan niet ongedaan worden. Is de koper alleen een dubbele, voeg ze dan samen in Instellingen → Onderhoud.'),
    ],
  },
  'who-sees': {
    title: 'Wie wat kan zien en doen',
    summary: 'Makelaars, managers en eigenaren.',
    blocks: [
      terms(
        ['Makelaars', 'Zien hun eigen kopers (of iedereen, als de manager dat toestaat). Kunnen kopers toevoegen, wensenlijsten invullen, e-mails versturen, meldingen goedkeuren en taken toevoegen.'],
        ['Managers en eigenaren', 'Zien elke koper, en hebben ook Pijplijn & omzet, Importeren, CSV exporteren, samenvoegen, wissen en de Instellingen.'],
      ),
      p('Mensen die alleen op de website of in Buyer Match staan, zonder login, beheer je onder Makelaars (linkermenu).'),
    ],
  },
  faq: {
    title: 'Veelgestelde vragen',
    summary: 'Snelle antwoorden op de vragen die we het vaakst horen.',
    blocks: [
      terms(
        ['Waarom toont Matches niets?', 'De must-haves zijn te streng. Kies een groter gebied, meer woningtypes of een ruimer budget.'],
        ['Waarom staat een woning die ik stuurde niet meer in Matches?', 'Verstuurde en afgewezen woningen worden verborgen zodat niemand ze twee keer krijgt. Druk op "Alles tonen".'],
        ['De e-mail heeft geen links naar mijn website.', 'Een manager moet Instellingen → Algemeen → "Woninglinks in e-mails" invullen.'],
        ['De AI-knoppen zeggen dat ik een sleutel nodig heb.', 'Voeg je AI-sleutel (OpenRouter of Anthropic) toe in Instellingen → AI (eigenaar of manager).'],
        ['Ik heb dezelfde persoon twee keer toegevoegd.', 'Gebruik Instellingen → Onderhoud → Mogelijke dubbele en voeg ze samen.'],
        ['Hoe verwijder ik een koper?', 'Privacy → Persoonsgegevens wissen (managers). De koper verdwijnt voorgoed uit je lijsten.'],
        ['Een koper zegt dat hij te veel e-mails krijgt.', 'Privacy → Afmelden voor woningmails.'],
      ),
      tip('Kom je er niet uit? Open een ticket bij Supporttickets en geef ons het nummer van de koper uit het webadres.'),
    ],
  },
};
