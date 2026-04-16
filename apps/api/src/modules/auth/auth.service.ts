import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, Tenant, Plan } from '../../database/entities';
import { LoginDto, LoginResponseDto, RegisterDto } from './dto';
import { JwtPayload, UserRole } from '@spw/shared';

@Injectable()
export class AuthService {
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

    // Use transaction to ensure tenant and user are created atomically
    const result = await this.dataSource.transaction(async (manager) => {
      // Create tenant
      const tenant = manager.create(Tenant, {
        name: dto.tenantName,
        slug: tenantSlug,
        planId: freePlan.id,
        apiKey: this.generateApiKey(),
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

    // Generate tokens
    const tokens = await this.generateTokens(result);

    return {
      ...tokens,
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
        tenantId: result.tenantId,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub, isActive: true },
        relations: ['tenant'],
      });

      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if tenant is still active
      if (!user.tenant || !user.tenant.isActive) {
        throw new UnauthorizedException('Tenant account is deactivated');
      }

      const accessToken = this.generateAccessToken(user);

      return { accessToken };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(user: User) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

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

  private generateRefreshToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateApiKey(): string {
    return `spw_${uuidv4().replace(/-/g, '')}`;
  }

  private generateWebhookSecret(): string {
    return uuidv4().replace(/-/g, '');
  }
}
