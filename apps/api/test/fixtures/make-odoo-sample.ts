// A made-up Odoo Buyers export (.xlsx) in the shape the client's Export
// screen produces (see the client plan doc, "Exporting buyers from Odoo"),
// for tests until the real file arrives.
//
//   npx ts-node test/fixtures/make-odoo-sample.ts   → test/fixtures/odoo-buyers-sample.xlsx
//
// Names match the local test tenant (2) where they should match, and are
// deliberately unknown elsewhere: town "Benahavís Hills", type "Finca",
// agent "Maria Odoo", setting "Front line golf", status "Hot lead",
// reference R999999.
import { Workbook } from 'exceljs';
import * as path from 'path';

export const ODOO_SAMPLE_HEADERS = [
  'ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Mobile', 'Language', 'Street', 'Street 2', 'City', 'ZIP', 'State', 'Country',
  'I prefer contact by', 'Contact type', 'Salesperson', 'Sales Agent', 'Related Sale Agents', "Buyer's Lawyer",
  'Priority', 'Status Buyer', 'Sub-status', 'Waiting for Reply Date', 'Referred By', 'Referral %', 'ID Type', 'ID Number',
  'Listing Type', 'Property Type', 'Bedrooms', 'Bathrooms', 'Budget from', 'Budget to', 'Towns', 'Build Size (m2)', 'Plot Size (m2)',
  'Condition', 'Views', 'Swimming Pool', 'Settings', 'Send Matched Properties to',
  'Purpose', 'Financial Situation', 'Location', 'Distance to airport by car', 'Distance to beach by car', 'Distance to stores / village by car',
  'Internal Notes', 'Visiting Period - Start', 'Visiting Period - End', 'Created on', 'Created by',
  'Suggested Properties/Property Reference', 'Suggested Properties/Agent Reference', 'Suggested Properties/Visiting Date',
  'Suggested Properties/Status', 'Suggested Properties/Note',
];

type Row = Record<string, string | number | Date | null>;

const d = (s: string) => new Date(`${s}T00:00:00Z`);

export const ODOO_SAMPLE_ROWS: Row[] = [
  {
    ID: '__export__.res_partner_101_a1b2', 'First Name': 'Emma', 'Last Name': 'Odoo-Update', Email: 'Odoo.Update@test.local',
    Phone: '+31 20 123 4567', Mobile: '+31 6 1111 2222', Language: 'Dutch / Nederlands', Street: 'Keizersgracht 1', City: 'Amsterdam',
    ZIP: '1015 CJ', Country: 'Netherlands', 'I prefer contact by': 'WhatsApp', 'Contact type': 'Buyer', Salesperson: 'Test Client',
    'Sales Agent': 'Alex Agent', 'Related Sale Agents': 'Test Client, Maria Odoo', "Buyer's Lawyer": 'Mr. Lawyer', Priority: 'High',
    'Status Buyer': 'Contacted', 'Sub-status': 'Reply sent', 'Waiting for Reply Date': d('2026-10-15'), 'Referred By': 'Golf club',
    'Referral %': 2.5, 'ID Type': 'Passport', 'ID Number': 'NL123456', 'Listing Type': 'Sale', 'Property Type': 'Villa, Finca',
    Bedrooms: '3+', Bathrooms: 2, 'Budget from': 400000, 'Budget to': 900000, Towns: 'Marbella, Nueva Andalucía, Benahavís Hills',
    'Build Size (m2)': 200, 'Plot Size (m2)': 800, Condition: '', Views: 'Sea Views', 'Swimming Pool': 'Private Pool',
    Settings: 'Front line golf', 'Send Matched Properties to': 'Both', Purpose: 'Holiday home', 'Financial Situation': 'Cash buyer',
    Location: 'Coast', 'Distance to airport by car': 'Up to 30 min', 'Distance to beach by car': 'Walking distance',
    'Internal Notes': 'Wants south facing.\nNo ground floor.', 'Visiting Period - Start': d('2026-11-03'), 'Visiting Period - End': d('2026-11-10'),
    'Created on': d('2025-03-14'), 'Created by': 'Test Client',
    'Suggested Properties/Property Reference': 'LT-1', 'Suggested Properties/Visiting Date': d('2026-11-04'),
    'Suggested Properties/Status': 'Sent', 'Suggested Properties/Note': 'Liked the garden',
  },
  { ID: null, 'Suggested Properties/Property Reference': 'BM-2', 'Suggested Properties/Status': 'Interested' },
  { ID: null, 'Suggested Properties/Property Reference': 'R999999', 'Suggested Properties/Status': 'Sent' },
  {
    ID: '__export__.res_partner_102_c3d4', 'First Name': 'Juan', 'Last Name': 'Sin Email', Email: null, Phone: '+34 600 999 000',
    Language: 'Spanish / Español', Country: 'Spain', 'Contact type': 'Seller', 'Sales Agent': 'Maria Odoo', Priority: '0',
    'Status Buyer': 'Hot lead', 'Listing Type': 'Long term rent', Towns: 'Estepona', 'Internal Notes': 'Called twice.',
  },
  {
    ID: '__export__.res_partner_103_e5f6', 'First Name': 'Lisa', 'Last Name': 'Odoo-New', Email: 'odoo.new@test.local',
    'Contact type': 'Estate agent', 'Sales Agent': 'agent@test.local', Priority: 'Very High', 'Status Buyer': 'Won',
    'Listing Type': 'Resale', 'Property Type': 'Apartment', Towns: 'estepona', Bedrooms: 2, Purpose: 'Investment',
    'I prefer contact by': 'Email', 'Send Matched Properties to': 'Agent',
    'Suggested Properties/Agent Reference': 'NO-SUCH-AGENT-REF', 'Suggested Properties/Status': 'Visited',
  },
  { ID: null, Towns: 'Marbella', 'Suggested Properties/Property Reference': 'LT-3', 'Suggested Properties/Status': 'Not interested' },
];

export async function buildOdooSample(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(ODOO_SAMPLE_HEADERS);
  for (const row of ODOO_SAMPLE_ROWS) ws.addRow(ODOO_SAMPLE_HEADERS.map((h) => row[h] ?? null));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

if (require.main === module) {
  const out = path.join(__dirname, 'odoo-buyers-sample.xlsx');
  buildOdooSample()
    .then((buf) => require('fs').writeFileSync(out, buf))
    .then(() => console.log(`Wrote ${out}`));
}
