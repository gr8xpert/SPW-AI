import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { MULTI_FIELDS, ODOO_COLUMNS, headerKey, type OdooField } from './odoo-columns';

// The Odoo export as buyers. Pure apart from readOdooSheet (exceljs).
//
// Odoo writes one row per buyer, and an extra row (with an empty ID) for
// each further suggested property; such a row belongs to the buyer above.

export interface OdooSuggestion {
  reference: string | null;
  agentReference: string | null;
  visitDate: string | null;
  status: string | null;
  note: string | null;
}

export interface OdooBuyer {
  row: number; // 1-based sheet row, for messages
  id: string;
  values: Partial<Record<OdooField, string>>;
  multi: Partial<Record<OdooField, string[]>>;
  suggestions: OdooSuggestion[];
}

export interface OdooSheet {
  buyers: OdooBuyer[];
  unknownHeaders: string[];
  missingColumns: OdooField[];
}

const MAX_BUYERS = 5000;

// A cell as exceljs gives it → plain text.
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('').trim();
    if ('result' in o) return cellText(o.result);
    if (typeof o.text === 'string') return o.text.trim();
    if ('error' in o) return '';
  }
  return String(v).trim();
}

export function splitMulti(text: string): string[] {
  return [...new Set(text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean))];
}

const LOOKUP = new Map<string, OdooField>();
for (const [field, labels] of Object.entries(ODOO_COLUMNS) as [OdooField, readonly string[]][]) {
  for (const l of labels) if (!LOOKUP.has(l)) LOOKUP.set(l, field);
}

// rows[r][c] = cell value (any exceljs type).
export function parseOdooRows(rows: unknown[][]): OdooSheet {
  const headerIndex = rows.slice(0, 10).findIndex((r) => r.some((c) => ['id', 'email'].includes(headerKey(cellText(c)))));
  if (headerIndex < 0) throw new BadRequestException({ code: 'ODOO_NO_HEADER', message: 'No header row with ID or Email found' });
  const header = rows[headerIndex].map((c) => headerKey(cellText(c)));
  const columns = new Map<number, OdooField>();
  const unknownHeaders: string[] = [];
  header.forEach((h, i) => {
    if (!h) return;
    const field = LOOKUP.get(h);
    if (field && ![...columns.values()].includes(field)) columns.set(i, field);
    else if (!field) unknownHeaders.push(h);
  });
  const present = new Set(columns.values());
  if (!present.has('id')) throw new BadRequestException({ code: 'ODOO_NO_ID', message: 'The file has no ID column (add "ID" to the Odoo export)' });

  const buyers: OdooBuyer[] = [];
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const cells: Partial<Record<OdooField, string>> = {};
    for (const [i, field] of columns) {
      const text = cellText(rows[r][i]);
      if (text) cells[field] = text;
    }
    if (!Object.keys(cells).length) continue;
    const suggestion: OdooSuggestion | null =
      cells.sugRef || cells.sugAgentRef
        ? {
            reference: cells.sugRef ?? null,
            agentReference: cells.sugAgentRef ?? null,
            visitDate: cells.sugVisitDate ?? null,
            status: cells.sugStatus ?? null,
            note: cells.sugNote ?? null,
          }
        : null;

    let buyer: OdooBuyer;
    if (cells.id) {
      buyer = { row: r + 1, id: cells.id, values: {}, multi: {}, suggestions: [] };
      for (const [field, text] of Object.entries(cells) as [OdooField, string][]) {
        if (field.startsWith('sug')) continue;
        if (MULTI_FIELDS.includes(field)) buyer.multi[field] = splitMulti(text);
        else buyer.values[field] = text;
      }
      buyers.push(buyer);
      if (buyers.length > MAX_BUYERS) throw new BadRequestException({ code: 'ODOO_TOO_MANY', message: `At most ${MAX_BUYERS} buyers per file` });
    } else {
      const prev = buyers[buyers.length - 1];
      if (!prev) continue; // sub-rows before any buyer: nothing to attach to
      buyer = prev;
      for (const field of MULTI_FIELDS) {
        if (cells[field]) buyer.multi[field] = [...new Set([...(buyer.multi[field] ?? []), ...splitMulti(cells[field]!)])];
      }
    }
    if (suggestion) buyer.suggestions.push(suggestion);
  }
  const missingColumns = (['email', 'firstName', 'lastName'] as OdooField[]).filter((f) => !present.has(f));
  return { buyers, unknownHeaders, missingColumns };
}

export async function readOdooSheet(buffer: Buffer): Promise<OdooSheet> {
  const wb = new Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException({ code: 'ODOO_BAD_FILE', message: 'This is not an .xlsx file' });
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw new BadRequestException({ code: 'ODOO_BAD_FILE', message: 'The file has no sheet' });
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, n) => {
    const values = row.values as unknown[]; // 1-based; [0] is empty
    rows[n - 1] = values.slice(1);
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return parseOdooRows(rows);
}
