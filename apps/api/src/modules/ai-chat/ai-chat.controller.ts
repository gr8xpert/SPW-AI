import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Res,
  UnauthorizedException,
  BadRequestException,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { TenantService } from '../tenant/tenant.service';
import { AiChatService } from './ai-chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { IsEmail, IsString } from 'class-validator';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

class EmailTranscriptDto {
  @IsEmail()
  email: string;
}

@Controller('api/v1/chat')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class AiChatController {
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

  @Public()
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async chat(
    @Headers('x-api-key') apiKey: string,
    @Body() dto: CreateChatMessageDto,
    @Res() res: Response,
  ) {
    const tenantId = await this.getTenantId(apiKey);
    const sessionId = (apiKey || '').slice(-8) + '-' + Date.now().toString(36);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of this.chatService.processMessage(tenantId, sessionId, dto)) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
    }

    res.end();
  }

  @Public()
  @Get(':id')
  async getConversation(
    @Headers('x-api-key') apiKey: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const tenantId = await this.getTenantId(apiKey);
    return this.chatService.getConversation(tenantId, id);
  }

  @Public()
  @Post(':id/email')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  async emailTranscript(
    @Headers('x-api-key') apiKey: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmailTranscriptDto,
  ) {
    const tenantId = await this.getTenantId(apiKey);
    await this.chatService.emailTranscript(tenantId, id, dto.email);
    return { sent: true };
  }
}
