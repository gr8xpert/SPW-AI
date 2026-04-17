import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  createRedisLockClient,
  REDIS_LOCK_CLIENT,
  RedisLockService,
} from './redis-lock.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_LOCK_CLIENT,
      useFactory: (configService: ConfigService) =>
        createRedisLockClient(configService),
      inject: [ConfigService],
    },
    RedisLockService,
  ],
  exports: [RedisLockService],
})
export class RedisLockModule {}
