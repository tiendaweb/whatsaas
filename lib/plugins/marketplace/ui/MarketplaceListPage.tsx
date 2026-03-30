const SAMPLE_APPS = [
  {
    id: 'crm-pro',
    name: 'CRM Pro',
    category: 'Ventas',
    description: 'Pipeline avanzado con automatizaciones y reportes por etapa.',
  },
  {
    id: 'retention-kit',
    name: 'Retention Kit',
    category: 'Marketing',
    description: 'Playbooks de retención con campañas y alertas para churn.',
  },
  {
    id: 'ops-pulse',
    name: 'Ops Pulse',
    category: 'Operaciones',
    description: 'Monitoreo de SLA y scorecards de rendimiento por equipo.',
  },
];

export function MarketplaceListPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Marketplace</h2>
        <p className="text-sm text-muted-foreground">Explora mejoras para extender tu workspace tipo app store.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SAMPLE_APPS.map((app) => (
          <article key={app.id} className="rounded-lg border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{app.category}</p>
            <h3 className="mt-1 text-lg font-medium">{app.name}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{app.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
