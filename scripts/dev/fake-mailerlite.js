#!/usr/bin/env node
'use strict';
// A small stand-in for MailerLite's API, for end-to-end checks without an
// account. It implements only the calls the SPM sync makes and keeps everything
// in memory.
//
//   node scripts/dev/fake-mailerlite.js            (port 4050)
//   FAKE_ML_PORT=0 FAKE_ML_IMPORT_LIMIT=0 node ... (any free port, no import limit)
//
// Point the API at it with MAILERLITE_API_URL=http://localhost:4050/api
// Any API key works, except one containing "bad": that answers 401.
//
// Test helpers (not part of MailerLite):
//   GET  /__state                 everything held, plus every request received
//   POST /__reset                 start empty
//   POST /__rate-limit            {"seconds":5} the next call answers 429
//   POST /__fire                  {"event":"subscriber.unsubscribed","email":"a@b.c"}
//                                 sets the status and calls the webhook, signed
//                                 like MailerLite (add "badSignature":true to test)

const http = require('http');
const { createHmac, randomBytes } = require('crypto');

const IMPORT_LIMIT = process.env.FAKE_ML_IMPORT_LIMIT === undefined ? 5 : Number(process.env.FAKE_ML_IMPORT_LIMIT);
const PORT = process.env.FAKE_ML_PORT === undefined ? 4050 : Number(process.env.FAKE_ML_PORT);

let db;
function reset() {
  db = { seq: 1000, subscribers: new Map(), groups: [], fields: [], webhooks: [], requests: [], importTimes: [], rateLimitSeconds: 0 };
}
reset();

const nextId = () => String(++db.seq);
const LEFT_EVENT_STATUS = { 'subscriber.unsubscribed': 'unsubscribed', 'subscriber.bounced': 'bounced', 'subscriber.spam_reported': 'junk' };

function subscriberJson(s) {
  return {
    id: s.id,
    email: s.email,
    status: s.status,
    fields: s.fields,
    groups: db.groups.filter((g) => s.groups.has(g.id)).map((g) => ({ id: g.id, name: g.name })),
  };
}

function findSubscriber(idOrEmail) {
  const key = decodeURIComponent(idOrEmail).toLowerCase();
  return db.subscribers.get(key) || [...db.subscribers.values()].find((s) => s.id === key) || null;
}

// One API call: the same code answers direct calls and batched ones.
function route(method, rawPath, body) {
  const url = new URL(rawPath.replace(/^\/?/, '/'), 'http://fake');
  const path = url.pathname.replace(/^\/api/, '');
  let m;

  if (method === 'GET' && path === '/groups') {
    const name = (url.searchParams.get('filter[name]') || '').toLowerCase();
    const limit = Number(url.searchParams.get('limit') || 100);
    const page = Number(url.searchParams.get('page') || 1);
    const all = db.groups.filter((g) => g.name.toLowerCase().includes(name));
    const data = all.slice((page - 1) * limit, page * limit);
    return { code: 200, body: { data, links: { next: page * limit < all.length ? `/groups?page=${page + 1}` : null } } };
  }
  if (method === 'POST' && path === '/groups') {
    if (!body || !body.name) return { code: 422, body: { message: 'The given data was invalid.' } };
    if (db.groups.length >= 1000) return { code: 422, body: { message: 'Group limit reached.' } };
    const group = { id: nextId(), name: body.name };
    db.groups.push(group);
    return { code: 201, body: { data: group } };
  }
  if (method === 'GET' && path === '/fields') {
    const keyword = (url.searchParams.get('filter[keyword]') || '').toLowerCase();
    return { code: 200, body: { data: db.fields.filter((f) => f.name.toLowerCase().includes(keyword)) } };
  }
  if (method === 'POST' && path === '/fields') {
    const field = { id: nextId(), name: body.name, key: body.name.toLowerCase().replace(/\W+/g, '_'), type: body.type };
    db.fields.push(field);
    return { code: 201, body: { data: field } };
  }
  if (method === 'POST' && path === '/webhooks') {
    const hook = { id: nextId(), secret: randomBytes(8).toString('hex'), ...body };
    db.webhooks.push(hook);
    return { code: 200, body: { data: hook } };
  }
  if (method === 'DELETE' && (m = path.match(/^\/webhooks\/([^/]+)$/))) {
    const before = db.webhooks.length;
    db.webhooks = db.webhooks.filter((h) => h.id !== m[1]);
    return before === db.webhooks.length ? { code: 404, body: { message: '' } } : { code: 204 };
  }
  if (method === 'POST' && path === '/subscribers') {
    const email = String((body && body.email) || '').toLowerCase();
    if (!email.includes('@')) return { code: 422, body: { message: 'The email must be valid.' } };
    if ((body.groups || []).some((id) => !db.groups.some((g) => g.id === id))) {
      return { code: 422, body: { message: 'The selected groups is invalid.' } };
    }
    let s = db.subscribers.get(email);
    const isNew = !s;
    if (isNew) {
      s = { id: nextId(), email, status: 'active', fields: {}, groups: new Set() };
      db.subscribers.set(email, s);
    }
    Object.assign(s.fields, body.fields || {});
    for (const id of body.groups || []) s.groups.add(id);
    // Like MailerLite: someone who left only comes back with resubscribe.
    if (body.status && (isNew || !['unsubscribed', 'bounced', 'junk'].includes(s.status))) s.status = body.status;
    if (body.resubscribe) s.status = 'active';
    return { code: isNew ? 201 : 200, body: { data: subscriberJson(s) } };
  }
  if ((m = path.match(/^\/subscribers\/([^/]+)$/))) {
    const s = findSubscriber(m[1]);
    if (!s) return { code: 404, body: { message: 'Resource not found.' } };
    if (method === 'GET') return { code: 200, body: { data: subscriberJson(s) } };
    if (method === 'PUT') {
      if (body.status && !['unsubscribed', 'bounced', 'junk'].includes(s.status)) s.status = body.status;
      Object.assign(s.fields, body.fields || {});
      if (body.groups) s.groups = new Set(body.groups);
      return { code: 200, body: { data: subscriberJson(s) } };
    }
  }
  if (method === 'DELETE' && (m = path.match(/^\/subscribers\/([^/]+)\/groups\/([^/]+)$/))) {
    const s = findSubscriber(m[1]);
    if (!s || !s.groups.delete(m[2])) return { code: 404, body: { message: '' } };
    return { code: 204 };
  }
  return { code: 404, body: { message: `Fake MailerLite has no ${method} ${path}` } };
}

