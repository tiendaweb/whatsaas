'use client';

import useSWR from 'swr';
import { ExternalLink } from 'lucide-react';
import { ChatEmbebido } from '@/components/chat/ChatEmbebido';
import { cn } from '@/lib/utils';
import { ErrorState, LoadingRows } from './States';
import { SALES_OPS_API, fetcher } from './format';

/** Lo que FichaChat necesita del detalle (subconjunto de `DetailWithHeader`). */
type DetalleMinimo = {
  header: { chatId: number; name: string; remoteJid: string; instanceId: number | null };
};

/**
 * Chat embebido en la ficha del Command Center.
 *
 * Resuelve el JID y la instancia desde el detalle del contacto (sales-ops) y el
 * equipo desde `/api/team`; después delega en `ChatEmbebido` con
 * `key={remoteJid}` para remontar al cambiar de contacto. Ocupa `flex-1 min-h-0`:
 * el padre tiene que ser un flex column con altura acotada.
 */
export function FichaChat({ chatId, chatHref, className }: { chatId: number; chatHref: string; className?: string }) {
  const detalle = useSWR<DetalleMinimo>(`${SALES_OPS_API}/contacts/${chatId}`, fetcher);
  const team = useSWR<{ id: number } | null>('/api/team', fetcher);

  const header = detalle.data?.header;
  const teamId = team.data?.id ?? null;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chat</h2>
        <a
          href={chatHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Abrir chat completo <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {detalle.error ? (
        <ErrorState message={detalle.error instanceof Error ? detalle.error.message : undefined} onRetry={() => void detalle.mutate()} />
      ) : !header || !header.remoteJid ? (
        <LoadingRows rows={4} />
      ) : (
        <ChatEmbebido
          key={header.remoteJid}
          remoteJid={header.remoteJid}
          instanceId={header.instanceId}
          chatId={header.chatId}
          nombre={header.name}
          teamId={teamId}
          puedeEnviar
          className="flex-1 min-h-0"
        />
      )}
    </div>
  );
}
