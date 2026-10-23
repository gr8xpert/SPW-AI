import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Website chat (2026-10-24): sessionId is now the visitor's proof a chat is
// theirs. Chats from before that used a guessable id (end of the public widget
// key + a timestamp), so give them a random one. Dashboard transcripts are kept.
// Node's randomUUID, not MySQL UUID(): that one is time-based and guessable.
export class ChatTokenReset1777420000000 implements MigrationInterface {
  name = 'ChatTokenReset1777420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: number; sessionId: string | null }[] = await queryRunner.query(
      'SELECT id, sessionId FROM chat_conversations',
    );
    for (const row of rows) {
      if (row.sessionId && UUID_RE.test(row.sessionId)) continue;
      await queryRunner.query('UPDATE chat_conversations SET sessionId = ? WHERE id = ?', [randomUUID(), row.id]);
    }
  }

  public async down(): Promise<void> {
    // The old ids are gone on purpose.
  }
}
