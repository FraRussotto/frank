import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EMAIL_DB_PATH, LARAVEL_ENV_PATH, CONFIG_DIR } from '../paths';
import { autonomousAgent } from '../autonomousAgent';

export const GOOGLE_CONFIG_PATH = path.join(CONFIG_DIR, 'google.json');

export interface GoogleConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export function loadGoogleConfig(): GoogleConfig {
  if (existsSync(GOOGLE_CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(GOOGLE_CONFIG_PATH, 'utf-8'));
    } catch {}
  }
  return {};
}

export function saveGoogleConfig(cfg: GoogleConfig) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const current = loadGoogleConfig();
  const merged = { ...current, ...cfg };
  writeFileSync(GOOGLE_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
}

export interface GoogleSyncResult {
  success: boolean;
  emailsFetched: number;
  eventsFetched: number;
  newEmailsInserted: number;
  newEventsInserted: number;
  error?: string;
  timestamp: string;
}

let isSyncing = false;

// Configurazione credenziali Google con fallback a catena
export function getGoogleCredentials() {
  const fileConfig = loadGoogleConfig();

  let clientId = process.env.GOOGLE_CLIENT_ID || fileConfig.clientId || '';
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || fileConfig.clientSecret || '';
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN || fileConfig.refreshToken || '';

  // 1. Fallback su file .env di Laravel se presente (sviluppo locale)
  if ((!clientId || !clientSecret || !refreshToken) && existsSync(LARAVEL_ENV_PATH)) {
    try {
      const content = readFileSync(LARAVEL_ENV_PATH, 'utf-8');
      const cidMatch = content.match(/GOOGLE_CLIENT_ID=(.+)/);
      if (cidMatch && !clientId) clientId = cidMatch[1].trim();

      const secMatch = content.match(/GOOGLE_CLIENT_SECRET=(.+)/);
      if (secMatch && !clientSecret) clientSecret = secMatch[1].trim();
    } catch {}
  }

  // 2. Fallback su tabella google_tokens del database SQLite se refresh_token non è in env
  if (!refreshToken && existsSync(EMAIL_DB_PATH)) {
    try {
      const db = new DatabaseSync(EMAIL_DB_PATH, { readOnly: true });
      const row = db.prepare('SELECT refresh_token FROM google_tokens WHERE refresh_token IS NOT NULL ORDER BY id DESC LIMIT 1').get() as any;
      db.close();
      if (row?.refresh_token) {
        refreshToken = row.refresh_token;
      }
    } catch {}
  }

  return { clientId, clientSecret, refreshToken };
}

