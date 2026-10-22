import { BadRequestException, Body, Controller, HttpCode, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { JwtPayload } from '@spm/shared';
import { CurrentTenant, CurrentUser, RequiresAddon } from '../../../../common/decorators';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../../common/guards';
import { BuyerImportService } from './buyer-import.service';
import type { ImportMapping } from './odoo-match';
import { viewerOf } from '../buyer.controller';

const MAX_FILE_MB = 10;

export class OdooApplyDto {
  // JSON: { [kind]: { [valueKey]: targetId | targetKey | "skip" } }, sent
  // as a multipart text field next to the file.
  @IsOptional() @IsString() @MaxLength(500_000)
  mapping?: string;
}

function xlsx(file: Express.Multer.File | undefined): Buffer {
  if (!file?.buffer?.length) throw new BadRequestException({ code: 'ODOO_NO_FILE', message: 'Attach the Odoo export (.xlsx)' });
  const name = (file.originalname || '').toLowerCase();
  // An .xlsx is a zip: it starts with "PK".
  if (!name.endsWith('.xlsx') || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
    throw new BadRequestException({ code: 'ODOO_BAD_FILE', message: 'Export the buyers from Odoo as XLSX' });
  }
  return file.buffer;
}

function parseMapping(raw: string | undefined): ImportMapping {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException({ code: 'BAD_MAPPING', message: 'mapping must be JSON' });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException({ code: 'BAD_MAPPING', message: 'mapping must be an object' });
  const out: ImportMapping = {};
  for (const [kind, values] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^(agent|town|type|feature|stage|role|listingType|option:[a-z0-9_]{1,64})$/.test(kind)) continue;
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      if (k.length <= 200 && (typeof v === 'number' || (typeof v === 'string' && v.length <= 100))) clean[k] = v;
    }
    out[kind] = clean;
  }
  return out;
}

// Odoo Buyers import (admins). Registered before BuyerController so
// "import" never reaches /:id.
@Controller('api/dashboard/buyers/import/odoo')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerImportController {
  constructor(private readonly service: BuyerImportService) {}

  @Post('preview')
  @HttpCode(200)
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 } }))
  preview(@CurrentTenant() tenantId: number, @UploadedFile() file?: Express.Multer.File) {
    return this.service.preview(tenantId, xlsx(file));
  }

  @Post('apply')
  @HttpCode(200)
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 } }))
  apply(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Body() dto: OdooApplyDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.apply(tenantId, xlsx(file), parseMapping(dto.mapping), viewerOf(user).id);
  }
}
