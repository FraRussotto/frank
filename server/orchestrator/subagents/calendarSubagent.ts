import { ISubagent, SubagentMeta, SubagentAlert } from '../types';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

import { EMAIL_DB_PATH } from '../../paths';

export class CalendarSubagent implements ISubagent {
  public id = 'calendar';
  public name = 'Subagente Calendario & Agenda';
  public department = 'Reparto Agenda & Riunioni';
  public icon = 'Calendar';
  public description = 'Monitora gli appuntamenti, le riunioni su Google Calendar (Lavoro & Personale), calcola il carico giornaliero e segnala eventi imminenti che richiedono preparazione.';
  private lastRunAt: string | null = null;
  private isScanning = false;

  public async getMeta(): Promise<SubagentMeta> {
    const todayStr = new Date().toISOString().split('T')[0];
    let upcomingEvents: any[] = [];

    if (existsSync(EMAIL_DB_PATH)) {
      let db: any = null;
      try {
        db = new DatabaseSync(EMAIL_DB_PATH, { readOnly: true });
        db.exec('PRAGMA busy_timeout = 5000;');
        upcomingEvents = db.prepare(`
          SELECT id, subject, sender, event_start_at, event_end_at, recipients
          FROM emails
          WHERE source_type = 'meeting'
            AND event_start_at >= ?
            AND LOWER(TRIM(subject)) NOT IN ('home', 'office')
            AND subject NOT LIKE '%call settimanale AREA Sviluppo IT%'
            AND subject NOT LIKE '%IDIA - Perniceni%'
          ORDER BY event_start_at ASC
          LIMIT 20
        `).all(todayStr) as any[];
      } catch (err) {
        console.warn('CalendarSubagent SQLite read error:', err);
      } finally {
        if (db) try { db.close(); } catch {}
      }
    }

    const alerts: SubagentAlert[] = [];

    // Controlla eventi nei prossimi 3 giorni
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0];

    const imminentEvents = upcomingEvents.filter(e => {
      const datePart = (e.event_start_at || '').split(' ')[0] || (e.event_start_at || '').split('T')[0];
      return datePart <= threeDaysStr;
    });

    if (imminentEvents.length > 0) {
      alerts.push({
        id: 'alert-cal-imminent',
        level: 'info',
        title: `${imminentEvents.length} Riunioni nei prossimi 3 giorni`,
        message: imminentEvents.map(e => e.subject).slice(0, 2).join(', '),
        timestamp: new Date().toISOString()
      });
    }

    return {
      id: this.id,
      name: this.name,
      department: this.department,
      icon: this.icon,
      description: this.description,
      status: this.isScanning ? 'running' : 'idle',
      lastRunAt: this.lastRunAt || new Date().toISOString(),
      stats: {
        totalUpcoming: upcomingEvents.length,
        imminentCount: imminentEvents.length,
        nextMeeting: upcomingEvents[0] ? `${upcomingEvents[0].subject} (${upcomingEvents[0].event_start_at})` : 'Nessuna riunione programmata'
      },
      alerts
    };
  }

  public async runScan(force = false): Promise<{ success: boolean; message: string; details?: any }> {
    this.isScanning = true;
    this.lastRunAt = new Date().toISOString();
    try {
      const meta = await this.getMeta();
      this.isScanning = false;
      return {
        success: true,
        message: `Scansione calendario completata. Rilevati ${meta.stats.totalUpcoming} eventi futuri.`,
        details: meta.stats
      };
    } catch (e: any) {
      this.isScanning = false;
      return {
        success: false,
        message: `Errore scansione calendario: ${e.message}`
      };
    }
  }

  public async query(intent: string, payload?: any): Promise<any> {
    const todayStr = new Date().toISOString().split('T')[0];
    let events: any[] = [];
    if (existsSync(EMAIL_DB_PATH)) {
      let db: any = null;
      try {
        db = new DatabaseSync(EMAIL_DB_PATH, { readOnly: true });
        db.exec('PRAGMA busy_timeout = 5000;');
        events = db.prepare(`
          SELECT id, subject, sender, event_start_at, event_end_at
          FROM emails
          WHERE source_type = 'meeting'
            AND event_start_at >= ?
            AND LOWER(TRIM(subject)) NOT IN ('home', 'office')
          ORDER BY event_start_at ASC
        `).all(todayStr) as any[];
      } catch (err) {
        console.warn('CalendarSubagent query read warning:', err);
      } finally {
        if (db) try { db.close(); } catch {}
      }
    }
    return { events };
  }
}

