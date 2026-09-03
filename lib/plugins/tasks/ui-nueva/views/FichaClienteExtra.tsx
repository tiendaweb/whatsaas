'use client';

import useSWR from 'swr';
import { ES } from '../i18n/es';

/**
 * Datos que la ficha necesita y que `/api/plugins/customers/[id]` no trae,
 * porque viven del lado del CONTACTO del CRM, no del cliente: etiquetas,
 * departamento, etapa del embudo, responsable, notas internas y la media de
 * la conversación. Se resuelven a partir del primer contacto vinculado.
 *
 * Cada fuente falla por separado a propósito: si Radar no está habilitado
 * para el usuario (devuelve 403) la pestaña lo dice, pero el resto de la
 * ficha sigue funcionando.
 */

const opcional = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export type ContactoDetalle = {
  id: number;
  name: string;
  chatId: number | null;
  remoteJid?: string;
  notes?: string | null;
  tags?: { id: number; name: string; color: string }[];
  assignedUser?: { id: number; name: string } | null;
  assignedDepartment?: { id: number; name: string } | null;
  funnelStage?: { id: number; name: string; emoji?: string | null } | null;
};

export type MensajeMedia = {
  id: string;
  mediaUrl?: string | null;
  mediaSeconds?: number | null;
  mediaCaption?: string | null;
  text?: string | null;
  timestamp: string;
  fromMe: boolean;
};

export type NotaInterna = {
  id: string;
  text?: string | null;
  timestamp: string;
  messageType?: string | null;
  isInternal?: boolean;
};

export type NotaCliente = {
  id: number;
  text: string;
  kind: 'note' | 'report' | string;
  source: 'user' | 'connector' | string;
  createdAt: string;
};

export function useFichaExtra(contactId: number | null, remoteJid: string | null, customerId?: number | null) {
  const { data: contacto } = useSWR<ContactoDetalle | null>(
    contactId ? `/api/contacts/${contactId}` : null,
    opcional,
    { revalidateOnFocus: false },
  );

  // El chatId sale del propio contacto, así que este pedido va encadenado:
  // SWR lo deja en espera (key null) hasta que el anterior resuelve.
  const chatId = contacto?.chatId ?? null;
  const { data: mensajes } = useSWR<NotaInterna[] | null>(
    chatId ? `/api/messages?chatId=${chatId}&limit=100` : null,
    opcional,
    { revalidateOnFocus: false },
  );

  const jid = remoteJid ? encodeURIComponent(remoteJid) : null;
  const { data: audios } = useSWR<MensajeMedia[] | null>(
    jid ? `/api/chats/media?jid=${jid}&type=audio` : null,
    opcional,
    { revalidateOnFocus: false },
  );
  const { data: imagenes } = useSWR<MensajeMedia[] | null>(
    jid ? `/api/chats/media?jid=${jid}&type=images` : null,
    opcional,
    { revalidateOnFocus: false },
  );

  // 403 cuando Radar no está habilitado: `opcional` lo convierte en null y la
  // pestaña muestra el aviso en vez de romper la ficha entera.
  const { data: radar } = useSWR<RadarCliente | null>(
    contactId ? `/api/plugins/radar/client/${contactId}` : null,
    opcional,
    { revalidateOnFocus: false },
  );

  const notasInternas = (mensajes ?? [])
    .filter((m) => m.isInternal && m.messageType !== 'task')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Bitácora del cliente: funciona con o sin conversación, que es el punto —
  // un cliente de AAPP sin chat no tiene notas internas de ningún tipo.
  const { data: bitacora, mutate: recargarBitacora } = useSWR<NotaCliente[] | null>(
    customerId ? `/api/plugins/customers/${customerId}/notes-log` : null,
    opcional,
    { revalidateOnFocus: false },
  );

  return {
    contacto: contacto ?? null,
    bitacora: bitacora ?? [],
    recargarBitacora,
    notasInternas,
    audios: audios ?? [],
    imagenes: imagenes ?? [],
    radar: radar ?? null,
  };
}

export type RadarCliente = {
  analyzed?: boolean;
  fields?: Record<string, string | null>;
  notes?: { text: string; date: string }[];
  tasks?: { id: number; title: string; status: string; projectName?: string }[];
  widgets?: { id: number; title?: string | null; key?: string }[];
  documents?: { id: number; title: string }[];
  reports?: { id: number; title?: string }[];
};

export function fechaCorta(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

export function Chips({ items }: { items: { id: number; name: string; color?: string }[] }) {
  if (!items.length) return <p className="text-sm text-[var(--t-muted)]">{ES.ficha.sinDatos}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.id}
          className="rounded-lg px-2 py-0.5 text-[11px] font-bold"
          style={item.color
            ? { backgroundColor: `${item.color}22`, color: item.color }
            : undefined}
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}
