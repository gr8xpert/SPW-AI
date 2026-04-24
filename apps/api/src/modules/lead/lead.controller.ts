import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { LeadService } from './lead.service';
import { CreateLeadDto, UpdateLeadDto, CreateActivityDto } from './dto';
import { CurrentTenant, CurrentUser, Public } from '../../common/decorators';
import { LeadStatus } from '../../database/entities';

@Controller('api/dashboard/leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Post()
  create(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadService.create(tenantId, userId, dto);
  }

  @Get()
  findAll(
    @CurrentTenant() tenantId: number,
    @Query('status') status?: LeadStatus,
    @Query('assignedTo') assignedTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.leadService.findAll(tenantId, {
      status,
      assignedTo: assignedTo ? parseInt(assignedTo) : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('pipeline')
  getPipeline(@CurrentTenant() tenantId: number) {
    return this.leadService.findByPipeline(tenantId);
  }

  @Get('stats')
  getStats(@CurrentTenant() tenantId: number) {
    return this.leadService.getStats(tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leadService.findOne(tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadService.update(tenantId, id, userId, dto);
  }

  @Post(':id/activities')
  addActivity(
    @CurrentTenant() tenantId: number,
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateActivityDto,
  ) {
    return this.leadService.addActivity(tenantId, id, userId, dto);
  }

  @Get(':id/activities')
  getActivities(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leadService.getActivities(tenantId, id);
  }
}

// Public inquiry endpoint for widget
@Controller('api/v1/inquiry')
export class InquiryController {
  constructor(private readonly leadService: LeadService) {}

  @Public()
  @Post()
  createInquiry(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadService.create(tenantId, 0, {
      ...dto,
      source: 'widget_inquiry',
    });
  }
}

// Public share-favorites endpoint for widget wishlist
@Controller('api/v1/share-favorites')
export class ShareFavoritesController {
  constructor(private readonly leadService: LeadService) {}

  @Public()
  @Post()
  async shareFavorites(
    @CurrentTenant() tenantId: number,
    @Body() body: { name: string; email: string; friendEmail?: string; message?: string; propertyIds: number[] },
  ) {
    await this.leadService.create(tenantId, 0, {
      name: body.name,
      email: body.email,
      message: body.message || `Shared ${body.propertyIds.length} wishlist properties`,
      source: 'website',
    });

    if (body.friendEmail && body.friendEmail !== body.email) {
      await this.leadService.create(tenantId, 0, {
        name: body.name,
        email: body.friendEmail,
        message: `Wishlist shared by ${body.name} (${body.email}): ${body.propertyIds.length} properties`,
        source: 'referral',
      });
    }

    return { success: true, message: 'Wishlist shared successfully' };
  }
}
