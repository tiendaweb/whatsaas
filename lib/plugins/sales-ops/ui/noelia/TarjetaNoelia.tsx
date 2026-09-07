'use client';

import { forwardRef, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DetailPayload } from '../../shared/api-types';
import { AccionesTarjeta, type AccionesTarjetaHandle } from './AccionesTarjeta';
import type { EstadoCaso } from './tipos';
import {
  customString,
  dineroEnJuego,
  evidenciaRadar,
  nivelDeConfianza,
  nosotrosLoFrenamos,
  productoDelCaso,
  razonesHumanas,
  traducirBloqueoDominante,
  traducirIntencion,
  traducirOrigen,
} from './traducciones';

type Detalle = DetailPayload & { header: { name: string; customData: Record<string, unknown> } };

const TONO_ESTADO: Record<EstadoCaso['tono'], string> = {
  ambar: 'bg-[var(--mn-amber-bg)] text-[var(--mn-amber-soft)]',
  verde: 'bg-[var(--mn-msg-bg)] text-[var(--mn-green)]',
  neutro: 'bg-white/5 text-[var(--mn-soft)]',
};

/**
 * Tarjeta de decisión de Modo Noelia. Reproduce la maqueta aprobada de
 * aapp.space/business-command#modo-noelia: cabecera con píldora de prioridad,
 * nombre grande y metadatos en una línea; dos cajas de lectura (RADAR DICE y
 * FOCUS RECOMIENDA); el mensaje listo en verde; las cinco acciones; y el panel
 * de contexto plegado con TIMELINE y POR QUÉ ESTÁ PRIMERO.
 */
export const TarjetaNoelia = forwardRef<AccionesTarjetaHandle, {
  chatId: number;
  detalle: Detalle;
  onVerConversacion: () => void;
  onResuelto: (tipo: 'aprobado' | 'pospuesto') => void;
  onSaltar: () => void;
  onDetalleCambio: () => void;
}>(function TarjetaNoelia({ chatId, detalle, onVerConversacion, onResuelto, onSaltar, onDetalleCambio }, ref) {
  const a = detalle.analysis;
  const custom = detalle.header.customData ?? {};
  const [contexto, setContexto] = useState(false);
  const [estadoAccion, setEstadoAccion] = useState<EstadoCaso | null>(null);

  useEffect(() => {
    setContexto(false);
    setEstadoAccion(null);
  }, [chatId]);

  const razones = useMemo(() => razonesHumanas(detalle, custom), [detalle, custom]);
  const critico = nosotrosLoFrenamos(detalle);
  const intencion = customString(custom, 'radar_intencion') || a?.intent;
  const bloqueo = customString(custom, 'radar_bloqueo_dominante') || a?.objectionType;
  const prioridadAlta = Boolean(critico || a?.paymentPending || (a?.priorityScore ?? 0) >= 70);
  const evidencia = useMemo(() => evidenciaRadar(detalle), [detalle]);
  const linea = useMemo(() => resumenDelTimeline(detalle), [detalle]);

  const estadoBase: EstadoCaso = critico
    ? { texto: '⚠ ESPERANDO EQUIPO · NOSOTROS LO FRENAMOS', tono: 'ambar' }
    : a?.paymentPending
      ? { texto: '⚠ PAGO PENDIENTE · CONFIRMAR CON EL CLIENTE', tono: 'ambar' }
      : { texto: '⚠ ESPERANDO TU DECISIÓN', tono: 'ambar' };
  const estado = estadoAccion ?? estadoBase;

  return (
    <article className="mx-auto w-full max-w-4xl rounded-[18px] border border-[var(--mn-case-line)] bg-[var(--mn-case)] p-4 sm:p-[18px]">
      <header className="flex flex-col gap-3 min-[820px]:flex-row min-[820px]:items-start min-[820px]:justify-between min-[820px]:gap-4">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-[var(--mn-amber-bg)] px-2 py-[5px] text-[11px] font-black text-[var(--mn-amber)]">
            {prioridadAlta ? '🔥 OPORTUNIDAD ALTA' : '⚡ DECISIÓN PENDIENTE'}
          </span>
          <h2 className="mb-0.5 mt-2 truncate text-[25px] font-black leading-tight tracking-tight">{detalle.header.name.toUpperCase()}</h2>
          <p className="m-0 text-[13px] text-[var(--mn-soft)]">
            Origen: <b className="font-black">{traducirOrigen(a)}</b>
            <span className="px-2" aria-hidden>&nbsp;</span>
            Producto: <b className="font-black">{productoDelCaso(a)}</b>
            <span className="px-2" aria-hidden>&nbsp;</span>
            Valor: <b className="font-black">{dineroEnJuego(a)}</b>
          </p>
        </div>
        <span className={`inline-flex shrink-0 self-start rounded-full px-2 py-[5px] text-[11px] font-black ${TONO_ESTADO[estado.tono]}`} role="status">
          {estado.texto}
        </span>
      </header>

      <div className="mt-4 grid gap-2.5 min-[820px]:grid-cols-2">
        <Caja label="RADAR DICE" texto={`${traducirIntencion(intencion)} · ${traducirBloqueoDominante(bloqueo)}`} pie={evidencia ? `Evidencia: “${evidencia}”` : 'Evidencia: sin cita textual en el expediente.'} />
        <Caja label="FOCUS RECOMIENDA" texto={a?.recommendedAction || 'Revisar el contexto antes de decidir.'} pie={`Confianza: ${nivelDeConfianza(a)}`} />
      </div>

      <AccionesTarjeta
        ref={ref}
        chatId={chatId}
        detalle={detalle}
        contextoAbierto={contexto}
        onContexto={() => setContexto((abierto) => !abierto)}
        onEstado={setEstadoAccion}
        onResuelto={onResuelto}
        onSaltar={onSaltar}
        onDetalleCambio={onDetalleCambio}
      />

      {contexto && (
        <div className="mt-3 grid gap-2.5 min-[820px]:grid-cols-2">
          <Caja fondo="contexto" label="TIMELINE" texto={linea}>
            <button type="button" onClick={onVerConversacion} className="mt-2 text-[12px] font-black text-[var(--mn-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]">
              Ver la conversación completa
            </button>
          </Caja>
          <Caja fondo="contexto" label="POR QUÉ ESTÁ PRIMERO">
            <ul className="m-0 space-y-1.5 text-[14px] leading-relaxed text-[var(--mn-soft)]">
              {razones.map((razon) => (
                <li key={razon} className="flex gap-2">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--mn-accent)]" aria-hidden />
                  <span>{razon}</span>
                </li>
              ))}
            </ul>
          </Caja>
        </div>
      )}
    </article>
  );
});

