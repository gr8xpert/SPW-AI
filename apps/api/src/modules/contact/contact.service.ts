import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Contact } from '../../database/entities';
import { CreateContactDto, UpdateContactDto } from './dto';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
  ) {}

  async create(tenantId: number, dto: CreateContactDto): Promise<Contact> {
    // Check for existing contact with same email
    const existing = await this.contactRepository.findOne({
      where: { tenantId, email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Contact with this email already exists');
    }

    const contact = this.contactRepository.create({
      ...dto,
      tenantId,
    });

    return this.contactRepository.save(contact);
  }

  async findOrCreate(tenantId: number, dto: CreateContactDto): Promise<Contact> {
    const existing = await this.contactRepository.findOne({
      where: { tenantId, email: dto.email },
    });

    if (existing) {
      // Update existing contact with new info if provided
      if (dto.name && !existing.name) existing.name = dto.name;
      if (dto.phone && !existing.phone) existing.phone = dto.phone;
      if (dto.sourcePropertyId && !existing.sourcePropertyId) {
        existing.sourcePropertyId = dto.sourcePropertyId;
      }

      return this.contactRepository.save(existing);
    }

    const contact = this.contactRepository.create({
      ...dto,
      tenantId,
    });

    return this.contactRepository.save(contact);
  }

  async findAll(
    tenantId: number,
    options: {
      search?: string;
      subscribed?: boolean;
      tags?: string[];
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ data: Contact[]; total: number }> {
    const { search, subscribed, tags, page = 1, limit = 20 } = options;

    const query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenantId = :tenantId', { tenantId });

    if (search) {
      query.andWhere(
        '(contact.email LIKE :search OR contact.name LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (subscribed !== undefined) {
      query.andWhere('contact.subscribed = :subscribed', { subscribed });
    }

    if (tags && tags.length > 0) {
      // MySQL JSON search
      for (const tag of tags) {
        query.andWhere(
          `JSON_CONTAINS(contact.tags, '"${tag}"')`,
        );
      }
    }

    query.orderBy('contact.createdAt', 'DESC');

    const [data, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(tenantId: number, id: number): Promise<Contact> {
    const contact = await this.contactRepository.findOne({
      where: { id, tenantId },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  async findByEmail(tenantId: number, email: string): Promise<Contact | null> {
    return this.contactRepository.findOne({
      where: { tenantId, email },
    });
  }

  async update(
    tenantId: number,
    id: number,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    const contact = await this.findOne(tenantId, id);

    Object.assign(contact, dto);

    return this.contactRepository.save(contact);
  }

  async updateTags(
    tenantId: number,
    id: number,
    tags: string[],
  ): Promise<Contact> {
    const contact = await this.findOne(tenantId, id);
    contact.tags = tags;
    return this.contactRepository.save(contact);
  }

  async unsubscribe(tenantId: number, id: number): Promise<Contact> {
    const contact = await this.findOne(tenantId, id);
    contact.subscribed = false;
    contact.unsubscribedAt = new Date();
    return this.contactRepository.save(contact);
  }

  async delete(tenantId: number, id: number): Promise<void> {
    const contact = await this.findOne(tenantId, id);
    await this.contactRepository.remove(contact);
  }

  async importFromCsv(
    tenantId: number,
    contacts: CreateContactDto[],
  ): Promise<{ created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const dto of contacts) {
      try {
        const existing = await this.contactRepository.findOne({
          where: { tenantId, email: dto.email },
        });

        if (existing) {
          Object.assign(existing, dto);
          await this.contactRepository.save(existing);
          updated++;
        } else {
          const contact = this.contactRepository.create({
            ...dto,
            tenantId,
            source: 'import',
          });
          await this.contactRepository.save(contact);
          created++;
        }
      } catch (error) {
        errors.push(`Failed to import ${dto.email}: ${error.message}`);
      }
    }

    return { created, updated, errors };
  }
}
