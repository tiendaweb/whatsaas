'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Search, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ES } from '../i18n/es';

export type ParteLite = {
  id: number;
  name: string;
  /** Dato para desambiguar homónimos (teléfono, etapa). Dos contactos
   * distintos pueden llamarse igual: sin esto se leen como un duplicado. */
  detalle?: string | null;
};

/** Con qué está filtrando: un cliente de la ficha de Clientes, o un lead
 * (contacto del CRM). Son dos tablas distintas, así que el id solo no
 * alcanza para identificar la selección. */
export type SeleccionParte = { tipo: 'cliente' | 'lead'; id: number } | null;

function normalizar(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');
}

/**
 * Buscador de cliente o lead. Es un combobox y no un `<select>` porque con
 * cientos de contactos un desplegable nativo es inusable: acá se escribe y
 * se filtra. Muestra ambos tipos en grupos separados para que quede claro
 * que un lead y un cliente no son lo mismo.
 */
export function SelectorCliente(props: {
  clientes: ParteLite[];
  leads: ParteLite[];
  valor: SeleccionParte;
  onChange: (valor: SeleccionParte) => void;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const contenedor = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onClick = (event: MouseEvent) => {
      if (!contenedor.current?.contains(event.target as Node)) setAbierto(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
    else setQuery('');
  }, [abierto]);

  const filtrados = useMemo(() => {
    const q = normalizar(query.trim());
    const filtrar = (lista: ParteLite[]) =>
      (q ? lista.filter((item) => normalizar(item.name).includes(q)) : lista).slice(0, 50);
    return { clientes: filtrar(props.clientes), leads: filtrar(props.leads) };
  }, [props.clientes, props.leads, query]);

  const seleccionado = useMemo(() => {
    if (!props.valor) return null;
    const lista = props.valor.tipo === 'cliente' ? props.clientes : props.leads;
    return lista.find((item) => item.id === props.valor!.id) ?? null;
  }, [props.clientes, props.leads, props.valor]);

  const elegir = (tipo: 'cliente' | 'lead', id: number) => {
    const yaEstaba = props.valor?.tipo === tipo && props.valor.id === id;
    props.onChange(yaEstaba ? null : { tipo, id });
    setAbierto(false);
  };

  const activo = Boolean(props.valor);

  return (
    <div ref={contenedor} className={cn('relative', props.className)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          'flex h-9 max-w-[13rem] items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors',
          activo
            ? 'border-[var(--tareas-accent)] bg-[color-mix(in_srgb,var(--tareas-accent)_12%,transparent)] text-[var(--tareas-accent)]'
            : 'border-[var(--t-border)] text-[var(--t-text-secondary)] hover:text-[var(--t-text)]',
        )}
        title={ES.clientes.filtrarPorCliente}
      >
        {props.valor?.tipo === 'lead' ? <UserRound className="h-3.5 w-3.5 shrink-0" /> : <Building2 className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{seleccionado?.name ?? ES.clientes.filtrarPorCliente}</span>
        {activo ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={ES.clientes.quitarFiltro}
            onClick={(event) => {
              event.stopPropagation();
              props.onChange(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.stopPropagation();
              props.onChange(null);
            }}
            className="ml-0.5 shrink-0 rounded p-0.5 hover:bg-[color-mix(in_srgb,var(--tareas-accent)_20%,transparent)]"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-[var(--t-border)] bg-[var(--t-surface)] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--t-border)] px-3 py-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--t-muted)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={ES.clientes.buscarPlaceholder}
              className="w-full bg-transparent text-sm outline-none text-[var(--t-text)] placeholder:text-[var(--t-muted)]"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {!filtrados.clientes.length && !filtrados.leads.length && (
              <p className="px-3 py-6 text-center text-xs text-[var(--t-muted)]">{ES.clientes.sinResultados}</p>
            )}

            <Grupo
              titulo={ES.clientes.grupoClientes}
              icono={<Building2 className="h-3 w-3" />}
              items={filtrados.clientes}
              seleccionadoId={props.valor?.tipo === 'cliente' ? props.valor.id : null}
              onElegir={(id) => elegir('cliente', id)}
            />
            <Grupo
              titulo={ES.clientes.grupoLeads}
              icono={<UserRound className="h-3 w-3" />}
              items={filtrados.leads}
              seleccionadoId={props.valor?.tipo === 'lead' ? props.valor.id : null}
              onElegir={(id) => elegir('lead', id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Grupo(props: {
  titulo: string;
  icono: React.ReactNode;
  items: ParteLite[];
  seleccionadoId: number | null;
  onElegir: (id: number) => void;
}) {
  if (!props.items.length) return null;
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-[var(--t-muted)]">
        {props.icono}
        {props.titulo}
      </div>
      {props.items.map((item) => {
        const elegido = props.seleccionadoId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => props.onElegir(item.id)}
            className={cn(
              'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
              elegido
                ? 'bg-[color-mix(in_srgb,var(--tareas-accent)_12%,transparent)] font-semibold text-[var(--tareas-accent)]'
                : 'text-[var(--t-text)] hover:bg-[var(--t-surface-2)]',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.name}</span>
              {item.detalle && (
                <span className="block truncate text-[11px] text-[var(--t-muted)]">{item.detalle}</span>
              )}
            </span>
            {elegido && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
