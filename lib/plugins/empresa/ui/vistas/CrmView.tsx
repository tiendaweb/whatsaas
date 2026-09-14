'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { CrmContacto, CrmEmpresa, MontoPorMoneda } from '../../shared/api-types';
import { FichaView } from '@/lib/plugins/sales-ops/ui/views/FichaView';
import { SituacionIcono } from '@/lib/plugins/sales-ops/ui/components/SituacionBadge';
import { esSituacion } from '@/lib/plugins/sales-ops/shared/situacion';
import { CargandoBloques, ErrorEstado, VacioEstado } from '../componentes/Estados';
import { LimiteDeError } from '../componentes/LimiteDeError';
import { EMPRESA_API, fetcher, fmtInt } from '../componentes/format';
import './crm-embudos.css';

/**
 * El CRM adentro de Empresa, con la interfaz del tablero de Embudos de la
 * maqueta de ChatPro (chatpro-nuevo-diseno.aapp.pro → Embudos).
 *
 * La maqueta es una demo con datos inventados; acá abajo están los 927
 * contactos reales del equipo. Donde la maqueta muestra un dato que el sistema
 * no tiene, no se inventa: se omite el renglón. Cada cosa quedó atada a lo que
 * sí existe:
 *
 *  - «Tipo» de embudo → la MARCA, que es el filtro que ya tenía Empresa.
 *  - «Grupos» → los grupos de etapas del equipo (Ventas, Producción, Clientes…).
 *  - «Embudos» → las etapas del grupo, para mirar una sola.
 *  - El valor de cada columna → lo cotizado en el análisis comercial, POR
 *    MONEDA y sin sumar entre sí (el equipo cotiza en ARS, USD y PYG).
 *
 * Mover una tarjeta escribe por `PUT /api/contacts/[id]/funnel-stage`, el mismo
 * endpoint del tablero de Seguimiento: valida la etapa, registra la actividad y
 * deja el mensaje de sistema en el chat.
 */

/** La paleta de la maqueta, para los avatares y los puntos de etapa. */
const AV = ['#25D366', '#7c5cfc', '#60a5fa', '#f5a524', '#f472b6', '#f45b69', '#2dd4bf'];
const colorDe = (s: string) => AV[[...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const iniciales = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';

/** Etapas con más de esto se marcan: una columna gigante es un embudo tapado. */
const COLUMNA_CARGADA = 100;

const ICONOS = {
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  msg: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  alert: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  filtro: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
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

/**
 * La foto del contacto si la hay, y si no las iniciales sobre un gradiente
 * estable por nombre, como en la maqueta.
 *
 * La URL viene de WhatsApp y caduca: cuando falla se vuelve a las iniciales en
 * vez de dejar el cuadrito roto.
 */
function Avatar({ name, size = 34, fs, foto }: { name: string; size?: number; fs?: number; foto?: string | null }) {
  const [rota, setRota] = useState(false);
  const estilo = { width: size, height: size, fontSize: fs ?? size * 0.36 };
  if (foto && !rota) {
    return (
      <img
        src={foto}
        alt=""
        className="avatar"
        style={{ ...estilo, objectFit: 'cover' }}
        loading="lazy"
        onError={() => setRota(true)}
      />
    );
  }
  return (
    <div
      className="avatar"
      style={{ ...estilo, background: `linear-gradient(140deg,${colorDe(name)},${colorDe(`${name}x`)})` }}
    >
      {iniciales(name)}
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="chip" style={{ color, background: `${color}22`, border: `1px solid ${color}33` }}>
      {children}
    </span>
  );
}

/** Un importe con su moneda. En unidades, que es como viaja lo cotizado. */
function plata(monto: MontoPorMoneda): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: monto.currency, maximumFractionDigits: 0 }).format(monto.cents);
  } catch {
    // Una moneda sucia venida de un sync hace tirar RangeError a Intl y eso se
    // lleva puesta la pantalla entera.
    return `${monto.currency} ${fmtInt(monto.cents)}`;
  }
}

