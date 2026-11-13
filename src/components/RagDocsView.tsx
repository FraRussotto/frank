import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Send, Bot, User, RotateCw, AlertCircle, FileSpreadsheet, File, Eye, X, Brain, Sparkles } from 'lucide-react';
import { StoredDocument, DocumentChunk, AppSettings, ChatMessage, EcosystemContext } from '../types';
import { retrieveRelevantChunks, generateRAGAnswer } from '../services/ragEngine';
import { AiMessageRenderer } from './AiMessageRenderer';

interface RagDocsViewProps {
  documents: StoredDocument[];
  chunks: DocumentChunk[];
  settings: AppSettings;
  ecosystem?: EcosystemContext;
  onUploadDocument: (doc: StoredDocument) => void;
  onDeleteDocument: (docId: string) => void;
}

export const RagDocsView: React.FC<RagDocsViewProps> = ({
  documents,
  chunks,
  settings,
  ecosystem,
  onUploadDocument,
  onDeleteDocument
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-msg',
      sender: 'assistant',
      content: 'Ciao Francesco! Sono Frank, il tuo Second Brain: puoi chiedermi qualsiasi cosa sulle attività della settimana, riunioni a calendario, task dalle email, spese fisse o documenti archiviati (inclusi PDF, Word ed Excel caricati).',
      timestamp: 'Adesso'
    }
  ]);
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickText, setQuickText] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [docFilter, setDocFilter] = useState<'all' | 'files' | 'compaction'>('all');
  const [viewingDoc, setViewingDoc] = useState<StoredDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);

    const files = Array.from(e.target.files);

    for (const file of files) {
      try {
        const lowerName = file.name.toLowerCase();
        let extractedContent = '';
        let detectedType: string = 'txt';

        if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
          extractedContent = await file.text();
          detectedType = lowerName.endsWith('.md') ? 'md' : 'txt';
        } else {
          // Converte in Base64 per parsing multi-formato sicuro sul backend
          const base64Str = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const res = await fetch('/api/documents/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, base64: base64Str })
          });

          if (!res.ok) {
            throw new Error(`Errore server HTTP ${res.status}`);
          }

          const data = await res.json();
          if (data.parsed?.text) {
            extractedContent = data.parsed.text;
            detectedType = data.parsed.fileType || 'doc';
          } else {
            throw new Error('Nessun testo estratto dal documento');
          }
        }

        if (extractedContent.trim()) {
          const category =
            lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')
              ? 'Finanze'
              : lowerName.endsWith('.pdf')
              ? 'Guida'
              : lowerName.endsWith('.docx') || lowerName.endsWith('.doc')
              ? 'Progetti'
              : 'Note';

          const newDoc: StoredDocument = {
            id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: file.name,
            category,
            fileType: detectedType as any,
            sizeBytes: file.size,
            uploadedAt: new Date().toISOString(),
            content: extractedContent,
            chunksCount: 0,
            tags: [detectedType.toUpperCase()]
          };

          onUploadDocument(newDoc);
        }
      } catch (err: any) {
        console.error('Errore caricamento documento:', err);
        setUploadError(`Errore nel caricamento di "${file.name}": ${err.message}`);
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFormatBadge = (doc: StoredDocument) => {
    if (doc.category === 'Memoria Chat' || doc.tags?.includes('compaction') || doc.title.toLowerCase().startsWith('compaction:')) {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">🧠 CHAT</span>;
    }
    const lower = (doc.title || doc.fileType || '').toLowerCase();
    if (lower.endsWith('.pdf') || doc.fileType === 'pdf') {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">PDF</span>;
    }
    if (lower.endsWith('.docx') || lower.endsWith('.doc') || doc.fileType === 'docx') {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">WORD</span>;
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || doc.fileType === 'xlsx') {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">EXCEL</span>;
    }
    if (lower.endsWith('.csv') || doc.fileType === 'csv') {
      return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">CSV</span>;
    }
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">TESTO</span>;
  };

  const handleAddQuickNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || !quickText.trim()) return;

    const newDoc: StoredDocument = {
      id: `doc-${Date.now()}`,
      title: quickTitle.trim().endsWith('.md') ? quickTitle.trim() : `${quickTitle.trim()}.md`,
      category: 'Note',
      fileType: 'md',
      sizeBytes: new Blob([quickText]).size,
      uploadedAt: new Date().toISOString(),
      content: quickText.trim(),
      chunksCount: 0,
      tags: ['Nota']
    };

    onUploadDocument(newDoc);
    setQuickTitle('');
    setQuickText('');
    setShowPasteBox(false);
  };

  const handleSend = async (textToSend?: string) => {
    const q = textToSend || query;
    if (!q.trim() || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: q.trim(),
      timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setIsProcessing(true);

    try {
      const retrieved = retrieveRelevantChunks(q, chunks, 2);
      const res = await generateRAGAnswer(q, retrieved, settings, ecosystem);

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        content: res.text,
        timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
        retrievedSources: retrieved,
        modelUsed: res.model
      };

      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Documenti & Assistente RAG</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Modulo snello per archiviare file personali (Markdown, TXT) e consultarli via domande rapide.
        </p>
      </div>

      {/* Two columns: Left documents & upload, Right Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Documents list & upload (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Upload card (Flat Pastel) */}
          <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Archivio File</span>
              <button
                onClick={() => setShowPasteBox(!showPasteBox)}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline"
              >
                {showPasteBox ? 'Chiudi' : '+ Scrivi Nota'}
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.json"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full py-3.5 px-4 border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-xl text-xs text-slate-700 flex flex-col items-center justify-center gap-1.5 transition-all group disabled:opacity-50"
            >
              {isUploading ? (
                <div className="flex items-center gap-2 text-indigo-600 font-semibold py-1">
                  <RotateCw className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Estrazione e indicizzazione semantica...</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-slate-800 font-semibold">
                    <UploadCloud className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                    <span>Carica Documenti (PDF, Word, Excel, CSV, Note)</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] text-slate-400">
                    <span className="px-1 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono">.pdf</span>
                    <span className="px-1 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">.docx</span>
                    <span className="px-1 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">.xlsx</span>
                    <span className="px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono">.csv</span>
                    <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">.md / .txt</span>
                  </div>
                </>
              )}
            </button>

            {uploadError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Quick paste note */}
            {showPasteBox && (
              <form onSubmit={handleAddQuickNote} className="space-y-2 pt-2 border-t border-slate-100">
                <input
                  type="text"
                  placeholder="Titolo nota..."
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                  required
                />
                <textarea
                  rows={4}
                  placeholder="Testo della nota..."
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white"
                  required
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-medium"
                  >
                    Salva Nota
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Stored Documents List with Compaction Filter */}
          <div className="rounded-xl bg-white border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
            {/* Filter Pills */}
            <div className="p-2 bg-slate-50/80 border-b border-slate-100 flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setDocFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  docFilter === 'all'
                    ? 'bg-white text-slate-800 shadow-2xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Tutti ({documents.length})
              </button>
              <button
                type="button"
                onClick={() => setDocFilter('files')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  docFilter === 'files'
                    ? 'bg-white text-slate-800 shadow-2xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                File & Note ({documents.filter(d => !(d.category === 'Memoria Chat' || d.tags?.includes('compaction') || d.title.toLowerCase().startsWith('compaction:'))).length})
              </button>
              <button
                type="button"
                onClick={() => setDocFilter('compaction')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  docFilter === 'compaction'
                    ? 'bg-indigo-50 text-indigo-700 shadow-2xs border border-indigo-200'
                    : 'text-slate-500 hover:text-indigo-700'
                }`}
              >
                <span>🧠 Memoria Chat</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                  {documents.filter(d => d.category === 'Memoria Chat' || d.tags?.includes('compaction') || d.title.toLowerCase().startsWith('compaction:')).length}
                </span>
              </button>
            </div>

            <div className="px-4 py-2 bg-slate-50/40 text-[10px] font-medium text-slate-400 flex items-center justify-between">
              <span>
                {documents.filter(d => {
                  const isComp = d.category === 'Memoria Chat' || d.tags?.includes('compaction') || d.title.toLowerCase().startsWith('compaction:');
                  if (docFilter === 'compaction') return isComp;
                  if (docFilter === 'files') return !isComp;
                  return true;
                }).length} elementi
              </span>
              <span>{chunks.length} frammenti RAG totali</span>
            </div>

            {documents.filter(d => {
              const isComp = d.category === 'Memoria Chat' || d.tags?.includes('compaction') || d.title.toLowerCase().startsWith('compaction:');
              if (docFilter === 'compaction') return isComp;
              if (docFilter === 'files') return !isComp;
              return true;
            }).length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Nessuna voce trovata in questa sezione.
              </div>
            ) : (
              documents.filter(d => {
                const isComp = d.category === 'Memoria Chat' || d.tags?.includes('compaction') || d.title.toLowerCase().startsWith('compaction:');
                if (docFilter === 'compaction') return isComp;
                if (docFilter === 'files') return !isComp;
                return true;
              }).map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => setViewingDoc(doc)}
                  className="p-3 flex items-center justify-between hover:bg-slate-50/80 text-xs transition-colors group cursor-pointer"
                >
                  <div className="flex items-center space-x-2.5 truncate mr-2">
                    <div className="shrink-0">{getFormatBadge(doc)}</div>
                    <div className="truncate">
                      <div className="font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                        {doc.title}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span className="text-slate-500">{doc.category}</span>
                        <span>•</span>
                        <span>{new Date(doc.uploadedAt).toLocaleDateString('it-IT')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingDoc(doc);
                      }}
                      className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                      title="Leggi contenuto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Elimina"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

        {/* Right column: RAG Assistant Chat (7 cols) */}
        <div className="lg:col-span-7 flex flex-col h-[520px] rounded-xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
          
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Bot className="w-4 h-4 text-sky-600" />
              <span className="font-semibold text-slate-800">Assistente RAG</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {settings.selectedModel === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : 'Motore Flat'}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs bg-slate-50/30">
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div key={m.id} className={`flex items-start space-x-2.5 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isUser ? 'bg-slate-900 text-white' : 'bg-sky-100 text-sky-700'}`}>
                    {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`max-w-[85%] p-3.5 rounded-xl leading-relaxed shadow-2xs ${isUser ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                    <AiMessageRenderer content={m.content} isUser={isUser} />
                    {m.retrievedSources && m.retrievedSources.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400">
                        Fonte consultata: <b>{m.retrievedSources[0].chunk.documentTitle}</b>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isProcessing && (
              <div className="flex items-center space-x-2 text-slate-400 text-xs">
                <span className="animate-spin text-sky-600">●</span>
                <span>Ricerca nei documenti e risposta...</span>
              </div>
            )}
          </div>

          {/* Quick pills */}
          <div className="px-3 py-1.5 bg-slate-50/80 border-t border-slate-100 flex gap-1.5 overflow-x-auto text-[11px]">
            <button
              onClick={() => handleSend("Cos'è il RAG e come funziona?")}
              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 whitespace-nowrap"
            >
              Cos'è il RAG?
            </button>
            <button
              onClick={() => handleSend("Quali documenti sono archiviati?")}
              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 whitespace-nowrap"
            >
              I miei file
            </button>
            <button
              onClick={() => handleSend("Riassumi il metodo PARA")}
              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 whitespace-nowrap"
            >
              Metodo PARA
            </button>
          </div>

          {/* Input box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 border-t border-slate-200/90 bg-white flex items-center space-x-2"
          >
            <input
              type="text"
              placeholder="Fai una domanda sul RAG o sui tuoi file..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
            />
            <button
              type="submit"
              disabled={!query.trim() || isProcessing}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>

      </div>

      {/* Modal Visualizzatore Documento / Compaction */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center space-x-2.5 truncate mr-2">
                {getFormatBadge(viewingDoc)}
                <div className="truncate">
                  <h3 className="font-semibold text-slate-800 text-sm truncate">{viewingDoc.title}</h3>
                  <p className="text-[11px] text-slate-400">
                    {viewingDoc.category} • {(viewingDoc.sizeBytes / 1024).toFixed(1)} KB • Indicizzato nel RAG
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingDoc(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 text-xs leading-relaxed text-slate-700 space-y-3 bg-white">
              <AiMessageRenderer content={viewingDoc.content} isUser={false} />
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-500">
                Disponibile come fonte di memoria per tutte le richieste a Frank Copilot.
              </span>
              <button
                onClick={() => setViewingDoc(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs transition-colors"
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
