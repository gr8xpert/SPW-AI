import { FeatureService } from '../feature/feature.service';
import { PropertySearchService } from './property-search.service';
import { PropertyService } from './property.service';

// Counts on the Property Types and Features pages link to the property list.
// These pin the rules that keep the two numbers equal.
describe('property list filters behind the page counts', () => {
  describe('expandDescendants without aliases', () => {
    const rows = [
      { id: 1, parentId: null, name: { en: 'Villa' }, aliases: null },
      { id: 2, parentId: 1, name: { en: 'Luxury Villa' }, aliases: null },
      { id: 3, parentId: null, name: { en: 'Chalet' }, aliases: ['Villa'] },
    ];
    const service = Object.create(PropertySearchService.prototype) as PropertySearchService;
    (service as any).propertyRepository = { manager: { query: jest.fn().mockResolvedValue(rows) } };

    it('keeps the type and its sub-types only, like the count', async () => {
      const ids = await service.expandDescendants(2, 1, 'property_types', { aliases: false });
      expect(ids.sort()).toEqual([1, 2]);
    });

    it('still brings in other spellings by default, for website searches', async () => {
      const ids = await service.expandDescendants(2, 1, 'property_types');
      expect(ids.sort()).toEqual([1, 2, 3]);
    });
  });

  describe('findAllPaginated', () => {
    const makeService = () => {
      const qb: any = {
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      const expandDescendants = jest.fn().mockResolvedValue([1, 2]);
      const service = Object.create(PropertyService.prototype) as PropertyService;
      (service as any).propertyRepository = { createQueryBuilder: () => qb };
      (service as any).searchService = { expandDescendants };
      return { service, qb, expandDescendants };
    };

    it('filters a type by its tree, without other spellings, inside the tenant', async () => {
      const { service, qb, expandDescendants } = makeService();
      await service.findAllPaginated(2, { propertyTypeId: 1 } as any);
      expect(qb.where).toHaveBeenCalledWith('p.tenantId = :tenantId', { tenantId: 2 });
      expect(expandDescendants).toHaveBeenCalledWith(2, 1, 'property_types', { aliases: false });
      expect(qb.andWhere).toHaveBeenCalledWith('p.propertyTypeId IN (:...propertyTypeIds)', { propertyTypeIds: [1, 2] });
    });

    it('filters a feature with one JSON check', async () => {
      const { service, qb } = makeService();
      await service.findAllPaginated(2, { featureId: 7 } as any);
      expect(qb.andWhere).toHaveBeenCalledWith('JSON_CONTAINS(p.features, :featureId)', { featureId: '7' });
    });
  });

  describe('Features page count', () => {
    it('counts a property once if its list repeats an id, and skips ids held as text', async () => {
      const service = Object.create(FeatureService.prototype) as FeatureService;
      (service as any).featureRepository = {
        find: jest.fn().mockResolvedValue([{ id: 7 }, { id: 8 }]),
        manager: {
          query: jest.fn().mockResolvedValue([
            { features: [7, 7] },
            { features: JSON.stringify(['7', 8]) },
            { features: JSON.stringify([7]) },
            { features: 'not json' },
          ]),
        },
      };
      const counts = await service.findAll(2, undefined, true);
      expect(counts.map((f) => f.propertyCount)).toEqual([2, 1]);
    });
  });
});
