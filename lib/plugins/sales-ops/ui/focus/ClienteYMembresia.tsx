'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { BadgeCheck, CreditCard, Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { fetcher, fmtDate } from '../components/format';

type Cliente = { id: number; name: string };
type Plan = { id: number; name: string; price?: number | null; currency?: string | null; billingType?: string | null };
type Suscripcion = { id: number; subscriptionNumber: string; status: string; paymentStatus: string; startDate: string; endDate: string | null; contactId?: number | null; customerId?: number | null; planId?: number | null };

/**
 * Registrar el contacto como cliente y asignarle una membresía, sin salir.
 *
 * Es el final feliz de una conversación y estaba a tres pantallas de distancia:
 * había que salir del Focus, abrir Clientes, crear la ficha, volver a
 * Membresías y armar la suscripción. Para cuando terminabas, habías perdido el
 * lugar en la cola — así que en la práctica se anotaba "ya pagó" en una nota y
 * se registraba después, o nunca.
 *
 * La suscripción acepta `contactId` directo, así que asignar la membresía NO
 * exige crear antes la ficha de cliente: son dos cosas separadas y cada una se
 * hace cuando corresponde.
 */
export function ClienteYMembresia({ chatId, contactId, nombre, className }: { chatId: number; contactId: number | null; nombre: string; className?: string }) {
  const [abriendo, setAbriendo] = useState<'cliente' | 'membresia' | null>(null);

  const clientes = useSWR<Cliente[]>(contactId ? `/api/plugins/customers/by-contact?contactId=${contactId}` : null, fetcher, { revalidateOnFocus: false });
  const suscripciones = useSWR<Suscripcion[]>('/api/plugins/memberships/subscriptions', fetcher, { revalidateOnFocus: false });

  const cliente = clientes.data?.[0] ?? null;
  const propias = (suscripciones.data ?? []).filter(
    (s) => (contactId != null && s.contactId === contactId) || (cliente != null && s.customerId === cliente.id),
  );

  if (!contactId) {
    return (
      <p className={cn('rounded-lg border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground', className)}>
        Este chat todavía no tiene ficha de contacto, así que no se puede registrar como cliente.
      </p>
    );
  }

  return (
    <section className={cn('rounded-xl border border-border bg-card p-2.5', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {cliente ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <BadgeCheck className="size-3" aria-hidden />
            Cliente: {cliente.name}
          </span>
        ) : (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => setAbriendo(abriendo === 'cliente' ? null : 'cliente')}>
            <UserPlus className="size-3.5" aria-hidden />
            Registrar como cliente
          </Button>
        )}

        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={() => setAbriendo(abriendo === 'membresia' ? null : 'membresia')}>
          <CreditCard className="size-3.5" aria-hidden />
          Asignar membresía
        </Button>
      </div>

      {propias.length > 0 && (
        <ul className="mt-2 space-y-1">
          {propias.map((s) => (
            <li key={s.id} className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">{s.subscriptionNumber}</span> · {s.status} · pago {s.paymentStatus}
              {s.endDate && <span> · vence {fmtDate(s.endDate)}</span>}
            </li>
          ))}
        </ul>
      )}

      {abriendo === 'cliente' && (
        <FormularioCliente
          contactId={contactId}
          nombre={nombre}
          onCerrar={() => setAbriendo(null)}
          onListo={() => {
            setAbriendo(null);
            void clientes.mutate();
          }}
        />
      )}

      {abriendo === 'membresia' && (
        <FormularioMembresia
          contactId={contactId}
          customerId={cliente?.id ?? null}
          nombre={nombre}
          onCerrar={() => setAbriendo(null)}
          onListo={() => {
            setAbriendo(null);
            void suscripciones.mutate();
          }}
        />
      )}
    </section>
  );
}

/** Crea la ficha de cliente y la deja vinculada a este contacto, en un paso. */
function FormularioCliente({ contactId, nombre, onCerrar, onListo }: { contactId: number; nombre: string; onCerrar: () => void; onListo: () => void }) {
  const [valor, setValor] = useState(nombre);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!valor.trim()) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/plugins/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: valor.trim() }),
      });
      const cliente = (await res.json().catch(() => null)) as { id?: number; error?: unknown } | null;
      if (!res.ok || !cliente?.id) throw new Error(typeof cliente?.error === 'string' ? cliente.error : 'No se pudo crear el cliente.');
      // Crear y vincular son dos llamadas: si la segunda falla, queda una ficha
      // suelta y se avisa, en vez de dar por hecho un vínculo que no existe.
      const link = await fetch(`/api/plugins/customers/${cliente.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      if (!link.ok) throw new Error('Se creó el cliente pero no se pudo vincular al contacto. Vinculalo desde Clientes.');
      toast.success('Registrado como cliente.');
      onListo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Caja titulo="Nuevo cliente" onCerrar={onCerrar}>
      <Input value={valor} onChange={(e) => setValor(e.target.value)} className="h-8 text-xs" placeholder="Nombre del cliente" maxLength={200} />
      <Button size="sm" className="mt-2 h-8 w-full gap-1.5 text-[11px]" onClick={() => void guardar()} disabled={guardando || !valor.trim()}>
        {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <UserPlus className="size-3.5" aria-hidden />}
        Crear y vincular
      </Button>
    </Caja>
  );
}

/** Suscripción nueva. Va contra el contacto si todavía no hay ficha de cliente. */
function FormularioMembresia({
  contactId,
  customerId,
  nombre,
  onCerrar,
  onListo,
}: {
  contactId: number;
  customerId: number | null;
  nombre: string;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const planes = useSWR<Plan[]>('/api/plugins/memberships/plans', fetcher, { revalidateOnFocus: false });
  const [planId, setPlanId] = useState<string>('');
  const [desde, setDesde] = useState(() => new Date().toISOString().slice(0, 10));
  const [hasta, setHasta] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch('/api/plugins/memberships/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // El número lo arma la pantalla porque el endpoint lo exige: con la
          // fecha y el contacto queda único y legible en la lista.
          subscriptionNumber: `${nombre.slice(0, 16).trim() || 'SUS'}-${desde.replace(/-/g, '')}`.slice(0, 50),
          planId: planId ? Number(planId) : null,
          customerId,
          contactId: customerId ? null : contactId,
          startDate: desde,
          endDate: hasta || null,
          status: 'active',
          paymentStatus: 'pending',
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'No se pudo asignar la membresía.');
      toast.success('Membresía asignada. Nace con el pago pendiente.');
      onListo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo asignar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Caja titulo="Nueva membresía" onCerrar={onCerrar}>
      <Select value={planId} onValueChange={setPlanId}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={planes.isLoading ? 'Cargando planes…' : 'Plan (opcional)'} />
        </SelectTrigger>
        <SelectContent>
          {(planes.data ?? []).map((p) => (
            <SelectItem key={p.id} value={String(p.id)} className="text-xs">
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Desde
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-0.5 h-8 text-xs" />
        </label>
        <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Vence
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-0.5 h-8 text-xs" />
        </label>
      </div>

      <Button size="sm" className="mt-2 h-8 w-full gap-1.5 text-[11px]" onClick={() => void guardar()} disabled={guardando || !desde}>
        {guardando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CreditCard className="size-3.5" aria-hidden />}
        Asignar
      </Button>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        Nace con el pago <span className="font-medium">pendiente</span>: confirmarlo es otra decisión, y se hace desde Finanzas o la ficha.
      </p>
    </Caja>
  );
}

function Caja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-lg border border-border p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <button type="button" onClick={onCerrar} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
          <X className="size-3" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}
