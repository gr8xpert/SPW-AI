import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { runBootSecurityAudit } from './common/security/boot-audit';
import { parseTrustProxy } from './common/security/trust-proxy';
import { JsonLogger } from './common/logging/json-logger';

async function bootstrap() {
  // Switch to JSON-lines logging in production so log aggregators can index
  // structured fields. Dev keeps Nest's ConsoleLogger (colors, easier read).
  // Done via Logger.overrideLogger so the boot audit below, which runs
  // before NestFactory.create(), also emits JSON in prod.
  if (process.env.NODE_ENV === 'production') {
    Logger.overrideLogger(new JsonLogger());
  }
  const logger = new Logger('Bootstrap');

  // Fail fast on obviously-broken production configs (placeholder secrets,
  // dangerous dev flags left on, etc.) before we even instantiate Nest.
  // Throwing here crashes the process with a clear banner — better than
  // silently running with a development-grade secret.
  runBootSecurityAudit();

  // rawBody: true makes req.rawBody available on incoming requests. The
  // Stripe webhook controller needs the unmodified bytes to recompute
  // the HMAC signature — any re-serialization through the JSON parser
  // would change whitespace/escaping and invalidate the signature.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;
  const isProduction = process.env.NODE_ENV === 'production';

  // Configure trust-proxy so `req.ip` reflects the real client IP behind
  // a reverse proxy (nginx, Cloudflare, ELB, etc). The
  // ApiKeyThrottlerGuard's per-IP unknown-key probe budget relies on this.
  // Default in production is 'loopback' — the typical nginx-on-same-host
  // setup. Operators behind a different topology set TRUST_PROXY explicitly.
  // Outside production we leave it disabled by default; tests stub req.ip
  // directly and we don't want to silently change behaviour during dev.
  const trustProxyRaw = process.env.TRUST_PROXY ?? (isProduction ? 'loopback' : undefined);
  const trustProxy = parseTrustProxy(trustProxyRaw, isProduction);
  if (trustProxy.value !== false) {
    app.set('trust proxy', trustProxy.value);
    logger.log(
      `trust proxy: ${JSON.stringify(trustProxy.value)} (source: ${trustProxy.source})`,
    );
  } else {
    logger.log(`trust proxy: disabled (req.ip = raw socket peer)`);
  }
  const dashboardUrl =
    configService.get<string>('DASHBOARD_URL') ||
    (isProduction ? null : 'http://localhost:3000');

  if (isProduction && !dashboardUrl) {
    throw new Error('DASHBOARD_URL must be set in production');
  }

  app.use(
    helmet({
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
      contentSecurityPolicy: false,
    }),
  );
  app.use(compression());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS policy — two distinct tiers:
  //
  //  /api/dashboard/*  →  only the configured dashboard origin (+ both
  //                       loopback aliases in dev). Cookies/credentials
  //                       allowed because the dashboard uses NextAuth.
  //
  //  /api/v1/*         →  any origin. The widget is embedded on arbitrary
  //                       tenant sites — restricting origin here would
  //                       force every customer to register their domain
  //                       upfront. Auth is enforced by `x-api-key` +
  //                       `ApiKeyThrottlerGuard` + `findActiveWidgetTenantByApiKey`,
  //                       so a leaked CORS allow doesn't grant any new
  //                       privilege. Credentials are NOT enabled on this
  //                       tier because the widget never sends cookies.
  const dashboardOrigins: string[] = isProduction
    ? [dashboardUrl!]
    : [dashboardUrl!, 'http://localhost:3000', 'http://127.0.0.1:3000'];

  // When DASHBOARD_URL is a loopback address, also allow the other loopback
  // form so local Docker testing works regardless of whether the browser
  // navigates to localhost or 127.0.0.1.
  if (dashboardUrl?.includes('://127.0.0.1')) {
    const alt = dashboardUrl.replace('://127.0.0.1', '://localhost');
    if (!dashboardOrigins.includes(alt)) dashboardOrigins.push(alt);
  } else if (dashboardUrl?.includes('://localhost')) {
    const alt = dashboardUrl.replace('://localhost', '://127.0.0.1');
    if (!dashboardOrigins.includes(alt)) dashboardOrigins.push(alt);
  }

  // Per-request CORS options. `cors` accepts a function `(req, cb)` so we
  // can vary the policy by URL path:
  //
  //   /api/v1/*   → reflect any origin, NO credentials. The widget runs on
  //                 tenant sites we don't pre-register; auth is the API key
  //                 (header) + throttler + entitlement check, so allowing
  //                 the origin doesn't grant new privilege. credentials:false
  //                 is critical — without it, a hostile site could ride a
  //                 logged-in dashboard cookie.
  //   everything  → only the dashboard origins, WITH credentials, so
  //   else         NextAuth session cookies survive.
  app.enableCors((req, cb) => {
    const url = req.url || '';
    const isPublicWidget = url.startsWith('/api/v1/') || url.startsWith('/api/license/');
    const base = {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'x-api-key', 'X-Request-Id'],
    };
    if (isPublicWidget) {
      cb(null, {
        ...base,
        origin: true, // reflect Origin header
        credentials: false,
      });
      return;
    }
    cb(null, {
      ...base,
      origin: dashboardOrigins,
      credentials: true,
    });
  });

  // Bind to loopback in production so a bare-metal deploy only exposes the
  // API via the nginx reverse proxy. Docker/containerized deploys must set
  // API_BIND_HOST=0.0.0.0 so traffic on the container network can reach the
  // port — container isolation replaces the loopback-binding safeguard.
  // Outside production we always bind 0.0.0.0 to make local testing easier.
  const host = isProduction
    ? process.env.API_BIND_HOST || '127.0.0.1'
    : '0.0.0.0';
  await app.listen(port, host);
  logger.log(`API listening on http://${host}:${port} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
}

bootstrap();
