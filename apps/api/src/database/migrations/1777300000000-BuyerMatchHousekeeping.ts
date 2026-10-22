import { MigrationInterface, QueryRunner } from 'typeorm';

// Buyer Match, milestone J: stage probability (expected revenue), GDPR
// columns on buyers (consent, unsubscribe, erase), two-factor login on users
// and the agency switch that requires it, and two activity types. users
// already had twoFactorSecret (VARCHAR 100, never used) and twoFactorEnabled
// from the first schema: the secret column is widened for the encrypted value.
const BEFORE =
  "'note','call','email','sms','viewing','offer','meeting','status_change','assignment','enquiry','wishlist_form','task_done','suggestion_sent','import','merge','buyer_feedback','viewing_request','alert_sent','viewing_planned','viewing_done'";
const AFTER = `${BEFORE},'erase','unsubscribe'`;

const COLUMNS: [table: string, column: string, ddl: string][] = [
  ['buyer_stages', 'probability', 'TINYINT UNSIGNED NULL'],
  ['leads', 'consentAt', 'DATETIME NULL'],
  ['leads', 'consentSource', 'VARCHAR(30) NULL'],
  ['leads', 'unsubscribedAt', 'DATETIME NULL'],
  ['leads', 'erasedAt', 'DATETIME NULL'],
  ['users', 'twoFactorRecovery', 'JSON NULL'],
  ['users', 'twoFactorFailures', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
  ['users', 'twoFactorLockedUntil', 'DATETIME NULL'],
  ['tenants', 'require2fa', 'TINYINT(1) NOT NULL DEFAULT 0'],
];

export class BuyerMatchHousekeeping1777300000000 implements MigrationInterface {
  name = 'BuyerMatchHousekeeping1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${AFTER}) NOT NULL`);
    for (const [table, column, ddl] of COLUMNS) {
      if (!(await queryRunner.hasColumn(table, column))) await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
    // Never used until now: clear anything left so the cipher never reads plain text.
    await queryRunner.query('UPDATE users SET twoFactorSecret = NULL, twoFactorEnabled = 0');
    await queryRunner.query('ALTER TABLE users MODIFY COLUMN twoFactorSecret VARCHAR(255) NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('UPDATE users SET twoFactorSecret = NULL, twoFactorEnabled = 0');
    await queryRunner.query('ALTER TABLE users MODIFY COLUMN twoFactorSecret VARCHAR(100) NULL');
    for (const [table, column] of [...COLUMNS].reverse()) {
      if (await queryRunner.hasColumn(table, column)) await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
    await queryRunner.query("DELETE FROM lead_activities WHERE type IN ('erase','unsubscribe')");
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${BEFORE}) NOT NULL`);
  }
}
