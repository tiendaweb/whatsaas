'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Loader2, Send, ShieldCheck, Square } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  BatchResponse,
  BatchResultRow,
  CommandItem,
  PlannedAction,
} from '@/lib/desktop/command-center/types';

/**
 * El único paso que puede frenar un error, y el punto donde el diseño original
 * fallaba: mostraba el texto pero no A QUIÉN le llegaba.
 *
 * El modo de falla característico de un lote redactado por IA no es el texto
 * malo: es el texto bueno a la persona equivocada. Por eso cada envío encabeza
 * con el destinatario **resuelto en el servidor** (nombre + número enmascarado),
 * y el botón de ejecutar no se habilita hasta que cada envío tenga su acuse.
 */
export function ReviewDialog({
  open,
  onOpenChange,
  plan,
  itemsById,
  teamId,
  batchId,
  onEditText,
  onConfirm,
  onStop,
  running,
  sentCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlannedAction[];
  itemsById: Map<string, CommandItem>;
  teamId: number;
  batchId: string;
  onEditText: (itemId: string, text: string) => void;
  onConfirm: () => void;
  onStop: () => void;
  running: boolean;
  sentCount: number;
}) {
  const t = useTranslations('DesktopOperations');
  const [validation, setValidation] = useState<BatchResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [acked, setAcked] = useState<Set<string>>(new Set());

  const sends = useMemo(() => plan.filter((entry) => entry.action.type === 'send-message'), [plan]);
  const others = useMemo(() => plan.filter((entry) => entry.action.type !== 'send-message'), [plan]);

  useEffect(() => {
    if (!open) {
      setValidation(null);
      setAcked(new Set());
      return;
    }
    let cancelled = false;
    setValidating(true);
    fetch('/api/escritorio/bandeja/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, batchId, actions: plan }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: BatchResponse | null) => {
        if (!cancelled) setValidation(data);
      })
      .catch(() => {
        if (!cancelled) setValidation(null);
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });
    return () => {
      cancelled = true;
    };
    // El plan se congela al abrir: si el usuario edita un texto, la validación
    // que importa es la de permisos y destinatario, que no cambia con el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId, batchId]);

  const rowFor = (itemId: string): BatchResultRow | undefined =>
    validation?.results.find((row) => row.itemId === itemId);

  const blocked = validation ? validation.results.filter((row) => !row.ok) : [];
  const ready = validation ? validation.results.filter((row) => row.ok).length : plan.length;
  const allAcked = sends.every((entry) => acked.has(entry.itemId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(46rem,95vw)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('command.review.title')}</DialogTitle>
          <DialogDescription>
            {validating
              ? t('command.review.checking')
              : t('command.review.summary', { ready, blocked: blocked.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {sends.map((entry) => {
            if (entry.action.type !== 'send-message') return null;
            const item = itemsById.get(entry.itemId);
            const row = rowFor(entry.itemId);
            const isAcked = acked.has(entry.itemId);
            return (
              <div
                key={entry.itemId}
                className={cn(
                  'space-y-2 rounded-lg border p-3',
                  row && !row.ok ? 'border-destructive/50 bg-destructive/5' : 'border-border/60',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row?.recipient?.name ?? item?.reply?.contactName ?? item?.title}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {row?.recipient?.masked ?? '···'}
                      {row?.signatureName ? ` · ${t('command.review.signedAs', { name: row.signatureName })}` : ''}
                    </p>
                  </div>
                  {row && !row.ok && (
                    <span className="flex-none text-xs font-medium text-destructive">
                      {t(`command.errors.${row.error ?? 'invalid'}`)}
                    </span>
                  )}
                </div>

                <Textarea
                  value={entry.action.text}
                  onChange={(event) => onEditText(entry.itemId, event.target.value)}
                  rows={3}
                  maxLength={4000}
                  className="resize-none text-sm"
                />

                {item?.suggestions.some(
                  (suggestion) =>
                    entry.action.type === 'send-message' &&
                    suggestion.text === entry.action.text &&
                    suggestion.warning,
                ) && (
                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 flex-none" aria-hidden />
                    {t('command.review.unverified')}
                  </p>
                )}

                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={isAcked}
                    onCheckedChange={() =>
                      setAcked((current) => {
                        const next = new Set(current);
                        if (next.has(entry.itemId)) next.delete(entry.itemId);
                        else next.add(entry.itemId);
                        return next;
                      })
                    }
                  />
                  {t('command.review.acknowledge')}
                </label>
              </div>
            );
          })}

          {others.length > 0 && (
            <div className="rounded-lg border border-border/60 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t('command.review.otherActions')}</p>
              <ul className="space-y-1.5">
                {others.map((entry) => {
                  const item = itemsById.get(entry.itemId);
                  const row = rowFor(entry.itemId);
                  return (
                    <li key={entry.itemId} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate">
                          {t(`command.actions.${entry.action.type}`)} · {item?.title ?? entry.itemId}
                        </span>
                        {entry.action.type === 'set-task-ai-detail' ? (
                          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{entry.action.text}</span>
                        ) : null}
                      </span>
                      {row && !row.ok && (
                        <span className="flex-none text-xs text-destructive">
                          {t(`command.errors.${row.error ?? 'invalid'}`)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden />
            {sends.length > 0 ? t('command.review.irreversible', { count: sends.length }) : t('command.review.reversible')}
          </p>
          <div className="flex items-center gap-2">
            {/* Mientras el lote corre, el diálogo tapa la barra de selección: el
                botón de detener tiene que estar acá, que es donde el usuario
                está mirando. Es el único freno de lo que todavía no salió. */}
            {running ? (
              <Button type="button" variant="destructive" onClick={onStop} className="gap-1.5">
                <Square className="size-4" aria-hidden />
                {t('command.stop')}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {t('command.cancel')}
              </Button>
            )}
            <Button type="button" onClick={onConfirm} disabled={running || validating || !allAcked || !plan.length}>
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('command.review.sending', { done: sentCount, total: sends.length })}
                </>
              ) : (
                <>
                  <Send className="size-4" aria-hidden />
                  {t('command.review.execute', { count: plan.length })}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
