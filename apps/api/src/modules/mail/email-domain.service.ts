import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateKeyPairSync } from 'crypto';
import { promises as dns } from 'dns';
import { TenantEmailDomain } from '../../database/entities';

// 5R — sender-domain verification. The happy path:
//   1. Tenant POSTs {domain: "mail.theirclient.com"} — we generate an
//      RSA-2048 DKIM keypair and persist the row.
//   2. Tenant GETs — we return the three TXT records they must add
//      (SPF, DKIM, DMARC) with the exact values their DNS host expects.
//   3. Tenant clicks Verify — we resolve each record and stamp the
//      *VerifiedAt column if the resolved text contains what we expect.
//
// No auto-reverification: once a record is stamped "verified", it stays
// that way until the tenant re-triggers verification. This is deliberate
// — we don't want a transient DNS blip to revoke a tenant's sender
// reputation mid-campaign.

// Expected SPF include is operator-configurable. We inject the operator's
// own sending host here; receivers then resolve
//   <tenant-domain>.  IN TXT   v=spf1 include:<MAIL_SPF_INCLUDE> ~all
// which authorizes our outbound IPs.
const DEFAULT_SPF_INCLUDE =
  process.env.MAIL_SPF_INCLUDE || 'mail.smartpropertywidget.com';

const DEFAULT_DMARC_REPORTING_ADDRESS =
  process.env.MAIL_DMARC_REPORT_TO || 'dmarc@smartpropertywidget.com';

export interface EmailDomainRecords {
  spf: { host: string; type: 'TXT'; value: string };
  dkim: { host: string; type: 'TXT'; value: string };
  dmarc: { host: string; type: 'TXT'; value: string };
}

export interface EmailDomainDetail {
  id: number;
  domain: string;
  dkimSelector: string;
  spfVerifiedAt: Date | null;
  dkimVerifiedAt: Date | null;
  dmarcVerifiedAt: Date | null;
  records: EmailDomainRecords;
  // Top-line roll-up for dashboard badge: 'verified' only when all three
  // are stamped; 'partial' when 1–2 are; 'unverified' when none.
  status: 'verified' | 'partial' | 'unverified';
}

export interface VerificationResult {
  spf: { ok: boolean; found: string | null; expected: string };
  dkim: { ok: boolean; found: string | null; expected: string };
  dmarc: { ok: boolean; found: string | null; expected: string };
  status: 'verified' | 'partial' | 'unverified';
}

@Injectable()
export class EmailDomainService {
  private readonly logger = new Logger(EmailDomainService.name);

  constructor(
    @InjectRepository(TenantEmailDomain)
    private readonly repo: Repository<TenantEmailDomain>,
  ) {}

  async getByTenant(tenantId: number): Promise<EmailDomainDetail> {
    const row = await this.repo.findOne({ where: { tenantId } });
    if (!row) {
      throw new NotFoundException('No sender domain configured');
    }
    return this.toDetail(row);
  }

  // Upsert. Creating or changing the domain generates a fresh DKIM
  // keypair — the old keypair is useless once the DKIM TXT record at
  // <oldSelector>._domainkey.<newDomain> doesn't exist.
  async upsert(tenantId: number, domain: string): Promise<EmailDomainDetail> {
    const normalized = this.normalizeDomain(domain);

    const existing = await this.repo.findOne({ where: { tenantId } });
    if (existing && existing.domain === normalized) {
      // Same domain, same keys — treat as idempotent.
      return this.toDetail(existing);
    }

    const keys = this.generateDkimKeypair();
    if (existing) {
      existing.domain = normalized;
      existing.dkimPublicKey = keys.publicKey;
      existing.dkimPrivateKey = keys.privateKey;
      // Reset verification stamps — old DNS records don't apply to the
      // new domain. Forcing re-verification is safer than leaving stale
      // "verified" flags that reference records no longer published.
      existing.spfVerifiedAt = null;
      existing.dkimVerifiedAt = null;
      existing.dmarcVerifiedAt = null;
      const saved = await this.repo.save(existing);
      return this.toDetail(saved);
    }

    const row = this.repo.create({
      tenantId,
      domain: normalized,
      dkimSelector: 'spw1',
      dkimPublicKey: keys.publicKey,
      dkimPrivateKey: keys.privateKey,
      spfVerifiedAt: null,
      dkimVerifiedAt: null,
      dmarcVerifiedAt: null,
    });
    const saved = await this.repo.save(row);
    return this.toDetail(saved);
  }

  async remove(tenantId: number): Promise<void> {
    const row = await this.repo.findOne({ where: { tenantId } });
    if (!row) return; // idempotent
    await this.repo.remove(row);
  }

