// The agent's notice of a buyer's likes and rejects on their page, batched
// (one email per buyer per 10 minutes). English, like the dashboard.

export interface FeedbackItem {
  propertyId: number;
  reference: string;
  title: string;
  action: 'like' | 'reject' | 'clear';
  reason?: string | null;
  at: Date;
}

const WORDS: Record<FeedbackItem['action'], string> = {
  like: 'Liked',
  reject: 'Not for me',
  clear: 'Took back their reaction',
};

// One line per property, its latest reaction; items come oldest first.
export function noticeLines(items: FeedbackItem[]): string[] {
  const latest = new Map<number, FeedbackItem>();
  for (const it of [...items].sort((a, b) => +a.at - +b.at)) {
    latest.delete(it.propertyId);
    latest.set(it.propertyId, it);
  }
  return [...latest.values()]
    .sort((a, b) => a.propertyId - b.propertyId)
    .map((it) => {
      const name = it.title ? `${it.title} (${it.reference})` : it.reference;
      const reason = it.action === 'reject' && it.reason?.trim() ? ` — “${it.reason.trim()}”` : '';
      return `${WORDS[it.action]}: ${name}${reason}`;
    });
}
