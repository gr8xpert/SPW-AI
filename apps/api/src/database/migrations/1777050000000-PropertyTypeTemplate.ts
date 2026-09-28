import { MigrationInterface, QueryRunner } from 'typeorm';
import { PROPERTY_TYPE_TEMPLATE_SEED } from '../../modules/property-type-template/seed/property-type-template.seed';
import { locationKey } from '../../modules/location-template/location-name';

// Platform-wide property-type template (groups Apartment / House / Plot /
// Commercial and their types), seeded from docs/property_types.csv with the
// Resales type codes. Imports match a listing's type by code first, so
// "Finca - Cortijo" and "Finca - Rural Estate" (both 2-6) are one type and a
// Resales "New Development" is placed by its real unit type.
//
// Also: property_types.templateNodeId + userLocked, properties.feedType, and
// the list of feed types the template doesn't know yet.
export class PropertyTypeTemplate1777050000000 implements MigrationInterface {
  name = 'PropertyTypeTemplate1777050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('property_type_template_nodes'))) {
      await queryRunner.query(`
        CREATE TABLE property_type_template_nodes (
          id INT NOT NULL AUTO_INCREMENT,
          parentId INT NULL,
          name VARCHAR(150) NOT NULL,
          nameKey VARCHAR(150) NOT NULL,
          codes JSON NULL,
          translations JSON NULL,
          aliases JSON NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          status ENUM('ok','needs_review','ai_suggested') NOT NULL DEFAULT 'ok',
          note VARCHAR(500) NULL,
          createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          INDEX IDX_property_type_template_nodes_parentId (parentId),
          INDEX IDX_property_type_template_nodes_nameKey (nameKey),
          CONSTRAINT FK_property_type_template_nodes_parent FOREIGN KEY (parentId)
            REFERENCES property_type_template_nodes (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      const ids: number[] = [];
      let sort = 0;
      for (const [parentIndex, name, codes, translations, aliases] of PROPERTY_TYPE_TEMPLATE_SEED) {
        const result = await queryRunner.query(
          `INSERT INTO property_type_template_nodes (parentId, name, nameKey, codes, translations, aliases, sortOrder)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            parentIndex >= 0 ? ids[parentIndex] : null,
            name,
            locationKey(name),
            JSON.stringify(codes),
            JSON.stringify(translations),
            aliases.length ? JSON.stringify(aliases) : null,
            sort++,
          ],
        );
        ids.push(Number(result.insertId));
      }
    }

    if (!(await queryRunner.hasTable('property_type_template_unmatched'))) {
      await queryRunner.query(`
        CREATE TABLE property_type_template_unmatched (
          id INT NOT NULL AUTO_INCREMENT,
          matchKey VARCHAR(300) NOT NULL,
          provider VARCHAR(30) NOT NULL,
          name VARCHAR(150) NOT NULL,
          code VARCHAR(30) NULL,
          parentName VARCHAR(150) NULL,
          parentCode VARCHAR(30) NULL,
          placedUnderNodeId INT NULL,
          tenantIds JSON NULL,
          occurrences INT NOT NULL DEFAULT 0,
          resolvedNodeId INT NULL,
          dismissed TINYINT(1) NOT NULL DEFAULT 0,
          aiAttempted TINYINT(1) NOT NULL DEFAULT 0,
          firstSeenAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          lastSeenAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE INDEX uq_property_type_template_unmatched_key (matchKey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await queryRunner.hasColumn('property_types', 'templateNodeId'))) {
      await queryRunner.query(`ALTER TABLE property_types ADD COLUMN templateNodeId INT NULL`);
      await queryRunner.query(`ALTER TABLE property_types ADD INDEX IDX_property_types_templateNodeId (templateNodeId)`);
    }
    if (!(await queryRunner.hasColumn('property_types', 'userLocked'))) {
      await queryRunner.query(`ALTER TABLE property_types ADD COLUMN userLocked TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!(await queryRunner.hasColumn('properties', 'feedType'))) {
      await queryRunner.query(`ALTER TABLE properties ADD COLUMN feedType JSON NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE properties DROP COLUMN feedType`);
    await queryRunner.query(`ALTER TABLE property_types DROP COLUMN userLocked`);
    await queryRunner.query(`ALTER TABLE property_types DROP INDEX IDX_property_types_templateNodeId`);
    await queryRunner.query(`ALTER TABLE property_types DROP COLUMN templateNodeId`);
    await queryRunner.query(`DROP TABLE property_type_template_unmatched`);
    await queryRunner.query(`DROP TABLE property_type_template_nodes`);
  }
}
