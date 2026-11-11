import React, { useState } from 'react';
import {
  Sparkles,
  Check,
  Clock,
  Mail,
  ExternalLink,
  EyeOff,
  Eye,
  RotateCcw,
  CheckCircle2,
  Brain,
  Loader2,
  Copy,
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { ThreadAgentAnalysis } from '../types';

export interface ThreadTaskRequest {
  id: number;
  email_id: number;
  summary: string;
  urgency: 'high' | 'medium' | 'low' | string;
  deadline?: string | null;
  status: 'pending' | 'done';
  created_at?: string;
}

export interface ThreadEmailMessage {
  id: number;
  google_message_id?: string;
  sender: string;
  sender_email: string;
  subject: string;
  received_at: string;
  source_type?: string;
  recipients?: {
    to?: { name: string; email: string }[];
    cc?: { name: string; email: string }[];
    attendees?: { name: string; email: string }[];
  } | any;
  event_link?: string;
  body_text?: string;
  body_html?: string;
}

export interface EmailThreadData {
  thread_id: string;
  subject: string;
  source_type: string;
  email_count: number;
  last_at: string;
  senders: { name: string; email: string }[];
  max_urgency: 'high' | 'medium' | 'low' | string | null;
  min_deadline?: string | null;
  done_count: number;
  pending_count: number;
  has_requests: boolean;
  is_hidden: boolean;
  requests: ThreadTaskRequest[];
  emails: ThreadEmailMessage[];
  agentAnalysis?: ThreadAgentAnalysis | null;
}

interface ThreadCardProps {
  thread: EmailThreadData;
  onToggleRequest: (requestId: number, newStatus: 'done' | 'pending') => void;
  onToggleThread: (threadId: string, action: 'done' | 'reopen') => void;
  onToggleHideThread?: (threadId: string, isHidden: boolean) => void;
  onOpenAIDraft: (thread: EmailThreadData) => void;
}

function relativeDeadline(deadline?: string | null) {
  if (!deadline) return null;
  const date = new Date(deadline);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: 'Scaduta', className: 'bg-rose-50 text-rose-700 border-rose-200/90' };
  if (diffDays === 0) return { text: 'Oggi', className: 'bg-amber-50 text-amber-700 border-amber-200/90' };
  if (diffDays === 1) return { text: 'Domani', className: 'bg-amber-50/80 text-amber-700 border-amber-200/90' };
  return { text: `Tra ${diffDays} giorni`, className: 'bg-slate-100 text-slate-600 border-slate-200/90' };
}

function relativeTime(isoDate?: string | null) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 2) return 'Adesso';
  if (diffMin < 60) return `${diffMin} min fa`;
  if (diffHour < 24) return `${diffHour} ${diffHour === 1 ? 'ora' : 'ore'} fa`;
  if (diffDay < 7) return `${diffDay} ${diffDay === 1 ? 'giorno' : 'giorni'} fa`;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

function names(list?: { name: string; email: string }[]) {
  return (list || [])
    .map(p => p.name || p.email)
    .filter(Boolean)
    .join(', ');
}

