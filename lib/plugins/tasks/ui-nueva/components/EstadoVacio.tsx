'use client';

import { Filter } from 'lucide-react';
import { ES } from '../i18n/es';

export function EstadoVacio(props: { titulo?: string; detalle?: string }) {
  return (
    <div className="py-24 text-center">
      <div className="w-20 h-20 bg-[var(--t-chip)] text-[var(--t-icon)] rounded-[2rem] flex items-center justify-center mx-auto mb-6">
        <Filter className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-[var(--t-text)]">{props.titulo ?? ES.vacio.titulo}</h3>
      <p className="text-[var(--t-muted)] mt-2 max-w-xs mx-auto">
        {props.detalle ?? ES.vacio.detalle}
      </p>
    </div>
  );
}
