'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Building2, CreditCard, FolderOpen, GitBranch, Link2, MapPin, Receipt, Share2, ShoppingCart, Users } from 'lucide-react';
import { shareTaskToLocation } from '@/lib/plugins/tasks/client/api';
import type { TaskDetails, TaskRelation } from '@/lib/plugins/tasks/client/types';
import { cn } from '@/lib/utils';
import { radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { C } from '../data/clases';
import { primeraColumna } from '../data/universo';
import type { GrupoProyecto, Tarea, Universo } from '../data/tipos';
import { ES } from '../i18n/es';

const TIPOS = [
  { value: 'related', label: ES.relaciones.relacionada },
  { value: 'shared_in', label: ES.relaciones.compartida },
  { value: 'customer', label: ES.relaciones.cliente },
  { value: 'contact', label: ES.relaciones.contacto },
  { value: 'task', label: ES.relaciones.tarea },
  { value: 'project', label: ES.relaciones.proyecto },
  { value: 'workspace', label: ES.relaciones.espacio },
  { value: 'sale', label: ES.relaciones.venta },
  { value: 'transaction', label: ES.relaciones.comprobante },
  { value: 'subscription', label: ES.relaciones.membresia },
  { value: 'company', label: ES.relaciones.empresa },
] as const;

/**
 * Los cuatro tipos "de negocio" no salen del universo de tareas que ya está en
 * memoria: viven en otros plugins. Se piden a demanda, sólo cuando se elige
 * ese tipo en el selector.
 */
const TIPOS_REMOTOS = ['sale', 'transaction', 'subscription', 'company'] as const;

type OpcionRemota = { id: number; label: string; detail: string | null };

const ICONO_TIPO: Record<string, typeof Users> = {
  sale: ShoppingCart,
  transaction: Receipt,
  subscription: CreditCard,
  company: Building2,
};

function etiquetaTipo(type: string) {
  if (type === 'shared_in') return ES.relaciones.compartida;
  if (type === 'generated_from') return ES.relaciones.generada;
  if (type === 'converted_to') return ES.relaciones.convertida;
  if (type === 'customer') return ES.relaciones.cliente;
  if (type === 'contact') return ES.relaciones.contacto;
  if (type === 'project') return ES.relaciones.proyecto;
  if (type === 'workspace') return ES.relaciones.espacio;
  if (type === 'task') return ES.relaciones.tarea;
  if (type === 'sale') return ES.relaciones.venta;
  if (type === 'transaction') return ES.relaciones.comprobante;
  if (type === 'subscription') return ES.relaciones.membresia;
  if (type === 'company') return ES.relaciones.empresa;
  return ES.relaciones.relacionada;
}

/** ¿Alguna relación guardada apunta a venta/comprobante/membresía/empresa? */
function relacionesRemotas(detalles: TaskDetails | null) {
  return (detalles?.relations ?? []).some((rel) =>
    (TIPOS_REMOTOS as readonly string[]).includes(rel.sourceType)
    || (TIPOS_REMOTOS as readonly string[]).includes(rel.targetType));
}

type ContactoLite = { id: number; name: string };
type ClienteLite = { id: number; name: string };

export function PanelRelaciones(props: {
  tarea: Tarea;
  detalles: TaskDetails | null;
  universo: Universo;
  grupos: GrupoProyecto[];
  clientes: ClienteLite[];
  contactos: ContactoLite[];
  onVincular: (rel: { sourceType: string; sourceId: number; targetType: string; targetId: number; relationType?: string }) => Promise<unknown>;
  onQuitar: (relationId: number) => Promise<unknown>;
  onAbrirTarea: (id: number) => void;
  onAbrirCliente: (id: number) => void;
  onFiltrarProyecto: (projectId: number) => void;
  onActualizar: () => void;
  /**
   * El formulario de vincular sólo aparece cuando se piden los campos vacíos.
   * Si no, el panel muestra únicamente lo que YA está vinculado — y si no hay
   * nada, no ocupa lugar. Antes el selector de tipo + destino + el botón
   * estaban siempre, en tareas que nunca iban a tener una relación.
   */
  mostrarFormulario?: boolean;
}) {
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['value']>('customer');
  const [destino, setDestino] = useState('');

  const esRemoto = (TIPOS_REMOTOS as readonly string[]).includes(tipo);
  const { data: remotas, isLoading: cargandoRemotas } = useSWR<OpcionRemota[]>(
    esRemoto ? `/api/plugins/tasks/linkables?type=${tipo}` : null,
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false },
  );
  // Los nombres de venta/comprobante/membresía/empresa no están en el universo
  // local, así que sin este índice una relación ya guardada se leería como
  // "sale #12" hasta que alguien abriera el selector de ese tipo.
  const { data: catalogo } = useSWR<Record<string, OpcionRemota[]>>(
    relacionesRemotas(props.detalles) ? 'linkables:catalogo' : null,
    async () => {
      const entradas = await Promise.all(TIPOS_REMOTOS.map(async (t) => {
        const res = await fetch(`/api/plugins/tasks/linkables?type=${t}`);
        return [t, res.ok ? await res.json() : []] as const;
      }));
      return Object.fromEntries(entradas);
    },
    { revalidateOnFocus: false },
  );

  const peerDe = (rel: TaskRelation) => {
    const isSource = rel.sourceType === 'task' && rel.sourceId === props.tarea.id;
    return {
      type: isSource ? rel.targetType : rel.sourceType,
      id: isSource ? rel.targetId : rel.sourceId,
      relationType: rel.relationType,
      relationId: rel.id,
    };
  };

  const nombrePeer = (type: string, id: number) => {
    if (type === 'task') {
      const tarea = props.universo.tareas.find((t) => t.id === id);
      return tarea ? radarTaskTitle(tarea.title) : `Tarea #${id}`;
    }
    if (type === 'project') return props.universo.proyectos.find((p) => p.id === id)?.name ?? `Proyecto #${id}`;
    if (type === 'workspace') return props.universo.workspaces.find((w) => w.id === id)?.name ?? `Espacio #${id}`;
    if (type === 'customer') return props.clientes.find((c) => c.id === id)?.name ?? `Cliente #${id}`;
    if (type === 'contact') return props.contactos.find((c) => c.id === id)?.name ?? `Contacto #${id}`;
    const remota = catalogo?.[type]?.find((opt) => opt.id === id);
    if (remota) return remota.label;
    return `${etiquetaTipo(type)} #${id}`;
  };

  const opciones = useMemo(() => {
    if (esRemoto) {
      return (remotas ?? []).map((opt) => ({
        id: opt.id,
        label: opt.detail ? `${opt.label} — ${opt.detail}` : opt.label,
      }));
    }
    if (tipo === 'customer') return props.clientes.map((c) => ({ id: c.id, label: c.name }));
    if (tipo === 'contact') return props.contactos.map((c) => ({ id: c.id, label: c.name }));
    if (tipo === 'task') {
      return props.universo.tareas
        .filter((t) => t.id !== props.tarea.id)
        .slice(0, 200)
        .map((t) => ({ id: t.id, label: `${radarTaskTitle(t.title)} · ${t.proyectoNombre}` }));
    }
    if (tipo === 'project' || tipo === 'shared_in') {
      return props.universo.proyectos.map((p) => ({ id: p.id, label: p.name }));
    }
    return props.universo.workspaces.map((w) => ({ id: w.id, label: w.name }));
  }, [tipo, esRemoto, remotas, props.clientes, props.contactos, props.universo, props.tarea.id]);

  const agregar = async () => {
    const id = Number(destino);
    if (!id) return;
    if (tipo === 'shared_in') {
      const proyecto = props.universo.proyectos.find((p) => p.id === id);
      const columna = primeraColumna(proyecto);
      if (!columna) return;
      await shareTaskToLocation(props.tarea.id, id, columna.id);
      props.onActualizar();
    } else if (tipo === 'customer') {
      await props.onVincular({ sourceType: 'customer', sourceId: id, targetType: 'task', targetId: props.tarea.id, relationType: 'related' });
    } else if (tipo === 'contact') {
      await props.onVincular({ sourceType: 'task', sourceId: props.tarea.id, targetType: 'contact', targetId: id, relationType: 'related' });
    } else if (tipo === 'task') {
      await props.onVincular({ sourceType: 'task', sourceId: props.tarea.id, targetType: 'task', targetId: id, relationType: 'related' });
    } else if (tipo === 'project') {
      await props.onVincular({ sourceType: 'task', sourceId: props.tarea.id, targetType: 'project', targetId: id, relationType: 'related' });
    } else if (tipo === 'workspace') {
      await props.onVincular({ sourceType: 'task', sourceId: props.tarea.id, targetType: 'workspace', targetId: id, relationType: 'related' });
    } else if (esRemoto) {
      await props.onVincular({ sourceType: 'task', sourceId: props.tarea.id, targetType: tipo, targetId: id, relationType: 'related' });
    } else {
      await props.onVincular({ sourceType: 'task', sourceId: props.tarea.id, targetType: 'task', targetId: id, relationType: 'related' });
    }
    setDestino('');
    props.onActualizar();
  };

  const locations = props.detalles?.locations ?? [];
  const relations = props.detalles?.relations ?? [];
  const mostrarFormulario = props.mostrarFormulario ?? true;

  // Sin vínculos y sin formulario no hay nada que dibujar.
  if (!mostrarFormulario && locations.length === 0 && relations.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <div className={C.rotulo}>{ES.rotulos.relaciones}</div>

      {locations.length > 0 && (
        <div className="space-y-2">
          {locations.map((loc) => {
            const proyecto = props.universo.proyectos.find((p) => p.id === loc.projectId);
            const workspace = props.universo.workspaces.find((w) => w.id === proyecto?.workspaceId);
            const columna = proyecto?.columns.find((c) => c.id === loc.columnId);
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => props.onFiltrarProyecto(loc.projectId)}
                className="w-full flex items-center gap-3 bg-[var(--t-surface-2)] rounded-2xl px-4 py-3 text-left"
              >
                <MapPin className="w-4 h-4 text-[var(--tareas-accent)] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold truncate">{proyecto?.name ?? `Proyecto #${loc.projectId}`}</span>
                  <span className="block text-[11px] text-[var(--t-muted)] truncate">
                    {workspace?.name} · {columna?.title ?? `Columna #${loc.columnId}`}
                  </span>
                </span>
                <span className={C.badge}>{loc.isPrimary ? ES.relaciones.principal : ES.relaciones.copia}</span>
              </button>
            );
          })}
        </div>
      )}

      {relations.map((rel) => {
        const peer = peerDe(rel);
        return (
          <div key={rel.id} className="flex items-center gap-3 bg-[var(--t-surface-2)] rounded-2xl px-4 py-3">
            <Link2 className="w-4 h-4 text-[var(--tareas-accent)] shrink-0" />
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                if (peer.type === 'customer') props.onAbrirCliente(peer.id);
                if (peer.type === 'task') props.onAbrirTarea(peer.id);
                if (peer.type === 'project') props.onFiltrarProyecto(peer.id);
              }}
            >
              <span className="block text-sm font-bold truncate">{nombrePeer(peer.type, peer.id)}</span>
              <span className="block text-[11px] text-[var(--t-muted)]">{etiquetaTipo(peer.relationType || peer.type)}</span>
            </button>
            {peer.type === 'customer' && (
              <button
                type="button"
                onClick={() => props.onAbrirCliente(peer.id)}
                className="inline-flex items-center gap-1 shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide bg-[color-mix(in_srgb,var(--tareas-accent)_14%,transparent)] text-[var(--tareas-accent)]"
              >
                <Users className="h-3.5 w-3.5" />
                {ES.relaciones.fichaCorta}
              </button>
            )}
            <button type="button" onClick={() => void props.onQuitar(rel.id)} className="text-[var(--t-muted)] text-xs font-bold">
              ×
            </button>
          </div>
        );
      })}

      {locations.length === 0 && relations.length === 0 && (
        <p className="text-sm text-[var(--t-muted)]">{ES.relaciones.vacio}</p>
      )}

      {mostrarFormulario && (<>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={tipo} onChange={(e) => { setTipo(e.target.value as typeof tipo); setDestino(''); }} className={C.control}>
          {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          disabled={esRemoto && cargandoRemotas}
          className={cn(C.control, 'sm:col-span-2', esRemoto && cargandoRemotas && 'opacity-50')}
        >
          <option value="">
            {esRemoto && cargandoRemotas
              ? ES.carga
              : opciones.length === 0
                ? ES.relaciones.sinOpciones
                : `${ES.relaciones.vincular}…`}
          </option>
          {opciones.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </select>
      </div>
      <button
        type="button"
        disabled={!destino}
        onClick={() => void agregar()}
        className="w-full rounded-2xl py-3 text-xs font-black tracking-widest bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] text-[var(--tareas-accent)] disabled:opacity-30 inline-flex items-center justify-center gap-2"
      >
        {(() => {
          const Icono = ICONO_TIPO[tipo];
          if (Icono) return <Icono className="w-4 h-4" />;
          if (tipo === 'shared_in') return <Share2 className="w-4 h-4" />;
          if (tipo === 'customer') return <Users className="w-4 h-4" />;
          if (tipo === 'project') return <FolderOpen className="w-4 h-4" />;
          return <GitBranch className="w-4 h-4" />;
        })()}
        {tipo === 'shared_in' ? ES.relaciones.compartirEn : ES.relaciones.vincular}
      </button>
      </>)}
    </div>
  );
}
