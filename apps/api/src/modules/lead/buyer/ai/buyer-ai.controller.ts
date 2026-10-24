import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon } from '../../../../common/decorators';
import { viewerOf } from '../buyer.controller';
import { AiDismissDto, AiEmailIntroDto, AiPasteDto, AiSummaryDto, SaveRulesDto } from '../dto/buyer-ai.dto';
import { BuyerAiInsightService } from './buyer-ai-insight.service';
import { BuyerAiService, MAX_NOTE_BYTES } from './buyer-ai.service';

// Buyer Match Phase 3 (AI). Registered before BuyerController so
// buyers/ai/status isn't taken for buyers/:id. Each call costs the agency
// credit, hence the per-user limit.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class BuyerAiController {
  constructor(
    private readonly buyerAi: BuyerAiService,
    private readonly insight: BuyerAiInsightService,
  ) {}

  // Whether the agency has an OpenRouter key: the dashboard explains and
  // links to Settings → AI when not.
  @Get('ai/status')
  status(@CurrentTenant() tenantId: number) {
    return this.buyerAi.status(tenantId);
  }

  @Post(':id/ai/paste')
  @HttpCode(HttpStatus.OK)
  paste(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: AiPasteDto) {
    return this.buyerAi.paste(tenantId, viewerOf(user), id, dto.text);
  }

  @Post(':id/ai/rules')
  @HttpCode(HttpStatus.OK)
  readRules(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.buyerAi.readRules(tenantId, viewerOf(user), id);
  }

  @Put(':id/rules')
  saveRules(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: SaveRulesDto) {
    return this.buyerAi.saveRules(tenantId, viewerOf(user), id, dto.rules as unknown[], dto.notesHash);
  }

  @Post(':id/ai/voice')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_NOTE_BYTES, files: 1 } }))
  voice(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() audio: Express.Multer.File | undefined,
  ) {
    return this.buyerAi.voice(tenantId, viewerOf(user), id, audio?.buffer);
  }

  // Milestone M: personal email text.
  @Post(':id/ai/email-intro')
  @HttpCode(HttpStatus.OK)
  emailIntro(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: AiEmailIntroDto) {
    return this.buyerAi.emailIntro(tenantId, viewerOf(user), id, dto.propertyIds, dto.lang, dto.channel);
  }

  // The record's summary: cached until the buyer changes.
  @Post(':id/ai/summary')
  @HttpCode(HttpStatus.OK)
  summary(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: AiSummaryDto) {
    return this.insight.summary(tenantId, viewerOf(user), id, !!dto.force);
  }

  // Learns from feedback: counted patterns (no AI, no key needed).
  @Get(':id/ai/feedback')
  feedback(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.insight.feedback(tenantId, viewerOf(user), id);
  }

  // … and the buyer's comments read by AI.
  @Post(':id/ai/feedback')
  @HttpCode(HttpStatus.OK)
  readComments(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.insight.readComments(tenantId, viewerOf(user), id);
  }

  @Post(':id/ai/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: AiDismissDto) {
    return this.insight.dismiss(tenantId, viewerOf(user), id, dto.key);
  }
}
