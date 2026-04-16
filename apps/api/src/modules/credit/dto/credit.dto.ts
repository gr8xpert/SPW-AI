import { IsNumber, IsString, IsOptional, IsEnum, Min } from 'class-validator';

export class AdjustCreditDto {
  @IsNumber()
  amount: number; // Can be positive (add) or negative (deduct)

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['adjustment', 'refund'])
  type: 'adjustment' | 'refund';
}

export class PurchaseCreditDto {
  @IsNumber()
  @Min(1)
  hours: number;
}

export class ConsumeCreditDto {
  @IsNumber()
  @Min(0.25)
  hours: number;

  @IsNumber()
  @IsOptional()
  ticketId?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
