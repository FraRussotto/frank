import React, { useState, useEffect } from 'react';
import { FlatNavbar } from './components/FlatNavbar';
import { OverviewView } from './components/OverviewView';
import { ExpensesView } from './components/ExpensesView';
import { EmailCalendarUnifiedView } from './components/EmailCalendarUnifiedView';
import { EmailThreadData } from './components/ThreadCard';
import { RagDocsView } from './components/RagDocsView';
import { SuperAgentView } from './components/SuperAgentView';
import { FlatSettingsModal } from './components/FlatSettingsModal';
import {
  INITIAL_FIXED_EXPENSES,
  INITIAL_SYNCED_EVENTS,
  INITIAL_EMAIL_REQUESTS,
  INITIAL_DOCUMENTS
} from './data/mockData';
import {
  FixedExpense,
  SyncedEvent,
  EmailAIRequest,
  StoredDocument,
  DocumentChunk,
  AppSettings,
  AgentWorkerStatus,
  SuperAgentStatus
} from './types';
import { chunkText } from './services/ragEngine';

const STORAGE_KEYS = {
  EXPENSES: 'sb_expenses_v3',
  EVENTS: 'sb_events_v3',
  REQUESTS: 'sb_requests_v3',
  DOCS: 'sb_docs_v3',
  SETTINGS: 'sb_settings_v3',
  SHOW_EXPENSES: 'sb_show_expenses_v3'
};

const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  selectedModel: 'smart-local',
  workEmail: 'f.russotto@arteficegroup.com',
  personalEmail: 'francesco.russo@gmail.com',
  lastSyncTime: 'Mai sincronizzato'
};

