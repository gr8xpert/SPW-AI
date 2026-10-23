import { DesignerCleanupService } from './designer-cleanup.service';

describe('DesignerCleanupService empty-template cleanup', () => {
  const now = new Date('2026-11-30T12:00:00Z');
  const day = 24 * 3600 * 1000;
  const rows = [
    { id: 1, bodyHtml: '', updatedAt: new Date(now.getTime() - 2 * day) }, // abandoned
    { id: 2, bodyHtml: '', updatedAt: new Date(now.getTime() - 2 * day) }, // used by a campaign
    { id: 3, bodyHtml: '', updatedAt: new Date(now.getTime() - 1000) }, // edited just now
    { id: 4, bodyHtml: '<p>x</p>', updatedAt: new Date(now.getTime() - 9 * day) }, // has content
    { id: 5, bodyHtml: '', subject: 'Spring news', updatedAt: new Date(now.getTime() - 9 * day) }, // has a subject
  ].map((r) => ({ subject: '', ...r }));

  it('deletes only empty (body and subject), untouched-for-a-day templates that no campaign uses', async () => {
    const deleted: number[] = [];
    const templates = {
      find: async ({ where }: any) =>
        rows
          .filter((r) => r.bodyHtml === where.bodyHtml && (where.subject === undefined || r.subject === where.subject) && r.updatedAt < where.updatedAt.value)
          .map((r) => ({ id: r.id })),
      delete: async (id: number) => { deleted.push(id); },
    } as any;
    const campaigns = { count: async ({ where }: any) => (where.templateId === 2 ? 1 : 0) } as any;
    const images = { cleanup: async () => 3 } as any;
    const svc = new DesignerCleanupService(images, {} as any, templates, campaigns);
    expect(await svc.cleanup(now)).toEqual({ images: 3, templates: 1 });
    expect(deleted).toEqual([1]);
  });
});
