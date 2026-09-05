'use client';

import { useState } from 'react';
import { Check, Loader2, PencilLine, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CrmFix } from '../../shared/crm-fix';
import { describeCrmFix } from '../../shared/crm-fix';
import { SALES_OPS_API } from './format';

type Props = {
  chatId: number;
  /** El texto de siempre: por qué el CRM está mal. */
  texto: string | null;
  /** La misma corrección en forma accionable, si la clasificación la dejó. */
  fix: CrmFix | null;
  /** Refresca la ficha después de aplicar. */
  onAplicado?: () => void;
  /** Abre la pestaña CRM, para las clasificaciones viejas que sólo tienen texto. */
  onEditar?: () => void;
};

/**
 * "CRM a corregir", con el botón que lo corrige.
 *
 * Antes esto era un párrafo: la clasificación detectaba que la etapa del embudo
 * contradecía el chat, lo escribía, y alguien tenía que leerlo, abrir la
 * pestaña CRM y repetir el cambio a mano. Se hacía casi nunca.
 *
 * Ahora la clasificación deja además la corrección estructurada y acá se ve
 * exactamente qué va a pasar antes de apretar. Lo que se aplica pasa por
 * `updateCrm`, el mismo camino que usa el editor a mano: mismas validaciones,
 * misma auditoría.
 *
 * Las clasificaciones viejas (y las que sólo describen algo que el servidor no
 * sabe tocar) no tienen `fix`: ahí el botón lleva a la pestaña CRM en vez de
 * mentir con un "Aplicar" que no haría nada.
 */
export function CrmFixCard({ chatId, texto, fix, onAplicado, onEditar }: Props) {
  const [aplicando, setAplicando] = useState(false);
  const [hecho, setHecho] = useState<string[] | null>(null);

  if (!texto && !fix) return null;

  const pasos = fix ? describeCrmFix(fix) : [];

  const aplicar = async () => {
    setAplicando(true);
    try {
      const res = await fetch(`${SALES_OPS_API}/contacts/${chatId}/crm/apply`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { applied?: string[]; skipped?: string[]; error?: string };
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      setHecho(body.applied ?? []);
      toast.success(`CRM corregido: ${(body.applied ?? []).join(' · ')}`);
      if (body.skipped?.length) toast.warning(body.skipped.join(' · '));
      onAplicado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aplicar la corrección.');
    } finally {
      setAplicando(false);
    }
  };

  if (hecho) {
    return (
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="size-3.5" aria-hidden />
          CRM corregido
        </p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hecho.join(' · ')}</p>
      </section>
    );
  }

  return (
    <section className={cn('rounded-xl border p-3', fix ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-card')}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Wrench className="size-3" aria-hidden />
        CRM a corregir
      </p>

      {texto && <p className="mt-1 text-[13px] leading-snug text-foreground">{texto}</p>}
      {!texto && fix?.reason && <p className="mt-1 text-[13px] leading-snug text-foreground">{fix.reason}</p>}

      {pasos.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {pasos.map((paso) => (
            <li key={paso} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
              {paso}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {fix ? (
          <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => void aplicar()} disabled={aplicando}>
            {aplicando ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
            Aplicar
          </Button>
        ) : null}
        {onEditar && (
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={onEditar}>
            <PencilLine className="size-3" aria-hidden />
            {fix ? 'Revisar a mano' : 'Corregir a mano'}
          </Button>
        )}
      </div>
    </section>
  );
}
