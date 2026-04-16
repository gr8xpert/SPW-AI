import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsString } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}

export class LockFieldsDto {
  @IsArray()
  @IsString({ each: true })
  fields: string[];
}

export class UnlockFieldsDto {
  @IsArray()
  @IsString({ each: true })
  fields: string[];
}
