import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const FRANK_DB_DIR = '/Users/fra_russo/Frank/database';
const FRANK_DB_PATH = path.join(FRANK_DB_DIR, 'frank_agent.sqlite');
const EMAIL_DB_PATH = '/Users/fra_russo/email-ai-agent/database/database.sqlite';
const LARAVEL_ENV_PATH = '/Users/fra_russo/email-ai-agent/.env';
const BASELINE_DATE = '2026-11-01 00:00:00';

function getAiApiKey(): string {
  if (existsSync(LARAVEL_ENV_PATH)) {
    const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
    const m = content.match(/OPENAI_API_KEY=(.+)/);
    if (m && m[1]) return m[1].trim();
  }
  return process.env.OPENAI_API_KEY || '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';
}

// Assicura che la directory del database Frank esista
if (!existsSync(FRANK_DB_DIR)) {
  mkdirSync(FRANK_DB_DIR, { recursive: true });
}

// Inizializza il database SQLite dedicato a Frank Agent
export function initFrankDb(): any {
  const db = new DatabaseSync(FRANK_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS thread_analyses (
      thread_id TEXT PRIMARY KEY,
      last_email_id INTEGER,
      last_received_at TEXT,
      email_count INTEGER,
      subject TEXT,
      status TEXT,
      status_label TEXT,
      summary TEXT,
      my_action_required INTEGER,
      active_tasks_json TEXT,
      resolved_tasks_json TEXT,
      suggested_next_step TEXT,
      draft_reply_json TEXT,
      analyzed_at TEXT,
      model_used TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_thread_analyses_last_received ON thread_analyses(last_received_at);
  `);
  return db;
}

export function getAllAnalysesMap(): Map<string, any> {
  const map = new Map<string, any>();
  if (!existsSync(FRANK_DB_PATH)) return map;
  
  let db: any = null;
  try {
    db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
    const rows = db.prepare('SELECT * FROM thread_analyses').all() as any[];
    for (const r of rows) {
      map.set(r.thread_id, {
        threadId: r.thread_id,
        lastEmailId: r.last_email_id,
        lastReceivedAt: r.last_received_at,
        emailCount: r.email_count,
        subject: r.subject,
        status: r.status,
        statusLabel: r.status_label,
        summary: r.summary,
        myActionRequired: Boolean(r.my_action_required),
        activeTasks: JSON.parse(r.active_tasks_json || '[]'),
        resolvedTasks: JSON.parse(r.resolved_tasks_json || '[]'),
        suggestedNextStep: r.suggested_next_step || '',
        draftReply: JSON.parse(r.draft_reply_json || '{}'),
        analyzedAt: r.analyzed_at,
        modelUsed: r.model_used
      });
    }
  } catch (err) {
    console.error('Errore lettura analisi da Frank DB:', err);
  } finally {
    if (db) try { db.close(); } catch {}
  }
  return map;
}

export function saveAnalysis(analysis: any): void {
  let db: any = null;
  try {
    db = new DatabaseSync(FRANK_DB_PATH);
    const stmt = db.prepare(`
      INSERT INTO thread_analyses (
        thread_id, last_email_id, last_received_at, email_count, subject,
        status, status_label, summary, my_action_required,
        active_tasks_json, resolved_tasks_json, suggested_next_step, draft_reply_json,
        analyzed_at, model_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET
        last_email_id = excluded.last_email_id,
        last_received_at = excluded.last_received_at,
        email_count = excluded.email_count,
        subject = excluded.subject,
        status = excluded.status,
        status_label = excluded.status_label,
        summary = excluded.summary,
        my_action_required = excluded.my_action_required,
        active_tasks_json = excluded.active_tasks_json,
        resolved_tasks_json = excluded.resolved_tasks_json,
        suggested_next_step = excluded.suggested_next_step,
        draft_reply_json = excluded.draft_reply_json,
        analyzed_at = excluded.analyzed_at,
        model_used = excluded.model_used
    `);

    stmt.run(
      analysis.threadId,
      analysis.lastEmailId || null,
      analysis.lastReceivedAt || null,
      analysis.emailCount || 1,
      analysis.subject || '',
      analysis.status || 'informative',
      analysis.statusLabel || 'Informativo',
      analysis.summary || '',
      analysis.myActionRequired ? 1 : 0,
      JSON.stringify(analysis.activeTasks || []),
      JSON.stringify(analysis.resolvedTasks || []),
      analysis.suggestedNextStep || '',
      JSON.stringify(analysis.draftReply || {}),
      analysis.analyzedAt || new Date().toISOString(),
      analysis.modelUsed || 'sonar'
    );
  } catch (err) {
    console.error('Errore salvataggio analisi in Frank DB:', err);
  } finally {
    if (db) try { db.close(); } catch {}
  }
}

// Analizzatore euristico rapido per email automatiche o notifiche bot
function tryFastHeuristicAnalysis(thread: { subject: string; emails: any[] }): any | null {
  const s = (thread.subject || '').toLowerCase();
  
  // Notifiche OpenVPN
  if (s.includes('openvpn') && (s.includes('connessione') || s.includes('disconnessione'))) {
    return {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: `Notifica automatica del server VPN: ${thread.subject}`,
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Nessuna azione richiesta: log di sistema OpenVPN.',
      draftReply: { to: '', subject: '', body: '' },
      modelUsed: 'heuristic'
    };
  }

  // Notifiche Google Drive / Fogli condivisi
  if (s.includes('shared drive') || s.includes('foglio di lavoro condiviso') || s.includes('documento condiviso')) {
    return {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: `Condivisione di file o cartella su Drive: ${thread.subject}`,
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Consulta la risorsa condivisa quando necessario.',
      draftReply: { to: '', subject: '', body: '' },
      modelUsed: 'heuristic'
    };
  }

  // Cambio password automatico
  if (s.includes('password cambiata') || s.includes('password reset')) {
    return {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: `Conferma automatica di sicurezza: ${thread.subject}`,
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Nessuna azione richiesta se la password è stata cambiata da te.',
      draftReply: { to: '', subject: '', body: '' },
      modelUsed: 'heuristic'
    };
  }

  // Notifiche e onboarding Brevo
  if (s.includes('brevo') || s.includes('benvenuto in brevo') || s.includes('passaggio 1: raggiungi la casella') || s.includes('il tuo account è stato convalidato')) {
    return {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: `Notifica di servizio o onboarding Brevo: ${thread.subject}`,
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Nessuna azione operativa.',
      draftReply: { to: '', subject: '', body: '' },
      modelUsed: 'heuristic'
    };
  }

  // Riassunto settimanale WPForms
  if (s.includes('riassunto settimanale di wpforms')) {
    return {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: `Report automatico invii WPForms: ${thread.subject}`,
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Consultazione informativa delle statistiche di compilazione.',
      draftReply: { to: '', subject: '', body: '' },
      modelUsed: 'heuristic'
    };
  }

  // Privacy e termini di servizio
  if (s.includes('termini di servizio') || s.includes('norme sulla privacy')) {
    return {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: `Aggiornamento normativo/legale dei termini di servizio.`,
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Nessuna azione operativa richiesta.',
      draftReply: { to: '', subject: '', body: '' },
      modelUsed: 'heuristic'
    };
  }

  // Inviti o notifiche calendario automatiche
  if (s.startsWith('invitation:') || s.startsWith('invito:')) {
    return {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: `Invito a evento già sincronizzato nel calendario: ${thread.subject}`,
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Verifica la presenza dell\'evento nel calendario di Frank.',
      draftReply: { to: '', subject: '', body: '' },
      modelUsed: 'heuristic'
    };
  }

  return null;
}

export async function analyzeThreadAutonomous(threadId: string): Promise<any> {
  if (!existsSync(EMAIL_DB_PATH)) {
    throw new Error('Database email-ai-agent non trovato.');
  }

  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(EMAIL_DB_PATH, { readOnly: true });
  let emails: any[] = [];
  try {
    emails = db.prepare(`
      SELECT id, google_message_id, sender, sender_email, subject, received_at, body_text, recipients
      FROM emails
      WHERE thread_id = ? AND source_type = 'email'
      ORDER BY received_at ASC
    `).all(threadId) as any[];
  } finally {
    db.close();
  }

  if (emails.length === 0) {
    throw new Error(`Nessun messaggio trovato per il thread ${threadId}`);
  }

  const latestEmail = emails[emails.length - 1];
  const subject = latestEmail.subject || emails[0].subject || 'Senza oggetto';

  // 1. Prova euristica rapida per notifiche di sistema
  const fastResult = tryFastHeuristicAnalysis({ subject, emails });
  if (fastResult) {
    fastResult.threadId = threadId;
    fastResult.lastEmailId = latestEmail.id;
    fastResult.lastReceivedAt = latestEmail.received_at;
    fastResult.emailCount = emails.length;
    fastResult.subject = subject;
    fastResult.analyzedAt = new Date().toISOString();
    saveAnalysis(fastResult);
    return fastResult;
  }

  // 2. Costruzione conversazione multi-turno per Perplexity Sonar
  let conversation = '';
  emails.forEach((em, idx) => {
    let text = em.body_text || '';
    if (text.startsWith('gz:')) {
      try {
        const buf = Buffer.from(text.slice(3), 'base64');
        text = zlib.inflateSync(buf).toString('utf-8');
      } catch {}
    }

    let toStr = 'N/D';
    try {
      const rec = typeof em.recipients === 'string' ? JSON.parse(em.recipients) : em.recipients;
      if (rec?.to && Array.isArray(rec.to)) {
        toStr = rec.to.map((t: any) => t.name || t.email).filter(Boolean).join(', ');
      }
    } catch {}

    conversation += `\n--- [Messaggio ${idx + 1} del ${em.received_at}] ---\nDa: ${em.sender} <${em.sender_email}>\nA: ${toStr}\nOggetto: ${em.subject}\nTesto:\n${text.slice(0, 2500)}\n`;
  });

  const systemPrompt = `Sei Frank Thread Agent, l'agente esecutivo autonomo per l'analisi intelligente di conversazioni email per Francesco Russotto (f.russotto@arteficegroup.com).
Analizza l'INTERO THREAD CRONOLOGICO (dal primo all'ultimo messaggio) per comprendere lo stato attuale della discussione e stabilire in modo autonomo:
1. STATO ATTUALE:
   - "action_required": c'è una richiesta pendente, una domanda o un compito operativo non ancora risolto che spetta specificamente a Francesco.
   - "waiting_others": Francesco (o un collega) ha già fatto l'ultima mossa o risposto, e il thread è in attesa di feedback/risposta da parte del cliente o di altri.
   - "resolved": il tema del thread si è concluso con successo, è stato confermato risolto o non richiede ulteriori azioni.
   - "informative": notifica automatica, ricevuta o email informativa in cui Francesco era solo in copia senza compiti.

2. COMPITI ATTIVI vs RISOLTI:
   - Identifica le richieste formulate nel corso del thread.
   - Se Francesco (o un collega) ha già soddisfatto la richiesta nei messaggi successivi (es. ha inviato il file, confermato la modifica, fatto il deploy), inseriscila in "resolvedTasks" spiegando chi e quando l'ha risolta.
   - Elenca in "activeTasks" SOLO ED ESCLUSIVAMENTE ciò che resta DAVVERO DA FARE per Francesco.

3. PROSSIMO PASSO SUGGERITO (suggestedNextStep):
   - Una frase sintetica e pratica che consiglia cosa fare adesso.

4. BOZZA DI RISPOSTA CONTESTUALE (draftReply):
   - Se lo stato è "action_required", genera una bozza di risposta professionale, calibrata sul tono del thread, pronta all'invio.

Rispondi RIGOROSAMENTE con JSON valido in questa struttura:
{
  "status": "action_required" | "waiting_others" | "resolved" | "informative",
  "statusLabel": "Richiede tua azione" | "In attesa di altri" | "Risolto" | "Informativo",
  "summary": "Sintesi stato attuale del thread (1-2 frasi)",
  "myActionRequired": true | false,
  "activeTasks": [
    { "summary": "Descrizione compito", "urgency": "high" | "medium" | "low", "reason": "Motivazione" }
  ],
  "resolvedTasks": [
    { "summary": "Compito risolto", "resolvedBy": "Chi l'ha risolto", "resolvedNote": "Dettaglio risoluzione" }
  ],
  "suggestedNextStep": "Azione consigliata",
  "draftReply": { "to": "email o nome", "subject": "oggetto risposta", "body": "testo risposta" }
}`;

  const apiKey = getAiApiKey();
  const aiRes = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Ecco il thread completo da analizzare:\n${conversation.slice(0, 14000)}` }
      ],
      temperature: 0.1
    })
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`AI API error (${aiRes.status}): ${errText}`);
  }

  const aiData: any = await aiRes.json();
  const rawContent = aiData.choices?.[0]?.message?.content || '{}';
  let parsed: any = {};
  try {
    const match = rawContent.match(/```json\s*([\s\S]*?)\s*```/) || rawContent.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[1] || match[0] : rawContent);
  } catch {
    parsed = {
      status: 'informative',
      statusLabel: 'Informativo',
      summary: rawContent.slice(0, 200),
      myActionRequired: false,
      activeTasks: [],
      resolvedTasks: [],
      suggestedNextStep: 'Nessuna azione richiesta'
    };
  }

  parsed.threadId = threadId;
  parsed.lastEmailId = latestEmail.id;
  parsed.lastReceivedAt = latestEmail.received_at;
  parsed.emailCount = emails.length;
  parsed.subject = subject;
  parsed.analyzedAt = new Date().toISOString();
  parsed.modelUsed = 'sonar';

  saveAnalysis(parsed);
  return parsed;
}

