'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleAlert, HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { BatchResultRow, CommandItem } from '@/lib/desktop/command-center/types';

/**
 * Resultado fila por fila.
 *
 * `send_unknown` no ofrece reintento: un timeout no significa que el mensaje no
 * haya salido, y reintentar ahí es duplicar exactamente en el caso para el que
 * existiría el botón. Se enlaza a la conversación para que el humano mire.
 */
export function ResultDialog({
  open,
  onOpenChange,
  results,
  itemsById,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: BatchResultRow[];
  itemsById: Map<string, CommandItem>;
  onRetry: (itemIds: string[]) => void;
}) {
  const t = useTranslations('DesktopOperations');
  const retryable = results.filter((row) => !row.ok && row.error !== 'send_unknown').map((row) => row.itemId);
  const okCount = results.filter((row) => row.ok).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[min(38rem,95vw)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('command.result.title')}</DialogTitle>
          <DialogDescription>
            {t('command.result.summary', { ok: okCount, failed: results.length - okCount })}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {results.map((row) => {
            const item = itemsById.get(row.itemId);
            const unknown = row.error === 'send_unknown';
            return (
              <li key={row.itemId} className="flex items-start gap-2 rounded-lg border border-border/50 p-2.5 text-sm">
                {row.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 flex-none text-primary" aria-hidden />
                ) : unknown ? (
                  <HelpCircle className="mt-0.5 size-4 flex-none text-amber-600" aria-hidden />
                ) : (
                  <CircleAlert className="mt-0.5 size-4 flex-none text-destructive" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate">{item?.title ?? row.itemId}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.ok
                      ? row.idempotent
                        ? t('command.result.alreadySent')
                        : t('command.result.done')
                      : t(`command.errors.${row.error ?? 'invalid'}`)}
                  </p>
                </div>
                {!row.ok && row.href && (
                  <Link href={row.href} className="flex-none text-xs font-medium text-primary hover:underline">
                    {t('command.result.openChat')}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2">
          {retryable.length > 0 && (
            <Button type="button" variant="outline" onClick={() => onRetry(retryable)}>
              {t('command.result.retryFailed', { count: retryable.length })}
            </Button>
          )}
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('command.result.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
