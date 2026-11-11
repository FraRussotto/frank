import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Send, Bot, User } from 'lucide-react';
import { StoredDocument, DocumentChunk, AppSettings, ChatMessage, EcosystemContext } from '../types';
import { retrieveRelevantChunks, generateRAGAnswer } from '../services/ragEngine';

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
      content: 'Ciao Francesco! Sono Frank, il tuo Second Brain: puoi chiedermi qualsiasi cosa sulle attività della settimana, riunioni a calendario, task dalle email, spese fisse o documenti archiviati.',
      timestamp: 'Adesso'
    }
  ]);
  const [query, setQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickText, setQuickText] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;
        const newDoc: StoredDocument = {
          id: `doc-${Date.now()}`,
          title: file.name,
          category: 'Note',
          fileType: 'md',
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
          content: text,
          chunksCount: 0,
          tags: ['Upload']
        };
        onUploadDocument(newDoc);
      };
      reader.readAsText(file);
    });
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
              accept=".txt,.md,.json,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50 rounded-lg text-xs text-slate-600 flex items-center justify-center space-x-2 transition-colors"
            >
              <UploadCloud className="w-4 h-4 text-sky-600" />
              <span>Carica file (.md, .txt)</span>
            </button>

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

          {/* Stored Documents List */}
          <div className="rounded-xl bg-white border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50/70 text-[11px] font-medium text-slate-500 flex items-center justify-between">
              <span>{documents.length} Documenti indicizzati</span>
              <span>{chunks.length} Chunks</span>
            </div>

            {documents.map((doc) => (
              <div key={doc.id} className="p-3 flex items-center justify-between hover:bg-slate-50/60 text-xs">
                <div className="flex items-center space-x-2.5 truncate mr-2">
                  <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                  <div className="truncate">
                    <div className="font-medium text-slate-800 truncate">{doc.title}</div>
                    <div className="text-[10px] text-slate-400">{(doc.sizeBytes / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <button
                  onClick={() => onDeleteDocument(doc.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                  title="Elimina"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
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
                  <div className={`max-w-[85%] p-3 rounded-lg leading-relaxed shadow-xs ${isUser ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                    <div className="whitespace-pre-wrap">{m.content}</div>
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

    </div>
  );
};
