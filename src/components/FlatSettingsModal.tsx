import React, { useState } from 'react';
import { X, Settings, Key, Mail, Cpu } from 'lucide-react';
import { AppSettings } from '../types';

interface FlatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onResetData: () => void;
}

export const FlatSettingsModal: React.FC<FlatSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onResetData
}) => {
  const [formData, setFormData] = useState<AppSettings>(settings);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Settings className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-slate-800">Impostazioni Frank (Second Brain)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          {/* Email Accounts Sync */}
          <div className="space-y-3">
            <div className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
              <Mail className="w-3.5 h-3.5 text-sky-600" />
              <span>I tuoi 2 Account Email (Sincronizzazione)</span>
            </div>

            <div>
              <label className="block text-slate-600 mb-1">Email Lavoro</label>
              <input
                type="email"
                value={formData.workEmail}
                onChange={(e) => setFormData({ ...formData, workEmail: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono focus:outline-none focus:border-sky-500 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1">Email Personale</label>
              <input
                type="email"
                value={formData.personalEmail}
                onChange={(e) => setFormData({ ...formData, personalEmail: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono focus:outline-none focus:border-sky-500 focus:bg-white"
                required
              />
            </div>
          </div>

          {/* AI Engine */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-600" />
                <span>Motore AI Ecosistema Frank</span>
              </div>
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                Google Gemini Native
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, selectedModel: 'gemini-2.5-pro' })}
                className={`p-2.5 rounded-lg border text-left transition-all relative ${
                  formData.selectedModel === 'gemini-2.5-pro'
                    ? 'border-indigo-400 bg-indigo-50/80 text-indigo-950 font-medium shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-indigo-900">Gemini 2.5 Pro</div>
                  <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider">Top</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Frontier, massima intelligenza e precisione</div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, selectedModel: 'gemini-2.5-flash-thinking' })}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.selectedModel === 'gemini-2.5-flash-thinking'
                    ? 'border-purple-400 bg-purple-50/80 text-purple-950 font-medium shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-xs text-purple-900">Gemini 2.5 Flash Thinking</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Extended reasoning logico profondo</div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, selectedModel: 'gemini-2.5-flash' })}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.selectedModel === 'gemini-2.5-flash'
                    ? 'border-sky-300 bg-sky-50/80 text-sky-900 font-medium shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-xs">Gemini 2.5 Flash</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Ultra-veloce e scattante</div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, selectedModel: 'smart-local' })}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.selectedModel === 'smart-local'
                    ? 'border-slate-400 bg-slate-100 text-slate-900 font-medium'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-xs">Motore Flat Locale</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Zero API key, regole statiche offline</div>
              </button>
            </div>

            {formData.selectedModel !== 'smart-local' && (
              <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-700 font-medium text-xs flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-500" />
                    <span>Google Gemini API Key</span>
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-600 hover:underline flex items-center space-x-0.5"
                  >
                    <span>Ottieni chiave da Google AI Studio</span>
                    <span>↗</span>
                  </a>
                </div>
                <input
                  type="password"
                  placeholder="Incolla qui la tua chiave (es. AIzaSy...)"
                  value={formData.geminiApiKey}
                  onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-500 leading-tight">
                  La chiave abilita Google Gemini su tutto l'ecosistema: Super Agente, bot Telegram, scansione email e documenti. Se lasciata vuota, Frank usa il fallback integrato.
                </p>
              </div>
            )}
          </div>

          {/* Reset button */}
          <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
            <button
              type="button"
              onClick={onResetData}
              className="text-rose-600 hover:underline text-[11px]"
            >
              Ripristina dati iniziali
            </button>

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-slate-500 hover:text-slate-800"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
              >
                Salva
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
