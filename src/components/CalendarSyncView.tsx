import React, { useState } from 'react';
import { Plus, Clock, Briefcase, User, RotateCw } from 'lucide-react';
import { SyncedEvent, EmailAccountType, AppSettings } from '../types';

interface CalendarSyncViewProps {
  events: SyncedEvent[];
  settings: AppSettings;
  onAddEvent: (event: SyncedEvent) => void;
  onDeleteEvent: (id: string) => void;
  onSync: () => void;
  isSyncing: boolean;
}

export const CalendarSyncView: React.FC<CalendarSyncViewProps> = ({
  events,
  settings,
  onAddEvent,
  onDeleteEvent,
  onSync,
  isSyncing
}) => {
  const [selectedAccount, setSelectedAccount] = useState<'all' | EmailAccountType>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [account, setAccount] = useState<EmailAccountType>('work');
  const [date, setDate] = useState('2026-11-12');
  const [time, setTime] = useState('11:00');
  const [duration, setDuration] = useState('45m');
  const [category, setCategory] = useState<SyncedEvent['category']>('Meeting');

  const filteredEvents = events.filter(ev => {
    if (selectedAccount === 'all') return true;
    return ev.account === selectedAccount;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newEv: SyncedEvent = {
      id: `ev-${Date.now()}`,
      account,
      accountEmail: account === 'work' ? settings.workEmail : settings.personalEmail,
      title: title.trim(),
      date,
      time,
      duration,
      category
    };

    onAddEvent(newEv);
    setTitle('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Header & Sync Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Sincronizzazione Eventi (2 Account)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Vista unificata del calendario e impegni da <b>{settings.workEmail}</b> e <b>{settings.personalEmail}</b>.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
            <span>{isSyncing ? 'Sincronizzazione...' : 'Sincronizza Adesso'}</span>
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuovo Evento</span>
          </button>
        </div>
      </div>

      {/* Account Info Bar (Flat Pastel) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-100/90 shadow-xs flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-900">Account Lavoro</div>
              <div className="text-[11px] text-sky-800 font-mono">{settings.workEmail}</div>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white text-sky-800 border border-sky-200 font-medium">
            Connesso (Google)
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100/90 shadow-xs flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-900">Account Personale</div>
              <div className="text-[11px] text-emerald-800 font-mono">{settings.personalEmail}</div>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white text-emerald-800 border border-emerald-200 font-medium">
            Connesso (Gmail)
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setSelectedAccount('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedAccount === 'all'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          Tutti gli Eventi ({events.length})
        </button>

        <button
          onClick={() => setSelectedAccount('work')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedAccount === 'work'
              ? 'bg-sky-50 text-sky-800 border border-sky-300 font-semibold'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
          <span>Solo Lavoro ({events.filter(e => e.account === 'work').length})</span>
        </button>

        <button
          onClick={() => setSelectedAccount('personal')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedAccount === 'personal'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          <span>Solo Personale ({events.filter(e => e.account === 'personal').length})</span>
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
          <div className="text-xs font-semibold text-slate-800 uppercase tracking-wider">Aggiungi Evento</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-600 mb-1">Titolo Evento / Impegno</label>
              <input
                type="text"
                placeholder="es. Allineamento release Pimcore"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Account di Destinazione</label>
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              >
                <option value="work">Lavoro ({settings.workEmail})</option>
                <option value="personal">Personale ({settings.personalEmail})</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Ora Inizio</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Durata</label>
              <input
                type="text"
                placeholder="es. 45m o 1h"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Tipo</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
              >
                <option value="Meeting">Meeting</option>
                <option value="Review">Review</option>
                <option value="Scadenza">Scadenza</option>
                <option value="Personale">Personale</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-800"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              Salva Evento
            </button>
          </div>
        </form>
      )}

      {/* Events Timeline List */}
      <div className="rounded-xl bg-white border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {filteredEvents.map((ev) => {
          const isWork = ev.account === 'work';
          return (
            <div
              key={ev.id}
              className="p-3.5 sm:p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${
                    isWork
                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {isWork ? 'LAV' : 'PER'}
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-slate-800">{ev.title}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                      {ev.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-2">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{ev.date} alle {ev.time} ({ev.duration})</span>
                    </span>
                    <span>• {ev.accountEmail}</span>
                  </div>
                </div>
              </div>

              <div>
                <button
                  onClick={() => onDeleteEvent(ev.id)}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-rose-600 transition-colors"
                >
                  Rimuovi
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
