import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import { PROPERTY_SOURCES } from '@spm/shared';
import { Property } from '../../../database/entities/property.entity';
import { ListPropertyDto } from './list-property.dto';

// The dashboard Source filter sends any properties.source value. A hand-kept
// list in the DTO once lacked kyero/odoo, so filtering by them returned 400.
describe('ListPropertyDto source', () => {
  const errorsFor = async (query: Record<string, unknown>) =>
    validate(plainToInstance(ListPropertyDto, query));

  it.each(PROPERTY_SOURCES)('accepts source=%s', async (source) => {
    expect(await errorsFor({ source })).toHaveLength(0);
  });

  it('rejects an unknown source', async () => {
    const errors = await errorsFor({ source: 'idealista' });
    expect(errors.map((e) => e.property)).toEqual(['source']);
  });

  it('matches the properties.source column enum', () => {
    const column = getMetadataArgsStorage().columns.find(
      (c) => c.target === Property && c.propertyName === 'source',
    );
    expect([...(column?.options.enum as string[])].sort()).toEqual([...PROPERTY_SOURCES].sort());
  });
});
