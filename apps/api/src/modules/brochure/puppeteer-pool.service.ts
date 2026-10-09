import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import puppeteer, { Browser, Page, PDFOptions } from 'puppeteer';

interface PoolEntry {
  page: Page;
  uses: number;
  busy: boolean;
}

/**
 * Manages a single Chrome instance + a small pool of reusable pages so
 * brochure rendering doesn't pay Chromium startup cost (~1.2s) on every PDF
 * download. Pages are recycled after MAX_USES_PER_PAGE renders to bound
 * memory growth from script/image leaks in long-lived contexts.
 *
 * Chrome starts on the first brochure (not at API boot) and closes after
 * IDLE_CLOSE_MS without one. It talks over a pipe, so if Node dies without
 * running onModuleDestroy (SIGKILL, crash) Chrome sees the pipe close and
 * exits too — before 10-08 every API restart left a Chrome behind (500 on prod).
 */
@Injectable()
export class PuppeteerPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerPoolService.name);
  private browser: Browser | null = null;
  private pool: PoolEntry[] = [];
  private readonly POOL_SIZE = 4;
  private readonly MAX_USES_PER_PAGE = 50;
  private readonly IDLE_CLOSE_MS = 10 * 60_000;
  private readonly waiters: Array<(entry: PoolEntry) => void> = [];
  private launching: Promise<Browser> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  // Last resort for exits that skip Nest's shutdown hooks (process.exit, an
  // uncaught error): kill Chrome synchronously.
  private readonly killOnExit = () => {
    this.browser?.process()?.kill('SIGKILL');
  };

  onModuleInit(): void {
    process.once('exit', this.killOnExit);
  }

  async onModuleDestroy(): Promise<void> {
    process.removeListener('exit', this.killOnExit);
    await this.closeBrowser();
  }

  private async closeBrowser(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const browser = this.browser;
    this.browser = null;
    this.pool = [];
    if (!browser) return;
    try {
      await browser.close();
    } catch (err) {
      this.logger.warn(`Browser close error (ignored): ${(err as Error).message}`);
      browser.process()?.kill('SIGKILL');
    }
  }

  // Close Chrome once nothing has rendered for IDLE_CLOSE_MS.
  private scheduleIdleClose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pool.some((e) => e.busy) || this.waiters.length) return this.scheduleIdleClose();
      this.logger.log('Brochure Chrome idle — closing it');
      void this.closeBrowser();
    }, this.IDLE_CLOSE_MS);
    this.idleTimer.unref();
  }

  // One launch at a time: concurrent first requests share the same Chrome.
  private async launchBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (!this.launching) {
      this.launching = this.startChrome().finally(() => {
        this.launching = null;
      });
    }
    return this.launching;
  }

  private async startChrome(): Promise<Browser> {
    this.logger.log('Launching Puppeteer browser...');
    const browser = await puppeteer.launch({
      headless: true,
      pipe: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });
    // A crashed Chrome: forget it and its pages; the next brochure starts a new one.
    browser.on('disconnected', () => {
      if (this.browser === browser) {
        this.browser = null;
        this.pool = [];
      }
    });
    this.browser = browser;
    this.logger.log(`Puppeteer browser ready (version: ${await browser.version()})`);
    return browser;
  }

  private async acquire(): Promise<PoolEntry> {
    const browser = await this.launchBrowser();

    // Reuse idle page
    const idle = this.pool.find((e) => !e.busy);
    if (idle) {
      idle.busy = true;
      return idle;
    }

    // Grow pool up to POOL_SIZE
    if (this.pool.length < this.POOL_SIZE) {
      const page = await browser.newPage();
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
        const browser = await this.launchBrowser();
        const page = await browser.newPage();
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
    this.scheduleIdleClose();
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
