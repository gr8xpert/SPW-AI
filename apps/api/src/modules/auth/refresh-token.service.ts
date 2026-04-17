import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import {
  RefreshToken,
  RefreshTokenRevokedReason,
  User,
} from '../../database/entities';
import { JwtPayload } from '@spw/shared';

// Refresh-token rotation with reuse detection.
//
// Invariant: at most one row per chain is non-revoked at a time. Rotating
// consumes the caller's row (revokedAt=now, reason='rotated') and inserts a
// fresh one with the same familyId. If a client ever presents a row that's
// already revoked with reason='rotated', someone is replaying — we revoke the
// whole family so the legitimate client's next refresh also fails, forcing a
// re-login that (presumably) doesn't involve the attacker's copy.
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // New login: omit familyId. Rotation: pass the chain's id so we extend it.
  async issue(
    user: User,
    familyId?: string,
  ): Promise<{ refreshToken: string; familyId: string; tokenHash: string }> {
    const resolvedFamilyId = familyId ?? randomBytes(16).toString('hex');
    const payload: JwtPayload & { jti: string } = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      // jti guarantees every signed refresh is unique even when two logins
      // race within the same second — otherwise identical claims produce
      // identical JWTs and collide on tokenHash's UNIQUE index.
      jti: randomBytes(16).toString('hex'),
    };
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
    });
    const tokenHash = sha256(refreshToken);

    const decoded = this.jwtService.decode(refreshToken) as { exp?: number };
    if (!decoded?.exp) {
      throw new Error('Signed refresh token lacks exp claim');
    }
    const expiresAt = new Date(decoded.exp * 1000);

    await this.repo.insert({
      userId: user.id,
      tenantId: user.tenantId,
      familyId: resolvedFamilyId,
      tokenHash,
      expiresAt,
    });

    return { refreshToken, familyId: resolvedFamilyId, tokenHash };
  }

  // Atomically consume a refresh token: verifies signature, detects reuse,
  // marks the row rotated. Returns the data needed to mint the replacement.
  // Caller then calls issue(user, familyId) and patches replacedByHash via
  // linkReplacement() so the audit chain stays intact.
  async consume(
    rawRefreshJwt: string,
  ): Promise<{ payload: JwtPayload; familyId: string; oldHash: string }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawRefreshJwt, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = sha256(rawRefreshJwt);

    // Two-phase so family-revoke survives the throw. Throwing inside the
    // transaction callback rolls back the reuse-revoke; instead we decide
    // the outcome inside the txn, commit it, then react outside.
    type TxResult =
      | { kind: 'ok'; familyId: string }
      | { kind: 'missing' }
      | { kind: 'reused'; familyId: string }
      | { kind: 'revoked' }
      | { kind: 'expired' };

    const result: TxResult = await this.dataSource.transaction(
      async (manager) => {
        const row = await manager
          .getRepository(RefreshToken)
          .createQueryBuilder('rt')
          .setLock('pessimistic_write')
          .where('rt.tokenHash = :h', { h: tokenHash })
          .getOne();

        if (!row) {
          return { kind: 'missing' };
        }

        if (row.revokedAt !== null) {
          // reuse signal: replay of an already-rotated token. The family-revoke
          // happens in the next phase so a failing throw can't undo it.
          return row.revokedReason === 'rotated'
            ? { kind: 'reused', familyId: row.familyId }
            : { kind: 'revoked' };
        }

        if (row.expiresAt.getTime() < Date.now()) {
          return { kind: 'expired' };
        }

        await manager.getRepository(RefreshToken).update(row.id, {
          revokedAt: new Date(),
          revokedReason: 'rotated',
        });

        return { kind: 'ok', familyId: row.familyId };
      },
    );

    switch (result.kind) {
      case 'missing':
        this.logger.warn(
          `refresh: valid JWT but no matching row (user=${payload.sub})`,
        );
        throw new UnauthorizedException('Invalid refresh token');
      case 'reused':
        this.logger.warn(
          `refresh-reuse detected: family=${result.familyId} user=${payload.sub}`,
        );
        await this.revokeFamily(result.familyId, 'reused');
        throw new UnauthorizedException('Refresh token has been revoked');
      case 'revoked':
        throw new UnauthorizedException('Refresh token has been revoked');
      case 'expired':
        throw new UnauthorizedException('Refresh token expired');
      case 'ok':
        return { payload, familyId: result.familyId, oldHash: tokenHash };
    }
  }

  async linkReplacement(oldHash: string, newHash: string): Promise<void> {
    await this.repo.update({ tokenHash: oldHash }, { replacedByHash: newHash });
  }

  async revokeFamily(
    familyId: string,
    reason: RefreshTokenRevokedReason,
  ): Promise<void> {
    await this.repo.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeToken(
    rawRefreshJwt: string,
    reason: RefreshTokenRevokedReason,
  ): Promise<void> {
    const tokenHash = sha256(rawRefreshJwt);
    await this.repo.update(
      { tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