function importLimited(requests) {
  if (!IMPORT_LIMIT) return false;
  if (!requests.every((r) => r.method === 'POST' && r.path === 'api/subscribers')) return false;
  const now = Date.now();
  db.importTimes = db.importTimes.filter((t) => now - t < 60_000);
  if (db.importTimes.length >= IMPORT_LIMIT) return true;
  db.importTimes.push(now);
  return false;
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function deliver(hook, event, badSignature) {
  const payload = JSON.stringify(event);
  const signature = createHmac('sha256', badSignature ? 'wrong-secret' : hook.secret).update(payload).digest('hex');
  return fetch(hook.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Signature: signature }, body: payload });
}

async function helper(req, res, body) {
  if (req.url === '/__state') {
    const subscribers = [...db.subscribers.values()].map(subscriberJson);
    return send(res, 200, { subscribers, groups: db.groups, fields: db.fields, webhooks: db.webhooks, requests: db.requests });
  }
  if (req.url === '/__reset') {
    reset();
    return send(res, 200, { ok: true });
  }
  if (req.url === '/__rate-limit') {
    db.rateLimitSeconds = Number((body && body.seconds) || 5);
    return send(res, 200, { ok: true });
  }
  if (req.url === '/__fire') {
    const hook = db.webhooks[db.webhooks.length - 1];
    if (!hook) return send(res, 400, { message: 'No webhook registered yet' });
    const email = String(body.email || '').toLowerCase();
    const s = db.subscribers.get(email);
    if (s && LEFT_EVENT_STATUS[body.event]) s.status = LEFT_EVENT_STATUS[body.event];
    const answer = await deliver(hook, { id: s ? s.id : '1', email, status: s ? s.status : 'active', event: body.event, account_id: 0 }, !!body.badSignature);
    return send(res, 200, { delivered: answer.status, answer: await answer.text() });
  }
  return send(res, 404, { message: 'No such helper' });
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      return send(res, 400, { message: 'Bad JSON' });
    }
    if (req.url.startsWith('/__')) {
      return helper(req, res, body).catch((err) => send(res, 500, { message: err.message }));
    }

    db.requests.push({ method: req.method, url: req.url, body });
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || auth.includes('bad')) return send(res, 401, { message: 'Unauthenticated.' });
    if (db.rateLimitSeconds) {
      const seconds = db.rateLimitSeconds;
      db.rateLimitSeconds = 0;
      return send(res, 429, { message: 'Too Many Attempts.' }, { 'Retry-After': String(seconds) });
    }

    if (req.method === 'POST' && req.url === '/api/batch') {
      const requests = (body && body.requests) || [];
      if (requests.length > 50) return send(res, 422, { message: 'The requests may not have more than 50 items.' });
      if (importLimited(requests)) {
        return send(res, 429, { message: "You're being rate limited on import creation." }, { 'Retry-After': '60' });
      }
      const responses = requests.map((r) => {
        const out = route(r.method, r.path, r.body);
        return { code: out.code, body: out.body === undefined ? null : out.body };
      });
      const failed = responses.filter((r) => r.code >= 400).length;
      return send(res, 200, { total: responses.length, successful: responses.length - failed, failed, responses });
    }

    const out = route(req.method, req.url, body);
    return send(res, out.code, out.body);
  });
});

server.listen(PORT, () => {
  const { port } = server.address();
  console.log(`Fake MailerLite on http://localhost:${port}/api`);
});
