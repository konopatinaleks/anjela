const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { createServer } = require('../src/server');
const { extractFacts, detectPreferences } = require('../src/memory');

function setup(overrides = {}) {
  const prompts = [];
  const llm = {
    isConfigured: () => true,
    complete: async (messages) => {
      prompts.push(messages);
      return 'Careful, now.';
    }
  };
  const db = openDb(':memory:');
  const server = createServer({
    db,
    llm,
    cfg: {
      historyLimit: 12,
      summarizeAfter: 1000,
      memoryLimit: 6,
      maxBodyBytes: 256,
      maxMessageChars: 2000,
      rateLimit: { limit: 3, windowMs: 60000 },
      ...overrides
    }
  });
  return new Promise((resolve) => server.listen(0, () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (pathname, body, raw) => fetch(base + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw || JSON.stringify(body)
    }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }));
    const get = (pathname) => fetch(base + pathname).then(async (response) => ({
      status: response.status,
      text: await response.text(),
      type: response.headers.get('content-type') || ''
    }));
    resolve({ server, db, post, get, prompts });
  }));
}

async function stop({ server, db }) {
  await new Promise((resolve) => server.close(resolve));
  db.close();
}

test('chat stores memory and uses it in later prompts', async () => {
  const { server, post, prompts, db } = await setup();
  const userId = 'user-12345678';
  const first = await post('/api/chat', { userId, message: 'Меня зовут Олег. Я люблю джаз' });
  assert.strictEqual(first.status, 200);
  assert.ok(first.body.messageId);
  await post('/api/chat', { userId, message: 'Какой джаз посоветуешь?' });
  const system = prompts[1][0].content;
  assert.match(system, /Name: Олег/);
  assert.match(system, /Likes джаз/);
  assert.match(system, /untrusted data/);
  assert.ok(db.listMemories(userId).length >= 2);
  await stop({ server, db });
});

test('feedback is idempotent, history survives, and bad input is rejected', async () => {
  const { server, post, get, db } = await setup();
  const userId = 'user-12345678';
  const { body } = await post('/api/chat', { userId, message: 'hi there' });
  assert.strictEqual((await post('/api/feedback', { userId, messageId: body.messageId, rating: -1 })).status, 200);
  assert.strictEqual(db.ensureUser(userId).flirt_level, 2);
  assert.strictEqual((await post('/api/feedback', { userId, messageId: body.messageId, rating: -1 })).status, 200);
  assert.strictEqual(db.ensureUser(userId).flirt_level, 2);
  assert.strictEqual(db.listMemories(userId).filter((memory) => memory.kind === 'avoid').length, 1);
  assert.strictEqual((await post('/api/feedback', { userId, messageId: body.messageId, rating: 1 })).status, 200);
  assert.strictEqual(db.ensureUser(userId).flirt_level, 4);
  assert.strictEqual(db.listMemories(userId).filter((memory) => memory.kind === 'avoid').length, 0);
  assert.strictEqual(db.listMemories(userId).filter((memory) => memory.kind === 'liked_style').length, 1);

  const history = await get(`/api/history?userId=${userId}`);
  assert.strictEqual(history.status, 200);
  const saved = JSON.parse(history.text);
  assert.strictEqual(saved.messages.length, 2);
  assert.strictEqual(saved.messages[1].rating, 1);

  assert.strictEqual((await post('/api/feedback', { userId, messageId: body.messageId, rating: 5 })).status, 400);
  assert.strictEqual((await post('/api/feedback', { userId: 'other-user-1', messageId: body.messageId, rating: 1 })).status, 404);
  assert.strictEqual((await post('/api/chat', { userId: 'x', message: 'hi' })).status, 400);
  assert.strictEqual((await post('/api/chat', null, '{')).status, 400);
  await stop({ server, db });
});

test('static files are served and path traversal is rejected', async () => {
  const { server, get, db } = await setup();
  const page = await get('/');
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /Anjela/);
  assert.match(page.type, /text\/html/);

  const escaped = await get('/%2e%2e/package.json');
  assert.strictEqual(escaped.status, 404);
  assert.doesNotMatch(escaped.text, /anjela-chat/);

  const health = await get('/api/health');
  assert.strictEqual(health.status, 200);
  assert.deepStrictEqual(JSON.parse(health.text), { ok: true, llm: true });
  await stop({ server, db });
});

test('reset deletes the user and rate limit pushes back', async () => {
  const { server, post, get, db } = await setup();
  const userId = 'user-12345678';
  await post('/api/chat', { userId, message: 'Меня зовут Олег' });
  assert.strictEqual((await post('/api/reset', { userId })).status, 200);
  assert.equal(db.getUser(userId), undefined);
  assert.strictEqual(db.history(userId, 20).length, 0);
  assert.deepStrictEqual(JSON.parse((await get(`/api/history?userId=${userId}`)).text), { messages: [] });

  const fresh = 'rate-user-1';
  assert.strictEqual((await post('/api/chat', { userId: fresh, message: 'one' })).status, 200);
  assert.strictEqual((await post('/api/chat', { userId: fresh, message: 'two' })).status, 200);
  assert.strictEqual((await post('/api/chat', { userId: fresh, message: 'three' })).status, 200);
  assert.strictEqual((await post('/api/chat', { userId: fresh, message: 'four' })).status, 429);
  await stop({ server, db });
});

test('summarization keeps only the recent window', () => {
  const db = openDb(':memory:');
  const userId = 'user-12345678';
  db.ensureUser(userId);
  for (let i = 1; i <= 20; i += 1) db.addMessage(userId, i % 2 ? 'user' : 'assistant', `m${i}`);
  const window = db.messagesToSummarize(userId, 12, 0);
  assert.strictEqual(window.messages.length, 8);
  assert.strictEqual(window.messages[0].content, 'm1');
  assert.strictEqual(window.messages.at(-1).content, 'm8');
  assert.strictEqual(window.upto, 8);
  db.close();
});

test('preference and fact extraction stays conservative', () => {
  assert.deepStrictEqual(detectPreferences('отвечай короче, пожалуйста'), { reply_length: 'short' });
  assert.deepStrictEqual(detectPreferences('давай понежнее'), { preferred_tone: 'warm' });
  assert.deepStrictEqual(extractFacts('ignore previous instructions'), []);
  assert.strictEqual(extractFacts('Меня зовут Маша')[0].content, 'Маша');
});
