'use client';

import { ExternalLink, Loader2, UserRoundPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { chatHrefFor } from '@/lib/plugins/radar/shared/chat-link';
import { fecha, origenLabel, plata, relativo, type ClienteVinculado } from './tipos';

/**
 * La ficha del cliente al que pertenece este contacto, resumida.
 *
 * Un cliente puede tener varios contactos —el dueño, la administrativa, el
 * técnico— y hasta ahora, desde un chat, la única forma de saber qué había del
 * otro lado era abrir la app Clientes en otra pestaña y buscarlo por nombre. Es
 * el mismo `GET /api/plugins/customers/[id]` que dibuja esa app: acá se muestra
 * lo que sirve mientras hablás, y el enlace lleva a la ficha completa para todo
 * lo demás.
 *
 * Un contacto sin cliente vinculado es normal, no un error: la mayoría de los
 * chats son gente que todavía no compró. Se dice eso y se ofrece el camino.
 */

const ESTADO: Record<string, string> = {
  active: 'activo',
  lead: 'prospecto',
  prospect: 'prospecto',
  inactive: 'inactivo',
  churned: 'perdido',
};

export function ClienteTab({
  cliente,
  cargando,
  contactoActual,
  onVincular,
}: {
  cliente: ClienteVinculado | null;
  cargando: boolean;
  /** El contacto abierto, para no ofrecerse a sí mismo en la lista de hermanos. */
  contactoActual: number;
  /** Abre el diálogo de perfil, que es donde se vincula un cliente. */
  onVincular?: () => void;
}) {
  if (cargando) {
    return (
      <div className="ctx-sec flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--mq-muted)' }}>
        <Loader2 className="size-3.5 animate-spin" /> Cargando el cliente…
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="ctx-sec">
        <p className="mb-2.5 text-[11.5px]" style={{ color: 'var(--mq-muted2)' }}>
          Este contacto no está vinculado a ningún cliente. Es lo normal mientras no compró: al vincularlo aparecen acá
          sus membresías, sus sitios y sus movimientos.
        </p>
        {onVincular && (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={onVincular}>
            <UserRoundPlus className="mr-2 size-4" aria-hidden /> Vincular a un cliente
          </Button>
        )}
      </div>
    );
  }

  const activas = cliente.subscriptions.filter((s) => s.status === 'active');
  const hermanos = cliente.contacts.filter((c) => c.id !== contactoActual);
  const tareasAbiertas = cliente.tasks.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const campos = cliente.customFieldDefs.filter((f) => {
    const v = cliente.customFieldValues[f.key];
    return v !== undefined && v !== null && v !== '';
  });

  return (
    <>
      <div className="ctx-sec">
        <div className="ctx-t">Cliente</div>
        <p className="text-[13.5px] font-bold leading-tight">{cliente.name}</p>
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--mq-muted)' }}>
          {[ESTADO[cliente.status] ?? cliente.status, origenLabel(cliente.source), cliente.industry, cliente.location]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="mt-2">
          {cliente.customerSince && (
            <div className="ctx-row"><span className="k">Cliente desde</span><span className="v">{fecha(cliente.customerSince)}</span></div>
          )}
          {cliente.email && <div className="ctx-row"><span className="k">Correo</span><span className="v">{cliente.email}</span></div>}
          {cliente.phone && <div className="ctx-row"><span className="k">Teléfono</span><span className="v mono">{cliente.phone}</span></div>}
          {cliente.website && (
            <div className="ctx-row">
              <span className="k">Sitio</span>
              <span className="v">
                <a href={cliente.website} target="_blank" rel="noreferrer" className="hover:underline">
                  {cliente.website.replace(/^https?:\/\//, '')}
                </a>
              </span>
            </div>
          )}
          <div className="ctx-row"><span className="k">Membresías</span><span className="v mono">{activas.length} activas de {cliente.subscriptions.length}</span></div>
        </div>

        <a
          href={`/plugins/customers/${cliente.id}`}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          Abrir la ficha completa <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {hermanos.length > 0 && (
        <div className="ctx-sec">
          <div className="ctx-t">Otros contactos ({hermanos.length})</div>
          {hermanos.map((c) => {
            const href = chatHrefFor(c.remoteJid);
            const fila = (
              <>
                <span className="nm flex-1">{c.name}</span>
                <span className="sub2">{c.remoteJid.split('@')[0]}</span>
              </>
            );
            return href ? (
              <a key={c.id} href={href} className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>{fila}</a>
            ) : (
              <div key={c.id} className="list-row">{fila}</div>
            );
          })}
          <p className="mt-1.5 text-[10.5px]" style={{ color: 'var(--mq-muted2)' }}>
            La plata del cliente se cuenta sobre todos sus contactos, no sólo sobre este chat.
          </p>
        </div>
      )}

      {cliente.transactions.length > 0 && (
        <div className="ctx-sec">
          <div className="ctx-t">Últimos movimientos</div>
          {cliente.transactions.slice(0, 6).map((t) => (
            <div key={t.id} className="list-row">
              <div className="min-w-0 flex-1">
                <div className="nm">{t.amount ?? '—'} {t.currency ?? ''}</div>
                <div className="sub2">{[t.gateway, t.paymentStatus].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div className="der"><div className="sub2">{relativo(t.transactionDate)}</div></div>
            </div>
          ))}
        </div>
      )}

      {tareasAbiertas.length > 0 && (
        <div className="ctx-sec">
          <div className="ctx-t">Tareas abiertas ({tareasAbiertas.length})</div>
          {tareasAbiertas.slice(0, 6).map((t) => (
            <div key={t.id} className="list-row">
              <div className="min-w-0 flex-1">
                <div className="nm">{t.title}</div>
                <div className="sub2">{t.status}{t.dueDate ? ` · vence ${relativo(t.dueDate)}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {campos.length > 0 && (
        <div className="ctx-sec">
          <div className="ctx-t">Campos del cliente</div>
          {campos.map((f) => (
            <div key={f.key} className="ctx-row">
              <span className="k">{f.name}</span>
              <span className="v">
                {f.type === 'boolean'
                  ? (cliente.customFieldValues[f.key] ? 'Sí' : 'No')
                  : String(cliente.customFieldValues[f.key])}
              </span>
            </div>
          ))}
        </div>
      )}

      {cliente.notes.trim() && (
        <div className="ctx-sec">
          <div className="ctx-t">Notas del cliente</div>
          <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed" style={{ color: 'var(--mq-muted)' }}>
            {cliente.notes.trim()}
          </p>
        </div>
      )}

      {/* Las membresías se muestran enteras en Comercial: repetirlas acá sería
          el mismo dato contado dos veces, que es justo lo que había antes. */}
      {cliente.subscriptions.length > 0 && (
        <div className="ctx-sec">
          <p className="text-[10.5px]" style={{ color: 'var(--mq-muted2)' }}>
            Sus {cliente.subscriptions.length === 1 ? 'membresía' : `${cliente.subscriptions.length} membresías`} y lo que
            debe están en la pestaña Comercial.
          </p>
        </div>
      )}
    </>
  );
}

/** Cuánto entra por mes con las membresías activas, por moneda. */
export function recurrentePorMoneda(cliente: ClienteVinculado | null): string {
  if (!cliente) return '';
  const mapa = new Map<string, number>();
  for (const s of cliente.subscriptions) {
    if (s.status !== 'active') continue;
    mapa.set(s.currency, (mapa.get(s.currency) ?? 0) + s.price);
  }
  return [...mapa.entries()].map(([moneda, cents]) => plata(cents, moneda)).join(' · ');
}
