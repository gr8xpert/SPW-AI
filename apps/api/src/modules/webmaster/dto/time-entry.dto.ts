import { IsNumber, IsString, IsOptional, Min, IsDateString } from 'class-validator';

export class CreateTimeEntryDto {
  @IsNumber()
  ticketId: number;

  @IsNumber()
  @Min(0.25)
  hours: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  workDate?: string;
}

export class UpdateTimeEntryDto {
  @IsNumber()
  @Min(0.25)
  @IsOptional()
  hours?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  workDate?: string;
}

export class QueryTimeEntriesDto {
  @IsNumber()
  @IsOptional()
  ticketId?: number;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;
}
