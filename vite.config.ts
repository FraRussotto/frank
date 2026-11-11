import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { exec } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const DB_PATH = '/Users/fra_russo/email-ai-agent/database/database.sqlite';
const LARAVEL_DIR = '/Users/fra_russo/email-ai-agent';
const LARAVEL_ENV_PATH = '/Users/fra_russo/email-ai-agent/.env';

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
      // Polling automatico in background ogni 5 minuti a partire da 1 novembre
      let isBackgroundPolling = false;
      const runBackgroundPoll = () => {
        if (isBackgroundPolling) return;
        isBackgroundPolling = true;
        exec(`cd "${LARAVEL_DIR}" && php artisan email:poll --since="2026-11-01"`, (pollErr) => {
          if (!pollErr) {
            exec(`cd "${LARAVEL_DIR}" && php artisan queue:work --stop-when-empty`, () => {
              isBackgroundPolling = false;
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

            // 5. Costruzione Threads raggruppati fedelmente a Laravel
            const threads = aggregates.map(agg => {
              const group = emailsByThread.get(agg.thread_id) || [];
              const latest = group[0];

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

              const maxUrgency = agg.max_urgency === 1 ? 'high' : agg.max_urgency === 2 ? 'medium' : agg.max_urgency === 3 ? 'low' : null;

              return {
                thread_id: agg.thread_id,
                subject: latest?.subject || 'Nessun oggetto',
                source_type: 'email',
                email_count: Number(agg.email_count),
                last_at: agg.last_at,
                senders: Array.from(sendersMap.values()),
                max_urgency: maxUrgency,
                min_deadline: agg.min_deadline || null,
                done_count: Number(agg.done_count || 0),
                pending_count: Number(agg.pending_count || 0),
                has_requests: Boolean(agg.has_requests),
                is_hidden: Boolean(agg.is_hidden),
                requests: threadRequests.map(r => ({
                  id: r.id,
                  email_id: r.email_id,
                  summary: r.summary,
                  urgency: r.urgency || 'medium',
                  deadline: r.deadline || null,
                  status: (r.status === 'done' || r.status === 'completed') ? 'done' : 'pending',
                  created_at: r.created_at
                })),
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
                }))
              };
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

            // Totali generali per badge e statistiche (esclusi gli hidden)
            const totalPendingRow = db.prepare(`
              SELECT COUNT(*) as c 
              FROM requests r 
              JOIN emails e ON e.id = r.email_id 
              WHERE r.user_id = ? AND r.status = 'pending' AND e.is_hidden = 0
            `).get(currentUser.id) as any;

            const totalDoneRow = db.prepare(`
              SELECT COUNT(*) as c 
              FROM requests r 
              JOIN emails e ON e.id = r.email_id 
              WHERE r.user_id = ? AND r.status = 'done' AND e.is_hidden = 0
            `).get(currentUser.id) as any;

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
              totalPending: totalPendingRow?.c || 0,
              totalDone: totalDoneRow?.c || 0,
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

        // GET /api/thread-agent/cache (Restituisce tutte le analisi già effettuate)
        if (req.url === '/api/thread-agent/cache' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          const cacheObj: Record<string, any> = {};
          threadAgentCache.forEach((val, key) => { cacheObj[key] = val; });
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
              const { threadId, forceRefresh } = JSON.parse(bodyStr || '{}');
              if (!threadId) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'threadId obbligatorio' }));
                return;
              }

              if (!forceRefresh && threadAgentCache.has(threadId)) {
                res.end(JSON.stringify({ success: true, analysis: threadAgentCache.get(threadId) }));
                return;
              }

              const { DatabaseSync } = await import('node:sqlite');
              const db = new DatabaseSync(DB_PATH, { readOnly: true });
              let emails: any[] = [];
              try {
                emails = db.prepare(`
                  SELECT id, google_message_id, sender, sender_email, subject, received_at, body_text, recipients
                  FROM emails
                  WHERE thread_id = ? AND source_type = 'email'
                  ORDER BY received_at ASC
                `).all(threadId) as any[];
              } finally {
                db.close();
              }

              if (emails.length === 0) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Nessun messaggio trovato per questo thread' }));
                return;
              }

              let conversation = '';
              emails.forEach((em, idx) => {
                let text = em.body_text || '';
                if (text.startsWith('gz:')) {
                  try {
                    const buf = Buffer.from(text.slice(3), 'base64');
                    text = zlib.inflateSync(buf).toString('utf-8');
                  } catch {}
                }
                const toList = parseJsonSafe(em.recipients, {})?.to || [];
                const toStr = toList.map((t: any) => t.name || t.email).filter(Boolean).join(', ');
                conversation += `\n--- [Messaggio ${idx + 1} del ${em.received_at}] ---\nDa: ${em.sender} <${em.sender_email}>\nA: ${toStr || 'N/D'}\nOggetto: ${em.subject}\nTesto:\n${text.slice(0, 2000)}\n`;
              });

              const systemPrompt = `Sei Frank Thread Agent, l'agente esecutivo autonomo per l'analisi intelligente di conversazioni email per Francesco Russotto (f.russotto@arteficegroup.com).
Analizza l'INTERO THREAD CRONOLOGICO (dal primo all'ultimo messaggio) per comprendere lo stato attuale della discussione e stabilire in modo autonomo:
1. STATO ATTUALE:
   - "action_required": c'è una richiesta pendente, una domanda o un compito operativo non ancora risolto che spetta specificamente a Francesco.
   - "waiting_others": Francesco (o un collega) ha già fatto l'ultima mossa o risposto, e il thread è in attesa di feedback/risposta da parte del cliente o di altri.
   - "resolved": il tema del thread si è concluso con successo, è stato confermato risolto o non richiede ulteriori azioni.
   - "informative": notifica automatica, ricevuta o email informativa in cui Francesco era solo in copia senza compiti.

2. COMPITI ATTIVI vs RISOLTI:
   - Identifica le richieste formulate nel corso del thread.
   - Se Francesco (o un collega) ha già soddisfatto la richiesta nei messaggi successivi (es. ha inviato il file, confermato la modifica, fatto il deploy), inseriscila in "resolvedTasks" spiegando chi e quando l'ha risolta.
   - Elenca in "activeTasks" SOLO ED ESCLUSIVAMENTE ciò che resta DAVVERO DA FARE per Francesco.

3. PROSSIMO PASSO SUGGERITO (suggestedNextStep):
   - Una frase sintetica e pratica che consiglia cosa fare adesso.

4. BOZZA DI RISPOSTA CONTESTUALE (draftReply):
   - Se lo stato è "action_required", genera una bozza di risposta professionale, calibrata sul tono del thread, pronta all'invio.

Rispondi RIGOROSAMENTE con JSON valido in questa struttura:
{
  "status": "action_required" | "waiting_others" | "resolved" | "informative",
  "statusLabel": "Richiede tua azione" | "In attesa di altri" | "Risolto" | "Informativo",
  "summary": "Sintesi stato attuale del thread (1-2 frasi)",
  "myActionRequired": true | false,
  "activeTasks": [
    { "summary": "Descrizione compito", "urgency": "high" | "medium" | "low", "reason": "Motivazione" }
  ],
  "resolvedTasks": [
    { "summary": "Compito risolto", "resolvedBy": "Chi l'ha risolto", "resolvedNote": "Dettaglio risoluzione" }
  ],
  "suggestedNextStep": "Azione consigliata",
  "draftReply": { "to": "email o nome", "subject": "oggetto risposta", "body": "testo risposta" }
}`;

              const apiKey = getAiApiKey();
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
                    { role: 'user', content: `Ecco il thread completo da analizzare:\n${conversation.slice(0, 12000)}` }
                  ],
                  temperature: 0.1
                })
              });

              if (!aiRes.ok) {
                const errText = await aiRes.text();
                throw new Error(`AI API error (${aiRes.status}): ${errText}`);
              }

              const aiData: any = await aiRes.json();
              const rawContent = aiData.choices?.[0]?.message?.content || '{}';
              let parsed: any = {};
              try {
                const match = rawContent.match(/```json\s*([\s\S]*?)\s*```/) || rawContent.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(match ? match[1] || match[0] : rawContent);
              } catch {
                parsed = {
                  status: 'informative',
                  statusLabel: 'Informativo',
                  summary: rawContent.slice(0, 200),
                  myActionRequired: false,
                  activeTasks: [],
                  resolvedTasks: [],
                  suggestedNextStep: 'Nessuna azione richiesta'
                };
              }

              parsed.threadId = threadId;
              parsed.analyzedAt = new Date().toISOString();
              threadAgentCache.set(threadId, parsed);

              res.end(JSON.stringify({ success: true, analysis: parsed }));
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
            exec(`cd "${LARAVEL_DIR}" && php artisan queue:work --stop-when-empty`, () => {});

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
    host: true
  }
});
