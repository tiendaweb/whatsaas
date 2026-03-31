'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SeedMarketplaceButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSeed() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/marketplace/seed', { method: 'POST' });
      const data = await res.json();
      setResult(data.message ?? (data.error ? `Error: ${data.error}` : 'Completado'));
      router.refresh();
    } catch {
      setResult('Error al ejecutar seed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleSeed} disabled={loading}>
        <Database className="mr-2 h-3 w-3" />
        {loading ? 'Cargando...' : 'Seed datos'}
      </Button>
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
    </div>
  );
}
