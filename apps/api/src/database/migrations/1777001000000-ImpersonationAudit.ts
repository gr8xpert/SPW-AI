import { MigrationInterface, QueryRunner } from 'typeorm';

// Creates the impersonation_audit table backing super-admin "login as
// client" sessions. Idempotent via IF NOT EXISTS so re-runs on partially
// migrated databases are safe.
export class ImpersonationAudit1777001000000 implements MigrationInterface {
  name = 'ImpersonationAudit1777001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS impersonation_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sessionId CHAR(32) NOT NULL,
        superAdminUserId INT NOT NULL,
        tenantId INT NOT NULL,
        impersonatedUserId INT NULL,
        action VARCHAR(16) NOT NULL,
        method VARCHAR(8) NULL,
        path VARCHAR(500) NULL,
        ipAddress VARCHAR(45) NULL,
        userAgent VARCHAR(500) NULL,
        endedAt TIMESTAMP NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_impersonation_super_admin (superAdminUserId, createdAt),
        INDEX idx_impersonation_tenant (tenantId, createdAt),
        INDEX idx_impersonation_session (sessionId)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS impersonation_audit`);
  }
}
