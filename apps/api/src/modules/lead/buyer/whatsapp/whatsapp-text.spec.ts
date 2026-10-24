import { buildWhatsAppText, cleanPhone, phonesOf, waUrl } from './whatsapp-text';

describe('cleanPhone', () => {
  it('keeps the digits of an international number', () => {
    expect(cleanPhone('+34 600 11 22 33')).toEqual({ digits: '34600112233', international: true });
  });
  it('reads 00 as the international prefix', () => {
    expect(cleanPhone('0034 (600) 11-22-33')).toEqual({ digits: '34600112233', international: true });
  });
  it('flags a number without a country code', () => {
    expect(cleanPhone('600 112 233')).toEqual({ digits: '600112233', international: false });
  });
  it('refuses something too short to be a number', () => {
    expect(cleanPhone('12')).toBeNull();
    expect(cleanPhone('')).toBeNull();
    expect(cleanPhone(null)).toBeNull();
  });
});

describe('phonesOf', () => {
  it('lists mobile first and drops a repeat', () => {
    expect(phonesOf({ mobile: '+34 600 112 233', phone: '0034600112233' })).toEqual([
      { label: 'mobile', number: '+34 600 112 233', digits: '34600112233', international: true },
    ]);
    expect(phonesOf({ mobile: null, phone: '+44 7700 900123' }).map((p) => p.label)).toEqual(['phone']);
    expect(phonesOf({ mobile: '+34600112233', phone: '+44 7700 900123' }).map((p) => p.digits)).toEqual(['34600112233', '447700900123']);
  });
});

describe('waUrl', () => {
  it('encodes the text, newlines and all', () => {
    const url = waUrl('34600112233', 'Hi Ana & Tom,\n*Villa* · €500.000 😊');
    expect(url.startsWith('https://wa.me/34600112233?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hi Ana & Tom,\n*Villa* · €500.000 😊');
  });
});

describe('buildWhatsAppText', () => {
  it('lays out message, properties, extra lines and signature', () => {
    const text = buildWhatsAppText({
      message: 'Hi Ana, here are 2 properties:',
      properties: [
        { title: 'Penthouse in Fuengirola', price: '€585,000', link: 'https://x.test/p/1' },
        { title: 'Villa in Mijas', price: '€1,200,000', link: null },
      ],
      extraLines: ['All your selected properties: https://x.test/me'],
      signature: 'Sam · Conte Estates',
    });
    expect(text).toBe(
      [
        'Hi Ana, here are 2 properties:',
        '',
        '*Penthouse in Fuengirola* · €585,000',
        'https://x.test/p/1',
        '',
        '*Villa in Mijas* · €1,200,000',
        '',
        'All your selected properties: https://x.test/me',
        '',
        'Sam · Conte Estates',
      ].join('\n'),
    );
  });
  it('drops empty parts and never leaves a run of blank lines', () => {
    expect(buildWhatsAppText({ message: '  Hello\n\n\n\nthere  ', signature: null })).toBe('Hello\n\nthere');
  });
  it('shortens a long message but keeps every link', () => {
    const text = buildWhatsAppText({ message: 'x'.repeat(5000), properties: [{ title: 'A', price: '€1', link: 'https://x.test/a' }] });
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain('https://x.test/a');
  });
});
