import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import puppeteer, { Browser, Page, PDFOptions } from 'puppeteer';

interface PoolEntry {
  page: Page;
  uses: number;
  busy: boolean;
}

/**
 * Manages a single warm Chrome instance + a small pool of reusable pages so
 * brochure rendering doesn't pay Chromium startup cost (~1.2s) on every PDF
 * download. Pages are recycled after MAX_USES_PER_PAGE renders to bound
 * memory growth from script/image leaks in long-lived contexts.
 */
@Injectable()
export class PuppeteerPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerPoolService.name);
  private browser: Browser | null = null;
  private pool: PoolEntry[] = [];
  private readonly POOL_SIZE = 4;
  private readonly MAX_USES_PER_PAGE = 50;
  private readonly waiters: Array<(entry: PoolEntry) => void> = [];

  async onModuleInit(): Promise<void> {
    await this.launchBrowser();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        this.logger.warn(`Browser close error (ignored): ${(err as Error).message}`);
      }
      this.browser = null;
    }
    this.pool = [];
  }

  private async launchBrowser(): Promise<void> {
    this.logger.log('Launching Puppeteer browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });
    this.logger.log(`Puppeteer browser ready (version: ${await this.browser.version()})`);
  }

  private async acquire(): Promise<PoolEntry> {
    if (!this.browser) await this.launchBrowser();

    // Reuse idle page
    const idle = this.pool.find((e) => !e.busy);
    if (idle) {
      idle.busy = true;
      return idle;
    }

    // Grow pool up to POOL_SIZE
    if (this.pool.length < this.POOL_SIZE) {
      const page = await this.browser!.newPage();
      const entry: PoolEntry = { page, uses: 0, busy: true };
      this.pool.push(entry);
      return entry;
    }

    // All busy — wait for release
    return new Promise<PoolEntry>((resolve) => this.waiters.push(resolve));
  }

  private async release(entry: PoolEntry): Promise<void> {
    entry.uses += 1;

    if (entry.uses >= this.MAX_USES_PER_PAGE) {
      try {
        await entry.page.close();
      } catch {
        // ignore
      }
      this.pool = this.pool.filter((e) => e !== entry);
      // Don't re-create here — next acquire() grows the pool lazily
    } else {
      entry.busy = false;
    }

    const next = this.waiters.shift();
    if (next) {
      // Hand off to a waiter
      let target = this.pool.find((e) => !e.busy);
      if (!target && this.pool.length < this.POOL_SIZE) {
        const page = await this.browser!.newPage();
        target = { page, uses: 0, busy: true };
        this.pool.push(target);
      }
      if (target) {
        target.busy = true;
        next(target);
      } else {
        // Should be unreachable; put waiter back at head
        this.waiters.unshift(next);
      }
    }
  }

  /**
   * Render the given HTML to a PDF Buffer.
   * `pdfOptions` are forwarded to Puppeteer's `page.pdf()` — pass header/footer
   * templates here for branded vs unbranded variants.
   */
  async renderPdf(html: string, pdfOptions: PDFOptions = {}): Promise<Buffer> {
    const entry = await this.acquire();
    try {
      await entry.page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
      const buf = await entry.page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        ...pdfOptions,
      });
      return Buffer.from(buf);
    } finally {
      await this.release(entry);
    }
  }
}
