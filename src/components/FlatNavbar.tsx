import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Brain,
  CreditCard,
  MailCheck,
  FileText,
  CalendarCheck,
  RotateCw,
  Settings,
  Send
} from 'lucide-react';
import { AppSettings } from '../types';

interface FlatNavbarProps {
  onOpenSettings: () => void;
  onOpenTelegram?: () => void;
  onSyncAll: () => void;
  isSyncing: boolean;
  settings: AppSettings;
  unpaidExpensesCount: number;
  pendingRequestsCount: number;
  showExpenses: boolean;
}

export const FlatNavbar: React.FC<FlatNavbarProps> = ({
  onOpenSettings,
  onOpenTelegram,
  onSyncAll,
  isSyncing,
  unpaidExpensesCount,
  pendingRequestsCount,
  showExpenses
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          
          {/* Logo Brand */}
          <Link
            to="/"
            className="flex items-center space-x-2.5 group cursor-pointer select-none"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-xs group-hover:bg-indigo-700 transition-colors">
              F
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-sm tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                Frank
              </span>
              <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60 hidden sm:inline">
                Brain
              </span>
            </div>
          </Link>

          {/* Navigation Tabs (Sleek, De-cluttered & Clean) */}
          <nav className="hidden md:flex items-center space-x-1">
            
            {/* Panoramica */}
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
              <span>Panoramica</span>
            </NavLink>

            {/* Super Agente */}
            <NavLink
              to="/agente"
              className={({ isActive }) =>
                `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-900 border border-indigo-200/90 font-semibold shadow-2xs'
                    : 'text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50/50'
                }`
              }
            >
              <Brain className="w-3.5 h-3.5 text-indigo-600" />
              <span>Super Agente</span>
            </NavLink>

            {/* Lavoro (Email & Calendario) */}
            <NavLink
              to="/lavoro"
              className={({ isActive }) =>
                `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <MailCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Lavoro</span>
              {pendingRequestsCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-800 font-medium">
                  {pendingRequestsCount}
                </span>
              )}
            </NavLink>

            {/* Spese */}
            {showExpenses && (
              <NavLink
                to="/spese"
                className={({ isActive }) =>
                  `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`
                }
              >
                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                <span>Spese</span>
                {unpaidExpensesCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-medium">
                    {unpaidExpensesCount}
                  </span>
                )}
              </NavLink>
            )}

            {/* Scadenze */}
            <NavLink
              to="/scadenze"
              className={({ isActive }) =>
                `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-amber-50 text-amber-950 border border-amber-200/90 font-semibold shadow-2xs'
                    : 'text-amber-800 hover:text-amber-950 hover:bg-amber-50/60'
                }`
              }
            >
              <CalendarCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Scadenze</span>
            </NavLink>

            {/* Documenti & RAG */}
            <NavLink
              to="/documenti"
              className={({ isActive }) =>
                `flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`
              }
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Documenti</span>
            </NavLink>

          </nav>

          {/* Right Actions (Spaced & Balanced) */}
          <div className="flex items-center space-x-2">
            
            {/* Sync Button */}
            <button
              onClick={onSyncAll}
              disabled={isSyncing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium transition-colors"
              title="Sincronizza caselle email e calendario"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">
                {isSyncing ? 'In sync...' : 'Sincronizza'}
              </span>
            </button>

            {/* Telegram Bot */}
            {onOpenTelegram && (
              <button
                onClick={onOpenTelegram}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold transition-colors"
                title="Configura Bot Telegram e notifiche del mattino"
              >
                <Send className="w-3.5 h-3.5 -rotate-12 translate-x-0.5" />
                <span className="hidden lg:inline">Telegram</span>
              </button>
            )}

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
              title="Impostazioni Account e AI"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden flex items-center space-x-1 overflow-x-auto py-2 border-t border-slate-100">
          {[
            { to: '/', label: 'Panoramica', icon: LayoutDashboard, end: true },
            { to: '/agente', label: 'Super Agente', icon: Brain },
            { to: '/lavoro', label: 'Lavoro', icon: MailCheck },
            ...(showExpenses ? [{ to: '/spese', label: 'Spese', icon: CreditCard }] : []),
            { to: '/scadenze', label: 'Scadenze', icon: CalendarCheck },
            { to: '/documenti', label: 'Documenti', icon: FileText },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                    isActive ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

      </div>
    </header>
  );
};
