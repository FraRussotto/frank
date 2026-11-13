import { Bot } from 'grammy';
import { loadTelegramConfig, saveTelegramConfig, getAllowedChatIds, TelegramConfig } from './config';
import { generateDailyBriefing } from '../orchestrator/dailyBriefing';
import { deadlineEngine } from '../orchestrator/deadlineEngine';
import { superAgent } from '../orchestrator/superAgent';
import { getAllAnalysesMap } from '../orchestrator/autonomousAgentProxy';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

import { FRANK_DB_PATH } from '../paths';

class TelegramBotManager {
  private bot: Bot | null = null;
  private isRunning = false;
  private botUsername: string | null = null;
  private isInitializing = false;

  constructor() {
    // Non avviare automaticamente nel costruttore per non bloccare build statiche
  }

  public getStatus() {
    const config = loadTelegramConfig();
    return {
      configured: Boolean(config.botToken && config.botToken.trim().length > 10),
      running: this.isRunning,
      botUsername: this.botUsername,
      chatId: config.chatId,
      allowedChatIds: getAllowedChatIds(config),
      dailyBriefingEnabled: config.dailyBriefingEnabled,
      dailyBriefingTime: config.dailyBriefingTime
    };
  }

  public async initBot() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    const config = loadTelegramConfig();
    if (!config.botToken || config.botToken.trim().length < 10) {
      console.log('[Telegram Bot] Nessun token configurato. In attesa di configurazione da interfaccia o config/telegram.json.');
      this.isInitializing = false;
      return;
    }

    if (this.bot) {
      try {
        await this.bot.stop();
      } catch {}
      this.bot = null;
      this.isRunning = false;
    }

