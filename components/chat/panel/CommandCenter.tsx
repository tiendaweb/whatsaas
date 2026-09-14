'use client';

import useSWR from 'swr';
import type { PanelChatSnapshot } from '@/lib/plugins/sales-ops/server/panel-chat';
import { GateBadge } from '@/lib/plugins/sales-ops/ui/components/GateBadge';
import { SituacionIcono } from '@/lib/plugins/sales-ops/ui/components/SituacionBadge';
import { esSituacion } from '@/lib/plugins/sales-ops/shared/situacion';

/**
 * Cómo ve el Command Center a este contacto, arriba del panel del chat.
 *
 * El Command Center clasifica cada conversación con dos símbolos que se
 * repiten en todas sus listas: el **gate** (G0…GX, dónde está en el circuito
 * comercial) y la **situación** (contestó, en cola, cobro, cliente…). Estaban
 * sólo adentro del Command Center: mientras contestabas un chat no había forma
 * de saber cómo estaba clasificado, y esa clasificación es la que decide qué
 * se le dice.
 *
 * Son los MISMOS componentes que usa el Command Center (`GateBadge`,
 * `SituacionIcono`), no una copia: el día que cambie el color de un gate tiene
 * que cambiar en los dos lados o los dos símbolos dejan de significar lo mismo.
 *
 * Si el equipo no tiene el Command Center, la consulta devuelve 403 y acá no
 * se dibuja nada.
 */

const fetcher = async (url: string): Promise<PanelChatSnapshot | null> => {
  const res = await fetch(url);
  // 403 = el equipo no tiene el Command Center; 404 = el chat no es suyo. En
  // los dos casos el panel sigue funcionando sin esta franja.
  if (!res.ok) return null;
  return res.json();
};

/** Trae el resumen del Command Center de un chat. `null` = no aplica. */
export function usePanelCommandCenter(chatId: number | null | undefined) {
  const { data, mutate } = useSWR<PanelChatSnapshot | null>(
    chatId ? `/api/plugins/sales-ops/contacts/${chatId}/panel` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120_000 },
  );
  return { snapshot: data ?? null, refrescar: mutate };
}

/** Cuánto trabajo hay encolado para este contacto. */
export function trabajoEnCola(snapshot: PanelChatSnapshot | null): number {
  if (!snapshot) return 0;
  return snapshot.cola.runs.length + snapshot.cola.acciones.length;
}

const TEMPERATURA: Record<string, string> = { hot: 'caliente', warm: 'tibio', cold: 'frío' };

export function CommandCenterChip({ snapshot }: { snapshot: PanelChatSnapshot | null }) {
  if (!snapshot) return null;

  // Sin analizar no hay nada que afirmar: se dice eso y no un gate en gris que
  // se lee como si el circuito lo hubiera clasificado.
  if (!snapshot.analizado) {
    return (
      <div className="ctx-row" style={{ paddingTop: 0 }}>
        <span className="k">Command Center</span>
        <span className="v" style={{ color: 'var(--mq-muted2)', fontWeight: 500 }}>sin analizar</span>
      </div>
    );
  }

  const situacion = esSituacion(snapshot.situacion) ? snapshot.situacion : null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <GateBadge gate={snapshot.gate} withLabel />
      {situacion && <SituacionIcono situacion={situacion} />}
      {snapshot.temperature && (
        <span className="chip" style={{ background: 'var(--mq-card3)', color: 'var(--mq-muted)' }}>
          {TEMPERATURA[snapshot.temperature] ?? snapshot.temperature}
        </span>
      )}
      {snapshot.priorityScore != null && snapshot.priorityScore > 0 && (
        <span className="chip mono" style={{ background: 'var(--mq-card3)', color: 'var(--mq-muted)' }} title="Prioridad del Command Center">
          P{snapshot.priorityScore}
        </span>
      )}
    </div>
  );
}

/**
 * Los números del análisis, en renglones.
 *
 * Van adentro de la pestaña Comercial y no en el encabezado: son para mirar
 * cuando ya decidiste que este contacto importa, no cada vez que abrís un chat.
 */
export function CommandCenterNumeros({ snapshot }: { snapshot: PanelChatSnapshot | null }) {
  if (!snapshot?.analizado) return null;
  const cotizado = snapshot.quotedPrice != null && snapshot.quotedPrice > 0;
  return (
    <>
      {cotizado && (
        <div className="ctx-row">
          <span className="k">Cotizado</span>
          {/*
            * `quoted_price` está en UNIDADES, no en centavos: dividirlo por 100
            * le decía "ARS 600" a alguien cotizado en $60.000.
            */}
          <span className="v mono">
            {snapshot.quotedCurrency ?? ''} {snapshot.quotedPrice!.toLocaleString('es-AR')}
          </span>
        </div>
      )}
      {snapshot.potentialValueUsd != null && snapshot.potentialValueUsd > 0 && (
        <div className="ctx-row">
          <span className="k">Valor potencial</span>
          <span className="v mono">USD {snapshot.potentialValueUsd.toLocaleString('es-AR')}</span>
        </div>
      )}
      {snapshot.followupsTotal != null && snapshot.followupsTotal > 0 && (
        <div className="ctx-row">
          <span className="k">Seguimientos</span>
          <span className="v mono">{snapshot.followupsTotal}</span>
        </div>
      )}
      {snapshot.intent && snapshot.intent !== 'ninguna' && (
        <div className="ctx-row">
          <span className="k">Intención</span>
          <span className="v">{snapshot.intent}{snapshot.intentScore ? ` (${snapshot.intentScore})` : ''}</span>
        </div>
      )}
      {snapshot.source && snapshot.source !== 'desconocido' && (
        <div className="ctx-row">
          <span className="k">Entró por</span>
          <span className="v">{snapshot.source}</span>
        </div>
      )}
      {snapshot.recommendedAction && (
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--mq-muted)' }}>
          <strong className="font-semibold" style={{ color: 'var(--mq-text)' }}>Sugerido: </strong>
          {snapshot.recommendedAction}
        </p>
      )}
    </>
  );
}
