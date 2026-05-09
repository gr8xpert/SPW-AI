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
   * Get credit transaction history for a tenant
   */
  async getHistory(
    tenantId: number,
    page = 1,
    limit = 20,
  ): Promise<CreditHistory> {
    const [transactions, total] = await this.creditTransactionRepository.findAndCount({
      where: { tenantId },
      relations: ['ticket', 'createdByUser'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      transactions,
      total,
      page,
      limit,
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

      const newBalance = Number(creditBalance.balance) + dto.amount;

      if (newBalance < 0) {
        throw new BadRequestException('Cannot adjust balance below zero');
      }

      creditBalance.balance = newBalance;
      await queryRunner.manager.save(creditBalance);

      // Create transaction record
      const transaction = queryRunner.manager.create(CreditTransaction, {
        tenantId,
        type: dto.type,
        amount: dto.amount,
        balanceAfter: newBalance,
        description: dto.description || `Credit ${dto.type}`,
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
  async getAllBalances(): Promise<Array<{ tenantId: number; tenantName: string; balance: number }>> {
    const tenants = await this.tenantRepository.find({
      select: ['id', 'name'],
    });

    const balances = await this.creditBalanceRepository.find();
    const balanceMap = new Map(balances.map((b) => [b.tenantId, Number(b.balance)]));

    return tenants.map((tenant) => ({
      tenantId: tenant.id,
      tenantName: tenant.name,
      balance: balanceMap.get(tenant.id) || 0,
    }));
  }
}
