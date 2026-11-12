import React from 'react';
import {
  LayoutDashboard,
  Brain,
  CreditCard,
  MailCheck,
  FileText,
  CalendarCheck,
  RotateCw,
  Settings
} from 'lucide-react';
import { AppSettings } from '../types';

interface FlatNavbarProps {
  activeTab: 'overview' | 'super-agent' | 'expenses' | 'email-calendar' | 'docs-rag' | 'deadlines';
  onTabChange: (tab: 'overview' | 'super-agent' | 'expenses' | 'email-calendar' | 'docs-rag' | 'deadlines') => void;
  onOpenSettings: () => void;
  onSyncAll: () => void;
  isSyncing: boolean;
  settings: AppSettings;
  unpaidExpensesCount: number;
  pendingRequestsCount: number;
  showExpenses: boolean;
}

export const FlatNavbar: React.FC<FlatNavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
  onSyncAll,
  isSyncing,
  unpaidExpensesCount,
  pendingRequestsCount,
  showExpenses
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          
          {/* Logo Brand (Soft Pastel) */}
          <div
            onClick={() => onTabChange('overview')}
            className="flex items-center space-x-2.5 cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-xs">
              F
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm tracking-tight text-slate-900">Frank</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                Second Brain
              </span>
            </div>
          </div>

          {/* Navigation Links (Flat Soft Tabs) */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => onTabChange('overview')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
              <span>Panoramica</span>
            </button>

            {/* Super Agente Tab */}
            <button
              onClick={() => onTabChange('super-agent')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'super-agent'
                  ? 'bg-indigo-50 text-indigo-900 border border-indigo-200/80 font-semibold shadow-2xs'
                  : 'text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50/50'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-indigo-600" />
              <span>Super Agente</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 font-bold uppercase tracking-tight">
                Core
              </span>
            </button>

            {showExpenses && (
              <button
                onClick={() => onTabChange('expenses')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === 'expenses'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                <span>Spese Fisse</span>
                {unpaidExpensesCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                    {unpaidExpensesCount}
                  </span>
                )}
              </button>
            )}

            {/* Unified Email & Calendar Tab */}
            <button
              onClick={() => onTabChange('email-calendar')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'email-calendar'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <MailCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Email & Calendario</span>
              {pendingRequestsCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                  {pendingRequestsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange('docs-rag')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'docs-rag'
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Documenti & RAG</span>
            </button>

            {/* Scadenze Personali Tab */}
            <button
              onClick={() => onTabChange('deadlines')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'deadlines'
                  ? 'bg-amber-50 text-amber-950 border border-amber-200/90 font-semibold shadow-2xs'
                  : 'text-amber-800 hover:text-amber-950 hover:bg-amber-50/60'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Scadenze</span>
            </button>
          </nav>

          {/* Right Actions */}
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
                {isSyncing ? 'Sincronizzazione...' : 'Sincronizza'}
              </span>
            </button>

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
            { id: 'overview', label: 'Panoramica', icon: LayoutDashboard },
            { id: 'super-agent', label: 'Super Agente', icon: Brain },
            ...(showExpenses ? [{ id: 'expenses', label: 'Spese', icon: CreditCard }] : []),
            { id: 'email-calendar', label: 'Email & Cal', icon: MailCheck },
            { id: 'docs-rag', label: 'Doc & RAG', icon: FileText },
            { id: 'deadlines', label: 'Scadenze', icon: CalendarCheck },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id as any)}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
                  isActive ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-500'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

      </div>
    </header>
  );
};
