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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { requestImprovementAction } from '../server/actions';
import type { MarketplaceItem } from '@/lib/db/schema';

type Props = {
  item: MarketplaceItem;
};

export function RequestDialog({ item }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const pricingOptions: { value: string; label: string }[] = [];
  if (item.isFree) pricingOptions.push({ value: 'free', label: 'Gratis' });
  if (item.monthlyPrice) pricingOptions.push({ value: 'monthly', label: `Mensual - $${item.monthlyPrice}` });
  if (item.annualPrice) pricingOptions.push({ value: 'annual', label: `Anual - $${item.annualPrice}` });
  if (item.installationPrice) pricingOptions.push({ value: 'installation', label: `Instalación - $${item.installationPrice}` });
  if (pricingOptions.length === 0) pricingOptions.push({ value: 'custom', label: 'Consultar precio' });

  const getAmount = (type: string) => {
    switch (type) {
      case 'monthly': return item.monthlyPrice;
      case 'annual': return item.annualPrice;
      case 'installation': return item.installationPrice;
      default: return null;
    }
  };

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const pricingType = formData.get('pricingType') as string;
      formData.set('amount', getAmount(pricingType) ?? '');
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

            <div className="space-y-2">
              <Label>Plan de precio</Label>
              <Select name="pricingType" defaultValue={pricingOptions[0]?.value}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pricingOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
