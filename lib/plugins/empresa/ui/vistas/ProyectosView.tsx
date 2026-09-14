'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ProyectosEmpresa, TareaEmpresa } from '../../shared/api-types';
import { CargandoBloques, ErrorEstado, VacioEstado } from '../componentes/Estados';
import { EMPRESA_API, fetcher, fmtInt } from '../componentes/format';
import './cabina.css';

/**
 * Proyectos, con la interfaz de la maqueta de ChatPro (chatpro-nuevo-diseno →
 * Proyectos): rail de workspaces a la izquierda, tablero / Gantt / lista en el
 * medio y el detalle de la tarea a la derecha.
 *
 * Los datos son los de TAREAS OS: los mismos workspaces, proyectos, columnas y
 * tareas que se ven en `/plugins/tasks`, servidos por `getProyectosEmpresa`,
 * que se apoya en `loadTaskOsData`.
 *
 * Esta pantalla ya NO es de sólo mirar. Se puede crear un proyecto, arrastrar
 * una tarjeta de etapa, editar la tarea en el panel de la derecha, manejar su
 * checklist y archivar al cliente para sacarlo del CRM. Todo eso escribe por
 * las rutas de Empresa, que a su vez llaman a las funciones de Tareas OS: acá
 * no hay una segunda implementación de "mover una tarea".
 *
 * Lo que la maqueta muestra y el sistema no tiene —prioridad propia de la
 * tarea, estado del proyecto— no se dibuja: inventarlo sería mostrar un dato
 * falso en una pantalla de trabajo. La prioridad, cuando el equipo la usa, vive
 * como etiqueta del proyecto y se edita como tal.
 */

