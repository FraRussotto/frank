import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  dailyBriefingEnabled: boolean;
  dailyBriefingTime: string; // HH:mm format, e.g. "08:30"
  botUsername?: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'config', 'telegram.json');

const DEFAULT_CONFIG: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  dailyBriefingEnabled: true,
  dailyBriefingTime: '08:30'
};

export function loadTelegramConfig(): TelegramConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      return {
        ...DEFAULT_CONFIG,
        ...data,
        botToken: data.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: data.chatId || process.env.TELEGRAM_CHAT_ID || ''
      };
    }
  } catch (err) {
    console.warn('Errore lettura config telegram.json:', err);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveTelegramConfig(updates: Partial<TelegramConfig>): TelegramConfig {
  const current = loadTelegramConfig();
  const updated: TelegramConfig = {
    ...current,
    ...updates
  };

  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('Errore salvataggio telegram.json:', err);
  }

  return updated;
}
