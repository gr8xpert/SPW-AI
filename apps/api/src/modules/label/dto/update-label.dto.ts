import { IsObject, IsOptional } from 'class-validator';

export class UpdateLabelDto {
  @IsObject()
  @IsOptional()
  translations?: Record<string, string>;
}
