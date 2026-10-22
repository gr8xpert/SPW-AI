import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BuyerQuestion, BuyerQuestionOption, Lead } from '../../../database/entities';
import { DEFAULT_QUESTIONS, cleanAnswers, questionKey } from './buyer-question-defaults';
import { cleanTranslations, firstText } from './translations';
import { CreateQuestionDto, QuestionOptionDto, UpdateQuestionDto } from './dto/buyer-follow-up.dto';

@Injectable()
export class BuyerQuestionService {
  constructor(
    @InjectRepository(BuyerQuestion)
    private readonly questionRepository: Repository<BuyerQuestion>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
  ) {}

  // The tenant's questions in order; seeded with the defaults on first use.
  async list(tenantId: number): Promise<BuyerQuestion[]> {
    const found = await this.findAll(tenantId);
    if (found.length) return found;
    await this.questionRepository
      .createQueryBuilder()
      .insert()
      .values(
        DEFAULT_QUESTIONS.map((q, i) => ({
          tenantId,
          qkey: q.qkey,
          label: q.label,
          options: q.options,
          multiple: q.multiple,
          showOnForm: true,
          isActive: true,
          sortOrder: i,
        })),
      )
      .orIgnore() // two first requests at once: the unique key keeps one copy
      .execute();
    return this.findAll(tenantId);
  }

  private async findAll(tenantId: number): Promise<BuyerQuestion[]> {
    const rows = await this.questionRepository.find({ where: { tenantId }, order: { sortOrder: 'ASC', id: 'ASC' } });
    // MySQL tinyint → boolean.
    return rows.map((q) => Object.assign(q, { multiple: !!q.multiple, showOnForm: !!q.showOnForm, isActive: !!q.isActive }));
  }

  async create(tenantId: number, dto: CreateQuestionDto): Promise<BuyerQuestion> {
    const existing = await this.list(tenantId);
    const label = cleanTranslations(dto.label, 150, 'A question');
    const base = questionKey(firstText(label)) || 'question';
    const taken = new Set(existing.map((q) => q.qkey));
    let qkey = base;
    for (let n = 2; taken.has(qkey); n++) qkey = `${base.slice(0, 56)}_${n}`;
    const saved = await this.questionRepository.save(
      this.questionRepository.create({
        tenantId,
        qkey,
        label,
        options: this.cleanOptions(dto.options, []),
        multiple: !!dto.multiple,
        showOnForm: dto.showOnForm ?? true,
        isActive: dto.isActive ?? true,
        sortOrder: existing.length ? Math.max(...existing.map((q) => q.sortOrder)) + 1 : 0,
      }),
    );
    return this.get(tenantId, saved.id);
  }

  async update(tenantId: number, id: number, dto: UpdateQuestionDto): Promise<BuyerQuestion> {
    const q = await this.get(tenantId, id);
    const patch: Partial<BuyerQuestion> = {};
    if (dto.label !== undefined) patch.label = cleanTranslations(dto.label, 150, 'A question');
    if (dto.options !== undefined) patch.options = this.cleanOptions(dto.options, q.options);
    if (dto.multiple !== undefined) patch.multiple = dto.multiple;
    if (dto.showOnForm !== undefined) patch.showOnForm = dto.showOnForm;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (Object.keys(patch).length) await this.questionRepository.update({ id, tenantId }, patch);

    // Removed options, or a switch to single choice: tidy the stored answers.
    if (patch.options || patch.multiple === false) {
      const next = await this.get(tenantId, id);
      await this.rewriteAnswers(tenantId, q.qkey, (answers) => cleanAnswers([next], answers)[q.qkey]);
    }
    return this.get(tenantId, id);
  }

  async reorder(tenantId: number, ids: number[]): Promise<BuyerQuestion[]> {
    const rows = await this.questionRepository.find({ where: { tenantId, id: In(ids) }, select: ['id'] });
    if (rows.length !== new Set(ids).size) throw new BadRequestException('Unknown question');
    for (const [i, id] of ids.entries()) await this.questionRepository.update({ id, tenantId }, { sortOrder: i });
    return this.list(tenantId);
  }

  // Deleting a question also removes its answers from every buyer.
  async remove(tenantId: number, id: number): Promise<void> {
    const q = await this.get(tenantId, id);
    await this.rewriteAnswers(tenantId, q.qkey, () => undefined);
    await this.questionRepository.delete({ id, tenantId });
  }

  async get(tenantId: number, id: number): Promise<BuyerQuestion> {
    const q = await this.questionRepository.findOne({ where: { id, tenantId } });
    if (!q) throw new NotFoundException('Question not found');
    return Object.assign(q, { multiple: !!q.multiple, showOnForm: !!q.showOnForm, isActive: !!q.isActive });
  }

  // Answers from the dashboard → stored form (only known questions/options).
  async clean(tenantId: number, raw: Record<string, unknown>): Promise<Record<string, string[]>> {
    return cleanAnswers(await this.list(tenantId), raw);
  }

  // Options keep the keys they had. A new option gets a key from its label
  // that no option of this question ever had, so old answers to a removed
  // option can never turn into answers to a new one.
  private cleanOptions(options: QuestionOptionDto[], previous: BuyerQuestionOption[]): BuyerQuestionOption[] {
    const known = new Set(previous.map((p) => p.key));
    const used = new Set<string>();
    const out: BuyerQuestionOption[] = [];
    for (const opt of options) {
      const label = cleanTranslations(opt.label, 150, 'An option');
      let key = opt.key && known.has(opt.key) && !used.has(opt.key) ? opt.key : '';
      if (!key) {
        const base = questionKey(firstText(label)) || 'option';
        key = base;
        for (let n = 2; used.has(key) || known.has(key); n++) key = `${base.slice(0, 56)}_${n}`;
      }
      used.add(key);
      out.push({ key, label });
    }
    return out;
  }

  // Applies fn to answers[qkey] on every buyer that has one; undefined
  // removes the key.
  private async rewriteAnswers(
    tenantId: number,
    qkey: string,
    fn: (answers: Record<string, string[]>) => string[] | undefined,
  ): Promise<void> {
    const leads = await this.leadRepository
      .createQueryBuilder('lead')
      .select(['lead.id', 'lead.answers'])
      .where('lead.tenantId = :tenantId', { tenantId })
      .andWhere('JSON_CONTAINS_PATH(lead.answers, \'one\', :path) = 1', { path: `$."${qkey}"` })
      .getMany();
    for (const lead of leads) {
      const answers = { ...(lead.answers || {}) };
      const next = fn(answers);
      if (next && next.length) answers[qkey] = next;
      else delete answers[qkey];
      await this.leadRepository
        .createQueryBuilder()
        .update()
        .set({ answers: Object.keys(answers).length ? answers : null, updatedAt: () => 'updatedAt' } as never)
        .where('id = :id', { id: lead.id })
        .execute();
    }
  }
}
