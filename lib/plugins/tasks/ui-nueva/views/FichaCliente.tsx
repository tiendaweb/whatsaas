'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Clock, ExternalLink, Image as ImageIcon, ListTree, Mail, MessageCircle, Mic, Phone, Radar as RadarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import type { CustomerDetailData } from '@/lib/plugins/customers/ui/types';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { C } from '../data/clases';
import { ES } from '../i18n/es';
import { BitacoraCliente } from './BitacoraCliente';
import { ChatCliente } from './ChatCliente';
import { Chips, fechaCorta, useFichaExtra } from './FichaClienteExtra';
import { ProgramadosCliente } from './ProgramadosCliente';

type TabId = 'resumen' | 'chat' | 'programados' | 'actividad' | 'archivos' | 'radar';

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error('ficha');
  return r.json();
});

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${C.card} p-6 space-y-3`}>
      <div className={C.rotulo}>{title}</div>
      {children}
    </section>
  );
}

/**
 * Ficha de cliente. Se puede abrir por CLIENTE (`customerId`) o por LEAD
 * (`contactId`): una tarea puede estar vinculada a cualquiera de los dos.
 *
 * Si se abre por lead y ese contacto ya está vinculado a un cliente, se
 * muestra la ficha completa del cliente. Si todavía no es cliente, se
 * muestran igual sus datos de CRM (etapa, etiquetas, notas, media, Radar) —
 * en vez de no abrir nada, que era el comportamiento anterior.
 */
export function FichaCliente(props: {
  customerId?: number | null;
  contactId?: number | null;
  /** Necesario para escuchar el canal de Pusher del chat embebido. */
  teamId: number | null;
  onClose: () => void;
  onFiltrarTareas: () => void;
  onAbrirTarea: (id: number) => void;
}) {
  // Lead → cliente: sólo se consulta si se abrió por contacto.
  const { data: puente } = useSWR<{ customerId: number | null } | null>(
    !props.customerId && props.contactId ? `/api/plugins/customers/by-contact?contactId=${props.contactId}` : null,
    (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)),
    { revalidateOnFocus: false },
  );
  const customerId = props.customerId ?? puente?.customerId ?? null;

  const { data, error, isLoading } = useSWR<CustomerDetailData>(
    customerId ? `/api/plugins/customers/${customerId}` : null,
    fetcher,
  );

  const [tab, setTab] = useState<TabId>('resumen');

  // Todo lo del CRM (etiquetas, etapa, departamento, notas internas, media)
  // cuelga del CONTACTO, no del cliente.
  const contactoPrincipal = data?.contacts?.[0] ?? null;
  const extra = useFichaExtra(
    props.contactId ?? contactoPrincipal?.id ?? null,
    contactoPrincipal?.remoteJid ?? null,
  );

  // La ficha se dibuja si hay CLIENTE o al menos el contacto del lead.
  const hayAlgo = Boolean(data) || Boolean(extra.contacto);
  const nombre = data?.name ?? extra.contacto?.name ?? '';

  // El chat y los programados cuelgan del WhatsApp del contacto, no del
  // cliente: un cliente sin contacto vinculado no tiene ninguno de los dos.
  const jidPrincipal = contactoPrincipal?.remoteJid ?? extra.contacto?.remoteJid ?? null;
  const telefonoWhatsapp = jidPrincipal ? jidPrincipal.replace(/@.*$/, '') : (data?.phone ?? null);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-stretch justify-end" onClick={props.onClose}>
      <div
        className="w-full max-w-xl h-full bg-[var(--t-bg)] text-[var(--t-text)] overflow-y-auto shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 bg-[var(--t-bg)]/90 backdrop-blur border-b border-[var(--t-border)]">
          <span className="bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)] text-[var(--tareas-accent)] text-xs font-bold tracking-[0.2em] uppercase px-4 py-1.5 rounded-full">
            {ES.rotulos.fichaCliente}
          </span>
          <button type="button" onClick={props.onClose} className="w-10 h-10 rounded-full bg-[var(--t-chip)] text-[var(--t-muted)] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 pb-24">
          {isLoading && <p className="text-[var(--t-muted)]">{ES.carga}</p>}
          {error && <p className="text-rose-500">{ES.ficha.sinDatos}</p>}
          {hayAlgo && (
            <>
              <div className="flex items-start gap-4">
                {data?.profileImage ? (
                  <img src={data.profileImage} alt="" className="w-16 h-16 rounded-2xl object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[var(--tareas-accent)] text-white flex items-center justify-center text-xl font-black">
                    {nombre.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-black tracking-tight">{nombre}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data ? (
                      <>
                        <span className={C.badge}>{data.status}</span>
                        <span className={C.badge}>{data.source === 'aapp_space' ? ES.ficha.origenAapp : ES.ficha.origenManual}</span>
                      </>
                    ) : (
                      // Lead que todavía no es cliente: se dice explícitamente
                      // en vez de mostrar una ficha vacía.
                      <span className={C.badge}>{ES.ficha.soloLead}</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-[var(--t-text-secondary)]">
                    {data?.email && (
                      <a href={`mailto:${data.email}`} className="flex items-center gap-2 hover:text-[var(--tareas-accent)]">
                        <Mail className="w-3.5 h-3.5" /> {data.email}
                      </a>
                    )}
                    {data?.phone && (
                      <a href={`tel:${data.phone}`} className="flex items-center gap-2 hover:text-[var(--tareas-accent)]">
                        <Phone className="w-3.5 h-3.5" /> {data.phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={props.onFiltrarTareas}
                className="w-full rounded-2xl py-3 font-bold bg-[var(--tareas-accent)] text-white"
              >
                {ES.relaciones.filtrarTareas}
              </button>

              {/* Pestañas: el resumen se lee de arriba a abajo, pero actividad,
                  archivos y Radar son consultas distintas — mezclarlas en una
                  sola columna obligaba a scrollear mucho para llegar a lo
                  puntual. */}
              <div className="flex gap-1 border-b border-[var(--t-border)]">
                {([
                  ['resumen', ES.ficha.tabResumen],
                  ['chat', ES.ficha.tabChat],
                  ['programados', ES.ficha.tabProgramados],
                  ['actividad', ES.ficha.tabActividad],
                  ['archivos', ES.ficha.tabArchivos],
                  ['radar', ES.ficha.tabRadar],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      '-mb-px border-b-2 px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors',
                      tab === id
                        ? 'border-[var(--tareas-accent)] text-[var(--tareas-accent)]'
                        : 'border-transparent text-[var(--t-muted)] hover:text-[var(--t-text)]',
                    )}
                  >
                    {id === 'radar' && <RadarIcon className="mr-1 inline h-3 w-3" />}
                    {id === 'chat' && <MessageCircle className="mr-1 inline h-3 w-3" />}
                    {id === 'programados' && <Clock className="mr-1 inline h-3 w-3" />}
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'resumen' && (<>
              {data && (<>
              <div className="grid grid-cols-2 gap-3">
                {[
                  [data.contacts.length, ES.ficha.contactos],
                  [data.subscriptions.length, ES.ficha.membresias],
                  [data.stores.length, ES.ficha.tiendas],
                  [data.tasks.length, ES.ficha.tareas],
                ].map(([n, label]) => (
                  <div key={String(label)} className={`${C.card} p-4`}>
                    <div className="text-2xl font-black">{n}</div>
                    <div className={C.rotulo}>{label}</div>
                  </div>
                ))}
              </div>

              {data.notes ? (
                <Block title={ES.ficha.notas}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.notes}</p>
                </Block>
              ) : null}

              {data.customFieldDefs.some((field) => data.customFieldValues[field.key] !== undefined) && (
                <Block title={ES.ficha.camposPersonalizados}>
                  <div className="space-y-2">
                    {data.customFieldDefs
                      .filter((field) => data.customFieldValues[field.key] !== undefined)
                      .map((field) => (
                        <div key={field.key} className="rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t-muted)]">{field.name}</div>
                          <div className="text-sm font-bold mt-0.5">{String(data.customFieldValues[field.key])}</div>
                        </div>
                      ))}
                  </div>
                </Block>
              )}

              <Block title={ES.ficha.contactos}>
                {data.contacts.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                {/* Abre el chat EN esta ficha. Antes era un link a la bandeja:
                    se salía de Tareas y había que volver por el navegador. */}
                {data.contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setTab('chat')}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--t-surface-2)] px-4 py-3 text-left"
                  >
                    <span className="font-bold text-sm truncate">{contact.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--tareas-accent)]">
                      <MessageCircle className="w-3.5 h-3.5" /> {ES.ficha.abrirChat}
                    </span>
                  </button>
                ))}
              </Block>

              <Block title={ES.ficha.membresias}>
                {data.subscriptions.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                {data.subscriptions.map((sub) => (
                  <div key={sub.id} className="rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
                    <div className="font-bold text-sm">{sub.planName || sub.subscriptionNumber}</div>
                    <div className="text-[11px] text-[var(--t-muted)] mt-1">
                      {sub.status} · {sub.paymentStatus}
                      {sub.endDate ? ` · ${sub.endDate}` : ''}
                    </div>
                  </div>
                ))}
              </Block>

              <Block title={ES.ficha.tiendas}>
                {data.stores.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                {data.stores.map((store) => (
                  <div key={store.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
                    <span className="font-bold text-sm truncate">{store.title || store.url || `#${store.id}`}</span>
                    {store.url && (
                      <a href={store.url} target="_blank" rel="noreferrer" className="text-[var(--tareas-accent)]">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </Block>

              <Block title={ES.ficha.pagos}>
                {data.transactions.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                {data.transactions.slice(0, 20).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--t-surface-2)] px-4 py-3 text-sm">
                    <span>{tx.amount} {tx.currency}</span>
                    <span className="text-[11px] text-[var(--t-muted)]">{tx.paymentStatus} · {tx.transactionDate?.slice(0, 10)}</span>
                  </div>
                ))}
              </Block>

              </>)}

              {/* Situación del CRM: sale del contacto vinculado, no del cliente. */}
              {extra.contacto && (
                <Block title={ES.ficha.situacion}>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className={C.rotulo}>{ES.ficha.etapa}</div>
                      <div className="font-bold">
                        {extra.contacto.funnelStage
                          ? `${extra.contacto.funnelStage.emoji ?? ''} ${extra.contacto.funnelStage.name}`.trim()
                          : ES.ficha.sinAsignar}
                      </div>
                    </div>
                    <div>
                      <div className={C.rotulo}>{ES.ficha.departamento}</div>
                      <div className="font-bold">{extra.contacto.assignedDepartment?.name ?? ES.ficha.sinAsignar}</div>
                    </div>
                    <div className="col-span-2">
                      <div className={C.rotulo}>{ES.ficha.responsable}</div>
                      <div className="font-bold">{extra.contacto.assignedUser?.name ?? ES.ficha.sinAsignar}</div>
                    </div>
                  </div>
                </Block>
              )}

              {extra.contacto && (
                <Block title={ES.ficha.etiquetas}>
                  <Chips items={extra.contacto.tags ?? []} />
                </Block>
              )}

              {data && (<Block title={ES.ficha.tareas}>
                {data.tasks.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                {data.tasks.map((task) => {
                  const doneCount = task.checklist?.filter((step) => step.completed).length ?? 0;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => props.onAbrirTarea(task.id)}
                      className="w-full text-left rounded-2xl bg-[var(--t-surface-2)] px-4 py-3"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-bold text-sm">
                        {isRadarTaskTitle(task.title) && <RadarTag size="xs" />}
                        <span className="min-w-0 break-words">{radarTaskTitle(task.title)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center flex-wrap gap-2 text-[11px] text-[var(--t-muted)]">
                        <span>{task.status}{task.dueDate ? ` · ${task.dueDate.slice(0, 10)}` : ''}</span>
                        {task.checklist?.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ListTree className="w-3 h-3" />
                            {doneCount}/{task.checklist.length}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </Block>)}

              </>)}

              {tab === 'chat' && (
                // Sin instanceId a propósito: el envío resuelve la instancia desde
                // el chat que ya existe con este contacto, que es la misma por la
                // que viene hablando.
                jidPrincipal ? (
                  <ChatCliente remoteJid={jidPrincipal} nombre={nombre} teamId={props.teamId} />
                ) : (
                  <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinChat}</p>
                )
              )}

              {tab === 'programados' && (
                <ProgramadosCliente telefono={telefonoWhatsapp} nombreCliente={nombre} />
              )}

              {tab === 'actividad' && customerId && (
                <BitacoraCliente customerId={customerId} notas={extra.bitacora} onCambio={extra.recargarBitacora} />
              )}

              {tab === 'actividad' && (
                <Block title={ES.ficha.notasInternas}>
                  {extra.notasInternas.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                  <div className="space-y-2">
                    {extra.notasInternas.map((nota) => (
                      <div key={nota.id} className="rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{nota.text}</p>
                        <div className="mt-1 text-[11px] text-[var(--t-muted)]">{fechaCorta(nota.timestamp)}</div>
                      </div>
                    ))}
                  </div>
                </Block>
              )}

              {tab === 'archivos' && (
                <>
                  <Block title={ES.ficha.audios}>
                    {extra.audios.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                    <div className="space-y-2">
                      {extra.audios.map((audio) => (
                        <div key={audio.id} className="rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
                          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[var(--t-muted)]">
                            <Mic className="h-3 w-3" />
                            {audio.mediaSeconds ? ES.ficha.duracion(audio.mediaSeconds) : ''} · {fechaCorta(audio.timestamp)}
                            {audio.fromMe ? '' : ' · cliente'}
                          </div>
                          {audio.mediaUrl && <audio controls preload="none" src={audio.mediaUrl} className="w-full" />}
                        </div>
                      ))}
                    </div>
                  </Block>

                  <Block title={ES.ficha.imagenes}>
                    {extra.imagenes.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                    <div className="grid grid-cols-3 gap-2">
                      {extra.imagenes.map((img) => img.mediaUrl && (
                        <a key={img.id} href={img.mediaUrl} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--t-surface-2)]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- media del chat, no un asset local */}
                          <img src={img.mediaUrl} alt={img.mediaCaption ?? ''} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  </Block>

                  {data && (<Block title={ES.ficha.adjuntos}>
                    {data.attachments.length === 0 && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>}
                    {data.attachments.map((file) => (
                      <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-[var(--tareas-accent)]">
                        {file.fileName}
                      </a>
                    ))}
                  </Block>)}
                </>
              )}

              {tab === 'radar' && (
                <Block title={ES.ficha.tabRadar}>
                  {!extra.radar && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.radarNoDisponible}</p>}
                  {extra.radar && !extra.radar.analyzed && <p className="text-sm text-[var(--t-muted)]">{ES.ficha.radarSinDatos}</p>}
                  {extra.radar?.analyzed && (
                    <div className="space-y-3">
                      {Object.entries(extra.radar.fields ?? {})
                        .filter(([, value]) => value)
                        .map(([key, value]) => (
                          <div key={key} className="rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
                            <div className={C.rotulo}>{key.replace(/_/g, ' ')}</div>
                            <div className="mt-0.5 whitespace-pre-wrap text-sm">{value}</div>
                          </div>
                        ))}
                      {(extra.radar.notes ?? []).map((nota, index) => (
                        <div key={index} className="rounded-2xl bg-[var(--t-surface-2)] px-4 py-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{nota.text}</p>
                          <div className="mt-1 text-[11px] text-[var(--t-muted)]">{fechaCorta(nota.date)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Block>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
