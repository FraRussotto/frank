import { DocumentChunk, StoredDocument, RetrievedChunk, AppSettings, EcosystemContext, SyncedEvent, EmailAIRequest, FixedExpense } from '../types';

/**
 * Suddivisione snella del testo in chunks con margine di sovrapposizione.
 */
export function chunkText(
  documentId: string,
  documentTitle: string,
  content: string,
  chunkSize: number = 400,
  overlap: number = 60
): DocumentChunk[] {
  const paragraphs = content.split(/\n\s*\n/);
  const chunks: DocumentChunk[] = [];
  let currentChunk = '';
  let chunkIdx = 1;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if ((currentChunk + '\n\n' + trimmed).length > chunkSize && currentChunk.length > 40) {
      chunks.push({
        id: `${documentId}-c-${chunkIdx}`,
        documentId,
        documentTitle,
        content: currentChunk.trim(),
        chunkIndex: chunkIdx,
        tokenCount: Math.round(currentChunk.split(/\s+/).length * 1.3)
      });
      chunkIdx++;
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(Math.max(0, words.length - Math.round(overlap / 5))).join(' ');
      currentChunk = overlapWords + '\n\n' + trimmed;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `${documentId}-c-${chunkIdx}`,
      documentId,
      documentTitle,
      content: currentChunk.trim(),
      chunkIndex: chunkIdx,
      tokenCount: Math.round(currentChunk.split(/\s+/).length * 1.3)
    });
  }

  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

/**
 * Ricerca semantica/vettoriale rapida sui frammenti dei documenti.
 */
