'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, MessageSquare, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DetailPayload } from '../../shared/api-types';
import { CrmTab } from '../components/CrmTab';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher } from '../components/format';
import { LimiteDeError } from './LimiteDeError';
import { PanelChat, type CabeceraChat } from './PanelChat';
import { PanelResumen } from './PanelResumen';

export const SOLAPAS_CONTACTO = ['chat', 'resumen', 'crm'] as const;
export type SolapaContacto = (typeof SOLAPAS_CONTACTO)[number];

const META: Record<SolapaContacto, { label: string; icon: typeof User }> = {
  chat: { label: 'Chat', icon: MessageSquare },
  resumen: { label: 'Resumen', icon: User },
  crm: { label: 'CRM', icon: Users },
};

type Detalle = DetailPayload & { header: CabeceraChat & { contactId: number | null; contactNotes?: string | null } };

/**
 * Todo lo que hace falta saber del contacto, al lado de lo que se está
 * supervisando.
 *
 * Sin esto, decidir si un prompt está bien obligaba a abrir la ficha en otra
 * pantalla —y al volver se había perdido el lugar en la cola—. Son las tres
 * cosas que se miran para decidir: la conversación, el análisis y el CRM.
 *
 * Comparte la clave SWR del detalle con `PanelResumen`, así que las solapas no
 * agregan pedidos: cambiar de solapa es instantáneo.
 */
export function PanelContacto({
  chatId,
  solapa,
  onSolapa,
  className,
  conSolapas = true,
}: {
  chatId: number;
  solapa: SolapaContacto;
  onSolapa: (s: SolapaContacto) => void;
  className?: string;
  /** En el celular las solapas viven en la barra de abajo, no acá. */
  conSolapas?: boolean;
}) {
  const { data, error, mutate } = useSWR<Detalle>(`${SALES_OPS_API}/contacts/${chatId}`, fetcher, { revalidateOnFocus: false });

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {conSolapas && (
        <div className="flex shrink-0 gap-1 border-b border-border pb-1.5">
          {SOLAPAS_CONTACTO.map((id) => {
            const { label, icon: Icon } = META[id];
            const activa = solapa === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSolapa(id)}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                  activa ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden pt-2">
        {error ? (
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void mutate()} />
        ) : solapa === 'chat' ? (
          <PanelChat header={data?.header ?? null} chatHref={data?.chatHref ?? null} className="h-full" />
        ) : solapa === 'resumen' ? (
          <div className="h-full overflow-y-auto pr-0.5">
            <LimiteDeError nombre="Resumen">
              <PanelResumen chatId={chatId} />
            </LimiteDeError>
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
          </div>
        ) : (
          <div className="h-full overflow-y-auto pr-0.5">
            <LimiteDeError nombre="CRM">
              <CrmTab chatId={chatId} header={data.header} timeline={data.timeline} onSaved={() => void mutate()} />
            </LimiteDeError>
          </div>
        )}
      </div>
    </div>
  );
}
