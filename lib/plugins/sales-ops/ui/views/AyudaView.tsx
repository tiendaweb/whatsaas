'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, MessageCircle, Bot, CheckCircle2, ClipboardCheck, Compass, Factory, GraduationCap, Inbox, LayoutGrid, LifeBuoy, Radar, ShieldCheck, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VISTA_LABELS, type Vista } from '../components/vistas';
import { FichaDock, type DockItem } from '../components/FichaDock';
import { VISTA_ICONS } from '../components/Sidebar';
import { CURSO, TEMAS, WHATSPRO, type Leccion } from '../ayuda/contenido';

/**
 * Ayuda: la landing del Command Center, para leer una vez y volver cuando
 * alguien nuevo entra al equipo.
 *
 * No es documentación técnica (esa está en docs/command-center-comercial):
 * es el flujo de trabajo contado como se hace, quién hace qué, y qué vista se
 * abre para cada cosa. Se escribe acá, en el código, para que cambie junto con
 * la pantalla y no quede un PDF viejo dando vueltas.
 */

const PASOS: Array<{ n: number; titulo: string; texto: string; vista: Vista; icon: LucideIcon }> = [
  { n: 1, titulo: 'Clasificar', texto: 'Cada chat se audita una vez (y de nuevo cada vez que cambia): qué gate, qué pidió, qué lo frenó y cuál es la siguiente acción. Lo hacen los conectores con la cola de trabajo, o la IA del equipo.', vista: 'todos', icon: Sparkles },
  { n: 2, titulo: 'Elegir a quién', texto: 'Las listas cortan la base por lo que importa hoy: Dinero (pagos que faltan), Oportunidades (los que están por decidir), Barrido (los que se enfriaron) y Limpieza (descartes y ejecutados).', vista: 'oportunidades', icon: Users },
  { n: 3, titulo: 'Proponer', texto: 'Desde la ficha o con "Nuevo lote" se propone una acción: mensaje, mensaje programado, tarea, demo web o proyecto. Proponer nunca envía.', vista: 'cola', icon: Inbox },
  { n: 4, titulo: 'Revisar y aprobar', texto: 'En revisión se lee el texto entero, se corrige ahí mismo y se aprueba o se descarta. Lo que no se aprueba no sale. Los lotes de envío los aprueba Noelia.', vista: 'cola', icon: ClipboardCheck },
  { n: 5, titulo: 'Ejecutar', texto: 'Lo aprobado pasa a En cola: lo ejecuta el servidor con "Ejecutar", un conector desde su cola de trabajo, o se manda a mano y se marca. Un envío por contacto, nunca dos.', vista: 'cola', icon: Bot },
  { n: 6, titulo: 'Escuchar', texto: 'El radar mira las respuestas: quien contesta sale de la cola y aparece en Respuestas con la señal (quiere pagar, pregunta precio, pide que no le escriban). Los audios se transcriben y se resumen.', vista: 'respuestas', icon: Radar },
  { n: 7, titulo: 'Producir y cobrar', texto: 'Lo que se vendió pasa a Producción: demos y proyectos de cliente en Tareas OS, con su avance visible acá. El cobro se registra en la ficha; nada queda "cobrado" hasta que una persona lo confirma.', vista: 'produccion', icon: Factory },
];

const ROLES: Array<{ nombre: string; rol: string; tono: string; hace: string[]; vistas: Vista[] }> = [
  {
    nombre: 'Noelia',
    rol: 'Ventas y atención',
    tono: 'border-emerald-500/40 bg-emerald-500/5',
    hace: [
      'Empieza el día en Hoy: plata que falta, auditoría del día y siguiente mejor acción.',
      'Revisa y aprueba los lotes de envío (los de mensaje requieren su aprobación) y corrige textos antes de que salgan.',
      'Atiende Respuestas: cada señal del radar es alguien que contestó y espera.',
      'Registra cobros y ventas desde la ficha del contacto; lo pendiente de pago vive en Dinero.',
      'Convierte en cliente o membresía a quien concreta.',
    ],
    vistas: ['hoy', 'dinero', 'respuestas', 'cola'],
  },
  {
    nombre: 'Carlos',
    rol: 'Administración, crecimiento y producto',
    tono: 'border-sky-500/40 bg-sky-500/5',
    hace: [
      'Define segmentos y campañas: arma lotes por gate, prueba textos A/B en Experimentos y mira qué recupera más.',
      'Decide qué se ofrece (planes, precios, promociones) y lo deja escrito en las skills del Prompt Studio para que todos usen el mismo discurso.',
      'Mira Métricas: recuperación por gate, respuesta por texto, tiempo de cada etapa.',
      'Administra clientes y empresas (Contactos › Clientes) y las cuentas de AAPP SPACE vinculadas.',
      'Mantiene limpia la base: descartes, exclusiones (personal, equipo, otros) y contactos ejecutados que vuelven al ciclo.',
    ],
    vistas: ['oportunidades', 'barrido', 'limpieza', 'metricas', 'prompts'],
  },
  {
    nombre: 'Martín',
    rol: 'Producción, demos y desarrollo de la plataforma',
    tono: 'border-amber-500/40 bg-amber-500/5',
    hace: [
      'Toma los pedidos de demo: cada uno llega como tarea al workspace Demos con la investigación del chat y el prompt listo para generar la web en AAPP SPACE.',
      'Arma los proyectos de cliente (workspace Clientes) y los lleva por Por hacer › En curso › Hecho; el avance se ve en Producción.',
      'Documenta los pasos de cada entrega en el workspace Command Center de Tareas OS.',
      'Supervisa lo que corre con IA: prompts de tareas, corridas fallidas, cuota del equipo, conectores.',
      'Desarrolla la plataforma: nuevas skills, tools de conectores, automatizaciones y las vistas de este Command Center.',
    ],
    vistas: ['produccion', 'audios', 'programados', 'prompts'],
  },
];

