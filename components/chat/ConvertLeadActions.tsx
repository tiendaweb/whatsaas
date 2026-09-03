'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Handshake, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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

/**
 * Convertir un prospecto en cliente y/o en oportunidad, desde su ficha.
 *
 * Sin esto las conversiones sólo existirían por API y por MCP: la persona que
 * atiende el chat es justamente quien sabe cuándo el contacto pasó a ser una
 * oportunidad real.
 */
export function ConvertLeadActions({
  contactId,
  contactName,
  isCustomer,
  onConverted,
}: {
  contactId: number;
  contactName: string;
  isCustomer: boolean;
  onConverted?: () => void;
}) {
  const router = useRouter();
  const [dealOpen, setDealOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', value: '' });

  async function convertToCustomer() {
    setBusy(true);
    try {
      const response = await fetch('/api/plugins/deals/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, target: 'customer' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error ?? 'No se pudo convertir el contacto');
        return;
      }
      // El copy distingue crear de vincular: si ya existía una ficha con el
      // mismo email o teléfono, no se duplicó nada y conviene decirlo.
      toast.success(
        payload?.created
          ? `${contactName} ya es cliente`
          : `${contactName} se vinculó al cliente que ya existía`,
      );
      onConverted?.();
    } finally {
      setBusy(false);
    }
  }

  async function createDeal() {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/plugins/deals/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          target: 'customer_and_deal',
          deal: {
            title: form.title.trim(),
            value: Math.round(Number(form.value || 0) * 100),
            currency: 'USD',
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.error ?? 'No se pudo crear la oportunidad');
        return;
      }
      toast.success('Oportunidad creada');
      setDealOpen(false);
      setForm({ title: '', value: '' });
      onConverted?.();
      if (payload?.deal?.id) router.push(`/plugins/deals/${payload.deal.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!isCustomer && (
          <Button size="sm" variant="outline" onClick={convertToCustomer} disabled={busy}>
            <UserPlus className="mr-2 size-4" />
            Convertir en cliente
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setDealOpen(true)} disabled={busy}>
          <Handshake className="mr-2 size-4" />
          Crear oportunidad
        </Button>
      </div>

      <Dialog open={dealOpen} onOpenChange={setDealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear oportunidad</DialogTitle>
            <DialogDescription>
              {isCustomer
                ? `Se abre una oportunidad para ${contactName}.`
                : `Si ${contactName} todavía no es cliente, se crea la ficha de cliente primero.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="convert-title">Título de la oportunidad</Label>
              <Input
                id="convert-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder={`Propuesta para ${contactName}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convert-value">Monto</Label>
              <Input
                id="convert-value"
                type="number"
                min={0}
                value={form.value}
                onChange={(event) => setForm({ ...form, value: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDealOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createDeal} disabled={busy || !form.title.trim()}>
              Crear oportunidad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
