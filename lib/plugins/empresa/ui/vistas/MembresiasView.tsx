'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  BILLING_TYPES,
  BILLING_TYPE_LABELS,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LABELS,
  PLAN_VISIBILITIES,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_LABELS,
  billingTypeLabel,
} from '@/lib/plugins/memberships/constants';
import type { MembresiasEmpresa, MontoPorMoneda, PlanFila, SuscripcionFila } from '../../shared/api-types';
import { CargandoBloques, ErrorEstado, VacioEstado } from '../componentes/Estados';
import { EMPRESA_API, fetcher, fmtInt, fmtMonto, iniciales } from '../componentes/format';
import './cabina.css';

/**
 * Marcas, Planes y Suscripciones con la interfaz de la maqueta de ChatPro,
 * igual que el CRM y Proyectos: barra única arriba, renglón de filtros y la
 * lista de borde a borde.
 *
 * Las tres son la misma pantalla con distinto `modo` porque comparten los
 * datos: cuántas suscripciones tiene un plan y cuánto entra por marca salen de
 * la misma consulta, y tenerlas separadas era la forma de que el mismo número
 * se calculara distinto en cada una.
 *
 * Marcas se dibuja como las tarjetas de **Empresas** de la maqueta: cada marca
 * es una unidad de negocio, con sus números arriba y sus planes listados
 * abajo. Planes y Suscripciones abren un **panel a la derecha** donde se editan
 * —precio, ciclo, plan, estado, vencimiento— sin salir de la lista.
 *
 * Lo que sigue viviendo en la app Membresías: dar de alta, borrar, cobrar y
 * todo lo que tiene formulario largo. Acá se corrige lo que ya existe, que es
 * el 90 % de lo que se hace mirando la lista. Cada pantalla lleva el enlace
 * para ir a la app completa.
 */

