const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { openDb } = require('./db');
const { createLlmClient } = require('./llm');
const { createAgent } = require('./agent');

const publicDir = path.resolve(__dirname, '..', 'public');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};
const USER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
    ...extra
  };
}

function sendJson(res, status, body) {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }));
  res.end(JSON.stringify(body));
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    const fail = (status, message) => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error(message), { status }));
      req.destroy();
    };
    req.on('data', (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) fail(413, 'Payload too large');
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(Object.assign(new Error('Invalid JSON payload'), { status: 400 }));
          return;
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload'), { status: 400 }));
      }
    });
    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function resolvePublic(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^[/\\]+/, '');
  const fullPath = path.resolve(publicDir, relative);
  if (fullPath !== publicDir && !fullPath.startsWith(publicDir + path.sep)) return null;
  return fullPath;
}

function serveFile(res, requestPath) {
  const fullPath = resolvePublic(requestPath);
  if (!fullPath || fullPath === publicDir) {
    res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Not found');
    return;
  }
  fs.readFile(fullPath, (err, content) => {
    if (err || res.writableEnded) {
      if (!res.writableEnded && !res.destroyed) {
        res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
        res.end('Not found');
      }
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, securityHeaders({
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    }));
    res.end(content);
  });
}

function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  function allow(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (hits.size > 1000) {
      for (const [storedKey, times] of hits) {
        if (!times.some((time) => now - time < windowMs)) hits.delete(storedKey);
      }
    }
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  }
  allow.clear = (key) => hits.delete(key);
  return allow;
}

function validUserId(userId) {
  return USER_ID_RE.test(String(userId || ''));
}

function createServer({ db, llm, cfg = config } = {}) {
  const database = db || openDb(cfg.dbPath);
  const model = llm || createLlmClient(cfg.llm);
  const agent = createAgent({ db: database, llm: model, config: cfg });
  const allow = createRateLimiter(cfg.rateLimit || config.rateLimit);
  const maxBody = cfg.maxBodyBytes || config.maxBodyBytes;
  const maxMessage = cfg.maxMessageChars || config.maxMessageChars;

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'Bad request' });
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, llm: model.isConfigured() });
      }

      if (req.method === 'GET' && url.pathname === '/api/history') {
        const userId = url.searchParams.get('userId');
        if (!validUserId(userId)) return sendJson(res, 400, { error: 'Invalid userId' });
        if (!database.getUser(userId)) return sendJson(res, 200, { messages: [] });
        return sendJson(res, 200, { messages: database.history(userId, 80) });
      }

      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const { message, userId } = await readJson(req, maxBody);
        if (!validUserId(userId)) return sendJson(res, 400, { error: 'Invalid userId' });
        const text = String(message || '').trim().slice(0, maxMessage);
        if (!text) return sendJson(res, 400, { error: 'Message is required' });
        if (!allow(`chat:${userId}`)) return sendJson(res, 429, { error: 'Too many messages. Slow down a little.' });
        return sendJson(res, 200, await agent.chat(userId, text));
      }

      if (req.method === 'POST' && url.pathname === '/api/feedback') {
        const { userId, messageId, rating, comment } = await readJson(req, maxBody);
        if (!validUserId(userId)) return sendJson(res, 400, { error: 'Invalid userId' });
        if (!Number.isInteger(messageId) || (rating !== 1 && rating !== -1)) {
          return sendJson(res, 400, { error: 'messageId (integer) and rating (1 or -1) are required' });
        }
        if (!allow(`feedback:${userId}`)) return sendJson(res, 429, { error: 'Too many ratings.' });
        await agent.feedback(userId, messageId, rating, typeof comment === 'string' ? comment : '');
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/reset') {
        const { userId } = await readJson(req, maxBody);
        if (!validUserId(userId)) return sendJson(res, 400, { error: 'Invalid userId' });
        await agent.reset(userId);
        allow.clear(`chat:${userId}`);
        allow.clear(`feedback:${userId}`);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return serveFile(res, url.pathname === '/' ? '/index.html' : url.pathname);
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? 'Internal error' : err.message });
    }
  });

  server.db = database;
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const server = createServer();
  server.listen(config.port, () => {
    console.log(`Anjela chat is running on http://localhost:${config.port}`);
    if (!config.llm.apiKey) console.warn('LLM_API_KEY is not set: replies will use a canned fallback.');
  });

  function shutdown() {
    server.close(() => {
      server.db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
