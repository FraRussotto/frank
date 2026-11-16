import React, { useState, useRef, useEffect } from 'react';
import {
  Brain,
  Send,
  Sparkles,
  RotateCw,
  Trash2,
  FileText,
  MailCheck,
  Calendar,
  CreditCard,
  Bot,
  User,
  ArrowRight,
  Layers,
  CheckCircle2
} from 'lucide-react';
import { CopilotMessage, SuperAgentDelegation, AppSettings, EcosystemContext, DocumentChunk, StoredDocument } from '../types';
import { retrieveRelevantChunks } from '../services/ragEngine';
import { AiMessageRenderer } from './AiMessageRenderer';

interface FrankCopilotProps {
  settings: AppSettings;
  chunks: DocumentChunk[];
  ecosystem?: EcosystemContext;
  onNavigateTab?: (tab: 'overview' | 'super-agent' | 'expenses' | 'email-calendar' | 'docs-rag' | 'deadlines') => void;
  onSaveCompaction?: (doc: StoredDocument) => void;
}

const STORAGE_KEY_COPILOT = 'frank_copilot_chat_v1';

const INITIAL_MESSAGES: CopilotMessage[] = [
  {
    id: 'msg-welcome',
    role: 'assistant',
    content: 'Ciao Francesco! Sono **Frank**, il tuo Super Agente. Ho visibilità su tutti i tuoi reparti operativi:\n\n- Posso estrarre dati specifici dai tuoi documenti (come la **Partita IVA** o la sede dalla Visura camerale)\n- Monitorare i **task e le richieste aperte** nelle email\n- Verificare le **riunioni e impegni** a calendario\n- Controllare lo stato delle **spese fisse del mese**\n\nChiedimi pure qualsiasi cosa in modo naturale o usa i suggerimenti qui sotto!',
    timestamp: 'Adesso',
    modelUsed: 'Frank Super Agent'
  }
];

const SUGGESTED_QUERIES = [
  { label: 'Partita IVA & Dati Azienda', query: 'Qual è la mia Partita IVA e l\'indirizzo della sede?' },
  { label: 'Priorità Email', query: 'Quali sono i task più urgenti estratti dalle email?' },
  { label: 'Prossimi Eventi', query: 'Cosa ho in programma a calendario nei prossimi giorni?' },
  { label: 'Spese del Mese', query: 'Quali spese risultano ancora da saldare questo mese?' }
];

