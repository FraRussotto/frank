export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  category: 'Casa' | 'Utenze' | 'Abbonamenti' | 'Trasporti' | 'Lavoro' | 'Altro';
  frequency: 'Mensile' | 'Annuale' | 'Bimestrale';
  dueDay: number; // es. giorno 5 del mese
  isPaid: boolean;
  notes?: string;
}

export type EmailAccountType = 'work' | 'personal';

export interface SyncedEvent {
  id: string;
  account: EmailAccountType;
  accountEmail: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  duration: string;
  category: 'Meeting' | 'Scadenza' | 'Personale' | 'Review';
}

export interface EmailAIRequest {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  summary: string;
  urgency: 'alta' | 'media' | 'bassa';
  deadline?: string;
  status: 'pending' | 'completed';
  receivedAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

export interface StoredDocument {
  id: string;
  title: string;
  category: 'Tech' | 'Note' | 'Guida' | 'Finanze' | 'Personale';
  fileType: 'md' | 'txt' | 'json' | 'pdf' | 'csv';
  sizeBytes: number;
  uploadedAt: string;
  content: string;
  chunksCount: number;
  tags: string[];
}

export interface RetrievedChunk {
  chunk: DocumentChunk;
  score: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  retrievedSources?: RetrievedChunk[];
  modelUsed?: string;
}

export interface AppSettings {
  geminiApiKey: string;
  selectedModel: 'smart-local' | 'gemini-2.5-flash';
  workEmail: string;
  personalEmail: string;
  lastSyncTime: string;
}

export interface EcosystemContext {
  expenses: FixedExpense[];
  events: SyncedEvent[];
  requests: EmailAIRequest[];
  documents: StoredDocument[];
  todayStr?: string;
}

export interface ThreadAgentTask {
  summary: string;
  urgency: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ThreadAgentResolvedTask {
  summary: string;
  resolvedBy: string;
  resolvedNote: string;
}

export interface ThreadAgentAnalysis {
  threadId: string;
  status: 'action_required' | 'waiting_others' | 'resolved' | 'informative';
  statusLabel: string;
  summary: string;
  myActionRequired: boolean;
  activeTasks: ThreadAgentTask[];
  resolvedTasks: ThreadAgentResolvedTask[];
  suggestedNextStep: string;
  draftReply?: {
    to: string;
    subject: string;
    body: string;
  };
  analyzedAt?: string;
  modelUsed?: string;
}

export interface AgentWorkerStatus {
  queueLength: number;
  analyzedCount: number;
  totalCount: number;
  isProcessing: boolean;
  currentThreadSubject: string;
}
