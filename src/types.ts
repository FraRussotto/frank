export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  category: 'Casa' | 'Utenze' | 'Abbonamenti' | 'Trasporti' | 'Lavoro' | 'Altro';
  frequency: 'Mensile' | 'Annuale' | 'Bimestrale';
  dueDay: number; // es. giorno 5 del mese
  isPaid: boolean;
  isAutoDebit?: boolean; // Se addebito automatico su c/c o carta (non genera scadenza manuale)
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
  category: 'Tech' | 'Note' | 'Guida' | 'Finanze' | 'Personale' | string;
  fileType: 'md' | 'txt' | 'json' | 'pdf' | 'csv' | 'docx' | 'xlsx' | string;
  sizeBytes: number;
  uploadedAt: string;
  content: string;
  chunksCount: number;
  tags: string[];
  fileUrl?: string;
  originalFilename?: string;
  mimeType?: string;
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

export type SubagentStatusType = 'idle' | 'running' | 'completed' | 'error';

export interface SubagentAlert {
  id: string;
  level: 'info' | 'warning' | 'urgent';
  title: string;
  message: string;
  timestamp: string;
}

export interface SubagentMeta {
  id: string;
  name: string;
  department: string;
  icon: string;
  description: string;
  status: SubagentStatusType;
  lastRunAt: string | null;
  stats: Record<string, any>;
  alerts: SubagentAlert[];
}

export interface PriorityAction {
  id: string;
  urgency: 'alta' | 'media' | 'bassa';
  department: string;
  title: string;
  description: string;
  source: string;
  deadline?: string;
  linkTab?: 'email-calendar' | 'expenses' | 'docs-rag';
}

export interface SuperAgentBriefing {
  id: string;
  generatedAt: string;
  date: string;
  headline: string;
  summary: string;
  priorityActions: PriorityAction[];
  crossDomainInsights: string[];
  stats: {
    activeEmailTasks: number;
    threadsWithAction: number;
    upcomingMeetings: number;
    unpaidExpensesAmount: number;
    unpaidExpensesCount: number;
    indexedDocsCount: number;
  };
}

export interface SuperAgentStatus {
  name: string;
  role: string;
  version: string;
  isOrchestrating: boolean;
  lastOrchestrationAt: string | null;
  subagents: SubagentMeta[];
  latestBriefing: SuperAgentBriefing | null;
}

export interface SuperAgentDelegation {
  id: string;
  name: string;
  icon: string;
  detail: string;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  delegations?: SuperAgentDelegation[];
  modelUsed?: string;
}

export type DeadlineCategory = 'task_operativo' | 'documento' | 'preparazione_call' | 'pagamento' | 'manuale' | 'casa_utenze' | 'burocrazia' | 'salute';
export type DeadlinePriority = 'alta' | 'media' | 'bassa';
export type DeadlineStatus = 'pending' | 'completed' | 'dismissed';
export type DeadlineScope = 'personal' | 'work';

export interface DeadlineItem {
  id: string;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD o YYYY-MM-DDTHH:mm
  category: DeadlineCategory;
  priority: DeadlinePriority;
  status: DeadlineStatus;
  scope?: DeadlineScope;
  source: string;
  sourceId?: string;
  daysNotice: number;
  amount?: number;
  completedAt?: string;
  createdAt: string;
  daysRemaining?: number;
  urgencyStatus?: 'overdue' | 'today' | 'due_soon' | 'upcoming';
}

export interface UpcomingDeadlinesSummary {
  overdue: DeadlineItem[];
  today: DeadlineItem[];
  dueSoon: DeadlineItem[];
  future: DeadlineItem[];
  totalPending: number;
  highPriorityCount: number;
}


