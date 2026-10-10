const STOP = new Set(['the', 'a', 'an', 'and', 'is', 'to', 'of', 'in', 'it', 'i', 'you', 'me', 'my', 'и', 'в', 'не', 'на', 'я', 'ты', 'что', 'это', 'как', 'с', 'у', 'а', 'но', 'мне', 'тебя', 'мой', 'моя']);

function cleanText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function oneLine(value, max) {
  return cleanText(value, max).replace(/\s+/g, ' ').trim();
}

function tokens(text) {
  return oneLine(text, 2000).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter((token) => !STOP.has(token)) || [];
}

function extractFacts(text) {
  const facts = [];
  const source = oneLine(text, 500);
  const patterns = [
    ['name', /(?:меня зовут|моё имя|мое имя|my name is|call me|зови меня)\s+([\p{L}-]{2,30})/iu, (match) => match[1]],
    ['like', /(?:я люблю|мне нравится|мне нравятся|i love|i like)\s+([^.!?]{2,80})/iu, (match) => `Likes ${oneLine(match[1], 80)}`],
    ['dislike', /(?:я не люблю|мне не нравится|терпеть не могу|ненавижу|i hate|i don't like|i dislike)\s+([^.!?]{2,80})/iu, (match) => `Dislikes ${oneLine(match[1], 80)}`],
    ['fact', /(?:я работаю|i work as|i work in|я живу|i live in)\s+([^.!?]{2,80})/iu, (match) => oneLine(match[0], 100)]
  ];
  for (const [kind, pattern, format] of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const content = oneLine(format(match), 120);
    if (content) facts.push({ kind, content });
  }
  return facts;
}

function detectPreferences(text) {
  const lower = oneLine(text, 500).toLowerCase();
  const prefs = {};
  if (/(отвечай )?короче|покороче|коротко|keep it short|shorter/.test(lower)) prefs.reply_length = 'short';
  if (/подробнее|длиннее|развёрнутее|развернутее|longer|more detail/.test(lower)) prefs.reply_length = 'long';
  if (/мягче|понежнее|нежнее|be softer|more tender/.test(lower)) prefs.preferred_tone = 'warm';
  if (/пожёстче|пожестче|смелее|more dominant|be bolder/.test(lower)) prefs.preferred_tone = 'dominant';
  return prefs;
}

function retrieveMemories(memories, query, limit) {
  const queryTokens = new Set(tokens(query));
  return memories
    .map((memory, index) => {
      const overlap = tokens(memory.content).filter((token) => queryTokens.has(token)).length;
      const boost = memory.kind === 'name' || memory.kind === 'avoid' ? 1 : 0;
      return { memory, score: overlap * 2 + boost - index * 0.001 };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}

module.exports = { cleanText, extractFacts, detectPreferences, retrieveMemories };
