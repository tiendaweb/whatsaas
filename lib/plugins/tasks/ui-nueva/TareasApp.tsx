'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Columns3, LayoutList, ListChecks, Menu, Search } from 'lucide-react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { OperationsAiChat } from '@/components/operations-ai/OperationsAiChat';
import { C } from './data/clases';
import { etiquetasUnificadas, slugEtiqueta } from './data/etiquetas';
import { esVencida } from './data/fechas';
import { calcularMetricas } from './data/metricas';
import { createTaskRelation, createWorkspace, deleteProject, deleteTaskItem, deleteTaskRelation, deleteWorkspace, getTaskDetailsEndpoint, patchProject, patchWorkspace } from '@/lib/plugins/tasks/client/api';
import type { TaskDetails } from '@/lib/plugins/tasks/client/types';
import { escribirFlag } from './data/preferencias';
import { ACENTOS } from './data/tipos';
import { asegurarEspaciosOperativos } from './data/espacios-operativos';
import { agruparProyectos, chipOrigen, esEspacioEquipo, esProyectoEjemplo, primeraColumna, proyectoPorId } from './data/universo';
import { aplicarFiltros, esActiva, filtrarVista, titulosNav } from './data/vistas';
import { ES } from './i18n/es';
import { useAjustes } from './hooks/useAjustes';
import { useAtajos } from './hooks/useAtajos';
import { useMutaciones } from './hooks/useMutaciones';
import { useUniverso } from './hooks/useUniverso';
import { BarraSeleccion } from './components/BarraSeleccion';
import { CapturaRapida } from './components/CapturaRapida';
import { Confirmacion } from './components/Confirmacion';
import { ModalTarea } from './components/ModalTarea';
import { ModalPromptIA, type PromptScope } from './components/ModalPromptIA';
import { FiltroMiembros, type MiembroFiltro } from './layout/FiltroMiembros';
import { FiltroEtiquetas } from './layout/FiltroEtiquetas';
import { FiltrosEquipo } from './layout/FiltrosEquipo';
import { FiltrosSistema } from './layout/FiltrosSistema';
import type { ClientePendiente } from './layout/ListaClientes';
import { SelectorCliente, type SeleccionParte } from './layout/SelectorCliente';
import { MobileDrawer } from './layout/MobileDrawer';
import { Sidebar } from './layout/Sidebar';
import { Ajustes } from './views/Ajustes';
import { Calendario } from './views/Calendario';
import { ComoUsar } from './views/ComoUsar';
import { Enfoque } from './views/Enfoque';
import { Metricas } from './views/Metricas';
import { Tablero } from './views/Tablero';
import { Espacios } from './views/Espacios';
import { FichaCliente } from './views/FichaCliente';
import { Lista } from './views/Lista';
import { VistaEquipo } from './views/VistaEquipo';
import type { LayoutId, NavId, Tarea } from './data/tipos';
import './tareas.css';

type TeamLite = { id: number };
type UserLite = { id: number };
type ClienteLite = { id: number; name: string; profileImage?: string | null; contactIds?: number[] };
type TeamMemberRow = { user?: MiembroFiltro | null };
type ClienteProjectMeta = {
  projectId: number;
  customerId: number | null;
  customerStatus: string | null;
};

// Si no chequea `r.ok`, un 401/500 pasajero (típico al navegar y que rote la sesión)
// queda cacheado por SWR como si hubiese cargado bien, y como nunca hay `error` no
// vuelve a reintentar solo — hay que recargar la página a mano. Tirar acá deja que
// el reintento automático de SWR haga su trabajo.
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`fetch_failed:${url}`);
  return r.json();
});

/**
 * El tablero sólo se puede dibujar dentro de un proyecto. Cuando la selección
 * deja de apuntar a uno solo, hay que volver a lista o la vista queda vacía.
 */
function layoutSinProyecto(layout: LayoutId): LayoutId {
  return layout === 'tablero' ? 'lista' : layout;
}

