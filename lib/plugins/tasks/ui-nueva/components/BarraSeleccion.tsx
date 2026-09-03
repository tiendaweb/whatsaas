'use client';

import { CheckCircle, Trash, X } from 'lucide-react';
import { ES } from '../i18n/es';

export function BarraSeleccion(props: {
  n: number;
  onCompletar: () => void;
  onEliminar: () => void;
  onSalir: () => void;
}) {
  return (
    <div className="fixed bottom-8 left-1/2 z-30 -translate-x-1/2">
      <div className="bg-neutral-900 text-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-6">
        <div>
          <div className="text-[10px] uppercase font-black tracking-[0.2em] text-neutral-400">
            {ES.rotulos.seleccionadas}
          </div>
          <div className="text-sm font-bold">{ES.contadores.tareas(props.n)}</div>
        </div>
        <button
          type="button"
          onClick={props.onCompletar}
          className="flex items-center gap-2 text-emerald-400 text-xs font-black tracking-widest"
        >
          <CheckCircle className="w-4 h-4" />
          {ES.seleccion.completar}
        </button>
        <button
          type="button"
          onClick={props.onEliminar}
          className="flex items-center gap-2 text-rose-400 text-xs font-black tracking-widest"
        >
          <Trash className="w-4 h-4" />
          {ES.seleccion.eliminar}
        </button>
        <button
          type="button"
          onClick={props.onSalir}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          aria-label={ES.seleccion.salir}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
