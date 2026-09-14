'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import type { MontoPorMoneda, PanoramaEmpresa, ResumenEmpresa } from '../../shared/api-types';
import type { Vista } from '../../shared/vistas';
import { EMPRESA_API, fetcher, fmtFecha, fmtInt, fmtMonto, fmtVencimiento, iniciales } from '../componentes/format';
import { SectoresDeAppsCabina } from './AppsView';
import './cabina.css';

/**
 * El Inicio de Empresa, con el tablero de la maqueta de ChatPro
 * (chatpro-nuevo-diseno.aapp.pro → Inicio).
 *
 * Arriba va lo mismo que muestra la maqueta —el saludo con lo que quedó
 * pendiente, cuatro números, ingresos contra egresos, la conversión del embudo
 * y las dos listas de lo que se viene— pero calculado con los datos del equipo.
 * Abajo siguen las dos secciones que esta pantalla ya tenía —lo que vence en 30
 * días y las apps del negocio—, ahora con la misma caja y la misma tipografía
 * que el resto del tablero.
 *
 * Dos diferencias con la maqueta que no son un descuido:
 *
 * 1. **Cada número de plata es una lista por moneda.** La maqueta cobra todo en
 *    una sola moneda y puede permitirse un número por bloque; el equipo cobra
 *    en ARS, USD y PYG, y sumarlas daría un total que no existe.
 * 2. **El gráfico se mira de a una moneda.** Comparar alturas de barras exige
 *    una sola unidad: arriba del gráfico se elige cuál, y por defecto es la de
 *    más movimiento.
 */

type Props = {
  data: ResumenEmpresa;
  onChangeVista: (vista: Vista) => void;
  onMarca: (id: number | null) => void;
  onMenu?: () => void;
  /** Nombre de quien está mirando, para el saludo. Sin él, saluda sin nombre. */
  nombre?: string | null;
};

/** La paleta de la maqueta, para avatares y puntos. */
const AV = ['#25D366', '#7c5cfc', '#60a5fa', '#f5a524', '#f472b6', '#f45b69', '#2dd4bf'];
const colorDe = (s: string) => AV[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

const VERDE = '#25D366';
const ROJO = '#f45b69';
const VIOLETA = '#7c5cfc';
const AZUL = '#60a5fa';

const ICONOS = {
  zap: 'M13 2 3 14h8l-1 8 10-12h-8l1-8z',
  dollar: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  chev: 'M9 18l6-6-6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  alert: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
} as const;

function Icon({ d, s = 16 }: { d: keyof typeof ICONOS; s?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: s, height: s, flexShrink: 0 }}
      aria-hidden
    >
      <path d={ICONOS[d]} />
    </svg>
  );
}

