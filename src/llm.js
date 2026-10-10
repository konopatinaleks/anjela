function messageText(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('').trim();
  }
  return '';
}

function createLlmClient(config) {
  return {
    isConfigured: () => Boolean(config.apiKey),
    async complete(messages, options = {}) {
      if (!config.apiKey) throw new Error('LLM_API_KEY is not set');
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ['Bearer', config.apiKey].join(' ')
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options.temperature ?? config.temperature,
          max_tokens: options.maxTokens ?? 400
        }),
        signal: AbortSignal.timeout(config.timeoutMs)
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        throw new Error(`LLM request failed: ${res.status} ${detail}`);
      }
      const data = await res.json();
      const text = messageText(data.choices && data.choices[0] && data.choices[0].message);
      if (!text) throw new Error('LLM returned an empty response');
      return text;
    }
  };
}

module.exports = { createLlmClient };
