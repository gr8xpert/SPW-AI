'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type WebsiteHealthText } from './en';

export type { WebsiteHealthText };

// Website Health in every dashboard language (small, so one file).
const websiteHealthText: Dictionaries<WebsiteHealthText> = {
  en,
  nl: {
    title: 'Websitestatus',
    description: 'Werkt alles? Je website, feeds, woningen en aanvragen in één oogopslag.',
    checkAgain: 'Opnieuw controleren',
    loadFailed: 'Kon niet worden geladen',
    checking: 'Bezig met controleren…',
    never: 'nooit',
    banner: {
      ok: 'Alles werkt',
      warning: 'Een paar dingen vragen je aandacht',
      error: 'Er werkt iets niet',
    },
    summary: (live, views, enquiries) =>
      `${live} ${live === 1 ? 'woning' : 'woningen'} online · ${views} ${views === 1 ? 'woningweergave' : 'woningweergaven'} en ${enquiries} ${enquiries === 1 ? 'aanvraag' : 'aanvragen'} in de laatste 7 dagen`,
    areas: { website: 'Je website', feeds: 'Woningfeeds', listings: 'Woningen', leads: 'Aanvragen' },
    lastImports: 'Laatste feedimports',
    lastImportsDescription: 'Wat elke feed de laatste keer heeft binnengehaald.',
    columns: { feed: 'Feed', ran: 'Gedraaid', received: 'Ontvangen', created: 'Nieuw', updated: 'Bijgewerkt', removed: 'Verwijderd', errors: 'Fouten' },
    showErrors: 'Fouten tonen',
    sitesTitle: 'Websites die je woningen tonen',
    plugin: (version) => `WordPress-plugin${version ? ` v${version}` : ''}`,
    widget: 'widget',
    lastSeen: (when) => `laatst gezien ${when}`,
    checked: (when) => `Gecontroleerd ${when}. Elke maandag ontvang je een samenvatting van deze pagina per e-mail (Instellingen → E-mail).`,
  },
  es: {
    title: 'Estado de la web',
    description: '¿Funciona todo? Tu web, feeds, propiedades y consultas de un vistazo.',
    checkAgain: 'Comprobar de nuevo',
    loadFailed: 'No se pudo cargar',
    checking: 'Comprobando…',
    never: 'nunca',
    banner: {
      ok: 'Todo funciona',
      warning: 'Algunas cosas necesitan tu atención',
      error: 'Algo no funciona',
    },
    summary: (live, views, enquiries) =>
      `${live} ${live === 1 ? 'propiedad publicada' : 'propiedades publicadas'} · ${views} ${views === 1 ? 'visita a propiedades' : 'visitas a propiedades'} y ${enquiries} ${enquiries === 1 ? 'consulta' : 'consultas'} en los últimos 7 días`,
    areas: { website: 'Tu web', feeds: 'Feeds de propiedades', listings: 'Propiedades', leads: 'Consultas' },
    lastImports: 'Últimas importaciones de feeds',
    lastImportsDescription: 'Lo que trajo cada feed la última vez que se ejecutó.',
    columns: { feed: 'Feed', ran: 'Ejecutado', received: 'Recibidas', created: 'Nuevas', updated: 'Actualizadas', removed: 'Eliminadas', errors: 'Errores' },
    showErrors: 'Ver errores',
    sitesTitle: 'Webs que muestran tus propiedades',
    plugin: (version) => `Plugin de WordPress${version ? ` v${version}` : ''}`,
    widget: 'widget',
    lastSeen: (when) => `visto por última vez ${when}`,
    checked: (when) => `Comprobado ${when}. Cada lunes recibes un resumen de esta página por email (Ajustes → Email).`,
  },
  fr: {
    title: 'Santé du site',
    description: 'Tout fonctionne-t-il ? Votre site, vos flux, vos biens et vos demandes en un coup d’œil.',
    checkAgain: 'Vérifier à nouveau',
    loadFailed: 'Chargement impossible',
    checking: 'Vérification…',
    never: 'jamais',
    banner: {
      ok: 'Tout fonctionne',
      warning: 'Quelques points demandent votre attention',
      error: 'Quelque chose ne fonctionne pas',
    },
    summary: (live, views, enquiries) =>
      `${live} ${live === 1 ? 'bien en ligne' : 'biens en ligne'} · ${views} ${views === 1 ? 'vue de bien' : 'vues de biens'} et ${enquiries} ${enquiries === 1 ? 'demande' : 'demandes'} ces 7 derniers jours`,
    areas: { website: 'Votre site', feeds: 'Flux de biens', listings: 'Biens', leads: 'Demandes' },
    lastImports: 'Dernières importations de flux',
    lastImportsDescription: 'Ce que chaque flux a apporté lors de sa dernière exécution.',
    columns: { feed: 'Flux', ran: 'Exécuté', received: 'Reçus', created: 'Nouveaux', updated: 'Mis à jour', removed: 'Supprimés', errors: 'Erreurs' },
    showErrors: 'Afficher les erreurs',
    sitesTitle: 'Sites qui affichent vos biens',
    plugin: (version) => `Extension WordPress${version ? ` v${version}` : ''}`,
    widget: 'widget',
    lastSeen: (when) => `vu pour la dernière fois ${when}`,
    checked: (when) => `Vérifié ${when}. Un résumé de cette page vous est envoyé par e-mail chaque lundi (Paramètres → E-mail).`,
  },
  de: {
    title: 'Website-Zustand',
    description: 'Funktioniert alles? Ihre Website, Feeds, Objekte und Anfragen auf einen Blick.',
    checkAgain: 'Erneut prüfen',
    loadFailed: 'Konnte nicht geladen werden',
    checking: 'Wird geprüft…',
    never: 'nie',
    banner: {
      ok: 'Alles funktioniert',
      warning: 'Einige Punkte brauchen Ihre Aufmerksamkeit',
      error: 'Etwas funktioniert nicht',
    },
    summary: (live, views, enquiries) =>
      `${live} ${live === 1 ? 'Objekt' : 'Objekte'} online · ${views} ${views === 1 ? 'Objektaufruf' : 'Objektaufrufe'} und ${enquiries} ${enquiries === 1 ? 'Anfrage' : 'Anfragen'} in den letzten 7 Tagen`,
    areas: { website: 'Ihre Website', feeds: 'Objekt-Feeds', listings: 'Objekte', leads: 'Anfragen' },
    lastImports: 'Letzte Feed-Importe',
    lastImportsDescription: 'Was jeder Feed beim letzten Lauf geliefert hat.',
    columns: { feed: 'Feed', ran: 'Gelaufen', received: 'Empfangen', created: 'Neu', updated: 'Aktualisiert', removed: 'Entfernt', errors: 'Fehler' },
    showErrors: 'Fehler anzeigen',
    sitesTitle: 'Websites, die Ihre Objekte zeigen',
    plugin: (version) => `WordPress-Plugin${version ? ` v${version}` : ''}`,
    widget: 'Widget',
    lastSeen: (when) => `zuletzt gesehen ${when}`,
    checked: (when) => `Geprüft ${when}. Eine Zusammenfassung dieser Seite erhalten Sie jeden Montag per E-Mail (Einstellungen → E-Mail).`,
  },
  fi: {
    title: 'Verkkosivun kunto',
    description: 'Toimiiko kaikki? Verkkosivusi, syötteet, kohteet ja yhteydenotot yhdellä silmäyksellä.',
    checkAgain: 'Tarkista uudelleen',
    loadFailed: 'Lataus epäonnistui',
    checking: 'Tarkistetaan…',
    never: 'ei koskaan',
    banner: {
      ok: 'Kaikki toimii',
      warning: 'Muutama asia vaatii huomiotasi',
      error: 'Jokin ei toimi',
    },
    summary: (live, views, enquiries) =>
      `${live} ${live === 1 ? 'kohde' : 'kohdetta'} julkaistu · ${views} ${views === 1 ? 'kohteen katselu' : 'kohteiden katselua'} ja ${enquiries} ${enquiries === 1 ? 'yhteydenotto' : 'yhteydenottoa'} viimeisten 7 päivän aikana`,
    areas: { website: 'Verkkosivusi', feeds: 'Kohdesyötteet', listings: 'Kohteet', leads: 'Yhteydenotot' },
    lastImports: 'Viimeisimmät syötetuonnit',
    lastImportsDescription: 'Mitä kukin syöte toi viimeksi, kun se ajettiin.',
    columns: { feed: 'Syöte', ran: 'Ajettu', received: 'Vastaanotettu', created: 'Uudet', updated: 'Päivitetyt', removed: 'Poistetut', errors: 'Virheet' },
    showErrors: 'Näytä virheet',
    sitesTitle: 'Verkkosivut, jotka näyttävät kohteitasi',
    plugin: (version) => `WordPress-lisäosa${version ? ` v${version}` : ''}`,
    widget: 'widget',
    lastSeen: (when) => `viimeksi nähty ${when}`,
    checked: (when) => `Tarkistettu ${when}. Yhteenveto tästä sivusta lähetetään sähköpostitse joka maanantai (Asetukset → Sähköposti).`,
  },
  sv: {
    title: 'Webbplatsens hälsa',
    description: 'Fungerar allt? Din webbplats, flöden, objekt och förfrågningar i en överblick.',
    checkAgain: 'Kontrollera igen',
    loadFailed: 'Kunde inte laddas',
    checking: 'Kontrollerar…',
    never: 'aldrig',
    banner: {
      ok: 'Allt fungerar',
      warning: 'Några saker behöver din uppmärksamhet',
      error: 'Något fungerar inte',
    },
    summary: (live, views, enquiries) =>
      `${live} objekt ${live === 1 ? 'publicerat' : 'publicerade'} ·${views} ${views === 1 ? 'objektvisning' : 'objektvisningar'} och ${enquiries} ${enquiries === 1 ? 'förfrågan' : 'förfrågningar'} de senaste 7 dagarna`,
    areas: { website: 'Din webbplats', feeds: 'Objektflöden', listings: 'Objekt', leads: 'Förfrågningar' },
    lastImports: 'Senaste flödesimporter',
    lastImportsDescription: 'Vad varje flöde hämtade senast det kördes.',
    columns: { feed: 'Flöde', ran: 'Kördes', received: 'Mottagna', created: 'Nya', updated: 'Uppdaterade', removed: 'Borttagna', errors: 'Fel' },
    showErrors: 'Visa fel',
    sitesTitle: 'Webbplatser som visar dina objekt',
    plugin: (version) => `WordPress-tillägg${version ? ` v${version}` : ''}`,
    widget: 'widget',
    lastSeen: (when) => `senast sedd ${when}`,
    checked: (when) => `Kontrollerad ${when}. En sammanfattning av sidan skickas via e-post varje måndag (Inställningar → E-post).`,
  },
};

export function useWebsiteHealthText(): WebsiteHealthText {
  return useText(websiteHealthText);
}
