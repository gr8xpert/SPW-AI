import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { EmailTemplate, EmailTemplateAiMessage, type VersionSource } from '../../../database/entities';
import { AiService, type ChatMessage } from '../../ai/ai.service';
import { RedisLockService } from '../../../common/redis/redis-lock.service';
import { REDIS_THROTTLER_CLIENT } from '../../../common/throttler/redis-throttler.storage';
import { CampaignContentService } from '../campaign-content.service';
import { checkTemplate } from '../template-check';
import { TemplateVersionService } from './template-version.service';
import { BrandMemoryService } from './brand-memory.service';
import { EmailImageService } from './email-image.service';
import { designerSystemPrompt } from './design-guide';
import { DESIGNER_TOOLS, runDesignerTool, type DesignState } from './designer-tools';

const MAX_ROUNDS = 4;
const HISTORY = 20;
const HOURLY_LIMIT = Number(process.env.EMAIL_DESIGNER_HOURLY_LIMIT) || 30;
/** One deadline for the whole turn (every round together); under Cloudflare's 100 s proxy cut-off. */
export const TURN_TIMEOUT_MS = 90_000;
/** The per-template lock outlives the deadline, so a turn never loses it mid-way. */
const LOCK_TTL_MS = 180_000;
export const MAX_IMAGES = 5;

export const COULD_NOT_APPLY = "The AI couldn't apply that change — try rephrasing";
const UPDATED = "Here's the updated design.";
const TIMEOUT_MESSAGE = 'The AI took too long — try a shorter request';
// Provider calls end a little before the turn does, and never ask for less than this.
const CALL_MARGIN_MS = 2_000;
const MIN_CALL_MS = 5_000;
export const MAX_REPLY_CHARS = 4000;

// The stored chat reply is capped; the design itself is not.
function capReply(text: string): string {
  return text.length > MAX_REPLY_CHARS ? `${text.slice(0, MAX_REPLY_CHARS - 1)}…` : text;
}
// Tools that change the design (save_brand_note only remembers a preference).
const DESIGN_TOOLS = new Set(['replace_html', 'edit_html', 'use_layout', 'set_subject']);

// Small or "lite" variants: the separator before the name keeps "gemini"
// from matching "mini"; "8b"/"70b" are open-weight parameter counts.
const WEAK_MODEL = /(^|[-/._])(mini|nano|haiku|flash-lite|small)\b|\b\d+b\b/i;
const STRONG_MODEL = /claude-(sonnet|opus)|claude-[\d.-]+-?(sonnet|opus)|gpt-4\.1|gpt-5|(^|[-/])o3\b|gemini-(2\.5|3)[-.\w]*pro|grok-4/i;

// Models good enough to design an email. Others still work; the editor warns.
export function isDesignModel(model: string): boolean {
  const m = String(model ?? '').toLowerCase();
  if (WEAK_MODEL.test(m)) return false;
  return STRONG_MODEL.test(m);
}

export interface DesignerInput {
  message: string;
  imageUrls?: string[];
}

export interface DesignerResult {
  reply: string;
  changed: boolean;
  versionId: number | null;
  bodyHtml: string;
  subject: string;
  warnings: string[];
}

type ToolsReply = Awaited<ReturnType<AiService['chatCompletionWithTools']>>;

const UNAVAILABLE_MESSAGE = 'The AI designer is temporarily unavailable — try again in a minute';

// Redis (the lock or the hourly counter) could not be reached.
function unavailableError(): HttpException {
  return new ServiceUnavailableException({ code: 'DESIGNER_UNAVAILABLE', message: UNAVAILABLE_MESSAGE });
}

function timeoutError(): HttpException {
  return new HttpException({ code: 'DESIGNER_TIMEOUT', message: TIMEOUT_MESSAGE }, HttpStatus.BAD_REQUEST);
}

// One designer turn: the client's message, the model's tool calls on the
// template (client's own key only), the checked result saved as a version.
// Nothing is saved — not even the client's message — unless the turn ends
// well: a provider error or the deadline leaves the template and chat as
// they were.
@Injectable()
export class EmailDesignerService {
  private readonly logger = new Logger(EmailDesignerService.name);
  /** The turn deadline; a field so tests can shorten it. */
  turnTimeoutMs = TURN_TIMEOUT_MS;
  private warnedNoRedis = false;

