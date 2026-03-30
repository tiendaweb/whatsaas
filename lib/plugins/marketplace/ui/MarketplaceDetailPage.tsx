type MarketplaceDetailPageProps = {
  slug?: string[];
};

export function MarketplaceDetailPage({ slug }: MarketplaceDetailPageProps) {
  const appId = slug?.[1] ?? 'unknown-app';

  return (
    <div className="space-y-4 p-6">
      <h2 className="text-2xl font-semibold">Detalle de mejora</h2>
      <p className="text-sm text-muted-foreground">Ficha del paquete seleccionado en el marketplace.</p>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">App ID</p>
        <p className="text-muted-foreground">{appId}</p>
      </div>
    </div>
  );
}
