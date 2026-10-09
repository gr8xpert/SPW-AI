import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP, LookupFunction } from 'net';

// Outbound fetches of URLs a client typed in (feed URLs) must only reach the
// public internet. Checked on the address the socket actually connects to —
// the agents below resolve through publicLookup — so a hostname can't pass a
// check and then resolve to 127.0.0.1 for the real request (DNS rebinding).
// BlockList normalises every spelling (0:0:0:0:0:0:0:1, ::ffff:7f00:1, …).
const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 96], // unspecified, loopback, IPv4-compatible
  ['64:ff9b::', 96], ['64:ff9b:1::', 48], // NAT64 — wraps any IPv4
  ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], // discard, Teredo, docs, 6to4
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, bits, 'ipv6');

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (!family) return false;
  return !blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

export const publicLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as dns.LookupAddress[];
    // Every record must be public: a name that round-robins between a public
    // and a private address is refused.
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error('address not allowed'), { code: 'EADDRBLOCKED' }), '', 0);
    }
    if ((options as dns.LookupOptions).all) return (callback as any)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export const publicHttpAgent = new http.Agent({ lookup: publicLookup });
export const publicHttpsAgent = new https.Agent({ lookup: publicLookup });

/** The URL is http(s) and, when its host is a literal IP (which skips DNS), that IP is public. */
export function isAllowedPublicUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return isIP(host) ? isPublicAddress(host) : true;
}
