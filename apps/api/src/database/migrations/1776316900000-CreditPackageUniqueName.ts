import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditPackageUniqueName1776316900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep only the lowest-id row for each duplicate name, delete the rest
    await queryRunner.query(`
      DELETE cp FROM credit_packages cp
      INNER JOIN (
        SELECT name, MIN(id) AS keep_id
        FROM credit_packages
        GROUP BY name
        HAVING COUNT(*) > 1
      ) dups ON cp.name = dups.name AND cp.id != dups.keep_id
    `);

    await queryRunner.query(
      `ALTER TABLE credit_packages ADD CONSTRAINT UQ_credit_packages_name UNIQUE (name)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE credit_packages DROP INDEX UQ_credit_packages_name`,
    );
  }
}
