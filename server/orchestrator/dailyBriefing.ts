import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { deadlineEngine } from './deadlineEngine';
import { getAllAnalysesMap } from './autonomousAgentProxy';

const EMAIL_DB_PATH = '/Users/fra_russo/email-ai-agent/database/database.sqlite';
const LARAVEL_ENV_PATH = '/Users/fra_russo/email-ai-agent/.env';

function getAiApiKey(): string {
  if (existsSync(LARAVEL_ENV_PATH)) {
    const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
    const m = content.match(/OPENAI_API_KEY=(.+)/);
    if (m && m[1]) return m[1].trim();
  }
  return process.env.OPENAI_API_KEY || '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';
}

export interface DailyBriefingPayload {
  date: string;
  dayOfWeek: string;
  workSummary: string;
  todayMeetings: Array<{ time: string; title: string; sender?: string }>;
  personalDeadlines: Array<{ title: string; dueDate: string; amount?: number; daysRemaining?: number; category: string }>;
  fullMessageText: string;
}

export async function generateDailyBriefing(): Promise<DailyBriefingPayload> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const dayOfWeek = dayNames[now.getDay()];
  const formattedDate = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  // 1. RACCOLTA DATI LAVORO (Email Thread Attivi)
  const analyses = getAllAnalysesMap();
  const hotThreads: Array<{ subject: string; summary: string }> = [];
  analyses.forEach((a) => {
    if (a.myActionRequired || a.status === 'action_required') {
      hotThreads.push({
        subject: a.subject || 'Thread senza titolo',
        summary: a.summary || ''
      });
    }
  });

  // Sintesi ad alto livello per il lavoro tramite Sonar
  let workSummary = 'Nessun fronte critico di lavoro al momento.';
  const apiKey = getAiApiKey();

  if (hotThreads.length > 0 && apiKey) {
    const prompt = `Sei Frank, il Super Agente di Francesco Russotto.
Oggi è ${dayOfWeek} ${formattedDate}.
I thread lavorativi aperti con attività a suo carico riguardano:
${hotThreads.slice(0, 6).map(t => `- ${t.subject}: ${t.summary}`).join('\n')}

Scrivi una sintesi giornaliera dell'Area Lavoro MOLTO GENERALE e di alto livello (massimo 2-3 frasi discorsive, NON fare una to-do list o un elenco puntato dettagliato).
Deve sembrare un messaggio naturale del tipo:
"Oggi devi concentrarti principalmente su Citterio per le questioni di hosting e reCAPTCHA, e chiudere la proposta per Studio Cozzi. In secondo piano tenere d'occhio Dreame."
Sii diretto, esecutivo e fluido.`;

    try {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            { role: 'system', content: 'Rispondi in modo conciso, naturale e discorsivo, senza liste puntate o preamboli.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 250
        })
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) workSummary = content;
      }
    } catch (err) {
      console.warn('Errore generazione workSummary Sonar:', err);
      // Fallback
      workSummary = `Oggi i fronti aperti principali riguardano: ${hotThreads.slice(0, 3).map(t => t.subject).join(', ')}.`;
    }
  }

  // 2. RACCOLTA MEETINGS DI OGGI (Calendario)
  const todayMeetings: Array<{ time: string; title: string; sender?: string }> = [];
  if (existsSync(EMAIL_DB_PATH)) {
    try {
      const emailDb = new DatabaseSync(EMAIL_DB_PATH, { readOnly: true });
      emailDb.exec('PRAGMA busy_timeout = 3000;');
      const rows = emailDb.prepare(`
        SELECT subject, sender, event_start_at
        FROM emails
        WHERE source_type = 'meeting'
          AND event_start_at LIKE ?
          AND LOWER(TRIM(subject)) NOT IN ('home', 'office')
          AND subject NOT LIKE '%call settimanale AREA Sviluppo IT%'
          AND subject NOT LIKE '%IDIA - Perniceni%'
        ORDER BY event_start_at ASC
      `).all(`${todayStr}%`) as any[];
      emailDb.close();

      rows.forEach(r => {
        const timePart = (r.event_start_at || '').split(' ')[1] || (r.event_start_at || '').split('T')[1] || '';
        const timeFormatted = timePart.substring(0, 5) || 'Orario da definire';
        todayMeetings.push({
          time: timeFormatted,
          title: r.subject,
          sender: r.sender
        });
      });
    } catch (err) {
      console.warn('Errore lettura meeting odierni:', err);
    }
  }

  // 3. RACCOLTA SCADENZE & AVVISI VITA PERSONALE
  const { deadlines } = deadlineEngine.getDeadlines({ scope: 'personal', status: 'pending' });
  // Filtra quelle scadute, di oggi o nei prossimi 7 giorni (o le prime 3 spese future se non ce ne sono imminenti)
  const imminentPersonal = deadlines.filter(d => (d.daysRemaining ?? 999) <= 7);
  const displayPersonal = imminentPersonal.length > 0 ? imminentPersonal : deadlines.slice(0, 3);

  const personalDeadlines = displayPersonal.map(d => ({
    title: d.title,
    dueDate: d.dueDate,
    amount: d.amount,
    daysRemaining: d.daysRemaining,
    category: d.category
  }));

  // 4. COMPOSIZIONE MESSAGGIO TELEGRAM COMPLETO
  let msg = `☕ *Buongiorno Francesco!* Ecco il tuo briefing di oggi, *${dayOfWeek} ${formattedDate}*:\n\n`;

  // SEZIONE LAVORO
  msg += `💼 *AREA LAVORO*\n`;
  msg += `• *Focus del Giorno:*\n  ${workSummary}\n\n`;
  msg += `• *Riunioni di Oggi:*\n`;
  if (todayMeetings.length > 0) {
    todayMeetings.forEach(m => {
      msg += `  📅 *${m.time}* - ${m.title}${m.sender ? ` (con ${m.sender})` : ''}\n`;
    });
  } else {
    msg += `  _Nessuna riunione a calendario per oggi._\n`;
  }

  msg += `\n`;

  // SEZIONE PERSONALE
  msg += `🏠 *AREA PERSONALE (SCADENZE & AVVISI)*\n`;
  if (personalDeadlines.length > 0) {
    personalDeadlines.forEach(p => {
      let countdown = '';
      if (p.daysRemaining === 0) countdown = '⚠️ *SCADE OGGI*';
      else if (p.daysRemaining === 1) countdown = '⏳ *Entro Domani*';
      else if ((p.daysRemaining ?? 0) < 0) countdown = `🔴 *Scaduto (${Math.abs(p.daysRemaining!)} gg fa)*`;
      else countdown = `🗓️ Tra ${p.daysRemaining} giorni (${p.dueDate})`;

      const amountStr = p.amount ? ` [€${p.amount}]` : '';
      msg += `• ${p.title}${amountStr}\n  ↳ ${countdown}\n`;
    });
  } else {
    msg += `  _Nessuna scadenza personale imminente._\n`;
  }

  return {
    date: todayStr,
    dayOfWeek,
    workSummary,
    todayMeetings,
    personalDeadlines,
    fullMessageText: msg
  };
}