    try {
      const bot = new Bot(config.botToken.trim());
      this.bot = bot;

      // Gestore errori globale del bot per non far mai crashare il processo Node
      bot.catch((err) => {
        console.warn('[Telegram Bot] Errore interno gestito:', err.message);
      });

      // Registra comandi e gestori
      this.registerHandlers();

      // Avvia in background con gestione del polling e prevenzione conflitti
      bot.start({
        drop_pending_updates: true,
        onStart: (botInfo) => {
          this.isRunning = true;
          this.isInitializing = false;
          this.botUsername = botInfo.username;
          saveTelegramConfig({ botUsername: botInfo.username });
          console.log(`[Telegram Bot] Avviato con successo come @${botInfo.username}`);
        }
      }).catch((err: any) => {
        this.isRunning = false;
        this.isInitializing = false;
        if (err?.error_code === 409) {
          console.warn('[Telegram Bot] Polling conflict 409 temporaneo durante il reload.');
        } else {
          console.error('[Telegram Bot] Errore esecuzione bot:', err.message);
        }
      });
    } catch (err: any) {
      this.isRunning = false;
      this.isInitializing = false;
      console.error('[Telegram Bot] Errore inizializzazione:', err.message);
    }
  }

  private registerHandlers() {
    if (!this.bot) return;

    // 🛡️ SICUREZZA & PRIVACY: Solo gli account presenti nella whitelist possono comunicare con Frank
    this.bot.use(async (ctx, next) => {
      const config = loadTelegramConfig();
      const senderChatId = String(ctx.chat?.id || '');
      const senderUserId = String(ctx.from?.id || '');
      const text = ctx.message?.text?.trim() || '';

      // Se un utente chiede il proprio ID tramite /id o /myid, rispondiamo con il suo ID numerico
      // così può comunicarlo a Francesco per farsi abilitare
      if (text === '/id' || text === '/myid') {
        const idToShow = senderUserId || senderChatId;
        await ctx.reply(`🆔 *Il tuo ID Telegram:* \`${idToShow}\``, { parse_mode: 'Markdown' });
        return;
      }

      // Se non è ancora configurato alcun chatId, consentiamo solo il primo comando /start per il pairing iniziale
      const allowedIds = getAllowedChatIds(config);
      if (allowedIds.length === 0) {
        if (text.startsWith('/start')) {
          return next();
        }
        await ctx.reply('Questo bot è privato, utilizzo negato');
        return;
      }

      // Verifica rigorosa: il mittente DEVE essere presente nella whitelist
      const isAuthorized = allowedIds.includes(senderChatId) || allowedIds.includes(senderUserId);

      if (!isAuthorized) {
        console.warn(`[Telegram Security] 🚨 Accesso bloccato per utente non autorizzato: @${ctx.from?.username || 'anonimo'} (ID: ${senderUserId}, Chat: ${senderChatId})`);
        await ctx.reply('Questo bot è privato, utilizzo negato');
        return;
      }

      // Utente autorizzato
      await next();
    });

    const divider = '━━━━━━━━━━━━━━━━━━━━';
    const formatEuro = (val: number) =>
      new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

    // Comando per autorizzare un nuovo ID: /autorizza <ID>
    this.bot.command('autorizza', async (ctx) => {
      const newId = ctx.match?.trim();
      if (!newId || !/^\d+$/.test(newId)) {
        await ctx.reply('⚠️ Specifica l\'ID numerico Telegram da autorizzare. Es: `/autorizza 12345678`\n_(L\'altra persona può scoprire il suo ID inviando /id al bot)_', { parse_mode: 'Markdown' });
        return;
      }

      const config = loadTelegramConfig();
      const currentList = getAllowedChatIds(config);
      if (currentList.includes(newId)) {
        await ctx.reply(`ℹ️ L'ID \`${newId}\` è già autorizzato.`, { parse_mode: 'Markdown' });
        return;
      }

      const updatedList = [...currentList, newId];
      saveTelegramConfig({ allowedChatIds: updatedList });
      await ctx.reply(`✅ ID \`${newId}\` aggiunto alla whitelist!\nOra questo account può utilizzare Frank.`, { parse_mode: 'Markdown' });
    });

    // Comando per revocare un ID: /revoca <ID>
    this.bot.command('revoca', async (ctx) => {
      const targetId = ctx.match?.trim();
      if (!targetId) {
        await ctx.reply('⚠️ Specifica l\'ID da revocare. Es: `/revoca 12345678`', { parse_mode: 'Markdown' });
        return;
      }

      const config = loadTelegramConfig();
      let currentList = getAllowedChatIds(config);
      if (!currentList.includes(targetId)) {
        await ctx.reply(`ℹ️ L'ID \`${targetId}\` non è presente nella whitelist.`, { parse_mode: 'Markdown' });
        return;
      }

      if (targetId === config.chatId && currentList.length === 1) {
        await ctx.reply('⚠️ Non puoi revocare l\'unico ID amministratore registrato.', { parse_mode: 'Markdown' });
        return;
      }

      currentList = currentList.filter(id => id !== targetId);
      const newPrimary = config.chatId === targetId ? (currentList[0] || '') : config.chatId;
      saveTelegramConfig({ allowedChatIds: currentList, chatId: newPrimary });
      await ctx.reply(`🚫 ID \`${targetId}\` rimosso dalla whitelist. Non ha più accesso a Frank.`, { parse_mode: 'Markdown' });
    });

    // Comando /whitelist per visualizzare tutti gli ID autorizzati
    this.bot.command('whitelist', async (ctx) => {
      const config = loadTelegramConfig();
      const list = getAllowedChatIds(config);
      let text = `🛡️ *Account Telegram Autorizzati (${list.length}):*\n\n`;
      list.forEach(id => {
        const isPrimary = id === config.chatId ? ' 👑 *(Principale per Briefing)*' : '';
        text += `• \`${id}\`${isPrimary}\n`;
      });
      text += `\n_Aggiungi:_ \`/autorizza <id>\`\n_Rimuovi:_ \`/revoca <id>\``;
      await ctx.reply(text, { parse_mode: 'Markdown' });
    });

    // Comando /start
    this.bot.command('start', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const config = loadTelegramConfig();
      const allowed = getAllowedChatIds(config);

      // Se la whitelist ha già account e questo utente non fa parte di allowed, rifiuta
      if (allowed.length > 0 && !allowed.includes(chatId)) {
        await ctx.reply('Questo bot è privato, utilizzo negato');
        return;
      }

      if (!config.chatId) {
        saveTelegramConfig({ chatId, allowedChatIds: [chatId] });
      }

      const welcome = `👋 *Ciao Francesco! Sono Frank, il tuo Super Agente personale.*\n\n` +
        `Ho collegato con successo questo canale al tuo Second Brain.\n` +
        `${divider}\n\n` +
        `*Cosa posso fare per te qui:*\n` +
        `☕ Invio del *Briefing Mattutino* con focus email e impegni\n` +
        `💼 Monitoraggio dei fronti *Lavoro* urgenti\n` +
        `🏠 Gestione scadenze e *Spese Fisse* (manuali vs automatiche)\n` +
        `💬 Risposte a domande libere (es. _"Quanto pago di palestra?"_)\n\n` +
        `${divider}\n\n` +
        `⚡ *Comandi Rapidi:*\n` +
        `• /briefing — Mostra il briefing del giorno\n` +
        `• /spese — Spese fisse e totale mensile\n` +
        `• /scadenze — Scadenze personali aperte\n` +
        `• /lavoro — Task urgenti sulle email\n` +
        `• \`/fatto <id>\` — Segna una scadenza come completata\n\n` +
        `_Ti preparo e invio subito il briefing di oggi:_`;

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

      let text = `🏠 *SCADENZE PERSONALI (${deadlines.length})*\n${divider}\n\n`;
      deadlines.forEach((d, idx) => {
        let badge = '';
        if (d.daysRemaining === 0) badge = '⚠️ *Scade OGGI*';
        else if (d.daysRemaining === 1) badge = '⏳ *Entro Domani*';
        else if ((d.daysRemaining ?? 0) < 0) badge = `🔴 *Scaduto (${Math.abs(d.daysRemaining!)} gg fa)*`;
        else badge = `🗓️ *Tra ${d.daysRemaining} giorni* (${d.dueDate})`;

        const amountStr = d.amount ? ` • *${formatEuro(d.amount)}*` : '';
        text += `📌 *${d.title}*${amountStr}\n`;
        text += `   ${badge}\n`;
        text += `   🆔 \`/fatto ${d.id}\`\n`;

        if (idx < deadlines.length - 1) {
          text += `\n`;
        }
      });

      text += `\n${divider}\n`;
      text += `💡 _Tocca un comando \`/fatto <id>\` per copiarlo e segnare la scadenza completata._`;
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

        const manualList: any[] = [];
        const autoList: any[] = [];

        for (const e of expenses) {
          const amt = Number(e.amount) || 0;
          let factor = 1;
          if (e.frequency === 'Annuale') factor = 1 / 12;
          else if (e.frequency === 'Bimestrale') factor = 1 / 2;
          const monthly = amt * factor;
          total += monthly;

          const isAuto = Boolean(e.is_auto_debit);
          if (isAuto) {
            autoTotal += monthly;
            autoList.push({ ...e, monthlyAmt: monthly, origAmt: amt });
          } else {
            manualTotal += monthly;
            manualList.push({ ...e, monthlyAmt: monthly, origAmt: amt });
          }
        }

        let text = `💳 *SPESE & BUDGET MENSILE*\n${divider}\n\n`;

        // Blocco Da Saldare a Mano
        text += `🖐️ *DA SALDARE A MANO*\n`;
        if (manualList.length > 0) {
          manualList.forEach(e => {
            const freqNote = e.frequency && e.frequency !== 'Mensile' ? ` _(${e.frequency})_` : '';
            text += `• *${e.name}:* ${formatEuro(e.origAmt)}${freqNote}\n`;
            text += `  ↳ Scadenza: _ogni ${e.due_day}° del mese_\n`;
          });
        } else {
          text += `• _Nessun pagamento manuale previsto._\n`;
        }

        text += `\n🔄 *ADDEBITI AUTOMATICI (RID / SDD)*\n`;
        if (autoList.length > 0) {
          autoList.forEach(e => {
            const freqNote = e.frequency && e.frequency !== 'Mensile' ? ` _(${e.frequency})_` : '';
            text += `• *${e.name}:* ${formatEuro(e.origAmt)}${freqNote} _(il ${e.due_day}° del mese)_\n`;
          });
        } else {
          text += `• _Nessun addebito automatico registrato._\n`;
        }

        text += `\n${divider}\n`;
        text += `📊 *RIEPILOGO MENSILE*\n`;
        text += `• Da saldare a mano: *${formatEuro(manualTotal)}*\n`;
        text += `• Addebiti automatici: *${formatEuro(autoTotal)}*\n`;
        text += `💰 *Totale uscite mese: ${formatEuro(total)}*`;

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

      const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      let text = `💼 *FRONTI LAVORATIVI APERTI (${hotThreads.length})*\n${divider}\n\n`;

      hotThreads.slice(0, 5).forEach((t, idx) => {
        const num = numEmojis[idx] || `•`;
        const urgency = (t.urgency || 'media').toUpperCase();
        let urgencyBadge = '🟡 Media';
        if (urgency === 'ALTA' || urgency === 'HIGH') urgencyBadge = '🔴 *Alta*';
        else if (urgency === 'BASSA' || urgency === 'LOW') urgencyBadge = '🟢 Bassa';

        text += `${num} *${t.subject || 'Thread senza oggetto'}*\n`;
        text += `   Priorità: ${urgencyBadge}\n`;
        if (t.summary) {
          text += `   _${t.summary.trim()}_\n`;
        }
        if (idx < Math.min(hotThreads.length, 5) - 1) {
          text += `\n`;
        }
      });

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

