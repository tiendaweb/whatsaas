'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { AlertCircle, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ConversationSummary = {
  summary: string;
  messageCount: number;
  audioMessageCount: number;
  transcribedAudioCount: number;
  generatedAt: string;
  lastMessageAt: string | null;
  isStale: boolean;
};

type SummaryResponse = {
  summary: ConversationSummary | null;
};

type ApiError = {
  error?: string;
  failedAudioCount?: number;
};

async function summaryFetcher(url: string): Promise<SummaryResponse> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'server_error');
  return data;
}

export function ConversationAiSummary({ chatId }: { chatId?: number | null }) {
  const t = useTranslations('chat_Sidebar.ai_summary');
  const locale = useLocale();
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [failedAudioCount, setFailedAudioCount] = useState(0);
  const endpoint = chatId ? `/api/chats/${chatId}/ai-summary` : null;
  const { data, error: loadError, isLoading, mutate } = useSWR<SummaryResponse>(endpoint, summaryFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const summary = data?.summary || null;

  const generatedAt = useMemo(() => {
    if (!summary?.generatedAt) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(summary.generatedAt));
  }, [locale, summary?.generatedAt]);

  const errorMessage = useMemo(() => {
    if (!errorCode) return null;
    if (errorCode === 'ai_not_configured') return t('error_ai_not_configured');
    if (errorCode === 'conversation_empty') return t('error_empty');
    if (errorCode === 'audio_transcription_failed') {
      return t('error_audio', { count: failedAudioCount });
    }
    return t('error_generic');
  }, [errorCode, failedAudioCount, t]);

  const generate = async () => {
    if (!endpoint || isGenerating) return;
    setIsGenerating(true);
    setErrorCode(null);
    setFailedAudioCount(0);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: ['es', 'en', 'pt'].includes(locale) ? locale : 'es' }),
      });
      const result = (await response.json()) as SummaryResponse & ApiError;
      if (!response.ok) {
        const code = result.error || 'generation_failed';
        const audioFailures = result.failedAudioCount || 0;
        setFailedAudioCount(audioFailures);
        setErrorCode(code);
        toast.error(code === 'audio_transcription_failed'
          ? t('error_audio', { count: audioFailures })
          : code === 'ai_not_configured'
            ? t('error_ai_not_configured')
            : code === 'conversation_empty'
              ? t('error_empty')
              : t('error_generic'));
        return;
      }

      await mutate(result, false);
      toast.success(t('success'));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'generation_failed';
      setErrorCode(code);
      toast.error(t('error_generic'));
    } finally {
      setIsGenerating(false);
    }
  };

  if (!chatId) return null;

  return (
    <Card className="overflow-hidden rounded-xl border-border bg-card shadow-none">
      <CardHeader className="space-y-0 border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            {t('title')}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 text-[10px] font-medium">
            {t('manual_badge')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {isLoading ? (
          <div className="flex min-h-20 items-center justify-center" aria-label={t('loading')}>
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : summary ? (
          <>
            {summary.isStale ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                <RefreshCw className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{t('stale_notice')}</span>
              </div>
            ) : null}
            <div className="break-words whitespace-pre-wrap text-sm leading-6 text-foreground" aria-live="polite">
              {summary.summary}
            </div>
            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              <p>{t('coverage', {
                messages: summary.messageCount,
                audios: summary.transcribedAudioCount,
              })}</p>
              {generatedAt ? <p className="mt-1">{t('generated_at', { date: generatedAt })}</p> : null}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t('empty_title')}</p>
            <p className="text-xs leading-5 text-muted-foreground">{t('description')}</p>
          </div>
        )}

        {errorMessage || loadError ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{errorMessage || t('error_loading')}</span>
          </div>
        ) : null}

        <Button
          type="button"
          variant={summary ? 'outline' : 'default'}
          className="min-h-11 w-full"
          onClick={() => void generate()}
          disabled={isGenerating || isLoading}
        >
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : summary ? (
            <RefreshCw className="size-4" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {t(isGenerating ? 'generating_button' : summary ? 'regenerate_button' : 'generate_button')}
        </Button>
      </CardContent>
    </Card>
  );
}
