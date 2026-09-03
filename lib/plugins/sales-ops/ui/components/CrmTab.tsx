'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Check, Loader2, Plus, Save, StickyNote, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { DetailPayload, TimelineHit } from '../../shared/api-types';
import { SALES_OPS_API, fetcher, tiempoRelativo } from './format';

type CrmPayload = {
  contactId: number | null;
  name: string;
  notes: string | null;
  funnelStageId: number | null;
  stages: Array<{ id: number; name: string; emoji: string | null }>;
  tagIds: number[];
  allTags: Array<{ id: number; name: string; color: string | null }>;
  fields: Array<{ key: string; name: string; type: string; value: string }>;
  orphanFields: Array<{ key: string; value: string }>;
};

type Props = {
  chatId: number;
  header: { contactId: number | null; contactNotes?: string | null };
  timeline: DetailPayload['timeline'];
  onSaved?: () => void;
};

const SIN_ETAPA = 'sin-etapa';

/**
 * Pestaña CRM: todo lo que sabemos del contacto, editable en un solo lugar.
 *
 * Antes eran dos pestañas de sólo lectura ("Campos" y "Notas") y la etapa del
 * embudo no se veía en la ficha: corregir una etiqueta mal puesta obligaba a
 * salir del Command Center, abrir el chat en WhatsPro, editarlo y volver — y
 * como eso cuesta, nadie lo hacía y el CRM se seguía ensuciando. Son el mismo
 * objeto, así que van juntos y se editan acá.
 *
 * Guardado explícito y por diferencia: se manda sólo lo que cambió, así dos
 * personas mirando la misma ficha no se pisan campos que ninguna tocó. Las
 * notas internas del chat (las que se escriben con el switch "Nota") se
 * muestran abajo como historial: son mensajes, no un campo editable.
 */