export function TareasApp() {
  const router = useRouter();
  const { data: user } = useSWR<UserLite>('/api/user', fetcher);
  const { data: team } = useSWR<TeamLite>('/api/team', fetcher);
  const teamId = team?.id ?? null;
  const userId = user?.id ?? null;

  const { prefs, setPrefs } = useAjustes(teamId, userId);
  const { universo, workspaces, mutate, isLoading } = useUniverso();
  const { data: clientes = [] } = useSWR<ClienteLite[]>(
    '/api/plugins/customers',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false },
  );
  const { data: clienteProjects = [], mutate: mutateClienteProjects } = useSWR<ClienteProjectMeta[]>(
    '/api/plugins/tasks/client-projects',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false },
  );

  /**
   * Enlace directo a un proyecto: `/plugins/tasks?proyecto=<id>`.
   *
   * Lo usa la ficha del contacto del Command Center para saltar al trabajo de
   * ese cliente. Sin esto el link sólo podía abrir Tareas en la última vista
   * guardada y había que buscar el proyecto a mano, que es justo lo que el
   * acceso directo venía a evitar.
   *
   * Se aplica una sola vez y se limpia el parámetro: si quedara en la URL,
   * recargar volvería a forzar ese proyecto por sobre lo que la persona eligió
   * después.
   */
  const proyectoAplicado = useRef(false);
  useEffect(() => {
    if (proyectoAplicado.current || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const pedido = Number(url.searchParams.get('proyecto'));
    if (!Number.isInteger(pedido) || pedido <= 0) return;
    proyectoAplicado.current = true;
    setPrefs({ projectIds: [pedido] });
    url.searchParams.delete('proyecto');
    window.history.replaceState(null, '', url.toString());
  }, [setPrefs]);

  const [busqueda, setBusqueda] = useState('');
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [tareaAbierta, setTareaAbierta] = useState<Tarea | null>(null);
  const [metricasWs, setMetricasWs] = useState<number | null>(null);
  const [vinculosTarea, setVinculosTarea] = useState<{ id: number; name: string; relationId: number; tipo: 'cliente' | 'lead' }[]>([]);
  const [detallesTarea, setDetallesTarea] = useState<TaskDetails | null>(null);
  const [ficha, setFicha] = useState<{ tipo: 'cliente' | 'lead'; id: number } | null>(null);
  const [miembroId, setMiembroId] = useState<number | null>(null);
  const [equipoWs, setEquipoWs] = useState<number | null>(null);
  const [equipoProject, setEquipoProject] = useState<number | null>(null);
  const [clienteFiltro, setClienteFiltro] = useState<SeleccionParte>(null);
  const [promptScope, setPromptScope] = useState<PromptScope | null>(null);

  /**
   * Todas las relaciones tarea↔cliente del equipo, de una sola llamada.
   * Antes esto se poblaba tarea por tarea al abrirla, así que las tarjetas
   * de la lista no mostraban el cliente hasta abrir cada una — y el filtro
   * por cliente era imposible sin haber abierto todas.
   */
  const { data: vinculos = { customers: {}, contacts: {} }, mutate: mutateVinculos } = useSWR<{
    customers: Record<string, number[]>;
    contacts: Record<string, number[]>;
  }>(
    '/api/plugins/tasks/customer-links',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { customers: {}, contacts: {} })),
    { revalidateOnFocus: false },
  );

  /** Clientes con ventas sin cobrar (draft o confirmed), ya agregados por el servidor. */
  const { data: clientesEsperandoPago = [] } = useSWR<ClientePendiente[]>(
    '/api/plugins/customers/pending-payment',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false },
  );
  const setupEspacios = useRef(false);
  const { data: contactos = [] } = useSWR<{ id: number; name: string; chat?: { remoteJid?: string | null } | null }[]>(
    '/api/contacts/list',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false },
  );
  const { data: membersRaw } = useSWR<TeamMemberRow[] | { error?: string }>(
    '/api/team/members',
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : [])),
    { revalidateOnFocus: false },
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const contenedorRef = useRef<HTMLElement>(null);

  const archivedClientProjectIds = useMemo(
    () => new Set(clienteProjects.filter((item) => item.customerStatus === 'archived').map((item) => item.projectId)),
    [clienteProjects],
  );
  const tareasOperativas = useMemo(
    () => universo.tareas.filter((tarea) => !archivedClientProjectIds.has(tarea.projectId)),
    [archivedClientProjectIds, universo.tareas],
  );

  const confirmar = useCallback((title: string, description: string) => {
    return new Promise<boolean>((resolve) => setConfirm({ title, description, resolve }));
  }, []);

  const mutaciones = useMutaciones({
    workspaces,
    universo,
    mutate,
    escritura: prefs.escritura,
    etiquetasConfirmadas: prefs.etiquetasConfirmadas,
    onConfirmadas: (projectId) => {
      if (prefs.etiquetasConfirmadas.includes(projectId)) return;
      setPrefs({ etiquetasConfirmadas: [...prefs.etiquetasConfirmadas, projectId] });
    },
    confirmar,
  });

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTitle = document.title;
    document.body.style.overflow = 'hidden';
    document.title = 'Tareas — WhatsPro';
    if (!document.getElementById('tareas-inter')) {
      const link = document.createElement('link');
      link.id = 'tareas-inter';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(link);
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.title = prevTitle;
    };
  }, []);

  const grupos = useMemo(
    () => {
      const metadata = new Map(clienteProjects.map((item) => [item.projectId, item]));
      return agruparProyectos(universo.proyectos, universo.workspaces, universo.tareas).map((grupo) => {
        const item = metadata.get(grupo.projectIds[0]);
        return item ? { ...grupo, customerId: item.customerId, customerStatus: item.customerStatus } : grupo;
      });
    },
    [clienteProjects, universo.proyectos, universo.tareas, universo.workspaces],
  );
  // Todas las etiquetas realmente usadas en algún lado, para Ajustes (renombrar/borrar
  // tiene que alcanzar cada proyecto donde exista la etiqueta, no solo el que está a la vista).
  const unificadasTodas = useMemo(() => etiquetasUnificadas(universo.proyectos), [universo.proyectos]);

  const miembros = useMemo(() => {
    if (!Array.isArray(membersRaw)) return [];
    const seen = new Set<number>();
    const next: MiembroFiltro[] = [];
    for (const row of membersRaw) {
      const user = row.user;
      if (!user?.id || seen.has(user.id)) continue;
      seen.add(user.id);
      next.push(user);
    }
    return next;
  }, [membersRaw]);

  const workspaceActual = universo.workspaces.find((ws) => ws.id === prefs.workspaceId) ?? null;
  const vistaEquipo = workspaceActual ? esEspacioEquipo(workspaceActual.name) : false;

  // Etiquetas visibles del día a día (sidebar, captura rápida, filtro del espacio Equipo):
  // acotadas al workspace/proyecto elegido, y solo las que de verdad se usan ahí.
  const proyectosParaEtiquetas = useMemo(() => {
    if (vistaEquipo) {
      if (equipoProject) return universo.proyectos.filter((p) => p.id === equipoProject);
      if (equipoWs) return universo.proyectos.filter((p) => p.workspaceId === equipoWs);
      return universo.proyectos;
    }
    if (prefs.projectIds) return universo.proyectos.filter((p) => prefs.projectIds!.includes(p.id));
    if (prefs.workspaceId) return universo.proyectos.filter((p) => p.workspaceId === prefs.workspaceId);
    return universo.proyectos;
  }, [vistaEquipo, equipoWs, equipoProject, prefs.projectIds, prefs.workspaceId, universo.proyectos]);
  const unificadas = useMemo(() => etiquetasUnificadas(proyectosParaEtiquetas), [proyectosParaEtiquetas]);

  useEffect(() => {
    if (setupEspacios.current || universo.workspaces.length === 0) return;
    setupEspacios.current = true;
    void asegurarEspaciosOperativos(universo.workspaces)
      .then((changed) => {
        if (changed) void mutate();
      })
      .catch(() => {
        setupEspacios.current = false;
      });
  }, [mutate, universo.workspaces]);

  const etiquetaIds = useMemo(() => {
    if (!etiquetaFiltro) return null;
    return unificadas.find((e) => e.name === etiquetaFiltro)?.ids ?? null;
  }, [etiquetaFiltro, unificadas]);

  /**
   * Ids de tarea del cliente elegido. `undefined` = sin filtro de cliente;
   * un array vacío = el cliente no tiene ninguna tarea (y entonces la lista
   * debe quedar vacía, no mostrarlo todo).
   */
  const tareasDelCliente = useMemo(() => {
    if (!clienteFiltro) return null;
    const mapa = clienteFiltro.tipo === 'cliente' ? vinculos.customers : vinculos.contacts;
    return Object.entries(mapa ?? {})
      .filter(([, ids]) => ids.includes(clienteFiltro.id))
      .map(([taskId]) => Number(taskId));
  }, [clienteFiltro, vinculos]);

  const filtradas = useMemo(
    () => aplicarFiltros(tareasOperativas, {
      workspaceId: vistaEquipo ? equipoWs : prefs.workspaceId,
      projectIds: vistaEquipo
        ? (equipoProject ? [equipoProject] : null)
        : prefs.projectIds,
      etiquetaIds,
      taskIds: tareasDelCliente,
      duenoId: miembroId,
      query: busqueda,
    }),
    [tareasOperativas, vistaEquipo, equipoWs, equipoProject, prefs.workspaceId, prefs.projectIds, etiquetaIds, tareasDelCliente, miembroId, prefs.layout, busqueda],
  );

  const visibles = useMemo(() => filtrarVista(filtradas, prefs.nav), [filtradas, prefs.nav]);

  const contadores = useMemo(() => {
    const base = aplicarFiltros(tareasOperativas, {
      workspaceId: vistaEquipo ? equipoWs : prefs.workspaceId,
      projectIds: vistaEquipo
        ? (equipoProject ? [equipoProject] : null)
        : prefs.projectIds,
      etiquetaIds,
      taskIds: null,
      duenoId: miembroId,
      query: '',
    });
    return {
      bandeja: base.filter(esActiva).length,
      vencidas: base.filter((t) => esVencida(t.dueDate, esActiva(t))).length,
      enCola: base.filter((t) => t.status !== 'done' && Boolean(t.aiReadyAt)).length,
    };
  }, [tareasOperativas, vistaEquipo, equipoWs, equipoProject, prefs.workspaceId, prefs.projectIds, etiquetaIds, miembroId, prefs.layout]);

  const uniqueProject = prefs.projectIds?.length === 1 ? prefs.projectIds[0] : null;
  const proyectoFiltro = uniqueProject ? proyectoPorId(universo, uniqueProject) : null;
  const proyectoDestino = proyectoPorId(universo, prefs.destinoProjectId);
  const destinoCreacion = proyectoFiltro ?? proyectoDestino;
  const puedeTablero = Boolean(proyectoFiltro);
  // "Todos los proyectos": sin filtro de proyecto y fuera del espacio Equipo — es la única
  // vista que muestra APLICACIONES (espacios) y las columnas por miembro. Dentro de un proyecto
  // puntual, o en el espacio Equipo, se ve la lista clásica (checklist uno abajo del otro).
  const todosLosProyectos = !vistaEquipo && !prefs.projectIds;

  const capturaDisabled = !destinoCreacion || !primeraColumna(destinoCreacion);
  const capturaPlaceholder = !destinoCreacion
    ? ES.captura.sinDestino
    : proyectoFiltro
      ? ES.captura.enProyecto(chipOrigen({
          workspaceNombre: grupos.find((g) => g.projectIds.includes(proyectoFiltro.id))?.workspaceNombre ?? '',
          proyectoNombre: proyectoFiltro.name,
        } as Tarea))
      : ES.captura.placeholder;

  /**
   * Volver arriba al cambiar de pantalla, de espacio o de proyecto.
   *
   * El contenedor de scroll es el mismo `<main>` para todas las vistas, así
   * que sin esto el navegador conservaba la posición anterior: se elegía otro
   * espacio y la lista aparecía cortada por la mitad, como si hubiera saltado
   * sola. Ese era el efecto "raro" al cambiar de espacio.
   */
  useEffect(() => {
    contenedorRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [prefs.nav, prefs.workspaceId, prefs.projectIds, prefs.layout]);

  const showDock = ['bandeja', 'hoy', 'proximas', 'vencidas', 'completadas', 'enCola'].includes(prefs.nav)
    && prefs.layout !== 'tablero';

  const goNav = useCallback((nav: NavId) => {
    setPrefs({ nav });
    setDrawer(false);
  }, [setPrefs]);

  useAtajos({
    enabled: !tareaAbierta && prefs.nav !== 'enfoque',
    onBuscar: () => searchRef.current?.focus(),
    onNav: (nav) => setPrefs({ nav }),
    onEnfoque: () => setPrefs({ nav: 'enfoque' }),
    onAjustes: () => setPrefs({ nav: 'ajustes' }),
    onToggleSidebar: () => {
      if (window.matchMedia('(max-width: 1023px)').matches) setDrawer((v) => !v);
      else setPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed });
    },
    onEscape: () => {
      if (ficha) {
        setFicha(null);
        return;
      }
      if (prefs.nav === 'espacios') {
        setPrefs({ nav: 'bandeja' });
        return;
      }
      setTareaAbierta(null);
      setDrawer(false);
      setModoSeleccion(false);
    },
  });

  const cargarDetalles = (taskId: number) => {
    fetch(getTaskDetailsEndpoint(taskId))
      .then((r) => (r.ok ? r.json() : null))
      .then((details: TaskDetails | null) => {
        if (!details) return;
        setDetallesTarea(details);
        const links = (details.relations ?? [])
          .filter((rel) => ['customer', 'contact'].includes(rel.sourceType) || ['customer', 'contact'].includes(rel.targetType))
          .map((rel) => {
            const esCliente = rel.sourceType === 'customer' || rel.targetType === 'customer';
            const id = ['customer', 'contact'].includes(rel.sourceType) ? rel.sourceId : rel.targetId;
            const name = esCliente
              ? clientes.find((c) => c.id === id)?.name ?? `#${id}`
              : contactos.find((c) => c.id === id)?.name ?? `#${id}`;
            return { id, name, relationId: rel.id, tipo: (esCliente ? 'cliente' : 'lead') as 'cliente' | 'lead' };
          });
        setVinculosTarea(links);
      })
      .catch(() => {});
  };

  const abrirTarea = (tarea: Tarea) => {
    setTareaAbierta(tarea);
    setVinculosTarea([]);
    setDetallesTarea(null);
    cargarDetalles(tarea.id);
  };

  const vincularParte = async (parte: { tipo: 'cliente' | 'lead'; id: number }) => {
    if (!tareaAbierta) return;
    // La dirección la canonicaliza el servidor (insertRelation dedupe en
    // ambos sentidos), así que acá alcanza con ser consistente.
    await createTaskRelation(parte.tipo === 'cliente'
      ? { sourceType: 'customer', sourceId: parte.id, targetType: 'task', targetId: tareaAbierta.id, relationType: 'related' }
      : { sourceType: 'task', sourceId: tareaAbierta.id, targetType: 'contact', targetId: parte.id, relationType: 'related' });
    cargarDetalles(tareaAbierta.id);
    void mutateVinculos();
  };

  const vincularRelacion = async (rel: { sourceType: string; sourceId: number; targetType: string; targetId: number; relationType?: string }) => {
    await createTaskRelation(rel);
    if (tareaAbierta) cargarDetalles(tareaAbierta.id);
  };

  const desvincularCliente = async (relationId: number) => {
    await deleteTaskRelation(relationId);
    if (tareaAbierta) cargarDetalles(tareaAbierta.id);
    void mutateVinculos();
  };

  const onToggleTarea = async (tarea: Tarea) => {
    if (modoSeleccion) {
      setSeleccion((prev) => {
        const next = new Set(prev);
        if (next.has(tarea.id)) next.delete(tarea.id);
        else next.add(tarea.id);
        return next;
      });
      return;
    }
    await mutaciones.completarTarea(tarea, tarea.status !== 'done');
  };

  const prepararTareaParaIA = async (tarea: Tarea) => {
    // Es un interruptor: la misma acción devuelve la tarea a la lista, porque
    // si no, marcarla por error la dejaba fuera de todas las vistas.
    if (tarea.aiReadyAt) {
      const restored = await mutaciones.actualizarTarea(tarea, { aiReadyAt: null });
      if (restored) toast.success(ES.ia.quitada);
      return;
    }
    const tienePrompt = Boolean(
      tarea.aiPrompt.trim()
      || tarea.aiNextStep.trim()
      || tarea.aiContextQuestion.trim()
      || tarea.aiContextAnswer.trim(),
    );
    if (!tienePrompt) {
      toast.error(ES.ia.prepararSinPrompt);
      return;
    }
    const updated = await mutaciones.actualizarTarea(tarea, { aiReadyAt: new Date().toISOString() });
    if (updated) toast.success(ES.ia.preparada);
  };

  const sidebarProps = {
    nav: prefs.nav,
    onNav: goNav,
    contadores,
    workspaces: universo.workspaces.map((ws) => ({ id: ws.id, name: ws.name, aiPrompt: ws.aiPrompt, color: ws.color, icon: ws.icon })),
    grupos,
    workspaceId: prefs.workspaceId,
    projectIds: prefs.projectIds,
    onEspacio: (workspaceId: number | null, projectIds: number[] | null) => {
      setPrefs({
        workspaceId,
        projectIds,
        layout: projectIds?.length === 1 ? prefs.layout : layoutSinProyecto(prefs.layout),
        // Elegir un espacio o un proyecto desde el sidebar mientras está abierta
        // la pantalla de todos los espacios tiene que llevar al tablero: si no,
        // el clic cambiaba el filtro pero la pantalla seguía tapando todo.
        ...(prefs.nav === 'espacios' && (workspaceId || projectIds) ? { nav: 'bandeja' as const } : {}),
      });
    },
    onEditarPromptEspacio: (workspaceId: number) => {
      const workspace = universo.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) return;
      setPromptScope({ kind: 'workspace', id: workspace.id, name: workspace.name, prompt: workspace.aiPrompt ?? '' });
    },
    onEditarPromptProyecto: (projectId: number) => {
      const project = universo.proyectos.find((item) => item.id === projectId);
      if (!project) return;
      const workspace = universo.workspaces.find((item) => item.id === project.workspaceId);
      setPromptScope({
        kind: 'project',
        id: project.id,
        name: project.name,
        prompt: project.aiPrompt ?? '',
        inheritedPrompt: workspace?.aiPrompt ?? '',
      });
    },
    onAbrirCliente: (customerId: number) => setFicha({ tipo: 'cliente', id: customerId }),
    /** Archivar = mover al espacio "Archivo" (se crea si no existe). Nada se borra. */
    onArchivarProyecto: async (projectId: number) => {
      const grupo = grupos.find((item) => item.projectIds.includes(projectId));
      if (!grupo) return;
      const accepted = await confirmar(ES.clientes.proyectoArchivarTitulo(grupo.name), ES.clientes.proyectoArchivarDetalle);
      if (!accepted) return;
      try {
        let archivo = universo.workspaces.find((ws) => /archivo/i.test(ws.name));
        if (!archivo) archivo = await createWorkspace('Archivo');
        await patchProject(projectId, { workspaceId: archivo.id });
        await mutate();
        toast.success(ES.clientes.proyectoArchivado);
      } catch {
        toast.error(ES.errores.guardar);
      }
    },
    onEliminarProyecto: async (projectId: number) => {
      const grupo = grupos.find((item) => item.projectIds.includes(projectId));
      if (!grupo) return;
      const accepted = await confirmar(ES.clientes.proyectoEliminarTitulo(grupo.name), ES.clientes.proyectoEliminarDetalle);
      if (!accepted) return;
      try {
        await deleteProject(projectId);
        if (prefs.projectIds?.includes(projectId)) setPrefs({ projectIds: null });
        await mutate();
        toast.success(ES.clientes.proyectoEliminado);
      } catch {
        toast.error(ES.errores.guardar);
      }
    },
    onEliminarEspacio: async (workspaceId: number) => {
      const ws = universo.workspaces.find((w) => w.id === workspaceId);
      if (!ws) return;
      const accepted = await confirmar(ES.clientes.espacioEliminarTitulo(ws.name), ES.clientes.espacioEliminarDetalle);
      if (!accepted) return;
      try {
        await deleteWorkspace(workspaceId);
        if (prefs.workspaceId === workspaceId) setPrefs({ workspaceId: null, projectIds: null });
        await mutate();
        toast.success(ES.clientes.espacioEliminado);
      } catch {
        toast.error(ES.errores.guardar);
      }
    },
    onArchivarCliente: async (projectId: number) => {
      const grupo = grupos.find((item) => item.projectIds.includes(projectId));
      if (!grupo) return;
      const accepted = await confirmar(
        ES.clientes.archivarTitulo(grupo.name),
        ES.clientes.archivarDetalle,
      );
      if (!accepted) return;
      const response = await fetch('/api/plugins/tasks/client-projects', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error || ES.clientes.archivarError);
        return;
      }
      await Promise.all([mutateClienteProjects(), mutate()]);
      if (prefs.projectIds?.includes(projectId)) setPrefs({ projectIds: null });
      toast.success(ES.clientes.archivado(grupo.name));
    },
    onVolver: () => router.push('/apps'),
  };

  // Las etiquetas se filtran desde la cabecera, no desde la barra lateral:
  // crear una es la misma acción, así que el handler vive suelto.
  const crearEtiqueta = async () => {
    const name = window.prompt(ES.ajustes.nuevaEtiquetaNombre);
    if (!name) return;
    const target = destinoCreacion;
    if (!target) {
      toast.error(ES.ajustes.sinProyectoEtiqueta);
      setPrefs({ nav: 'ajustes' });
      return;
    }
    await mutaciones.asegurarEtiquetaEnProyecto(target.id, {
      id: `tag-${slugEtiqueta(name)}`,
      name,
      color: ACENTOS[0],
    });
  };

  const cabeceraLista = ['bandeja', 'hoy', 'proximas', 'vencidas', 'completadas', 'enCola'].includes(prefs.nav);

  /** Lista / calendario / tablero. Definido acá adentro para no tener que
   * pasarle media docena de props; se monta junto a Bandeja·Hoy. */
  const SelectoresVista = ({ className }: { className?: string }) => (
    <div className={cn('flex items-center gap-1 sm:gap-2 shrink-0', className)}>
      {([
        ['lista', LayoutList, ES.cabecera.vistaLista],
        ['calendario', CalendarDays, ES.cabecera.vistaCalendario],
        ['tablero', Columns3, ES.cabecera.vistaTablero],
      ] as const).map(([id, Icon, label]) => {
        const disabled = id === 'tablero' && !puedeTablero;
        return (
          <button
            key={id}
            type="button"
            title={disabled ? ES.cabecera.tableroSinProyecto : label}
            disabled={disabled}
            onClick={() => setPrefs({ layout: id as LayoutId })}
            className={cn(C.iconBtn, 'p-2', prefs.layout === id && C.iconBtnActive, disabled && 'opacity-30')}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );

  /**
   * Chips de cliente/lead por tarea, derivados del endpoint en lote. Antes
   * esto salía de `clientesPorTarea`, que sólo se poblaba al ABRIR cada
   * tarea — por eso los vínculos existentes (hay más a leads que a clientes)
   * no se veían nunca en las tarjetas.
   */
  const partesPorTarea = useMemo(() => {
    const nombreCliente = new Map(clientes.map((c) => [c.id, c.name]));
    const nombreLead = new Map(contactos.map((c) => [c.id, c.name]));
    const salida: Record<number, { id: number; name: string; tipo: 'cliente' | 'lead' }[]> = {};

    for (const [taskId, ids] of Object.entries(vinculos.customers ?? {})) {
      salida[Number(taskId)] = ids.map((id) => ({ id, name: nombreCliente.get(id) ?? `#${id}`, tipo: 'cliente' as const }));
    }
    for (const [taskId, ids] of Object.entries(vinculos.contacts ?? {})) {
      const key = Number(taskId);
      const leads = ids.map((id) => ({ id, name: nombreLead.get(id) ?? `#${id}`, tipo: 'lead' as const }));
      salida[key] = salida[key] ? [...salida[key], ...leads] : leads;
    }
    return salida;
  }, [clientes, contactos, vinculos]);

  /**
   * Leads que TODAVÍA no son clientes. Un contacto ya vinculado a un cliente
   * no se lista aparte: si no, el mismo negocio aparece dos veces —una como
   * cliente y otra como lead— y se lee como un duplicado que no existe.
   *
   * Además se agrega el teléfono como detalle: hay contactos distintos con el
   * mismo nombre (dos "Vale", con teléfonos y chats diferentes) y sin ese dato
   * son indistinguibles en la lista.
   */
  const leadsSueltos = useMemo(() => {
    const yaSonClientes = new Set(clientes.flatMap((cliente) => cliente.contactIds ?? []));
    const repetidos = new Set<string>();
    const vistos = new Set<string>();
    for (const contacto of contactos) {
      const clave = contacto.name.trim().toLocaleLowerCase('es');
      if (vistos.has(clave)) repetidos.add(clave);
      vistos.add(clave);
    }
    return contactos
      .filter((contacto) => !yaSonClientes.has(contacto.id))
      .map((contacto) => ({
        id: contacto.id,
        name: contacto.name,
        detalle: repetidos.has(contacto.name.trim().toLocaleLowerCase('es'))
          ? (contacto.chat?.remoteJid ?? '').replace(/@.*$/, '') || null
          : null,
      }));
  }, [clientes, contactos]);

  // `/api/plugins/customers` ya ordena por updatedAt descendente, así que
  // los primeros 15 son los últimos tocados.
  const clientesRecientes = clientes.slice(0, 15).map((cliente) => ({
    id: cliente.id,
    name: cliente.name,
    profileImage: cliente.profileImage ?? null,
  }));

  const iconosEspacios = universo.workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    color: ws.color,
    icon: ws.icon,
    proyectos: ws.projects.filter((p) => !esProyectoEjemplo(p.name)).length,
  }));

  const elegirEspacio = (id: number | null) => {
    setEquipoWs(null);
    setEquipoProject(null);
    // El tablero necesita UN proyecto: elegir un espacio deja "todos los
    // proyectos", así que hay que bajar a lista. Sin esto la pantalla quedaba
    // en blanco — la lista no se dibuja en modo tablero y el tablero no se
    // dibuja sin proyecto. Es el mismo resguardo que ya hacía el atajo de la
    // barra lateral; acá faltaba, y por eso cambiar de espacio "se hacía
    // raro" justo cuando venías de un tablero.
    setPrefs({ workspaceId: id, projectIds: null, layout: layoutSinProyecto(prefs.layout) });
    setDrawer(false);
  };

  /**
   * Reordenar arrastrando en la lista. El orden vive por COLUMNA, así que:
   * - misma columna → se reordena dentro de ella;
   * - columnas distintas → la tarea se muda a la columna destino y queda en
   *   la posición del elemento sobre el que se soltó.
   * Sin esto, arrastrar entre proyectos guardaría un orden que la vista de
   * tablero no podría representar.
   */
  const reordenarEnLista = (fromId: number, toId: number, posicion: 'antes' | 'despues' = 'antes') => {
    if (fromId === toId) return;
    const origen = universo.tareas.find((t) => t.id === fromId);
    const destino = universo.tareas.find((t) => t.id === toId);
    if (!origen || !destino) return;

    const enColumna = universo.tareas
      .filter((t) => t.columnId === destino.columnId && t.id !== fromId)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id);
    const indiceDestino = enColumna.indexOf(toId);
    const base = indiceDestino < 0 ? enColumna.length : indiceDestino;
    // La línea de referencia que ve el usuario dice "antes" o "después" de esa
    // fila: el índice tiene que coincidir con lo que se le mostró.
    enColumna.splice(posicion === 'despues' ? base + 1 : base, 0, fromId);

    void mutaciones.reordenar(destino.columnId, enColumna);
  };

  const toggleSubtarea = (tarea: Tarea, index: number) => {
    const next = tarea.subtareas.map((paso, i) => (
      i === index ? { ...paso, completed: !paso.completed } : paso
    ));
    void mutaciones.actualizarTarea(tarea, { subtareas: next });
  };

  const metricasTareas = useMemo(
    () => (metricasWs ? tareasOperativas.filter((t) => t.workspaceId === metricasWs) : tareasOperativas),
    [tareasOperativas, metricasWs],
  );
  const metricas = useMemo(() => calcularMetricas(metricasTareas), [metricasTareas]);
  const tareaEnfoque = visibles.find(esActiva) ?? tareasOperativas.find(esActiva) ?? null;

  const setFlagClasico = () => {
    if (teamId && userId) escribirFlag(teamId, userId, 'clasico');
    const url = new URL(window.location.href);
    url.searchParams.set('ui', 'clasico');
    window.location.replace(url.toString());
  };

  return (
    <div
      className="tareas-ui fixed inset-0 z-40 flex h-screen w-full overflow-hidden text-[var(--t-text)] transition-colors"
      data-theme={prefs.tema === 'oscuro' ? 'dark' : 'light'}
      style={{ ['--tareas-accent' as string]: prefs.acento }}
    >
      {!prefs.sidebarCollapsed && (
        <div className="hidden lg:flex">
          <Sidebar {...sidebarProps} width={prefs.sidebarWidth ?? 300} onResize={(w) => setPrefs({ sidebarWidth: w })} />
        </div>
      )}
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} {...sidebarProps} />

      <main ref={contenedorRef} className="flex-1 h-full overflow-y-auto relative w-full">
        {prefs.nav !== 'espacios' && prefs.nav !== 'enfoque' && (
          <div className="sticky top-0 z-10 bg-[var(--t-bg)]/90 backdrop-blur-md border-b border-[var(--t-border)]">
            <div className="px-4 lg:px-6 pt-3 pb-2 flex items-center gap-3">
              <button type="button" className="lg:hidden p-2 -ml-2" onClick={() => setDrawer(true)} aria-label="Menú">
                <Menu className="w-5 h-5" />
              </button>
              <FiltrosSistema nav={prefs.nav} onNav={goNav} contadores={contadores} />
              {/* Los selectores de vista viven acá, pegados a Bandeja/Hoy:
                  cambiar de vista y cambiar de filtro son la misma decisión
                  ("qué estoy mirando"), y antes estaban separados por media
                  pantalla. `ml-auto` los empuja al extremo derecho. */}
              {cabeceraLista && (
                <div className="ml-auto flex items-center gap-2">
                  <SelectoresVista />
                </div>
              )}
            </div>
            {cabeceraLista && (
              <div className="px-4 lg:px-6 pb-3 space-y-2">
                {/* Con quién trabajo: los miembros del equipo y, al lado, el
                    cliente o lead. Antes cliente/lead estaba arriba a la
                    derecha, separado de las personas, y se leía como si fuera
                    otra cosa — es el mismo recorte. */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <FiltroMiembros miembros={miembros} value={miembroId} onChange={setMiembroId} />
                  </div>
                  <SelectorCliente
                    className="shrink-0"
                    clientes={clientes.map((cliente) => ({ id: cliente.id, name: cliente.name }))}
                    leads={leadsSueltos}
                    valor={clienteFiltro}
                    onChange={setClienteFiltro}
                  />
                </div>
                <FiltroEtiquetas
                  etiquetas={unificadas}
                  valor={etiquetaFiltro}
                  onChange={setEtiquetaFiltro}
                  onNueva={() => void crearEtiqueta()}
                />
              </div>
            )}
          </div>
        )}
        {cabeceraLista && (
          <div className={cn('mx-auto px-4 py-5 lg:px-6 lg:py-8 pb-32', prefs.layout === 'calendario' ? 'max-w-3xl' : 'max-w-7xl')}>
            <header className="mb-6 lg:mb-12 flex flex-col gap-4 lg:gap-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2 lg:gap-3">
                    <h1 className="text-xl sm:text-2xl lg:text-4xl font-black text-[var(--t-text)] tracking-tight capitalize truncate">
                      {vistaEquipo ? ES.equipo.titulo : titulosNav(prefs.nav)}
                    </h1>
                    <p className="text-[11px] sm:text-xs lg:text-sm text-[var(--t-text-secondary)] shrink-0 whitespace-nowrap">
                      {ES.contadores.tareasActivas(visibles.filter(esActiva).length)}
                    </p>
                </div>
                <button
                  type="button"
                  title={ES.cabecera.seleccionMultiple}
                  onClick={() => {
                    setModoSeleccion((v) => !v);
                    setSeleccion(new Set());
                  }}
                  className={cn(C.iconBtn, 'p-2 lg:p-3 shrink-0', modoSeleccion && C.iconBtnActive)}
                >
                  <ListChecks className="w-4 h-4 lg:w-5 lg:h-5" />
                </button>
              </div>
              {vistaEquipo && (
                <FiltrosEquipo
                  workspaces={universo.workspaces.map((ws) => ({ id: ws.id, name: ws.name }))}
                  proyectos={universo.proyectos
                    .filter((proyecto) => !esProyectoEjemplo(proyecto.name))
                    .map((proyecto) => ({
                      id: proyecto.id,
                      name: proyecto.name,
                      workspaceId: proyecto.workspaceId,
                    }))}
                  etiquetas={unificadas}
                  workspaceId={equipoWs}
                  projectId={equipoProject}
                  etiqueta={etiquetaFiltro}
                  onWorkspace={setEquipoWs}
                  onProject={setEquipoProject}
                  onEtiqueta={setEtiquetaFiltro}
                />
              )}
              <div className="relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--t-muted)]" />
                <input
                  ref={searchRef}
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder={ES.cabecera.buscar}
                  className={C.search}
                />
              </div>
            </header>

            {isLoading ? (
              <p className="text-[var(--t-muted)]">{ES.carga}</p>
            ) : prefs.layout === 'calendario' ? (
              <Calendario tareas={visibles} onOpen={abrirTarea} />
            ) : prefs.layout === 'tablero' ? null : vistaEquipo ? (
              <VistaEquipo
                tareas={visibles}
                onToggle={onToggleTarea}
                onPrepare={prepararTareaParaIA}
                onOpen={abrirTarea}
                onToggleSub={toggleSubtarea}
                clientesPorTarea={partesPorTarea}
                onAbrirCliente={(id) => setFicha({ tipo: 'cliente', id })}
                onAbrirLead={(id) => setFicha({ tipo: 'lead', id })}
              />
            ) : (
              // Todos los proyectos y cada proyecto puntual muestran lo mismo: la lista
              // plana de tareas, sin "APLICACIONES" ni las columnas de "EQUIPO".
              <Lista
                grupos={null}
                tareas={visibles}
                mostrarOrigen={todosLosProyectos}
                /* Sólo con la lista ordenada por su propio orden: si hay
                   búsqueda o agrupación por fecha, lo que se ve no es el
                   orden real y arrastrar daría un resultado sorpresivo. */
                puedeArrastrar={!busqueda.trim() && !modoSeleccion}
                onReorder={reordenarEnLista}
                seleccionable={modoSeleccion}
                seleccion={seleccion}
                vacioTitulo={ES.vacio.titulo}
                onToggle={onToggleTarea}
                onPrepare={prepararTareaParaIA}
                onOpen={abrirTarea}
                clientesPorTarea={partesPorTarea}
                onAbrirCliente={(id) => setFicha({ tipo: 'cliente', id })}
                onAbrirLead={(id) => setFicha({ tipo: 'lead', id })}
                onAbrirProyecto={(projectId) => {
                  // Tocar la etiqueta del proyecto filtra por ese tablero:
                  // sirve igual para el proyecto propio y para el de un espejo.
                  const proyecto = universo.proyectos.find((item) => item.id === projectId);
                  setPrefs({ projectIds: [projectId], workspaceId: proyecto?.workspaceId ?? null, nav: 'bandeja' });
                }}
                onAbrirWorkspace={(workspaceId) => setPrefs({ workspaceId, projectIds: null, nav: 'bandeja' })}
              />
            )}
          </div>
        )}
        {cabeceraLista && !vistaEquipo && prefs.layout === 'tablero' && proyectoFiltro && (
          <div className="px-6">
            <Tablero
              proyecto={proyectoFiltro}
              tareas={visibles}
              onOpen={abrirTarea}
              onToggle={onToggleTarea}
              onPrepare={prepararTareaParaIA}
              onCreateTask={(columnId, title) => mutaciones.crearTarea({
                title,
                projectId: proyectoFiltro.id,
                columnId,
              })}
              onCreateColumn={(title) => mutaciones.crearColumna(proyectoFiltro.id, title)}
              onDropTask={async (tareaId, columnId, beforeId) => {
                const tarea = visibles.find((t) => t.id === tareaId);
                if (!tarea) return;
                const colItems = visibles.filter((t) => t.columnId === columnId && t.id !== tareaId);
                const ids = colItems.map((t) => t.id);
                if (beforeId) {
                  const idx = ids.indexOf(beforeId);
                  ids.splice(idx < 0 ? ids.length : idx, 0, tareaId);
                } else {
                  ids.push(tareaId);
                }
                if (tarea.columnId !== columnId) {
                  await mutaciones.moverTarea(tarea, proyectoFiltro.id, columnId);
                }
                await mutaciones.reordenar(columnId, ids);
              }}
            />
          </div>
        )}

        {prefs.nav === 'espacios' && (
          <Espacios
            espacios={iconosEspacios}
            activoId={prefs.workspaceId}
            onElegir={(id) => {
              // Elegir un espacio acá entra a "todos los proyectos" de ese espacio y
              // cierra esta pantalla — no debe quedarse filtrando las columnas in situ.
              elegirEspacio(id);
              setPrefs({ nav: 'bandeja' });
            }}
            onCerrar={() => setPrefs({ nav: 'bandeja' })}
            tareas={visibles}
            miembros={miembros}
            destacadoId={miembroId}
            onToggle={onToggleTarea}
            onPrepare={prepararTareaParaIA}
            onOpen={abrirTarea}
            onToggleSub={toggleSubtarea}
            onAbrirCliente={(id) => setFicha({ tipo: 'cliente', id })}
                onAbrirLead={(id) => setFicha({ tipo: 'lead', id })}
            clientesPorTarea={partesPorTarea}
            onAsignar={(tarea, miembroId) => void mutaciones.asignarTarea(tarea, miembroId)}
            clientesRecientes={clientesRecientes}
            clientesEsperandoPago={clientesEsperandoPago}
            clienteActivoId={clienteFiltro?.tipo === 'cliente' ? clienteFiltro.id : null}
            onElegirCliente={(id) => {
              // Elegir un cliente acá filtra y vuelve a la bandeja, igual que
              // al elegir un espacio: este panel es un selector, no una vista.
              setClienteFiltro(id ? { tipo: 'cliente', id } : null);
              if (id) setPrefs({ nav: 'bandeja' });
            }}
          />
        )}

        {prefs.nav === 'metricas' && (
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
            <Metricas
              data={metricas}
              workspaces={universo.workspaces}
              workspaceId={metricasWs}
              onWorkspace={setMetricasWs}
            />
          </div>
        )}
        {prefs.nav === 'ajustes' && (
          <div className="max-w-3xl mx-auto px-6 py-8">
            <Ajustes
              prefs={prefs}
              onPrefs={setPrefs}
              grupos={grupos}
              etiquetas={unificadasTodas}
              onComoUsar={() => setPrefs({ nav: 'comoUsar' })}
              onVolverClasico={setFlagClasico}
              onNuevaEtiqueta={async (name, color) => {
                const target = destinoCreacion;
                if (!target) {
                  toast.error(ES.ajustes.sinProyectoEtiqueta);
                  return;
                }
                await mutaciones.asegurarEtiquetaEnProyecto(target.id, {
                  id: `tag-${slugEtiqueta(name)}`,
                  name,
                  color,
                });
              }}
              onRenombrar={(etiqueta, name) => mutaciones.renombrarEtiquetaUnificada(etiqueta, name)}
              onBorrar={(etiqueta) => mutaciones.borrarEtiquetaUnificada(etiqueta)}
              onExportar={() => {
                const payload = visibles.map((tarea) => ({
                  title: tarea.title,
                  notes: tarea.notes,
                  dueDate: tarea.dueDate,
                  status: tarea.status,
                  prioridad: tarea.prioridad,
                  recurrencia: tarea.recurrencia,
                  etiquetas: tarea.etiquetas.map((e) => e.name),
                  subtareas: tarea.subtareas,
                  origen: chipOrigen(tarea),
                  projectId: tarea.projectId,
                }));
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'tareas-export.json';
                a.click();
                toast.success(ES.ajustes.exportadas(payload.length));
              }}
              onImportar={async (file) => {
                if (!destinoCreacion) {
                  toast.error(ES.ajustes.sinDestinoImportar);
                  return;
                }
                try {
                  const parsed = JSON.parse(await file.text()) as Array<{ title?: string; notes?: string; dueDate?: string | null }>;
                  const rows = Array.isArray(parsed) ? parsed : [];
                  let n = 0;
                  for (const row of rows) {
                    if (!row.title) continue;
                    await mutaciones.crearTarea({
                      title: row.title,
                      notes: row.notes,
                      dueDate: row.dueDate ?? null,
                      projectId: destinoCreacion.id,
                    });
                    n += 1;
                  }
                  toast.success(ES.ajustes.importadas(n));
                } catch {
                  toast.error(ES.errores.crear);
                }
              }}
              onLimpiar={(projectId) => mutaciones.limpiarCompletadas(projectId)}
            />
          </div>
        )}
        {prefs.nav === 'comoUsar' && (
          <div className="max-w-3xl mx-auto px-6 py-8">
            <ComoUsar />
          </div>
        )}
      </main>

      {showDock && (
        <CapturaRapida
          disabled={capturaDisabled}
          placeholder={capturaPlaceholder}
          onPlaceholderClick={() => setPrefs({ nav: 'ajustes' })}
          etiquetas={unificadas}
          onCrear={async (entrada) => {
            if (!destinoCreacion) return;
            const created = await mutaciones.crearTarea({ ...entrada, projectId: destinoCreacion.id });
            void created;
          }}
          onComoUsar={() => setPrefs({ nav: 'comoUsar' })}
          sidebarCollapsed={prefs.sidebarCollapsed}
        />
      )}

      {modoSeleccion && seleccion.size > 0 && (
        <BarraSeleccion
          n={seleccion.size}
          onCompletar={async () => {
            const items = visibles.filter((t) => seleccion.has(t.id));
            for (const tarea of items) await mutaciones.completarTarea(tarea, true);
            setSeleccion(new Set());
            setModoSeleccion(false);
          }}
          onEliminar={async () => {
            const items = visibles.filter((t) => seleccion.has(t.id));
            await mutaciones.eliminarMuchas(items);
            setSeleccion(new Set());
            setModoSeleccion(false);
          }}
          onSalir={() => {
            setSeleccion(new Set());
            setModoSeleccion(false);
          }}
        />
      )}

      {tareaAbierta && (
        <ModalTarea
          tarea={universo.tareas.find((t) => t.id === tareaAbierta.id) ?? tareaAbierta}
          grupos={grupos}
          escritura={prefs.escritura}
          clientes={clientes.map((c) => ({ id: c.id, name: c.name }))}
          vinculados={vinculosTarea}
          onVincularParte={(parte) => void vincularParte(parte)}
          leads={contactos}
          onDesvincularCliente={(id) => void desvincularCliente(id)}
          detalles={detallesTarea}
          universo={universo}
          contactos={contactos}
          onVincularRelacion={(rel) => vincularRelacion(rel)}
          onAbrirTarea={(id) => {
            const tarea = universo.tareas.find((t) => t.id === id);
            if (tarea) abrirTarea(tarea);
          }}
          onAbrirCliente={(id) => setFicha({ tipo: 'cliente', id })}
                onAbrirLead={(id) => setFicha({ tipo: 'lead', id })}
          onFiltrarProyecto={(projectId) => {
            const proyecto = universo.proyectos.find((p) => p.id === projectId);
            if (!proyecto) return;
            setPrefs({ workspaceId: proyecto.workspaceId, projectIds: [projectId], nav: 'bandeja' });
            setTareaAbierta(null);
          }}
          onActualizarRelaciones={() => {
            if (tareaAbierta) cargarDetalles(tareaAbierta.id);
          }}
          onClose={() => setTareaAbierta(null)}
          onEliminar={async () => {
            try {
              await deleteTaskItem(tareaAbierta.id);
              await mutate();
              toast.success(ES.modal.eliminada);
              setTareaAbierta(null);
              return true;
            } catch {
              toast.error(ES.errores.guardar);
              return false;
            }
          }}
          onSave={async (cambios) => {
            const actual = universo.tareas.find((t) => t.id === tareaAbierta.id) ?? tareaAbierta;
            const { moveToProjectId, ...rest } = cambios;
            const updated = await mutaciones.actualizarTarea(actual, rest);
            if (!updated) return false;
            if (moveToProjectId && moveToProjectId !== actual.projectId) {
              const moved = await mutaciones.moverTarea(actual, moveToProjectId);
              if (!moved) return false;
            }
            setTareaAbierta(null);
            return true;
          }}
        />
      )}

      {promptScope && (
        <ModalPromptIA
          scope={promptScope}
          onClose={() => setPromptScope(null)}
          onSave={async (prompt) => {
            try {
              if (promptScope.kind === 'workspace') await patchWorkspace(promptScope.id, { aiPrompt: prompt });
              else await patchProject(promptScope.id, { aiPrompt: prompt });
              await mutate();
              toast.success(ES.ia.guardado);
              return true;
            } catch {
              toast.error(ES.errores.guardar);
              return false;
            }
          }}
        />
      )}

      {prefs.nav === 'enfoque' && (
        <Enfoque
          tarea={tareaEnfoque}
          minutos={prefs.duracionEnfoque}
          onMinutos={(n) => setPrefs({ duracionEnfoque: n })}
          onClose={() => setPrefs({ nav: 'bandeja' })}
          onToggleSub={(index) => {
            if (!tareaEnfoque) return;
            const next = tareaEnfoque.subtareas.map((step, i) => (
              i === index ? { ...step, completed: !step.completed } : step
            ));
            void mutaciones.actualizarTarea(tareaEnfoque, { subtareas: next });
          }}
          onFinalizar={() => {
            if (tareaEnfoque) void mutaciones.completarTarea(tareaEnfoque, true);
          }}
        />
      )}

      {ficha && (
        <FichaCliente
          customerId={ficha.tipo === 'cliente' ? ficha.id : null}
          contactId={ficha.tipo === 'lead' ? ficha.id : null}
          teamId={teamId}
          onClose={() => setFicha(null)}
          onFiltrarTareas={() => {
            const meta = clienteProjects.find((item) => item.customerId === ficha.id);
            if (meta) {
              const proyecto = universo.proyectos.find((p) => p.id === meta.projectId);
              setPrefs({ workspaceId: proyecto?.workspaceId ?? null, projectIds: [meta.projectId], nav: 'bandeja' });
            } else {
              setPrefs({ nav: 'bandeja' });
            }
            setFicha(null);
          }}
          onAbrirTarea={(id) => {
            const tarea = universo.tareas.find((t) => t.id === id);
            setFicha(null);
            if (tarea) abrirTarea(tarea);
          }}
        />
      )}

      {confirm && (
        <Confirmacion
          title={confirm.title}
          description={confirm.description}
          onAccept={() => {
            confirm.resolve(true);
            setConfirm(null);
          }}
          onCancel={() => {
            confirm.resolve(false);
            setConfirm(null);
          }}
        />
      )}
      {/* La burbuja usa tokens globales (bg-background, bg-primary) y Tareas
          tiene su propio tema: sin este envoltorio salía oscura sobre claro.
          Y se esconde con cualquier modal abierto, para no flotar sobre el
          overlay. */}
      {!tareaAbierta && !promptScope && !ficha && !confirm && (
        <div className={prefs.tema === 'oscuro' ? 'dark' : undefined}>
          <OperationsAiChat surface="tasks" />
        </div>
      )}
    </div>
  );
}