export const FrankCopilot: React.FC<FrankCopilotProps> = ({
  settings,
  chunks,
  ecosystem,
  onNavigateTab,
  onSaveCompaction
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COPILOT);
      return saved ? JSON.parse(saved) : INITIAL_MESSAGES;
    } catch {
      return INITIAL_MESSAGES;
    }
  });

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactionToast, setCompactionToast] = useState<{ title: string; summary: string } | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COPILOT, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Scroll ONLY the inner chat messages container, NEVER the window/page
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading]);

  const handleClearHistory = async () => {
    const hasUserMessages = messages.some(m => m.role === 'user');

    if (!hasUserMessages) {
      setMessages(INITIAL_MESSAGES);
      try {
        localStorage.removeItem(STORAGE_KEY_COPILOT);
      } catch {}
      return;
    }

    setIsCompacting(true);
    try {
      const res = await fetch('/api/chat/compact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.compaction) {
          const docId = `compaction-${Date.now()}`;
          const title = data.compaction.title || 'Sintesi Sessione Chat';
          const content = data.compaction.markdownContent || data.compaction.summary || '';

          const compactionDoc: StoredDocument = {
            id: docId,
            title: `Compaction: ${title}`,
            category: 'Memoria Chat',
            fileType: 'md',
            sizeBytes: new Blob([content]).size,
            uploadedAt: new Date().toISOString(),
            content,
            chunksCount: 0,
            tags: ['compaction', 'memoria-chat', 'copilot']
          };

          if (onSaveCompaction) {
            onSaveCompaction(compactionDoc);
          }

          setCompactionToast({
            title,
            summary: data.compaction.summary || 'Sessione archiviata nel RAG come nuova fonte'
          });
          setTimeout(() => setCompactionToast(null), 6000);
        }
      }
    } catch (err) {
      console.warn('Errore durante la compattazione della chat:', err);
    } finally {
      setIsCompacting(false);
      setMessages(INITIAL_MESSAGES);
      try {
        localStorage.removeItem(STORAGE_KEY_COPILOT);
      } catch {}
    }
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    const userMsg: CopilotMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputQuery('');
    setIsLoading(true);

    try {
      // 1. Ricerca semantica preliminare sui chunks documentali disponibili
      const retrieved = retrieveRelevantChunks(textToSend, chunks, 3);

      // 2. Chiamata al Super Agente con il contesto multi-turno e le fonti trovate
      const res = await fetch('/api/super-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
          sources: retrieved,
          ecosystem
        })
      });

      if (!res.ok) {
        throw new Error(`Errore server HTTP ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: CopilotMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        content: data.text || 'Non sono riuscito a elaborare una risposta.',
        timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        delegations: data.delegations || [],
        modelUsed: data.model || 'Frank Super Agent'
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Errore Frank Copilot:', err);
      const errorMsg: CopilotMessage = {
        id: `msg-err-${Date.now()}`,
        role: 'assistant',
        content: `Mi scuso, si è verificato un errore durante l'interrogazione dei subagenti: ${err.message}. Riprova tra un istante.`,
        timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const getDelegationIcon = (iconName: string) => {
    switch (iconName) {
      case 'FileText': return FileText;
      case 'MailCheck': return MailCheck;
      case 'Calendar': return Calendar;
      case 'CreditCard': return CreditCard;
      default: return Layers;
    }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      {/* 1. Header Bar: Identity & Status */}
      <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-950 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-white shadow-xs shrink-0">
            <Brain className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold tracking-tight text-white truncate">
                Frank Copilot
              </h2>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[10px] text-slate-300 truncate">
              Super Agente Multi-Turn • 4 Reparti
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={isCompacting}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-slate-300 hover:text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-colors disabled:opacity-50"
              title="Compatta e archivia questa conversazione nel RAG, poi avvia una nuova chat"
            >
              {isCompacting ? (
                <>
                  <RotateCw className="w-3 h-3 animate-spin text-amber-300" />
                  <span className="text-amber-200 font-semibold text-[10px]">Compattando...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Nuova</span>
                </>
              )}
            </button>
          )}

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('super-agent')}
              className="p-1 sm:px-2 sm:py-1 rounded-lg text-[11px] font-semibold text-indigo-200 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 transition-colors"
              title="Apri Cockpit Super Agente"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Compaction Toast Notification */}
      {compactionToast && (
        <div className="bg-indigo-950 text-white px-3 py-2 text-[11px] flex items-center justify-between border-b border-indigo-800 animate-fade-in shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm shrink-0">🧠</span>
            <div className="truncate">
              <span className="font-bold text-amber-300">Archiviato nel RAG: </span>
              <span className="font-semibold text-white">{compactionToast.title}</span>
            </div>
          </div>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('docs-rag')}
              className="text-[10px] text-indigo-300 hover:text-white font-semibold underline shrink-0 ml-2"
            >
              Vedi →
            </button>
          )}
        </div>
      )}

      {/* 2. Messages Stream */}
      <div
        ref={chatContainerRef}
        className="p-3 sm:p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0 bg-slate-50/40 text-xs"
      >
        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs ${
                  isUser
                    ? 'bg-slate-900 text-white'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] rounded-2xl p-4 shadow-2xs leading-relaxed ${
                  isUser
                    ? 'bg-slate-900 text-white rounded-tr-xs'
                    : 'bg-white border border-slate-200/90 text-slate-800 rounded-tl-xs'
                }`}
              >
                {/* Visual Delegation Pill (if assistant delegated) */}
                {!isUser && m.delegations && m.delegations.length > 0 && (
                  <div className="mb-3 pb-2 border-b border-slate-100 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      Delega eseguita:
                    </span>
                    {m.delegations.map((del, idx) => {
                      const DelIcon = getDelegationIcon(del.icon);
                      return (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200"
                          title={del.detail}
                        >
                          <DelIcon className="w-3 h-3 text-indigo-600" />
                          <span>{del.name}</span>
                          {del.detail && (
                            <span className="text-indigo-600 text-[9px]">({del.detail})</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Content */}
                <AiMessageRenderer content={m.content} isUser={isUser} />

                {/* Footer timestamp & model */}
                <div
                  className={`mt-2 pt-1 flex items-center justify-between text-[10px] ${
                    isUser ? 'text-slate-400' : 'text-slate-400 border-t border-slate-100'
                  }`}
                >
                  <span>{m.timestamp}</span>
                  {!isUser && m.modelUsed && (
                    <span className="font-mono text-[9px] text-slate-400">
                      {m.modelUsed}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3.5 rounded-2xl rounded-tl-xs bg-white border border-indigo-100 shadow-2xs flex items-center gap-2.5 text-xs text-indigo-800 font-medium">
              <RotateCw className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Frank sta interrogando i subagenti e interpretando la risposta...</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Quick Chips Suggestions */}
      <div className="px-3 py-2 bg-slate-50/80 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-500" />
          Suggeriti:
        </span>
        {SUGGESTED_QUERIES.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(item.query)}
            disabled={isLoading}
            className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 border border-slate-200 hover:border-indigo-200 text-[11px] whitespace-nowrap transition-colors shadow-2xs font-medium disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 4. Input Form */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
        <input
          ref={inputRef}
          type="text"
          placeholder="Chiedi a Frank (es. 'Cosa devo fare oggi?')..."
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          disabled={isLoading}
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-inner"
        />

        <button
          type="submit"
          disabled={!inputQuery.trim() || isLoading}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs shrink-0"
        >
          {isLoading ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span className="hidden xl:inline">Invia</span>
        </button>
      </form>
    </div>
  );
};

