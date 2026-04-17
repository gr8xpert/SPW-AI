import { LoggerService, LogLevel } from '@nestjs/common';

// Production-mode logger that emits one JSON object per line to stdout —
// the shape log aggregators (Loki/Datadog/CloudWatch) index natively.
// In dev we leave Nest's colorful ConsoleLogger alone (see main.ts).
//
// Fields — kept short so log line sizes stay bounded:
//   time     ISO 8601 UTC timestamp
//   level    'error' | 'warn' | 'info' | 'debug' | 'trace'
//   context  the string passed to `new Logger(context)` or Nest internals
//   msg      human-readable message (if message is a string)
//   data     the message payload (if message is an object)
//   stack    stack trace on errors
//   host     container hostname, useful when replicas interleave logs
//
// Why not pino? Zero new deps to audit, and we never cross the
// hundreds-of-thousands-of-log-lines-per-second threshold where pino's
// worker-thread transport matters. Swap to pino when ALS context or
// per-request log-level overrides are actually needed.

const LEVEL_MAP: Record<LogLevel, string> = {
  error: 'error',
  warn: 'warn',
  log: 'info',
  debug: 'debug',
  verbose: 'trace',
  fatal: 'fatal',
};

export class JsonLogger implements LoggerService {
  private readonly host = process.env.HOSTNAME || undefined;

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    const isString = typeof message === 'string';
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level: LEVEL_MAP[level] || level,
      ...(context ? { context } : {}),
      ...(isString ? { msg: message as string } : { data: message }),
      ...(stack ? { stack } : {}),
      ...(this.host ? { host: this.host } : {}),
    };
    // JSON.stringify replaces newlines inside strings with \n, so one log
    // line == one JSON object. Log collectors rely on that invariant.
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
