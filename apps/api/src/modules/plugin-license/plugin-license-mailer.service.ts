import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PluginLicense } from '../../database/entities';
import { SystemMailerService } from '../mail/system-mailer.service';
import { pluginPlan } from './plugin-plans';

// The licence key email, sent when a key is issued (super admin or Stripe auto-issue) or replaced.
// The raw key exists only here and in the super admin's one-time view; the database keeps its hash.
@Injectable()
export class PluginLicenseMailer {
  private readonly logger = new Logger(PluginLicenseMailer.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: SystemMailerService,
  ) {}

  /** True when the email was delivered; a failure is logged and the admin can copy the key instead. */
  async sendKey(license: PluginLicense, rawKey: string, opts: { replacement?: boolean } = {}): Promise<boolean> {
    const download = this.config.get<string>('PLUGIN_DOWNLOAD_PAGE_URL') || 'https://realtysoft.eu/en/ai-translator-for-polylang/';
    const planLabel = pluginPlan(license.plan)?.label ?? license.plan;
    const name = license.customerName ? ` ${license.customerName.split(' ')[0]}` : '';
    const sites = `${license.sitesAllowed} ${license.sitesAllowed === 1 ? 'site' : 'sites'}`;
    const intro = opts.replacement
      ? `Here is your new licence key for SPM AI Translator for Polylang (${planLabel}, ${sites}). Your previous key no longer works.`
      : `Thank you for buying SPM AI Translator for Polylang (${planLabel}, ${sites}).`;
    const text = [
      `Hi${name},`,
      '',
      intro,
      '',
      `Your licence key: ${rawKey}`,
      '',
      'To get started:',
      `1. Download the plugin: ${download}`,
      '2. In WordPress, go to Plugins → Add New → Upload Plugin, upload the zip and activate it.',
      '3. The setup wizard opens. Paste your licence key in the first step.',
      '',
      'Keep this email: the key is shown only here. Updates arrive in WordPress automatically while your licence is active.',
      '',
      'RealtySoft',
    ].join('\n');
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
    const html =
      `<p>Hi${esc(name)},</p><p>${esc(intro).replace('SPM AI Translator for Polylang', '<strong>SPM AI Translator for Polylang</strong>')}</p>` +
      `<p>Your licence key:</p><p style="font:600 20px/1.4 monospace;letter-spacing:1px;padding:12px 16px;background:#f3f6f4;border-radius:6px;display:inline-block">${esc(rawKey)}</p>` +
      `<ol><li><a href="${esc(download)}">Download the plugin</a>.</li><li>In WordPress, go to Plugins → Add New → Upload Plugin, upload the zip and activate it.</li><li>The setup wizard opens. Paste your licence key in the first step.</li></ol>` +
      '<p>Keep this email: the key is shown only here. Updates arrive in WordPress automatically while your licence is active.</p><p>RealtySoft</p>';
    const subject = opts.replacement ? 'Your new SPM AI Translator licence key' : 'Your SPM AI Translator licence key';
    const result = await this.mailer.send({ to: license.email, subject, text, html });
    if (!result.delivered) {
      this.logger.error(`plugin licence ${license.id}: key email NOT delivered to ${license.email} (${result.skippedReason ?? 'error'})`);
    }
    return !!result.delivered;
  }
}
