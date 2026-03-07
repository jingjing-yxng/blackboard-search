// Unified LLM client for Claude, OpenAI, and DeepSeek

const PROVIDER_CONFIG = {
  claude: {
    url: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    name: 'Claude'
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4.1-mini',
    name: 'OpenAI'
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    name: 'DeepSeek'
  }
};

class LLMClient {
  constructor(provider, apiKey, model) {
    this.provider = provider;
    this.apiKey = apiKey;
    const config = PROVIDER_CONFIG[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);
    this.config = config;
    this.model = model || config.defaultModel;
    this.abortController = null;
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async query(systemPrompt, userMessage) {
    if (this.provider === 'claude') {
      return this._queryClaude(systemPrompt, userMessage);
    }
    // OpenAI and DeepSeek use the same format
    return this._queryOpenAICompatible(systemPrompt, userMessage);
  }

  async chat(systemPrompt, messages) {
    if (this.provider === 'claude') {
      return this._chatClaude(systemPrompt, messages);
    }
    return this._chatOpenAICompatible(systemPrompt, messages);
  }

  async _chatClaude(systemPrompt, messages) {
    this.abortController = new AbortController();
    const response = await fetch(this.config.url, {
      method: 'POST',
      signal: this.abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async _chatOpenAICompatible(systemPrompt, messages) {
    this.abortController = new AbortController();
    const response = await fetch(this.config.url, {
      method: 'POST',
      signal: this.abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${this.config.name} API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async _queryClaude(systemPrompt, userMessage) {
    this.abortController = new AbortController();
    const response = await fetch(this.config.url, {
      method: 'POST',
      signal: this.abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async _queryOpenAICompatible(systemPrompt, userMessage) {
    this.abortController = new AbortController();
    const response = await fetch(this.config.url, {
      method: 'POST',
      signal: this.abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${this.config.name} API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Validate API key with a minimal test call
  async validate() {
    try {
      const result = await this.query(
        'You are a test. Reply with exactly: OK',
        'Test connection.'
      );
      return { valid: true, message: `Connected to ${this.config.name}` };
    } catch (err) {
      return { valid: false, message: err.message };
    }
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.LLMClient = LLMClient;
  window.PROVIDER_CONFIG = PROVIDER_CONFIG;
}
