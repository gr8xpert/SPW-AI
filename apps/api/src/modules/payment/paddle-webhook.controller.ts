import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { PaddleWebhookService } from './paddle-webhook.service';

// 6A — Paddle inbound webhook. Mounted at /api/webhooks/paddle and marked
// @Public so the global JWT guard lets it through; authentication is the
// HMAC signature, not a JWT. Request body is read via req.rawBody (enabled
// globally via NestFactory({ rawBody: true })) — mutating the bytes would
// break signature verification.
@Controller('api/webhooks/paddle')
@Public()
export class PaddleWebhookController {
  private readonly logger = new Logger(PaddleWebhookController.name);

  constructor(private readonly service: PaddleWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: Request,
    @Headers('paddle-signature') signatureHeader?: string,
  ) {
    // `req.rawBody` is a Buffer populated when NestFactory is created with
    // { rawBody: true }. If it's absent we can't verify the signature, so
    // we refuse loudly — better than silently accepting unauthenticated
    // events.
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      this.logger.error(
        'req.rawBody missing — NestFactory rawBody not enabled?',
      );
      return { received: false, reason: 'raw-body-unavailable' };
    }

    const result = await this.service.process({
      rawBody: raw.toString('utf8'),
      signatureHeader,
    });
    return { received: true, ...result };
  }
}
