import { ResalesAdapter } from './resales.adapter';
import { KyeroAdapter } from './kyero.adapter';
import { priceText } from '../../property/price-text';

// One price or a from–to range, for every listing type. Field names checked
// live against Resales on 2026-10-07 (Solobanus: sales, short and long term).

const resales = (raw: Record<string, unknown>, searchType = 'Sale') =>
  (new ResalesAdapter() as any).mapProperty({ Reference: 'R1', PropertyType: { NameType: 'Apartment' }, ...raw }, searchType);

describe('Resales prices', () => {
  it('keeps a single sale price single', () => {
    const p = resales({ Price: '45000', OriginalPrice: '50000', Currency: 'EUR' });
    expect(p.price).toBe(45000);
    expect(p.priceTo).toBeUndefined();
    expect(p.rentalPeriod).toBeUndefined();
    expect(p.priceOnRequest).toBe(false);
  });

  it('reads a weekly holiday-rental range', () => {
    const p = resales({ RentalPeriod: 'Week', RentalPrice1: '1750', RentalPrice2: '2450' }, 'Short Term Rental');
    expect(p).toMatchObject({ listingType: 'holiday_rent', price: 1750, priceTo: 2450, rentalPeriod: 'week', priceOnRequest: false });
  });

  it('treats an equal from and to as one monthly price', () => {
    const p = resales({ RentalPeriod: 'Month', RentalPrice1: '18000', RentalPrice2: '18000' }, 'Long Term Rental');
    expect(p).toMatchObject({ listingType: 'rent', price: 18000, rentalPeriod: 'month' });
    expect(p.priceTo).toBeUndefined();
  });

  it('reads a development price range when sent', () => {
    expect(resales({ Price: '300000', PriceTo: '550000' })).toMatchObject({ price: 300000, priceTo: 550000 });
  });

  it('marks a listing with no price as price on request', () => {
    expect(resales({ Price: 'POA' })).toMatchObject({ price: null, priceOnRequest: true });
    expect(resales({}, 'Short Term Rental')).toMatchObject({ price: null, priceOnRequest: true });
  });
});

describe('Kyero prices', () => {
  it('takes the rental period from price_freq', () => {
    const kyero = new KyeroAdapter() as any;
    expect(kyero.mapProperty({ id: 1, price: '1200', price_freq: 'month' }).rentalPeriod).toBe('month');
    expect(kyero.mapProperty({ id: 2, price: '900', price_freq: 'week' }).rentalPeriod).toBe('week');
    expect(kyero.mapProperty({ id: 3, price: '250000', price_freq: 'sale' }).rentalPeriod).toBeUndefined();
  });
});

describe('priceText (emails, brochure)', () => {
  it('writes single prices, ranges and periods', () => {
    expect(priceText({ price: 45000, currency: 'EUR' })).toBe('€45,000');
    expect(priceText({ price: '1750.00', priceTo: '2450.00', rentalPeriod: 'week', currency: 'EUR', listingType: 'holiday_rent' })).toBe('€1,750 – €2,450 / week');
    expect(priceText({ price: 1500, priceTo: 1500, currency: 'EUR', listingType: 'rent' })).toBe('€1,500 / month');
    expect(priceText({ price: 0, currency: 'EUR' })).toBe('Price on request');
    expect(priceText({ price: 300000, priceTo: 550000, currency: 'EUR', listingType: 'development' })).toBe('€300,000 – €550,000');
  });
});
