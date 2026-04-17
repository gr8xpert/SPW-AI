import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { EmailVerificationToken, User } from '../../database/entities';

// One-shot, 24-hour email verification tokens.
//   issue(user):  returns a raw token (caller emails it), stores sha256 in DB,
//                 kills any previous unconsumed tokens for that user.
//   consume(raw): validates + flips User.emailVerifiedAt, consumes the row.
//
// Raw tokens are URL-safe hex (32 bytes = 64 chars) — long enough that guessing
// is infeasible, short enough to fit in a link query string.
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(EmailVerificationToken)
    private readonly tokenRepo: Repository<EmailVerificationToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async issue(user: User): Promise<string> {
    // Invalidate any still-valid tokens for this user before minting a new one,
    // so a resend doesn't leave multiple live links in the admin's inbox.
    await this.tokenRepo.update(
      { userId: user.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + this.TOKEN_LIFETIME_MS);

    await this.tokenRepo.insert({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return rawToken;
  }

  async consume(rawToken: string): Promise<{ userId: number }> {
    if (!rawToken) {
      throw new BadRequestException('Token is required');
    }

    const tokenHash = sha256(rawToken);
    const row = await this.tokenRepo.findOne({ where: { tokenHash } });

    if (!row) {
      throw new NotFoundException('Verification token not found');
    }

    if (row.consumedAt !== null) {
      throw new BadRequestException('Verification token already used');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification token expired');
    }

    // Mark consumed first; if the user update fails we don't leave the token
    // re-usable.
    await this.tokenRepo.update(row.id, { consumedAt: new Date() });
    await this.userRepo.update(row.userId, { emailVerifiedAt: new Date() });
    this.logger.log(`email verified for user=${row.userId}`);

    return { userId: row.userId };
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
