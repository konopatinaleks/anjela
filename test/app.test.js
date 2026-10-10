const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { createServer } = require('../src/server');

function setup() {
  const prompts = [];
  const llm = {
    isConfigured: () => true,
    complete: async (messages) => { prompts.push(messages); return 'Careful, now.'; }
  };
  const db = openDb(':memory:');
  const server = createServer({ db, llm, cfg: { historyLimit: 12, summarizeAfter: 1000, memoryLimit: 6 } });
  return new Promise((resolve) => server.listen(0, () => {
    const base = `http://localhost:${server.address().port}`;
    const post = (p, body) => fetch(base + p, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    resolve({ server, db, post, prompts });
  }));
}

test('chat stores memory and uses it in later prompts', async () => {
  const { server, post, prompts, db } = await setup();
  const userId = 'user-12345678';
  const r1 = await post('/api/chat', { userId, message: 'Меня зовут Олег. Я люблю джаз' });
  assert.strictEqual(r1.status, 200);
  assert.ok(r1.body.messageId);
  await post('/api/chat', { userId, message: 'Какой джаз посоветуешь?' });
  const system = prompts[1][0].content;
  assert.match(system, /Name: Олег/);
  assert.match(system, /Likes джаз/);
  assert.ok(db.listMemories(userId).length >= 2);
  server.close();
});

test('feedback adapts profile and validates input', async () => {
  const { server, post, db } = await setup();
  const userId = 'user-12345678';
  const { body } = await post('/api/chat', { userId, message: 'hi there' });
  assert.strictEqual((await post('/api/feedback', { userId, messageId: body.messageId, rating: -1 })).status, 200);
  assert.strictEqual(db.ensureUser(userId).flirt_level, 2);
  assert.ok(db.listMemories(userId).some((m) => m.kind === 'avoid'));
  assert.strictEqual((await post('/api/feedback', { userId, messageId: body.messageId, rating: 5 })).status, 400);
  assert.strictEqual((await post('/api/feedback', { userId: 'other-user-1', messageId: body.messageId, rating: 1 })).status, 404);
  assert.strictEqual((await post('/api/chat', { userId: 'x', message: 'hi' })).status, 400);
  server.close();
});
