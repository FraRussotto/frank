import { Bot } from 'grammy';
import { loadTelegramConfig, saveTelegramConfig, TelegramConfig } from './config';
import { generateDailyBriefing } from '../orchestrator/dailyBriefing';
import { deadlineEngine } from '../orchestrator/deadlineEngine';
import { superAgent } from '../orchestrator/superAgent';
import { getAllAnalysesMap } from '../orchestrator/autonomousAgentProxy';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const FRANK_DB_PATH = path.join(process.cwd(), 'database', 'frank_agent.sqlite');

class TelegramBotManager {
  private bot: Bot | null = null;
  private isRunning = false;
  private botUsername: string | null = null;

  constructor() {
    this.initBot();
  }

  public getStatus() {
    const config = loadTelegramConfig();
    return {
      configured: Boolean(config.botToken && config.botToken.trim().length > 10),
      running: this.isRunning,
      botUsername: this.botUsername,
      chatId: config.chatId,
      dailyBriefingEnabled: config.dailyBriefingEnabled,
      dailyBriefingTime: config.dailyBriefingTime
    };
  }

  public async initBot() {
    const config = loadTelegramConfig();
    if (!config.botToken || config.botToken.trim().length < 10) {
      console.log('[Telegram Bot] Nessun token configurato. In attesa di configurazione da interfaccia o config/telegram.json.');
      return;
    }

    if (this.isRunning && this.bot) {
      try {
        await this.bot.stop();
      } catch {}
      this.isRunning = false;
    }

    try {
      this.bot = new Bot(config.botToken.trim());

      // Registra comandi e gestori
      this.registerHandlers();

      // Avvia in background
      this.bot.start({
        onStart: (botInfo) => {
          this.isRunning = true;
          this.botUsername = botInfo.username;
          saveTelegramConfig({ botUsername: botInfo.username });
          console.log(`[Telegram Bot] Avviato con successo come @${botInfo.username}`);
        }
      });
    } catch (err: any) {
      console.error('[Telegram Bot] Errore inizializzazione:', err.message);
      this.isRunning = false;
    }
  }

