'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { preload } from 'swr';
import { ArrowLeft, Loader2, SlidersHorizontal } from 'lucide-react';
import type { DetailPayload } from '../../shared/api-types';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { PROGRAMADOS_API, programadosFetcher, type Programado } from '../cola/PromptsEnCola';
import { ProgramadosContacto } from '../components/ProgramadosContacto';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher } from '../components/format';
import { AvisoBloque } from './AvisoBloque';
import { BarraFocus } from './BarraFocus';
import { BarraPrompt } from './BarraPrompt';
import { Confeti } from './Confeti';
import { FocusMovil, type PestanaMovil } from './FocusMovil';
import { PanelContacto, type SolapaContacto } from './PanelContacto';
import { PanelFiltros } from './PanelFiltros';
import { FinDeEtapa } from './FinDeEtapa';
import { LimiteDeError } from './LimiteDeError';
import { PanelChatIA } from './PanelChatIA';
import { PanelResumen } from './PanelResumen';
import { Button } from '@/components/ui/button';
import { ETAPA_LABELS, FILTROS_INICIALES, guardarFiltros, leerFiltros, type FiltrosFocus } from './tipos';
import { useAtajosTeclado } from './useAtajosTeclado';
import { useBloque } from './useBloque';
import { useColaFocus } from './useColaFocus';

