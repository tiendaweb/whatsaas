'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Send, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import { ES } from '../i18n/es';

type Entrada = {
  id: number;
  text: string;
  kind: 'comment' | 'report' | string;
  source: 'user' | 'connector' | string;
  createdBy: number | null;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

function cuando(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * Bitácora de la tarea: comentarios de personas y partes de trabajo dejados
 * por las IA, en orden cronológico.
 *
 * Los comentarios ya existían en la base y los conectores ya los escribían,
 * pero esta interfaz no los mostraba en ningún lado — así que todo lo que la
 * IA reportaba quedaba invisible. Acá se ven, y se distingue quién lo escribió
 * de verdad: una entrada por MCP queda atribuida al usuario que autorizó el
 * conector, así que sin la marca de origen parecía escrita a mano.
 */
export function BitacoraTarea({ taskId, autores }: { taskId: number; autores?: Map<number, string> }) {
  const { data: entradas = [], mutate, isLoading } = useSWR<Entrada[]>(
    `/api/plugins/tasks/items/${taskId}/comments`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function agregar() {
    const value = texto.trim();
    if (!value || enviando) return;
    setEnviando(true);
    try {
      const response = await fetch(`/api/plugins/tasks/items/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      });
      if (response.ok) {
        setTexto('');
        await mutate();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <span className={C.rotulo}>{ES.bitacora.titulo}</span>
        {entradas.length > 0 && (
          <span className="text-[11px] text-[var(--t-muted)]">{ES.bitacora.cantidad(entradas.length)}</span>
        )}
      </div>

      {isLoading && <p className="text-sm text-[var(--t-muted)]">{ES.carga}</p>}
      {!isLoading && entradas.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[var(--t-border)] px-4 py-5 text-center text-sm text-[var(--t-muted)]">
          {ES.bitacora.vacio}
        </p>
      )}

      <div className="space-y-2">
        {entradas.map((entrada) => {
          const esIa = entrada.source === 'connector';
          const esReporte = entrada.kind === 'report';
          return (
            <article
              key={entrada.id}
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
                    {esReporte ? ES.bitacora.parteIa : ES.bitacora.comentarioIa}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[var(--t-muted)]">
                    <User className="h-3 w-3" />
                    {(entrada.createdBy && autores?.get(entrada.createdBy)) || ES.bitacora.persona}
                  </span>
                )}
                <span className="font-medium normal-case tracking-normal text-[var(--t-muted)]">· {cuando(entrada.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--t-text)]">{entrada.text}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={(event) => {
            // Enter envía; Shift+Enter hace salto de línea, como en un chat.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void agregar();
            }
          }}
          rows={2}
          placeholder={ES.bitacora.placeholder}
          className="flex-1 resize-y rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg)] px-4 py-2.5 text-sm text-[var(--t-text)] outline-none transition-colors focus:border-[var(--tareas-accent)]"
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
    </div>
  );
}
