'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { requestImprovementAction } from '../server/actions';
import type { MarketplaceItem, MarketplaceItemPrice } from '@/lib/db/schema';

type Props = {
  item: MarketplaceItem & { prices?: MarketplaceItemPrice[] };
};

export function RequestDialog({ item }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const enabledPrices = (item.prices ?? []).filter((p) => p.enabled);
  const total = enabledPrices.reduce((sum, p) => sum + p.amount, 0);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      await requestImprovementAction(formData);
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full sm:w-auto">
          Solicitar Mejora
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar: {item.title}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <p className="text-lg font-medium text-green-600">Solicitud enviada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Te notificaremos cuando sea revisada.
            </p>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <input type="hidden" name="itemId" value={item.id} />

            {enabledPrices.length > 0 && (
              <div className="space-y-2">
                <Label>Precios incluidos</Label>
                <div className="text-sm space-y-1">
                  {enabledPrices.map((price) => (
                    <div key={price.id} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{price.billingType}</span>
                      <span className="font-medium">
                        {price.billingType === 'free' ? 'Gratis' : `$${(price.amount / 100).toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                  {total > 0 && (
                    <div className="flex justify-between pt-1 border-t font-medium">
                      <span>Total estimado</span>
                      <span>${(total / 100).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="¿Algún detalle adicional sobre tu solicitud?"
                className="min-h-20"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar solicitud'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
