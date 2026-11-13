import { ISubagent, SubagentMeta, SubagentAlert } from '../types';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { FRANK_DB_PATH } from '../../paths';

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
          is_auto_debit INTEGER DEFAULT 0,
          notes TEXT
        );
      `);
      try {
        db.exec('ALTER TABLE fixed_expenses ADD COLUMN is_auto_debit INTEGER DEFAULT 0;');
      } catch {}
      db.close();
    } catch (e) {
      console.warn('FinanceSubagent ensureTables error:', e);
    }
  }

  public static syncExpenses(expensesList: any[]): void {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.exec('DELETE FROM fixed_expenses');
      if (Array.isArray(expensesList) && expensesList.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO fixed_expenses (id, name, amount, category, frequency, due_day, is_paid, is_auto_debit, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const e of expensesList) {
          stmt.run(
            String(e.id),
            String(e.name || ''),
            Number(e.amount || 0),
            String(e.category || 'Altro'),
            String(e.frequency || 'Mensile'),
            Number(e.dueDay || e.due_day || 1),
            e.isPaid || e.is_paid ? 1 : 0,
            e.isAutoDebit || e.is_auto_debit ? 1 : 0,
            String(e.notes || '')
          );
        }
      }
      db.close();
    } catch (e) {
      console.error('Error syncing expenses to SQLite:', e);
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
    const unpaidManual = unpaid.filter(e => !e.is_auto_debit);
    const unpaidAmount = unpaid.reduce((sum, e) => sum + (e.amount || 0), 0);
    const unpaidManualAmount = unpaidManual.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Alert per spese manuali dovute entro 5 giorni (le spese con addebito automatico non richiedono azione)
    const alerts: SubagentAlert[] = [];
    const upcomingDue = unpaidManual.filter(e => e.due_day >= currentDay && e.due_day <= currentDay + 5);

    if (upcomingDue.length > 0) {
      alerts.push({
        id: 'alert-fin-due-soon',
        level: 'warning',
        title: `${upcomingDue.length} Spese manuali da saldare a breve`,
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

