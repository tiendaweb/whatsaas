'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { billingTypeLabel } from '@/lib/plugins/memberships/constants';
import type { ClienteFicha, ClientesEmpresa, MontoPorMoneda } from '../../shared/api-types';
import { CargandoBloques, ErrorEstado, VacioEstado } from '../componentes/Estados';
import { EMPRESA_API, fetcher, fmtFecha, fmtInt, fmtMonto, iniciales } from '../componentes/format';
import './cabina.css';

/**
 * Clientes, con la ficha de la maqueta de ChatPro (Clientes y membresías):
 * la lista de borde a borde a la izquierda y el panel de la derecha con todo
 * lo del cliente elegido.
 *
 * Junta lo que hasta ahora había que ir a buscar a cuatro apps: las membresías
 * son de Membresías, lo facturado de Ventas, los pagos de Finanzas, los
 * contactos del CRM y los proyectos de Tareas OS. Acá se MIRA; dar de alta un
 * cliente, cobrarle o editar sus datos sigue siendo de la app Clientes, que
 * tiene los formularios con sus validaciones, y el panel lleva el enlace.
 *
 * Las monedas nunca se suman entre sí: cada total es una línea por moneda.
 */

const AV = ['#25D366', '#7c5cfc', '#60a5fa', '#f5a524', '#f472b6', '#f45b69', '#2dd4bf'];
const colorDe = (s: string) => AV[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

const ICONOS = {
  clientes: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  abrir: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  cerrar: 'M18 6 6 18M6 6l12 12',
  menu: 'M4 6h16M4 12h16M4 18h16',
  msg: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
} as const;

function Icon({ d, s = 16 }: { d: keyof typeof ICONOS; s?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={s} height={s} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={ICONOS[d]} />
    </svg>
  );
}

/**
 * La foto del contacto si la hay, y si no las iniciales sobre un gradiente
 * estable por nombre, como en la maqueta.
 *
 * La URL viene de WhatsApp y caduca: cuando falla se vuelve a las iniciales en
 * vez de dejar el cuadrito roto.
 */
function Avatar({ name, size = 30, foto }: { name: string; size?: number; foto?: string | null }) {
  const [rota, setRota] = useState(false);
  const estilo = { width: size, height: size, fontSize: size * 0.36 };
  if (foto && !rota) {
    return <img src={foto} alt="" className="avatar" style={{ ...estilo, objectFit: 'cover' }} loading="lazy" onError={() => setRota(true)} />;
  }
  return (
    <div className="avatar" style={{ ...estilo, background: `linear-gradient(140deg,${colorDe(name)},${colorDe(`${name}x`)})` }}>
      {iniciales(name)}
    </div>
  );
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

/**
 * El enlace al chat.
 *
 * La ruta espera el número pelado: los grupos conservan su JID entero, que es
 * lo que hace la propia página del chat, y por eso el `@g.us` no se recorta.
 */
function hrefChat(jid: string): string {
  const destino = jid.endsWith('@g.us') ? jid : jid.split('@')[0];
  return `/dashboard/chat/${encodeURIComponent(destino)}`;
}

/** El número de un JID, para mostrarlo. `null` si es un grupo. */
function numeroDe(jid: string | null): string | null {
  if (!jid || jid.endsWith('@g.us')) return null;
  return jid.split('@')[0];
}

/** "activo" / "moroso" / "en trial": el estado tal como lo guarda Clientes. */
const ESTADOS: Record<string, string> = {
  active: 'activo',
  lead: 'prospecto',
  prospect: 'prospecto',
  inactive: 'inactivo',
  churned: 'perdido',
};
const estadoLabel = (v: string) => ESTADOS[v] ?? v;

type Filtro = 'todos' | 'conSuscripcion' | 'porVencer' | 'impagas' | 'sinSuscripcion';

export function ClientesView({
  marcaId,
  marcas,
  onMarca,
  onMenu,
}: {
  marcaId: number | null;
  marcas: Array<{ id: number; name: string }>;
  onMarca: (id: number | null) => void;
  onMenu?: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<number | null>(null);

  const qs = marcaId == null ? '' : `?marca=${marcaId}`;
  const { data, error, isLoading, mutate } = useSWR<ClientesEmpresa>(`${EMPRESA_API}/clientes${qs}`, fetcher);

  const termino = busqueda.trim().toLocaleLowerCase('es');

  const filas = useMemo(() => {
    if (!data) return [];
    return data.clientes.filter((c) => {
      if (termino && !`${c.nombre} ${c.email ?? ''} ${c.telefono ?? ''} ${c.marcas.join(' ')}`.toLocaleLowerCase('es').includes(termino)) return false;
      if (filtro === 'conSuscripcion') return c.activas > 0;
      if (filtro === 'sinSuscripcion') return c.activas === 0;
      if (filtro === 'porVencer') return c.porVencer > 0;
      if (filtro === 'impagas') return c.impagas > 0;
      return true;
    });
  }, [data, filtro, termino]);

  if (error) return <ErrorEstado mensaje={String(error.message ?? error)} onReintentar={() => void mutate()} />;
  if (isLoading || !data) return <CargandoBloques bloques={4} />;

  const ficha = filas.find((c) => c.id === abierto) ?? null;

  return (
    <div className="cabina">
      <div className="topbar">
        {onMenu && (
          <button type="button" className="btn lg:hidden" onClick={onMenu} aria-label="Menú">
            <Icon d="menu" s={14} />
          </button>
        )}
        <Icon d="clientes" s={17} />
        <div className="titulo">
          <div className="nm">Clientes</div>
          <div className="sub conteo">
            <span className="n"><b>{fmtInt(data.totales.clientes)}</b> en cartera</span>
            <span className="n"><b>{fmtInt(data.totales.conSuscripcion)}</b> con suscripción</span>
            {data.totales.recortado && <span className="n">se muestran los más movidos</span>}
          </div>
        </div>
        <div className="sp" />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ce-muted2)' }}>
            Por mes
          </div>
          <Plata montos={data.totales.recurrente} />
        </div>
        <a className="btn" href="/plugins/customers">
          <Icon d="abrir" s={12} /> Abrir en Clientes
        </a>
      </div>

      <div className="filtros">
        <label className="selcampo">
          <span className="rot">Marca</span>
          <select value={marcaId == null ? '' : String(marcaId)} onChange={(e) => onMarca(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todas</option>
            {marcas.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
          </select>
        </label>

        <label className="selcampo">
          <span className="rot">Mostrar</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="todos">Todos</option>
            <option value="conSuscripcion">Con suscripción activa</option>
            <option value="sinSuscripcion">Sin suscripción</option>
            <option value="porVencer">Vencen en 30 días</option>
            <option value="impagas">Con pagos vencidos</option>
          </select>
        </label>

        <input
          className="buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente, correo o teléfono…"
          aria-label="Buscar"
        />
      </div>

      <div className="cuerpo">
        <div className="tbl-wrap">
          {filas.length === 0 ? (
            <div style={{ padding: 24 }}>
              <VacioEstado
                titulo="No hay clientes para este filtro"
                ayuda="Los clientes archivados nunca aparecen acá."
              />
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Marcas</th>
                  <th>Membresías</th>
                  <th>Por mes</th>
                  <th>Facturado</th>
                  <th>Próximo vencimiento</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => {
                  const proximo = c.suscripciones
                    .map((s) => s.vence)
                    .filter((v): v is string => Boolean(v))
                    .sort()[0] ?? null;
                  return (
                    <tr key={c.id} className={abierto === c.id ? 'sel' : ''} onClick={() => setAbierto(c.id)}>
                      <td>
                        <div className="cell-name">
                          <Avatar name={c.nombre} />
                          <div style={{ minWidth: 0 }}>
                            <div className="nm">{c.nombre}</div>
                            <div className="sub2" style={{ fontSize: 11, color: 'var(--ce-muted)' }}>
                              {c.contactos.length
                                ? c.contactos.map((x) => x.nombre).join(', ')
                                : 'sin contacto vinculado'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.marcas.length === 0 ? (
                            <span style={{ color: 'var(--ce-muted2)' }}>—</span>
                          ) : (
                            c.marcas.map((m) => (
                              <span key={m} className="chip" style={{ color: colorDe(m), background: `${colorDe(m)}22`, border: `1px solid ${colorDe(m)}33` }}>
                                {m}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="mono">{fmtInt(c.suscripciones.length)}</td>
                      <td className="mono"><Plata montos={c.recurrente} /></td>
                      <td className="mono" style={{ color: 'var(--ce-muted)' }}><Plata montos={c.facturado} /></td>
                      <td className="mono" style={{ color: c.porVencer > 0 ? '#f5a524' : 'var(--ce-muted)' }}>
                        {proximo ?? '—'}
                      </td>
                      <td>
                        <span className={cn('estado', c.impagas > 0 ? 'aviso' : c.activas > 0 ? 'ok' : 'baja')}>
                          {c.impagas > 0 ? 'con deuda' : estadoLabel(c.estado)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {ficha && <FichaCliente key={ficha.id} c={ficha} onCerrar={() => setAbierto(null)} />}
      </div>
    </div>
  );
}

/** El panel de la derecha: todo lo del cliente, en el orden de la maqueta. */
function FichaCliente({ c, onCerrar }: { c: ClienteFicha; onCerrar: () => void }) {
  /** Lo cobrado por marca, para las barras. Cada moneda por su cuenta. */
  const porMarca = useMemo(() => {
    const mapa = new Map<string, Map<string, number>>();
    for (const p of c.pagos) {
      if (p.estado !== 'paid') continue;
      const marca = p.marca ?? 'Sin marca';
      const monedas = mapa.get(marca) ?? new Map<string, number>();
      monedas.set(p.currency, (monedas.get(p.currency) ?? 0) + p.cents);
      mapa.set(marca, monedas);
    }
    return [...mapa.entries()].map(([marca, monedas]) => ({
      marca,
      montos: [...monedas.entries()].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents),
    }));
  }, [c.pagos]);

  /**
   * El techo de las barras se toma dentro de UNA moneda: la del monto más
   * grande. Comparar el largo de una barra en pesos contra una en dólares no
   * significaría nada.
   */
  const monedaBarra = porMarca.flatMap((m) => m.montos).sort((a, b) => b.cents - a.cents)[0]?.currency ?? null;
  const techo = Math.max(
    1,
    ...porMarca.map((m) => m.montos.find((x) => x.currency === monedaBarra)?.cents ?? 0),
  );

  return (
    <aside className="detail" aria-label={`Ficha de ${c.nombre}`}>
      <div className="detail-hero">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <Avatar name={c.nombre} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.nombre}
            </div>
            <div className="sub">
              {[c.rubro, c.lugar, c.desde ? `cliente desde ${fmtFecha(c.desde)}` : null].filter(Boolean).join(' · ') || 'sin datos de ficha'}
            </div>
          </div>
          <span className={cn('estado', c.impagas > 0 ? 'aviso' : c.activas > 0 ? 'ok' : 'baja')}>
            {c.impagas > 0 ? 'con deuda' : estadoLabel(c.estado)}
          </span>
          <button type="button" className="btn sm ghost" onClick={onCerrar} aria-label="Cerrar la ficha">
            <Icon d="cerrar" s={14} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {c.contactos[0]?.jid && (
            <a className="btn sm" href={hrefChat(c.contactos[0].jid)}>
              <Icon d="msg" s={12} /> Abrir el chat
            </a>
          )}
          <a className="btn sm" href={`/plugins/customers/${c.id}`}>
            <Icon d="abrir" s={12} /> Ver en Clientes
          </a>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="l">Por mes</div>
          <div className="v"><Plata montos={c.recurrente} /></div>
        </div>
        <div className="stat">
          <div className="l">Facturado</div>
          <div className="v"><Plata montos={c.facturado} /></div>
        </div>
        <div className="stat">
          <div className="l">Por cobrar</div>
          <div className="v"><Plata montos={c.porCobrar} /></div>
        </div>
        <div className="stat">
          <div className="l">Embudo abierto</div>
          <div className="v"><Plata montos={c.embudo} /></div>
        </div>
      </div>

      <div className="section-pad">
        <div className="ctx-t">Membresías ({fmtInt(c.suscripciones.length)})</div>
        {c.suscripciones.length === 0 ? (
          <p className="sub">Este cliente no tiene membresías. Puede existir igual: no todas las ventas son recurrentes.</p>
        ) : (
          c.suscripciones.map((s) => (
            <div key={s.id} className="sub-card">
              <div className="sub-r1">
                <span className="dot" style={{ background: colorDe(s.marca ?? s.plan), width: 8, height: 8 }} />
                <span className="sub-nm">{s.plan}</span>
                <span className={cn('estado', s.status === 'active' ? (s.porVencer ? 'aviso' : 'ok') : 'baja')}>
                  {s.status === 'active' ? (s.porVencer ? 'vence pronto' : 'activa') : s.status}
                </span>
              </div>
              <div className="sub" style={{ marginBottom: 9 }}>{s.marca ?? 'sin marca'} · {s.numero}</div>
              <div className="sub-grid">
                <div>
                  <div className="k">Ciclo</div>
                  <div className="v">{billingTypeLabel(s.billingType)}</div>
                </div>
                <div>
                  <div className="k">Monto</div>
                  <div className="v mono">{s.price ? fmtMonto({ currency: s.currency, cents: s.price }) : '—'}</div>
                </div>
                <div>
                  <div className="k">Inicio</div>
                  <div className="v mono">{s.inicio}</div>
                </div>
                <div>
                  <div className="k">Vence</div>
                  <div className="v mono" style={{ color: s.paymentStatus === 'overdue' ? '#f45b69' : s.porVencer ? '#f5a524' : undefined }}>
                    {s.vence ?? 'sin fecha'}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {porMarca.length > 0 && (
        <div className="section-pad">
          <div className="ctx-t">Cobrado por marca</div>
          {porMarca.map((m) => {
            const enMoneda = m.montos.find((x) => x.currency === monedaBarra);
            return (
              <div key={m.marca} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', fontSize: 11.5, gap: 8 }}>
                  <span style={{ flex: 1, color: 'var(--ce-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.marca}</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{m.montos.map((x) => fmtMonto(x)).join(' · ')}</span>
                </div>
                {enMoneda && (
                  <div className="barra"><i style={{ width: `${(enMoneda.cents / techo) * 100}%`, background: colorDe(m.marca) }} /></div>
                )}
              </div>
            );
          })}
          {monedaBarra && porMarca.some((m) => m.montos.length > 1) && (
            <p className="sub">Las barras comparan sólo lo cobrado en {monedaBarra}.</p>
          )}
        </div>
      )}

      <div className="section-pad">
        <div className="ctx-t">Historial de pagos</div>
        {c.pagos.length === 0 ? (
          <p className="sub">Sin movimientos registrados en Finanzas.</p>
        ) : (
          c.pagos.map((p) => (
            <div key={p.id} className="list-row">
              <span
                className="dot"
                style={{ background: p.estado === 'paid' ? '#25D366' : p.estado === 'overdue' ? '#f45b69' : '#f5a524', width: 7, height: 7 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">{fmtMonto({ currency: p.currency, cents: p.cents })}</div>
                <div className="sub2">{[p.marca, p.metodo, p.titulo].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="der">
                <div className="mono" style={{ color: 'var(--ce-muted)' }}>{fmtFecha(p.fecha)}</div>
                <div className="sub2" style={{ fontWeight: 700, color: p.estado === 'paid' ? '#25D366' : p.estado === 'overdue' ? '#f45b69' : '#f5a524' }}>
                  {p.estado === 'paid' ? 'cobrado' : p.estado === 'overdue' ? 'vencido' : 'pendiente'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="section-pad">
        <div className="ctx-t">Contactos vinculados ({fmtInt(c.contactos.length)})</div>
        {c.contactos.length === 0 ? (
          <p className="sub">Este cliente no tiene contactos asociados; puede existir igual.</p>
        ) : (
          c.contactos.map((x) => (
            <a
              key={x.id}
              className="list-row"
              style={{ textDecoration: 'none', color: 'inherit' }}
              href={x.jid ? hrefChat(x.jid) : '/contacts'}
            >
              <Avatar name={x.nombre} size={28} foto={x.foto} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">{x.nombre}</div>
                <div className="sub2">{numeroDe(x.jid) ?? x.telefono ?? 'sin teléfono'}</div>
              </div>
            </a>
          ))
        )}
      </div>

      {c.proyectos.length > 0 && (
        <div className="section-pad">
          <div className="ctx-t">Proyectos</div>
          {c.proyectos.map((p) => (
            <a key={p.id} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }} href={`/plugins/tasks?proyecto=${p.id}`}>
              <span className="dot" style={{ background: colorDe(p.nombre), width: 7, height: 7 }} />
              <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{p.nombre}</div></div>
            </a>
          ))}
        </div>
      )}

      <div className="section-pad">
        <div className="ctx-t">Datos y notas</div>
        <div className="ctx-row"><span className="k">Correo</span><span className="v">{c.email ?? '—'}</span></div>
        <div className="ctx-row"><span className="k">Teléfono</span><span className="v mono">{c.telefono ?? '—'}</span></div>
        <div className="ctx-row"><span className="k">Sitio</span><span className="v">{c.web ?? '—'}</span></div>
        <div className="ctx-row"><span className="k">Lugar</span><span className="v">{c.lugar ?? '—'}</span></div>
        <p className="sub" style={{ marginTop: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {c.notas.trim() || 'Sin notas internas.'}
        </p>
      </div>
    </aside>
  );
}
