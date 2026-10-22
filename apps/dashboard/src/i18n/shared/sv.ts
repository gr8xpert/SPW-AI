import type { SharedText } from './en';

const loc = (n: number) => (n === 1 ? 'plats' : 'platser');
const typ = (n: number) => (n === 1 ? 'objekttyp' : 'objekttyper');

export const sv: SharedText = {
  bulkSeo: {
    button: 'Mass-SEO',
    running: (progress) => `SEO ${progress} %`,
    title: 'Skapa SEO med AI',
    description:
      'Fyller i sidtitel, metatitel, metabeskrivning och nyckelord för hela ditt utbud. Körs i bakgrunden på ditt OpenRouter-saldo.',
    languages: 'Språk',
    overwrite: 'Skriv över befintlig SEO',
    overwriteHelp:
      'Av: objekt som redan har SEO på ett språk hoppas över och kostar inget. På: allt skapas på nytt, även det som skrivits för hand.',
    schema: 'Skapa JSON-LD-schema',
    schemaHelp:
      'Ger ett extra AI-anrop per objekt. Behövs bara om du vill ha ett eget schema i stället för det som skapas automatiskt från objektets fält.',
    slug: 'Fyll i tomma slugs',
    slugHelp: 'Skriver bara en slug där det saknas en. Befintliga slugs är aktiva URL:er och skrivs aldrig om.',
    counting: 'Räknar objekt…',
    estimate: (properties) => `{properties} objekt · upp till {calls} AI-anrop`,
    fewerInPractice: '— färre i praktiken, eftersom objekt som redan har SEO hoppas över',
    cancel: 'Avbryt',
    start: 'Starta',
    pickLanguage: 'Välj minst ett språk',
    finishedWithErrors: 'Mass-SEO klar med fel',
    complete: 'Mass-SEO klar',
    summary: (generated, skipped, failed, total) =>
      `${generated} skapade, ${skipped} hade redan SEO, ${failed} misslyckades av ${total}.`,
    alreadyRunning: 'Mass-SEO körs redan',
    alreadyRunningText: 'Visar förloppet för den pågående körningen — ingen andra körning startades.',
    started: 'Mass-SEO startad',
    startedText: 'Körs i bakgrunden. Du kan lämna sidan — förloppet visas på knappen.',
    startFailed: 'Mass-SEO kunde inte starta',
    noJobId: 'Inget jobb-ID returnerades',
    unexpectedError: 'Oväntat fel',
  },
  setupTransfer: {
    button: 'Kopiera upplägg',
    menuHelp: (kind) =>
      kind === 'locations'
        ? 'Kopiera den här ordningen av platser till en annan kund. Bara platser som båda kunderna har ändras — inget läggs till eller tas bort.'
        : 'Kopiera den här ordningen av objekttyper till en annan kund. Bara objekttyper som båda kunderna har ändras — inget läggs till eller tas bort.',
    export: 'Exportera upplägg',
    import: 'Importera upplägg…',
    exported: 'Upplägg exporterat',
    exportedText: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} sparade. Importera filen i den andra kundens instrumentpanel.`,
    exportFailed: 'Det gick inte att exportera',
    tryAgain: 'Försök igen.',
    readFailed: 'Det gick inte att läsa filen',
    imported: 'Upplägg importerat',
    importedText: (changed, merged, kind) =>
      `${changed} ${kind === 'locations' ? loc(changed) : typ(changed)} uppdaterade${
        merged ? `, ${merged} ${merged === 1 ? 'dubblett' : 'dubbletter'} sammanslagna` : ''
      }. Din webbplats använder det nya upplägget.`,
    importFailed: 'Det gick inte att importera',
    dialogTitle: (kind) => (kind === 'locations' ? 'Importera upplägg för platser' : 'Importera upplägg för objekttyper'),
    found: (matched, total, changed, kind) =>
      `${matched} av dina ${total} ${kind === 'locations' ? 'platser' : 'objekttyper'} hittades i filen${
        changed > 0 ? `; ${changed} kommer att ändras.` : ' och stämmer redan med den.'
      }`,
    untouched: (n, kind) =>
      `${n} av dina ${kind === 'locations' ? 'platser' : 'objekttyper'} finns inte i filen och förblir som de är.`,
    notInAccount: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} i filen finns inte i det här kontot och läggs inte till`,
    example: (list) => `(t.ex. ${list})`,
    rows: {
      moved: 'Flyttade till en annan överordnad',
      renamed: 'Bytt namn',
      reordered: 'Ny ordning',
      aliases: 'Andra stavningar kopierade',
      coords: 'Kartpunkter kopierade',
      merged: 'Dubbletter sammanslagna till en',
      keptInPlace: 'Kvar under nuvarande överordnad (filens överordnade finns inte i det här kontot)',
      clashes: 'Inte flyttade (samma namn finns redan där)',
      ambiguous: 'Överhoppade (mer än en möjlig träff)',
    },
    cancel: 'Avbryt',
    apply: 'Verkställ',
  },
  sortOrder: {
    button: 'Sortera',
    help: 'Ersätter den nuvarande ordningen på alla nivåer. Dra rader för att finjustera. Din webbplats använder den här ordningen.',
    options: { name: 'A till Ö', 'name-desc': 'Ö till A', count: 'Flest objekt först' },
    sorted: (label) => `Sorterat: ${label}`,
    sortedText: 'Din webbplats visar den nya ordningen.',
    failed: 'Det gick inte att sortera',
    failedText: 'Inget ändrades. Försök igen.',
  },
  locked: {
    title: (feature) => `${feature} är låst`,
    description: (feature) =>
      `${feature} finns som betalt tillägg. Kontakta din kundansvarige för att aktivera det för den här kunden.`,
    viewPlans: 'Visa abonnemang',
    backToDashboard: 'Tillbaka till instrumentpanelen',
    checkFailed: 'Det gick inte att kontrollera ditt abonnemang.',
    tryAgain: 'Försök igen',
  },
  photo: {
    chooseImage: 'Välj en bild',
    chooseImageText: 'Fotot måste vara en JPG-, PNG- eller WebP-fil.',
    uploadFailed: 'Uppladdningen av fotot misslyckades',
    noAddress: 'Uppladdningen gav ingen adress.',
    uploading: 'Laddar upp…',
    change: 'Byt foto',
    upload: 'Ladda upp foto',
    remove: 'Ta bort foto',
    formats: 'JPG, PNG eller WebP',
  },
  weeklyReport: {
    title: 'Veckorapport',
    description:
      'Varje måndagsmorgon: förra veckans objektvisningar, sökningar och förfrågningar, de mest visade objekten, vad ditt flöde importerade och allt på din webbplats som behöver åtgärdas.',
    enabled: 'Skicka veckorapporten',
    sendTo: 'Skicka den till',
    remove: (email) => `Ta bort ${email}`,
    defaultRecipients: 'Kontots administratörer (lägg till adresser för att välja själv)',
    emailPlaceholder: 'namn@byra.se',
    add: 'Lägg till',
    save: 'Spara',
    preview: 'Förhandsgranska veckans rapport',
    sendToMe: 'Skicka den till mig nu',
    notEmail: 'Det är ingen e-postadress',
    saved: 'Inställningar för veckorapporten sparade',
    saveFailed: 'Det gick inte att spara',
    previewFailed: 'Det gick inte att skapa förhandsvisningen',
    sent: 'Rapporten skickad',
    sentText: (to) => (to ? `Kolla ${to}.` : 'Kolla din inkorg.'),
    sendFailed: 'Det gick inte att skicka',
    to: (list) => `Till: ${list}`,
    nobody: 'ingen ännu — lägg till en adress',
    frameTitle: 'Förhandsvisning av veckorapport',
  },
  impersonation: {
    session: 'Superadmin-session ·',
    viewingAs: 'Visar som',
    returnToAdmin: 'Tillbaka till admin',
    returned: 'Tillbaka i admin',
    returnedText: 'Du är tillbaka i din superadmin-session.',
  },
};
