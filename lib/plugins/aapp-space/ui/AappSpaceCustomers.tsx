'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  CalendarClock, ExternalLink, Globe, IdCard, Loader2, MessageCircle, Search, ShoppingBag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { daysUntil, serviceLabel, serviceUrgency } from '@/lib/aapp/subscription';

type Site = {
  id: number;
  title: string;
  kind: 'store' | 'vcard';
  url: string | null;
  customDomain: string | null;
  status: string | null;
  createdAt: string | null;
};

export type AappCustomer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  whatsappPhone: string | null;
  status: string;
  profileImage: string | null;
  contactId: number | null;
  registeredAt: string | null;
  subscription: { status: string; endDate: string | null; planName: string | null } | null;
  hasDomain: boolean;
  domains: Array<{ name: string; expiresAt: string | null; status: string }>;
  sites: Site[];
};

type DomainFilter = 'all' | 'with' | 'without';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((res) => res.json());

const URGENCY_CLASS: Record<string, string> = {
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  critical: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300',
  warning: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-300',
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function AappSpaceCustomers() {
  const { data, isLoading } = useSWR<AappCustomer[]>('/api/plugins/aapp-space/customers', fetcher);
  const [filter, setFilter] = useState<DomainFilter>('all');
  const [query, setQuery] = useState('');

  const customers = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();

    return customers.filter((customer) => {
      if (filter === 'with' && !customer.hasDomain) return false;
      if (filter === 'without' && customer.hasDomain) return false;
      if (!search) return true;

      return (
        customer.name.toLowerCase().includes(search) ||
        (customer.email ?? '').toLowerCase().includes(search) ||
        (customer.phone ?? '').includes(search) ||
        customer.sites.some((site) =>
          site.title.toLowerCase().includes(search) ||
          (site.customDomain ?? '').toLowerCase().includes(search),
        )
      );
    });
  }, [customers, filter, query]);

  const withDomain = customers.filter((customer) => customer.hasDomain).length;

  const filters: Array<{ id: DomainFilter; label: string; count: number }> = [
    { id: 'all', label: 'Todos', count: customers.length },
    { id: 'with', label: 'Con dominio', count: withDomain },
    { id: 'without', label: 'Sin dominio', count: customers.length - withDomain },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Clientes y sus sitios</h2>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente, sitio o dominio"
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={filter === item.id ? 'default' : 'outline'}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span className="ml-1.5 tabular-nums opacity-70">{item.count}</span>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay clientes que coincidan.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((customer) => {
            const days = daysUntil(customer.subscription?.endDate);
            const urgency = serviceUrgency(days);

            return (
              <div key={customer.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={customer.profileImage || undefined} />
                    <AvatarFallback>{customer.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/plugins/customers/${customer.id}`}
                        className="truncate text-sm font-medium hover:text-primary hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.subscription && (
                        <Badge className={`text-[10px] ${URGENCY_CLASS[urgency]}`}>{serviceLabel(days)}</Badge>
                      )}
                      {customer.hasDomain && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Globe className="h-3 w-3" />
                          Dominio propio
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[customer.email, customer.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Alta {formatDate(customer.registeredAt)}
                      {customer.subscription?.planName ? ` · ${customer.subscription.planName}` : ''}
                    </p>
                  </div>

                  {customer.whatsappPhone && (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`https://wa.me/${customer.whatsappPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        title={`WhatsApp a ${customer.phone}`}
                      >
                        <MessageCircle className="mr-2 h-4 w-4 text-emerald-600" />
                        WhatsApp
                      </a>
                    </Button>
                  )}
                </div>

                {customer.sites.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-l-2 border-muted pl-3">
                    {customer.sites.map((site) => {
                      const Icon = site.kind === 'store' ? ShoppingBag : IdCard;

                      return (
                        <div key={site.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{site.title}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {site.kind === 'store' ? 'Tienda online' : 'Sitio web'}
                          </span>
                          {site.customDomain && (
                            <Badge variant="secondary" className="text-[10px]">{site.customDomain}</Badge>
                          )}
                          {site.url && (
                            <a
                              href={site.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Abrir <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {customer.whatsappPhone && (
                            <a
                              href={`https://wa.me/${customer.whatsappPhone}?text=${encodeURIComponent(
                                `Hola! Te escribo por ${site.title}`,
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                              title={`WhatsApp al responsable de ${site.title}`}
                            >
                              <MessageCircle className="h-3 w-3" /> WhatsApp
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {customer.domains.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {customer.domains.map((domain) => (
                      <span key={domain.name}>
                        {domain.name} vence {formatDate(domain.expiresAt)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
