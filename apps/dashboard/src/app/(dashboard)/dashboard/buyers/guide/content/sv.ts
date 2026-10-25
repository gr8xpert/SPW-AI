import { p, steps, terms, tip, warn, type GuideTranslation } from '../guide-types';

// The Buyer Match guide in Swedish (du). Same sections and blocks as the
// English source in guide-basics.ts and guide-more.ts; button and tab names
// match buyers/_i18n/sv.ts.
export const sv: GuideTranslation = {
  what: {
    title: 'Vad är Buyer Match?',
    summary: 'En smart anteckningsbok för dina köpare som hittar rätt bostäder åt dem.',
    blocks: [
      p('Se Buyer Match som en anteckningsbok för alla som vill köpa (eller hyra) ett objekt av dig. För varje person skriver du ner vem de är och vad de letar efter.'),
      p('Sedan gör datorn det tråkiga jobbet. Den går igenom alla objekt på din webbplats och visar vilka som passar varje köpare. Du väljer de bästa och skickar dem med mejl med ett klick.'),
      p('Köparen får en privat webbsida med de objekten. Där kan de trycka ”gilla”, ”inte för mig” eller ”jag vill se det”. Du ser varje klick, så du vet vem som verkligen är intresserad.'),
      tip('Personer som fyller i ett formulär på din webbplats hamnar under Nya leads (vänstermenyn). Ge var och en en roll där, så kommer de med i dina Kontakter. Du behöver inte skriva in dem själv.'),
    ],
  },
  'quick-start': {
    title: 'Snabbstart i 5 steg',
    summary: 'Den kortaste vägen från en ny köpare till ett skickat mejl.',
    blocks: [
      steps(
        'Gå till fliken Kontakter och tryck på ”Ny kontakt”. Skriv ett namn och en e-postadress och tryck sedan på ”Lägg till kontakt”.',
        'Öppna köparen och gå till fliken Önskelista. Välj vad de vill ha: hyra eller köpa, orterna, typ av bostad och budgeten. Tryck på ”Spara önskelistan”.',
        'Öppna fliken Matchade. Nu ser du alla objekt som passar, de bästa högst upp.',
        'Bocka för de objekt du gillar och tryck på ”Skicka valda”. Kolla förhandsvisningen av mejlet och tryck på ”Skicka mejl”.',
        'Vänta på att köparen reagerar. Gillningar, avvisningar och önskemål om visning syns på köparen, under Aktivitet och på ”Min dag”.',
      ),
      tip('Be din chef fylla i Inställningar → Allmänt → ”Objektlänkar i mejl” innan ditt första mejl. Utan det kan mejlen inte länka till dina objektsidor.'),
    ],
  },
  words: {
    title: 'Ord du kommer att se',
    summary: 'En liten ordlista över orden i Buyer Match.',
    blocks: [
      terms(
        ['Köpare', 'Vem som helst i din lista. Det kan också vara en säljare, hyresvärd, hyresgäst eller en annan mäklare: ”Kontakttyp” visar vilket.'],
        ['Mäklare', 'Personen i ditt team som tar hand om köparen. ”Andra mäklare” är kollegor som hjälper till.'],
        ['Steg', 'Hur långt köparen har kommit, till exempel ”Ny”, ”Visning” eller ”Vunnen”. Stegen är kolumnerna på Tavla.'],
        ['Önskelista', 'Det köparen letar efter.'],
        ['Måsten', 'De fyra saker ett objekt måste matcha: annonstyp, område, objekttyp och budget.'],
        ['Önskemål', 'Sådant som är trevligt att ha, som sovrum, storlek, pool eller havsutsikt. De höjer poängen men döljer aldrig ett objekt.'],
        ['Poäng', 'En siffra som visar hur bra ett objekt passar. Högre är bättre.'],
        ['Het köpare', 'Någon som har varit mycket aktiv på sistone: gillningar, önskemål om visning, klick och förfrågningar.'],
        ['Köparsida', 'En privat webbsida för en köpare med alla objekt du har skickat till dem.'],
        ['Bevakning', 'Ett meddelande som väntar på ditt OK när ett nytt objekt eller en prissänkning passar en köpare.'],
      ),
    ],
  },
  list: {
    title: 'Listan Kontakter',
    summary: 'Hitta vilken köpare som helst snabbt med sökning, filter och sortering.',
    linkLabel: 'Öppna listan Kontakter',
    blocks: [
      p('Fliken Kontakter visar alla du kan se. Varje kort har namn, kontakttyp, e-post, mäklare, steg, stjärnor och när något hände senast.'),
      terms(
        ['Sök', 'Skriv en del av ett namn, en e-postadress eller ett telefonnummer.'],
        ['Filter', 'Visa bara en kontakttyp, en mäklare, ett steg, en prioritet, en källa eller ett svar på en av dina frågor. Tryck på ”Rensa” för att se alla igen.'],
        ['Heta köpare', 'Slå på det här för att bara se de mest aktiva köparna.'],
        ['Ingen aktivitet nyligen', 'Visar köpare som ingen har pratat med på ett tag, så att ingen blir bortglömd.'],
        ['Sortering', 'Sortera på senaste aktivitet, nyaste, namn eller prioritet.'],
        ['Kort / Lista', 'Två sätt att se samma köpare: stora kort eller en kompakt tabell.'],
        ['Exportera CSV', 'Chefer kan ladda ner listan (med dina filter) och öppna den i Excel.'],
      ),
      tip('Filtren sparas i webbadressen. Kopiera länken så ser en kollega exakt samma lista.'),
    ],
  },
  'new-buyer': {
    title: 'Lägga till en köpare',
    summary: 'För hand, från din webbplats, från Facebook-annonser eller från en Odoo-fil.',
    blocks: [
      terms(
        ['För hand', 'Tryck på ”Ny kontakt”, skriv namn och e-post, välj kontakttyp och mäklare. En e-postadress = en köpare, så du kan inte lägga till samma person två gånger.'],
        ['Från din webbplats', 'Förfrågningar, önskelisteformuläret och ”mejla mina favoriter” skapar eller uppdaterar en köpare av sig själva.'],
        ['Från Facebook- och Instagram-annonser', 'Leadformulär från dina annonser kommer in var 15:e minut när en chef har kopplat dem i Inställningar.'],
        ['Från Odoo', 'Chefer kan flytta över alla gamla köpare med fliken Import.'],
      ),
      p('Nya köpare från webbplatsen går till en mäklare, eller turas om mellan mäklarna (”round-robin”). En chef väljer det i Inställningar → Allmänt.'),
    ],
  },
  record: {
    title: 'En köpares kort',
    summary: 'Överst på sidan: typ, steg, stjärnor, mäklare, WhatsApp och Integritet.',
    blocks: [
      p('Klicka på en köpare för att öppna deras kort. Den översta delen syns alltid, vilken flik du än är på.'),
      terms(
        ['Kontakttyp', 'Köpare, säljare, hyresvärd, hyresgäst, yrkesperson med mera.'],
        ['Steg', 'Var köparen är i din process. Ändra det här eller dra kortet på Tavla.'],
        ['Prioritetsstjärnor', 'Ge 1 till 3 stjärnor till de köpare som är viktigast. Klicka på den sista tända stjärnan igen för att ta bort en stjärna.'],
        ['Mäklare och andra mäklare', 'Vem som tar hand om köparen, och vem mer som hjälper till.'],
        ['WhatsApp', 'Öppnar en WhatsApp-chatt med köparens telefonnummer.'],
        ['Integritet', 'Samtycke, avregistrering och radering. Se ”Integritet och radera en köpare” längre ner.'],
        ['Sammanfattning', 'Med AI påslaget: tre korta rader som berättar vem köparen är och vad de vill ha.'],
      ),
      p('Under den översta delen finns flikarna: Detaljer, Önskelista, Matchade, Nästan-träffar, Föreslagna, Kontakter, Interna anteckningar, Resor och visningar, Uppgifter, Filer, Aktivitet och Historik.'),
    ],
  },
  details: {
    title: 'Fliken Uppgifter',
    summary: 'Kontaktuppgifter, foto, dina egna frågor, ID och affärsinformation.',
    blocks: [
      terms(
        ['Kontakt', 'Namn, e-post, telefoner, språk, hur de vill bli kontaktade, adress och ett foto. Språket avgör vilket språk deras mejl skickas på.'],
        ['Foto', 'Tryck på ”Ladda upp foto” (JPG, PNG eller WebP) och sedan på ”Spara” på kortet.'],
        ['Frågor om köparen', 'Dina egna frågor, som ”Är det här ett fritidshus?”. Din chef skapar dem i Inställningar → Frågor. Du kan filtrera listan på svaren.'],
        ['Identitet och juridik', 'ID-typ och nummer och köparens advokat, för när en affär blir allvarlig.'],
        ['Pipeline', 'Understatus, affärsvärdet, sedan när du väntar på svar och vem som tipsade om köparen (med deras %).'],
      ),
      tip('Varje kort har sin egen Spara-knapp. Ändra det du behöver och tryck sedan på Spara på just det kortet.'),
    ],
  },
  wishlist: {
    title: 'Önskelista: vad köparen vill ha',
    summary: 'Måsten avgör om ett objekt passar. Önskemål avgör hur bra.',
    blocks: [
      p('Önskelistan är hjärtat i Buyer Match. Ju bättre du fyller i den, desto bättre matchningar.'),
      terms(
        ['Annonstyp', 'Andrahand, nyproduktion, långtidsuthyrning eller semesteruthyrning.'],
        ['Orter eller områden', 'Välj ett område så räknas alla orter i det också.'],
        ['Objekttyper', 'Välj ”Villa” så räknas alla sorters villor också.'],
        ['Budget', 'Från och till. Ett objekt utanför budgeten matchas aldrig.'],
        ['Sovrum, badrum, storlekar', 'Det minsta köparen vill ha.'],
        ['Egenskaper och önskemål', 'Pool, havsutsikt, garage och så vidare. De flyttar upp ett objekt; de döljer det aldrig.'],
        ['Skicka matchade objekt till', 'Köparen, mäklaren eller båda.'],
      ),
      warn('Måsten är strikta. Om du bara väljer en liten ort och en låg budget kanske du inte får några matchningar alls. Gör området eller budgeten lite större.'),
      tip('Om köparen kom från en förfrågan på webbplatsen kan önskelistan vara gissad utifrån objektet de frågade om. Kolla den, ändra den och tryck sedan på Spara.'),
    ],
  },
  matched: {
    title: 'Matchade och Nästan-träffar',
    summary: 'Objekten som passar, de bästa först, och de som nästan passar.',
    blocks: [
      p('Matchade visar alla objekt på webbplatsen som uppfyller alla måsten. Högst poäng står överst. Varje rad visar vilka önskemål den uppfyller.'),
      steps(
        'Bocka för de objekt du vill ha.',
        'Tryck på ”Skicka valda” för att mejla dem nu, eller ”Lägg till i Föreslagna” för att spara dem till senare.',
      ),
      p('Objekt som du redan har skickat, eller som köparen har avvisat, döljs så att inget skickas två gånger. Tryck på ”Visa alla” för att se dem igen.'),
      p('Nästan-träffar är objekt som missar bara ett måste med lite: till exempel 5 % över budgeten, eller i grannorten. Vid varje objekt står varför det missar. En chef bestämmer hur mycket ”lite” är.'),
    ],
  },
  suggested: {
    title: 'Föreslagna objekt',
    summary: 'Din handplockade kortlista för den här köparen.',
    blocks: [
      p('Föreslagna är din kortlista. Lägg till objekt från Matchade, eller skriv en referens som R1234567 och tryck på ”Lägg till”.'),
      terms(
        ['Status', 'Föreslaget, skickat, besökt, intresserad eller inte intresserad.'],
        ['Anteckning', 'En privat anteckning. Bara ditt team ser den.'],
        ['Länk till virtuell visning', 'En länk till en videovisning att skicka med.'],
        ['Besöksdatum', 'När köparen ska titta på objektet.'],
        ['Ladda ner PDF', 'En snygg PDF av kortlistan (eller bara de valda) att skriva ut eller bifoga.'],
        ['Tidslinje', 'För varje skickat objekt: skickat, öppnat, klickat, gillat, inte för mig, visning, bud.'],
      ),
      tip('Du kan själv markera vad som hänt, till exempel ”Visning” eller ”Bud”, när köparen berättade det i telefon.'),
    ],
  },
  sending: {
    title: 'Skicka objekt med mejl',
    summary: 'Ett mejl med din logga på köparens språk, med deras privata sida.',
    blocks: [
      steps(
        'Välj objekt i Matchade eller Föreslagna och tryck på ”Skicka valda”.',
        'Välj vem som ska få det: köparen, mäklaren eller båda.',
        'Välj språk och lägg till ett personligt meddelande om du vill (”Skriv med AI” kan skriva ett åt dig).',
        'Titta på förhandsvisningen och tryck sedan på ”Skicka mejl”.',
      ),
      p('Varje mejl har en länk till köparens privata sida. Där kan de gilla ett objekt, säga ”inte för mig” (med en anledning) eller be om en visning. Du får ett mejl när de gör det.'),
      p('Du kan stänga av sidan, skapa en ny länk (den gamla slutar fungera) eller kopiera länken från kortet ”Köparsida”.'),
      warn('”Öppnat” stämmer inte alltid: vissa e-postprogram öppnar bilder av sig själva. Ett klick eller en gillning är ett mycket bättre tecken.'),
    ],
  },
  ai: {
    title: 'AI-hjälp',
    summary: 'Låt AI läsa meddelanden, skriva anteckningar och hitta mönster. Du kollar alltid först.',
    blocks: [
      p('AI-hjälpen använder din byrås egen AI-nyckel (OpenRouter eller Anthropic) (Inställningar → AI). Inget som AI föreslår sparas förrän du trycker på Spara.'),
      terms(
        ['Klistra in ett meddelande', 'Klistra in ett mejl eller WhatsApp-meddelande från köparen. AI läser vad de vill ha och föreslår ändringar i önskelistan.'],
        ['Röstanteckning', 'Prata i upp till 30 sekunder efter ett samtal. AI skriver anteckningen åt dig. Inspelningen sparas inte.'],
        ['Regler från anteckningarna', 'Skriv i Interna anteckningar vad köparen kräver eller vägrar (”ingen bottenvåning”). AI gör regler av det. Ett objekt som bryter mot en regel får lägre poäng och en varning; det döljs aldrig.'],
        ['Sammanfattning', 'Tre korta rader om köparen överst på kortet.'],
        ['Vad feedbacken säger', 'Efter några gillningar och avvisningar visar AI mönster, som ”avvisade 4 bottenvåningar”, och erbjuder sig att lägga till en regel.'],
        ['Skriv med AI', 'En kort, vänlig inledning till ditt mejl.'],
      ),
      tip('Regler med ”Måste” sänker ett objekt som bryter mot dem med 40 poäng, regler med ”Föredrar” med 15.'),
    ],
  },
  'more-tabs': {
    title: 'Anteckningar, resor, uppgifter, filer och historik',
    summary: 'Allt annat du sparar om en köpare.',
    blocks: [
      terms(
        ['Kontakter', 'Andra inblandade personer: en partner, en familjemedlem eller en assistent, med telefon och e-post.'],
        ['Interna anteckningar', 'Fria anteckningar som bara ditt team ser. AI kan läsa dem för att skapa regler.'],
        ['Resor och visningar', 'Lägg till en resa när köparen besöker området och lägg sedan till visningar i den. Köparen kan få ett resschema med mejl eller som PDF, och mäklaren får en påminnelse före varje visning.'],
        ['Uppgifter', 'Saker att göra, som ”Ring tillbaka på fredag”, med en deadline och en person. Försenade uppgifter visas i rött.'],
        ['Filer', 'Bilder och PDF:er på upp till 20 MB, som en passkopia eller ett påskrivet bud.'],
        ['Aktivitet', 'En dagbok: samtal, mejl, visningar, besök på webbplatsen och bevakningar. Använd ”Logga aktivitet” för att lägga till ett samtal eller möte.'],
        ['Historik', 'Varje ändring på köparen: vem som ändrade vad, och när. Inget är ett mysterium.'],
      ),
      tip('Efter en visning: markera den som ”Klar” och skriv köparens feedback. Det hjälper nästa mäklare och AI:n.'),
    ],
  },
  'my-day': {
    title: 'Min dag och Att göra i dag',
    summary: 'Öppna de här först varje morgon.',
    linkLabel: 'Öppna Min dag',
    blocks: [
      p('”Min dag” är din morgonsida. Den visar din pipeline, försenade uppgifter, dagens uppgifter, visningar de närmaste 7 dagarna, köpare du väntar på, dina heta köpare och bevakningar att godkänna.'),
      p('”Att göra i dag” visar alla uppgifter som ska vara klara i dag (försenade först) och köpare som ingen har pratat med på ett tag.'),
      tip('Slå på ”Dagligt mejl med den här sammanfattningen” på Min dag, så kommer samma lista till din inkorg varje morgon.'),
    ],
  },
  board: {
    title: 'Tavlan',
    summary: 'Se alla köpare som kort i kolumner, en kolumn per steg.',
    linkLabel: 'Öppna Tavla',
    blocks: [
      p('Tavlan är som lappar på en vägg. Varje kolumn är ett steg. Dra en köpare från en kolumn till nästa när de kommer vidare.'),
      p('Filtren fungerar här också, så du kan titta på bara dina egna köpare eller bara de heta.'),
    ],
  },
  alerts: {
    title: 'Bevakningar: nya objekt och prissänkningar',
    summary: 'Systemet hittar nya matchningar åt dig. Du säger ja eller nej.',
    linkLabel: 'Öppna Bevakningar',
    blocks: [
      p('När ett nytt objekt kommer in, eller ett pris sänks, kollar systemet alla köpare. Om det passar någon väntar en bevakning på dig under fliken Bevakningar. Den röda siffran på fliken visar hur många.'),
      steps(
        'Öppna Bevakningar. Varje rad visar köparen, objektet och poängen.',
        'Tryck på ”Godkänn” för de bra och ”Avvisa” för resten. ”Godkänn alla” gör alla på en gång.',
        'Godkända bevakningar skickas, antingen direkt eller i ett dagligt mejl per köpare (din chef bestämmer).',
      ),
      warn('Inget skickas utan ditt OK. Om du aldrig godkänner får köparna aldrig några bevakningar.'),
    ],
  },
  reverse: {
    title: 'Köpare för det här objektet',
    summary: 'Utgå från ett objekt och hitta alla köpare som skulle gilla det.',
    blocks: [
      p('Öppna ett objekt under Objekt. Kortet ”Köpare för det här objektet” räknar alla köpare vars önskelista passar.'),
      p('Tryck på ”Se köpare” för att se vilka de är, och sedan ”Skicka till alla” eller skicka till dem du bockar för. Köpare som redan har fått objektet, eller avvisat det, hoppas över.'),
      tip('Perfekt för ett nytt objekt eller en prissänkning som du vill få ut snabbt.'),
    ],
  },
  reports: {
    title: 'Pipeline & intäkter',
    summary: 'Hur det går för byrån, i siffror och diagram.',
    linkLabel: 'Öppna Pipeline & intäkter',
    blocks: [
      terms(
        ['Nya köpare', 'Hur många som kom in, per månad och per källa (webbplats, telefon, Facebook…).'],
        ['Vunna och förlorade', 'Hur många köpare som köpte, och hur många du förlorade.'],
        ['Värde i öppen pipeline', 'Det totala affärsvärdet för köpare som fortfarande pågår.'],
        ['Väntade intäkter', 'Affärsvärdena gånger chansen för varje steg. En rimlig gissning av vad som är på väg.'],
        ['Säljtratt', 'Hur många nya köpare som nådde varje steg.'],
        ['Per mäklare', 'Leads, uppföljning, affärer, vunnet värde och konvertering per mäklare finns i Leadrapporten.'],
      ),
    ],
  },
  settings: {
    title: 'Inställningar',
    summary: 'Hur Buyer Match fungerar för hela din byrå.',
    linkLabel: 'Öppna Inställningar',
    blocks: [
      p('Bara byråns ägare eller en chef kan ändra de här. Mäklare kan titta.'),
      terms(
        ['Allmänt', 'Kan mäklarna se varandras köpare? Vem får nya köpare från webbplatsen? Efter hur många dagar är en köpare ”bortglömd”? Påminnelser om visningar, tiden för det dagliga mejlet, het-poängen, adressen för objektlänkar och adressen till köparsidan.'],
        ['Steg', 'Kolumnerna på din Tavla. Lägg till, byt namn, välj färg, ändra ordning och sätt chansen i % för varje steg. När du tar bort ett steg får du frågan vart köparna i det ska flyttas.'],
        ['Frågor', 'Dina egna frågor om köpare. Du kan också visa dem på önskelisteformuläret på webbplatsen och översätta dem.'],
        ['Matchningsvikter', 'Hur mycket varje önskemål räknas i poängen, från 0 (inte alls) till 10 (mycket). Du kan ge en egenskap, som havsutsikt, en egen vikt.'],
        ['Bevakningar och nästan-träffar', 'Slå på bevakningar, välj ”direkt” eller ”dagligt sammandrag” och hur stor en prissänkning måste vara. Bestäm hur mycket en nästan-träff får ligga över budgeten eller hur långt bort.'],
        ['Underhåll', 'Hitta möjliga dubbletter (samma telefon eller namn) och slå ihop dem. Sammanslagning behåller allt; inget går förlorat.'],
        ['Facebook och Instagram', 'Koppla dina leadformulär från annonser så att nya leads blir köpare var 15:e minut.'],
      ),
      warn('Fyll i ”Objektlänkar i mejl” först. Utan det kan mejlen inte länka till dina objektsidor.'),
    ],
  },
  import: {
    title: 'Importera från Odoo',
    summary: 'Flytta över dina gamla köpare från en exportfil från Odoo.',
    linkLabel: 'Öppna Import',
    blocks: [
      steps(
        'Exportera dina köpare från Odoo som en .xlsx-fil.',
        'Välj filen på fliken Import och tryck på ”Kontrollera filen”. Inget sparas än.',
        'Titta på ”Vad som händer”: nya köpare, uppdaterade köpare och värden som inte matchade.',
        'För varje värde som inte matchade (en mäklare, en ort…) väljer du vad det betyder i SPM, eller låter det stå som ”Behåll som anteckning”.',
        'Tryck på ”Importera”. Om du importerar samma fil igen uppdateras samma köpare; det blir aldrig kopior.',
      ),
    ],
  },
  privacy: {
    title: 'Integritet och radera en köpare',
    summary: 'Samtycke, avregistrering och radering av personuppgifter (GDPR).',
    blocks: [
      p('Varje köpare har en Integritet-knapp överst på sitt kort.'),
      terms(
        ['Registrera samtycke', 'Skriv ner att köparen gick med på att bli kontaktad, och hur (webbplats, telefon, personligen…).'],
        ['Avregistrera från objektmejl', 'Köparen får inga fler objektmejl eller bevakningar. Deras mäklare kan fortfarande höra av sig. Köparen kan också göra det själv via länken i vilket mejl som helst.'],
        ['Radera personuppgifter', 'För chefer. Tar bort namn, e-post, telefoner, adress, ID, anteckningar, filer och svar för gott, och köparen försvinner från dina listor. Bara anonyma siffror finns kvar för Pipeline & intäkter.'],
      ),
      steps(
        'Öppna köparen och tryck på ”Integritet”.',
        'Välj ”Radera personuppgifter…”.',
        'Skriv ERASE med versaler och tryck på ”Radera för gott”.',
      ),
      warn('Radering kan inte ångras. Om köparen bara är en dubblett, slå ihop dem i Inställningar → Underhåll i stället.'),
    ],
  },
  'who-sees': {
    title: 'Vem kan se och göra vad',
    summary: 'Mäklare, chefer och ägare.',
    blocks: [
      terms(
        ['Mäklare', 'Ser sina egna köpare (eller alla, om chefen tillåter det). Kan lägga till köpare, fylla i önskelistor, skicka mejl, godkänna bevakningar och lägga till uppgifter.'],
        ['Chefer och ägare', 'Ser alla köpare och får dessutom Pipeline & intäkter, Import, Exportera CSV, sammanslagning, radering och Inställningar.'],
      ),
      p('Personer som bara visas på webbplatsen eller i Buyer Match, utan inloggning, hanteras under Mäklare (vänstermenyn).'),
    ],
  },
  faq: {
    title: 'Vanliga frågor',
    summary: 'Snabba svar på de frågor vi hör oftast.',
    blocks: [
      terms(
        ['Varför visar Matchade ingenting?', 'Måstena är för snäva. Välj ett större område, fler objekttyper eller en bredare budget.'],
        ['Varför saknas ett objekt jag skickat i Matchade?', 'Skickade och avvisade objekt döljs så att ingen får dem två gånger. Tryck på ”Visa alla”.'],
        ['Mejlet har inga länkar till min webbplats.', 'En chef måste fylla i Inställningar → Allmänt → ”Objektlänkar i mejl”.'],
        ['AI-knapparna säger att jag behöver en nyckel.', 'Lägg till din AI-nyckel (OpenRouter eller Anthropic) i Inställningar → AI (ägare eller chef).'],
        ['Jag har lagt till samma person två gånger.', 'Använd Inställningar → Underhåll → Möjliga dubbletter och slå ihop dem.'],
        ['Hur tar jag bort en köpare?', 'Integritet → Radera personuppgifter (chefer). Köparen försvinner från dina listor för gott.'],
        ['En köpare säger att de får för många mejl.', 'Integritet → Avregistrera från objektmejl.'],
      ),
      tip('Fortfarande fast? Öppna ett ärende under Supportärenden och ange köparens nummer från webbadressen.'),
    ],
  },
};
