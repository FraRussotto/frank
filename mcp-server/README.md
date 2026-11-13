# Frank Super Agent • Connettore MCP (Model Context Protocol)

Questo connettore MCP espone l'intero ecosistema di **Frank** (Second Brain, scadenze personali, spese fisse, email AI, agenda e archivio RAG) come strumenti nativi (**Tools**), risorse (**Resources**) e prompt (**Prompts**) utilizzabili da qualsiasi client AI compatibile con lo standard **Model Context Protocol** (Claude Desktop, Cursor, Antigravity, Zed, Continue, LibreChat, ecc.).

---

## 🚀 Istruzioni di Configurazione

### 1. Claude Desktop
Modifica il file di configurazione di Claude Desktop:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Aggiungi il server `frank`:
```json
{
  "mcpServers": {
    "frank": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/Users/fra_russo/Frank/mcp-server/index.ts"
      ]
    }
  }
}
```

---

### 2. Cursor IDE
In Cursor:
1. Apri **Settings** (`Cmd + ,`) -> **Features** -> **MCP Servers**.
2. Clicca su **Add New MCP Server**:
   - **Name**: `Frank`
   - **Type**: `command`
   - **Command**: `npx tsx /Users/fra_russo/Frank/mcp-server/index.ts`

Oppure nel file di configurazione `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "frank": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/fra_russo/Frank/mcp-server/index.ts"
      ]
    }
  }
}
```

---

### 3. Antigravity & Agentic Tools
Puoi aggiungere Frank al file di configurazione MCP di Antigravity:
```json
{
  "mcpServers": {
    "frank": {
      "command": "npx",
      "args": [
        "tsx",
        "/Users/fra_russo/Frank/mcp-server/index.ts"
      ]
    }
  }
}
```

---

## 🛠️ Strumenti (Tools) Disponibili

| Tool | Descrizione | Parametri |
| :--- | :--- | :--- |
| `frank_get_daily_briefing` | Recupera il briefing mattutino esecutivo di Frank suddiviso tra Lavoro (email e riunioni) e Personale (scadenze e spese). | Nessuno |
| `frank_ask` | Interroga Frank Super Agente in linguaggio naturale con visibilità multi-dominio su tutti i reparti. | `query` (stringa) |
| `frank_get_deadlines` | Consulta le scadenze e gli adempimenti registrati in Frank. | `scope` ('personal' \| 'work' \| 'all'), `status` ('pending' \| 'completed' \| 'all'), `days_ahead` (numero) |
| `frank_add_deadline` | Registra una nuova scadenza o adempimento direttamente da una chat esterna. | `title`, `due_date` (YYYY-MM-DD), `category`, `priority`, `scope`, `notes` |
| `frank_complete_deadline` | Contrassegna una scadenza come completata. | `deadline_id` (stringa) |
| `frank_get_expenses` | Visualizza spese fisse, budget mensile e pagamenti manuali vs RID/SDD. | `exclude_auto_debit` (boolean) |
| `frank_get_calendar_events` | Recupera gli impegni e le riunioni a calendario sincronizzati. | `days` (numero di giorni futuri) |
| `frank_get_email_tasks` | Visualizza le azioni operative estratte con AI dai thread di posta elettronica. | `status`, `urgency`, `limit` |
| `frank_search_knowledge` | Cerca documenti, visure, contratti, note e memorie di chat compattate nel Second Brain RAG. | `query` (stringa), `limit` (numero) |
| `frank_add_note` | Salva una nuova nota nel Second Brain RAG (salvata anche come file `.md` sul disco). | `title`, `content`, `category` |

---

## 📦 Risorse (Resources) & Prompts

### Risorse URI:
- `frank://briefing/today`: Il briefing esecutivo formattato in Markdown per il giorno corrente.
- `frank://deadlines/pending`: JSON completo di tutte le scadenze aperte.
- `frank://expenses/overview`: JSON del riepilogo spese fisse e totale normalizzato al mese.

### Prompt Templates:
- `frank_morning_standup`: Prepara automaticamente il resoconto mattutino delle priorità del giorno.
- `frank_financial_audit`: Avvia una revisione finanziaria delle uscite del mese.

---

## 💡 Architettura Ibrida ad Alta Affidabilità
Il connettore MCP opera con un'architettura a **doppio livello**:
1. **Live Mode**: Se la web app Frank è aperta (`http://localhost:5173`), il server MCP si coordina con l'orchestratore in tempo reale per le risposte multi-agente e i briefing aggiornati.
2. **Offline Mode**: Se la web app Frank è chiusa, il server MCP interroga direttamente i database SQLite (`frank_agent.sqlite` e `database.sqlite`) e i file salvati su disco locale, garantendo che **Claude, Cursor e le altre AI possano sempre accedere ai tuoi dati anche a Frank spento**.
