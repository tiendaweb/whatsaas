'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, Clock, Inbox, Loader2, Pause, Play, Plus, Save, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { PROGRAMADOS_API as API, programadosFetcher } from '@/lib/plugins/scheduled-messages/ui/swr';
import { SALES_OPS_API, fmtDateTime } from './format';
import { pasarACola } from '../programados/api';
import { avisarEncolado } from './eventos';

/**
 * Mensajes programados del contacto, dentro de la pestaña Chat de la ficha.
 *
 * Vivían sólo en el plugin de Programados, que lista los de todo el equipo: para
 * saber qué le va a salir a ESTE contacto había que salir del Command Center,
 * abrir el otro plugin y buscar el número a mano — y mientras tanto se le
 * contestaba sin saber que en dos horas le llegaba otro mensaje nuestro. Acá se
 * ven, se editan, se pausan y se crean ya apuntados a su teléfono.
 *
 * Si el plugin está apagado para el equipo (o el usuario no tiene el permiso),
 * la sección no se dibuja: no tiene sentido ofrecer un formulario que va a
 * fallar al guardar.
 */

type Programado = {
  id: number;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  targetNumbers: string[];
  scheduleType: 'once' | 'daily' | 'weekly';
  scheduledAt: string | null;
  hour: number | null;
  minute: number | null;
  weekdays: number[];
  actionType: 'message' | 'automation';
  message: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  lastError: string | null;
  /** Prompt guardado para reescribir este mensaje con la IA del equipo. */
  aiPrompt: string | null;
};

type Respuesta = { disponible: boolean; rows: Programado[] };

const ESTADO_LABEL: Record<Programado['status'], string> = {
  active: 'Activo',
  paused: 'Pausado',
  completed: 'Enviado',
  failed: 'Falló',
};

const ESTADO_CLASE: Record<Programado['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-600',
  paused: 'bg-amber-500/15 text-amber-600',
  completed: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/15 text-destructive',
};

const DIAS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

/**
 * Cuántos días queda a la vista un programado ya enviado.
 *
 * El que salió hace un rato importa —te dice qué acaba de recibir el contacto
 * antes de que le escribas— pero pasada esa ventana es archivo: acá se juntaban
 * decenas de "Enviado" viejos y tapaban los dos que todavía van a salir. No se
 * borra nada: sigue en la app de Programados.
 */
const DIAS_VISIBLES_ENVIADOS = 3;

