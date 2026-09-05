'use client';

import { useState } from 'react';
import { Inbox, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { avisarEncolado } from '../components/eventos';
import { dejarParaConector } from './api';
import { componerPedido } from './acciones';
import { useCapacidades } from './useCapacidades';

/**
 * Mandar otro pedido sobre este contacto, sin salir de donde uno está.
 *
 * Supervisando aparece seguido: el prompt que se está mirando está bien, pero
 * además hace falta otra cosa —ya que estamos, armale la tarea—. Antes eso era
 * salir, buscar el contacto, abrir la ficha y lanzar desde ahí; para cuando
 * volvías habías perdido el lugar en la cola.
 *
 * Arranca cerrado: es una acción de más, no la principal de la pantalla.
 */
export function NuevoPedido({ chatId, nombre, onEnviado, className }: { chatId: number; nombre: string; onEnviado?: () => void; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);

  const { permitidas } = useCapacidades();

  const enviar = async () => {
    const texto = componerPedido(nombre, detalle, permitidas);
    if (detalle.trim().length < 3) {
      toast.error('Escribí qué querés que haga.');
      return;
    }
    setEnviando(true);
    try {
      await dejarParaConector({ chatId, text: texto, title: `Pedido · ${nombre}` });
      avisarEncolado(chatId);
      toast.success('En la cola. Lo toma el próximo conector.');
      setDetalle('');
      setAbierto(false);
      onEnviado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo encolar.');
    } finally {
      setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" className={cn('h-8 gap-1.5 text-[11px]', className)} onClick={() => setAbierto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Mandar otro pedido
      </Button>
    );
  }

  return (
    <div className={cn('rounded-xl border border-violet-500/30 bg-violet-500/5 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Otro pedido para {nombre}</p>
        <Button variant="ghost" size="icon" className="size-6" onClick={() => setAbierto(false)} aria-label="Cerrar">
          <X className="size-3.5" aria-hidden />
        </Button>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        El conector elige qué hacer —mensaje, programado, tarea, documento, calendario o CRM— y en qué orden. Vos decís qué hace falta.
      </p>

      <Textarea
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        rows={3}
        placeholder="Qué hace falta con este cliente…" 
        className="mt-2 resize-y text-sm"
        disabled={enviando}
      />

      <Button size="sm" className="mt-2 h-9 w-full gap-1.5 bg-violet-600 text-white hover:bg-violet-700" onClick={() => void enviar()} disabled={enviando}>
        {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Inbox className="size-4" aria-hidden />}
        Dejar en la cola
      </Button>
    </div>
  );
}