  // Runs DNS lookups for each record, stamps the *VerifiedAt columns on
  // match, and returns both the aggregate status and per-record diagnostics
  // so the dashboard can show "SPF ok / DKIM missing / DMARC wrong".
  async verify(tenantId: number): Promise<VerificationResult> {
    const row = await this.repo.findOne({ where: { tenantId } });
    if (!row) {
      throw new NotFoundException('No sender domain configured');
    }
    const records = this.buildRecords(row);

    const [spfRes, dkimRes, dmarcRes] = await Promise.all([
      this.checkTxt(records.spf.host, records.spf.value),
      this.checkTxt(records.dkim.host, records.dkim.value),
      this.checkTxt(records.dmarc.host, records.dmarc.value),
    ]);

    const now = new Date();
    if (spfRes.ok) row.spfVerifiedAt = now;
    if (dkimRes.ok) row.dkimVerifiedAt = now;
    if (dmarcRes.ok) row.dmarcVerifiedAt = now;
    await this.repo.save(row);

    return {
      spf: { ...spfRes, expected: records.spf.value },
      dkim: { ...dkimRes, expected: records.dkim.value },
      dmarc: { ...dmarcRes, expected: records.dmarc.value },
      status: this.rollUp(row),
    };
  }

  // --- helpers ------------------------------------------------------------

  private normalizeDomain(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    // Strip any accidental protocol ("https://…") + trailing slashes that
    // tenants typing in a domain field sometimes paste.
    const stripped = trimmed.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    // Very light FQDN sanity check; DNS lookups will do the real work.
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(stripped)) {
      throw new BadRequestException('Domain does not look like a valid FQDN');
    }
    return stripped;
  }

  // RSA-2048 PKCS#8 keypair, base64-encoded-SubjectPublicKeyInfo for the
  // public half (the `p=` value in the DKIM TXT record is exactly that
  // base64 body with the PEM boundary lines stripped).
  private generateDkimKeypair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey, privateKey };
  }

  private buildRecords(row: TenantEmailDomain): EmailDomainRecords {
    const dkimBase64 = row.dkimPublicKey
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '');

    return {
      spf: {
        host: row.domain,
        type: 'TXT',
        value: `v=spf1 include:${DEFAULT_SPF_INCLUDE} ~all`,
      },
      dkim: {
        host: `${row.dkimSelector}._domainkey.${row.domain}`,
        type: 'TXT',
        value: `v=DKIM1; k=rsa; p=${dkimBase64}`,
      },
      dmarc: {
        host: `_dmarc.${row.domain}`,
        type: 'TXT',
        value: `v=DMARC1; p=none; rua=mailto:${DEFAULT_DMARC_REPORTING_ADDRESS}`,
      },
    };
  }

  // Resolves all TXT records at `host` and checks whether any concatenated
  // record matches the expected value. DNS TXT records can be split into
  // multiple strings per record — resolveTxt returns string[][], so we
  // join the inner arrays before comparing.
  private async checkTxt(
    host: string,
    expected: string,
  ): Promise<{ ok: boolean; found: string | null }> {
    try {
      const results = await dns.resolveTxt(host);
      // Look for any record matching exactly; tenants sometimes paste
      // extra whitespace between tokens, so we also try a loose match
      // (normalized whitespace). Exact is tried first so a perfectly-typed
      // record wins even if a looser malformed one exists alongside.
      const joined = results.map((parts) => parts.join(''));
      if (joined.some((r) => r === expected)) {
        return { ok: true, found: expected };
      }
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
      const normalizedExpected = normalize(expected);
      const matchLoose = joined.find(
        (r) => normalize(r) === normalizedExpected,
      );
      if (matchLoose) {
        return { ok: true, found: matchLoose };
      }
      return { ok: false, found: joined[0] ?? null };
    } catch (err) {
      const message = (err as NodeJS.ErrnoException).code || 'DNS_ERROR';
      this.logger.debug(`DNS lookup failed for ${host}: ${message}`);
      return { ok: false, found: null };
    }
  }

  private toDetail(row: TenantEmailDomain): EmailDomainDetail {
    return {
      id: row.id,
      domain: row.domain,
      dkimSelector: row.dkimSelector,
      spfVerifiedAt: row.spfVerifiedAt,
      dkimVerifiedAt: row.dkimVerifiedAt,
      dmarcVerifiedAt: row.dmarcVerifiedAt,
      records: this.buildRecords(row),
      status: this.rollUp(row),
    };
  }

  private rollUp(row: TenantEmailDomain): 'verified' | 'partial' | 'unverified' {
    const stamps = [row.spfVerifiedAt, row.dkimVerifiedAt, row.dmarcVerifiedAt];
    const verified = stamps.filter(Boolean).length;
    if (verified === 3) return 'verified';
    if (verified === 0) return 'unverified';
    return 'partial';
  }
}
