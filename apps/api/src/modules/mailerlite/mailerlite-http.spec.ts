import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { createHmac } from 'crypto';
import { Contact, MailerliteConnection, Tenant } from '../../database/entities';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../common/guards';
import { ROLES_KEY } from '../../common/guards/roles.guard';
import { REQUIRES_ADDON_KEY } from '../../common/decorators/requires-addon.decorator';
import { MailerLiteController, MailerLiteWebhookController } from './mailerlite.controller';
import { MAILERLITE_QUEUE, MailerLiteConnectionService } from './mailerlite-connection.service';
import { MailerLiteSyncService } from './mailerlite-sync.service';
import { MailerLiteWebhookService } from './mailerlite-webhook.service';

// Real routes over real HTTP, as main.ts sets them up (raw body kept, same
// validation); guards are real except the login itself; the database is mocked.

const TOKEN = 'c'.repeat(48);
const SECRET = 'webhook-secret';

let role = 'admin';
const addons: Record<string, boolean> = { emailCampaign: true };

const fakeLogin: CanActivate = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    req.user = { sub: 7, email: 'boss@example.com', tenantId: 1, role };
    req.tenantId = 1;
    return true;
  },
};

describe('MailerLite routes', () => {
  let app: INestApplication;
  let base: string;
  const contactUpdate = jest.fn(async () => ({ affected: 1 }));

  beforeAll(async () => {
    const connections = {
      createQueryBuilder: () => {
        const qb = {
          addSelect: () => qb,
          where: (_: string, p: { token?: string; tenantId?: number }) => {
            (qb as unknown as { token?: string }).token = p.token;
            return qb;
          },
          getOne: async () =>
            (qb as unknown as { token?: string }).token === TOKEN || !(qb as unknown as { token?: string }).token
              ? { id: 1, tenantId: 1, webhookSecret: SECRET, enabled: false }
              : null,
        };
        return qb;
      },
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1000 }])],
      controllers: [MailerLiteController, MailerLiteWebhookController],
      providers: [
        MailerLiteConnectionService,
        MailerLiteSyncService,
        MailerLiteWebhookService,
        DashboardAddonGuard,
        RolesGuard,
        { provide: getRepositoryToken(MailerliteConnection), useValue: connections },
        { provide: getRepositoryToken(Contact), useValue: { update: contactUpdate, find: jest.fn(async () => []) } },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: async () => ({ id: 1, dashboardAddons: addons }) } },
        { provide: getQueueToken(MAILERLITE_QUEUE), useValue: { add: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeLogin)
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    role = 'admin';
    contactUpdate.mockClear();
  });

  const post = (path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');

  describe('webhook', () => {
    // Odd spacing and key order on purpose: only the raw bytes can match.
    const body = '{ "event":"subscriber.unsubscribed",   "email" : "anna@example.com" }';

    it('needs no login and checks the signature against the raw body', async () => {
      const res = await post(`/api/webhooks/mailerlite/${TOKEN}`, body, { Signature: sign(body) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, handled: 1 });
      expect(contactUpdate).toHaveBeenCalledTimes(1);
    });

    it('a bad signature is 401 with no change', async () => {
      const res = await post(`/api/webhooks/mailerlite/${TOKEN}`, body, { Signature: sign(body, 'wrong') });
      expect(res.status).toBe(401);
      expect(contactUpdate).not.toHaveBeenCalled();
    });

    it('a missing signature is 401', async () => {
      expect((await post(`/api/webhooks/mailerlite/${TOKEN}`, body)).status).toBe(401);
    });

    it('an unknown token is 404', async () => {
      const res = await post(`/api/webhooks/mailerlite/${'d'.repeat(48)}`, body, { Signature: sign(body) });
      expect(res.status).toBe(404);
    });
  });

  describe('dashboard routes', () => {
    it('a manager can read the status, and no secret is in it', async () => {
      const res = await fetch(`${base}/api/dashboard/mailerlite`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({ connected: false });
      expect(text).not.toContain(SECRET);
    });

    it('an agent gets 403 on every route', async () => {
      role = 'user';
      expect((await fetch(`${base}/api/dashboard/mailerlite`)).status).toBe(403);
      expect((await post('/api/dashboard/mailerlite/sync', '{}')).status).toBe(403);
      expect((await fetch(`${base}/api/dashboard/mailerlite`, { method: 'DELETE' })).status).toBe(403);
    });

    it('validates what comes in', async () => {
      expect((await post('/api/dashboard/mailerlite/connect', '{}')).status).toBe(400);
      expect((await post('/api/dashboard/mailerlite/connect', JSON.stringify({ apiKey: 'has spaces in it' }))).status).toBe(400);
      expect((await post('/api/dashboard/mailerlite/connect', JSON.stringify({ apiKey: 'long-enough-key', extra: 1 }))).status).toBe(400);
      expect((await post('/api/dashboard/mailerlite/consent', JSON.stringify({ confirmed: false }))).status).toBe(400);
    });
  });
});

describe('MailerLite settings controller', () => {
  it('needs the Email Campaigns add-on and a manager', () => {
    expect(Reflect.getMetadata(REQUIRES_ADDON_KEY, MailerLiteController)).toBe('emailCampaign');
    expect(Reflect.getMetadata(ROLES_KEY, MailerLiteController)).toEqual(['admin']);
  });
});
