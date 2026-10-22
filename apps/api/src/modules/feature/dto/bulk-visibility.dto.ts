import { IsBoolean } from 'class-validator';

// Features page → "Show on website" for every feature at once.
export class BulkVisibilityDto {
  @IsBoolean()
  isActive: boolean;
}
