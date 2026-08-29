'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { ContactoCard, Etapa, Etiqueta, GrupoEtapas, Temperatura } from './tipos';
import { numeroDeJid, formatearNumero } from './utils';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
  return res.json();
};

type ChatCrudo = {
  id: number;
  remoteJid: string;
  instanceId: number | null;
  name: string | null;
  pushName: string | null;
  profilePicUrl: string | null;
  lastMessageText: string | null;
  lastMessageTimestamp: string | null;
  lastMessageFromMe: boolean | null;
  unreadCount: number | null;
  contact: {
    id: number;
    name: string | null;
    temperature?: string | null;
    isVip?: boolean | null;
    funnelStage: { id: number } | null;
    tags: Etiqueta[];
  } | null;
};

type KanbanMetadata = {
  metadata: Record<string, { customerIds: number[] }>;
};

type Membership = { role: string; permissions: Record<string, boolean | string> };

function temperaturaDe(value: string | null | undefined): Temperatura {
  return value === 'hot' || value === 'cold' ? value : 'warm';
}

export function aContactoCard(chat: ChatCrudo, metadata: KanbanMetadata['metadata'] | undefined): ContactoCard | null {
  if (!chat.remoteJid || chat.remoteJid.endsWith('@g.us')) return null;
  const numero = numeroDeJid(chat.remoteJid);
  const contact = chat.contact;
  const ts = chat.lastMessageTimestamp ? Date.parse(chat.lastMessageTimestamp) : NaN;
  const customerIds = contact ? metadata?.[String(contact.id)]?.customerIds ?? [] : [];

  return {
    contactId: contact?.id ?? null,
    chatId: chat.id,
    remoteJid: chat.remoteJid,
    instanceId: chat.instanceId ?? null,
    numero,
    nombre: (contact?.name || chat.name || chat.pushName || formatearNumero(numero) || numero).trim(),
    avatarUrl: chat.profilePicUrl || null,
    etapaId: contact?.funnelStage?.id ?? null,
    etiquetas: contact?.tags ?? [],
    unread: chat.unreadCount ?? 0,
    ultimoTexto: chat.lastMessageText ?? null,
    ultimoTs: Number.isFinite(ts) ? ts : null,
    ultimoEsMio: chat.lastMessageFromMe === true,
    temperatura: temperaturaDe(contact?.temperature),
    esVip: contact?.isVip === true,
    esCliente: customerIds.length > 0,
  };
}

export function useSeguimientoData() {
  const etapasSwr = useSWR<Etapa[]>('/api/funnel-stages', fetcher);
  const gruposSwr = useSWR<GrupoEtapas[]>('/api/funnel-stage-groups', fetcher);
  const chatsSwr = useSWR<ChatCrudo[]>('/api/chats?scope=kanban', fetcher);
  const metadataSwr = useSWR<KanbanMetadata>('/api/chats/kanban-metadata', fetcher);
  const tagsSwr = useSWR<Etiqueta[]>('/api/tags', fetcher);
  const teamSwr = useSWR<{ id: number }>('/api/team', fetcher);
  const membershipSwr = useSWR<Membership>('/api/team/membership', fetcher);

  const contactos = useMemo<ContactoCard[]>(() => {
    if (!Array.isArray(chatsSwr.data)) return [];
    const metadata = metadataSwr.data?.metadata;
    const out: ContactoCard[] = [];
    for (const chat of chatsSwr.data) {
      const card = aContactoCard(chat, metadata);
      if (card) out.push(card);
    }
    return out;
  }, [chatsSwr.data, metadataSwr.data]);

  const etapas = useMemo<Etapa[]>(
    () => (Array.isArray(etapasSwr.data) ? [...etapasSwr.data].sort((a, b) => a.order - b.order || a.id - b.id) : []),
    [etapasSwr.data],
  );

  const grupos = useMemo<GrupoEtapas[]>(
    () => (Array.isArray(gruposSwr.data) ? [...gruposSwr.data].sort((a, b) => a.order - b.order || a.id - b.id) : []),
    [gruposSwr.data],
  );

  const etiquetas = useMemo<Etiqueta[]>(
    () => (Array.isArray(tagsSwr.data) ? [...tagsSwr.data].sort((a, b) => a.name.localeCompare(b.name, 'es')) : []),
    [tagsSwr.data],
  );

  const puede = useMemo(() => {
    const m = membershipSwr.data;
    const owner = m?.role === 'owner';
    const p = m?.permissions ?? {};
    return {
      contactos: owner || p.contacts === true,
      enviar: owner || p.messagesSend === true,
      programar: owner || p.scheduledMessagesWrite === true,
      verProgramados: owner || p.scheduledMessagesRead === true,
    };
  }, [membershipSwr.data]);

  const isLoading = chatsSwr.isLoading || etapasSwr.isLoading;
  const error = chatsSwr.error || etapasSwr.error || null;

  const recargar = () => {
    void chatsSwr.mutate();
    void metadataSwr.mutate();
    void etapasSwr.mutate();
    void gruposSwr.mutate();
    void tagsSwr.mutate();
  };

  return {
    contactos,
    etapas,
    grupos,
    etiquetas,
    teamId: teamSwr.data?.id ?? null,
    puede,
    isLoading,
    error,
    recargar,
    mutateChats: chatsSwr.mutate,
  };
}
