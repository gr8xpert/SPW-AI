import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtPayload, UserRole } from '@spm/shared';
import { CurrentTenant, CurrentUser, RequiresAddon } from '../../../common/decorators';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../common/guards';
import { SetRightmoveTownDto, UpdateRightmoveSettingsDto, UpdateRightmoveTypesDto } from '../dto';
import { RightmoveFeedService } from './rightmove-feed.service';

// Dashboard: the client's Rightmove card on the Feed Export page.
@Controller('api/dashboard/feed-export/rightmove')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('feedExport')
export class RightmoveConfigController {
  constructor(private readonly service: RightmoveFeedService) {}

  @Get()
  overview(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload) {
    return this.service.getOverview(tenantId, isSuperAdmin(user));
  }

  @Put()
  updateSettings(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Body() dto: UpdateRightmoveSettingsDto) {
    return this.service.updateSettings(tenantId, dto, isSuperAdmin(user));
  }

  @Put('types')
  updateTypes(@CurrentTenant() tenantId: number, @Body() dto: UpdateRightmoveTypesDto) {
    return this.service.updateTypes(tenantId, dto);
  }

  @Get('check')
  check(@CurrentTenant() tenantId: number) {
    return this.service.check(tenantId);
  }

  @Get('towns')
  towns(@CurrentTenant() tenantId: number) {
    return this.service.towns(tenantId);
  }

  @Put('towns')
  setTown(@CurrentTenant() tenantId: number, @Body() dto: SetRightmoveTownDto) {
    return this.service.setTown(tenantId, dto);
  }

  @Get('places')
  places(@Query('search') search?: string) {
    return this.service.searchPlaces((search || '').slice(0, 100));
  }

  @Get('logs')
  logs(@CurrentTenant() tenantId: number) {
    return this.service.logs(tenantId);
  }

  @Post('push')
  @HttpCode(HttpStatus.OK)
  push(@CurrentTenant() tenantId: number) {
    return this.service.pushNow(tenantId);
  }

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  reconcile(@CurrentTenant() tenantId: number) {
    return this.service.reconcile(tenantId);
  }
}

// A Super Admin, directly or while impersonating a client.
function isSuperAdmin(user: JwtPayload): boolean {
  return user?.role === UserRole.SUPER_ADMIN || user?.originalRole === UserRole.SUPER_ADMIN;
}

// Super Admin: Rightmove's place list (gazetteer), shared by every client.
@Controller('api/super-admin/rightmove/places')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class RightmovePlacesAdminController {
  constructor(private readonly service: RightmoveFeedService) {}

  @Get()
  stats() {
    return this.service.placeStats();
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  import(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('Attach the Rightmove place list (CSV)');
    return this.service.importPlaces(file.buffer.toString('utf8'));
  }
}
