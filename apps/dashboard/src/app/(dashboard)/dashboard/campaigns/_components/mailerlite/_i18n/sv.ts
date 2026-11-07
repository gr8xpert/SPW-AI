import type { MailerLiteText } from './en';

export const sv: MailerLiteText = {
  title: 'MailerLite',
  description: 'Håll dina kontakter och taggar uppdaterade i ditt eget MailerLite-konto.',
  intro: 'Anslut ditt eget MailerLite-konto så kopierar vi dina kontakter och deras taggar dit. Du utformar och skickar dina mejl i MailerLite. Om någon avregistrerar sig, studsar eller anmäler skräppost där avregistreras personen även här.',
  connect: {
    keyLabel: 'MailerLite API-nyckel',
    keyPlaceholder: 'Klistra in din API-nyckel här',
    whereTitle: 'Var hittar jag min nyckel?',
    whereSteps: 'I MailerLite öppnar du Integrations, väljer MailerLite API och klickar på Generate new token. Kopiera token och klistra in den här.',
    button: 'Anslut',
    connecting: 'Din nyckel kontrolleras…',
  },
  errors: {
    BAD_KEY: 'MailerLite godkände inte den här API-nyckeln. Kontrollera den och försök igen.',
    MAILERLITE_BUSY: 'MailerLite är upptaget. Försök igen om en minut.',
    generic: 'Vi kunde inte nå MailerLite. Försök igen om några minuter.',
    loadFailed: 'Vi kunde inte läsa in dina MailerLite-inställningar. Bara chefer kan se dem.',
    actionFailed: 'Det gick inte. Försök igen.',
  },
  consent: {
    title: 'En sak före den första synkroniseringen',
    checkbox: 'Jag bekräftar att dessa kontakter har samtyckt till att ta emot marknadsföringsmejl',
    help: 'Bara personer som prenumererar här kopieras. Avregistrerade och studsade adresser lämnas utanför.',
    button: 'Bekräfta och starta den första synkroniseringen',
  },
  connected: {
    badge: 'Ansluten',
    keyEnding: (last4: string) => `API-nyckel som slutar på ${last4}`,
    consentBy: (who: string, when: string) => `Samtycke bekräftat av ${who} den ${when}`,
    lastSync: 'Senaste synkronisering',
    never: 'Inte än',
    syncing: 'Synkroniserar nu. En stor lista kan ta några timmar, du kan lämna den här sidan.',
    syncNow: 'Synkronisera nu',
    disconnect: 'Koppla från',
    daily: 'Dina kontakter synkroniseras också automatiskt en gång om dagen.',
    groups: 'Alla hamnar i en grupp som heter "SPM contacts", och varje tagg får en egen grupp som börjar med "SPM:". Om du tar bort en tagg här lämnar personen den gruppen i MailerLite. Dina andra grupper rörs inte.',
    statsNote: 'Öppningar, klick och andra resultat av mejl du skickar från MailerLite visas i MailerLite, inte här.',
  },
  counts: {
    added: 'Tillagda',
    updated: 'Uppdaterade',
    unchanged: 'Redan uppdaterade',
    skipped: 'Utelämnade',
    failed: 'Kunde inte skickas',
    skippedHelp: 'Utelämnade: personer utan riktig e-postadress och personer som avregistrerats eller studsat.',
  },
  notices: {
    bad_key: 'MailerLite godkänner inte längre din API-nyckel. Anslut igen med en ny nyckel.',
    unreachable: 'Den senaste synkroniseringen kunde inte slutföras eftersom MailerLite inte gick att nå. Nästa gång fortsätter den där den stannade.',
    some_groups_missing: 'Vissa taggar har ingen grupp i MailerLite eftersom gruppen inte kunde skapas. Ditt konto kan ha nått gränsen för antal grupper.',
  },
  attention: {
    badge: 'Behöver åtgärdas',
    newKey: 'Anslut med en ny nyckel',
  },
  disconnect: {
    title: 'Koppla från MailerLite?',
    body: 'Synkroniseringen stoppas och avregistreringar kommer inte längre tillbaka från MailerLite. Dina kontakter och grupper finns kvar i ditt MailerLite-konto.',
    cancel: 'Avbryt',
    confirm: 'Koppla från',
  },
};
