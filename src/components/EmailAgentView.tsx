import React, { useState } from 'react';
import { CheckCircle2, RotateCw, Sparkles } from 'lucide-react';
import { EmailAIRequest, AppSettings } from '../types';

interface EmailAgentViewProps {
  requests: EmailAIRequest[];
  settings: AppSettings;
  onToggleRequestStatus: (id: string) => void;
  onSyncEmails: () => void;
  isSyncing: boolean;
}

export const EmailAgentView: React.FC<EmailAgentViewProps> = ({
  requests,
  settings,
  onToggleRequestStatus,
  onSyncEmails,
  isSyncing
}) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');

  const filteredRequests = requests.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Email AI Agent</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-mono font-medium">
              repo: email-ai-agent
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Richieste e to-do operativi estratti automaticamente dalle email Gmail tramite AI.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onSyncEmails}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Scansione Inbox...' : 'Scansiona Nuove Email'}</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner (Flat Pastel) */}
      <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2 text-slate-700">
          <Sparkles className="w-4 h-4 text-sky-600" />
          <span>Pipeline: <b>PollEmailsCommand</b> → <b>ProcessEmailJob</b> con estrazione automatica richieste.</span>
        </div>
        <div className="text-slate-400 text-[11px] font-mono">
          Ultimo controllo: {settings.lastSyncTime || 'Adesso'}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'pending'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          Da Completare ({pendingCount})
        </button>

        <button
          onClick={() => setFilter('completed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'completed'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          Completate ({requests.filter(r => r.status === 'completed').length})
        </button>

        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          Tutte ({requests.length})
        </button>
      </div>

      {/* Request Cards (Flat Pastel) */}
      <div className="space-y-3">
        {filteredRequests.map((req) => {
          const isDone = req.status === 'completed';
          const urgencyBadge = req.urgency === 'alta'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : req.urgency === 'media'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-slate-100 text-slate-700 border-slate-200';

          return (
            <div
              key={req.id}
              className={`p-4 rounded-xl bg-white border transition-all shadow-xs ${
                isDone ? 'border-slate-200 opacity-60' : 'border-slate-200/90 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <button
                    onClick={() => onToggleRequestStatus(req.id)}
                    className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                      isDone
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-300 hover:border-slate-400 text-transparent'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border font-mono ${urgencyBadge}`}>
                        Urgenza {req.urgency}
                      </span>
                      <span className="text-xs font-semibold text-slate-800">
                        {req.subject}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed font-sans pt-0.5">
                      {req.summary}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                      <span>Da: <b>{req.sender}</b> ({req.senderEmail})</span>
                      <span>• Ricevuta: {req.receivedAt}</span>
                      {req.deadline && (
                        <span className="text-amber-800 font-medium">
                          • Scadenza richiesta: {req.deadline}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onToggleRequestStatus(req.id)}
                  className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
                >
                  {isDone ? 'Riapri' : 'Fatto'}
                </button>
              </div>
            </div>
          );
        })}

        {filteredRequests.length === 0 && (
          <div className="p-8 text-center rounded-xl bg-white border border-slate-200 text-slate-400 text-xs">
            Nessuna richiesta trovata per questo filtro.
          </div>
        )}
      </div>

    </div>
  );
};
