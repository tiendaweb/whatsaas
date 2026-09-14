'use client';

import { MessageSquare, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * "Abrir el chat" y "Abrir IA": los dos accesos que faltaban al lado de la ficha.
 *
 * Los tres abren la MISMA ficha del panel derecho, cada uno en su pestaña: la
 * ficha en Resumen, éste en Chat y el otro en IA. No abren una ventana nueva a
 * propósito: decidir una fila de la Cola es leer la conversación **al lado** de
 * lo que hay que decidir, y una pestaña aparte obliga a ir y volver perdiendo
 * la sección, el filtro y el lote abierto. El enlace al chat completo sigue
 * estando adentro de la ficha, en su pestaña Chat.
 *
 * Cuando el contenedor no sabe abrir la ficha —la Cola embebida en el Focus,
 * que ya muestra el chat al costado— no se dibuja nada.
 */
export function AbrirChat({ onOpen, nombre, className }: { onOpen?: () => void; nombre?: string | null; className?: string }) {
  if (!onOpen) return null;
  const etiqueta = nombre ? `Abrir el chat de ${nombre}` : 'Abrir el chat';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
      aria-label={etiqueta}
      title={etiqueta}
    >
      <MessageSquare className="size-3.5" aria-hidden />
    </button>
  );
}

/**
 * Abre la ficha en IA: el hilo de pedidos al conector de ese contacto.
 *
 * Es donde se le deja una indicación nueva —"fijate qué quedó pendiente y
 * contestale"—, y lo que se escribe ahí **queda encolado**: aparece en esta
 * misma Cola como una indicación, con su estado. Por eso el botón vive acá, en
 * la fila que se está mirando: el pedido nace del ítem que tenés adelante.
 */
export function AbrirIa({ onOpen, nombre, className }: { onOpen?: () => void; nombre?: string | null; className?: string }) {
  if (!onOpen) return null;
  const etiqueta = nombre ? `Pedirle algo a la IA sobre ${nombre}` : 'Pedirle algo a la IA';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary',
        className,
      )}
      aria-label={etiqueta}
      title={etiqueta}
    >
      <Wand2 className="size-3.5" aria-hidden />
    </button>
  );
}
