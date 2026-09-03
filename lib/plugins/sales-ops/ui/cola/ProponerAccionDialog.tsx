'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActionKind } from '../../shared/taxonomy';
import { ResponsiveModal } from '../skills/ResponsiveModal';
import { QUEUE_ENDPOINT, postJson, type ApiError } from './api';
import { avisarEncolado } from '../components/eventos';

type Props = {
  chatId: number;
  nombre: string;
  kind: ActionKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se llama con el batchId creado, para poder abrir la revisión. */
  onProposed?: (batchId: string) => void;
};

const TITULOS: Partial<Record<ActionKind, string>> = {
  send_message: 'Proponer envío',
  schedule_message: 'Programar mensaje',
  create_task: 'Crear tarea',
  request_demo: 'Pedir demo web',
  register_sale: 'Registrar cobro',
};

const AYUDAS: Partial<Record<ActionKind, string>> = {
  send_message: 'Se propone; no sale hasta que alguien lo apruebe en la Cola. Ahí también se ejecuta.',
  create_task: 'Queda propuesta en la Cola. Al aprobarla y ejecutarla se crea la tarea vinculada al contacto.',
  register_sale: 'Queda propuesto en la Cola para que una persona confirme el importe antes de registrarlo.',
  schedule_message: 'Se propone; al aprobarlo y ejecutarlo queda como mensaje programado y sale solo a la hora indicada.',
  request_demo: 'Al aprobarlo y ejecutarlo se crea una tarea en el workspace “Demos” de Tareas OS con la investigación del chat y el prompt para generar la web en AAPP SPACE.',
};

/**
 * Proponer una acción para UN chat, desde la ficha.
 *
 * Estos tres botones estaban apagados con el cartel "Fase 6" desde que se
 * construyó la ficha: la cola existía, pero sólo se podían armar lotes masivos
 * desde la vista Cola, así que actuar sobre un contacto puntual —lo más común—
 * no tenía camino.
 *
 * No inventa una vía rápida: arma un lote de un solo contacto con el mismo
 * `proposeBatch` que usan los lotes grandes, y por lo tanto pasa por las mismas
 * exclusiones (automatización activa, cliente, envío reciente) y por la misma
 * aprobación humana. Proponer nunca envía.
 */
export function ProponerAccionDialog({ chatId, nombre, kind, open, onOpenChange, onProposed }: Props) {
  const [texto, setTexto] = useState('');
  const [titulo, setTitulo] = useState('');
  const [dias, setDias] = useState('1');
  const [importe, setImporte] = useState('');
  const [moneda, setMoneda] = useState('ARS');
  const [guardando, setGuardando] = useState(false);

  const esEnvio = kind === 'send_message';
  const esTarea = kind === 'create_task';
  const esCobro = kind === 'register_sale';
  const esProgramado = kind === 'schedule_message';
  const esDemo = kind === 'request_demo';
  const [sendAt, setSendAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const listo = esEnvio || esProgramado ? texto.trim().length >= 5 && (!esProgramado || sendAt.length > 0) : esTarea ? titulo.trim().length >= 3 : esDemo ? true : importe.trim().length > 0;

  const proponer = async () => {
    if (!listo) return;
    setGuardando(true);
    try {
      const payloadTemplate: Record<string, unknown> = {};
      if (esEnvio) payloadTemplate.text = texto.trim();
      if (esProgramado) {
        payloadTemplate.text = texto.trim();
        payloadTemplate.sendAt = new Date(sendAt).toISOString();
      }
      if (esDemo) {
        payloadTemplate.taskTitle = `Demo web — ${nombre}`.slice(0, 200);
        if (texto.trim()) payloadTemplate.text = texto.trim();
      }
      if (esTarea) {
        payloadTemplate.taskTitle = titulo.trim();
        payloadTemplate.dueInDays = Number(dias) || 0;
        if (texto.trim()) payloadTemplate.text = texto.trim();
      }
      if (esCobro) {
        payloadTemplate.extra = { amount: importe.trim(), currency: moneda };
        if (texto.trim()) payloadTemplate.text = texto.trim();
      }

      const result = await postJson<{ batchId: string | null; included: unknown[]; excluded: Array<{ reason: string }> }>(QUEUE_ENDPOINT, {
        label: `${TITULOS[kind] ?? kind} — ${nombre}`.slice(0, 120),
        kind,
        requiresRole: 'any',
        chatIds: [chatId],
        payloadTemplate,
      });

      if (!result.batchId || result.included.length === 0) {
        const motivo = result.excluded[0]?.reason;
        toast.error(motivo ? `No entró en el lote: ${motivo.replace(/_/g, ' ')}.` : 'No se pudo proponer: el chat quedó excluido.');
        return;
      }
      toast.success('Propuesto. Aprobalo en la Cola para que salga.');
      // Ya tiene una acción esperando: sale de "Pendiente de verificación".
      avisarEncolado(chatId);
      onProposed?.(result.batchId);
      onOpenChange(false);
      setTexto('');
      setTitulo('');
      setImporte('');
    } catch (error) {
      toast.error((error as ApiError).message ?? 'No se pudo proponer.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${TITULOS[kind] ?? 'Proponer acción'} · ${nombre}`}
      description={AYUDAS[kind]}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="gap-1.5" disabled={guardando || !listo} onClick={() => void proponer()}>
            {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            Proponer
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {esTarea && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="prop-titulo" className="text-xs">
                Título de la tarea
              </Label>
              <Input id="prop-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Llamar para cerrar el combo full" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-dias" className="text-xs">
                Vence en (días)
              </Label>
              <Input id="prop-dias" type="number" min={0} max={365} value={dias} onChange={(e) => setDias(e.target.value)} className="h-9 w-28" />
            </div>
          </>
        )}

        {esProgramado && (
          <div className="space-y-1.5">
            <Label htmlFor="prop-fecha" className="text-xs">
              Sale el
            </Label>
            <Input id="prop-fecha" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="h-9 w-56" />
          </div>
        )}

        {esCobro && (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="prop-importe" className="text-xs">
                Importe cobrado
              </Label>
              <Input id="prop-importe" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="150000" className="h-9" />
            </div>
            <div className="w-28 space-y-1.5">
              <Label htmlFor="prop-moneda" className="text-xs">
                Moneda
              </Label>
              <select
                id="prop-moneda"
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="ARS">ARS</option>
                <option value="PYG">PYG</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="prop-texto" className="text-xs">
            {esEnvio || esProgramado ? 'Mensaje que se le va a enviar' : esDemo ? 'Indicación para la demo (opcional)' : 'Nota (opcional)'}
          </Label>
          <Textarea
            id="prop-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={esEnvio || esProgramado ? 5 : 3}
            placeholder={esEnvio || esProgramado ? 'Hola {{nombre}}, …' : esDemo ? 'Ej.: sitio de una página, foco en turnos por WhatsApp' : 'Contexto para quien lo apruebe'}
            className="text-sm"
          />
          {(esEnvio || esProgramado) && <p className="text-[11px] text-muted-foreground">Podés usar {'{{nombre}}'}, {'{{plan}}'} y {'{{precio}}'}: se resuelven con los datos del contacto.</p>}
        </div>
      </div>
    </ResponsiveModal>
  );
}
