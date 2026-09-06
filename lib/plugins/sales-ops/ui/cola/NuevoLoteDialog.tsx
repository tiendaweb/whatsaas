'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { HORA_LABORAL, aLocal, desdeZona, fechaEnZona, parsearLocal, sumarDias } from '@/lib/time/zona';
import { ACTION_ROLES, GATE_LABELS, type ActionKind, type ActionRole, type Gate } from '../../shared/taxonomy';
import { GATE_OPTIONS, KIND_LABELS, QUEUE_ENDPOINT, ROLE_LABELS, postJson, type ApiError } from './api';

type ProposeResponse = {
  batchId: string | null;
  included: Array<{ chatId: number; name: string }>;
  excluded: Array<{ chatId: number; name: string; reason: string }>;
  dryRun: boolean;
};

const KIND_OPTIONS: ActionKind[] = ['send_message', 'schedule_message', 'create_task', 'request_demo', 'mark_pre_descarte', 'assign_owner', 'schedule_call'];

/** Valor por defecto del selector de fecha: mañana a las 10, en hora local. */
function mananaALas10(): string {
  // Mañana a las 10 en hora del negocio, sin pasar por el reloj del navegador.
  return aLocal(desdeZona(sumarDias(fechaEnZona(), 1), HORA_LABORAL.porDefecto, 0));
}

const REASON_LABELS: Record<string, string> = {
  cliente: 'ya es cliente',
  descarte_definitivo: 'descarte definitivo',
  gate_gx: 'GX (perdido)',
  automatizacion_activa: 'automatización activa',
  auto_reply: 'respuestas automáticas',
  envio_reciente: 'envío en las últimas 72 h',
  envio_aprobado_pendiente: 'ya tiene un envío aprobado',
  demasiados_impactos: 'demasiados impactos',
  respondio_hace_poco: 'respondió hace poco',
  sin_analisis: 'sin análisis',
  chat_ajeno_o_inexistente: 'chat inexistente',
};

/**
 * "Nuevo lote" (doc 05 §5): nombre, tipo, gates, rol, texto con variables y A/B
 * opcional. Simula primero (dry run) para mostrar cuántos entran y por qué
 * quedan afuera; recién después propone. Nunca envía.
 */
