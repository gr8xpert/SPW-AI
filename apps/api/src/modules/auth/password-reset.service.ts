import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { PasswordResetToken, User } from '../../database/entities';

// One-shot, 1-hour password reset tokens. Mirrors EmailVerificationService:
//   issue(user):  returns a raw token (caller emails it), stores sha256 in DB,
//                 kills any previous unconsumed tokens for that user.
//   consume(raw): validates + consumes the row, returns the user id. The caller
//                 sets the new password.
//
// Shorter lifetime than verification links because a reset link is a login.
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly TOKEN_LIFETIME_MS = 60 * 60 * 1000;

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
  ) {}

  async issue(user: User): Promise<string> {
    await this.tokenRepo.update(
      { userId: user.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const rawToken = randomBytes(32).toString('hex');
    await this.tokenRepo.insert({
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + this.TOKEN_LIFETIME_MS),
    });

    return rawToken;
  }

  async consume(rawToken: string): Promise<{ userId: number }> {
    if (!rawToken) {
      throw new BadRequestException('Reset token is required');
    }

    const row = await this.tokenRepo.findOne({ where: { tokenHash: sha256(rawToken) } });

    // One message for every failure mode — the page only needs to tell the
    // user to request a fresh link.
    if (!row || row.consumedAt !== null || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    // Conditional update so two concurrent submits can't both succeed.
    const res = await this.tokenRepo.update(
      { id: row.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (!res.affected) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    this.logger.log(`password reset token consumed for user=${row.userId}`);
    return { userId: row.userId };
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
