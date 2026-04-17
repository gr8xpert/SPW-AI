import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;
  const isProduction = process.env.NODE_ENV === 'production';
  const dashboardUrl =
    configService.get<string>('DASHBOARD_URL') ||
    (isProduction ? null : 'http://localhost:3000');

  if (isProduction && !dashboardUrl) {
    throw new Error('DASHBOARD_URL must be set in production');
  }

  app.use(helmet());

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
