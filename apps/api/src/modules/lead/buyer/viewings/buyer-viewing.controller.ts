import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload } from '@spm/shared';
import { User, VIEWING_STATUSES, type ViewingStatus } from '../../../../database/entities';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon, Roles } from '../../../../common/decorators';
import { viewerOf } from '../buyer.controller';
import { seesAllBuyers } from '../buyer-access';
import { BuyerViewingService } from './buyer-viewing.service';
import { BuyerViewingMailService } from './buyer-viewing-mail.service';
import { BuyerHomeService } from '../digest/buyer-home.service';
import { BuyerDigestService } from '../digest/buyer-digest.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class TripDto {
  @Matches(DAY) startDate: string;
  @Matches(DAY) endDate: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Transform(trim) @IsString() @MaxLength(5000) notes?: string | null;
}

export class TripPatchDto {
  @IsOptional() @Matches(DAY) startDate?: string;
  @IsOptional() @Matches(DAY) endDate?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Transform(trim) @IsString() @MaxLength(5000) notes?: string | null;
}

export class ViewingDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() tripId?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() propertyId?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Transform(trim) @IsString() @MaxLength(255) title?: string | null;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(600) durationMin?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() agentId?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Transform(trim) @IsString() @MaxLength(500) meetingPoint?: string | null;
  @IsOptional() @IsIn(VIEWING_STATUSES) status?: ViewingStatus;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Transform(trim) @IsString() @MaxLength(5000) feedback?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) @Max(5) interest?: number | null;
}

export class CalendarQueryDto {
  @IsISO8601() from: string;
  @IsISO8601() to: string;
  @IsOptional() @Type(() => Number) @IsInt() agentId?: number;
}

export class LangQueryDto {
  @IsOptional() @Matches(/^[a-z]{2}$/) lang?: string;
}

export class DigestSwitchDto {
  @IsBoolean() on: boolean;
}

// Trips, viewings, My day and the agent's daily email. Registered before
// BuyerController so trips/…, viewings/…, home aren't taken for buyers/:id.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerViewingController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly viewings: BuyerViewingService,
    private readonly mail: BuyerViewingMailService,
    private readonly homeService: BuyerHomeService,
    private readonly digest: BuyerDigestService,
  ) {}

  // ── My day ──
  @Get('home')
  async home(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query('agentId') agentId?: string) {
    const viewer = viewerOf(user);
    let target = viewer.id;
    if (agentId && Number(agentId) !== viewer.id) {
      // Only managers look at another agent's day.
      if (!seesAllBuyers(viewer, false)) throw new ForbiddenException('Only managers can open another agent\'s day');
      const ok = await this.users.count({ where: { tenantId, id: Number(agentId), isActive: true } });
      if (!ok) throw new ForbiddenException('Unknown agent');
      target = Number(agentId);
    }
    return this.homeService.home(tenantId, target);
  }

  @Get('me/digest')
  async myDigest(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload) {
    const me = await this.users.findOne({ where: { tenantId, id: user.sub }, select: ['id', 'buyerDigest'] });
    return { on: me?.buyerDigest !== false };
  }

  @Put('me/digest')
  async setMyDigest(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Body() dto: DigestSwitchDto) {
    await this.users.update({ tenantId, id: user.sub }, { buyerDigest: dto.on });
    return { on: dto.on };
  }

  // The daily email now, for agents whose digest is due and not yet sent today.
  @Post('digest/run')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
  runDigest(@CurrentTenant() tenantId: number) {
    return this.digest.digestTenant(tenantId);
  }

  // ── Calendar ──
  @Get('viewings')
  calendar(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() q: CalendarQueryDto) {
    return this.viewings.calendar(tenantId, viewerOf(user), new Date(q.from), new Date(q.to), q.agentId);
  }

  // ── Trips ──
  @Put('trips/:tid')
  updateTrip(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('tid', ParseIntPipe) tid: number, @Body() dto: TripPatchDto) {
    return this.viewings.updateTrip(tenantId, viewerOf(user), tid, dto);
  }

  @Delete('trips/:tid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTrip(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('tid', ParseIntPipe) tid: number) {
    await this.viewings.deleteTrip(tenantId, viewerOf(user), tid);
  }

  @Get('trips/:tid/itinerary.pdf')
  async itinerary(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('tid', ParseIntPipe) tid: number,
    @Query() q: LangQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { pdf, filename } = await this.mail.itinerary(tenantId, viewerOf(user), tid, q.lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }

  @Post('trips/:tid/itinerary/send')
  @HttpCode(HttpStatus.OK)
  sendItinerary(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('tid', ParseIntPipe) tid: number, @Body() dto: LangQueryDto) {
    return this.mail.sendItinerary(tenantId, viewerOf(user), tid, dto.lang);
  }

  @Get(':id/trips')
  listTrips(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.viewings.listTrips(tenantId, viewerOf(user), id);
  }

  @Post(':id/trips')
  createTrip(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: TripDto) {
    return this.viewings.createTrip(tenantId, viewerOf(user), id, dto);
  }

  // ── Viewings ──
  @Put('viewings/:vid')
  updateViewing(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('vid', ParseIntPipe) vid: number, @Body() dto: ViewingDto) {
    return this.viewings.updateViewing(tenantId, viewerOf(user), vid, dto);
  }

  @Delete('viewings/:vid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteViewing(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('vid', ParseIntPipe) vid: number) {
    await this.viewings.deleteViewing(tenantId, viewerOf(user), vid);
  }

  @Post(':id/viewings')
  createViewing(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: ViewingDto) {
    return this.viewings.createViewing(tenantId, viewerOf(user), id, dto);
  }
}
