import type { SharedText } from './en';

const loc = (n: number) => (n === 1 ? 'locatie' : 'locaties');
const typ = (n: number) => (n === 1 ? 'woningtype' : 'woningtypes');

export const nl: SharedText = {
  bulkSeo: {
    button: 'Bulk-SEO',
    running: (progress) => `SEO ${progress}%`,
    title: 'SEO genereren met AI',
    description:
      'Vult paginatitel, metatitel, metabeschrijving en zoekwoorden in voor je hele aanbod. Draait op de achtergrond op je AI-tegoed.',
    languages: 'Talen',
    overwrite: 'Bestaande SEO overschrijven',
    overwriteHelp:
      'Uit: woningen die al SEO in een taal hebben worden overgeslagen en kosten niets. Aan: alles wordt opnieuw gegenereerd, ook wat met de hand is geschreven.',
    schema: 'JSON-LD-schema genereren',
    schemaHelp:
      'Kost één extra AI-aanroep per woning. Alleen nodig als je een eigen schema wilt in plaats van het schema dat automatisch uit de velden van de woning wordt gemaakt.',
    slug: 'Lege slugs invullen',
    slugHelp: 'Schrijft alleen een slug waar er nog geen is. Bestaande slugs zijn live URL’s en worden nooit herschreven.',
    counting: 'Woningen tellen…',
    estimate: (properties) => `{properties} ${properties === 1 ? 'woning' : 'woningen'} · tot {calls} AI-aanroepen`,
    fewerInPractice: '— in de praktijk minder, want woningen die al SEO hebben worden overgeslagen',
    cancel: 'Annuleren',
    start: 'Starten',
    pickLanguage: 'Kies minstens één taal',
    finishedWithErrors: 'Bulk-SEO klaar met fouten',
    complete: 'Bulk-SEO klaar',
    summary: (generated, skipped, failed, total) =>
      `${generated} gegenereerd, ${skipped} hadden al SEO, ${failed} mislukt van ${total}.`,
    alreadyRunning: 'Bulk-SEO draait al',
    alreadyRunningText: 'Je ziet de voortgang van de lopende run — er is geen tweede run gestart.',
    started: 'Bulk-SEO gestart',
    startedText: 'Draait op de achtergrond. Je kunt deze pagina verlaten — de voortgang staat op de knop.',
    startFailed: 'Bulk-SEO kon niet starten',
    noJobId: 'Geen taak-ID ontvangen',
    unexpectedError: 'Onverwachte fout',
  },
  setupTransfer: {
    button: 'Opzet kopiëren',
    menuHelp: (kind) =>
      kind === 'locations'
        ? 'Kopieer deze indeling van locaties naar een andere klant. Alleen locaties die beide klanten hebben worden gewijzigd — er wordt niets toegevoegd of verwijderd.'
        : 'Kopieer deze indeling van woningtypes naar een andere klant. Alleen woningtypes die beide klanten hebben worden gewijzigd — er wordt niets toegevoegd of verwijderd.',
    export: 'Opzet exporteren',
    import: 'Opzet importeren…',
    exported: 'Opzet geëxporteerd',
    exportedText: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} opgeslagen. Importeer het bestand in het dashboard van de andere klant.`,
    exportFailed: 'Exporteren is mislukt',
    tryAgain: 'Probeer het opnieuw.',
    readFailed: 'Het bestand kon niet worden gelezen',
    imported: 'Opzet geïmporteerd',
    importedText: (changed, merged, kind) =>
      `${changed} ${kind === 'locations' ? loc(changed) : typ(changed)} bijgewerkt${
        merged ? `, ${merged} dubbele samengevoegd` : ''
      }. Je website gebruikt de nieuwe opzet.`,
    importFailed: 'Importeren is mislukt',
    dialogTitle: (kind) => (kind === 'locations' ? 'Opzet van locaties importeren' : 'Opzet van woningtypes importeren'),
    found: (matched, total, changed, kind) =>
      `${matched} van je ${total} ${kind === 'locations' ? 'locaties' : 'woningtypes'} staan in het bestand${
        changed > 0 ? `; ${changed} worden gewijzigd.` : ' en komen er al mee overeen.'
      }`,
    untouched: (n, kind) =>
      `${n} van je ${kind === 'locations' ? 'locaties' : 'woningtypes'} ${n === 1 ? 'staat' : 'staan'} niet in het bestand en ${n === 1 ? 'blijft' : 'blijven'} zoals ze zijn.`,
    notInAccount: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} in het bestand ${n === 1 ? 'bestaat' : 'bestaan'} niet in dit account en ${n === 1 ? 'wordt' : 'worden'} niet toegevoegd`,
    example: (list) => `(bijv. ${list})`,
    rows: {
      moved: 'Verplaatst naar een andere bovenliggende',
      renamed: 'Hernoemd',
      reordered: 'Nieuwe volgorde',
      aliases: 'Andere spellingen gekopieerd',
      coords: 'Kaartpunten gekopieerd',
      merged: 'Dubbele samengevoegd tot één',
      keptInPlace: 'Onder huidige bovenliggende gelaten (bovenliggende uit het bestand bestaat niet in dit account)',
      clashes: 'Niet verplaatst (zelfde naam staat er al)',
      ambiguous: 'Overgeslagen (meer dan één mogelijke match)',
    },
    cancel: 'Annuleren',
    apply: 'Toepassen',
  },
  sortOrder: {
    button: 'Sorteren',
    help: 'Vervangt de huidige volgorde op elk niveau. Sleep rijen om bij te stellen. Je website gebruikt deze volgorde.',
    options: { name: 'A tot Z', 'name-desc': 'Z tot A', count: 'Meeste woningen eerst' },
    sorted: (label) => `Gesorteerd: ${label}`,
    sortedText: 'Je website toont de nieuwe volgorde.',
    failed: 'Sorteren is mislukt',
    failedText: 'Er is niets gewijzigd. Probeer het opnieuw.',
  },
  locked: {
    title: (feature) => `${feature} is vergrendeld`,
    description: (feature) =>
      `${feature} is beschikbaar als betaalde add-on. Neem contact op met je accountmanager om het voor deze klant aan te zetten.`,
    viewPlans: 'Abonnementen bekijken',
    backToDashboard: 'Terug naar dashboard',
    checkFailed: 'Je abonnement kon niet worden gecontroleerd.',
    tryAgain: 'Opnieuw proberen',
  },
  photo: {
    chooseImage: 'Kies een afbeelding',
    chooseImageText: 'De foto moet een JPG-, PNG- of WebP-bestand zijn.',
    uploadFailed: 'Foto uploaden mislukt',
    noAddress: 'De upload gaf geen adres terug.',
    uploading: 'Uploaden…',
    change: 'Foto wijzigen',
    upload: 'Foto uploaden',
    remove: 'Foto verwijderen',
    formats: 'JPG, PNG of WebP',
  },
  weeklyReport: {
    title: 'Weekrapport',
    description:
      'Elke maandagochtend: de woningweergaven, zoekopdrachten en aanvragen van vorige week, de meest bekeken woningen, wat je feed heeft geïmporteerd en alles op je website dat aandacht nodig heeft.',
    enabled: 'Het weekrapport versturen',
    sendTo: 'Versturen naar',
    remove: (email) => `${email} verwijderen`,
    defaultRecipients: 'De beheerders van je account (voeg adressen toe om zelf te kiezen)',
    emailPlaceholder: 'naam@kantoor.nl',
    add: 'Toevoegen',
    save: 'Opslaan',
    preview: 'Rapport van deze week bekijken',
    sendToMe: 'Nu naar mij sturen',
    notEmail: 'Dat is geen e-mailadres',
    saved: 'Instellingen weekrapport opgeslagen',
    saveFailed: 'Opslaan is mislukt',
    previewFailed: 'Het voorbeeld kon niet worden gemaakt',
    sent: 'Rapport verstuurd',
    sentText: (to) => (to ? `Kijk in ${to}.` : 'Kijk in je inbox.'),
    sendFailed: 'Versturen is mislukt',
    to: (list) => `Aan: ${list}`,
    nobody: 'nog niemand — voeg een adres toe',
    frameTitle: 'Voorbeeld weekrapport',
  },
  impersonation: {
    session: 'Super-admin-sessie ·',
    viewingAs: 'Bekijken als',
    returnToAdmin: 'Terug naar admin',
    returned: 'Terug naar admin',
    returnedText: 'Je bent terug in je super-admin-sessie.',
  },
};
