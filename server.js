// Virtual Phone server: serves the phone UI and sends/receives real SMS via Twilio.
// Zero dependencies — needs Node 18+ (built-in fetch).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_FROM_NUMBER || '';
const APP_TOKEN = process.env.APP_TOKEN || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const TWILIO_READY = Boolean(SID && AUTH && FROM);

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data', 'messages.json');

// ---- message store (JSON file, append-only with a sequence number for polling) ----
let db = { seq: 0, messages: [] };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function addMessage(msg) {
  msg.seq = ++db.seq;
  db.messages.push(msg);
  if (db.messages.length > 5000) db.messages = db.messages.slice(-5000);
  saveDb();
  return msg;
}

// ---- helpers ----
function loadDotEnv(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function normalizeNumber(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (s.startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function authorized(req) {
  if (!APP_TOKEN) return true;
  const given = Buffer.from(String(req.headers['x-app-token'] || ''));
  const want = Buffer.from(APP_TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

// https://www.twilio.com/docs/usage/security#validating-requests
function validTwilioSignature(req, params) {
  if (!PUBLIC_URL) return true; // can't know the public URL Twilio signed, so skip
  const url = PUBLIC_URL + req.url;
  const payload = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', AUTH).update(payload).digest('base64');
  const given = Buffer.from(String(req.headers['x-twilio-signature'] || ''));
  const want = Buffer.from(expected);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

async function twilioSend(to, body) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SID}:${AUTH}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: FROM, Body: body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Twilio error ${res.status}`);
  return data;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---- routes ----
const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/api/status' && req.method === 'GET') {
      return json(res, 200, { twilio: TWILIO_READY, from: TWILIO_READY ? FROM : null, authRequired: Boolean(APP_TOKEN) });
    }

    if (pathname === '/api/messages' && req.method === 'GET') {
      if (!authorized(req)) return json(res, 401, { error: 'Bad access token' });
      const since = Number(searchParams.get('since')) || 0;
      return json(res, 200, { seq: db.seq, messages: db.messages.filter(m => m.seq > since) });
    }

    if (pathname === '/api/send' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Bad access token' });
      if (!TWILIO_READY) return json(res, 503, { error: 'Twilio is not configured on the server' });
      const { id, to, body } = JSON.parse((await readBody(req)) || '{}');
      const peer = normalizeNumber(to);
      const text = String(body || '').slice(0, 1600);
      if (!/^\+\d{6,15}$/.test(peer)) return json(res, 400, { error: 'Invalid phone number' });
      if (!text.trim()) return json(res, 400, { error: 'Message is empty' });
      const msgId = /^[\w-]{1,64}$/.test(id || '') ? id : crypto.randomUUID();
      try {
        const sent = await twilioSend(peer, text);
        const msg = addMessage({ id: msgId, dir: 'out', peer, body: text, ts: Date.now(), status: 'sent', sid: sent.sid });
        return json(res, 200, msg);
      } catch (e) {
        return json(res, 502, { error: e.message });
      }
    }

    // Twilio "A message comes in" webhook
    if (pathname === '/api/twilio/inbound' && req.method === 'POST') {
      const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
      if (!validTwilioSignature(req, params)) { res.writeHead(403); return res.end('Bad signature'); }
      if (params.From && params.Body !== undefined) {
        addMessage({
          id: params.MessageSid || crypto.randomUUID(), dir: 'in',
          peer: normalizeNumber(params.From), body: params.Body, ts: Date.now(), status: 'received',
        });
      }
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end('<Response></Response>');
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end();
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Virtual Phone running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(TWILIO_READY
    ? `Twilio ready — sending from ${FROM}. Inbound webhook: <public-url>/api/twilio/inbound`
    : 'Twilio not configured — the phone will hand messages off to your device\'s Messages app. See README.');
  if (TWILIO_READY && !APP_TOKEN) console.log('Tip: set APP_TOKEN so nobody else can send texts through your server.');
});
