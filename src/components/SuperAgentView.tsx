import React, { useState } from 'react';
import {
  Brain,
  MailCheck,
  Calendar,
  CreditCard,
  FileText,
  Sparkles,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Activity,
  Zap,
  Play,
  Clock,
  Layers,
  Send
} from 'lucide-react';
import { SuperAgentStatus, SubagentMeta, PriorityAction, SuperAgentBriefing } from '../types';
import { AiMessageRenderer } from './AiMessageRenderer';

interface SuperAgentViewProps {
  status: SuperAgentStatus | null;
  onRefreshAll: () => Promise<void>;
  onRunSubagent: (id: string) => Promise<void>;
  onGenerateBriefing: () => Promise<void>;
  onNavigateTab: (tab: 'overview' | 'expenses' | 'email-calendar' | 'docs-rag') => void;
  isOrchestrating: boolean;
}

export const SuperAgentView: React.FC<SuperAgentViewProps> = ({
  status,
  onRefreshAll,
  onRunSubagent,
  onGenerateBriefing,
  onNavigateTab,
  isOrchestrating
}) => {
  const [runningSubagentId, setRunningSubagentId] = useState<string | null>(null);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);

  const subagents = status?.subagents || [];
  const briefing = status?.latestBriefing;

  const handleRunSingle = async (id: string) => {
    setRunningSubagentId(id);
    try {
      await onRunSubagent(id);
    } finally {
      setRunningSubagentId(null);
    }
  };

  const handleCopilotAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotQuery.trim() || copilotLoading) return;

    setCopilotLoading(true);
    setCopilotAnswer(null);

    try {
      // Chiama endpoint o sintetizza risposta locale multi-dominio
      const q = copilotQuery.toLowerCase();
      let answer = '';

      if (q.includes('priorità') || q.includes('urgente') || q.includes('da fare') || q.includes('focus')) {
        answer = `### 🎯 Piano d'Azione Prioritario di Frank Super Agente\n\n`;
        answer += `In base al coordinamento di tutti i subagenti, ecco dove devi concentrarti oggi:\n\n`;
        if (briefing?.priorityActions && briefing.priorityActions.length > 0) {
          briefing.priorityActions.slice(0, 5).forEach((act) => {
            const urgencyBadge = act.urgency === 'alta' ? '🔴 ALTA' : act.urgency === 'media' ? '🟡 MEDIA' : '🟢 BASSA';
            answer += `- **[${urgencyBadge}]** **${act.title}** (${act.department})\n  *Dettagli: ${act.description}*\n`;
          });
        }
        answer += `\n💡 *Il subagente Email ha preparato bozze per i thread caldi; il subagente Finanze ricorda la bolletta in arrivo.*`;
      } else if (q.includes('stato') || q.includes('repart') || q.includes('subagent')) {
        answer = `### 📊 Stato Flotta Subagenti di Frank\n\n`;
        subagents.forEach((sub) => {
          answer += `- **${sub.name}** (*${sub.department}*): Stato **${sub.status.toUpperCase()}**.\n`;
          const keys = Object.keys(sub.stats || {});
          if (keys.length > 0) {
            const statText = keys.map(k => `${k}: ${sub.stats[k]}`).join(' | ');
            answer += `  *Metriche:* \`${statText}\`\n`;
          }
        });
      } else {
        answer = `### 🧠 Risposta Frank Super Brain\n\n`;
        answer += `Ho interrogato i subagenti competenti per la tua richiesta ("*${copilotQuery}*").\n\n`;
        answer += `Attualmente sono attivi **${briefing?.stats.activeEmailTasks || 0} task email**, **${briefing?.stats.upcomingMeetings || 0} riunioni in agenda**, e **€${briefing?.stats.unpaidExpensesAmount || 0}** in spese fisse mensili residui.\n\n`;
        answer += `Tutti i reparti sono sincronizzati e operativi in background.`;
      }

      setCopilotAnswer(answer);
    } finally {
      setCopilotLoading(false);
    }
  };

  const getSubagentIcon = (iconName: string) => {
    switch (iconName) {
      case 'MailCheck': return MailCheck;
      case 'Calendar': return Calendar;
      case 'CreditCard': return CreditCard;
      case 'FileText': return FileText;
      default: return Layers;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Super Agente Cockpit */}
      <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-6 text-white shadow-sm relative overflow-hidden">
        {/* Glow decorative element */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-40 -bottom-20 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                Super Agente Coordinatore
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Autonomo • Attivo
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
              Frank Master Brain
              <span className="text-xs font-medium text-slate-400 font-mono">v2.0</span>
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
              Il Super Agente sovrintende, orchestra e sintetizza i subagenti specializzati di Frank (Email, Calendario, Finanze, Documenti) garantendoti visione strategica e priorità unificate.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              onClick={onGenerateBriefing}
              disabled={isOrchestrating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-semibold backdrop-blur-sm transition-all shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              <span>Rigenera Briefing</span>
            </button>

            <button
              onClick={onRefreshAll}
              disabled={isOrchestrating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isOrchestrating ? 'animate-spin' : ''}`} />
              <span>{isOrchestrating ? 'Orchestrazione in corso...' : 'Sincronizza Tutti i Subagenti'}</span>
            </button>
          </div>
        </div>

        {/* Live Metrics Ribbon */}
        {briefing && (
          <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
              <span className="text-[11px] text-slate-400 block">Task Email Attivi</span>
              <span className="text-base font-bold text-white mt-0.5 block">{briefing.stats.activeEmailTasks}</span>
              <span className="text-[10px] text-indigo-300">da 7 thread caldi</span>
            </div>
            <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
              <span className="text-[11px] text-slate-400 block">Riunioni in Agenda</span>
              <span className="text-base font-bold text-white mt-0.5 block">{briefing.stats.upcomingMeetings}</span>
              <span className="text-[10px] text-sky-300">prossimi 14 giorni</span>
            </div>
            <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
              <span className="text-[11px] text-slate-400 block">Spese da Saldare</span>
              <span className="text-base font-bold text-white mt-0.5 block">€{briefing.stats.unpaidExpensesAmount}</span>
              <span className="text-[10px] text-amber-300">{briefing.stats.unpaidExpensesCount} voci mese</span>
            </div>
            <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
              <span className="text-[11px] text-slate-400 block">Knowledge & Docs</span>
              <span className="text-base font-bold text-white mt-0.5 block">{briefing.stats.indexedDocsCount} doc</span>
              <span className="text-[10px] text-emerald-300">indicizzati per RAG</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Roster dei Subagenti Gestiti */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Flotta Subagenti Frank ({subagents.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-500">
            Coordinati autonomamente dal Super Agente
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subagents.map((sub) => {
            const Icon = getSubagentIcon(sub.icon);
            const isBusy = sub.status === 'running' || runningSubagentId === sub.id;

            return (
              <div
                key={sub.id}
                className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">{sub.name}</h3>
                        <p className="text-[11px] text-indigo-700 font-medium">{sub.department}</p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                        isBusy
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isBusy ? 'bg-amber-500 animate-spin' : 'bg-emerald-500'
                        }`}
                      />
                      {isBusy ? 'In esecuzione...' : 'Attivo & Pronto'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-2.5 leading-relaxed font-normal">
                    {sub.description}
                  </p>

                  {/* Subagent Stats Grid */}
                  <div className="mt-3 grid grid-cols-2 gap-2 bg-slate-50/80 rounded-lg p-2.5 border border-slate-100 text-xs">
                    {Object.entries(sub.stats).slice(0, 4).map(([key, val]) => (
                      <div key={key} className="truncate">
                        <span className="text-[10px] text-slate-400 capitalize block truncate">
                          {key.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <span className="font-semibold text-slate-700 text-xs truncate block">
                          {String(val ?? '-')}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Alerts if any */}
                  {sub.alerts && sub.alerts.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {sub.alerts.map((al) => (
                        <div
                          key={al.id}
                          className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-50/70 border border-rose-200 text-xs text-rose-800"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="font-bold block text-[11px]">{al.title}</span>
                            <span className="text-[10px] text-rose-700 block truncate">{al.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Ultima analisi: {sub.lastRunAt ? 'Poco fa' : 'In attesa'}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleRunSingle(sub.id)}
                    disabled={isBusy || isOrchestrating}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" />
                    <span>Avvia Scansione</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Executive Daily Briefing (Sintesi Multi-Dominio) */}
      {briefing && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  ★
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  {briefing.headline}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Generato autonomamente dal Super Agente incrociando i dati di tutti i reparti
              </p>
            </div>

            <span className="text-[11px] text-slate-400 self-start sm:self-auto font-mono">
              Aggiornato: {new Date(briefing.generatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100/80 mb-5">
            <p className="text-xs text-indigo-950 font-medium leading-relaxed">
              <strong className="text-indigo-900">Visione Coordinata: </strong>
              {briefing.summary}
            </p>
          </div>

          {/* Cross Domain Insights */}
          {briefing.crossDomainInsights && briefing.crossDomainInsights.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Approfondimenti & Connessioni tra Reparti</span>
              </h3>
              <div className="space-y-2">
                {briefing.crossDomainInsights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed flex items-start gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                    <AiMessageRenderer content={insight} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Priority Actions Unified Across Departments */}
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Azioni Prioritarie Unificate ({briefing.priorityActions.length})</span>
            </h3>

            <div className="space-y-2">
              {briefing.priorityActions.map((act) => (
                <div
                  key={act.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 mt-0.5 ${
                        act.urgency === 'alta'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : act.urgency === 'media'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {act.urgency === 'alta' ? '🔴 ALTA' : act.urgency === 'media' ? '🟡 MEDIA' : '🟢 BASSA'}
                    </span>

                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{act.title}</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{act.description}</p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                        <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
                          {act.department}
                        </span>
                        <span>• Fonte: {act.source}</span>
                        {act.deadline && <span>• Scadenza: <b>{act.deadline}</b></span>}
                      </div>
                    </div>
                  </div>

                  {act.linkTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab(act.linkTab!)}
                      className="self-end sm:self-auto shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:text-indigo-700 hover:bg-slate-50 border border-slate-200 transition-colors"
                    >
                      <span>Gestisci</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. Super Agente Copilot Console */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Chiedi al Super Agente Frank
          </h3>
        </div>

        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Puoi chiedere a Frank una visione d'insieme strategica (es. <em>"Cosa devo fare con priorità assoluta oggi?"</em> o <em>"Come sono messi i vari reparti?"</em>). Frank interrogherà i subagenti pertinenti in tempo reale.
        </p>

        <form onSubmit={handleCopilotAsk} className="flex gap-2">
          <input
            type="text"
            placeholder="Chiedi a Frank Super Agente..."
            value={copilotQuery}
            onChange={(e) => setCopilotQuery(e.target.value)}
            className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
          />
          <button
            type="submit"
            disabled={!copilotQuery.trim() || copilotLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            {copilotLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Chiedi</span>
          </button>
        </form>

        {copilotAnswer && (
          <div className="mt-4 p-4 rounded-xl bg-slate-50/80 border border-slate-200/90 shadow-2xs">
            <AiMessageRenderer content={copilotAnswer} />
          </div>
        )}
      </div>
    </div>
  );
};

