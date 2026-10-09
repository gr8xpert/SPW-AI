// The real module object (an import * copy wouldn't be what public-address calls).
const dns = require('dns');
import { isAllowedPublicUrl, isPublicAddress, publicLookup } from './public-address';

describe('public-address', () => {
  it('refuses every spelling of internal addresses', () => {
    for (const ip of [
      '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
      '::1', '0:0:0:0:0:0:0:1', '0000::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe',
      '64:ff9b::a9fe:a9fe', '2002:7f00:1::', 'fc00::1', 'fd12::1', 'fe80::1', 'febf::1', 'fec0::1', 'ff02::1',
    ]) expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
  });

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '188.114.96.3', '2606:4700::6810:84e5', '::ffff:8.8.8.8']) {
      expect([ip, isPublicAddress(ip)]).toEqual([ip, true]);
    }
  });

  it('checks the URL: scheme, credentials, literal IPs', () => {
    expect(isAllowedPublicUrl('https://xml.redsp.net/files/1/a.xml')).toBe(true);
    expect(isAllowedPublicUrl('http://[::1]:3001/')).toBe(false);
    expect(isAllowedPublicUrl('http://169.254.169.254/latest')).toBe(false);
    expect(isAllowedPublicUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedPublicUrl('https://user:pw@example.com/')).toBe(false);
    expect(isAllowedPublicUrl('not a url')).toBe(false);
  });

  it('the connect-time lookup refuses names that resolve to internal addresses', async () => {
    const spy = jest.spyOn(dns, 'lookup');
    const run = (addrs: Array<{ address: string; family: number }>) =>
      new Promise<{ err: any; address: any }>((resolve) => {
        spy.mockImplementationOnce((_h: any, _o: any, cb: any) => cb(null, addrs));
        publicLookup('feed.example', {}, (err, address) => resolve({ err, address }));
      });
    try {
      expect((await run([{ address: '93.184.216.34', family: 4 }])).address).toBe('93.184.216.34');
      expect((await run([{ address: '127.0.0.1', family: 4 }])).err?.code).toBe('EADDRBLOCKED');
      // Round-robin public + private is refused too.
      expect((await run([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }])).err?.code).toBe('EADDRBLOCKED');
    } finally {
      spy.mockRestore();
    }
  });
});
