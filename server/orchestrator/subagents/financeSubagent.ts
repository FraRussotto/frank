import { ISubagent, SubagentMeta, SubagentAlert } from '../types';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';

const FRANK_DB_PATH = '/Users/fra_russo/Frank/database/frank_agent.sqlite';

export class FinanceSubagent implements ISubagent {
  public id = 'finance';
  public name = 'Subagente Spese & Finanze';
  public department = 'Reparto Spese & Scadenze';
  public icon = 'CreditCard';
  public description = 'Monitora le spese fisse mensili, calcola gli importi residui da saldare e lancia alert per pagamenti in scadenza nei prossimi giorni.';
  private lastRunAt: string | null = null;
  private isScanning = false;

  constructor() {
    this.ensureTables();
  }

  private ensureTables() {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.exec(`
        CREATE TABLE IF NOT EXISTS fixed_expenses (
          id TEXT PRIMARY KEY,
          name TEXT,
          amount REAL,
          category TEXT,
          frequency TEXT,
          due_day INTEGER,
          is_paid INTEGER,
          notes TEXT
        );
      `);

      // Seed se vuoto
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM fixed_expenses').get() as any;
      if (countRow && countRow.cnt === 0) {
        const seed = [
          ['exp-1', 'Affitto / Mutuo Appartamento', 850, 'Casa', 'Mensile', 1, 1, 'Bonifico automatico inizio mese'],
          ['exp-2', 'Bolletta Luce & Gas', 145, 'Utenze', 'Bimestrale', 15, 0, 'Scadenza metà mese'],
          ['exp-3', 'Connessione Fibra Internet', 29.90, 'Utenze', 'Mensile', 10, 1, 'Addebito diretto SDD'],
          ['exp-4', 'Tool AI & Cloud Subscriptions', 40, 'Lavoro', 'Mensile', 20, 0, 'Gemini Advanced + API Serverless'],
          ['exp-5', 'Assicurazione Auto & Moto', 65, 'Trasporti', 'Mensile', 27, 0, 'Rata mensile Zurich'],
          ['exp-6', 'Abbonamento Palestra', 55, 'Altro', 'Mensile', 5, 1, 'Accesso Open']
        ];
        const insertStmt = db.prepare(`
          INSERT INTO fixed_expenses (id, name, amount, category, frequency, due_day, is_paid, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        seed.forEach(item => insertStmt.run(...item));
      }
      db.close();
    } catch (e) {
      console.warn('FinanceSubagent ensureTables error:', e);
    }
  }

  public async getMeta(): Promise<SubagentMeta> {
    let expenses: any[] = [];
    try {
      const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
      expenses = db.prepare('SELECT * FROM fixed_expenses').all() as any[];
      db.close();
    } catch (e) {
      console.warn('FinanceSubagent read error:', e);
    }

    const currentDay = new Date().getDate();
    const unpaid = expenses.filter(e => !e.is_paid);
    const unpaidAmount = unpaid.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Alert per spese dovute entro 5 giorni
    const alerts: SubagentAlert[] = [];
    const upcomingDue = unpaid.filter(e => e.due_day >= currentDay && e.due_day <= currentDay + 5);

    if (upcomingDue.length > 0) {
      alerts.push({
        id: 'alert-fin-due-soon',
        level: 'warning',
        title: `${upcomingDue.length} Spese in scadenza a breve`,
        message: upcomingDue.map(e => `${e.name} (€${e.amount}) il giorno ${e.due_day}`).join('; '),
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
        totalExpensesCount: expenses.length,
        unpaidCount: unpaid.length,
        unpaidAmount: Number(unpaidAmount.toFixed(2)),
        totalMonthlyAmount: Number(totalAmount.toFixed(2)),
        dueSoonCount: upcomingDue.length
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
        message: `Verifica spese completata. Totale da saldare: €${meta.stats.unpaidAmount} (${meta.stats.unpaidCount} voci).`,
        details: meta.stats
      };
    } catch (e: any) {
      this.isScanning = false;
      return {
        success: false,
        message: `Errore scansione spese: ${e.message}`
      };
    }
  }

  public async query(intent: string, payload?: any): Promise<any> {
    const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
    const expenses = db.prepare('SELECT * FROM fixed_expenses').all() as any[];
    db.close();
    return { expenses };
  }
}
