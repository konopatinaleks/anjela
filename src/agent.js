const { buildMessages } = require('./persona');
const { extractFacts, detectPreferences, retrieveMemories } = require('./memory');

const FALLBACKS = [
  'Ты говоришь слишком спокойно. Мне нравится, когда в тебе есть искра. Продолжай.',
  'Хороший темп. Не останавливайся — я люблю тех, кто умеет держать напряжение.',
  'Интересно. Ты либо очень смел, либо очень любопытен. Пока не решила, что мне нравится больше.',
  'Я не спешу. Но я запоминаю тех, кто умеет играть по-настоящему.'
];

function createAgent({ db, llm, config }) {
  async function maybeSummarize(user) {
    if (!llm.isConfigured() || db.countMessages(user.id) < config.summarizeAfter) return user;
    const { messages, upto } = db.messagesToSummarize(user.id, config.historyLimit, user.summarized_upto);
    if (messages.length < 10) return user;
    try {
      const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
      const summary = await llm.complete([
        { role: 'system', content: 'Update a concise memory summary (max 120 words) of a user from a chat, keeping durable facts, preferences, mood patterns and running themes. Output only the summary.' },
        { role: 'user', content: `Previous summary:\n${user.memory_summary || '(none)'}\n\nNew messages:\n${transcript}` }
      ], { temperature: 0.2, maxTokens: 250 });
      return db.updateProfile(user.id, { memory_summary: summary, summarized_upto: upto });
    } catch (err) {
      console.error('Summarization failed:', err.message);
      return user;
    }
  }

  async function chat(userId, message) {
    let user = db.ensureUser(userId);

    const prefs = detectPreferences(message);
    if (Object.keys(prefs).length) user = db.updateProfile(userId, prefs);
    for (const fact of extractFacts(message)) {
      if (fact.kind === 'name') user = db.updateProfile(userId, { name: fact.content });
      db.addMemory(userId, fact.kind, fact.content);
    }

    db.addMessage(userId, 'user', message);
    user = await maybeSummarize(user);

    const history = db.recentMessages(userId, config.historyLimit);
    const memories = retrieveMemories(db.listMemories(userId), message, config.memoryLimit);

    let reply;
    try {
      reply = await llm.complete(buildMessages({ user, history, memories }));
    } catch (err) {
      console.error('LLM unavailable, using fallback:', err.message);
      reply = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
    }
    const messageId = db.addMessage(userId, 'assistant', reply);
    return { reply, messageId };
  }

  // Likes/dislikes nudge the profile so future replies adapt.
  function feedback(userId, messageId, rating, comment) {
    const msg = db.getMessage(messageId);
    if (!msg || msg.user_id !== userId || msg.role !== 'assistant') {
      const err = new Error('Unknown message');
      err.status = 404;
      throw err;
    }
    const user = db.ensureUser(userId);
    db.addFeedback(userId, messageId, rating, comment);
    const snippet = msg.content.slice(0, 120);
    const clamp = (n) => Math.min(5, Math.max(1, n));
    if (rating > 0) {
      db.updateProfile(userId, { flirt_level: clamp(user.flirt_level + (user.flirt_level < 4 ? 1 : 0)) });
      db.addMemory(userId, 'liked_style', `Liked reply: "${snippet}"`);
    } else {
      db.updateProfile(userId, { flirt_level: clamp(user.flirt_level - 1) });
      db.addMemory(userId, 'avoid', `Disliked reply, avoid this style: "${snippet}"${comment ? ` (${String(comment).slice(0, 100)})` : ''}`);
    }
    return db.ensureUser(userId);
  }

  return { chat, feedback };
}

module.exports = { createAgent };
