'use client';

import { useMemo } from 'react';
import { Calendar, Clock3, Type, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fechaLegible, horaLegible, type VariableDetectada } from '../../shared/variables';

/**
 * Los huecos del mensaje, para completarlos sin escribir.
 *
 * Antes había que entrar a «Editar» y reemplazar `{{fecha}}` a mano tipeando la
 * fecha en algún formato; ahora cada hueco es un campo del tipo que
 * corresponde, con calendario y reloj nativos —que en el celular abren el
 * picker del sistema— y atajos para lo que se elige el 90 % de las veces.
 *
 * El nombre viene resuelto de arriba cuando el contacto tiene uno que sirve
 * para saludar; si el contacto es «5491160001672», el campo queda vacío en vez
 * de mandar «Hola 5491160001672».
 */

const ICONO = { nombre: User, fecha: Calendar, hora: Clock3, texto: Type } as const;

const CAMPO =
  'h-9 w-full rounded-lg border border-[var(--mn-line)] bg-transparent px-2 text-[13px] font-[650] text-[var(--mn-text)] outline-none focus-visible:border-[var(--mn-accent)]';
const ATAJO =
  'rounded-full border border-[var(--mn-line)] px-2 py-0.5 text-[10px] font-black text-[var(--mn-muted)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-text)]';

/** `YYYY-MM-DD` de hoy más los días que se pidan, en hora del navegador. */
function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function VariablesRapidas({
  variables,
  valores,
  onCambio,
  nombreSugerido,
}: {
  variables: VariableDetectada[];
  valores: Record<string, string>;
  onCambio: (name: string, valor: string) => void;
  /** Nombre del contacto, ya filtrado: sólo llega si sirve para saludar. */
  nombreSugerido: string | null;
}) {
  const pendientes = useMemo(() => variables.filter((v) => !(valores[v.name] ?? '').trim()).length, [variables, valores]);

  if (!variables.length) return null;

  return (
    <section
      className="shrink-0 rounded-xl border border-[var(--mn-line)] bg-[var(--mn-msg-bg)] p-2.5"
      aria-label="Datos que faltan en el mensaje"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <small className="text-[11px] font-black tracking-[0.06em] text-[var(--mn-green-soft)]">
          {pendientes > 0 ? `FALTAN ${pendientes} DATO${pendientes === 1 ? '' : 'S'}` : 'DATOS COMPLETOS'}
        </small>
        {pendientes > 0 && (
          <span className="text-[10px] font-bold text-[var(--mn-dim)]">Completalos o quitá las variables para poder enviar</span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {variables.map((v) => {
          const Icono = ICONO[v.tipo];
          const valor = valores[v.name] ?? '';
          return (
            <div key={v.name} className="min-w-0">
              <label className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--mn-muted)]">
                <Icono className="size-3" aria-hidden />
                {v.label}
              </label>

              {v.tipo === 'fecha' ? (
                <>
                  <input type="date" value={valor} onChange={(e) => onCambio(v.name, e.target.value)} className={CAMPO} />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[
                      ['Hoy', 0],
                      ['Mañana', 1],
                      ['En 3 días', 3],
                      ['En una semana', 7],
                    ].map(([texto, dias]) => (
                      <button key={String(texto)} type="button" className={ATAJO} onClick={() => onCambio(v.name, enDias(Number(dias)))}>
                        {texto}
                      </button>
                    ))}
                  </div>
                  {valor && <p className="mt-1 text-[10px] text-[var(--mn-dim)]">Sale como “{fechaLegible(valor)}”</p>}
                </>
              ) : v.tipo === 'hora' ? (
                <>
                  <input type="time" value={valor} onChange={(e) => onCambio(v.name, e.target.value)} className={CAMPO} step={300} />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {['09:00', '11:00', '15:00', '18:00'].map((h) => (
                      <button key={h} type="button" className={ATAJO} onClick={() => onCambio(v.name, h)}>
                        {h}
                      </button>
                    ))}
                  </div>
                  {valor && <p className="mt-1 text-[10px] text-[var(--mn-dim)]">Sale como “{horaLegible(valor)}”</p>}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={valor}
                    onChange={(e) => onCambio(v.name, e.target.value)}
                    placeholder={v.tipo === 'nombre' ? 'Cómo llamarlo' : 'Escribí el dato'}
                    className={CAMPO}
                  />
                  {v.tipo === 'nombre' && nombreSugerido && nombreSugerido !== valor && (
                    <button type="button" className={cn(ATAJO, 'mt-1')} onClick={() => onCambio(v.name, nombreSugerido)}>
                      Usar “{nombreSugerido}”
                    </button>
                  )}
                  {v.tipo === 'nombre' && !nombreSugerido && (
                    <p className="mt-1 text-[10px] text-[var(--mn-dim)]">
                      El contacto no tiene un nombre que sirva para saludar: escribilo vos o sacá el saludo.
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
