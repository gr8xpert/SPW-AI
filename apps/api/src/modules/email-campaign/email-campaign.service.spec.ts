import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EmailCampaignService } from './email-campaign.service';
import { CreateTemplateDto } from './dto';
import { TemplateVersionService } from './designer/template-version.service';
import { fakeManager, fakeRepo } from './designer/test-fake-repo';
import { EmailTemplate, EmailTemplateVersion } from '../../database/entities';

const BODY = '<p>Hi</p>{{unsubscribe_link}}';

function setup() {
  const templates = fakeRepo<any>([{ id: 1, tenantId: 2, type: 'newsletter', name: 'Old default', subject: 'S', bodyHtml: BODY, isDefault: true }]);
  const versionRepo = fakeRepo<any>([]);
  const manager = fakeManager(new Map<unknown, any>([[EmailTemplate, templates], [EmailTemplateVersion, versionRepo]]));
  (templates as any).manager = manager;
  (versionRepo as any).manager = manager;
  const versions = new TemplateVersionService(versionRepo as any, templates as any);
  const touched: string[] = [];
  const pinned: string[] = [];
  const images = { touch: async (_t: number, h: string) => { touched.push(h); }, pin: async (_t: number, h: string) => { pinned.push(h); } };
  const campaign = { id: 5, tenantId: 2, subject: 'News', featuredProperties: [], template: { bodyHtml: '<img src="https://r2/a.jpg">{{unsubscribe_link}}', bodyText: null } };
  const repos = {
    config: { findOne: async () => ({ tenantId: 2, isVerified: true }) },
    campaigns: { findOne: async () => campaign },
    sends: {},
    contacts: { findOne: async () => null },
    properties: {},
  };
  const sender = { sendEmail: async () => ({ success: true }) };
  const content = { context: async () => ({}), render: () => ({ subject: 'News', html: '<p>x</p>', text: 'x' }) };
  const svc = new EmailCampaignService(
    repos.config as any, templates as any, repos.campaigns as any, repos.sends as any, repos.contacts as any, repos.properties as any,
    {} as any, sender as any, content as any, versions, images as any,
  );
  return { svc, templates, versionRepo, manager, touched, pinned };
}

describe('EmailCampaignService templates (transactions)', () => {
  it('createTemplate: a failed first version keeps the old default as default and saves no template', async () => {
    const { svc, templates, versionRepo } = setup();
    (versionRepo as any).save = async () => { throw new Error('db down'); };
    await expect(svc.createTemplate(2, { name: 'New', type: 'newsletter', subject: 'S2', bodyHtml: BODY, isDefault: true } as any)).rejects.toThrow('db down');
    expect(templates.rows).toHaveLength(1);
    expect(templates.rows[0].isDefault).toBe(true);
  });

  it('createTemplate: the new default replaces the old one together with its version', async () => {
    const { svc, templates, versionRepo, manager } = setup();
    const t = await svc.createTemplate(2, { name: 'New', type: 'newsletter', subject: 'S2', bodyHtml: BODY, isDefault: true } as any);
    expect(templates.rows.find((r: any) => r.id === 1)!.isDefault).toBe(false);
    expect(t.isDefault).toBe(true);
    expect(versionRepo.rows).toHaveLength(1);
    expect(manager.transactions).toBe(1);
    expect(manager.ems[0].writes).toEqual(['EmailTemplate.update', 'EmailTemplate.save', 'EmailTemplateVersion.save']);
    expect([...templates.outsideWrites, ...versionRepo.outsideWrites]).toEqual([]);
  });

  it('updateTemplate: a failed version write leaves the other default in place', async () => {
    const { svc, templates, versionRepo } = setup();
    templates.rows.push({ id: 2, tenantId: 2, type: 'newsletter', name: 'B', subject: 'S', bodyHtml: BODY, isDefault: false });
    (versionRepo as any).save = async () => { throw new Error('db down'); };
    await expect(svc.updateTemplate(2, 2, { isDefault: true } as any)).rejects.toThrow('db down');
    expect(templates.rows.find((r: any) => r.id === 1)!.isDefault).toBe(true);
  });

  it('updateTemplate: keeps the pre-edit state as a version, saves, records the new one in one transaction', async () => {
    const { svc, templates, versionRepo, manager } = setup();
    await svc.updateTemplate(2, 1, { bodyHtml: '<p>New</p>{{unsubscribe_link}}', isDefault: true } as any);
    expect(versionRepo.rows.map((v: any) => v.bodyHtml)).toEqual([BODY, '<p>New</p>{{unsubscribe_link}}']);
    expect(manager.transactions).toBe(1);
    expect(manager.ems[0].writes).toEqual(['EmailTemplate.update', 'EmailTemplateVersion.save', 'EmailTemplate.save', 'EmailTemplateVersion.save']);
    expect([...templates.outsideWrites, ...versionRepo.outsideWrites]).toEqual([]);
  });
});

describe('EmailCampaignService.sendTest', () => {
  it('touches (does not pin) the template images after a test send', async () => {
    const { svc, touched, pinned } = setup();
    expect(await svc.sendTest(2, 5, 'me@example.com')).toEqual({ sent: true });
    expect(touched).toEqual(['<img src="https://r2/a.jpg">{{unsubscribe_link}}']);
    expect(pinned).toHaveLength(0);
  });
});

describe('CreateTemplateDto type', () => {
  const check = (type: string) => validate(plainToInstance(CreateTemplateDto, { name: 'n', subject: 's', bodyHtml: '<p>x</p>', type }));
  it('accepts the template types and names them when refusing another', async () => {
    expect(await check('newsletter')).toHaveLength(0);
    const [err] = await check('campaign');
    expect(Object.values(err.constraints ?? {}).join(' ')).toMatch(/property_alert, newsletter, welcome, custom/);
  });
});

