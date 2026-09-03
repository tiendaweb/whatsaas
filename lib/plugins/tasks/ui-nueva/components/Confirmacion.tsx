'use client';

import { ES } from '../i18n/es';
import { C } from '../data/clases';

export function Confirmacion(props: {
  title: string;
  description: string;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={C.overlay} onClick={props.onCancel} role="presentation">
      <div
        className="bg-[var(--t-surface)] rounded-[2rem] max-w-md w-full p-8 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-lg font-bold text-[var(--t-text)]">{props.title}</h3>
        <p className="text-[var(--t-text-secondary)] mt-2 text-sm leading-relaxed">{props.description}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={props.onCancel}
            className="flex-1 rounded-2xl py-3 font-bold text-sm bg-[var(--t-surface-2)] text-[var(--t-text-secondary)]"
          >
            {ES.confirmar.cancelar}
          </button>
          <button
            type="button"
            onClick={props.onAccept}
            className="flex-1 rounded-2xl py-3 font-bold text-sm bg-[var(--tareas-accent)] text-white"
          >
            {ES.confirmar.aceptar}
          </button>
        </div>
      </div>
    </div>
  );
}