function Caja({ label, texto, pie, fondo = 'panel', children }: {
  label: string;
  texto?: string;
  pie?: string;
  fondo?: 'panel' | 'contexto';
  children?: ReactNode;
}) {
  return (
    <section className={`rounded-[13px] border border-[var(--mn-box-line)] p-3.5 ${fondo === 'panel' ? 'bg-[var(--mn-panel)]' : 'bg-[var(--mn-context)]'}`}>
      <small className="block text-[12px] font-black tracking-[0.06em] text-[var(--mn-label)]">{label}</small>
      {texto && <p className="mb-0 mt-1.5 text-[14px] leading-relaxed text-[var(--mn-text)]">{texto}</p>}
      {children}
      {pie && <em className="mt-1.5 block text-[12px] not-italic text-[var(--mn-dim)]">{pie}</em>}
    </section>
  );
}

/** Una línea con el recorrido del caso, al estilo «consultó → aceptó → esperando». */
function resumenDelTimeline(detalle: DetailPayload): string {
  const hitos = detalle.timeline.filter((t): t is Extract<typeof t, { who: string }> => 'who' in t);
  if (!hitos.length) return 'Todavía no hay hitos registrados en el expediente.';
  const pasos = hitos.slice(-5).map((h) => {
    const quien = h.who === 'cliente' ? 'cliente' : h.who === 'nota' ? 'nota' : 'equipo';
    const texto = h.text.trim().replace(/\s+/g, ' ');
    return `${quien}: ${texto.length > 60 ? `${texto.slice(0, 59)}…` : texto}`;
  });
  return pasos.join(' → ');
}
