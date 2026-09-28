import { publicMapTiles } from './tenant.service';

describe('publicMapTiles', () => {
  it('passes a MapTiler key', () => {
    expect(publicMapTiles({ provider: 'maptiler', key: ' AbCdEf123456 ' })).toEqual({ provider: 'maptiler', key: 'AbCdEf123456' });
  });

  it('drops a MapTiler setting without a usable key', () => {
    expect(publicMapTiles({ provider: 'maptiler', key: 'bad key"><script>' })).toBeNull();
    expect(publicMapTiles({ provider: 'maptiler' })).toBeNull();
  });

  it('passes an https tile template and strips markup from the attribution', () => {
    expect(
      publicMapTiles({ provider: 'custom', url: 'https://t.example.com/{z}/{x}/{y}.png', attribution: '<b>Me</b>' }),
    ).toEqual({ provider: 'custom', url: 'https://t.example.com/{z}/{x}/{y}.png', attribution: 'bMe/b' });
  });

  it('rejects http, javascript and incomplete tile URLs', () => {
    expect(publicMapTiles({ provider: 'custom', url: 'http://t.example.com/{z}/{x}/{y}.png' })).toBeNull();
    expect(publicMapTiles({ provider: 'custom', url: 'javascript:alert(1)//{z}{x}{y}' })).toBeNull();
    expect(publicMapTiles({ provider: 'custom', url: 'https://t.example.com/tile.png' })).toBeNull();
  });

  it('OpenStreetMap or nothing set sends nothing (the widget default)', () => {
    expect(publicMapTiles({ provider: 'osm' })).toBeNull();
    expect(publicMapTiles(undefined)).toBeNull();
  });
});
