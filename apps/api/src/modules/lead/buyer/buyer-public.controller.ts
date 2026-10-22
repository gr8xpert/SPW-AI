import { Body, Controller, Get, Headers, Logger, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators';
import { ApiKeyThrottlerGuard } from '../../../common/guards/api-key-throttler.guard';
import { TenantService } from '../../tenant/tenant.service';
import { language, requireRecaptcha, widgetTenant } from '../website-form-guard';
import { BuyerQuestionService } from './buyer-question.service';
import { BuyerIntakeService } from './buyer-intake.service';
import { BuyerFormMailService } from './buyer-form-mail.service';
import { BuyerQuestionsQueryDto, BuyerWishlistFormDto } from './dto/buyer-public.dto';

function textIn(t: Record<string, string> | null | undefined, lang: string): string {
  return (t && (t[lang] || t.en || Object.values(t).find(Boolean))) || '';
}

// The buyer questions the client shows on the website wishlist form, in the
// page's language. Read-only, cached by nobody (the client may edit them).
@Controller('api/v1/buyer-questions')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
export class PublicBuyerQuestionsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly questionService: BuyerQuestionService,
  ) {}

  @Public()
  @Get()
  async list(@Headers('x-api-key') apiKey: string, @Query() query: BuyerQuestionsQueryDto) {
    if (!apiKey) throw new UnauthorizedException('API key required');
    const tenant = await this.tenantService.findWidgetTenantForRead(apiKey);
    if (!tenant) throw new UnauthorizedException('Invalid API key');
    const lang = query.lang || tenant.settings?.defaultLanguage || 'en';
    const questions = await this.questionService.list(tenant.id);
    return questions
      .filter((q) => q.isActive && q.showOnForm)
      .map((q) => ({
        key: q.qkey,
        label: textIn(q.label, lang),
        multiple: q.multiple,
        options: q.options.map((o) => ({ key: o.key, label: textIn(o.label, lang) })),
      }));
  }
}

// The website wishlist form: the visitor's own wishlist, questions and
// contact details. Same limits as the inquiry form (30 a minute per site,
// reCAPTCHA when the client set keys). Runs for every client.
@Controller('api/v1/buyer-wishlist')
@UseGuards(ApiKeyThrottlerGuard)
@SkipThrottle({ default: true, short: true, medium: true, long: true })
@Throttle({ 'api-key': { limit: 30, ttl: 60_000 } })
export class PublicBuyerWishlistController {
  private readonly logger = new Logger(PublicBuyerWishlistController.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly intake: BuyerIntakeService,
    private readonly formMail: BuyerFormMailService,
  ) {}

  @Public()
  @Post()
  async submit(
    @Headers('x-api-key') apiKey: string,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Body() dto: BuyerWishlistFormDto,
  ) {
    const tenant = await widgetTenant(this.tenantService, apiKey);
    await requireRecaptcha(tenant, dto.recaptchaToken);
    const pageLanguage = dto.lang || language(acceptLanguage);
    const { lead, created, repeat } = await this.intake.submitWishlistForm(tenant.id, {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      preferredContact: dto.preferredContact,
      language: dto.language,
      notes: dto.notes,
      wishlist: dto.wishlist as unknown as Record<string, unknown>,
      answers: dto.answers,
      pageUrl: dto.pageUrl,
      pageLanguage,
    });
    if (!repeat) {
      this.formMail
        .send(tenant, lead, { email: dto.email, isNew: created, notes: dto.notes, pageLanguage })
        .catch((err) => this.logger.error(`Wishlist form emails failed for buyer ${lead.id}: ${(err as Error).message}`));
    }
    // Never the stored buyer: the caller only proved they know an email.
    return { success: true };
  }
}
