import type { Dictionaries } from '@/i18n/languages';
import type { GuideGroup } from './guide-types';

// The words around the guide content: heading, search, labels and group names.
type GuideChrome = {
  title: string;
  description: string;
  introTitle: string;
  introText: (n: number) => string;
  searchPlaceholder: string;
  clearSearch: string;
  quickStart: string;
  contents: string;
  managers: string;
  tip: string;
  warn: string;
  noResults: (query: string) => string;
  backToTop: string;
  groups: Record<GuideGroup, string>;
};

const en: GuideChrome = {
  title: 'Contacts guide',
  description: 'Everything about Contacts, explained in plain words.',
  introTitle: 'New here? Start with the quick start.',
  introText: (n) => `${n} short topics. Five minutes is enough to send your first email.`,
  searchPlaceholder: 'Search the guide, e.g. wishlist, alerts, erase…',
  clearSearch: 'Clear search',
  quickStart: 'Quick start',
  contents: 'Guide contents',
  managers: 'Managers',
  tip: 'Tip: ',
  warn: 'Watch out: ',
  noResults: (q) => `Nothing in the guide matches “${q}”. Try another word, like “email” or “stage”.`,
  backToTop: 'Back to top',
  groups: {
    start: 'Getting started',
    buyers: 'Your contacts and leads',
    one: 'One buyer',
    day: 'Your working day',
    managers: 'For managers',
    help: 'Privacy and help',
  },
};

const nl: GuideChrome = {
  title: 'Handleiding Contacten',
  description: 'Alles over Contacten, in gewone woorden uitgelegd.',
  introTitle: 'Nieuw hier? Begin met de snelstart.',
  introText: (n) => `${n} korte onderwerpen. Vijf minuten is genoeg om je eerste e-mail te versturen.`,
  searchPlaceholder: 'Zoek in de handleiding, bv. wensenlijst, meldingen, wissen…',
  clearSearch: 'Zoekopdracht wissen',
  quickStart: 'Snelstart',
  contents: 'Inhoud van de handleiding',
  managers: 'Managers',
  tip: 'Tip: ',
  warn: 'Let op: ',
  noResults: (q) => `Niets in de handleiding past bij “${q}”. Probeer een ander woord, zoals “e-mail” of “fase”.`,
  backToTop: 'Terug naar boven',
  groups: {
    start: 'Aan de slag',
    buyers: 'Je contacten en leads',
    one: 'Eén koper',
    day: 'Je werkdag',
    managers: 'Voor managers',
    help: 'Privacy en hulp',
  },
};

const es: GuideChrome = {
  title: 'Guía de Contactos',
  description: 'Todo sobre Contactos, explicado con palabras sencillas.',
  introTitle: '¿Eres nuevo? Empieza por el inicio rápido.',
  introText: (n) => `${n} temas cortos. Con cinco minutos te basta para enviar tu primer email.`,
  searchPlaceholder: 'Busca en la guía, p. ej. lista de deseos, alertas, borrar…',
  clearSearch: 'Borrar búsqueda',
  quickStart: 'Inicio rápido',
  contents: 'Contenido de la guía',
  managers: 'Responsables',
  tip: 'Consejo: ',
  warn: 'Atención: ',
  noResults: (q) => `Nada en la guía coincide con «${q}». Prueba otra palabra, como «email» o «etapa».`,
  backToTop: 'Volver arriba',
  groups: {
    start: 'Primeros pasos',
    buyers: 'Tus contactos y leads',
    one: 'Un comprador',
    day: 'Tu día de trabajo',
    managers: 'Para responsables',
    help: 'Privacidad y ayuda',
  },
};