export function NuevoLoteDialog({
  open,
  onOpenChange,
  onCreated,
  presetChatIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (batchId: string) => void;
  /** Cuando se llega desde una lista con selección múltiple. */
  presetChatIds?: number[];
}) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ActionKind>('send_message');
  const [gates, setGates] = useState<Gate[]>([]);
  const [role, setRole] = useState<ActionRole>('noelia');
  const [text, setText] = useState('');
  const [ab, setAb] = useState(false);
  const [textB, setTextB] = useState('');
  const [sendAt, setSendAt] = useState(mananaALas10);
  const [maxFollowups, setMaxFollowups] = useState('');
  const [minDaysSilent, setMinDaysSilent] = useState('');
  const [preview, setPreview] = useState<ProposeResponse | null>(null);
  const [busy, setBusy] = useState<'preview' | 'create' | null>(null);

  const usesText = kind === 'send_message' || kind === 'schedule_message';
  const esProgramado = kind === 'schedule_message';
  const esDemo = kind === 'request_demo';
  const hasChats = Boolean(presetChatIds?.length);
  const canSubmit =
    label.trim().length > 0 && (gates.length > 0 || hasChats) && (!usesText || text.trim().length > 0) && (!ab || textB.trim().length > 0) && (!esProgramado || sendAt.length > 0);

  function reset() {
    setLabel('');
    setKind('send_message');
    setGates([]);
    setRole('noelia');
    setText('');
    setAb(false);
    setTextB('');
    setMaxFollowups('');
    setMinDaysSilent('');
    setPreview(null);
  }

  function body(dryRun: boolean) {
    return {
      label: label.trim(),
      kind,
      requiresRole: role,
      gates: gates.length ? gates : undefined,
      chatIds: hasChats ? presetChatIds : undefined,
      filters: {
        ...(maxFollowups !== '' ? { maxFollowups: Number(maxFollowups) } : {}),
        ...(minDaysSilent !== '' ? { minDaysSilent: Number(minDaysSilent) } : {}),
      },
      payloadTemplate: usesText
        ? { text: text.trim(), ...(ab && !esProgramado ? { textB: textB.trim() } : {}), ...(esProgramado ? { sendAt: parsearLocal(sendAt)?.toISOString() ?? new Date(sendAt).toISOString() } : {}) }
        : esDemo
          ? { taskTitle: 'Demo web — {{nombre}}', ...(text.trim() ? { text: text.trim() } : {}) }
          : undefined,
      variantSplit: usesText && ab && !esProgramado,
      dryRun,
    };
  }

  async function simulate() {
    setBusy('preview');
    try {
      setPreview(await postJson<ProposeResponse>(QUEUE_ENDPOINT, body(true)));
    } catch (error) {
      toast.error((error as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy('create');
    try {
      const result = await postJson<ProposeResponse>(QUEUE_ENDPOINT, body(false));
      if (!result.batchId) {
        toast.error(`No quedó ningún contacto elegible (${result.excluded.length} excluidos).`);
        setPreview(result);
        return;
      }
      toast.success(`Lote propuesto con ${result.included.length} contactos. Falta aprobarlo.`);
      reset();
      onOpenChange(false);
      onCreated(result.batchId);
    } catch (error) {
      toast.error((error as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const excludedByReason = preview
    ? Object.entries(
        preview.excluded.reduce<Record<string, number>>((acc, row) => {
          acc[row.reason] = (acc[row.reason] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo lote</DialogTitle>
          <DialogDescription>
            Se propone, no se envía. {hasChats ? `${presetChatIds!.length} contactos seleccionados.` : 'Elegí los gates y el texto; después lo revisás y aprobás.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lote-nombre">Nombre</Label>
            <Input id="lote-nombre" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Último intento G0 — semana 35" maxLength={120} />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-1.5">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    kind === option ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
                  )}
                >
                  {KIND_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          {!hasChats && (
            <div className="space-y-1.5">
              <Label>Gates</Label>
              <div className="flex flex-wrap gap-1.5">
                {GATE_OPTIONS.map((gate) => {
                  const active = gates.includes(gate);
                  return (
                    <button
                      key={gate}
                      type="button"
                      title={GATE_LABELS[gate]}
                      onClick={() => setGates((current) => (active ? current.filter((g) => g !== gate) : [...current, gate]))}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
                        active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      {gate}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lote-impactos">Máx. impactos previos</Label>
              <Input id="lote-impactos" inputMode="numeric" value={maxFollowups} onChange={(e) => setMaxFollowups(e.target.value.replace(/\D/g, ''))} placeholder="sin tope" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-silencio">Mín. días de silencio</Label>
              <Input id="lote-silencio" inputMode="numeric" value={minDaysSilent} onChange={(e) => setMinDaysSilent(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            </div>
          </div>

          {esProgramado && (
            <div className="space-y-1.5">
              <Label htmlFor="lote-fecha">Sale el</Label>
              <Input id="lote-fecha" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="w-56" />
              <p className="text-[11px] text-muted-foreground">Al ejecutar el lote se crea un mensaje programado por contacto; lo manda el plugin Mensajes programados a esa hora.</p>
            </div>
          )}

          {esDemo && (
            <div className="space-y-1.5">
              <Label htmlFor="lote-demo">Indicación para la demo (opcional)</Label>
              <Textarea id="lote-demo" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Ej.: sitio de una página, foco en turnos por WhatsApp" />
              <p className="text-[11px] text-muted-foreground">
                Al ejecutar, cada contacto pasa a una tarea en el workspace “Demos” de Tareas OS con la investigación del chat y el prompt listo para generar la web en AAPP SPACE.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Quién aprueba</Label>
            <div className="flex gap-1.5">
              {ACTION_ROLES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    role === option ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
                  )}
                >
                  {ROLE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          {usesText && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="lote-texto">{ab ? 'Texto A' : 'Texto'}</Label>
                  <span className="text-[11px] text-muted-foreground">{'{{nombre}} · {{plan}} · {{precio}}'}</span>
                </div>
                <Textarea id="lote-texto" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} placeholder="Hola {{nombre}}, ¿seguís con ganas de armar tu {{plan}}? Con una palabra me alcanza." />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={ab} onChange={(e) => setAb(e.target.checked)} />
                Probar dos textos (A/B)
              </label>
              {ab && (
                <div className="space-y-1.5">
                  <Label htmlFor="lote-texto-b">Texto B</Label>
                  <Textarea id="lote-texto-b" value={textB} onChange={(e) => setTextB(e.target.value)} rows={4} maxLength={4000} />
                </div>
              )}
            </>
          )}

          {preview && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="font-medium text-foreground">
                Entrarían {preview.included.length} contactos · {preview.excluded.length} excluidos
              </div>
              {excludedByReason.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {excludedByReason.map(([reason, count]) => (
                    <li key={reason}>
                      {count} · {REASON_LABELS[reason] ?? reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={!canSubmit || busy !== null} onClick={simulate}>
            {busy === 'preview' && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Simular
          </Button>
          <Button type="button" disabled={!canSubmit || busy !== null} onClick={create}>
            {busy === 'create' && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Proponer lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
