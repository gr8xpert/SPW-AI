import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ContactService } from './contact.service';
import { CreateContactDto, UpdateContactDto } from './dto';
import { CurrentTenant } from '../../common/decorators';

@Controller('api/dashboard/contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  create(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactService.create(tenantId, dto);
  }

  @Get()
  findAll(
    @CurrentTenant() tenantId: number,
    @Query('search') search?: string,
    @Query('subscribed') subscribed?: string,
    @Query('tags') tags?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contactService.findAll(tenantId, {
      search,
      subscribed: subscribed ? subscribed === 'true' : undefined,
      tags: tags ? tags.split(',') : undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('export')
  async exportCsv(
    @CurrentTenant() tenantId: number,
    @Res() res: Response,
  ) {
    const { data } = await this.contactService.findAll(tenantId, { limit: 10000 });
    const header = 'name,email,phone,source,tags,subscribed,createdAt';
    const rows = data.map((c) => {
      const tags = Array.isArray(c.tags) ? c.tags.join(';') : '';
      return [
        this.csvEscape(c.name || ''),
        this.csvEscape(c.email),
        this.csvEscape(c.phone || ''),
        c.source || '',
        this.csvEscape(tags),
        c.subscribed ? 'yes' : 'no',
        c.createdAt ? new Date(c.createdAt).toISOString() : '',
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contactService.findOne(tenantId, id);
  }

  @Put(':id')
  update(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactService.update(tenantId, id, dto);
  }

  @Put(':id/tags')
  updateTags(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('tags') tags: string[],
  ) {
    return this.contactService.updateTags(tenantId, id, tags);
  }

  @Post(':id/unsubscribe')
  unsubscribe(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contactService.unsubscribe(tenantId, id);
  }

  @Delete(':id')
  delete(
    @CurrentTenant() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contactService.delete(tenantId, id);
  }

  @Post('import')
  importContacts(
    @CurrentTenant() tenantId: number,
    @Body('contacts') contacts: CreateContactDto[],
  ) {
    return this.contactService.importFromCsv(tenantId, contacts);
  }
}
