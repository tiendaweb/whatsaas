'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft, Ban, Gauge, ListChecks, Loader2, RefreshCcw, Sparkles, TriangleAlert } from 'lucide-react';
import './radar.css';
import { humanize, INTENCION_LABEL, OBJECION_LABEL, PRIORIDAD_BADGE, RECUPERABILIDAD_LABEL } from './labels';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type RadarSummary = {
  analyzed: boolean;
  contact: { id: number; name: string };
  fields: {
    radar_score: string | null;
    radar_prioridad: string | null;
    radar_intencion: string | null;
    radar_objecion: string | null;
    radar_recuperabilidad: string | null;
    radar_confianza: string | null;
    radar_fecha_analisis: string | null;
    radar_oportunidad_2: string | null;
    radar_estrategia: string | null;
  };
  note: { text: string; date: string } | null;
  tasks: Array<{ id: number; title: string; status: string; dueDate: string | null; projectName: string }>;
  error?: string;
};

export function RadarPanel({
  contactId,
  chatId,
  onBack,
  onUseSuggestion,
  onSuggestionsLoaded,
}: {
  contactId: number;
  chatId: number | null | undefined;
  onBack: () => void;
  onUseSuggestion: (text: string) => void;
  /** Levanta las variantes generadas al padre, para mostrar la principal como chip sobre el composer. */
  onSuggestionsLoaded?: (suggestions: string[]) => void;
}) {
  const { data, error, isLoading } = useSWR<RadarSummary>(`/api/plugins/radar/summary/${contactId}`, fetcher);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  async function loadSuggestions() {
    if (!chatId) return;
    setLoadingSuggestions(true);
    setSuggestError(null);
    try {
      const res = await fetch(`/api/chats/${chatId}/radar-suggest`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'No se pudieron generar sugerencias');
      const next: string[] = body.suggestions ?? [];
      setSuggestions(next);
      onSuggestionsLoaded?.(next);
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : 'No se pudieron generar sugerencias');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  return (
    <div className="radar-ui flex h-full flex-col overflow-hidden bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5 dark:border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-2xl text-neutral-400 transition-all duration-200 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-white"
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 dark:shadow-none">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Radar</p>
          <p className="truncate text-[10px] text-neutral-400 dark:text-neutral-500">{data?.contact?.name ?? '…'}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando ficha Radar…
          </div>
        )}

        {(error || data?.error) && !isLoading && (
          <EmptyState
            icon={TriangleAlert}
            title="No se pudo cargar Radar"
            detail={data?.error || 'Intentá de nuevo en un momento.'}
          />
        )}

        {data && !data.error && !data.analyzed && (
          <EmptyState
            icon={Ban}
            title="Sin análisis todavía"
            detail="Este contacto todavía no fue analizado por RADAR."
          />
        )}

        {data && !data.error && data.analyzed && (
          <div className="space-y-4">
            <FichaSection fields={data.fields} />

            {data.fields.radar_estrategia && (
              <Section label="Estrategia recomendada">
                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{data.fields.radar_estrategia}</p>
              </Section>
            )}

            {data.fields.radar_oportunidad_2 && (
              <Section label="Oportunidad secundaria">
                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{data.fields.radar_oportunidad_2}</p>
              </Section>
            )}

            {data.note && (
              <Section label="Evidencia (última nota Radar)">
                <pre className="whitespace-pre-wrap rounded-2xl bg-white p-3 font-sans text-xs leading-relaxed text-neutral-600 shadow-sm dark:bg-neutral-800 dark:text-neutral-300">
                  {data.note.text}
                </pre>
              </Section>
            )}

            {data.tasks.length > 0 && (
              <Section label="Tareas Radar abiertas" icon={ListChecks}>
                <div className="space-y-1.5">
                  {data.tasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-neutral-100 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800">
                      <p className="font-bold text-neutral-800 dark:text-neutral-100">{task.title}</p>
                      <p className="mt-0.5 text-[10px] text-neutral-400">{task.projectName}{task.dueDate ? ` · vence ${task.dueDate}` : ''}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section label="Mensajes sugeridos" icon={Sparkles}>
              {!suggestions && (
                <button
                  type="button"
                  onClick={() => void loadSuggestions()}
                  disabled={loadingSuggestions || !chatId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5 text-xs font-bold text-neutral-500 transition-all duration-200 hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
                >
                  {loadingSuggestions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generar sugerencias
                </button>
              )}
              {suggestError && <p className="text-xs text-rose-500">{suggestError}</p>}
              {suggestions && (
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <div key={i} className="rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
                      <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">{s}</p>
                      <button
                        type="button"
                        onClick={() => onUseSuggestion(s)}
                        className="mt-2 rounded-xl bg-indigo-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-all duration-200 hover:bg-indigo-600"
                      >
                        Usar esta
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => void loadSuggestions()}
                    disabled={loadingSuggestions}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 hover:text-indigo-500"
                  >
                    <RefreshCcw className="h-3 w-3" /> Regenerar
                  </button>
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function FichaSection({ fields }: { fields: RadarSummary['fields'] }) {
  const priorityBadge = fields.radar_prioridad ? PRIORIDAD_BADGE[fields.radar_prioridad] : null;
  const confianza = fields.radar_confianza ? Number(fields.radar_confianza) : null;
  const needsReview = confianza !== null && !Number.isNaN(confianza) && confianza < 70;

  return (
    <Section label="Ficha Radar" icon={Gauge}>
      <div className="flex flex-wrap items-center gap-1.5">
        {priorityBadge && (
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${priorityBadge.className}`}>{priorityBadge.label}</span>
        )}
        {needsReview && (
          <span className="rounded-md bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">Revisar</span>
        )}
        {fields.radar_score && (
          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800">
            Score {fields.radar_score}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Field label="Intención" value={humanize(INTENCION_LABEL, fields.radar_intencion)} />
        <Field label="Objeción" value={humanize(OBJECION_LABEL, fields.radar_objecion)} />
        <Field label="Recuperabilidad" value={humanize(RECUPERABILIDAD_LABEL, fields.radar_recuperabilidad)} />
        <Field label="Confianza" value={fields.radar_confianza ? `${fields.radar_confianza}/100` : null} />
      </dl>
      {fields.radar_fecha_analisis && (
        <p className="mt-2 text-[10px] text-neutral-400">Último análisis: {fields.radar_fecha_analisis}</p>
      )}
    </Section>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10px] uppercase font-black tracking-[0.2em] text-neutral-400 dark:text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-bold text-neutral-800 dark:text-neutral-100">{value ?? '—'}</dd>
    </div>
  );
}

function Section({ label, icon: Icon, children }: { label: string; icon?: typeof Gauge; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-neutral-100 bg-white/60 p-3.5 dark:border-neutral-800 dark:bg-neutral-900/60">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase font-black tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      {children}
    </section>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Ban; title: string; detail: string }) {
  return (
    <div className="radar-ui flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-neutral-100 text-neutral-300 dark:bg-neutral-800 dark:text-neutral-600">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{title}</p>
        <p className="mt-1 max-w-[15rem] text-xs text-neutral-400">{detail}</p>
      </div>
    </div>
  );
}
