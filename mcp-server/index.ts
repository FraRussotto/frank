#!/usr/bin/env node
/**
 * Frank MCP Server
 * Model Context Protocol connector for Frank Second Brain & Super Agent.
 * Allows external AI agents (Claude Desktop, Cursor, Antigravity, etc.) to
 * seamlessly access Frank's deadlines, expenses, emails, calendar, and RAG knowledge.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRANK_ROOT = path.resolve(__dirname, '..');
const FRANK_DB_PATH = path.join(FRANK_ROOT, 'database', 'frank_agent.sqlite');
const EMAIL_DB_PATH = '/Users/fra_russo/email-ai-agent/database/database.sqlite';
const UPLOADS_DOCS_DIR = path.join(FRANK_ROOT, 'uploads', 'documents');
const LARAVEL_ENV_PATH = '/Users/fra_russo/email-ai-agent/.env';
const FRANK_API_BASE = 'http://localhost:5173/api';

// Helper: Open SQLite connection safely
function getFrankDb(readOnly = true): DatabaseSync {
  return new DatabaseSync(FRANK_DB_PATH, { readOnly });
}

function getEmailDb(readOnly = true): DatabaseSync | null {
  if (!existsSync(EMAIL_DB_PATH)) return null;
  try {
    return new DatabaseSync(EMAIL_DB_PATH, { readOnly });
  } catch {
    return null;
  }
}

// Helper: Get AI API Key for standalone fallback
function getAiApiKey(): string {
  if (existsSync(LARAVEL_ENV_PATH)) {
    const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
    const m = content.match(/OPENAI_API_KEY=(.+)/);
    if (m && m[1]) return m[1].trim();
  }
  return process.env.OPENAI_API_KEY || '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';
}

// Check if Frank local web API is reachable
async function isFrankApiAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${FRANK_API_BASE}/super-agent/status`, {
      signal: AbortSignal.timeout(1000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Format relative date for deadlines
function formatRelativeDays(targetDateStr: string): string {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDateStr);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Oggi';
    if (diffDays === 1) return 'Domani';
    if (diffDays === -1) return 'Ieri';
    if (diffDays > 1) return `Fra ${diffDays} giorni`;
    return `Scaduta da ${Math.abs(diffDays)} giorni`;
  } catch {
    return targetDateStr;
  }
}

// Initialize MCP Server
const server = new McpServer({
  name: 'frank-super-agent',
  version: '1.0.0',
  description: 'Frank Second Brain: scadenze personali, spese fisse, email AI, agenda e archivio documentale RAG'
});

// ==========================================
// 1. TOOL: frank_get_daily_briefing
// ==========================================
server.tool(
  'frank_get_daily_briefing',
  "Recupera il briefing esecutivo giornaliero consolidato di Frank con la distinzione tra area Lavoro (email e riunioni) e area Personale (scadenze, spese e adempimenti).",
  {},
  async () => {
    // 1. Prova via HTTP API se Frank è attivo
    if (await isFrankApiAlive()) {
      try {
        const res = await fetch(`${FRANK_API_BASE}/super-agent/briefing`);
        if (res.ok) {
          const data = await res.json();
          const b = data.briefing;
          let text = `# ${b.headline || 'Briefing Giornaliero di Frank'}\n\n`;
          text += `**Data:** ${b.date || new Date().toLocaleDateString('it-IT')}\n\n`;
          text += `${b.summary}\n\n`;
          if (b.keyTakeaways && Array.isArray(b.keyTakeaways) && b.keyTakeaways.length > 0) {
            text += `### Punti Salienti:\n`;
            for (const pt of b.keyTakeaways) {
              text += `- ${pt}\n`;
            }
          }
          return { content: [{ type: 'text', text }] };
        }
      } catch {}
    }

    // 2. Fallback diretto da SQLite
    const db = getFrankDb(true);
    let briefingRow: any = null;
    try {
      briefingRow = db.prepare('SELECT * FROM super_agent_briefings ORDER BY created_at DESC LIMIT 1').get();
    } catch {}

    const todayStr = new Date().toISOString().split('T')[0];
    const pendingDeadlines = db.prepare(`
      SELECT * FROM deadlines WHERE status = 'pending' ORDER BY due_date ASC LIMIT 5
    `).all() as any[];
    db.close();

    let output = `# Briefing Frank (Fallback Locale SQLite) • ${todayStr}\n\n`;
    if (briefingRow?.summary) {
      output += `${briefingRow.summary}\n\n`;
    }

    output += `### Scadenze Imminenti Monitorate:\n`;
    if (pendingDeadlines.length === 0) {
      output += `- Nessuna scadenza pendente registrata.\n`;
    } else {
      for (const d of pendingDeadlines) {
        output += `- [${d.scope?.toUpperCase() || 'PERSONALE'}] **${d.title}** (${formatRelativeDays(d.due_date)}) [Priorità: ${d.priority}]\n`;
      }
    }

    return { content: [{ type: 'text', text: output }] };
  }
);

// ==========================================
// 2. TOOL: frank_ask
// ==========================================
server.tool(
  'frank_ask',
  "Invia una domanda o istruzione a Frank Super Agente. Frank ha visibilità e orchestra subagenti su scadenze, spese fisse, email, agenda e documenti RAG.",
  {
    query: z.string().describe('La domanda o comando da sottoporre a Frank')
  },
  async ({ query }) => {
    // 1. Prova tramite Frank API HTTP
    if (await isFrankApiAlive()) {
      try {
        const res = await fetch(`${FRANK_API_BASE}/super-agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: query }]
          })
        });
        if (res.ok) {
          const data = await res.json();
          let text = data.text || '';
          if (data.delegations && data.delegations.length > 0) {
            text += `\n\n*(Subagenti consultati: ${data.delegations.map((d: any) => d.subagentName).join(', ')})*`;
          }
          return { content: [{ type: 'text', text }] };
        }
      } catch {}
    }

    // 2. Fallback offline: Costruisci contesto da SQLite ed effettua query LLM diretta
    const fDb = getFrankDb(true);
    const deadlines = fDb.prepare("SELECT * FROM deadlines WHERE status = 'pending' ORDER BY due_date ASC LIMIT 10").all();
    const expenses = fDb.prepare("SELECT * FROM fixed_expenses WHERE is_active = 1").all();
    const docs = fDb.prepare("SELECT id, title, category FROM kb_documents").all();
    fDb.close();

    const eDb = getEmailDb(true);
    const requests = eDb ? eDb.prepare("SELECT sender, subject, summary, urgency, deadline FROM requests WHERE status = 'pending' LIMIT 8").all() : [];
    if (eDb) eDb.close();

    const apiKey = getAiApiKey();
    const systemPrompt = `Sei Frank, il Super Agente di Intelligenza Artificiale personale di Francesco.
Hai accesso completo al suo ecosistema locale:
- SCADENZE PENDENTI: ${JSON.stringify(deadlines)}
- SPESE FISSE: ${JSON.stringify(expenses)}
- RICHIESTE OPERATIVE DA EMAIL: ${JSON.stringify(requests)}
- DOCUMENTI ARCHIVIATI NEL RAG: ${JSON.stringify(docs)}

Rispondi in modo cordiale, preciso, chiaro e operativo in italiano. Cita numeri, date e scadenze esatte quando pertinente.`;

    try {
      const resp = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query }
          ],
          temperature: 0.2
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || 'Nessuna risposta generata da Frank.';
        return { content: [{ type: 'text', text }] };
      }
    } catch {}

    // Fallback sintetico puramente deterministico se nessun LLM risponde
    return {
      content: [{
        type: 'text',
        text: `Frank (Modalità Offline Locale):\n- Scadenze pendenti: ${deadlines.length}\n- Spese fisse attive: ${expenses.length}\n- Task email aperti: ${requests.length}\n- Documenti RAG: ${docs.length}`
      }]
    };
  }
);

// ==========================================
// 3. TOOL: frank_get_deadlines
// ==========================================
server.tool(
  'frank_get_deadlines',
  "Recupera le scadenze e gli adempimenti registrati in Frank (tasse, salute, casa, burocrazia, lavoro, personale).",
  {
    scope: z.enum(['personal', 'work', 'all']).optional().default('all').describe('Ambito: personale, lavoro o tutti'),
    status: z.enum(['pending', 'completed', 'all']).optional().default('pending').describe('Stato scadenza: pendenti, completate o tutte'),
    days_ahead: z.number().optional().describe('Filtra scadenze entro N giorni a partire da oggi')
  },
  async ({ scope, status, days_ahead }) => {
    const db = getFrankDb(true);
    let query = 'SELECT * FROM deadlines WHERE 1=1';
    const params: any[] = [];

    if (scope && scope !== 'all') {
      query += ' AND scope = ?';
      params.push(scope);
    }
    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (typeof days_ahead === 'number' && days_ahead > 0) {
      const maxDate = new Date(Date.now() + days_ahead * 86400000).toISOString().split('T')[0];
      query += ' AND due_date <= ?';
      params.push(maxDate);
    }

    query += ' ORDER BY due_date ASC';
    const rows = db.prepare(query).all(...params) as any[];
    db.close();

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: 'Nessuna scadenza trovata per i criteri specificati.' }] };
    }

    let text = `### Scadenze Registrate (${rows.length}):\n\n`;
    for (const d of rows) {
      const rel = formatRelativeDays(d.due_date);
      const doneBadge = d.status === 'completed' ? '✅ [COMPLETATA]' : '⏳ [PENDENTE]';
      const scopeBadge = `[${(d.scope || 'personale').toUpperCase()}]`;
      text += `- **${d.title}** (${d.due_date} • ${rel}) ${doneBadge} ${scopeBadge}\n`;
      text += `  *ID:* \`${d.id}\` | *Categoria:* ${d.category} | *Priorità:* ${d.priority}\n`;
      if (d.notes) text += `  *Note:* ${d.notes}\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ==========================================
// 4. TOOL: frank_add_deadline
// ==========================================
server.tool(
  'frank_add_deadline',
  "Aggiunge una nuova scadenza o adempimento nell'archivio di Frank (personale o lavorativo).",
  {
    title: z.string().describe('Titolo chiaro della scadenza o adempimento'),
    due_date: z.string().describe('Data di scadenza in formato YYYY-MM-DD'),
    category: z.enum(['tasse', 'salute', 'casa_utenze', 'burocrazia', 'lavoro', 'personale', 'altro']).default('personale'),
    priority: z.enum(['alta', 'media', 'bassa']).default('media'),
    scope: z.enum(['personal', 'work']).default('personal'),
    notes: z.string().optional().describe('Note o indicazioni operative opzionali')
  },
  async ({ title, due_date, category, priority, scope, notes }) => {
    const db = getFrankDb(false);
    const id = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO deadlines (id, title, due_date, category, priority, status, source, notes, scope, is_auto_extracted, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 'mcp_agent', ?, ?, 0, ?)
    `);

    stmt.run(id, title.trim(), due_date.trim(), category, priority, notes ? notes.trim() : null, scope, now);
    db.close();

    return {
      content: [{
        type: 'text',
        text: `✅ Scadenza aggiunta con successo a Frank!\n- **ID:** \`${id}\`\n- **Titolo:** ${title}\n- **Data:** ${due_date} (${formatRelativeDays(due_date)})\n- **Ambito:** ${scope.toUpperCase()}\n- **Priorità:** ${priority}`
      }]
    };
  }
);

// ==========================================
// 5. TOOL: frank_complete_deadline
// ==========================================
server.tool(
  'frank_complete_deadline',
  "Segna una scadenza come completata.",
  {
    deadline_id: z.string().describe('ID della scadenza da completare')
  },
  async ({ deadline_id }) => {
    const db = getFrankDb(false);
    const now = new Date().toISOString();
    const info = db.prepare("UPDATE deadlines SET status = 'completed', completed_at = ? WHERE id = ?").run(now, deadline_id.trim());
    db.close();

    if (info.changes === 0) {
      return { content: [{ type: 'text', text: `Nessuna scadenza trovata con ID "${deadline_id}".` }] };
    }

    return { content: [{ type: 'text', text: `✅ Scadenza \`${deadline_id}\` contrassegnata come completata con successo!` }] };
  }
);

// ==========================================
// 6. TOOL: frank_get_expenses
// ==========================================
server.tool(
  'frank_get_expenses',
  "Recupera le spese fisse e ricorrenti con il calcolo del budget mensile e il filtro per addebito automatico (RID/SDD).",
  {
    exclude_auto_debit: z.boolean().optional().default(false).describe('Se true, esclude le spese a pagamento automatico per mostrare solo i pagamenti manuali da effettuare')
  },
  async ({ exclude_auto_debit }) => {
    const db = getFrankDb(true);
    let query = 'SELECT * FROM fixed_expenses WHERE is_active = 1';
    if (exclude_auto_debit) {
      query += ' AND (is_auto_debit = 0 OR is_auto_debit IS NULL)';
    }
    query += ' ORDER BY due_day ASC';
    const rows = db.prepare(query).all() as any[];
    db.close();

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: 'Nessuna spesa fissa trovata per i criteri specificati.' }] };
    }

    let monthlyTotal = 0;
    let text = `### Spese Fisse Monitorate da Frank (${rows.length}):\n\n`;

    for (const e of rows) {
      const amount = Number(e.amount) || 0;
      let factor = 1;
      if (e.frequency === 'Annuale') factor = 1 / 12;
      else if (e.frequency === 'Bimestrale') factor = 1 / 2;
      monthlyTotal += amount * factor;

      const autoBadge = e.is_auto_debit ? '💳 [SDD Auto]' : '🖐️ [Manuale]';
      text += `- **${e.name}**: € ${amount.toFixed(2)} (${e.frequency}) ${autoBadge}\n`;
      text += `  *Giorno del mese:* ${e.due_day}° | *Categoria:* ${e.category}\n`;
    }

    text += `\n**Totale Mensile Normalizzato:** € ${monthlyTotal.toFixed(2)}`;
    return { content: [{ type: 'text', text }] };
  }
);

// ==========================================
// 7. TOOL: frank_get_calendar_events
// ==========================================
server.tool(
  'frank_get_calendar_events',
  "Recupera le riunioni, incontri ed eventi a calendario sincronizzati dai tuoi account email.",
  {
    days: z.number().optional().default(7).describe('Numero di giorni futuri da analizzare (default 7)')
  },
  async ({ days }) => {
    const db = getEmailDb(true);
    if (!db) {
      return { content: [{ type: 'text', text: 'Database email non accessibile.' }] };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const maxDateStr = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    const rows = db.prepare(`
      SELECT id, subject, sender, event_start_at, event_end_at, event_link, user_id
      FROM emails
      WHERE event_start_at IS NOT NULL
        AND date(event_start_at) >= date(?)
        AND date(event_start_at) <= date(?)
      ORDER BY event_start_at ASC
    `).all(todayStr, maxDateStr) as any[];
    db.close();

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: `Nessuna riunione o evento a calendario nei prossimi ${days} giorni.` }] };
    }

    let text = `### Riunioni & Eventi a Calendario (Prossimi ${days} giorni):\n\n`;
    for (const e of rows) {
      const dt = new Date(e.event_start_at);
      const timeStr = dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const dateStr = dt.toLocaleDateString('it-IT');
      text += `- **${e.subject || 'Senza titolo'}** (${dateStr} ore ${timeStr})\n`;
      text += `  *Da:* ${e.sender || 'Non specificato'}\n`;
      if (e.event_link) text += `  *Meet/Link:* ${e.event_link}\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ==========================================
// 8. TOOL: frank_get_email_tasks
// ==========================================
server.tool(
  'frank_get_email_tasks',
  "Recupera le azioni operative e i task estratti dall'Intelligenza Artificiale dai thread di posta elettronica.",
  {
    status: z.enum(['pending', 'completed', 'all']).optional().default('pending'),
    urgency: z.enum(['alta', 'media', 'bassa', 'all']).optional().default('all'),
    limit: z.number().optional().default(10)
  },
  async ({ status, urgency, limit }) => {
    const db = getEmailDb(true);
    if (!db) {
      return { content: [{ type: 'text', text: 'Database email non accessibile.' }] };
    }

    let query = 'SELECT id, sender, sender_email, subject, summary, urgency, deadline, status, created_at FROM requests WHERE 1=1';
    const params: any[] = [];

    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (urgency !== 'all') {
      query += ' AND urgency = ?';
      params.push(urgency);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as any[];
    db.close();

    if (rows.length === 0) {
      return { content: [{ type: 'text', text: 'Nessun task o richiesta email trovato per i filtri specificati.' }] };
    }

    let text = `### Richieste & Task dalle Email (${rows.length}):\n\n`;
    for (const r of rows) {
      text += `- **${r.subject || 'Oggetto non specificato'}** [Urgenza: ${r.urgency?.toUpperCase()}]\n`;
      text += `  *Mittente:* ${r.sender} (${r.sender_email})\n`;
      text += `  *Sintesi:* ${r.summary}\n`;
      if (r.deadline) text += `  *Scadenza citata:* ${r.deadline}\n`;
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ==========================================
// 9. TOOL: frank_search_knowledge
// ==========================================
server.tool(
  'frank_search_knowledge',
  "Cerca documenti, note, sintesi di file PDF/Word/Excel e memorie di chat compattate nel Second Brain RAG di Frank.",
  {
    query: z.string().describe('Termine di ricerca o domanda semantica'),
    limit: z.number().optional().default(5)
  },
  async ({ query, limit }) => {
    const db = getFrankDb(true);
    const docs = db.prepare('SELECT * FROM kb_documents').all() as any[];
    db.close();

    const qLower = query.toLowerCase();
    const matchedDocs = docs.filter(d => 
      d.title.toLowerCase().includes(qLower) || 
      d.category.toLowerCase().includes(qLower)
    ).slice(0, limit);

    // Controlla anche file fisici su disco per estratti
    const filesOnDisk = existsSync(UPLOADS_DOCS_DIR) ? readdirSync(UPLOADS_DOCS_DIR) : [];
    let text = `### Risultati Ricerca Knowledge Base (${docs.length} documenti totali indicizzati):\n\n`;

    if (matchedDocs.length === 0) {
      text += `Nessun documento corrisponde esattamente alla parola chiave "${query}".\nDocumenti attualmente indicizzati:\n`;
      for (const d of docs.slice(0, 8)) {
        text += `- **${d.title}** (${d.category})\n`;
      }
    } else {
      for (const d of matchedDocs) {
        text += `- **${d.title}**\n`;
        text += `  *ID:* \`${d.id}\` | *Categoria:* ${d.category} | *Data:* ${new Date(d.created_at).toLocaleDateString('it-IT')}\n`;
        if (d.file_url) text += `  *File Originale:* Disponibile in locale (${d.file_url})\n`;

        // Cerca file su disco
        const matchingDisk = filesOnDisk.find(f => f.startsWith(`${d.id}___`));
        if (matchingDisk && (matchingDisk.endsWith('.txt') || matchingDisk.endsWith('.md'))) {
          try {
            const previewContent = readFileSync(path.join(UPLOADS_DOCS_DIR, matchingDisk), 'utf-8').slice(0, 300);
            text += `  *Estratto:* "${previewContent}..."\n`;
          } catch {}
        }
      }
    }

    return { content: [{ type: 'text', text }] };
  }
);

// ==========================================
// 10. TOOL: frank_add_note
// ==========================================
server.tool(
  'frank_add_note',
  "Salva una nuova nota testuale o documentale nel Second Brain RAG di Frank, conservandola su disco locale e rendendola consultabile.",
  {
    title: z.string().describe('Titolo della nota'),
    content: z.string().describe('Contenuto testuale o markdown della nota'),
    category: z.string().optional().default('Note').describe('Categoria (es. Note, Ricerca, Progetti, Personale)')
  },
  async ({ title, content, category }) => {
    const docId = `doc-${Date.now()}`;
    const safeTitle = title.trim().endsWith('.md') ? title.trim() : `${title.trim()}.md`;
    const cleanFilename = safeTitle.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!existsSync(UPLOADS_DOCS_DIR)) {
      mkdirSync(UPLOADS_DOCS_DIR, { recursive: true });
    }

    const diskFileName = `${docId}___${cleanFilename}`;
    const fullPath = path.join(UPLOADS_DOCS_DIR, diskFileName);
    writeFileSync(fullPath, content.trim(), 'utf-8');

    const db = getFrankDb(false);
    const stmt = db.prepare(`
      INSERT INTO kb_documents (id, title, category, chunk_count, created_at, file_url, original_filename, mime_type)
      VALUES (?, ?, ?, 1, ?, ?, ?, 'text/markdown; charset=utf-8')
    `);
    const now = new Date().toISOString();
    const fileUrl = `/api/documents/raw/${docId}`;
    stmt.run(docId, safeTitle, category, now, fileUrl, safeTitle);
    db.close();

    return {
      content: [{
        type: 'text',
        text: `✅ Nota salvata con successo nel Second Brain di Frank!\n- **ID:** \`${docId}\`\n- **Titolo:** ${safeTitle}\n- **Categoria:** ${category}\n- **File locale:** ${diskFileName}\n- La nota è subito accessibile a Frank per le future interrogazioni RAG.`
      }]
    };
  }
);

// ==========================================
// RISORSE MCP ESPRESSE
// ==========================================
server.resource(
  'briefing_today',
  'frank://briefing/today',
  async (uri) => {
    const db = getFrankDb(true);
    let briefing: any = null;
    try {
      briefing = db.prepare('SELECT * FROM super_agent_briefings ORDER BY created_at DESC LIMIT 1').get();
    } catch {}
    db.close();

    return {
      contents: [{
        uri: uri.href,
        text: briefing?.summary || 'Nessun briefing disponibile per la data odierna.',
        mimeType: 'text/markdown'
      }]
    };
  }
);

server.resource(
  'deadlines_pending',
  'frank://deadlines/pending',
  async (uri) => {
    const db = getFrankDb(true);
    const rows = db.prepare("SELECT * FROM deadlines WHERE status = 'pending' ORDER BY due_date ASC").all();
    db.close();
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(rows, null, 2),
        mimeType: 'application/json'
      }]
    };
  }
);

server.resource(
  'expenses_overview',
  'frank://expenses/overview',
  async (uri) => {
    const db = getFrankDb(true);
    const rows = db.prepare("SELECT * FROM fixed_expenses WHERE is_active = 1 ORDER BY due_day ASC").all();
    db.close();
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(rows, null, 2),
        mimeType: 'application/json'
      }]
    };
  }
);

// ==========================================
// PROMPTS MCP
// ==========================================
server.prompt(
  'frank_morning_standup',
  'Avvia il controllo del mattino con Frank: riunioni del giorno, priorità email e scadenze personali imminenti.',
  () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: 'Frank, fammi il punto della situazione per oggi: quali riunioni ho a calendario, quali email urgenti richiedono una mia risposta, e quali scadenze personali (bollette, adempimenti o visite) sono vicine?'
      }
    }]
  })
);

server.prompt(
  'frank_financial_audit',
  'Verifica delle uscite finanziarie del mese: spese con addebito diretto SDD vs pagamenti manuali residui.',
  () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: 'Frank, analizza le mie spese fisse del mese: quanto ho già coperto con addebito automatico su conto e quali pagamenti manuali devo ancora effettuare prima della fine del mese?'
      }
    }]
  })
);

// Start Stdio Transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Frank MCP Server] Connesso ed in ascolto via stdio.');
}

main().catch((err) => {
  console.error('[Frank MCP Server Fatal Error]:', err);
  process.exit(1);
});
