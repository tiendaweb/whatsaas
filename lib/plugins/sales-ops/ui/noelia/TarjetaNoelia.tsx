'use client';

import { forwardRef, useEffect, useMemo, useState } from 'react';
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
 * Tarjeta de decisión de Modo Noelia.
 *
 * Sigue la maqueta de aapp.space/business-command#modo-noelia (píldora de
 * prioridad, nombre grande, metadatos en una línea, RADAR DICE / FOCUS
 * RECOMIENDA, mensaje listo y acciones), pero comprimida: la tarjeta ocupa el
 * alto disponible y sólo el mensaje scrollea adentro, así el caso entero entra
 * en una pantalla tanto en el celular como en el escritorio.
 */
export const TarjetaNoelia = forwardRef<AccionesTarjetaHandle, {
  chatId: number;
  detalle: Detalle;
  onVerConversacion: () => void;
  onResuelto: (tipo: 'enviado' | 'encolado' | 'programado' | 'pospuesto') => void;
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

  const estadoBase: EstadoCaso = critico
    ? { texto: '⚠ NOSOTROS LO FRENAMOS', tono: 'ambar' }
    : a?.paymentPending
      ? { texto: '⚠ PAGO PENDIENTE', tono: 'ambar' }
      : { texto: '⚠ ESPERA TU DECISIÓN', tono: 'ambar' };
  const estado = estadoAccion ?? estadoBase;

  return (
    <article className="flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-[var(--mn-case-line)] bg-[var(--mn-case)] p-2.5 sm:p-3.5">
      <header className="shrink-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full bg-[var(--mn-amber-bg)] px-2 py-0.5 text-[10px] font-black text-[var(--mn-amber)]">
            {prioridadAlta ? '🔥 ALTA' : '⚡ PENDIENTE'}
          </span>
          <h2 className="min-w-0 flex-1 truncate text-lg font-black leading-tight tracking-tight sm:text-[22px]">{detalle.header.name.toUpperCase()}</h2>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${TONO_ESTADO[estado.tono]}`} role="status">{estado.texto}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[var(--mn-muted)] sm:text-xs">
          {traducirOrigen(a)} · {productoDelCaso(a)} · <b className="font-black text-[var(--mn-text)]">{dineroEnJuego(a)}</b>
        </p>
      </header>

      <div className="grid shrink-0 gap-1.5 sm:grid-cols-2">
        <Caja label="RADAR DICE" texto={`${traducirIntencion(intencion)} · ${traducirBloqueoDominante(bloqueo)}`} pie={evidencia ? `“${evidencia}”` : null} />
        <Caja label="FOCUS RECOMIENDA" texto={a?.recommendedAction || 'Revisar el contexto antes de decidir.'} pie={`Confianza: ${nivelDeConfianza(a)}`} />
      </div>

      {contexto && (
        <section className="shrink-0 rounded-xl border border-[var(--mn-box-line)] bg-[var(--mn-context)] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <small className="text-[11px] font-black tracking-[0.06em] text-[var(--mn-label)]">POR QUÉ ESTÁ PRIMERO</small>
            <button type="button" onClick={onVerConversacion} className="shrink-0 text-[11px] font-black text-[var(--mn-accent)] hover:underline xl:hidden">Ver el chat</button>
          </div>
          <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto text-[12px] leading-snug text-[var(--mn-soft)]">
            {razones.map((razon) => (
              <li key={razon} className="flex gap-1.5">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--mn-accent)]" aria-hidden />
                <span>{razon}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
    </article>
  );
});

function Caja({ label, texto, pie }: { label: string; texto: string; pie?: string | null }) {
  return (
    <section className="rounded-xl border border-[var(--mn-box-line)] bg-[var(--mn-panel)] p-2">
      <small className="block text-[10px] font-black tracking-[0.06em] text-[var(--mn-label)]">{label}</small>
      <p className="mb-0 mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-[var(--mn-text)]">{texto}</p>
      {pie && <em className="mt-0.5 block truncate text-[11px] not-italic text-[var(--mn-dim)]">{pie}</em>}
    </section>
  );
}
