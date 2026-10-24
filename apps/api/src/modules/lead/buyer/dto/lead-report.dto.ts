import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { LEAD_SOURCES } from './buyer.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Filters of the status column: not contacted includes overdue; tried =
// reached out but never spoke (call back and wrong number too).
export const REPORT_STATUS_FILTERS = ['not_contacted', 'overdue', 'tried', 'reached'] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS_FILTERS)[number];

export class LeadReportQueryDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  q?: string;

  // The main agent; 0 = nobody.
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  agentId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  stageId?: number;

  @IsOptional() @IsIn(LEAD_SOURCES)
  source?: (typeof LEAD_SOURCES)[number];

  @IsOptional() @IsIn(REPORT_STATUS_FILTERS)
  status?: ReportStatusFilter;

  // Leads that came in from … to (ISO dates/times).
  @IsOptional() @IsDateString()
  from?: string;

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @IsIn(['newest', 'oldest'])
  sort?: 'newest' | 'oldest';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
