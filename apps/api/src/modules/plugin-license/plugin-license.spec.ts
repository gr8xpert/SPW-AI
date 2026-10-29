import { HttpException } from '@nestjs/common';
import { PluginLicense } from '../../database/entities';
import { countWords, generatePluginKey, hashPluginKey, normaliseSiteUrl } from './plugin-plans';
import { PluginLicenseService, compareVersions } from './plugin-license.service';
import { PluginLicenseBillingService, isPluginStripeObject } from './plugin-license-billing.service';

/* ------------------------------------------------------------------ fakes */

function repo<T extends { id?: number }>(rows: T[] = []) {
  let next = rows.length + 1;
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => (v instanceof Date ? row[k]?.getTime() === v.getTime() : row[k] === v));
  const pick = (where: any) => (Array.isArray(where) ? rows.find((r) => where.some((w: any) => matches(r, w))) : rows.find((r) => matches(r, where)));
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => pick(where) ?? null),
    count: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).length),
    insert: jest.fn(async (data: any) => { rows.push({ id: next++, ...data }); }),
    update: jest.fn(async (id: number, patch: any) => { Object.assign(rows.find((r) => r.id === id)!, patch); }),
    delete: jest.fn(async (where: any) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1); }),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => { const row = { id: next++, ...data }; rows.push(row); Object.assign(data, row); return row; }),
  };
}

function license(over: Partial<PluginLicense> = {}): PluginLicense {
  const key = 'SPMAI-TEST-AAAA-BBBB-CCCC';
  return {
    id: 1, product: 'spm-ai-translator', keyHash: hashPluginKey(key), last4: 'CCCC', plan: 'pro_5', sitesAllowed: 2, wordsAllowed: null,
    status: 'active', expiresAt: new Date(Date.now() + 86_400_000 * 300), creditsPeriodStart: null, email: 'buyer@example.com',
    customerName: 'Ana Buyer', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripeCheckoutSessionId: 'cs_1',
    lastStripeEventAt: null, createdAt: new Date('2026-10-01T10:00:00Z'), updatedAt: new Date(), ...over,
  } as PluginLicense;
}

const KEY = 'SPMAI-TEST-AAAA-BBBB-CCCC';
function config(env: Record<string, string> = {}) {
  return { get: jest.fn((k: string) => env[k]) } as any;
}
function service(lic: PluginLicense[] = [license()], env: Record<string, string> = {}) {
  const licenses = repo(lic);
  const activations = repo<any>([]);
  const usage = repo<any>([]);
  const svc = new PluginLicenseService(config({ PLUGIN_DOWNLOAD_SECRET: 's3cret', ...env }), licenses as any, activations as any, usage as any);
  return { svc, licenses, activations, usage };
}
async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return 'ok'; } catch (e) { return ((e as HttpException).getResponse() as any).code; }
}

/* ------------------------------------------------------------------ plans */

describe('plugin-plans', () => {
  it('generates SPMAI-XXXX-XXXX-XXXX-XXXX keys without look-alike characters, all different', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generatePluginKey().rawKey));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(k).toMatch(/^SPMAI-[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){4}$/);
  });
  it('hashes keys case- and whitespace-insensitively', () => {
    expect(hashPluginKey(' spmai-test-aaaa-bbbb-cccc ')).toBe(hashPluginKey(KEY));
  });
  it('normalises site addresses like the plugin does', () => {
    expect(normaliseSiteUrl('https://WWW.Example.com/shop/')).toBe('example.com/shop');
    expect(normaliseSiteUrl('localhost:8089')).toBe('localhost:8089');
  });
  it('counts words of source text, not markup', () => {
    expect(countWords(['We sell <strong>beautiful</strong> homes.', '[gallery ids="1"] Contact us', '  '])).toBe(6);
  });
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBe(1);
    expect(compareVersions('0.9.0', '0.9')).toBe(0);
    expect(compareVersions('0.8.9', '0.9.0')).toBe(-1);
  });
});

