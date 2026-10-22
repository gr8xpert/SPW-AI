import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { conversion, expectedRevenue, funnel, median, monthKeys, sourceSeries, stageProbabilities, type ReportStage } from './reports';

// The agency dashboard (milestone J, managers): new buyers per source per
// month, the funnel, results per agent and expected revenue.

// Activities that count as the agent answering a buyer.
const RESPONSES = ['call', 'email', 'sms', 'meeting', 'note', 'suggestion_sent', 'viewing_planned'];

export interface BuyerReport {
  months: string[];
  sources: string[];
  series: Record<string, string | number>[];
  funnel: { stages: { stageId: number; name: string; count: number }[]; won: number; lost: number };
  agents: {
    agentId: number | null;
    name: string | null;
    buyers: number;
    won: number;
    lost: number;
    wonValue: number;
    conversion: number | null;
    medianResponseHours: number | null;
  }[];
  expectedRevenue: number;
  openValue: number;
  probabilities: { stageId: number; name: string; probability: number }[];
}

const nameEn = (n: unknown): string => {
  if (!n) return '';
  if (typeof n === 'string') {
    try {
      return nameEn(JSON.parse(n));
    } catch {
      return n;
    }
  }
  const o = n as Record<string, string>;
  return o.en || Object.values(o).find(Boolean) || '';
};