function recipientsLabel(recipients?: any) {
  if (!recipients) return '—';
  if (Array.isArray(recipients.attendees)) {
    return names(recipients.attendees) || '—';
  }
  const parts: string[] = [];
  if (Array.isArray(recipients.to) && recipients.to.length > 0) {
    parts.push(`A: ${names(recipients.to)}`);
  }
  if (Array.isArray(recipients.cc) && recipients.cc.length > 0) {
    parts.push(`Cc: ${names(recipients.cc)}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

const urgencyConfig: Record<string, { label: string; className: string }> = {
  high: { label: 'Alta', className: 'bg-rose-50 text-rose-700 border-rose-200/90' },
  alta: { label: 'Alta', className: 'bg-rose-50 text-rose-700 border-rose-200/90' },
  medium: { label: 'Media', className: 'bg-amber-50 text-amber-700 border-amber-200/90' },
  media: { label: 'Media', className: 'bg-amber-50 text-amber-700 border-amber-200/90' },
  low: { label: 'Bassa', className: 'bg-slate-100 text-slate-600 border-slate-200/90' },
  bassa: { label: 'Bassa', className: 'bg-slate-100 text-slate-600 border-slate-200/90' }
};

export const ThreadCard: React.FC<ThreadCardProps> = ({
  thread,
  onToggleRequest,
  onToggleThread,
  onToggleHideThread,
  onOpenAIDraft
}) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<number | null>(null);

  // Thread Agent state
  const [showAgent, setShowAgent] = useState(false);
  const [agentAnalysis, setAgentAnalysis] = useState<ThreadAgentAnalysis | null>(thread.agentAnalysis || null);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  // Sincronizza lo stato locale quando arriva una nuova analisi autonoma via props
  React.useEffect(() => {
    if (thread.agentAnalysis) {
      setAgentAnalysis(thread.agentAnalysis);
    }
  }, [thread.agentAnalysis]);

  const fetchAgentAnalysis = async (force = false) => {
    if (agentAnalysis && !force) {
      setShowAgent(prev => !prev);
      return;
    }
    setIsAgentLoading(true);
    setAgentError(null);
    setShowAgent(true);
    try {
      const res = await fetch('/api/thread-agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: thread.thread_id, force })
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setAgentAnalysis(data.analysis);
      } else {
        setAgentError(data.error || 'Impossibile analizzare il thread.');
      }
    } catch (err: any) {
      setAgentError(err.message || 'Errore di connessione con l\'Agente.');
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const requests = thread.requests || [];
  const doneCount = requests.filter(r => r.status === 'done').length;
  const totalCount = requests.length;
  const allFlagsChecked = totalCount > 0 && doneCount === totalCount;
  const allDone = thread.has_requests && (thread.pending_count === 0 || allFlagsChecked);

  const deadline = relativeDeadline(thread.min_deadline);
  const sendersLabel = (thread.senders || []).map(s => s.name || s.email).filter(Boolean).join(' · ');

  const urgency = thread.max_urgency ? urgencyConfig[thread.max_urgency] : null;

  const handleToggleAll = () => {
    const action = allFlagsChecked ? 'reopen' : 'done';
    onToggleThread(thread.thread_id, action);
  };

  const handleToggleMasterDone = () => {
    const action = allDone ? 'reopen' : 'done';
    onToggleThread(thread.thread_id, action);
  };

  return (
    <article
      className={`rounded-2xl border transition-all duration-200 p-5 shadow-xs hover:shadow-sm ${
        thread.is_hidden
          ? 'bg-slate-100/60 border-slate-200 opacity-70'
          : allDone
          ? 'bg-white/70 border-slate-200/70 opacity-90'
          : thread.max_urgency === 'high' || thread.max_urgency === 'alta'
          ? 'bg-white border-rose-200/80 hover:border-rose-300'
          : 'bg-white border-slate-200/80 hover:border-slate-300'
      }`}
    >
      {/* 1. Top Header Row: Badges on left, Actions Toolbar on right */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
        {/* Badges Row */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {/* Status dell'Agente Frank Autonomo */}
          {agentAnalysis ? (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 ${
                agentAnalysis.status === "action_required"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : agentAnalysis.status === "waiting_others"
                  ? "bg-sky-50 text-sky-700 border-sky-200"
                  : agentAnalysis.status === "resolved"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {agentAnalysis.status === "action_required" && <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />}
              {agentAnalysis.status === "waiting_others" && <Clock className="w-3 h-3 text-sky-500 shrink-0" />}
              {agentAnalysis.status === "resolved" && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
              <span>{agentAnalysis.statusLabel}</span>
              {agentAnalysis.activeTasks && agentAnalysis.activeTasks.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-rose-200/80 text-rose-800 text-[10px] font-bold">
                  {agentAnalysis.activeTasks.length}
                </span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium border border-indigo-200/60 whitespace-nowrap shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
              <span>Analisi in corso...</span>
            </span>
          )}

          {urgency && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap shrink-0 ${urgency.className}`}>
              {urgency.label}
            </span>
          )}

          {deadline && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap shrink-0 ${deadline.className}`}>
              <Clock className="w-3 h-3 mr-1 text-current opacity-70" />
              {deadline.text}
            </span>
          )}

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200/60 whitespace-nowrap shrink-0">
            <Mail className="w-3 h-3 text-slate-400" />
            {thread.email_count} email
          </span>

          {thread.has_requests && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap shrink-0 ${
                allDone
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200/60"
              }`}
            >
              {allDone ? (
                <>
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                  Completato
                </>
              ) : (
                `${doneCount}/${totalCount} completati`
              )}
            </span>
          )}

          {thread.is_hidden && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-medium whitespace-nowrap shrink-0">
              <EyeOff className="w-3 h-3 text-slate-500" />
              Nascosto
            </span>
          )}
        </div>

        {/* Actions Toolbar */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Hide / Unhide Button */}
          {onToggleHideThread && (
            <button
              type="button"
              onClick={() => onToggleHideThread(thread.thread_id, !thread.is_hidden)}
              title={thread.is_hidden ? "Ripristina thread" : "Nascondi thread"}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-2xs transition-colors whitespace-nowrap"
            >
              {thread.is_hidden ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  <span>Ripristina</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Nascondi</span>
                </>
              )}
            </button>
          )}

          {/* AI Draft Reply Button */}
          <button
            type="button"
            onClick={() => onOpenAIDraft(thread)}
            title="Genera una bozza di risposta rapida con l'AI"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50/80 hover:bg-sky-100 text-sky-700 border border-sky-200/80 text-xs font-bold shadow-2xs transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
            <span>Rispondi con AI</span>
          </button>

          {/* Master Completion Button */}
          {thread.has_requests && (
            allDone ? (
              <button
                type="button"
                onClick={handleToggleMasterDone}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Riapri thread</span>
              </button>
            ) : allFlagsChecked ? (
              <button
                type="button"
                onClick={handleToggleMasterDone}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Segna come completato</span>
              </button>
            ) : (
              <button
                disabled
                title="Spunta tutti i task per abilitare il completamento del thread"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200/80 bg-slate-100/70 text-slate-400 text-xs font-medium cursor-not-allowed select-none whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5 opacity-40" />
                <span>Completato (${doneCount}/${totalCount})</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* 2. Full Width Content: Subject & Senders */}
      <div className="mt-3">
        <h3 className={`text-base font-bold leading-snug tracking-tight transition-colors ${allDone ? "text-slate-400 line-through" : "text-slate-900"}`}>
          {thread.subject || "Nessun oggetto"}
        </h3>

        {sendersLabel && (
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block shrink-0" />
            <span className="truncate font-medium text-slate-600">{sendersLabel}</span>
            {thread.last_at && (
              <span className="text-slate-400">· {relativeTime(thread.last_at)}</span>
            )}
          </p>
        )}
      </div>

      {/* 3. Sintesi Autonoma Frank (Full width!) */}
      {agentAnalysis?.summary && (
        <div className="mt-3 rounded-xl bg-slate-50/80 border border-slate-200/70 p-3 space-y-1.5">
          <p className="text-xs text-slate-800 leading-relaxed font-normal">
            <span className="font-bold text-indigo-700">Analisi Frank: </span>
            {agentAnalysis.summary}
          </p>
          {agentAnalysis.suggestedNextStep && (
            <div className="pt-1.5 border-t border-slate-200/50 flex items-start gap-1.5 text-xs text-indigo-950 font-medium">
              <ArrowRight className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
              <span><strong className="text-indigo-900">Prossimo passo:</strong> {agentAnalysis.suggestedNextStep}</span>
            </div>
          )}
        </div>
      )}

      {/* Autonomous Thread Agent Panel */}
      {showAgent && (
        <div className="mt-4 rounded-xl border border-indigo-200/90 bg-gradient-to-b from-indigo-50/40 via-white to-slate-50/30 p-4 shadow-2xs transition-all">
          <div className="flex items-center justify-between pb-3 border-b border-indigo-100/80">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Agente Autonomo Frank
                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/80 px-1.5 py-0.5 rounded-md">
                    Sonar Context Engine
                  </span>
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {agentAnalysis && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                    agentAnalysis.status === 'action_required'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : agentAnalysis.status === 'waiting_others'
                      ? 'bg-sky-50 text-sky-700 border-sky-200'
                      : agentAnalysis.status === 'resolved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {agentAnalysis.status === 'action_required' && <AlertCircle className="w-3 h-3 text-rose-500" />}
                  {agentAnalysis.status === 'waiting_others' && <Clock className="w-3 h-3 text-sky-500" />}
                  {agentAnalysis.status === 'resolved' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                  {agentAnalysis.statusLabel}
                </span>
              )}
              <button
                type="button"
                onClick={() => fetchAgentAnalysis(true)}
                disabled={isAgentLoading}
                title="Rianalizza l'intero thread da zero"
                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-white border border-transparent hover:border-indigo-100 transition-colors"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isAgentLoading ? 'animate-spin text-indigo-600' : ''}`} />
              </button>
            </div>
          </div>

          {isAgentLoading && (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-indigo-600">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Analisi multi-messaggio del thread in corso...</p>
            </div>
          )}

          {agentError && (
            <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {agentError}
            </div>
          )}

          {agentAnalysis && !isAgentLoading && (
            <div className="mt-3 space-y-3.5">
              {/* Quadro della situazione */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Quadro della situazione
                </p>
                <p className="text-xs text-slate-800 leading-relaxed font-medium bg-white/90 p-3 rounded-lg border border-slate-200/80">
                  {agentAnalysis.summary}
                </p>
              </div>

              {/* Prossimo passo suggerito */}
              {agentAnalysis.suggestedNextStep && (
                <div className="p-3 rounded-lg bg-indigo-50/80 border border-indigo-200/70 flex items-start gap-2.5">
                  <ArrowRight className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wide">
                      Prossimo passo suggerito
                    </p>
                    <p className="text-xs text-indigo-950 mt-0.5 font-medium leading-relaxed">
                      {agentAnalysis.suggestedNextStep}
                    </p>
                  </div>
                </div>
              )}

              {/* Task Grid: Cosa tocca a te vs Già risolto */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Active Tasks */}
                <div className="rounded-lg border border-slate-200/80 bg-white/90 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                      Cosa tocca a te ({agentAnalysis.activeTasks?.length || 0})
                    </span>
                  </div>
                  {agentAnalysis.activeTasks && agentAnalysis.activeTasks.length > 0 ? (
                    <ul className="space-y-2">
                      {agentAnalysis.activeTasks.map((t, i) => (
                        <li key={i} className="text-xs p-2 rounded-md bg-rose-50/50 border border-rose-100">
                          <p className="font-semibold text-slate-900">{t.summary}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{t.reason}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-1">
                      Nessuna azione operativa richiesta a te.
                    </p>
                  )}
                </div>

                {/* Resolved Tasks */}
                <div className="rounded-lg border border-slate-200/80 bg-white/90 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 inline-block" />
                      Già risolto nel thread ({agentAnalysis.resolvedTasks?.length || 0})
                    </span>
                  </div>
                  {agentAnalysis.resolvedTasks && agentAnalysis.resolvedTasks.length > 0 ? (
                    <ul className="space-y-2">
                      {agentAnalysis.resolvedTasks.map((t, i) => (
                        <li key={i} className="text-xs p-2 rounded-md bg-emerald-50/50 border border-emerald-100">
                          <p className="font-semibold text-slate-800 line-through decoration-emerald-600/70">{t.summary}</p>
                          <div className="flex items-center justify-between gap-1 text-[11px] text-emerald-700 mt-1">
                            <span className="font-medium">Risolto da: {t.resolvedBy}</span>
                          </div>
                          {t.resolvedNote && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{t.resolvedNote}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-1">
                      Nessun task precedente marcato come risolto.
                    </p>
                  )}
                </div>
              </div>

              {/* Draft Reply se presente */}
              {agentAnalysis.draftReply?.body && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      Bozza pronta per la risposta
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyDraft(agentAnalysis.draftReply?.body || '')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      {copiedDraft ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Copiata!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                          <span>Copia bozza</span>
                        </>
                      )}
                    </button>
                  </div>
                  {agentAnalysis.draftReply.to && (
                    <p className="text-[11px] text-slate-500">
                      A: <span className="font-semibold text-slate-700">{agentAnalysis.draftReply.to}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-md whitespace-pre-wrap font-sans border border-slate-100">
                    {agentAnalysis.draftReply.body}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cose Richieste con Singole Checkbox */}
      {thread.has_requests ? (
        <div className={`mt-3.5 rounded-xl border p-3.5 transition-colors ${allDone ? 'border-slate-200/60 bg-slate-50/40' : 'border-slate-200/90 bg-slate-50/70 shadow-2xs'}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Cose richieste
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                {doneCount}/{totalCount}
              </span>
            </div>
            
            {totalCount > 1 && (
              <button
                type="button"
                onClick={handleToggleAll}
                className="text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors"
              >
                {allFlagsChecked ? 'Deseleziona tutti' : 'Spunta tutti'}
              </button>
            )}
          </div>

          {/* Mini progress bar */}
          {totalCount > 1 && (
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          )}

          {/* Interactive Checklist */}
          <ul className="flex flex-col gap-1.5">
            {requests.map(request => {
              const isItemDone = request.status === 'done';

              return (
                <li
                  key={request.id}
                  className="flex items-start gap-2.5 rounded-lg p-1.5 -mx-1 text-xs hover:bg-white/80 transition-colors"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isItemDone}
                    onClick={() => onToggleRequest(request.id, isItemDone ? 'pending' : 'done')}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors ${
                      isItemDone
                        ? 'bg-slate-900 border border-slate-900 text-white'
                        : 'border border-slate-300 bg-white hover:border-sky-500'
                    }`}
                    title={isItemDone ? 'Segna come non fatto' : 'Spunta questa attività'}
                  >
                    {isItemDone && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  <div
                    onClick={() => onToggleRequest(request.id, isItemDone ? 'pending' : 'done')}
                    className="flex-1 min-w-0 cursor-pointer select-none leading-relaxed"
                  >
                    <span className={`transition-colors ${isItemDone ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      {request.summary}
                    </span>
                    {request.deadline && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-slate-200/70 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                        Scadenza: {new Date(request.deadline).toLocaleDateString('it-IT')}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-2.5 text-xs text-slate-400 italic">
          Nessuna attività operativa richiesta estratta da questo thread.
        </p>
      )}

      {/* Accordion Toggle per Cronologia Email */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sky-700 transition-colors"
      >
        <span className={`transform transition-transform text-[10px] ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span>Vedi email del thread ({thread.email_count})</span>
      </button>

      {/* Expanded Email List */}
      {expanded && (
        <div className="mt-2.5 border-t border-slate-100 pt-3 space-y-2">
          {thread.emails.length > 0 ? (
            thread.emails.map(email => {
              const isOpen = expandedEmailId === email.id;
              const formattedDate = relativeTime(email.received_at);

              return (
                <div key={email.id} className="rounded-xl border border-slate-200/70 bg-slate-50/40 p-3 space-y-2">
                  <div
                    onClick={() => setExpandedEmailId(isOpen ? null : email.id)}
                    className="flex items-start justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {email.subject || 'Nessun oggetto'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">{email.sender || 'Mittente'}</span>
                        {email.sender_email && <span> ({email.sender_email})</span>}
                        {formattedDate && <span> · {formattedDate}</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                        Destinatari: {recipientsLabel(email.recipients)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {email.event_link && (
                        <a
                          href={email.event_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-semibold text-sky-700 hover:bg-sky-50"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Partecipa</span>
                        </a>
                      )}
                      <span className="text-xs text-slate-400 font-bold">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Collapsible Body */}
                  {isOpen && (
                    <div className="pt-2 border-t border-slate-200/60 text-xs text-slate-700 leading-relaxed">
                      {email.body_html ? (
                        <div
                          className="p-3 bg-white rounded-lg border border-slate-200 overflow-x-auto max-h-96"
                          dangerouslySetInnerHTML={{ __html: email.body_html }}
                        />
                      ) : email.body_text ? (
                        <p className="p-3 bg-white rounded-lg border border-slate-200 whitespace-pre-wrap font-sans text-slate-700">
                          {email.body_text}
                        </p>
                      ) : (
                        <p className="text-slate-400 italic">Testo del messaggio non disponibile.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-slate-400 italic">Nessun dettaglio email disponibile.</p>
          )}
        </div>
      )}
    </article>
  );
};
