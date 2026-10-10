// Minimal OpenAI-compatible chat completions client (works with OpenAI, OpenRouter, Ollama, etc.).
function createLlmClient(config) {
  return {
    isConfigured: () => Boolean(config.apiKey),
    async complete(messages, options = {}) {
      if (!config.apiKey) throw new Error('LLM_API_KEY is not set');
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', config.apiKey].join(' ') },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options.temperature ?? config.temperature,
          max_tokens: options.maxTokens ?? 400
        }),
        signal: AbortSignal.timeout(config.timeoutMs)
      });
      if (!res.ok) {
        throw new Error(`LLM request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error('LLM returned an empty response');
      return text.trim();
    }
  };
}

module.exports = { createLlmClient };
