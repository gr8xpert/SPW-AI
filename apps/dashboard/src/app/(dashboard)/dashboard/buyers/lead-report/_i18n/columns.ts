'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';

// Lead Report: the sheet-like columns (came in, first contact, appointment,
// property type, Buyer questions) and the column picker.

const en = {
  lost: 'Lost',
  wonValue: 'Won value',
  conversion: 'Conversion',
  conversionHint: 'Won out of the leads that ended (won + lost)',
  cameIn: 'Came in',
  firstContact: 'First contact',
  appointment: 'Appointment',
  propertyType: 'Property type',
  visit: { planned: 'planned', done: 'done', no_show: 'no show' } as Record<string, string>,
  columns: 'Columns',
  columnsTitle: 'Buyer questions as columns',
  columnsHint: 'Agents fill these in the table. Facebook form answers fill them when the answer matches an option.',
  noQuestions: 'No Buyer questions yet.',
  editQuestions: 'Edit Buyer questions',
};

export type LeadReportColumnsText = typeof en;

const nl: LeadReportColumnsText = {
  lost: 'Verloren',
  wonValue: 'Gewonnen waarde',
  conversion: 'Conversie',
  conversionHint: 'Gewonnen van de leads die afgerond zijn (gewonnen + verloren)',
  cameIn: 'Binnengekomen',
  firstContact: 'Eerste contact',
  appointment: 'Afspraak',
  propertyType: 'Type woning',
  visit: { planned: 'gepland', done: 'gedaan', no_show: 'niet gekomen' },
  columns: 'Kolommen',
  columnsTitle: 'Kopersvragen als kolommen',
  columnsHint: 'Makelaars vullen ze in de tabel in. Antwoorden uit een Facebook-formulier vullen ze als het antwoord een van de opties is.',
  noQuestions: 'Nog geen kopersvragen.',
  editQuestions: 'Kopersvragen bewerken',
};

const es: LeadReportColumnsText = {
  lost: 'Perdidos',
  wonValue: 'Valor ganado',
  conversion: 'Conversión',
  conversionHint: 'Ganados de los leads cerrados (ganados + perdidos)',
  cameIn: 'Entrada',
  firstContact: 'Primer contacto',
  appointment: 'Cita',
  propertyType: 'Tipo de inmueble',
  visit: { planned: 'prevista', done: 'hecha', no_show: 'no vino' },
  columns: 'Columnas',
  columnsTitle: 'Preguntas al comprador como columnas',
  columnsHint: 'Los agentes las rellenan en la tabla. Las respuestas de un formulario de Facebook las rellenan si coinciden con una opción.',
  noQuestions: 'Aún no hay preguntas al comprador.',
  editQuestions: 'Editar preguntas al comprador',
};

const fr: LeadReportColumnsText = {
  lost: 'Perdus',
  wonValue: 'Valeur gagnée',
  conversion: 'Conversion',
  conversionHint: 'Gagnés parmi les leads clôturés (gagnés + perdus)',
  cameIn: 'Arrivé le',
  firstContact: 'Premier contact',
  appointment: 'Rendez-vous',
  propertyType: 'Type de bien',
  visit: { planned: 'prévu', done: 'fait', no_show: 'absent' },
  columns: 'Colonnes',
  columnsTitle: 'Questions acheteur en colonnes',
  columnsHint: 'Les agents les remplissent dans le tableau. Les réponses d’un formulaire Facebook les remplissent si elles correspondent à une option.',
  noQuestions: 'Pas encore de questions acheteur.',
  editQuestions: 'Modifier les questions acheteur',
};

const de: LeadReportColumnsText = {
  lost: 'Verloren',
  wonValue: 'Gewonnener Wert',
  conversion: 'Konversion',
  conversionHint: 'Gewonnen von den abgeschlossenen Leads (gewonnen + verloren)',
  cameIn: 'Eingegangen',
  firstContact: 'Erster Kontakt',
  appointment: 'Termin',
  propertyType: 'Objektart',
  visit: { planned: 'geplant', done: 'erledigt', no_show: 'nicht erschienen' },
  columns: 'Spalten',
  columnsTitle: 'Käuferfragen als Spalten',
  columnsHint: 'Makler füllen sie in der Tabelle aus. Antworten aus einem Facebook-Formular füllen sie, wenn die Antwort einer Option entspricht.',
  noQuestions: 'Noch keine Käuferfragen.',
  editQuestions: 'Käuferfragen bearbeiten',
};

const fi: LeadReportColumnsText = {
  lost: 'Menetetyt',
  wonValue: 'Voitettu arvo',
  conversion: 'Konversio',
  conversionHint: 'Voitetut päättyneistä liideistä (voitetut + menetetyt)',
  cameIn: 'Saapui',
  firstContact: 'Ensimmäinen yhteys',
  appointment: 'Tapaaminen',
  propertyType: 'Kohdetyyppi',
  visit: { planned: 'suunniteltu', done: 'tehty', no_show: 'ei saapunut' },
  columns: 'Sarakkeet',
  columnsTitle: 'Ostajakysymykset sarakkeina',
  columnsHint: 'Välittäjät täyttävät ne taulukossa. Facebook-lomakkeen vastaukset täyttävät ne, jos vastaus vastaa vaihtoehtoa.',
  noQuestions: 'Ei vielä ostajakysymyksiä.',
  editQuestions: 'Muokkaa ostajakysymyksiä',
};

const sv: LeadReportColumnsText = {
  lost: 'Förlorade',
  wonValue: 'Vunnet värde',
  conversion: 'Konvertering',
  conversionHint: 'Vunna av de leads som avslutats (vunna + förlorade)',
  cameIn: 'Inkom',
  firstContact: 'Första kontakt',
  appointment: 'Möte',
  propertyType: 'Bostadstyp',
  visit: { planned: 'planerad', done: 'klar', no_show: 'kom inte' },
  columns: 'Kolumner',
  columnsTitle: 'Köparfrågor som kolumner',
  columnsHint: 'Mäklarna fyller i dem i tabellen. Svar från ett Facebook-formulär fyller dem när svaret matchar ett alternativ.',
  noQuestions: 'Inga köparfrågor än.',
  editQuestions: 'Redigera köparfrågor',
};

const columnsText: Dictionaries<LeadReportColumnsText> = { en, nl, es, fr, de, fi, sv };

export function useLeadReportColumnsText(): LeadReportColumnsText {
  return useText(columnsText);
}
