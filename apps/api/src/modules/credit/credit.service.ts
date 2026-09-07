import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreditBalance, CreditTransaction, Tenant, Ticket } from '../../database/entities';
import { AdjustCreditDto, ConsumeCreditDto } from './dto';

export interface CreditHistory {
  transactions: CreditTransaction[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(CreditBalance)
    private creditBalanceRepository: Repository<CreditBalance>,
    @InjectRepository(CreditTransaction)
    private creditTransactionRepository: Repository<CreditTransaction>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
    private dataSource: DataSource,
  ) {}

  /**
   * Get credit balance for a tenant
   */
  async getBalance(tenantId: number): Promise<{ balance: number; tenantId: number }> {
    let creditBalance = await this.creditBalanceRepository.findOne({
      where: { tenantId },
    });

    // Create if not exists
    if (!creditBalance) {
      creditBalance = this.creditBalanceRepository.create({
        tenantId,
        balance: 0,
      });
      await this.creditBalanceRepository.save(creditBalance);
    }

    return {
      balance: Number(creditBalance.balance),
      tenantId,
    };
  }

  /**
   * Get credit transaction history for a tenant. Shape matches the admin
   * credits page contract: signed DB amount → { type: 'add'|'deduct', amount: positive }.
   */
  async getHistory(
    tenantId: number,
    page = 1,
    limit = 20,
  ): Promise<{
    data: Array<{
      id: number;
      type: 'add' | 'deduct';
      amount: number;
      reason: string;
      performedBy: string;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const [transactions, total] = await this.creditTransactionRepository.findAndCount({
      where: { tenantId },
      relations: ['ticket', 'createdByUser'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = transactions.map((tx) => {
      const signed = Number(tx.amount);
      return {
        id: tx.id,
        type: (signed >= 0 ? 'add' : 'deduct') as 'add' | 'deduct',
        amount: Math.abs(signed),
        reason: tx.description ?? `Credit ${tx.type}`,
        performedBy: tx.createdByUser?.email ?? 'system',
        createdAt: tx.createdAt,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Adjust credits (super admin function)
   */
  async adjustCredits(
    tenantId: number,
    dto: AdjustCreditDto,
    userId: number,
  ): Promise<{ balance: number; transaction: CreditTransaction }> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get or create balance
      let creditBalance = await queryRunner.manager.findOne(CreditBalance, {
        where: { tenantId },
      });

      if (!creditBalance) {
        creditBalance = queryRunner.manager.create(CreditBalance, {
          tenantId,
          balance: 0,
        });
      }

      // Frontend sends positive amount + a type flag; derive signed delta here.
      const delta = dto.type === 'add' ? Math.abs(dto.amount) : -Math.abs(dto.amount);
      const newBalance = Number(creditBalance.balance) + delta;

      if (newBalance < 0) {
        throw new BadRequestException('Cannot adjust balance below zero');
      }

      creditBalance.balance = newBalance;
      await queryRunner.manager.save(creditBalance);

      // Store as canonical 'adjustment' in the DB enum; the sign of `amount`
      // preserves add-vs-deduct semantics for the history view.
      const transaction = queryRunner.manager.create(CreditTransaction, {
        tenantId,
        type: 'adjustment',
        amount: delta,
        balanceAfter: newBalance,
        description: dto.reason,
        createdBy: userId,
      });

      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      return {
        balance: newBalance,
        transaction,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Add credits from a purchase (Stripe webhook)
   */
  async addPurchasedCredits(
    tenantId: number,
    hours: number,
    paymentReference: string,
    userId: number,
  ): Promise<{ balance: number; transaction: CreditTransaction }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let creditBalance = await queryRunner.manager.findOne(CreditBalance, {
        where: { tenantId },
      });

      if (!creditBalance) {
        creditBalance = queryRunner.manager.create(CreditBalance, {
          tenantId,
          balance: 0,
        });
      }

      const newBalance = Number(creditBalance.balance) + hours;
      creditBalance.balance = newBalance;
      await queryRunner.manager.save(creditBalance);

      const transaction = queryRunner.manager.create(CreditTransaction, {
        tenantId,
        type: 'purchase',
        amount: hours,
        balanceAfter: newBalance,
        paymentReference,
        description: `Purchased ${hours} credit hours`,
        createdBy: userId,
      });

      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      return {
        balance: newBalance,
        transaction,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Consume credits for a ticket (when webmaster books hours)
   */
  async consumeCredits(
    tenantId: number,
    dto: ConsumeCreditDto,
    userId: number,
  ): Promise<{ balance: number; transaction: CreditTransaction }> {
    // Validate ticket if provided
    if (dto.ticketId) {
      const ticket = await this.ticketRepository.findOne({
        where: { id: dto.ticketId, tenantId },
      });

      if (!ticket) {
        throw new NotFoundException('Ticket not found');
      }

      // Bug tickets don't consume credits
      if (ticket.category === 'bug') {
        throw new BadRequestException('Bug tickets do not consume credits');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const creditBalance = await queryRunner.manager.findOne(CreditBalance, {
        where: { tenantId },
      });

      if (!creditBalance) {
        throw new BadRequestException('No credit balance found');
      }

      const currentBalance = Number(creditBalance.balance);
      const newBalance = currentBalance - dto.hours;

      if (newBalance < 0) {
        throw new BadRequestException('Insufficient credits');
      }

      creditBalance.balance = newBalance;
      await queryRunner.manager.save(creditBalance);

      const transaction = queryRunner.manager.create(CreditTransaction, {
        tenantId,
        type: 'consume',
        amount: -dto.hours,
        balanceAfter: newBalance,
        ticketId: dto.ticketId || null,
        description: dto.description || `Consumed ${dto.hours} credit hours`,
        createdBy: userId,
      });

      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      return {
        balance: newBalance,
        transaction,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get all tenants with their credit balances (super admin)
   */
  async getAllBalances(): Promise<Array<{
    tenantId: number;
    tenantName: string;
    slug: string;
    balance: number;
    lastActivity: Date | null;
  }>> {
    const tenants = await this.tenantRepository.find({
      select: ['id', 'name', 'slug'],
    });

    const balances = await this.creditBalanceRepository.find();
    const balanceMap = new Map(balances.map((b) => [b.tenantId, Number(b.balance)]));

    // Last-activity = the most recent credit_transactions.createdAt per tenant.
    // Cheap enough for a few hundred tenants; if this ever grows, replace
    // with a GROUP BY MAX(createdAt) at the query layer.
    const latest = await this.creditTransactionRepository
      .createQueryBuilder('tx')
      .select('tx.tenantId', 'tenantId')
      .addSelect('MAX(tx.createdAt)', 'lastActivity')
      .groupBy('tx.tenantId')
      .getRawMany<{ tenantId: number; lastActivity: Date }>();
    const activityMap = new Map(latest.map((r) => [Number(r.tenantId), r.lastActivity]));

    return tenants.map((tenant) => ({
      tenantId: tenant.id,
      tenantName: tenant.name,
      slug: tenant.slug,
      balance: balanceMap.get(tenant.id) || 0,
      lastActivity: activityMap.get(tenant.id) ?? null,
    }));
  }
}
