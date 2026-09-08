'use client';

import { useCallback, useState } from 'react';
import { EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { avisarIgnorado } from './eventos';
import { SALES_OPS_API } from './format';

export type ExclusionKind = 'personal' | 'equipo' | 'otros';

/**
 * Sacar a una persona del circuito, desde donde se la está mirando.
 *
 * Esto ya existía, pero sólo en lote: había que ir a Barrido o Limpieza,
 * tildar casillas y usar la barra de selección. El caso real es otro —la
 * persona aparece en Dinero o en Oportunidades, se la reconoce de un vistazo
 * como el contador o el primo, y hay que poder sacarla ahí mismo—, así que
 * este componente pone la misma acción de a uno en la fila y en la ficha.
 *
 * El motivo no es burocracia: decide en qué grupo de Limpieza queda guardada
 * y por lo tanto dónde buscarla si hubo un error. Y como marcar apurado a un
 * cliente real es la forma de perderlo, el aviso trae "Deshacer": el análisis
 * nunca se borra, devolverlo lo repone con su gate y su prioridad intactos.
 */
export const MOTIVOS: Array<{ kind: ExclusionKind; label: string; hint: string }> = [
  { kind: 'personal', label: 'Es personal', hint: 'Familia, amigos, cosas de uno. Nunca fue un cliente.' },
  { kind: 'equipo', label: 'Es del equipo', hint: 'Compañeros, otro número nuestro, grupos de trabajo.' },
  { kind: 'otros', label: 'Proveedor, prueba o spam', hint: 'No es una conversación de venta.' },
];

async function pedir(metodo: 'POST' | 'DELETE', body: Record<string, unknown>) {
  const res = await fetch(`${SALES_OPS_API}/exclusions`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(json?.error ?? `Error ${res.status}`));
  return json as { excluded?: number; audiosRemoved?: number; signalsRemoved?: number; included?: number };
}

/**
 * La acción, sin interfaz: la comparten la fila y la ficha para que las dos
 * cuenten lo mismo y las dos se puedan deshacer igual.
 *
 * `onHecho` recibe el chat que salió; quien la use decide qué hacer con la
 * pantalla (sacar la fila sin recargar, cerrar la ficha). El evento global es
 * para las listas que no participaron de la acción y siguen mostrando la fila.
 */
export function useIgnorarContacto(onHecho?: (chatId: number) => void) {
  const [ignorando, setIgnorando] = useState<number | null>(null);

  const devolver = useCallback(async (chatId: number, nombre: string) => {
    try {
      await pedir('DELETE', { chatIds: [chatId] });
      toast.success(`${nombre} vuelve al circuito comercial.`);
      avisarIgnorado(chatId, { devuelto: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo devolver el chat.');
    }
  }, []);

  const ignorar = useCallback(
    async (chatId: number, nombre: string, kind: ExclusionKind) => {
      setIgnorando(chatId);
      try {
        const body = await pedir('POST', { chatIds: [chatId], kind });
        // Marcar un chat interno suele sacar decenas de audios de la cola de
        // Gemini: decirlo es lo que hace evidente que el marcado sirvió.
        const extra = [
          body.audiosRemoved ? `${body.audiosRemoved} audios fuera de la cola` : null,
          body.signalsRemoved ? `${body.signalsRemoved} señales descartadas` : null,
        ].filter(Boolean);
        toast.success(`${nombre} ya no entra en las listas${extra.length ? ` · ${extra.join(' · ')}` : ''}.`, {
          action: { label: 'Deshacer', onClick: () => void devolver(chatId, nombre) },
          duration: 8000,
        });
        avisarIgnorado(chatId, { devuelto: false });
        onHecho?.(chatId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo sacar de las listas.');
      } finally {
        setIgnorando(null);
      }
    },
    [devolver, onHecho],
  );

  return { ignorar, devolver, ignorando };
}

/**
 * Los tres motivos como opciones de menú, para insertar en un menú que ya
 * existe (el ⋯ de la fila) sin abrir uno propio.
 */
export function ItemsIgnorar({ onElegir }: { onElegir: (kind: ExclusionKind) => void }) {
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <EyeOff className="size-3" aria-hidden />
        Sacar de las listas
      </DropdownMenuLabel>
      {MOTIVOS.map(({ kind, label, hint }) => (
        <DropdownMenuItem key={kind} title={hint} onSelect={() => onElegir(kind)}>
          {label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** El mismo menú, pero con su propio botón: para la cabecera de la ficha. */
export function MenuIgnorar({
  chatId,
  nombre,
  onHecho,
  className,
}: {
  chatId: number;
  nombre: string;
  onHecho?: (chatId: number) => void;
  className?: string;
}) {
  const { ignorar, ignorando } = useIgnorarContacto(onHecho);
  const trabajando = ignorando === chatId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={trabajando}
          title={`Sacar a ${nombre} de las listas: deja de clasificarse, de entrar al radar y de gastar transcripciones`}
          aria-label={`Sacar a ${nombre} de las listas`}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60',
            className,
          )}
        >
          {trabajando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
          <span className="hidden sm:inline">No es un cliente</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <ItemsIgnorar onElegir={(kind) => void ignorar(chatId, nombre, kind)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
