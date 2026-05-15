import { MigrationInterface, QueryRunner } from 'typeorm';
import { encryptSecret } from '../../common/crypto/secret-cipher';

// Encrypts `feed_configs.credentials` in place.
//   1. Widen column JSON → TEXT so ciphertext (base64) fits.
//   2. Walk each row, encrypt its JSON-serialised credentials, write back.
//
// Rows that are already encrypted (enc:v1: prefix) are skipped — re-running
// this migration is safe.
export class EncryptFeedCredentials1776325000000 implements MigrationInterface {
  name = 'EncryptFeedCredentials1776325000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Snapshot existing values BEFORE altering the column. MySQL's JSON →
    // TEXT cast preserves the JSON text representation, but capturing pre-cast
    // values is more robust against driver edge cases.
    const rows: Array<{ id: number; credentials: string | object | null }> =
      await queryRunner.query(`SELECT id, credentials FROM feed_configs`);

    await queryRunner.query(
      `ALTER TABLE feed_configs MODIFY COLUMN credentials TEXT NOT NULL`,
    );

    for (const row of rows) {
      if (row.credentials === null || row.credentials === undefined) continue;

      // MySQL JSON columns return parsed objects; we serialise back so the
      // ciphertext payload is a deterministic JSON string.
      let raw: string;
      if (typeof row.credentials === 'string') {
        raw = row.credentials;
        if (raw.startsWith('enc:v1:')) continue;
      } else if (typeof row.credentials === 'object') {
        raw = JSON.stringify(row.credentials);
      } else {
        continue;
      }

      const ciphertext = encryptSecret(raw);
      await queryRunner.query(
        `UPDATE feed_configs SET credentials = ? WHERE id = ?`,
        [ciphertext, row.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Same policy as SecretEncryptionWidening: do not decrypt back into a
    // plaintext column on rollback. Restore from backup if you genuinely
    // need to revert.
    await queryRunner.query(
      `ALTER TABLE feed_configs MODIFY COLUMN credentials TEXT NOT NULL`,
    );
  }
}
