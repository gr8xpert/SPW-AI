import { MigrationInterface, QueryRunner } from 'typeorm';

// 5R — per-tenant sender-domain verification. Adds the tenant_email_domains
// table that tracks (domain, dkim keypair, spf/dkim/dmarc verifiedAt).
//
// dkimPrivateKey is TEXT because PEM PKCS#8 + the `enc:v1:` cipher wrapper
// for a 2048-bit key comfortably clears VARCHAR(255). dkimPublicKey fits
// in ~450 chars but TEXT is still simpler than guessing a tight bound.
export class TenantEmailDomain1776303900000 implements MigrationInterface {
  name = 'TenantEmailDomain1776303900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenant_email_domains (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL UNIQUE,
        domain VARCHAR(255) NOT NULL,
        dkimSelector VARCHAR(50) NOT NULL DEFAULT 'spw1',
        dkimPublicKey TEXT NOT NULL,
        dkimPrivateKey TEXT NOT NULL,
        spfVerifiedAt TIMESTAMP NULL DEFAULT NULL,
        dkimVerifiedAt TIMESTAMP NULL DEFAULT NULL,
        dmarcVerifiedAt TIMESTAMP NULL DEFAULT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_tenant_email_domain_tenant
          FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_email_domain_domain (domain)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS tenant_email_domains`);
  }
}
