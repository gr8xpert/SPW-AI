import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';

@Module({
  // registerQueue makes the 'health-probe' queue provider visible inside this module,
  // so HealthController can @InjectQueue it. The queue itself is configured globally
  // via BullModule.forRootAsync in AppModule.
  imports: [BullModule.registerQueue({ name: 'health-probe' })],
  controllers: [HealthController],
})
export class HealthModule {}
