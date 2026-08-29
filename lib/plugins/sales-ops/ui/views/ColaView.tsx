'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { QueueListPayload } from '../../shared/api-types';
import { BatchCard } from '../cola/BatchCard';
import { NuevoLoteDialog } from '../cola/NuevoLoteDialog';
import { RevisarLote } from '../cola/RevisarLote';
import { ConectoresCard } from '../cola/ConectoresCard';
import { QUEUE_ENDPOINT, batchPhase, fetcher } from '../cola/api';

/**
 * Vista Cola (doc 05 §5): lotes propuestos arriba, en curso / hechos abajo,
 * "Nuevo lote" y la pantalla "Revisar lote". Aprobar no envía.
 */
export function ColaView({ presetChatIds }: { presetChatIds?: number[] } = {}) {
  const { data, isLoading, error, mutate } = useSWR<QueueListPayload>(QUEUE_ENDPOINT, fetcher, { refreshInterval: 60_000 });
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const batches = data?.batches ?? [];
  const { proposed, inProgress, closed } = useMemo(() => {
    const groups = { proposed: [] as typeof batches, inProgress: [] as typeof batches, closed: [] as typeof batches };
    for (const batch of batches) {
      const phase = batchPhase(batch.byStatus);
      if (phase === 'proposed') groups.proposed.push(batch);
      else if (phase === 'closed') groups.closed.push(batch);
      else groups.inProgress.push(batch);
    }
    return groups;
  }, [batches]);

  if (openBatch) {
    return <RevisarLote batchId={openBatch} onBack={() => setOpenBatch(null)} onChanged={() => mutate()} />;
  }

  return (
    <div className="space-y-6">
      <ConectoresCard />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lotes propuestos</h2>
          <Button type="button" size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            Nuevo lote
          </Button>
        </div>
        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{String(error.message)}</div>}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}
        {!isLoading && proposed.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No hay lotes esperando aprobación. Armá uno con “Nuevo lote” o pedíselo al conector.
          </div>
        )}
        {proposed.map((batch) => (
          <BatchCard key={batch.batchId} batch={batch} onOpen={setOpenBatch} />
        ))}
      </section>

      {(inProgress.length > 0 || closed.length > 0) && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">En curso / hechos</h2>
          {inProgress.map((batch) => (
            <BatchCard key={batch.batchId} batch={batch} onOpen={setOpenBatch} />
          ))}
          {closed.map((batch) => (
            <BatchCard key={batch.batchId} batch={batch} onOpen={setOpenBatch} />
          ))}
        </section>
      )}

      <NuevoLoteDialog
        open={creating}
        onOpenChange={setCreating}
        presetChatIds={presetChatIds}
        onCreated={(batchId) => {
          void mutate();
          setOpenBatch(batchId);
        }}
      />
    </div>
  );
}
