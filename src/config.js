const path = require('path');

module.exports = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'anjela.db'),
  llm: {
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    temperature: Number(process.env.LLM_TEMPERATURE || 0.9),
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000)
  },
  historyLimit: Number(process.env.HISTORY_LIMIT || 12),
  summarizeAfter: Number(process.env.SUMMARIZE_AFTER || 30),
  memoryLimit: Number(process.env.MEMORY_LIMIT || 6)
};
