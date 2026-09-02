import { MigrationInterface, QueryRunner } from 'typeorm';

// Seeds the 6 default credit-hour packages so the billing page always
// has something to show on a fresh install. Prices are PLACEHOLDERS —
// super-admin edits real prices at /admin/credit-packages after go-live.
//
// Idempotent: skips insert when a package with the same name already
// exists (name is unique), so re-runs never overwrite the operator's
// price updates. To reset the catalog, delete/deactivate the rows in
// the admin UI, then re-run this migration.
const DEFAULT_PACKAGES: Array<{
  name: string;
  hours: number;
  pricePerHour: number;
  totalPrice: number;
  sortOrder: number;
}> = [
  // 1-hour "starter" pack — can be bought with quantity ≥ 1 for arbitrary
  // top-ups (e.g. Qty 8 → 8 hours). Every other pack is a fixed bundle.
  { name: '1 Credit Hour', hours: 1, pricePerHour: 50, totalPrice: 50, sortOrder: 10 },
  { name: '5 Credit Hours', hours: 5, pricePerHour: 45, totalPrice: 225, sortOrder: 20 },
  { name: '10 Credit Hours', hours: 10, pricePerHour: 42, totalPrice: 420, sortOrder: 30 },
  { name: '25 Credit Hours', hours: 25, pricePerHour: 38, totalPrice: 950, sortOrder: 40 },
  { name: '50 Credit Hours', hours: 50, pricePerHour: 35, totalPrice: 1750, sortOrder: 50 },
  { name: '100 Credit Hours', hours: 100, pricePerHour: 30, totalPrice: 3000, sortOrder: 60 },
];

export class SeedDefaultCreditPackages1777003000000 implements MigrationInterface {
  name = 'SeedDefaultCreditPackages1777003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const pkg of DEFAULT_PACKAGES) {
      const existing: { c: number }[] = await queryRunner.query(
        `SELECT COUNT(*) AS c FROM credit_packages WHERE name = ?`,
        [pkg.name],
      );
      if (Number(existing[0]?.c ?? 0) > 0) continue;

      await queryRunner.query(
        `INSERT INTO credit_packages
           (name, hours, pricePerHour, totalPrice, currency, isActive, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'EUR', 1, ?, NOW(), NOW())`,
        [pkg.name, pkg.hours, pkg.pricePerHour, pkg.totalPrice, pkg.sortOrder],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only remove rows the seed itself would have inserted. Anything the
    // operator added or renamed via /admin/credit-packages stays put.
    const names = DEFAULT_PACKAGES.map((p) => p.name);
    await queryRunner.query(
      `DELETE FROM credit_packages WHERE name IN (${names.map(() => '?').join(',')})`,
      names,
    );
  }
}
