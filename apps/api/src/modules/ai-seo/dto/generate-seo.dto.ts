import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class GenerateSeoDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  targetLanguages: string[];
}
