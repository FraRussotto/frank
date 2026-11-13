import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { FRANK_DB_PATH, EMAIL_DB_PATH, LARAVEL_ENV_PATH } from '../paths';

export type DeadlineCategory = 'task_operativo' | 'documento' | 'preparazione_call' | 'pagamento' | 'manuale' | 'casa_utenze' | 'salute' | 'burocrazia';
export type DeadlinePriority = 'alta' | 'media' | 'bassa';
export type DeadlineStatus = 'pending' | 'completed' | 'dismissed';
export type DeadlineScope = 'personal' | 'work';

export interface DeadlineRecord {
  id: string;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  category: DeadlineCategory;
  priority: DeadlinePriority;
  status: DeadlineStatus;
  scope: DeadlineScope;
  source: string;
  sourceId?: string;
  daysNotice: number;
  amount?: number;
  completedAt?: string;
  createdAt: string;
  // Computed fields
  daysRemaining?: number;
  urgencyStatus?: 'overdue' | 'today' | 'due_soon' | 'upcoming';
}

export interface UpcomingDeadlinesSummary {
  overdue: DeadlineRecord[];
  today: DeadlineRecord[];
  dueSoon: DeadlineRecord[]; // entro i giorni di preavviso
  future: DeadlineRecord[];
  totalPending: number;
  highPriorityCount: number;
}

function getAiApiKey(): string {
  if (existsSync(LARAVEL_ENV_PATH)) {
    const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
    const m = content.match(/OPENAI_API_KEY=(.+)/);
    if (m && m[1]) return m[1].trim();
  }
  return process.env.OPENAI_API_KEY || '';
}

export class DeadlineEngine {
  private static instance: DeadlineEngine;

  private constructor() {
    this.ensureTables();
  }

  public static getInstance(): DeadlineEngine {
    if (!DeadlineEngine.instance) {
      DeadlineEngine.instance = new DeadlineEngine();
    }
    return DeadlineEngine.instance;
  }

