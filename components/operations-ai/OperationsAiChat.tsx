'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Clock3, Copy, Loader2, MessageCircle, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Message = {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  source: string;
  surface: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type Status = { pending: number; connectorReady: boolean; connectorLastUsedAt: string | null };

type Payload = { messages: Message[]; status?: Status };

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<Payload>;
};

/** Una sola conversación por equipo, visible desde Tareas y Centro de Comandos. */
export function OperationsAiChat({ surface }: { surface: 'tasks' | 'command-center' }) {
  const t = useTranslations('OperationsAIChat');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const { data, mutate } = useSWR<Payload>(
    open ? '/api/operations-ai' : null,
    fetcher,
    { refreshInterval: open ? 20_000 : 0, revalidateOnFocus: false },
  );

  const messages = data?.messages ?? [];
  const status = data?.status;
  const runPhrase = t('runPhrase');

  const copyPhrase = async () => {
    try {
      await navigator.clipboard.writeText(runPhrase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, open]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(false);
    setText('');
    try {
      const response = await fetch('/api/operations-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, surface }),
      });
      if (!response.ok) throw new Error(String(response.status));
      await mutate();
    } catch {
      setText(content);
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-3 md:bottom-5 md:right-5">
      {open ? (
        <section
          className="flex h-[min(38rem,calc(100dvh-11rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-2xl md:h-[min(38rem,calc(100dvh-7rem))]"
          role="dialog"
          aria-label={t('title')}
        >
          <header className="flex items-center gap-3 border-b border-border/60 bg-primary/[0.04] px-4 py-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{t('title')}</h2>
              <p className="truncate text-xs text-muted-foreground">{t('subtitle')}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)} aria-label={t('close')}>
              <X className="size-4" aria-hidden />
            </Button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
            {!data ? (
              <div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-primary" /></div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageCircle className="mb-3 size-8 text-primary/60" aria-hidden />
                <p className="text-sm font-medium">{t('emptyTitle')}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('emptyDescription')}</p>
              </div>
            ) : messages.map((message) => {
              const own = message.role === 'user';
              const connector = !own && !['integrated-ai', 'system'].includes(message.source);
              // La respuesta no llega en el momento: la deja el conector cuando
              // termina de recorrer la cola de prompts.
              const pending = own && (message.metadata as { status?: string } | null | undefined)?.status === 'pending';
              return (
                <div key={message.id} className={cn('flex', own ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-5 shadow-sm',
                    own ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border/60 bg-background text-foreground',
                  )}>
                    {connector ? <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">{t('connectorReport', { source: message.source })}</p> : null}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {pending ? (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium opacity-80">
                        <Clock3 className="size-3" aria-hidden />
                        {t('pending')}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {status && (status.pending > 0 || !status.connectorReady) ? (
            <div className="border-t border-border/60 bg-muted/40 px-3 py-2.5 text-xs">
              {!status.connectorReady ? (
                <p className="flex items-start gap-1.5 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
                  <span>
                    {t('noConnector')}{' '}
                    <Link href="/plugins/chatgpt-connector" className="font-medium text-primary hover:underline">
                      {t('noConnectorLink')}
                    </Link>
                  </span>
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="flex items-start gap-1.5 text-muted-foreground">
                    <Clock3 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                    <span>{t('waiting', { count: status.pending })}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyPhrase()}
                    className="flex w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left font-medium text-foreground transition-colors hover:border-primary/50"
                  >
                    {copied
                      ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                      : <Copy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="truncate">{copied ? t('copied') : runPhrase}</span>
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <form onSubmit={submit} className="border-t border-border/60 bg-background p-3">
            {error ? <p className="mb-2 text-xs text-destructive">{t('error')}</p> : null}
            <div className="flex items-end gap-2">
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={2}
                maxLength={8000}
                placeholder={t('placeholder')}
                className="min-h-11 resize-none rounded-2xl"
              />
              <Button type="submit" size="icon" className="size-11 shrink-0 rounded-2xl" disabled={sending || !text.trim()} aria-label={t('send')}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
            <p className="mt-2 px-1 text-[10px] leading-4 text-muted-foreground">{t('safety')}</p>
          </form>
        </section>
      ) : null}

      <Button
        type="button"
        size="icon"
        className="size-14 rounded-2xl shadow-xl"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? t('close') : t('open')}
      >
        {open ? <X className="size-5" aria-hidden /> : <MessageCircle className="size-5" aria-hidden />}
      </Button>
    </div>
  );
}
