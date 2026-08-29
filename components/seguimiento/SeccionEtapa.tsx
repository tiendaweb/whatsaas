'use client';

import { useState } from 'react';
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
};

export function SeccionEtapa({ seccion, densidad, plegada, onTogglePlegada, seleccionadoJid, onAbrirChat, renderMenu }: Props) {
  const t = useTranslations('Seguimiento');
  const [expandida, setExpandida] = useState(false);
  const [ordenSinFicha, setOrdenSinFicha] = useState<OrdenSinFicha>('ultimo');

  const esSinFicha = seccion.tipo === 'sinFicha';
  const lista = esSinFicha ? ordenarSinFicha(seccion.contactos, ordenSinFicha) : seccion.contactos;
  const visibles = expandida ? lista : lista.slice(0, LIMITE_VISIBLE);
  const restantes = lista.length - visibles.length;

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
          {lista.length === 0 ? (
            <div className="min-h-14 rounded-lg border border-dashed border-border/70" />
          ) : (
            <div className={densidad === 'lista' ? 'flex flex-col' : 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2'}>
              {visibles.map((c) => (
                <TarjetaContacto
                  key={c.chatId}
                  contacto={c}
                  densidad={densidad}
                  seleccionada={seleccionadoJid === c.remoteJid}
                  onAbrirChat={onAbrirChat}
                  menu={renderMenu?.(c)}
                />
              ))}
            </div>
          )}
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