type Cabecera = { chatId: number; name: string; remoteJid: string; instanceId: number | null };
type Detalle = DetailPayload & { header: Cabecera };

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
  const [borrador, setBorrador] = useState<{ texto: string; cuando: string | null; token: number; chatId: number } | null>(null);
  const [pestana, setPestana] = useState<PestanaMovil>('accion');
  const [solapaCliente, setSolapaCliente] = useState<SolapaContacto>('chat');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [esMovil, setEsMovil] = useState(false);
  const tokenRef = useRef(0);
  /**
   * Chats que ya contaron como "ejecutados" en esta sesión. "Ejecutar ahora"
   * puede resolver varias cosas sobre el mismo cliente (un borrador, después
   * una corrección de CRM) y cada una avisa: el contador es de clientes, no de
   * avisos.
   */
  const ejecutadosRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setFiltros(leerFiltros());
    setListo(true);
  }, []);

  // El corte es el mismo `xl` de Tailwind con el que se dibujan las tres
  // columnas: abajo de eso no entra ninguna, así que manda la pantalla táctil.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)');
    const aplicar = () => setEsMovil(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
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
  /**
   * Los programados del equipo, para saber qué texto está por salirle a este
   * contacto.
   *
   * Comparte clave, fetcher y forma con `ProgramadosContacto`, que ya los pide.
   * Esto **no** es un detalle de estilo: SWR cachea por clave, así que dos
   * fetchers distintos sobre la misma URL se pisan y el que pierde recibe la
   * forma del otro. Con un fetcher propio que devolvía un array pelado, acá
   * llegaba `{disponible, rows}` y `.find` reventaba la pantalla.
   */
  const { data: programados } = useSWR(PROGRAMADOS_API, programadosFetcher<Programado>, { revalidateOnFocus: false });

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
    const filas = programados?.rows;
    if (!telefono || !Array.isArray(filas)) return null;
    const vivo = filas.find(
      (p) => (p.status === 'active' || p.status === 'paused') && (p.targetNumbers ?? []).some((n) => String(n).replace(/\D/g, '') === telefono),
    );
    return vivo?.message ?? null;
  }, [header?.remoteJid, programados]);

  /**
   * Los avisos de las pestañas. Comparten clave SWR con los paneles que ya los
   * piden, así que no agregan ni una llamada: sin esto, para saber que un pedido
   * volvió bloqueado había que entrar a la pestaña a mirar.
   */
  const { data: corridas } = useSWR<{ runs: Array<{ status: string; humanRequest: unknown }> }>(
    chatId ? `${SALES_OPS_API}/prompts/queue?chatId=${chatId}&status=all&limit=20` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const avisos = useMemo(() => {
    const telefono = (header?.remoteJid ?? '').split('@')[0].replace(/\D/g, '');
    const filas = programados?.rows;
    const vivos = telefono && Array.isArray(filas)
      ? filas.filter((p) => (p.status === 'active' || p.status === 'paused') && (p.targetNumbers ?? []).some((n) => String(n).replace(/\D/g, '') === telefono)).length
      : 0;
    const bloqueadas = (corridas?.runs ?? []).filter((r) => r.status === 'blocked' && r.humanRequest).length;
    return { programados: vivos, accion: bloqueadas };
  }, [header?.remoteJid, programados, corridas?.runs]);

  const recibirTexto = useCallback(
    (texto: string, cuando?: string | null) => {
      if (!chatId) return;
      tokenRef.current += 1;
      setBorrador({ texto, cuando: cuando ?? null, token: tokenRef.current, chatId });
      // En el celular el borrador aterriza en otra pestaña: sin esto, "Ejecutar
      // ahora" parecía no haber hecho nada.
      if (esMovil) setPestana('programados');
    },
    [chatId, esMovil],
  );

  const saltar = useCallback(() => {
    if (cola.actual) cola.marcar(cola.actual.chatId, 'saltado');
  }, [cola]);

  const encolado = useCallback(() => {
    if (cola.actual) cola.marcar(cola.actual.chatId, 'encolado');
  }, [cola]);

  /**
   * "Ejecutar ahora" resolvió algo acá mismo. Cuenta en la sesión pero NO
   * avanza: la persona se queda en el cliente revisando lo que bajó. Antes
   * nadie marcaba `ejecutado` y el marcador de la etapa decía siempre 0.
   */
  const ejecutado = useCallback(() => {
    const id = cola.actual?.chatId;
    if (!id || ejecutadosRef.current.has(id)) return;
    ejecutadosRef.current.add(id);
    cola.marcar(id, 'ejecutado', { avanzar: false });
  }, [cola]);

  // Las mismas teclas que la supervisión (← → S), con la misma regla de no
  // interferir mientras se escribe.
  useAtajosTeclado({ onSiguiente: cola.avanzar, onAnterior: cola.retroceder, onSaltar: saltar });

  const siguienteEtapa = cola.hayOtraEtapa ? cola.etapas[cola.etapaIdx + 1] : null;

  const barraPrompt = chatId ? (
    <BarraPrompt
      key={chatId}
      chatId={chatId}
      nombre={nombre}
      etapa={cola.etapa}
      mensajeActual={mensajeActual}
      accionRecomendada={cola.actual?.recommendedAction ?? null}
      onTexto={recibirTexto}
      onEncolado={encolado}
      onEjecutado={ejecutado}
      movil={esMovil}
    />
  ) : null;

  /** Hay un borrador de "Ejecutar ahora" esperando en el editor de este contacto. */
  const hayBorradorDelContacto = Boolean(header && borrador?.chatId === header.chatId);

  const programadosDelContacto = header?.remoteJid ? (
    <LimiteDeError nombre="Programados">
      <ProgramadosContacto
        key={header.chatId}
        remoteJid={header.remoteJid}
        nombre={nombre}
        chatId={header.chatId}
        inicialAbierto
        soloSiHay={!esMovil}
        borradorExterno={hayBorradorDelContacto ? borrador : null}
        // El editor no distingue "guardé el borrador" de "pausé uno": sólo se
        // escucha mientras hay un borrador bajado, que es cuando guardar es lo
        // que se está por hacer, y con eso el cliente cuenta como ejecutado.
        onCambio={hayBorradorDelContacto ? ejecutado : undefined}
      />
    </LimiteDeError>
  ) : null;

  /** El contenido de la pestaña abierta en el celular. */
  const panelMovil = (() => {
    if (!chatId) return null;
    if (pestana === 'chat') return <PanelContacto chatId={chatId} solapa={solapaCliente} onSolapa={setSolapaCliente} className="min-h-0 flex-1 p-3" />;
    if (pestana === 'programados') return <div className="min-h-0 flex-1 overflow-y-auto p-3">{programadosDelContacto}</div>;
    if (pestana === 'datos') {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <LimiteDeError nombre="Resumen">
            <PanelResumen chatId={chatId} />
          </LimiteDeError>
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
        <LimiteDeError nombre="Chat IA">
          <PanelChatIA chatId={chatId} className="min-h-0 flex-1" />
        </LimiteDeError>
      </div>
    );
  })();

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
      {!esMovil && (
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
      )}

      {esMovil && centro && (
        <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2 text-muted-foreground" onClick={onSalir}>
            <ArrowLeft className="size-5" aria-hidden />
            Salir
          </Button>
          <span className="truncate text-sm font-medium">{ETAPA_LABELS[cola.etapa]}</span>
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setFiltrosAbiertos(true)} aria-label="Filtros y orden">
            <SlidersHorizontal className="size-4" aria-hidden />
          </Button>
        </header>
      )}

      {centro ?? (esMovil && cola.actual ? (
        <FocusMovil
          etapa={cola.etapa}
          actual={cola.actual}
          posicion={Math.min(cola.idx + 1, Math.max(cola.total, 1))}
          total={cola.total}
          procesados={cola.procesadosEtapa}
          racha={cola.racha}
          terminaEn={bloque.terminaEn}
          pausadoCon={bloque.pausadoCon}
          pausado={bloque.pausado}
          hayBloque={bloque.hayBloque}
          pestana={pestana}
          onPestana={setPestana}
          avisos={avisos}
          onReloj={() => (!bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar())}
          onSalir={onSalir}
          onFiltros={() => setFiltrosAbiertos(true)}
          onAnterior={cola.retroceder}
          onSiguiente={cola.avanzar}
          onSaltar={saltar}
          puedeRetroceder={cola.idx > 0}
          prompt={barraPrompt}
        >
          {panelMovil}
        </FocusMovil>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
          {/* Izquierda: quién es. */}
          <aside className="shrink-0 border-border p-3 xl:w-[300px] xl:overflow-y-auto xl:border-r" aria-label="Resumen del cliente">
            <LimiteDeError nombre="Resumen">{chatId && <PanelResumen chatId={chatId} />}</LimiteDeError>
          </aside>

          {/* Centro: lo que le va a salir, y lo que la IA dijo. */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3">
            {programadosDelContacto}
            {/* Las clases responsive quedan porque `esMovil` recién se sabe
                después de montar: cubren ese primer frame en un teléfono. */}
            {chatId && (
              <LimiteDeError nombre="Chat IA">
                <PanelChatIA chatId={chatId} className="max-h-[55vh] min-h-0 flex-1 xl:max-h-none" />
              </LimiteDeError>
            )}
            {barraPrompt}
          </main>

          {/* Derecha: el cliente entero —mensajes, notas, tareas y programados—
              con las mismas cuatro solapas que la supervisión. Antes era sólo el
              chat, y para ver una tarea o un programado había que salir. */}
          <aside className="flex min-h-[50vh] shrink-0 flex-col border-border p-3 xl:min-h-0 xl:w-[420px] xl:border-l" aria-label="Cliente">
            {errorDetalle ? (
              <ErrorState message={errorDetalle instanceof Error ? errorDetalle.message : undefined} />
            ) : chatId ? (
              <PanelContacto chatId={chatId} solapa={solapaCliente} onSolapa={setSolapaCliente} className="min-h-0 flex-1" />
            ) : null}
          </aside>
        </div>
      ))}

      {/* Los mismos filtros de la barra de escritorio, en una hoja desde abajo. */}
      <Sheet open={filtrosAbiertos} onOpenChange={setFiltrosAbiertos}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetTitle className="mb-2 text-sm">Filtros y orden</SheetTitle>
          <PanelFiltros filtros={filtros} onFiltros={cambiarFiltros} />
        </SheetContent>
      </Sheet>

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