function isIgnoredEventTitle(title: string): boolean {
  const t = (title || '').trim().toLowerCase();
  if (t === 'home' || t === 'office') return true;
  if (t.includes('call settimanale area sviluppo it') || t.includes('idia - perniceni')) return true;
  return false;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'super-agent' | 'expenses' | 'email-calendar' | 'docs-rag'>('overview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentWorkerStatus | null>(null);
  const [superAgentStatus, setSuperAgentStatus] = useState<SuperAgentStatus | null>(null);
  const [isOrchestrating, setIsOrchestrating] = useState(false);

  const [showExpenses, setShowExpenses] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SHOW_EXPENSES);
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Expenses
  const [expenses, setExpenses] = useState<FixedExpense[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      return saved ? JSON.parse(saved) : INITIAL_FIXED_EXPENSES;
    } catch {
      return INITIAL_FIXED_EXPENSES;
    }
  });

  // Events (2 accounts)
  const [events, setEvents] = useState<SyncedEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EVENTS);
      const parsed = saved ? JSON.parse(saved) : INITIAL_SYNCED_EVENTS;
      return parsed.filter((e: SyncedEvent) => !isIgnoredEventTitle(e.title));
    } catch {
      return INITIAL_SYNCED_EVENTS;
    }
  });

  // Email AI Requests
  const [requests, setRequests] = useState<EmailAIRequest[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.REQUESTS);
      return saved ? JSON.parse(saved) : INITIAL_EMAIL_REQUESTS;
    } catch {
      return INITIAL_EMAIL_REQUESTS;
    }
  });

  // Threads fedeli a email-ai-agent
  const [threads, setThreads] = useState<EmailThreadData[]>([]);

  // Documents
  const [documents, setDocuments] = useState<StoredDocument[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DOCS);
      return saved ? JSON.parse(saved) : INITIAL_DOCUMENTS;
    } catch {
      return INITIAL_DOCUMENTS;
    }
  });

  // Derived Chunks
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);

  useEffect(() => {
    const list: DocumentChunk[] = [];
    documents.forEach(doc => {
      const generated = chunkText(doc.id, doc.title, doc.content, 400, 60);
      list.push(...generated);
    });
    setChunks(list);
  }, [documents]);

  // Caricamento Dati Reali dal database SQLite di email-ai-agent
  const fetchLiveData = async () => {
    try {
      const res = await fetch('/api/live-data');
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          if (data.user?.email) {
            setSettings(prev => ({ ...prev, workEmail: data.user.email }));
          }
          if (data.agentStatus) {
            setAgentStatus(data.agentStatus);
          }
          if (data.superAgentStatus) {
            setSuperAgentStatus(data.superAgentStatus);
          }
          if (Array.isArray(data.threads) && data.threads.length > 0) {
            setThreads(data.threads);
            // Se l'Agente Frank ha verificato task attivi, usa prioritariamente quelli per l'Overview
            if (Array.isArray(data.agentTasks) && data.agentTasks.length > 0) {
              setRequests(data.agentTasks);
            } else {
              // Fallback sulla lista di richieste aggregate se l'agente sta ancora completando l'analisi
              const allReqs: EmailAIRequest[] = [];
              data.threads.forEach((t: EmailThreadData) => {
                if (!t.is_hidden) {
                  t.requests.forEach(r => {
                    allReqs.push({
                      id: String(r.id),
                      sender: t.senders[0]?.name || 'Mittente',
                      senderEmail: t.senders[0]?.email || '',
                      subject: t.subject,
                      summary: r.summary,
                      urgency: (r.urgency === 'high' || r.urgency === 'alta') ? 'alta' : (r.urgency === 'low' || r.urgency === 'bassa') ? 'bassa' : 'media',
                      deadline: r.deadline || undefined,
                      status: r.status === 'done' ? 'completed' : 'pending',
                      receivedAt: t.last_at
                    });
                  });
                }
              });
              if (allReqs.length > 0) {
                setRequests(allReqs);
              }
            }
          } else if (Array.isArray(data.requests) && data.requests.length > 0) {
            setRequests(data.requests);
          }

          if (Array.isArray(data.upcomingEvents) && data.upcomingEvents.length > 0) {
            // Esclude eventi ignorati (home, office, duplicati call Perniceni)
            const cleanedWorkEvents = data.upcomingEvents.filter((e: SyncedEvent) => !isIgnoredEventTitle(e.title));
            // Combina gli eventi reali di lavoro con eventuali eventi personali
            setEvents(prev => {
              const personalEvents = prev.filter(e => e.account === 'personal');
              return [...cleanedWorkEvents, ...personalEvents];
            });
          }
          console.log(`Caricati ${data.threads?.length || 0} thread reali e ${data.upcomingEvents?.length || 0} eventi futuri dal DB SQLite.`);
        }
      }
    } catch (err) {
      console.warn('Backend API bridge non disponibile o statico:', err);
    }
  };

  useEffect(() => {
    fetchLiveData();

    // Auto-refresh silenzioso ogni 60 secondi per mantenere la UI aggiornata
    const interval = setInterval(() => {
      fetchLiveData();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
    // Sincronizza istantaneamente con il Subagente Spese & Finanze nel backend
    fetch('/api/expenses/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenses })
    })
      .then(res => res.json())
      .then(data => {
        if (data.status) {
          setSuperAgentStatus(data.status);
        }
      })
      .catch(err => console.warn('Errore sync spese verso subagente:', err));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SHOW_EXPENSES, JSON.stringify(showExpenses));
  }, [showExpenses]);

  // Handlers Spese
  const handleToggleExpensePaid = (id: string) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, isPaid: !e.isPaid } : e));
  };

  const handleAddExpense = (newExp: FixedExpense) => {
    setExpenses(prev => [newExp, ...prev]);
  };

  const handleUpdateExpense = (updated: FixedExpense) => {
    setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const handleClearAllExpenses = () => {
    setExpenses([]);
  };

  // Handlers Eventi
  const handleAddEvent = (newEv: SyncedEvent) => {
    setEvents(prev => [newEv, ...prev]);
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  // Handlers Richieste Email AI & Thread
  const handleToggleRequest = async (requestId: any, newStatus: 'done' | 'pending') => {
    // Aggiorna threads in locale
    setThreads(prev => prev.map(t => ({
      ...t,
      requests: t.requests.map(r => String(r.id) === String(requestId) ? { ...r, status: newStatus } : r)
    })));

    // Aggiorna requests compatibili per Overview
    setRequests(prev => prev.map(r => String(r.id) === String(requestId) ? {
      ...r,
      status: newStatus === 'done' ? 'completed' : 'pending'
    } : r));

    // Notifica backend SQLite se id numerico
    if (typeof requestId === 'number' || !isNaN(Number(requestId))) {
      try {
        await fetch('/api/toggle-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: Number(requestId), newStatus })
        });
      } catch (err) {
        console.error('Errore toggle request:', err);
      }
    }
  };

  const handleToggleThread = async (threadId: string, action: 'done' | 'reopen') => {
    const targetStatus = action === 'done' ? 'done' : 'pending';

    setThreads(prev => prev.map(t => {
      if (t.thread_id === threadId) {
        return {
          ...t,
          requests: t.requests.map(r => ({ ...r, status: targetStatus }))
        };
      }
      return t;
    }));

    const targetThread = threads.find(t => t.thread_id === threadId);
    if (targetThread) {
      const targetReqIds = new Set(targetThread.requests.map(r => String(r.id)));
      setRequests(prev => prev.map(r => targetReqIds.has(r.id) ? {
        ...r,
        status: targetStatus === 'done' ? 'completed' : 'pending'
      } : r));
    }

    try {
      await fetch('/api/toggle-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, action })
      });
    } catch (err) {
      console.error('Errore toggle thread:', err);
    }
  };

  const handleToggleHideThread = async (threadId: string, isHidden: boolean) => {
    setThreads(prev => prev.map(t => t.thread_id === threadId ? { ...t, is_hidden: isHidden } : t));
    try {
      await fetch('/api/hide-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, isHidden })
      });
    } catch (err) {
      console.error('Errore hide thread:', err);
    }
  };

  const handleToggleRequestStatus = async (id: string) => {
    const numId = parseInt(id, 10);
    const target = requests.find(r => r.id === id);
    if (!target) return;
    const newStatus = target.status === 'pending' ? 'done' : 'pending';
    if (!isNaN(numId)) {
      await handleToggleRequest(numId, newStatus);
    } else {
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: target.status === 'pending' ? 'completed' : 'pending' } : r));
    }
  };

  // Handlers Documenti
  const handleUploadDocument = (doc: StoredDocument) => {
    setDocuments(prev => [doc, ...prev]);
  };

  const handleDeleteDocument = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  };

  // Sincronizzazione REALE ultra-rapida asincrona (replica fedele di StatusBar.jsx)
  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncToast({
      text: "Sincronizzazione rapida con Google in corso...",
      type: 'info'
    });

    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const nowStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

      if (res.ok) {
        // Ricarica subito i dati aggiornati
        await fetchLiveData();
        setSettings(prev => ({ ...prev, lastSyncTime: `Oggi alle ${nowStr}` }));
        setSyncToast({
          text: `✓ Sincronizzato con successo!`,
          type: 'success'
        });

        // Controlli silenziosi di follow-up in background (dopo 3s e 7s) per recuperare eventuali task completati dall'AI
        setTimeout(() => fetchLiveData(), 3000);
        setTimeout(() => fetchLiveData(), 7000);
      } else {
        setSyncToast({
          text: `Sincronizzazione completata alle ${nowStr}`,
          type: 'info'
        });
      }
    } catch (e: any) {
      setSyncToast({
        text: `Errore sincronizzazione: ${e?.message || 'verifica server'}`,
        type: 'error'
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 3000);
    }
  };

  // Handlers Frank Super Agente
  const handleOrchestrateAll = async () => {
    setIsOrchestrating(true);
    try {
      const res = await fetch('/api/super-agent/run-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setSuperAgentStatus(data.status);
        }
      }
      await fetchLiveData();
    } catch (e) {
      console.error('Errore orchestrazione subagenti:', e);
    } finally {
      setIsOrchestrating(false);
    }
  };

  const handleRunSubagent = async (subagentId: string) => {
    try {
      const res = await fetch('/api/super-agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subagentId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status) {
          setSuperAgentStatus(data.status);
        }
      }
      await fetchLiveData();
    } catch (e) {
      console.error('Errore esecuzione subagente:', e);
    }
  };

  const handleGenerateBriefing = async () => {
    setIsOrchestrating(true);
    try {
      const res = await fetch('/api/super-agent/briefing/generate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.briefing && superAgentStatus) {
          setSuperAgentStatus({ ...superAgentStatus, latestBriefing: data.briefing });
        }
      }
    } catch (e) {
      console.error('Errore rigenerazione briefing:', e);
    } finally {
      setIsOrchestrating(false);
    }
  };

  const handleResetData = () => {
    if (window.confirm("Vuoi ripristinare tutti i dati predefiniti?")) {
      localStorage.clear();
      setExpenses(INITIAL_FIXED_EXPENSES);
      setEvents(INITIAL_SYNCED_EVENTS);
      setRequests(INITIAL_EMAIL_REQUESTS);
      setDocuments(INITIAL_DOCUMENTS);
      setSettings(DEFAULT_SETTINGS);
      setShowExpenses(true);
      setIsSettingsOpen(false);
      fetchLiveData();
    }
  };

  const unpaidCount = expenses.filter(e => !e.isPaid).length;
  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-sky-100 selection:text-sky-900">
      
      {/* Toast Notification (Soft Pastel) */}
      {syncToast && (
        <div className="fixed top-16 right-4 z-50 bg-white border border-slate-200/90 text-xs px-4 py-2.5 rounded-xl shadow-xl text-slate-800 animate-fade-in flex items-center space-x-2.5">
          <span className={`w-2 h-2 rounded-full inline-block ${syncToast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="font-medium">{syncToast.text}</span>
        </div>
      )}

      {/* Flat Navbar */}
      <FlatNavbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSyncAll={handleSyncAll}
        isSyncing={isSyncing}
        settings={settings}
        unpaidExpensesCount={showExpenses ? unpaidCount : 0}
        pendingRequestsCount={pendingRequestsCount}
        showExpenses={showExpenses}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <OverviewView
            expenses={showExpenses ? expenses : []}
            events={events}
            requests={requests}
            documents={documents}
            chunks={chunks}
            settings={settings}
            showExpenses={showExpenses}
            agentStatus={agentStatus}
            superAgentStatus={superAgentStatus}
            onNavigateTab={setActiveTab}
            onToggleExpensePaid={handleToggleExpensePaid}
            onToggleRequestStatus={handleToggleRequestStatus}
            onSyncAll={handleSyncAll}
            isSyncing={isSyncing}
          />
        )}

        {/* Super Agente Coordinator Tab */}
        {activeTab === 'super-agent' && (
          <SuperAgentView
            status={superAgentStatus}
            onRefreshAll={handleOrchestrateAll}
            onRunSubagent={handleRunSubagent}
            onGenerateBriefing={handleGenerateBriefing}
            onNavigateTab={setActiveTab}
            isOrchestrating={isOrchestrating}
          />
        )}

        {activeTab === 'expenses' && showExpenses && (
          <ExpensesView
            expenses={expenses}
            onAddExpense={handleAddExpense}
            onUpdateExpense={handleUpdateExpense}
            onTogglePaid={handleToggleExpensePaid}
            onDeleteExpense={handleDeleteExpense}
            onClearAllExpenses={handleClearAllExpenses}
            showExpenses={showExpenses}
            onToggleShowExpenses={() => setShowExpenses(!showExpenses)}
          />
        )}

        {/* Unified Email & Calendar Tab */}
        {activeTab === 'email-calendar' && (
          <EmailCalendarUnifiedView
            threads={threads}
            events={events}
            settings={settings}
            onToggleRequest={handleToggleRequest}
            onToggleThread={handleToggleThread}
            onToggleHideThread={handleToggleHideThread}
            onAddEvent={handleAddEvent}
            onDeleteEvent={handleDeleteEvent}
            onSync={handleSyncAll}
            isSyncing={isSyncing}
          />
        )}

        {activeTab === 'docs-rag' && (
          <RagDocsView
            documents={documents}
            chunks={chunks}
            settings={settings}
            ecosystem={{
              expenses,
              events,
              requests,
              documents,
              todayStr: new Date().toISOString().split('T')[0]
            }}
            onUploadDocument={handleUploadDocument}
            onDeleteDocument={handleDeleteDocument}
          />
        )}
      </main>

      {/* Settings Modal */}
      <FlatSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={setSettings}
        onResetData={handleResetData}
      />

    </div>
  );
};
