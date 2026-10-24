import { MigrationInterface, QueryRunner } from 'typeorm';

// WhatsApp send (2026-10-24): property selections go out by WhatsApp
// click-to-chat as well as by email. buyer_sends.channel tells a tracked
// click which one it came from; the timeline source and the activity type
// gain 'whatsapp'. Enum lists are read from the table so a value added by a
// later migration elsewhere is never dropped.
async function addEnumValue(queryRunner: QueryRunner, table: string, column: string, value: string, tail: string): Promise<void> {
  const rows = (await queryRunner.query(
    'SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  )) as { t: string }[];
  const type = rows[0]?.t;
  if (!type || !/^enum\(/i.test(type) || type.includes(`'${value}'`)) return;
  await queryRunner.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${type.replace(/\)$/, `,'${value}')`)} ${tail}`);
}

async function dropEnumValue(queryRunner: QueryRunner, table: string, column: string, value: string, tail: string): Promise<void> {
  const rows = (await queryRunner.query(
    'SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  )) as { t: string }[];
  const type = rows[0]?.t;
  if (!type || !type.includes(`'${value}'`)) return;
  await queryRunner.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${type.replace(`,'${value}'`, '')} ${tail}`);
}

export class WhatsAppSend1777440000000 implements MigrationInterface {
  name = 'WhatsAppSend1777440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('buyer_sends', 'channel'))) {
      await queryRunner.query("ALTER TABLE buyer_sends ADD COLUMN channel ENUM('email','whatsapp') NOT NULL DEFAULT 'email'");
    }
    await addEnumValue(queryRunner, 'lead_suggestion_events', 'source', 'whatsapp', 'NOT NULL');
    await addEnumValue(queryRunner, 'lead_activities', 'type', 'whatsapp', 'NOT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DELETE FROM lead_activities WHERE type = 'whatsapp'");
    await queryRunner.query("UPDATE lead_suggestion_events SET source = 'agent' WHERE source = 'whatsapp'");
    await dropEnumValue(queryRunner, 'lead_activities', 'type', 'whatsapp', 'NOT NULL');
    await dropEnumValue(queryRunner, 'lead_suggestion_events', 'source', 'whatsapp', 'NOT NULL');
    if (await queryRunner.hasColumn('buyer_sends', 'channel')) await queryRunner.query('ALTER TABLE buyer_sends DROP COLUMN channel');
  }
}
