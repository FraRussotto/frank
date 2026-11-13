import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { exec } from 'node:child_process';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, createReadStream } from 'node:fs';
import zlib from 'node:zlib';
import { autonomousAgent, getAllAnalysesMap, analyzeThreadAutonomous } from './server/autonomousAgent';
import { superAgent } from './server/orchestrator/superAgent';
import { FinanceSubagent } from './server/orchestrator/subagents/financeSubagent';
import { KnowledgeSubagent } from './server/orchestrator/subagents/knowledgeSubagent';
import { deadlineEngine } from './server/orchestrator/deadlineEngine';
import { generateDailyBriefing } from './server/orchestrator/dailyBriefing';
import { parseDocumentBuffer } from './server/documentParser';
import { telegramBot } from './server/telegram/telegramBot';
import { initTelegramScheduler } from './server/telegram/scheduler';
import { saveTelegramConfig, loadTelegramConfig } from './server/telegram/config';

const LARAVEL_DIR = process.env.LARAVEL_DIR || (
  existsSync('/Users/fra_russo/email-ai-agent')
    ? '/Users/fra_russo/email-ai-agent'
    : path.join(__dirname, '..', 'email-ai-agent')
);
const DB_PATH = process.env.EMAIL_DB_PATH || path.join(LARAVEL_DIR, 'database', 'database.sqlite');
const LARAVEL_ENV_PATH = process.env.LARAVEL_ENV_PATH || path.join(LARAVEL_DIR, '.env');
const FRANK_DB_PATH = process.env.FRANK_DB_PATH || path.join(__dirname, 'database', 'frank_agent.sqlite');
const UPLOADS_DOCS_DIR = process.env.UPLOADS_DOCS_DIR || path.join(__dirname, 'uploads', 'documents');
if (!existsSync(UPLOADS_DOCS_DIR)) {
  mkdirSync(UPLOADS_DOCS_DIR, { recursive: true });
}

function getAiApiKey(): string {
  if (existsSync(LARAVEL_ENV_PATH)) {
    const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
    const m = content.match(/OPENAI_API_KEY=(.+)/);
    if (m && m[1]) return m[1].trim();
  }
  return process.env.OPENAI_API_KEY || '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';
}

const threadAgentCache = new Map<string, any>();

function decompressString(val: string | null): string {
  if (!val) return '';
  if (val.startsWith('gz:')) {
    try {
      const buf = Buffer.from(val.slice(3), 'base64');
      return zlib.inflateSync(buf).toString('utf-8');
    } catch {
      return '';
    }
  }
  return val;
}

