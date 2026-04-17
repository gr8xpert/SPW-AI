/**
 * Golden-path smoke test.
 *
 * Exercises the critical flows in one run:
 *   - Public endpoints (health, license ping)
 *   - Register → login → /me
 *   - Property CRUD scoped to the tenant
 *   - Tenant isolation (user A cannot see user B's properties)
 *   - Rate limiting kicks in after N logins (run last — poisons the IP bucket)
 *
 * Requires MySQL + Redis running (pnpm docker:up) and the schema migrated.
 * Creates fresh tenants per run so it never collides with dev data.
 */
// Let the webhook-target SSRF guard accept 127.0.0.1 so we can point a
// local listener at the dispatcher inside the smoke test.
process.env.WEBHOOK_ALLOW_LOOPBACK = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import helmet from 'helmet';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { DataSource } from 'typeorm';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { AppModule } from '../src/app.module';
import { User, EmailVerificationToken, Tenant, WebhookDelivery } from '../src/database/entities';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// Verification tokens are emailed in production; in the smoke test we flip
// User.emailVerifiedAt directly. Avoids parsing console logs or reaching into
// verification_tokens just to exercise a flow we test elsewhere.
async function forceVerifyEmail(app: INestApplication, email: string): Promise<void> {
  const ds = app.get(DataSource);
  await ds
    .getRepository(User)
    .update({ email: email.toLowerCase() }, { emailVerifiedAt: new Date() });
}

