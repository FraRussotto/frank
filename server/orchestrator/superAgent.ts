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
}

export const superAgent = new FrankSuperAgent();
