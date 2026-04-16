import { PartialType } from '@nestjs/mapped-types';
import { CreateFeedConfigDto } from './create-feed-config.dto';

export class UpdateFeedConfigDto extends PartialType(CreateFeedConfigDto) {}
