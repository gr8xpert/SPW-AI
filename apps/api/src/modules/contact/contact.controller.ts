import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
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