async function boot(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

describe('Smoke — golden path (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await boot();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Public endpoints', () => {
    // A global ResponseInterceptor wraps all JSON responses as { data: ... },
    // so reach through res.body.data to inspect the payload.
    it('GET /api/health reports ok when DB + Redis are up', async () => {
      const res = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.checks.database.status).toBe('ok');
      expect(res.body.data.checks.redis.status).toBe('ok');
    });

    it('GET /api/v1/license/ping returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/license/ping')
        .expect(200);
      expect(res.body.data.status).toBe('ok');
    });
  });

  describe('Auth', () => {
    const tenantASlug = uniqueSlug('tenant-a');
    const tenantBSlug = uniqueSlug('tenant-b');
    const adminA = {
      email: `admin-${tenantASlug}@smoke.test`,
      password: 'SmokeTest1234!',
      name: 'Tenant A Admin',
      tenantName: 'Tenant A Smoke',
      tenantSlug: tenantASlug,
    };
    const adminB = {
      email: `admin-${tenantBSlug}@smoke.test`,
      password: 'SmokeTest1234!',
      name: 'Tenant B Admin',
      tenantName: 'Tenant B Smoke',
      tenantSlug: tenantBSlug,
    };

    let tokenA: string;
    let tokenB: string;

    it('POST /api/auth/register creates tenant + admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(adminA)
        .expect(201);

      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.user.email).toBe(adminA.email);
      expect(res.body.data.user.role).toBe('admin');
      // Raw tenant API key returned exactly once on registration.
      expect(res.body.data.tenantApiKey).toMatch(/^spw_[a-f0-9]{64}$/);
      expect(res.body.data.emailVerificationRequired).toBe(true);
      tokenA = res.body.data.accessToken;
    });

    it('POST /api/auth/login is blocked when email is not verified', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminA.email, password: adminA.password })
        .expect(401);
      // Response body is wrapped: { statusCode, error: { message, code } }
      expect(JSON.stringify(res.body)).toContain('EMAIL_NOT_VERIFIED');
    });

    it('POST /api/auth/resend-verification always returns sent:true', async () => {
      // Even for unknown emails — the endpoint must not leak enumeration.
      const unknown = await request(app.getHttpServer())
        .post('/api/auth/resend-verification')
        .send({ email: `does-not-exist-${Date.now()}@smoke.test` })
        .expect(200);
      expect(unknown.body.data.sent).toBe(true);

      const known = await request(app.getHttpServer())
        .post('/api/auth/resend-verification')
        .send({ email: adminA.email })
        .expect(200);
      expect(known.body.data.sent).toBe(true);
    });

    it('POST /api/auth/login succeeds once the email is verified', async () => {
      await forceVerifyEmail(app, adminA.email);

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminA.email, password: adminA.password })
        .expect(200);

      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      // Raw tenant API key must NOT reappear on login.
      expect(res.body.data.tenantApiKey).toBeUndefined();
    });

    it('POST /api/auth/verify-email consumes a real token end-to-end', async () => {
      // Register a fresh user and resend to force a new issuance we can match
      // against in the DB. We never see the raw token (it's emailed); but we
      // can ship an arbitrary test token through the public endpoint and
      // confirm the filter-by-hash lookup works.
      const email = `verify-${Date.now()}@smoke.test`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SmokeTest1234!',
          name: 'Verify Test',
          tenantName: 'Verify Tenant',
          tenantSlug: uniqueSlug('verify'),
        })
        .expect(201);

      // Inject a known raw token directly: insert a row whose hash matches a
      // token we control, then POST that token to /verify-email.
      const ds = app.get(DataSource);
      const user = await ds.getRepository(User).findOneOrFail({ where: { email } });
      // 64 hex chars unique per test run so the UNIQUE(tokenHash) index
      // doesn't collide across smoke invocations on a reused DB.
      const rawToken = (Date.now().toString(16) + 'a'.repeat(64)).slice(0, 64);
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await ds.getRepository(EmailVerificationToken).insert({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: rawToken })
        .expect(200);

      // Second call with same token fails — row is consumed.
      await request(app.getHttpServer())
        .post('/api/auth/verify-email')
        .send({ token: rawToken })
        .expect(400);

      // And the user's emailVerifiedAt is now set.
      const after = await ds.getRepository(User).findOneOrFail({ where: { email } });
      expect(after.emailVerifiedAt).not.toBeNull();
    });

    it('POST /api/auth/register rejects weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...adminA, email: `weak-${Date.now()}@smoke.test`, password: 'short' })
        .expect(400);
    });

    it('POST /api/auth/login rejects wrong password (401)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminA.email, password: 'wrong-password-xxx' })
        .expect(401);
    });

    describe('Encrypted storage config', () => {
      it('stores S3 credentials encrypted at rest, returns them plaintext via API', async () => {
        const creds = {
          storageType: 's3',
          s3Bucket: 'my-test-bucket',
          s3Region: 'eu-west-1',
          s3AccessKey: 'AKIAEXAMPLEKEY1234',
          s3SecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        };

        await request(app.getHttpServer())
          .put('/api/dashboard/storage-config')
          .set('Authorization', `Bearer ${tokenA}`)
          .send(creds)
          .expect(200);

        const res = await request(app.getHttpServer())
          .get('/api/dashboard/storage-config')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        // Transformer decrypts on read — plaintext round-trips to the caller.
        expect(res.body.data.s3AccessKey).toBe(creds.s3AccessKey);
        expect(res.body.data.s3SecretKey).toBe(creds.s3SecretKey);
        expect(res.body.data.s3Bucket).toBe(creds.s3Bucket);
      });
    });

    describe('Tenant API-key rotation', () => {
      it('POST /api/dashboard/tenant/api-key/rotate returns a fresh raw key', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/dashboard/tenant/api-key/rotate')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        expect(res.body.data.apiKey).toMatch(/^spw_[a-f0-9]{64}$/);
        expect(res.body.data.apiKeyLast4).toBe(res.body.data.apiKey.slice(-4));
      });

      it('GET /api/dashboard/tenant/api-credentials returns last4 only', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/api-credentials')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        expect(res.body.data.apiKeyLast4).toMatch(/^[a-f0-9]{4}$/);
        // Raw key must never appear here.
        expect(res.body.data.apiKey).toBeUndefined();
      });
    });

    describe('Refresh-token rotation', () => {
      it('issues a new access+refresh pair and invalidates the old refresh', async () => {
        const login = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: adminA.email, password: adminA.password })
          .expect(200);

        const oldRefresh = login.body.data.refreshToken;

        const rotated = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: oldRefresh })
          .expect(200);

        expect(rotated.body.data.accessToken).toBeTruthy();
        expect(rotated.body.data.refreshToken).toBeTruthy();
        expect(rotated.body.data.refreshToken).not.toBe(oldRefresh);

        // Replaying the consumed refresh must fail — its row is revoked.
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: oldRefresh })
          .expect(401);
      });

      it('reuse of a rotated token revokes the whole family', async () => {
        const login = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: adminA.email, password: adminA.password })
          .expect(200);
        const t1 = login.body.data.refreshToken;

        const r1 = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: t1 })
          .expect(200);
        const t2 = r1.body.data.refreshToken;

        // Attacker replays the original, already-rotated refresh.
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: t1 })
          .expect(401);

        // As a consequence, the *legitimate* rotated token must also be dead.
        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refreshToken: t2 })
          .expect(401);
      });
    });

    it('GET /api/auth/me requires bearer token', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('GET /api/auth/me returns user when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.data.email).toBe(adminA.email);
      expect(res.body.data.role).toBe('admin');
    });

    it('registers a second tenant for isolation checks', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(adminB)
        .expect(201);
      tokenB = res.body.data.accessToken;
    });

    describe('Tenant isolation', () => {
      let tenantAPropertyId: number;

      it('tenant A creates a property', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/dashboard/properties')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            reference: uniqueSlug('REF'),
            listingType: 'sale',
            title: { en: 'Tenant A House' },
            price: 100000,
            currency: 'EUR',
            bedrooms: 2,
            bathrooms: 1,
            status: 'draft',
          })
          .expect(201);

        expect(res.body.data.id).toBeGreaterThan(0);
        tenantAPropertyId = res.body.data.id;
      });

      it('tenant A can list its own properties', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/dashboard/properties')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        expect(Array.isArray(res.body.data)).toBe(true);
        const ids = res.body.data.map((p: { id: number }) => p.id);
        expect(ids).toContain(tenantAPropertyId);
      });

      it('tenant B cannot see tenant A properties in list', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/dashboard/properties')
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(200);

        const ids = res.body.data.map((p: { id: number }) => p.id);
        expect(ids).not.toContain(tenantAPropertyId);
      });

      it('tenant B cannot fetch tenant A property by id (404)', async () => {
        await request(app.getHttpServer())
          .get(`/api/dashboard/properties/${tenantAPropertyId}`)
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(404);
      });

      it('tenant A can delete its own property', async () => {
        await request(app.getHttpServer())
          .delete(`/api/dashboard/properties/${tenantAPropertyId}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
      });
    });

    // Webhook dispatcher: creating a property triggers a signed outbound
    // POST to the tenant's webhookUrl. Runs a localhost listener, points
    // tenant A's webhookUrl at it, then asserts delivery + signature.
    describe('Outbound webhook dispatch', () => {
      interface CapturedRequest {
        headers: Record<string, string | string[] | undefined>;
        body: string;
      }
      const received: CapturedRequest[] = [];
      let server: http.Server;
      let listenerUrl: string;
      let tenantASecret: string;

      beforeAll(async () => {
        // Listener captures everything it receives; resolves with a promise
        // we can await per-test.
        server = http.createServer((req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            received.push({
              headers: req.headers as Record<string, string | string[] | undefined>,
              body: Buffer.concat(chunks).toString('utf8'),
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
          });
        });
        await new Promise<void>((resolve) =>
          server.listen(0, '127.0.0.1', () => resolve()),
        );
        const port = (server.address() as AddressInfo).port;
        listenerUrl = `http://127.0.0.1:${port}/hook`;

        // Set tenant A's webhookUrl + capture its secret for signature check.
        const ds = app.get(DataSource);
        const tenantRepo = ds.getRepository(Tenant);
        const admin = await ds.getRepository(User).findOneOrFail({
          where: { email: adminA.email },
        });
        await tenantRepo.update(admin.tenantId, { webhookUrl: listenerUrl });
        const tenant = await tenantRepo.findOneOrFail({ where: { id: admin.tenantId } });
        tenantASecret = tenant.webhookSecret;
      });

      afterAll(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      });

      it('delivers a signed property.created webhook on create', async () => {
        const before = received.length;

        const create = await request(app.getHttpServer())
          .post('/api/dashboard/properties')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            reference: uniqueSlug('WH'),
            listingType: 'sale',
            title: { en: 'Webhook Test Property' },
            price: 250000,
            currency: 'EUR',
            bedrooms: 3,
            bathrooms: 2,
            status: 'draft',
          })
          .expect(201);
        const propertyId = create.body.data.id;

        // Wait for the BullMQ worker to dispatch. Local round-trip is fast
        // but test machines can be loaded — poll up to 5s.
        const deadline = Date.now() + 5_000;
        while (received.length === before && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(received.length).toBeGreaterThan(before);

        const hit = received[received.length - 1];
        expect(hit.headers['x-spw-event']).toBe('property.created');
        expect(hit.headers['x-spw-delivery-id']).toBeTruthy();
        const sig = hit.headers['x-spw-signature'] as string;
        const ts = hit.headers['x-spw-timestamp'] as string;
        expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
        expect(ts).toMatch(/^\d+$/);

        // Reconstruct expected HMAC and compare constant-time.
        const expected = createHmac('sha256', tenantASecret)
          .update(`${ts}.${hit.body}`)
          .digest();
        const received_sig = Buffer.from(sig.split('v1=')[1], 'hex');
        expect(received_sig.length).toBe(expected.length);
        expect(timingSafeEqual(received_sig, expected)).toBe(true);

        const parsed = JSON.parse(hit.body);
        expect(parsed.event).toBe('property.created');
        expect(parsed.data.id).toBe(propertyId);
        expect(parsed.data.reference).toBeTruthy();

        // Delivery row is marked delivered with the 200 from the listener.
        const ds = app.get(DataSource);
        const row = await ds
          .getRepository(WebhookDelivery)
          .findOne({ where: { id: Number(hit.headers['x-spw-delivery-id']) } });
        expect(row?.status).toBe('delivered');
        expect(row?.lastStatusCode).toBe(200);
      });

      it('skips delivery when webhookUrl is private/loopback with the guard enabled', async () => {
        // Temporarily pretend loopback is not allowed to exercise the SSRF
        // rejection path. The guard reads the env each call, so toggling
        // works without a reimport.
        const prev = process.env.WEBHOOK_ALLOW_LOOPBACK;
        process.env.WEBHOOK_ALLOW_LOOPBACK = 'false';
        try {
          const before = received.length;
          await request(app.getHttpServer())
            .post('/api/dashboard/properties')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({
              reference: uniqueSlug('SSRF'),
              listingType: 'sale',
              title: { en: 'SSRF Test' },
              price: 100,
              currency: 'EUR',
              bedrooms: 1,
              bathrooms: 1,
              status: 'draft',
            })
            .expect(201);

          // No listener hit should happen even after a short wait.
          await new Promise((r) => setTimeout(r, 400));
          expect(received.length).toBe(before);

          const ds = app.get(DataSource);
          const latest = await ds
            .getRepository(WebhookDelivery)
            .findOne({
              where: { event: 'property.created' },
              order: { id: 'DESC' },
            });
          expect(latest?.status).toBe('skipped');
          expect(latest?.lastError).toMatch(/^ssrf_block:/);
        } finally {
          process.env.WEBHOOK_ALLOW_LOOPBACK = prev;
        }
      });
    });
  });

  // Public-API (per-tenant-key) rate limiter. Lives above the login flood
  // test so the login 429s can't bleed into this block. Floods GET /api/v1/
  // properties with one tenant's api key until the tracker fires, then
  // confirms a second tenant's key is not affected.
  describe('Public API per-api-key rate limiting', () => {
    const PUBLIC_API_LIMIT = 60;

    let keyC: string;
    let keyD: string;

    it('registers two fresh tenants to get independent api keys', async () => {
      const regC = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `ratec-${Date.now()}@smoke.test`,
          password: 'SmokeTest1234!',
          name: 'Rate C Admin',
          tenantName: 'Rate C Tenant',
          tenantSlug: uniqueSlug('ratec'),
        })
        .expect(201);
      keyC = regC.body.data.tenantApiKey;

      const regD = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `rated-${Date.now()}@smoke.test`,
          password: 'SmokeTest1234!',
          name: 'Rate D Admin',
          tenantName: 'Rate D Tenant',
          tenantSlug: uniqueSlug('rated'),
        })
        .expect(201);
      keyD = regD.body.data.tenantApiKey;

      expect(keyC).toMatch(/^spw_[a-f0-9]{64}$/);
      expect(keyD).toMatch(/^spw_[a-f0-9]{64}$/);
      expect(keyC).not.toBe(keyD);
    });

    it('floods tenant C until the api-key bucket returns 429', async () => {
      // Fire (limit + 5) requests so we cleanly cross the threshold, then
      // assert the overflow came back as 429s.
      const statuses: number[] = [];
      for (let i = 0; i < PUBLIC_API_LIMIT + 5; i++) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/properties')
          .set('x-api-key', keyC);
        statuses.push(res.status);
      }

      const throttled = statuses.filter((s) => s === 429);
      expect(throttled.length).toBeGreaterThanOrEqual(1);
      // Earlier requests should have been 200 (search returns empty list for
      // a tenant with no published properties).
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    });

    it('tenant D is unaffected — its own bucket is untouched', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties')
        .set('x-api-key', keyD)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // Keep this block LAST: it deliberately floods the login endpoint to verify
  // the throttler, which poisons the IP's rate-limit bucket for the rest of the test run.
  describe('Rate limiting', () => {
    it('POST /api/auth/login gets throttled after 5 rapid attempts', async () => {
      const email = `flood-${Date.now()}@smoke.test`;
      const results: number[] = [];

      for (let i = 0; i < 7; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email, password: 'whatever-1234' });
        results.push(res.status);
      }

      // First 5 attempts return 401 (invalid credentials). Attempts 6-7 should be 429.
      const throttled = results.filter((s) => s === 429);
      expect(throttled.length).toBeGreaterThanOrEqual(1);
    });
  });
});
