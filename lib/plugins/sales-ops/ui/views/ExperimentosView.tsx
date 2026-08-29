'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ExperimentRow } from '../../shared/api-types';
import { GATE_LABELS, type Gate } from '../../shared/taxonomy';
import { ExperimentCard } from '../cola/ExperimentCard';
import { EXPERIMENTS_ENDPOINT, GATE_OPTIONS, fetcher, postJson, type ApiError } from '../cola/api';

type Payload = { experiments: ExperimentRow[] };

/**
 * Vista Experimentos (doc 05 §7): una tarjeta por experimento con el embudo por
 * variante, y alta manual. Un lote A/B desde la Cola también crea uno.
 */
export function ExperimentosView() {
  const { data, isLoading, error, mutate } = useSWR<Payload>(EXPERIMENTS_ENDPOINT, fetcher, { refreshInterval: 60_000 });
  const [creating, setCreating] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'running' | 'closed'>('all');

  const experiments = (data?.experiments ?? []).filter((e) => filter === 'all' || e.status === filter);

  async function close(id: number) {
    setClosingId(id);
    try {
      await postJson(`${EXPERIMENTS_ENDPOINT}/${id}/close`, {});
      toast.success('Experimento cerrado.');
      await mutate();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setClosingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(['all', 'running', 'closed'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filter === option ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              {option === 'all' ? 'Todos' : option === 'running' ? 'En curso' : 'Cerrados'}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          Nuevo
        </Button>
      </div>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{String(error.message)}</div>}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      )}
      {!isLoading && experiments.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no hay experimentos. Se crean desde la Cola (“Nuevo lote” con dos textos) o a mano.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {experiments.map((experiment) => (
          <ExperimentCard key={experiment.id} experiment={experiment} onClose={close} closing={closingId === experiment.id} />
        ))}
      </div>

      <NuevoExperimentoDialog open={creating} onOpenChange={setCreating} onCreated={() => void mutate()} />
    </div>
  );
}

function NuevoExperimentoDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [gates, setGates] = useState<Gate[]>([]);
  const [messageA, setMessageA] = useState('');
  const [messageB, setMessageB] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await postJson(EXPERIMENTS_ENDPOINT, {
        name: name.trim(),
        hypothesis: hypothesis.trim() || null,
        segmentGates: gates,
        messageA: messageA.trim() || null,
        messageB: messageB.trim() || null,
        status: 'running',
      });
      toast.success('Experimento creado. Sumale contactos desde la Cola con “Nuevo lote”.');
      setName('');
      setHypothesis('');
      setGates([]);
      setMessageA('');
      setMessageB('');
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo experimento</DialogTitle>
          <DialogDescription>Los contactos entran después, desde un lote de la Cola que apunte a este experimento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exp-nombre">Nombre</Label>
            <Input id="exp-nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} placeholder="Reactivación G4 — precio vs. pregunta" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-hipotesis">Hipótesis</Label>
            <Input id="exp-hipotesis" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} maxLength={300} placeholder="Retomar el precio conocido responde más que preguntar abierto." />
          </div>
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
          <div className="space-y-1.5">
            <Label htmlFor="exp-a">Texto A</Label>
            <Textarea id="exp-a" rows={3} value={messageA} onChange={(e) => setMessageA(e.target.value)} maxLength={4000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-b">Texto B</Label>
            <Textarea id="exp-b" rows={3} value={messageB} onChange={(e) => setMessageB(e.target.value)} maxLength={4000} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy || !name.trim()} onClick={submit}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
