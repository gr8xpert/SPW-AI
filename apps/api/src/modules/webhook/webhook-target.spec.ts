import { validateWebhookTarget, validateWebhookTargetAsync } from './webhook-target';

describe('validateWebhookTarget (sync)', () => {
  const originalEnv = process.env.WEBHOOK_ALLOW_LOOPBACK;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.WEBHOOK_ALLOW_LOOPBACK;
    else process.env.WEBHOOK_ALLOW_LOOPBACK = originalEnv;
  });

  it('rejects invalid URLs', () => {
    expect(validateWebhookTarget('not a url')).toEqual({
      ok: false,
      reason: 'invalid_url',
    });
  });

  it('rejects non-http schemes', () => {
    expect(validateWebhookTarget('file:///etc/passwd')).toEqual({
      ok: false,
      reason: 'invalid_scheme',
    });
    expect(validateWebhookTarget('ftp://example.com')).toEqual({
      ok: false,
      reason: 'invalid_scheme',
    });
  });

  it('rejects literal localhost', () => {
    delete process.env.WEBHOOK_ALLOW_LOOPBACK;
    expect(validateWebhookTarget('http://localhost/x').reason).toBe('loopback');
  });

  it('rejects the full 127.0.0.0/8 loopback range', () => {
    delete process.env.WEBHOOK_ALLOW_LOOPBACK;
    // The whole /8 must be off-limits, not just 127.0.0.1.
    expect(validateWebhookTarget('http://127.0.0.1/x').reason).toBe('loopback');
    expect(validateWebhookTarget('http://127.0.0.255/x').reason).toBe('loopback');
    expect(validateWebhookTarget('http://127.1.2.3/x').reason).toBe('loopback');
    expect(validateWebhookTarget('http://127.255.255.254/x').reason).toBe('loopback');
  });

  it('rejects IPv6 loopback ::1', () => {
    delete process.env.WEBHOOK_ALLOW_LOOPBACK;
    expect(validateWebhookTarget('http://[::1]/x').reason).toBe('loopback');
  });

  it('rejects unspecified IPv6 ::', () => {
    expect(validateWebhookTarget('http://[::]/x').reason).toBe('private_ip');
  });

  it('rejects IPv4-mapped IPv6 forms — dotted', () => {
    // ::ffff:10.0.0.1 must be blocked the same as 10.0.0.1.
    expect(validateWebhookTarget('http://[::ffff:10.0.0.1]/x').reason).toBe(
      'private_ip',
    );
    expect(validateWebhookTarget('http://[::ffff:192.168.1.1]/x').reason).toBe(
      'private_ip',
    );
  });

  it('rejects IPv4-mapped IPv6 loopback (dotted + hex)', () => {
    delete process.env.WEBHOOK_ALLOW_LOOPBACK;
    expect(validateWebhookTarget('http://[::ffff:127.0.0.1]/x').reason).toBe(
      'loopback',
    );
    // Hex form of 127.0.0.1: 7f00:0001
    expect(validateWebhookTarget('http://[::ffff:7f00:1]/x').reason).toBe('loopback');
  });

  it('allows loopback when WEBHOOK_ALLOW_LOOPBACK=true', () => {
    process.env.WEBHOOK_ALLOW_LOOPBACK = 'true';
    expect(validateWebhookTarget('http://127.0.0.1/x').ok).toBe(true);
    expect(validateWebhookTarget('http://127.5.6.7/x').ok).toBe(true);
    expect(validateWebhookTarget('http://[::1]/x').ok).toBe(true);
  });

  it('rejects RFC1918 + CG-NAT + link-local IPv4', () => {
    expect(validateWebhookTarget('http://10.1.2.3/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://172.16.0.1/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://172.31.255.255/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://192.168.1.1/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://169.254.169.254/x').reason).toBe(
      'private_ip',
    );
    expect(validateWebhookTarget('http://100.64.0.1/x').reason).toBe('private_ip');
  });

  it('rejects unspecified 0.0.0.0/8 and reserved/multicast IPv4', () => {
    expect(validateWebhookTarget('http://0.0.0.0/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://224.0.0.1/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://255.255.255.255/x').reason).toBe(
      'private_ip',
    );
  });

  it('rejects IPv6 unique-local + link-local + multicast', () => {
    expect(validateWebhookTarget('http://[fc00::1]/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://[fd12:3456:789a::1]/x').reason).toBe(
      'private_ip',
    );
    expect(validateWebhookTarget('http://[fe80::1]/x').reason).toBe('private_ip');
    expect(validateWebhookTarget('http://[ff02::1]/x').reason).toBe('private_ip');
  });

  it('allows public IPv4 + hostnames', () => {
    expect(validateWebhookTarget('https://hooks.zapier.com/x').ok).toBe(true);
    expect(validateWebhookTarget('https://8.8.8.8/x').ok).toBe(true);
    // 172.32.x is OUTSIDE the RFC1918 172.16.0.0/12 range — must be public.
    expect(validateWebhookTarget('http://172.32.0.1/x').ok).toBe(true);
    // 128.0.0.1 is NOT loopback (only 127/8 is).
    expect(validateWebhookTarget('http://128.0.0.1/x').ok).toBe(true);
  });
});

describe('validateWebhookTargetAsync (with DNS)', () => {
  // The async version layers a DNS lookup on top of the sync check. We
  // don't mock DNS — instead we rely on stable hostnames (.invalid is a
  // reserved TLD guaranteed never to resolve).

  const originalEnv = process.env.WEBHOOK_ALLOW_LOOPBACK;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.WEBHOOK_ALLOW_LOOPBACK;
    else process.env.WEBHOOK_ALLOW_LOOPBACK = originalEnv;
  });

  it('passes through sync failures without doing DNS', async () => {
    const result = await validateWebhookTargetAsync('file:///etc/passwd');
    expect(result).toEqual({ ok: false, reason: 'invalid_scheme' });
  });

  it('rejects localhost (sync stop)', async () => {
    delete process.env.WEBHOOK_ALLOW_LOOPBACK;
    const result = await validateWebhookTargetAsync('http://localhost/x');
    expect(result.ok).toBe(false);
    expect(['loopback', 'dns_loopback']).toContain(result.reason);
  });

  it('rejects bare literal IPv4-mapped IPv6 (no DNS round trip needed)', async () => {
    const result = await validateWebhookTargetAsync(
      'http://[::ffff:10.0.0.1]/x',
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('private_ip');
  });

  it('returns dns_failed for unresolvable hostnames', async () => {
    // .invalid is a reserved TLD guaranteed never to resolve. RFC 6761.
    const result = await validateWebhookTargetAsync(
      'http://this-host-does-not-exist.invalid/x',
    );
    expect(result.ok).toBe(false);
    expect(['dns_failed', 'dns_timeout']).toContain(result.reason);
  });
});
