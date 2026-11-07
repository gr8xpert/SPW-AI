import type { MailerLiteText } from './en';

export const de: MailerLiteText = {
  title: 'MailerLite',
  description: 'Halten Sie Ihre Kontakte und Tags in Ihrem eigenen MailerLite-Konto aktuell.',
  intro: 'Verbinden Sie Ihr eigenes MailerLite-Konto, und wir kopieren Ihre Kontakte und deren Tags dorthin. Ihre E-Mails gestalten und versenden Sie in MailerLite. Wenn sich dort jemand abmeldet, eine E-Mail unzustellbar ist oder jemand Spam meldet, wird die Person auch hier abgemeldet.',
  connect: {
    keyLabel: 'MailerLite-API-Schlüssel',
    keyPlaceholder: 'API-Schlüssel hier einfügen',
    whereTitle: 'Wo finde ich meinen Schlüssel?',
    whereSteps: 'Öffnen Sie in MailerLite Integrations, wählen Sie MailerLite API und klicken Sie auf Generate new token. Kopieren Sie das Token und fügen Sie es hier ein.',
    button: 'Verbinden',
    connecting: 'Ihr Schlüssel wird geprüft…',
  },
  errors: {
    BAD_KEY: 'MailerLite hat diesen API-Schlüssel nicht akzeptiert. Bitte prüfen Sie ihn und versuchen Sie es erneut.',
    MAILERLITE_BUSY: 'MailerLite ist ausgelastet. Bitte versuchen Sie es in einer Minute erneut.',
    generic: 'Wir konnten MailerLite nicht erreichen. Bitte versuchen Sie es in einigen Minuten erneut.',
    loadFailed: 'Ihre MailerLite-Einstellungen konnten nicht geladen werden. Nur Manager können sie sehen.',
    actionFailed: 'Das hat nicht geklappt. Bitte versuchen Sie es erneut.',
  },
  consent: {
    title: 'Noch eines vor der ersten Synchronisierung',
    checkbox: 'Ich bestätige, dass diese Kontakte dem Erhalt von Marketing-E-Mails zugestimmt haben',
    help: 'Kopiert werden nur Personen, die hier angemeldet sind. Abgemeldete und unzustellbare Adressen bleiben außen vor.',
    button: 'Bestätigen und erste Synchronisierung starten',
  },
  connected: {
    badge: 'Verbunden',
    keyEnding: (last4: string) => `API-Schlüssel endet auf ${last4}`,
    consentBy: (who: string, when: string) => `Einwilligung bestätigt von ${who} am ${when}`,
    lastSync: 'Letzte Synchronisierung',
    never: 'Noch nicht',
    syncing: 'Synchronisierung läuft. Eine große Liste kann einige Stunden dauern, Sie können diese Seite verlassen.',
    syncNow: 'Jetzt synchronisieren',
    disconnect: 'Trennen',
    daily: 'Ihre Kontakte werden außerdem einmal täglich automatisch synchronisiert.',
    groups: 'Alle kommen in eine Gruppe namens "SPM contacts", und jeder Tag erhält eine eigene Gruppe, die mit "SPM:" beginnt. Wenn Sie hier einen Tag entfernen, verlässt die Person diese Gruppe in MailerLite. Ihre anderen Gruppen bleiben unberührt.',
    statsNote: 'Öffnungen, Klicks und andere Ergebnisse von E-Mails, die Sie aus MailerLite versenden, sehen Sie in MailerLite, nicht hier.',
  },
  counts: {
    added: 'Hinzugefügt',
    updated: 'Aktualisiert',
    unchanged: 'Bereits aktuell',
    skipped: 'Ausgelassen',
    failed: 'Nicht übertragen',
    skippedHelp: 'Ausgelassen: Personen ohne echte E-Mail-Adresse sowie abgemeldete oder unzustellbare Adressen.',
  },
  notices: {
    bad_key: 'MailerLite akzeptiert Ihren API-Schlüssel nicht mehr. Bitte verbinden Sie sich erneut mit einem neuen Schlüssel.',
    unreachable: 'Die letzte Synchronisierung konnte nicht abgeschlossen werden, weil MailerLite nicht erreichbar war. Beim nächsten Mal geht es dort weiter, wo sie gestoppt hat.',
    some_groups_missing: 'Einige Tags haben keine Gruppe in MailerLite, weil die Gruppe nicht erstellt werden konnte. Ihr Konto hat möglicherweise die Höchstzahl an Gruppen erreicht.',
  },
  attention: {
    badge: 'Handlungsbedarf',
    newKey: 'Mit neuem Schlüssel verbinden',
  },
  disconnect: {
    title: 'MailerLite trennen?',
    body: 'Die Synchronisierung stoppt, und Abmeldungen kommen nicht mehr aus MailerLite zurück. Ihre Kontakte und Gruppen bleiben in Ihrem MailerLite-Konto.',
    cancel: 'Abbrechen',
    confirm: 'Trennen',
  },
};
