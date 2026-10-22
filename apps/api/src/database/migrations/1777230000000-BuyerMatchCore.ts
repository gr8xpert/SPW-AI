import { MigrationInterface, QueryRunner } from 'typeorm';
import { DEFAULT_STAGES, splitName, statusToStageIndex } from '../../modules/lead/buyer/buyer-defaults';

// Buyer Match, milestone A1: leads become buyer records.
// Every UPDATE on leads sets updatedAt = updatedAt: the column has ON UPDATE
// CURRENT_TIMESTAMP, and a bumped updatedAt would make every buyer look
// active today (lastActivityAt is built from it).
// - leads gains the buyer columns (role, contact, legal, pipeline, wishlist…)
// - buyer_stages (per tenant, seeded with the 9 defaults) replaces the fixed
//   status list on the board; every lead gets the stage of its old status
// - lead_agents holds related agents
// - lead_activities.userId may be NULL (website / system activity)
// - duplicate leads of one contact are soft-merged into the oldest one
//   (mergedIntoId); nothing is deleted and down() undoes it
// - the old budget/preferred* columns are copied into leads.wishlist and left
//   in place
// - dashboardAddons gains buyerMatch:false
const OLD_ACTIVITY_TYPES = "'note','call','email','sms','viewing','offer','meeting','status_change','assignment'";
const NEW_ACTIVITY_TYPES = `${OLD_ACTIVITY_TYPES},'enquiry','wishlist_form','task_done','suggestion_sent','import','merge'`;

