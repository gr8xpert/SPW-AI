import { BuyerImportService } from './buyer-import.service';
import type { MappedBuyer } from './odoo-match';

// Which buyer each Odoo row lands on, when several people share one email.

const row = (odooId: string, email: string | null) => ({ odooId, email }) as MappedBuyer;
const lead = (id: number, importRef: string | null, email: string) => ({ id, importRef, contact: { email } });

function service(leads: ReturnType<typeof lead>[]) {
  const repo = {
    createQueryBuilder: () => {
      const qb = { innerJoinAndSelect: () => qb, where: () => qb, andWhere: () => qb, getMany: async () => leads };
      return qb;
    },
    find: async ({ where }: { where: { importRef: { value: string[] } } }) => leads.filter((l) => l.importRef && where.importRef.value.includes(l.importRef)),
  };
  const deps = Array(13).fill({}) as never[];
  deps[0] = repo as never;
  return new (BuyerImportService as unknown as new (...a: never[]) => BuyerImportService)(...deps);
}

const existing = (s: BuyerImportService, rows: MappedBuyer[]) =>
  (s as unknown as { existing(t: number, r: MappedBuyer[]): Promise<Map<string, { id: number }>> }).existing(1, rows);

describe('Odoo import: which buyer a row lands on', () => {
  it('gives each person sharing an email their own buyer on a re-import', async () => {
    const shared = 'agent@example.com';
    const found = await existing(service([lead(1, '78', shared), lead(2, '64', shared), lead(3, '8', shared)]), [row('78', shared), row('64', shared), row('8', shared)]);
    expect([found.get('78')?.id, found.get('64')?.id, found.get('8')?.id]).toEqual([1, 2, 3]);
  });

  it('finds a buyer without an Odoo ID by email, for one row only', async () => {
    const found = await existing(service([lead(5, null, 'a@example.com')]), [row('1', 'a@example.com'), row('2', 'a@example.com')]);
    expect(found.get('1')?.id).toBe(5);
    expect(found.has('2')).toBe(false);
  });

  it('does not take over a buyer that belongs to another Odoo ID', async () => {
    const found = await existing(service([lead(6, '99', 'a@example.com')]), [row('1', 'a@example.com')]);
    expect(found.has('1')).toBe(false);
  });

  it('finds a no-email buyer by Odoo ID', async () => {
    const found = await existing(service([lead(7, '12', 'odoo-12@no-email.invalid')]), [row('12', null)]);
    expect(found.get('12')?.id).toBe(7);
  });
});