/** El programado guarda teléfonos sueltos; la ficha tiene un JID. */
function soloDigitos(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

/** `datetime-local` quiere hora local sin zona; `toISOString` da UTC. */
function paraInput(iso: string | null) {
  if (!iso) return '';
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return '';
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function cuando(item: Programado) {
  if (item.status === 'completed') return `Enviado ${fmtDateTime(item.lastRunAt)}`;
  const hora = item.hour != null ? `${String(item.hour).padStart(2, '0')}:${String(item.minute ?? 0).padStart(2, '0')}` : null;
  if (item.scheduleType === 'daily') return `Todos los días${hora ? ` ${hora}` : ''}`;
  if (item.scheduleType === 'weekly') {
    const dias = (item.weekdays ?? []).map((d) => DIAS[d] ?? '').filter(Boolean).join(' ');
    return `Cada semana${dias ? ` ${dias}` : ''}${hora ? ` ${hora}` : ''}`;
  }
  return `Sale ${fmtDateTime(item.scheduledAt ?? item.nextRunAt)}`;
}

type Borrador = {
  id: number | null;
  name: string;
  message: string;
  scheduledAt: string;
  /** Los recurrentes se editan en texto y horario acá no se toca. */
  scheduleType: Programado['scheduleType'];
  /**
   * Prompt con el que se reescribe el mensaje.
   *
   * Se guarda con el programado en vez de pedirse cada vez: la indicación
   * ("recordale la seña, tono corto, no repitas el precio") es tan parte del
   * mensaje como el texto, y volver a tipearla en cada corrección es lo que
   * hacía que nadie usara la IA acá.
   */
  aiPrompt: string;
};

export function ProgramadosContacto({
  remoteJid,
  nombre,
  chatId,
  inicialAbierto = false,
  avisarSinPermiso = false,
  soloSiHay = false,
  borradorExterno = null,
  onCambio,
}: {
  remoteJid: string | null;
  nombre: string;
  /** Con el chat, la IA lee el historial antes de reescribir el mensaje. */
  chatId?: number | null;
  /** En el modal la lista arranca desplegada: es lo único que hay para ver. */
  inicialAbierto?: boolean;
  /** En el modal, si no hay permiso hay que decirlo; en el panel se oculta y ya. */
  avisarSinPermiso?: boolean;
  /**
   * En el Resumen sólo se dibuja si el contacto tiene programados: un bloque
   * que dice "ninguno" en cada ficha es ruido en la pantalla que más se mira.
   */
  soloSiHay?: boolean;
  /**
   * Texto que llega de afuera para editar acá (el Focus, con lo que devolvió
   * "Ejecutar ahora"). `token` cambia en cada pedido: sin él, pedir dos veces el
   * mismo texto no reabriría el editor, y con `texto` en las dependencias
   * cualquier re-render lo pisaría mientras la persona lo está corrigiendo.
   */
  borradorExterno?: { texto: string; token: number } | null;
  /** Se llama después de crear, editar, pausar o borrar (para refrescar la lista). */
  onCambio?: () => void;
}) {
  const { data, isLoading, mutate } = useSWR<Respuesta>(API, programadosFetcher<Programado>, { revalidateOnFocus: false });

  const [abierto, setAbierto] = useState(inicialAbierto);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [reescribiendo, setReescribiendo] = useState(false);
  /** La reescritura falló (casi siempre por cuota): se ofrece dejarla en cola. */
  const [fallo, setFallo] = useState(false);
  const [encolando, setEncolando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const telefono = soloDigitos((remoteJid ?? '').split('@')[0]);

  const propios = useMemo(() => {
    if (!telefono) return [];
    const corte = Date.now() - DIAS_VISIBLES_ENVIADOS * 86_400_000;
    return (data?.rows ?? [])
      .filter((item) => (item.targetNumbers ?? []).some((numero) => soloDigitos(numero) === telefono))
      .filter((item) => {
        // Los fallidos se quedan aunque sean viejos: son los que hay que mirar.
        if (item.status !== 'completed') return true;
        const enviado = item.lastRunAt ? Date.parse(item.lastRunAt) : NaN;
        // Enviado sin fecha: no hay forma de decir que sea reciente.
        return Number.isFinite(enviado) && enviado >= corte;
      })
      .sort((a, b) => (a.nextRunAt ?? '') < (b.nextRunAt ?? '') ? -1 : 1);
  }, [data?.rows, telefono]);

  const pendientes = propios.filter((item) => item.status === 'active' || item.status === 'paused');
  const proximo = pendientes.find((item) => item.status === 'active')?.nextRunAt ?? null;

  /**
   * El texto que redactó la IA desde afuera entra como borrador.
   *
   * Si ya hay un editor abierto, le cambia el mensaje y respeta lo demás (el
   * nombre y la fecha que la persona ya eligió). Si no, edita el primer
   * programado vivo del contacto —corregir el que va a salir es el caso normal—
   * y sólo crea uno nuevo cuando no hay ninguno.
   */
  const tokenAplicado = useRef<number | null>(null);
  useEffect(() => {
    const texto = borradorExterno?.texto?.trim();
    if (!texto || !borradorExterno) return;
    if (tokenAplicado.current === borradorExterno.token) return;
    tokenAplicado.current = borradorExterno.token;
    setAbierto(true);
    setError(null);
    setBorrador((actual) => {
      if (actual) return { ...actual, message: texto };
      const vivo = pendientes[0];
      if (vivo) {
        return {
          id: vivo.id,
          name: vivo.name,
          message: texto,
          scheduledAt: paraInput(vivo.scheduledAt ?? vivo.nextRunAt),
          scheduleType: vivo.scheduleType,
          aiPrompt: vivo.aiPrompt ?? '',
        };
      }
      return { id: null, name: `Seguimiento a ${nombre}`.slice(0, 200), message: texto, scheduledAt: '', scheduleType: 'once', aiPrompt: '' };
    });
  }, [borradorExterno, pendientes, nombre]);

  if (data && !data.disponible) {
    return avisarSinPermiso ? (
      <p className="text-sm text-muted-foreground">No tenés permiso para ver los mensajes programados del equipo.</p>
    ) : null;
  }
  if (!data || !telefono) return null;
  if (soloSiHay && propios.length === 0 && !borrador) return null;

  const abrirNuevo = () => {
    setAbierto(true);
    setError(null);
    setBorrador({ id: null, name: `Seguimiento a ${nombre}`.slice(0, 200), message: '', scheduledAt: '', scheduleType: 'once', aiPrompt: '' });
  };

  /**
   * Sin fecha se puede guardar: queda como "a coordinar" y no sale hasta que
   * alguien le ponga día (el cron sólo toma los que tienen `next_run_at`). Es
   * lo que hace falta para dejar el texto listo y arreglar el momento después.
   */
  const completo = (b: Borrador) => Boolean(b.name.trim() && (b.message.trim() || b.aiPrompt.trim().length >= 5));

  const guardar = async () => {
    if (!borrador || !completo(borrador)) return;
    setGuardando(true);
    setError(null);
    try {
      // Los recurrentes se crearon en el plugin de Programados: acá se corrige
      // el texto y el nombre, y el horario se deja como está para no romper una
      // recurrencia sin querer.
      const cuerpo: Record<string, unknown> = {
        name: borrador.name.trim(),
        message: borrador.message.trim(),
        actionType: 'message',
        targetNumbers: [telefono],
        aiPrompt: borrador.aiPrompt.trim() || null,
      };
      if (borrador.scheduleType === 'once') {
        cuerpo.scheduleType = 'once';
        cuerpo.scheduledAt = borrador.scheduledAt ? new Date(borrador.scheduledAt).toISOString() : null;
      }
      const res = await fetch(borrador.id ? `${API}/${borrador.id}` : API, {
        method: borrador.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(borrador.id ? cuerpo : { ...cuerpo, status: 'active' }),
      });
      if (!res.ok) {
        const detalle = await res.json().catch(() => null);
        throw new Error(typeof detalle?.error === 'string' ? detalle.error : 'No se pudo guardar el programado.');
      }
      // Con prompt, el programado deja de serlo: pasa a la cola como pedido para el conector.
      if (borrador.aiPrompt.trim().length >= 5) {
        const guardado = (await res.json().catch(() => null)) as { id?: number } | null;
        const id = borrador.id ?? guardado?.id;
        if (id) await pasarACola(id, borrador.aiPrompt.trim());
      }
      setBorrador(null);
      avisarEncolado(chatId);
      await mutate();
      onCambio?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el programado.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (item: Programado, status: 'active' | 'paused') => {
    await fetch(`${API}/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await mutate();
    onCambio?.();
  };

  const eliminar = async (item: Programado) => {
    if (!window.confirm(`¿Borrar el programado “${item.name}”?`)) return;
    await fetch(`${API}/${item.id}`, { method: 'DELETE' });
    await mutate();
    onCambio?.();
  };

  /**
   * Reescribe el texto con el prompt guardado.
   *
   * No guarda: deja el resultado en el textarea para que la persona lo lea y
   * decida. Un mensaje programado sale solo dentro de dos días; que la IA lo
   * cambie sin que nadie lo mire es exactamente lo que no se quiere.
   */
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
        body: JSON.stringify({ prompt: borrador.aiPrompt.trim(), message: borrador.message, chatId: chatId ?? null, name: nombre }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(cuerpo?.error ?? `Error ${res.status}`));
      setBorrador((actual) => (actual ? { ...actual, message: String(cuerpo.message ?? '') } : actual));
      toast.success('Texto reescrito. Revisalo y guardá.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reescribir el mensaje.');
      // Sin cuota de IA del equipo la salida es el conector, no reintentar.
      setFallo(true);
    } finally {
      setReescribiendo(false);
    }
  };

  /** Deja la misma reescritura en la cola para que la haga un conector. */
  const encolarPedido = async () => {
    if (!borrador?.id) {
      setError('Guardá primero el programado: el conector necesita saber cuál reescribir.');
      return;
    }
    setEncolando(true);
    try {
      await pasarACola(borrador.id, borrador.aiPrompt.trim());
      setFallo(false);
      setError(null);
      setBorrador(null);
      avisarEncolado(chatId);
      await mutate();
      onCambio?.();
      toast.success('Pasó a la cola como pedido para el conector. Ya no figura en Programados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo encolar.');
    } finally {
      setEncolando(false);
    }
  };

  /**
   * Función y no componente: un componente definido acá adentro cambia de
   * identidad en cada render y React lo remonta, así el input perdería el foco
   * a cada tecla.
   */
  const formulario = (key: string) =>
    borrador ? (
      <div key={key} className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {borrador.id ? 'Editando programado' : 'Nuevo programado'}
          </span>
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => setBorrador(null)} aria-label="Cerrar">
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
        <Input
          value={borrador.name}
          onChange={(event) => setBorrador({ ...borrador, name: event.target.value })}
          placeholder="Nombre (para encontrarlo después)"
          className="h-8 text-xs"
        />
        <Textarea
          value={borrador.message}
          onChange={(event) => setBorrador({ ...borrador, message: event.target.value })}
          placeholder="Mensaje que le va a llegar"
          rows={3}
          className="resize-none text-xs"
        />

        {/* El prompt queda guardado con el programado: la próxima corrección
            usa las mismas reglas sin volver a escribirlas. */}
        <div className="space-y-1.5 rounded-lg border border-border/70 bg-background p-2">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3" aria-hidden />
            Prompt para reescribirlo
          </label>
          <Textarea
            value={borrador.aiPrompt}
            onChange={(event) => setBorrador({ ...borrador, aiPrompt: event.target.value })}
            placeholder="Ej.: recordale la seña sin repetir el precio, tono cercano, máximo 3 líneas, cerrá con una sola pregunta."
            rows={2}
            className="resize-none text-xs"
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
        {borrador.scheduleType === 'once' ? (
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cuándo</span>
            <Input
              type="datetime-local"
              value={borrador.scheduledAt}
              onChange={(event) => setBorrador({ ...borrador, scheduledAt: event.target.value })}
              className="h-8 text-xs"
            />
          </label>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Es un programado recurrente: acá se corrige el texto. El horario se cambia en la app de Programados.
          </p>
        )}
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
        {fallo ? (
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
        ) : null}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 flex-1 text-xs" onClick={() => setBorrador(null)}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1 gap-1.5 text-xs"
            disabled={guardando || !completo(borrador)}
            onClick={() => void guardar()}
          >
            {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
            Guardar
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className="shrink-0 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {abierto ? <ChevronDown className="size-3.5 shrink-0" aria-hidden /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span className="font-semibold uppercase tracking-wide">Programados</span>
          {pendientes.length > 0 ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{pendientes.length}</span>
          ) : (
            <span className="text-[11px]">ninguno</span>
          )}
          {!abierto && proximo ? <span className="truncate text-[11px]">· próximo {fmtDateTime(proximo)}</span> : null}
          {isLoading ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        </button>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={abrirNuevo}>
          <Plus className="size-3.5" aria-hidden />
          Nuevo
        </Button>
      </div>

      {abierto || borrador ? (
        <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
          {propios.length === 0 && !borrador ? (
            <p className="text-xs text-muted-foreground">No hay mensajes programados para este contacto.</p>
          ) : null}

          {propios.map((item) =>
            // El formulario reemplaza a la tarjeta que se está editando. Antes
            // se dibujaba siempre al final de la lista: parecía un segundo
            // programado abriéndose abajo y no se veía qué se estaba tocando.
            borrador && borrador.id === item.id ? (
              formulario(`edit-${item.id}`)
            ) : (
              <div key={item.id} className="rounded-lg border border-border/60 bg-background px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-foreground">{item.name}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', ESTADO_CLASE[item.status])}>
                        {ESTADO_LABEL[item.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {cuando(item)}
                      {item.aiPrompt ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary" title={item.aiPrompt}>
                          <Sparkles className="size-2.5" aria-hidden />
                          con prompt
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {(item.status === 'active' || item.status === 'paused') && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title={item.status === 'active' ? 'Pausar' : 'Activar'}
                        onClick={() => void cambiarEstado(item, item.status === 'active' ? 'paused' : 'active')}
                      >
                        {item.status === 'active' ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                      </Button>
                    )}
                    {item.actionType === 'message' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          setError(null);
                          setBorrador({
                            id: item.id,
                            name: item.name,
                            message: item.message ?? '',
                            scheduledAt: paraInput(item.scheduledAt ?? item.nextRunAt),
                            scheduleType: item.scheduleType,
                            aiPrompt: item.aiPrompt ?? '',
                          });
                        }}
                      >
                        Editar
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      title="Eliminar"
                      onClick={() => void eliminar(item)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
                {item.message ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.message}</p>
                ) : null}
                {item.status === 'failed' && item.lastError ? (
                  <p className="mt-1.5 text-[11px] text-destructive">{item.lastError}</p>
                ) : null}
              </div>
            ),
          )}

          {/* El de "Nuevo" es el único que va al final: todavía no tiene lugar propio. */}
          {borrador && borrador.id === null ? formulario('nuevo') : null}
        </div>
      ) : null}
    </div>
  );
}
