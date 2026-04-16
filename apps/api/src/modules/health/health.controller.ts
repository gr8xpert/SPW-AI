import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../../common/decorators';

type CheckStatus = 'ok' | 'down';

interface HealthCheck {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: CheckStatus;
  uptimeSec: number;
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
  };
}

@Public()
@Controller('api/health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    // Reuse an existing queue connection to verify Redis without opening a new one.
    // The queue name doesn't matter for a ping; any registered queue works.
    @InjectQueue('health-probe') private readonly healthQueue: Queue,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const overall: CheckStatus =
      database.status === 'ok' && redis.status === 'ok' ? 'ok' : 'down';

    return {
      status: overall,
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version || '2.0.0',
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error).message };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const client = await this.healthQueue.client;
      await client.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: (err as Error).message };
    }
  }
}
