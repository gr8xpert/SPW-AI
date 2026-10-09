import { IsArray, IsIn, IsNumber, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ReorderItemDto {
  @IsNumber()
  id: number;

  @IsNumber()
  sortOrder: number;
}

export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items: ReorderItemDto[];
}

export class SortAllDto {
  @IsIn(['name', 'name-desc', 'count'])
  by: 'name' | 'name-desc' | 'count';
}
