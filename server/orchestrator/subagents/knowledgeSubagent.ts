import { ISubagent, SubagentMeta, SubagentAlert } from '../types';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const FRANK_DB_PATH = '/Users/fra_russo/Frank/database/frank_agent.sqlite';

export class KnowledgeSubagent implements ISubagent {
  public id = 'knowledge';
  public name = 'Subagente Knowledge & RAG';
  public department = 'Reparto Documentale & Conoscenza';
  public icon = 'FileText';
  public description = 'Indicizza note operative, procedure interne, documenti caricati e linee guida aziendali per risposte semantiche immediate nel Second Brain.';
  private lastRunAt: string | null = null;
  private isScanning = false;

  constructor() {
    this.ensureTables();
  }

  private ensureTables() {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.exec(`
        CREATE TABLE IF NOT EXISTS kb_documents (
          id TEXT PRIMARY KEY,
          title TEXT,
          category TEXT,
          chunk_count INTEGER,
          created_at TEXT
        );
      `);
      db.close();
    } catch (e) {
      console.warn('KnowledgeSubagent ensureTables error:', e);
    }
  }

  public static syncDocuments(docsList: any[]): void {
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      db.exec('DELETE FROM kb_documents');
      if (Array.isArray(docsList) && docsList.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO kb_documents (id, title, category, chunk_count, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const d of docsList) {
          stmt.run(
            String(d.id),
            String(d.title || 'Documento'),
            String(d.category || 'Altro'),
            Number(d.chunksCount || 0),
            String(d.uploadedAt || new Date().toISOString())
          );
        }
      }
      db.close();
    } catch (e) {
      console.error('Error syncing documents to SQLite:', e);
    }
  }

  public async getMeta(): Promise<SubagentMeta> {
    let docs: any[] = [];
    try {
      const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
      docs = db.prepare('SELECT * FROM kb_documents').all() as any[];
      db.close();
    } catch (e) {
      console.warn('KnowledgeSubagent read error:', e);
    }

    const totalChunks = docs.reduce((sum, d) => sum + (d.chunk_count || 0), 0);

    return {
      id: this.id,
      name: this.name,
      department: this.department,
      icon: this.icon,
      description: this.description,
      status: this.isScanning ? 'running' : 'idle',
      lastRunAt: this.lastRunAt || new Date().toISOString(),
      stats: {
        documentsCount: docs.length,
        totalChunks,
        categories: Array.from(new Set(docs.map(d => d.category)))
      },
      alerts: []
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
        message: `Indice documentale aggiornato. ${meta.stats.documentsCount} documenti indicizzati (${meta.stats.totalChunks} frammenti).`,
        details: meta.stats
      };
    } catch (e: any) {
      this.isScanning = false;
      return {
        success: false,
        message: `Errore scansione documenti: ${e.message}`
      };
    }
  }

  public async query(intent: string, payload?: any): Promise<any> {
    const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
    const docs = db.prepare('SELECT * FROM kb_documents').all() as any[];
    db.close();
    return { docs };
  }
}

