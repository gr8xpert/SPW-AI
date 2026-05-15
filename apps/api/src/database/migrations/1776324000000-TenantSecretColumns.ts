import { MigrationInterface, QueryRunner } from 'typeorm';
import { encryptSecret } from '../../common/crypto/secret-cipher';

// Splits secret/sensitive fields out of the broad `tenants.settings` JSON blob
// into dedicated columns so they're no longer returned to the dashboard or any
// future consumer of TenantPublic.
//
//   - tenants.recaptchaSecretKey  (NEW, encrypted) ← settings.recaptchaSecretKey
//   - tenants.inquiryWebhookUrl   (NEW, plaintext varchar) ← settings.inquiryWebhookUrl
//   - tenants.openrouterApiKey    (EXISTING, encrypted) ← settings.openRouterApiKey
//
// Existing JSON values are read, written to the new columns, and stripped from
// the settings blob in the same pass. Keys that never had a value are skipped.
export class TenantSecretColumns1776324000000 implements MigrationInterface {
  name = 'TenantSecretColumns1776324000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants ADD COLUMN recaptchaSecretKey VARCHAR(500) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE tenants ADD COLUMN inquiryWebhookUrl VARCHAR(500) NULL`,
    );

    const rows: Array<{ id: number; settings: string | null | object }> = await queryRunner.query(
      `SELECT id, settings FROM tenants`,
    );

    for (const row of rows) {
      let settings: Record<string, any> | null = null;
      if (typeof row.settings === 'string') {
        try {
          settings = JSON.parse(row.settings);
        } catch {
          settings = null;
        }
      } else if (row.settings && typeof row.settings === 'object') {
        settings = row.settings as Record<string, any>;
      }

      if (!settings) continue;

      const recaptcha = typeof settings.recaptchaSecretKey === 'string' ? settings.recaptchaSecretKey.trim() : '';
      const openRouter = typeof settings.openRouterApiKey === 'string' ? settings.openRouterApiKey.trim() : '';
      const inquiryUrl = typeof settings.inquiryWebhookUrl === 'string' ? settings.inquiryWebhookUrl.trim() : '';

      if (recaptcha) {
        await queryRunner.query(
          `UPDATE tenants SET recaptchaSecretKey = ? WHERE id = ?`,
          [encryptSecret(recaptcha), row.id],
        );
      }
      if (openRouter) {
        // Only fill the dedicated column when it isn't already set — preserves
        // a key the operator might have already moved via the dashboard during
        // the 5P/5Q transition.
        await queryRunner.query(
          `UPDATE tenants SET openrouterApiKey = ? WHERE id = ? AND (openrouterApiKey IS NULL OR openrouterApiKey = '')`,
          [encryptSecret(openRouter), row.id],
        );
      }
      if (inquiryUrl) {
        await queryRunner.query(
          `UPDATE tenants SET inquiryWebhookUrl = ? WHERE id = ?`,
          [inquiryUrl, row.id],
        );
      }

      if (recaptcha || openRouter || inquiryUrl) {
        delete settings.recaptchaSecretKey;
        delete settings.openRouterApiKey;
        delete settings.inquiryWebhookUrl;
        await queryRunner.query(
          `UPDATE tenants SET settings = ? WHERE id = ?`,
          [JSON.stringify(settings), row.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Down does NOT decrypt and copy back into the JSON blob — exposing
    // plaintext secrets on rollback would defeat the point. Drop the columns
    // and let the operator restore from a pre-migration backup if rollback
    // is required.
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN inquiryWebhookUrl`);
    await queryRunner.query(`ALTER TABLE tenants DROP COLUMN recaptchaSecretKey`);
  }
}
