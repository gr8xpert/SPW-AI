import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  SetMetadata,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TenantService } from '../tenant/tenant.service';
import { AiSearchService, MAX_QUERY_LENGTH, MAX_VOICE_BYTES } from './ai-search.service';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export class AiSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_QUERY_LENGTH)
  query: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class VoiceSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

/**
 * "Describe your dream property" on a client's website.
 *
 * Each search spends the client's OWN OpenRouter credit, never the platform
 * key, so the limits here matter: a tight per-minute bucket (this is a person
 * typing a sentence, not a page loading) on top of the daily ceiling the
 * service enforces per client.
 */
@Controller('api/v1/ai-search')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 12, ttl: 60_000 } })
export class PublicAiSearchController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly aiSearch: AiSearchService,
  ) {}

  private async tenantFor(apiKey: string) {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findWidgetTenantForRead(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    return tenant;
  }

  /** Whether to show the AI button at all. Cheap: no model call. */
  @Public()
  @Get('status')
  async status(@Headers('x-api-key') apiKey: string) {
    const tenant = await this.tenantFor(apiKey);
    const state = await this.aiSearch.status(tenant);
    // The reason is for the dashboard and our own support, not the visitor.
    // `voice` decides whether the mic is shown; it is only ever true when AI
    // search itself is available.
    return { enabled: state.enabled, voice: state.enabled && this.aiSearch.voiceEnabled(tenant) };
  }

  @Public()
  @Post()
  async search(@Headers('x-api-key') apiKey: string, @Body() dto: AiSearchDto) {
    const tenant = await this.tenantFor(apiKey);
    return this.aiSearch.search(tenant, dto.query, dto.language || 'en');
  }

  /**
   * The same search, spoken. The recording (a short WAV the widget makes) is
   * held in memory only, never written to disk, and capped in size before
   * it is read, so an oversized upload is cut off at the door.
   */
  @Public()
  @Post('voice')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_VOICE_BYTES, files: 1 } }))
  async voice(
    @Headers('x-api-key') apiKey: string,
    @UploadedFile() audio: Express.Multer.File | undefined,
    @Body() dto: VoiceSearchDto,
  ) {
    const tenant = await this.tenantFor(apiKey);
    return this.aiSearch.voiceSearch(tenant, audio?.buffer, dto.language || 'en');
  }
}
