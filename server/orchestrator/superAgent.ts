import {
  ISubagent,
  SubagentId,
  SubagentMeta,
  SuperAgentStatus,
  SuperAgentBriefing,
  PriorityAction
} from './types';
import { EmailSubagent } from './subagents/emailSubagent';
import { CalendarSubagent } from './subagents/calendarSubagent';
import { FinanceSubagent } from './subagents/financeSubagent';
import { KnowledgeSubagent } from './subagents/knowledgeSubagent';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

const FRANK_DB_PATH = '/Users/fra_russo/Frank/database/frank_agent.sqlite';
const LARAVEL_ENV_PATH = '/Users/fra_russo/email-ai-agent/.env';

function getAiApiKey(): string {
  if (existsSync(LARAVEL_ENV_PATH)) {
    const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
    const m = content.match(/OPENAI_API_KEY=(.+)/);
    if (m && m[1]) return m[1].trim();
  }
  return process.env.OPENAI_API_KEY || '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';
}

export class FrankSuperAgent {
  public name = 'Frank Master Brain';
  public role = 'Coordinatore & Super Agente Autonomo';
  public version = '2.0.0-multiagent';

  private subagents: Map<SubagentId, ISubagent> = new Map();
  private isOrchestrating = false;
  private lastOrchestrationAt: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureTables();
    this.registerSubagent(new EmailSubagent());
    this.registerSubagent(new CalendarSubagent());
    this.registerSubagent(new FinanceSubagent());
    this.registerSubagent(new KnowledgeSubagent());
  }

  private ensureTables() {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.exec(`
        CREATE TABLE IF NOT EXISTS super_agent_briefings (
          id TEXT PRIMARY KEY,
          generated_at TEXT,
          date TEXT,
          headline TEXT,
          summary TEXT,
          priority_actions_json TEXT,
          cross_domain_insights_json TEXT,
          stats_json TEXT
        );
        CREATE TABLE IF NOT EXISTS super_agent_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT,
          event_type TEXT,
          target_subagent TEXT,
          details TEXT
        );
      `);
      db.close();
    } catch (e) {
      console.warn('SuperAgent ensureTables error:', e);
    }
  }

  public registerSubagent(agent: ISubagent) {
    this.subagents.set(agent.id, agent);
    console.log(`[Frank Super Agente] Registrato subagente "${agent.name}" (${agent.department})`);
  }

  public getSubagent(id: SubagentId): ISubagent | undefined {
    return this.subagents.get(id);
  }

  public getAllSubagents(): ISubagent[] {
    return Array.from(this.subagents.values());
  }

  /**
   * Avvia il ciclo autonomo di coordinamento
   */
  public startHeartbeat(intervalMs = 60 * 1000) {
    console.log('[Frank Super Agente] Heartbeat di coordinamento avviato.');
    
    // Prima scansione iniziale
    this.orchestrateAll();

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this.orchestrateAll();
      }, intervalMs);
    }
  }

  public stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Esegue la scansione coordinata di tutti i subagenti e genera il briefing
   */
  public async orchestrateAll(): Promise<{ success: boolean; results: Record<string, any> }> {
    if (this.isOrchestrating) {
      return { success: false, results: { message: 'Orchestrazione già in corso' } };
    }

    this.isOrchestrating = true;
    this.lastOrchestrationAt = new Date().toISOString();
    const results: Record<string, any> = {};

    console.log('[Frank Super Agente] Avvio ciclo di coordinamento subagenti...');

    try {
      for (const [id, agent] of this.subagents.entries()) {
        try {
          const res = await agent.runScan();
          results[id] = res;
          this.logEvent('subagent_scan', id, JSON.stringify(res));
        } catch (err: any) {
          results[id] = { success: false, error: err.message };
        }
      }

      // Genera il briefing esecutivo aggiornato
      await this.generateExecutiveBriefing();
      return { success: true, results };
    } finally {
      this.isOrchestrating = false;
    }
  }

  /**
   * Esegue un singolo subagente
   */
  public async runSubagent(id: SubagentId): Promise<{ success: boolean; message: string; details?: any }> {
    const agent = this.subagents.get(id);
    if (!agent) {
      return { success: false, message: `Subagente "${id}" non trovato.` };
    }
    const res = await agent.runScan(true);
    this.logEvent('subagent_scan_manual', id, JSON.stringify(res));
    return res;
  }

  /**
   * Ritorna lo stato complessivo di Frank Super Agente e dei suoi subagenti
   */
  public async getStatus(): Promise<SuperAgentStatus> {
    const metas: SubagentMeta[] = [];
    for (const agent of this.subagents.values()) {
      metas.push(await agent.getMeta());
    }

    const latestBriefing = this.getLatestBriefing();

    return {
      name: this.name,
      role: this.role,
      version: this.version,
      isOrchestrating: this.isOrchestrating,
      lastOrchestrationAt: this.lastOrchestrationAt,
      subagents: metas,
      latestBriefing
    };
  }

  /**
   * Sintesi Esecutiva Multi-Dominio (Briefing Super Agente)
   */
  public async generateExecutiveBriefing(): Promise<SuperAgentBriefing> {
    const today = new Date();
    const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const currentDayName = dayNames[today.getDay()];
    const todayFormatted = `${currentDayName} ${today.toLocaleDateString('it-IT')}`;

    // Raccoglie dati dai vari subagenti
    const emailAgent = this.subagents.get('email');
    const calendarAgent = this.subagents.get('calendar');
    const financeAgent = this.subagents.get('finance');
    const knowledgeAgent = this.subagents.get('knowledge');

    const emailMeta = emailAgent ? await emailAgent.getMeta() : null;
    const calendarMeta = calendarAgent ? await calendarAgent.getMeta() : null;
    const financeMeta = financeAgent ? await financeAgent.getMeta() : null;
    const knowledgeMeta = knowledgeAgent ? await knowledgeAgent.getMeta() : null;

    const emailQuery = emailAgent ? await emailAgent.query('all') : { tasks: [] };
    const calendarQuery = calendarAgent ? await calendarAgent.query('all') : { events: [] };
    const financeQuery = financeAgent ? await financeAgent.query('all') : { expenses: [] };

    // Estrae e ordina le Priorità Cross-Dipartimento
    const priorityActions: PriorityAction[] = [];

    // 1. Task Email ad alta priorità
    if (emailQuery.tasks && Array.isArray(emailQuery.tasks)) {
      emailQuery.tasks.forEach((t: any, idx: number) => {
        const isHigh = t.urgency === 'high' || t.urgency === 'alta';
        const isMed = t.urgency === 'medium' || t.urgency === 'media';
        priorityActions.push({
          id: `email-act-${t.threadId}-${idx}`,
          urgency: isHigh ? 'alta' : isMed ? 'media' : 'bassa',
          department: 'Email & Comunicazioni',
          title: t.summary,
          description: t.reason || `Dal thread "${t.subject}"`,
          source: t.subject,
          linkTab: 'email-calendar'
        });
      });
    }

    // 2. Alert Finanze / Spese
    if (financeQuery.expenses && Array.isArray(financeQuery.expenses)) {
      const currentDay = today.getDate();
      financeQuery.expenses
        .filter((e: any) => !e.is_paid && e.due_day >= currentDay && e.due_day <= currentDay + 5)
        .forEach((e: any) => {
          priorityActions.push({
            id: `fin-act-${e.id}`,
            urgency: 'media',
            department: 'Spese & Finanze',
            title: `Saldare ${e.name} (€${e.amount})`,
            description: `Scadenza il giorno ${e.due_day} del mese (${e.category})`,
            source: 'Spese Fisse',
            deadline: `Giorno ${e.due_day}`,
            linkTab: 'expenses'
          });
        });
    }

    // 3. Eventi imminenti da preparare
    if (calendarQuery.events && Array.isArray(calendarQuery.events)) {
      calendarQuery.events.slice(0, 3).forEach((ev: any) => {
        priorityActions.push({
          id: `cal-act-${ev.id}`,
          urgency: 'media',
          department: 'Agenda & Riunioni',
          title: `Riunione: ${ev.subject}`,
          description: `Convocata da ${ev.sender || 'Organizzatore'} (${ev.event_start_at})`,
          source: 'Google Calendar',
          deadline: ev.event_start_at,
          linkTab: 'email-calendar'
        });
      });
    }

    // Ordina: alta -> media -> bassa
    const urgencyOrder: Record<string, number> = { alta: 0, media: 1, bassa: 2 };
    priorityActions.sort((a, b) => (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3));

    // Insights multi-dominio
    const crossDomainInsights: string[] = [];
    if (emailMeta?.stats?.actionRequiredThreads > 0) {
      crossDomainInsights.push(
        `Il Reparto Email rileva **${emailMeta.stats.actionRequiredThreads} thread con azioni pendenti** su ${emailMeta.stats.threadsAnalyzed} analizzati. I punti caldi riguardano la configurazione SMTP con Resend e le chiavi reCAPTCHA per Citterio.`
      );
    }
    if (calendarMeta?.stats?.totalUpcoming > 0) {
      crossDomainInsights.push(
        `Il Reparto Agenda ha registrato **${calendarMeta.stats.totalUpcoming} eventi futuri**. Il prossimo impegno segnato è: **${calendarMeta.stats.nextMeeting}**.`
      );
    }
    if (financeMeta?.stats?.unpaidCount > 0) {
      crossDomainInsights.push(
        `Il Reparto Finanze segnala **€${financeMeta.stats.unpaidAmount}** in ${financeMeta.stats.unpaidCount} spese ancora da saldare per questo mese.`
      );
    }

    const activeEmailTasks = emailMeta?.stats?.activeTasksCount || 0;
    const threadsWithAction = emailMeta?.stats?.actionRequiredThreads || 0;
    const upcomingMeetings = calendarMeta?.stats?.totalUpcoming || 0;
    const unpaidExpensesAmount = financeMeta?.stats?.unpaidAmount || 0;
    const unpaidExpensesCount = financeMeta?.stats?.unpaidCount || 0;
    const indexedDocsCount = knowledgeMeta?.stats?.documentsCount || 0;

    const headline = `Briefing Esecutivo Frank • ${todayFormatted}`;
    const summary = `Frank Super Agente ha sincronizzato e analizzato tutti i reparti: ci sono ${activeEmailTasks} task operativi dalle email (di cui le configurazioni reCAPTCHA e SMTP hanno massima priorità), ${upcomingMeetings} eventi futuri in agenda e €${unpaidExpensesAmount} in spese fisse mensili residui.`;

    const briefing: SuperAgentBriefing = {
      id: `briefing-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      date: todayFormatted,
      headline,
      summary,
      priorityActions: priorityActions.slice(0, 10),
      crossDomainInsights,
      stats: {
        activeEmailTasks,
        threadsWithAction,
        upcomingMeetings,
        unpaidExpensesAmount,
        unpaidExpensesCount,
        indexedDocsCount
      }
    };

    this.saveBriefing(briefing);
    return briefing;
  }

  private saveBriefing(briefing: SuperAgentBriefing) {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      const stmt = db.prepare(`
        INSERT INTO super_agent_briefings (
          id, generated_at, date, headline, summary,
          priority_actions_json, cross_domain_insights_json, stats_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          generated_at = excluded.generated_at,
          headline = excluded.headline,
          summary = excluded.summary,
          priority_actions_json = excluded.priority_actions_json,
          cross_domain_insights_json = excluded.cross_domain_insights_json,
          stats_json = excluded.stats_json
      `);
      stmt.run(
        briefing.id,
        briefing.generatedAt,
        briefing.date,
        briefing.headline,
        briefing.summary,
        JSON.stringify(briefing.priorityActions),
        JSON.stringify(briefing.crossDomainInsights),
        JSON.stringify(briefing.stats)
      );
      db.close();
    } catch (e) {
      console.warn('SuperAgent saveBriefing error:', e);
    }
  }

  public getLatestBriefing(): SuperAgentBriefing | null {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
      const row = db.prepare(`
        SELECT * FROM super_agent_briefings
        ORDER BY generated_at DESC
        LIMIT 1
      `).get() as any;
      db.close();

      if (!row) return null;
      return {
        id: row.id,
        generatedAt: row.generated_at,
        date: row.date,
        headline: row.headline,
        summary: row.summary,
        priorityActions: JSON.parse(row.priority_actions_json || '[]'),
        crossDomainInsights: JSON.parse(row.cross_domain_insights_json || '[]'),
        stats: JSON.parse(row.stats_json || '{}')
      };
    } catch (e) {
      console.warn('SuperAgent getLatestBriefing error:', e);
      return null;
    }
  }

  private logEvent(eventType: string, target: string, details: string) {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.prepare(`
        INSERT INTO super_agent_logs (timestamp, event_type, target_subagent, details)
        VALUES (?, ?, ?, ?)
      `).run(new Date().toISOString(), eventType, target, details);
      db.close();
    } catch {}
  }

  /**
   * Dialogo interattivo e coordinato con Frank Super Agente.
   * Frank analizza la richiesta, delega ai subagenti di competenza,
   * raccoglie i dati, li interpreta e genera una risposta conversazionale esecutiva.
   */
  public async answerUserDialog(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    clientContext?: { sources?: any[]; ecosystem?: any }
  ): Promise<{
    text: string;
    delegations: Array<{ id: string; name: string; icon: string; detail: string }>;
    model: string;
  }> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    const q = lastUserMessage.toLowerCase();

    // 1. Identificazione dei domini di competenza da delegare
    const hasClientSources = Array.isArray(clientContext?.sources) && clientContext.sources.length > 0;
    const isDocRelated =
      hasClientSources ||
      q.includes('iva') || q.includes('p.iva') || q.includes('partita') ||
      q.includes('codice fiscale') || q.includes('cf') ||
      q.includes('visura') || q.includes('document') || q.includes('pdf') ||
      q.includes('word') || q.includes('excel') || q.includes('foglio') ||
      q.includes('pec') || q.includes('sede') || q.includes('statuto') ||
      q.includes('contratt') || q.includes('policy') || q.includes('manual');

    const isEmailRelated =
      q.includes('email') || q.includes('thread') || q.includes('posta') ||
      q.includes('messagg') || q.includes('task') || q.includes('attivit') ||
      q.includes('da fare') || q.includes('priorit') || q.includes('citterio') ||
      q.includes('resend') || q.includes('dreame') || q.includes('yowup') ||
      q.includes('electrolux') || q.includes('scritto') || q.includes('urgent');

    const isCalendarRelated =
      q.includes('calendar') || q.includes('riunion') || q.includes('meeting') ||
      q.includes('agenda') || q.includes('appuntament') || q.includes('call') ||
      q.includes('orari') || q.includes('quando') || q.includes('settiman') ||
      q.includes('oggi') || q.includes('domani');

    const isFinanceRelated =
      q.includes('spes') || q.includes('pagar') || q.includes('bollett') ||
      q.includes('affitt') || q.includes('soldi') || q.includes('saldo') ||
      q.includes('bonifico') || q.includes('cost') || q.includes('budget') ||
      q.includes('playstation') || q.includes('palestra') || q.includes('assicuraz');

    const isGeneralStatus =
      !isDocRelated && !isEmailRelated && !isCalendarRelated && !isFinanceRelated;

    const delegations: Array<{ id: string; name: string; icon: string; detail: string }> = [];
    const contextBlocks: string[] = [];

    // A. Delega al Subagente Knowledge & RAG
    if (isDocRelated || isGeneralStatus) {
      const sources = clientContext?.sources || [];
      if (sources.length > 0) {
        const docNames = Array.from(new Set(sources.map((s: any) => s.chunk?.documentTitle || s.documentTitle || 'Documento'))).join(', ');
        delegations.push({
          id: 'knowledge',
          name: 'Subagente Knowledge & RAG',
          icon: 'FileText',
          detail: `Estratto da ${docNames}`
        });
        const docsText = sources
          .slice(0, 3)
          .map((s: any) => `[FONTE: ${s.chunk?.documentTitle || s.documentTitle}]:\n${s.chunk?.content || s.content}`)
          .join('\n\n');
        contextBlocks.push(`=== 📄 DATI DAL SUBAGENTE KNOWLEDGE & RAG ===\n${docsText}`);
      } else if (isDocRelated) {
        delegations.push({
          id: 'knowledge',
          name: 'Subagente Knowledge & RAG',
          icon: 'FileText',
          detail: 'Ricerca nei documenti indicizzati'
        });
      }
    }

    // B. Delega al Subagente Email & Thread
    if (isEmailRelated || isGeneralStatus) {
      const emailAgent = this.subagents.get('email');
      if (emailAgent) {
        const res = await emailAgent.query('active');
        const tasks = res?.tasks || [];
        delegations.push({
          id: 'email',
          name: 'Subagente Email & Thread',
          icon: 'MailCheck',
          detail: `${tasks.length} task attivi analizzati dai thread recenti`
        });
        if (tasks.length > 0) {
          const tasksText = tasks
            .slice(0, 6)
            .map((t: any) => `- [Urgenza ${t.urgency.toUpperCase()}] ${t.summary} (Thread: "${t.subject}")`)
            .join('\n');
          contextBlocks.push(`=== ✉️ DATI DAL SUBAGENTE EMAIL & THREAD ===\n${tasksText}`);
        }
      }
    }

    // C. Delega al Subagente Calendario & Agenda
    if (isCalendarRelated || isGeneralStatus) {
      const calendarAgent = this.subagents.get('calendar');
      if (calendarAgent) {
        const res = await calendarAgent.query('upcoming');
        const events = res?.events || [];
        delegations.push({
          id: 'calendar',
          name: 'Subagente Calendario & Agenda',
          icon: 'Calendar',
          detail: `${events.length} eventi futuri monitorati`
        });
        if (events.length > 0) {
          const evText = events
            .slice(0, 5)
            .map((e: any) => `- ${e.event_start_at}: ${e.subject} (Organizzatore: ${e.sender || 'Lavoro'})`)
            .join('\n');
          contextBlocks.push(`=== 📅 DATI DAL SUBAGENTE CALENDARIO ===\n${evText}`);
        }
      }
    }

    // D. Delega al Subagente Spese & Finanze
    if (isFinanceRelated || isGeneralStatus) {
      const financeAgent = this.subagents.get('finance');
      if (financeAgent) {
        const res = await financeAgent.query('all');
        const expenses = res?.expenses || [];
        const unpaid = expenses.filter((e: any) => !e.is_paid);
        const unpaidTotal = unpaid.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        delegations.push({
          id: 'finance',
          name: 'Subagente Spese & Finanze',
          icon: 'CreditCard',
          detail: `€${unpaidTotal.toFixed(2)} in ${unpaid.length} spese da saldare`
        });
        if (expenses.length > 0) {
          const expText = unpaid
            .map((e: any) => `- ${e.name}: €${e.amount} (scadenza giorno ${e.due_day} del mese)`)
            .join('\n');
          contextBlocks.push(`=== 💳 DATI DAL SUBAGENTE SPESE & FINANZE ===\nSpese da saldare:\n${expText || 'Tutte le spese fisse risultano saldate.'}`);
        }
      }
    }

    // Costruzione del Prompt per Sonar
    const today = new Date();
    const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const currentDay = `${dayNames[today.getDay()]} ${today.toLocaleDateString('it-IT')}`;

    const systemPrompt = `Sei Frank, il Super Agente Coordinatore e Chief-of-Staff del Second Brain di Francesco Russotto.
Oggi è ${currentDay} (anno 2026).

COME OPERI:
1. Sei dialogativo, cordiale e presente, come un vero assistente personale, ma SEMPRE esecutivo, lucido ed essenziale.
2. Rispondi in modo mirato e compatto alla richiesta di Francesco basandoti sui dati reali che hai appena fatto estrarre ai tuoi subagenti delegati (riportati sotto).
3. Se Francesco chiede un dato specifico (es. numero Partita IVA, codice fiscale, PEC, indirizzo della sede, orario di un appuntamento, importo spesa):
   Forniscilo SUBITO in prima riga evidenziato chiaramente in **grassetto**, con fonte tra parentesi. NON incollare mai l'intero documento o il suo indice.
4. Se è una domanda di follow-up nella conversazione, mantieni naturale continuità col discorso.
5. Usa formattazione Markdown elegante ed elenchi puntati puliti quando elenchi più elementi.

DATI ESTRATTI DAI SUBAGENTI DELEGATI:
${contextBlocks.join('\n\n') || 'Nessun dato specifico estratto dai subagenti.'}`;

    const apiKey = getAiApiKey();
    try {
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
            ...messages.slice(-6)
          ],
          temperature: 0.1
        })
      });

      if (aiRes.ok) {
        const data: any = await aiRes.json();
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim()) {
          return {
            text: text.trim(),
            delegations,
            model: 'Frank Super Agent (Sonar)'
          };
        }
      }
    } catch (err) {
      console.warn('Errore chiamata Sonar in answerUserDialog:', err);
    }

    // Fallback locale compatto
    return {
      text: `Ho consultato i subagenti pertinenti per la tua richiesta. ${contextBlocks.slice(0, 1).join('\n')}`,
      delegations,
      model: 'Frank Smart Core'
    };
  }
}

export const superAgent = new FrankSuperAgent();

