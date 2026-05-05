import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  CreditBalance,
  CreditTransaction,
  ProcessedStripeEvent,
  Tenant,
} from '../../database/entities';
import { verifyStripeSignature } from './stripe-signature';

export interface StripeProcessResult {
  processed: boolean;
  eventId: string;
  eventType: string;
  outcome: 'applied' | 'replay' | 'ignored';
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ProcessedStripeEvent)
    private readonly processedRepo: Repository<ProcessedStripeEvent>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  async process(options: {
    rawBody: string;
    signatureHeader: string | undefined;
  }): Promise<StripeProcessResult> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set — rejecting event');
      throw new UnauthorizedException('Stripe webhooks not configured');
    }

    const verification = verifyStripeSignature({
      header: options.signatureHeader,
      rawBody: options.rawBody,
      secret,
    });

    if (!verification.ok) {
      this.logger.warn(`Stripe signature verification failed: ${verification.reason}`);
      throw new UnauthorizedException(
        `Invalid Stripe signature (${verification.reason})`,
      );
    }

    let event: any;
    try {
      event = JSON.parse(options.rawBody);
    } catch {
      this.logger.error('Stripe webhook body is not valid JSON');
      throw new UnauthorizedException('Invalid payload');
    }

    const eventId: string = event.id;
    const eventType: string = event.type;

    if (!eventId || !eventType) {
      this.logger.warn('Stripe event missing id or type');
      if (eventId) {
        await this.processedRepo.insert({ eventId, eventType: eventType || 'malformed' });
      }
      return { processed: false, eventId: eventId || '', eventType: eventType || '', outcome: 'ignored' };
    }

    const alreadySeen = await this.processedRepo.findOne({
      where: { eventId },
    });
    if (alreadySeen) {
      return { processed: true, eventId, eventType, outcome: 'replay' };
    }

    if (eventType === 'checkout.session.completed') {
      await this.handleCheckoutCompleted(event, eventId, eventType);
      return { processed: true, eventId, eventType, outcome: 'applied' };
    }

    await this.processedRepo.insert({ eventId, eventType });
    return { processed: true, eventId, eventType, outcome: 'ignored' };
  }

  private async handleCheckoutCompleted(
    event: any,
    eventId: string,
    eventType: string,
  ): Promise<void> {
    const session = event.data?.object;
    if (!session) {
      this.logger.warn(`checkout.session.completed missing data.object`);
      return;
    }

    const tenantId = parseInt(session.metadata?.tenantId, 10);
    const hours = parseFloat(session.metadata?.hours);
    const paymentIntent = session.payment_intent ?? session.id;

    if (!tenantId || isNaN(hours) || hours <= 0) {
      this.logger.warn(
        `Stripe checkout.session.completed missing metadata — tenantId=${session.metadata?.tenantId}, hours=${session.metadata?.hours}`,
      );
      await this.processedRepo.insert({ eventId, eventType });
      return;
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      this.logger.warn(
        `Stripe checkout.session.completed for unknown tenant ${tenantId}`,
      );
      await this.processedRepo.insert({ eventId, eventType });
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.insert(ProcessedStripeEvent, {
        eventId,
        eventType,
      });

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
        paymentReference: paymentIntent,
        description: `Purchased ${hours} credit hours via Stripe`,
        createdBy: null,
      });
      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Credited ${hours}h to tenant ${tenantId} (Stripe ${paymentIntent})`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
