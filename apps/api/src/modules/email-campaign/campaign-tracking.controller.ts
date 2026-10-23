import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { CampaignTrackingService } from './campaign-tracking.service';
import { unsubscribePage } from '../lead/buyer/housekeeping/unsubscribe-page';

// 1×1 transparent GIF.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const EXPIRED = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not available</title></head>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#334155;text-align:center"><h1 style="font-size:20px">This link is no longer available</h1><p>Please contact the agency that sent you the email.</p></body></html>`;

// The links inside campaign emails. Public: the recipient's mail client
// calls them. Tokens are signed send ids (+ listing id); redirect targets
// are built here from the listing, never read from the URL.
@Controller('api/e')
export class CampaignTrackingController {
  constructor(private readonly tracking: CampaignTrackingService) {}

  @Public()
  @Get('o/:token')
  async open(@Param('token') token: string, @Res() res: Response): Promise<void> {
    await this.tracking.open(String(token).replace(/\.gif$/i, '')).catch(() => undefined);
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Length', String(PIXEL.length));
    res.end(PIXEL);
  }

  @Public()
  @Get('c/:token')
  async click(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const url = await this.tracking.click(String(token)).catch(() => null);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (url) {
      res.redirect(302, url);
      return;
    }
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(EXPIRED);
  }

  // GET only shows the question (mail scanners open links); the button
  // POSTs back. A POST without a form body is the one-click unsubscribe
  // of the List-Unsubscribe-Post header (RFC 8058).
  @Public()
  @Get('u/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribeAsk(@Param('token') token: string, @Res() res: Response): Promise<void> {
    await this.unsubscribe(token, null, res);
  }

  @Public()
  @Post('u/:token')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async unsubscribeDo(@Param('token') token: string, @Body('action') action: string, @Res() res: Response): Promise<void> {
    await this.unsubscribe(token, action === 'subscribe' ? 'subscribe' : 'unsubscribe', res);
  }

  private async unsubscribe(token: string, action: 'subscribe' | 'unsubscribe' | null, res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const info = await this.tracking
      .unsubscribe(String(token), action === null ? null : action === 'subscribe')
      .catch(() => null);
    if (!info) {
      res.status(404).end(EXPIRED);
      return;
    }
    const state = action === null ? (info.subscribed ? 'ask' : 'unsubscribed') : action === 'subscribe' ? 'subscribed' : 'unsubscribed';
    res.status(200).end(unsubscribePage({ agency: info.agency, color: info.color, lang: info.lang, state }));
  }
}
