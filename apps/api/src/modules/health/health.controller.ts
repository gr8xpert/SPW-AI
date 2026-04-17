import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../../common/decorators';

// Two shapes of health endpoint, matching the Kubernetes convention:
//
//   /api/health/live  — "is this process alive?". Never touches deps.
//                       Docker / k8s use this to decide: should I kill +
//                       restart the container? A DB outage should NOT cause
//                       a restart loop, so /live ignores DB/Redis state.
//
//   /api/health/ready — "is this instance ready to serve traffic?". Probes
//                       DB + Redis + BullMQ. Orchestrator removes a failing
//                       replica from the LB pool without killing it, so a
//                       transient DB blip just takes that replica out of
//                       rotation for a moment.
//
//   /api/health       — alias for /ready; preserved because the pre-5L
//                       dashboard + monitoring scripts call it directly.

type CheckStatus = 'ok' | 'down';

interface HealthCheck {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

interface LivenessResponse {
  status: 'ok';
  uptimeSec: number;
  version: string;
}

interface ReadinessResponse {
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

  // Liveness: process is up, event loop responsive. Zero external I/O so
  // this endpoint stays cheap even under Redis/DB outage. If the orchestrator
  // can't get a 200 here, the process is truly wedged and restart is correct.
  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): LivenessResponse {
    return {
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version || '2.0.0',
    };
  }

  // Readiness: DB + Redis both reachable. A 'down' result here should pull
  // this replica from the load balancer pool, but NOT kill the process —
  // the dep is the problem, not the code.
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<ReadinessResponse> {
    return this.runReadinessChecks();
  }

  // Kept as an alias of /ready for backwards compat — smoke tests, old
  // monitoring configs, and the existing Dockerfile HEALTHCHECK all point
  // here. New callers should prefer the explicit /live or /ready routes.
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<ReadinessResponse> {
    return this.runReadinessChecks();
  }

  private async runReadinessChecks(): Promise<ReadinessResponse> {
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
