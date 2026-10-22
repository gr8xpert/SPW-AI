// CSV for the buyer export: RFC 4180 quoting, CRLF, a UTF-8 BOM so Excel
// reads accents, and a guard against formula injection (a cell starting
// with = + - @ or a tab/CR is prefixed with ' so a spreadsheet shows it as
// text instead of running it). Pure.

export const CSV_BOM = '﻿';

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return CSV_BOM + [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}
