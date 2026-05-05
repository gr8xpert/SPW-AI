import { registerAs } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env for standalone CLI invocations (typeorm migration:run, seed scripts).
// Nest's ConfigModule handles this at runtime, but the TypeORM CLI bypasses it.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// `synchronize: true` auto-alters the schema at boot and can destroy production data.
// Allow it only outside of production; hard-refuse in production regardless of env flag.
function isSynchronizeEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.DATABASE_SYNCHRONIZE === 'true';
}

export const databaseConfig = registerAs('database', () => ({
  type: 'mysql' as const,
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '3306', 10),
  username: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'spm_v2_dev',
  entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: isSynchronizeEnabled(),
  logging: process.env.DATABASE_LOGGING === 'true',
  charset: 'utf8mb4',
  timezone: 'Z',
  extra: {
    connectionLimit: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10),
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
  },
}));

// DataSource for TypeORM CLI
const options: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '3306', 10),
  username: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'spm_v2_dev',
  entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
  charset: 'utf8mb4',
  timezone: 'Z',
};

export default new DataSource(options);
