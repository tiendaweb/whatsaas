'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import { ChatEmbebido } from '@/components/chat/ChatEmbebido';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { fetcher } from '../components/format';
import { LimiteDeError } from './LimiteDeError';

export type CabeceraChat = { chatId: number; name: string; remoteJid: string; instanceId: number | null };

/**
 * La conversación del contacto, con el mismo encabezado en escritorio y en el
 * celular. Vive aparte para que las dos pantallas del Focus compartan una sola
 * versión: cuando estaba escrita adentro del layout de escritorio, la del
 * celular era una copia que se iba quedando atrás.
 */
export function PanelChat({ header, chatHref, className, aviso }: { header: CabeceraChat | null; chatHref: string | null; className?: string; aviso?: React.ReactNode }) {
  const { data: team } = useSWR<{ id: number } | null>('/api/team', fetcher);
  /**
   * Arranca prendido: un chat sin nuestros mensajes ni los de las
   * automatizaciones no es la conversación, es la mitad — y al leerlo parecía
   * que nunca le habíamos contestado.
   */
  const [verEnviados, setVerEnviados] = useState(true);

  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 pb-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Chat</h2>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
            <Checkbox checked={verEnviados} onCheckedChange={(v) => setVerEnviados(v === true)} className="size-3.5" aria-label="Ver los mensajes enviados" />
            Enviados
          </label>
          {chatHref && (
            <a href={chatHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              Abrir <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </div>

      {aviso}

      {!header?.remoteJid ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : (
        <LimiteDeError nombre="Chat">
          <ChatEmbebido
            key={header.remoteJid}
            remoteJid={header.remoteJid}
            instanceId={header.instanceId}
            chatId={header.chatId}
            nombre={header.name}
            teamId={team?.id ?? null}
            ocultarEnviados={!verEnviados}
            sinNota
            puedeEnviar
            className="min-h-0 flex-1"
          />
        </LimiteDeError>
      )}
    </section>
  );
}