const plataCorta = (montos: MontoPorMoneda[]) => (montos.length ? montos.map(plata).join(' · ') : null);

export function CrmView({ marcaId, marcas, onMarca, onMenu }: {
  marcaId: number | null;
  marcas: Array<{ id: number; name: string }>;
  onMarca: (id: number | null) => void;
  /** Abre el rail en móvil: acá vive el único encabezado de la pantalla. */
  onMenu?: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [debounced, setDebounced] = useState('');
  const [grupo, setGrupo] = useState<number | null>(null);
  const [etapaSola, setEtapaSola] = useState<number | null>(null);
  const [etiqueta, setEtiqueta] = useState<number | null>(null);
  const [ficha, setFicha] = useState<{ chatId: number; seccion: 'resumen' | 'ia' } | null>(null);
  /** Sólo cuentan en el celular; en escritorio las tiras y el buscador están siempre. */
  const [verBuscador, setVerBuscador] = useState(false);
  const [verFiltros, setVerFiltros] = useState(false);
  const [arrastrado, setArrastrado] = useState<number | null>(null);
  const [encima, setEncima] = useState<number | 'sin' | null>(null);

  // Un debounce corto: escribir no puede disparar una consulta por tecla contra
  // 900 contactos.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(busqueda.trim()), 300);
    return () => clearTimeout(id);
  }, [busqueda]);

  const qs = new URLSearchParams();
  if (marcaId != null) qs.set('marca', String(marcaId));
  if (debounced) qs.set('q', debounced);
  // La etiqueta filtra en el servidor, como la marca: hacerlo acá recortaría
  // sólo las tarjetas cargadas y dejaría los totales de cada columna mintiendo.
  if (etiqueta != null) qs.set('etiqueta', String(etiqueta));

  const { data, error, isLoading, mutate } = useSWR<CrmEmpresa>(`${EMPRESA_API}/crm${qs.toString() ? `?${qs}` : ''}`, fetcher);

  const mover = useCallback(
    async (contactId: number, stageId: number | null) => {
      await mutate(
        async (actual) => {
          const response = await fetch(`/api/contacts/${contactId}/funnel-stage`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stageId }),
          });
          if (!response.ok) {
            const cuerpo = await response.json().catch(() => ({}));
            throw new Error(cuerpo?.error ?? `Error ${response.status}`);
          }
          return actual;
        },
        {
          // Optimista: la tarjeta salta ya y se revierte sola si el servidor
          // dice que no. Arrastrar y esperar un segundo hace dudar de si soltó.
          optimisticData: (actual?: CrmEmpresa) => {
            if (!actual) return actual as unknown as CrmEmpresa;
            let movido: CrmContacto | null = null;
            const sacar = (lista: CrmContacto[]) =>
              lista.filter((c) => {
                if (c.id !== contactId) return true;
                movido = c;
                return false;
              });
            const etapas = actual.etapas.map((e) => ({ ...e, contactos: sacar(e.contactos) }));
            const sinEtapa = { ...actual.sinEtapa, contactos: sacar(actual.sinEtapa.contactos) };
            if (movido) {
              if (stageId == null) sinEtapa.contactos = [movido, ...sinEtapa.contactos];
              else {
                const destino = etapas.find((e) => e.id === stageId);
                if (destino) destino.contactos = [movido, ...destino.contactos];
              }
            }
            return { ...actual, etapas, sinEtapa };
          },
          rollbackOnError: true,
          revalidate: true,
        },
      ).catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'No se pudo mover el contacto');
      });
    },
    [mutate],
  );

  /** Las columnas que se dibujan: del grupo elegido, o todas. */
  const columnas = useMemo(() => {
    if (!data) return [];
    const delGrupo = grupo == null ? data.etapas : data.etapas.filter((e) => e.grupos.includes(grupo));
    const base = etapaSola == null ? delGrupo : delGrupo.filter((e) => e.id === etapaSola);
    const conSinEtapa =
      data.sinEtapa.total > 0 && grupo == null && etapaSola == null
        ? [{ key: 'sin' as const, titulo: 'Sin etapa', emoji: null, total: data.sinEtapa.total, grupos: [] as number[], valor: [] as MontoPorMoneda[], contactos: data.sinEtapa.contactos }]
        : [];
    return [
      ...conSinEtapa,
      ...base.map((e) => ({ key: e.id, titulo: e.name, emoji: e.emoji, total: e.total, grupos: e.grupos, valor: e.valor, contactos: e.contactos })),
    ];
  }, [data, grupo, etapaSola]);

  if (error) return <ErrorEstado mensaje={String(error.message ?? error)} onReintentar={() => void mutate()} />;
  if (isLoading || !data) return <CargandoBloques bloques={4} />;

  const grupoActual = grupo == null ? null : data.grupos.find((g) => g.id === grupo) ?? null;
  const marcaElegida = marcaId == null ? null : marcas.find((m) => m.id === marcaId)?.name ?? null;
  const etapasDelGrupo = grupo == null ? data.etapas : data.etapas.filter((e) => e.grupos.includes(grupo));
  const pipeline = plataCorta(data.totales.pipeline);

  return (
    <div className={cn('crmEmbudos', verBuscador && 'buscar-abierto', verFiltros && 'filtros-abiertos')}>
      {/* EL header de la pantalla. El shell de Empresa no dibuja el suyo en
          esta vista: dos encabezados apilados dejaban «CRM» arriba y «Embudo
          comercial» abajo diciendo casi lo mismo con la mitad del alto útil. */}
      <div className="topbar">
        {onMenu && (
          <button type="button" className="btn sm lg:hidden" onClick={onMenu} aria-label="Menú">
            ☰
          </button>
        )}
        <Icon d="kanban" s={17} />
        <h1>CRM{grupoActual ? ` · ${grupoActual.name}` : ''}</h1>
        <div className="sp" />

        {/* Celular: buscar y filtrar son dos botones. En escritorio el buscador
            está siempre y las tiras de filtro también, así que no se dibujan. */}
        <button
          type="button"
          className={cn('btn sm solo-movil', verBuscador && 'g')}
          onClick={() => setVerBuscador((v) => !v)}
          aria-pressed={verBuscador}
        >
          <Icon d="search" s={13} /> Buscar
        </button>
        <button
          type="button"
          className={cn('btn sm solo-movil', verFiltros && 'g')}
          onClick={() => setVerFiltros((v) => !v)}
          aria-pressed={verFiltros}
        >
          <Icon d="filtro" s={13} /> Filtros
        </button>

        <label className="btn sm buscador" style={{ gap: 6, cursor: 'text' }}>
          <Icon d="search" s={13} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar contacto…"
            aria-label="Buscar contacto"
            style={{ background: 'transparent', border: 0, outline: 'none', color: 'inherit', width: 130, fontSize: 11.5 }}
          />
        </label>
      </div>

      {/* Escritorio: los cuatro filtros como selectores en un solo renglón.
          Las tres tiras de chips ocupaban tres renglones de la pantalla —con
          27 etapas, la de etapas scrolleaba sola— para elegir cuatro valores.
          En el celular siguen siendo tiras, que ahí se tocan mejor que un
          desplegable. */}
      <div className="kan-selects">
        {marcas.length > 0 && (
          <label className="selcampo">
            <span className="rot">Marca</span>
            <select
              value={marcaId == null ? '' : String(marcaId)}
              onChange={(e) => onMarca(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todas</option>
              {marcas.map((m) => (
                <option key={m.id} value={String(m.id)}>{m.name}</option>
              ))}
            </select>
          </label>
        )}

        {data.grupos.length > 0 && (
          <label className="selcampo">
            <span className="rot">Grupo</span>
            <select
              value={grupo == null ? '' : String(grupo)}
              onChange={(e) => {
                setGrupo(e.target.value ? Number(e.target.value) : null);
                // La etapa elegida puede no existir en el grupo nuevo.
                setEtapaSola(null);
              }}
            >
              <option value="">Todo el embudo ({fmtInt(data.etapas.length)})</option>
              {data.grupos.map((g) => (
                <option key={g.id} value={String(g.id)}>{g.name} ({fmtInt(g.etapas)})</option>
              ))}
            </select>
          </label>
        )}

        <label className="selcampo">
          <span className="rot">Etapa</span>
          <select
            value={etapaSola == null ? '' : String(etapaSola)}
            onChange={(e) => setEtapaSola(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todas ({fmtInt(etapasDelGrupo.length)})</option>
            {etapasDelGrupo.map((e) => (
              <option key={e.id} value={String(e.id)}>{e.emoji ? `${e.emoji} ` : ''}{e.name}</option>
            ))}
          </select>
        </label>

        {data.etiquetas.length > 0 && (
          <label className="selcampo">
            <span className="rot">Etiqueta</span>
            <select
              value={etiqueta == null ? '' : String(etiqueta)}
              onChange={(e) => setEtiqueta(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todas</option>
              {data.etiquetas.map((et) => (
                <option key={et.id} value={String(et.id)}>{et.name}</option>
              ))}
            </select>
          </label>
        )}

        <div className="sp" />
      </div>

      {/* La barra de «tipo» de la maqueta: acá, la marca del negocio. */}
      {marcas.length > 0 && (
        <div className="kan-groups">
          <span className="rot">Marca</span>
          <button type="button" className={cn('gchip', marcaId == null && 'active')} onClick={() => onMarca(null)}>
            Todas
            <span className="cnt">{fmtInt(marcas.length)}</span>
          </button>
          {marcas.map((m) => (
            <button
              key={m.id}
              type="button"
              className={cn('gchip', marcaId === m.id && 'active')}
              onClick={() => onMarca(m.id)}
            >
              <span className="dot" style={{ background: colorDe(m.name) }} />
              {m.name}
            </button>
          ))}
        </div>
      )}

      {data.grupos.length > 0 && (
        <div className="kan-groups">
          <span className="rot">Grupos</span>
          <button
            type="button"
            className={cn('gchip', grupo == null && 'active')}
            onClick={() => {
              setGrupo(null);
              setEtapaSola(null);
            }}
          >
            Todo el embudo
            <span className="cnt">{fmtInt(data.etapas.length)}</span>
          </button>
          {data.grupos.map((g) => (
            <button
              key={g.id}
              type="button"
              className={cn('gchip', grupo === g.id && 'active')}
              onClick={() => {
                setGrupo(g.id);
                setEtapaSola(null);
              }}
            >
              <span className="dot" style={{ background: colorDe(g.name) }} />
              {g.name}
              <span className="cnt">{fmtInt(g.etapas)}</span>
            </button>
          ))}
          <div className="sp" />
        </div>
      )}

      <div className="kan-funnels">
        <span className="rot">Etapas</span>
        <button type="button" className={cn('fchip', etapaSola == null && 'active')} onClick={() => setEtapaSola(null)}>
          Todas ({fmtInt(etapasDelGrupo.length)})
        </button>
        {etapasDelGrupo.map((e) => (
          <button
            key={e.id}
            type="button"
            className={cn('fchip', etapaSola === e.id && 'active')}
            onClick={() => setEtapaSola((v) => (v === e.id ? null : e.id))}
          >
            {e.name}
          </button>
        ))}
        <div className="sp" />
      </div>

      {data.totales.contactos === 0 ? (
        <div style={{ padding: 24 }}>
          <VacioEstado
            titulo="No hay contactos para este filtro"
            ayuda={marcaId == null ? 'Probá con otra búsqueda.' : 'Esta marca todavía no tiene contactos vinculados por sus clientes.'}
          />
        </div>
      ) : (
        <div className="kan">
          {columnas.map((col) => {
            const compartida = col.grupos.length > 1 && grupo == null;
            const valor = plataCorta(col.valor);
            return (
              <section
                key={String(col.key)}
                className={cn('col', compartida && 'shared')}
                aria-label={col.titulo}
              >
                <div className="col-h">
                  <span className="nm">
                    <span className="dot" style={{ background: colorDe(col.titulo), width: 8, height: 8 }} />
                    {col.emoji ? `${col.emoji} ` : ''}
                    {col.titulo}
                  </span>
                  {compartida && <span className="shared-tag">{col.grupos.length} grupos</span>}
                  <span
                    className="ct"
                    style={col.total >= COLUMNA_CARGADA ? { color: '#f5a524' } : undefined}
                  >
                    {fmtInt(col.total)}
                  </span>
                </div>
                {/* Sólo el dato. Un renglón que dice "sin monto cotizado" en
                    veinte columnas es ruido repetido veinte veces. */}
                {valor && <div className="col-val">{valor}</div>}
                <div
                  className={cn('col-b', encima === col.key && 'over')}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setEncima(col.key);
                  }}
                  onDragLeave={() => setEncima((v) => (v === col.key ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setEncima(null);
                    if (arrastrado == null) return;
                    void mover(arrastrado, col.key === 'sin' ? null : col.key);
                    setArrastrado(null);
                  }}
                >
                  {col.contactos.map((c) => (
                    <article
                      key={c.id}
                      className={cn('kcard', arrastrado === c.id && 'drag')}
                      draggable
                      onDragStart={() => setArrastrado(c.id)}
                      onDragEnd={() => {
                        setArrastrado(null);
                        setEncima(null);
                      }}
                    >
                      <div className="kcard-r1">
                        <Avatar name={c.nombre} size={26} foto={c.foto} />
                        {/* Clic en el contacto = abre la ficha del Command
                            Center al costado, que es donde está todo: chat,
                            IA, CRM, acciones, radar e historial. */}
                        <button
                          type="button"
                          className="kcard-nm"
                          style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'inherit', cursor: 'pointer' }}
                          onClick={() => c.chatId && setFicha({ chatId: c.chatId, seccion: 'resumen' })}
                          disabled={!c.chatId}
                        >
                          {c.nombre}
                        </button>
                        {/* El mismo ícono de estado que la lista del Command
                            Center: sale de la misma expresión de SQL. */}
                        {esSituacion(c.situacion) && <SituacionIcono situacion={c.situacion} />}
                        {c.gate && <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ce-muted2)' }}>{c.gate}</span>}
                      </div>

                      {c.cotizado ? (
                        <div className="kcard-deal">
                          {plata({ currency: c.moneda ?? 'ARS', cents: c.cotizado })}
                          {c.ciclo && <span style={{ fontSize: 10, color: 'var(--ce-muted)', fontWeight: 600 }}> / {c.ciclo}</span>}
                        </div>
                      ) : null}

                      {/* Membresía del cliente: qué plan y si está al día. Es
                          lo primero que se pregunta de alguien que ya compró. */}
                      {c.membresia && (
                        <div className="kcard-meta" style={{ marginBottom: 6 }}>
                          <Chip color={c.membresia.estadoPago === 'paid' ? '#25D366' : '#f5a524'}>
                            {c.membresia.plan}
                          </Chip>
                          {c.membresia.estadoPago !== 'paid' && (
                            <span style={{ color: '#f5a524', fontWeight: 700 }}>
                              {c.membresia.estadoPago === 'overdue' ? 'vencido' : 'a cobrar'}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Proyectos con su avance real: tareas hechas sobre el
                          total. Sin tareas cargadas no se dibuja la barra, que
                          en 0 % se lee como "no arrancó" y no es lo mismo. */}
                      {c.proyectos.map((p) => {
                        const pct = p.total > 0 ? Math.round((p.hechas / p.total) * 100) : null;
                        return (
                          <div key={p.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--ce-muted)' }}>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                              {pct != null && <span style={{ fontWeight: 800 }}>{pct}%</span>}
                            </div>
                            {pct != null && (
                              <div style={{ height: 4, borderRadius: 999, background: 'rgba(127,127,127,.2)', marginTop: 3 }}>
                                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--ce-green)' }} />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="kcard-meta">
                        {c.cliente && <Chip color="#25D366">{c.cliente}</Chip>}
                        {c.etiquetas.slice(0, 2).map((t) => (
                          <Chip key={t.name} color={t.color?.startsWith('#') ? t.color : '#60a5fa'}>
                            {t.name}
                          </Chip>
                        ))}
                        {c.diasQuieto != null && <span>{fmtInt(c.diasQuieto)}d sin moverse</span>}
                        {c.tieneCorreccion && (
                          <span style={{ color: 'var(--ce-purple)', fontWeight: 700 }}>corrección</span>
                        )}
                      </div>

                      <div className="kcard-src">
                        {c.chatId ? (
                          <a href={`/dashboard/chat/${c.chatId}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'inherit' }}>
                            <Icon d="msg" s={11} />
                            {c.origen ?? 'Abrir chat'}
                          </a>
                        ) : (
                          <>
                            <Icon d="msg" s={11} />
                            {c.origen ?? 'Sin chat'}
                          </>
                        )}
                        <div style={{ flex: 1 }} />
                        {/* Si ya tiene un prompt dejado se dice; si no, el
                            botón lleva a dejarlo, que es la acción que faltaba
                            desde el tablero. */}
                        <button
                          type="button"
                          onClick={() => c.chatId && setFicha({ chatId: c.chatId, seccion: 'ia' })}
                          disabled={!c.chatId}
                          style={{
                            background: 'none',
                            border: 0,
                            padding: 0,
                            cursor: c.chatId ? 'pointer' : 'default',
                            color: c.tienePrompt ? 'var(--ce-purple)' : 'var(--ce-muted)',
                            fontWeight: 700,
                            fontSize: 10,
                          }}
                        >
                          {c.tienePrompt ? '✦ con prompt' : '+ prompt'}
                        </button>
                        {c.responsable ? (
                          <Avatar name={c.responsable} size={17} fs={7.5} />
                        ) : (
                          <span style={{ color: '#f5a524', fontWeight: 700 }}>
                            sin agente
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                  {!col.contactos.length && (
                    <div style={{ fontSize: 11, color: 'var(--ce-muted2)', textAlign: 'center', padding: '14px 0' }}>Arrastrá acá</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {/* El sidebar del Command Center, tal cual: no es una copia de la ficha
          sino la ficha misma (FichaView), así lo que se arregle allá vale acá. */}
      {ficha && (
        <>
          {/* Fondo oscuro: además de enfocar, da dónde tocar para cerrar en el
              celular, que es donde el panel tapa todo. */}
          <div className="crmFichaFondo" onClick={() => setFicha(null)} aria-hidden />
          <aside className="crmFicha" aria-label="Ficha del contacto">
            {/* Cierre propio: si la ficha de adentro falla o tarda, esta barra
                sigue estando y no queda una pantalla de la que no se sale. */}
            <div className="crmFichaBarra">
              <strong>Ficha</strong>
              <button type="button" onClick={() => setFicha(null)} aria-label="Cerrar">✕</button>
            </div>
            <LimiteDeError nombre="Ficha del contacto">
              <FichaView chatId={ficha.chatId} seccionInicial={ficha.seccion} onClose={() => setFicha(null)} />
            </LimiteDeError>
          </aside>
        </>
      )}
    </div>
  );
}
