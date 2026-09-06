'use client';

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import useSWR from 'swr';
import { CalendarDays, CalendarPlus, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Clock, GripVertical, History, LayoutList, Loader2, Search, Sun, Sunrise, UserSquare2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { desdeZona, fechaEnZona, partesEnZona } from '@/lib/time/zona';

import { FichaDock, type DockItem } from '../components/FichaDock';
import { FiltroGates } from '../components/FiltroGates';
import { ErrorState } from '../components/States';
import type { Gate } from '../../shared/taxonomy';
import { fmtDateTime } from '../components/format';
import { ResponsiveModal, useIsDesktop } from '../skills/ResponsiveModal';
import {
  DIAS_CORTOS,
  PROGRAMADOS_API,
  claveDia,
  claveTelefono,
  diasOcupados,
  cuando,
  estaPendiente,
  horaDe,
  horaDelDia,
  paraInput,
  patchProgramado,
  programadosFetcher,
  resolverChats,
  type ChatDeTelefono,
  type Programado,
} from '../programados/api';
import { TarjetaProgramado } from '../programados/TarjetaProgramado';

type Seccion = 'lista' | 'ayer' | 'hoy' | 'manana' | 'pasado' | 'semana' | 'mapa' | 'calendario';

const SECCIONES: Array<DockItem<Seccion>> = [
  { id: 'lista', label: 'Lista', icon: LayoutList },
  { id: 'ayer', label: 'Ayer', icon: History },
  { id: 'hoy', label: 'Hoy', icon: Sun },
  { id: 'manana', label: 'Mañana', icon: Sunrise },
  { id: 'pasado', label: 'Pasado mañana', icon: CalendarPlus },
  { id: 'semana', label: 'Semana', icon: CalendarRange },
  { id: 'mapa', label: 'Mapa de horarios', icon: Clock },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
];

/** Lunes de la semana a la que pertenece la fecha (la semana laboral arranca ahí). */
function lunesDe(fecha: Date): Date {
  // A mediodía: así el día del negocio (`claveDia`) coincide con el del navegador.
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12);
  const dia = d.getDay();
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  return d;
}

function mesLargo(fecha: Date): string {
  try {
    const texto = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(fecha);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  } catch {
    return `${fecha.getMonth() + 1}/${fecha.getFullYear()}`;
  }
}

/**
 * Programados del equipo, en el Command Center.
 *
 * Ya existían en su propio plugin, pero ahí son una tabla de configuración: la
 * pregunta que se hace desde el Command Center es otra —"¿qué le va a llegar
 * hoy a quién, y puedo arreglar el texto antes de que salga?"— y esa no se
 * contesta con una tabla.
 *
 *  - **Lista**: todo, con lo que va a salir arriba y el archivo abajo.
 *  - **Hoy**: lo del día, que es lo único que ya no se puede postergar.
 *  - **Semana**: siete columnas para ver la carga y correr algo de día.
 *  - **Calendario**: el mes, para los recurrentes y los huecos.
 *
 * Todo se edita donde se lo ve: el texto, el prompt y la hora, sin salir.
 */
