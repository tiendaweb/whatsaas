'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { CalendarClock, ListChecks, Loader2, MessageSquare, Scissors, StickyNote, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DetailPayload } from '../../shared/api-types';
import { ContactTaskPanel } from '@/components/chat/ContactTaskPanel';
import { NuevaNotaInterna, NuevaTarea } from './AccionesRapidasContacto';
import { ClienteYMembresia } from './ClienteYMembresia';
import { CrmTab } from '../components/CrmTab';
import { ProgramadosContacto } from '../components/ProgramadosContacto';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher } from '../components/format';
import { LimiteDeError } from './LimiteDeError';
import { PanelChat, type CabeceraChat } from './PanelChat';

export const SOLAPAS_CONTACTO = ['chat', 'notas', 'tareas', 'programar'] as const;
export type SolapaContacto = (typeof SOLAPAS_CONTACTO)[number];

/** Etiqueta e ícono de cada solapa. Exportado: la barra móvil de la supervisión dibuja las mismas. */
export const META: Record<SolapaContacto, { label: string; icon: typeof User }> = {
  chat: { label: 'Mensajes', icon: MessageSquare },
  notas: { label: 'Notas', icon: StickyNote },
  tareas: { label: 'Tareas', icon: ListChecks },
  programar: { label: 'Programar', icon: CalendarClock },
};

type Detalle = DetailPayload & { header: CabeceraChat & { contactId: number | null; contactNotes?: string | null } };

/**
 * El contexto que no está en las burbujas: si hay una automatización corriendo
 * y qué señales dejó el radar sin atender.
 *
 * Un mensaje ya dice de dónde salió, pero "hay un bot trabajando este chat
 * ahora mismo" no se ve en ningún mensaje concreto — y es justo lo que hay que
 * saber antes de escribir encima.
 */
function AvisoDelChat({ detalle, chatId }: { detalle: Detalle | undefined; chatId: number }) {
  const a = detalle?.analysis;
  const sinAtender = (detalle?.signals ?? []).filter((s) => s.status === 'new' || s.status === 'seen');
  const [cortando, setCortando] = useState(false);
  const [cortado, setCortado] = useState(false);

  /**
   * Cortar el flujo de este chat sin salir.
   *
   * Es el caso de todos los días: se va a escribir algo a mano y hay un bot a
   * mitad de una secuencia. Antes había que salir del Focus, buscar el chat en
   * WhatsPro y apagarlo ahí — y para cuando volvías, ya había mandado otro.
   */
  const cortar = async () => {
    if (!window.confirm('¿Cortar la automatización de este chat? Se cierra la secuencia en curso y no lo toma otro flujo.')) return;
    setCortando(true);
    try {
      const res = await fetch('/api/plugins/sales-ops/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, cortar: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; sesionesCerradas?: number };
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      setCortado(true);
      toast.success(body.sesionesCerradas ? `Flujo cortado y ${body.sesionesCerradas} secuencia(s) cerrada(s).` : 'Flujo cortado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cortar.');
    } finally {
      setCortando(false);
    }
  };

  if (!a?.automationActive && !a?.autoReplyDetected && sinAtender.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1">
      {a?.automationActive && !cortado && (
        <>
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            Automatización activa
          </span>
          <button
            type="button"
            onClick={() => void cortar()}
            disabled={cortando}
            className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-1.5 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {cortando ? <Loader2 className="size-2.5 animate-spin" aria-hidden /> : <Scissors className="size-2.5" aria-hidden />}
            Cortar flujo
          </button>
        </>
      )}
      {cortado && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Flujo cortado</span>
      )}
      {a?.autoReplyDetected && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Respuestas automáticas</span>
      )}
      {sinAtender.length > 0 && (
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          Radar: {sinAtender.length} sin atender
        </span>
      )}
    </div>
  );
}

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
  /** Remonta la lista de tareas al crear una: el panel trae su propio SWR. */
  const [tareasKey, setTareasKey] = useState(0);

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-hidden">
        {error ? (
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void mutate()} />
        ) : solapa === 'chat' ? (
          <PanelChat
            header={data?.header ?? null}
            chatHref={data?.chatHref ?? null}
            className="h-full"
            aviso={<AvisoDelChat detalle={data} chatId={chatId} />}
          />
        ) : solapa === 'tareas' ? (
          <div className="h-full space-y-2 overflow-y-auto pr-0.5">
            <NuevaTarea chatId={chatId} onCreada={() => setTareasKey((n) => n + 1)} />
            <LimiteDeError nombre="Tareas">
              <ContactTaskPanel key={tareasKey} chatId={chatId} />
            </LimiteDeError>
          </div>
        ) : solapa === 'programar' ? (
          <div className="h-full overflow-y-auto pr-0.5">
            <LimiteDeError nombre="Programados">
              {data?.header?.remoteJid ? (
                <ProgramadosContacto
                  key={chatId}
                  remoteJid={data.header.remoteJid}
                  nombre={data.header.name}
                  chatId={chatId}
                  inicialAbierto
                  avisarSinPermiso
                  diasEnviados={90}
                />
              ) : (
                <div className="flex h-24 items-center justify-center text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                </div>
              )}
            </LimiteDeError>
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
          </div>
        ) : (
          /* Notas y CRM son el mismo objeto —qué sabemos de este cliente— y
             `CrmTab` ya los edita juntos: etapa, etiquetas, campos, notas y el
             historial de notas internas del chat. */
          <div className="h-full space-y-2 overflow-y-auto pr-0.5">
            {/* Arriba de todo: registrarlo como cliente y darle la membresía.
                Es el final feliz de la conversación y estaba a tres pantallas
                de acá, así que en la práctica se anotaba en una nota y se
                registraba después — o nunca. */}
            <LimiteDeError nombre="Cliente">
              <ClienteYMembresia chatId={chatId} contactId={data.header.contactId ?? null} nombre={data.header.name} />
            </LimiteDeError>
            {data.header.remoteJid && (
              <NuevaNotaInterna remoteJid={data.header.remoteJid} instanceId={data.header.instanceId} onCreada={() => void mutate()} />
            )}
            <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
              Abajo se edita todo lo que define al contacto: la etapa del embudo, las etiquetas, los campos personalizados del equipo y las
              notas de la ficha. Se guarda sólo lo que cambiaste.
            </p>
            <LimiteDeError nombre="Notas">
              <CrmTab chatId={chatId} header={data.header} timeline={data.timeline} onSaved={() => void mutate()} />
            </LimiteDeError>
          </div>
        )}
      </div>

      {/* Abajo y no arriba: es la barra que se usa todo el tiempo, y en una
          columna alta el borde inferior queda más cerca de la mano que el
          superior. Dos filas de dos: cuatro etiquetas en una sola fila quedan de seis
          caracteres cada una, y "Programar" no entra. Con el panel angosto es
          más legible perder 20 px de alto que abreviar los nombres. */}
      {conSolapas && (
        <div className="grid shrink-0 grid-cols-2 gap-1 border-t border-border pt-1.5">
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
                  'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                  activa ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}
