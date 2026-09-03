'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, MessageCircle, Search, UsersRound } from 'lucide-react';

import { Link } from '@/i18n/routing';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type TodoContactoRow = {
  id: string;
  instanceId: number;
  instanceName: string;
  remoteJid: string;
  phone: string;
  name: string;
  profilePicUrl: string | null;
  chatId: number;
  savedContactId: number | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  lastCustomerInteractionAt: string | null;
  chatHref: string;
};

export type InstanceSummary = {
  id: number;
  name: string;
  count: number;
  status: 'ok' | 'skipped' | 'error';
  message?: string;
};

type Props = {
  contacts: TodoContactoRow[];
  instances: InstanceSummary[];
  fetchedAt: string;
};

type SortOrder = 'newest' | 'oldest';

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const result = parts.map((part) => part[0]).join('').toUpperCase();
  return result || 'CT';
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().trim();
}

function getSortTime(contact: TodoContactoRow): number | null {
  const value = contact.lastCustomerInteractionAt || contact.lastMessageAt;
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function TodosLosContactosTable({ contacts, instances, fetchedAt }: Props) {
  const [query, setQuery] = useState('');
  const [instanceFilter, setInstanceFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const filteredContacts = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return contacts.filter((contact) => {
      if (instanceFilter !== 'all' && contact.instanceId.toString() !== instanceFilter) {
        return false;
      }

      if (!normalizedQuery) return true;

      return (
        contact.name.toLowerCase().includes(normalizedQuery) ||
        contact.phone.includes(normalizedQuery) ||
        contact.instanceName.toLowerCase().includes(normalizedQuery) ||
        (contact.lastMessageText ?? '').toLowerCase().includes(normalizedQuery)
      );
    }).sort((a, b) => {
      const aTime = getSortTime(a);
      const bTime = getSortTime(b);

      if (aTime === null && bTime === null) return a.name.localeCompare(b.name);
      if (aTime === null) return 1;
      if (bTime === null) return -1;

      return sortOrder === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [contacts, instanceFilter, query, sortOrder]);

  const hasInstanceIssues = instances.some((instance) => instance.status !== 'ok');

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-muted p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-xl border bg-background p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UsersRound className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-foreground">Todos los contactos</h1>
                <p className="text-sm text-muted-foreground">
                  Contactos actuales en Evolution API con historial entrante.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{contacts.length} contactos</Badge>
            <Badge variant="outline">{instances.length} instancias</Badge>
            <span className="text-xs text-muted-foreground">
              Actualizado {formatDate(fetchedAt)}
            </span>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {instances.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No hay instancias configuradas.</span>
              </CardContent>
            </Card>
          ) : (
            instances.map((instance) => (
              <Card key={instance.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{instance.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {instance.count} contactos visibles
                    </p>
                  </div>
                  <Badge variant={instance.status === 'error' ? 'destructive' : instance.status === 'skipped' ? 'outline' : 'secondary'}>
                    {instance.status === 'ok' ? 'OK' : instance.status === 'skipped' ? 'Sin token' : 'Error'}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {hasInstanceIssues && (
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Algunas instancias no se pudieron leer</p>
                {instances
                  .filter((instance) => instance.status !== 'ok')
                  .map((instance) => (
                    <p key={instance.id} className="text-xs text-muted-foreground">
                      {instance.name}: {instance.message || 'Sin detalle'}
                    </p>
                  ))}
              </div>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="gap-4 border-b">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">Listado</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {filteredContacts.length} de {contacts.length} contactos
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar contacto, telefono o instancia"
                    className="pl-9"
                  />
                </div>
                <Select value={instanceFilter} onValueChange={setInstanceFilter}>
                  <SelectTrigger className="sm:w-60">
                    <SelectValue placeholder="Instancia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las instancias</SelectItem>
                    {instances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id.toString()}>
                        {instance.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
                  <SelectTrigger className="sm:w-56">
                    <SelectValue placeholder="Orden" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Mas recientes primero</SelectItem>
                    <SelectItem value="oldest">Mas antiguos primero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredContacts.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 p-8 text-center">
                <UsersRound className="size-8 text-muted-foreground" />
                <p className="text-sm font-semibold">No hay contactos para mostrar</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  No se encontraron contactos que esten en Evolution API y tengan historial entrante.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px] px-4">Contacto</TableHead>
                    <TableHead>Instancia</TableHead>
                    <TableHead>Ultima interaccion</TableHead>
                    <TableHead className="min-w-[260px]">Ultimo mensaje</TableHead>
                    <TableHead className="px-4 text-right">Chat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="px-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="size-10 border">
                            <AvatarImage src={contact.profilePicUrl || ''} alt={contact.name} />
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {initials(contact.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{contact.name}</p>
                            <p className="text-xs text-muted-foreground">{contact.phone}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contact.instanceName}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(contact.lastCustomerInteractionAt || contact.lastMessageAt)}
                      </TableCell>
                      <TableCell className="max-w-[360px] whitespace-normal text-sm text-muted-foreground">
                        <span className="line-clamp-2">
                          {contact.lastMessageText || 'Sin vista previa'}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 text-right">
                        <Button asChild size="sm" variant="outline" className="gap-2">
                          <Link href={contact.chatHref}>
                            <MessageCircle className="size-4" />
                            Abrir
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