  constructor(
    @InjectRepository(EmailTemplate) private readonly templates: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateAiMessage) private readonly messages: Repository<EmailTemplateAiMessage>,
    private readonly ai: AiService,
    private readonly versions: TemplateVersionService,
    private readonly memory: BrandMemoryService,
    private readonly images: EmailImageService,
    private readonly content: CampaignContentService,
    private readonly lock: RedisLockService,
    @Optional() @Inject(REDIS_THROTTLER_CLIENT) private readonly redis?: Redis | null,
  ) {}

  // The route sits behind the add-on guard, so answering at all means the add-on is on.
  async status(tenantId: number) {
    const m = await this.ai.clientModel(tenantId);
    return { addon: true, hasKey: !!m, provider: m?.provider ?? null, model: m?.model ?? null, modelOk: m ? isDesignModel(m.model) : false };
  }

  async history(tenantId: number, templateId: number) {
    await this.template(tenantId, templateId);
    const rows = await this.messages.find({ where: { tenantId, templateId }, order: { id: 'ASC' } });
    return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, versionId: r.versionId, createdAt: r.createdAt }));
  }

  async send(tenantId: number, templateId: number, input: DesignerInput): Promise<DesignerResult> {
    await this.template(tenantId, templateId);
    const imageUrls = await this.ownImages(tenantId, input.imageUrls);
    if (!(await this.ai.hasClientKey(tenantId))) {
      throw new BadRequestException({ code: 'NO_AI_KEY', message: 'Add your AI key in Settings → AI to use the designer.' });
    }
    const outcome = await this.lock.withLock(`email-designer:${templateId}`, LOCK_TTL_MS, async () => {
      try {
        await this.countTurn(tenantId);
      } catch (err) {
        if (err instanceof HttpException) throw err;
        this.logger.error(`Designer hourly counter failed (tenant=${tenantId}): ${(err as Error).message}`);
        throw unavailableError();
      }
      // Reloaded inside the lock: the turn starts from the latest saved design.
      return this.turn(tenantId, await this.template(tenantId, templateId), { message: input.message, imageUrls });
    });
    if (outcome.error) throw unavailableError();
    if (!outcome.acquired) throw new ConflictException({ code: 'DESIGNER_BUSY', message: 'The designer is still working on this template.' });
    return outcome.result!;
  }

  private async template(tenantId: number, templateId: number): Promise<EmailTemplate> {
    const t = await this.templates.findOne({ where: { id: templateId, tenantId } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  // Picked images must be in this client's own library (any scheme, so a
  // local http://localhost upload works too).
  private async ownImages(tenantId: number, urls: string[] | undefined): Promise<string[]> {
    const wanted = [...new Set((urls ?? []).map((u) => String(u).trim()).filter(Boolean))];
    if (!wanted.length) return [];
    if (wanted.length > MAX_IMAGES) throw new BadRequestException({ code: 'IMAGE_UNKNOWN', message: `Pick at most ${MAX_IMAGES} images.` });
    const own = new Set((await this.images.list(tenantId)).images.map((i) => i.url));
    if (wanted.some((u) => !own.has(u))) {
      throw new BadRequestException({ code: 'IMAGE_UNKNOWN', message: 'Pick images from your image library.' });
    }
    return wanted;
  }

  private async countTurn(tenantId: number): Promise<void> {
    if (!this.redis) {
      if (!this.warnedNoRedis) this.logger.warn('No Redis client: the email designer hourly limit is not enforced.');
      this.warnedNoRedis = true;
      return;
    }
    // One hour-bucket key; INCR and EXPIRE in one MULTI so it can never be left without a TTL.
    const key = `email-designer:${tenantId}:${new Date().toISOString().slice(0, 13)}`;
    const res = await this.redis.multi().incr(key).expire(key, 3600).exec();
    const [incrErr, count] = res?.[0] ?? [null, 0];
    if (incrErr) throw incrErr;
    const n = Number(count);
    if (n > HOURLY_LIMIT) {
      throw new HttpException({ code: 'DESIGNER_RATE_LIMIT', message: `You can send ${HOURLY_LIMIT} design messages per hour. Please wait a little.` }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // One model call, raced against what is left of the turn deadline.
  // The tools go on every round: Anthropic refuses a history holding tool
  // calls/results when the request has no tools.
  private async call(tenantId: number, templateId: number, messages: ChatMessage[], deadline: number): Promise<ToolsReply> {
    const left = deadline - Date.now();
    if (left <= 0) throw timeoutError();
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError()), left);
    });
    try {
      // The provider gives up before our deadline and does not retry, so a
      // slow first try can't run on past the 90 s turn.
      const timeoutMs = Math.max(MIN_CALL_MS, left - CALL_MARGIN_MS);
      const request = this.ai.chatCompletionWithTools(tenantId, messages, DESIGNER_TOOLS, { temperature: 0.4, maxTokens: 16000, timeoutMs, maxRetries: 0 });
      return await Promise.race([request, expired]);
    } catch (err) {
      if ((err as HttpException)?.getResponse?.() && ((err as HttpException).getResponse() as { code?: string }).code === 'DESIGNER_TIMEOUT') {
        this.logger.warn(`Designer turn timed out (tenant=${tenantId}, template=${templateId})`);
        throw err;
      }
      const message = err instanceof HttpException ? this.plainMessage(err) : 'The AI could not be reached. Try again.';
      this.logger.warn(`Designer AI failed (tenant=${tenantId}, template=${templateId}): ${(err as Error).message}`);
      throw new BadRequestException({ code: 'DESIGNER_FAILED', message });
    } finally {
      clearTimeout(timer);
    }
  }

  // The provider's own wording (bad key, no credit, Anthropic workspace).
  private plainMessage(err: HttpException): string {
    const r = err.getResponse();
    const m = typeof r === 'string' ? r : (r as { message?: unknown }).message;
    return typeof m === 'string' && m ? m : 'The AI could not be reached. Try again.';
  }

  private async turn(tenantId: number, template: EmailTemplate, input: { message: string; imageUrls: string[] }): Promise<DesignerResult> {
    const deadline = Date.now() + this.turnTimeoutMs;
    const userText = input.imageUrls.length ? `${input.message}\n\nImages to use:\n${input.imageUrls.join('\n')}` : input.message;
    const past = await this.messages.find({ where: { tenantId, templateId: template.id }, order: { id: 'DESC' }, take: HISTORY });

    const ctx = await this.content.context(tenantId, []);
    const notes = await this.memory.get(tenantId);
    const before = { html: template.bodyHtml || '', subject: template.subject || '' };
    const state: DesignState = { html: before.html, subject: before.subject, notes: [], changed: false };
    const system = designerSystemPrompt({
      agency: ctx.agency, color: ctx.color, hasLogo: !!ctx.agencyInfo.logo, phone: ctx.agencyInfo.phone ?? '', email: ctx.agencyInfo.email ?? '',
      website: ctx.agencyInfo.website ?? '', notes, language: ctx.defaultLang, currentHtml: state.html, currentSubject: state.subject,
    });
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...past.reverse().map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content: userText },
    ];

    let reply = '';
    let triedDesign = false;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const last = round === MAX_ROUNDS - 1;
      const res = await this.call(tenantId, template.id, messages, deadline);
      // Tool calls on the last round are not run: the turn ends with what it has.
      if (res.toolCalls.length && !last) {
        messages.push({ role: 'assistant', content: res.content ?? null, tool_calls: res.toolCalls });
        for (const call of res.toolCalls) {
          if (DESIGN_TOOLS.has(call.function.name)) triedDesign = true;
          messages.push({ role: 'tool', content: runDesignerTool(state, call.function.name, call.function.arguments), tool_call_id: call.id });
        }
        continue;
      }
      reply = (res.content || '').trim();
      break;
    }
    if (Date.now() > deadline) throw timeoutError();

    const final = checkTemplate(state.html);
    const subject = state.subject || template.subject || template.name;
    const changed = state.changed && !final.errors.length && (final.html !== before.html || subject !== before.subject);
    // Tools tried but nothing saved (refused, or the result equals the original): say so.
    if ((triedDesign || state.changed) && !changed) reply = COULD_NOT_APPLY;
    if (!reply) reply = changed ? UPDATED : COULD_NOT_APPLY;
    reply = capReply(reply);

    return this.persist(tenantId, template, { changed, html: final.html, subject, layout: !!state.layoutApplied, notes: state.notes, userText, reply, warnings: final.warnings });
  }

  // Template, version and the two chat rows are one transaction, so a failed
  // write saves none of them. Image use and brand notes follow the commit.
  private async persist(
    tenantId: number,
    template: EmailTemplate,
    r: { changed: boolean; html: string; subject: string; layout: boolean; notes: string[]; userText: string; reply: string; warnings: string[] },
  ): Promise<DesignerResult> {
    const versionId = await this.templates.manager.transaction(async (em) => {
      let id: number | null = null;
      if (r.changed) {
        // Only the two fields the designer owns; whatever else changed meanwhile stays.
        await em.getRepository(EmailTemplate).update({ id: template.id, tenantId }, { bodyHtml: r.html, subject: r.subject });
        const source: VersionSource = r.layout ? 'layout' : 'ai';
        const v = await this.versions.record(tenantId, template.id, { bodyHtml: r.html, subject: r.subject, source }, em);
        id = v?.id ?? null;
      }
      const chat = em.getRepository(EmailTemplateAiMessage);
      await chat.save(chat.create({ tenantId, templateId: template.id, role: 'user', content: r.userText, versionId: null }));
      await chat.save(chat.create({ tenantId, templateId: template.id, role: 'assistant', content: r.reply, versionId: id }));
      return id;
    });
    if (r.changed) {
      template.bodyHtml = r.html;
      template.subject = r.subject;
      await this.images.touch(tenantId, r.html);
    }
    if (r.notes.length) await this.memory.add(tenantId, r.notes);
    return { reply: r.reply, changed: r.changed, versionId, bodyHtml: template.bodyHtml, subject: template.subject, warnings: r.warnings };
  }
}
