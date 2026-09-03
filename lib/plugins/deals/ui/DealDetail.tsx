'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { surfaceCard } from '@/components/escritorio/tokens';

type Deal = {
  id: number;
  title: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  notes: string;
  lostReason: string;
  expectedCloseDate: string | null;
  closedAt: string | null;
  saleId: number | null;
  customerName: string | null;
  contactName: string | null;
  ownerName: string | null;
};

const STAGE_LABEL: Record<string, string> = {
  qualified: 'Calificada',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  closed_won: 'Ganada',
  closed_lost: 'Perdida',
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

export function DealDetail({ dealId }: { dealId: number }) {
  const { data, isLoading } = useSWR<{ deal: Deal }>(`/api/plugins/deals/${dealId}`, fetcher);

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Cargando…</p>;
  }
  if (!data?.deal) {
    return <p className="p-8 text-sm text-muted-foreground">Esta oportunidad no existe.</p>;
  }
  const deal = data.deal;
  const money = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: deal.currency,
    maximumFractionDigits: 0,
  }).format(deal.value / 100);

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-6 py-8 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/plugins/deals">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver al embudo
        </Link>
      </Button>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{deal.title}</h1>
          <Badge variant="secondary">{STAGE_LABEL[deal.stage] ?? deal.stage}</Badge>
        </div>
        <p className="text-[0.9375rem] text-muted-foreground">
          {deal.customerName ?? deal.contactName ?? 'Sin cliente vinculado'}
        </p>
      </header>

      <Card className={surfaceCard}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Avance de la oportunidad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tabular-nums">{money}</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {deal.probability}% de probabilidad
            </span>
          </div>
          <Progress value={deal.probability} className="h-2" />
        </CardContent>
      </Card>

      <Card className={surfaceCard}>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Datos de la oportunidad</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Cliente" value={deal.customerName ?? '—'} />
          <Field label="Contacto" value={deal.contactName ?? '—'} />
          <Field label="Responsable" value={deal.ownerName ?? '—'} />
          <Field
            label="Cierre estimado"
            value={deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : '—'}
          />
          {deal.lostReason && <Field label="Motivo de la pérdida" value={deal.lostReason} />}
          {deal.notes && <Field label="Notas" value={deal.notes} />}
        </CardContent>
      </Card>

      {/* Sólo aparece si la oportunidad realmente generó una venta. */}
      {deal.saleId != null && (
        <Button variant="outline" asChild>
          <Link href="/plugins/sales">
            <Receipt className="mr-2 h-4 w-4" />
            Ver la venta
          </Link>
        </Button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
