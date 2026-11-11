import { FixedExpense, SyncedEvent, EmailAIRequest, StoredDocument } from '../types';

export const INITIAL_FIXED_EXPENSES: FixedExpense[] = [
  {
    id: 'exp-1',
    name: 'Affitto / Mutuo Appartamento',
    amount: 850,
    category: 'Casa',
    frequency: 'Mensile',
    dueDay: 1,
    isPaid: true,
    notes: 'Bonifico automatico inizio mese'
  },
  {
    id: 'exp-2',
    name: 'Bolletta Luce & Gas',
    amount: 145,
    category: 'Utenze',
    frequency: 'Bimestrale',
    dueDay: 15,
    isPaid: false,
    notes: 'Scadenza tra 4 giorni'
  },
  {
    id: 'exp-3',
    name: 'Connessione Fibra Internet',
    amount: 29.90,
    category: 'Utenze',
    frequency: 'Mensile',
    dueDay: 10,
    isPaid: true,
    notes: 'Addebito diretto SDD'
  },
  {
    id: 'exp-4',
    name: 'Tool AI & Cloud Subscriptions',
    amount: 40,
    category: 'Lavoro',
    frequency: 'Mensile',
    dueDay: 20,
    isPaid: false,
    notes: 'Gemini Advanced + API Serverless'
  },
  {
    id: 'exp-5',
    name: 'Assicurazione Auto & Moto',
    amount: 65,
    category: 'Trasporti',
    frequency: 'Mensile',
    dueDay: 27,
    isPaid: false,
    notes: 'Rata mensile Zurich'
  },
  {
    id: 'exp-6',
    name: 'Abbonamento Palestra',
    amount: 55,
    category: 'Altro',
    frequency: 'Mensile',
    dueDay: 5,
    isPaid: true,
    notes: 'Accesso Open'
  }
];

export const INITIAL_SYNCED_EVENTS: SyncedEvent[] = [
  {
    id: 'ev-1',
    account: 'work',
    accountEmail: 'f.russotto@arteficegroup.com',
    title: 'Sprint Review & Demo release',
    date: '2026-11-12',
    time: '15:00',
    duration: '1h',
    category: 'Review'
  },
  {
    id: 'ev-2',
    account: 'work',
    accountEmail: 'f.russotto@arteficegroup.com',
    title: 'Sync settimanale team sviluppo Pimcore',
    date: '2026-11-13',
    time: '10:30',
    duration: '45m',
    category: 'Meeting'
  },
  {
    id: 'ev-3',
    account: 'personal',
    accountEmail: 'francesco.russo@gmail.com',
    title: 'Visita medica di controllo',
    date: '2026-11-13',
    time: '17:30',
    duration: '30m',
    category: 'Personale'
  },
  {
    id: 'ev-4',
    account: 'work',
    accountEmail: 'f.russotto@arteficegroup.com',
    title: 'Scadenza rilascio endpoint e verifiche tecniche',
    date: '2026-11-16',
    time: '18:00',
    duration: 'Scadenza',
    category: 'Scadenza'
  },
  {
    id: 'ev-5',
    account: 'personal',
    accountEmail: 'francesco.russo@gmail.com',
    title: 'Cena con colleghi e amici',
    date: '2026-11-17',
    time: '20:30',
    duration: '2h',
    category: 'Personale'
  }
];

export const INITIAL_EMAIL_REQUESTS: EmailAIRequest[] = [
  {
    id: 'req-1',
    sender: 'Davide Sala',
    senderEmail: 'd.sala@arteficegroup.com',
    subject: 'Richiesta avanzamento release & stato pratiche',
    summary: 'È richiesto l\'invio del resoconto aggiornato sulle modifiche prima della riunione operativa con il cliente.',
    urgency: 'alta',
    deadline: 'Giovedì 12:00',
    status: 'pending',
    receivedAt: 'Oggi 09:24'
  },
  {
    id: 'req-2',
    sender: 'Chiara Citterio',
    senderEmail: 'c.citterio@studio.it',
    subject: 'Verifica tabella listino e bozza testi',
    summary: 'Confermare se le ultime revisioni al foglio di calcolo possono essere messe online questa settimana.',
    urgency: 'media',
    deadline: 'Venerdì 17:00',
    status: 'pending',
    receivedAt: 'Ieri 16:40'
  },
  {
    id: 'req-3',
    sender: 'Amministrazione Condominio',
    senderEmail: 'studio.amministrazione@gestioni.it',
    subject: 'Saldo quota straordinaria ascensore',
    summary: 'Si ricorda di predisporre il bonifico relativo alla seconda tranche della delibera condominiale.',
    urgency: 'bassa',
    deadline: 'Fine mese',
    status: 'completed',
    receivedAt: 'Lunedi 11:15'
  }
];

export const INITIAL_DOCUMENTS: StoredDocument[] = [
  {
    id: 'doc-rag',
    title: 'Architettura RAG & Note Tecniche.md',
    category: 'Tech',
    fileType: 'md',
    sizeBytes: 2450,
    uploadedAt: new Date().toISOString(),
    tags: ['RAG', 'AI', 'Embeddings'],
    chunksCount: 2,
    content: `# Architettura RAG e Note Tecniche

Il RAG (Retrieval-Augmented Generation) consente di estendere la conoscenza di un LLM iniettando documenti personali al momento del prompt.
Vantaggi chiave:
- Nessun costo di fine-tuning periodico
- Zero allucinazioni su fatti specifici dei propri file
- Citazione chiara della fonte e del paragrafo di riferimento.
La divisione in blocchi (chunking) da 300-600 token con 50 token di overlap evita la perdita di contesto ai confini delle frasi.`
  },
  {
    id: 'doc-para',
    title: 'Second Brain: Metodo PARA.txt',
    category: 'Guida',
    fileType: 'txt',
    sizeBytes: 1800,
    uploadedAt: new Date().toISOString(),
    tags: ['Second Brain', 'Produttività'],
    chunksCount: 2,
    content: `METODO P.A.R.A. (Tiago Forte)
Organizza ogni informazione in sole 4 categorie:
1. Projects: Progetti attivi con scadenza ravvicinata.
2. Areas: Aree di responsabilità continuativa (salute, finanze, casa).
3. Resources: Materiali di studio, letture e argomenti di interesse.
4. Archives: Tutto ciò che è concluso o non più utile nel presente.`
  }
];

