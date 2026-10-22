import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomBytes } from 'crypto';

// Agents page (2026-10-22): one list of people for the website and for buyers.
// Website card details on users, two switches (website / buyers) and people
// without a dashboard login. Existing property agents stay on the website;
// a typed Settings → Widget website agent becomes a no-login person.
const COLUMNS: [column: string, ddl: string][] = [
  ['title', 'VARCHAR(120) NULL'],
  ['phone', 'VARCHAR(40) NULL'],
  ['whatsapp', 'VARCHAR(40) NULL'],
  ['publicEmail', 'VARCHAR(200) NULL'],
  ['showOnWebsite', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['worksBuyers', 'TINYINT(1) NOT NULL DEFAULT 1'],
  ['canLogin', 'TINYINT(1) NOT NULL DEFAULT 1'],
];

const text = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return s || null;
};

export class AgentsPage1777340000000 implements MigrationInterface {
  name = 'AgentsPage1777340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const added: string[] = [];
    for (const [column, ddl] of COLUMNS) {
      if (!(await queryRunner.hasColumn('users', column))) {
        await queryRunner.query(`ALTER TABLE users ADD COLUMN ${column} ${ddl}`);
        added.push(column);
      }
    }
    // Only on the first run: the website keeps showing today's listing agents.
    if (added.includes('showOnWebsite')) {
      await queryRunner.query(
        `UPDATE users u SET u.showOnWebsite = 1, u.updatedAt = u.updatedAt
          WHERE EXISTS (SELECT 1 FROM properties p WHERE p.agentId = u.id)`,
      );
    }

    // Typed website agents → a no-login person, linked by userId.
    const tenants: { id: number; settings: unknown }[] = await queryRunner.query(
      `SELECT id, settings FROM tenants WHERE JSON_EXTRACT(settings, '$.siteAgent.name') IS NOT NULL`,
    );
    for (const t of tenants) {
      const settings = (typeof t.settings === 'string' ? JSON.parse(t.settings) : t.settings) as Record<string, any> | null;
      const agent = settings?.siteAgent;
      if (!agent || typeof agent !== 'object' || agent.userId || !text(agent.name, 255)) continue;
      const email = `agent-${t.id}-${randomBytes(6).toString('hex')}@no-login.invalid`;
      const photo = text(agent.photo, 500);
      const res = await queryRunner.query(
        `INSERT INTO users (tenantId, email, passwordHash, name, role, avatarUrl, title, phone, whatsapp, publicEmail,
                            showOnWebsite, worksBuyers, canLogin, isActive, buyerDigest)
         VALUES (?, ?, '!', ?, 'user', ?, ?, ?, ?, ?, 1, 0, 0, 1, 0)`,
        [
          t.id, email, text(agent.name, 255), photo && /^https?:\/\//i.test(photo) ? photo : null,
          text(agent.title, 120), text(agent.phone, 40), text(agent.whatsapp, 40), text(agent.email, 200),
        ],
      );
      await queryRunner.query(
        `UPDATE tenants SET settings = JSON_SET(settings, '$.siteAgent.userId', ?) WHERE id = ?`,
        [Number(res.insertId), t.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The no-login people stay (they may be linked to listings by now);
    // only the columns go.
    for (const [column] of [...COLUMNS].reverse()) {
      if (await queryRunner.hasColumn('users', column)) await queryRunner.query(`ALTER TABLE users DROP COLUMN ${column}`);
    }
  }
}
