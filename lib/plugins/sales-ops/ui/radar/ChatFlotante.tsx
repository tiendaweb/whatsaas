'use client';

import useSWR from 'swr';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FichaChat } from '../components/FichaChat';
import { SALES_OPS_API, fetcher } from '../components/format';
import { ResponsiveModal } from '../skills/ResponsiveModal';

type Detalle = { header?: { name?: string | null }; chatHref?: string };

/**
 * El chat de un contacto encima de la bandeja de Respuestas: se contesta y se
 * vuelve a la lista sin cambiar de vista. Es el mismo `FichaChat` de la ficha
 * (historial, envío, notas internas, programados); "Ficha completa" abre el
 * panel lateral para lo demás.
 */
export function ChatFlotante({ chatId, onClose, onFicha }: { chatId: number | null; onClose: () => void; onFicha: (chatId: number) => void }) {
  const detalle = useSWR<Detalle>(chatId ? `${SALES_OPS_API}/contacts/${chatId}` : null, fetcher);
  const nombre = detalle.data?.header?.name ?? (chatId ? `Chat ${chatId}` : '');
  return (
    <ResponsiveModal
      open={chatId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={nombre}
      description="Chat del contacto. Lo que escribas acá sale por WhatsApp; con «nota interna» queda sólo para el equipo."
      className="sm:max-w-2xl"
      footer={
        chatId && (
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onFicha(chatId)}>
              <ExternalLink className="size-3.5" aria-hidden />
              Ficha completa
            </Button>
          </div>
        )
      }
    >
      {chatId && <FichaChat chatId={chatId} chatHref={detalle.data?.chatHref ?? `/dashboard?chat=${chatId}`} className="flex h-[62vh] min-h-[320px] flex-col" />}
    </ResponsiveModal>
  );
}
