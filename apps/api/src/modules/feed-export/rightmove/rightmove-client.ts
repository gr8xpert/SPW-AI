import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { Agent, request } from 'https';

// Rightmove's Real Time Datafeed. Every call is a JSON POST over mutual TLS:
// Rightmove only accepts the certificate they issued to the feed provider
// (SPM), so there are no keys per client — just the network/branch IDs.
//
// .env:
//   RIGHTMOVE_CERT_PATH        .p12/.pfx keystore, or a PEM certificate
//   RIGHTMOVE_KEY_PATH         PEM private key (only when separate from the cert)
//   RIGHTMOVE_CERT_PASSPHRASE  keystore / key passphrase
//   RIGHTMOVE_API_BASE         defaults to the live API; set to the test URL
//                              Rightmove gives for the test cycle
//
// Without a certificate the client runs dry: nothing leaves SPM, the sync
// still builds and logs every payload.

export interface RmMessage {
  code: string;
  description: string;
  value?: string | null;
}

export interface RmResponse {
  ok: boolean;
  httpStatus: number;
  message: string;
  requestId: string | null;
  rightmoveId: string | null;
  rightmoveUrl: string | null;
  changeType: string | null;
  errors: RmMessage[];
  warnings: RmMessage[];
  // GetBranchPropertyList only.
  properties?: Array<{ agentRef: string; rightmoveId: string; updateDate: string | null }>;
  ms: number;
}

const DEFAULT_BASE = 'https://adfapi.rightmove.co.uk';
const TIMEOUT_MS = 60_000;

@Injectable()
export class RightmoveClient {
  private readonly logger = new Logger(RightmoveClient.name);
  private agent: Agent | null | undefined;
  private readonly base: string;

  constructor(private readonly config: ConfigService) {
    this.base = (this.config.get<string>('RIGHTMOVE_API_BASE') || DEFAULT_BASE).replace(/\/$/, '');
  }

  // False = dry run (no certificate configured, or it can't be read).
  get isLive(): boolean {
    return this.getAgent() !== null;
  }

  get apiBase(): string {
    return this.base;
  }

  sendProperty(body: Record<string, unknown>): Promise<RmResponse> {
    return this.call('/v1/property/overseassendpropertydetails', body);
  }

  removeProperty(body: Record<string, unknown>): Promise<RmResponse> {
    return this.call('/v1/property/removeproperty', body);
  }

  branchPropertyList(body: Record<string, unknown>): Promise<RmResponse> {
    return this.call('/v1/property/getbranchpropertylist', body);
  }

  private getAgent(): Agent | null {
    if (this.agent !== undefined) return this.agent;
    const certPath = this.config.get<string>('RIGHTMOVE_CERT_PATH');
    if (!certPath) return (this.agent = null);
    try {
      const passphrase = this.config.get<string>('RIGHTMOVE_CERT_PASSPHRASE') || undefined;
      const keyPath = this.config.get<string>('RIGHTMOVE_KEY_PATH');
      const cert = readFileSync(certPath);
      const common = { keepAlive: true, maxSockets: 2, minVersion: 'TLSv1.2' as const, passphrase };
      this.agent = /\.(p12|pfx)$/i.test(certPath)
        ? new Agent({ ...common, pfx: cert })
        : new Agent({ ...common, cert, key: keyPath ? readFileSync(keyPath) : cert });
      this.logger.log(`Rightmove certificate loaded — pushing to ${this.base}`);
    } catch (err) {
      this.logger.error(`Rightmove certificate could not be read (${certPath}) — running dry`, err as Error);
      this.agent = null;
    }
    return this.agent;
  }

  private async call(path: string, body: Record<string, unknown>, attempt = 1): Promise<RmResponse> {
    const agent = this.getAgent();
    if (!agent) throw new Error('Rightmove certificate is not configured');
    const started = Date.now();
    const data = JSON.stringify(body);
    try {
      const { status, text } = await post(`${this.base}${path}`, data, agent);
      const res = parseResponse(status, text, Date.now() - started);
      // Rightmove's side hiccuped: try twice more before giving up.
      if (status >= 500 && attempt < 3) {
        await sleep(attempt * 5000);
        return this.call(path, body, attempt + 1);
      }
      return res;
    } catch (err) {
      if (attempt < 3) {
        await sleep(attempt * 5000);
        return this.call(path, body, attempt + 1);
      }
      return {
        ok: false,
        httpStatus: 0,
        message: `Could not reach Rightmove: ${(err as Error).message}`,
        requestId: null,
        rightmoveId: null,
        rightmoveUrl: null,
        changeType: null,
        errors: [{ code: 'NETWORK', description: (err as Error).message }],
        warnings: [],
        ms: Date.now() - started,
      };
    }
  }
}

function post(url: string, data: string, agent: Agent): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timed out after ${TIMEOUT_MS / 1000}s`)));
    req.on('error', reject);
    req.end(data);
  });
}

// Rightmove answers in snake_case: { request_id, message, success, property:
// { agent_ref, rightmove_id, rightmove_url, change_type }, errors, warnings }.
export function parseResponse(status: number, text: string, ms: number): RmResponse {
  let json: Record<string, any> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  const messages = (list: unknown, kind: 'error' | 'warning'): RmMessage[] =>
    Array.isArray(list)
      ? list.map((m: Record<string, any>) => ({
          code: String(m?.[`${kind}_code`] ?? ''),
          description: String(m?.[`${kind}_description`] ?? ''),
          value: m?.[`${kind}_value`] ?? null,
        }))
      : [];
  const prop = Array.isArray(json.property) ? null : json.property;
  const out: RmResponse = {
    ok: status >= 200 && status < 300 && json.success === true,
    httpStatus: status,
    message: String(json.message ?? (text ? text.slice(0, 300) : `HTTP ${status}`)),
    requestId: json.request_id ?? null,
    rightmoveId: prop?.rightmove_id != null ? String(prop.rightmove_id) : null,
    rightmoveUrl: prop?.rightmove_url ?? null,
    changeType: prop?.change_type ?? null,
    errors: messages(json.errors, 'error'),
    warnings: messages(json.warnings, 'warning'),
    ms,
  };
  if (Array.isArray(json.property)) {
    out.properties = json.property.map((p: Record<string, any>) => ({
      agentRef: String(p.agent_ref ?? ''),
      rightmoveId: String(p.rightmove_id ?? ''),
      updateDate: p.update_date ?? null,
    }));
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