/* ---------------------------------------------------------------- service */

describe('PluginLicenseService', () => {
  it('rejects unknown keys with invalid_key', async () => {
    expect(await code(service().svc.activate('SPMAI-NOPE-NOPE-NOPE-NOPE', 'a.com'))).toBe('invalid_key');
  });

  it('activates sites up to the limit, re-activation is idempotent, then site_limit', async () => {
    const { svc, activations } = service();
    const first = await svc.activate(KEY, 'https://www.a.com/', '0.9.0');
    expect(first.license).toMatchObject({ status: 'active', plan_label: 'Pro 5 Sites', sites_used: 1 });
    await svc.activate(KEY, 'a.com', '0.9.1');
    expect(activations.rows).toHaveLength(1);
    await svc.activate(KEY, 'b.com');
    expect(await code(svc.activate(KEY, 'c.com'))).toBe('site_limit');
    await svc.deactivate(KEY, 'b.com');
    expect(await code(svc.activate(KEY, 'c.com'))).toBe('ok');
  });

  it('check: inactive for a site that is not activated, active once it is', async () => {
    const { svc } = service();
    expect((await svc.check(KEY, 'a.com')).license.status).toBe('inactive');
    await svc.activate(KEY, 'a.com');
    expect((await svc.check(KEY, 'a.com')).license.status).toBe('active');
  });

  it('blocks expired and revoked licences', async () => {
    expect(await code(service([license({ expiresAt: new Date(Date.now() - 1000) })]).svc.check(KEY, 'a.com'))).toBe('expired');
    expect(await code(service([license({ status: 'revoked' })]).svc.activate(KEY, 'a.com'))).toBe('revoked');
  });

  it('credit period rolls forward month by month without a renewal event', () => {
    const { svc } = service();
    const start = new Date(Date.now() - 40 * 86_400_000);
    const { start: s, resets } = svc.creditPeriod(license({ creditsPeriodStart: start }));
    expect(s.getTime()).toBeGreaterThan(start.getTime());
    expect(resets.getTime()).toBeGreaterThan(Date.now());
    expect(s.getUTCMilliseconds()).toBe(0);
  });

  it('signs download links that expire and cannot be tampered with', async () => {
    const { svc } = service();
    const token = svc.signDownload(1, 'spm-ai-translator', '1.0.0')!;
    jest.spyOn(svc, 'latestRelease').mockReturnValue({ version: '1.0.0', file: 'missing.zip' });
    expect(await code(svc.resolveDownload(token))).toBe('missing_release'); // Token valid; file absent in tests.
    expect(await code(svc.resolveDownload(token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))))).toBe('invalid_download');
    const expired = svc.signDownload(1, 'spm-ai-translator', '1.0.0', -10)!;
    expect(await code(svc.resolveDownload(expired))).toBe('invalid_download');
  });

  it('offers an update with a signed link only when newer and the site is activated', async () => {
    const { svc } = service();
    jest.spyOn(svc, 'latestRelease').mockReturnValue({ version: '1.2.0', file: 'spm-ai-translator-1.2.0.zip', tested: '7.1' });
    expect(await code(svc.updateInfo(KEY, 'a.com', '1.0.0'))).toBe('inactive');
    await svc.activate(KEY, 'a.com');
    const info = await svc.updateInfo(KEY, 'a.com', '1.0.0');
    expect(info).toMatchObject({ version: '1.2.0', tested: '7.1' });
    expect(String(info.download_url)).toMatch(/^https:\/\/api\.spw-ai\.com\/api\/v1\/plugin-license\/download\?t=/);
    expect(await svc.updateInfo(KEY, 'a.com', '1.2.0')).toEqual({ version: '1.2.0' });
  });
});

/* ---------------------------------------------------------------- billing */

