'use client';

import { useState } from 'react';
import { Loader2, Plus, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Una tarea suelta, sin pasar por el conector.
 *
 * "Llamarlo el martes" no necesita que una IA lea el chat: es más rápido
 * escribirlo que pedirlo. Encolar un pedido para eso era usar un cañón para una
 * mosca, y además el resultado tardaba.
 */
export function NuevaTarea({ chatId, onCreada, className }: { chatId: number; onCreada?: () => void; className?: string }) {
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    const texto = titulo.trim();
    if (!texto) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: texto,
          // El endpoint quiere un datetime completo; el input da sólo el día.
          dueDate: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body?.error === 'contact_required' ? 'Este chat todavía no tiene ficha de contacto.' : String(body?.error ?? `Error ${res.status}`));
      }
      setTitulo('');
      setFecha('');
      toast.success('Tarea creada.');
      onCreada?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={cn('rounded-lg border border-border p-2', className)}>
      <Input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void crear();
          }
        }}
        placeholder="Nueva tarea…"
        className="h-8 text-xs"
        maxLength={500}
        disabled={guardando}
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 flex-1 text-xs" disabled={guardando} />
        <Button size="sm" className="h-8 gap-1.5 text-[11px]" onClick={() => void crear()} disabled={guardando || !titulo.trim()}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
          Crear
        </Button>
      </div>
    </div>
  );
}

/**
 * Una nota interna, que queda en la conversación y NUNCA le llega al cliente.
 *
 * Vive acá y no en el compositor del chat a propósito: allá era un switch al
 * lado de Enviar y convertía un mensaje al cliente en nota sin que se notara.
 * Separado, la única forma de escribir una nota es querer escribirla.
 */
export function NuevaNotaInterna({
  remoteJid,
  instanceId,
  onCreada,
  className,
}: {
  remoteJid: string;
  instanceId: number | null;
  onCreada?: () => void;
  className?: string;
}) {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    const nota = texto.trim();
    if (!nota) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientJid: remoteJid, text: nota, isInternal: true, instanceId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(String(body?.error ?? `Error ${res.status}`));
      }
      setTexto('');
      toast.success('Nota interna guardada. No se le envió al cliente.');
      onCreada?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la nota.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={cn('rounded-lg border border-amber-500/30 bg-amber-500/5 p-2', className)}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <StickyNote className="size-3" aria-hidden />
        Nota interna
      </p>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        placeholder="Queda en la conversación y no se le envía al cliente…"
        className="mt-1.5 resize-y text-xs"
        disabled={guardando}
      />
      <Button size="sm" variant="outline" className="mt-1.5 h-8 w-full gap-1.5 text-[11px]" onClick={() => void crear()} disabled={guardando || !texto.trim()}>
        {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <StickyNote className="size-3.5" aria-hidden />}
        Guardar nota
      </Button>
    </div>
  );
}
