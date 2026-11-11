import React, { useMemo } from 'react';
import { marked } from 'marked';

interface AiMessageRendererProps {
  content: string;
  className?: string;
  isUser?: boolean;
}

export const AiMessageRenderer: React.FC<AiMessageRendererProps> = ({
  content,
  className = '',
  isUser = false,
}) => {
  const htmlContent = useMemo(() => {
    if (!content) return '';
    if (isUser) return '';

    let formatted = content;

    // Replace urgency markdown tags with styled badges
    formatted = formatted.replace(
      /\*\*\[🔴\s*ALTA\]\*\*/gi,
      `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 mr-1.5 shadow-2xs">🔴 ALTA</span>`
    );
    formatted = formatted.replace(
      /\[🔴\s*ALTA\]/gi,
      `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 mr-1.5 shadow-2xs">🔴 ALTA</span>`
    );

    formatted = formatted.replace(
      /\*\*\[🟡\s*MEDIA\]\*\*/gi,
      `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 mr-1.5 shadow-2xs">🟡 MEDIA</span>`
    );
    formatted = formatted.replace(
      /\[🟡\s*MEDIA\]/gi,
      `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 mr-1.5 shadow-2xs">🟡 MEDIA</span>`
    );

    formatted = formatted.replace(
      /\*\*\[🟢\s*BASSA\]\*\*/gi,
      `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mr-1.5 shadow-2xs">🟢 BASSA</span>`
    );
    formatted = formatted.replace(
      /\[🟢\s*BASSA\]/gi,
      `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mr-1.5 shadow-2xs">🟢 BASSA</span>`
    );

    try {
      return marked.parse(formatted, {
        gfm: true,
        breaks: true,
      }) as string;
    } catch (e) {
      console.error('Failed to parse markdown', e);
      return formatted;
    }
  }, [content, isUser]);

  if (isUser) {
    return <div className={`whitespace-pre-wrap ${className}`}>{content}</div>;
  }

  return (
    <div
      className={`ai-markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};
