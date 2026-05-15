/**
 * Jest globalSetup for API e2e suites. Verifies MySQL + Redis are reachable
 * BEFORE any test file (and therefore AppModule's TypeORM/BullMQ wiring) tries
 * to connect. Without this, a missing dependency turned into a 3-minute hang
 * (the symptom this fixes — see review P1-03).
 *
 * On failure, prints an actionable hint about `pnpm docker:up` and exits the
 * process with a non-zero code so CI can distinguish "deps missing" from
 * "test assertions failed".
 */
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import * as mysql from 'mysql2/promise';
import Redis from 'ioredis';

const HINT = `\n  → MySQL or Redis is not reachable.\n` +
  `  Start the dev dependencies and re-run:\n` +
  `      pnpm docker:up\n` +
  `  Or set DB_* / REDIS_* env vars to point at a reachable instance.\n`;

const CONNECT_TIMEOUT_MS = 5_000;

export default async function globalSetup(): Promise<void> {
  // Load .env (and .env.test if present) so DB_HOST etc are populated when
  // the dev runs e2e without exporting them in the shell first.
  loadDotenv({ path: resolve(__dirname, '../.env.test') });
  loadDotenv({ path: resolve(__dirname, '../.env') });

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
  const dbUser = process.env.DB_USERNAME || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_DATABASE || 'spw';

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPass = process.env.REDIS_PASSWORD || undefined;

  // MySQL: open + close a single connection with a tight timeout. Anything
  // longer than 5s on localhost means the server isn't there.
  try {
    const conn = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPass,
      database: dbName,
      connectTimeout: CONNECT_TIMEOUT_MS,
    });
    await conn.ping();
    await conn.end();
  } catch (err) {
    process.stderr.write(
      `\n[e2e setup] MySQL not reachable at ${dbHost}:${dbPort}/${dbName}: ${(err as Error).message}\n${HINT}\n`,
    );
    process.exit(1);
  }

  // Redis: same shape. ioredis defaults to retrying forever, so we set
  // maxRetriesPerRequest + lazyConnect off and call .ping() once.
  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPass,
    maxRetriesPerRequest: 1,
    connectTimeout: CONNECT_TIMEOUT_MS,
    lazyConnect: false,
  });
  try {
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('ping timeout')), CONNECT_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    process.stderr.write(
      `\n[e2e setup] Redis not reachable at ${redisHost}:${redisPort}: ${(err as Error).message}\n${HINT}\n`,
    );
    await redis.quit().catch(() => {});
    process.exit(1);
  } finally {
    await redis.quit().catch(() => {});
  }
}
