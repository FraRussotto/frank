import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { deadlineEngine } from './deadlineEngine';
import { getAllAnalysesMap } from './autonomousAgentProxy';
import { callAiModel } from '../aiClient';

import { EMAIL_DB_PATH, FRANK_DB_PATH, LARAVEL_ENV_PATH } from '../paths';

function extractProjectOrClient(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes('citterio')) return 'Citterio';
  if (s.includes('inodorina')) return 'Inodorina';
  if (s.includes('electrolux') || s.includes('promoelectrolux') || s.includes('aeg')) return 'Electrolux';
  if (s.includes('dreame')) return 'Dreame';
  if (s.includes('studio cozzi') || s.includes('cozzi')) return 'Studio Cozzi';
  if (s.includes('dyson')) return 'Dyson';
  if (s.includes('aglam')) return 'Aglam';
  if (s.includes('g7') || s.includes('gelati')) return 'Gelati G7';
  if (s.includes('eye-able') || s.includes('accessibilità')) return 'Eye-Able';
  if (s.includes('dropbox')) return 'Dropbox';
  if (s.includes('noixapp')) return 'NoixApp';
  
  return subject
    .replace(/^(re|fwd|i|r):\s*/gi, '')
    .replace(/^(re|fwd|i|r):\s*/gi, '')
    .trim()
    .slice(0, 32);
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

  // 0. SINCRONIZZAZIONE PROATTIVA DELLE SCADENZE & SPESE
  try {
    await deadlineEngine.syncFromAllSubagents();
  } catch (err) {
    console.warn('Errore syncFromAllSubagents in dailyBriefing:', err);
  }

  // 1. RACCOLTA DATI LAVORO (Email Thread Attivi & Task Operativi)
  const analyses = getAllAnalysesMap();
  const hotProjects: Array<{
    client: string;
    subject: string;
    tasks: string[];
    urgency: string;
  }> = [];

  analyses.forEach((a) => {
    const activeTasks = Array.isArray(a.activeTasks) ? a.activeTasks : [];
    // Considera prioritari solo i thread che hanno DAVVERO attività attive pendenti a carico di Francesco
    if (activeTasks.length > 0 && (a.myActionRequired || a.status === 'action_required')) {
      const client = extractProjectOrClient(a.subject || '');
      const taskSummaries = activeTasks.map((t: any) => t.summary).filter(Boolean);
      if (taskSummaries.length > 0) {
        hotProjects.push({
          client,
          subject: a.subject || 'Thread senza titolo',
          tasks: taskSummaries,
          urgency: activeTasks.some((t: any) => t.urgency === 'high' || t.urgency === 'alta') ? 'alta' : 'media'
        });
      }
    }
  });

  // Raggruppa i task per cliente/progetto
  const groupedClients = new Map<string, { tasks: string[]; highUrgency: boolean; subjects: string[] }>();
  for (const p of hotProjects) {
    const cur = groupedClients.get(p.client) || { tasks: [], highUrgency: false, subjects: [] };
    cur.tasks.push(...p.tasks);
    if (p.urgency === 'alta') cur.highUrgency = true;
    if (!cur.subjects.includes(p.subject)) cur.subjects.push(p.subject);
    groupedClients.set(p.client, cur);
  }

  // Costruisce la sintesi di lavoro: executive intro + checklist per i top clienti
  let workSummary = 'Nessun fronte critico di lavoro al momento.';

  if (groupedClients.size > 0) {
    // Ordina prima i clienti con alta urgenza
    const sortedClients = Array.from(groupedClients.entries()).sort((a, b) => {
      if (a[1].highUrgency && !b[1].highUrgency) return -1;
      if (!a[1].highUrgency && b[1].highUrgency) return 1;
      return b[1].tasks.length - a[1].tasks.length;
    });

    const topClients = sortedClients.slice(0, 4);

    // Costruisce il fallback deterministico impeccabile con la lista reale dei task
    const fallbackBlocks: string[] = [];
    for (const [client, data] of topClients) {
      const uniqueTasks = Array.from(new Set(data.tasks)).slice(0, 3);
      const taskLines = uniqueTasks.map(t => `  ▫️ ${t}`).join('\n');
      fallbackBlocks.push(`• *${client}*:\n${taskLines}`);
    }
    const deterministicFallback = `Fronti operativi e attività aperte da completare oggi:\n\n${fallbackBlocks.join('\n\n')}`;

    // Prompt per l'AI
    const summaryForPrompt = topClients.map(([client, data]) => {
      const uniqueTasks = Array.from(new Set(data.tasks)).slice(0, 3);
      return `Progetto/Cliente: ${client}\nTask da fare:\n${uniqueTasks.map(t => `- ${t}`).join('\n')}`;
    }).join('\n\n');

    const prompt = `Sei Frank, il Super Agente personale ed esecutivo di Francesco Russotto.
Oggi è ${dayOfWeek} ${formattedDate}.

Ecco le attività e i task concreti rimasti da fare oggi per i progetti e clienti principali:
${summaryForPrompt}

Scrivi il blocco "Focus di oggi" per il briefing su Telegram.
STRUTTURA OBBLIGATORIA:
1. Una singola frase introduttiva (1-2 righe) esecutiva che riassuma le priorità chiave (es. chiudere Citterio e predisporre le attività Inodorina).
2. Per ciascuno dei clienti/progetti sopra elencati, scrivi un blocco chiaro con i task concreti:
• *<NomeCliente>*:
  ▫️ <Task concreto 1>
  ▫️ <Task concreto 2>

Non usare convenevoli, preamboli o saluti finali. Rispondi solo con il blocco strutturato.`;

    try {
      const content = await callAiModel([
        { role: 'system', content: 'Rispondi in modo pulito ed esecutivo con testo Markdown compatibile con Telegram.' },
        { role: 'user', content: prompt }
      ], { temperature: 0.2 });

      if (content && content.trim() && content.includes('•')) {
        workSummary = content.trim();
      } else {
        workSummary = deterministicFallback;
      }
    } catch (err) {
      console.warn('Errore generazione workSummary con AI, uso fallback deterministico:', err);
      workSummary = deterministicFallback;
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

  // Raccolta info spese con addebito automatico per completezza
  let autoDebitNote = '';
  try {
    const frankDb = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
    const autoDebits = frankDb.prepare('SELECT name, amount FROM fixed_expenses WHERE is_auto_debit = 1 AND is_paid = 0').all() as any[];
    frankDb.close();
    if (autoDebits.length > 0) {
      const totalAd = autoDebits.reduce((sum, e) => sum + (e.amount || 0), 0);
      const names = autoDebits.map(e => e.name).join(', ');
      const formatEuroSmall = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
      autoDebitNote = `\n💳 _${autoDebits.length} spese su addebito automatico monitorate (${names} • ${formatEuroSmall(totalAd)})_\n`;
    }
  } catch {}

  // 4. COMPOSIZIONE MESSAGGIO TELEGRAM COMPLETO (Layout pulito, spaziato ed executive)
  const formatEuro = (val?: number) => {
    if (val === undefined || val === null) return '';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  const divider = '━━━━━━━━━━━━━━━━━━━━';

  let msg = `☕ *Buongiorno Francesco!*\n`;
  msg += `📅 _${dayOfWeek}, ${formattedDate}_\n`;
  msg += `${divider}\n\n`;

  // SEZIONE LAVORO
  msg += `💼 *LAVORO & ATTIVITÀ*\n\n`;
  msg += `🎯 *Focus di oggi*\n`;
  msg += `${workSummary}\n\n`;

  msg += `🗓️ *Riunioni del giorno*\n`;
  if (todayMeetings.length > 0) {
    todayMeetings.forEach(m => {
      const senderText = m.sender ? ` _(con ${m.sender})_` : '';
      msg += `• *${m.time}* — ${m.title}${senderText}\n`;
    });
  } else {
    msg += `• _Nessuna riunione a calendario per oggi._\n`;
  }

  msg += `\n${divider}\n\n`;

  // SEZIONE PERSONALE
  msg += `🏠 *VITA PERSONALE & SCADENZE*\n\n`;
  if (personalDeadlines.length > 0) {
    personalDeadlines.forEach((p, idx) => {
      let countdown = '';
      if (p.daysRemaining === 0) countdown = '⚠️ *Scade OGGI*';
      else if (p.daysRemaining === 1) countdown = '⏳ *Entro Domani*';
      else if ((p.daysRemaining ?? 0) < 0) countdown = `🔴 *Scaduto (${Math.abs(p.daysRemaining!)} gg fa)*`;
      else countdown = `🗓️ *Tra ${p.daysRemaining} giorni* (${p.dueDate})`;

      const amountText = p.amount ? ` • *${formatEuro(p.amount)}*` : '';
      msg += `📌 *${p.title}*${amountText}\n`;
      msg += `   ${countdown}\n`;
      if (idx < personalDeadlines.length - 1) {
        msg += `\n`;
      }
    });
  } else {
    msg += `• _Nessuna spesa manuale o scadenza personale in sospeso._\n`;
  }

  if (autoDebitNote) {
    msg += `${autoDebitNote}`;
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

