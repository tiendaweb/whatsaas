'use client';

import { useState } from 'react';
import { ExternalLink, Inbox, Loader2, Pause, Pencil, Play, Save, Sparkles, Trash2, UserSquare2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { parsearLocal } from '@/lib/time/zona';

import { GateBadge } from '../components/GateBadge';
import { SALES_OPS_API, fmtDateTime, iniciales } from '../components/format';
import type { Gate } from '../../shared/taxonomy';
import { ESTADO_CLASE, ESTADO_LABEL, borrarProgramado, cuando, estaPendiente, paraInput, patchProgramado, type ChatDeTelefono, type Programado, pasarACola } from './api';

type Borrador = { name: string; message: string; aiPrompt: string; scheduledAt: string };

/**
 * Un programado, con la edición rápida adentro.
 *
 * La corrección típica es de una línea —"cambiale la hora", "sacale el precio
 * del texto"— y hasta ahora había que salir a la app de Programados, buscarlo y
 * volver. Acá se edita donde se lo ve; lo que no se toca no se manda, así dos
 * personas mirando la misma lista no se pisan campos.
 *
 * El horario sólo se edita en los de una sola vez: cambiarle la fecha a un
 * recurrente desde una tarjeta chica es la forma más fácil de romper una
 * recurrencia sin darse cuenta.
 */
export function TarjetaProgramado({
  item,
  onCambio,
  onOpen,
  destino,
  compacta,
}: {
  item: Programado;
  onCambio: () => void;
  /** Abre la ficha del contacto del Command Center. */
  onOpen?: (chatId: number) => void;
  /** Chat al que apunta el programado, ya resuelto por teléfono. */
  destino?: ChatDeTelefono | null;
  /** En Semana y Calendario el espacio es poco: sólo el título y la hora. */
  compacta?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  /** Editor chico: sólo el prompt. Distinto de editar el mensaje entero. */
  const [prompteando, setPrompteando] = useState(false);
  const [promptSuelto, setPromptSuelto] = useState(item.aiPrompt ?? '');
  const [guardandoPrompt, setGuardandoPrompt] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [reescribiendo, setReescribiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** La reescritura falló (casi siempre por cuota): se ofrece dejarla en cola. */
  const [fallo, setFallo] = useState(false);
  const [encolando, setEncolando] = useState(false);

  const abrirEdicion = () => {
    setError(null);
    setBorrador({
      name: item.name,
      message: item.message ?? '',
      aiPrompt: item.aiPrompt ?? '',
      scheduledAt: paraInput(item.scheduledAt ?? item.nextRunAt),
    });
    setEditando(true);
  };

  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    setError(null);
    try {
      // Con prompt, el programado deja de serlo: se convierte en pedido en la cola.
      if (borrador.aiPrompt.trim().length >= 5) {
        await pasarACola(item.id, borrador.aiPrompt.trim());
        setEditando(false);
        setBorrador(null);
        onCambio();
        toast.success('Pasó a la cola como pedido para el conector. Ya no figura en Programados.');
        return;
      }
      const cuerpo: Record<string, unknown> = {
        name: borrador.name.trim() || item.name,
        message: borrador.message.trim(),
        aiPrompt: null,
      };
      if (item.scheduleType === 'once' && borrador.scheduledAt) {
        cuerpo.scheduleType = 'once';
        // Hora del negocio, no la del navegador (una IA en Chrome corre en UTC).
        cuerpo.scheduledAt = parsearLocal(borrador.scheduledAt)?.toISOString() ?? null;
      }
      await patchProgramado(item.id, cuerpo);
      setEditando(false);
      setBorrador(null);
      onCambio();
      toast.success('Programado actualizado.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  /** Reescribe el texto con el prompt guardado. No guarda: lo deja para revisar. */
  const reescribir = async () => {
    if (!borrador || borrador.aiPrompt.trim().length < 5) {
      setError('Escribí primero qué tiene que hacer la IA con el mensaje (mínimo 5 caracteres).');
      return;
    }
    setReescribiendo(true);
    setError(null);
    setFallo(false);
    try {
      const res = await fetch(`${SALES_OPS_API}/scheduled/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: borrador.aiPrompt.trim(), message: borrador.message, chatId: null, name: item.name }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(cuerpo?.error ?? `Error ${res.status}`));
      setBorrador((actual) => (actual ? { ...actual, message: String(cuerpo.message ?? '') } : actual));
      toast.success('Texto reescrito. Revisalo y guardá.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reescribir.');
      setFallo(true);
    } finally {
      setReescribiendo(false);
    }
  };

  const encolarPedido = async () => {
    if (!borrador) return;
    setEncolando(true);
    try {
      await pasarACola(item.id, borrador.aiPrompt.trim());
      setFallo(false);
      setError(null);
      setEditando(false);
      setBorrador(null);
      onCambio();
      toast.success('Pasó a la cola como pedido para el conector. Ya no figura en Programados.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setEncolando(false);
    }
  };

  /**
   * Le pone un prompt al programado y saca el texto fijo.
   *
   * Si quedaran los dos, el que sale es el texto viejo: la IA no reescribe sola
   * y el prompt no es más que una nota al pie. Sacándolo, lo que le llegue al
   * cliente va a ser lo que escriba el conector — y por eso se encola en el
   * mismo movimiento, para que no quede un programado sin nada para enviar.
   */
  const guardarPrompt = async () => {
    const limpio = promptSuelto.trim();
    if (limpio.length < 5) {
      toast.error('Escribí qué tiene que decir el mensaje (mínimo 5 caracteres).');
      return;
    }
    setGuardandoPrompt(true);
    try {
      await pasarACola(item.id, limpio);
      setPrompteando(false);
      onCambio();
      toast.success('Pasó a la cola como pedido para el conector. Ya no figura en Programados.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el prompt.');
    } finally {
      setGuardandoPrompt(false);
    }
  };

  const cambiarEstado = async (status: 'active' | 'paused') => {
    try {
      await patchProgramado(item.id, { status });
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    }
  };

  const eliminar = async () => {
    if (!window.confirm(`¿Borrar el programado “${item.name}”?`)) return;
    try {
      await borrarProgramado(item.id);
      onCambio();
      toast.success('Programado borrado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.');
    }
  };

  if (editando && borrador) {
    return (
      <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Editando</span>
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => setEditando(false)} aria-label="Cerrar">
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
        <Input value={borrador.name} onChange={(e) => setBorrador({ ...borrador, name: e.target.value })} className="h-8 text-xs" placeholder="Nombre" aria-label="Nombre del programado" />
        <Textarea
          value={borrador.message}
          onChange={(e) => setBorrador({ ...borrador, message: e.target.value })}
          rows={3}
          className="resize-none text-xs"
          placeholder="Mensaje que le va a llegar"
          aria-label="Mensaje que le va a llegar"
        />
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-background p-2">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3" aria-hidden />
            Prompt para reescribirlo
          </label>
          <Textarea
            value={borrador.aiPrompt}
            onChange={(e) => setBorrador({ ...borrador, aiPrompt: e.target.value })}
            rows={2}
            aria-label="Prompt para reescribir el mensaje"
            className="resize-none text-xs"
            placeholder="Ej.: tono cercano, máximo 3 líneas, cerrá con una sola pregunta."
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Se guarda con el programado.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              disabled={reescribiendo || borrador.aiPrompt.trim().length < 5}
              onClick={() => void reescribir()}
            >
              {reescribiendo ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Wand2 className="size-3" aria-hidden />}
              Reescribir con IA
            </Button>
          </div>
        </div>
        {item.scheduleType === 'once' ? (
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cuándo</span>
            <Input
              type="datetime-local"
              value={borrador.scheduledAt}
              onChange={(e) => setBorrador({ ...borrador, scheduledAt: e.target.value })}
              className="h-8 text-xs"
            />
          </label>
        ) : (
          <p className="text-[11px] text-muted-foreground">Es recurrente: acá se corrige el texto. El horario se cambia en la app de Programados.</p>
        )}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
        {fallo && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full gap-1.5 text-[11px]"
            disabled={encolando || borrador.aiPrompt.trim().length < 5}
            onClick={() => void encolarPedido()}
          >
            {encolando ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Inbox className="size-3" aria-hidden />}
            Dejarlo en la cola de conectores
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 flex-1 text-xs" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" className="h-8 flex-1 gap-1.5 text-xs" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  if (compacta) {
    return (
      <button
        type="button"
        onClick={abrirEdicion}
        className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-left transition-colors hover:bg-muted"
        title={item.message ?? item.name}
      >
        <span className="flex items-center gap-1">
          <span className={cn('size-1.5 shrink-0 rounded-full', item.status === 'active' ? 'bg-emerald-500' : item.status === 'paused' ? 'bg-amber-500' : item.status === 'failed' ? 'bg-destructive' : 'bg-muted-foreground/40')} />
          <span className="truncate text-[11px] font-medium">{destino?.name ?? item.name}</span>
          {item.aiPrompt && <Wand2 className="size-3 shrink-0 text-primary" aria-label="Se reescribe con IA antes de salir" />}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {item.hour != null ? `${String(item.hour).padStart(2, '0')}:${String(item.minute ?? 0).padStart(2, '0')} · ` : ''}
          {item.targetNumbers?.length ?? 0} destino{(item.targetNumbers?.length ?? 0) === 1 ? '' : 's'}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        {/* La cara y el nombre del contacto mandan: el `name` del programado es
            una etiqueta interna ("Misión G0-G3 1/9 · 13:27") que sirve para
            buscarlo, no para reconocer a quién le va a llegar. */}
        {destino && (
          <button
            type="button"
            onClick={() => onOpen?.(destino.chatId)}
            title={`Abrir la ficha de ${destino.name}`}
            className="shrink-0"
            aria-label={`Abrir la ficha de ${destino.name}`}
          >
            <Avatar className="size-9">
              {destino.avatarUrl && <AvatarImage src={destino.avatarUrl} alt="" />}
              <AvatarFallback className="text-[11px]">{iniciales(destino.name)}</AvatarFallback>
            </Avatar>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {destino ? (
              <>
                <span className="truncate text-sm font-semibold text-foreground">{destino.name}</span>
                {destino.gate && <GateBadge gate={destino.gate as Gate} />}
              </>
            ) : (
              <span className="truncate text-sm font-semibold">{item.name}</span>
            )}
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', ESTADO_CLASE[item.status])}>{ESTADO_LABEL[item.status]}</span>
            {/* Que tenga prompt cambia lo que va a salir: el texto de hoy no es
                necesariamente el que le llega al cliente, porque antes lo
                reescribe la IA. Por eso se marca en la lista y no sólo adentro
                del editor. */}
            {item.aiPrompt && (
              <span
                className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                title={`Se reescribe con IA antes de salir:\n${item.aiPrompt}`}
              >
                <Wand2 className="size-2.5" aria-hidden />
                con prompt
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {cuando(item, fmtDateTime)}
            {destino ? ` · ${item.name}` : item.targetNumbers?.length ? ` · ${item.targetNumbers.length} destino${item.targetNumbers.length === 1 ? '' : 's'}` : ''}
            {item.runCount > 0 ? ` · ${item.runCount} envío${item.runCount === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {estaPendiente(item) && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              title={item.status === 'active' ? 'Pausar' : 'Activar'}
              aria-label={`${item.status === 'active' ? 'Pausar' : 'Activar'} ${item.name}`}
              onClick={() => void cambiarEstado(item.status === 'active' ? 'paused' : 'active')}
            >
              {item.status === 'active' ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            </Button>
          )}
          {item.actionType === 'message' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-7', item.aiPrompt && 'text-primary')}
              title={item.aiPrompt ? 'Cambiar el prompt con el que se escribe' : 'Que lo escriba la IA: agregarle un prompt'}
              aria-label={`${item.aiPrompt ? 'Cambiar el prompt de' : 'Escribir con IA'} ${item.name}`}
              onClick={() => {
                setPromptSuelto(item.aiPrompt ?? '');
                setPrompteando((v) => !v);
              }}
            >
              <Wand2 className="size-3.5" aria-hidden />
            </Button>
          )}
          {item.actionType === 'message' && (
            <Button type="button" variant="ghost" size="icon" className="size-7" title="Editar el mensaje" aria-label={`Editar el mensaje de ${item.name}`} onClick={abrirEdicion}>
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" title="Borrar" aria-label={`Borrar ${item.name}`} onClick={() => void eliminar()}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
          {/* "Abrir" es la ficha del contacto, no la app de Programados: desde
              acá lo que se quiere es ver a quién le va a llegar esto y en qué
              está. Si el teléfono no coincide con ningún chat del equipo queda
              el link a la app, que es lo único que se puede ofrecer. */}
          {destino && onOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              title={`Abrir la ficha de ${destino.name}`}
              onClick={() => onOpen(destino.chatId)}
            >
              <UserSquare2 className="size-3.5" aria-hidden />
              Abrir
            </Button>
          ) : (
            <a
              href="/plugins/scheduled-messages"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Sin chat conocido para este número · abrir en Programados"
              aria-label={`Abrir ${item.name} en Programados`}
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
      {item.message ? (
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.message}</p>
      ) : item.aiPrompt ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs italic leading-relaxed text-primary">
          <Wand2 className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="line-clamp-3">Sin texto fijo: lo escribe el conector con «{item.aiPrompt}»</span>
        </p>
      ) : null}

      {prompteando && (
        <div className="mt-2 space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Wand2 className="size-3" aria-hidden />
            Que lo escriba la IA
          </label>
          <Textarea
            value={promptSuelto}
            onChange={(e) => setPromptSuelto(e.target.value)}
            rows={3}
            aria-label="Prompt para que lo escriba la IA"
            className="resize-none text-xs"
            placeholder="Ej.: recordale la seña sin repetir el precio, tono cercano, máximo 3 líneas, cerrá con una sola pregunta."
          />
          <p className="text-[10px] text-muted-foreground">
            Al guardar se borra el texto fijo y queda encolado: lo escribe el próximo conector y lo guarda en el programado.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-7 flex-1 text-[11px]" onClick={() => setPrompteando(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 gap-1.5 text-[11px]"
              disabled={guardandoPrompt || promptSuelto.trim().length < 5}
              onClick={() => void guardarPrompt()}
            >
              {guardandoPrompt ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Inbox className="size-3" aria-hidden />}
              Guardar y encolar
            </Button>
          </div>
        </div>
      )}
      {item.status === 'failed' && item.lastError && <p className="mt-1.5 text-[11px] text-destructive">{item.lastError}</p>}
    </div>
  );
}
