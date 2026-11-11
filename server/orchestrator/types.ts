export type SubagentId = 'email' | 'calendar' | 'finance' | 'knowledge' | string;

export type SubagentStatus = 'idle' | 'running' | 'completed' | 'error';

export interface SubagentAlert {
  id: string;
  level: 'info' | 'warning' | 'urgent';
  title: string;
  message: string;
  timestamp: string;
}

export interface SubagentMeta {
  id: SubagentId;
  name: string;
  department: string;
  icon: string;
  description: string;
  status: SubagentStatus;
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

export interface ISubagent {
  id: SubagentId;
  name: string;
  department: string;
  icon: string;
  description: string;
  getMeta(): Promise<SubagentMeta>;
  runScan(force?: boolean): Promise<{ success: boolean; message: string; details?: any }>;
  query(intent: string, payload?: any): Promise<any>;
}

