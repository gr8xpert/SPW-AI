import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { runBootSecurityAudit } from './common/security/boot-audit';
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
  // Paddle webhook controller (6A) needs the unmodified bytes to recompute
  // the HMAC signature — any re-serialization through the JSON parser would
  // change whitespace/escaping and invalidate the signature.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;
  const isProduction = process.env.NODE_ENV === 'production';
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

  // In production, only allow the configured dashboard origin.
  // In development, also allow localhost for convenience.
  const corsOrigins = isProduction
    ? [dashboardUrl!]
    : [dashboardUrl!, 'http://localhost:3000', 'http://127.0.0.1:3000'];

  // When DASHBOARD_URL is a loopback address, also allow the other loopback
  // form so local Docker testing works regardless of whether the browser
  // navigates to localhost or 127.0.0.1.
  if (dashboardUrl?.includes('://127.0.0.1')) {
    const alt = dashboardUrl.replace('://127.0.0.1', '://localhost');
    if (!corsOrigins.includes(alt)) corsOrigins.push(alt);
  } else if (dashboardUrl?.includes('://localhost')) {
    const alt = dashboardUrl.replace('://localhost', '://127.0.0.1');
    if (!corsOrigins.includes(alt)) corsOrigins.push(alt);
  }

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
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
