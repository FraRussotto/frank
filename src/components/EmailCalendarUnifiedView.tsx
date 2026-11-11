import React, { useState } from 'react';
import {
  MailCheck,
  Calendar,
  RotateCw,
  Plus,
  Clock,
  Sparkles,
  Search,
  X,
  Copy,
  Check,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { ThreadCard, EmailThreadData } from './ThreadCard';
import { SyncedEvent, EmailAccountType, AppSettings } from '../types';

interface EmailCalendarUnifiedViewProps {
  threads: EmailThreadData[];
  events: SyncedEvent[];
  settings: AppSettings;
  onToggleRequest: (requestId: number, newStatus: 'done' | 'pending') => void;
  onToggleThread: (threadId: string, action: 'done' | 'reopen') => void;
  onToggleHideThread?: (threadId: string, isHidden: boolean) => void;
  onAddEvent: (event: SyncedEvent) => void;
  onDeleteEvent: (id: string) => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const EmailCalendarUnifiedView: React.FC<EmailCalendarUnifiedViewProps> = ({
  threads,
  events,
  settings,
  onToggleRequest,
  onToggleThread,
  onToggleHideThread,
  onAddEvent,
  onDeleteEvent,
  onSync,
  isSyncing
}) => {
  // FilterBar states (replica fedele di FilterBar.jsx)
  const [threadStatusFilter, setThreadStatusFilter] = useState<'pending' | 'done' | 'all' | 'hidden'>('pending');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [sortMode, setSortMode] = useState<'last_at_desc' | 'urgency_desc' | 'deadline_asc'>('last_at_desc');
  const [hideDone, setHideDone] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // AI Draft Reply Modal State
  const [draftModalThread, setDraftModalThread] = useState<EmailThreadData | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftCopied, setDraftCopied] = useState(false);

  // Calendar states & filters
  const [calendarAccount, setCalendarAccount] = useState<'all' | EmailAccountType>('all');
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [showAddEventForm, setShowAddEventForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAccount, setNewAccount] = useState<EmailAccountType>('work');
  const [newDate, setNewDate] = useState('2026-11-12');
  const [newTime, setNewTime] = useState('10:00');
  const [newDuration, setNewDuration] = useState('45m');
  const [newCategory, setNewCategory] = useState<SyncedEvent['category']>('Meeting');

  // Layout switcher
  const [activeLayout, setActiveLayout] = useState<'split' | 'email-only' | 'calendar-only'>('split');

  // Filtraggio thread coerente con DashboardController.php
  const filteredThreads = threads.filter(thread => {
    // 1. Filtro Nascosti / Visibili
    if (threadStatusFilter === 'hidden') {
      if (!thread.is_hidden) return false;
    } else {
      if (thread.is_hidden) return false;

      // 2. Filtro Stato
      if (threadStatusFilter === 'pending') {
        if (!thread.has_requests || thread.pending_count === 0) return false;
      } else if (threadStatusFilter === 'done') {
        if (!thread.has_requests || thread.done_count === 0) return false;
      }

      // 3. Flag Nascondi completati
      if (hideDone && thread.has_requests && thread.pending_count === 0) {
        return false;
      }
    }

    // 4. Filtro Urgenza
    if (urgencyFilter !== 'all') {
      const u = thread.max_urgency;
      if (urgencyFilter === 'high' && u !== 'high' && u !== 'alta') return false;
      if (urgencyFilter === 'medium' && u !== 'medium' && u !== 'media') return false;
      if (urgencyFilter === 'low' && u !== 'low' && u !== 'bassa') return false;
    }

    // 5. Ricerca testuale globale (oggetto, mittenti, richieste, corpo email)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSubject = (thread.subject || '').toLowerCase().includes(q);
      const matchSenders = (thread.senders || []).some(s => 
        (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
      );
      const matchRequests = (thread.requests || []).some(r => (r.summary || '').toLowerCase().includes(q));
      const matchEmails = (thread.emails || []).some(e => 
        (e.body_text || '').toLowerCase().includes(q) || (e.subject || '').toLowerCase().includes(q)
      );
      if (!matchSubject && !matchSenders && !matchRequests && !matchEmails) return false;
    }

    return true;
  });

  // Ordinamento coerente con DashboardController.php
  filteredThreads.sort((a, b) => {
    if (sortMode === 'urgency_desc') {
      const getScore = (u: any) => (u === 'high' || u === 'alta' ? 3 : u === 'medium' || u === 'media' ? 2 : u === 'low' || u === 'bassa' ? 1 : 0);
      const diff = getScore(b.max_urgency) - getScore(a.max_urgency);
      if (diff !== 0) return diff;
      return new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime();
    }
    if (sortMode === 'deadline_asc') {
      if (a.min_deadline && b.min_deadline) {
        return new Date(a.min_deadline).getTime() - new Date(b.min_deadline).getTime();
      }
      if (a.min_deadline) return -1;
      if (b.min_deadline) return 1;
      return new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime();
    }
    // Default: Più recenti
    return new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime();
  });

  const totalVisibleThreads = threads.filter(t => !t.is_hidden).length;
  const pendingThreadsCount = threads.filter(t => !t.is_hidden && t.has_requests && t.pending_count > 0).length;
  const totalPendingRequests = threads
    .filter(t => !t.is_hidden)
    .reduce((sum, t) => sum + (t.pending_count || 0), 0);

  // Calendar separation: upcoming vs past
  const todayStr = new Date().toISOString().split('T')[0];

  const upcomingEvents = events.filter(e => {
    const isFutureOrToday = e.date >= todayStr;
    const matchesAccount = calendarAccount === 'all' || e.account === calendarAccount;
    return isFutureOrToday && matchesAccount;
  });

  const pastEvents = events.filter(e => {
    const isPast = e.date < todayStr;
    const matchesAccount = calendarAccount === 'all' || e.account === calendarAccount;
    return isPast && matchesAccount;
  });

  const displayedEvents = showPastEvents ? pastEvents : upcomingEvents;

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newEv: SyncedEvent = {
      id: `ev-${Date.now()}`,
      account: newAccount,
      accountEmail: newAccount === 'work' ? settings.workEmail : settings.personalEmail,
      title: newTitle.trim(),
      date: newDate,
      time: newTime,
      duration: newDuration,
      category: newCategory
    };

    onAddEvent(newEv);
    setNewTitle('');
    setShowAddEventForm(false);
  };

  const handleOpenDraftModal = (thread: EmailThreadData) => {
    setDraftModalThread(thread);
    setIsDrafting(true);
    setGeneratedDraft('');

    const mainSender = thread.senders[0]?.name || 'Gentile mittente';

    setTimeout(() => {
      setIsDrafting(false);
      const draft = `Gentile ${mainSender},\n\nIn merito alla discussione "${thread.subject}", ti confermo la ricezione e la presa in carico dei punti indicati:\n\n${thread.requests.map(r => `- ${r.summary}`).join('\n')}\n\nTi aggiornerò non appena completate le lavorazioni.\n\nCordiali saluti,\nFrancesco Russotto`;
      setGeneratedDraft(draft);
    }, 500);
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(generatedDraft);
    setDraftCopied(true);
    setTimeout(() => setDraftCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* Top Bar Header & Sync */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Email & Calendario</h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">
              email-ai-agent live
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Aggregazione reale per thread con attività smarcabili, corpi email completi e sincronizzazione Google Calendar.
          </p>
        </div>

        {/* Sync & Layout controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Layout Switcher */}
          <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg text-xs border border-slate-200">
            <button
              onClick={() => setActiveLayout('split')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeLayout === 'split' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Affiancati
            </button>
            <button
              onClick={() => setActiveLayout('email-only')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeLayout === 'email-only' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Solo Email
            </button>
            <button
              onClick={() => setActiveLayout('calendar-only')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeLayout === 'calendar-only' ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Solo Eventi
            </button>
          </div>

          {/* Sync Button */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizzazione in corso...' : 'Sincronizza Ora'}</span>
          </button>
        </div>
      </div>

      {/* Connected Accounts Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-[10px]">
              LAV
            </div>
            <div>
              <span className="font-semibold text-slate-800">Account Lavoro:</span>{' '}
              <span className="text-sky-800 font-mono text-[11px]">{settings.workEmail}</span>
            </div>
          </div>
          <span className="text-[10px] text-sky-700 font-medium">Google Workspace</span>
        </div>

        <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
              PER
            </div>
            <div>
              <span className="font-semibold text-slate-800">Account Personale:</span>{' '}
              <span className="text-emerald-800 font-mono text-[11px]">{settings.personalEmail}</span>
            </div>
          </div>
          <span className="text-[10px] text-emerald-700 font-medium">Gmail Privato</span>
        </div>
      </div>

      {/* Unified 2-Column Content Grid */}
      <div className={`grid gap-6 ${activeLayout === 'split' ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>
        
        {/* Left Column: Email AI Agent Thread Cards (7 cols on split) */}
        {(activeLayout === 'split' || activeLayout === 'email-only') && (
          <div className={`${activeLayout === 'split' ? 'lg:col-span-7' : 'w-full'} space-y-4`}>
            
            {/* Filter Bar (Fedele a FilterBar.jsx) */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
              
              {/* Header & Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MailCheck className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-800">Thread Email</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-semibold">
                    {filteredThreads.length}
                  </span>
                </div>

                {totalPendingRequests > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>{totalPendingRequests} task in attesa</span>
                  </div>
                )}
              </div>

              {/* Controlli Filtri: Cerca, Ordina, Stato, Urgenza & Nascondi completati */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                
                {/* 1. Cerca */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cerca oggetto, mittente, task..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 2. Ordina */}
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="last_at_desc">Più recenti</option>
                  <option value="urgency_desc">Più urgenti</option>
                  <option value="deadline_asc">In scadenza</option>
                </select>

                {/* 3. Stato */}
                <select
                  value={threadStatusFilter}
                  onChange={(e) => setThreadStatusFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="pending">In attesa (con task)</option>
                  <option value="done">Completate</option>
                  <option value="all">Tutte le email</option>
                  <option value="hidden">Nascosti / Ignorati</option>
                </select>

                {/* 4. Urgenza */}
                <select
                  value={urgencyFilter}
                  onChange={(e) => setUrgencyFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium focus:outline-none focus:border-sky-500"
                >
                  <option value="all">Tutte le urgenze</option>
                  <option value="high">Alta urgenza</option>
                  <option value="medium">Media urgenza</option>
                  <option value="low">Bassa urgenza</option>
                </select>
              </div>

              {/* Checkbox "Nascondi completati" */}
              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={hideDone}
                    onChange={(e) => setHideDone(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span>Nascondi thread già completati</span>
                </label>

                <span className="text-[11px] text-slate-400">
                  Mostrati {filteredThreads.length} di {threads.length} thread
                </span>
              </div>
            </div>

            {/* Render Faithful ThreadCards */}
            <div className="space-y-4">
              {filteredThreads.map((thread) => (
                <ThreadCard
                  key={thread.thread_id}
                  thread={thread}
                  onToggleRequest={onToggleRequest}
                  onToggleThread={onToggleThread}
                  onToggleHideThread={onToggleHideThread}
                  onOpenAIDraft={handleOpenDraftModal}
                />
              ))}

              {filteredThreads.length === 0 && (
                <div className="p-12 text-center rounded-xl bg-white border border-dashed border-slate-200 text-slate-400 text-xs space-y-1">
                  <p className="font-semibold text-slate-700 text-sm">Nessun thread trovato</p>
                  <p>Nessuna conversazione corrisponde ai filtri impostati. Prova a selezionare "Tutte le email" o azzerare la ricerca.</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Right Column: Calendar Events (Upcoming events strictly!) */}
        {(activeLayout === 'split' || activeLayout === 'calendar-only') && (
          <div className={`${activeLayout === 'split' ? 'lg:col-span-5' : 'w-full'} space-y-4`}>
            
            {/* Section Header */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {showPastEvents ? 'Archivio Eventi Passati' : 'Prossimi Eventi'}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                  {displayedEvents.length}
                </span>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setShowPastEvents(!showPastEvents)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    showPastEvents
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title="Mostra gli eventi archiviati/passati"
                >
                  {showPastEvents ? 'Vedi Prossimi' : 'Vedi Passati'}
                </button>

                <button
                  onClick={() => setShowAddEventForm(!showAddEventForm)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddEventForm ? 'Chiudi' : 'Nuovo'}</span>
                </button>
              </div>
            </div>

            {/* Account Filter Pills */}
            <div className="flex items-center space-x-1.5 text-xs">
              <button
                onClick={() => setCalendarAccount('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  calendarAccount === 'all' ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 bg-white border border-slate-200'
                }`}
              >
                Tutti ({showPastEvents ? pastEvents.length : upcomingEvents.length})
              </button>
              <button
                onClick={() => setCalendarAccount('work')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  calendarAccount === 'work' ? 'bg-sky-50 text-sky-800 border border-sky-300 font-semibold' : 'text-slate-600 bg-white border border-slate-200'
                }`}
              >
                Lavoro ({displayedEvents.filter(e => e.account === 'work').length})
              </button>
              <button
                onClick={() => setCalendarAccount('personal')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  calendarAccount === 'personal' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold' : 'text-slate-600 bg-white border border-slate-200'
                }`}
              >
                Personale ({displayedEvents.filter(e => e.account === 'personal').length})
              </button>
            </div>

            {/* Add Event Form Toggle */}
            {showAddEventForm && (
              <form onSubmit={handleCreateEvent} className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Aggiungi Evento</div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Titolo Evento</label>
                  <input
                    type="text"
                    placeholder="es. Allineamento release Pimcore"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Account</label>
                    <select
                      value={newAccount}
                      onChange={(e) => setNewAccount(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                    >
                      <option value="work">Lavoro (LAV)</option>
                      <option value="personal">Personale (PER)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Data</label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Ora</label>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Durata</label>
                    <input
                      type="text"
                      placeholder="es. 45m o 1h"
                      value={newDuration}
                      onChange={(e) => setNewDuration(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddEventForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                  >
                    Salva
                  </button>
                </div>
              </form>
            )}

            {/* Events List with Calendar Badge */}
            <div className="rounded-xl bg-white border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {displayedEvents.map((ev) => {
                const isWork = ev.account === 'work';
                const dateObj = new Date(ev.date);
                const dayNum = isNaN(dateObj.getDate()) ? '—' : dateObj.getDate();
                const monthStr = isNaN(dateObj.getTime())
                  ? ''
                  : dateObj.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '').toUpperCase();

                return (
                  <div
                    key={ev.id}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex items-center space-x-3 truncate mr-2">
                      <div className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border text-center shadow-xs ${
                        isWork
                          ? 'border-sky-200 bg-sky-50/70 text-sky-900'
                          : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                      }`}>
                        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
                          {monthStr}
                        </span>
                        <span className="text-xs font-extrabold leading-none text-slate-900">
                          {dayNum}
                        </span>
                      </div>

                      <div className="truncate">
                        <div className="flex items-center space-x-1.5">
                          <span className={`text-[9px] font-bold px-1 rounded ${
                            isWork ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {isWork ? 'LAV' : 'PER'}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 truncate">{ev.title}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{ev.date} alle {ev.time}</span>
                          </span>
                          <span>•</span>
                          <span>{ev.duration}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onDeleteEvent(ev.id)}
                      className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                    >
                      Rimuovi
                    </button>
                  </div>
                );
              })}

              {displayedEvents.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs">
                  {showPastEvents
                    ? 'Nessun evento passato registrato.'
                    : 'Nessun evento futuro in programma. Clicca su "+ Nuovo" per aggiungerne uno!'}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* AI Draft Reply Modal */}
      {draftModalThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden space-y-4 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Bozza Risposta AI (Thread)</h3>
              </div>
              <button
                onClick={() => setDraftModalThread(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
              <div><b>A:</b> {draftModalThread.senders.map(s => `${s.name} (${s.email})`).join(', ')}</div>
              <div><b>Oggetto:</b> Re: {draftModalThread.subject}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Testo della Bozza Generata:</label>
              {isDrafting ? (
                <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <span className="animate-spin text-sky-600">●</span>
                  <span>Generazione risposta AI in corso...</span>
                </div>
              ) : (
                <textarea
                  rows={8}
                  value={generatedDraft}
                  onChange={(e) => setGeneratedDraft(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-sans focus:outline-none focus:border-sky-500 focus:bg-white leading-relaxed"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={handleCopyDraft}
                disabled={isDrafting}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
              >
                {draftCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{draftCopied ? 'Copiato!' : 'Copia Risposta'}</span>
              </button>

              <button
                onClick={() => setDraftModalThread(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