const LEAD_COLUMNS: [string, string][] = [
  ['role', "ENUM('buyer','registered','seller','professional','estate_agent','developer','landlord','tenant') NOT NULL DEFAULT 'buyer'"],
  ['firstName', 'VARCHAR(100) NULL'],
  ['lastName', 'VARCHAR(100) NULL'],
  ['phone', 'VARCHAR(50) NULL'],
  ['mobile', 'VARCHAR(50) NULL'],
  ['language', 'VARCHAR(5) NULL'],
  ['preferredContact', "ENUM('call','email','whatsapp') NULL"],
  ['photoUrl', 'VARCHAR(500) NULL'],
  ['street', 'VARCHAR(255) NULL'],
  ['street2', 'VARCHAR(255) NULL'],
  ['city', 'VARCHAR(100) NULL'],
  ['zip', 'VARCHAR(20) NULL'],
  ['state', 'VARCHAR(100) NULL'],
  ['country', 'VARCHAR(2) NULL'],
  ['idType', 'VARCHAR(50) NULL'],
  ['idNumber', 'VARCHAR(50) NULL'],
  ['lawyer', 'VARCHAR(255) NULL'],
  ['stageId', 'INT NULL'],
  ['subStatus', 'VARCHAR(100) NULL'],
  ['priority', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
  ['dealValue', 'DECIMAL(15,2) NULL'],
  ['waitingReplyAt', 'DATE NULL'],
  ['referredBy', 'VARCHAR(150) NULL'],
  ['referralPercent', 'DECIMAL(5,2) NULL'],
  ['visitStart', 'DATE NULL'],
  ['visitEnd', 'DATE NULL'],
  ['wishlist', 'JSON NULL'],
  ['answers', 'JSON NULL'],
  ['relatedContacts', 'JSON NULL'],
  ['mergedIntoId', 'INT NULL'],
  ['lastActivityAt', 'TIMESTAMP NULL'],
  ['importRef', 'VARCHAR(50) NULL'],
];

const toNumbers = (v: unknown): number[] | undefined => {
  const arr = typeof v === 'string' ? JSON.parse(v) : v;
  return Array.isArray(arr) && arr.length ? arr.map(Number).filter(Number.isFinite) : undefined;
};

export class BuyerMatchCore1777230000000 implements MigrationInterface {
  name = 'BuyerMatchCore1777230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('buyer_stages'))) {
      await queryRunner.query(`
        CREATE TABLE buyer_stages (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenantId INT NOT NULL,
          name JSON NOT NULL,
          color VARCHAR(9) NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          kind ENUM('open','won','lost') NOT NULL DEFAULT 'open',
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX IDX_buyer_stages_tenant_sort (tenantId, sortOrder),
          CONSTRAINT FK_buyer_stages_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasTable('lead_agents'))) {
      await queryRunner.query(`
        CREATE TABLE lead_agents (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          leadId INT NOT NULL,
          userId INT NOT NULL,
          UNIQUE INDEX IDX_lead_agents_lead_user (leadId, userId),
          INDEX IDX_lead_agents_user (userId),
          CONSTRAINT FK_lead_agents_lead FOREIGN KEY (leadId) REFERENCES leads(id) ON DELETE CASCADE,
          CONSTRAINT FK_lead_agents_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`);
    }

    if (!(await queryRunner.hasColumn('leads', 'role'))) {
      const adds = LEAD_COLUMNS.map(([name, def]) => `ADD COLUMN \`${name}\` ${def}`).join(', ');
      await queryRunner.query(`ALTER TABLE leads ${adds}`);
      await queryRunner.query(`
        ALTER TABLE leads
          ADD INDEX idx_leads_buyer_list (tenantId, mergedIntoId, stageId),
          ADD INDEX idx_leads_last_activity (tenantId, lastActivityAt),
          ADD CONSTRAINT FK_leads_stage FOREIGN KEY (stageId) REFERENCES buyer_stages(id) ON DELETE SET NULL,
          ADD CONSTRAINT FK_leads_merged_into FOREIGN KEY (mergedIntoId) REFERENCES leads(id) ON DELETE SET NULL`);
    }

    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN userId INT NULL`);
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${NEW_ACTIVITY_TYPES}) NOT NULL`);

    // Stages for every tenant that has none, then each lead gets the stage
    // of its old status.
    const tenants: { id: number }[] = await queryRunner.query(
      'SELECT t.id FROM tenants t WHERE NOT EXISTS (SELECT 1 FROM buyer_stages s WHERE s.tenantId = t.id)',
    );
    for (const { id: tenantId } of tenants) {
      const stageIds: number[] = [];
      for (const [i, s] of DEFAULT_STAGES.entries()) {
        const res = await queryRunner.query(
          'INSERT INTO buyer_stages (tenantId, name, color, sortOrder, kind) VALUES (?, ?, ?, ?, ?)',
          [tenantId, JSON.stringify(s.name), s.color, i, s.kind],
        );
        stageIds.push(res.insertId);
      }
      const statuses = ['new', 'contacted', 'qualified', 'viewing_scheduled', 'offer_made', 'negotiating', 'won', 'lost'] as const;
      for (const status of statuses) {
        await queryRunner.query('UPDATE leads SET stageId = ?, updatedAt = updatedAt WHERE tenantId = ? AND status = ? AND stageId IS NULL', [
          stageIds[statusToStageIndex(status)],
          tenantId,
          status,
        ]);
      }
    }

    // Names, phone and wishlist from the contact and the old columns.
    const rows: any[] = await queryRunner.query(`
      SELECT l.id, c.name, c.phone, l.budgetMin, l.budgetMax, l.budgetCurrency, l.preferredLocations,
             l.preferredTypes, l.preferredFeatures, l.preferredBedroomsMin, l.wishlist
        FROM leads l JOIN contacts c ON c.id = l.contactId
       WHERE l.firstName IS NULL AND l.lastName IS NULL`);
    for (const r of rows) {
      const { firstName, lastName } = splitName(r.name);
      let wishlist: Record<string, unknown> | null = null;
      if (!r.wishlist) {
        const w: Record<string, unknown> = {
          budgetMin: r.budgetMin != null ? Number(r.budgetMin) : undefined,
          budgetMax: r.budgetMax != null ? Number(r.budgetMax) : undefined,
          locationIds: toNumbers(r.preferredLocations),
          propertyTypeIds: toNumbers(r.preferredTypes),
          featureIds: toNumbers(r.preferredFeatures),
          minBedrooms: r.preferredBedroomsMin != null ? Number(r.preferredBedroomsMin) : undefined,
        };
        for (const k of Object.keys(w)) if (w[k] === undefined) delete w[k];
        if (Object.keys(w).length) wishlist = { ...w, currency: r.budgetCurrency || 'EUR' };
      }
      await queryRunner.query(
        'UPDATE leads SET updatedAt = updatedAt, firstName = ?, lastName = ?, phone = COALESCE(phone, ?), wishlist = COALESCE(wishlist, ?) WHERE id = ?',
        [firstName, lastName, r.phone || null, wishlist ? JSON.stringify(wishlist) : null, r.id],
      );
    }

    await queryRunner.query(`
      UPDATE leads l
         SET l.updatedAt = l.updatedAt, l.lastActivityAt = GREATEST(l.updatedAt,
               COALESCE((SELECT MAX(a.createdAt) FROM lead_activities a WHERE a.leadId = l.id), l.updatedAt))
       WHERE l.lastActivityAt IS NULL`);

    // Soft-merge: one buyer per contact (= per email), the oldest lead kept.
    await queryRunner.query(`
      UPDATE leads l
        JOIN (SELECT contactId, MIN(id) AS keepId FROM leads GROUP BY contactId HAVING COUNT(*) > 1) d
          ON d.contactId = l.contactId AND l.id <> d.keepId
         SET l.updatedAt = l.updatedAt, l.mergedIntoId = d.keepId
       WHERE l.mergedIntoId IS NULL`);
    await queryRunner.query(`
      UPDATE leads k
        JOIN (SELECT mergedIntoId, MAX(lastActivityAt) AS last FROM leads WHERE mergedIntoId IS NOT NULL GROUP BY mergedIntoId) m
          ON m.mergedIntoId = k.id
         SET k.updatedAt = k.updatedAt, k.lastActivityAt = GREATEST(COALESCE(k.lastActivityAt, m.last), m.last)`);

    await queryRunner.query(`
      UPDATE tenants
         SET dashboardAddons = JSON_SET(COALESCE(dashboardAddons, JSON_OBJECT()), '$.buyerMatch', false)
       WHERE dashboardAddons IS NULL OR JSON_EXTRACT(dashboardAddons, '$.buyerMatch') IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tenants SET dashboardAddons = JSON_REMOVE(dashboardAddons, '$.buyerMatch')
       WHERE dashboardAddons IS NOT NULL AND JSON_EXTRACT(dashboardAddons, '$.buyerMatch') IS NOT NULL`);

    await queryRunner.query('DELETE FROM lead_activities WHERE userId IS NULL');
    await queryRunner.query(`DELETE FROM lead_activities WHERE type NOT IN (${OLD_ACTIVITY_TYPES})`);
    await queryRunner.query(`ALTER TABLE lead_activities MODIFY COLUMN type ENUM(${OLD_ACTIVITY_TYPES}) NOT NULL`);
    await queryRunner.query('ALTER TABLE lead_activities MODIFY COLUMN userId INT NOT NULL');

    if (await queryRunner.hasColumn('leads', 'role')) {
      await queryRunner.query(`
        ALTER TABLE leads
          DROP FOREIGN KEY FK_leads_stage,
          DROP FOREIGN KEY FK_leads_merged_into`);
      await queryRunner.query('ALTER TABLE leads DROP INDEX idx_leads_buyer_list, DROP INDEX idx_leads_last_activity');
      const drops = LEAD_COLUMNS.map(([name]) => `DROP COLUMN \`${name}\``).join(', ');
      await queryRunner.query(`ALTER TABLE leads ${drops}`);
    }
    await queryRunner.query('DROP TABLE IF EXISTS lead_agents');
    await queryRunner.query('DROP TABLE IF EXISTS buyer_stages');
  }
}