const AV = ['#25D366', '#7c5cfc', '#60a5fa', '#f5a524', '#f472b6', '#f45b69', '#2dd4bf'];
const colorDe = (s: string) => AV[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

const ICONOS = {
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  check: 'M20 6 9 17l-5-5',
  abrir: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  mas: 'M12 5v14M5 12h14',
  cerrar: 'M18 6 6 18M6 6l12 12',
  archivar: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  basura: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  ojo: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z',
} as const;

function Icon({ d, s = 16, w = 2 }: { d: keyof typeof ICONOS; s?: number; w?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" width={s} height={s} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d ? ICONOS[d] : ''} />
    </svg>
  );
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const hoyIso = () => new Date().toISOString().slice(0, 10);

const LS_OCULTAR = 'empresa:proyectos:ocultar-terminados';

/** Los meses que abarca un rango, para la regla del Gantt. */
function mesesEntre(desde: string, hasta: string) {
  const salida: Array<{ etiqueta: string; inicio: number; fin: number }> = [];
  const d = new Date(`${desde}T00:00:00Z`);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const limite = new Date(`${hasta}T00:00:00Z`);
  while (y < limite.getUTCFullYear() || (y === limite.getUTCFullYear() && m <= limite.getUTCMonth())) {
    const inicio = Date.UTC(y, m, 1);
    const fin = Date.UTC(y, m + 1, 1);
    salida.push({ etiqueta: `${MESES[m]} ${String(y).slice(2)}`, inicio, fin });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return salida;
}

type PanelTab = 'detalle' | 'checklist' | 'notas';

export function ProyectosView({ onMenu }: { onMenu?: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<ProyectosEmpresa>(`${EMPRESA_API}/proyectos`, fetcher);
  /** `null` = todos los espacios. El rail lista los proyectos de lo elegido. */
  const [espacioId, setEspacioId] = useState<number | null>(null);
  const [proyectoId, setProyectoId] = useState<number | null>(null);
  const [tareaId, setTareaId] = useState<number | null>(null);
  const [tab, setTab] = useState<'kanban' | 'gantt' | 'lista'>('kanban');
  const [panelTab, setPanelTab] = useState<PanelTab>('detalle');
  /** Abajo de 1100px el panel es un cajón: sin esto la checklist no se veía. */
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [ocultarTerminados, setOcultarTerminados] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [creando, setCreando] = useState(false);

  // La preferencia de ocultar viaja entre sesiones: quien trabaja con el
  // tablero limpio no quiere volver a tildarlo cada vez que entra.
  useEffect(() => {
    try {
      setOcultarTerminados(window.localStorage.getItem(LS_OCULTAR) === '1');
    } catch {
      /* navegador sin storage */
    }
  }, []);

  const alternarOcultar = () => {
    setOcultarTerminados((prev) => {
      const siguiente = !prev;
      try {
        window.localStorage.setItem(LS_OCULTAR, siguiente ? '1' : '0');
      } catch {
        /* navegador sin storage */
      }
      return siguiente;
    });
  };

  /**
   * Toda escritura pasa por acá: pega, refresca desde el servidor y muestra el
   * error que devolvió la ruta en vez de uno genérico. `optimista` sólo lo usa
   * el arrastre, que necesita que la tarjeta se mueva en el acto.
   */
  const accion = async (
    pedido: () => Promise<Response>,
    mensajeError: string,
    optimista?: ProyectosEmpresa,
  ): Promise<boolean> => {
    try {
      await mutate(
        async () => {
          const res = await pedido();
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error ? String(body.error) : mensajeError);
          }
          return fetcher<ProyectosEmpresa>(`${EMPRESA_API}/proyectos`);
        },
        optimista
          ? { optimisticData: optimista, rollbackOnError: true, revalidate: false, populateCache: true }
          : { revalidate: false, populateCache: true },
      );
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : mensajeError);
      return false;
    }
  };

  /** Los proyectos que se listan: los del espacio elegido, o todos. */
  const visibles = useMemo(
    () => (data ? data.proyectos.filter((p) => espacioId == null || p.workspaceId === espacioId) : []),
    [data, espacioId],
  );

  const proyecto = useMemo(() => {
    if (!data?.proyectos.length) return null;
    const elegido = data.proyectos.find((p) => p.id === proyectoId);
    // Al cambiar de espacio, el proyecto que estaba abierto puede no estar en
    // el nuevo: se cae al primero del espacio en vez de quedar en blanco.
    if (elegido && (espacioId == null || elegido.workspaceId === espacioId)) return elegido;
    return visibles[0] ?? null;
  }, [data, espacioId, proyectoId, visibles]);

  const todasLasTareas = useMemo(
    () => (data && proyecto ? data.tareas.filter((t) => t.proyectoId === proyecto.id) : []),
    [data, proyecto],
  );

  /** Lo que se dibuja. Los números del encabezado siguen contando todo. */
  const tareas = useMemo(
    () => (ocultarTerminados ? todasLasTareas.filter((t) => !t.hecha) : todasLasTareas),
    [ocultarTerminados, todasLasTareas],
  );

  const tarea = todasLasTareas.find((t) => t.id === tareaId) ?? null;

  /** El rango del Gantt: de la primera fecha a la última de este proyecto. */
  const rango = useMemo(() => {
    const conFecha = tareas.filter((t) => t.inicio || t.fin);
    if (!conFecha.length) return null;
    let desde = '9999-12-31';
    let hasta = '0000-01-01';
    for (const t of conFecha) {
      const a = t.inicio ?? t.fin!;
      const b = t.fin ?? t.inicio!;
      if (a < desde) desde = a;
      if (b > hasta) hasta = b;
    }
    // Un rango de un solo día no se puede dibujar: se abre al mes entero.
    const meses = mesesEntre(desde, hasta);
    const inicio = meses[0].inicio;
    const fin = meses[meses.length - 1].fin;
    return { meses, inicio, fin, ancho: fin - inicio };
  }, [tareas]);

  const pct = (iso: string) => (rango ? ((dia(iso) - rango.inicio) / rango.ancho) * 100 : 0);

  const elegirTarea = (t: TareaEmpresa) => {
    setProyectoId(t.proyectoId);
    setTareaId(t.id);
    setPanelAbierto(true);
  };

  const crearProyecto = async () => {
    const nombre = nombreNuevo.trim();
    if (!nombre || creando) return;
    setCreando(true);
    const ok = await accion(
      () => fetch(`${EMPRESA_API}/proyectos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre, workspaceId: espacioId }),
      }),
      'No se pudo crear el proyecto.',
    );
    setCreando(false);
    if (ok) {
      setNombreNuevo('');
      toast.success(`Proyecto "${nombre}" creado.`);
    }
  };

  const editarTarea = async (tareaId: number, cambio: Record<string, unknown>, optimista?: ProyectosEmpresa) =>
    accion(
      () => fetch(`${EMPRESA_API}/proyectos/tareas`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tareaId, ...cambio }),
      }),
      'No se pudo guardar el cambio.',
      optimista,
    );

  /** Arrastrar una tarjeta de una columna a otra. */
  const onDragEnd = async (r: DropResult) => {
    if (!r.destination || !data) return;
    const origen = Number(r.source.droppableId);
    const destino = Number(r.destination.droppableId);
    if (origen === destino) return;

    const id = Number(r.draggableId);
    const columna = proyecto?.columnas.find((c) => c.id === destino);
    if (!columna) return;

    // La tarjeta se mueve ya; si el servidor rechaza, SWR revierte sola.
    const optimista: ProyectosEmpresa = {
      ...data,
      tareas: data.tareas.map((t) => (t.id === id ? { ...t, columnaId: destino, columna: columna.titulo } : t)),
    };
    await editarTarea(id, { columnaId: destino }, optimista);
  };

  const archivar = async () => {
    if (!proyecto) return;
    const ok = window.confirm(
      `Archivar el cliente de "${proyecto.name}" lo saca del CRM. El proyecto y sus tareas no se borran. ¿Seguir?`,
    );
    if (!ok) return;
    const hecho = await accion(
      () => fetch(`${EMPRESA_API}/proyectos/archivar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proyectoId: proyecto.id }),
      }),
      'No se pudo archivar.',
    );
    if (hecho) toast.success('Cliente archivado: ya no figura en el CRM.');
  };

  if (error) return <ErrorEstado mensaje={String(error.message ?? error)} onReintentar={() => void mutate()} />;
  if (isLoading || !data) return <CargandoBloques bloques={4} />;

  if (!data.proyectos.length) {
    return (
      <div className="cabina">
        <div className="topbar">
          {onMenu && <button type="button" className="btn lg:hidden" onClick={onMenu} aria-label="Menú">☰</button>}
          <Icon d="kanban" s={17} />
          <div className="titulo"><div className="nm">Proyectos</div></div>
        </div>
        <div style={{ padding: 24 }}>
          <VacioEstado
            titulo="Todavía no hay proyectos"
            ayuda="Creá el primero desde el rail de la izquierda, o abrí Tareas OS."
          />
          <div style={{ maxWidth: 320, marginTop: 16 }}>
            <NuevoProyecto
              valor={nombreNuevo}
              onValor={setNombreNuevo}
              onCrear={crearProyecto}
              creando={creando}
            />
          </div>
        </div>
      </div>
    );
  }

  const avance = proyecto && proyecto.tareas > 0 ? Math.round((proyecto.hechas / proyecto.tareas) * 100) : 0;
  const workspace = data.workspaces.find((w) => w.id === proyecto?.workspaceId) ?? null;
  const hoy = hoyIso();
  const cliente = proyecto?.cliente ?? null;
  const yaArchivado = cliente?.estado === 'archived';
  const motivoArchivo = !cliente
    ? 'Este proyecto no está vinculado a ninguna ficha de cliente.'
    : yaArchivado
      ? 'El cliente ya está archivado: no figura en el CRM.'
      : !cliente.puedeArchivar
        ? `Quedan ${fmtInt(cliente.tareasAbiertas)} tareas sin terminar.`
        : 'Archiva la ficha del cliente y la saca del CRM.';

  return (
    <div className="cabina">
      {/* Una sola barra: el nombre de lo que se está mirando, sus números, las
          pestañas y la salida a Tareas OS. */}
      <div className="topbar">
        {onMenu && <button type="button" className="btn lg:hidden" onClick={onMenu} aria-label="Menú">☰</button>}
        <Icon d="kanban" s={17} />
        <div className="titulo">
          <div className="nm">
            {proyecto ? proyecto.name : 'Proyectos'}
            {proyecto?.color && <span className="dot" style={{ background: proyecto.color }} />}
          </div>
          <div className="sub">
            {proyecto ? (
              <>
                {workspace?.name ?? 'Sin espacio'} · {fmtInt(proyecto.tareas)} tareas
                {proyecto.checklistTotal > 0 && ` · ${fmtInt(proyecto.checklistHechos)}/${fmtInt(proyecto.checklistTotal)} checklist`}
                {proyecto.inicio && proyecto.fin ? ` · ${proyecto.inicio} → ${proyecto.fin}` : ' · sin fechas'}
              </>
            ) : (
              <>{fmtInt(data.proyectos.length)} proyectos · {fmtInt(data.tareas.length)} tareas</>
            )}
          </div>
        </div>

        {proyecto && (
          <div className="avance">
            <div className="pc">{avance}%</div>
            <div className="bar"><i style={{ width: `${avance}%`, background: proyecto.color || 'var(--ce-green)' }} /></div>
          </div>
        )}

        {/* En pantallas angostas el rail no se dibuja: sin esto no habría cómo
            cambiar de proyecto. */}
        <label className="sel-angosto">
          <select
            value={proyecto ? String(proyecto.id) : ''}
            onChange={(e) => {
              setProyectoId(Number(e.target.value));
              setTareaId(null);
            }}
            aria-label="Proyecto"
          >
            {data.proyectos.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>

        <div className="sp" />

        <button
          type="button"
          className={cn('btn', ocultarTerminados && 'on')}
          onClick={alternarOcultar}
          aria-pressed={ocultarTerminados}
          title="Esconde las tareas y los ítems de checklist ya terminados"
        >
          <Icon d="ojo" s={12} /> Ocultar terminados
        </button>

        <div className="tabs">
          {([['kanban', 'Tablero'], ['gantt', 'Gantt'], ['lista', 'Lista']] as const).map(([k, l]) => (
            <button key={k} type="button" className={cn('tab', tab === k && 'active')} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>

        {proyecto && (
          <button
            type="button"
            className="btn"
            onClick={archivar}
            disabled={!cliente?.puedeArchivar || yaArchivado}
            title={motivoArchivo}
          >
            <Icon d="archivar" s={12} /> {yaArchivado ? 'Archivado' : 'Archivar'}
          </button>
        )}

        <a className="btn" href={proyecto ? `/plugins/tasks?proyecto=${proyecto.id}` : '/plugins/tasks'}>
          <Icon d="abrir" s={12} /> Abrir en Tareas OS
        </a>
      </div>

      <div className="cuerpo">
        <div className="pj-side">
          {/* El espacio se cambia con un selector y no con un acordeón: con
              doce espacios, plegar y desplegar para encontrar un proyecto era
              más trabajo que elegirlo de una lista. */}
          <div className="ws-sel">
            <span className="ctx-t" style={{ display: 'block', marginBottom: 5 }}>Espacio</span>
            <select
              value={espacioId == null ? '' : String(espacioId)}
              onChange={(e) => {
                setEspacioId(e.target.value ? Number(e.target.value) : null);
                setTareaId(null);
              }}
            >
              <option value="">Todos los espacios ({fmtInt(data.proyectos.length)})</option>
              {data.workspaces.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name} ({fmtInt(data.proyectos.filter((p) => p.workspaceId === w.id).length)})
                </option>
              ))}
            </select>
          </div>

          {visibles.map((p, i) => {
            const espacio = data.workspaces.find((w) => w.id === p.workspaceId) ?? null;
            // Con "Todos los espacios" cada tanda lleva su rótulo, para saber
            // de dónde es cada proyecto sin tener que abrirlo.
            const rotulo = espacioId == null && (i === 0 || visibles[i - 1].workspaceId !== p.workspaceId);
            const ck = p.checklistTotal > 0 ? Math.round((p.checklistHechos / p.checklistTotal) * 100) : 0;
            return (
              <div key={p.id}>
                {rotulo && (
                  <div className="ws-h">
                    <span className="dot" style={{ background: espacio?.color || colorDe(espacio?.name ?? '') }} />
                    {espacio?.name ?? 'Sin espacio'}
                  </div>
                )}
                <button
                  type="button"
                  className={cn('pj-item', proyecto?.id === p.id && 'active')}
                  onClick={() => {
                    setProyectoId(p.id);
                    setTareaId(null);
                  }}
                >
                  <span className="pj-nm">
                    <span className="dot" style={{ background: p.color || colorDe(p.name) }} />
                    {p.name}
                    {p.cliente?.estado === 'archived' && <span className="pj-arch">archivado</span>}
                  </span>
                  <span className="pj-mt">
                    <span>{fmtInt(p.tareas)} tareas</span>
                    <span>{p.tareas > 0 ? Math.round((p.hechas / p.tareas) * 100) : 0}%</span>
                  </span>
                  {/* El avance de checklists del proyecto entero: es la lectura
                      que el tablero no da, porque ahí vive tarea por tarea. */}
                  {p.checklistTotal > 0 && (
                    <span className="pj-ck">
                      <span className="pj-ck-t">
                        <Icon d="check" s={10} w={3} />
                        {fmtInt(p.checklistHechos)}/{fmtInt(p.checklistTotal)}
                      </span>
                      <span className="bar"><i style={{ width: `${ck}%` }} /></span>
                    </span>
                  )}
                </button>
              </div>
            );
          })}

          {!visibles.length && <div className="vacio" style={{ padding: '16px 12px' }}>Este espacio no tiene proyectos.</div>}

          <NuevoProyecto
            valor={nombreNuevo}
            onValor={setNombreNuevo}
            onCrear={crearProyecto}
            creando={creando}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {tab === 'kanban' && (
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="kan">
                {(proyecto?.columnas ?? []).map((columna) => {
                  const items = tareas.filter((t) => t.columnaId === columna.id);
                  return (
                    <Droppable key={columna.id} droppableId={String(columna.id)}>
                      {(provided, snapshot) => (
                        <div className={cn('col', snapshot.isDraggingOver && 'sobre')}>
                          <div className="col-h">
                            <span className="nm">{columna.titulo}</span>
                            <span className="ct">{fmtInt(items.length)}</span>
                          </div>
                          <div className="col-b" ref={provided.innerRef} {...provided.droppableProps}>
                            {items.map((t, index) => (
                              <Draggable key={t.id} draggableId={String(t.id)} index={index}>
                                {(drag, dragSnapshot) => (
                                  <div
                                    ref={drag.innerRef}
                                    {...drag.draggableProps}
                                    {...drag.dragHandleProps}
                                    role="button"
                                    tabIndex={0}
                                    className={cn('task', tareaId === t.id && 'sel', dragSnapshot.isDragging && 'arrastrando')}
                                    onClick={() => elegirTarea(t)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        elegirTarea(t);
                                      }
                                    }}
                                  >
                                    <span className="task-t" style={{ display: 'block', textDecoration: t.hecha ? 'line-through' : 'none' }}>
                                      {t.titulo}
                                    </span>
                                    {t.etiquetas.length > 0 && (
                                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
                                        {t.etiquetas.map((e) => (
                                          <span key={e.name} className="chip" style={{ background: `${e.color}22`, color: e.color }}>
                                            {e.name}
                                          </span>
                                        ))}
                                      </span>
                                    )}
                                    {t.checklist.total > 0 && (
                                      <span style={{ display: 'block', marginBottom: 7 }}>
                                        <span style={{ display: 'block', fontSize: 10, color: 'var(--ce-muted2)', marginBottom: 3 }}>
                                          {t.checklist.hechos}/{t.checklist.total} checklist
                                        </span>
                                        <span className="bar" style={{ display: 'block', height: 4 }}>
                                          <i style={{ width: `${Math.round((t.checklist.hechos / t.checklist.total) * 100)}%` }} />
                                        </span>
                                      </span>
                                    )}
                                    <span className="task-m">
                                      {t.responsable ?? 'Sin responsable'}
                                      <span className="sp" />
                                      <span className="mono">{t.fin ?? ''}</span>
                                    </span>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {!items.length && <div className="vacio">Sin tareas</div>}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
                {!proyecto?.columnas.length && <div className="vacio">Este proyecto no tiene columnas.</div>}
              </div>
            </DragDropContext>
          )}

          {tab === 'gantt' && (
            <div className="gantt">
              {!rango ? (
                <div className="g-sinfecha">
                  Ninguna tarea de este proyecto tiene fechas cargadas, así que no hay nada que ubicar en el tiempo.
                </div>
              ) : (
                <>
                  <div className="g-head">
                    <div className="g-lbl">Tarea</div>
                    <div className="g-months">
                      {rango.meses.map((m) => (
                        <div key={m.etiqueta} className="g-mo">{m.etiqueta}</div>
                      ))}
                    </div>
                  </div>
                  {tareas
                    .filter((t) => t.inicio || t.fin)
                    .map((t) => {
                      const desde = t.inicio ?? t.fin!;
                      const hasta = t.fin ?? t.inicio!;
                      const izquierda = pct(desde);
                      const ancho = Math.max(1.5, pct(hasta) - izquierda);
                      return (
                        <div
                          key={t.id}
                          className={cn('g-row', tareaId === t.id && 'sel')}
                          onClick={() => elegirTarea(t)}
                        >
                          <div className="g-name">
                            <span className="dot" style={{ background: t.hecha ? 'var(--ce-green)' : 'var(--ce-blue)' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</span>
                          </div>
                          <div className="g-track">
                            <div className="g-grid">
                              {rango.meses.map((m) => <i key={m.etiqueta} />)}
                            </div>
                            <div
                              className="g-bar"
                              title={`${desde} → ${hasta}`}
                              style={{
                                left: `${izquierda}%`,
                                width: `${ancho}%`,
                                background: t.hecha ? 'var(--ce-green)' : 'var(--ce-blue)',
                                color: '#04140a',
                              }}
                            >
                              {t.checklist.total > 0 ? `${Math.round((t.checklist.hechos / t.checklist.total) * 100)}%` : ''}
                            </div>
                            {hoy >= new Date(rango.inicio).toISOString().slice(0, 10)
                              && hoy <= new Date(rango.fin).toISOString().slice(0, 10) && (
                              <div className="g-today" style={{ left: `${pct(hoy)}%` }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  <div className="g-sinfecha">La línea verde es hoy. Las tareas sin fechas no se dibujan.</div>
                </>
              )}
            </div>
          )}

          {tab === 'lista' && (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>Columna</th>
                    <th>Responsable</th>
                    <th>Inicio</th>
                    <th>Entrega</th>
                    <th>Checklist</th>
                  </tr>
                </thead>
                <tbody>
                  {tareas.map((t) => (
                    <tr key={t.id} className={cn(tareaId === t.id && 'sel')} onClick={() => elegirTarea(t)}>
                      <td style={{ fontWeight: 650, textDecoration: t.hecha ? 'line-through' : 'none' }}>{t.titulo}</td>
                      <td>{t.columna}</td>
                      <td>{t.responsable ?? <span style={{ color: 'var(--ce-muted2)' }}>sin asignar</span>}</td>
                      <td className="mono" style={{ color: 'var(--ce-muted)' }}>{t.inicio ?? '—'}</td>
                      <td className="mono" style={{ color: 'var(--ce-muted)' }}>{t.fin ?? '—'}</td>
                      <td className="mono">{t.checklist.total > 0 ? `${t.checklist.hechos}/${t.checklist.total}` : '—'}</td>
                    </tr>
                  ))}
                  {!tareas.length && (
                    <tr>
                      <td colSpan={6} className="vacio">
                        {ocultarTerminados && todasLasTareas.length
                          ? 'Todas las tareas de este proyecto están terminadas.'
                          : 'Este proyecto no tiene tareas.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {tarea && proyecto && (
          <PanelTarea
            tarea={tarea}
            proyecto={proyecto}
            miembros={data.miembros}
            tab={panelTab}
            onTab={setPanelTab}
            abierto={panelAbierto}
            onCerrar={() => setPanelAbierto(false)}
            ocultarTerminados={ocultarTerminados}
            onEditar={(cambio) => editarTarea(tarea.id, cambio)}
            onChecklist={accion}
          />
        )}
      </div>
    </div>
  );
}

/** Alta de proyecto: una línea en el pie del rail, sin modal de por medio. */
function NuevoProyecto({
  valor,
  onValor,
  onCrear,
  creando,
}: {
  valor: string;
  onValor: (v: string) => void;
  onCrear: () => void;
  creando: boolean;
}) {
  return (
    <form
      className="pj-nuevo"
      onSubmit={(e) => {
        e.preventDefault();
        onCrear();
      }}
    >
      <input
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        placeholder="Nuevo proyecto…"
        aria-label="Nombre del proyecto nuevo"
        maxLength={200}
      />
      <button type="submit" disabled={!valor.trim() || creando} aria-label="Crear proyecto" title="Crear proyecto">
        <Icon d="mas" s={13} w={2.5} />
      </button>
    </form>
  );
}

/**
 * El panel de la tarea, en pestañas.
 *
 * Edita los mismos campos que el modal de Tareas OS con la gramática visual de
 * esta pantalla. La prioridad no tiene control propio porque en este sistema no
 * es un campo: es una etiqueta del proyecto, y se pone desde Etiquetas.
 */
function PanelTarea({
  tarea,
  proyecto,
  miembros,
  tab,
  onTab,
  abierto,
  onCerrar,
  ocultarTerminados,
  onEditar,
  onChecklist,
}: {
  tarea: TareaEmpresa;
  proyecto: ProyectosEmpresa['proyectos'][number];
  miembros: ProyectosEmpresa['miembros'];
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  abierto: boolean;
  onCerrar: () => void;
  ocultarTerminados: boolean;
  onEditar: (cambio: Record<string, unknown>) => Promise<boolean>;
  onChecklist: (pedido: () => Promise<Response>, mensajeError: string) => Promise<boolean>;
}) {
  const [titulo, setTitulo] = useState(tarea.titulo);
  const [notas, setNotas] = useState(tarea.notas ?? '');
  const [nuevoItem, setNuevoItem] = useState('');

  // Al cambiar de tarea los borradores tienen que seguirla, o el título de la
  // anterior quedaría escrito encima de la nueva.
  useEffect(() => {
    setTitulo(tarea.titulo);
    setNotas(tarea.notas ?? '');
    setNuevoItem('');
  }, [tarea.id, tarea.titulo, tarea.notas]);

  const items = ocultarTerminados ? tarea.checklist.items.filter((i) => !i.hecho) : tarea.checklist.items;
  const pctCk = tarea.checklist.total > 0
    ? Math.round((tarea.checklist.hechos / tarea.checklist.total) * 100)
    : 0;

  const agregarItem = async () => {
    const texto = nuevoItem.trim();
    if (!texto) return;
    const ok = await onChecklist(
      () => fetch(`${EMPRESA_API}/proyectos/checklist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tareaId: tarea.id, texto }),
      }),
      'No se pudo agregar el ítem.',
    );
    if (ok) setNuevoItem('');
  };

  return (
    <div className={cn('pj-detail', abierto && 'abierto')}>
      <div className="pd-top">
        <div className="ctx-t" style={{ margin: 0 }}>Tarea</div>
        <div className="sp" />
        <button type="button" className="pd-x" onClick={onCerrar} aria-label="Cerrar panel">
          <Icon d="cerrar" s={13} />
        </button>
      </div>

      <input
        className="pd-titulo"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onBlur={() => {
          const limpio = titulo.trim();
          if (!limpio) {
            setTitulo(tarea.titulo);
            return;
          }
          if (limpio !== tarea.titulo) void onEditar({ titulo: limpio });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setTitulo(tarea.titulo);
        }}
        aria-label="Título de la tarea"
        maxLength={500}
      />

      <div className="pd-tabs">
        {([['detalle', 'Detalle'], ['checklist', `Checklist${tarea.checklist.total ? ` ${tarea.checklist.hechos}/${tarea.checklist.total}` : ''}`], ['notas', 'Notas']] as const).map(([k, l]) => (
          <button key={k} type="button" className={cn('pd-tab', tab === k && 'active')} onClick={() => onTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'detalle' && (
        <>
          <label className="pd-campo">
            <span className="ctx-t">Etapa</span>
            <select
              value={String(tarea.columnaId)}
              onChange={(e) => void onEditar({ columnaId: Number(e.target.value) })}
            >
              {proyecto.columnas.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.titulo}</option>
              ))}
            </select>
          </label>

          <label className="pd-campo">
            <span className="ctx-t">Responsable</span>
            <select
              value={tarea.responsableId == null ? '' : String(tarea.responsableId)}
              onChange={(e) => void onEditar({ responsableId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Sin asignar</option>
              {miembros.map((m) => (
                <option key={m.id} value={String(m.id)}>{m.nombre}</option>
              ))}
              {/* Un responsable que ya no está en el equipo sigue siendo el
                  valor guardado: sin esta opción el selector se vería vacío. */}
              {tarea.responsableId != null && !miembros.some((m) => m.id === tarea.responsableId) && (
                <option value={String(tarea.responsableId)}>{tarea.responsable ?? 'Fuera del equipo'}</option>
              )}
            </select>
          </label>

          <div className="pd-fechas">
            <label className="pd-campo">
              <span className="ctx-t">Inicio</span>
              <input
                type="date"
                value={tarea.inicio ?? ''}
                onChange={(e) => void onEditar({ inicio: e.target.value || null })}
              />
            </label>
            <label className="pd-campo">
              <span className="ctx-t">Entrega</span>
              <input
                type="date"
                value={tarea.fin ?? ''}
                onChange={(e) => void onEditar({ fin: e.target.value || null })}
              />
            </label>
          </div>

          {proyecto.etiquetas.length > 0 && (
            <div className="pd-campo">
              <span className="ctx-t">Etiquetas</span>
              <div className="pd-chips">
                {proyecto.etiquetas.map((e) => {
                  const puesta = tarea.etiquetaIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className={cn('chip', 'chip-btn', puesta && 'on')}
                      style={puesta ? { background: `${e.color}22`, color: e.color, borderColor: e.color } : undefined}
                      onClick={() => void onEditar({
                        etiquetaIds: puesta
                          ? tarea.etiquetaIds.filter((id) => id !== e.id)
                          : [...tarea.etiquetaIds, e.id],
                      })}
                      aria-pressed={puesta}
                    >
                      {e.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="pd-hecha">
            <input
              type="checkbox"
              checked={tarea.hecha}
              onChange={(e) => void onEditar({ hecha: e.target.checked })}
            />
            Tarea terminada
          </label>

          <a className="btn" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} href={`/plugins/tasks?proyecto=${tarea.proyectoId}`}>
            <Icon d="abrir" s={12} /> Abrir en Tareas OS
          </a>
        </>
      )}

      {tab === 'checklist' && (
        <>
          {tarea.checklist.total > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ce-muted)' }}>
                  {tarea.checklist.hechos}/{tarea.checklist.total} · {pctCk}%
                </span>
              </div>
              <div className="bar" style={{ marginBottom: 12 }}>
                <i style={{ width: `${pctCk}%` }} />
              </div>
            </>
          )}

          {items.map((item) => (
            <div key={item.id} className="ck-row">
              <button
                type="button"
                className={cn('ck-box', item.hecho && 'on')}
                aria-pressed={item.hecho}
                aria-label={item.hecho ? `Desmarcar ${item.texto}` : `Marcar ${item.texto}`}
                onClick={() => void onChecklist(
                  () => fetch(`${EMPRESA_API}/proyectos/checklist`, {
                    method: 'PATCH',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ tareaId: tarea.id, itemId: item.id, hecho: !item.hecho }),
                  }),
                  'No se pudo marcar el ítem.',
                )}
              >
                {item.hecho && <Icon d="check" s={10} w={3} />}
              </button>
              <span style={{ flex: 1, textDecoration: item.hecho ? 'line-through' : 'none', color: item.hecho ? 'var(--ce-muted2)' : 'var(--ce-text)' }}>
                {item.texto}
              </span>
              <button
                type="button"
                className="ck-del"
                aria-label={`Quitar ${item.texto}`}
                title="Quitar ítem"
                onClick={() => void onChecklist(
                  () => fetch(`${EMPRESA_API}/proyectos/checklist`, {
                    method: 'DELETE',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ tareaId: tarea.id, itemId: item.id }),
                  }),
                  'No se pudo quitar el ítem.',
                )}
              >
                <Icon d="basura" s={12} />
              </button>
            </div>
          ))}

          {!items.length && (
            <div className="vacio" style={{ padding: '10px 0' }}>
              {tarea.checklist.total > 0 && ocultarTerminados
                ? 'Todos los ítems están terminados.'
                : 'Esta tarea todavía no tiene checklist.'}
            </div>
          )}

          <form
            className="ck-nuevo"
            onSubmit={(e) => {
              e.preventDefault();
              void agregarItem();
            }}
          >
            <input
              value={nuevoItem}
              onChange={(e) => setNuevoItem(e.target.value)}
              placeholder="Agregar ítem…"
              aria-label="Nuevo ítem de la checklist"
              maxLength={500}
            />
            <button type="submit" disabled={!nuevoItem.trim()} aria-label="Agregar ítem">
              <Icon d="mas" s={13} w={2.5} />
            </button>
          </form>
        </>
      )}

      {tab === 'notas' && (
        <>
          <textarea
            className="pd-notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => {
              if (notas !== (tarea.notas ?? '')) void onEditar({ notas });
            }}
            placeholder="Notas de la tarea…"
            aria-label="Notas de la tarea"
            rows={12}
          />
          <div style={{ fontSize: 10, color: 'var(--ce-muted2)', marginTop: 6 }}>
            Se guarda al salir del campo.
          </div>
        </>
      )}
    </div>
  );
}
