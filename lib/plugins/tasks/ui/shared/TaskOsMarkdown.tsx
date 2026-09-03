'use client';

import { cn } from '@/lib/utils';

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-emerald-200/90">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white/90">$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em class="italic text-white/75">$1</em>');
  out = out.replace(/~~([^~]+)~~/g, '<s class="text-white/40">$1</s>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200">$1</a>');
  return out;
}

export function markdownToTaskOsHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | 'task' | null = null;

  const closeList = () => {
    if (!listType) return;
    html.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('```')) {
      if (inCode) {
        html.push(`<pre class="my-3 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs leading-relaxed text-white/80"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    if (/^#{1,3}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const text = line.replace(/^#+\s*/, '');
      const cls = level === 1 ? 'text-lg font-semibold text-white mt-4 mb-2'
        : level === 2 ? 'text-base font-semibold text-white/90 mt-3 mb-1.5'
          : 'text-sm font-semibold text-white/80 mt-2 mb-1';
      html.push(`<h${Math.min(level, 3)} class="${cls}">${inlineMarkdown(text)}</h${Math.min(level, 3)}>`);
      continue;
    }

    if (line.startsWith('> ')) {
      closeList();
      html.push(`<blockquote class="my-2 border-l-2 border-white/20 pl-3 text-sm italic text-white/55">${inlineMarkdown(line.slice(2))}</blockquote>`);
      continue;
    }

    const taskMatch = line.match(/^- \[( |x|X)\]\s+(.*)$/);
    if (taskMatch) {
      if (listType !== 'task') {
        closeList();
        html.push('<ul class="my-2 space-y-1">');
        listType = 'task';
      }
      const checked = taskMatch[1].toLowerCase() === 'x';
      html.push(`<li class="flex items-start gap-2 text-sm ${checked ? 'text-white/35 line-through' : 'text-white/75'}"><span class="mt-0.5 text-white/30">${checked ? '☑' : '☐'}</span><span>${inlineMarkdown(taskMatch[2])}</span></li>`);
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul class="my-2 list-disc space-y-1 pl-5">');
        listType = 'ul';
      }
      html.push(`<li class="text-sm text-white/75">${inlineMarkdown(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol class="my-2 list-decimal space-y-1 pl-5">');
        listType = 'ol';
      }
      html.push(`<li class="text-sm text-white/75">${inlineMarkdown(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p class="mb-2 text-sm leading-relaxed text-white/75">${inlineMarkdown(line)}</p>`);
  }

  closeList();
  if (inCode && codeBuf.length) {
    html.push(`<pre class="my-3 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/80"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }

  return html.join('');
}

export type TaskOsMarkdownProps = {
  content: string;
  className?: string;
  emptyLabel?: string;
};

export function TaskOsMarkdown({ content, className, emptyLabel = 'Sin contenido' }: TaskOsMarkdownProps) {
  if (!content.trim()) {
    return <p className="text-sm text-white/25">{emptyLabel}</p>;
  }

  return (
    <div
      className={cn('task-os-markdown break-words', className)}
      dangerouslySetInnerHTML={{ __html: markdownToTaskOsHtml(content) }}
    />
  );
}