describe('PluginLicenseBillingService', () => {
  const pluginSession = (over: any = {}) => ({
    id: 'cs_new', mode: 'subscription', payment_status: 'paid', subscription: 'sub_new', customer: 'cus_new',
    customer_details: { email: 'New@Buyer.com', name: 'New Buyer' }, metadata: { spm_product: 'spm-ai-translator', spm_plan: 'agency' }, ...over,
  });
  function billing() {
    const licenses = repo<any>([]);
    const manager = { getRepository: () => licenses } as any;
    const mailer = { send: jest.fn().mockResolvedValue({ delivered: true }) };
    const svc = new PluginLicenseBillingService(config({ STRIPE_GRACE_DAYS: '7' }), mailer as any);
    return { svc, licenses, manager, mailer };
  }

  it('recognises plugin objects by metadata, including invoices via subscription details', () => {
    expect(isPluginStripeObject('checkout.session.completed', pluginSession())).toBe(true);
    expect(isPluginStripeObject('invoice.paid', { parent: { subscription_details: { metadata: { spm_product: 'spm-ai-translator' } } } })).toBe(true);
    expect(isPluginStripeObject('checkout.session.completed', { metadata: { tenantId: '5', planId: '2' } })).toBe(false);
  });

  it('paid checkout issues one licence and emails the key; replays issue nothing new', async () => {
    const { svc, licenses, manager, mailer } = billing();
    expect(await svc.handle(manager, 'checkout.session.completed', pluginSession(), 1000)).toBe('applied');
    expect(licenses.rows).toHaveLength(1);
    expect(licenses.rows[0]).toMatchObject({ plan: 'agency', sitesAllowed: 25, wordsAllowed: null, email: 'new@buyer.com', status: 'active' });
    const sent = mailer.send.mock.calls[0][0];
    expect(sent.to).toBe('new@buyer.com');
    expect(sent.text).toMatch(/SPMAI-[2-9A-Z]{4}-/);
    expect(licenses.rows[0].keyHash).toBe(hashPluginKey(sent.text.match(/SPMAI-[A-Z0-9-]+/)[0]));
    await svc.handle(manager, 'checkout.session.async_payment_succeeded', pluginSession(), 1001);
    expect(licenses.rows).toHaveLength(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('unpaid (SEPA) checkout waits; unknown plan issues nothing', async () => {
    const { svc, licenses, manager } = billing();
    expect(await svc.handle(manager, 'checkout.session.completed', pluginSession({ payment_status: 'unpaid' }))).toBe('awaiting-payment');
    expect(await svc.handle(manager, 'checkout.session.completed', pluginSession({ metadata: { spm_product: 'spm-ai-translator', spm_plan: 'gold' } }))).toBe('ignored');
    expect(licenses.rows).toHaveLength(0);
  });

  it('renewal invoice extends the licence and starts a new credit period; cancellation expires it', async () => {
    const { svc, licenses, manager } = billing();
    await svc.handle(manager, 'checkout.session.completed', pluginSession({ metadata: { spm_product: 'spm-ai-translator', spm_plan: 'credits_300k' } }), 1000);
    const end = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const start = Math.floor(Date.now() / 1000);
    await svc.handle(manager, 'invoice.paid', { id: 'in_1', parent: { subscription_details: { subscription: 'sub_new', metadata: { spm_product: 'spm-ai-translator' } } }, lines: { data: [{ period: { start, end } }] } }, 2000);
    expect(licenses.rows[0].expiresAt.getTime()).toBe(end * 1000 + 7 * 86_400_000);
    expect(licenses.rows[0].creditsPeriodStart.getTime()).toBe(start * 1000);
    expect(await svc.handle(manager, 'customer.subscription.updated', { id: 'sub_new', status: 'active', metadata: {} }, 1500)).toBe('stale');
    await svc.handle(manager, 'customer.subscription.deleted', { id: 'sub_new', metadata: {} }, 3000);
    expect(licenses.rows[0].status).toBe('expired');
  });
});
