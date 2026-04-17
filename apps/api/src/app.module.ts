import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule as BullQueueModule } from '@nestjs/bullmq';
import { join } from 'path';

// Config
import { databaseConfig, redisConfig, jwtConfig } from './config';

// Common
import { HttpExceptionFilter } from './common/filters';
import { TransformInterceptor } from './common/interceptors';
import { JwtAuthGuard } from './common/guards';
import { ThrottlerStorageModule } from './common/throttler/throttler-storage.module';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { RedisLockModule } from './common/redis/redis-lock.module';

// Phase 1: Foundation Modules
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';

// Phase 2: Core Feature Modules
import { PropertyTypeModule } from './modules/property-type/property-type.module';
import { FeatureModule } from './modules/feature/feature.module';
import { LocationModule } from './modules/location/location.module';
import { LabelModule } from './modules/label/label.module';
import { PropertyModule } from './modules/property/property.module';

// Phase 3: Feed Import Module
import { FeedModule } from './modules/feed/feed.module';

// Phase 2 Extended: Support & CRM Modules
import { TicketModule } from './modules/ticket/ticket.module';
import { ContactModule } from './modules/contact/contact.module';
import { LeadModule } from './modules/lead/lead.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { EmailCampaignModule } from './modules/email-campaign/email-campaign.module';

// Phase 4: Additional Feature Modules
import { UploadModule } from './modules/upload/upload.module';
import { FeedExportModule } from './modules/feed-export/feed-export.module';
import { MigrationModule } from './modules/migration/migration.module';

// Phase 5: Role-Based Features
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { LicenseModule } from './modules/license/license.module';
import { CreditModule } from './modules/credit/credit.module';
import { WebmasterModule } from './modules/webmaster/webmaster.module';
import { ReorderModule } from './modules/reorder/reorder.module';
import { TeamModule } from './modules/team/team.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        entities: [__dirname + '/database/entities/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        synchronize: configService.get<boolean>('database.synchronize'),
        logging: configService.get<boolean>('database.logging'),
        charset: 'utf8mb4',
        timezone: 'Z',
      }),
      inject: [ConfigService],
    }),

    // Bull Queue (Redis)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),

    // Static file serving for uploads
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),

    // Global rate limiting. Individual controllers can tighten limits further with @Throttle().
    // The 'default' tracker is required because controllers use @Throttle({ default: { ... } })
    // to override per-endpoint. @nestjs/throttler v5+ treats tracker names literally — if
    // 'default' isn't registered, those overrides silently do nothing.
    //
    // Storage is Redis-backed (see RedisThrottlerStorage) so every API replica
    // reads and writes the same buckets — otherwise a 4-replica deploy would
    // give each client 4× the advertised limit.
    // Shared Redis-backed distributed lock (SET NX PX) for cross-replica
    // coordination — notably, preventing every api replica from firing the
    // nightly CleanupService cron simultaneously.
    RedisLockModule,

    ThrottlerStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 100 },
          { name: 'short', ttl: 1000, limit: 20 },
          { name: 'medium', ttl: 60_000, limit: 300 },
          { name: 'long', ttl: 3_600_000, limit: 5_000 },
        ],
      }),
    }),

    // ============ Phase 1: Foundation ============
    HealthModule,
    AuthModule,
    TenantModule,

    // ============ Phase 2: Core Features ============
    PropertyTypeModule,
    FeatureModule,
    LocationModule,
    LabelModule,
    PropertyModule,

    // ============ Phase 3: Feed Import ============
    FeedModule,

    // ============ Phase 2 Extended: Support & CRM ============
    TicketModule,
    ContactModule,
    LeadModule,
    AnalyticsModule,
    EmailCampaignModule,

    // ============ Phase 4: Additional Features ============
    UploadModule,
    FeedExportModule,
    MigrationModule,

    // ============ Phase 5: Role-Based Features ============
    SuperAdminModule,
    LicenseModule,
    CreditModule,
    WebmasterModule,
    ReorderModule,
    TeamModule,
    WebhookModule,
    MaintenanceModule,
    MailModule,
  ],
  providers: [
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global response transform
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global rate limiter. Runs before JwtAuthGuard so anonymous floods still get throttled.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT auth guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
