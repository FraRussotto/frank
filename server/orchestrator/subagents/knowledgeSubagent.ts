import { ISubagent, SubagentMeta, SubagentAlert } from '../types';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { FRANK_DB_PATH, UPLOADS_DOCS_DIR } from '../../paths';
import { parseDocumentBuffer } from '../../documentParser';

export class KnowledgeSubagent implements ISubagent {
  public id = 'knowledge';
  public name = 'Subagente Knowledge & RAG';
  public department = 'Reparto Documentale & Conoscenza';
  public icon = 'FileText';
  public description = 'Indicizza note operative, procedure interne, visure, documenti caricati e linee guida per risposte semantiche immediate nel Second Brain.';
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
          created_at TEXT,
          file_url TEXT,
          original_filename TEXT,
          mime_type TEXT,
          content TEXT
        );
      `);
      try {
        db.exec('ALTER TABLE kb_documents ADD COLUMN content TEXT');
      } catch {}
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
          INSERT INTO kb_documents (id, title, category, chunk_count, created_at, file_url, original_filename, mime_type, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const d of docsList) {
          stmt.run(
            String(d.id),
            String(d.title || 'Documento'),
            String(d.category || 'Altro'),
            Number(d.chunksCount || 0),
            String(d.uploadedAt || new Date().toISOString()),
            d.fileUrl ? String(d.fileUrl) : null,
            d.originalFilename ? String(d.originalFilename) : null,
            d.mimeType ? String(d.mimeType) : null,
            d.content ? String(d.content) : null
          );
        }
      }
      db.close();
    } catch (e) {
      console.error('Error syncing documents to SQLite:', e);
    }
  }

  /**
   * Ricerca semantica/lessicale avanzata all'interno dei documenti salvati nel database o su disco.
   * Usata sia dalla chat web sia da Telegram per trovare dati aziendali, Partita IVA, contratti e note.
   */
  public async search(
    queryText: string,
    maxSnippets = 4
  ): Promise<Array<{ documentTitle: string; content: string; score: number }>> {
    if (!queryText || !queryText.trim()) return [];

    const stopWords = new Set([
      'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
      'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
      'e', 'o', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
      'al', 'allo', 'alla', 'ai', 'agli', 'alle',
      'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
      'mio', 'mia', 'miei', 'mie', 'tuo', 'tua', 'tuoi', 'tue',
      'suo', 'sua', 'chi', 'che', 'cosa', 'come', 'quando', 'dove', 'perché',
      'qual', 'quale', 'quali', 'sono', 'hai', 'ho', 'puoi', 'darmi'
    ]);

    const normalizedQuery = queryText.toLowerCase().replace(/[^a-z0-9àèéìòù\s]/g, ' ');
    const rawTokens = normalizedQuery.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w));
    const tokens = Array.from(new Set(rawTokens));

    if (tokens.length === 0) return [];

    let docs: any[] = [];
    try {
      const db = new DatabaseSync(FRANK_DB_PATH);
      docs = db.prepare('SELECT id, title, category, content, original_filename FROM kb_documents').all() as any[];

      // Se qualche documento ha content nullo, tentiamo il recupero automatico dal file su disco
      for (const d of docs) {
        if (!d.content && existsSync(UPLOADS_DOCS_DIR)) {
          try {
            const files = readdirSync(UPLOADS_DOCS_DIR);
            const matchFile = files.find(f => f.startsWith(d.id));
            if (matchFile) {
              const buf = readFileSync(path.join(UPLOADS_DOCS_DIR, matchFile));
              const parsed = await parseDocumentBuffer(d.original_filename || d.title, buf);
              if (parsed && parsed.text) {
                d.content = parsed.text;
                db.prepare('UPDATE kb_documents SET content = ? WHERE id = ?').run(parsed.text, d.id);
              }
            }
          } catch (fileErr) {
            console.warn('Errore lettura documento da disco per RAG search:', fileErr);
          }
        }
      }
      db.close();
    } catch (e) {
      console.warn('KnowledgeSubagent search read error:', e);
      return [];
    }

    const scoredSnippets: Array<{ documentTitle: string; content: string; score: number }> = [];

    for (const doc of docs) {
      const fullText = (doc.content || '').trim();
      if (!fullText) continue;

      const titleLower = (doc.title || '').toLowerCase();
      let titleBonus = 0;
      for (const t of tokens) {
        if (titleLower.includes(t)) titleBonus += 3;
      }

      // Suddivisione in paragrafi/chunks di circa 400 caratteri
      const paragraphs = fullText.split(/\n{2,}|\r\n{2,}/);
      const chunks: string[] = [];

      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (!trimmed) continue;
        if (trimmed.length <= 500) {
          chunks.push(trimmed);
        } else {
          // Spezza paragrafi lunghi
          for (let i = 0; i < trimmed.length; i += 400) {
            chunks.push(trimmed.substring(i, i + 480).trim());
          }
        }
      }

      for (const chunk of chunks) {
        const chunkLower = chunk.toLowerCase();
        let chunkScore = titleBonus;

        for (const token of tokens) {
          if (chunkLower.includes(token)) {
            chunkScore += 2;
            // Match esatto con delimitatori
            const regex = new RegExp(`\\b${token}\\b`, 'i');
            if (regex.test(chunkLower)) {
              chunkScore += 2;
            }
          }
        }

        // Bonus mirati per dati fiscali o chiavi frequenti
        if (tokens.some(t => t.includes('iva') || t.includes('partita')) && (chunkLower.includes('partita iva') || chunkLower.includes('p.iva') || chunkLower.includes('p. iva'))) {
          chunkScore += 10;
        }
        if (tokens.some(t => t.includes('codice') || t.includes('fiscale') || t.includes('cf')) && chunkLower.includes('codice fiscale')) {
          chunkScore += 8;
        }

        if (chunkScore > 0) {
          scoredSnippets.push({
            documentTitle: doc.title || 'Documento',
            content: chunk,
            score: chunkScore
          });
        }
      }
    }

    scoredSnippets.sort((a, b) => b.score - a.score);

    // Evita duplicati di contenuto quasi identico
    const results: Array<{ documentTitle: string; content: string; score: number }> = [];
    for (const item of scoredSnippets) {
      const isDuplicate = results.some(r => r.content.slice(0, 80) === item.content.slice(0, 80));
      if (!isDuplicate) {
        results.push(item);
        if (results.length >= maxSnippets) break;
      }
    }

    return results;
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
    if (intent === 'search' && payload?.query) {
      const results = await this.search(payload.query, payload.limit || 4);
      return { results };
    }
    const db = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
    const docs = db.prepare('SELECT * FROM kb_documents').all() as any[];
    db.close();
    return { docs };
  }
}

