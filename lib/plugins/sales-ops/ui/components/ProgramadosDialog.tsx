'use client';

import useSWR from 'swr';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProgramadosContacto } from './ProgramadosContacto';
import { ErrorState, LoadingRows } from './States';
import { SALES_OPS_API, fetcher } from './format';

/**
 * Los programados de un contacto, en modal, desde la lista.
 *
 * La lista sólo sabe que el contacto TIENE programados (`row.scheduled`), no
 * cuáles: el teléfono no viaja al cliente sin enmascarar. Así que el modal pide
 * la ficha para resolver el JID y desde ahí reusa el mismo bloque que vive en
 * la pestaña Chat — un solo lugar donde se crean y se editan.
 */
type DetalleMinimo = { header: { remoteJid: string; name: string } };

export function ProgramadosDialog({
  chatId,
  nombre,
  onClose,
  onCambio,
}: {
  /** null = cerrado. */
  chatId: number | null;
  nombre: string;
  onClose: () => void;
  onCambio?: () => void;
}) {
  const detalle = useSWR<DetalleMinimo>(chatId ? `${SALES_OPS_API}/contacts/${chatId}` : null, fetcher);
  const header = detalle.data?.header;

  return (
    <Dialog open={chatId != null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">Programados · {header?.name || nombre}</DialogTitle>
          <DialogDescription>Mensajes que le van a salir a este contacto.</DialogDescription>
        </DialogHeader>

        {detalle.error ? (
          <ErrorState
            message={detalle.error instanceof Error ? detalle.error.message : undefined}
            onRetry={() => void detalle.mutate()}
          />
        ) : !header ? (
          <LoadingRows rows={2} />
        ) : (
          <ProgramadosContacto
            remoteJid={header.remoteJid}
            nombre={header.name || nombre}
            chatId={chatId}
            inicialAbierto
            avisarSinPermiso
            onCambio={onCambio}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
