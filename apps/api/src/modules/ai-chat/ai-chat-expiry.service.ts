import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { AiChatService } from './ai-chat.service';

const LOCK_KEY = 'cron:ai-chat-expiry';
const LOCK_TTL_MS = 10 * 60 * 1000;

// Hourly: closes website chats past the tenant's expiry days. One replica
// runs it (Redis lock), like the other cleanups.
@Injectable()
export class AiChatExpiryService {
  private readonly logger = new Logger(AiChatExpiryService.name);

  constructor(
    private readonly chatService: AiChatService,
    private readonly lock: RedisLockService,
  ) {}

  @Cron('17 * * * *')
  async closeExpired(): Promise<void> {
    const outcome = await this.lock.withLock(LOCK_KEY, LOCK_TTL_MS, () => this.chatService.closeExpired());
    if (outcome.acquired && outcome.result) {
      this.logger.log(`closed ${outcome.result} expired chat conversation(s)`);
    }
  }
}
