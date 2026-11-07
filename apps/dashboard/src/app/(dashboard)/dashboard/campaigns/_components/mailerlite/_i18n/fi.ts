import type { MailerLiteText } from './en';

export const fi: MailerLiteText = {
  title: 'MailerLite',
  description: 'Pidä yhteystietosi ja tunnisteesi ajan tasalla omalla MailerLite-tililläsi.',
  intro: 'Yhdistä oma MailerLite-tilisi, niin kopioimme sinne yhteystietosi ja niiden tunnisteet. Suunnittelet ja lähetät sähköpostisi MailerLitessä. Jos joku peruu tilauksen, viesti palautuu tai joku ilmoittaa roskapostista siellä, hänen tilauksensa perutaan myös täällä.',
  connect: {
    keyLabel: 'MailerLite-API-avain',
    keyPlaceholder: 'Liitä API-avaimesi tähän',
    whereTitle: 'Mistä löydän avaimeni?',
    whereSteps: 'Avaa MailerLitessä Integrations, valitse MailerLite API ja napsauta Generate new token. Kopioi tunnus ja liitä se tähän.',
    button: 'Yhdistä',
    connecting: 'Tarkistetaan avaintasi…',
  },
  errors: {
    BAD_KEY: 'MailerLite ei hyväksynyt tätä API-avainta. Tarkista se ja yritä uudelleen.',
    MAILERLITE_BUSY: 'MailerLite on varattu. Yritä uudelleen minuutin kuluttua.',
    generic: 'MailerLiteen ei saatu yhteyttä. Yritä uudelleen muutaman minuutin kuluttua.',
    loadFailed: 'MailerLite-asetuksiasi ei voitu ladata. Vain esihenkilöt voivat nähdä ne.',
    actionFailed: 'Se ei onnistunut. Yritä uudelleen.',
  },
  consent: {
    title: 'Yksi asia ennen ensimmäistä synkronointia',
    checkbox: 'Vahvistan, että nämä yhteyshenkilöt ovat suostuneet vastaanottamaan markkinointisähköpostia',
    help: 'Vain täällä tilaajina olevat henkilöt kopioidaan. Tilauksen peruneet ja palautuneet osoitteet jätetään pois.',
    button: 'Vahvista ja aloita ensimmäinen synkronointi',
  },
  connected: {
    badge: 'Yhdistetty',
    keyEnding: (last4: string) => `API-avain, joka päättyy ${last4}`,
    consentBy: (who: string, when: string) => `Suostumuksen vahvisti ${who} ${when}`,
    lastSync: 'Viimeisin synkronointi',
    never: 'Ei vielä',
    syncing: 'Synkronointi käynnissä. Suuri lista voi kestää muutaman tunnin, voit poistua tältä sivulta.',
    syncNow: 'Synkronoi nyt',
    disconnect: 'Katkaise yhteys',
    daily: 'Yhteystietosi synkronoidaan myös automaattisesti kerran päivässä.',
    groups: 'Kaikki menevät ryhmään nimeltä "SPM contacts", ja jokaisella tunnisteella on oma ryhmänsä, jonka nimi alkaa "SPM:". Jos poistat tunnisteen täällä, henkilö poistuu siitä ryhmästä MailerLitessä. Muihin ryhmiisi ei kosketa.',
    statsNote: 'MailerLitestä lähettämiesi sähköpostien avaukset, klikkaukset ja muut tulokset näkyvät MailerLitessä, eivät täällä.',
  },
  counts: {
    added: 'Lisätty',
    updated: 'Päivitetty',
    unchanged: 'Jo ajan tasalla',
    skipped: 'Jätetty pois',
    failed: 'Ei onnistunut',
    skippedHelp: 'Jätetty pois: henkilöt ilman oikeaa sähköpostiosoitetta sekä tilauksen peruneet tai palautuneet osoitteet.',
  },
  notices: {
    bad_key: 'MailerLite ei enää hyväksy API-avaintasi. Yhdistä uudelleen uudella avaimella.',
    unreachable: 'Viimeisin synkronointi ei valmistunut, koska MailerLiteen ei saatu yhteyttä. Seuraavalla kerralla se jatkuu siitä, mihin se jäi.',
    some_groups_missing: 'Joillakin tunnisteilla ei ole ryhmää MailerLitessä, koska ryhmää ei voitu luoda. Tilisi on ehkä saavuttanut ryhmien enimmäismäärän.',
  },
  attention: {
    badge: 'Vaatii huomiota',
    newKey: 'Yhdistä uudella avaimella',
  },
  disconnect: {
    title: 'Katkaistaanko MailerLite-yhteys?',
    body: 'Synkronointi loppuu, eivätkä tilausten peruutukset enää palaudu MailerLitestä. Yhteystietosi ja ryhmäsi jäävät MailerLite-tilillesi.',
    cancel: 'Peruuta',
    confirm: 'Katkaise yhteys',
  },
};
