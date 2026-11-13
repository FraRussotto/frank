import { ISubagent, SubagentMeta, SubagentAlert } from '../types';
import { autonomousAgent, getAllAnalysesMap } from '../autonomousAgentProxy';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

import { EMAIL_DB_PATH } from '../../paths';

export class EmailSubagent implements ISubagent {
  public id = 'email';
  public name = 'Subagente Email & Thread';
  public department = 'Reparto Email & Comunicazioni';
  public icon = 'MailCheck';
  public description = 'Monitora i thread di posta, analizza le conversazioni, estrae le attività a carico di Francesco e prepara le bozze di risposta.';
  private lastRunAt: string | null = null;

  public async getMeta(): Promise<SubagentMeta> {
    const analysesMap = getAllAnalysesMap();
    let actionRequiredThreads = 0;
    let activeTasksCount = 0;
    let draftsCount = 0;
    let highUrgencyTasks = 0;

    const urgentItems: string[] = [];

    analysesMap.forEach((a) => {
      if (a.myActionRequired || a.status === 'action_required') {
        actionRequiredThreads++;
      }
      if (Array.isArray(a.activeTasks)) {
        activeTasksCount += a.activeTasks.length;
        a.activeTasks.forEach((t: any) => {
          if (t.urgency === 'high' || t.urgency === 'alta') {
            highUrgencyTasks++;
            urgentItems.push(t.summary);
          }
        });
      }
      if (a.draftReply && a.draftReply.body && a.draftReply.body.trim()) {
        draftsCount++;
      }
    });

    const alerts: SubagentAlert[] = [];
    if (highUrgencyTasks > 0) {
      alerts.push({
        id: 'alert-email-high',
        level: 'urgent',
        title: `${highUrgencyTasks} Attività ad Alta Priorità`,
        message: urgentItems.slice(0, 2).join('; ') + (urgentItems.length > 2 ? '...' : ''),
        timestamp: new Date().toISOString()
      });
    }

    const workerStatus = autonomousAgent.getStatus();
    const isRunning = workerStatus.isProcessing;

    return {
      id: this.id,
      name: this.name,
      department: this.department,
      icon: this.icon,
      description: this.description,
      status: isRunning ? 'running' : 'idle',
      lastRunAt: this.lastRunAt || new Date().toISOString(),
      stats: {
        threadsAnalyzed: analysesMap.size,
        actionRequiredThreads,
        activeTasksCount,
        draftsReady: draftsCount,
        queueRemaining: workerStatus.queueLength,
        currentThread: workerStatus.currentThreadSubject || null
      },
      alerts
    };
  }

  public async runScan(force = false): Promise<{ success: boolean; message: string; details?: any }> {
    this.lastRunAt = new Date().toISOString();
    try {
      const enqueued = await autonomousAgent.scanAndEnqueue();
      return {
        success: true,
        message: `Scansione thread avviata. ${enqueued} nuovi thread accodati per l'analisi autonoma.`,
        details: { enqueued }
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Errore durante la scansione email: ${err.message}`
      };
    }
  }

  public async query(intent: string, payload?: any): Promise<any> {
    const analyses = getAllAnalysesMap();
    const tasks: any[] = [];
    analyses.forEach((a) => {
      if (Array.isArray(a.activeTasks)) {
        a.activeTasks.forEach((t: any) => {
          tasks.push({
            threadId: a.threadId,
            subject: a.subject,
            summary: t.summary,
            urgency: t.urgency,
            reason: t.reason
          });
        });
      }
    });
    return {
      totalTasks: tasks.length,
      tasks
    };
  }
}

