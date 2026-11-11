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
            <h3 className="text-sm font-semibold text-slate-800">Impostazioni Second Brain Hub</h3>
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
            <div className="font-semibold text-slate-700 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-600" />
              <span>Motore AI & RAG</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, selectedModel: 'smart-local' })}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.selectedModel === 'smart-local'
                    ? 'border-sky-300 bg-sky-50/80 text-sky-900 font-medium'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <div className="font-semibold">Motore Flat Locale</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Zero API key, offline</div>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, selectedModel: 'gemini-2.5-flash' })}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  formData.selectedModel === 'gemini-2.5-flash'
                    ? 'border-sky-300 bg-sky-50/80 text-sky-900 font-medium'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <div className="font-semibold">Gemini 2.5 Flash</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Google Cloud API</div>
              </button>
            </div>

            {formData.selectedModel === 'gemini-2.5-flash' && (
              <div>
                <label className="block text-slate-600 mb-1 flex items-center space-x-1">
                  <Key className="w-3 h-3 text-amber-500" />
                  <span>Chiave API Gemini (opzionale)</span>
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={formData.geminiApiKey}
                  onChange={(e) => setFormData({ ...formData, geminiApiKey: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono focus:outline-none focus:border-sky-500 focus:bg-white"
                />
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
