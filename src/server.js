const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { openDb } = require('./db');
const { createLlmClient } = require('./llm');
const { createAgent } = require('./agent');

const publicDir = path.join(__dirname, '..', 'public');
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
const MAX_BODY = 32 * 1024;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, requestPath) {
  const fullPath = path.join(publicDir, path.normalize(requestPath));
  if (!fullPath.startsWith(publicDir + path.sep)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(fullPath).toLowerCase()] || 'application/octet-stream' });
    res.end(content);
  });
}

function createServer({ db, llm, cfg = config } = {}) {
  db = db || openDb(cfg.dbPath);
  llm = llm || createLlmClient(cfg.llm);
  const agent = createAgent({ db, llm, config: cfg });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const { message, userId } = await readJson(req);
        if (!USER_ID_RE.test(String(userId || ''))) return sendJson(res, 400, { error: 'Invalid userId' });
        const text = String(message || '').trim().slice(0, 2000);
        if (!text) return sendJson(res, 400, { error: 'Message is required' });
        return sendJson(res, 200, await agent.chat(userId, text));
      }
      if (req.method === 'POST' && url.pathname === '/api/feedback') {
        const { userId, messageId, rating, comment } = await readJson(req);
        if (!USER_ID_RE.test(String(userId || ''))) return sendJson(res, 400, { error: 'Invalid userId' });
        if (!Number.isInteger(messageId) || (rating !== 1 && rating !== -1)) {
          return sendJson(res, 400, { error: 'messageId (integer) and rating (1 or -1) are required' });
        }
        agent.feedback(userId, messageId, rating, comment);
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return serveFile(res, url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname));
      }
      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? 'Internal error' : err.message });
    }
  });
}

module.exports = { createServer };

if (require.main === module) {
  createServer().listen(config.port, () => {
    console.log(`Anjela chat is running on http://localhost:${config.port}`);
    if (!config.llm.apiKey) console.warn('LLM_API_KEY is not set: replies will use a canned fallback.');
  });
}
