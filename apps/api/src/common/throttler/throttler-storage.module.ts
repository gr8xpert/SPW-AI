import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  RedisThrottlerStorage,
  REDIS_THROTTLER_CLIENT,
  createRedisThrottlerClient,
} from './redis-throttler.storage';

// Global so ThrottlerModule.forRootAsync can inject RedisThrottlerStorage
// from its own DI container without a custom imports array.
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_THROTTLER_CLIENT,
      useFactory: createRedisThrottlerClient,
      inject: [ConfigService],
    },
    RedisThrottlerStorage,
  ],
  exports: [RedisThrottlerStorage, REDIS_THROTTLER_CLIENT],
})
export class ThrottlerStorageModule {}