function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg,${colorDe(name)},${colorDe(`${name}x`)})`,
      }}
    >
      {iniciales(name)}
    </div>
  );
}

/**
 * Un total de plata: una línea por moneda, nunca una suma.
 *
 * Con una sola moneda se ve como el número grande de la maqueta; con tres, se
 * ven las tres, más chicas. Elegir una "principal" y esconder el resto ya nos
 * hizo decirle a alguien que había cobrado la mitad de lo que había cobrado.
 */
function Plata({ montos, color }: { montos: MontoPorMoneda[]; color?: string }) {
  if (!montos.length) {
    return <div className="v" style={{ color: 'var(--ce-muted2)' }}>—</div>;
  }
  return (
    <div className={montos.length > 1 ? 'v multi' : 'v'} style={color ? { color } : undefined}>
      {montos.map((m) => <span key={m.currency}>{fmtMonto(m)}</span>)}
    </div>
  );
}

export function InicioView({ data, onChangeVista, onMarca, onMenu, nombre }: Props) {
  const qs = data.marcaId == null ? '' : `?marca=${data.marcaId}`;
  const { data: pan } = useSWR<PanoramaEmpresa>(`${EMPRESA_API}/panorama${qs}`, fetcher, { refreshInterval: 300_000 });

  /** La moneda del gráfico. `null` = todavía no se eligió: manda la del servidor. */
  const [monedaElegida, setMonedaElegida] = useState<string | null>(null);
  const moneda = monedaElegida && pan?.monedas.includes(monedaElegida) ? monedaElegida : pan?.moneda ?? null;
  const serie = useMemo(() => (moneda && pan ? pan.series[moneda] ?? [] : []), [pan, moneda]);
  const techo = useMemo(
    () => Math.max(1, ...serie.map((m) => Math.max(m.ingresos, m.egresos))),
    [serie],
  );

  const marcaElegida = data.marcaId == null ? null : data.marcas.find((m) => m.id === data.marcaId) ?? null;
  const ultimo = serie.length ? serie[serie.length - 1] : null;

  const cerrados = pan ? pan.conversion.ganados + pan.conversion.perdidos : 0;
  const conversion = cerrados > 0 && pan ? Math.round((pan.conversion.ganados / cerrados) * 100) : null;
  const techoGrupos = pan ? Math.max(1, ...pan.grupos.map((g) => g.contactos)) : 1;

  const mesLargo = pan ? nombreDeMes(pan.mes) : '';

  /** ¿Este equipo carga Oportunidades, o su pipeline vive en el CRM? */
  const pipelineDeals = pan?.kpis.pipeline ?? data.dinero.embudo;
  const usaOportunidades = pan == null || pan.kpis.oportunidadesAbiertas > 0 || pan.kpis.cotizados === 0;

  return (
    <div className="cabina">
      <div className="topbar">
        {onMenu && (
          <button type="button" className="btn lg:hidden" onClick={onMenu} aria-label="Menú">
            <Icon d="menu" s={14} />
          </button>
        )}
        <Icon d="zap" s={17} />
        <div className="titulo">
          <div className="nm">Inicio</div>
          <div className="sub">
            Panorama del negocio{mesLargo ? ` · ${mesLargo}` : ''}
            {marcaElegida ? ` · sólo ${marcaElegida.name}` : ''}
          </div>
        </div>
        <div className="sp" />
        {marcaElegida && (
          <button type="button" className="btn sm" onClick={() => onMarca(null)}>
            Ver todas las marcas
          </button>
        )}
        <button type="button" className="btn" onClick={() => onChangeVista('crm')}>
          <Icon d="kanban" s={14} /> CRM
        </button>
        <button type="button" className="btn g" onClick={() => onChangeVista('suscripciones')}>
          <Icon d="dollar" s={14} /> Suscripciones
        </button>
      </div>

      <div className="home">
        {/* ── El saludo ── */}
        <div style={{ marginBottom: 22 }}>
          <div className="rotulo">Centro de operaciones</div>
          <h2 className="saludo">
            {nombre ? `Buen día, ${nombre.split(' ')[0]}.` : 'Buen día.'}
            <span className="resto">
              {' '}
              {pan
                ? `Tenés ${fmtInt(pan.saludo.conversacionesPendientes)} ${plural(pan.saludo.conversacionesPendientes, 'conversación pendiente', 'conversaciones pendientes')} y ${fmtInt(pan.saludo.cobrosProgramados)} ${plural(pan.saludo.cobrosProgramados, 'cobro programado', 'cobros programados')}.`
                : 'Cargando lo que quedó pendiente…'}
            </span>
          </h2>
        </div>

        {/* ── Los cuatro números ── */}
        <div className="hero-kpi">
          <div className="kpi" style={{ '--acc': VERDE } as React.CSSProperties}>
            <div className="l">Recurrente por mes</div>
            <Plata montos={data.dinero.recurrente} color={VERDE} />
            <div className="d">
              {fmtInt(pan?.kpis.marcasActivas ?? data.contadores.marcas)} {plural(pan?.kpis.marcasActivas ?? data.contadores.marcas, 'marca activa', 'marcas activas')}
              {' · '}
              {fmtInt(data.contadores.suscripcionesActivas)} suscripciones
            </div>
          </div>

          <div className="kpi" style={{ '--acc': ROJO } as React.CSSProperties}>
            <div className="l">Egresos por mes</div>
            <Plata montos={pan?.kpis.egresosFijos ?? []} color={ROJO} />
            <div className="d">
              {pan
                ? `${fmtInt(pan.kpis.egresosFijosCount)} ${plural(pan.kpis.egresosFijosCount, 'gasto recurrente', 'gastos recurrentes')}`
                : 'Cargando…'}
            </div>
          </div>

          <div className="kpi" style={{ '--acc': VIOLETA } as React.CSSProperties}>
            <div className="l">Margen de {mesLargo || 'este mes'}</div>
            {pan?.kpis.margen == null ? (
              <div className="v" style={{ color: 'var(--ce-muted2)' }}>—</div>
            ) : (
              <div className="v" style={{ color: VIOLETA }}>{pan.kpis.margen}%</div>
            )}
            <div className="d">
              {pan == null
                ? 'Cargando…'
                : pan.kpis.margen == null
                  ? 'Sin ingresos registrados este mes'
                  : `${fmtMontos(pan.kpis.resultadoMes)} de resultado${pan.moneda ? ` · sobre ${pan.moneda}` : ''}`}
            </div>
          </div>

          {/*
            * El pipeline sale de Oportunidades cuando el equipo las usa, y del
            * CRM cuando no: hay equipos que trabajan por chat y el presupuesto
            * queda en el análisis comercial del contacto. Mostrar siempre
            * Oportunidades dejaba un bloque en cero al lado de un embudo con
            * 900 contactos adentro, así que el renglón de abajo dice de dónde
            * viene el número.
            */}
          <div className="kpi" style={{ '--acc': AZUL } as React.CSSProperties}>
            <div className="l">Pipeline de ventas</div>
            <Plata montos={usaOportunidades ? pipelineDeals : (pan?.kpis.cotizado ?? [])} color={AZUL} />
            <div className="d">
              {pan == null
                ? 'Cargando…'
                : usaOportunidades
                  ? `${fmtInt(pan.kpis.oportunidadesAbiertas)} ${plural(pan.kpis.oportunidadesAbiertas, 'oportunidad abierta', 'oportunidades abiertas')}`
                  : `${fmtInt(pan.kpis.cotizados)} ${plural(pan.kpis.cotizados, 'contacto cotizado', 'contactos cotizados')} en el embudo`}
            </div>
          </div>
        </div>

        {/* ── Ingresos contra egresos · Conversión ── */}
        <div className="grid2">
          <div className="panel">
            <div className="panel-h">
              <h3>Ingresos vs egresos</h3>
              <div className="sp" />
              <div className="leyenda">
                <span><span className="dot" style={{ background: VERDE, width: 6, height: 6 }} />Ingresos</span>
                <span><span className="dot" style={{ background: ROJO, width: 6, height: 6 }} />Egresos</span>
              </div>
            </div>

            {/* Una moneda por vez: las alturas sólo se pueden comparar dentro
                de la misma unidad. */}
            {pan && pan.monedas.length > 1 && (
              <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                {pan.monedas.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`btn sm${m === moneda ? ' g' : ''}`}
                    onClick={() => setMonedaElegida(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {serie.length === 0 ? (
              <div className="vacio" style={{ padding: '34px 0' }}>
                {pan ? 'Finanzas todavía no tiene movimientos registrados.' : 'Cargando el movimiento…'}
              </div>
            ) : (
              <>
                <div className="chart">
                  {serie.map((m) => (
                    <div key={m.mes} className="c">
                      <div className="bars">
                        <i
                          style={{ height: `${(m.ingresos / techo) * 100}%`, background: 'linear-gradient(180deg,#25D366,#12472a)' }}
                          title={`Ingresos: ${fmtMonto({ currency: moneda ?? 'USD', cents: m.ingresos })}`}
                        />
                        <i
                          style={{ height: `${(m.egresos / techo) * 100}%`, background: 'linear-gradient(180deg,#f45b69,#4a1d24)' }}
                          title={`Egresos: ${fmtMonto({ currency: moneda ?? 'USD', cents: m.egresos })}`}
                        />
                      </div>
                      <div className="lb">{m.etiqueta}</div>
                    </div>
                  ))}
                </div>
                {ultimo && (
                  <div className="pie">
                    <div>
                      <div className="l">Ingresos de {mesLargo}</div>
                      <div className="v" style={{ color: VERDE }}>{fmtMonto({ currency: moneda ?? 'USD', cents: ultimo.ingresos })}</div>
                    </div>
                    <div>
                      <div className="l">Egresos de {mesLargo}</div>
                      <div className="v" style={{ color: ROJO }}>{fmtMonto({ currency: moneda ?? 'USD', cents: ultimo.egresos })}</div>
                    </div>
                    <div>
                      <div className="l">Resultado</div>
                      <div className="v">{fmtMonto({ currency: moneda ?? 'USD', cents: ultimo.ingresos - ultimo.egresos })}</div>
                    </div>
                  </div>
                )}
                <p className="sub" style={{ marginTop: 10 }}>
                  Asientos de Finanzas en {moneda}, cobrados o no. Los cancelados no entran.
                </p>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Conversión del embudo</h3></div>
            {/* El anillo sólo se dibuja si hay algo cerrado: un anillo en cero
                se lee como "perdimos todo", que es lo contrario de "todavía no
                cerramos ninguna". */}
            {cerrados > 0 ? (
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                <div className="ring" style={{ '--p': conversion ?? 0 } as React.CSSProperties}>
                  <span>{conversion}%</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ce-muted)', lineHeight: 1.6 }}>
                  {fmtInt(pan!.conversion.ganados)} {plural(pan!.conversion.ganados, 'negocio ganado', 'negocios ganados')}<br />
                  {fmtInt(pan!.conversion.perdidos)} {plural(pan!.conversion.perdidos, 'perdido', 'perdidos')}<br />
                  {fmtInt(pan!.conversion.total)} {plural(pan!.conversion.total, 'oportunidad en total', 'oportunidades en total')}
                </div>
              </div>
            ) : (
              <p className="sub" style={{ marginBottom: 14 }}>
                {pan == null
                  ? 'Cargando…'
                  : pan.conversion.total > 0
                    ? `${fmtInt(pan.conversion.total)} ${plural(pan.conversion.total, 'oportunidad abierta', 'oportunidades abiertas')}, ninguna cerrada todavía.`
                    : 'Todavía no hay oportunidades cargadas. Abajo, el embudo por grupo de etapas.'}
              </p>
            )}

            {pan?.grupos.length ? (
              <>
                {pan.grupos.map((g) => (
                  <div key={g.id} style={{ marginBottom: 11 }}>
                    <div style={{ display: 'flex', fontSize: 11.5, marginBottom: 2, gap: 8 }}>
                      <span style={{ flex: 1, color: 'var(--ce-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                      <span className="mono" style={{ fontWeight: 700 }}>{fmtInt(g.contactos)}</span>
                    </div>
                    <div className="barra"><i style={{ width: `${(g.contactos / techoGrupos) * 100}%`, background: colorDe(g.name) }} /></div>
                  </div>
                ))}
                <p className="sub" style={{ marginTop: 4 }}>Contactos por grupo de etapas.</p>
              </>
            ) : (
              pan && <p className="sub">Todavía no hay grupos de etapas armados.</p>
            )}

            <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => onChangeVista('crm')}>
              Ver el CRM <Icon d="chev" s={11} />
            </button>
          </div>
        </div>

        {/* ── Lo que se viene: cobros y egresos ── */}
        <div className="grid2 iguales">
          <div className="panel">
            <div className="panel-h">
              <h3>Próximos cobros</h3>
              <div className="sp" />
              <a className="btn sm ghost" href="/plugins/finance">Ver todos</a>
            </div>
            {pan == null ? (
              <p className="sub">Cargando…</p>
            ) : pan.cobros.length === 0 ? (
              <p className="sub">No hay entradas pendientes de cobro cargadas en Finanzas.</p>
            ) : (
              pan.cobros.map((c) => (
                <div key={c.id} className="list-row">
                  <Avatar name={c.quien ?? c.titulo} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{c.quien ?? c.titulo}</div>
                    <div className="sub2">{c.quien ? c.titulo : c.detalle ?? '—'}</div>
                  </div>
                  <div className="der">
                    <div className="mono" style={{ fontWeight: 700 }}>{fmtMonto({ currency: c.currency, cents: c.cents })}</div>
                    <div className="sub2" style={{ color: c.vencido ? ROJO : undefined }}>
                      {fmtFecha(c.fecha)}{c.vencido ? ' · vencido' : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <div className="panel-h">
              <h3>Próximos egresos</h3>
              <div className="sp" />
              <a className="btn sm ghost" href="/plugins/finance">Ver todos</a>
            </div>
            {pan == null ? (
              <p className="sub">Cargando…</p>
            ) : pan.egresos.length === 0 ? (
              <p className="sub">No hay egresos pendientes en los próximos 90 días.</p>
            ) : (
              pan.egresos.map((e) => (
                <div key={e.id} className="list-row">
                  <span className="dot" style={{ background: e.vencido ? ROJO : '#f5a524', width: 7, height: 7 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{e.titulo}</div>
                    <div className="sub2">{[e.quien, e.detalle].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  <div className="der">
                    <div className="mono" style={{ fontWeight: 700 }}>{fmtMonto({ currency: e.currency, cents: e.cents })}</div>
                    <div className="sub2" style={{ color: e.vencido ? ROJO : undefined }}>
                      {fmtFecha(e.fecha)}{e.vencido ? ' · vencido' : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Lo que ya estaba en el Inicio, con la caja del tablero ── */}
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-h">
            <h3>Vencen en 30 días</h3>
            <div className="sp" />
            <button type="button" className="btn sm ghost" onClick={() => onChangeVista('suscripciones')}>
              Ver suscripciones <Icon d="chev" s={11} />
            </button>
          </div>
          {data.vencimientos.length === 0 ? (
            <p className="sub">
              No vence nada en los próximos 30 días. Las suscripciones sin fecha de fin —vitalicias o gratis— nunca aparecen acá.
            </p>
          ) : (
            data.vencimientos.map((v) => (
              <div key={v.subscriptionId} className="list-row">
                <span
                  className="mono"
                  style={{
                    width: 38, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 800, flexShrink: 0,
                    background: v.dias < 0 ? 'rgba(244,91,105,.16)' : v.dias <= 7 ? 'rgba(245,165,36,.16)' : 'var(--ce-card3)',
                    color: v.dias < 0 ? ROJO : v.dias <= 7 ? '#b45309' : 'var(--ce-muted)',
                  }}
                >
                  {v.dias}d
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nm">{v.cliente ?? v.numero}</div>
                  <div className="sub2">
                    {v.plan}{v.marca ? ` · ${v.marca}` : ''} · {fmtFecha(v.endDate)} ({fmtVencimiento(v.dias)})
                  </div>
                </div>
                <div className="der">
                  <div className="mono" style={{ fontWeight: 700 }}>{fmtMonto({ currency: v.currency, cents: v.price })}</div>
                  {v.paymentStatus === 'overdue' && <div className="sub2" style={{ color: ROJO, fontWeight: 700 }}>impaga</div>}
                </div>
              </div>
            ))
          )}
        </div>

        <SectoresDeAppsCabina apps={data.apps} onChangeVista={onChangeVista} />
      </div>
    </div>
  );
}

/** "3 marcas activas" / "1 marca activa": el singular no se arma con una `s`. */
function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/** Varias monedas en una línea corta. Nunca se suman entre sí. */
function fmtMontos(montos: MontoPorMoneda[]): string {
  if (!montos.length) return '—';
  return montos.map(fmtMonto).join(' · ');
}

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "agosto 2026" a partir de `2026-08`. */
function nombreDeMes(mes: string): string {
  const [anio, m] = mes.split('-').map(Number);
  const nombre = MESES_LARGOS[(m ?? 1) - 1];
  if (!nombre || !Number.isFinite(anio)) return mes;
  return `${nombre} ${anio}`;
}
