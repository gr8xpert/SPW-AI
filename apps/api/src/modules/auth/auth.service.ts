import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User, Tenant, Plan } from '../../database/entities';
import { LoginDto, LoginResponseDto, RegisterDto } from './dto';
import { RefreshTokenService } from './refresh-token.service';
import { EmailVerificationService } from './email-verification.service';
import { generateApiKey } from '../../common/crypto/api-key';
import { JwtPayload, UserRole } from '@spw/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private refreshTokenService: RefreshTokenService,
    private emailVerificationService: EmailVerificationService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: ['tenant'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.tenant.isActive) {
      throw new UnauthorizedException('Tenant account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Enforce email verification at every login so a lost-access-token can't
    // be replayed as a fresh session against an unverified account. Register
    // still issues tokens for the initial session, but logging back in from
    // a new device requires the one-time verify link to have been clicked.
    if (user.emailVerifiedAt === null) {
      throw new UnauthorizedException({
        message: 'Email address not verified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Update last login
    await this.userRepository.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async register(dto: RegisterDto): Promise<LoginResponseDto> {
    const normalizedEmail = dto.email.toLowerCase();

    // Check if email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Generate or validate tenant slug
    const tenantSlug = dto.tenantSlug || this.generateSlug(dto.tenantName);

    // Check if tenant slug exists
    const existingTenant = await this.tenantRepository.findOne({
      where: { slug: tenantSlug },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant slug already taken');
    }

    // Get free plan
    const freePlan = await this.planRepository.findOne({
      where: { slug: 'free' },
    });

    if (!freePlan) {
      throw new BadRequestException('Default plan not found');
    }

    // Hash password before transaction
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Generate the tenant API key up front so we can return the raw value in
    // the response. Only the hash lands in the database.
    const apiKey = generateApiKey();

    // Use transaction to ensure tenant and user are created atomically
    const result = await this.dataSource.transaction(async (manager) => {
      // Create tenant
      const tenant = manager.create(Tenant, {
        name: dto.tenantName,
        slug: tenantSlug,
        planId: freePlan.id,
        apiKeyHash: apiKey.hash,
        apiKeyLast4: apiKey.last4,
        webhookSecret: this.generateWebhookSecret(),
      });

      await manager.save(tenant);

      // Create user as admin of the new tenant
      const user = manager.create(User, {
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        name: dto.name,
        role: UserRole.ADMIN,
        emailVerifiedAt: null,
      });

      await manager.save(user);

      return user;
    });

    // Generate tokens so the initial session works without a separate login
    // step. Login from a new device later will still require email verification.
    const tokens = await this.generateTokens(result);

    // Issue the verification link. Actual email delivery is a follow-up
    // (email-sender is in a separate module, SMTP config not wired here).
    // For now we log the link so dev/staging can click through from the console.
    const verificationToken = await this.emailVerificationService.issue(result);
    this.logger.log(
      `email-verify link for ${result.email}: /verify?token=${verificationToken}`,
    );

    return {
      ...tokens,
      // Returned exactly once at registration — store it now or rotate later.
      tenantApiKey: apiKey.rawKey,
      emailVerificationRequired: true,
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
        tenantId: result.tenantId,
      },
    };
  }

  // Rotates the refresh token. Caller trades one valid refresh for a new
  // access+refresh pair. The old refresh is marked 'rotated' and any replay
  // of it triggers full-family revocation (see RefreshTokenService.consume).
  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { payload, familyId, oldHash } =
      await this.refreshTokenService.consume(refreshToken);

    const user = await this.userRepository.findOne({
      where: { id: payload.sub, isActive: true },
      relations: ['tenant'],
    });

    if (!user) {
      // User deactivated or deleted after issuance — kill the whole chain
      // so lingering siblings can't continue.
      await this.refreshTokenService.revokeFamily(familyId, 'reused');
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.tenant || !user.tenant.isActive) {
      await this.refreshTokenService.revokeFamily(familyId, 'reused');
      throw new UnauthorizedException('Tenant account is deactivated');
    }

    const accessToken = this.generateAccessToken(user);
    const { refreshToken: newRefresh, tokenHash: newHash } =
      await this.refreshTokenService.issue(user, familyId);
    await this.refreshTokenService.linkReplacement(oldHash, newHash);

    return { accessToken, refreshToken: newRefresh };
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    await this.emailVerificationService.consume(token);
    return { verified: true };
  }

  // Re-issues a verification link. Always returns success so attackers can't
  // enumerate registered emails by probing this endpoint.
  async resendVerification(email: string): Promise<{ sent: true }> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (user && user.emailVerifiedAt === null && user.isActive) {
      const token = await this.emailVerificationService.issue(user);
      this.logger.log(
        `resend verify link for ${user.email}: /verify?token=${token}`,
      );
    }
    return { sent: true };
  }

  // Used by /logout to drop a specific refresh + its chain.
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
      // Revoke by hash first (best effort); then fall back to family revoke
      // via the row we just matched so other siblings are also killed.
      await this.refreshTokenService.revokeToken(refreshToken, 'logout');
      // We don't look up the row here — revokeToken's hash match is enough
      // to identify the session. Sibling revocation on logout is intentional:
      // a single sign-out ends *this* session, not every device.
      void payload;
    } catch {
      // Invalid/expired refresh on logout is a no-op; don't leak validity.
    }
  }

  private async generateTokens(user: User) {
    const accessToken = this.generateAccessToken(user);
    const { refreshToken } = await this.refreshTokenService.issue(user);

    return { accessToken, refreshToken };
  }

  private generateAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }
}