  private ensureTables() {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.exec(`
        CREATE TABLE IF NOT EXISTS deadlines (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          due_date TEXT NOT NULL,
          category TEXT NOT NULL,
          priority TEXT DEFAULT 'media',
          status TEXT DEFAULT 'pending',
          source TEXT,
          source_id TEXT,
          days_notice INTEGER DEFAULT 3,
          amount REAL,
          scope TEXT DEFAULT 'personal',
          completed_at TEXT,
          created_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
        CREATE INDEX IF NOT EXISTS idx_deadlines_status ON deadlines(status);
        CREATE INDEX IF NOT EXISTS idx_deadlines_source_id ON deadlines(source_id);
        CREATE INDEX IF NOT EXISTS idx_deadlines_scope ON deadlines(scope);
      `);
      try {
        db.exec("ALTER TABLE deadlines ADD COLUMN scope TEXT DEFAULT 'personal';");
      } catch {}
      db.close();
    } catch (e) {
      console.warn('DeadlineEngine ensureTables error:', e);
    }
  }

  private enrichDeadline(row: any): DeadlineRecord {
    const todayStr = new Date().toISOString().split('T')[0];
    const dueDateStr = (row.due_date || '').split('T')[0].split(' ')[0];

    const todayDate = new Date(todayStr + 'T00:00:00Z');
    const dueDate = new Date(dueDateStr + 'T00:00:00Z');
    const diffTime = dueDate.getTime() - todayDate.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let urgencyStatus: 'overdue' | 'today' | 'due_soon' | 'upcoming' = 'upcoming';
    if (daysRemaining < 0) {
      urgencyStatus = 'overdue';
    } else if (daysRemaining === 0) {
      urgencyStatus = 'today';
    } else if (daysRemaining <= (row.days_notice || 3)) {
      urgencyStatus = 'due_soon';
    } else {
      urgencyStatus = 'upcoming';
    }

    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description || ''),
      dueDate: String(row.due_date),
      category: row.category as DeadlineCategory,
      priority: (row.priority || 'media') as DeadlinePriority,
      status: (row.status || 'pending') as DeadlineStatus,
      scope: (row.scope || 'personal') as DeadlineScope,
      source: String(row.source || 'Manuale'),
      sourceId: row.source_id ? String(row.source_id) : undefined,
      daysNotice: Number(row.days_notice || 3),
      amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : undefined,
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      createdAt: String(row.created_at || new Date().toISOString()),
      daysRemaining,
      urgencyStatus
    };
  }

  public getDeadlines(filter?: { status?: string; category?: string; query?: string; scope?: string }): {
    deadlines: DeadlineRecord[];
    summary: UpcomingDeadlinesSummary;
  } {
    let list: DeadlineRecord[] = [];
    try {
      const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
      let query = 'SELECT * FROM deadlines WHERE 1=1';
      const params: any[] = [];

      if (filter?.scope && filter.scope !== 'all') {
        query += ' AND scope = ?';
        params.push(filter.scope);
      }
      if (filter?.status && filter.status !== 'all') {
        query += ' AND status = ?';
        params.push(filter.status);
      }
      if (filter?.category && filter.category !== 'all') {
        query += ' AND category = ?';
        params.push(filter.category);
      }
      if (filter?.query) {
        query += ' AND (title LIKE ? OR description LIKE ? OR source LIKE ?)';
        const q = `%${filter.query.trim()}%`;
        params.push(q, q, q);
      }

      query += ' ORDER BY CASE status WHEN \'pending\' THEN 1 WHEN \'completed\' THEN 2 ELSE 3 END, due_date ASC';

      const rows = db.prepare(query).all(...params) as any[];
      db.close();

      list = rows.map(r => this.enrichDeadline(r));
    } catch (e) {
      console.warn('DeadlineEngine getDeadlines error:', e);
    }

    const summary = this.computeSummary(list);
    return { deadlines: list, summary };
  }

  public computeSummary(deadlines: DeadlineRecord[]): UpcomingDeadlinesSummary {
    const pending = deadlines.filter(d => d.status === 'pending');
    const overdue = pending.filter(d => (d.daysRemaining ?? 0) < 0);
    const today = pending.filter(d => (d.daysRemaining ?? 0) === 0);
    const dueSoon = pending.filter(d => (d.daysRemaining ?? 0) > 0 && (d.daysRemaining ?? 0) <= d.daysNotice);
    const future = pending.filter(d => (d.daysRemaining ?? 0) > d.daysNotice);
    const highPriorityCount = pending.filter(d => d.priority === 'alta').length;

    return {
      overdue,
      today,
      dueSoon,
      future,
      totalPending: pending.length,
      highPriorityCount
    };
  }

  public createDeadline(data: {
    title: string;
    description?: string;
    dueDate: string;
    category?: DeadlineCategory;
    priority?: DeadlinePriority;
    scope?: DeadlineScope;
    source?: string;
    sourceId?: string;
    daysNotice?: number;
    amount?: number;
  }): DeadlineRecord {
    const id = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();
    const category = data.category || 'manuale';
    const priority = data.priority || 'media';
    const scope = data.scope || 'personal';
    const daysNotice = data.daysNotice !== undefined ? data.daysNotice : 3;
    const source = data.source || 'Manuale';

    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      const stmt = db.prepare(`
        INSERT INTO deadlines (id, title, description, due_date, category, priority, status, scope, source, source_id, days_notice, amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        data.title.trim(),
        (data.description || '').trim(),
        data.dueDate,
        category,
        priority,
        scope,
        source,
        data.sourceId || null,
        daysNotice,
        data.amount !== undefined ? Number(data.amount) : null,
        createdAt
      );
      db.close();
    } catch (e) {
      console.error('DeadlineEngine createDeadline error:', e);
    }

    return this.enrichDeadline({
      id,
      title: data.title,
      description: data.description || '',
      due_date: data.dueDate,
      category,
      priority,
      status: 'pending',
      scope,
      source,
      source_id: data.sourceId,
      days_notice: daysNotice,
      amount: data.amount,
      created_at: createdAt
    });
  }

  public updateDeadline(id: string, updates: Partial<{
    title: string;
    description: string;
    dueDate: string;
    category: DeadlineCategory;
    priority: DeadlinePriority;
    status: DeadlineStatus;
    daysNotice: number;
    amount: number;
  }>): boolean {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
      if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
      if (updates.dueDate !== undefined) { fields.push('due_date = ?'); values.push(updates.dueDate); }
      if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
      if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
      if (updates.daysNotice !== undefined) { fields.push('days_notice = ?'); values.push(updates.daysNotice); }
      if (updates.amount !== undefined) { fields.push('amount = ?'); values.push(updates.amount); }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
        if (updates.status === 'completed') {
          fields.push('completed_at = ?');
          values.push(new Date().toISOString());
        } else {
          fields.push('completed_at = NULL');
        }
      }

      if (fields.length === 0) {
        db.close();
        return true;
      }

      values.push(id);
      const query = `UPDATE deadlines SET ${fields.join(', ')} WHERE id = ?`;
      db.prepare(query).run(...values);
      db.close();
      return true;
    } catch (e) {
      console.error('DeadlineEngine updateDeadline error:', e);
      return false;
    }
  }

  public deleteDeadline(id: string): boolean {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
      db.close();
      return true;
    } catch (e) {
      console.error('DeadlineEngine deleteDeadline error:', e);
      return false;
    }
  }

  /**
   * Sincronizza in automatico le scadenze e cose da fare da TUTTI i subagenti:
   * 1. Email Subagent: task operativi attivi dai thread
   * 2. Spese & Finanze: spese da saldare con giorno di scadenza
   * 3. Calendario & Agenda: riunioni ed eventi che richiedono preparazione
   */
  public async syncFromAllSubagents(): Promise<{ added: number; updated: number; total: number }> {
    let added = 0;
    let updated = 0;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    try {
      const db = new DatabaseSync(FRANK_DB_PATH);

      // Prepara statement per verificare se un source_id esiste già
      const checkStmt = db.prepare('SELECT id, status FROM deadlines WHERE source_id = ? LIMIT 1');
      const insertStmt = db.prepare(`
        INSERT INTO deadlines (id, title, description, due_date, category, priority, status, scope, source, source_id, days_notice, amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
      `);

      // 1. DAI THREAD EMAIL ANALIZZATI (Task operativi di lavoro)
      try {
        const threads = db.prepare(`
          SELECT thread_id, subject, active_tasks_json, analyzed_at
          FROM thread_analyses
          WHERE active_tasks_json IS NOT NULL AND active_tasks_json != '[]'
        `).all() as any[];

        for (const t of threads) {
          try {
            const tasks = JSON.parse(t.active_tasks_json || '[]');
            tasks.forEach((task: any, idx: number) => {
              const sourceId = `email-task-${t.thread_id}-${idx}`;
              const existing = checkStmt.all(sourceId) as any[];

              if (existing.length === 0) {
                // Calcola una data limite plausibile basata sull'urgenza se non specificata
                const urgency = (task.urgency || 'medium').toLowerCase();
                let priority: DeadlinePriority = 'media';
                let offsetDays = 3;
                let daysNotice = 2;

                if (urgency === 'high' || urgency === 'alta') {
                  priority = 'alta';
                  offsetDays = 2; // Entro 48h
                  daysNotice = 2;
                } else if (urgency === 'low' || urgency === 'bassa') {
                  priority = 'bassa';
                  offsetDays = 7;
                  daysNotice = 3;
                }

                const targetDate = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
                const dueDateStr = targetDate.toISOString().split('T')[0];

                const id = `dl-em-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                insertStmt.run(
                  id,
                  task.summary,
                  task.reason || `Attività richiesta nel thread email: ${t.subject}`,
                  dueDateStr,
                  'task_operativo',
                  priority,
                  'work',
                  `Email: ${t.subject}`,
                  sourceId,
                  daysNotice,
                  null,
                  new Date().toISOString()
                );
                added++;
              }
            });
          } catch {}
        }
      } catch (err) {
        console.warn('Sync email tasks error:', err);
      }

      // 2. DALLE SPESE FISSE E SCADENZE PAGAMENTO (Personali - Solo pagamenti manuali, esclude addebito automatico)
      try {
        // Rimuove dalle scadenze attive eventuali spese che hanno il flag addebito automatico (non richiedono azione manuale)
        try {
          const autoDebitExpenses = db.prepare('SELECT id FROM fixed_expenses WHERE is_auto_debit = 1').all() as any[];
          for (const ad of autoDebitExpenses) {
            db.prepare('DELETE FROM deadlines WHERE source_id = ?').run(`fin-exp-${ad.id}`);
          }
        } catch {}

        const expenses = db.prepare('SELECT * FROM fixed_expenses WHERE is_paid = 0 AND (is_auto_debit = 0 OR is_auto_debit IS NULL)').all() as any[];
        for (const e of expenses) {
          const sourceId = `fin-exp-${e.id}`;
          const existing = checkStmt.all(sourceId) as any[];

          const dueDay = Number(e.due_day || 1);
          let targetMonth = currentMonth;
          let targetYear = currentYear;

          // Se il giorno del mese è già passato per questo mese, punta al mese prossimo
          if (dueDay < now.getDate()) {
            targetMonth++;
            if (targetMonth > 12) {
              targetMonth = 1;
              targetYear++;
            }
          }

          const dueDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

          if (existing.length === 0) {
            const id = `dl-fin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            insertStmt.run(
              id,
              `Saldare ${e.name} (€${e.amount})`,
              `Spesa fissa ${e.category} - Scadenza il ${dueDay} del mese`,
              dueDateStr,
              'pagamento',
              'alta',
              'personal',
              `Spese Fisse: ${e.name}`,
              sourceId,
              5, // Avvisa 5 giorni prima
              Number(e.amount || 0),
              new Date().toISOString()
            );
            added++;
          }
        }
      } catch (err) {
        console.warn('Sync finance expenses error:', err);
      }

      // 3. DAL CALENDARIO & MEETING (Lavoro)
      if (existsSync(EMAIL_DB_PATH)) {
        try {
          const emailDb = new DatabaseSync(EMAIL_DB_PATH, { readOnly: true });
          emailDb.exec('PRAGMA busy_timeout = 3000;');
          const events = emailDb.prepare(`
            SELECT id, subject, sender, event_start_at
            FROM emails
            WHERE source_type = 'meeting'
              AND event_start_at >= ?
              AND LOWER(TRIM(subject)) NOT IN ('home', 'office')
              AND subject NOT LIKE '%call settimanale AREA Sviluppo IT%'
              AND subject NOT LIKE '%IDIA - Perniceni%'
            ORDER BY event_start_at ASC
            LIMIT 10
          `).all(todayStr) as any[];
          emailDb.close();

          for (const ev of events) {
            const sourceId = `cal-meet-${ev.id}`;
            const existing = checkStmt.all(sourceId) as any[];
            const eventDateStr = (ev.event_start_at || '').split(' ')[0] || (ev.event_start_at || '').split('T')[0];

            if (existing.length === 0 && eventDateStr) {
              const id = `dl-cal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
              insertStmt.run(
                id,
                `Preparazione: ${ev.subject}`,
                `Riunione convocata da ${ev.sender || 'Organizzatore'} il ${ev.event_start_at}`,
                eventDateStr,
                'preparazione_call',
                'media',
                'work',
                `Google Calendar: ${ev.subject}`,
                sourceId,
                1, // Avvisa 1 giorno prima
                null,
                new Date().toISOString()
              );
              added++;
            }
          }
        } catch (err) {
          console.warn('Sync calendar meetings error:', err);
        }
      }

      db.close();
    } catch (e) {
      console.error('DeadlineEngine syncFromAllSubagents fatal error:', e);
    }

    const { deadlines } = this.getDeadlines();
    return { added, updated, total: deadlines.length };
  }

  /**
   * Estrae automaticamente scadenze, validità e adempimenti dal testo di un documento caricato nel RAG
   */
  public async extractDeadlinesFromDocumentText(
    filename: string,
    text: string
  ): Promise<DeadlineRecord[]> {
    if (!text || text.length < 30) return [];

    const apiKey = getAiApiKey();
    if (!apiKey) {
      console.warn('extractDeadlinesFromDocumentText: Nessuna API key AI disponibile');
      return [];
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const promptText = `Sei l'analizzatore di scadenze e conformità del Second Brain Frank.
Data di oggi: ${todayStr}.
Nome documento: "${filename}".

Analizza attentamente il testo estratto dal documento. Individua QUALSIASI scadenza temporale, termine perentorio, data di validità, data di rinnovo, termine di disdetta, adempimento burocratico o data di pagamento menzionata.

Se trovi scadenze o termini critici, restituisci ESCLUSIVAMENTE un JSON valido (senza testo introduttivo, senza blocchi markdown) strutturato così:
[
  {
    "title": "Titolo breve dell'adempimento o scadenza (es. Rinnovo visura / Termine disdetta)",
    "description": "Descrizione sintetica del vincolo o dell'adempimento",
    "dueDate": "YYYY-MM-DD",
    "priority": "alta" | "media" | "bassa",
    "daysNotice": 7
  }
]

Se NON ci sono scadenze temporali o date limite nel documento, restituisci semplicemente una lista vuota: []

TESTO DEL DOCUMENTO (primi 3500 caratteri):
${text.slice(0, 3500)}`;

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            { role: 'system', content: 'Rispondi esclusivamente con JSON grezzo. Nessun markup markdown o commenti aggiuntivi.' },
            { role: 'user', content: promptText }
          ],
          temperature: 0.1,
          max_tokens: 600
        })
      });

      if (!response.ok) {
        console.warn('Perplexity deadline extraction HTTP error:', response.status);
        return [];
      }

      const resData: any = await response.json();
      const rawText = resData.choices?.[0]?.message?.content || '[]';
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

      const extractedItems = JSON.parse(cleanJson);
      if (!Array.isArray(extractedItems) || extractedItems.length === 0) {
        return [];
      }

      const createdList: DeadlineRecord[] = [];
      for (const item of extractedItems) {
        if (!item.title || !item.dueDate) continue;

        // Assicurati che il formato data sia corretto
        let formattedDate = item.dueDate;
        if (!/^\d{4}-\d{2}-\d{2}/.test(formattedDate)) {
          formattedDate = todayStr;
        }

        const created = this.createDeadline({
          title: item.title,
          description: item.description || `Estratto automaticamente dal documento: ${filename}`,
          dueDate: formattedDate,
          category: 'documento',
          priority: item.priority === 'alta' ? 'alta' : (item.priority === 'bassa' ? 'bassa' : 'media'),
          scope: 'personal',
          source: `Documento: ${filename}`,
          sourceId: `doc-${filename}-${item.title.substring(0, 20)}`,
          daysNotice: Number(item.daysNotice || 7)
        });
        createdList.push(created);
      }

      return createdList;
    } catch (e) {
      console.warn('extractDeadlinesFromDocumentText parsing error:', e);
      return [];
    }
  }
}

export const deadlineEngine = DeadlineEngine.getInstance();

