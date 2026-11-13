import path from 'node:path';

export const APP_ROOT = process.env.APP_ROOT || process.cwd();

// Database SQLite di Frank (Finanze, Scadenze, RAG embeddings, note)
export const FRANK_DB_PATH = process.env.FRANK_DB_PATH || path.join(APP_ROOT, 'database', 'frank_agent.sqlite');

// Cartella Uploads per i documenti originali (PDF, immagini, file RAG)
export const UPLOADS_DOCS_DIR = process.env.UPLOADS_DOCS_DIR || path.join(APP_ROOT, 'uploads', 'documents');

// Cartella Config per Telegram e credenziali
export const CONFIG_DIR = process.env.CONFIG_DIR || path.join(APP_ROOT, 'config');
export const TELEGRAM_CONFIG_PATH = process.env.TELEGRAM_CONFIG_PATH || path.join(CONFIG_DIR, 'telegram.json');

// Percorsi opzionali per l'integrazione con Laravel email-ai-agent
export const LARAVEL_DIR = process.env.LARAVEL_DIR || (
  process.env.NODE_ENV === 'production' 
    ? path.join(APP_ROOT, '..', 'email-ai-agent')
    : '/Users/fra_russo/email-ai-agent'
);

export const EMAIL_DB_PATH = process.env.EMAIL_DB_PATH || path.join(LARAVEL_DIR, 'database', 'database.sqlite');
export const LARAVEL_ENV_PATH = process.env.LARAVEL_ENV_PATH || path.join(LARAVEL_DIR, '.env');

