import { IsInt, Min } from 'class-validator';

export class MergeLocationDto {
  @IsInt()
  @Min(1)
  targetId: number;
}
