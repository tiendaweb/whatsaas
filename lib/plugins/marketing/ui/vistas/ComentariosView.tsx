'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  EyeOff,
  Facebook,
  Instagram,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Send,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { BandejaComentarios, ComentarioRow, EstadoComentario } from '../../server/comentarios';
import { MARKETING_API, fetcher, fmtInt } from '../componentes/format';

const ESTADOS: Array<{ id: EstadoComentario | 'todos'; label: string }> = [
  { id: 'nuevo', label: 'Sin responder' },
  { id: 'respondido', label: 'Respondidos' },
  { id: 'ignorado', label: 'Ignorados' },
  { id: 'oculto', label: 'Ocultos' },
  { id: 'todos', label: 'Todos' },
];

/** Hace cuánto, en una palabra. La fecha exacta está en el title. */
function hace(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias < 60 ? `hace ${dias} días` : `hace ${Math.round(dias / 30)} meses`;
}

/**
 * Comentarios de Facebook e Instagram, contestados desde acá.
 *
 * Publicar ya se hacía desde WhatsPro; enterarse de que alguien preguntó el
 * precio abajo del posteo, no: había que entrar a cada red, iniciar sesión y
 * verificar la cuenta para leer tres comentarios. Esta bandeja usa el MISMO
 * token que ya conectó el publicador —ninguna cuenta nueva, ninguna
 * verificación más— y responde en el hilo real: lo que se escribe acá aparece
 * publicado como la página.
 *
 * Lo que NO hace, a propósito: no contesta sola. La IA puede redactar desde el
 * conector, pero publicar es siempre un acto de una persona, igual que un
 * envío de WhatsApp.
 */
