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
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';

const uniqueSlug = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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
      tokenA = res.body.data.accessToken;
    });

    it('POST /api/auth/register rejects weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...adminA, email: `weak-${Date.now()}@smoke.test`, password: 'short' })
        .expect(400);
    });

    it('POST /api/auth/login returns token for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminA.email, password: adminA.password })
        .expect(200);

      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
    });

    it('POST /api/auth/login rejects wrong password (401)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminA.email, password: 'wrong-password-xxx' })
        .expect(401);
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
