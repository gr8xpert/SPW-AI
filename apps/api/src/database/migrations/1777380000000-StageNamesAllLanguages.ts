import { MigrationInterface, QueryRunner } from 'typeorm';

// Contacts pipeline stages (2026-10-23):
//   - the default first stage "New lead" becomes "New" (it clashed with the
//     New Leads page); a Spanish name still at the default follows;
//   - stages still carrying a default English name get the dashboard's other
//     languages, so a Dutch user no longer sees English stage names.
// Only names a client never changed are touched: a renamed stage, or a
// language the client typed themselves, is left as it is.

// The names as of this migration, kept here so later edits to the defaults
// don't change what this migration does.
const NAMES: Record<string, Record<string, string>> = {
  New: { en: 'New', es: 'Nuevo', nl: 'Nieuw', fr: 'Nouveau', de: 'Neu', fi: 'Uusi', sv: 'Ny' },
  Contacted: { en: 'Contacted', es: 'Contactado', nl: 'Benaderd', fr: 'Contacté', de: 'Kontaktiert', fi: 'Yhteydessä', sv: 'Kontaktad' },
  'Requirements mapped': { en: 'Requirements mapped', es: 'Requisitos definidos', nl: 'Wensen in kaart', fr: 'Besoins définis', de: 'Anforderungen erfasst', fi: 'Toiveet kartoitettu', sv: 'Krav kartlagda' },
  'Selection sent': { en: 'Selection sent', es: 'Selección enviada', nl: 'Selectie verstuurd', fr: 'Sélection envoyée', de: 'Auswahl gesendet', fi: 'Valikoima lähetetty', sv: 'Urval skickat' },
  Viewing: { en: 'Viewing', es: 'Visita', nl: 'Bezichtiging', fr: 'Visite', de: 'Besichtigung', fi: 'Näyttö', sv: 'Visning' },
  'Offer / reservation': { en: 'Offer / reservation', es: 'Oferta / reserva', nl: 'Bod / reservering', fr: 'Offre / réservation', de: 'Angebot / Reservierung', fi: 'Tarjous / varaus', sv: 'Bud / reservation' },
  Notary: { en: 'Notary', es: 'Notaría', nl: 'Notaris', fr: 'Notaire', de: 'Notar', fi: 'Notaari', sv: 'Notarie' },
  Won: { en: 'Won', es: 'Ganado', nl: 'Gewonnen', fr: 'Gagné', de: 'Gewonnen', fi: 'Voitettu', sv: 'Vunnen' },
  Lost: { en: 'Lost', es: 'Perdido', nl: 'Verloren', fr: 'Perdu', de: 'Verloren', fi: 'Menetetty', sv: 'Förlorad' },
};

function parse(raw: unknown): Record<string, string> | null {
  if (raw && typeof raw === 'object') return raw as Record<string, string>;
  try {
    const v = JSON.parse(String(raw));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

export class StageNamesAllLanguages1777380000000 implements MigrationInterface {
  name = 'StageNamesAllLanguages1777380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: number; name: unknown }[] = await queryRunner.query('SELECT id, name FROM buyer_stages');
    for (const row of rows) {
      const name = parse(row.name);
      if (!name) continue;
      const next = { ...name };
      if (next.en === 'New lead') {
        next.en = 'New';
        if (next.es === 'Nuevo contacto') next.es = 'Nuevo';
      }
      const defaults = NAMES[next.en];
      if (defaults) {
        for (const [lang, text] of Object.entries(defaults)) {
          if (!next[lang]?.trim()) next[lang] = text;
        }
      }
      if (JSON.stringify(next) !== JSON.stringify(name)) {
        await queryRunner.query('UPDATE buyer_stages SET name = ? WHERE id = ?', [JSON.stringify(next), row.id]);
      }
    }
  }

  // Only the rename is undone; the added languages are harmless to keep.
  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: number; name: unknown }[] = await queryRunner.query('SELECT id, name FROM buyer_stages');
    for (const row of rows) {
      const name = parse(row.name);
      if (!name || name.en !== 'New') continue;
      const next = { ...name, en: 'New lead', ...(name.es === 'Nuevo' ? { es: 'Nuevo contacto' } : {}) };
      await queryRunner.query('UPDATE buyer_stages SET name = ? WHERE id = ?', [JSON.stringify(next), row.id]);
    }
  }
}
