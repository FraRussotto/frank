import React, { useState } from 'react';
import {
  CreditCard,
  Calendar,
  MailCheck,
  FileText,
  CalendarCheck,
  AlertTriangle,
  ArrowRight,
  Check,
  RotateCw,
  Clock,
  Sparkles,
  Brain,
  X
} from 'lucide-react';
import {
  FixedExpense,
  SyncedEvent,
  EmailAIRequest,
  StoredDocument,
  DocumentChunk,
  AppSettings,
  EcosystemContext,
  AgentWorkerStatus,
  SuperAgentStatus,
  UpcomingDeadlinesSummary,
  DeadlineItem
} from '../types';
import { retrieveRelevantChunks, generateRAGAnswer } from '../services/ragEngine';
import { AiMessageRenderer } from './AiMessageRenderer';

interface OverviewViewProps {
  expenses: FixedExpense[];
  events: SyncedEvent[];
  requests: EmailAIRequest[];
  documents: StoredDocument[];
  chunks: DocumentChunk[];
  settings: AppSettings;
  showExpenses: boolean;
  agentStatus?: AgentWorkerStatus | null;
  superAgentStatus?: SuperAgentStatus | null;
  onNavigateTab: (tab: 'overview' | 'super-agent' | 'expenses' | 'email-calendar' | 'docs-rag' | 'deadlines') => void;
  onToggleExpensePaid: (id: string) => void;
  onToggleRequestStatus: (id: string) => void;
  onSyncAll: () => void;
  isSyncing: boolean;
  onSaveCompaction?: (doc: StoredDocument) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  expenses,
  events,
  requests,
  documents,
  chunks,
  settings,
  showExpenses,
  agentStatus,
  superAgentStatus,
  onNavigateTab,
  onToggleExpensePaid,
  onToggleRequestStatus,
  onSyncAll,
  isSyncing,
  onSaveCompaction
}) => {
  // Calcolo statistiche
  const totalMonthlyExpenses = expenses.reduce((sum, e) => {
    const factor = e.frequency === 'Annuale' ? 1 / 12 : e.frequency === 'Bimestrale' ? 1 / 2 : 1;
    return sum + (e.amount * factor);
  }, 0);

  const unpaidExpenses = expenses.filter(e => !e.isPaid);
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const upcomingEvents = events.slice(0, 3);

  // Scadenze Personali (Deadline Engine)
  const [deadlinesSummary, setDeadlinesSummary] = useState<UpcomingDeadlinesSummary | null>(null);

  React.useEffect(() => {
    fetch('/api/deadlines?scope=personal')
      .then(res => res.json())
      .then(data => {
        if (data.summary) setDeadlinesSummary(data.summary);
      })
      .catch(() => {});
  }, [isSyncing]);

  const imminentList = deadlinesSummary ? [...deadlinesSummary.today, ...deadlinesSummary.dueSoon, ...deadlinesSummary.overdue] : [];
  const imminentCount = imminentList.length;

  const ecosystem: EcosystemContext = {
    expenses,
    events,
    requests,
    documents,
    todayStr: new Date().toISOString().split('T')[0]
  };

  return (
    <div className="space-y-6 w-full pb-12">
      
      {/* 1. Executive Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Panoramica</h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200/80">
              Executive Cockpit
            </span>
            {agentStatus && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono border font-medium ${
                agentStatus.isProcessing
                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200 animate-pulse'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${agentStatus.isProcessing ? 'bg-indigo-600 animate-ping' : 'bg-emerald-500'}`} />
                <span>
                  {agentStatus.isProcessing
                    ? `Frank Agent: studio (${agentStatus.analyzedCount}/${agentStatus.totalCount})...`
                    : `Agent: ${agentStatus.analyzedCount}/${agentStatus.totalCount} thread sincronizzati`}
                </span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quadro esecutivo: scadenze, impegni a calendario, compiti estratti con AI e bilancio mensile.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onSyncAll}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold shadow-2xs hover:border-slate-300 transition-all duration-150 active:scale-95 disabled:opacity-50"
            title="Sincronizza subito Gmail e Google Calendar"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
            <span>{isSyncing ? 'Sincronizzazione...' : 'Sincronizza Dati'}</span>
          </button>
        </div>
      </div>

      {/* 2. Preventive Alert: Proactive Deadlines & Action Items */}
      {imminentCount > 0 && (
        <div className="p-4 sm:p-5 rounded-xl bg-white border-l-4 border-l-amber-500 border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  Promemoria Scadenze Personali: {imminentCount} {imminentCount === 1 ? 'scadenza a breve' : 'scadenze a breve'}
                  <span className="text-[10px] font-mono lowercase font-semibold px-2 py-0.2 rounded-full bg-amber-100 text-amber-900 border border-amber-300/80">
                    prossime 72h
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Spese, pagamenti e adempimenti della tua vita personale sotto monitoraggio preventivo.
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('deadlines')}
              className="flex items-center gap-1 text-xs font-bold text-slate-800 hover:text-slate-950 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs self-start sm:self-auto transition-all duration-150 active:scale-95"
            >
              <span>Vedi scadenze personali</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {imminentList.slice(0, 3).map((item) => (
              <div
                key={item.id}
                onClick={() => onNavigateTab('deadlines')}
                className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/80 hover:border-slate-300 hover:bg-white shadow-2xs cursor-pointer transition-all duration-150 hover:translate-y-[-1px]"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                    {item.daysRemaining === 0 ? 'SCADE OGGI' : item.daysRemaining === 1 ? 'Entro Domani' : `Tra ${item.daysRemaining} gg`}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {item.dueDate}
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-slate-900 line-clamp-1">
                  {item.title}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                  {item.source}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Four High-Precision Metric Cards */}
      <div className={`grid gap-3.5 ${showExpenses ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
        
        {/* Card Spese */}
        {showExpenses && (
          <div
            onClick={() => onNavigateTab('expenses')}
            className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:shadow-xs cursor-pointer transition-all duration-150 active:scale-[0.99] group"
          >
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500 group-hover:text-slate-800 transition-colors">
                Spese del Mese
              </span>
              <CreditCard className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tracking-tight">
              € {totalMonthlyExpenses.toFixed(2)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-slate-600">{unpaidExpenses.length} voci da saldare</span>
            </div>
          </div>
        )}

        {/* Card Eventi */}
        <div
          onClick={() => onNavigateTab('email-calendar')}
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:shadow-xs cursor-pointer transition-all duration-150 active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500 group-hover:text-slate-800 transition-colors">
              Agenda & Riunioni
            </span>
            <Calendar className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {events.length} <span className="text-sm font-sans font-normal text-slate-400">impegni</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600">Lavoro + Personale</span>
          </div>
        </div>

        {/* Card Email AI */}
        <div
          onClick={() => onNavigateTab('email-calendar')}
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:shadow-xs cursor-pointer transition-all duration-150 active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500 group-hover:text-slate-800 transition-colors">
              Task Email AI
            </span>
            <MailCheck className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {pendingRequests.length} <span className="text-sm font-sans font-normal text-slate-400">in attesa</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            <span className="text-slate-600">Richieste operative Gmail</span>
          </div>
        </div>

        {/* Card Note & RAG */}
        <div
          onClick={() => onNavigateTab('docs-rag')}
          className="p-4 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:shadow-xs cursor-pointer transition-all duration-150 active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-500 group-hover:text-slate-800 transition-colors">
              Archivio RAG
            </span>
            <FileText className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {documents.length} <span className="text-sm font-sans font-normal text-slate-400">file</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-slate-600">{chunks.length} frammenti vettoriali</span>
          </div>
        </div>

      </div>

      {/* Main 2-Column Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Col: Spese & Eventi */}
        <div className="space-y-6">
          
          {/* Widget Spese Fisse in Scadenza */}
          <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Spese Fisse in Scadenza</h3>
              </div>
              <button
                onClick={() => onNavigateTab('expenses')}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline flex items-center space-x-1"
              >
                <span>Gestisci tutte</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {expenses.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  Nessuna spesa registrata.
                </div>
              ) : (
                expenses.slice(0, 4).map((exp) => (
                  <div key={exp.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2.5">
                      <button
                        onClick={() => onToggleExpensePaid(exp.id)}
                        className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                          exp.isPaid ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-slate-400'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </button>
                      <div>
                        <span className={`font-medium ${exp.isPaid ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {exp.name}
                        </span>
                        <div className="text-[10px] text-slate-400">Scadenza: gg {exp.dueDay} ({exp.category})</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">€ {exp.amount.toFixed(2)}</div>
                      <span className={`text-[10px] font-medium ${exp.isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {exp.isPaid ? 'Saldato' : 'Da pagare'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Widget Eventi 2 Account */}
          <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Prossimi Eventi (2 Account)</h3>
              </div>
              <button
                onClick={() => onNavigateTab('email-calendar')}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline flex items-center space-x-1"
              >
                <span>Vedi calendario</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {upcomingEvents.map((ev) => {
                const isWork = ev.account === 'work';
                return (
                  <div key={ev.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        isWork
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {isWork ? 'LAV' : 'PER'}
                      </span>
                      <div>
                        <div className="font-medium text-slate-800">{ev.title}</div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-400 inline" />
                          <span>{ev.date} alle {ev.time}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                      {ev.category}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Col: Email AI Agent & RAG Quick Assistant */}
        <div className="space-y-6">
          
          {/* Widget Email AI Agent */}
          <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MailCheck className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Email AI Agent (Azioni Richieste)</h3>
              </div>
              <button
                onClick={() => onNavigateTab('email-calendar')}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline flex items-center space-x-1"
              >
                <span>Vedi tutte</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2.5">
              {requests.slice(0, 3).map((req) => (
                <div
                  key={req.id}
                  className="p-3 rounded-lg bg-slate-50/70 border border-slate-200/80 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] uppercase font-mono px-1.5 py-0.2 rounded border font-medium ${
                      req.urgency === 'alta' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      Urgenza {req.urgency}
                    </span>
                    <span className="text-[10px] text-slate-400">{req.receivedAt}</span>
                  </div>
                  <div className="font-semibold text-slate-800">{req.subject}</div>
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{req.summary}</p>
                  <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-200/60">
                    <span>Da: {req.sender}</span>
                    <button
                      onClick={() => onToggleRequestStatus(req.id)}
                      className="text-sky-600 hover:text-sky-700 font-medium hover:underline"
                    >
                      {req.status === 'completed' ? 'Riapri' : 'Segna fatto'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Knowledge & RAG Card */}
          <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Archivio Documentale RAG</h3>
              </div>
              <button
                onClick={() => onNavigateTab('docs-rag')}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium hover:underline flex items-center space-x-1"
              >
                <span>Gestisci</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Hai <b>{documents.length} documenti</b> ({chunks.length} frammenti indicizzati) consultabili in tempo reale da Frank Copilot (inclusi PDF, Word ed Excel).
            </p>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Subagente Knowledge attivo</span>
              <button
                onClick={() => onNavigateTab('docs-rag')}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors"
              >
                Carica nuovo file
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
