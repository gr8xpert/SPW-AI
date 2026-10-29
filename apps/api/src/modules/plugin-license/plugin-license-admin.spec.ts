import { PluginLicenseAdminService, effectiveStatus } from './plugin-license-admin.service';
import { PluginLicenseBillingService } from './plugin-license-billing.service';
import { PluginLicenseMailer } from './plugin-license-mailer.service';
import { hashPluginKey } from './plugin-plans';

const DAY = 86_400_000;

function setup(seed: any[] = []) {
  const rows = seed.map((r) => ({ product: 'spm-ai-translator', status: 'active', createdAt: new Date(), ...r }));
  let nextId = 100;
  const licenses = {
    rows,
    create: (x: any) => ({ ...x }),
    save: jest.fn(async (x: any) => {
      if (!x.id) Object.assign(x, { id: nextId++, createdAt: new Date() });
      rows.push(x);
      return x;
    }),
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
    update: jest.fn(async (id: number, patch: any) => Object.assign(rows.find((r) => r.id === id), patch)),
  };
  const sites = [{ id: 7, licenseId: 1, siteUrl: 'client.com', pluginVersion: '0.9.0', activatedAt: new Date(), lastSeenAt: new Date() }];
  const qb = { select: () => qb, addSelect: () => qb, where: () => qb, groupBy: () => qb, getRawMany: async () => [] };
  const activations = {
    find: jest.fn(async () => sites),
    findOne: jest.fn(async ({ where }: any) => sites.find((s) => s.id === where.id && s.licenseId === where.licenseId) ?? null),
    delete: jest.fn(async () => ({})),
    createQueryBuilder: () => qb,
  };
  const audit = { create: (x: any) => x, save: jest.fn(async (x: any) => x), find: jest.fn(async () => []) };
  const licenseService = { creditsView: jest.fn(async () => ({ words_allowed: 1, words_used: 0, resets_at: '' })) };
  const mailer = { sendKey: jest.fn(async () => true) };
  const svc = new PluginLicenseAdminService(licenses as any, activations as any, audit as any, licenseService as any, mailer as any);
  return { svc, licenses, activations, audit, mailer };
}

describe('PluginLicenseAdminService', () => {
  it('issues a manual key: hash stored, raw key returned once, audit-logged, email optional', async () => {
    const { svc, licenses, audit, mailer } = setup();
    const out = await svc.create({ plan: 'pro_5', email: ' Agent@Client.com ', notes: 'INV-1042' }, 1);
    expect(out.key).toMatch(/^SPMAI-[2-9A-Z]{4}(-[2-9A-Z]{4}){4}$/);
    const saved = licenses.rows[0];
    expect(saved.keyHash).toBe(hashPluginKey(out.key));
    expect(JSON.stringify(saved)).not.toContain(out.key);
    expect(saved).toMatchObject({ plan: 'pro_5', sitesAllowed: 5, email: 'agent@client.com', source: 'manual', notes: 'INV-1042' });
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now() + 360 * DAY);
    expect(mailer.sendKey).not.toHaveBeenCalled();
    expect(audit.save).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'plugin_license', userId: 1, action: 'create' }));

    const emailed = await svc.create({ plan: 'pro_single', email: 'a@b.com', sendEmail: true, months: 1, sitesAllowed: 2 }, 1);
    expect(emailed.emailed).toBe(true);
    expect(licenses.rows[1].sitesAllowed).toBe(2);
  });

  it('extends from the current expiry, or from today when already expired', async () => {
    const future = new Date(Date.now() + 10 * DAY);
    const { svc, licenses } = setup([
      { id: 1, plan: 'pro_single', sitesAllowed: 1, expiresAt: future, last4: 'AAAA' },
      { id: 2, plan: 'pro_single', sitesAllowed: 1, expiresAt: new Date(Date.now() - 5 * DAY), status: 'expired', last4: 'BBBB' },
    ]);
    await svc.extend(1, 12, 9);
    expect(licenses.rows[0].expiresAt.getTime()).toBeGreaterThan(future.getTime() + 360 * DAY);
    await svc.extend(2, 1, 9);
    expect(licenses.rows[1].status).toBe('active');
    expect(licenses.rows[1].expiresAt.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
  });

  it('replacing the key invalidates the old hash and keeps the licence', async () => {
    const { svc, licenses, mailer } = setup([{ id: 1, plan: 'pro_single', sitesAllowed: 1, keyHash: 'old', last4: 'OLD1', email: 'a@b.com' }]);
    const out = await svc.regenerateKey(1, true, 9);
    expect(licenses.rows[0].keyHash).toBe(hashPluginKey(out.key));
    expect(mailer.sendKey).toHaveBeenCalledWith(expect.anything(), out.key, { replacement: true });
  });

  it('revokes, restores, and frees a site', async () => {
    const { svc, licenses, activations } = setup([{ id: 1, plan: 'pro_single', sitesAllowed: 1, last4: 'AAAA' }]);
    await svc.setRevoked(1, true, 9);
    expect(licenses.rows[0].status).toBe('revoked');
    await svc.setRevoked(1, false, 9);
    expect(licenses.rows[0].status).toBe('active');
    await svc.removeSite(1, 7, 9);
    expect(activations.delete).toHaveBeenCalledWith(7);
    await expect(svc.removeSite(1, 999, 9)).rejects.toThrow('not activated');
  });

  it('changing plan applies its site and word limits', async () => {
    const { svc, licenses } = setup([{ id: 1, plan: 'pro_single', sitesAllowed: 1, wordsAllowed: null, last4: 'AAAA' }]);
    await svc.update(1, { plan: 'agency' }, 9);
    expect(licenses.rows[0]).toMatchObject({ plan: 'agency', sitesAllowed: 25, wordsAllowed: null });
    await svc.update(1, { plan: 'credits_100k' }, 9);
    expect(licenses.rows[0].wordsAllowed).toBe(100_000);
    expect(licenses.rows[0].creditsPeriodStart).toBeInstanceOf(Date);
  });

  it('effective status: revoked > expired (by date too) > active', () => {
    expect(effectiveStatus({ status: 'revoked', expiresAt: null })).toBe('revoked');
    expect(effectiveStatus({ status: 'active', expiresAt: new Date(Date.now() - 1000) })).toBe('expired');
    expect(effectiveStatus({ status: 'active', expiresAt: new Date(Date.now() + DAY) })).toBe('active');
  });
});

describe('Stripe auto-issue switch', () => {
  it('a paid plugin checkout issues nothing unless PLUGIN_STRIPE_AUTO_ISSUE=true', async () => {
    const cfg = { get: jest.fn(() => undefined) } as any;
    const mail = { send: jest.fn() };
    const svc = new PluginLicenseBillingService(cfg, new PluginLicenseMailer(cfg, mail as any));
    const repo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const session = { id: 'cs_1', payment_status: 'paid', customer_details: { email: 'a@b.com' }, metadata: { spm_product: 'spm-ai-translator', spm_plan: 'pro_single' } };
    expect(await svc.handle({ getRepository: () => repo } as any, 'checkout.session.completed', session)).toBe('ignored');
    expect(repo.save).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });
});
