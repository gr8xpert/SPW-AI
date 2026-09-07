import { IsNumber, IsString, IsOptional, IsEnum, Min } from 'class-validator';

export class AdjustCreditDto {
  // Positive amount. Actual delta sign is derived from `type` below —
  // this keeps the super-admin UI intuitive (radio: Add / Deduct + amount)
  // instead of forcing operators to think in signed numbers.
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(['add', 'deduct'])
  type: 'add' | 'deduct';

  @IsString()
  reason: string;
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
