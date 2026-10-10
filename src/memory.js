const STOP = new Set(['the', 'a', 'an', 'and', 'is', 'to', 'of', 'in', 'it', 'i', 'you', 'me', 'my', 'и', 'в', 'не', 'на', 'я', 'ты', 'что', 'это', 'как', 'с', 'у', 'а', 'но', 'мне', 'тебя', 'мой', 'моя']);

function tokens(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter((t) => !STOP.has(t)) || [];
}

// Lightweight heuristic extraction of durable facts/preferences (RU + EN).
function extractFacts(text) {
  const facts = [];
  const t = String(text).trim().slice(0, 500);
  const patterns = [
    ['name', /(?:меня зовут|моё имя|мое имя|my name is|call me|зови меня)\s+([\p{L}-]{2,30})/iu, (m) => m[1]],
    ['like', /(?:я люблю|мне нравится|мне нравятся|i love|i like)\s+([^.!?\n]{2,80})/iu, (m) => `Likes ${m[1].trim()}`],
    ['dislike', /(?:я не люблю|мне не нравится|терпеть не могу|ненавижу|i hate|i don't like|i dislike)\s+([^.!?\n]{2,80})/iu, (m) => `Dislikes ${m[1].trim()}`],
    ['fact', /(?:я работаю|i work as|i work in|я живу|i live in)\s+([^.!?\n]{2,80})/iu, (m) => `${m[0].trim()}`]
  ];
  for (const [kind, re, fmt] of patterns) {
    const m = t.match(re);
    if (m) facts.push({ kind, content: fmt(m) });
  }
  return facts;
}

function detectPreferences(text) {
  const lower = String(text).toLowerCase();
  const prefs = {};
  if (/(отвечай )?короче|покороче|keep it short|shorter/.test(lower)) prefs.reply_length = 'short';
  if (/подробнее|длиннее|longer|more detail/.test(lower)) prefs.reply_length = 'long';
  if (/мягче|понежнее|be softer|more tender/.test(lower)) prefs.preferred_tone = 'warm';
  if (/пожёстче|пожестче|more dominant|be bolder/.test(lower)) prefs.preferred_tone = 'dominant';
  return prefs;
}

function retrieveMemories(memories, query, limit) {
  const q = new Set(tokens(query));
  return memories
    .map((m, i) => {
      const overlap = tokens(m.content).filter((t) => q.has(t)).length;
      const base = m.kind === 'name' || m.kind === 'avoid' ? 1 : 0;
      return { m, score: overlap * 2 + base - i * 0.001 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
}

module.exports = { extractFacts, detectPreferences, retrieveMemories };