  private registerHandlers() {
    if (!this.bot) return;

    // Comando /start
    this.bot.command('start', async (ctx) => {
      const chatId = String(ctx.chat.id);
      saveTelegramConfig({ chatId });

      const welcome = `👋 *Ciao Francesco! Sono Frank, il tuo Super Agente personale.*\n\n` +
        `Ho collegato questo canale Telegram al tuo Second Brain sul Mac.\n\n` +
        `*Cosa posso fare per te qui:*\n` +
        `• ☕ Invio automatico del *Briefing Mattutino* ogni giorno alle ore stabilite\n` +
        `• 💼 Monitoraggio prioritario dell'area *Lavoro* (email e riunioni)\n` +
        `• 🏠 Controllo delle *Scadenze Personali* e pagamenti del mese\n` +
        `• 💬 Rispondere a qualsiasi domanda in linguaggio naturale (es. _"Quanto pago di palestra?"_, _"Cos'ho a calendario oggi?"_)\n\n` +
        `*Comandi Rapidi:*\n` +
        `/briefing - Mostra il briefing completo di oggi\n` +
        `/scadenze - Visualizza le scadenze personali pendenti\n` +
        `/spese - Riepilogo spese fisse e budget del mese\n` +
        `/lavoro - Focus lavorativo ed email da gestire\n` +
        `/fatto <id> - Segna una scadenza come completata\n\n` +
        `_Ti invio subito il briefing di oggi:_`;

      await ctx.reply(welcome, { parse_mode: 'Markdown' });
      await this.sendDailyBriefing(chatId);
    });

    // Comando /briefing o /oggi
    this.bot.command(['briefing', 'oggi'], async (ctx) => {
      await ctx.reply('⏳ Preparo il briefing in tempo reale...');
      await this.sendDailyBriefing(String(ctx.chat.id));
    });

    // Comando /scadenze
    this.bot.command('scadenze', async (ctx) => {
      const { deadlines } = deadlineEngine.getDeadlines({ scope: 'personal', status: 'pending' });

      if (deadlines.length === 0) {
        await ctx.reply('🎉 *Nessuna scadenza personale pendente!* Tutto in regola.', { parse_mode: 'Markdown' });
        return;
      }

      let text = `🏠 *Scadenze Personali Pendenti (${deadlines.length}):*\n\n`;
      for (const d of deadlines) {
        let badge = '';
        if (d.daysRemaining === 0) badge = '⚠️ *OGGI*';
        else if (d.daysRemaining === 1) badge = '⏳ *DOMANI*';
        else if ((d.daysRemaining ?? 0) < 0) badge = `🔴 *Scaduto (${Math.abs(d.daysRemaining!)} gg fa)*`;
        else badge = `🗓️ Fra ${d.daysRemaining} gg (${d.dueDate})`;

        const amountStr = d.amount ? ` - *€ ${d.amount}*` : '';
        text += `• **${d.title}**${amountStr}\n  ↳ ${badge} | ID: \`${d.id}\`\n`;
      }

      text += `\n_Per completare una scadenza scrivi:_ \`/fatto <ID>\``;
      await ctx.reply(text, { parse_mode: 'Markdown' });
    });

    // Comando /spese
    this.bot.command('spese', async (ctx) => {
      try {
        const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
        const expenses = db.prepare('SELECT * FROM fixed_expenses ORDER BY due_day ASC').all() as any[];
        db.close();

        let total = 0;
        let manualTotal = 0;
        let autoTotal = 0;
        let text = `💳 *Riepilogo Spese Fisse Mensili:*\n\n`;

        for (const e of expenses) {
          const amt = Number(e.amount) || 0;
          let factor = 1;
          if (e.frequency === 'Annuale') factor = 1 / 12;
          else if (e.frequency === 'Bimestrale') factor = 1 / 2;
          const monthly = amt * factor;
          total += monthly;

          const isAuto = Boolean(e.is_auto_debit);
          if (isAuto) autoTotal += monthly;
          else manualTotal += monthly;

          const tag = isAuto ? '💳 _[Addebito Diretto/SDD]_' : '🖐️ *[Da pagare a mano]*';
          text += `• **${e.name}**: € ${amt.toFixed(2)} (${e.frequency}, il ${e.due_day}°) ${tag}\n`;
        }

        text += `\n📊 *Totale Mensile Normalizzato:* **€ ${total.toFixed(2)}**\n`;
        text += `  • Addebito automatico: € ${autoTotal.toFixed(2)}\n`;
        text += `  • Pagamenti manuali da effettuare: **€ ${manualTotal.toFixed(2)}**`;

        await ctx.reply(text, { parse_mode: 'Markdown' });
      } catch (err: any) {
        await ctx.reply(`Errore lettura spese: ${err.message}`);
      }
    });

    // Comando /lavoro
    this.bot.command('lavoro', async (ctx) => {
      const analyses = getAllAnalysesMap();
      const hotThreads: any[] = [];
      analyses.forEach((a) => {
        if (a.myActionRequired || a.status === 'action_required') {
          hotThreads.push(a);
        }
      });

      if (hotThreads.length === 0) {
        await ctx.reply('💼 *Nessun task urgente sulle email di lavoro al momento!*', { parse_mode: 'Markdown' });
        return;
      }

      let text = `💼 *Fronti Lavorativi Aperti (${hotThreads.length}):*\n\n`;
      for (const t of hotThreads.slice(0, 5)) {
        text += `• **${t.subject || 'Thread'}** [${(t.urgency || 'media').toUpperCase()}]\n`;
        if (t.summary) text += `  ${t.summary}\n`;
      }

      await ctx.reply(text, { parse_mode: 'Markdown' });
    });

    // Comando /fatto <id>
    this.bot.command('fatto', async (ctx) => {
      const id = ctx.match?.trim();
      if (!id) {
        await ctx.reply('Specifica l\'ID della scadenza. Es: `/fatto dl-1794563057253-tcydt`', { parse_mode: 'Markdown' });
        return;
      }

      try {
        const res = deadlineEngine.completeDeadline(id);
        if (res.success) {
          await ctx.reply(`✅ Scadenza \`${id}\` completata con successo!`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`⚠️ Scadenza non trovata con ID \`${id}\`. Usa /scadenze per vedere gli ID corretti.`, { parse_mode: 'Markdown' });
        }
      } catch (err: any) {
        await ctx.reply(`Errore: ${err.message}`);
      }
    });

    // Messaggi testuali liberi in linguaggio naturale
    this.bot.on('message:text', async (ctx) => {
      const userText = ctx.message.text;
      if (userText.startsWith('/')) return; // Comandi già gestiti

      // Simula digitazione
      await ctx.replyWithChatAction('typing');

      try {
        // Interroga Frank Super Agent
        const response = await superAgent.answerUserDialog([
          { role: 'user', content: userText }
        ]);

        let replyText = response.text || 'Non sono riuscito a elaborare la risposta.';
        await ctx.reply(replyText, { parse_mode: 'Markdown' }).catch(async () => {
          // Fallback se markdown Telegram contiene caratteri non escapati
          await ctx.reply(replyText);
        });
      } catch (err: any) {
        console.error('[Telegram Bot] Errore risposta:', err);
        await ctx.reply(`Si è verificato un errore nell'elaborazione: ${err.message}`);
      }
    });
  }

  /**
   * Invia il briefing del giorno a una chat specifica o a quella registrata
   */
  public async sendDailyBriefing(targetChatId?: string): Promise<{ success: boolean; error?: string }> {
    const config = loadTelegramConfig();
    const chatId = targetChatId || config.chatId;

    if (!chatId) {
      return { success: false, error: 'Nessun chatId configurato. Avvia il bot con /start da Telegram per collegarlo.' };
    }

    if (!this.bot) {
      return { success: false, error: 'Bot non inizializzato o token mancante.' };
    }

    try {
      const briefing = await generateDailyBriefing();
      await this.bot.api.sendMessage(chatId, briefing.fullMessageText, { parse_mode: 'Markdown' });
      return { success: true };
    } catch (err: any) {
      console.error('[Telegram Bot] Errore invio briefing:', err.message);
      // Tentativo senza markdown se fallisce il parsing
      try {
        const briefing = await generateDailyBriefing();
        await this.bot.api.sendMessage(chatId, briefing.fullMessageText);
        return { success: true };
      } catch (retryErr: any) {
        return { success: false, error: retryErr.message };
      }
    }
  }

  /**
   * Invia un messaggio personalizzato proattivo
   */
  public async sendMessage(text: string, targetChatId?: string): Promise<{ success: boolean; error?: string }> {
    const config = loadTelegramConfig();
    const chatId = targetChatId || config.chatId;

    if (!chatId || !this.bot) {
      return { success: false, error: 'Chat ID o Bot non configurato.' };
    }

    try {
      await this.bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      return { success: true };
    } catch (err: any) {
      try {
        await this.bot.api.sendMessage(chatId, text);
        return { success: true };
      } catch (retryErr: any) {
        return { success: false, error: retryErr.message };
      }
    }
  }
}

export const telegramBot = new TelegramBotManager();