// Inizializza le tabelle SQLite se il database è nuovo o incompleto
export function ensureEmailDatabaseSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name VARCHAR NOT NULL,
      email VARCHAR NOT NULL UNIQUE,
      created_at DATETIME,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS google_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id INTEGER NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type VARCHAR NOT NULL DEFAULT 'Bearer',
      expires_at DATETIME,
      created_at DATETIME,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id INTEGER NOT NULL DEFAULT 1,
      google_message_id VARCHAR NOT NULL,
      thread_id VARCHAR NOT NULL,
      sender VARCHAR,
      sender_email VARCHAR NOT NULL,
      subject VARCHAR,
      body_text TEXT NOT NULL,
      content_hash VARCHAR NOT NULL,
      has_requests TINYINT(1) NOT NULL DEFAULT 0,
      ai_error TEXT,
      received_at DATETIME NOT NULL,
      processed_at DATETIME,
      created_at DATETIME,
      updated_at DATETIME,
      source_type VARCHAR NOT NULL DEFAULT 'email',
      event_start_at DATETIME,
      event_end_at DATETIME,
      event_link VARCHAR,
      recipients TEXT,
      body_html TEXT,
      is_hidden TINYINT(1) NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS emails_user_google_msg_unique ON emails (user_id, google_message_id);
    CREATE INDEX IF NOT EXISTS emails_user_thread_idx ON emails (user_id, thread_id, received_at);
    CREATE INDEX IF NOT EXISTS emails_source_idx ON emails (source_type, received_at);

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id INTEGER NOT NULL DEFAULT 1,
      email_id INTEGER NOT NULL,
      sender VARCHAR,
      sender_email VARCHAR NOT NULL,
      subject VARCHAR,
      summary VARCHAR NOT NULL,
      urgency VARCHAR NOT NULL DEFAULT 'medium',
      deadline DATETIME,
      status VARCHAR NOT NULL DEFAULT 'pending',
      raw_ai_response TEXT NOT NULL,
      created_at DATETIME,
      updated_at DATETIME,
      source_type VARCHAR NOT NULL DEFAULT 'email'
    );

    CREATE TABLE IF NOT EXISTS poll_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      user_id INTEGER NOT NULL DEFAULT 1,
      started_at DATETIME,
      finished_at DATETIME,
      status VARCHAR NOT NULL,
      error TEXT,
      emails_fetched INTEGER DEFAULT 0,
      events_fetched INTEGER DEFAULT 0
    );
  `);

  // Assicura l'utente predefinito Francesco
  const user = db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!user) {
    db.prepare(`
      INSERT INTO users (id, name, email, created_at, updated_at)
      VALUES (1, 'Francesco Russotto', 'f.russotto@arteficegroup.com', datetime('now'), datetime('now'))
    `).run();
  }
}

// Rinnova l'Access Token Google tramite OAuth2 refresh_token
export async function getFreshAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = getGoogleCredentials();

  if (!refreshToken) {
    throw new Error('Google Refresh Token non configurato.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Errore rinnovo token Google OAuth (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

  // Salva nel database SQLite se aperto in scrittura
  try {
    const db = new DatabaseSync(EMAIL_DB_PATH);
    ensureEmailDatabaseSchema(db);
    db.prepare(`
      INSERT INTO google_tokens (user_id, access_token, refresh_token, token_type, expires_at, created_at, updated_at)
      VALUES (1, ?, ?, 'Bearer', ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
        expires_at = excluded.expires_at,
        updated_at = datetime('now')
    `).run(accessToken, refreshToken, expiresAt);
    db.close();
  } catch (err) {
    console.warn('Avviso salvataggio token SQLite:', err);
  }

  return accessToken;
}

// Decodifica parte MIME di Gmail (base64url -> utf8)
function decodeBase64Url(data: string | undefined): string {
  if (!data) return '';
  try {
    const clean = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(clean, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

// Estrazione ricorsiva del corpo email (testo e HTML)
function extractMimeBodies(part: any, bodies: { text: string; html: string }) {
  if (!part) return;
  const mimeType = (part.mimeType || '').toLowerCase();
  const data = part.body?.data;

  if (data) {
    const decoded = decodeBase64Url(data);
    if (mimeType === 'text/plain' && !bodies.text) {
      bodies.text = decoded;
    } else if (mimeType === 'text/html' && !bodies.html) {
      bodies.html = decoded;
    }
  }

  if (Array.isArray(part.parts)) {
    for (const sub of part.parts) {
      extractMimeBodies(sub, bodies);
    }
  }
}

// Parsing mittente "Nome Cognome <email@domain.com>"
function parseSenderString(fromStr: string): { name: string; email: string } {
  if (!fromStr) return { name: '', email: '' };
  const match = fromStr.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/["']/g, '').trim() || match[2].trim(),
      email: match[2].trim()
    };
  }
  return { name: fromStr.trim(), email: fromStr.trim() };
}

// Sincronizzazione Gmail nativa
export async function syncGmail(accessToken: string, sinceDate: Date = new Date('2026-11-01T00:00:00Z')): Promise<{ fetched: number; inserted: number }> {
  const epoch = Math.floor(sinceDate.getTime() / 1000);
  const q = `after:${epoch}`;
  
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=100`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!listRes.ok) {
    throw new Error(`Gmail API list failed (${listRes.status}): ${await listRes.text()}`);
  }

  const listData = await listRes.json();
  const messages = listData.messages || [];
  if (messages.length === 0) {
    return { fetched: 0, inserted: 0 };
  }

  const db = new DatabaseSync(EMAIL_DB_PATH);
  ensureEmailDatabaseSchema(db);

  // Trova messaggi già presenti
  const existingRows = db.prepare('SELECT google_message_id FROM emails WHERE source_type = \'email\'').all() as any[];
  const existingSet = new Set(existingRows.map(r => r.google_message_id));

  let inserted = 0;
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO emails (
      user_id, google_message_id, thread_id, sender, sender_email, subject,
      body_text, body_html, content_hash, received_at, source_type, recipients,
      created_at, updated_at
    ) VALUES (
      1, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 'email', ?,
      datetime('now'), datetime('now')
    )
  `);

  for (const msg of messages) {
    if (existingSet.has(msg.id)) continue;

    try {
      const getUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
      const getRes = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!getRes.ok) continue;

      const detail = await getRes.json();
      const payload = detail.payload || {};
      const headers = payload.headers || [];

      const getHeader = (name: string) => {
        const h = headers.find((x: any) => x.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
      };

      const fromHeader = getHeader('From');
      const subject = getHeader('Subject') || '(Senza oggetto)';
      const dateHeader = getHeader('Date');
      const toHeader = getHeader('To');
      const ccHeader = getHeader('Cc');

      const senderInfo = parseSenderString(fromHeader);
      const bodies = { text: '', html: '' };
      extractMimeBodies(payload, bodies);

      if (!bodies.text && bodies.html) {
        // Fallback: strip tags per il testo plain
        bodies.text = bodies.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (!bodies.text) {
        bodies.text = detail.snippet || '';
      }

      let receivedAt = new Date().toISOString();
      if (dateHeader) {
        const parsedDate = new Date(dateHeader);
        if (!isNaN(parsedDate.getTime())) {
          receivedAt = parsedDate.toISOString();
        }
      } else if (detail.internalDate) {
        receivedAt = new Date(parseInt(detail.internalDate, 10)).toISOString();
      }

      const contentHash = crypto.createHash('sha256').update(bodies.text + subject + senderInfo.email).digest('hex');
      const recipientsJson = JSON.stringify({ to: toHeader, cc: ccHeader });

      insertStmt.run(
        msg.id,
        detail.threadId || msg.threadId,
        senderInfo.name,
        senderInfo.email,
        subject,
        bodies.text,
        bodies.html,
        contentHash,
        receivedAt,
        recipientsJson
      );
      inserted++;
    } catch (err) {
      console.warn(`Errore parsing messaggio ${msg.id}:`, err);
    }
  }

  db.close();
  return { fetched: messages.length, inserted };
}

// Sincronizzazione Google Calendar nativa
export async function syncGoogleCalendar(accessToken: string): Promise<{ fetched: number; inserted: number }> {
  // Finestra temporale: da 7 giorni fa a +45 giorni
  const past = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const future = new Date(Date.now() + 45 * 86400 * 1000).toISOString();

  const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(past)}&timeMax=${encodeURIComponent(future)}&singleEvents=true&orderBy=startTime&maxResults=150`;
  const res = await fetch(calUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Google Calendar API failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const items = data.items || [];

  const db = new DatabaseSync(EMAIL_DB_PATH);
  ensureEmailDatabaseSchema(db);

  let inserted = 0;
  const upsertStmt = db.prepare(`
    INSERT INTO emails (
      user_id, google_message_id, thread_id, sender, sender_email, subject,
      body_text, content_hash, received_at, source_type, event_start_at, event_end_at,
      event_link, recipients, created_at, updated_at
    ) VALUES (
      1, ?, ?, ?, ?, ?,
      ?, ?, ?, 'meeting', ?, ?,
      ?, ?, datetime('now'), datetime('now')
    )
    ON CONFLICT(user_id, google_message_id) DO UPDATE SET
      subject = excluded.subject,
      event_start_at = excluded.event_start_at,
      event_end_at = excluded.event_end_at,
      event_link = excluded.event_link,
      recipients = excluded.recipients,
      updated_at = datetime('now')
  `);

  for (const item of items) {
    try {
      const summary = item.summary || '(Evento senza titolo)';
      const description = item.description || '';
      const organizer = item.organizer || {};
      const organizerName = organizer.displayName || organizer.email || 'Organizzatore';
      const organizerEmail = organizer.email || 'calendar@google.com';

      const start = item.start?.dateTime || item.start?.date || new Date().toISOString();
      const end = item.end?.dateTime || item.end?.date || start;

      // Estrai link Meet / Conferenza
      let meetingLink = item.hangoutLink || item.htmlLink || null;
      if (item.conferenceData?.entryPoints) {
        const ep = item.conferenceData.entryPoints.find((p: any) => p.entryPointType === 'video' || p.uri);
        if (ep?.uri) meetingLink = ep.uri;
      }

      const attendees = (item.attendees || []).map((a: any) => ({
        name: a.displayName || null,
        email: a.email || ''
      }));

      const contentHash = crypto.createHash('sha256').update(summary + start + organizerEmail).digest('hex');
      const threadId = `evt_${item.id}`;

      upsertStmt.run(
        item.id,
        threadId,
        organizerName,
        organizerEmail,
        summary,
        description,
        contentHash,
        start,
        start,
        end,
        meetingLink,
        JSON.stringify(attendees)
      );
      inserted++;
    } catch (err) {
      console.warn(`Errore parsing evento ${item.id}:`, err);
    }
  }

  db.close();
  return { fetched: items.length, inserted };
}

