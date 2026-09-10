'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { REJECT_REASONS, REJECT_REASON_LABELS, type RejectReason } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { ResponsiveModal } from '../skills/ResponsiveModal';

/**
 * Por qué no.
 *
 * Rechazar era un clic que borraba la fila y no dejaba nada: de 205 mensajes
 * propuestos en diez días, 84 se rechazaron y quien redacta —motor o conector—
 * volvió a escribir igual al día siguiente, porque nunca se enteró. Acá el
 * motivo se elige de un toque entre seis opciones cerradas; el texto libre es
 * opcional y sólo hace falta cuando ninguna alcanza.
 *
 * Lo que se guarda va a `result.code` de la fila y vuelve, resumido, al
 * expediente del contacto y al prompt del que escribe (`rejectionLessons`).
 */
export function MotivoRechazo({
  open,
  onOpenChange,
  titulo,
  detalle,
  confirmLabel = 'Rechazar',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  detalle?: string;
  confirmLabel?: string;
  onConfirm: (motivo: { code: RejectReason; reason?: string }) => Promise<void> | void;
}) {
  const [code, setCode] = useState<RejectReason | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cerrar = (next: boolean) => {
    if (enviando) return;
    if (!next) {
      setCode(null);
      setTexto('');
    }
    onOpenChange(next);
  };

  async function confirmar() {
    if (!code) return;
    setEnviando(true);
    try {
      await onConfirm({ code, reason: texto.trim() ? texto.trim().slice(0, 300) : undefined });
      setCode(null);
      setTexto('');
      onOpenChange(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={cerrar}
      title={titulo}
      description={detalle ?? 'Elegí por qué no va. Con eso, lo que se escriba la próxima vez no repite el error.'}
      className="sm:max-w-lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {code ? REJECT_REASON_LABELS[code] : 'Elegí un motivo'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={enviando} onClick={() => cerrar(false)}>
              Volver
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={!code || enviando} onClick={confirmar} className="gap-1.5">
              {enviando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              {confirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-2">
        {REJECT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setCode(r)}
            aria-pressed={code === r}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
              code === r
                ? 'border-destructive/60 bg-destructive/5 font-medium text-foreground'
                : 'border-border/60 text-muted-foreground hover:border-border hover:bg-muted/40',
            )}
          >
            {REJECT_REASON_LABELS[r]}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-1.5">
        <label htmlFor="motivo-rechazo-detalle" className="text-xs font-medium text-muted-foreground">
          Detalle {code === 'otro' ? '(conviene escribirlo)' : '(opcional)'}
        </label>
        <Textarea
          id="motivo-rechazo-detalle"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Qué habría que haber escrito, en una línea."
          className="text-sm"
        />
      </div>
    </ResponsiveModal>
  );
}
