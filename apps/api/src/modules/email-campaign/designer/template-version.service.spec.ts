import { TemplateVersionService, MAX_VERSIONS } from './template-version.service';
import { fakeManager, fakeRepo } from './test-fake-repo';
import { EmailTemplate, EmailTemplateVersion } from '../../../database/entities';

// The list query the service builds, answered from the fake rows (bytes as the DB would count them).
function withListQuery(versions: any) {
  const q: any = { calls: [] as string[] };
  let where: any = {};
  for (const m of ['select', 'addSelect', 'orderBy', 'limit']) q[m] = (...a: any[]) => { q.calls.push(`${m}:${a[0]}`); return q; };
  q.where = (_s: string, p: any) => { where = p; return q; };
  q.getRawMany = async () => versions.rows
    .filter((r: any) => r.tenantId === where.tenantId && r.templateId === where.templateId)
    .sort((a: any, b: any) => b.id - a.id)
    .map((r: any) => ({ id: String(r.id), source: r.source, subject: r.subject, bytes: String(Buffer.byteLength(r.bodyHtml)), createdAt: r.createdAt }));
  versions.createQueryBuilder = () => q;
  return q;
}

describe('TemplateVersionService', () => {
  const template = { id: 7, tenantId: 2, subject: 'S', bodyHtml: '<p>a</p>' };
  const make = () => {
    const versions = fakeRepo<any>();
    const templates = fakeRepo<any>([{ ...template }]);
    const manager = fakeManager(new Map<unknown, any>([[EmailTemplate, templates], [EmailTemplateVersion, versions]]));
    versions.manager = manager;
    templates.manager = manager;
    const query = withListQuery(versions);
    return { versions, templates, manager, query, svc: new TemplateVersionService(versions as any, templates as any) };
  };

  it('skips a version identical to the latest', async () => {
    const { svc, versions } = make();
    await svc.record(2, 7, { bodyHtml: '<p>a</p>', subject: 'S', source: 'manual' });
    expect(await svc.record(2, 7, { bodyHtml: '<p>a</p>', subject: 'S', source: 'ai' })).toBeNull();
    expect(versions.rows).toHaveLength(1);
  });

  it(`keeps only the newest ${MAX_VERSIONS}`, async () => {
    const { svc, versions } = make();
    for (let i = 0; i < MAX_VERSIONS + 5; i++) await svc.record(2, 7, { bodyHtml: `<p>${i}</p>`, subject: 'S', source: 'ai' });
    expect(versions.rows).toHaveLength(MAX_VERSIONS);
    expect(versions.rows[0].bodyHtml).toBe('<p>5</p>');
  });

  it('restores a version into the template and records it as a restore', async () => {
    const { svc, templates, versions } = make();
    const v = await svc.record(2, 7, { bodyHtml: '<p>old</p>', subject: 'Old', source: 'manual' });
    await svc.record(2, 7, { bodyHtml: '<p>new</p>', subject: 'New', source: 'ai' });
    const t = await svc.restore(2, 7, v!.id);
    expect(t.bodyHtml).toBe('<p>old</p>');
    expect(templates.rows[0].subject).toBe('Old');
    expect(versions.rows.at(-1).source).toBe('restore');
  });

  it("never reads another client's version", async () => {
    const { svc } = make();
    const v = await svc.record(2, 7, { bodyHtml: '<p>x</p>', subject: 'S', source: 'manual' });
    await expect(svc.get(3, 7, v!.id)).rejects.toThrow('Version not found');
  });

  it("lists only the client's own template versions (404 for another client's template)", async () => {
    const { svc } = make();
    await svc.record(2, 7, { bodyHtml: '<p>x</p>', subject: 'S', source: 'manual' });
    expect(await svc.list(2, 7)).toHaveLength(1);
    await expect(svc.list(3, 7)).rejects.toThrow('Template not found');
    await expect(svc.list(2, 99)).rejects.toThrow('Template not found');
  });

  it('records and prunes in one transaction: a failed prune keeps the new version out', async () => {
    const { svc, versions, manager } = make();
    for (let i = 0; i < MAX_VERSIONS; i++) await svc.record(2, 7, { bodyHtml: `<p>${i}</p>`, subject: 'S', source: 'ai' });
    const before = versions.rows.map((r: any) => r.id);
    (versions as any).delete = async () => { throw new Error('db down'); };
    await expect(svc.record(2, 7, { bodyHtml: '<p>new</p>', subject: 'S', source: 'ai' })).rejects.toThrow('db down');
    expect(versions.rows.map((r: any) => r.id)).toEqual(before);
    expect(manager.transactions).toBe(MAX_VERSIONS + 1);
  });

  it('joins the caller transaction when given one', async () => {
    const { svc, manager, versions } = make();
    await manager.transaction((em) => svc.record(2, 7, { bodyHtml: '<p>x</p>', subject: 'S', source: 'manual' }, em));
    expect(manager.transactions).toBe(1);
    expect(manager.ems[0].writes).toEqual(['EmailTemplateVersion.save']);
    expect(versions.outsideWrites).toEqual([]);
  });

  it('record writes and prunes only through its transaction; restore too', async () => {
    const { svc, manager, versions, templates } = make();
    for (let i = 0; i <= MAX_VERSIONS; i++) await svc.record(2, 7, { bodyHtml: `<p>${i}</p>`, subject: 'S', source: 'ai' });
    expect(manager.ems.at(-1)!.writes).toEqual(['EmailTemplateVersion.save', 'EmailTemplateVersion.delete']);
    await svc.restore(2, 7, versions.rows[0].id!);
    expect(manager.ems.at(-1)!.writes).toEqual(['EmailTemplate.update', 'EmailTemplateVersion.save', 'EmailTemplateVersion.delete']);
    expect([...versions.outsideWrites, ...templates.outsideWrites]).toEqual([]);
  });

  it('a restore that fails to record its version leaves the template as it was', async () => {
    const { svc, templates, versions } = make();
    const v = await svc.record(2, 7, { bodyHtml: '<p>old</p>', subject: 'Old', source: 'manual' });
    await svc.record(2, 7, { bodyHtml: '<p>new</p>', subject: 'New', source: 'ai' });
    templates.rows[0].bodyHtml = '<p>new</p>';
    (versions as any).save = async () => { throw new Error('db down'); };
    await expect(svc.restore(2, 7, v!.id)).rejects.toThrow('db down');
    expect(templates.rows[0].bodyHtml).toBe('<p>new</p>');
  });

  it('lists sizes from the database without loading the bodies', async () => {
    const { svc, query } = make();
    await svc.record(2, 7, { bodyHtml: '<p>é</p>', subject: 'S', source: 'manual' });
    const list = await svc.list(2, 7);
    expect(list).toEqual([{ id: 1, source: 'manual', subject: 'S', bytes: 9, createdAt: expect.any(Date) }]);
    expect(query.calls).toContain('addSelect:OCTET_LENGTH(v.bodyHtml)');
    expect(query.calls.some((c: string) => /bodyHtml/.test(c) && !/OCTET_LENGTH/.test(c))).toBe(false);
  });
});