// Funzione principale di sincronizzazione unificata
export async function pollGoogleData(sinceDate?: Date): Promise<GoogleSyncResult> {
  if (isSyncing) {
    return {
      success: false,
      emailsFetched: 0,
      eventsFetched: 0,
      newEmailsInserted: 0,
      newEventsInserted: 0,
      error: 'Sincronizzazione già in corso',
      timestamp: new Date().toISOString()
    };
  }

  isSyncing = true;
  const startedAt = new Date().toISOString();
  console.log(`[GoogleSync] 🚀 Avvio sincronizzazione nativa Google (Gmail + Calendar) alle ${startedAt}...`);

  try {
    const accessToken = await getFreshAccessToken();

    // 1. Sync Gmail
    const emailResult = await syncGmail(accessToken, sinceDate || new Date('2026-11-01T00:00:00Z'));
    console.log(`[GoogleSync] ✉️ Gmail sincronizzato: ${emailResult.fetched} messaggi totali trovati, ${emailResult.inserted} nuovi inseriti.`);

    // 2. Sync Calendar
    const calResult = await syncGoogleCalendar(accessToken);
    console.log(`[GoogleSync] 📅 Calendar sincronizzato: ${calResult.fetched} eventi esaminati, ${calResult.inserted} aggiornati.`);

    // 3. Trigger Agente Autonomo per analizzare subito i nuovi thread in background
    if (emailResult.inserted > 0) {
      console.log(`[GoogleSync] 🧠 Nuove email trovate: lancio analisi autonoma Frank Agent...`);
      setTimeout(() => {
        autonomousAgent.scanAndEnqueue().catch(e => console.error('Errore scanAndEnqueue dopo sync:', e));
      }, 500);
    }

    return {
      success: true,
      emailsFetched: emailResult.fetched,
      eventsFetched: calResult.fetched,
      newEmailsInserted: emailResult.inserted,
      newEventsInserted: calResult.inserted,
      timestamp: new Date().toISOString()
    };
  } catch (err: any) {
    console.error('[GoogleSync] ❌ Errore durante la sincronizzazione:', err);
    return {
      success: false,
      emailsFetched: 0,
      eventsFetched: 0,
      newEmailsInserted: 0,
      newEventsInserted: 0,
      error: err.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    isSyncing = false;
  }
}

// Inizializza lo scheduler in background (ogni 10 minuti)
let schedulerInterval: any = null;
export function initGoogleSyncScheduler(intervalMinutes = 10) {
  if (schedulerInterval) clearInterval(schedulerInterval);

  console.log(`[GoogleSync] ⏱️ Scheduler Google attivato: controllo ogni ${intervalMinutes} minuti.`);
  schedulerInterval = setInterval(() => {
    pollGoogleData().catch(err => console.error('[GoogleSync Scheduler] Errore:', err));
  }, intervalMinutes * 60 * 1000);

  // Esegui un primo controllo leggero all'avvio dopo 5 secondi
  setTimeout(() => {
    pollGoogleData().catch(err => console.warn('[GoogleSync Initial] Avviso primo sync:', err.message));
  }, 5000);
}