// Background Worker Autonomo
class AutonomousThreadWorker {
  private isProcessing = false;
  private queue: string[] = [];
  private analyzedCount = 0;
  private totalCount = 0;
  private currentThreadSubject = '';
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    initFrankDb();
  }

  public getStatus() {
    return {
      queueLength: this.queue.length,
      analyzedCount: this.analyzedCount,
      totalCount: this.totalCount,
      isProcessing: this.isProcessing,
      currentThreadSubject: this.currentThreadSubject
    };
  }

  public async scanAndEnqueue(): Promise<number> {
    if (!existsSync(EMAIL_DB_PATH)) return 0;

    let db: any = null;
    let threads: any[] = [];
    try {
      const { DatabaseSync } = await import('node:sqlite');
      db = new DatabaseSync(EMAIL_DB_PATH, { readOnly: true });
      threads = db.prepare(`
        SELECT thread_id, subject, COUNT(*) as cnt, MAX(received_at) as last_at, MAX(id) as last_id
        FROM emails
        WHERE source_type = 'email' AND received_at >= ?
        GROUP BY thread_id
        ORDER BY last_at DESC
      `).all(BASELINE_DATE) as any[];
    } catch (err) {
      console.error('Errore scansione thread in email-ai-agent:', err);
      return 0;
    } finally {
      if (db) try { db.close(); } catch {}
    }

    const savedAnalyses = getAllAnalysesMap();
    this.totalCount = threads.length;
    this.analyzedCount = savedAnalyses.size;

    const toEnqueue: string[] = [];
    for (const t of threads) {
      const saved = savedAnalyses.get(t.thread_id);
      // Non ancora analizzato, o sono arrivate nuove email nel thread
      if (!saved || saved.emailCount < t.cnt || saved.lastReceivedAt < t.last_at) {
        if (!this.queue.includes(t.thread_id)) {
          toEnqueue.push(t.thread_id);
        }
      }
    }

    if (toEnqueue.length > 0) {
      this.queue.push(...toEnqueue);
      console.log(`[Frank Autonomous Agent] Accodati ${toEnqueue.length} thread da studiare.`);
      this.triggerWork();
    }

    return toEnqueue.length;
  }

  public start() {
    console.log('[Frank Autonomous Agent] Worker autonomo avviato.');
    this.scanAndEnqueue();
    
    // Controlla ogni 30 secondi nuovi thread
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.scanAndEnqueue();
      }, 30 * 1000);
    }
  }

  private async triggerWork() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const threadId = this.queue.shift()!;
      try {
        console.log(`[Frank Autonomous Agent] Analisi thread ${threadId} (${this.queue.length} rimanenti in coda)...`);
        const res = await analyzeThreadAutonomous(threadId);
        this.currentThreadSubject = res.subject || '';
        this.analyzedCount++;
        console.log(`[Frank Autonomous Agent] Completato thread ${threadId}: stato=${res.status}, task=${res.activeTasks?.length || 0}`);
      } catch (err: any) {
        console.warn(`[Frank Autonomous Agent] Errore analisi thread ${threadId}:`, err.message);
      }

      // Piccola pausa di 1 secondo tra le richieste per fluidità e rispetto dei limiti
      await new Promise(r => setTimeout(r, 1200));
    }

    this.isProcessing = false;
    this.currentThreadSubject = '';
  }
}

export const autonomousAgent = new AutonomousThreadWorker();
