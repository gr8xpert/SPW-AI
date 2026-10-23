import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Res,
  UnauthorizedException,
  UseGuards,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { TenantService } from '../tenant/tenant.service';
import { AiChatService } from './ai-chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { IsEmail } from 'class-validator';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

class EmailTranscriptDto {
  @IsEmail()
  email: string;
}

@Controller('api/v1/chat')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name);

  constructor(
    private readonly chatService: AiChatService,
    private readonly tenantService: TenantService,
  ) {}

  private async getTenantId(apiKey: string): Promise<number> {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findByApiKey(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant.id;
  }

  // Besides the site's API-key budget, each visitor (IP) gets its own cap:
  // every message costs the agency an AI call.
  @Public()
  @Post()
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async chat(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: CreateChatMessageDto,
    @Res() res: Response,
  ) {
    const tenantId = await this.getTenantId(apiKey);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of this.chatService.processMessage(tenantId, dto)) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (err) {
      this.logger.error(`Chat failed (tenant=${tenantId}): ${(err as Error).message}`);
      res.write(`event: error\ndata: ${JSON.stringify({ code: 'FAILED', message: 'Sorry, something went wrong. Please try again.' })}\n\n`);
    }

    res.end();
  }

  // The visitor's own chat, for restoring it after a page change. The
  // X-Chat-Token header is the token of the 'conversation' event.
  @Public()
  @Get(':id')
  async getConversation(
    @Headers('x-api-key') apiKey: string,
    @Headers('x-chat-token') token: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const tenantId = await this.getTenantId(apiKey);
    return this.chatService.getVisitorConversation(tenantId, id, token);
  }

  @Public()
  @Post(':id/email')
  @SkipThrottle({ default: false })
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  async emailTranscript(
    @Headers('x-api-key') apiKey: string,
    @Headers('x-chat-token') token: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmailTranscriptDto,
  ) {
    const tenantId = await this.getTenantId(apiKey);
    await this.chatService.emailVisitorTranscript(tenantId, id, token, dto.email);
    return { sent: true };
  }
}
