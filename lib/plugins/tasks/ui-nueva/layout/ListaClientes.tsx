'use client';

import { AlertCircle, Building2 } from 'lucide-react';
import { ES } from '../i18n/es';

export type ClienteIcono = {
  id: number;
  name: string;
  profileImage?: string | null;
};

export type ClientePendiente = ClienteIcono & {
  salesCount: number;
  totalsByCurrency: Record<string, number>;
  nextDueDate: string | null;
};

/** Iniciales para el avatar cuando el cliente no tiene imagen. */
function iniciales(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Los montos vienen en la unidad menor (centavos), como en todo el módulo de ventas. */
function formatoMonto(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(0)}`;
  }
}

function venceEn(iso: string | null) {
  if (!iso) return null;
  const dias = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return ES.clientes.vencidoHace(Math.abs(dias));
  if (dias === 0) return ES.clientes.venceHoy;
  return ES.clientes.venceEn(dias);
}

/**
 * Fila de clientes recientes, en el mismo lenguaje visual que los iconos de
 * espacios: sobre el fondo oscuro del panel, así que los colores van fijos en
 * blanco/transparencias y no con los tokens de tema.
 */
export function ListaClientes(props: {
  clientes: ClienteIcono[];
  activoId: number | null;
  onElegir: (id: number | null) => void;
}) {
  if (!props.clientes.length) return null;

  return (
    <section className="mt-10">
      <div className="text-[10px] uppercase font-black tracking-[0.2em] text-white/50 mb-4">
        {ES.clientes.recientes}
      </div>
      <div className="flex flex-wrap gap-3">
        {props.clientes.map((cliente) => {
          const activo = props.activoId === cliente.id;
          return (
            <button
              key={cliente.id}
              type="button"
              onClick={() => props.onElegir(activo ? null : cliente.id)}
              title={cliente.name}
              className={`group flex items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-colors ${
                activo
                  ? 'border-white/60 bg-white/20 text-white'
                  : 'border-white/15 bg-white/[0.07] text-white/80 hover:bg-white/15 hover:text-white'
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15 text-[11px] font-black text-white">
                {cliente.profileImage
                  // eslint-disable-next-line @next/next/no-img-element -- avatar remoto arbitrario
                  ? <img src={cliente.profileImage} alt="" className="h-full w-full object-cover" />
                  : iniciales(cliente.name) || <Building2 className="h-4 w-4" />}
              </span>
              <span className="max-w-[10rem] truncate text-sm font-semibold">{cliente.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Clientes con ventas sin cobrar. Deliberadamente NO suma montos entre
 * monedas distintas: muestra cada moneda por separado.
 */
export function ListaEsperandoPago(props: {
  clientes: ClientePendiente[];
  activoId: number | null;
  onElegir: (id: number | null) => void;
}) {
  if (!props.clientes.length) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2 text-[10px] uppercase font-black tracking-[0.2em] text-amber-300/80">
        <AlertCircle className="h-3.5 w-3.5" />
        {ES.clientes.esperandoPago}
      </div>
      <div className="flex flex-wrap gap-3">
        {props.clientes.map((cliente) => {
          const activo = props.activoId === cliente.id;
          const vencimiento = venceEn(cliente.nextDueDate);
          const vencido = Boolean(cliente.nextDueDate && new Date(cliente.nextDueDate).getTime() < Date.now());
          return (
            <button
              key={cliente.id}
              type="button"
              onClick={() => props.onElegir(activo ? null : cliente.id)}
              className={`flex flex-col gap-1 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${
                activo
                  ? 'border-amber-300/70 bg-amber-300/20 text-white'
                  : 'border-amber-300/25 bg-amber-300/[0.08] text-white/85 hover:bg-amber-300/15 hover:text-white'
              }`}
            >
              <span className="max-w-[12rem] truncate text-sm font-semibold">{cliente.name}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/70">
                <span className="font-bold tabular-nums text-amber-200">
                  {Object.entries(cliente.totalsByCurrency)
                    .map(([currency, total]) => formatoMonto(total, currency))
                    .join(' · ')}
                </span>
                <span>{ES.clientes.ventasPendientes(cliente.salesCount)}</span>
                {vencimiento && (
                  <span className={vencido ? 'font-semibold text-red-300' : 'text-white/60'}>{vencimiento}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
