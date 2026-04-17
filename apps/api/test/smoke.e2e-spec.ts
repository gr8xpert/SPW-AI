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
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { User, EmailVerificationToken, Tenant, WebhookDelivery, RefreshToken } from '../src/database/entities';
import { CleanupService } from '../src/modules/maintenance/cleanup.service';
import { SystemMailerService } from '../src/modules/mail/system-mailer.service';

// Throttler buckets now persist in Redis (shared across replicas in prod).
// E2E tests run back-to-back on the same dev Redis — without a pre-flush,
// the "login 7× until 429" block from a prior run poisons every login in
// the next run.
async function flushThrottlerKeys(): Promise<void> {
  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 2,
  });
  try {
    const keys = await client.keys('throttler:*');
    if (keys.length > 0) await client.del(...keys);
  } finally {
    await client.quit().catch(() => {});
  }
}

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
  await flushThrottlerKeys();

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

    // Liveness = "process is up". Must not touch deps so an orchestrator
    // probing this endpoint doesn't hammer the DB every 30s per replica.
    it('GET /api/health/live returns 200 with no external checks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health/live')
        .expect(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.uptimeSec).toBeGreaterThanOrEqual(0);
      // Crucially: no .checks object — liveness never reports dep state.
      expect(res.body.data.checks).toBeUndefined();
    });

    // Readiness = "ok to take traffic". Same semantics as the legacy
    // /api/health alias — DB + Redis both probed.
    it('GET /api/health/ready reports DB + Redis state', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.checks.database.status).toBe('ok');
      expect(res.body.data.checks.redis.status).toBe('ok');
    });

    // Request ID: every response carries X-Request-Id. When the client
    // supplies one matching the safe-chars pattern, we echo it back; a
    // missing / malformed header gets a server-generated UUID.
    it('echoes a client-supplied X-Request-Id when well-formed', async () => {
      const clientId = 'abc-123_test';
      const res = await request(app.getHttpServer())
        .get('/api/health/live')
        .set('X-Request-Id', clientId)
        .expect(200);
      expect(res.headers['x-request-id']).toBe(clientId);
    });

    it('rejects a malformed X-Request-Id and generates its own UUID', async () => {
      // Spaces are valid inside an HTTP header value (so node's client lets
      // this go out on the wire), but our regex rejects them — this exercises
      // the sanitize-then-regenerate branch without tripping the HTTP layer's
      // control-char check client-side.
      const res = await request(app.getHttpServer())
        .get('/api/health/live')
        .set('X-Request-Id', 'bad id with spaces')
        .expect(200);
      // UUID v4 shape — 8-4-4-4-12 lowercase hex.
      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    // Error responses include the requestId so clients can quote it when
    // filing a bug — same ID visible in the response header.
    it('includes requestId in error responses', async () => {
      const clientId = 'err-correlation-test-9';
      const res = await request(app.getHttpServer())
        .get('/api/v1/sync-meta') // 401 without api-key
        .set('X-Request-Id', clientId)
        .expect(401);
      expect(res.headers['x-request-id']).toBe(clientId);
      // Error body is wrapped by the global ResponseInterceptor? No — only
      // 2xx responses get wrapped. Errors pass through HttpExceptionFilter
      // directly, so read off res.body, not res.body.data.
      expect(res.body.requestId).toBe(clientId);
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

    // Verifies the full SMTP-wired verification flow: register triggers the
    // SystemMailerService (now injected with a fake transport capturing
    // outgoing mail), the captured message contains a /verify?token=<hex>
    // link, and POSTing that token to /auth/verify-email flips the user's
    // emailVerifiedAt. Guards against regressions where Phase 5D's mailer
    // wiring gets accidentally unhooked.
    describe('Verification email dispatch', () => {
      interface CapturedMail {
        to?: string;
        subject?: string;
        text?: string;
        html?: string;
      }
      const captured: CapturedMail[] = [];

      beforeAll(() => {
        const mailer = app.get(SystemMailerService);
        mailer.__setTransporterForTests(
          {
            sendMail: async (opts) => {
              captured.push({
                to: opts.to as string,
                subject: opts.subject as string,
                text: opts.text as string,
                html: opts.html as string,
              });
              return { messageId: `test-${captured.length}` };
            },
          },
          '"SPW Test" <noreply@smoke.test>',
        );
      });

      it('sends a verification email on register and the link verifies the account', async () => {
        const email = `mailflow-${Date.now()}@smoke.test`;
        const before = captured.length;

        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email,
            password: 'SmokeTest1234!',
            name: 'Mail Flow Tester',
            tenantName: 'Mail Flow Tenant',
            tenantSlug: uniqueSlug('mailflow'),
          })
          .expect(201);

        // At least one new message since the register call.
        expect(captured.length).toBeGreaterThan(before);
        const latest = captured[captured.length - 1];
        expect(latest.to).toBe(email);
        expect(latest.subject).toMatch(/verify/i);

        // Extract the token from the plaintext body — HTML escaping would
        // otherwise confuse a naïve href regex. The service builds the link
        // as `${DASHBOARD_URL}/verify?token=...`.
        const match = latest.text?.match(/token=([a-f0-9]{64})/);
        expect(match).toBeTruthy();
        const rawToken = match![1];

        await request(app.getHttpServer())
          .post('/api/auth/verify-email')
          .send({ token: rawToken })
          .expect(200);

        // Don't round-trip through /auth/login here — that endpoint is tight-
        // throttled (5/min per IP) and adding a login hit bleeds a 429 into the
        // "refresh-token reuse revokes family" test further down. verify-email
        // returning 200 already proves the token flow is correct.
      });

      it('resend-verification delivers a new link that also works', async () => {
        // Register (mail #1) → never click → resend (mail #2) → use mail #2's
        // token → verify succeeds. Also confirms issue() invalidates #1 so
        // it can't be reused after a resend.
        const email = `resend-${Date.now()}@smoke.test`;
        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email,
            password: 'SmokeTest1234!',
            name: 'Resend Tester',
            tenantName: 'Resend Tenant',
            tenantSlug: uniqueSlug('resend'),
          })
          .expect(201);
        const firstMatch = captured[captured.length - 1].text?.match(
          /token=([a-f0-9]{64})/,
        );
        expect(firstMatch).toBeTruthy();
        const firstToken = firstMatch![1];

        await request(app.getHttpServer())
          .post('/api/auth/resend-verification')
          .send({ email })
          .expect(200);
        const resendMatch = captured[captured.length - 1].text?.match(
          /token=([a-f0-9]{64})/,
        );
        expect(resendMatch).toBeTruthy();
        const resendToken = resendMatch![1];
        expect(resendToken).not.toBe(firstToken);

        // The original token must be dead now — issue() consumes prior
        // unconsumed rows when a new one is minted.
        await request(app.getHttpServer())
          .post('/api/auth/verify-email')
          .send({ token: firstToken })
          .expect(400);

        await request(app.getHttpServer())
          .post('/api/auth/verify-email')
          .send({ token: resendToken })
          .expect(200);
      });
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

        // Phase 5G: property.* bumps tenant.syncVersion so poll-only widgets
        // see the change. The post-bump version is stamped into the payload
        // so receivers can correlate + de-dupe across retries.
        expect(typeof parsed.data.syncVersion).toBe('number');
        expect(parsed.data.syncVersion).toBeGreaterThan(0);
        const ds = app.get(DataSource);
        const admin = await ds.getRepository(User).findOneOrFail({
          where: { email: adminA.email },
        });
        const tenant = await ds
          .getRepository(Tenant)
          .findOneOrFail({ where: { id: admin.tenantId } });
        expect(tenant.syncVersion).toBe(parsed.data.syncVersion);

        // Delivery row is marked delivered with the 200 from the listener.
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

    // Phase 5F — webhookSecret is AES-GCM encrypted at rest. Reaches past
    // TypeORM's auto-decrypt transformer with a raw query to prove the cell
    // contains `enc:v1:` ciphertext, not plaintext. The dispatcher read path
    // is already exercised by "Outbound webhook dispatch" earlier — that
    // test's HMAC verification would fail if decryption broke.
    describe('Encrypted secrets at rest (5F)', () => {
      it('tenant.webhookSecret stores enc:v1: ciphertext in the DB column', async () => {
        const ds = app.get(DataSource);
        const admin = await ds.getRepository(User).findOneOrFail({
          where: { email: adminA.email },
        });
        const rows: Array<{ webhookSecret: string }> = await ds.query(
          'SELECT webhookSecret FROM tenants WHERE id = ?',
          [admin.tenantId],
        );
        expect(rows.length).toBe(1);
        // Raw column value — no transformer in play because we went through
        // ds.query() not the TypeORM repository.
        expect(rows[0].webhookSecret.startsWith('enc:v1:')).toBe(true);

        // And reading via the repository auto-decrypts to a 64-char hex secret.
        const tenant = await ds
          .getRepository(Tenant)
          .findOneOrFail({ where: { id: admin.tenantId } });
        expect(tenant.webhookSecret).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    // Webhook self-service (Phase 5E): tenants can read/update their
    // webhookUrl, rotate the signing secret, list recent deliveries, and
    // fire a test event — all from the dashboard without a super-admin
    // having to touch the DB.
    describe('Webhook management', () => {
      it('GET /api/dashboard/tenant/webhook returns webhookSecretLast4', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        expect(typeof res.body.data.webhookSecretLast4).toBe('string');
        expect(res.body.data.webhookSecretLast4).toMatch(/^[a-f0-9]{4}$/);
        // webhookUrl was set by the dispatch block earlier; either null or a
        // URL string is acceptable depending on run order. Type check is
        // enough to prove the endpoint shapes the response correctly.
        expect(['object', 'string']).toContain(typeof res.body.data.webhookUrl);
      });

      it('PUT /api/dashboard/tenant/webhook rejects private IP with a stable code', async () => {
        // Temporarily disable the loopback allow list so the SSRF guard sees
        // 10.x as private. Without this, WEBHOOK_ALLOW_LOOPBACK only covers
        // 127.0.0.1 — 10.x is always considered private.
        const res = await request(app.getHttpServer())
          .put('/api/dashboard/tenant/webhook')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ webhookUrl: 'http://10.0.0.5/hook' })
          .expect(400);
        // HttpExceptionFilter wraps error payloads as { statusCode, error: { ... } }
        // — `code` is inside that envelope.
        expect(JSON.stringify(res.body)).toContain('WEBHOOK_URL_INVALID');
      });

      it('PUT /api/dashboard/tenant/webhook accepts a valid URL and normalizes empty string to null', async () => {
        await request(app.getHttpServer())
          .put('/api/dashboard/tenant/webhook')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ webhookUrl: 'https://example.com/hook' })
          .expect(200);

        const cleared = await request(app.getHttpServer())
          .put('/api/dashboard/tenant/webhook')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ webhookUrl: '' })
          .expect(200);
        expect(cleared.body.data.webhookUrl).toBeNull();
      });

      it('POST /api/dashboard/tenant/webhook/rotate-secret returns a fresh 64-char hex secret', async () => {
        const before = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        const beforeLast4 = before.body.data.webhookSecretLast4;

        const res = await request(app.getHttpServer())
          .post('/api/dashboard/tenant/webhook/rotate-secret')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        expect(res.body.data.webhookSecret).toMatch(/^[a-f0-9]{64}$/);

        // Confirm the DB actually took the new value — the secret's last4
        // changes, so a fresh GET returns different digits than before.
        const after = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        expect(after.body.data.webhookSecretLast4).toBe(
          res.body.data.webhookSecret.slice(-4),
        );
        // Chance collision on random hex is 1/65_536 — if this flakes, the
        // test should rotate again rather than be weakened. Very rare in
        // practice.
        expect(after.body.data.webhookSecretLast4).not.toBe(beforeLast4);
      });

      it('POST /api/dashboard/tenant/webhook/test creates a webhook.test delivery', async () => {
        // Need a valid URL set first so the delivery isn't skipped with
        // "no webhookUrl configured". Point it somewhere that'll refuse the
        // connection — the row lands regardless, which is what we're
        // asserting here.
        await request(app.getHttpServer())
          .put('/api/dashboard/tenant/webhook')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ webhookUrl: 'https://example.com/spw-test-hook' })
          .expect(200);

        await request(app.getHttpServer())
          .post('/api/dashboard/tenant/webhook/test')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        const list = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook/deliveries?limit=10')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        expect(Array.isArray(list.body.data)).toBe(true);
        const test = list.body.data.find(
          (d: { event: string }) => d.event === 'webhook.test',
        );
        expect(test).toBeTruthy();
        expect(test.tenantId).toBe(list.body.data[0].tenantId);
      });

      it('GET /api/dashboard/tenant/webhook/deliveries is tenant-scoped', async () => {
        const listA = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook/deliveries?limit=50')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        const listB = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook/deliveries?limit=50')
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(200);

        const aTenantIds = new Set(
          listA.body.data.map((d: { tenantId: number }) => d.tenantId),
        );
        const bTenantIds = new Set(
          listB.body.data.map((d: { tenantId: number }) => d.tenantId),
        );
        // Each tenant only sees their own rows — never the other's.
        expect(aTenantIds.size).toBeLessThanOrEqual(1);
        expect(bTenantIds.size).toBeLessThanOrEqual(1);
        if (aTenantIds.size === 1 && bTenantIds.size === 1) {
          expect([...aTenantIds][0]).not.toBe([...bTenantIds][0]);
        }
      });
    });

    // Cache-clear: tenant admin can bump their syncVersion + triggers a
    // cache.invalidated webhook, and the public sync-meta endpoint reflects
    // the new version so polling widgets can invalidate their local cache.
    describe('Cache clear', () => {
      let tenantApiKey: string;
      let initialVersion: number;

      beforeAll(async () => {
        // Rotate to grab a raw api-key we can use against public endpoints —
        // the one from register was already rotated earlier in the suite.
        const rot = await request(app.getHttpServer())
          .post('/api/dashboard/tenant/api-key/rotate')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        tenantApiKey = rot.body.data.apiKey;

        const meta = await request(app.getHttpServer())
          .get('/api/v1/sync-meta')
          .set('x-api-key', tenantApiKey)
          .expect(200);
        initialVersion = meta.body.data.syncVersion;
        expect(typeof initialVersion).toBe('number');
      });

      it('POST /api/dashboard/cache/clear bumps syncVersion and emits webhook', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/dashboard/tenant/cache/clear')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);

        expect(res.body.data.syncVersion).toBe(initialVersion + 1);
        expect(res.body.data.clearedAt).toBeTruthy();

        // Public sync-meta reflects the bump.
        const after = await request(app.getHttpServer())
          .get('/api/v1/sync-meta')
          .set('x-api-key', tenantApiKey)
          .expect(200);
        expect(after.body.data.syncVersion).toBe(initialVersion + 1);

        // cache.invalidated webhook row exists for tenant A.
        const ds = app.get(DataSource);
        const admin = await ds.getRepository(User).findOneOrFail({
          where: { email: adminA.email },
        });
        const delivery = await ds.getRepository(WebhookDelivery).findOne({
          where: { tenantId: admin.tenantId, event: 'cache.invalidated' },
          order: { id: 'DESC' },
        });
        expect(delivery).toBeTruthy();
        expect((delivery!.payload as any).syncVersion).toBe(initialVersion + 1);

        // 5P: clear action persists lastCacheClearedAt on the tenant row so
        // the dashboard can surface "last cleared X minutes ago" across
        // reloads. Verify the row was updated by reading it back directly.
        const tenantRow = await ds.getRepository(Tenant).findOneOrFail({
          where: { id: admin.tenantId },
          select: ['id', 'lastCacheClearedAt'],
        });
        expect(tenantRow.lastCacheClearedAt).toBeInstanceOf(Date);
        // Sanity: the persisted timestamp should be within a few seconds
        // of the ISO string the endpoint returned.
        const persistedMs = tenantRow.lastCacheClearedAt!.getTime();
        const returnedMs = new Date(res.body.data.clearedAt).getTime();
        expect(Math.abs(persistedMs - returnedMs)).toBeLessThan(5000);
      });

      it('GET /api/v1/sync-meta rejects missing or invalid api-key', async () => {
        await request(app.getHttpServer()).get('/api/v1/sync-meta').expect(401);
        await request(app.getHttpServer())
          .get('/api/v1/sync-meta')
          .set('x-api-key', 'spw_not-a-real-key')
          .expect(401);
      });
    });
  });

  // Scheduled DB cleanup: prunes expired-and-revoked refresh tokens (>7d
  // old) and webhook_deliveries (>30d old). The cron itself fires at 03:30
  // so we drive the service method directly — cron firing is a NestJS
  // concern not ours to retest.
  describe('Maintenance cleanup', () => {
    it('prunes stale refresh_tokens + webhook_deliveries beyond retention', async () => {
      const ds = app.get(DataSource);
      // Any user works — we're testing the purge SQL, not tenant semantics.
      // By the time this block runs, the Auth block has seeded at least one.
      const user = await ds.getRepository(User).find({ take: 1 }).then((r) => r[0]);
      expect(user).toBeTruthy();
      const tenantId = user.tenantId;
      const userId = user.id;

      // Seed one stale-and-revoked refresh row (should be deleted) and one
      // stale-but-alive row (should be kept — reuse-detection audits may
      // still want it). 40 days past both retention windows so the boundary
      // comparison (< cutoff) is unambiguous.
      const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const staleRevoked = await ds.getRepository(RefreshToken).save({
        userId,
        tenantId,
        familyId: randomBytes(16).toString('hex'), // CHAR(32)
        tokenHash: createHash('sha256').update('cleanup-stale-revoked-' + Date.now()).digest('hex'),
        expiresAt: stale,
        revokedAt: stale,
        revokedReason: 'logout',
        replacedByHash: null,
      });
      const staleAlive = await ds.getRepository(RefreshToken).save({
        userId,
        tenantId,
        familyId: randomBytes(16).toString('hex'),
        tokenHash: createHash('sha256').update('cleanup-stale-alive-' + Date.now()).digest('hex'),
        expiresAt: stale,
        revokedAt: null,
        revokedReason: null,
        replacedByHash: null,
      });

      // Stale webhook delivery row (skipped status so we don't poke BullMQ).
      const staleDelivery = await ds.getRepository(WebhookDelivery).save({
        tenantId,
        event: 'property.created',
        targetUrl: '',
        payload: { note: 'cleanup test' },
        status: 'skipped' as const,
        lastError: 'retention test',
      });
      // Backdate createdAt past the 30-day window manually — TypeORM's
      // update() strips CreateDateColumn fields, so go raw.
      await ds.query('UPDATE webhook_deliveries SET createdAt = ? WHERE id = ?', [
        stale,
        staleDelivery.id,
      ]);

      const cleanup = app.get(CleanupService);
      const counts = await cleanup.runCleanup();

      expect(counts.refreshTokens).toBeGreaterThanOrEqual(1);
      expect(counts.webhookDeliveries).toBeGreaterThanOrEqual(1);

      // Revoked-and-stale row gone; expired-but-not-revoked still present.
      expect(
        await ds.getRepository(RefreshToken).findOne({ where: { id: staleRevoked.id } }),
      ).toBeNull();
      expect(
        await ds.getRepository(RefreshToken).findOne({ where: { id: staleAlive.id } }),
      ).not.toBeNull();

      // Webhook delivery row purged.
      expect(
        await ds.getRepository(WebhookDelivery).findOne({ where: { id: staleDelivery.id } }),
      ).toBeNull();

      // Housekeep the stale-alive row so we don't leak test fixtures.
      await ds.getRepository(RefreshToken).delete(staleAlive.id);
    });

    // Distributed lock. Without this, every replica fires scheduledCleanup()
    // at 03:30 and races the same DELETE queries. With the lock in place,
    // only one replica should "execute"; the others observe executed=false.
    it('scheduledCleanup is serialized by the Redis lock', async () => {
      const cleanup = app.get(CleanupService);

      // Fire two concurrent "replicas" — in a real horizontal deploy these
      // would be on different processes, but same-process contention is a
      // strict superset: both get into withLock() before either releases.
      const [first, second] = await Promise.all([
        cleanup.scheduledCleanup(),
        cleanup.scheduledCleanup(),
      ]);

      const executed = [first, second].filter((r) => r.executed).length;
      const skipped = [first, second].filter((r) => !r.executed).length;
      expect(executed).toBe(1);
      expect(skipped).toBe(1);

      // Lock should be released by the time we get here — a subsequent call
      // can re-acquire and execute.
      const follow = await cleanup.scheduledCleanup();
      expect(follow.executed).toBe(true);
    });
  });

  // Public-API (per-tenant-key) rate limiter. Lives above the login flood
  // test so the login 429s can't bleed into this block. Floods GET /api/v1/
  // properties with one tenant's api key until the tracker fires, then
  // confirms a second tenant's key is not affected. Also verifies that a
  // tenant on a higher-tier plan (Enterprise ratePerMinute=3000) sails past
  // the Free threshold — proving the per-plan resolution actually kicks in.
  describe('Public API per-api-key rate limiting', () => {
    // Free plan ships at 30 req/min (see seed.ts + PlanRatePerMinute migration).
    // Hardcoding the constant here keeps the test readable; if the seed default
    // changes, this assertion needs to change with it.
    const FREE_PLAN_LIMIT = 30;

    let keyC: string;
    let keyD: string;
    let keyE: string; // tenant on Enterprise plan — should not throttle at 30

    it('registers three fresh tenants to get independent api keys', async () => {
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

      // Register C/D/E on Free plan. Then promote E to Enterprise directly
      // in the DB — the dashboard plan-change flow is out of scope for this
      // smoke test, we only need the plan relation set.
      const regE = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `ratee-${Date.now()}@smoke.test`,
          password: 'SmokeTest1234!',
          name: 'Rate E Admin',
          tenantName: 'Rate E Tenant',
          tenantSlug: uniqueSlug('ratee'),
        })
        .expect(201);
      keyE = regE.body.data.tenantApiKey;

      const ds = app.get(DataSource);
      const enterprisePlanId = await ds
        .query('SELECT id FROM plans WHERE slug = ? LIMIT 1', ['enterprise'])
        .then((rows: Array<{ id: number }>) => rows[0]?.id);
      expect(enterprisePlanId).toBeTruthy();
      const eHash = createHash('sha256').update(keyE).digest('hex');
      await ds.query('UPDATE tenants SET planId = ? WHERE apiKeyHash = ?', [
        enterprisePlanId,
        eHash,
      ]);

      expect(keyC).toMatch(/^spw_[a-f0-9]{64}$/);
      expect(keyD).toMatch(/^spw_[a-f0-9]{64}$/);
      expect(keyE).toMatch(/^spw_[a-f0-9]{64}$/);
    });

    it('Free-plan tenant C is throttled at its plan ceiling', async () => {
      // Fire (limit + 5) requests so we cleanly cross the threshold. The
      // lookup cache in ApiKeyThrottlerGuard is 30s — already primed by this
      // point in the suite, so the plan rate reflects the Enterprise update
      // we just performed (but C is Free, so still 30).
      const statuses: number[] = [];
      for (let i = 0; i < FREE_PLAN_LIMIT + 5; i++) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/properties')
          .set('x-api-key', keyC);
        statuses.push(res.status);
      }

      const throttled = statuses.filter((s) => s === 429);
      expect(throttled.length).toBeGreaterThanOrEqual(1);
      // First handful should have sailed through — search returns an empty
      // list for a brand-new tenant.
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    });

    it('tenant D is unaffected — its own bucket is untouched', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/properties')
        .set('x-api-key', keyD)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('Enterprise-plan tenant E sails past the Free-plan ceiling', async () => {
      // Clear only this tenant's bucket so the lookup-cache change is the
      // only variable. (Clearing all throttler keys would also drop C's 429
      // state, but there's no harm — C isn't asserted again.)
      await flushThrottlerKeys();

      // Fire FREE_PLAN_LIMIT + 10 requests. An Enterprise tenant (3000/min)
      // should be nowhere near their ceiling — every request must be 200.
      const statuses: number[] = [];
      for (let i = 0; i < FREE_PLAN_LIMIT + 10; i++) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/properties')
          .set('x-api-key', keyE);
        statuses.push(res.status);
      }
      expect(statuses.every((s) => s === 200)).toBe(true);
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