const fr: GuideChrome = {
  title: 'Guide des Contacts',
  description: 'Tout sur Contacts, expliqué avec des mots simples.',
  introTitle: 'Nouveau ici ? Commencez par le démarrage rapide.',
  introText: (n) => `${n} sujets courts. Cinq minutes suffisent pour envoyer votre premier e-mail.`,
  searchPlaceholder: 'Rechercher dans le guide, ex. souhaits, alertes, effacer…',
  clearSearch: 'Effacer la recherche',
  quickStart: 'Démarrage rapide',
  contents: 'Sommaire du guide',
  managers: 'Responsables',
  tip: 'Astuce : ',
  warn: 'Attention : ',
  noResults: (q) => `Rien dans le guide ne correspond à « ${q} ». Essayez un autre mot, comme « e-mail » ou « étape ».`,
  backToTop: 'Retour en haut',
  groups: {
    start: 'Pour commencer',
    buyers: 'Vos contacts et leads',
    one: 'Un acheteur',
    day: 'Votre journée de travail',
    managers: 'Pour les responsables',
    help: 'Confidentialité et aide',
  },
};

const de: GuideChrome = {
  title: 'Kontakte-Anleitung',
  description: 'Alles über Kontakte, in einfachen Worten erklärt.',
  introTitle: 'Neu hier? Beginnen Sie mit dem Schnellstart.',
  introText: (n) => `${n} kurze Themen. Fünf Minuten reichen für Ihre erste E-Mail.`,
  searchPlaceholder: 'Anleitung durchsuchen, z. B. Suchprofil, Benachrichtigungen, löschen…',
  clearSearch: 'Suche löschen',
  quickStart: 'Schnellstart',
  contents: 'Inhalt der Anleitung',
  managers: 'Manager',
  tip: 'Tipp: ',
  warn: 'Achtung: ',
  noResults: (q) => `Nichts in der Anleitung passt zu „${q}“. Versuchen Sie ein anderes Wort, etwa „E-Mail“ oder „Phase“.`,
  backToTop: 'Nach oben',
  groups: {
    start: 'Erste Schritte',
    buyers: 'Ihre Kontakte und Leads',
    one: 'Ein Käufer',
    day: 'Ihr Arbeitstag',
    managers: 'Für Manager',
    help: 'Datenschutz und Hilfe',
  },
};

const fi: GuideChrome = {
  title: 'Yhteystiedot-opas',
  description: 'Kaikki Yhteystiedoista selkein sanoin.',
  introTitle: 'Uusi täällä? Aloita pikaoppaasta.',
  introText: (n) => `${n} lyhyttä aihetta. Viisi minuuttia riittää ensimmäisen sähköpostin lähettämiseen.`,
  searchPlaceholder: 'Hae oppaasta, esim. toivelista, hälytykset, poista…',
  clearSearch: 'Tyhjennä haku',
  quickStart: 'Pikaopas',
  contents: 'Oppaan sisältö',
  managers: 'Esihenkilöt',
  tip: 'Vinkki: ',
  warn: 'Huomaa: ',
  noResults: (q) => `Oppaasta ei löydy hakua ”${q}”. Kokeile toista sanaa, esimerkiksi ”sähköposti” tai ”vaihe”.`,
  backToTop: 'Takaisin ylös',
  groups: {
    start: 'Aloitus',
    buyers: 'Yhteystietosi ja liidisi',
    one: 'Yksi ostaja',
    day: 'Työpäiväsi',
    managers: 'Esihenkilöille',
    help: 'Tietosuoja ja apu',
  },
};

const sv: GuideChrome = {
  title: 'Guide till Kontakter',
  description: 'Allt om Kontakter, förklarat med enkla ord.',
  introTitle: 'Ny här? Börja med snabbstarten.',
  introText: (n) => `${n} korta avsnitt. Fem minuter räcker för att skicka ditt första mejl.`,
  searchPlaceholder: 'Sök i guiden, t.ex. önskelista, bevakningar, radera…',
  clearSearch: 'Rensa sökningen',
  quickStart: 'Snabbstart',
  contents: 'Guidens innehåll',
  managers: 'Chefer',
  tip: 'Tips: ',
  warn: 'Obs: ',
  noResults: (q) => `Inget i guiden matchar ”${q}”. Prova ett annat ord, som ”mejl” eller ”steg”.`,
  backToTop: 'Till toppen',
  groups: {
    start: 'Kom igång',
    buyers: 'Dina kontakter och leads',
    one: 'En köpare',
    day: 'Din arbetsdag',
    managers: 'För chefer',
    help: 'Integritet och hjälp',
  },
};

export const guideText: Dictionaries<GuideChrome> = { en, nl, es, fr, de, fi, sv };