function parseJsonSafe(val: any, fallback: any = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function emailAgentPlugin() {
  const BASELINE_DATE = '2026-11-01 00:00:00';

  return {
    name: 'email-agent-api',
    configureServer(server: any) {
      // Avvia l'Agente Autonomo e il Super Agente Coordinatore di Frank in background
      autonomousAgent.start();
      superAgent.startHeartbeat(60 * 1000);
      telegramBot.initBot();
      initTelegramScheduler();

      // Polling automatico in background ogni 5 minuti a partire da 1 novembre
      let isBackgroundPolling = false;
      const runBackgroundPoll = () => {
        if (isBackgroundPolling) return;
        isBackgroundPolling = true;
        exec(`cd "${LARAVEL_DIR}" && php artisan email:poll --since="2026-11-01"`, (pollErr) => {
          if (!pollErr) {
            exec(`cd "${LARAVEL_DIR}" && php artisan queue:work --stop-when-empty`, () => {
              isBackgroundPolling = false;
              // Sveglia l'agente per studiare eventuali nuove email arrivate
              autonomousAgent.scanAndEnqueue();
            });
          } else {
            isBackgroundPolling = false;
          }
        });
      };

      // Avvia il timer ogni 5 minuti
      const autoPollTimer = setInterval(runBackgroundPoll, 5 * 60 * 1000);

      server.middlewares.use(async (req: any, res: any, next: any) => {
        
        // GET /api/live-data
        if (req.url === '/api/live-data' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          if (!existsSync(DB_PATH)) {
            res.end(JSON.stringify({ connected: false, error: 'Database SQLite non trovato' }));
            return;
          }

          let db: any = null;
          try {
            const { DatabaseSync } = await import('node:sqlite');
            db = new DatabaseSync(DB_PATH, { readOnly: true });
            
            // 1. Utente corrente
            const users = db.prepare('SELECT id, name, email FROM users LIMIT 1').all() as any[];
            const currentUser = users[0] || { id: 1, email: 'f.russotto@arteficegroup.com', name: 'Francesco Russotto' };

            // 2. Aggregati Thread (con limite di partenza dal 1 novembre)
            const aggregates = db.prepare(`
              SELECT 
                e.thread_id,
                COUNT(DISTINCT e.id) AS email_count,
                MAX(e.received_at) AS last_at,
                MIN(CASE WHEN r.status='pending' AND r.urgency='high' THEN 1 WHEN r.status='pending' AND r.urgency='medium' THEN 2 WHEN r.status='pending' AND r.urgency='low' THEN 3 END) AS max_urgency,
                MIN(CASE WHEN r.status='pending' AND r.deadline IS NOT NULL THEN r.deadline END) AS min_deadline,
                SUM(CASE WHEN r.status='done' THEN 1 ELSE 0 END) AS done_count,
                SUM(CASE WHEN r.status='pending' THEN 1 ELSE 0 END) AS pending_count,
                MAX(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS has_requests,
                MAX(CASE WHEN e.is_hidden = 1 THEN 1 ELSE 0 END) AS is_hidden
              FROM emails e
              LEFT JOIN requests r ON r.email_id = e.id AND r.user_id = e.user_id
              WHERE e.user_id = ? AND e.source_type = 'email' AND e.received_at >= ?
              GROUP BY e.thread_id
              ORDER BY last_at DESC
            `).all(currentUser.id, BASELINE_DATE) as any[];

            // 3. Tutte le email dell'utente (dal 1 novembre)
            const allEmails = db.prepare(`
              SELECT id, google_message_id, thread_id, sender, sender_email, subject, received_at, body_text, body_html, recipients, event_link, is_hidden
              FROM emails
              WHERE user_id = ? AND source_type = 'email' AND received_at >= ?
              ORDER BY received_at DESC, id DESC
            `).all(currentUser.id, BASELINE_DATE) as any[];

            // 4. Tutte le richieste (relative a email dal 1 novembre)
            const allRequests = db.prepare(`
              SELECT r.id, r.email_id, r.sender, r.sender_email, r.subject, r.summary, r.urgency, r.deadline, r.status, r.created_at
              FROM requests r
              JOIN emails e ON r.email_id = e.id
              WHERE r.user_id = ? AND e.received_at >= ?
              ORDER BY r.created_at ASC
            `).all(currentUser.id, BASELINE_DATE) as any[];

            // Mappe di indicizzazione rapida
            const emailsByThread = new Map<string, any[]>();
            for (const email of allEmails) {
              if (!emailsByThread.has(email.thread_id)) {
                emailsByThread.set(email.thread_id, []);
              }
              emailsByThread.get(email.thread_id)!.push(email);
            }

            const requestsByEmailId = new Map<number, any[]>();
            for (const req of allRequests) {
              if (!requestsByEmailId.has(req.email_id)) {
                requestsByEmailId.set(req.email_id, []);
              }
              requestsByEmailId.get(req.email_id)!.push(req);
            }

            // 5. Costruzione Threads raggruppati fedelmente a Laravel con Analisi Autonoma di Frank
            const savedAnalyses = getAllAnalysesMap();
            const threads = aggregates.map(agg => {
              const group = emailsByThread.get(agg.thread_id) || [];
              const latest = group[0];
              const agentAnalysis = savedAnalyses.get(agg.thread_id) || null;

              // Mittenti unici con nome ed email
              const sendersMap = new Map<string, { name: string; email: string }>();
              for (const email of group) {
                if (email.sender_email && !sendersMap.has(email.sender_email)) {
                  sendersMap.set(email.sender_email, {
                    name: email.sender || email.sender_email,
                    email: email.sender_email
                  });
                }
              }

              // Tutte le richieste del thread (raccolte da tutte le email del thread)
              const threadRequests: any[] = [];
              for (const email of group) {
                const reqsForEmail = requestsByEmailId.get(email.id) || [];
                threadRequests.push(...reqsForEmail);
              }
              threadRequests.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

              // Se l'Agente Frank ha analizzato il thread, usiamo le sue attività autentiche
              const agentActive = agentAnalysis?.activeTasks || [];
              const agentResolved = agentAnalysis?.resolvedTasks || [];
              const hasAgentAnalysis = agentAnalysis !== null;

              const hasRequests = hasAgentAnalysis 
                ? (agentActive.length > 0 || agentResolved.length > 0)
                : Boolean(agg.has_requests);

              const pendingCount = hasAgentAnalysis
                ? agentActive.length
                : Number(agg.pending_count || 0);

              const doneCount = hasAgentAnalysis
                ? agentResolved.length
                : Number(agg.done_count || 0);

              let maxUrgency: string | null = null;
              if (hasAgentAnalysis) {
                if (agentActive.some((t: any) => t.urgency === 'high' || t.urgency === 'alta')) {
                  maxUrgency = 'high';
                } else if (agentActive.some((t: any) => t.urgency === 'medium' || t.urgency === 'media')) {
                  maxUrgency = 'medium';
                } else if (agentActive.some((t: any) => t.urgency === 'low' || t.urgency === 'bassa')) {
                  maxUrgency = 'low';
                }
              } else {
                maxUrgency = agg.max_urgency === 1 ? 'high' : agg.max_urgency === 2 ? 'medium' : agg.max_urgency === 3 ? 'low' : null;
              }

              // Mappatura richieste
              let finalRequests: any[] = [];
              if (hasAgentAnalysis) {
                agentActive.forEach((t: any, idx: number) => {
                  finalRequests.push({
                    id: `act-${agg.thread_id}-${idx}`,
                    email_id: 0,
                    summary: t.summary,
                    urgency: t.urgency || 'medium',
                    deadline: null,
                    status: 'pending',
                    reason: t.reason,
                    created_at: agg.last_at
                  });
                });
                agentResolved.forEach((t: any, idx: number) => {
                  finalRequests.push({
                    id: `res-${agg.thread_id}-${idx}`,
                    email_id: 0,
                    summary: t.summary,
                    urgency: 'low',
                    deadline: null,
                    status: 'done',
                    resolvedBy: t.resolvedBy,
                    resolvedNote: t.resolvedNote,
                    created_at: agg.last_at
                  });
                });
              } else {
                finalRequests = threadRequests.map(r => ({
                  id: r.id,
                  email_id: r.email_id,
                  summary: r.summary,
                  urgency: r.urgency || 'medium',
                  deadline: r.deadline || null,
                  status: (r.status === 'done' || r.status === 'completed') ? 'done' : 'pending',
                  created_at: r.created_at
                }));
              }

              return {
                thread_id: agg.thread_id,
                subject: latest?.subject || 'Nessun oggetto',
                source_type: 'email',
                email_count: Number(agg.email_count),
                last_at: agg.last_at,
                senders: Array.from(sendersMap.values()),
                max_urgency: maxUrgency,
                min_deadline: agg.min_deadline || null,
                done_count: doneCount,
                pending_count: pendingCount,
                has_requests: hasRequests,
                is_hidden: Boolean(agg.is_hidden),
                requests: finalRequests,
                emails: group.map(e => ({
                  id: e.id,
                  google_message_id: e.google_message_id,
                  sender: e.sender,
                  sender_email: e.sender_email,
                  subject: e.subject,
                  received_at: e.received_at,
                  source_type: 'email',
                  recipients: parseJsonSafe(e.recipients, { to: [], cc: [] }),
                  event_link: e.event_link,
                  body_text: decompressString(e.body_text),
                  body_html: decompressString(e.body_html)
                })),
                agentAnalysis
              };
            });

            // Raccoglie i task verificati dall'Agente Frank per Francesco (esclude thread nascosti)
            const agentTasks: any[] = [];
            threads.forEach((t: any) => {
              if (!t.is_hidden && t.agentAnalysis?.activeTasks && Array.isArray(t.agentAnalysis.activeTasks)) {
                t.agentAnalysis.activeTasks.forEach((task: any, idx: number) => {
                  agentTasks.push({
                    id: `agent-${t.thread_id}-${idx}`,
                    threadId: t.thread_id,
                    sender: t.senders[0]?.name || 'Mittente',
                    senderEmail: t.senders[0]?.email || '',
                    subject: t.subject,
                    summary: task.summary,
                    reason: task.reason,
                    urgency: (task.urgency === 'high' || task.urgency === 'alta') ? 'alta' : (task.urgency === 'low' || task.urgency === 'bassa') ? 'bassa' : 'media',
                    status: 'pending',
                    receivedAt: t.last_at
                  });
                });
              }
            });

            // 6. Eventi e Meeting a Calendario (separazione upcoming vs past, escludendo presenze e duplicati)
            const todayStr = new Date().toISOString().split('T')[0];
            const upcomingEvents = db.prepare(`
              SELECT id, sender, sender_email, subject, event_start_at, event_end_at, source_type, created_at, recipients, event_link
              FROM emails
              WHERE source_type = 'meeting'
                AND event_start_at >= ?
                AND LOWER(TRIM(subject)) NOT IN ('home', 'office')
                AND subject NOT LIKE '%call settimanale AREA Sviluppo IT%'
                AND subject NOT LIKE '%IDIA - Perniceni%'
              ORDER BY event_start_at ASC
              LIMIT 30
            `).all(todayStr) as any[];

            const pastEvents = db.prepare(`
              SELECT id, sender, sender_email, subject, event_start_at, event_end_at, source_type, created_at, recipients, event_link
              FROM emails
              WHERE source_type = 'meeting'
                AND event_start_at < ?
                AND LOWER(TRIM(subject)) NOT IN ('home', 'office')
                AND subject NOT LIKE '%call settimanale AREA Sviluppo IT%'
                AND subject NOT LIKE '%IDIA - Perniceni%'
              ORDER BY event_start_at DESC
              LIMIT 15
            `).all(todayStr) as any[];

            // Totali generali derivati dai thread calcolati dall'Agente Frank (esclusi gli hidden)
            const totalPending = threads.filter(t => !t.is_hidden).reduce((acc, t) => acc + (t.pending_count || 0), 0);
            const totalDone = threads.filter(t => !t.is_hidden).reduce((acc, t) => acc + (t.done_count || 0), 0);

            const formatEvent = (e: any, isPast = false) => {
              const startDate = e.event_start_at ? new Date(e.event_start_at) : new Date();
              return {
                id: `ev-real-${e.id}`,
                account: 'work',
                accountEmail: currentUser.email,
                title: e.subject || 'Meeting di lavoro',
                date: startDate.toISOString().split('T')[0],
                time: startDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                duration: '1h',
                category: 'Meeting',
                eventLink: e.event_link,
                isPast
              };
            };

            res.end(JSON.stringify({
              connected: true,
              user: currentUser,
              threads,
              agentTasks,
              agentStatus: autonomousAgent.getStatus(),
              superAgentStatus: await superAgent.getStatus(),
              totalPending,
              totalDone,
              upcomingEvents: upcomingEvents.map(e => formatEvent(e, false)),
              pastEvents: pastEvents.map(e => formatEvent(e, true))
            }));
          } catch (err: any) {
            console.error('Error fetching SQLite data:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          } finally {
            if (db) {
              try { db.close(); } catch {}
            }
          }
          return;
        }

        // POST /api/toggle-request (Singola richiesta smarcabile)
        if (req.url === '/api/toggle-request' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            let db: any = null;
            try {
              const { requestId, newStatus } = JSON.parse(body);
              const { DatabaseSync } = await import('node:sqlite');
              db = new DatabaseSync(DB_PATH);
              const statusVal = newStatus === 'done' ? 'done' : 'pending';
              db.prepare("UPDATE requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(statusVal, requestId);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, status: statusVal }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            } finally {
              if (db) {
                try { db.close(); } catch {}
              }
            }
          });
          return;
        }

        // POST /api/toggle-thread (Smarca/riapre tutte le richieste del thread)
        if (req.url === '/api/toggle-thread' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            let db: any = null;
            try {
              const { threadId, action } = JSON.parse(body);
              const { DatabaseSync } = await import('node:sqlite');
              db = new DatabaseSync(DB_PATH);
              const newStatus = action === 'done' ? 'done' : 'pending';
              db.prepare(`
                UPDATE requests 
                SET status = ?, updated_at = datetime('now')
                WHERE email_id IN (SELECT id FROM emails WHERE thread_id = ?)
              `).run(newStatus, threadId);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, newStatus }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            } finally {
              if (db) {
                try { db.close(); } catch {}
              }
            }
          });
          return;
        }

        // POST /api/hide-thread (Nasconde o ripristina un thread)
        if (req.url === '/api/hide-thread' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            let db: any = null;
            try {
              const { threadId, isHidden } = JSON.parse(body);
              const { DatabaseSync } = await import('node:sqlite');
              db = new DatabaseSync(DB_PATH);
              const val = isHidden ? 1 : 0;
              db.prepare("UPDATE emails SET is_hidden = ?, updated_at = datetime('now') WHERE thread_id = ?").run(val, threadId);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, isHidden: val }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            } finally {
              if (db) {
                try { db.close(); } catch {}
              }
            }
          });
          return;
        }

        // GET /api/thread-agent/status (Stato dell'Agente Autonomo Frank)
        if (req.url === '/api/thread-agent/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, status: autonomousAgent.getStatus() }));
          return;
        }

        // GET /api/thread-agent/cache (Restituisce tutte le analisi già effettuate salvate su Frank DB)
        if (req.url === '/api/thread-agent/cache' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          const cacheObj: Record<string, any> = {};
          getAllAnalysesMap().forEach((val, key) => { cacheObj[key] = val; });
          res.end(JSON.stringify({ success: true, cache: cacheObj }));
          return;
        }

        // POST /api/thread-agent/analyze (Agente autonomo di comprensione multi-turno del thread)
        if (req.url === '/api/thread-agent/analyze' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { threadId } = JSON.parse(bodyStr || '{}');
              if (!threadId) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'threadId obbligatorio' }));
                return;
              }

              const parsed = await analyzeThreadAutonomous(threadId);
              res.end(JSON.stringify({ success: true, analysis: parsed }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/documents/parse (Estrae testo strutturato da file e salva originale su disco)
        if (req.url === '/api/documents/parse' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { filename, base64, docId } = JSON.parse(bodyStr || '{}');
              if (!filename || !base64) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'filename e base64 sono obbligatori' }));
                return;
              }
              const buffer = Buffer.from(base64, 'base64');

              // Salva copia originale del file su disco
              const ext = path.extname(filename).toLowerCase();
              const baseOnly = path.basename(filename, ext).replace(/[^a-zA-Z0-9._-]/g, '_');
              const safeFilename = `${baseOnly}${ext}`;
              const fileId = docId || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
              const storedFileName = `${fileId}___${safeFilename}`;
              const storedFilePath = path.join(UPLOADS_DOCS_DIR, storedFileName);
              try {
                writeFileSync(storedFilePath, buffer);
              } catch (writeErr) {
                console.warn('Errore salvataggio file originale su disco:', writeErr);
              }

              const parsed = await parseDocumentBuffer(filename, buffer);
              let extractedDeadlines: any[] = [];
              try {
                extractedDeadlines = await deadlineEngine.extractDeadlinesFromDocumentText(filename, parsed.text || '');
              } catch (dlErr) {
                console.warn('Deadline auto-extraction from doc error:', dlErr);
              }

              const mimeMap: Record<string, string> = {
                '.pdf': 'application/pdf',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp',
                '.txt': 'text/plain; charset=utf-8',
                '.md': 'text/markdown; charset=utf-8',
                '.csv': 'text/csv; charset=utf-8',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.doc': 'application/msword',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.xls': 'application/vnd.ms-excel',
                '.json': 'application/json'
              };

              res.end(JSON.stringify({
                success: true,
                docId: fileId,
                fileUrl: `/api/documents/raw/${fileId}`,
                originalFilename: filename,
                mimeType: mimeMap[ext] || 'application/octet-stream',
                sizeBytes: buffer.length,
                parsed,
                extractedDeadlines
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // GET /api/documents/raw/:id (Stream e visualizzazione nativa del file originale)
        if (req.url && req.url.startsWith('/api/documents/raw/') && req.method === 'GET') {
          const targetId = req.url.split('?')[0].replace('/api/documents/raw/', '').trim();
          if (!targetId) {
            res.statusCode = 400;
            res.end('ID documento mancante');
            return;
          }

          const files = existsSync(UPLOADS_DOCS_DIR) ? readdirSync(UPLOADS_DOCS_DIR) : [];
          const matchedFile = files.find(f => f.startsWith(`${targetId}___`) || f === targetId);

          if (!matchedFile) {
            res.statusCode = 404;
            res.end('File originale non trovato');
            return;
          }

          const fullPath = path.join(UPLOADS_DOCS_DIR, matchedFile);
          const ext = path.extname(matchedFile).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.txt': 'text/plain; charset=utf-8',
            '.md': 'text/markdown; charset=utf-8',
            '.csv': 'text/csv; charset=utf-8',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.json': 'application/json'
          };
          const originalName = matchedFile.includes('___') ? matchedFile.split('___')[1] : matchedFile;
          res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          createReadStream(fullPath).pipe(res);
          return;
        }

        // DELETE /api/documents/:id (Elimina file originale dal disco)
        if (req.url && req.url.startsWith('/api/documents/') && req.method === 'DELETE') {
          const targetId = req.url.split('?')[0].replace('/api/documents/', '').trim();
          if (targetId && existsSync(UPLOADS_DOCS_DIR)) {
            const files = readdirSync(UPLOADS_DOCS_DIR);
            const matchedFiles = files.filter(f => f.startsWith(`${targetId}___`) || f === targetId);
            for (const mf of matchedFiles) {
              try { unlinkSync(path.join(UPLOADS_DOCS_DIR, mf)); } catch {}
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // GET /api/telegram/status (Stato configurazione Bot Telegram)
        if (req.url === '/api/telegram/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(telegramBot.getStatus()));
          return;
        }

        // POST /api/telegram/config (Salva credenziali o orario briefing e riavvia bot)
        if (req.url === '/api/telegram/config' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const body = JSON.parse(bodyStr || '{}');
              saveTelegramConfig(body);
              await telegramBot.initBot();
              res.end(JSON.stringify({ success: true, status: telegramBot.getStatus() }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/telegram/send-briefing (Invia manualmente il briefing su Telegram)
        if (req.url === '/api/telegram/send-briefing' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const result = await telegramBot.sendDailyBriefing();
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // POST /api/telegram/test (Invia un messaggio di prova per verificare la connessione)
        if (req.url === '/api/telegram/test' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const result = await telegramBot.sendMessage('🚀 *Test di Connessione Frank Telegram Bot:*\nIl bot è online e collegato con successo al tuo Mac!');
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // GET /api/super-agent/status (Stato Super Agente e Roster Subagenti)
        if (req.url === '/api/super-agent/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const status = await superAgent.getStatus();
            res.end(JSON.stringify({ success: true, status }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // GET /api/super-agent/briefing (Briefing Esecutivo Multi-Dominio)
        if (req.url === '/api/super-agent/briefing' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            let briefing = superAgent.getLatestBriefing();
            if (!briefing) {
              briefing = await superAgent.generateExecutiveBriefing();
            }
            res.end(JSON.stringify({ success: true, briefing }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // POST /api/super-agent/run-all (Orchestrazione coordinata di tutti i subagenti)
        if (req.url === '/api/super-agent/run-all' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const result = await superAgent.orchestrateAll();
            const status = await superAgent.getStatus();
            res.end(JSON.stringify({ success: true, result, status }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // POST /api/super-agent/run (Esecuzione singolo subagente)
        if (req.url === '/api/super-agent/run' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { subagentId } = JSON.parse(bodyStr || '{}');
              const result = await superAgent.runSubagent(subagentId);
              const status = await superAgent.getStatus();
              res.end(JSON.stringify({ success: true, result, status }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/super-agent/briefing/generate (Forza rigenerazione briefing esecutivo)
        if (req.url === '/api/super-agent/briefing/generate' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const briefing = await superAgent.generateExecutiveBriefing();
            res.end(JSON.stringify({ success: true, briefing }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // GET /api/expenses (Restituisce le spese salvate in Frank DB)
        if (req.url === '/api/expenses' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { DatabaseSync } = await import('node:sqlite');
            const frankDb = new DatabaseSync(FRANK_DB_PATH, { readOnly: true });
            const rows = frankDb.prepare('SELECT * FROM fixed_expenses ORDER BY due_day ASC').all() as any[];
            frankDb.close();
            const expenses = rows.map(r => ({
              id: r.id,
              name: r.name,
              amount: r.amount,
              category: r.category,
              frequency: r.frequency,
              dueDay: r.due_day,
              isPaid: Boolean(r.is_paid),
              isAutoDebit: Boolean(r.is_auto_debit),
              notes: r.notes || ''
            }));
            res.end(JSON.stringify({ success: true, expenses }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // POST /api/expenses/sync (Sincronizza le spese reali definite dall'utente nel frontend verso il DB del Subagente)
        if (req.url === '/api/expenses/sync' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { expenses } = JSON.parse(bodyStr || '{}');
              FinanceSubagent.syncExpenses(expenses || []);
              try {
                await deadlineEngine.syncFromAllSubagents();
              } catch {}
              // Rigenera immediatamente il briefing esecutivo con i dati reali dell'utente
              await superAgent.generateExecutiveBriefing();
              const status = await superAgent.getStatus();
              res.end(JSON.stringify({ success: true, status }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/documents/sync (Sincronizza documenti con il Knowledge Subagent)
        if (req.url === '/api/documents/sync' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { documents } = JSON.parse(bodyStr || '{}');
              KnowledgeSubagent.syncDocuments(documents || []);
              await superAgent.generateExecutiveBriefing();
              const status = await superAgent.getStatus();
              res.end(JSON.stringify({ success: true, status }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/super-agent/chat (Dialogo coordinato con Frank Super Agente & Tracciamento Deleghe)
        if (req.url === '/api/super-agent/chat' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { messages, sources, ecosystem } = JSON.parse(bodyStr || '{}');
              const result = await superAgent.answerUserDialog(
                Array.isArray(messages) ? messages : [],
                { sources, ecosystem }
              );
              res.end(JSON.stringify({ success: true, ...result }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // ================= DEADLINE & COSE DA FARE API =================
        // GET /api/deadlines (Lista scadenze e riepilogo per scadenziario)
        if (req.url?.startsWith('/api/deadlines') && req.method === 'GET' && !req.url.includes('/sync')) {
          res.setHeader('Content-Type', 'application/json');
          try {
            const urlObj = new URL(req.url, 'http://localhost');
            const status = urlObj.searchParams.get('status') || undefined;
            const category = urlObj.searchParams.get('category') || undefined;
            const query = urlObj.searchParams.get('q') || undefined;
            const scope = urlObj.searchParams.get('scope') || undefined;
            const data = deadlineEngine.getDeadlines({ status, category, query, scope });
            res.end(JSON.stringify({ success: true, ...data }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // POST /api/deadlines (Creazione nuova scadenza / cosa da fare)
        if (req.url === '/api/deadlines' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const data = JSON.parse(bodyStr || '{}');
              if (!data.title || !data.dueDate) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Titolo e data di scadenza sono obbligatori' }));
                return;
              }
              const created = deadlineEngine.createDeadline(data);
              const result = deadlineEngine.getDeadlines();
              res.end(JSON.stringify({ success: true, deadline: created, ...result }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // PUT /api/deadlines (Modifica scadenza o cambio stato completato/pendente)
        if (req.url === '/api/deadlines' && req.method === 'PUT') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { id, updates } = JSON.parse(bodyStr || '{}');
              if (!id) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'id scadenza obbligatorio' }));
                return;
              }
              deadlineEngine.updateDeadline(id, updates || {});
              const result = deadlineEngine.getDeadlines();
              res.end(JSON.stringify({ success: true, ...result }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // DELETE /api/deadlines (Eliminazione scadenza)
        if (req.url?.startsWith('/api/deadlines') && req.method === 'DELETE') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const urlObj = new URL(req.url, 'http://localhost');
              let id = urlObj.searchParams.get('id');
              if (!id && bodyStr) {
                try {
                  const p = JSON.parse(bodyStr);
                  id = p.id;
                } catch {}
              }
              if (!id) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'id scadenza obbligatorio' }));
                return;
              }
              deadlineEngine.deleteDeadline(id);
              const result = deadlineEngine.getDeadlines();
              res.end(JSON.stringify({ success: true, ...result }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/deadlines/sync (Sincronizzazione automatica da Email, Spese, Calendario e Documenti)
        if (req.url === '/api/deadlines/sync' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const syncStats = await deadlineEngine.syncFromAllSubagents();
            const result = deadlineEngine.getDeadlines();
            res.end(JSON.stringify({ success: true, syncStats, ...result }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // GET /api/daily-briefing/preview (Anteprima del messaggio giornaliero Lavoro + Personale)
        if (req.url === '/api/daily-briefing/preview' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const briefing = await generateDailyBriefing();
            res.end(JSON.stringify({ success: true, briefing }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // POST /api/chat/compact (Esegue la compattazione della sessione di chat in uscita e crea una nota per il RAG)
        if (req.url === '/api/chat/compact' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { messages } = JSON.parse(bodyStr || '{}');
              if (!Array.isArray(messages) || messages.length === 0) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Nessun messaggio fornito per la compaction' }));
                return;
              }

              const apiKey = getAiApiKey();
              const transcriptText = messages
                .filter((m: any) => m.role === 'user' || m.role === 'assistant')
                .map((m: any) => `${m.role === 'user' ? 'Francesco' : 'Frank'}: ${m.content}`)
                .join('\n\n');

              const prompt = `Sei il Memory Consolidation Engine del Second Brain di Francesco Russotto.
Analizza attentamente la trascrizione della chat tra Francesco e Frank appena conclusa.

IL TUO COMPITO:
Comprimi questa sessione in una "Compaction Note" densa di conoscenza, priva di convenevoli e strutturata in Markdown.
Questo documento diventerà un elemento della Knowledge Base RAG per rispondere alle richieste future di Francesco.

ESTRAI E STRUTTURA:
1. "title": Titolo sintetico del tema principale (max 6 parole, es. "Verifica Partita IVA e Visura", "Priorità Citterio e Strategia reCAPTCHA").
2. "summary": Una frase breve e chiara che sintetizza il succo della conversazione.
3. "markdownContent": Testo Markdown formattato contenente:
   - ## Argomento & Scopo della Conversazione
   - ## Dati Chiave & Fatti Emersi (riporta con precisione numeri, codici, date, nomi di persone o aziende menzionati)
   - ## Decisioni Prese & Indicazioni Future
   - ## Punti Aperti o Azioni Concordate

Restituisci ESCLUSIVAMENTE un JSON valido (senza testo prima o dopo, senza blocchi \`\`\`json):
{
  "title": "Titolo Breve",
  "summary": "Frase di sintesi",
  "markdownContent": "# Compaction: ...\\n\\n## Argomento...\\n\\n..."
}

TRASCRIZIONE CHAT:
${transcriptText.slice(0, 10000)}`;

              const aiRes = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: 'sonar',
                  messages: [
                    { role: 'system', content: 'Rispondi ESCLUSIVAMENTE con un JSON valido grezzo. Nessun blocco markdown o testo extra.' },
                    { role: 'user', content: prompt }
                  ],
                  temperature: 0.1,
                  max_tokens: 1200
                })
              });

              if (!aiRes.ok) {
                throw new Error(`Errore AI Sonar: ${aiRes.status}`);
              }

              const aiData: any = await aiRes.json();
              const rawContent = aiData.choices?.[0]?.message?.content || '{}';
              const cleanJson = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
              const compactionResult = JSON.parse(cleanJson);

              res.end(JSON.stringify({ success: true, compaction: compactionResult }));
            } catch (err: any) {
              console.error('Errore compaction chat:', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/rag/ask (Motore AI unificato per Frank RAG & Chat: risposte sintetiche e precise)
        if (req.url === '/api/rag/ask' && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => { bodyStr += chunk; });
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json');
            try {
              const { query, sources, ecosystem } = JSON.parse(bodyStr || '{}');
              const apiKey = getAiApiKey();

              const docsContext = Array.isArray(sources) && sources.length > 0
                ? sources.map((s: any, idx: number) => `[FONTE ${idx + 1}: ${s.chunk?.documentTitle || s.documentTitle}]:\n${s.chunk?.content || s.content}`).join('\n\n')
                : 'Nessun documento specifico corrispondente.';

              const systemPrompt = `Sei Frank, l'assistente personale intelligente e operativo di Francesco Russotto nel suo Second Brain.
Regole fondamentali per la risposta:
1. Sii chiaro, diretto, sintetico e naturale.
2. Rispondi ESATTAMENTE e SOLTANTO a ciò che ti è stato chiesto:
   - Se l'utente chiede un dato specifico (es. numero di Partita IVA, codice fiscale, IBAN, indirizzo, data, orario, prezzo, importo), NON incollare l'indice, il sommario o l'intero testo del documento.
   - Fornisci SUBITO l'informazione richiesta in evidenza (es. "La tua Partita IVA è: **14130860969**" oppure "Sede: **Via Carmelo Trasselli 27, Palermo**"), citando tra parentesi la fonte.
3. Se l'utente chiede un riepilogo o spiegazione, usa elenchi puntati puliti e compatti senza prolissità o divagazioni.
4. Usa formattazione Markdown elegante.`;

              const userMessage = `DOMANDA DELL'UTENTE:
"${query}"

CONTESTO DOCUMENTI (RAG):
${docsContext.slice(0, 12000)}

DATI ECOSISTEMA:
- Task email: ${ecosystem?.requests?.length || 0}
- Eventi agenda: ${ecosystem?.events?.length || 0}
- Spese fisse: ${ecosystem?.expenses?.length || 0}`;

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
                    { role: 'user', content: userMessage }
                  ],
                  temperature: 0.1
                })
              });

              if (aiRes.ok) {
                const aiData = await aiRes.json();
                const text = aiData.choices?.[0]?.message?.content;
                if (text) {
                  res.end(JSON.stringify({ success: true, text: text.trim(), model: 'Frank AI Engine (Sonar)' }));
                  return;
                }
              }

              throw new Error(`AI API status: ${aiRes.status}`);
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // POST /api/sync (Ultra-veloce: esegue email:poll a partire dal 1 novembre e lancia queue:work in background)
        if (req.url === '/api/sync' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          exec(`cd "${LARAVEL_DIR}" && php artisan email:poll --since="${BASELINE_DATE}"`, (pollError, pollStdout) => {
            if (pollError) {
              console.warn('Poll warning:', pollError.message);
            }
            // Lancia l'elaboratore dei job in background in modo asincrono (senza bloccare la risposta HTTP)
            exec(`cd "${LARAVEL_DIR}" && php artisan queue:work --stop-when-empty`, () => {
              // Quando il worker termina l'importazione, Frank Agent le analizza subito in autonomia
              autonomousAgent.scanAndEnqueue();
            });

            // Risposta immediata al frontend
            res.end(JSON.stringify({
              success: true,
              message: 'Sincronizzazione completata con successo',
              details: (pollStdout || '').trim()
            }));
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), emailAgentPlugin()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true
  }
});
