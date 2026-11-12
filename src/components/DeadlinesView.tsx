import React, { useState, useEffect } from 'react';
import {
  Clock,
  CalendarCheck,
  AlertTriangle,
  Plus,
  RotateCw,
  Search,
  CheckCircle2,
  Circle,
  Trash2,
  FileText,
  MailCheck,
  Calendar,
  CreditCard,
  Layers,
  Sparkles,
  ChevronDown,
  X,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { DeadlineItem, DeadlineCategory, DeadlinePriority, DeadlineStatus, UpcomingDeadlinesSummary } from '../types';

interface DeadlinesViewProps {
  onNavigateTab?: (tab: 'overview' | 'super-agent' | 'expenses' | 'email-calendar' | 'docs-rag') => void;
}

export const DeadlinesView: React.FC<DeadlinesViewProps> = ({ onNavigateTab }) => {
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [summary, setSummary] = useState<UpcomingDeadlinesSummary>({
    overdue: [],
    today: [],
    dueSoon: [],
    future: [],
    totalPending: 0,
    highPriorityCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [formCategory, setFormCategory] = useState<DeadlineCategory>('manuale');
  const [formPriority, setFormPriority] = useState<DeadlinePriority>('media');
  const [formDaysNotice, setFormDaysNotice] = useState<number>(3);
  const [formAmount, setFormAmount] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchDeadlines = async () => {
    try {
      const res = await fetch('/api/deadlines?scope=personal');
      if (res.ok) {
        const data = await res.json();
        if (data.deadlines) setDeadlines(data.deadlines);
        if (data.summary) setSummary(data.summary);
      }
    } catch (err) {
      console.warn('Errore fetch deadlines:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeadlines();
  }, []);

  const handleSyncWithSubagents = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/deadlines/sync', { method: 'POST' });
      if (res.ok) {
        // Dopo la scansione generale, ricarica solo l'area personale
        await fetchDeadlines();
        showToast('Scadenziario personale aggiornato con Frank!');
      }
    } catch (err) {
      console.error('Errore sync deadlines:', err);
      showToast('Errore durante la scansione delle scadenze');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleStatus = async (item: DeadlineItem) => {
    const newStatus: DeadlineStatus = item.status === 'completed' ? 'pending' : 'completed';
    try {
      const res = await fetch('/api/deadlines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, updates: { status: newStatus } })
      });
      if (res.ok) {
        await fetchDeadlines();
        showToast(newStatus === 'completed' ? 'Attività segnata come completata!' : 'Attività riaperta');
      }
    } catch (err) {
      console.error('Errore update status:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Vuoi davvero rimuovere questa scadenza?')) return;
    try {
      const res = await fetch(`/api/deadlines?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchDeadlines();
        showToast('Scadenza eliminata');
      }
    } catch (err) {
      console.error('Errore delete deadline:', err);
    }
  };

  const handleCreateDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDueDate) return;

    try {
      const res = await fetch('/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim(),
          dueDate: formDueDate,
          category: formCategory,
          priority: formPriority,
          scope: 'personal',
          daysNotice: Number(formDaysNotice),
          amount: formAmount ? parseFloat(formAmount) : undefined,
          source: 'Personale'
        })
      });

      if (res.ok) {
        await fetchDeadlines();
        setIsModalOpen(false);
        setFormTitle('');
        setFormDescription('');
        setFormAmount('');
        showToast('Nuova scadenza personale registrata!');
      }
    } catch (err) {
      console.error('Errore create deadline:', err);
      showToast('Errore durante la creazione');
    }
  };

  const getCategoryIcon = (cat: DeadlineCategory) => {
    switch (cat) {
      case 'pagamento': return <CreditCard className="w-4 h-4 text-rose-600" />;
      case 'casa_utenze': return <Layers className="w-4 h-4 text-sky-600" />;
      case 'burocrazia': return <ShieldAlert className="w-4 h-4 text-amber-600" />;
      case 'documento': return <FileText className="w-4 h-4 text-purple-600" />;
      default: return <Clock className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getCategoryLabel = (cat: DeadlineCategory) => {
    switch (cat) {
      case 'pagamento': return 'Spese & Pagamenti';
      case 'casa_utenze': return 'Casa & Utenze';
      case 'burocrazia': return 'Fisco & Burocrazia';
      case 'documento': return 'Documenti Personali';
      default: return 'Altro Personale';
    }
  };

  // Filtraggio lista
  const filteredDeadlines = deadlines.filter((d) => {
    // Filtro status
    if (selectedStatus === 'pending' && d.status !== 'pending') return false;
    if (selectedStatus === 'completed' && d.status !== 'completed') return false;
    if (selectedStatus === 'due_soon' && d.urgencyStatus !== 'due_soon' && d.urgencyStatus !== 'today' && d.urgencyStatus !== 'overdue') return false;

    // Filtro categoria
    if (selectedCategory !== 'all' && d.category !== selectedCategory) return false;

    // Filtro testo
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = d.title.toLowerCase().includes(q);
      const matchDesc = (d.description || '').toLowerCase().includes(q);
      const matchSource = (d.source || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchSource) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-fade-in">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-amber-500 flex items-center justify-center text-white shadow-xs">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                Scadenze
                <span className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  Vita Personale
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Il registro preventivo delle scadenze personali: spese, utenze, fisco, scadenze documenti e adempimenti privati.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleSyncWithSubagents}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-50"
            title="Frank interroga Email, Calendario, Finanze e Documenti per scansionare nuove scadenze"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isSyncing ? 'Scansione in corso...' : 'Sincronizza con Frank'}</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuova Scadenza</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Panoramica Scadenze */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scadute / In scadenza oggi */}
        <div
          onClick={() => setSelectedStatus('due_soon')}
          className="p-4 rounded-xl bg-white border border-rose-200/90 shadow-2xs cursor-pointer hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800">Scadono a Breve</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-900">
              {summary.today.length + summary.dueSoon.length + summary.overdue.length}
            </span>
            <span className="text-[11px] text-rose-700 font-medium">
              ({summary.today.length} oggi, {summary.dueSoon.length} entro 72h)
            </span>
          </div>
          <p className="text-[11px] text-rose-700/80 mt-1">Richiedono attenzione immediata</p>
        </div>

        {/* Totale Cose da Fare */}
        <div
          onClick={() => setSelectedStatus('pending')}
          className="p-4 rounded-xl bg-white border border-indigo-200/90 shadow-2xs cursor-pointer hover:border-indigo-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-800">Attività Aperte</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-900">{summary.totalPending}</span>
            <span className="text-[11px] text-indigo-700 font-medium">in carico a Frank</span>
          </div>
          <p className="text-[11px] text-indigo-700/80 mt-1">
            {summary.highPriorityCount} ad alta priorità
          </p>
        </div>

        {/* Future */}
        <div
          onClick={() => setSelectedStatus('pending')}
          className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs cursor-pointer hover:border-slate-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Programmate Future</span>
            <Calendar className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{summary.future.length}</span>
            <span className="text-[11px] text-slate-500 font-medium">oltre preavviso</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Sotto monitoraggio automatico</p>
        </div>

        {/* Completate */}
        <div
          onClick={() => setSelectedStatus('completed')}
          className="p-4 rounded-xl bg-white border border-emerald-200/90 shadow-2xs cursor-pointer hover:border-emerald-400 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800">Archiviate / Chiuse</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-900">
              {deadlines.filter(d => d.status === 'completed').length}
            </span>
            <span className="text-[11px] text-emerald-700 font-medium">completate</span>
          </div>
          <p className="text-[11px] text-emerald-700/80 mt-1">Storico attività eseguite</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cerca per titolo, fonte o descrizione..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto text-xs">
            <button
              onClick={() => setSelectedStatus('pending')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                selectedStatus === 'pending' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Da Fare ({summary.totalPending})
            </button>
            <button
              onClick={() => setSelectedStatus('due_soon')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                selectedStatus === 'due_soon' ? 'bg-rose-50 text-rose-900 font-bold border border-rose-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              In Scadenza ({summary.today.length + summary.dueSoon.length + summary.overdue.length})
            </button>
            <button
              onClick={() => setSelectedStatus('completed')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                selectedStatus === 'completed' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Completate
            </button>
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                selectedStatus === 'all' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tutte
            </button>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
            Categoria:
          </span>
          {[
            { id: 'all', label: 'Tutte' },
            { id: 'pagamento', label: 'Spese & Pagamenti' },
            { id: 'casa_utenze', label: 'Casa & Utenze' },
            { id: 'burocrazia', label: 'Fisco & Burocrazia' },
            { id: 'documento', label: 'Documenti Personali' },
            { id: 'manuale', label: 'Altro Personale' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RotateCw className="w-5 h-5 animate-spin text-indigo-600" />
            <span className="text-xs">Caricamento registro scadenze...</span>
          </div>
        ) : filteredDeadlines.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-semibold text-slate-700">Nessuna scadenza trovata con questi filtri</p>
            <p className="text-xs text-slate-400 mt-1">
              Clicca su "Sincronizza con Frank" per analizzare tutti i subagenti o inseriscine una nuova.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDeadlines.map((item) => {
              const isCompleted = item.status === 'completed';
              const isOverdue = (item.daysRemaining ?? 0) < 0;
              const isToday = item.daysRemaining === 0;
              const isDueSoon = (item.daysRemaining ?? 0) > 0 && (item.daysRemaining ?? 0) <= item.daysNotice;

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 flex items-start gap-3.5 transition-colors ${
                    isCompleted ? 'bg-slate-50/50 opacity-60' : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* Checkbox toggle */}
                  <button
                    onClick={() => handleToggleStatus(item)}
                    className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors shrink-0"
                    title={isCompleted ? 'Riapri attività' : 'Segna come completata'}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-300 hover:text-slate-500" />
                    )}
                  </button>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {/* Categoria Badge */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {getCategoryIcon(item.category)}
                        {getCategoryLabel(item.category)}
                      </span>

                      {/* Priorità Badge */}
                      {item.priority === 'alta' && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          ALTA PRIORITÀ
                        </span>
                      )}

                      {/* Countdown Badge */}
                      {!isCompleted && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight inline-flex items-center gap-1 ${
                            isOverdue
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : isToday
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                              : isDueSoon
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {isOverdue
                            ? `Scaduto (${Math.abs(item.daysRemaining!)} gg fa)`
                            : isToday
                            ? 'SCADE OGGI'
                            : item.daysRemaining === 1
                            ? 'Entro Domani'
                            : `Tra ${item.daysRemaining} giorni`}
                        </span>
                      )}

                      {/* Data Limite Formattata */}
                      <span className="text-[11px] font-mono text-slate-400">
                        Scadenza: {item.dueDate}
                      </span>
                    </div>

                    {/* Titolo */}
                    <h3
                      className={`text-sm font-semibold tracking-tight ${
                        isCompleted ? 'line-through text-slate-500' : 'text-slate-900'
                      }`}
                    >
                      {item.title}
                    </h3>

                    {/* Descrizione / Ragione */}
                    {item.description && (
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    {/* Fonte e dettagli */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      <span>Fonte: <strong className="text-slate-600 font-medium">{item.source}</strong></span>
                      {item.amount !== undefined && item.amount !== null && (
                        <span>Importo: <strong className="text-slate-700 font-bold">€{item.amount.toFixed(2)}</strong></span>
                      )}
                      <span>Preavviso: {item.daysNotice} giorni prima</span>
                      {isCompleted && item.completedAt && (
                        <span className="text-emerald-600 font-medium">
                          Completata il {new Date(item.completedAt).toLocaleDateString('it-IT')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="Elimina"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Inserimento Nuova Scadenza */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Registra Nuova Scadenza</h3>
                  <p className="text-[11px] text-slate-500">Aggiungi un'attività con data limite o adempimento</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDeadline} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cosa c'è da fare? (Titolo) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Inviare riscontro bando, Rinnovo SPID, Saldare fattura..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dettagli o Note aggiuntive
                </label>
                <textarea
                  rows={2}
                  placeholder="Contesto, note o documenti di riferimento..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data di Scadenza *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoria
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as DeadlineCategory)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="pagamento">Spese & Pagamenti personali</option>
                    <option value="casa_utenze">Casa & Utenze</option>
                    <option value="burocrazia">Fisco & Burocrazia</option>
                    <option value="documento">Documenti Personali</option>
                    <option value="manuale">Altro Personale</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priorità
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as DeadlinePriority)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="bassa">Bassa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preavviso (gg prima)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={formDaysNotice}
                    onChange={(e) => setFormDaysNotice(parseInt(e.target.value) || 3)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Importo € (opz.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs"
                >
                  Salva Scadenza
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