const REGLAS = [
  'Proponer no envía. Aprobar no envía. Sólo Ejecutar (o un conector con la fila aprobada) le llega al cliente.',
  'Un envío por contacto a la vez: si ya tiene uno aprobado en otro lote, el nuevo no se aprueba hasta resolverlo.',
  'Nadie que respondió después de la aprobación recibe el texto aprobado: se saltea y se mira de nuevo.',
  'Nada queda cobrado por la IA ni por un conector: ventas, membresías y pagos nacen pendientes hasta que una persona confirma.',
  'Los conectores trabajan con lo aprobado y con lo que un humano pidió; lo que proponen ellos espera en revisión.',
  'Lo ejecutado se vuelve a auditar solo: si el chat vuelve a merecer una acción, entra de nuevo pasado el enfriamiento.',
];

type Tab = 'flujo' | 'vistas' | 'curso' | 'whatspro' | 'reglas';

export function AyudaView({ onNav }: { onNav: (vista: Vista) => void }) {
  const [tab, setTab] = useState<Tab>('flujo');
  /** Landing de una función: se abre acá adentro; "Ir a la vista" es el único salto. */
  const [tema, setTema] = useState<Vista | null>(null);
  const tabs: Array<DockItem<Tab>> = [
    { id: 'flujo', label: 'Flujo', icon: Compass },
    { id: 'vistas', label: 'Funciones', icon: LayoutGrid },
    { id: 'curso', label: 'Curso práctico de IA', icon: GraduationCap },
    { id: 'whatspro', label: 'Curso práctico de WhatsPro', icon: MessageCircle },
    { id: 'reglas', label: 'Reglas', icon: ShieldCheck },
  ];
  const abrir = (v: Vista) => {
    setTema(v);
    setTab('vistas');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16 text-[15px] leading-relaxed">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          <LifeBuoy className="size-3.5" aria-hidden />
          Ayuda
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Cómo funciona el Command Center Comercial</h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Es el sistema operativo comercial del equipo sobre WhatsPro: audita cada chat, decide a quién escribirle y qué, hace que todo pase por una
          aprobación humana antes de salir, escucha las respuestas y sigue la producción de lo vendido.
        </p>
      </header>

      <FichaDock items={tabs} active={tab} onChange={(t) => { setTab(t); if (t !== 'vistas') setTema(null); }} className="rounded-xl border border-border" />

      {tab === 'flujo' && (
        <div className="space-y-10">
          <Seccion titulo="El flujo de trabajo" sub="Siete pasos, siempre en este orden. Tocá uno para leer su landing.">
            <ol className="space-y-2">
              {PASOS.map((p) => (
                <li key={p.n}>
                  <button type="button" onClick={() => abrir(p.vista)} className="flex w-full gap-4 rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/60">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">{p.n}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                        <p.icon className="size-4 text-primary" aria-hidden />
                        {p.titulo}
                      </span>
                      <span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{p.texto}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          </Seccion>

          <Seccion titulo="Quién hace qué" sub="Tres personas, tres frentes. Todos ven todo; cada uno arranca por lo suyo.">
            <div className="grid gap-3 md:grid-cols-3">
              {ROLES.map((r) => (
                <article key={r.nombre} className={cn('flex flex-col rounded-2xl border p-4', r.tono)}>
                  <p className="text-base font-bold text-foreground">{r.nombre}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{r.rol}</p>
                  <ul className="mt-2 flex-1 space-y-1.5">
                    {r.hace.map((h) => (
                      <li key={h} className="flex gap-2 text-[15px] leading-relaxed text-foreground/85">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.vistas.map((v) => (
                      <button key={v} type="button" onClick={() => abrir(v)} className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground">
                        {VISTA_LABELS[v]}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Los conectores" sub="Claude, ChatGPT y Grok conectados por MCP trabajan con las mismas reglas.">
            <p className="rounded-2xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
              Un conector empieza siempre por <code className="rounded bg-muted px-1 font-mono text-[11px]">whatspro_sales_work_queue</code>: ahí recibe lo que espera con la
              cadena exacta de herramientas. Lo que él propone queda en revisión hasta que una persona lo aprueba. El detalle está en la pestaña{' '}
              <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setTab('curso')}>
                Curso práctico de IA
              </button>
              .
            </p>
          </Seccion>
        </div>
      )}

      {tab === 'vistas' && (tema && TEMAS[tema] ? (
        <TemaLanding vista={tema} onVolver={() => setTema(null)} onNav={onNav} onTema={setTema} />
      ) : (
        <Seccion titulo="Las funciones" sub="Cada vista tiene su landing: qué es, cuándo usarla, cómo se usa, reglas y qué hace un conector ahí.">
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {(Object.keys(TEMAS) as Vista[]).map((v) => {
              const Icon = VISTA_ICONS[v];
              return (
                <li key={v}>
                  <button type="button" onClick={() => setTema(v)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/60">
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-foreground">{TEMAS[v]!.titulo}</span>
                      <span className="block text-[15px] leading-relaxed text-muted-foreground">{TEMAS[v]!.enUnaFrase}</span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </Seccion>
      ))}

      {tab === 'curso' && (
        <Seccion titulo="Curso práctico de IA" sub="Qué puede hacer cada interfaz, cómo trabaja un conector, qué no puede, cómo supervisarlo y qué pedirle.">
          <Lecciones lecciones={CURSO} />
        </Seccion>
      )}

      {tab === 'whatspro' && (
        <Seccion titulo="Curso práctico de WhatsPro" sub="Cada función de la plataforma explicada para cualquiera del equipo, con un ejemplo real en cada una.">
          <Lecciones lecciones={WHATSPRO} />
        </Seccion>
      )}

      {tab === 'reglas' && (
        <Seccion titulo="Reglas que no se aflojan" sub="Son las que evitan mandar dos veces, cobrar lo que no se cobró y escribirle a quien ya contestó.">
          <ul className="space-y-1.5">
            {REGLAS.map((r) => (
              <li key={r} className="flex gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground/85">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}

function Lecciones({ lecciones }: { lecciones: Leccion[] }) {
  return (
    <div className="space-y-5">
      {lecciones.map((l) => (
        <article key={l.titulo} className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="text-lg font-bold tracking-tight text-foreground">{l.titulo}</h3>
          {l.parrafos.map((p) => (
            <p key={p} className="text-[15px] leading-relaxed text-muted-foreground">{p}</p>
          ))}
          {l.puntos && (
            <ul className="space-y-2">
              {l.puntos.map((pt) => (
                <li key={pt} className="flex gap-2 text-[15px] leading-relaxed text-foreground/85">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          )}
          {l.ejemplo && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Ejemplo</p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground/90">{l.ejemplo}</p>
            </div>
          )}
          {l.prompts && l.prompts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Prompts para probar</p>
              {l.prompts.map((pr) => (
                <pre key={pr} className="whitespace-pre-wrap rounded-xl bg-muted/60 p-3 font-mono text-[13px] leading-relaxed text-foreground/90">{pr}</pre>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/** La landing de una función. */
function TemaLanding({ vista, onVolver, onNav, onTema }: { vista: Vista; onVolver: () => void; onNav: (v: Vista) => void; onTema: (v: Vista) => void }) {
  const t = TEMAS[vista]!;
  const Icon = VISTA_ICONS[vista];
  const bloque = (titulo: string, items: string[], numerado = false) =>
    items.length > 0 && (
      <div className="space-y-2 rounded-2xl border border-border bg-card p-5">
        <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{titulo}</h3>
        <ul className="space-y-2.5">
          {items.map((i, n) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-foreground/90">
              {numerado ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{n + 1}</span>
              ) : (
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              )}
              <span>{i}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <article className="space-y-5">
      <button type="button" onClick={onVolver} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        Todas las funciones
      </button>
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Icon className="size-6 text-primary" aria-hidden />
            {t.titulo}
          </h2>
          <p className="mt-1 text-lg font-medium text-primary">{t.enUnaFrase}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t.queEs}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/90">
            <span className="font-semibold">Cuándo usarla:</span> {t.cuando}
          </p>
        </div>
        <button type="button" onClick={() => onNav(vista)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90">
          Ir a la vista
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
      {bloque('Primer uso, en cinco minutos', t.primerUso, true)}
      {bloque('Cómo se usa', t.comoSeUsa)}
      {t.ejemplos.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Situaciones reales</h3>
          {t.ejemplos.map((e) => (
            <div key={e.situacion} className="rounded-xl bg-background/70 p-3">
              <p className="text-[15px] font-semibold text-foreground">{e.situacion}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-foreground/85">{e.queHacer}</p>
            </div>
          ))}
        </div>
      )}
      {bloque('Reglas', t.reglas)}
      {bloque('Qué hace un conector acá', t.conectores)}
      {t.verTambien.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Ver también:</span>
          {t.verTambien.map((v) => (
            <button key={v} type="button" onClick={() => onTema(v)} className="rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              {VISTA_LABELS[v]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function Seccion({ titulo, sub, children }: { titulo: string; sub: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{titulo}</h2>
        <p className="text-[15px] text-muted-foreground">{sub}</p>
      </div>
      {children}
    </section>
  );
}
