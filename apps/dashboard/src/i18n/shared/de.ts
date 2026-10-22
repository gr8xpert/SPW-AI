import type { SharedText } from './en';

const loc = (n: number) => (n === 1 ? 'Standort' : 'Standorte');
const typ = (n: number) => (n === 1 ? 'Immobilientyp' : 'Immobilientypen');

export const de: SharedText = {
  bulkSeo: {
    button: 'Massen-SEO',
    running: (progress) => `SEO ${progress} %`,
    title: 'SEO mit KI erstellen',
    description:
      'Füllt Seitentitel, Meta-Titel, Meta-Beschreibung und Keywords für Ihren gesamten Bestand. Läuft im Hintergrund über Ihr KI-Guthaben.',
    languages: 'Sprachen',
    overwrite: 'Vorhandenes SEO überschreiben',
    overwriteHelp:
      'Aus: Immobilien, die in einer Sprache schon SEO haben, werden übersprungen und kosten nichts. An: Alles wird neu erstellt, auch von Hand Geschriebenes.',
    schema: 'JSON-LD-Schema erstellen',
    schemaHelp:
      'Ein zusätzlicher KI-Aufruf pro Immobilie. Nur nötig, wenn Sie ein eigenes Schema statt des automatisch aus den Feldern der Immobilie erstellten möchten.',
    slug: 'Leere Slugs füllen',
    slugHelp: 'Schreibt nur dort einen Slug, wo keiner ist. Vorhandene Slugs sind live URLs und werden nie geändert.',
    counting: 'Immobilien werden gezählt…',
    estimate: (properties) => `{properties} ${properties === 1 ? 'Immobilie' : 'Immobilien'} · bis zu {calls} KI-Aufrufe`,
    fewerInPractice: '— in der Praxis weniger, da Immobilien mit vorhandenem SEO übersprungen werden',
    cancel: 'Abbrechen',
    start: 'Starten',
    pickLanguage: 'Wählen Sie mindestens eine Sprache',
    finishedWithErrors: 'Massen-SEO mit Fehlern beendet',
    complete: 'Massen-SEO abgeschlossen',
    summary: (generated, skipped, failed, total) =>
      `${generated} erstellt, ${skipped} hatten schon SEO, ${failed} fehlgeschlagen von ${total}.`,
    alreadyRunning: 'Massen-SEO läuft bereits',
    alreadyRunningText: 'Es wird der Fortschritt des laufenden Durchgangs angezeigt — kein zweiter Durchgang wurde gestartet.',
    started: 'Massen-SEO gestartet',
    startedText: 'Läuft im Hintergrund. Sie können diese Seite verlassen — der Fortschritt steht auf der Schaltfläche.',
    startFailed: 'Massen-SEO konnte nicht gestartet werden',
    noJobId: 'Keine Auftrags-ID erhalten',
    unexpectedError: 'Unerwarteter Fehler',
  },
  setupTransfer: {
    button: 'Einrichtung kopieren',
    menuHelp: (kind) =>
      kind === 'locations'
        ? 'Kopieren Sie diese Anordnung der Standorte zu einem anderen Kunden. Nur Standorte, die beide Kunden haben, werden geändert — nichts wird hinzugefügt oder gelöscht.'
        : 'Kopieren Sie diese Anordnung der Immobilientypen zu einem anderen Kunden. Nur Typen, die beide Kunden haben, werden geändert — nichts wird hinzugefügt oder gelöscht.',
    export: 'Einrichtung exportieren',
    import: 'Einrichtung importieren…',
    exported: 'Einrichtung exportiert',
    exportedText: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} gespeichert. Importieren Sie die Datei im Dashboard des anderen Kunden.`,
    exportFailed: 'Export fehlgeschlagen',
    tryAgain: 'Bitte erneut versuchen.',
    readFailed: 'Die Datei konnte nicht gelesen werden',
    imported: 'Einrichtung importiert',
    importedText: (changed, merged, kind) =>
      `${changed} ${kind === 'locations' ? loc(changed) : typ(changed)} aktualisiert${
        merged ? `, ${merged} ${merged === 1 ? 'Duplikat' : 'Duplikate'} zusammengeführt` : ''
      }. Ihre Website nutzt die neue Einrichtung.`,
    importFailed: 'Import fehlgeschlagen',
    dialogTitle: (kind) => (kind === 'locations' ? 'Einrichtung der Standorte importieren' : 'Einrichtung der Immobilientypen importieren'),
    found: (matched, total, changed, kind) =>
      `${matched} Ihrer ${total} ${kind === 'locations' ? 'Standorte' : 'Immobilientypen'} wurden in der Datei gefunden${
        changed > 0 ? `; ${changed} werden geändert.` : ' und stimmen bereits überein.'
      }`,
    untouched: (n, kind) =>
      `${n} Ihrer ${kind === 'locations' ? 'Standorte' : 'Immobilientypen'} ${n === 1 ? 'ist' : 'sind'} nicht in der Datei und ${n === 1 ? 'bleibt' : 'bleiben'} unverändert.`,
    notInAccount: (n, kind) =>
      `${n} ${kind === 'locations' ? loc(n) : typ(n)} aus der Datei ${n === 1 ? 'ist' : 'sind'} nicht in diesem Konto und ${n === 1 ? 'wird' : 'werden'} nicht hinzugefügt`,
    example: (list) => `(z. B. ${list})`,
    rows: {
      moved: 'Unter ein anderes übergeordnetes Element verschoben',
      renamed: 'Umbenannt',
      reordered: 'Neue Reihenfolge',
      aliases: 'Andere Schreibweisen kopiert',
      coords: 'Kartenpunkte kopiert',
      merged: 'Duplikate zusammengeführt',
      keptInPlace: 'Unter dem bisherigen Element belassen (übergeordnetes Element der Datei fehlt in diesem Konto)',
      clashes: 'Nicht verschoben (gleicher Name schon vorhanden)',
      ambiguous: 'Übersprungen (mehr als ein möglicher Treffer)',
    },
    cancel: 'Abbrechen',
    apply: 'Übernehmen',
  },
  sortOrder: {
    button: 'Sortieren',
    help: 'Ersetzt die aktuelle Reihenfolge auf allen Ebenen. Ziehen Sie Zeilen zur Feinabstimmung. Ihre Website nutzt diese Reihenfolge.',
    options: { name: 'A bis Z', 'name-desc': 'Z bis A', count: 'Meiste Inserate zuerst' },
    sorted: (label) => `Sortiert: ${label}`,
    sortedText: 'Ihre Website zeigt die neue Reihenfolge.',
    failed: 'Sortieren fehlgeschlagen',
    failedText: 'Es wurde nichts geändert. Bitte erneut versuchen.',
  },
  locked: {
    title: (feature) => `${feature} ist gesperrt`,
    description: (feature) =>
      `${feature} ist als kostenpflichtiges Add-on verfügbar. Wenden Sie sich an Ihren Account Manager, um es für diesen Kunden freizuschalten.`,
    viewPlans: 'Tarife ansehen',
    backToDashboard: 'Zurück zum Dashboard',
    checkFailed: 'Ihr Tarif konnte nicht geprüft werden.',
    tryAgain: 'Erneut versuchen',
  },
  photo: {
    chooseImage: 'Wählen Sie ein Bild',
    chooseImageText: 'Das Foto muss eine JPG-, PNG- oder WebP-Datei sein.',
    uploadFailed: 'Foto-Upload fehlgeschlagen',
    noAddress: 'Der Upload hat keine Adresse zurückgegeben.',
    uploading: 'Wird hochgeladen…',
    change: 'Foto ändern',
    upload: 'Foto hochladen',
    remove: 'Foto entfernen',
    formats: 'JPG, PNG oder WebP',
  },
  weeklyReport: {
    title: 'Wochenbericht',
    description:
      'Jeden Montagmorgen: Immobilienaufrufe, Suchen und Anfragen der letzten Woche, die meistgesehenen Immobilien, was Ihr Feed importiert hat und alles auf Ihrer Website, das Aufmerksamkeit braucht.',
    enabled: 'Wochenbericht senden',
    sendTo: 'Senden an',
    remove: (email) => `${email} entfernen`,
    defaultRecipients: 'Die Administratoren Ihres Kontos (fügen Sie Adressen hinzu, um selbst zu wählen)',
    emailPlaceholder: 'name@makler.de',
    add: 'Hinzufügen',
    save: 'Speichern',
    preview: 'Bericht dieser Woche ansehen',
    sendToMe: 'Jetzt an mich senden',
    notEmail: 'Das ist keine E-Mail-Adresse',
    saved: 'Einstellungen des Wochenberichts gespeichert',
    saveFailed: 'Speichern fehlgeschlagen',
    previewFailed: 'Die Vorschau konnte nicht erstellt werden',
    sent: 'Bericht gesendet',
    sentText: (to) => (to ? `Prüfen Sie ${to}.` : 'Prüfen Sie Ihren Posteingang.'),
    sendFailed: 'Senden fehlgeschlagen',
    to: (list) => `An: ${list}`,
    nobody: 'noch niemand — fügen Sie eine Adresse hinzu',
    frameTitle: 'Vorschau des Wochenberichts',
  },
  impersonation: {
    session: 'Super-Admin-Sitzung ·',
    viewingAs: 'Ansicht als',
    returnToAdmin: 'Zurück zum Admin',
    returned: 'Zurück im Admin',
    returnedText: 'Sie sind wieder in Ihrer Super-Admin-Sitzung.',
  },
};
