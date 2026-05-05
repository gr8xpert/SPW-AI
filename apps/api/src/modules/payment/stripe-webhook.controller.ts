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
import { StripeWebhookService } from './stripe-webhook.service';

@Controller('api/webhooks/stripe')
@Public()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly service: StripeWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: Request,
    @Headers('stripe-signature') signatureHeader?: string,
  ) {
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
