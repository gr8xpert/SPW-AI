import { MigrationInterface, QueryRunner } from 'typeorm';

// Clients are added by hand and not sold plans any more, so every client is
// on the Free plan and Free gets working limits: 1,200 website API requests
// per minute (a page view makes ~3-6), 25 team members, no practical
// property cap. The Plans page is hidden; the table stays for the rate
// limiter and in case paid self-signup returns.
export class SinglePlan1777070000000 implements MigrationInterface {
  name = 'SinglePlan1777070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    let [free] = await queryRunner.query(`SELECT id FROM plans WHERE slug = 'free' LIMIT 1`);
    if (!free) {
      await queryRunner.query(
        `INSERT INTO plans (name, slug, priceMonthly, priceYearly, maxProperties, maxUsers, ratePerMinute, features, isActive)
         VALUES ('Free', 'free', 0, 0, 100000, 25, 1200, NULL, 1)`,
      );
      [free] = await queryRunner.query(`SELECT id FROM plans WHERE slug = 'free' LIMIT 1`);
    }
    await queryRunner.query(
      `UPDATE plans SET ratePerMinute = 1200, maxUsers = 25, maxProperties = 100000, isActive = 1 WHERE id = ?`,
      [free.id],
    );
    await queryRunner.query(`UPDATE tenants SET planId = ? WHERE planId IS NULL OR planId <> ?`, [free.id, free.id]);
  }

  public async down(): Promise<void> {
    // Earlier plan assignments are not recorded; nothing to undo safely.
  }
}
