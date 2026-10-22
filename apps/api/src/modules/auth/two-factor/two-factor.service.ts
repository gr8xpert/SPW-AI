import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as QRCode from 'qrcode';
import { User, Tenant } from '../../../database/entities';
import { base32Decode, newRecoveryCodes, newSecret, normaliseRecoveryCode, otpauthUrl, verifyTotp } from './totp';

// Two-factor login (milestone J): set-up with a QR code, turn on with a first
// code, recovery codes, turn off with password + code, and the check at login
// with a lock after 5 wrong codes.

const ISSUER = 'SPM Dashboard';
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const SUPER_ADMIN = 'super_admin';

export interface TwoFactorStatus {
  enabled: boolean;
  required: boolean;
  recoveryLeft: number;
}

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  // With the secret + recovery hashes, which are never selected by default.
  private async load(userId: number): Promise<User> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect(['u.twoFactorSecret', 'u.twoFactorRecovery', 'u.passwordHash'])
      .leftJoinAndSelect('u.tenant', 'tenant')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Does this user's agency make two-factor login compulsory for them?
  static required(user: Pick<User, 'role'> & { tenant?: Pick<Tenant, 'require2fa'> | null }): boolean {
    return !!user.tenant?.require2fa && user.role !== SUPER_ADMIN;
  }

  async status(userId: number): Promise<TwoFactorStatus> {
    const user = await this.load(userId);
    return { enabled: user.twoFactorEnabled, required: TwoFactorService.required(user), recoveryLeft: user.twoFactorRecovery?.length ?? 0 };
  }

  // A new secret (not active until confirmed with a code). Calling it again
  // replaces the pending secret.
  async setup(userId: number): Promise<{ secret: string; otpauthUrl: string; qr: string }> {
    const user = await this.load(userId);
    if (user.twoFactorEnabled) throw new ConflictException({ message: 'Two-factor login is already on', code: 'TWO_FACTOR_ON' });
    const secret = newSecret();
    await this.users.update(user.id, { twoFactorSecret: secret });
    const url = otpauthUrl(ISSUER, user.email, secret);
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
    return { secret, otpauthUrl: url, qr };
  }

  async enable(userId: number, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.load(userId);
    if (user.twoFactorEnabled) throw new ConflictException({ message: 'Two-factor login is already on', code: 'TWO_FACTOR_ON' });
    if (!user.twoFactorSecret) throw new BadRequestException({ message: 'Start the set-up first', code: 'NO_SETUP' });
    if (!verifyTotp(base32Decode(user.twoFactorSecret), code, Date.now())) {
      throw new BadRequestException({ message: 'That code is not right. Check the time on your phone and try the newest code.', code: 'TWO_FACTOR_INVALID' });
    }
    const recoveryCodes = newRecoveryCodes();
    await this.users.update(user.id, {
      twoFactorEnabled: true,
      twoFactorRecovery: await this.hashCodes(recoveryCodes),
      twoFactorFailures: 0,
      twoFactorLockedUntil: null,
    });
    return { recoveryCodes };
  }

  async disable(userId: number, password: string, code: string): Promise<{ enabled: false }> {
    const user = await this.load(userId);
    if (!user.twoFactorEnabled) return { enabled: false };
    if (TwoFactorService.required(user)) {
      throw new ForbiddenException({ message: 'Your agency requires two-factor login', code: 'TWO_FACTOR_REQUIRED_BY_AGENCY' });
    }
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({ message: 'Wrong password', code: 'WRONG_PASSWORD' });
    }
    await this.check(user, code);
    await this.users.update(user.id, { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecovery: null, twoFactorFailures: 0, twoFactorLockedUntil: null });
    return { enabled: false };
  }

  async newRecoveryCodes(userId: number, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.load(userId);
    if (!user.twoFactorEnabled) throw new BadRequestException({ message: 'Two-factor login is off', code: 'TWO_FACTOR_OFF' });
    await this.check(user, code);
    const recoveryCodes = newRecoveryCodes();
    await this.users.update(user.id, { twoFactorRecovery: await this.hashCodes(recoveryCodes) });
    return { recoveryCodes };
  }

  // The agency admin switches "everyone must use two-factor login" on or off.
  async setRequired(tenantId: number, on: boolean): Promise<{ required: boolean }> {
    await this.tenants.update(tenantId, { require2fa: on });
    return { required: on };
  }

  // Login: password already checked. Throws TWO_FACTOR_REQUIRED without a
  // code, TWO_FACTOR_INVALID on a wrong one, TWO_FACTOR_LOCKED after 5.
  async verifyLogin(userId: number, code: string | undefined): Promise<void> {
    const user = await this.load(userId);
    if (!user.twoFactorEnabled) return;
    if (!code) {
      this.assertNotLocked(user);
      throw new UnauthorizedException({ message: 'Enter the code from your authenticator app', code: 'TWO_FACTOR_REQUIRED' });
    }
    await this.check(user, code);
  }

  private assertNotLocked(user: User) {
    if (user.twoFactorLockedUntil && +user.twoFactorLockedUntil > Date.now()) {
      throw new HttpException(
        { message: 'Too many wrong codes. Try again in 15 minutes.', code: 'TWO_FACTOR_LOCKED', until: user.twoFactorLockedUntil },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // A 6-digit code from the app, or one of the recovery codes (used up).
  private async check(user: User, code: string): Promise<void> {
    this.assertNotLocked(user);
    const raw = String(code ?? '').trim();
    let ok = false;
    if (/^\d{3}\s?\d{3}$/.test(raw)) {
      ok = !!user.twoFactorSecret && verifyTotp(base32Decode(user.twoFactorSecret), raw, Date.now());
    } else {
      const norm = normaliseRecoveryCode(raw);
      const hashes = user.twoFactorRecovery ?? [];
      for (let i = 0; norm.length === 10 && i < hashes.length; i++) {
        if (await bcrypt.compare(norm, hashes[i])) {
          ok = true;
          await this.users.update(user.id, { twoFactorRecovery: hashes.filter((_, j) => j !== i) });
          break;
        }
      }
    }
    if (ok) {
      if (user.twoFactorFailures || user.twoFactorLockedUntil) await this.users.update(user.id, { twoFactorFailures: 0, twoFactorLockedUntil: null });
      return;
    }
    const failures = (user.twoFactorFailures ?? 0) + 1;
    const lock = failures >= MAX_FAILURES;
    await this.users.update(user.id, lock ? { twoFactorFailures: 0, twoFactorLockedUntil: new Date(Date.now() + LOCK_MS) } : { twoFactorFailures: failures });
    if (lock) {
      throw new HttpException({ message: 'Too many wrong codes. Try again in 15 minutes.', code: 'TWO_FACTOR_LOCKED' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new UnauthorizedException({ message: 'That code is not right', code: 'TWO_FACTOR_INVALID' });
  }

  private hashCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((c) => bcrypt.hash(normaliseRecoveryCode(c), 10)));
  }
}
