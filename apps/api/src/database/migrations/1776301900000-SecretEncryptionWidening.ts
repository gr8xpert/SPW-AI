import { MigrationInterface, QueryRunner } from 'typeorm';
import { encryptSecret } from '../../common/crypto/secret-cipher';

// Encryption rollout for the remaining plaintext secrets:
//   - tenants.webhookSecret  (was VARCHAR(128); widen to VARCHAR(255))
//   - tenant_email_configs.smtpPassword (VARCHAR(255) → TEXT)
//   - tenant_email_configs.apiKey        (VARCHAR(255) → TEXT)
//
// After widening, each existing plaintext row is re-encrypted through the
// shared cipher. The cipher's decrypt side already passes unprefixed values
// through unchanged, so a half-migrated table is safe — but re-encrypting
// eagerly means nothing sits plaintext at rest past this migration's commit.
//
// Requires ENCRYPTION_KEY to be set in env before the migration runs. The
// app boot already enforces the same requirement, so this is typically
// satisfied by the .env that `pnpm db:migrate` loads.
export class SecretEncryptionWidening1776301900000 implements MigrationInterface {
  name = 'SecretEncryptionWidening1776301900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tenants MODIFY COLUMN webhookSecret VARCHAR(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE tenant_email_configs MODIFY COLUMN smtpPassword TEXT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE tenant_email_configs MODIFY COLUMN apiKey TEXT NULL`,
    );

    await encryptColumn(queryRunner, 'tenants', 'id', 'webhookSecret');
    await encryptColumn(queryRunner, 'tenant_email_configs', 'id', 'smtpPassword');
    await encryptColumn(queryRunner, 'tenant_email_configs', 'id', 'apiKey');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally does NOT decrypt on rollback — if encryption has ever
    // been enabled, the operator is expected to restore from a pre-5F
    // backup rather than round-trip plaintext through a down migration.
    // Column widths stay; shrinking back would risk truncating ciphertext.
  }
}

// Walks every row, encrypts any value that isn't already `enc:v1:` prefixed,
// and writes it back. We page in batches of 500 so a large email-config
// table doesn't lock the connection for a noticeable window.
async function encryptColumn(
  queryRunner: QueryRunner,
  table: string,
  idColumn: string,
  column: string,
): Promise<void> {
  const BATCH = 500;
  let lastId = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows: Array<Record<string, string | number | null>> = await queryRunner.query(
      `SELECT ${idColumn} AS id, ${column} AS value FROM ${table} ` +
        `WHERE ${idColumn} > ? ORDER BY ${idColumn} ASC LIMIT ${BATCH}`,
      [lastId],
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      const value = row.value;
      if (value === null || value === undefined || value === '') continue;
      if (typeof value !== 'string') continue;
      if (value.startsWith('enc:v1:')) continue; // already encrypted
      const ciphertext = encryptSecret(value);
      await queryRunner.query(
        `UPDATE ${table} SET ${column} = ? WHERE ${idColumn} = ?`,
        [ciphertext, row.id],
      );
    }

    const last = rows[rows.length - 1].id;
    if (typeof last !== 'number') break;
    lastId = last;
    if (rows.length < BATCH) break;
  }
}
