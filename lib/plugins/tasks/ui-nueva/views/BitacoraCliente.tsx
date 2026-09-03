'use client';

import { useState } from 'react';
import { Send, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import { ES } from '../i18n/es';
import { fechaCorta, type NotaCliente } from './FichaClienteExtra';

/**
 * Bitácora del cliente: notas del equipo y partes de trabajo de las IA.
 *
 * A diferencia de las notas internas del chat, ésta funciona aunque el
 * cliente no tenga conversación — que es el caso de la mayoría de los
 * importados de AAPP Space.
 */
export function BitacoraCliente(props: {
  customerId: number;
  notas: NotaCliente[];
  onCambio?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function agregar() {
    const value = texto.trim();
    if (!value || enviando) return;
    setEnviando(true);
    try {
      const response = await fetch(`/api/plugins/customers/${props.customerId}/notes-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      });
      if (response.ok) {
        setTexto('');
        props.onCambio?.();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className={`${C.card} p-6 space-y-3`}>
      <div className={C.rotulo}>{ES.bitacora.titulo}</div>

      {props.notas.length === 0 && (
        <p className="text-sm text-[var(--t-muted)]">{ES.bitacora.vacioCliente}</p>
      )}

      <div className="space-y-2">
        {props.notas.map((nota) => {
          const esIa = nota.source === 'connector';
          return (
            <article
              key={nota.id}
              className={cn(
                'rounded-2xl px-4 py-3',
                esIa
                  ? 'border border-[color-mix(in_srgb,var(--tareas-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--tareas-accent)_7%,transparent)]'
                  : 'bg-[var(--t-surface-2)]',
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide">
                {esIa ? (
                  <span className="inline-flex items-center gap-1 text-[var(--tareas-accent)]">
                    <Sparkles className="h-3 w-3" />
                    {nota.kind === 'report' ? ES.bitacora.parteIa : ES.bitacora.comentarioIa}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[var(--t-muted)]">
                    <User className="h-3 w-3" />
                    {ES.bitacora.persona}
                  </span>
                )}
                <span className="font-medium normal-case tracking-normal text-[var(--t-muted)]">· {fechaCorta(nota.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{nota.text}</p>
            </article>
          );
        })}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void agregar();
            }
          }}
          rows={2}
          placeholder={ES.bitacora.placeholderCliente}
          className="flex-1 resize-y rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)] px-4 py-2.5 text-sm outline-none focus:border-[var(--tareas-accent)]"
        />
        <button
          type="button"
          onClick={() => void agregar()}
          disabled={!texto.trim() || enviando}
          className="rounded-2xl bg-[var(--tareas-accent)] px-4 py-2.5 text-white disabled:opacity-40"
          aria-label={ES.bitacora.enviar}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
