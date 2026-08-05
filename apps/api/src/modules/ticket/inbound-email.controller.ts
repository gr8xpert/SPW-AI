import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { InboundAuthGuard } from './inbound-auth.guard';
import { InboundEmailService, InboundResult } from './inbound-email.service';
import { InboundEmailDto } from './dto/inbound-email.dto';

// Webhook target for n8n / Postmark / Mailgun inbound email parsing. The
// upstream service turns a raw email into a JSON payload and POSTs it here.
// See docs/tickets-email-ingestion.md for the n8n flow.
@Controller('api/internal/tickets')
export class InboundEmailController {
  constructor(private readonly inbound: InboundEmailService) {}

  @Post('inbound')
  @Public()
  @UseGuards(InboundAuthGuard)
  @HttpCode(HttpStatus.OK)
  async handleInbound(@Body() dto: InboundEmailDto): Promise<InboundResult> {
    return this.inbound.ingest(dto);
  }
}
