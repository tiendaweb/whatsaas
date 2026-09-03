'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, PenLine, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

/**
 * La opción personalizada: escribir la respuesta a mano.
 *
 * "Mejorar con IA" reusa `POST /api/chats/{id}/improve-reply`, la misma ruta que
 * el inbox. No hay un segundo prompt de mejora en el proyecto y no hacía falta
 * un tercero.
 */
export function CustomReplyPopover({
  chatId,
  initialText,
  open,
  onOpenChange,
  onConfirm,
  canImprove,
}: {
  chatId: number;
  initialText: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (text: string) => void;
  canImprove: boolean;
}) {
  const t = useTranslations('DesktopOperations');
  const [text, setText] = useState(initialText);
  const [improving, setImproving] = useState(false);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  const improve = async () => {
    if (!text.trim() || improving) return;
    setImproving(true);
    try {
      const response = await fetch(`/api/chats/${chatId}/improve-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'improve', composerText: text }),
      });
      if (response.ok) {
        const data = await response.json();
        // La ruta del inbox devuelve `suggestion`, no `text`.
        if (typeof data?.suggestion === 'string' && data.suggestion.trim()) setText(data.suggestion.trim());
      }
    } catch {
      // Silencioso a propósito: si la mejora falla, el texto del usuario sigue
      // ahí y puede mandarlo igual.
    } finally {
      setImproving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <PenLine className="size-3.5" aria-hidden />
          {t('command.customReply')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(28rem,90vw)] space-y-3">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          maxLength={4000}
          placeholder={t('command.customPlaceholder')}
          className="resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          {canImprove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={improve}
              disabled={improving || !text.trim()}
              className="gap-1.5 text-xs"
            >
              {improving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Wand2 className="size-3.5" aria-hidden />}
              {t('command.improve')}
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              onConfirm(text.trim());
              onOpenChange(false);
            }}
          >
            {t('command.useText')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
