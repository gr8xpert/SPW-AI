import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentTenant, RequiresAddon } from '../../../common/decorators';
import { DashboardAddonGuard, JwtAuthGuard, TenantGuard } from '../../../common/guards';
import { TemplateVersionService } from './template-version.service';
import { EmailImageService, MAX_INPUT_BYTES } from './email-image.service';
import { EmailDesignerService } from './email-designer.service';
import { BrandMemoryService } from './brand-memory.service';
import { LAYOUTS } from './layouts';
import { BrandMemoryDto, DesignerMessageDto } from '../dto/designer.dto';

@Controller('api/dashboard/email-templates/:id')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
export class EmailTemplateDesignController {
  constructor(
    private readonly versions: TemplateVersionService,
    private readonly designer: EmailDesignerService,
  ) {}

  @Get('versions')
  listVersions(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.versions.list(tenantId, id);
  }

  @Get('versions/:vid')
  getVersion(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Param('vid', ParseIntPipe) vid: number) {
    return this.versions.get(tenantId, id, vid);
  }

  @Post('versions/:vid/restore')
  restore(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Param('vid', ParseIntPipe) vid: number) {
    return this.versions.restore(tenantId, id, vid);
  }

  @Get('ai-chat')
  chat(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.designer.history(tenantId, id);
  }

  @Post('ai-chat')
  send(@CurrentTenant() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: DesignerMessageDto) {
    return this.designer.send(tenantId, id, { message: dto.message, imageUrls: dto.imageUrls });
  }
}

@Controller('api/dashboard/email-designer')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
export class EmailDesignerController {
  constructor(
    private readonly designer: EmailDesignerService,
    private readonly memory: BrandMemoryService,
  ) {}

  @Get('status')
  status(@CurrentTenant() tenantId: number) {
    return this.designer.status(tenantId);
  }

  @Get('brand-memory')
  async getMemory(@CurrentTenant() tenantId: number) {
    return { notes: await this.memory.get(tenantId) };
  }

  @Put('brand-memory')
  async setMemory(@CurrentTenant() tenantId: number, @Body() dto: BrandMemoryDto) {
    return { notes: await this.memory.set(tenantId, dto.notes) };
  }

  @Get('layouts')
  layouts() {
    return LAYOUTS.map((l) => ({ name: l.name, subject: l.subject, html: l.html }));
  }
}

@Controller('api/dashboard/email-images')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)
@RequiresAddon('emailCampaign')
export class EmailImageController {
  constructor(private readonly images: EmailImageService) {}

  @Get()
  list(@CurrentTenant() tenantId: number) {
    return this.images.list(tenantId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_INPUT_BYTES } }))
  upload(@CurrentTenant() tenantId: number, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'IMAGE_MISSING', message: 'Choose an image.' });
    return this.images.upload(tenantId, { buffer: file.buffer, mimetype: file.mimetype });
  }

  @Delete(':imageId')
  remove(@CurrentTenant() tenantId: number, @Param('imageId', ParseIntPipe) imageId: number) {
    return this.images.remove(tenantId, imageId);
  }
}
