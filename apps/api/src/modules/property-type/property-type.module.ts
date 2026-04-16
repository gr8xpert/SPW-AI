import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyTypeController } from './property-type.controller';
import { PropertyTypeService } from './property-type.service';
import { PropertyType } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([PropertyType])],
  controllers: [PropertyTypeController],
  providers: [PropertyTypeService],
  exports: [PropertyTypeService],
})
export class PropertyTypeModule {}
