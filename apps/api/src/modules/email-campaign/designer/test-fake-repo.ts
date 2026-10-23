// In-memory stand-in for a TypeORM repository, shared by designer specs.
// Supports equality and `In(...)` `where`, `order: { id }`, `skip`/`take`, update by where, and delete by id array.
//
// Transactions: `manager.transaction(fn)` calls fn with a separate `em`
// whose getRepository returns a transaction view of the repo. Writes made
// through that view are listed in `em.writes`. A write made straight on the
// injected repo while any transaction is open is listed in
// `repo.outsideWrites` (a write that would escape the rollback). If fn
// throws, every row is put back as it was.
type AnyRepo = { rows: any[]; outsideWrites: string[] } & Record<string, any>;
type Repos = Map<unknown, AnyRepo>;

let openTransactions = 0;
let viaTransaction = 0;

function matches(v: unknown, want: unknown): boolean {
  const op = want as { type?: string; value?: unknown } | null;
  if (op && typeof op === 'object' && op.type === 'in' && Array.isArray(op.value)) return op.value.includes(v);
  return v === want;
}

const WRITES = ['save', 'update', 'delete'] as const;

// The repo as seen inside a transaction: reads pass through, writes are
// recorded on `em` and marked as transactional (so they are not "outside").
function txView(repo: AnyRepo, writes: string[], name: string) {
  const view: Record<string, any> = Object.create(repo);
  for (const m of WRITES) {
    view[m] = (...a: unknown[]) => {
      writes.push(`${name}.${m}`);
      viaTransaction++;
      try {
        return repo[m](...a);
      } finally {
        viaTransaction--;
      }
    };
  }
  return view;
}

export function fakeManager(repos: Repos, fallback?: AnyRepo) {
  const repoFor = (entity: unknown) => {
    const r = repos.get(entity) ?? fallback;
    if (!r) throw new Error('fakeManager: no repo for entity');
    return r;
  };
  const nameOf = (entity: unknown) => (entity as { name?: string })?.name ?? 'repo';
  const manager = {
    transactions: 0,
    /** Every `em` handed to a transaction callback, in order. */
    ems: [] as Array<{ getRepository: (e: unknown) => any; writes: string[] }>,
    /** Outside a transaction: the injected repo itself. */
    getRepository: repoFor,
    async transaction<R>(fn: (em: any) => Promise<R>): Promise<R> {
      manager.transactions++;
      const writes: string[] = [];
      const em = { writes, getRepository: (e: unknown) => txView(repoFor(e), writes, nameOf(e)) };
      manager.ems.push(em);
      const all = new Set([...repos.values(), ...(fallback ? [fallback] : [])]);
      const snap = [...all].map((repo) => ({ repo, rows: repo.rows.map((r: any) => [r, { ...r }] as const) }));
      openTransactions++;
      try {
        return await fn(em);
      } catch (err) {
        for (const { repo, rows } of snap) {
          for (const [obj, copy] of rows) {
            for (const k of Object.keys(obj)) delete obj[k];
            Object.assign(obj, copy);
          }
          repo.rows.splice(0, repo.rows.length, ...rows.map(([obj]) => obj));
        }
        throw err;
      } finally {
        openTransactions--;
      }
    },
  };
  return manager;
}

export function fakeRepo<T extends { id?: number }>(rows: T[] = []) {
  let next = rows.length + 1;
  const outsideWrites: string[] = [];
  // A write on the injected repo while a transaction is open, not made through its `em`.
  const guard = (m: string) => {
    if (openTransactions > 0 && viaTransaction === 0) outsideWrites.push(m);
  };
  const matching = (where: Record<string, unknown> = {}) =>
    rows.filter((r) => Object.entries(where).every(([k, v]) => matches((r as Record<string, unknown>)[k], v)));
  const repo: any = {
    rows,
    outsideWrites,
    findOne: async ({ where, order }: any) => {
      const match = matching(where);
      if (order?.id === 'DESC') match.sort((a: any, b: any) => b.id - a.id);
      return match[0] ?? null;
    },
    find: async ({ where, order, take, skip }: any = {}) => {
      const match = matching(where).sort((a: any, b: any) => (order?.id === 'DESC' ? b.id - a.id : a.id - b.id));
      return match.slice(skip ?? 0, (skip ?? 0) + (take ?? match.length));
    },
    create: (r: T) => r,
    save: (r: any) => {
      guard('save');
      if (!r.id) {
        r.id = next++;
        r.createdAt = new Date();
        rows.push(r);
      }
      return Promise.resolve(r);
    },
    update: (where: Record<string, unknown>, patch: Record<string, unknown>) => {
      guard('update');
      const match = matching(where);
      for (const r of match) Object.assign(r as object, patch);
      return Promise.resolve({ affected: match.length });
    },
    delete: (ids: number[] | number) => {
      guard('delete');
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        const i = rows.findIndex((r: any) => r.id === id);
        if (i >= 0) rows.splice(i, 1);
      }
      return Promise.resolve();
    },
  };
  repo.manager = fakeManager(new Map(), repo);
  return repo as {
    rows: T[];
    outsideWrites: string[];
    findOne: (q: any) => Promise<T | null>;
    find: (q?: any) => Promise<T[]>;
    create: (r: T) => T;
    save: (r: any) => Promise<any>;
    update: (where: Record<string, unknown>, patch: Record<string, unknown>) => Promise<{ affected: number }>;
    delete: (ids: number[] | number) => Promise<void>;
    manager: ReturnType<typeof fakeManager>;
  };
}
