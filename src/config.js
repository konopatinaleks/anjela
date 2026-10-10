const path = require('path');

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  port: num(process.env.PORT, 3000),
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'anjela.db'),
  llm: {
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: num(process.env.LLM_TEMPERATURE, 0.9),
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 30000)
  },
  historyLimit: num(process.env.HISTORY_LIMIT, 12),
  summarizeAfter: num(process.env.SUMMARIZE_AFTER, 30),
  memoryLimit: num(process.env.MEMORY_LIMIT, 6),
  maxBodyBytes: 32 * 1024,
  maxMessageChars: 2000,
  rateLimit: { limit: num(process.env.RATE_LIMIT, 30), windowMs: num(process.env.RATE_WINDOW_MS, 60000) }
};
