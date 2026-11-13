import React, { useState, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle, RotateCw, X, Bell, Clock, ShieldCheck, Sparkles, ExternalLink } from 'lucide-react';

interface TelegramModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TelegramStatus {
  configured: boolean;
  running: boolean;
  botUsername: string | null;
  chatId: string;
  dailyBriefingEnabled: boolean;
  dailyBriefingTime: string;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [briefingTime, setBriefingTime] = useState('08:30');
  const [briefingEnabled, setBriefingEnabled] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTestingBriefing, setIsTestingBriefing] = useState(false);
  const [isTestingPing, setIsTestingPing] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data: TelegramStatus = await res.json();
        setStatus(data);
        setBriefingTime(data.dailyBriefingTime || '08:30');
        setBriefingEnabled(data.dailyBriefingEnabled ?? true);
      }
    } catch (err: any) {
      console.warn('Errore lettura stato Telegram:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setActionMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setActionMessage(null);

    try {
      const payload: any = {
        dailyBriefingTime: briefingTime,
        dailyBriefingEnabled: briefingEnabled
      };
      if (botToken.trim()) {
        payload.botToken = botToken.trim();
      }

      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(data.status);
        setBotToken('');
        setActionMessage({
          type: 'success',
          text: data.status.configured
            ? `Bot Telegram configurato! Avvialo su Telegram cercando @${data.status.botUsername || 'tuo_bot'} e invia /start`
            : 'Impostazioni aggiornate con successo.'
        });
      } else {
        throw new Error(data.error || 'Errore salvataggio');
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestBriefing = async () => {
    setIsTestingBriefing(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/telegram/send-briefing', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: 'Briefing giornaliero inviato con successo sulla tua chat Telegram!' });
      } else {
        throw new Error(data.error || 'Invio fallito');
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Errore: ${err.message}` });
    } finally {
      setIsTestingBriefing(false);
    }
  };

  const handleSendTestPing = async () => {
    setIsTestingPing(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: 'Messaggio ping inviato su Telegram!' });
      } else {
        throw new Error(data.error || 'Invio fallito');
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Errore: ${err.message}` });
    } finally {
      setIsTestingPing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-50/70 to-indigo-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center shadow-xs">
              <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-900 text-sm">Bot Telegram di Frank</h3>
                {status?.configured ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Online
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    Da configurare
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">Briefing mattutino automatico & chat con Frank dal tuo smartphone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
          
          {actionMessage && (
            <div className={`p-3 rounded-xl flex items-start gap-2 border ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{actionMessage.text}</span>
            </div>
          )}

          {/* Stato Connessione Banner */}
          {status?.configured ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Bot Attivo:</span>
                <span className="font-mono text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 font-semibold">
                  @{status.botUsername || 'FrankBot'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Canale Telegram collegato:</span>
                <span className="font-mono text-slate-700">
                  {status.chatId ? `Chat ID: ${status.chatId}` : 'In attesa di /start da Telegram'}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleSendTestBriefing}
                  disabled={isTestingBriefing || !status.chatId}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  {isTestingBriefing ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Invia Briefing di Prova</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendTestPing}
                  disabled={isTestingPing || !status.chatId}
                  className="py-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium text-xs transition-colors"
                >
                  {isTestingPing ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : 'Invia Ping'}
                </button>
              </div>
            </div>
          ) : (
            /* Guida Creazione Bot */
            <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200/80 space-y-2">
              <div className="font-semibold text-sky-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                <span>Come creare il tuo Bot Telegram in 30 secondi (Gratis):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700 text-[11px] leading-relaxed">
                <li>Apri Telegram e cerca l'account ufficiale <b>@BotFather</b></li>
                <li>Invia il comando <code className="bg-sky-100 text-sky-800 px-1 py-0.2 rounded font-mono">/newbot</code></li>
                <li>Scegli un nome (es. <i>Frank Personal Agent</i>) e uno username (es. <i>frank_russo_bot</i>)</li>
                <li>Copia il <b>Token HTTP API</b> fornito da BotFather e incollalo qui sotto</li>
              </ol>
            </div>
          )}

          {/* Form Configurazione */}
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">
                {status?.configured ? 'Aggiorna Token Bot (opzionale):' : 'Telegram Bot Token:'}
              </label>
              <input
                type="text"
                placeholder={status?.configured ? '••••••••••••••••••••••••• (lascia vuoto per non cambiare)' : 'Es. 7834526182:AAH9f...'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white transition-colors"
              />
            </div>

            {/* Impostazioni Orario Briefing Mattutino */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bell className="w-4 h-4 text-amber-600" />
                  <span className="font-semibold text-slate-800">Briefing Mattutino Automatico</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={briefingEnabled}
                    onChange={(e) => setBriefingEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/50">
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Orario di invio ogni giorno:</span>
                </div>
                <input
                  type="time"
                  value={briefingTime}
                  onChange={(e) => setBriefingTime(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg font-medium text-xs flex items-center space-x-1.5 transition-colors shadow-xs"
              >
                {isSaving && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Salva Configurazione</span>
              </button>
            </div>
          </form>

          {/* Comandi Disponibili su Telegram */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 space-y-1.5 text-[11px]">
            <span className="font-semibold text-slate-800 block mb-1">Comandi disponibili su Telegram:</span>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
              <div><b className="text-slate-800">/briefing</b>: invia il report di oggi</div>
              <div><b className="text-slate-800">/scadenze</b>: scadenze personali</div>
              <div><b className="text-slate-800">/spese</b>: budget e uscite del mese</div>
              <div><b className="text-slate-800">/lavoro</b>: task email & riunioni</div>
              <div className="col-span-2 text-slate-500 font-sans mt-0.5">
                💬 Oppure scrivi qualsiasi messaggio: Frank risponderà dal tuo Second Brain.
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
