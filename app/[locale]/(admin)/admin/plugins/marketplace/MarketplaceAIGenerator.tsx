'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  generateMarketplaceItemWithAI,
  generateMarketplaceItemsBatchWithAI,
  improveMarketplaceItemWithAI,
  saveMarketplaceAIDraft,
} from './actions';

type DraftPayload = {
  title: string;
  subtitle: string | null;
  category: string;
  description: string;
  tags: string[];
  iconUrl: string | null;
  imageUrl: string | null;
  interfaceBlocks: Record<string, unknown>[];
  customFields: Record<string, unknown>[];
  prices: Array<{ billingType: 'one_time' | 'monthly' | 'yearly'; amount: number; currency: string; enabled: boolean }>;
  status: 'draft' | 'active' | 'archived';
};

export function MarketplaceAIGenerator({ selectedTeamId }: { selectedTeamId: number | null }) {
  const [singlePrompt, setSinglePrompt] = useState('');
  const [batchPrompts, setBatchPrompts] = useState('');
  const [itemId, setItemId] = useState('');
  const [improvePrompt, setImprovePrompt] = useState('');
  const [publish, setPublish] = useState(false);
  const [draft, setDraft] = useState<DraftPayload | null>(null);
  const [diff, setDiff] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<Array<{ prompt: string; item: DraftPayload }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const getTeamIdOrNotify = () => {
    if (!selectedTeamId) {
      setMessage('Selecciona un team para usar IA.');
      return null;
    }

    return selectedTeamId;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketplace AI Studio</CardTitle>
        <CardDescription>
          Genera borradores de items, revisa diff y confirma guardado antes de publicar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Prompt corto (1 item)</Label>
            <Textarea value={singlePrompt} onChange={(e) => setSinglePrompt(e.target.value)} placeholder="Ej: Bot de follow-up para leads fríos." />
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                const resolvedTeamId = getTeamIdOrNotify();
                if (!resolvedTeamId) return;
                startTransition(async () => {
                  try {
                    const result = await generateMarketplaceItemWithAI({ teamId: resolvedTeamId, prompt: singlePrompt, publish });
                    setDraft(result.item as DraftPayload);
                    setDiff(result.diff);
                    setMessage(`Generado con ${result.provider}/${result.model} en modo borrador.`);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Error generando item.');
                  }
                });
              }}
            >
              Generar item con IA
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Lote (una línea por tema)</Label>
            <Textarea
              value={batchPrompts}
              onChange={(e) => setBatchPrompts(e.target.value)}
              placeholder={['Asistente ventas ecommerce', 'Panel analytics KPI en tiempo real'].join('\n')}
            />
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                const resolvedTeamId = getTeamIdOrNotify();
                if (!resolvedTeamId) return;
                startTransition(async () => {
                  try {
                    const prompts = batchPrompts
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean);
                    const result = await generateMarketplaceItemsBatchWithAI({ teamId: resolvedTeamId, prompts, publish });
                    setBatchResults(result.results.map((entry) => ({ prompt: entry.prompt, item: entry.item as DraftPayload })));
                    setMessage(`Generados ${result.results.length} borradores por lote.`);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Error en lote IA.');
                  }
                });
              }}
            >
              Generar lote
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <Label>Mejorar item existente</Label>
          <div className="grid gap-2 lg:grid-cols-[180px,1fr,auto]">
            <Input placeholder="Item ID" value={itemId} onChange={(e) => setItemId(e.target.value)} />
            <Input
              placeholder="Instrucción: mejora copy, precio anual con descuento..."
              value={improvePrompt}
              onChange={(e) => setImprovePrompt(e.target.value)}
            />
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                const resolvedTeamId = getTeamIdOrNotify();
                if (!resolvedTeamId) return;
                startTransition(async () => {
                  try {
                    const result = await improveMarketplaceItemWithAI({
                      teamId: resolvedTeamId,
                      itemId: Number(itemId),
                      instruction: improvePrompt,
                      publish,
                    });
                    setDraft(result.item as DraftPayload);
                    setDiff(result.diff);
                    setMessage('Item mejorado. Revisa cambios antes de guardar.');
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Error mejorando item.');
                  }
                });
              }}
            >
              Mejorar con IA
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          Publicar al guardar (si no, queda en draft)
        </label>

        {diff.length > 0 ? (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">Diff sugerido</p>
            <ul className="list-disc pl-5">
              {diff.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {draft ? (
          <div className="space-y-3 rounded-md border p-3">
            <p className="font-medium">Borrador IA (JSON normalizado)</p>
            <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(draft, null, 2)}</pre>
            <Button
              type="button"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    const result = await saveMarketplaceAIDraft({
                      draft,
                      publish,
                      itemId: itemId ? Number(itemId) : undefined,
                    });
                    setMessage(`Guardado confirmado (${result.mode}) item #${result.itemId}.`);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'No se pudo guardar el borrador IA.');
                  }
                });
              }}
            >
              Confirmar guardado
            </Button>
          </div>
        ) : null}

        {batchResults.length > 0 ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="font-medium">Resultados por lote (borrador)</p>
            {batchResults.map((result, index) => (
              <div key={`${result.prompt}-${index}`} className="rounded border p-2 text-xs">
                <p className="font-medium">{result.prompt}</p>
                <p>
                  {result.item.title} · {result.item.category} · {result.item.prices[0]?.amount ?? 0}{' '}
                  {result.item.prices[0]?.currency ?? 'usd'}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
