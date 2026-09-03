'use client';

/**
 * Embudo de oportunidades — réplica de /deals de PulzeCRM.
 *
 * Reglas que no se pueden aflojar (docs/escritorio-pulze/09 §3.3):
 *  - Soltar una tarjeta en "Ganada" NO factura: abre el diálogo de cierre.
 *  - El cierre manda `idempotencyKey`, así un doble clic no emite dos ventas.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Handshake, Plus, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { surfaceCard } from '@/components/escritorio/tokens';
import { stageColor } from '@/lib/charts/theme';
import { useChartMode } from '@/components/escritorio/useChartMode';
import { cn } from '@/lib/utils';

type Deal = {
  id: number;
  title: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  customerName: string | null;
  contactName: string | null;
  ownerName: string | null;
  updatedAt: string;
  saleId: number | null;
};

type Stats = {
  totalValue: number;
  openCount: number;
  averageValue: number;
  currency: string;
};

const STAGES = ['qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  qualified: 'Calificada',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  closed_won: 'Ganada',
  closed_lost: 'Perdida',
};

const STALE_DAYS = 14;

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function DealsBoard() {
  const { data, mutate, isLoading } = useSWR<{ deals: Deal[] }>('/api/plugins/deals', fetcher);
  const { data: stats } = useSWR<Stats>('/api/plugins/deals/stats', fetcher);
  const mode = useChartMode();

  const [board, setBoard] = useState<Record<Stage, Deal[]>>(() => emptyBoard());
  const [createOpen, setCreateOpen] = useState(false);
  const [closing, setClosing] = useState<Deal | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', value: '', currency: 'USD' });

  function emptyBoard(): Record<Stage, Deal[]> {
    return { qualified: [], proposal: [], negotiation: [], closed_won: [], closed_lost: [] };
  }

  useEffect(() => {
    if (!data?.deals) return;
    const next = emptyBoard();
    for (const deal of data.deals) {
      const stage = (STAGES as readonly string[]).includes(deal.stage) ? (deal.stage as Stage) : 'qualified';
      next[stage].push(deal);
    }
    setBoard(next);
  }, [data]);

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const from = source.droppableId as Stage;
    const to = destination.droppableId as Stage;
    const dealId = Number(draggableId);
    const deal = board[from][source.index];
    if (!deal) return;

    // Optimista: la tarjeta se mueve ya, y se revierte si el servidor falla.
    const next = { ...board, [from]: [...board[from]], [to]: [...board[to]] };
    next[from].splice(source.index, 1);
    next[to].splice(destination.index, 0, { ...deal, stage: to });
    setBoard(next);

    // Ganar exige confirmación: mover la tarjeta no puede emitir una venta.
    if (to === 'closed_won') {
      setClosing(deal);
      return;
    }

    const response = await fetch(`/api/plugins/deals/${dealId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: to, position: destination.index }),
    });
    if (!response.ok) {
      toast.error('No se pudo mover la oportunidad');
      await mutate();
      return;
    }
    await mutate();
  }

  async function createDeal() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const response = await fetch('/api/plugins/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          value: Math.round(Number(form.value || 0) * 100),
          currency: form.currency,
        }),
      });
      if (!response.ok) throw new Error();
      toast.success('Oportunidad creada');
      setCreateOpen(false);
      setForm({ title: '', value: '', currency: 'USD' });
      await mutate();
    } catch {
      toast.error('No se pudo crear la oportunidad');
    } finally {
      setSaving(false);
    }
  }

  async function confirmWin(createSale: boolean) {
    if (!closing) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/plugins/deals/${closing.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: 'won',
          createSale,
          // Estable por oportunidad: reintentar el mismo cierre nunca crea una
          // segunda venta.
          idempotencyKey: `deal-${closing.id}-won`,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error ?? 'No se pudo cerrar la oportunidad');
        await mutate();
        return;
      }
      toast.success(
        payload?.sale ? `Venta ${payload.sale.saleNumber} registrada` : 'Oportunidad ganada',
      );
      setClosing(null);
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo(() => STAGES.map((stage) => ({ stage, deals: board[stage] })), [board]);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-6 py-8 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold">Embudo de oportunidades</h1>
          <p className="mt-1 text-[0.9375rem] text-muted-foreground">
            Seguí y gestioná tus oportunidades — arrastrá para mover de etapa
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva oportunidad
        </Button>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard icon={Wallet} label="Valor del embudo" value={money(stats?.totalValue ?? 0, stats?.currency ?? 'USD')} />
        <StatCard icon={Handshake} label="Oportunidades activas" value={String(stats?.openCount ?? 0)} />
        <StatCard icon={TrendingUp} label="Ticket promedio" value={money(stats?.averageValue ?? 0, stats?.currency ?? 'USD')} />
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex snap-x gap-4 overflow-x-auto pb-4">
            {columns.map(({ stage, deals }) => (
              <div
                key={stage}
                className="flex w-[85vw] min-w-[85vw] shrink-0 snap-start flex-col rounded-xl border border-border/40 bg-muted/40 md:w-80 md:min-w-80"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 p-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: stageColor(stage, mode) }}
                      aria-hidden
                    />
                    {STAGE_LABEL[stage]}
                  </span>
                  <Badge variant="secondary" className="text-[0.6875rem]">
                    {deals.length}
                  </Badge>
                </div>
                <Droppable droppableId={stage}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'flex-1 space-y-2 overflow-y-auto p-2',
                        snapshot.isDraggingOver && 'bg-primary/10',
                      )}
                    >
                      {deals.map((deal, index) => (
                        <Draggable key={deal.id} draggableId={String(deal.id)} index={index}>
                          {(dragProvided) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={cn(
                                'cursor-grab rounded-xl p-3 active:cursor-grabbing',
                                surfaceCard,
                              )}
                            >
                              <Link href={`/plugins/deals/${deal.id}`} className="block">
                                <p className="truncate text-sm font-semibold">{deal.title}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {deal.customerName ?? deal.contactName ?? '—'}
                                </p>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold tabular-nums">
                                    {money(deal.value, deal.currency)}
                                  </span>
                                  <span className="text-xs text-muted-foreground tabular-nums">
                                    {deal.probability}%
                                  </span>
                                </div>
                                <Progress value={deal.probability} className="mt-2 h-1.5" />
                                {daysSince(deal.updatedAt) > STALE_DAYS && (
                                  <p className="mt-2 text-[0.6875rem] text-[#d97706]">
                                    Sin movimiento hace {daysSince(deal.updatedAt)} días
                                  </p>
                                )}
                              </Link>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva oportunidad</DialogTitle>
            <DialogDescription>Se crea en la etapa Calificada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="deal-title">Título de la oportunidad</Label>
              <Input
                id="deal-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-value">Monto</Label>
              <Input
                id="deal-value"
                type="number"
                min={0}
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createDeal} disabled={saving || !form.title.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de cierre: dice el monto ANTES de facturar. */}
      <Dialog
        open={closing != null}
        onOpenChange={(open) => {
          if (!open) {
            setClosing(null);
            void mutate();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar la oportunidad como ganada</DialogTitle>
            <DialogDescription>
              {closing
                ? `Se registra la venta por ${money(closing.value, closing.currency)} y queda enlazada a esta oportunidad.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => confirmWin(false)} disabled={saving}>
              Marcar como ganada sin registrar venta
            </Button>
            <Button onClick={() => confirmWin(true)} disabled={saving}>
              Registrar la venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <Card className={surfaceCard}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}