export function ComentariosView() {
  const [estado, setEstado] = useState<EstadoComentario | 'todos'>('nuevo');
  const [sincronizando, setSincronizando] = useState(false);
  const [respondiendo, setRespondiendo] = useState<number | null>(null);
  const [borradores, setBorradores] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState<number | null>(null);

  const clave = `${MARKETING_API}/comentarios?status=${estado}&limit=200`;
  const { data, error, isLoading, mutate } = useSWR<BandejaComentarios>(clave, fetcher, { refreshInterval: 120_000 });

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(`${MARKETING_API}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(json?.error ?? `Error ${res.status}`));
    return json;
  }, []);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = (await post({ action: 'sync' })) as { nuevos: number; actualizados: number; errores: Array<{ cuenta: string; error: string }> };
      await mutate();
      if (r.errores?.length) toast.warning(`${r.errores[0].cuenta}: ${r.errores[0].error}`);
      toast.success(r.nuevos ? `${r.nuevos} comentario${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'}.` : 'Sin comentarios nuevos.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sincronizar.');
    } finally {
      setSincronizando(false);
    }
  }, [post, mutate]);

  const responder = useCallback(
    async (row: ComentarioRow, privado = false) => {
      const texto = (borradores[row.id] ?? '').trim();
      if (!texto) return;
      setRespondiendo(row.id);
      try {
        await post({ action: 'responder', id: row.id, texto, privado });
        setBorradores((b) => ({ ...b, [row.id]: '' }));
        await mutate();
        toast.success(privado ? 'Respuesta enviada por privado.' : 'Respuesta publicada.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo responder.');
      } finally {
        setRespondiendo(null);
      }
    },
    [borradores, post, mutate],
  );

  const marcar = useCallback(
    async (row: ComentarioRow, status: EstadoComentario) => {
      setOcupado(row.id);
      try {
        await post({ action: 'marcar', id: row.id, status });
        await mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo marcar.');
      } finally {
        setOcupado(null);
      }
    },
    [post, mutate],
  );

  const ocultar = useCallback(
    async (row: ComentarioRow, oculto: boolean) => {
      setOcupado(row.id);
      try {
        await post({ action: 'ocultar', id: row.id, oculto });
        await mutate();
        toast.success(oculto ? 'Oculto en la red.' : 'Visible otra vez.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo cambiar.');
      } finally {
        setOcupado(null);
      }
    },
    [post, mutate],
  );

  const sinCuentas = (data?.cuentas.length ?? 0) === 0;
  const conProblema = useMemo(() => (data?.cuentas ?? []).filter((c) => c.status !== 'active'), [data?.cuentas]);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-5 text-primary" aria-hidden />
            <h2 className="text-base font-semibold">Comentarios</h2>
            {data && (
              <span className="text-xs text-muted-foreground">
                {fmtInt(data.conteos.nuevo)} sin responder
                {data.ultimaSync ? ` · actualizado ${hace(data.ultimaSync)}` : ''}
              </span>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={sincronizar} disabled={sincronizando || sinCuentas}>
            {sincronizando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            Buscar nuevos
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEstado(e.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                estado === e.id ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted',
              )}
            >
              {e.label}
              {data && e.id !== 'todos' && data.conteos[e.id as EstadoComentario] > 0 && (
                <span className="ml-1.5 tabular-nums opacity-70">{data.conteos[e.id as EstadoComentario]}</span>
              )}
            </button>
          ))}
        </div>

        {conProblema.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50/60 p-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {conProblema.map((c) => c.nombre).join(', ')}: el token venció. Reconectá la cuenta en Publicaciones › Cuentas — una sola vez, y no
              hay que volver a verificar nada.
            </span>
          </p>
        )}
      </header>

      {sinCuentas && !isLoading ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <p>No hay cuentas de Facebook ni Instagram conectadas.</p>
          <p className="mt-1">
            Conectalas una vez en{' '}
            <a href="/plugins/social-publisher/settings" className="underline underline-offset-2">
              Publicaciones › Cuentas
            </a>{' '}
            y los comentarios entran solos acá.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{String(error.message ?? error)}</div>
      ) : isLoading && !data ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Cargando comentarios…
        </div>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {estado === 'nuevo' ? 'No hay comentarios sin responder. Tocá «Buscar nuevos» para traer lo último.' : 'Nada por acá.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data!.rows.map((row) => (
            <li key={row.id} className={cn('rounded-xl border p-3', row.status === 'nuevo' ? 'border-border bg-card' : 'border-border/50 bg-muted/20')}>
              <div className="flex items-start gap-2">
                {row.platform === 'instagram' ? (
                  <Instagram className="mt-0.5 size-4 shrink-0 text-pink-600 dark:text-pink-400" aria-hidden />
                ) : (
                  <Facebook className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{row.autor ?? 'Alguien'}</span>
                    <span title={row.creadoEn ?? ''}>{hace(row.creadoEn)}</span>
                    <span>· {row.cuenta}</span>
                    {row.parentExternalId && <span className="rounded-full bg-muted px-1.5">respuesta en el hilo</span>}
                    {row.oculto && <span className="rounded-full bg-muted px-1.5">oculto</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{row.mensaje || <em className="text-muted-foreground">(sin texto)</em>}</p>
                  {row.postExcerpt && (
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                      En: {row.postExcerpt}
                      {row.postPermalink && (
                        <a href={row.postPermalink} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline underline-offset-2">
                          ver <ExternalLink className="size-3" aria-hidden />
                        </a>
                      )}
                    </p>
                  )}
                  {row.respuesta && (
                    <p className="mt-2 rounded-lg border-l-2 border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs">
                      <span className="font-medium">Respondimos</span> {hace(row.respondidoEn)}: {row.respuesta}
                    </p>
                  )}
                </div>
              </div>

              {row.status !== 'respondido' && (
                <div className="mt-2.5 flex flex-col gap-2">
                  <Textarea
                    value={borradores[row.id] ?? ''}
                    onChange={(e) => setBorradores((b) => ({ ...b, [row.id]: e.target.value }))}
                    placeholder="Escribí la respuesta. Sale publicada como la página."
                    rows={2}
                    className="text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={respondiendo === row.id || !(borradores[row.id] ?? '').trim()}
                      onClick={() => void responder(row)}
                    >
                      {respondiendo === row.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                      Responder
                    </Button>
                    {row.platform === 'facebook_page' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={respondiendo === row.id || !(borradores[row.id] ?? '').trim()}
                        onClick={() => void responder(row, true)}
                        title="Le llega por Messenger, no debajo de la publicación. Una sola vez por comentario."
                      >
                        Por privado
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5"
                      disabled={ocupado === row.id}
                      onClick={() => void marcar(row, 'ignorado')}
                    >
                      <Check className="size-3.5" aria-hidden />
                      Ignorar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-muted-foreground"
                      disabled={ocupado === row.id}
                      onClick={() => void ocultar(row, !row.oculto)}
                      title={row.oculto ? 'Volver a mostrarlo en la red' : 'Ocultarlo en la red (nadie más lo ve)'}
                    >
                      {row.oculto ? <Undo2 className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                      {row.oculto ? 'Mostrar' : 'Ocultar'}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
