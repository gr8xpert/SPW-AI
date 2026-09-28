import { MigrationInterface, QueryRunner } from 'typeorm';
import { LOCATION_TEMPLATE_SEED } from '../../modules/location-template/seed/location-template.seed';
import { locationKey, LOCATION_LEVELS } from '../../modules/location-template/location-name';

// Platform-wide location template (Region > Province > Area > Municipality >
// Town > Urbanization), seeded from the Odoo exports in docs/locations-*.csv.
// Feeds such as Resales send only Province / Area / Location / Sub-location,
// so imports place each listing by matching those names against the template.
//
// Also: locations.templateNodeId + userLocked (a tenant row's link to the
// template, and whether the client arranged it by hand), properties.feedLocation
// (the names the feed sent, for re-resolving later), and the list of feed
// locations the template doesn't know yet.
export class LocationTemplate1777040000000 implements MigrationInterface {
  name = 'LocationTemplate1777040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('location_template_nodes'))) {
      await queryRunner.query(`
        CREATE TABLE location_template_nodes (
          id INT NOT NULL AUTO_INCREMENT,
          parentId INT NULL,
          level ENUM('region','province','area','municipality','town','urbanization') NOT NULL,
          name VARCHAR(150) NOT NULL,
          nameKey VARCHAR(150) NOT NULL,
          aliases JSON NULL,
          postcode VARCHAR(20) NULL,
          lat DECIMAL(10,7) NULL,
          lng DECIMAL(11,7) NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          status ENUM('ok','needs_review','ai_suggested') NOT NULL DEFAULT 'ok',
          note VARCHAR(500) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          INDEX IDX_location_template_nodes_parentId (parentId),
          INDEX IDX_location_template_nodes_nameKey (nameKey),
          CONSTRAINT FK_location_template_nodes_parent FOREIGN KEY (parentId)
            REFERENCES location_template_nodes (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const ids: number[] = [];
      for (const [parentIndex, level, name, postcode, lat, lng, note] of LOCATION_TEMPLATE_SEED) {
        const result = await queryRunner.query(
          `INSERT INTO location_template_nodes (parentId, level, name, nameKey, postcode, lat, lng, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            parentIndex >= 0 ? ids[parentIndex] : null,
            LOCATION_LEVELS[level],
            name,
            locationKey(name),
            postcode,
            lat,
            lng,
            note ? 'needs_review' : 'ok',
            note,
          ],
        );
        ids.push(Number(result.insertId));
      }
    }

    if (!(await queryRunner.hasTable('location_template_unmatched'))) {
      await queryRunner.query(`
        CREATE TABLE location_template_unmatched (
          id INT NOT NULL AUTO_INCREMENT,
          matchKey VARCHAR(400) NOT NULL,
          provider VARCHAR(30) NOT NULL,
          province VARCHAR(150) NULL,
          area VARCHAR(150) NULL,
          name VARCHAR(150) NOT NULL,
          subName VARCHAR(150) NULL,
          placedUnderNodeId INT NULL,
          tenantIds JSON NULL,
          occurrences INT NOT NULL DEFAULT 0,
          lat DECIMAL(10,7) NULL,
          lng DECIMAL(11,7) NULL,
          resolvedNodeId INT NULL,
          dismissed TINYINT(1) NOT NULL DEFAULT 0,
          aiAttempted TINYINT(1) NOT NULL DEFAULT 0,
          firstSeenAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          lastSeenAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE INDEX uq_location_template_unmatched_key (matchKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasColumn('locations', 'templateNodeId'))) {
      await queryRunner.query(`ALTER TABLE locations ADD COLUMN templateNodeId INT NULL`);
      await queryRunner.query(`ALTER TABLE locations ADD INDEX IDX_locations_templateNodeId (templateNodeId)`);
    }
    if (!(await queryRunner.hasColumn('locations', 'userLocked'))) {
      await queryRunner.query(`ALTER TABLE locations ADD COLUMN userLocked TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!(await queryRunner.hasColumn('properties', 'feedLocation'))) {
      await queryRunner.query(`ALTER TABLE properties ADD COLUMN feedLocation JSON NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE properties DROP COLUMN feedLocation`);
    await queryRunner.query(`ALTER TABLE locations DROP COLUMN userLocked`);
    await queryRunner.query(`ALTER TABLE locations DROP INDEX IDX_locations_templateNodeId`);
    await queryRunner.query(`ALTER TABLE locations DROP COLUMN templateNodeId`);
    await queryRunner.query(`DROP TABLE location_template_unmatched`);
    await queryRunner.query(`DROP TABLE location_template_nodes`);
  }
}
