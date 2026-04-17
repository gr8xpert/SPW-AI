import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

// Standard header operators / proxies use. Case-insensitive per HTTP spec,
// so both "X-Request-Id" and "x-request-id" reach us as the same value via
// req.headers.
export const REQUEST_ID_HEADER = 'X-Request-Id';

// Augments express's Request type so TypeScript knows about req.requestId.
// Declared here (nearest the middleware that sets it) so the coupling is
// obvious when someone reads this file. Global-namespace augmentation is
// the canonical Express v4 pattern; @types/express re-exports Request from
// the global Express namespace.
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Bounds the incoming-id length so an upstream proxy can't feed us a
// megabyte-long header that ends up echoed in every log line.
const MAX_INCOMING_ID_LENGTH = 200;

// Accept incoming IDs but sanity-check the format: alphanumeric, dash,
// underscore only. Refusing weird characters stops an attacker from
// injecting log-formatting tokens (newlines, control chars) via this header.
const INCOMING_ID_SAFE = /^[A-Za-z0-9_-]{1,200}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const id =
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      candidate.length <= MAX_INCOMING_ID_LENGTH &&
      INCOMING_ID_SAFE.test(candidate)
        ? candidate
        : randomUUID();
    req.requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