@Injectable()
export class BuyerReportsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async report(tenantId: number, months = 12, now = new Date()): Promise<BuyerReport> {
    const tenant: { settings: string | TenantSettings | null }[] = await this.db.query('SELECT settings FROM tenants WHERE id = ?', [tenantId]);
    const settings = ((typeof tenant[0]?.settings === 'string' ? JSON.parse(tenant[0].settings) : tenant[0]?.settings) || {}) as TenantSettings;
    const tz = settings.timezone || 'UTC';
    const keys = monthKeys(now, months, tz);
    // A day of slack for the time zone; rows outside the months are dropped by key.
    const since = new Date(Date.UTC(Number(keys[0].slice(0, 4)), Number(keys[0].slice(5)) - 1, 1) - 86_400_000);
    const monthOf = (d: Date) => {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).formatToParts(d);
      return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
    };

    const stageRows: { id: number; name: unknown; sortOrder: number; kind: ReportStage['kind']; probability: number | null }[] = await this.db.query(
      'SELECT id, name, sortOrder, kind, probability FROM buyer_stages WHERE tenantId = ? ORDER BY sortOrder, id',
      [tenantId],
    );
    const stages: ReportStage[] = stageRows.map((s) => ({ id: s.id, name: nameEn(s.name), sortOrder: s.sortOrder, kind: s.kind, probability: s.probability === null ? null : Number(s.probability) }));
    // Every language's name of a stage → its English name, for the history.
    const anyName = new Map<string, string>();
    stageRows.forEach((s) => {
      const names = typeof s.name === 'string' ? (() => { try { return JSON.parse(s.name as string); } catch { return { en: s.name }; } })() : (s.name as Record<string, string>) || {};
      Object.values(names as Record<string, string>).forEach((n) => n && anyName.set(String(n).toLowerCase(), nameEn(s.name)));
    });

    const buyers: { id: number; source: string; createdAt: Date; stageId: number | null; assignedTo: number | null; dealValue: string | null; wonAmount: string | null; firstResponse: Date | null }[] =
      await this.db.query(
        `SELECT l.id, l.source, l.createdAt, l.stageId, l.assignedTo, l.dealValue, l.wonAmount,
           (SELECT MIN(a.createdAt) FROM lead_activities a WHERE a.leadId = l.id AND a.userId IS NOT NULL AND a.type IN (?)) AS firstResponse
         FROM leads l
         WHERE l.tenantId = ? AND l.mergedIntoId IS NULL AND l.contactId IS NOT NULL AND l.createdAt >= ?`,
        [RESPONSES, tenantId, since],
      );
    const inWindow = buyers.filter((b) => keys.includes(monthOf(new Date(b.createdAt))));

    const { sources, series } = sourceSeries(
      keys,
      inWindow.map((b) => ({ month: monthOf(new Date(b.createdAt)), source: b.source || 'manual', n: 1 })),
    );

    const history = new Map<number, string[]>();
    if (inWindow.length) {
      const changes: { leadId: number; changes: unknown }[] = await this.db.query(
        `SELECT leadId, changes FROM lead_changes WHERE tenantId = ? AND leadId IN (?) AND JSON_CONTAINS(changes, JSON_OBJECT('field', 'stage'))`,
        [tenantId, inWindow.map((b) => b.id)],
      );
      for (const c of changes) {
        const items = (typeof c.changes === 'string' ? JSON.parse(c.changes) : c.changes) as { field: string; from: string | null; to: string | null }[];
        for (const it of items) {
          if (it.field !== 'stage') continue;
          for (const n of [it.from, it.to]) {
            const en = n ? anyName.get(n.toLowerCase()) : undefined;
            if (en) history.set(c.leadId, [...(history.get(c.leadId) ?? []), en]);
          }
        }
      }
    }
    const f = funnel(stages, inWindow.map((b) => ({ stageId: b.stageId, history: history.get(b.id) ?? [] })));

    const kindOf = new Map(stages.map((s) => [s.id, s.kind]));
    const byAgent = new Map<number | null, typeof inWindow>();
    inWindow.forEach((b) => byAgent.set(b.assignedTo, [...(byAgent.get(b.assignedTo) ?? []), b]));
    const agentIds = [...byAgent.keys()].filter((id): id is number => !!id);
    const names: { id: number; name: string | null; email: string }[] = agentIds.length
      ? await this.db.query('SELECT id, name, email FROM users WHERE id IN (?)', [agentIds])
      : [];
    const agents = [...byAgent.entries()]
      .map(([agentId, list]) => {
        const won = list.filter((b) => b.stageId && kindOf.get(b.stageId) === 'won');
        const lost = list.filter((b) => b.stageId && kindOf.get(b.stageId) === 'lost').length;
        const u = names.find((n) => n.id === agentId);
        const hours = list.filter((b) => b.firstResponse).map((b) => (+new Date(b.firstResponse!) - +new Date(b.createdAt)) / 3_600_000);
        const med = median(hours.map((h) => Math.max(0, h)));
        return {
          agentId,
          name: u ? u.name || u.email : null,
          buyers: list.length,
          won: won.length,
          lost,
          wonValue: Math.round(won.reduce((s, b) => s + Number(b.wonAmount ?? b.dealValue ?? 0), 0)),
          conversion: conversion(won.length, lost),
          medianResponseHours: med === null ? null : Math.round(med * 10) / 10,
        };
      })
      .sort((a, b) => b.buyers - a.buyers);

    // Expected revenue: every open buyer, not only this window's.
    const open: { stageId: number; dealValue: string }[] = await this.db.query(
      `SELECT l.stageId, l.dealValue FROM leads l JOIN buyer_stages s ON s.id = l.stageId
       WHERE l.tenantId = ? AND l.mergedIntoId IS NULL AND l.erasedAt IS NULL AND s.kind = 'open' AND l.dealValue > 0`,
      [tenantId],
    );
    const probabilities = stageProbabilities(stages);
    return {
      months: keys,
      sources,
      series,
      funnel: f,
      agents,
      expectedRevenue: expectedRevenue(open.map((o) => ({ stageId: o.stageId, dealValue: Number(o.dealValue) })), probabilities),
      openValue: Math.round(open.reduce((s, o) => s + Number(o.dealValue), 0)),
      probabilities: stages.map((s) => ({ stageId: s.id, name: s.name, probability: probabilities.get(s.id)! })),
    };
  }
}
