'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { preload } from 'swr';
import { ExternalLink, Loader2 } from 'lucide-react';
import { ChatEmbebido } from '@/components/chat/ChatEmbebido';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { DetailPayload } from '../../shared/api-types';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { ProgramadosContacto } from '../components/ProgramadosContacto';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher } from '../components/format';
import { AvisoBloque } from './AvisoBloque';
import { BarraFocus } from './BarraFocus';
import { BarraPrompt } from './BarraPrompt';
import { Confeti } from './Confeti';
import { FinDeEtapa } from './FinDeEtapa';
import { LimiteDeError } from './LimiteDeError';
import { PanelChatIA } from './PanelChatIA';
import { PanelResumen } from './PanelResumen';
import { FILTROS_INICIALES, guardarFiltros, leerFiltros, type FiltrosFocus } from './tipos';
import { useBloque } from './useBloque';
import { useColaFocus } from './useColaFocus';

type Cabecera = { chatId: number; name: string; remoteJid: string; instanceId: number | null };
type Detalle = DetailPayload & { header: Cabecera };
type Programado = { id: number; status: string; message: string | null; targetNumbers: string[] };

const PROGRAMADOS_API = '/api/plugins/scheduled-messages';
const detalleUrl = (chatId: number) => `${SALES_OPS_API}/contacts/${chatId}`;

/**
 * Focus: procesar clientes de a uno, contra reloj (doc 08).
 *
 * Ocupa el viewport entero por encima del propio Command Center. No monta un
 * overlay sobre el shell: el shell directamente no dibuja su rail ni su
 * encabezado cuando la vista es `focus`, así que acá abajo no hay nada.
 */
