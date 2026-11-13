import { loadTelegramConfig } from './config';
import { telegramBot } from './telegramBot';

let lastSentDate: string | null = null;
let timer: NodeJS.Timeout | null = null;

export function initTelegramScheduler() {
  if (timer) clearInterval(timer);

  console.log('[Telegram Scheduler] Inizializzato scheduler per il Briefing Mattutino.');

  // Controlla ogni 30 secondi
  timer = setInterval(async () => {
    const config = loadTelegramConfig();
    if (!config.dailyBriefingEnabled || !config.chatId || !config.botToken) {
      return;
    }

    const now = new Date();
    // Calcola ora in fuso orario locale (Europe/Rome)
    const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
    const todayStr = now.toISOString().split('T')[0];

    const targetTime = config.dailyBriefingTime || '08:30';

    if (timeStr === targetTime && lastSentDate !== todayStr) {
      console.log(`[Telegram Scheduler] Orario coincidente (${timeStr}). Invio del briefing mattutino a Telegram...`);
      lastSentDate = todayStr;
      const res = await telegramBot.sendDailyBriefing();
      if (res.success) {
        console.log('[Telegram Scheduler] Briefing mattutino inviato con successo!');
      } else {
        console.warn('[Telegram Scheduler] Invio briefing fallito:', res.error);
      }
    }
  }, 30000);
}
