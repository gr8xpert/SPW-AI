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
// 6A — Paddle webhook tests need a configured secret so signature
// verification can actually run. Fixed value so we can reproduce the hex
// digests in the tests without reading process.env back.
process.env.PADDLE_WEBHOOK_SECRET = 'pdl_whtest_integration_secret_v6a';
process.env.PADDLE_GRACE_DAYS = '7';
// 6E — Paddle outbound checkout. Real-looking value so boot-audit
// doesn't flag it and the service treats checkout as enabled. The
// fetchImpl is swapped per-test so no real HTTP call ever lands.
process.env.PADDLE_API_KEY = 'pdl_live_apikeytest_v6e_integration';
process.env.PADDLE_API_URL = 'https://api.paddle.test';
// 7A — Stripe webhook tests for credit hour purchases.
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_smoketest_stripe_v7a';
// 7E — Stripe outbound checkout. fetchImpl is swapped per-test.
process.env.STRIPE_SECRET_KEY = 'sk_test_smoketest_stripe_v7e';
process.env.DASHBOARD_URL = 'http://localhost:3000';

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
import { User, EmailVerificationToken, Tenant, WebhookDelivery, RefreshToken, SubscriptionPayment, ProcessedPaddleEvent, ProcessedStripeEvent, TenantEmailDomain, Plan, CreditPackage, CreditBalance, CreditTransaction } from '../src/database/entities';
import { signPaddlePayload } from '../src/modules/payment/paddle-signature';
import { signStripePayload } from '../src/modules/payment/stripe-signature';
import { PaddleCheckoutService } from '../src/modules/payment/paddle-checkout.service';
import { StripeCheckoutService } from '../src/modules/payment/stripe-checkout.service';
import { EmailSenderService } from '../src/modules/email-campaign/email-sender.service';
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

  // rawBody: true mirrors main.ts so the Paddle webhook controller can read
  // req.rawBody for signature verification.
  const app = moduleFixture.createNestApplication({ rawBody: true });
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
      expect(res.body.data.tenantApiKey).toMatch(/^spm_[a-f0-9]{64}$/);
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
          '"SPM Test" <noreply@smoke.test>',
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
        expect(res.body.data.apiKey).toMatch(/^spm_[a-f0-9]{64}$/);
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
        expect(hit.headers['x-spm-event']).toBe('property.created');
        expect(hit.headers['x-spm-delivery-id']).toBeTruthy();
        const sig = hit.headers['x-spm-signature'] as string;
        const ts = hit.headers['x-spm-timestamp'] as string;
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
          .findOne({ where: { id: Number(hit.headers['x-spm-delivery-id']) } });
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
          .send({ webhookUrl: 'https://example.com/spm-test-hook' })
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

      // 5Q: single-delivery detail + redeliver. Click-through in the
      // dashboard drawer goes through GET /:id (payload + targetUrl),
      // and the Redeliver button POSTs to /:id/redeliver which must
      // create a brand-new row (audit trail intact).
      it('GET /webhook/deliveries/:id returns payload + targetUrl', async () => {
        const list = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook/deliveries?limit=10')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        const first = list.body.data[0];
        expect(first).toBeTruthy();

        const detail = await request(app.getHttpServer())
          .get(`/api/dashboard/tenant/webhook/deliveries/${first.id}`)
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        expect(detail.body.data.id).toBe(first.id);
        expect(detail.body.data.payload).toBeTruthy();
        // targetUrl is present (might be empty for skipped rows) — the
        // field exists on the payload so the drawer can render it.
        expect('targetUrl' in detail.body.data).toBe(true);
      });

      it('GET /webhook/deliveries/:id 404s for another tenant\u2019s row', async () => {
        // Seed a fresh webhook.test on tenant A, then try to fetch its id
        // as tenant B. ParseIntPipe accepts the path, service-level tenant
        // scoping must return 404.
        const list = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook/deliveries?limit=5')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        const aDeliveryId = list.body.data[0].id;
        await request(app.getHttpServer())
          .get(`/api/dashboard/tenant/webhook/deliveries/${aDeliveryId}`)
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(404);
      });

      it('POST /webhook/deliveries/:id/redeliver creates a new row', async () => {
        const listBefore = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook/deliveries?limit=50')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        const originalCount = listBefore.body.data.length;
        const original = listBefore.body.data.find(
          (d: { event: string }) => d.event === 'webhook.test',
        );
        expect(original).toBeTruthy();

        const res = await request(app.getHttpServer())
          .post(
            `/api/dashboard/tenant/webhook/deliveries/${original.id}/redeliver`,
          )
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        // Response is the new delivery row — fresh id, same event, same
        // payload shape. Not the same id as the one we redelivered.
        expect(res.body.data.id).not.toBe(original.id);
        expect(res.body.data.event).toBe(original.event);

        const listAfter = await request(app.getHttpServer())
          .get('/api/dashboard/tenant/webhook/deliveries?limit=50')
          .set('Authorization', `Bearer ${tokenA}`)
          .expect(200);
        // Count went up — original row is still present (audit), and a
        // new one was created.
        expect(listAfter.body.data.length).toBe(originalCount + 1);
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
          .set('x-api-key', 'spm_not-a-real-key')
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

  // 5S — rate-limit headroom. Drives the service directly (no
  // super-admin HTTP login path exists in the smoke suite). Proves the
  // endpoint returns rows for every active tenant registered earlier,
  // with the roll-up status field classified correctly. We don't assert
  // a specific currentUsage because other tests in the suite may or may
  // not have driven up the counters for a given tenant; shape-checking
  // the response + sort order is the invariant.
  describe('Rate-limit headroom', () => {
    it('returns one row per active tenant, sorted busiest-first', async () => {
      const { RateLimitHeadroomService } = await import(
        '../src/modules/super-admin/rate-limit-headroom.service'
      );
      const svc = app.get(RateLimitHeadroomService);
      const rows = await svc.getHeadroom();

      expect(Array.isArray(rows)).toBe(true);
      // Every prior describe block registered at least one tenant, so
      // the list is never empty by the time we get here.
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        expect(typeof row.tenantId).toBe('number');
        expect(typeof row.tenantName).toBe('string');
        expect(typeof row.ratePerMinute).toBe('number');
        expect(typeof row.currentUsage).toBe('number');
        expect(row.currentUsage).toBeGreaterThanOrEqual(0);
        expect(row.headroomPercent).toBeLessThanOrEqual(100);
        expect(row.headroomPercent).toBeGreaterThanOrEqual(0);
        expect(['ok', 'warning', 'critical']).toContain(row.status);

        // Classification boundaries match the service's thresholds.
        if (row.headroomPercent <= 10) expect(row.status).toBe('critical');
        else if (row.headroomPercent <= 30) expect(row.status).toBe('warning');
        else expect(row.status).toBe('ok');
      }

      // Busiest-first: headroomPercent should be non-decreasing as we
      // walk the list.
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].headroomPercent).toBeGreaterThanOrEqual(
          rows[i - 1].headroomPercent,
        );
      }
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

      expect(keyC).toMatch(/^spm_[a-f0-9]{64}$/);
      expect(keyD).toMatch(/^spm_[a-f0-9]{64}$/);
      expect(keyE).toMatch(/^spm_[a-f0-9]{64}$/);
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

  // 5R — per-tenant sender-domain verification. The dashboard lets a
  // tenant declare a From-address domain, hands them three DNS records
  // (SPF/DKIM/DMARC) to add, and later verifies via dns.resolveTxt. We
  // drive the API endpoints here; we don't assert a successful verify
  // because the test DB doesn't control real DNS. Placed after the
  // per-api-key rate-limit block so that block can claim its own quota
  // of fresh /register calls — ordering discipline for a shared bucket.
  describe('Email sender domain', () => {
    let tokenA: string;
    let tokenB: string;

    beforeAll(async () => {
      const ts = Date.now();
      const slug = `email-dom-${ts}`;
      const aEmail = `admin-${slug}@smoke.test`;
      const regA = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: aEmail,
          password: 'SmokeTest1234!',
          name: 'Tenant A Admin',
          tenantName: 'Tenant Email Dom A',
          tenantSlug: slug,
        })
        .expect(201);
      tokenA = regA.body.data.accessToken;

      const slugB = `email-dom-b-${ts}`;
      const bEmail = `admin-${slugB}@smoke.test`;
      const regB = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: bEmail,
          password: 'SmokeTest1234!',
          name: 'Tenant B Admin',
          tenantName: 'Tenant Email Dom B',
          tenantSlug: slugB,
        })
        .expect(201);
      tokenB = regB.body.data.accessToken;
    });

    it('GET returns null when no domain configured', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      // data is wrapped by the global response interceptor; absence of a
      // configured domain surfaces as data: null (not a 404) so the
      // dashboard's initial load doesn't toast an error.
      expect(res.body.data).toBeNull();
    });

    it('PUT creates a domain and returns DNS records', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ domain: 'mail.example-smoke-a.test' })
        .expect(200);
      expect(res.body.data.domain).toBe('mail.example-smoke-a.test');
      expect(res.body.data.dkimSelector).toBe('spm1');
      expect(res.body.data.status).toBe('unverified');
      // SPF record lives at the domain apex; value always starts with v=spf1
      expect(res.body.data.records.spf.host).toBe('mail.example-smoke-a.test');
      expect(res.body.data.records.spf.value).toMatch(/^v=spf1 /);
      // DKIM host is <selector>._domainkey.<domain>; value includes the
      // public-key base64 body.
      expect(res.body.data.records.dkim.host).toBe(
        'spm1._domainkey.mail.example-smoke-a.test',
      );
      expect(res.body.data.records.dkim.value).toMatch(
        /^v=DKIM1; k=rsa; p=[A-Za-z0-9+/=]+$/,
      );
      // DMARC at _dmarc.<domain>
      expect(res.body.data.records.dmarc.host).toBe(
        '_dmarc.mail.example-smoke-a.test',
      );
      expect(res.body.data.records.dmarc.value).toMatch(/^v=DMARC1; /);
    });

    it('PUT with the same domain is idempotent (same DKIM key)', async () => {
      const first = await request(app.getHttpServer())
        .get('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const firstKey = first.body.data.records.dkim.value;

      const res = await request(app.getHttpServer())
        .put('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ domain: 'mail.example-smoke-a.test' })
        .expect(200);
      expect(res.body.data.records.dkim.value).toBe(firstKey);
    });

    it('PUT with a new domain rotates the DKIM keypair', async () => {
      const before = await request(app.getHttpServer())
        .get('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const beforeKey = before.body.data.records.dkim.value;

      const res = await request(app.getHttpServer())
        .put('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ domain: 'mail.example-smoke-a-v2.test' })
        .expect(200);
      expect(res.body.data.domain).toBe('mail.example-smoke-a-v2.test');
      expect(res.body.data.records.dkim.value).not.toBe(beforeKey);
      // Verification stamps reset — pointing at a new domain means the
      // old DNS records are moot.
      expect(res.body.data.spfVerifiedAt).toBeNull();
      expect(res.body.data.dkimVerifiedAt).toBeNull();
      expect(res.body.data.dmarcVerifiedAt).toBeNull();
    });

    it('PUT rejects an invalid FQDN', async () => {
      await request(app.getHttpServer())
        .put('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ domain: 'not a domain' })
        .expect(400);
    });

    it('POST verify reports unverified for a test-only domain', async () => {
      // The test hostname doesn't resolve → each record fails, status
      // stays 'unverified'. Catches regressions like swallowing DNS
      // errors and accidentally stamping verifiedAt.
      const res = await request(app.getHttpServer())
        .post('/api/dashboard/tenant/email-domain/verify')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.data.status).toBe('unverified');
      expect(res.body.data.spf.ok).toBe(false);
      expect(res.body.data.dkim.ok).toBe(false);
      expect(res.body.data.dmarc.ok).toBe(false);
    });

    it('is tenant-isolated — tenant B sees null while A has one configured', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(res.body.data).toBeNull();
    });

    it('DELETE removes the domain (204)', async () => {
      await request(app.getHttpServer())
        .delete('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(204);
      const after = await request(app.getHttpServer())
        .get('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(after.body.data).toBeNull();
    });
  });

  // 6C — BullMQ queue-depth observability. Driven service-level (same
  // pattern as 5S) since the super-admin HTTP auth path isn't set up in
  // smoke. Asserts the snapshot shape and the paused-queue critical band.
  describe('Queue depth (6C)', () => {
    it('returns one row per tracked queue with full shape', async () => {
      const { QueueDepthService } = await import(
        '../src/modules/super-admin/queue-depth.service'
      );
      const svc = app.get(QueueDepthService);
      const rows = await svc.getSnapshot();

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(4);

      const names = rows.map((r) => r.name).sort();
      expect(names).toEqual([
        'email-campaign',
        'feed-import',
        'migration',
        'webhook-dispatch',
      ]);

      for (const row of rows) {
        expect(typeof row.waiting).toBe('number');
        expect(typeof row.active).toBe('number');
        expect(typeof row.delayed).toBe('number');
        expect(typeof row.failed).toBe('number');
        expect(typeof row.paused).toBe('boolean');
        expect(['ok', 'warning', 'critical']).toContain(row.status);
      }
    });

    it('classifies a paused queue as critical and recovers on resume', async () => {
      const { QueueDepthService } = await import(
        '../src/modules/super-admin/queue-depth.service'
      );
      const { getQueueToken } = await import('@nestjs/bullmq');
      // Pick migration — lowest traffic, so pausing it doesn't fight any
      // in-flight job from a prior describe block.
      const migrationQueue = app.get(getQueueToken('migration'));
      const svc = app.get(QueueDepthService);

      await migrationQueue.pause();
      try {
        const rows = await svc.getSnapshot();
        const migration = rows.find((r) => r.name === 'migration');
        expect(migration).toBeDefined();
        expect(migration!.paused).toBe(true);
        expect(migration!.status).toBe('critical');
      } finally {
        await migrationQueue.resume();
      }

      // After resume, classification should drop back to 'ok' (counts are
      // all zero, queue no longer paused).
      const rowsAfter = await svc.getSnapshot();
      const migration = rowsAfter.find((r) => r.name === 'migration');
      expect(migration!.paused).toBe(false);
      expect(migration!.status).toBe('ok');
    });
  });

  // 6B — DKIM signing. Two independent surfaces: tenant campaign mail
  // (EmailSenderService) and system/operator mail (SystemMailerService).
  // We verify the resolution logic directly rather than asserting on a
  // synthesized DKIM-Signature header — nodemailer does the actual signing
  // inside its transport and we've already covered that it receives the
  // right options.
  describe('DKIM signing (6B)', () => {
    let dkimTenantId: number;
    let dkimTenantToken: string;

    beforeAll(async () => {
      const slug = uniqueSlug('tenant-dkim');
      const email = `admin-${slug}@smoke.test`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SmokeTest1234!',
          name: 'DKIM Tenant Admin',
          tenantName: 'DKIM Smoke',
          tenantSlug: slug,
        })
        .expect(201);
      await forceVerifyEmail(app, email);
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'SmokeTest1234!' })
        .expect(200);
      dkimTenantToken = login.body.data.accessToken;
      const ds = app.get(DataSource);
      const tenant = await ds
        .getRepository(Tenant)
        .findOneOrFail({ where: { slug } });
      dkimTenantId = tenant.id;
    });

    it('tenant with unverified domain → getDkimOptions returns null', async () => {
      // Configure a domain but don't stamp dkimVerifiedAt. The sender
      // must decline to sign — publishing unverified signatures would
      // make every receiver hard-fail the message.
      await request(app.getHttpServer())
        .put('/api/dashboard/tenant/email-domain')
        .set('Authorization', `Bearer ${dkimTenantToken}`)
        .send({ domain: 'mail.dkim-smoke-test.example' })
        .expect(200);

      const sender = app.get(EmailSenderService);
      const opts = await sender.getDkimOptions(dkimTenantId);
      expect(opts).toBeNull();
    });

    it('tenant with verified domain → getDkimOptions returns populated DKIM opts', async () => {
      // Stamp dkimVerifiedAt directly — the public verify endpoint would
      // require real DNS, which we don't control in the smoke env.
      const ds = app.get(DataSource);
      await ds
        .getRepository(TenantEmailDomain)
        .update({ tenantId: dkimTenantId }, { dkimVerifiedAt: new Date() });

      const sender = app.get(EmailSenderService);
      const opts = await sender.getDkimOptions(dkimTenantId);
      expect(opts).not.toBeNull();
      expect(opts!.domainName).toBe('mail.dkim-smoke-test.example');
      expect(opts!.keySelector).toBe('spm1');
      // Decrypted PEM — transformer on TenantEmailDomain.dkimPrivateKey
      // round-trips through enc:v1: ciphertext. If it came back as the
      // encrypted blob, nodemailer would reject it on the first send.
      expect(opts!.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    it('operator DKIM env unset → getOperatorDkimOptions returns null', async () => {
      const original = {
        d: process.env.MAIL_DKIM_DOMAIN,
        s: process.env.MAIL_DKIM_SELECTOR,
        k: process.env.MAIL_DKIM_PRIVATE_KEY,
      };
      delete process.env.MAIL_DKIM_DOMAIN;
      delete process.env.MAIL_DKIM_SELECTOR;
      delete process.env.MAIL_DKIM_PRIVATE_KEY;
      try {
        const mailer = app.get(SystemMailerService);
        expect(mailer.getOperatorDkimOptions()).toBeNull();
      } finally {
        if (original.d !== undefined) process.env.MAIL_DKIM_DOMAIN = original.d;
        if (original.s !== undefined) process.env.MAIL_DKIM_SELECTOR = original.s;
        if (original.k !== undefined) process.env.MAIL_DKIM_PRIVATE_KEY = original.k;
      }
    });

    it('operator DKIM env set → getOperatorDkimOptions returns opts with unescaped PEM', async () => {
      // Fake PEM — content doesn't need to be a real key for this assertion;
      // we just verify (a) the three env vars flow through, (b) the "\n"
      // literal gets converted back to actual newlines so OpenSSL/nodemailer
      // can parse the PEM when mail actually flies.
      const escapedPem =
        '-----BEGIN PRIVATE KEY-----\\nMIIE...fake-body...==\\n-----END PRIVATE KEY-----';
      process.env.MAIL_DKIM_DOMAIN = 'platform.smartpropertywidget.com';
      process.env.MAIL_DKIM_SELECTOR = 'spmsys1';
      process.env.MAIL_DKIM_PRIVATE_KEY = escapedPem;
      try {
        const mailer = app.get(SystemMailerService);
        const opts = mailer.getOperatorDkimOptions();
        expect(opts).not.toBeNull();
        expect(opts!.domainName).toBe('platform.smartpropertywidget.com');
        expect(opts!.keySelector).toBe('spmsys1');
        // Unescaped: actual newlines present instead of literal \n.
        expect(opts!.privateKey.split('\n').length).toBeGreaterThan(1);
        expect(opts!.privateKey).toContain('BEGIN PRIVATE KEY');
      } finally {
        delete process.env.MAIL_DKIM_DOMAIN;
        delete process.env.MAIL_DKIM_SELECTOR;
        delete process.env.MAIL_DKIM_PRIVATE_KEY;
      }
    });
  });

  // 6A — Paddle inbound webhook. Exercises signature verification, replay
  // idempotency, and the end-to-end tenant/payment sync for the two events
  // that drive subscription state in production: subscription.created and
  // transaction.payment_failed.
  describe('Paddle inbound webhook (6A)', () => {
    const paddleSecret = 'pdl_whtest_integration_secret_v6a';
    let paddleTenantId: number;

    const buildSigned = (body: object, timestamp?: number) => {
      const raw = JSON.stringify(body);
      const header = signPaddlePayload(raw, paddleSecret, timestamp);
      return { raw, header };
    };

    beforeAll(async () => {
      // Register a dedicated tenant for the Paddle block so these tests
      // don't contend with other describe blocks mutating tenant state.
      const slug = uniqueSlug('tenant-paddle');
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `admin-${slug}@smoke.test`,
          password: 'SmokeTest1234!',
          name: 'Paddle Tenant Admin',
          tenantName: 'Paddle Smoke',
          tenantSlug: slug,
        })
        .expect(201);

      const ds = app.get(DataSource);
      const tenant = await ds
        .getRepository(Tenant)
        .findOneOrFail({ where: { slug } });
      paddleTenantId = tenant.id;
    });

    it('rejects a missing/malformed signature header with 401', async () => {
      const { raw } = buildSigned({ event_id: 'evt_badsig_1', event_type: 'subscription.created', data: {} });
      await request(app.getHttpServer())
        .post('/api/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', 'not-a-real-header')
        .send(raw)
        .expect(401);
    });

    it('rejects a stale timestamp outside the 5-minute window', async () => {
      const staleTs = Math.floor(Date.now() / 1000) - 3600; // 1h old
      const { raw, header } = buildSigned(
        { event_id: 'evt_stale_1', event_type: 'subscription.created', data: {} },
        staleTs,
      );
      await request(app.getHttpServer())
        .post('/api/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', header)
        .send(raw)
        .expect(401);
    });

    it('applies subscription.created — syncs tenant + writes payment row', async () => {
      const eventId = `evt_created_${Date.now()}`;
      const body = {
        event_id: eventId,
        event_type: 'subscription.created',
        occurred_at: new Date().toISOString(),
        data: {
          id: 'sub_paddle_test_1',
          customer_id: 'ctm_paddle_test_1',
          status: 'active',
          billing_cycle: { interval: 'month', frequency: 1 },
          next_billed_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          currency_code: 'EUR',
          custom_data: { tenantId: paddleTenantId },
        },
      };
      const { raw, header } = buildSigned(body);

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', header)
        .send(raw)
        .expect(200);

      expect(res.body.data.outcome).toBe('applied');
      expect(res.body.data.tenantId).toBe(paddleTenantId);

      const ds = app.get(DataSource);
      const tenant = await ds.getRepository(Tenant).findOneOrFail({ where: { id: paddleTenantId } });
      expect(tenant.billingSource).toBe('paddle');
      expect(tenant.billingCycle).toBe('monthly');
      expect(tenant.subscriptionStatus).toBe('active');

      const payments = await ds.getRepository(SubscriptionPayment).find({
        where: { tenantId: paddleTenantId, paddleSubscriptionId: 'sub_paddle_test_1' },
      });
      expect(payments.length).toBeGreaterThanOrEqual(1);
      expect(payments[0].type).toBe('new');
      expect(payments[0].paddleCustomerId).toBe('ctm_paddle_test_1');
    });

    it('is idempotent — replaying the same event_id is a 200 no-op', async () => {
      const eventId = `evt_replay_${Date.now()}`;
      const body = {
        event_id: eventId,
        event_type: 'subscription.created',
        data: {
          id: 'sub_paddle_replay_1',
          customer_id: 'ctm_paddle_replay_1',
          status: 'active',
          billing_cycle: { interval: 'month', frequency: 1 },
          custom_data: { tenantId: paddleTenantId },
        },
      };
      const { raw, header } = buildSigned(body);

      const first = await request(app.getHttpServer())
        .post('/api/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', header)
        .send(raw)
        .expect(200);
      expect(first.body.data.outcome).toBe('applied');

      // Second delivery of the exact same payload — Paddle retried because
      // the original ack was "lost". No new payment row, outcome=replay.
      const ds = app.get(DataSource);
      const countBefore = await ds
        .getRepository(SubscriptionPayment)
        .countBy({ paddleSubscriptionId: 'sub_paddle_replay_1' });

      const second = await request(app.getHttpServer())
        .post('/api/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', header)
        .send(raw)
        .expect(200);
      expect(second.body.data.outcome).toBe('replay');

      const countAfter = await ds
        .getRepository(SubscriptionPayment)
        .countBy({ paddleSubscriptionId: 'sub_paddle_replay_1' });
      expect(countAfter).toBe(countBefore);

      // Dedup row exists.
      const dedup = await ds
        .getRepository(ProcessedPaddleEvent)
        .findOneBy({ eventId });
      expect(dedup).not.toBeNull();
    });

    it('transaction.payment_failed flips the tenant into grace', async () => {
      const eventId = `evt_failed_${Date.now()}`;
      const body = {
        event_id: eventId,
        event_type: 'transaction.payment_failed',
        data: {
          id: 'txn_paddle_failed_1',
          subscription_id: 'sub_paddle_test_1',
          customer_id: 'ctm_paddle_test_1',
          currency_code: 'EUR',
          custom_data: { tenantId: paddleTenantId },
          payments: [{ error_code: 'declined', error_message: 'card declined' }],
        },
      };
      const { raw, header } = buildSigned(body);

      await request(app.getHttpServer())
        .post('/api/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', header)
        .send(raw)
        .expect(200);

      const ds = app.get(DataSource);
      const tenant = await ds.getRepository(Tenant).findOneOrFail({ where: { id: paddleTenantId } });
      expect(tenant.subscriptionStatus).toBe('grace');
      expect(tenant.graceEndsAt).not.toBeNull();

      const failed = await ds.getRepository(SubscriptionPayment).findOneOrFail({
        where: { paddleTransactionId: 'txn_paddle_failed_1' },
      });
      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toContain('card declined');
    });

    it('acks unhandled event types with outcome=unhandled', async () => {
      const eventId = `evt_unhandled_${Date.now()}`;
      const body = {
        event_id: eventId,
        event_type: 'address.created',
        data: { id: 'addr_1' },
      };
      const { raw, header } = buildSigned(body);

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', header)
        .send(raw)
        .expect(200);

      expect(res.body.data.outcome).toBe('unhandled');
    });
  });

  // 6E — Paddle outbound checkout. Exercises the happy path and four
  // guard rails that prevent us from handing tenants a useless URL:
  // unconfigured server, plan missing price_id, unknown plan, and a
  // duplicate upgrade to the same active plan.
  describe('Paddle checkout (6E)', () => {
    let checkoutTenantId: number;
    let checkoutToken: string;
    let configuredPlanId: number;
    let unconfiguredPlanId: number;
    let originalFetch: typeof fetch;
    let originalApiKey: string | undefined;

    beforeAll(async () => {
      const slug = uniqueSlug('tenant-checkout');
      const email = `admin-${slug}@smoke.test`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SmokeTest1234!',
          name: 'Checkout Admin',
          tenantName: 'Checkout Smoke',
          tenantSlug: slug,
        })
        .expect(201);
      await forceVerifyEmail(app, email);
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'SmokeTest1234!' })
        .expect(200);
      checkoutToken = login.body.data.accessToken;

      const ds = app.get(DataSource);
      const tenant = await ds
        .getRepository(Tenant)
        .findOneOrFail({ where: { slug } });
      checkoutTenantId = tenant.id;

      // Seed two plans the smoke run controls: one wired to Paddle, one
      // deliberately not — so the "missing price_id" assertion has a real
      // target. Created per-run to avoid colliding with whatever dev-seed
      // plans the developer's local MySQL happens to have.
      const planRepo = ds.getRepository(Plan);
      const configured = await planRepo.save(
        planRepo.create({
          name: 'Checkout Test Pro',
          slug: uniqueSlug('chk-pro'),
          priceMonthly: 49 as any,
          priceYearly: 490 as any,
          paddlePriceIdMonthly: 'pri_chk_pro_monthly',
          paddlePriceIdYearly: 'pri_chk_pro_yearly',
          maxProperties: 500,
          maxUsers: 10,
          ratePerMinute: 120,
          isActive: true,
        }),
      );
      configuredPlanId = configured.id;
      const unconfigured = await planRepo.save(
        planRepo.create({
          name: 'Checkout Test Starter',
          slug: uniqueSlug('chk-starter'),
          priceMonthly: 9 as any,
          priceYearly: null,
          paddlePriceIdMonthly: null,
          paddlePriceIdYearly: null,
          maxProperties: 50,
          maxUsers: 2,
          ratePerMinute: 30,
          isActive: true,
        }),
      );
      unconfiguredPlanId = unconfigured.id;

      // Swap the service's fetchImpl so the tests never hit the network.
      // Each test re-assigns this to match whatever response shape it
      // wants to observe; beforeAll just captures the original for cleanup.
      const svc = app.get(PaddleCheckoutService);
      originalFetch = svc.fetchImpl;
      originalApiKey = process.env.PADDLE_API_KEY;
    });

    afterAll(() => {
      const svc = app.get(PaddleCheckoutService);
      svc.fetchImpl = originalFetch;
      if (originalApiKey === undefined) delete process.env.PADDLE_API_KEY;
      else process.env.PADDLE_API_KEY = originalApiKey;
    });

    it('returns a Paddle checkout URL on success + forwards tenant custom_data', async () => {
      let captured: { url: string; init?: RequestInit } | null = null;
      const svc = app.get(PaddleCheckoutService);
      svc.fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: String(input), init };
        return new Response(
          JSON.stringify({
            data: {
              id: 'txn_smoke_pro_monthly',
              checkout: { url: 'https://pay.paddle.test/checkout/txn_smoke_pro_monthly' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch;

      const res = await request(app.getHttpServer())
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${checkoutToken}`)
        .send({ planId: configuredPlanId, billingCycle: 'monthly' })
        .expect(200);

      expect(res.body.data.url).toContain('pay.paddle.test');
      expect(res.body.data.transactionId).toBe('txn_smoke_pro_monthly');
      expect(captured).not.toBeNull();
      expect(captured!.url).toBe('https://api.paddle.test/transactions');
      const body = JSON.parse(String(captured!.init?.body ?? '{}'));
      expect(body.items[0].price_id).toBe('pri_chk_pro_monthly');
      // custom_data must include tenantId so the 6A webhook can route
      // downstream subscription.* events back to this tenant.
      expect(body.custom_data.tenantId).toBe(String(checkoutTenantId));
      expect(body.custom_data.planId).toBe(String(configuredPlanId));
      expect(body.custom_data.billingCycle).toBe('monthly');
      const auth = (captured!.init?.headers as Record<string, string>)?.Authorization;
      expect(auth).toBe(`Bearer ${process.env.PADDLE_API_KEY}`);
    });

    it('rejects a plan with no price_id for the requested cycle with 400', async () => {
      // fetchImpl should NOT be called — guard happens before the HTTP call.
      const svc = app.get(PaddleCheckoutService);
      let called = false;
      svc.fetchImpl = (async () => {
        called = true;
        return new Response('{}', { status: 200 });
      }) as typeof fetch;

      const res = await request(app.getHttpServer())
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${checkoutToken}`)
        .send({ planId: unconfiguredPlanId, billingCycle: 'monthly' })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('no Paddle price configured');
      expect(called).toBe(false);
    });

    it('rejects an unknown planId with 404', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${checkoutToken}`)
        .send({ planId: 999_999, billingCycle: 'monthly' })
        .expect(404);
    });

    it('returns 503 when PADDLE_API_KEY is not configured', async () => {
      delete process.env.PADDLE_API_KEY;
      try {
        await request(app.getHttpServer())
          .post('/api/billing/checkout')
          .set('Authorization', `Bearer ${checkoutToken}`)
          .send({ planId: configuredPlanId, billingCycle: 'yearly' })
          .expect(503);
      } finally {
        process.env.PADDLE_API_KEY = originalApiKey ?? 'pdl_live_apikeytest_v6e_integration';
      }
    });

    it('returns 409 when the tenant is already on the same active Paddle plan', async () => {
      // Put the tenant into the exact state the guard checks for: same
      // plan, active, paddle-sourced, same cycle.
      const ds = app.get(DataSource);
      await ds.getRepository(Tenant).update(
        { id: checkoutTenantId },
        {
          planId: configuredPlanId,
          subscriptionStatus: 'active',
          billingSource: 'paddle',
          billingCycle: 'monthly',
        },
      );

      await request(app.getHttpServer())
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${checkoutToken}`)
        .send({ planId: configuredPlanId, billingCycle: 'monthly' })
        .expect(409);

      // Switching cycle should still be allowed — different SKU.
      const svc = app.get(PaddleCheckoutService);
      svc.fetchImpl = (async () =>
        new Response(
          JSON.stringify({
            data: {
              id: 'txn_smoke_pro_yearly',
              checkout: { url: 'https://pay.paddle.test/checkout/txn_smoke_pro_yearly' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )) as typeof fetch;
      await request(app.getHttpServer())
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${checkoutToken}`)
        .send({ planId: configuredPlanId, billingCycle: 'yearly' })
        .expect(200);
    });
  });

  // 7A — Stripe inbound webhook. Exercises signature verification, replay
  // idempotency, and the end-to-end credit balance + transaction sync for
  // checkout.session.completed events that drive credit purchases.
  describe('Stripe inbound webhook (7A)', () => {
    const stripeSecret = 'whsec_smoketest_stripe_v7a';
    let stripeTenantId: number;

    const buildSigned = (body: object, timestamp?: number) => {
      const raw = JSON.stringify(body);
      const header = signStripePayload(raw, stripeSecret, timestamp);
      return { raw, header };
    };

    beforeAll(async () => {
      const slug = uniqueSlug('tenant-stripe-wh');
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `admin-${slug}@smoke.test`,
          password: 'SmokeTest1234!',
          name: 'Stripe WH Tenant Admin',
          tenantName: 'Stripe WH Smoke',
          tenantSlug: slug,
        })
        .expect(201);

      const ds = app.get(DataSource);
      const tenant = await ds
        .getRepository(Tenant)
        .findOneOrFail({ where: { slug } });
      stripeTenantId = tenant.id;
    });

    it('rejects a missing/malformed signature header with 401', async () => {
      const { raw } = buildSigned({
        id: 'evt_badsig_stripe_1',
        type: 'checkout.session.completed',
        data: { object: {} },
      });
      await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', 'not-a-real-header')
        .send(raw)
        .expect(401);
    });

    it('rejects a stale timestamp outside the 5-minute window', async () => {
      const staleTs = Math.floor(Date.now() / 1000) - 3600;
      const { raw, header } = buildSigned(
        { id: 'evt_stale_stripe_1', type: 'checkout.session.completed', data: { object: {} } },
        staleTs,
      );
      await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(raw)
        .expect(401);
    });

    it('applies checkout.session.completed — credits tenant balance + writes transaction', async () => {
      const eventId = `evt_stripe_completed_${Date.now()}`;
      const body = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_session_1',
            payment_intent: 'pi_test_stripe_1',
            metadata: {
              tenantId: String(stripeTenantId),
              packageId: '1',
              hours: '10',
            },
          },
        },
      };
      const { raw, header } = buildSigned(body);

      const ds = app.get(DataSource);
      const balanceBefore = await ds.getRepository(CreditBalance).findOne({
        where: { tenantId: stripeTenantId },
      });
      const previousBalance = balanceBefore ? Number(balanceBefore.balance) : 0;

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(raw)
        .expect(200);

      expect(res.body.data.outcome).toBe('applied');

      const balanceAfter = await ds.getRepository(CreditBalance).findOneOrFail({
        where: { tenantId: stripeTenantId },
      });
      expect(Number(balanceAfter.balance)).toBe(previousBalance + 10);

      const transactions = await ds.getRepository(CreditTransaction).find({
        where: { tenantId: stripeTenantId, paymentReference: 'pi_test_stripe_1' },
      });
      expect(transactions.length).toBe(1);
      expect(transactions[0].type).toBe('purchase');
      expect(Number(transactions[0].amount)).toBe(10);
      expect(Number(transactions[0].balanceAfter)).toBe(previousBalance + 10);
    });

    it('is idempotent — replaying the same event_id is a 200 no-op', async () => {
      const eventId = `evt_stripe_replay_${Date.now()}`;
      const body = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_replay_1',
            payment_intent: 'pi_test_replay_1',
            metadata: {
              tenantId: String(stripeTenantId),
              packageId: '1',
              hours: '5',
            },
          },
        },
      };
      const { raw, header } = buildSigned(body);

      const first = await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(raw)
        .expect(200);
      expect(first.body.data.outcome).toBe('applied');

      const ds = app.get(DataSource);
      const balanceBefore = await ds.getRepository(CreditBalance).findOneOrFail({
        where: { tenantId: stripeTenantId },
      });

      const second = await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(raw)
        .expect(200);
      expect(second.body.data.outcome).toBe('replay');

      const balanceAfter = await ds.getRepository(CreditBalance).findOneOrFail({
        where: { tenantId: stripeTenantId },
      });
      expect(Number(balanceAfter.balance)).toBe(Number(balanceBefore.balance));

      const dedup = await ds
        .getRepository(ProcessedStripeEvent)
        .findOneBy({ eventId });
      expect(dedup).not.toBeNull();
    });

    it('ignores unhandled event types with outcome=ignored', async () => {
      const eventId = `evt_stripe_unhandled_${Date.now()}`;
      const body = {
        id: eventId,
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_ignored_1' } },
      };
      const { raw, header } = buildSigned(body);

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(raw)
        .expect(200);

      expect(res.body.data.outcome).toBe('ignored');
    });

    it('handles missing metadata gracefully without crashing', async () => {
      const eventId = `evt_stripe_nometa_${Date.now()}`;
      const body = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_nometa_1',
            payment_intent: 'pi_test_nometa_1',
            metadata: {},
          },
        },
      };
      const { raw, header } = buildSigned(body);

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(raw)
        .expect(200);

      expect(res.body.data.received).toBe(true);
    });

    it('handles unknown tenantId gracefully', async () => {
      const eventId = `evt_stripe_badtenant_${Date.now()}`;
      const body = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_badtenant_1',
            payment_intent: 'pi_test_badtenant_1',
            metadata: {
              tenantId: '999999',
              packageId: '1',
              hours: '5',
            },
          },
        },
      };
      const { raw, header } = buildSigned(body);

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', header)
        .send(raw)
        .expect(200);

      expect(res.body.data.received).toBe(true);
    });
  });

  // 7E — Stripe outbound checkout for credit hour packages. Exercises the
  // happy path and guard rails: unconfigured server, unknown package,
  // inactive package, and the packages listing endpoint.
  describe('Stripe credit checkout (7E)', () => {
    let stripeCheckoutTenantId: number;
    let stripeCheckoutToken: string;
    let activePackageId: number;
    let inactivePackageId: number;
    let originalFetch: typeof fetch;
    let originalStripeKey: string | undefined;

    beforeAll(async () => {
      const slug = uniqueSlug('tenant-stripe-chk');
      const email = `admin-${slug}@smoke.test`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SmokeTest1234!',
          name: 'Stripe Checkout Admin',
          tenantName: 'Stripe Checkout Smoke',
          tenantSlug: slug,
        })
        .expect(201);
      await forceVerifyEmail(app, email);
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'SmokeTest1234!' })
        .expect(200);
      stripeCheckoutToken = login.body.data.accessToken;

      const ds = app.get(DataSource);
      const tenant = await ds
        .getRepository(Tenant)
        .findOneOrFail({ where: { slug } });
      stripeCheckoutTenantId = tenant.id;

      const pkgRepo = ds.getRepository(CreditPackage);
      const activePkg = await pkgRepo.save(
        pkgRepo.create({
          name: 'Smoke 5h Pack',
          hours: 5,
          pricePerHour: 35,
          totalPrice: 175,
          currency: 'EUR',
          isActive: true,
          sortOrder: 1,
        }),
      );
      activePackageId = activePkg.id;

      const inactivePkg = await pkgRepo.save(
        pkgRepo.create({
          name: 'Smoke Disabled Pack',
          hours: 20,
          pricePerHour: 30,
          totalPrice: 600,
          currency: 'EUR',
          isActive: false,
          sortOrder: 2,
        }),
      );
      inactivePackageId = inactivePkg.id;

      const svc = app.get(StripeCheckoutService);
      originalFetch = svc.fetchImpl;
      originalStripeKey = process.env.STRIPE_SECRET_KEY;
    });

    afterAll(() => {
      const svc = app.get(StripeCheckoutService);
      svc.fetchImpl = originalFetch;
      if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = originalStripeKey;
    });

    it('GET /api/billing/credits/packages lists only active packages', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/billing/credits/packages')
        .set('Authorization', `Bearer ${stripeCheckoutToken}`)
        .expect(200);

      const packages = res.body.data;
      expect(Array.isArray(packages)).toBe(true);
      const activeIds = packages.map((p: any) => p.id);
      expect(activeIds).toContain(activePackageId);
      expect(activeIds).not.toContain(inactivePackageId);
      const pkg = packages.find((p: any) => p.id === activePackageId);
      expect(Number(pkg.hours)).toBe(5);
      expect(Number(pkg.totalPrice)).toBe(175);
    });

    it('returns a Stripe checkout URL on success with correct metadata', async () => {
      let captured: { url: string; init?: RequestInit } | null = null;
      const svc = app.get(StripeCheckoutService);
      svc.fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: String(input), init };
        return new Response(
          JSON.stringify({
            id: 'cs_test_smoke_session_1',
            url: 'https://checkout.stripe.test/cs_test_smoke_session_1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch;

      const res = await request(app.getHttpServer())
        .post('/api/billing/credits/checkout')
        .set('Authorization', `Bearer ${stripeCheckoutToken}`)
        .send({ packageId: activePackageId })
        .expect(200);

      expect(res.body.data.url).toContain('checkout.stripe.test');
      expect(res.body.data.sessionId).toBe('cs_test_smoke_session_1');
      expect(captured).not.toBeNull();
      expect(captured!.url).toBe('https://api.stripe.com/v1/checkout/sessions');

      const bodyStr = String(captured!.init?.body ?? '');
      const params = new URLSearchParams(bodyStr);
      expect(params.get('metadata[tenantId]')).toBe(String(stripeCheckoutTenantId));
      expect(params.get('metadata[packageId]')).toBe(String(activePackageId));
      expect(params.get('metadata[hours]')).toBe('5');
      expect(params.get('line_items[0][price_data][unit_amount]')).toBe('17500');
      expect(params.get('line_items[0][price_data][currency]')).toBe('eur');
      expect(params.get('mode')).toBe('payment');
      const auth = (captured!.init?.headers as Record<string, string>)?.Authorization;
      expect(auth).toBe(`Bearer ${process.env.STRIPE_SECRET_KEY}`);
    });

    it('rejects an inactive packageId with 404', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/credits/checkout')
        .set('Authorization', `Bearer ${stripeCheckoutToken}`)
        .send({ packageId: inactivePackageId })
        .expect(404);
    });

    it('rejects an unknown packageId with 404', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/credits/checkout')
        .set('Authorization', `Bearer ${stripeCheckoutToken}`)
        .send({ packageId: 999_999 })
        .expect(404);
    });

    it('returns 503 when STRIPE_SECRET_KEY is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      try {
        await request(app.getHttpServer())
          .post('/api/billing/credits/checkout')
          .set('Authorization', `Bearer ${stripeCheckoutToken}`)
          .send({ packageId: activePackageId })
          .expect(503);
      } finally {
        process.env.STRIPE_SECRET_KEY = originalStripeKey ?? 'sk_test_smoketest_stripe_v7e';
      }
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/billing/credits/checkout')
        .send({ packageId: activePackageId })
        .expect(401);
    });
  });

  // 7C — Super-admin credit package CRUD. Exercises create, list, update,
  // and delete operations that the admin uses to manage purchasable packages.
  describe('Super-admin credit package CRUD (7C)', () => {
    let adminToken: string;
    let createdPackageId: number;

    beforeAll(async () => {
      const slug = uniqueSlug('tenant-pkg-admin');
      const email = `admin-${slug}@smoke.test`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email,
          password: 'SmokeTest1234!',
          name: 'Pkg CRUD Admin',
          tenantName: 'Pkg CRUD Smoke',
          tenantSlug: slug,
        })
        .expect(201);
      await forceVerifyEmail(app, email);

      const ds = app.get(DataSource);
      await ds.getRepository(User).update(
        { email: email.toLowerCase() },
        { role: 'super_admin' as any },
      );

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'SmokeTest1234!' })
        .expect(200);
      adminToken = login.body.data.accessToken;
    });

    it('creates a credit package', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/super-admin/credit-packages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Smoke CRUD Pack',
          hours: 10,
          pricePerHour: 35,
          totalPrice: 350,
          currency: 'EUR',
          isActive: true,
          sortOrder: 99,
        })
        .expect(201);

      createdPackageId = res.body.data.id;
      expect(res.body.data.name).toBe('Smoke CRUD Pack');
      expect(Number(res.body.data.hours)).toBe(10);
      expect(Number(res.body.data.totalPrice)).toBe(350);
    });

    it('lists credit packages including the new one', async () => {
      if (!adminToken) return;
      const res = await request(app.getHttpServer())
        .get('/api/super-admin/credit-packages')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const pkgs = res.body.data;
      expect(Array.isArray(pkgs)).toBe(true);
      const found = pkgs.find((p: any) => p.id === createdPackageId);
      expect(found).toBeDefined();
      expect(found.name).toBe('Smoke CRUD Pack');
    });

    it('updates a credit package', async () => {
      if (!adminToken || !createdPackageId) return;
      const res = await request(app.getHttpServer())
        .put(`/api/super-admin/credit-packages/${createdPackageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Smoke CRUD Pack Updated',
          pricePerHour: 40,
          totalPrice: 400,
        })
        .expect(200);

      expect(res.body.data.name).toBe('Smoke CRUD Pack Updated');
      expect(Number(res.body.data.pricePerHour)).toBe(40);
      expect(Number(res.body.data.totalPrice)).toBe(400);
    });

    it('deletes a credit package', async () => {
      if (!adminToken || !createdPackageId) return;
      await request(app.getHttpServer())
        .delete(`/api/super-admin/credit-packages/${createdPackageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/super-admin/credit-packages/${createdPackageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
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