const AV = ['#25D366', '#7c5cfc', '#60a5fa', '#f5a524', '#f472b6', '#f45b69', '#2dd4bf'];
const colorDe = (s: string) => AV[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

/** Monedas que se ofrecen además de las que ya estén en uso en el equipo. */
const MONEDAS_BASE = ['ARS', 'USD', 'PYG', 'BRL', 'EUR', 'CLP', 'UYU', 'MXN'];

/** Si el equipo eligió ver también los planes privados. */
const LS_VER_PRIVADOS = 'empresa:membresias:ver-privados';

const ICONOS = {
  marcas: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  planes: 'M4 5h16v4H4zM4 13h16v6H4z',
  subs: 'M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z',
  abrir: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  cerrar: 'M18 6 6 18M6 6l12 12',
  menu: 'M4 6h16M4 12h16M4 18h16',
  check: 'M20 6 9 17l-5-5',
} as const;

function Icon({ d, s = 16 }: { d: keyof typeof ICONOS; s?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={s} height={s} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={ICONOS[d]} />
    </svg>
  );
}

/**
 * Precio del plan en la moneda elegida. `null` = el plan no se vende en ella,
 * que no es lo mismo que valer cero.
 */
function precioEn(plan: PlanFila, moneda: string): MontoPorMoneda | null {
  if (!moneda) return plan.price ? { currency: plan.currency, cents: plan.price } : null;
  const fila = (plan.prices?.length ? plan.prices : [{ currency: plan.currency, price: plan.price }])
    .find((item) => item.currency === moneda);
  return fila && fila.price ? { currency: fila.currency, cents: fila.price } : null;
}

/** Cada moneda en su renglón: nunca se suman entre sí. */
function Plata({ montos }: { montos: MontoPorMoneda[] }) {
  if (!montos.length) return <span className="plata"><span className="cero">—</span></span>;
  return (
    <span className="plata">
      {montos.map((m) => <span key={m.currency}>{fmtMonto(m)}</span>)}
    </span>
  );
}

const CICLOS: Record<string, string> = {
  monthly: 'mensual',
  annual: 'anual',
  yearly: 'anual',
  quarterly: 'trimestral',
  weekly: 'semanal',
  one_time: 'único',
  lifetime: 'de por vida',
};
const ciclo = (v: string) => CICLOS[v] ?? v;

const TITULOS = {
  marcas: { icono: 'marcas' as const, titulo: 'Marcas' },
  planes: { icono: 'planes' as const, titulo: 'Planes' },
  suscripciones: { icono: 'subs' as const, titulo: 'Suscripciones' },
};

export function MembresiasView({
  modo,
  marcaId,
  marcas,
  onMarca,
  onMenu,
}: {
  modo: 'marcas' | 'planes' | 'suscripciones';
  marcaId: number | null;
  marcas: Array<{ id: number; name: string }>;
  onMarca: (id: number | null) => void;
  onMenu?: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<'todas' | 'activas' | 'porVencer' | 'inactivas'>('todas');
  /** Qué fila está abierta en el panel de la derecha. */
  const [abierto, setAbierto] = useState<number | null>(null);
  /**
   * Los planes privados arrancan ocultos, en Planes y en las tarjetas de Marcas.
   * Un plan privado no se ofrece —precio heredado, combo de un cliente puntual,
   * prueba—, así que ensucia la lectura comercial. Se pueden mostrar porque esta
   * misma pantalla los edita: si se escondieran para siempre, marcar uno como
   * privado sería irreversible desde acá.
   */
  const [verPrivados, setVerPrivados] = useState(false);
  const [moneda, setMoneda] = useState('');

  useEffect(() => {
    try {
      setVerPrivados(window.localStorage.getItem(LS_VER_PRIVADOS) === '1');
    } catch {
      /* navegador sin storage */
    }
  }, []);

  const alternarPrivados = () => {
    setVerPrivados((prev) => {
      const siguiente = !prev;
      try {
        window.localStorage.setItem(LS_VER_PRIVADOS, siguiente ? '1' : '0');
      } catch {
        /* navegador sin storage */
      }
      return siguiente;
    });
  };

  const esVisible = (p: { visibility: string }) => verPrivados || p.visibility === 'public';

  const qs = marcaId == null ? '' : `?marca=${marcaId}`;
  const { data, error, isLoading, mutate } = useSWR<MembresiasEmpresa>(`${EMPRESA_API}/membresias${qs}`, fetcher);

  // Cambiar de pantalla cierra el panel: la fila 12 de Planes no es la 12 de
  // Suscripciones, y dejarlo abierto mostraba el detalle de otra cosa.
  useEffect(() => { setAbierto(null); }, [modo]);

  const termino = busqueda.trim().toLocaleLowerCase('es');

  const planes = useMemo(() => {
    if (!data) return [];
    return data.planes.filter((p) => {
      if (!esVisible(p)) return false;
      if (termino && !`${p.name} ${p.marca ?? ''}`.toLocaleLowerCase('es').includes(termino)) return false;
      if (estado === 'activas') return p.status === 'active';
      if (estado === 'inactivas') return p.status !== 'active';
      return true;
    });
    // `esVisible` sólo depende de `verPrivados`; listarlo evita recalcular de más.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, estado, termino, verPrivados]);

  const suscripciones = useMemo(() => {
    if (!data) return [];
    return data.suscripciones.filter((s) => {
      if (termino && !`${s.cliente ?? ''} ${s.plan ?? ''} ${s.numero}`.toLocaleLowerCase('es').includes(termino)) return false;
      if (estado === 'activas') return s.status === 'active';
      if (estado === 'porVencer') return s.porVencer;
      if (estado === 'inactivas') return s.status !== 'active';
      return true;
    });
  }, [data, estado, termino]);

  const marcasFiltradas = useMemo(() => {
    if (!data) return [];
    return data.marcas.filter((m) => {
      if (marcaId != null && m.id !== marcaId) return false;
      if (termino && !m.name.toLocaleLowerCase('es').includes(termino)) return false;
      if (estado === 'activas') return m.status === 'active';
      if (estado === 'inactivas') return m.status !== 'active';
      return true;
    });
  }, [data, estado, marcaId, termino]);

  /**
   * Moneda con la que se leen los precios de los planes. Vacío = cada plan en
   * su moneda principal. Las marcas declaran en cuáles venden: el mismo plan
   * puede estar en ARS, PYG y USD y mezclarlos en una columna no se entiende.
   */
  const monedasDisponibles = useMemo(() => {
    const marca = marcaId != null ? data?.marcas.find((m) => m.id === marcaId) : null;
    if (marca?.currencies?.length) return marca.currencies;
    const enUso = new Set<string>();
    for (const p of data?.planes ?? []) {
      if (marcaId != null && p.companyId !== marcaId) continue;
      for (const precio of p.prices?.length ? p.prices : [{ currency: p.currency }]) {
        if (precio.currency) enUso.add(precio.currency);
      }
    }
    return [...enUso].sort();
  }, [data, marcaId]);

  useEffect(() => {
    const marca = marcaId != null ? data?.marcas.find((m) => m.id === marcaId) : null;
    if (!marca || !monedasDisponibles.length) return;
    setMoneda((actual) => {
      if (actual && monedasDisponibles.includes(actual)) return actual;
      const preferida = marca.defaultCurrency && monedasDisponibles.includes(marca.defaultCurrency)
        ? marca.defaultCurrency
        : monedasDisponibles[0];
      return preferida;
    });
  }, [data, marcaId, monedasDisponibles]);

  /** Monedas que ofrecen los selectores: las que ya se usan, primero. */
  const monedas = useMemo(() => {
    const enUso = new Set<string>();
    for (const p of data?.planes ?? []) enUso.add(p.currency);
    for (const s of data?.suscripciones ?? []) enUso.add(s.currency);
    return [...enUso, ...MONEDAS_BASE.filter((m) => !enUso.has(m))];
  }, [data]);

  if (error) return <ErrorEstado mensaje={String(error.message ?? error)} onReintentar={() => void mutate()} />;
  if (isLoading || !data) return <CargandoBloques bloques={4} />;

  const { icono, titulo } = TITULOS[modo];
  const destino = modo === 'marcas'
    ? '/plugins/memberships/companies'
    : modo === 'planes'
      ? '/plugins/memberships/plans'
      : '/plugins/memberships/subscriptions';

  const planAbierto = modo === 'planes' ? planes.find((p) => p.id === abierto) ?? null : null;
  const subAbierta = modo === 'suscripciones' ? suscripciones.find((s) => s.id === abierto) ?? null : null;

  return (
    <div className="cabina">
      <div className="topbar">
        {onMenu && (
          <button type="button" className="btn lg:hidden" onClick={onMenu} aria-label="Menú">
            <Icon d="menu" s={14} />
          </button>
        )}
        <Icon d={icono} s={17} />
        <div className="titulo">
          <div className="nm">{titulo}</div>
          <div className="sub conteo">
            <span className="n"><b>{fmtInt(data.totales.marcas)}</b> marcas</span>
            {/* El total sigue a lo que se está mostrando: con los privados
                escondidos, anunciar el total crudo hacía que el número del
                encabezado no cerrara nunca con las filas de la tabla. */}
            <span className="n">
              <b>{fmtInt(data.planes.filter(esVisible).length)}</b> planes
            </span>
            <span className="n"><b>{fmtInt(data.totales.activas)}</b> activas</span>
            {data.totales.porVencer > 0 && <span className="n"><b>{fmtInt(data.totales.porVencer)}</b> vencen en 30 días</span>}
          </div>
        </div>
        <div className="sp" />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ce-muted2)' }}>
            Por mes
          </div>
          <Plata montos={data.totales.recurrente} />
        </div>
        <a className="btn" href={destino}>
          <Icon d="abrir" s={12} /> Abrir en Membresías
        </a>
      </div>

      {/* El mismo renglón de selectores del CRM: marca y estado, uno al lado
          del otro, más el buscador. */}
      <div className="filtros">
        <label className="selcampo">
          <span className="rot">Marca</span>
          <select value={marcaId == null ? '' : String(marcaId)} onChange={(e) => onMarca(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todas</option>
            {marcas.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
          </select>
        </label>

        <label className="selcampo">
          <span className="rot">Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
            <option value="todas">Todos</option>
            <option value="activas">{modo === 'suscripciones' ? 'Activas' : 'Activos'}</option>
            {modo === 'suscripciones' && <option value="porVencer">Vencen en 30 días</option>}
            <option value="inactivas">{modo === 'suscripciones' ? 'No activas' : 'No activos'}</option>
          </select>
        </label>

        {modo !== 'suscripciones' && monedasDisponibles.length > 1 && (
          <label className="selcampo">
            <span className="rot">Moneda</span>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="">Cada una en la suya</option>
              {monedasDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}

        {/* Los privados no tienen nada que ver con las suscripciones, que se
            listan por cliente: el interruptor sólo aparece donde cambia algo. */}
        {modo !== 'suscripciones' && (
          <button
            type="button"
            className={cn('btn', verPrivados && 'on')}
            onClick={alternarPrivados}
            aria-pressed={verPrivados}
            title="Los planes privados son los que no se ofrecen: precios heredados, combos puntuales o pruebas"
          >
            {verPrivados ? 'Ocultar privados' : 'Ver privados'}
          </button>
        )}

        <input
          className="buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={modo === 'suscripciones' ? 'Buscar cliente, plan o número…' : 'Buscar…'}
          aria-label="Buscar"
        />
      </div>

      {/* ── Marcas: las tarjetas de Empresas de la maqueta ── */}
      {modo === 'marcas' && (
        marcasFiltradas.length === 0 ? (
          <div style={{ padding: 24 }}><VacioEstado titulo="No hay marcas para este filtro" /></div>
        ) : (
          <div className="tarjetas">
            {marcasFiltradas.map((m) => {
              const color = colorDe(m.name);
              const planesDeMarca = data.planes.filter((p) => p.companyId === m.id && esVisible(p));
              const privadosOcultos = m.planes - m.planesPublicos;
              const subsDeMarca = data.suscripciones.filter((s) => s.companyId === m.id);
              const clientes = new Set(subsDeMarca.map((s) => s.cliente).filter(Boolean)).size;
              return (
                <div key={m.id} className="panel">
                  <div className="marca-h">
                    <div
                      className="marca-ic"
                      style={{ background: `${color}1f`, border: `1px solid ${color}40`, color }}
                    >
                      {m.logoUrl ? <img src={m.logoUrl} alt="" /> : m.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="marca-nm">{m.name}</div>
                      <div className="sub">
                        {m.status === 'active' ? 'activa' : m.status}
                        {m.website ? ` · ${m.website.replace(/^https?:\/\//, '')}` : ''}
                      </div>
                    </div>
                    <span className={cn('estado', m.status === 'active' ? 'ok' : 'baja')}>
                      {m.status === 'active' ? 'activa' : m.status}
                    </span>
                  </div>

                  <div className="tres">
                    <div className="stat">
                      <div className="l">Por mes</div>
                      <div className="v" style={{ fontSize: 15, color }}><Plata montos={m.recurrente} /></div>
                    </div>
                    <div className="stat">
                      <div className="l">Clientes</div>
                      <div className="v" style={{ fontSize: 15 }}>{fmtInt(clientes)}</div>
                    </div>
                    <div className="stat">
                      <div className="l">Activas</div>
                      <div className="v" style={{ fontSize: 15 }}>{fmtInt(m.activas)}</div>
                    </div>
                  </div>

                  <div className="ctx-t">
                    Planes ({fmtInt(planesDeMarca.length)})
                    {!verPrivados && privadosOcultos > 0 && (
                      <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--ce-muted2)' }}>
                        {' '}· {fmtInt(privadosOcultos)} {privadosOcultos === 1 ? 'privado oculto' : 'privados ocultos'}
                      </span>
                    )}
                  </div>
                  {planesDeMarca.length === 0 ? (
                    <p className="sub" style={{ marginBottom: 12 }}>
                      {!verPrivados && privadosOcultos > 0
                        ? 'Todos los planes de esta marca son privados.'
                        : 'Esta marca todavía no tiene planes cargados.'}
                    </p>
                  ) : (
                    planesDeMarca.slice(0, 6).map((p) => (
                      <div key={p.id} className="list-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="nm">{p.name}</div>
                          <div className="sub2">
                            {billingTypeLabel(p.billingType, p.billingLabel)} · {fmtInt(p.suscripciones)} {p.suscripciones === 1 ? 'suscripción' : 'suscripciones'}
                          </div>
                        </div>
                        <span className="mono" style={{ fontWeight: 700 }}>
                          {(() => {
                            const monto = precioEn(p, marcaId === m.id ? moneda : '');
                            if (monto) return fmtMonto(monto);
                            return <span style={{ color: 'var(--ce-muted2)' }}>{marcaId === m.id && moneda ? `— ${moneda}` : 'a medida'}</span>;
                          })()}
                        </span>
                      </div>
                    ))
                  )}
                  {planesDeMarca.length > 6 && (
                    <p className="sub" style={{ marginTop: 6 }}>y {fmtInt(planesDeMarca.length - 6)} planes más.</p>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                    {/* Elegir la marca acá recorta el resto de Empresa, que es
                        para lo que sirve el rótulo de arriba. */}
                    <button type="button" className="btn sm" onClick={() => onMarca(marcaId === m.id ? null : m.id)}>
                      {marcaId === m.id ? 'Quitar el filtro' : 'Ver sólo esta marca'}
                    </button>
                    {m.porVencer > 0 && (
                      <span className="estado aviso" style={{ alignSelf: 'center' }}>
                        {fmtInt(m.porVencer)} {m.porVencer === 1 ? 'vence' : 'vencen'} en 30 días
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Planes: lista y panel de edición ── */}
      {modo === 'planes' && (
        <div className="cuerpo">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Marca</th>
                  <th>Precio</th>
                  <th>Ciclo</th>
                  <th>Suscripciones</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {planes.map((p) => (
                  <tr key={p.id} className={abierto === p.id ? 'sel' : ''} onClick={() => setAbierto(p.id)}>
                    <td style={{ fontWeight: 650 }}>{p.name}</td>
                    <td>{p.marca ?? <span style={{ color: 'var(--ce-muted2)' }}>sin marca</span>}</td>
                    <td className="mono">
                      {(() => {
                        const monto = precioEn(p, moneda);
                        if (monto) return <Plata montos={[monto]} />;
                        return <span style={{ color: 'var(--ce-muted2)' }}>{moneda ? `— ${moneda}` : 'a medida'}</span>;
                      })()}
                    </td>
                    <td>{p.billingLabel || ciclo(p.billingType)}</td>
                    <td className="mono">{fmtInt(p.suscripciones)}</td>
                    <td>
                      <span className={cn('estado', p.status === 'active' ? 'ok' : 'baja')}>
                        {p.status === 'active' ? (p.visibility === 'public' ? 'público' : 'privado') : p.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!planes.length && <tr><td colSpan={6} className="vacio">No hay planes para este filtro.</td></tr>}
              </tbody>
            </table>
          </div>

          {planAbierto && (
            <PanelPlan
              key={planAbierto.id}
              plan={planAbierto}
              marcas={marcas}
              monedas={monedas}
              onCerrar={() => setAbierto(null)}
              onGuardado={() => void mutate()}
            />
          )}
        </div>
      )}

      {/* ── Suscripciones: lista y panel de edición ── */}
      {modo === 'suscripciones' && (
        <div className="cuerpo">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Plan</th>
                  <th>Marca</th>
                  <th>Precio</th>
                  <th>Ciclo</th>
                  <th>Desde</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {suscripciones.map((s) => (
                  <tr key={s.id} className={abierto === s.id ? 'sel' : ''} onClick={() => setAbierto(s.id)}>
                    <td style={{ fontWeight: 650 }}>{s.cliente ?? <span style={{ color: 'var(--ce-muted2)' }}>sin cliente</span>}</td>
                    <td>{s.plan ?? '—'}</td>
                    <td>{s.marca ?? <span style={{ color: 'var(--ce-muted2)' }}>—</span>}</td>
                    <td className="mono"><Plata montos={s.price ? [{ currency: s.currency, cents: s.price }] : []} /></td>
                    <td>{ciclo(s.billingType)}</td>
                    <td className="mono" style={{ color: 'var(--ce-muted)' }}>{s.inicio}</td>
                    <td className="mono" style={{ color: s.porVencer ? '#f5a524' : 'var(--ce-muted)' }}>{s.vence ?? '—'}</td>
                    <td>
                      <span className={cn('estado', s.status === 'active' ? (s.porVencer ? 'aviso' : 'ok') : 'baja')}>
                        {s.status === 'active' ? (s.porVencer ? 'vence pronto' : 'activa') : s.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!suscripciones.length && <tr><td colSpan={8} className="vacio">No hay suscripciones para este filtro.</td></tr>}
              </tbody>
            </table>
          </div>

          {subAbierta && (
            <PanelSuscripcion
              key={subAbierta.id}
              sub={subAbierta}
              planes={data.planes}
              monedas={monedas}
              onCerrar={() => setAbierto(null)}
              onGuardado={() => void mutate()}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** El encabezado del panel: quién es, y la cruz para cerrarlo. */
function DetalleHero({
  nombre,
  detalle,
  color,
  onCerrar,
}: {
  nombre: string;
  detalle: string;
  color: string;
  onCerrar: () => void;
}) {
  return (
    <div className="detail-hero">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div
          className="avatar"
          style={{ width: 44, height: 44, fontSize: 15, background: `linear-gradient(140deg,${color},${colorDe(`${nombre}x`)})` }}
        >
          {iniciales(nombre)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nombre}
          </div>
          <div className="sub">{detalle}</div>
        </div>
        <button type="button" className="btn sm ghost" onClick={onCerrar} aria-label="Cerrar el panel">
          <Icon d="cerrar" s={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Precio en unidades para el campo, centavos para la base.
 *
 * Membresías guarda el precio en centavos. Mostrar `12000` donde la persona
 * escribe "120" es la forma más rápida de multiplicar por cien un plan.
 */
const aUnidades = (cents: number) => (cents / 100).toString();
const aCentavos = (texto: string): number | null => {
  const limpio = texto.replace(/\s/g, '').replace(',', '.');
  if (limpio === '') return 0;
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

/** El panel de un plan: se edita lo que se corrige mirando la lista. */
function PanelPlan({
  plan,
  marcas,
  monedas,
  onCerrar,
  onGuardado,
}: {
  plan: PlanFila;
  marcas: Array<{ id: number; name: string }>;
  monedas: string[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [name, setName] = useState(plan.name);
  const [companyId, setCompanyId] = useState<string>(plan.companyId == null ? '' : String(plan.companyId));
  const [precio, setPrecio] = useState(aUnidades(plan.price));
  const [currency, setCurrency] = useState(plan.currency);
  const [billingType, setBillingType] = useState(plan.billingType);
  const [billingLabel, setBillingLabel] = useState(plan.billingLabel ?? '');
  const [visibility, setVisibility] = useState(plan.visibility);
  const [status, setStatus] = useState(plan.status);
  const [guardando, setGuardando] = useState(false);

  const cambiado =
    name !== plan.name ||
    companyId !== (plan.companyId == null ? '' : String(plan.companyId)) ||
    precio !== aUnidades(plan.price) ||
    currency !== plan.currency ||
    billingType !== plan.billingType ||
    billingLabel !== (plan.billingLabel ?? '') ||
    visibility !== plan.visibility ||
    status !== plan.status;

  const guardar = async () => {
    const cents = aCentavos(precio);
    if (cents == null) {
      toast.error('El precio tiene que ser un número.');
      return;
    }
    if (!name.trim()) {
      toast.error('El plan necesita un nombre.');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/plugins/memberships/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          companyId: companyId ? Number(companyId) : null,
          price: cents,
          currency,
          billingType,
          billingLabel: billingType === 'custom' ? billingLabel.trim() || null : null,
          visibility,
          status,
        }),
      });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        throw new Error(typeof cuerpo?.error === 'string' ? cuerpo.error : 'No se pudo guardar el plan.');
      }
      toast.success('Plan actualizado');
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el plan.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <aside className="detail" aria-label={`Plan ${plan.name}`}>
      <DetalleHero
        nombre={plan.name}
        detalle={`${plan.marca ?? 'sin marca'} · ${fmtInt(plan.suscripciones)} ${plan.suscripciones === 1 ? 'suscripción' : 'suscripciones'}`}
        color={colorDe(plan.marca ?? plan.name)}
        onCerrar={onCerrar}
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="l">Precio</div>
          <div className="v"><Plata montos={plan.price ? [{ currency: plan.currency, cents: plan.price }] : []} /></div>
        </div>
        <div className="stat">
          <div className="l">Suscripciones</div>
          <div className="v">{fmtInt(plan.suscripciones)}</div>
        </div>
      </div>

      <div className="section-pad">
        <div className="ctx-t">Datos del plan</div>

        <div className="campo">
          <label className="fl" htmlFor={`plan-nombre-${plan.id}`}>Nombre</label>
          <input id={`plan-nombre-${plan.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="campo">
          <label className="fl" htmlFor={`plan-marca-${plan.id}`}>Marca</label>
          <select id={`plan-marca-${plan.id}`} className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Sin marca</option>
            {marcas.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
          </select>
        </div>

        <div className="campo campo-fila">
          <div>
            <label className="fl" htmlFor={`plan-precio-${plan.id}`}>Precio</label>
            <input
              id={`plan-precio-${plan.id}`}
              className="input mono"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
          <div>
            <label className="fl" htmlFor={`plan-moneda-${plan.id}`}>Moneda</label>
            <select id={`plan-moneda-${plan.id}`} className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {monedas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="campo">
          <label className="fl" htmlFor={`plan-ciclo-${plan.id}`}>Ciclo de cobro</label>
          <select id={`plan-ciclo-${plan.id}`} className="input" value={billingType} onChange={(e) => setBillingType(e.target.value)}>
            {BILLING_TYPES.map((b) => <option key={b} value={b}>{BILLING_TYPE_LABELS[b]}</option>)}
          </select>
        </div>

        {billingType === 'custom' && (
          <div className="campo">
            <label className="fl" htmlFor={`plan-etiqueta-${plan.id}`}>Cómo se cobra</label>
            <input
              id={`plan-etiqueta-${plan.id}`}
              className="input"
              value={billingLabel}
              onChange={(e) => setBillingLabel(e.target.value)}
              placeholder="Ej: por hito de proyecto"
            />
          </div>
        )}

        <div className="campo campo-fila">
          <div>
            <label className="fl" htmlFor={`plan-visib-${plan.id}`}>Visibilidad</label>
            <select id={`plan-visib-${plan.id}`} className="input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              {PLAN_VISIBILITIES.map((v) => <option key={v} value={v}>{v === 'public' ? 'Público' : 'Privado'}</option>)}
            </select>
          </div>
          <div>
            <label className="fl" htmlFor={`plan-estado-${plan.id}`}>Estado</label>
            <select id={`plan-estado-${plan.id}`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button type="button" className="btn g sm" onClick={() => void guardar()} disabled={!cambiado || guardando}>
            <Icon d="check" s={12} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <a className="btn sm" href={`/plugins/memberships/plans`}>
            <Icon d="abrir" s={12} /> Abrir en Membresías
          </a>
        </div>
        {plan.suscripciones > 0 && (
          <p className="sub" style={{ marginTop: 10 }}>
            Cambiar el precio del plan no toca las {fmtInt(plan.suscripciones)} suscripciones que ya se vendieron: cada
            una guarda el precio con el que se firmó. Se corrige una por una desde Suscripciones.
          </p>
        )}
      </div>
    </aside>
  );
}

/** El panel de una suscripción: plan, precio, estado y vencimiento. */
function PanelSuscripcion({
  sub,
  planes,
  monedas,
  onCerrar,
  onGuardado,
}: {
  sub: SuscripcionFila;
  planes: PlanFila[];
  monedas: string[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  /**
   * El plan viaja por nombre en la lista, no por id: la fila guarda el nombre
   * que tenía el plan cuando se vendió. Para el selector hace falta el id, así
   * que se busca por nombre y, si el plan se renombró desde entonces, se
   * empieza vacío en vez de elegir mal.
   */
  const planActual = planes.find((p) => p.name === sub.plan && p.companyId === sub.companyId) ?? null;
  const [planId, setPlanId] = useState<string>(planActual ? String(planActual.id) : '');
  const [precio, setPrecio] = useState(aUnidades(sub.price));
  const [currency, setCurrency] = useState(sub.currency);
  const [billingType, setBillingType] = useState(sub.billingType);
  const [status, setStatus] = useState(sub.status);
  const [paymentStatus, setPaymentStatus] = useState(sub.paymentStatus);
  const [inicio, setInicio] = useState(sub.inicio);
  const [vence, setVence] = useState(sub.vence ?? '');
  const [guardando, setGuardando] = useState(false);

  const inicial = {
    planId: planActual ? String(planActual.id) : '',
    precio: aUnidades(sub.price),
    currency: sub.currency,
    billingType: sub.billingType,
    status: sub.status,
    paymentStatus: sub.paymentStatus,
    inicio: sub.inicio,
    vence: sub.vence ?? '',
  };
  const cambiado =
    planId !== inicial.planId ||
    precio !== inicial.precio ||
    currency !== inicial.currency ||
    billingType !== inicial.billingType ||
    status !== inicial.status ||
    paymentStatus !== inicial.paymentStatus ||
    inicio !== inicial.inicio ||
    vence !== inicial.vence;

  const guardar = async () => {
    const cents = aCentavos(precio);
    if (cents == null) {
      toast.error('El precio tiene que ser un número.');
      return;
    }
    setGuardando(true);
    try {
      const cuerpo: Record<string, unknown> = {
        price: cents,
        currency,
        billingType,
        status,
        paymentStatus,
        startDate: inicio,
        endDate: vence ? vence : null,
      };
      // El plan sólo se manda si cambió: mandarlo igual re-escribe el nombre
      // guardado de la suscripción con el nombre actual del plan, y ese
      // nombre es justamente el que documenta qué se vendió.
      if (planId !== inicial.planId) cuerpo.planId = planId ? Number(planId) : null;

      const res = await fetch(`/api/plugins/memberships/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo guardar la suscripción.');
      }
      toast.success('Suscripción actualizada');
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la suscripción.');
    } finally {
      setGuardando(false);
    }
  };

  const nombre = sub.cliente ?? sub.numero;

  return (
    <aside className="detail" aria-label={`Suscripción ${sub.numero}`}>
      <DetalleHero
        nombre={nombre}
        detalle={`${sub.numero} · ${sub.plan ?? 'sin plan'}${sub.marca ? ` · ${sub.marca}` : ''}`}
        color={colorDe(nombre)}
        onCerrar={onCerrar}
      />

      <div className="stat-grid">
        <div className="stat">
          <div className="l">Precio</div>
          <div className="v"><Plata montos={sub.price ? [{ currency: sub.currency, cents: sub.price }] : []} /></div>
        </div>
        <div className="stat">
          <div className="l">Vence</div>
          <div className="v mono" style={{ fontSize: 14, color: sub.porVencer ? '#f5a524' : undefined }}>{sub.vence ?? 'sin fecha'}</div>
        </div>
      </div>

      <div className="section-pad">
        <div className="ctx-t">Membresía</div>

        <div className="campo">
          <label className="fl" htmlFor={`sub-plan-${sub.id}`}>Plan</label>
          <select id={`sub-plan-${sub.id}`} className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">{planActual ? 'Sin plan' : `Sin cambiar (${sub.plan ?? 'sin plan'})`}</option>
            {planes.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.marca ? `${p.marca} · ${p.name}` : p.name}</option>
            ))}
          </select>
        </div>

        <div className="campo campo-fila">
          <div>
            <label className="fl" htmlFor={`sub-precio-${sub.id}`}>Precio</label>
            <input
              id={`sub-precio-${sub.id}`}
              className="input mono"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
          <div>
            <label className="fl" htmlFor={`sub-moneda-${sub.id}`}>Moneda</label>
            <select id={`sub-moneda-${sub.id}`} className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {monedas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="campo">
          <label className="fl" htmlFor={`sub-ciclo-${sub.id}`}>Ciclo de cobro</label>
          <select id={`sub-ciclo-${sub.id}`} className="input" value={billingType} onChange={(e) => setBillingType(e.target.value)}>
            {BILLING_TYPES.map((b) => <option key={b} value={b}>{BILLING_TYPE_LABELS[b]}</option>)}
          </select>
        </div>

        <div className="campo campo-fila">
          <div>
            <label className="fl" htmlFor={`sub-estado-${sub.id}`}>Estado</label>
            <select id={`sub-estado-${sub.id}`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {SUBSCRIPTION_STATUS.map((s) => <option key={s} value={s}>{SUBSCRIPTION_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="fl" htmlFor={`sub-pago-${sub.id}`}>Pago</label>
            <select id={`sub-pago-${sub.id}`} className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              {PAYMENT_STATUS.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>

        <div className="campo campo-fila">
          <div>
            <label className="fl" htmlFor={`sub-inicio-${sub.id}`}>Desde</label>
            <input id={`sub-inicio-${sub.id}`} className="input mono" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label className="fl" htmlFor={`sub-vence-${sub.id}`}>Vence</label>
            <input id={`sub-vence-${sub.id}`} className="input mono" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button type="button" className="btn g sm" onClick={() => void guardar()} disabled={!cambiado || guardando}>
            <Icon d="check" s={12} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <a className="btn sm" href="/plugins/memberships/subscriptions">
            <Icon d="abrir" s={12} /> Abrir en Membresías
          </a>
        </div>
        <p className="sub" style={{ marginTop: 10 }}>
          Dejar «Vence» vacío la convierte en una suscripción sin vencimiento y deja de aparecer en los avisos de los 30 días.
        </p>
      </div>
    </aside>
  );
}
