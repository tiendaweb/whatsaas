/** Fetcher SWR de Finanzas OS: tira en !ok para que SWR reintente (patrón Tareas OS). */
export const finFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finanzas OS: ${url} → ${res.status}`);
  return res.json();
};

export const FIN_API = {
  resumen: '/api/plugins/finance/os/resumen',
  movimientos: '/api/plugins/finance/os/movimientos',
  membresias: '/api/plugins/finance/os/membresias',
  suscripciones: '/api/plugins/finance/os/suscripciones',
  clientes: '/api/plugins/finance/os/clientes',
  cliente: (id: number) => `/api/plugins/finance/os/clientes/${id}`,
  cobros: '/api/plugins/finance/os/cobros',
  // Escrituras: rutas REST que ya existían en el plugin Financiero / Membresías.
  entries: '/api/plugins/finance/entries',
  entry: (id: number) => `/api/plugins/finance/entries/${id}`,
  suscripcion: (id: number) => `/api/plugins/memberships/subscriptions/${id}`,
} as const;
