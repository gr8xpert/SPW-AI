import { IsOptional, IsIn, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatAnalyticsQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  range?: string = '30d';
}

export class ChatConversationListDto {
  @IsOptional()
  @IsIn(['active', 'closed'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
