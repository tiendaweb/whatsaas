'use client';

import { useState } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ContactoCard, Densidad, OrdenSinFicha, Seccion } from './tipos';
import { TarjetaContacto } from './TarjetaContacto';
import { ordenarSinFicha } from './utils';

const LIMITE_VISIBLE = 12;

type Props = {
  seccion: Seccion;
  densidad: Densidad;
  plegada: boolean;
  onTogglePlegada: (key: string) => void;
  seleccionadoJid: string | null;
  onAbrirChat: (c: ContactoCard) => void;
  renderMenu?: (c: ContactoCard) => React.ReactNode;
  /** Falso en móvil o sin permiso de contactos: la tarjeta no se arrastra. */
  arrastrable?: boolean;
};

export function SeccionEtapa({
  seccion,
  densidad,
  plegada,
  onTogglePlegada,
  seleccionadoJid,
  onAbrirChat,
  renderMenu,
  arrastrable = false,
}: Props) {
  const t = useTranslations('Seguimiento');
  const [expandida, setExpandida] = useState(false);
  const [ordenSinFicha, setOrdenSinFicha] = useState<OrdenSinFicha>('ultimo');

  const esSinFicha = seccion.tipo === 'sinFicha';
  const lista = esSinFicha ? ordenarSinFicha(seccion.contactos, ordenSinFicha) : seccion.contactos;
  const visibles = expandida ? lista : lista.slice(0, LIMITE_VISIBLE);
  const restantes = lista.length - visibles.length;

  // "Sin ficha" no recibe: el contacto no existe en `contacts` y volver a ese
  // estado significaría borrarle la ficha, no moverlo.
  const aceptaDrop = arrastrable && !esSinFicha;

  const titulo =
    seccion.tipo === 'etapa' && seccion.etapa
      ? `${seccion.etapa.emoji ?? ''} ${seccion.etapa.name}`.trim()
      : seccion.tipo === 'sinEtapa'
        ? t('section.unassigned')
        : t('section.noContact');

  return (
    <section aria-label={titulo} className="border-b border-border/60 last:border-b-0">
      <header className="sticky top-14 z-[5] flex items-center gap-2 bg-background px-4 py-2">
        <button
          type="button"
          onClick={() => onTogglePlegada(seccion.key)}
          aria-expanded={!plegada}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium"
        >
          <span className="truncate">{titulo}</span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="tabular-nums text-muted-foreground">{lista.length}</span>
          <ChevronDown className={cn('ml-1 size-4 text-muted-foreground transition-transform', plegada && '-rotate-90')} />
        </button>
        {esSinFicha && !plegada && (
          <Select value={ordenSinFicha} onValueChange={(v) => setOrdenSinFicha(v as OrdenSinFicha)}>
            <SelectTrigger size="sm" className="h-7 w-auto gap-1 border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="ultimo">{t('sort.lastMessage')}</SelectItem>
              <SelectItem value="nombre">{t('sort.name')}</SelectItem>
              <SelectItem value="noLeidos">{t('sort.unread')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </header>

      {!plegada && (
        <div className="px-4 pb-4">
          {esSinFicha && <p className="mb-2 text-xs text-muted-foreground">{t('section.noContactHint')}</p>}
          <Droppable droppableId={seccion.key} type="CARD" isDropDisabled={!aceptaDrop}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  'rounded-lg transition-colors',
                  // Único feedback de drop (spec §3): fondo tenue y borde punteado.
                  snapshot.isDraggingOver && 'bg-muted/60 outline outline-1 outline-dashed outline-foreground/30',
                  lista.length === 0
                    ? 'min-h-14 border border-dashed border-border/70'
                    : densidad === 'lista'
                      ? 'flex flex-col'
                      : 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2',
                )}
              >
                {visibles.map((c, index) => (
                  <Draggable
                    key={c.chatId}
                    draggableId={`c${c.chatId}`}
                    index={index}
                    isDragDisabled={!arrastrable || c.contactId === null}
                  >
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        className={cn(
                          arrastrable && c.contactId !== null && 'cursor-grab active:cursor-grabbing',
                          dragSnapshot.isDragging && 'opacity-90',
                        )}
                      >
                        <TarjetaContacto
                          contacto={c}
                          densidad={densidad}
                          seleccionada={seleccionadoJid === c.remoteJid}
                          onAbrirChat={onAbrirChat}
                          menu={renderMenu?.(c)}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
          {lista.length > LIMITE_VISIBLE && (
            <div className="mt-2 flex justify-center">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setExpandida((v) => !v)}>
                {expandida ? t('section.showLess') : t('section.showMore', { count: restantes })}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
