import React, { useState } from 'react';
import {
  CreditCard,
  Calendar,
  MailCheck,
  FileText,
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
  SuperAgentStatus
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
  onNavigateTab: (tab: 'overview' | 'super-agent' | 'expenses' | 'email-calendar' | 'docs-rag') => void;
  onToggleExpensePaid: (id: string) => void;
  onToggleRequestStatus: (id: string) => void;
  onSyncAll: () => void;
  isSyncing: boolean;
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
  isSyncing
}) => {
  const [quickQuery, setQuickQuery] = useState('');
  const [quickAnswer, setQuickAnswer] = useState<string | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);

  // Calcolo statistiche
  const totalMonthlyExpenses = expenses.reduce((sum, e) => {
    const factor = e.frequency === 'Annuale' ? 1 / 12 : e.frequency === 'Bimestrale' ? 1 / 2 : 1;
    return sum + (e.amount * factor);
  }, 0);

  const unpaidExpenses = expenses.filter(e => !e.isPaid);
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const upcomingEvents = events.slice(0, 3);

  const handleAskQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickQuery.trim() || isAnswering) return;

    setIsAnswering(true);
    setQuickAnswer(null);

    try {
      const retrieved = retrieveRelevantChunks(quickQuery, chunks, 2);
      const ecosystem: EcosystemContext = {
        expenses,
        events,
        requests,
        documents,
        todayStr: new Date().toISOString().split('T')[0]
      };
      const res = await generateRAGAnswer(quickQuery, retrieved, settings, ecosystem);
      setQuickAnswer(res.text);
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Welcome Banner Flat Pastel */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Panoramica Frank</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
              Second Brain Hub
            </span>
            {agentStatus && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                agentStatus.isProcessing
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                <Brain className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {agentStatus.isProcessing
                    ? `Frank Agent: studio thread in corso (${agentStatus.analyzedCount}/${agentStatus.totalCount})...`
                    : `Frank Agent: ${agentStatus.analyzedCount}/${agentStatus.totalCount} thread studiati`}
                </span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Budget e uscite fisse, eventi da 2 account email, richieste operative estratte con AI e archivio RAG.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onSyncAll}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
            <span>{isSyncing ? 'Sincronizzazione...' : 'Sincronizza Dati'}</span>
          </button>
        </div>
      </div>

      {/* Super Agente Dispatcher & Fleet Bar */}
      {superAgentStatus && (
        <div
          onClick={() => onNavigateTab('super-agent')}
          className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white cursor-pointer hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 border border-indigo-800/40"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
              <Brain className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide">
                  Frank Super Agente & Subagenti
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {superAgentStatus.subagents.length} reparti orchestrati
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                {superAgentStatus.latestBriefing?.summary || 'Tutti i subagenti sincronizzati e operativi in background.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto text-xs text-indigo-300 hover:text-white font-semibold bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
            <span>Cockpit Super Agente</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* 4 Summary Stat Cards (Soft Pastel) */}
      <div className={`grid gap-3 ${showExpenses ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
        
        {/* Card Spese (Soft Sky) - visibile solo se showExpenses è attivo */}
        {showExpenses && (
          <div
            onClick={() => onNavigateTab('expenses')}
            className="p-4 rounded-xl bg-sky-50/60 border border-sky-100/90 hover:border-sky-200 cursor-pointer transition-all hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-sky-800 text-xs">
              <span className="font-semibold">Spese Fisse Mese</span>
              <CreditCard className="w-4 h-4 text-sky-600" />
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900">€ {totalMonthlyExpenses.toFixed(2)}</div>
            <div className="text-[11px] text-sky-700 font-medium mt-0.5">
              {unpaidExpenses.length} da saldare
            </div>
          </div>
        )}

        {/* Card Eventi (Soft Mint) */}
        <div
          onClick={() => onNavigateTab('email-calendar')}
          className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100/90 hover:border-emerald-200 cursor-pointer transition-all hover:shadow-xs"
        >
          <div className="flex items-center justify-between text-emerald-800 text-xs">
            <span className="font-semibold">Eventi & Calendario</span>
            <Calendar className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">{events.length} impegni</div>
          <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
            Lavoro + Personale
          </div>
        </div>

        {/* Card Email AI (Soft Peach/Amber) */}
        <div
          onClick={() => onNavigateTab('email-calendar')}
          className="p-4 rounded-xl bg-amber-50/60 border border-amber-100/90 hover:border-amber-200 cursor-pointer transition-all hover:shadow-xs"
        >
          <div className="flex items-center justify-between text-amber-800 text-xs">
            <span className="font-semibold">Email AI Agent</span>
            <MailCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">{pendingRequests.length} aperte</div>
          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
            To-do estratti da Gmail
          </div>
        </div>

        {/* Card Note & RAG (Soft Lavender) */}
        <div
          onClick={() => onNavigateTab('docs-rag')}
          className="p-4 rounded-xl bg-purple-50/60 border border-purple-100/90 hover:border-purple-200 cursor-pointer transition-all hover:shadow-xs"
        >
          <div className="flex items-center justify-between text-purple-800 text-xs">
            <span className="font-semibold">Documenti & RAG</span>
            <FileText className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">{documents.length} doc</div>
          <div className="text-[11px] text-purple-700 font-medium mt-0.5">
            {chunks.length} frammenti RAG
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

          {/* Quick RAG Assistant Box */}
          <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Chiedi a Frank & RAG</h3>
              </div>
              <button
                onClick={() => onNavigateTab('docs-rag')}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline flex items-center space-x-1"
              >
                <span>Archivio completo</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <form onSubmit={handleAskQuick} className="flex gap-2">
              <input
                type="text"
                placeholder="Fai una domanda (es. 'Cos'è il RAG?' o sui tuoi documenti)..."
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
              <button
                type="submit"
                disabled={!quickQuery.trim() || isAnswering}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {isAnswering ? '...' : 'Chiedi'}
              </button>
            </form>

            {quickAnswer && (
              <div className="mt-3 p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Risposta Frank</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickAnswer(null)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-[11px] flex items-center gap-1"
                    title="Chiudi risposta"
                  >
                    <X className="w-3 h-3" />
                    <span>Chiudi</span>
                  </button>
                </div>
                <AiMessageRenderer content={quickAnswer} />
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
