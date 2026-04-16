import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoreFeatures1712433600000 implements MigrationInterface {
  name = 'CoreFeatures1712433600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create property_types table
    await queryRunner.query(`
      CREATE TABLE property_types (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        name JSON NOT NULL,
        slug VARCHAR(100) NOT NULL,
        icon VARCHAR(100),
        sortOrder INT DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_slug (tenantId, slug),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create features table
    await queryRunner.query(`
      CREATE TABLE features (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        category ENUM('interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other') NOT NULL,
        name JSON NOT NULL,
        icon VARCHAR(100),
        sortOrder INT DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant_category (tenantId, category),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create locations table
    await queryRunner.query(`
      CREATE TABLE locations (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        parentId INT,
        level ENUM('country', 'province', 'municipality', 'town', 'area') NOT NULL,
        name JSON NOT NULL,
        slug VARCHAR(100) NOT NULL,
        externalId VARCHAR(100),
        lat DECIMAL(10, 8),
        lng DECIMAL(11, 8),
        propertyCount INT DEFAULT 0,
        sortOrder INT DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_slug (tenantId, slug),
        INDEX idx_tenant_level (tenantId, level),
        INDEX idx_parent (parentId),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (parentId) REFERENCES locations(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create location_groups table
    await queryRunner.query(`
      CREATE TABLE location_groups (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        name JSON NOT NULL,
        slug VARCHAR(100) NOT NULL,
        locationIds JSON NOT NULL,
        sortOrder INT DEFAULT 0,
        isActive BOOLEAN DEFAULT TRUE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_slug (tenantId, slug),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create labels table
    await queryRunner.query(`
      CREATE TABLE labels (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        \`key\` VARCHAR(100) NOT NULL,
        translations JSON NOT NULL,
        isCustom BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_key (tenantId, \`key\`),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create properties table
    await queryRunner.query(`
      CREATE TABLE properties (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenantId INT NOT NULL,
        reference VARCHAR(50) NOT NULL,
        agentReference VARCHAR(100),
        externalId VARCHAR(100),
        source ENUM('resales', 'inmoba', 'infocasa', 'redsp', 'manual') DEFAULT 'manual',
        listingType ENUM('sale', 'rent', 'development') NOT NULL,
        propertyTypeId INT,
        locationId INT,
        urbanization VARCHAR(255),
        price DECIMAL(15,2),
        priceOnRequest BOOLEAN DEFAULT FALSE,
        currency VARCHAR(3) DEFAULT 'EUR',
        bedrooms TINYINT UNSIGNED,
        bathrooms TINYINT UNSIGNED,
        buildSize DECIMAL(10,2),
        plotSize DECIMAL(10,2),
        terraceSize DECIMAL(10,2),
        gardenSize DECIMAL(10,2),
        title JSON,
        description JSON,
        images JSON,
        videoUrl VARCHAR(500),
        virtualTourUrl VARCHAR(500),
        floorPlanUrl VARCHAR(500),
        features JSON,
        lat DECIMAL(10, 8),
        lng DECIMAL(11, 8),
        deliveryDate DATE,
        status ENUM('draft', 'active', 'sold', 'rented', 'archived') DEFAULT 'draft',
        isFeatured BOOLEAN DEFAULT FALSE,
        isPublished BOOLEAN DEFAULT FALSE,
        syncEnabled BOOLEAN DEFAULT TRUE,
        lockedFields JSON,
        importedAt TIMESTAMP NULL,
        publishedAt TIMESTAMP NULL,
        soldAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_ref (tenantId, reference),
        UNIQUE KEY unique_tenant_external (tenantId, source, externalId),
        INDEX idx_tenant_status (tenantId, status),
        INDEX idx_tenant_listing (tenantId, listingType),
        INDEX idx_tenant_location (tenantId, locationId),
        INDEX idx_search (tenantId, status, isPublished, listingType, price, bedrooms),
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (propertyTypeId) REFERENCES property_types(id) ON DELETE SET NULL,
        FOREIGN KEY (locationId) REFERENCES locations(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS properties`);
    await queryRunner.query(`DROP TABLE IF EXISTS labels`);
    await queryRunner.query(`DROP TABLE IF EXISTS location_groups`);
    await queryRunner.query(`DROP TABLE IF EXISTS locations`);
    await queryRunner.query(`DROP TABLE IF EXISTS features`);
    await queryRunner.query(`DROP TABLE IF EXISTS property_types`);
  }
}
