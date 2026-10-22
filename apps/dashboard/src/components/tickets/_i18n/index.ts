'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type TicketComponentsText } from './en';

// Shared ticket components in every dashboard language (small, so one file).
const ticketComponentsText: Dictionaries<TicketComponentsText> = {
  en,
  nl: {
    dropFiles: 'Sleep bestanden hierheen',
    or: ' of ',
    browse: 'blader',
    limits: 'Afbeeldingen en pdf’s tot 10 MB, video’s (MP4, MOV, WebM) tot 90 MB',
    remove: (name) => `${name} verwijderen`,
    attach: 'Bijvoegen',
  },
  es: {
    dropFiles: 'Suelta los archivos aquí',
    or: ' o ',
    browse: 'explora',
    limits: 'Imágenes y PDF de hasta 10 MB, vídeos (MP4, MOV, WebM) de hasta 90 MB',
    remove: (name) => `Quitar ${name}`,
    attach: 'Adjuntar',
  },
  fr: {
    dropFiles: 'Déposez vos fichiers ici',
    or: ' ou ',
    browse: 'parcourez',
    limits: 'Images et PDF jusqu’à 10 Mo, vidéos (MP4, MOV, WebM) jusqu’à 90 Mo',
    remove: (name) => `Retirer ${name}`,
    attach: 'Joindre',
  },
  de: {
    dropFiles: 'Dateien hierher ziehen',
    or: ' oder ',
    browse: 'durchsuchen',
    limits: 'Bilder und PDFs bis 10 MB, Videos (MP4, MOV, WebM) bis 90 MB',
    remove: (name) => `${name} entfernen`,
    attach: 'Anhängen',
  },
  fi: {
    dropFiles: 'Pudota tiedostot tähän',
    or: ' tai ',
    browse: 'selaa',
    limits: 'Kuvat ja PDF-tiedostot enintään 10 Mt, videot (MP4, MOV, WebM) enintään 90 Mt',
    remove: (name) => `Poista ${name}`,
    attach: 'Liitä',
  },
  sv: {
    dropFiles: 'Släpp filer här',
    or: ' eller ',
    browse: 'bläddra',
    limits: 'Bilder och PDF-filer upp till 10 MB, videor (MP4, MOV, WebM) upp till 90 MB',
    remove: (name) => `Ta bort ${name}`,
    attach: 'Bifoga',
  },
};

/** The shared ticket components' wording in the dashboard language. */
export function useTicketComponentsText(): TicketComponentsText {
  return useText(ticketComponentsText);
}