export function CrmTab({ chatId, header, timeline, onSaved }: Props) {
  const { data, isLoading, error, mutate } = useSWR<CrmPayload>(`${SALES_OPS_API}/contacts/${chatId}/crm`, fetcher, { revalidateOnFocus: false });

  const [notes, setNotes] = useState('');
  const [stageId, setStageId] = useState<string>(SIN_ETAPA);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [campoNuevo, setCampoNuevo] = useState<string | null>(null);
  const [creandoCampo, setCreandoCampo] = useState(false);

  // Cada vez que llega el servidor, el formulario vuelve a ser espejo de la base.
  useEffect(() => {
    if (!data) return;
    setNotes(data.notes ?? '');
    setStageId(data.funnelStageId ? String(data.funnelStageId) : SIN_ETAPA);
    setTagIds(data.tagIds);
    setFields(Object.fromEntries(data.fields.map((f) => [f.key, f.value])));
  }, [data]);

  const notasInternas = useMemo(
    () => timeline.filter((t): t is TimelineHit => 'who' in t && t.who === 'nota').reverse(),
    [timeline],
  );

  const sucio = useMemo(() => {
    if (!data) return false;
    if ((data.notes ?? '') !== notes) return true;
    if ((data.funnelStageId ? String(data.funnelStageId) : SIN_ETAPA) !== stageId) return true;
    if (data.tagIds.length !== tagIds.length || data.tagIds.some((id) => !tagIds.includes(id))) return true;
    return data.fields.some((f) => (fields[f.key] ?? '') !== f.value);
  }, [data, notes, stageId, tagIds, fields]);

  const guardar = async () => {
    if (!data || !sucio) return;
    setGuardando(true);
    try {
      // Sólo lo que cambió: un PATCH completo pisaría lo que otro acaba de tocar.
      const patch: Record<string, unknown> = {};
      if ((data.notes ?? '') !== notes) patch.notes = notes.trim() ? notes : null;
      const stageActual = data.funnelStageId ? String(data.funnelStageId) : SIN_ETAPA;
      if (stageActual !== stageId) patch.funnelStageId = stageId === SIN_ETAPA ? null : Number(stageId);
      if (data.tagIds.length !== tagIds.length || data.tagIds.some((id) => !tagIds.includes(id))) patch.tagIds = tagIds;
      const camposCambiados = data.fields.filter((f) => (fields[f.key] ?? '') !== f.value);
      if (camposCambiados.length) {
        patch.fields = Object.fromEntries(camposCambiados.map((f) => [f.key, fields[f.key] ?? '']));
      }

      const res = await fetch(`${SALES_OPS_API}/contacts/${chatId}/crm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      await mutate(body as CrmPayload, { revalidate: false });
      setGuardado(true);
      window.setTimeout(() => setGuardado(false), 2000);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Crea el campo que falta sin salir de la ficha.
   *
   * Es del equipo, no de este cliente: los campos personalizados son un esquema
   * compartido. Se crea acá porque es donde uno descubre que falta, y sin esto
   * el dato terminaba en la nota libre — donde ningún prompt lo puede leer como
   * campo.
   */
  const crearCampo = async () => {
    const nombre = (campoNuevo ?? '').trim();
    if (nombre.length < 2) return;
    setCreandoCampo(true);
    try {
      const res = await fetch(`${SALES_OPS_API}/contacts/${chatId}/crm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      await mutate(body.crm as CrmPayload, { revalidate: false });
      setCampoNuevo(null);
      toast.success(`Campo "${body.campo.name}" creado. Ya lo pueden usar los prompts.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear el campo.');
    } finally {
      setCreandoCampo(false);
    }
  };

  if (error) return <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{String(error.message)}</p>;
  if (isLoading || !data) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  if (!data.contactId) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Este chat todavía no tiene una ficha de contacto guardada, así que no hay etapa, etiquetas ni campos que editar.
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      <section className="space-y-1.5 rounded-xl border border-border p-3">
        <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Etapa del embudo</Label>
        <Select value={stageId} onValueChange={setStageId}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Sin etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_ETAPA}>Sin etapa</SelectItem>
            {data.stages.map((stage) => (
              <SelectItem key={stage.id} value={String(stage.id)}>
                {stage.emoji ? `${stage.emoji} ` : ''}
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-2 rounded-xl border border-border p-3">
        <Label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <TagIcon className="size-3" aria-hidden />
          Etiquetas
        </Label>
        {data.allTags.length === 0 ? (
          <p className="text-xs text-muted-foreground">El equipo todavía no tiene etiquetas.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {data.allTags.map((tag) => {
              const activa = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={activa}
                  onClick={() => setTagIds((prev) => (activa ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    activa ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Campos personalizados
              {data.fields.length > 0 && (
                <span className="ml-1 font-normal normal-case">
                  · {data.fields.filter((f) => (fields[f.key] ?? '').trim()).length} de {data.fields.length} cargados
                </span>
              )}
            </Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setCampoNuevo('')}>
              <Plus className="size-3.5" aria-hidden />
              Campo nuevo
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Los prompts y los conectores leen estos campos como contexto del cliente. Lo que quede vacío, no lo saben.
          </p>

          {campoNuevo !== null && (
            <div className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 p-2">
              <Input
                value={campoNuevo}
                onChange={(e) => setCampoNuevo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void crearCampo()}
                placeholder="Nombre del campo. Ej.: Día de cobro"
                className="h-8 text-sm"
                autoFocus
              />
              <Button type="button" size="sm" className="h-8 shrink-0 text-xs" disabled={creandoCampo || (campoNuevo ?? '').trim().length < 2} onClick={() => void crearCampo()}>
                {creandoCampo ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : 'Crear'}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setCampoNuevo(null)}>
                Cancelar
              </Button>
            </div>
          )}

          {data.fields.length === 0 && campoNuevo === null && (
            <p className="text-xs text-muted-foreground">El equipo todavía no definió campos personalizados.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {data.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`crm-${field.key}`} className="text-[11px] text-muted-foreground">
                  {field.name}
                </Label>
                <Input
                  id={`crm-${field.key}`}
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  value={fields[field.key] ?? ''}
                  onChange={(e) => setFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          {data.orphanFields.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Valores sin campo definido: {data.orphanFields.map((f) => `${f.key}=${f.value}`).join(' · ')}. Creá el campo con el mismo nombre para poder editarlo.
            </p>
          )}
      </section>

      <section className="space-y-1.5 rounded-xl border border-border p-3">
        <Label htmlFor="crm-notes" className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <StickyNote className="size-3" aria-hidden />
          Nota de la ficha
        </Label>
        <Textarea
          id="crm-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Lo que hay que saber de este cliente antes de escribirle."
          className="text-sm"
        />
      </section>

      {notasInternas.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Notas internas del chat <span className="font-normal normal-case">· el cliente nunca las vio</span>
          </p>
          <ul className="space-y-1.5">
            {notasInternas.map((n) => (
              <li key={n.id} className="rounded-lg border border-dashed border-border px-3 py-2 text-sm">
                <p className="text-[11px] text-muted-foreground">{tiempoRelativo(n.at)}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{n.text}</p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">Se agregan desde la pestaña Chat con el switch “Nota”.</p>
        </section>
      )}

      {/* Barra fija: el formulario es más alto que el panel y el botón se perdía abajo. */}
      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-2 border-t border-border bg-background/95 px-1 py-2 backdrop-blur">
        <span className="text-[11px] text-muted-foreground">{sucio ? 'Hay cambios sin guardar' : guardado ? 'Guardado' : 'Todo guardado'}</span>
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!sucio || guardando} onClick={() => void guardar()}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : guardado ? <Check className="size-3.5" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
          Guardar
        </Button>
      </div>
    </div>
  );
}
