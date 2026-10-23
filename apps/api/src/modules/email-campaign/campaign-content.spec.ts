import { BadRequestException } from '@nestjs/common';
import { CampaignContentService } from './campaign-content.service';
import { EmailCampaignService } from './email-campaign.service';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

function service(rows: unknown[] = []) {
  const tenant = { id: 2, name: 'Sun', settings: { companyName: 'Sun Homes', primaryColor: '#112233', logoUrl: 'https://cdn/l.png', contactPhone: '+34 1', contactEmail: 'i@s.es', websiteUrl: 'https://sun.es' } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qb: any = new Proxy({}, { get: (_t, k) => (k === 'getMany' ? async () => rows : () => qb) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantRepo = { findOne: async () => tenant } as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propertyRepo = { createQueryBuilder: () => qb, find: async () => [] } as any;
  return new CampaignContentService(tenantRepo, propertyRepo);
}

describe('CampaignContentService.previewSample', () => {
  it('renders with demo listings, sample contact and agency details, styles inlined', async () => {
    const out = await service().previewSample(2, {
      subject: 'Hi {{contact.first_name}}',
      bodyHtml: '<style>.x{color:#f00}</style><p class="x">{{agency.phone}}</p>{{#properties}}<b>{{property.title}}</b>{{/properties}}{{unsubscribe_link}}<script>bad()</script>',
    });
    expect(out.subject).toBe('Hi Anna');
    expect(out.html).toMatch(/<p class="x" style="color: ?#f00;?">\+34 1<\/p>/);
    expect((out.html.match(/<b>/g) || []).length).toBe(3);
    expect(out.html).not.toContain('bad()');
    expect(out.warnings).toEqual([]);
  });
});

describe('EmailCampaignService template check on save', () => {
  const bad = '{{#properties}}<b>x</b>';

  function svc(opts: { hasVersions?: boolean } = {}) {
    const saved: unknown[] = [];
    const updates: unknown[] = [];
    const repo: any = {
      create: (x: unknown) => x,
      save: async (x: unknown) => { saved.push(x); return x; },
      update: async (...a: unknown[]) => { updates.push(a); },
      findOne: async () => ({ id: 1, tenantId: 2, type: 'newsletter', subject: 'Old subject', bodyHtml: '<p>old</p>' }),
    };
    // The template writes run in a transaction; here its manager hands back the same repo.
    repo.manager = { transaction: (fn: (em: unknown) => unknown) => fn({ getRepository: () => repo }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recorded: unknown[] = [];
    const versions = {
      record: async (...a: unknown[]) => { recorded.push(a); return null; },
      hasAny: async () => opts.hasVersions ?? true,
    };
    const touched: unknown[] = [];
    const images = { touch: async (...a: unknown[]) => { touched.push(a); } };
    const s = new (EmailCampaignService as any)(null, repo, null, null, null, null, null, null, null, versions, images);
    return { s: s as EmailCampaignService, saved, updates, recorded, touched };
  }

  it('rejects an invalid template with TEMPLATE_INVALID and details.errors surviving the filter', async () => {
    const { s } = svc();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err: any = await s.createTemplate(2, { name: 'n', subject: 's', bodyHtml: bad } as never).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    let body: any;
    const host: any = { switchToHttp: () => ({ getResponse: () => ({ status: () => ({ json: (b: unknown) => { body = b; } }) }), getRequest: () => ({ url: '/x' }) }) };
    new HttpExceptionFilter().catch(err, host);
    expect(body.code).toBe('TEMPLATE_INVALID');
    expect(typeof body.message).toBe('string');
    expect(Array.isArray(body.details.errors)).toBe(true);
    expect(body.details.errors.length).toBeGreaterThan(0);
  });

  it('does not unset the current default when the new body is invalid', async () => {
    const { s, updates, saved } = svc();
    await expect(s.createTemplate(2, { name: 'n', subject: 's', type: 'newsletter', isDefault: true, bodyHtml: bad } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(updates).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });

  it('stores sanitized html on create and update', async () => {
    const { s, saved } = svc();
    await s.createTemplate(2, { name: 'n', subject: 's', bodyHtml: '<p>a</p><script>bad()</script>' } as never);
    await s.updateTemplate(2, 1, { bodyHtml: '<p>b</p><script>bad()</script>' } as never);
    for (const x of saved as { bodyHtml: string }[]) {
      expect(x.bodyHtml).not.toContain('bad()');
    }
    await expect(s.updateTemplate(2, 1, { bodyHtml: bad } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a manual version after each save, and none for a refused body', async () => {
    const { s, recorded } = svc();
    await s.createTemplate(2, { name: 'n', subject: 's', bodyHtml: '<p>a</p>' } as never);
    await s.updateTemplate(2, 1, { bodyHtml: '<p>b</p>' } as never);
    expect(recorded).toHaveLength(2);
    expect((recorded[1] as unknown[])[2]).toMatchObject({ bodyHtml: '<p>b</p>', source: 'manual' });
    await expect(s.updateTemplate(2, 1, { bodyHtml: bad } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(recorded).toHaveLength(2);
  });

  it('records the pre-edit state first when the template has no versions yet', async () => {
    const { s, recorded } = svc({ hasVersions: false });
    await s.updateTemplate(2, 1, { bodyHtml: '<p>b</p>' } as never);
    expect(recorded).toHaveLength(2);
    expect((recorded[0] as unknown[])[2]).toMatchObject({ bodyHtml: '<p>old</p>', subject: 'Old subject', source: 'manual' });
    expect((recorded[1] as unknown[])[2]).toMatchObject({ bodyHtml: '<p>b</p>', source: 'manual' });
  });

  it('does not record a pre-edit baseline when versions already exist', async () => {
    const { s, recorded } = svc({ hasVersions: true });
    await s.updateTemplate(2, 1, { bodyHtml: '<p>b</p>' } as never);
    expect(recorded).toHaveLength(1);
  });

  it('touches the images used in the saved body on create and update', async () => {
    const { s, touched } = svc();
    await s.createTemplate(2, { name: 'n', subject: 's', bodyHtml: '<p>a</p>' } as never);
    await s.updateTemplate(2, 1, { bodyHtml: '<p>b</p>' } as never);
    expect(touched.map((t) => (t as unknown[])[1])).toEqual(['<p>a</p>', '<p>b</p>']);
  });
});