export function ProgramadosView({ onOpen }: { onOpen?: (chatId: number) => void }) {
  const { data, error, isLoading, mutate } = useSWR(PROGRAMADOS_API, programadosFetcher, { refreshInterval: 120_000 });
  const [seccion, setSeccion] = useState<Seccion>('lista');
  const [q, setQ] = useState('');
  const [mes, setMes] = useState(() => new Date());
  const [diaElegido, setDiaElegido] = useState<string | null>(null);
  /** teléfono (últimos 8) → chat, para que "Abrir" lleve a la ficha. */
  const [chatsPorNumero, setChatsPorNumero] = useState<Record<string, ChatDeTelefono>>({});
  const [gates, setGates] = useState<Gate[] | undefined>(undefined);

  const numeros = useMemo(
    () => Array.from(new Set((data?.rows ?? []).flatMap((p) => p.targetNumbers ?? []))),
    [data?.rows],
  );

  useEffect(() => {
    if (!numeros.length) return;
    let vigente = true;
    void resolverChats(numeros).then((mapa) => {
      if (vigente) setChatsPorNumero(mapa);
    });
    return () => {
      vigente = false;
    };
  }, [numeros]);



  /** El primer destinatario que tenga chat conocido: es a quién abre el botón. */
  const destinoDe = useCallback(
    (p: Programado) => {
      for (const numero of p.targetNumbers ?? []) {
        const clave = claveTelefono(numero);
        if (clave && chatsPorNumero[clave]) return chatsPorNumero[clave];
      }
      return null;
    },
    [chatsPorNumero],
  );

  const rows = useMemo(() => {
    const texto = q.trim().toLowerCase();
    let todas = data?.rows ?? [];
    if (texto) {
      todas = todas.filter((p) =>
        [p.name, p.message ?? '', p.aiPrompt ?? '', ...(p.targetNumbers ?? [])].join(' ').toLowerCase().includes(texto),
      );
    }
    if (gates?.length) {
      // Un programado sin chat conocido no tiene etapa: filtrar por gate lo
      // deja afuera, que es lo correcto — no se puede afirmar que sea de G7.
      todas = todas.filter((p) => {
        const gate = destinoDe(p)?.gate;
        return gate ? gates.includes(gate as Gate) : false;
      });
    }
    return todas;
  }, [data?.rows, q, gates, destinoDe]);

  const refrescar = () => void mutate();

  if (error) return <ErrorState message={String((error as Error).message ?? error)} onRetry={refrescar} />;
  if (isLoading && !data) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (data && !data.disponible) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium">Mensajes programados no está disponible</p>
        <p className="mt-1 text-xs text-muted-foreground">El plugin está apagado para este equipo, o tu usuario no tiene el permiso de lectura.</p>
      </div>
    );
  }

  return (
    // Sin marco: el borde que agrupaba dock y contenido se comía ancho en el
    // teléfono y no separaba nada que no separe ya el dock.
    <div className="flex min-h-[60dvh] flex-col">
      <FichaDock items={SECCIONES} active={seccion} onChange={setSeccion} className="rounded-xl border border-border" />

      <div className="min-h-0 flex-1 space-y-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, texto o teléfono" className="h-9 pl-8 pr-8 text-sm" aria-label="Buscar" />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Limpiar búsqueda">
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Mismas etapas que en las listas del embudo: filtrar "qué le va a
            salir a los G8" es la pregunta que ordena el día. */}
        <FiltroGates seleccionados={gates} onChange={setGates} />

        {seccion === 'lista' && <Lista rows={rows} onCambio={refrescar} onOpen={onOpen} destinoDe={destinoDe} />}
        {seccion === 'ayer' && <Dia offset={-1} rows={rows} onCambio={refrescar} onOpen={onOpen} destinoDe={destinoDe} />}
        {seccion === 'hoy' && <Dia offset={0} rows={rows} onCambio={refrescar} onOpen={onOpen} destinoDe={destinoDe} />}
        {seccion === 'manana' && <Dia offset={1} rows={rows} onCambio={refrescar} onOpen={onOpen} destinoDe={destinoDe} />}
        {seccion === 'pasado' && <Dia offset={2} rows={rows} onCambio={refrescar} onOpen={onOpen} destinoDe={destinoDe} />}
        {seccion === 'semana' && <Semana rows={rows} onCambio={refrescar} onOpen={onOpen} destinoDe={destinoDe} />}
        {seccion === 'mapa' && <MapaHorarios rows={rows} onCambio={refrescar} onOpen={onOpen} destinoDe={destinoDe} />}
        {seccion === 'calendario' && (
          <Calendario
            rows={rows}
            mes={mes}
            onMes={setMes}
            diaElegido={diaElegido}
            onDia={setDiaElegido}
            onCambio={refrescar}
            onOpen={onOpen}
            destinoDe={destinoDe}
          />
        )}
      </div>
    </div>
  );
}