export function retrieveRelevantChunks(
  query: string,
  allChunks: DocumentChunk[],
  topK: number = 3
): RetrievedChunk[] {
  if (!query.trim() || allChunks.length === 0) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored: RetrievedChunk[] = allChunks.map(chunk => {
    const chunkTokens = tokenize(chunk.content + ' ' + chunk.documentTitle);
    let matchCount = 0;

    queryTokens.forEach(q => {
      const occurrences = chunkTokens.filter(t => t.includes(q) || q.includes(t)).length;
      matchCount += occurrences;
    });

    const score = Math.min(0.99, matchCount / (queryTokens.length + 1.5));
    return {
      chunk,
      score: Number(score.toFixed(2))
    };
  });

  return scored
    .filter(s => s.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Generazione della risposta RAG ed Ecosistema (Locale Smart o tramite Gemini 2.5 Flash).
 */
export async function generateRAGAnswer(
  query: string,
  sources: RetrievedChunk[],
  settings: AppSettings,
  ecosystem?: EcosystemContext
): Promise<{ text: string; model: string }> {
  const today = new Date();
  const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const currentDayName = dayNames[today.getDay()];
  const todayStr = today.toISOString().split('T')[0];

  const events = ecosystem?.events || [];
  const requests = ecosystem?.requests || [];
  const expenses = ecosystem?.expenses || [];

  // 1. Chiamata a Gemini 2.5 Flash se configurata
  if (settings.geminiApiKey && settings.selectedModel === 'gemini-2.5-flash') {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${settings.geminiApiKey}`;
      
      const upcomingEvents = events.filter(e => e.date >= todayStr);
      const pendingReqs = requests.filter(r => r.status === 'pending');
      const unpaidExpenses = expenses.filter(e => !e.isPaid);

      const eventsSummary = upcomingEvents.length > 0
        ? upcomingEvents.map(e => `- [${e.date} alle ${e.time}] ${e.title} (${e.account === 'work' ? 'Lavoro' : 'Personale'}, durata: ${e.duration})`).join('\n')
        : 'Nessun evento o riunione futura a calendario.';

      const tasksSummary = pendingReqs.length > 0
        ? pendingReqs.map(r => `- [Urgenza ${r.urgency.toUpperCase()}${r.deadline ? `, Scadenza: ${r.deadline}` : ''}] ${r.summary} (Da: ${r.sender}, Oggetto: "${r.subject}")`).join('\n')
        : 'Nessuna attività in sospeso.';

      const expensesSummary = unpaidExpenses.length > 0
        ? unpaidExpenses.map(e => `- ${e.name}: €${e.amount} (Categoria: ${e.category}, giorno ${e.dueDay} del mese)`).join('\n')
        : 'Tutte le spese fisse risultano saldate.';

      const docsSummary = sources.length > 0
        ? sources.map(s => `[Documento: ${s.chunk.documentTitle} - Rilevanza: ${(s.score * 100).toFixed(0)}%]:\n${s.chunk.content}`).join('\n\n')
        : 'Nessun documento RAG specifico con corrispondenze dirette.';

      const fullPrompt = `Sei Frank, il Second Brain onnisciente di Francesco Russotto.
Hai piena visibilità sull'intero ecosistema della dashboard:
- Data odierna di riferimento: ${currentDayName}, ${todayStr} (anno 2026).
- Calendario sincronizzato (Account Lavoro e Personale).
- Email & Task estratti (richieste operative, urgenze, scadenze).
- Spese fisse mensili e budget.
- Documenti personali caricati nel RAG.

DATI REALI DELL'ECOSISTEMA:

=== 📅 EVENTI E RIUNIONI A CALENDARIO (In arrivo da oggi in poi) ===
${eventsSummary}

=== ⚡ TASK E ATTIVITÀ IN SOSPESO (Da email-ai-agent) ===
${tasksSummary}

=== 💳 SPESE FISSE DEL MESE (Da pagare) ===
${expensesSummary}

=== 📄 DOCUMENTI & NOTE RAG ===
${docsSummary}

DOMANDA DELL'UTENTE:
"${query}"

ISTRUZIONI PER LA RISPOSTA:
1. Rispondi in italiano con tono chiaro, collaborativo e preciso.
2. Fai riferimento esatto alle date relative (oggi: ${todayStr}, domani, questa settimana, la prossima settimana):
   - Se l'utente chiede delle attività della prossima settimana, controlla sia le riunioni a calendario sia le scadenze e i task delle email previsti per quelle date.
   - Se per una determinata data o settimana non ci sono eventi a calendario registrati, dillo chiaramente e mostra invece i task e le attività in sospeso estratte dalle email che necessitano attenzione.
3. Se l'utente chiede delle spese, calcola e specifica l'importo totale e le singole voci da pagare.
4. Usa una formattazione markdown chiara ed elegante (elenchi puntati, grassetti, emoji per i punti chiave).`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { text, model: 'Gemini 2.5 Flash' };
        }
      }
    } catch (e) {
      console.warn("Fallback su assistente locale:", e);
    }
  }

  // 2. Motore Intelligente Locale (Smart Local Engine con piena comprensione dell'Ecosistema)
  const q = query.toLowerCase();

  // A. Domanda su attività, prossima settimana, impegni, calendario, agenda
  const isTimeOrActivityQuery = 
    q.includes('prossim') ||
    q.includes('settiman') ||
    q.includes('attivit') ||
    q.includes('impegn') ||
    q.includes('calendari') ||
    q.includes('agenda') ||
    q.includes('cosa devo fare') ||
    q.includes('da fare') ||
    q.includes('domani') ||
    q.includes('oggi') ||
    q.includes('scadenz');

  if (isTimeOrActivityQuery) {
    const upcomingEvents = events.filter(e => e.date >= todayStr);
    const pendingReqs = requests.filter(r => r.status === 'pending');
    
    // Calcola il range della prossima settimana
    const currentDayOfWeek = today.getDay(); // 0 = dom, 1 = lun, 3 = mer
    const daysUntilNextMonday = ((8 - currentDayOfWeek) % 7) || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilNextMonday);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);

    const nextMondayStr = nextMonday.toISOString().split('T')[0];
    const nextSundayStr = nextSunday.toISOString().split('T')[0];

    const isNextWeekQuery = q.includes('prossima') && (q.includes('settimana') || q.includes('settimane'));

    let reply = '';

    if (isNextWeekQuery) {
      reply += `Ecco il quadro delle tue attività per la **prossima settimana** (dal ${nextMonday.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} al ${nextSunday.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}):\n\n`;

      const eventsNextWeek = events.filter(e => e.date >= nextMondayStr && e.date <= nextSundayStr);
      
      reply += `### 📅 Eventi a Calendario\n`;
      if (eventsNextWeek.length > 0) {
        eventsNextWeek.forEach(e => {
          reply += `- **${e.date}** alle **${e.time}**: ${e.title} (${e.account === 'work' ? 'Lavoro' : 'Personale'})\n`;
        });
      } else {
        reply += `*Nessuna riunione o evento a calendario programmato al momento per la prossima settimana.*\n`;
      }

      reply += `\n### ⚡ Task & Attività da Smarcare (da email-ai-agent)\n`;
      if (pendingReqs.length > 0) {
        reply += `Hai **${pendingReqs.length} attività in sospeso** estratte dalle tue email:\n`;
        pendingReqs.slice(0, 6).forEach(r => {
          const urgencyBadge = r.urgency === 'alta' ? '🔴 ALTA' : r.urgency === 'media' ? '🟡 MEDIA' : '🟢 BASSA';
          const deadlineText = r.deadline ? ` — *Scadenza: ${r.deadline}*` : '';
          reply += `- **[${urgencyBadge}]** ${r.summary}${deadlineText}\n  *(Mittente: ${r.sender} | "${r.subject}")*\n`;
        });
        if (pendingReqs.length > 6) {
          reply += `\n*...e altre ${pendingReqs.length - 6} attività visibili nella scheda Email & Calendario.*\n`;
        }
      } else {
        reply += `*Tutte le attività risultano completate!*\n`;
      }

      reply += `\n💡 *Puoi smarcare le singole attività direttamente nella scheda **Email & Calendario**.*`;
      return { text: reply, model: 'Assistente Smart Local' };
    }

    // Domanda generica su attività / cosa devo fare
    reply += `Ecco il riepilogo delle tue attività (Oggi: **${currentDayName} ${today.toLocaleDateString('it-IT')}**):\n\n`;
    
    reply += `### 📅 Prossimi Eventi a Calendario\n`;
    if (upcomingEvents.length > 0) {
      upcomingEvents.slice(0, 4).forEach(e => {
        reply += `- **${e.date}** alle **${e.time}**: ${e.title} (${e.account === 'work' ? 'LAV' : 'PER'})\n`;
      });
    } else {
      reply += `*Nessun evento futuro registrato al momento a calendario.*\n`;
    }

    reply += `\n### ⚡ Attività e Task Richiesti dalle Email\n`;
    if (pendingReqs.length > 0) {
      reply += `Hai **${pendingReqs.length} attività in sospeso** estratte da email-ai-agent:\n`;
      pendingReqs.slice(0, 5).forEach(r => {
        const urgencyBadge = r.urgency === 'alta' ? '🔴 ALTA' : r.urgency === 'media' ? '🟡 MEDIA' : '🟢 BASSA';
        const deadlineText = r.deadline ? ` *(Scadenza: ${r.deadline})*` : '';
        reply += `- **[${urgencyBadge}]** ${r.summary}${deadlineText} (Da: ${r.sender})\n`;
      });
    } else {
      reply += `*Nessuna attività in sospeso!*\n`;
    }

    return { text: reply, model: 'Assistente Smart Local' };
  }

  // B. Domanda su spese, budget, pagamenti
  if (q.includes('spes') || q.includes('budget') || q.includes('cost') || q.includes('pagar') || q.includes('bollett') || q.includes('soldi')) {
    const unpaid = expenses.filter(e => !e.isPaid);
    const totalUnpaid = unpaid.reduce((sum, e) => sum + e.amount, 0);

    let reply = `### 💳 Riepilogo Spese Fisse\n\n`;
    if (unpaid.length > 0) {
      reply += `Hai **${unpaid.length} spese da saldare** questo mese per un totale di **€${totalUnpaid.toFixed(2)}**:\n\n`;
      unpaid.forEach(e => {
        reply += `- **${e.name}**: €${e.amount.toFixed(2)} (entro il giorno ${e.dueDay} del mese - *${e.category}*)\n`;
      });
    } else {
      reply += `🎉 Complimenti! Tutte le tue spese fisse per questo mese risultano saldate.\n`;
    }
    return { text: reply, model: 'Assistente Smart Local' };
  }

  // C. Domanda su email, chi mi ha scritto, richieste
  if (q.includes('email') || q.includes('messagg') || q.includes('posta') || q.includes('scritto')) {
    const pendingReqs = requests.filter(r => r.status === 'pending');
    let reply = `### ✉️ Stato Email & Richieste da email-ai-agent\n\n`;
    if (pendingReqs.length > 0) {
      reply += `Ci sono **${pendingReqs.length} task aperti** estratti dai thread recenti:\n\n`;
      pendingReqs.slice(0, 6).forEach(r => {
        reply += `- **${r.sender}**: "${r.summary}" *(Oggetto: ${r.subject})*\n`;
      });
    } else {
      reply += `Non ci sono richieste pendenti nelle email sincronizzate.\n`;
    }
    return { text: reply, model: 'Assistente Smart Local' };
  }

  // D. Ricerca nei documenti RAG
  if (sources.length > 0) {
    const main = sources[0];
    let reply = `In base a **${main.chunk.documentTitle}** (rilevanza: ${(main.score * 100).toFixed(0)}%):\n\n`;
    reply += `${main.chunk.content}\n\n`;
    if (sources.length > 1) {
      reply += `*Fonti aggiuntive consultate:* ${sources.slice(1).map(s => s.chunk.documentTitle).join(', ')}.`;
    }
    return { text: reply, model: 'Assistente Locale RAG' };
  }

  // E. Domanda su RAG
  if (q.includes('rag') && (q.includes('cos') || q.includes('funziona'))) {
    return {
      text: `Il **RAG (Retrieval-Augmented Generation)** è una tecnica che permette all'AI di consultare la tua base di conoscenza privata prima di rispondere. Quando poni una domanda, il sistema cerca i paragrafi più rilevanti nei documenti e li invia all'AI insieme alla richiesta, evitando allucinazioni e citando le fonti reali.`,
      model: 'Assistente Locale RAG'
    };
  }

  // Risposta generale contestualizzata
  return {
    text: `Ho analizzato la tua richiesta: "${query}".\n\nAttualmente nell'ecosistema ho visibilità su:\n- **${events.length} eventi** a calendario (Lavoro & Personale)\n- **${requests.length} task** estratti da email-ai-agent\n- **${expenses.length} spese fisse** registrate\n- **${ecosystem?.documents?.length || 0} documenti** nel RAG\n\nPuoi chiedermi di verificare attività future, scadenze, spese da pagare o informazioni contenute nei tuoi documenti.`,
    model: 'Assistente Smart Local'
  };
}
