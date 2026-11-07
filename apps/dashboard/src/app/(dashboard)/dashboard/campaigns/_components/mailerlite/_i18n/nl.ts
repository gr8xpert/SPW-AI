import type { MailerLiteText } from './en';

export const nl: MailerLiteText = {
  title: 'MailerLite',
  description: 'Houd je contacten en tags up-to-date in je eigen MailerLite-account.',
  intro: 'Koppel je eigen MailerLite-account en wij kopiëren je contacten en hun tags daarheen. Je ontwerpt en verstuurt je e-mails in MailerLite. Als iemand zich daar uitschrijft, bouncet of spam meldt, wordt die persoon ook hier uitgeschreven.',
  connect: {
    keyLabel: 'MailerLite API-sleutel',
    keyPlaceholder: 'Plak hier je API-sleutel',
    whereTitle: 'Waar vind ik mijn sleutel?',
    whereSteps: 'Open in MailerLite Integrations, kies MailerLite API en klik op Generate new token. Kopieer het token en plak het hier.',
    button: 'Koppelen',
    connecting: 'Je sleutel wordt gecontroleerd…',
  },
  errors: {
    BAD_KEY: 'MailerLite heeft deze API-sleutel niet geaccepteerd. Controleer de sleutel en probeer het opnieuw.',
    MAILERLITE_BUSY: 'MailerLite is druk. Probeer het over een minuut opnieuw.',
    generic: 'We konden MailerLite niet bereiken. Probeer het over een paar minuten opnieuw.',
    loadFailed: 'We konden je MailerLite-instellingen niet laden. Alleen managers kunnen ze zien.',
    actionFailed: 'Dat is niet gelukt. Probeer het opnieuw.',
  },
  consent: {
    title: 'Eén ding voor de eerste synchronisatie',
    checkbox: 'Ik bevestig dat deze contacten hebben ingestemd met het ontvangen van marketingmails',
    help: 'Alleen mensen die hier zijn ingeschreven worden gekopieerd. Adressen die zijn uitgeschreven of gebounced blijven erbuiten.',
    button: 'Bevestigen en eerste synchronisatie starten',
  },
  connected: {
    badge: 'Gekoppeld',
    keyEnding: (last4: string) => `API-sleutel eindigend op ${last4}`,
    consentBy: (who: string, when: string) => `Toestemming bevestigd door ${who} op ${when}`,
    lastSync: 'Laatste synchronisatie',
    never: 'Nog niet',
    syncing: 'Bezig met synchroniseren. Een grote lijst kan een paar uur duren, je kunt deze pagina verlaten.',
    syncNow: 'Nu synchroniseren',
    disconnect: 'Ontkoppelen',
    daily: 'Je contacten worden ook vanzelf één keer per dag gesynchroniseerd.',
    groups: 'Iedereen komt in een groep met de naam "SPM contacts", en elke tag krijgt een eigen groep die begint met "SPM:". Als je hier een tag verwijdert, gaat de persoon in MailerLite uit die groep. Je andere groepen blijven ongemoeid.',
    statsNote: 'Openingen, klikken en andere resultaten van e-mails die je vanuit MailerLite verstuurt, zie je in MailerLite, niet hier.',
  },
  counts: {
    added: 'Toegevoegd',
    updated: 'Bijgewerkt',
    unchanged: 'Al up-to-date',
    skipped: 'Overgeslagen',
    failed: 'Niet gelukt',
    skippedHelp: 'Overgeslagen: mensen zonder echt e-mailadres, en mensen die zijn uitgeschreven of gebounced.',
  },
  notices: {
    bad_key: 'MailerLite accepteert je API-sleutel niet meer. Koppel opnieuw met een nieuwe sleutel.',
    unreachable: 'De laatste synchronisatie kon niet worden afgerond omdat MailerLite niet bereikbaar was. De volgende keer gaat hij verder waar hij stopte.',
    some_groups_missing: 'Sommige tags hebben geen groep in MailerLite omdat de groep niet kon worden aangemaakt. Je account heeft misschien het maximum aantal groepen bereikt.',
  },
  attention: {
    badge: 'Aandacht nodig',
    newKey: 'Koppelen met een nieuwe sleutel',
  },
  disconnect: {
    title: 'MailerLite ontkoppelen?',
    body: 'Het synchroniseren stopt en uitschrijvingen komen niet meer terug uit MailerLite. Je contacten en groepen blijven in je MailerLite-account staan.',
    cancel: 'Annuleren',
    confirm: 'Ontkoppelen',
  },
};