type ModoProps = {
  rows: Programado[];
  onCambio: () => void;
  onOpen?: (chatId: number) => void;
  destinoDe: (p: Programado) => ChatDeTelefono | null;
};

function Grupo({
  titulo,
  items,
  onCambio,
  onOpen,
  destinoDe,
  discreto,
}: { titulo: string; items: Programado[]; /** Lo ya enviado: plegado, para que no tape lo que falta salir. */ discreto?: boolean } & Omit<ModoProps, 'rows'>) {
  const [abierto, setAbierto] = useState(!discreto);
  if (discreto && items.length === 0) return null;
  return (
    <section className={cn('space-y-2', discreto && 'pt-2')}>
      {discreto ? (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex w-full items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 hover:text-foreground"
        >
          {abierto ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
          {titulo}
          <span className="tabular-nums">{items.length}</span>
        </button>
      ) : (
        <h3 className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
          <span className="tabular-nums">{items.length}</span>
        </h3>
      )}
      {!abierto ? null : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Nada acá.</p>
      ) : (
        <ul className={cn(discreto ? 'space-y-1 opacity-75' : 'space-y-2.5')}>
          {items.map((item) => (
            <li key={item.id}>
              <TarjetaProgramado item={item} onCambio={onCambio} onOpen={onOpen} destino={destinoDe(item)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Todos, con lo que todavía va a salir arriba y lo ya enviado abajo. */
function Lista({ rows, onCambio, onOpen, destinoDe }: ModoProps) {
  const { pendientes, sinFecha, archivo } = useMemo(() => {
    const vivos = rows.filter(estaPendiente);
    // Sin fecha: guardados para coordinar el momento después. No salen solos.
    const sinFecha = vivos.filter((p) => p.scheduleType === 'once' && !p.scheduledAt && !p.nextRunAt);
    const pendientes = vivos
      .filter((p) => !sinFecha.includes(p))
      .sort((a, b) => ((a.nextRunAt ?? '9999') < (b.nextRunAt ?? '9999') ? -1 : 1));
    // El archivo se lee al revés: lo último que salió primero.
    const archivo = rows.filter((p) => !estaPendiente(p)).sort((a, b) => ((a.lastRunAt ?? '') > (b.lastRunAt ?? '') ? -1 : 1));
    return { pendientes, sinFecha, archivo };
  }, [rows]);

  return (
    <div className="space-y-5">
      <Grupo titulo="Por salir" items={pendientes} onCambio={onCambio} onOpen={onOpen} destinoDe={destinoDe} />
      {sinFecha.length > 0 && <Grupo titulo="Sin fecha · a coordinar" items={sinFecha} onCambio={onCambio} onOpen={onOpen} destinoDe={destinoDe} />}
      <Grupo discreto titulo="Enviados" items={archivo} onCambio={onCambio} onOpen={onOpen} destinoDe={destinoDe} />
    </div>
  );
}

/**
 * Un día concreto —ayer, hoy, mañana, pasado mañana— con lo que sale y lo que
 * ya salió ese día. Hoy además muestra los de una vez que quedaron atrás sin
 * salir, que no aparecían en ningún lado y son justo los que hay que mirar.
 */
function Dia({ offset, rows, onCambio, onOpen, destinoDe }: ModoProps & { offset: -1 | 0 | 1 | 2 }) {
  const { fecha, clave, atrasados, porSalir, salieron } = useMemo(() => {
    const ahora = new Date();
    // A mediodía y con el "hoy" del negocio: en un navegador en UTC, a las 22
    // de Argentina ya es mañana y "Hoy" mostraba el día equivocado.
    const hoyNegocio = partesEnZona(ahora);
    const fecha = new Date(hoyNegocio.year, hoyNegocio.month - 1, hoyNegocio.day + offset, 12);
    const clave = claveDia(fecha);
    const arranqueDeHoy = desdeZona(fechaEnZona(ahora), 0, 0);
    const salioEseDia = (p: Programado) => Boolean(p.lastRunAt && claveDia(new Date(p.lastRunAt)) === clave);
    // Un recurrente diario "cae" ese día aunque su hora ya haya pasado: si ya
    // salió, pertenece al grupo de abajo y no a la lista de lo que falta.
    const porSalir = rows.filter((p) => estaPendiente(p) && !salioEseDia(p) && diasOcupados(p, fecha, fecha).includes(clave));
    const atrasados =
      offset === 0
        ? rows.filter((p) => {
            if (!estaPendiente(p) || p.scheduleType !== 'once') return false;
            const cuando = p.scheduledAt ?? p.nextRunAt;
            const f = cuando ? new Date(cuando) : null;
            return Boolean(f && Number.isFinite(f.getTime()) && f < arranqueDeHoy);
          })
        : [];
    const salieron = rows.filter(salioEseDia);
    return { fecha, clave, atrasados, porSalir, salieron };
  }, [rows, offset]);

  const nombre = offset === -1 ? 'ayer' : offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : 'pasado mañana';
  const etiquetaFecha = `${DIAS_CORTOS[fecha.getDay()]} ${fecha.getDate()}/${fecha.getMonth() + 1}`;

  return (
    <div className="space-y-4">
      <p className="px-1 text-[11px] text-muted-foreground">
        {nombre.charAt(0).toUpperCase() + nombre.slice(1)} · {etiquetaFecha}
      </p>
      {atrasados.length > 0 && <Grupo titulo="Atrasados · no salieron" items={atrasados} onCambio={onCambio} onOpen={onOpen} destinoDe={destinoDe} />}
      {offset >= 0 && <Grupo titulo={offset === 0 ? 'Sale hoy' : `Sale ${nombre}`} items={porSalir} onCambio={onCambio} onOpen={onOpen} destinoDe={destinoDe} />}
      {offset < 0 && porSalir.length > 0 && <Grupo titulo={`Tenía que salir ${nombre} y no salió`} items={porSalir} onCambio={onCambio} onOpen={onOpen} destinoDe={destinoDe} />}
      {offset <= 0 && <Grupo discreto titulo={offset === 0 ? 'Ya salió hoy' : `Salió ${nombre}`} items={salieron} onCambio={onCambio} onOpen={onOpen} destinoDe={destinoDe} />}
    </div>
  );
}

/** Hora de salida como "09:30", tanto para recurrentes como para los de una vez. */
function horaCorta(p: Programado): string {
  const fija = horaDe(p);
  if (fija) return fija;
  const cuando = p.scheduledAt ?? p.nextRunAt ?? p.lastRunAt;
  const fecha = cuando ? new Date(cuando) : null;
  if (!fecha || !Number.isFinite(fecha.getTime())) return '--:--';
  const h = partesEnZona(fecha);
  return `${String(h.hour).padStart(2, '0')}:${String(h.minute).padStart(2, '0')}`;
}

/** Sólo los de una vez que todavía no salieron se pueden correr de día. */
const seMueve = (p: Programado) => p.scheduleType === 'once' && estaPendiente(p);

/** Misma hora, otro día. */
function moverAlDia(p: Programado, clave: string): string {
  const actual = partesEnZona(new Date(p.scheduledAt ?? p.nextRunAt ?? Date.now()));
  return desdeZona(clave, actual.hour, actual.minute).toISOString();
}

/**
 * Los siete días de esta semana.
 *
 * Antes cada programado era la tarjeta grande con el editor adentro: en una
 * columna de 120 px el editor se abría "dentro" y rompía la grilla. Ahora cada
 * uno es una línea —hora y nombre— y al tocarlo se abre en un modal con la
 * tarjeta completa (editar, prompt, ficha) y "Mover a otro día".
 *
 * En escritorio son siete columnas; en el teléfono, un selector de días con
 * conteo y la lista del día elegido: siete columnas en 360 px no se leen.
 * Los de una vez se arrastran de un día a otro (misma hora); en el teléfono,
 * donde arrastrar no anda bien, está "Mover a" dentro del modal.
 */
function Semana({ rows, onCambio, onOpen, destinoDe }: ModoProps) {
  const [offset, setOffset] = useState(0);
  const [abierto, setAbierto] = useState<Programado | null>(null);
  const [diaMovil, setDiaMovil] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const esEscritorio = useIsDesktop();

  const dias = useMemo(() => {
    const hoyNegocio = partesEnZona(new Date());
    const lunes = lunesDe(new Date(hoyNegocio.year, hoyNegocio.month - 1, hoyNegocio.day, 12));
    lunes.setDate(lunes.getDate() + offset * 7);
    const domingo = new Date(lunes);
    domingo.setDate(domingo.getDate() + 6);

    const porDia = new Map<string, Programado[]>();
    for (const p of rows) {
      for (const dia of diasOcupados(p, lunes, domingo)) {
        const lista = porDia.get(dia);
        if (lista) lista.push(p);
        else porDia.set(dia, [p]);
      }
    }
    for (const lista of porDia.values()) lista.sort((a, b) => horaCorta(a).localeCompare(horaCorta(b)));

    return Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(lunes);
      fecha.setDate(lunes.getDate() + i);
      return { fecha, clave: claveDia(fecha), items: porDia.get(claveDia(fecha)) ?? [] };
    });
  }, [rows, offset]);

  const hoy = claveDia(new Date());
  const diaActivo = diaMovil && dias.some((d) => d.clave === diaMovil) ? diaMovil : (dias.find((d) => d.clave === hoy)?.clave ?? dias[0].clave);
  // El modal muestra siempre la versión fresca del programado (después de editar, la lista se refresca).
  const abiertoFresco = abierto ? (rows.find((p) => p.id === abierto.id) ?? null) : null;

  const mover = async (p: Programado, clave: string) => {
    if (!seMueve(p)) {
      toast.error('Sólo se mueven los de una sola vez que todavía no salieron.');
      return;
    }
    if (diasOcupados(p, new Date(2000, 0, 1), new Date(2100, 0, 1))[0] === clave) return;
    setMoviendo(true);
    try {
      await patchProgramado(p.id, { scheduleType: 'once', scheduledAt: moverAlDia(p, clave) });
      toast.success(`Movido al ${clave.slice(8)}/${clave.slice(5, 7)}, misma hora.`);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo mover.');
    } finally {
      setMoviendo(false);
    }
  };

  const onDrop = (clave: string) => (event: DragEvent) => {
    event.preventDefault();
    setSobre(null);
    const id = Number(event.dataTransfer.getData('text/programado')) || arrastrando;
    setArrastrando(null);
    const p = id ? rows.find((r) => r.id === id) : null;
    if (p) void mover(p, clave);
  };

  const columna = ({ fecha, clave, items }: (typeof dias)[number]) => (
    <div
      key={clave}
      onDragOver={(e) => {
        if (arrastrando == null) return;
        e.preventDefault();
        if (sobre !== clave) setSobre(clave);
      }}
      onDragLeave={() => sobre === clave && setSobre(null)}
      onDrop={onDrop(clave)}
      className={cn(
        'min-h-28 space-y-1 rounded-xl border p-1.5 transition-colors',
        clave === hoy ? 'border-primary bg-primary/5' : 'border-border',
        sobre === clave && 'border-dashed border-primary bg-primary/10',
      )}
    >
      <p className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>
          {DIAS_CORTOS[fecha.getDay()]} {fecha.getDate()}
        </span>
        {items.length > 0 && <span className="tabular-nums">{items.length}</span>}
      </p>
      {items.length === 0 ? (
        <p className="px-1 text-[10px] text-muted-foreground/60">—</p>
      ) : (
        items.map((item) => {
          const destino = destinoDe(item);
          const movible = seMueve(item);
          return (
            <button
              key={`${clave}-${item.id}`}
              type="button"
              draggable={movible}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/programado', String(item.id));
                e.dataTransfer.effectAllowed = 'move';
                setArrastrando(item.id);
              }}
              onDragEnd={() => {
                setArrastrando(null);
                setSobre(null);
              }}
              onClick={() => setAbierto(item)}
              title={item.message ?? item.name}
              className={cn(
                'flex w-full items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1 text-left transition-colors hover:bg-muted',
                arrastrando === item.id && 'opacity-40',
                movible && 'cursor-grab active:cursor-grabbing',
              )}
            >
              {movible ? <GripVertical className="size-3 shrink-0 text-muted-foreground/60" aria-hidden /> : <span className="size-3 shrink-0" aria-hidden />}
              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-foreground">{horaCorta(item)}</span>
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  item.status === 'active' ? 'bg-emerald-500' : item.status === 'paused' ? 'bg-amber-500' : item.status === 'failed' ? 'bg-destructive' : 'bg-muted-foreground/40',
                )}
              />
              <span className="min-w-0 flex-1 truncate text-[11px]">{destino?.name ?? item.name}</span>
              {item.aiPrompt && <Wand2 className="size-3 shrink-0 text-primary" aria-label="Con prompt" />}
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setOffset((o) => o - 1)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted" aria-label="Semana anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">
            {offset === 0 ? 'Esta semana' : `${dias[0].fecha.getDate()}/${dias[0].fecha.getMonth() + 1} — ${dias[6].fecha.getDate()}/${dias[6].fecha.getMonth() + 1}`}
          </span>
          {offset !== 0 && (
            <button type="button" onClick={() => setOffset(0)} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted">
              Hoy
            </button>
          )}
        </div>
        <button type="button" onClick={() => setOffset((o) => o + 1)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted" aria-label="Semana siguiente">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      {esEscritorio ? (
        <div className="grid grid-cols-7 gap-1.5">{dias.map(columna)}</div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1">
            {dias.map(({ fecha, clave, items }) => (
              <button
                key={clave}
                type="button"
                onClick={() => setDiaMovil(clave)}
                aria-pressed={diaActivo === clave}
                className={cn(
                  'flex flex-col items-center rounded-lg border py-1 text-[10px] transition-colors',
                  diaActivo === clave ? 'border-transparent bg-foreground text-background' : clave === hoy ? 'border-primary text-primary' : 'border-border text-muted-foreground',
                )}
              >
                <span className="font-semibold uppercase">{DIAS_CORTOS[fecha.getDay()]}</span>
                <span className="text-xs tabular-nums">{fecha.getDate()}</span>
                <span className={cn('tabular-nums', items.length === 0 && 'opacity-40')}>{items.length}</span>
              </button>
            ))}
          </div>
          {columna(dias.find((d) => d.clave === diaActivo) ?? dias[0])}
        </>
      )}

      <ResponsiveModal
        open={abiertoFresco !== null}
        onOpenChange={(open) => !open && setAbierto(null)}
        title={abiertoFresco ? (destinoDe(abiertoFresco)?.name ?? abiertoFresco.name) : ''}
        description={abiertoFresco ? cuando(abiertoFresco, fmtDateTime) : undefined}
        footer={
          abiertoFresco && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {seMueve(abiertoFresco) ? (
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  Mover a
                  <Input
                    type="date"
                    className="h-8 w-40 text-xs"
                    disabled={moviendo}
                    defaultValue={paraInput(abiertoFresco.scheduledAt ?? abiertoFresco.nextRunAt).slice(0, 10)}
                    onChange={(e) => e.target.value && void mover(abiertoFresco, e.target.value)}
                  />
                  {moviendo && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                </label>
              ) : (
                <span className="text-[11px] text-muted-foreground">{abiertoFresco.scheduleType === 'once' ? 'Ya salió.' : 'Recurrente: el día lo define la regla.'}</span>
              )}
              {destinoDe(abiertoFresco) && onOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => {
                    const d = destinoDe(abiertoFresco);
                    if (d) onOpen(d.chatId);
                    setAbierto(null);
                  }}
                >
                  <UserSquare2 className="size-3.5" aria-hidden />
                  Abrir la ficha
                </Button>
              )}
            </div>
          )
        }
      >
        {abiertoFresco && <TarjetaProgramado item={abiertoFresco} onCambio={onCambio} onOpen={onOpen} destino={destinoDe(abiertoFresco)} />}
      </ResponsiveModal>
    </div>
  );
}

/** El mes completo; al tocar un día se abren sus programados abajo. */
function Calendario({
  rows,
  mes,
  onMes,
  diaElegido,
  onDia,
  onCambio,
  onOpen,
  destinoDe,
}: ModoProps & {
  mes: Date;
  onMes: (fecha: Date) => void;
  diaElegido: string | null;
  onDia: (dia: string | null) => void;
}) {
  const { celdas, porDia } = useMemo(() => {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1, 12);
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0, 12);

    const porDia = new Map<string, Programado[]>();
    for (const p of rows) {
      for (const dia of diasOcupados(p, primero, ultimo)) {
        const lista = porDia.get(dia);
        if (lista) lista.push(p);
        else porDia.set(dia, [p]);
      }
    }

    // Huecos hasta el lunes para que las columnas coincidan con los nombres.
    const previos = (primero.getDay() + 6) % 7;
    const celdas: Array<{ fecha: Date; clave: string } | null> = Array.from({ length: previos }, () => null);
    for (let d = 1; d <= ultimo.getDate(); d++) {
      const fecha = new Date(mes.getFullYear(), mes.getMonth(), d, 12);
      celdas.push({ fecha, clave: claveDia(fecha) });
    }
    return { celdas, porDia };
  }, [rows, mes]);

  const hoy = claveDia(new Date());
  const delDia = diaElegido ? (porDia.get(diaElegido) ?? []) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="text-xs font-semibold">{mesLargo(mes)}</span>
        <button
          type="button"
          onClick={() => onMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d) => (
          <span key={d} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{d}</span>
        ))}
        {celdas.map((celda, i) =>
          celda === null ? (
            <span key={`hueco-${i}`} />
          ) : (
            <button
              key={celda.clave}
              type="button"
              onClick={() => onDia(diaElegido === celda.clave ? null : celda.clave)}
              aria-pressed={diaElegido === celda.clave}
              className={cn(
                'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-xs transition-colors',
                celda.clave === hoy ? 'border-primary font-bold' : 'border-border',
                diaElegido === celda.clave ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="tabular-nums">{celda.fecha.getDate()}</span>
              {(porDia.get(celda.clave)?.length ?? 0) > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1 text-[9px] font-bold tabular-nums',
                    diaElegido === celda.clave ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary',
                  )}
                >
                  {porDia.get(celda.clave)!.length}
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {diaElegido && (
        <Grupo
          titulo={`Programados del ${fmtDateTime(`${diaElegido}T12:00:00`).slice(0, 5)}`}
          items={delDia}
          onCambio={onCambio}
          onOpen={onOpen}
          destinoDe={destinoDe}
        />
      )}
    </div>
  );
}

/**
 * Mapa de horarios: a qué hora sale cada cosa, en toda la semana.
 *
 * Ni la lista ni el calendario contestan la pregunta que uno se hace antes de
 * programar algo nuevo —"¿a qué hora ya le estamos escribiendo a la gente?"—:
 * la lista está ordenada por fecha y el calendario cuenta por día, así que
 * catorce mensajes a las 9 de la mañana se ven igual que catorce repartidos.
 *
 * Filas = hora, columnas = día. Sólo se dibujan las horas que tienen algo: un
 * mapa de 24 renglones vacíos esconde los cuatro que importan.
 */
function MapaHorarios({ rows, onCambio, onOpen, destinoDe }: ModoProps) {
  const [celda, setCelda] = useState<{ dia: string; hora: number } | null>(null);

  const { dias, horas, porCelda, maximo } = useMemo(() => {
    const lunes = lunesDe(new Date());
    const domingo = new Date(lunes);
    domingo.setDate(domingo.getDate() + 6);

    const dias = Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(lunes);
      fecha.setDate(lunes.getDate() + i);
      return { fecha, clave: claveDia(fecha) };
    });

    const porCelda = new Map<string, Programado[]>();
    const horasUsadas = new Set<number>();
    for (const p of rows) {
      const hora = horaDelDia(p);
      if (hora == null) continue;
      for (const dia of diasOcupados(p, lunes, domingo)) {
        horasUsadas.add(hora);
        const clave = `${dia}|${hora}`;
        const lista = porCelda.get(clave);
        if (lista) lista.push(p);
        else porCelda.set(clave, [p]);
      }
    }

    const horas = [...horasUsadas].sort((a, b) => a - b);
    const maximo = Math.max(1, ...[...porCelda.values()].map((l) => l.length));
    return { dias, horas, porCelda, maximo };
  }, [rows]);

  const hoy = claveDia(new Date());
  const elegidos = celda ? (porCelda.get(`${celda.dia}|${celda.hora}`) ?? []) : [];

  if (horas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium">Nada programado esta semana</p>
        <p className="mt-1 text-xs text-muted-foreground">Cuando haya, acá se ve a qué hora sale cada cosa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="px-1 text-[11px] text-muted-foreground">Cuántos mensajes salen en cada franja de esta semana. Tocá una celda para ver cuáles.</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-0.5 text-center">
          <thead>
            <tr>
              <th className="w-10 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">h</th>
              {dias.map(({ fecha, clave }) => (
                <th
                  key={clave}
                  className={cn('text-[10px] font-semibold uppercase tracking-wide', clave === hoy ? 'text-primary' : 'text-muted-foreground')}
                >
                  {DIAS_CORTOS[fecha.getDay()]} {fecha.getDate()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map((hora) => (
              <tr key={hora}>
                <td className="text-[10px] font-semibold tabular-nums text-muted-foreground">{String(hora).padStart(2, '0')}</td>
                {dias.map(({ clave }) => {
                  const items = porCelda.get(`${clave}|${hora}`) ?? [];
                  const activa = celda?.dia === clave && celda?.hora === hora;
                  // Intensidad por cantidad, en pasos: un degradado continuo no
                  // se distingue y Tailwind no genera opacidades en runtime.
                  const nivel = items.length === 0 ? 0 : Math.min(4, Math.ceil((items.length / maximo) * 4));
                  return (
                    <td key={clave}>
                      <button
                        type="button"
                        disabled={items.length === 0}
                        onClick={() => setCelda(activa ? null : { dia: clave, hora })}
                        aria-pressed={activa}
                        title={items.length ? `${items.length} a las ${String(hora).padStart(2, '0')}:00` : 'Sin nada'}
                        className={cn(
                          'flex h-7 w-full items-center justify-center rounded-md text-[10px] font-bold tabular-nums transition-colors',
                          nivel === 0 && 'bg-muted/40 text-transparent',
                          nivel === 1 && 'bg-primary/15 text-primary',
                          nivel === 2 && 'bg-primary/30 text-primary',
                          nivel === 3 && 'bg-primary/50 text-primary-foreground',
                          nivel === 4 && 'bg-primary text-primary-foreground',
                          activa && 'ring-2 ring-foreground ring-offset-1',
                        )}
                      >
                        {items.length || '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {celda && (
        <Grupo
          titulo={`${String(celda.hora).padStart(2, '0')}:00 · ${celda.dia.slice(8)}/${celda.dia.slice(5, 7)}`}
          items={elegidos}
          onCambio={onCambio}
          onOpen={onOpen}
          destinoDe={destinoDe}
        />
      )}
    </div>
  );
}
