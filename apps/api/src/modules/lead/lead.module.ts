import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadActivity } from '../../database/entities';
import { LeadService } from './lead.service';
import { LeadScoringService } from './lead-scoring.service';
import { LeadController, InquiryController, ShareFavoritesController } from './lead.controller';
import { ContactModule } from '../contact/contact.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, LeadActivity]),
    ContactModule,
  ],
  controllers: [LeadController, InquiryController, ShareFavoritesController],
  providers: [LeadService, LeadScoringService],
  exports: [LeadService],
})
export class LeadModule {}
