import { MigrationInterface, QueryRunner } from 'typeorm';

const KEY_RENAMES: [string, string][] = [
  ['search.title', 'search_title'],
  ['search.location', 'location_placeholder'],
  ['search.type', 'property_type'],
  ['search.minPrice', 'price_min'],
  ['search.maxPrice', 'price_max'],
  ['search.bedrooms', 'bedrooms_label'],
  ['search.bathrooms', 'bathrooms_label'],
  ['search.button', 'search_button'],
  ['search.reset', 'reset_button'],
  ['search.any', 'bedrooms_any'],
  ['results.title', 'results_title'],
  ['results.count', 'results_count'],
  ['results.noResults', 'results_no_results'],
  ['results.sortBy', 'sort_label'],
  ['results.featured', 'sort_featured'],
  ['detail.price', 'detail_price'],
  ['detail.priceOnRequest', 'price_on_request'],
  ['detail.bedrooms', 'card_bedrooms'],
  ['detail.bathrooms', 'card_bathrooms'],
  ['detail.buildSize', 'card_build_size'],
  ['detail.plotSize', 'card_plot_size'],
  ['detail.terraceSize', 'detail_terrace'],
  ['detail.features', 'detail_features'],
  ['detail.description', 'detail_description'],
  ['detail.location', 'detail_location'],
  ['detail.reference', 'reference_label'],
  ['detail.contactAgent', 'inquiry_title'],
  ['unit.sqm', 'unit_sqm'],
  ['unit.sqft', 'unit_sqft'],
  ['listing.sale', 'listing_type_sale'],
  ['listing.rent', 'listing_type_rent'],
  ['listing.development', 'listing_type_development'],
];

export class LabelKeyRename1776314900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [oldKey, newKey] of KEY_RENAMES) {
      await queryRunner.query(
        `UPDATE labels l SET l.\`key\` = ? WHERE l.\`key\` = ? AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM labels WHERE \`key\` = ? AND tenantId = l.tenantId) dup)`,
        [newKey, oldKey, newKey],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [oldKey, newKey] of KEY_RENAMES) {
      await queryRunner.query(
        `UPDATE labels SET \`key\` = ? WHERE \`key\` = ?`,
        [oldKey, newKey],
      );
    }
  }
}
