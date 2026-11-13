import { existsSync, readFileSync } from 'node:fs';
import { LARAVEL_ENV_PATH } from './paths';

export function getAiCredentials(): { provider: 'gemini' | 'perplexity' | 'none'; apiKey: string } {
  // 1. Priorità assoluta a GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY.trim() };
  }

  // 2. Controllo file .env o variabile di sistema
  if (existsSync(LARAVEL_ENV_PATH)) {
    try {
      const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
      const geminiMatch = content.match(/GEMINI_API_KEY=(.+)/);
      if (geminiMatch && geminiMatch[1]?.trim()) {
        return { provider: 'gemini', apiKey: geminiMatch[1].trim() };
      }
      const pplxMatch = content.match(/PERPLEXITY_API_KEY=(.+)/) || content.match(/OPENAI_API_KEY=(pplx-.+)/);
      if (pplxMatch && pplxMatch[1]?.trim()) {
        return { provider: 'perplexity', apiKey: pplxMatch[1].trim() };
      }
    } catch {}
  }

  // 3. Fallback Perplexity
  if (process.env.PERPLEXITY_API_KEY && process.env.PERPLEXITY_API_KEY.trim().length > 0) {
    return { provider: 'perplexity', apiKey: process.env.PERPLEXITY_API_KEY.trim() };
  }

  const legacyKey = process.env.OPENAI_API_KEY || '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';
  if (legacyKey.startsWith('pplx-')) {
    return { provider: 'perplexity', apiKey: legacyKey };
  }

  return { provider: 'none', apiKey: '' };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callAiModel(messages: ChatMessage[], options: { temperature?: number; jsonMode?: boolean } = {}): Promise<string> {
  const { provider, apiKey } = getAiCredentials();

  if (provider === 'gemini') {
    // Chiamata a Google Gemini 2.5 Flash
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const systemMsg = messages.find(m => m.role === 'system')?.content;
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const body: any = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2
      }
    };

    if (systemMsg) {
      body.systemInstruction = {
        parts: [{ text: systemMsg }]
      };
    }

    if (options.jsonMode) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // Fallback Perplexity Sonar
  const endpoint = 'https://api.perplexity.ai/chat/completions';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages,
      temperature: options.temperature ?? 0.1
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

