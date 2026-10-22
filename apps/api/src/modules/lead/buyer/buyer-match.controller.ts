import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon } from '../../../common/decorators';
import { BuyerService } from './buyer.service';
import { BuyerMatchService } from './buyer-match.service';
import { BuyerSuggestionService } from './buyer-suggestion.service';
import { BuyerSendService } from './buyer-send.service';
import { viewerOf } from './buyer.controller';
import {
  AddSuggestionsDto,
  MatchQueryDto,
  ReverseSendDto,
  SendPropertiesDto,
  SuggestionEventDto,
  SuggestionsPdfDto,
  UpdateSuggestionDto,
  WishlistDto,
} from './dto/buyer-match.dto';
import { BuyerTrackingService } from './tracking/buyer-tracking.service';
import { BuyerChangeLogService } from './buyer-change-log.service';
import { BuyerNearMissService } from './buyer-near-miss.service';
import { BuyerReverseService } from './buyer-reverse.service';

// Wishlist, Matched and Suggested tabs, and sending. Registered before
// BuyerController so buyers/suggestions/:sid isn't taken for buyers/:id.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerMatchController {
  constructor(
    private readonly buyers: BuyerService,
    private readonly matchService: BuyerMatchService,
    private readonly suggestions: BuyerSuggestionService,
    private readonly sender: BuyerSendService,
    private readonly tracking: BuyerTrackingService,
    private readonly changeLog: BuyerChangeLogService,
    private readonly nearMiss: BuyerNearMissService,
    private readonly reverse: BuyerReverseService,
  ) {}

  // Reverse match: the buyers whose wishlist this property meets.
  @Get('reverse/:propertyId')
  reverseList(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('propertyId', ParseIntPipe) propertyId: number) {
    return this.reverse.forProperty(tenantId, viewerOf(user), propertyId);
  }

  @Post('reverse/:propertyId/send')
  @HttpCode(HttpStatus.OK)
  reverseSend(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() dto: ReverseSendDto,
  ) {
    return this.reverse.sendToAll(tenantId, viewerOf(user), propertyId, dto.leadIds);
  }

  @Get(':id/near-misses')
  async nearMisses(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: MatchQueryDto,
  ) {
    const lead = await this.buyers.get(tenantId, viewerOf(user), id);
    const suggestedIds = await this.suggestions.suggestedIds(tenantId, lead.id);
    const hidden = await this.suggestions.hiddenIds(tenantId, lead.id);
    return this.nearMiss.nearMisses(tenantId, lead.wishlist, { page: q.page, limit: q.limit, suggestedIds, hidden, showAll: !!q.all, rules: lead.noteRules });
  }

  // The change log (History tab), newest first; includes merged records.
  @Get(':id/changes')
  async changes(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
  ) {
    const lead = await this.buyers.get(tenantId, viewerOf(user), id);
    const p = Math.max(1, Math.min(1000, Number(page) || 1));
    return this.changeLog.list(tenantId, [lead.id, ...lead.mergedIds], p);
  }

  // The full timeline of one suggested property.
  @Get('suggestions/:sid/timeline')
  async timeline(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('sid', ParseIntPipe) sid: number) {
    const row = await this.tracking.suggestion(tenantId, sid);
    await this.buyers.get(tenantId, viewerOf(user), row.leadId); // 404 when not visible
    return this.tracking.timeline(tenantId, row.leadId, row.propertyId);
  }

  // The agent marks a step (viewing, offer, liked, rejected, cleared).
  @Post('suggestions/:sid/events')
  @HttpCode(HttpStatus.OK)
  async suggestionEvent(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('sid', ParseIntPipe) sid: number,
    @Body() dto: SuggestionEventDto,
  ) {
    const viewer = viewerOf(user);
    const row = await this.tracking.suggestion(tenantId, sid);
    await this.buyers.get(tenantId, viewer, row.leadId);
    await this.tracking.record({
      tenantId, leadId: row.leadId, propertyIds: [row.propertyId], event: dto.event, source: 'agent', userId: viewer.id, note: dto.note,
    });
    const items = await this.suggestions.list(tenantId, viewer, row.leadId);
    return items.find((i) => i.id === row.id);
  }

  @Put('suggestions/:sid')
  updateSuggestion(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('sid', ParseIntPipe) sid: number,
    @Body() dto: UpdateSuggestionDto,
  ) {
    return this.suggestions.update(tenantId, viewerOf(user), sid, dto);
  }

  @Delete('suggestions/:sid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSuggestion(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('sid', ParseIntPipe) sid: number) {
    await this.suggestions.remove(tenantId, viewerOf(user), sid);
  }

  @Put(':id/wishlist')
  setWishlist(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WishlistDto,
  ) {
    return this.buyers.setWishlist(tenantId, viewerOf(user), id, dto);
  }

  @Get(':id/matches')
  async matches(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: MatchQueryDto,
  ) {
    const lead = await this.buyers.get(tenantId, viewerOf(user), id);
    const suggestedIds = await this.suggestions.suggestedIds(tenantId, lead.id);
    const hidden = await this.suggestions.hiddenIds(tenantId, lead.id);
    return this.matchService.match(tenantId, lead.wishlist, { page: q.page, limit: q.limit, suggestedIds, hidden, showAll: !!q.all, rules: lead.noteRules });
  }

  @Get(':id/suggestions.pdf')
  async suggestionsPdf(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: SuggestionsPdfDto,
    @Res() res: Response,
  ): Promise<void> {
    const ids = q.ids ? q.ids.split(',').map(Number) : undefined;
    const { pdf, filename } = await this.sender.pdf(tenantId, viewerOf(user), id, q.lang, ids);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }

  @Get(':id/suggestions')
  listSuggestions(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.suggestions.list(tenantId, viewerOf(user), id);
  }

  @Post(':id/suggestions')
  addSuggestions(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddSuggestionsDto,
  ) {
    return this.suggestions.add(tenantId, viewerOf(user), id, dto);
  }

  @Post(':id/send/preview')
  @HttpCode(HttpStatus.OK)
  previewSend(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendPropertiesDto,
  ) {
    return this.sender.preview(tenantId, viewerOf(user), id, dto);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendPropertiesDto,
  ) {
    return this.sender.send(tenantId, viewerOf(user), id, dto);
  }
}
