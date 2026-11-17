import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { LARAVEL_ENV_PATH, CONFIG_DIR } from './paths';

export const AI_CONFIG_PATH = path.join(CONFIG_DIR, 'ai.json');

export interface AiConfig {
  provider: 'gemini' | 'perplexity';
  geminiApiKey?: string;
  geminiModel?: string; // 'gemini-2.5-pro' | 'gemini-2.5-flash-thinking' | 'gemini-2.5-flash'
  perplexityApiKey?: string;
  perplexityModel?: string;
  updatedAt?: string;
}

export function loadAiConfig(): AiConfig {
  if (existsSync(AI_CONFIG_PATH)) {
    try {
      const raw = readFileSync(AI_CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch {}
  }
  return {
    provider: 'gemini',
    geminiModel: 'gemini-2.5-pro'
  };
}

export function saveAiConfig(partial: Partial<AiConfig>): AiConfig {
  const current = loadAiConfig();
  const updated: AiConfig = {
    ...current,
    ...partial,
    updatedAt: new Date().toISOString()
  };
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(AI_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[AI Config] Impossibile salvare config/ai.json:', err);
  }
  return updated;
}

export function getAiCredentials(): { provider: 'gemini' | 'perplexity' | 'none'; apiKey: string; model: string } {
  const fileConfig = loadAiConfig();

  // 1. Chiave Gemini salvata nelle impostazioni Frank
  if (fileConfig.geminiApiKey && fileConfig.geminiApiKey.trim().length > 0) {
    return {
      provider: 'gemini',
      apiKey: fileConfig.geminiApiKey.trim(),
      model: fileConfig.geminiModel || 'gemini-2.5-pro'
    };
  }

  // 2. Variabile d'ambiente di sistema GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY.trim(),
      model: fileConfig.geminiModel || 'gemini-2.5-pro'
    };
  }

  // 3. Controllo file .env (Laravel o locale)
  if (existsSync(LARAVEL_ENV_PATH)) {
    try {
      const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
      const geminiMatch = content.match(/GEMINI_API_KEY=(.+)/);
      if (geminiMatch && geminiMatch[1]?.trim()) {
        return {
          provider: 'gemini',
          apiKey: geminiMatch[1].trim(),
          model: fileConfig.geminiModel || 'gemini-2.5-pro'
        };
      }
      const pplxMatch = content.match(/PERPLEXITY_API_KEY=(.+)/) || content.match(/OPENAI_API_KEY=(pplx-.+)/);
      if (pplxMatch && pplxMatch[1]?.trim()) {
        return {
          provider: 'perplexity',
          apiKey: pplxMatch[1].trim(),
          model: 'sonar-pro'
        };
      }
    } catch {}
  }

  // 4. Fallback Perplexity se configurata via env
  if (process.env.PERPLEXITY_API_KEY && process.env.PERPLEXITY_API_KEY.trim().length > 0) {
    return {
      provider: 'perplexity',
      apiKey: process.env.PERPLEXITY_API_KEY.trim(),
      model: 'sonar-pro'
    };
  }

  const legacyKey = process.env.OPENAI_API_KEY || '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';
  if (legacyKey.startsWith('pplx-')) {
    return {
      provider: 'perplexity',
      apiKey: legacyKey,
      model: 'sonar-pro'
    };
  }

  return {
    provider: 'none',
    apiKey: '',
    model: 'none'
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallAiOptions {
  temperature?: number;
  jsonMode?: boolean;
  model?: string;
}

export interface CallAiResult {
  text: string;
  modelUsed: string;
  provider: 'gemini' | 'perplexity' | 'none';
}

export async function callAiModelWithMeta(
  messages: ChatMessage[],
  options: CallAiOptions = {}
): Promise<CallAiResult> {
  const { provider, apiKey, model: defaultModel } = getAiCredentials();
  const selectedModel = options.model || defaultModel;

  if (provider === 'gemini') {
    // Endpoint ufficiale Google Gemini API (v1beta)
    // Supporta gemini-2.5-pro, gemini-2.5-flash-thinking, gemini-2.5-flash
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

    const systemMsg = messages.find(m => m.role === 'system')?.content;
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // Costruzione turni compatibili con Gemini (user / model), fondendo eventuali messaggi consecutivi dello stesso ruolo
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const msg of conversationMessages) {
      const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
      if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) {
        contents[contents.length - 1].parts[0].text += `\n\n${msg.content}`;
      } else {
        contents.push({
          role: geminiRole,
          parts: [{ text: msg.content }]
        });
      }
    }

    // Se per qualche motivo contents è vuoto ma c'è un system message, trasformalo in user
    if (contents.length === 0 && systemMsg) {
      contents.push({ role: 'user', parts: [{ text: systemMsg }] });
    }

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
      throw new Error(`Google Gemini Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    return {
      text,
      modelUsed: `Google Gemini (${selectedModel})`,
      provider: 'gemini'
    };
  }

  // Provider Perplexity (fallback)
  const endpoint = 'https://api.perplexity.ai/chat/completions';
  const perplexityModel = selectedModel.startsWith('gemini') ? 'sonar-pro' : selectedModel;

  let res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: perplexityModel,
      messages,
      temperature: options.temperature ?? 0.1
    })
  });

  // Se incontra 429 Rate Limit, attendi 1.5s e riprova una volta
  if (res.status === 429) {
    console.warn('[AI Client] Perplexity 429 rate limit incontrato. Nuovo tentativo con modello sonar standard...');
    await new Promise(r => setTimeout(r, 1500));
    res = await fetch(endpoint, {
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
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';

  return {
    text,
    modelUsed: `Perplexity (${perplexityModel})`,
    provider: 'perplexity'
  };
}

export async function callAiModel(
  messages: ChatMessage[],
  options: CallAiOptions = {}
): Promise<string> {
  const result = await callAiModelWithMeta(messages, options);
  return result.text;
}