export function FocusView({ owner, onSalir }: { owner: OwnerFilterValue; onSalir: () => void }) {
  const [filtros, setFiltros] = useState<FiltrosFocus>(FILTROS_INICIALES);
  const [listo, setListo] = useState(false);
  /**
   * Texto que bajó de "Ejecutar ahora" al editor de programados. Lleva el chat
   * al que pertenece: limpiarlo con un efecto al cambiar de cliente corría
   * DESPUÉS del render, y en ese hueco el editor del cliente nuevo podía
   * quedarse con el texto que se escribió para el anterior.
   */
  const [borrador, setBorrador] = useState<{ texto: string; token: number; chatId: number } | null>(null);
  const [verEnviados, setVerEnviados] = useState(true);
  const tokenRef = useRef(0);

  useEffect(() => {
    setFiltros(leerFiltros());
    setListo(true);
  }, []);

  const cambiarFiltros = useCallback((f: FiltrosFocus) => {
    setFiltros(f);
    guardarFiltros(f);
  }, []);

  const cola = useColaFocus(filtros, owner);
  const bloque = useBloque();
  const { arrancar, hayBloque } = bloque;

  // Entrar a Focus arranca el reloj: la pantalla es el compromiso.
  useEffect(() => {
    if (listo && !hayBloque) arrancar('foco');
  }, [listo, hayBloque, arrancar]);

  // Takeover: nada de WhatsPro ni del Command Center detrás, y el título dice
  // dónde está parado quien mira la pestaña.
  useEffect(() => {
    const anterior = document.title;
    const scroll = document.body.style.overflow;
    document.title = 'Focus — Command Center';
    document.body.style.overflow = 'hidden';
    return () => {
      document.title = anterior;
      document.body.style.overflow = scroll;
    };
  }, []);

  const chatId = cola.actual?.chatId ?? null;
  const { data: detalle, error: errorDetalle } = useSWR<Detalle>(chatId ? detalleUrl(chatId) : null, fetcher, { revalidateOnFocus: false });
  const { data: team } = useSWR<{ id: number } | null>('/api/team', fetcher);
  const { data: programados } = useSWR<Programado[]>(PROGRAMADOS_API, async (url: string) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  });

  // El siguiente se pide mientras se trabaja el actual: pasar de cliente no
  // puede esperar a la red.
  useEffect(() => {
    if (cola.siguiente) preload(detalleUrl(cola.siguiente.chatId), fetcher).catch(() => {});
  }, [cola.siguiente]);

  const header = detalle?.header ?? null;
  const nombre = header?.name ?? cola.actual?.name ?? '';

  /** Texto del programado vivo del contacto, para que la IA lo corrija en vez de escribir otro. */
  const mensajeActual = useMemo(() => {
    const telefono = (header?.remoteJid ?? '').split('@')[0].replace(/\D/g, '');
    if (!telefono || !programados) return null;
    const vivo = programados.find(
      (p) => (p.status === 'active' || p.status === 'paused') && (p.targetNumbers ?? []).some((n) => String(n).replace(/\D/g, '') === telefono),
    );
    return vivo?.message ?? null;
  }, [header?.remoteJid, programados]);

  const recibirTexto = useCallback(
    (texto: string) => {
      if (!chatId) return;
      tokenRef.current += 1;
      setBorrador({ texto, token: tokenRef.current, chatId });
    },
    [chatId],
  );

  const saltar = useCallback(() => {
    if (cola.actual) cola.marcar(cola.actual.chatId, 'saltado');
  }, [cola]);

  const encolado = useCallback(() => {
    if (cola.actual) cola.marcar(cola.actual.chatId, 'encolado');
  }, [cola]);

  // Atajos. Se ignoran mientras se escribe: la `s` de "seguimiento" no puede
  // saltear al cliente.
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.key === 'ArrowRight') cola.avanzar();
      else if (e.key === 'ArrowLeft') cola.retroceder();
      else if (e.key.toLowerCase() === 's') saltar();
    };
    window.addEventListener('keydown', escuchar);
    return () => window.removeEventListener('keydown', escuchar);
  }, [cola, saltar]);

  const siguienteEtapa = cola.hayOtraEtapa ? cola.etapas[cola.etapaIdx + 1] : null;

  const centro = (() => {
    if (cola.error) return <ErrorState className="m-4" message={cola.error} onRetry={cola.recargar} />;
    if (cola.cargando) {
      return (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      );
    }
    if (cola.terminada || !cola.actual) {
      return (
        <FinDeEtapa
          etapa={cola.etapa}
          siguiente={siguienteEtapa}
          sesion={cola.sesion}
          procesados={cola.procesadosEtapa}
          onSiguiente={cola.pasarASiguienteEtapa}
          onVolverAEmpezar={cola.volverAPrimeraEtapa}
          onSalir={onSalir}
        />
      );
    }
    return null;
  })();

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-background text-foreground">
      <BarraFocus
        etapa={cola.etapa}
        procesados={cola.procesadosEtapa}
        total={cola.total}
        posicion={Math.min(cola.idx + 1, Math.max(cola.total, 1))}
        sesion={cola.sesion}
        filtros={filtros}
        onFiltros={cambiarFiltros}
        terminaEn={bloque.terminaEn}
        pausadoCon={bloque.pausadoCon}
        pausado={bloque.pausado}
        hayBloque={bloque.hayBloque}
        onReloj={() => (!bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar())}
        onSalir={onSalir}
        onAnterior={cola.retroceder}
        onSiguiente={cola.avanzar}
        onSaltar={saltar}
        puedeRetroceder={cola.idx > 0}
        hayActual={Boolean(cola.actual)}
      />

      {centro ?? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
          {/* Izquierda: quién es. */}
          <aside className="shrink-0 border-border p-3 xl:w-[300px] xl:overflow-y-auto xl:border-r" aria-label="Resumen del cliente">
            <LimiteDeError nombre="Resumen">{chatId && <PanelResumen chatId={chatId} />}</LimiteDeError>
          </aside>

          {/* Centro: lo que le va a salir, y lo que la IA dijo. */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3">
            {header?.remoteJid && (
              <LimiteDeError nombre="Programados">
                <ProgramadosContacto
                  key={header.chatId}
                  remoteJid={header.remoteJid}
                  nombre={nombre}
                  chatId={header.chatId}
                  inicialAbierto
                  soloSiHay
                  borradorExterno={borrador?.chatId === header.chatId ? borrador : null}
                />
              </LimiteDeError>
            )}
            {/* En móvil el hilo con la IA no puede comerse la pantalla: se acota
                y scrollea adentro, con el prompt siempre pegado abajo. */}
            {chatId && (
              <LimiteDeError nombre="Chat IA">
                <PanelChatIA chatId={chatId} className="max-h-[55vh] min-h-0 flex-1 xl:max-h-none" />
              </LimiteDeError>
            )}
            {chatId && (
              <BarraPrompt
                key={chatId}
                chatId={chatId}
                nombre={nombre}
                etapa={cola.etapa}
                mensajeActual={mensajeActual}
                accionRecomendada={cola.actual?.recommendedAction ?? null}
                onTexto={recibirTexto}
                onEncolado={encolado}
              />
            )}
          </main>

          {/* Derecha: la conversación, para responder sin salir. */}
          <aside className="flex min-h-[50vh] shrink-0 flex-col border-border p-3 xl:min-h-0 xl:w-[420px] xl:border-l" aria-label="Chat del contacto">
            <div className="flex shrink-0 items-center justify-between gap-2 pb-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chat</h2>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                  <Checkbox checked={verEnviados} onCheckedChange={(v) => setVerEnviados(v === true)} className="size-3.5" aria-label="Ver los mensajes enviados" />
                  Enviados
                </label>
                {detalle?.chatHref && (
                  <a href={detalle.chatHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    Abrir <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </div>
            </div>
            {errorDetalle ? (
              <ErrorState message={errorDetalle instanceof Error ? errorDetalle.message : undefined} />
            ) : header?.remoteJid ? (
              <LimiteDeError nombre="Chat">
                <ChatEmbebido
                key={header.remoteJid}
                remoteJid={header.remoteJid}
                instanceId={header.instanceId}
                chatId={header.chatId}
                nombre={nombre}
                teamId={team?.id ?? null}
                ocultarEnviados={!verEnviados}
                puedeEnviar
                  className={cn('min-h-0 flex-1')}
                />
              </LimiteDeError>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
              </div>
            )}
          </aside>
        </div>
      )}

      <Confeti activo={cola.terminada && !cola.cargando} />

      <AvisoBloque
        abierto={bloque.mostrarAviso}
        tipo={bloque.tipo}
        hechos={cola.enBloque}
        onOtroBloque={() => {
          cola.reiniciarBloque();
          bloque.arrancar('foco');
        }}
        onDescanso={() => bloque.arrancar('descanso')}
        onSalir={() => {
          bloque.terminar();
          onSalir();
        }}
      />
    </div>
  );
}
