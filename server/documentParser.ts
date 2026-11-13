import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

export interface ParsedDocumentResult {
  text: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'md' | 'txt' | 'json';
  meta?: Record<string, any>;
}

export async function parseDocumentBuffer(
  filename: string,
  buffer: Buffer
): Promise<ParsedDocumentResult> {
  const lower = filename.toLowerCase();

  // 1. PDF
  if (lower.endsWith('.pdf')) {
    let parser: any = null;
    try {
      parser = new PDFParse({ data: buffer });
      const res = await parser.getText();
      const extractedText = (res.text || '').trim();
      return {
        text: extractedText || 'Contenuto PDF non rilevato o composto esclusivamente da immagini scannerizzate.',
        fileType: 'pdf',
        meta: { pages: res.total || 1 }
      };
    } finally {
      if (parser && typeof parser.destroy === 'function') {
        try { await parser.destroy(); } catch {}
      }
    }
  }

  // 2. Word (.docx / .doc)
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    try {
      const res = await mammoth.convertToMarkdown({ buffer });
      let text = (res.value || '').trim();
      if (!text) {
        const raw = await mammoth.extractRawText({ buffer });
        text = (raw.value || '').trim();
      }
      return {
        text: text || 'Documento Word vuoto.',
        fileType: 'docx'
      };
    } catch (e: any) {
      const raw = await mammoth.extractRawText({ buffer });
      return {
        text: raw.value || `Errore lettura Word: ${e.message}`,
        fileType: 'docx'
      };
    }
  }

  // 3. Excel (.xlsx / .xls)
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = xlsx.read(buffer, { type: 'buffer' });
    let combinedText = '';

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv = xlsx.utils.sheet_to_csv(sheet);
      if (csv && csv.trim()) {
        combinedText += `### Foglio Excel: "${sheetName}"\n\n`;
        // Converti prime righe in tabella markdown o mantieni csv strutturato
        combinedText += '```csv\n' + csv.trim() + '\n```\n\n';
      }
    }

    return {
      text: combinedText.trim() || 'Cartella di lavoro Excel priva di celle con testo.',
      fileType: 'xlsx',
      meta: { sheets: wb.SheetNames }
    };
  }

  // 4. CSV
  if (lower.endsWith('.csv')) {
    const content = buffer.toString('utf-8');
    return {
      text: `### Dati Tabellari CSV: ${filename}\n\n\`\`\`csv\n${content.trim()}\n\`\`\``,
      fileType: 'csv'
    };
  }

  // 5. JSON
  if (lower.endsWith('.json')) {
    const raw = buffer.toString('utf-8');
    try {
      const parsed = JSON.parse(raw);
      return {
        text: `### Dati JSON: ${filename}\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``,
        fileType: 'json'
      };
    } catch {
      return { text: raw, fileType: 'json' };
    }
  }

  // 6. Immagini (.png, .jpg, .jpeg, .webp)
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
    return {
      text: `### Immagine archiviata: ${filename}\nFile immagine conservato per consultazione e anteprima visiva diretta.`,
      fileType: 'image' as any
    };
  }

  // 7. Testo semplice / Markdown
  const text = buffer.toString('utf-8');
  return {
    text: text.trim(),
    fileType: lower.endsWith('.md') ? 'md' : 'txt'
  };
}

