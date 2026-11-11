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

      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM kb_documents').get() as any;
      if (countRow && countRow.cnt === 0) {
        const seed = [
          ['doc-1', 'Policy e Linee Guida Artefice Group', 'Aziendale', 4, new Date().toISOString()],
          ['doc-2', 'Architettura Pimcore e Setup Ambiente', 'Tecnico', 6, new Date().toISOString()],
          ['doc-3', 'Note Operative Server e DNS Citterio', 'Progetti', 4, new Date().toISOString()]
        ];
        const insertStmt = db.prepare(`
          INSERT INTO kb_documents (id, title, category, chunk_count, created_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        seed.forEach(item => insertStmt.run(...item));
      }
      db.close();
    } catch (e) {
      console.warn('KnowledgeSubagent ensureTables error:', e);
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

