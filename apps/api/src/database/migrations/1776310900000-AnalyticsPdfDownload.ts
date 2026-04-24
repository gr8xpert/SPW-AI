import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnalyticsPdfDownload1776310900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE property_views ADD COLUMN pdfDownloaded TINYINT NOT NULL DEFAULT 0 AFTER inquiryMade`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE property_views DROP COLUMN pdfDownloaded`,
    );
  }
}
