import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { FILL_QUEUE, FillStatus, TranslationMemoryFillService } from './translation-memory-fill.service';

// One fill at a time, in whichever API process picks it up.
@Processor(FILL_QUEUE, { concurrency: 1, lockDuration: 120_000 })
export class TranslationMemoryFillProcessor extends WorkerHost {
  constructor(private readonly fill: TranslationMemoryFillService) {
    super();
  }

  async process(job: Job<{ languages: string[] }>): Promise<Partial<FillStatus>> {
    return this.fill.run(job.data.languages || [], (s) => job.updateProgress({ ...s }));
  }
}
