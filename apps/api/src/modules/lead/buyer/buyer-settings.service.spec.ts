import { BadRequestException } from '@nestjs/common';
import { BuyerSettingsService, normalizeBuyerSettings } from './buyer-settings.service';

describe('buyer settings', () => {
  it('fills defaults for weights and URL patterns', () => {
    const s = normalizeBuyerSettings({ staleDays: 7 } as never);
    expect(s.staleDays).toBe(7);
    expect(s.weights).toEqual({ bedrooms: 3, bathrooms: 2, buildSize: 2, plotSize: 1, feature: 1, featureOverrides: {} });
    expect(s.propertyUrlPatterns).toEqual({});
  });

  it('clamps weights and drops bad feature overrides', () => {
    const s = normalizeBuyerSettings({
      weights: { bedrooms: 40, bathrooms: -2, buildSize: '4', plotSize: 'x', feature: 2.6, featureOverrides: { '12': 7, abc: 3, '0': 2, '5': 'nope' } },
    } as never);
    expect(s.weights).toEqual({ bedrooms: 10, bathrooms: 0, buildSize: 4, plotSize: 1, feature: 3, featureOverrides: { '12': 7 } });
  });

  it('keeps only valid URL patterns when reading', () => {
    const s = normalizeBuyerSettings({
      propertyUrlPatterns: { default: 'https://a.com/{lang}/p/{segment}', nl: 'https://a.com/nl/woning/{ref}', xx1: 'https://a.com/{segment}', es: 'ftp://a/{segment}', de: 'https://a.com/no-placeholder' },
    } as never);
    expect(s.propertyUrlPatterns).toEqual({ default: 'https://a.com/{lang}/p/{segment}', nl: 'https://a.com/nl/woning/{ref}' });
  });

  function service(settings: Record<string, unknown>) {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, settings }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    return { svc: new BuyerSettingsService(repo as never), repo };
  }

  it('rejects a bad pattern on save', async () => {
    const { svc, repo } = service({});
    await expect(svc.update(1, { propertyUrlPatterns: { es: 'not a url' } })).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('merges a partial weights patch and keeps other fields', async () => {
    const { svc, repo } = service({ companyName: 'X', buyerMatch: { staleDays: 9, weights: { bedrooms: 5 } } });
    const next = await svc.update(1, { weights: { feature: 4 } });
    expect(next.staleDays).toBe(9);
    expect(next.weights.bedrooms).toBe(5);
    expect(next.weights.feature).toBe(4);
    expect(repo.update.mock.calls[0][1].settings.companyName).toBe('X');
  });

  it('clears a pattern sent as empty', async () => {
    const { svc } = service({ buyerMatch: { propertyUrlPatterns: { default: 'https://a.com/{segment}' } } });
    const next = await svc.update(1, { propertyUrlPatterns: { default: '' } });
    expect(next.propertyUrlPatterns).toEqual({});
  });
});

describe('normalizeBuyerSettings: Phase 2 parts', () => {
  it('defaults: near misses on (10 %, 10 km), alerts off, digest at 08:00, 5 % price drop', () => {
    const s = normalizeBuyerSettings(undefined);
    expect(s.nearMiss).toEqual({ enabled: true, budgetPercent: 10, nearbyKm: 10 });
    expect(s.alerts).toEqual({ enabled: false, delivery: 'digest', digestTime: '08:00', priceDropPercent: 5 });
    expect(s.buyerPageUrls).toEqual({});
  });

  it('clamps and coerces stored values', () => {
    const s = normalizeBuyerSettings({
      nearMiss: { enabled: 0 as unknown as boolean, budgetPercent: 99, nearbyKm: -3 },
      alerts: { enabled: 1 as unknown as boolean, delivery: 'weekly' as never, digestTime: '25:00', priceDropPercent: 0 },
      buyerPageUrls: { default: 'https://a.example/my/', xx1: 'https://b', nl: 'javascript:x' },
    });
    expect(s.nearMiss).toEqual({ enabled: false, budgetPercent: 50, nearbyKm: 0 });
    expect(s.alerts).toEqual({ enabled: true, delivery: 'digest', digestTime: '08:00', priceDropPercent: 1 });
    expect(s.buyerPageUrls).toEqual({ default: 'https://a.example/my/' });
  });
});
