'use client';

import { AlertTriangle, Bot, KeyRound, MessageSquare, Plug, Wrench, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResumenIa } from '../../shared/api-types';
import type { Vista } from '../../shared/vistas';
import { CH, TONOS, type Tono } from '../estilo';
import { fmtDesde, fmtInt } from '../componentes/format';

/**
 * El panorama del cerebro: qué está prendido y con qué cuota.
 *
 * Cada bloque muestra lo activo grande y el total abajo, porque es la
 * diferencia que importa: 66 automatizaciones con 3 encendidas y 66 corriendo
 * son dos negocios distintos, y el número solo no lo dice.
 */

function Bloque({
  rotulo,
  valor,
  ayuda,
  icono: Icono,
  tono = 'slate',
  onClick,
}: {
  rotulo: string;
  valor: string;
  ayuda?: string;
  icono: typeof Bot;
  tono?: Tono;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(CH.card, 'flex flex-col gap-2 p-3 text-left', onClick && 'transition-colors hover:bg-muted/40')}
    >
      <div className="flex items-center gap-2">
        <span className={cn(CH.iconoCaja, TONOS[tono])}>
          <Icono className="size-5" aria-hidden />
        </span>
        <span className={CH.rotulo}>{rotulo}</span>
      </div>
      <span className={CH.numeroChico}>{valor}</span>
      {ayuda && <span className={CH.ayuda}>{ayuda}</span>}
    </Wrapper>
  );
}

export function InicioView({ data, onChangeVista }: { data: ResumenIa; onChangeVista: (v: Vista) => void }) {
  const { agente, funciones, automatizaciones, conectores, banco } = data;
  const conectoresActivos = conectores.filter((c) => c.activo);
  const sinKeys = banco.total === 0;

  return (
    <div className="space-y-5">
      {/* Lo primero que hay que saber: si el bot está contestando o no. */}
      <section aria-labelledby="ia-estado" className="space-y-2">
        <h2 id="ia-estado" className={CH.titulo}>
          Estado
        </h2>
        <div className={cn(CH.card, 'flex flex-wrap items-center gap-3 p-3')}>
          <span className={cn(CH.iconoCaja, agente.activo ? TONOS.emerald : TONOS.slate)}>
            <Bot className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              {agente.activo ? 'El agente está contestando' : 'El agente está apagado'}
            </p>
            <p className={CH.ayuda}>
              {agente.modelo ? `${agente.proveedor ?? 'IA'} · ${agente.modelo}` : 'Sin modelo configurado'}
              {agente.instrucciones > 0 ? ` · ${fmtInt(agente.instrucciones)} caracteres de instrucciones` : ' · sin instrucciones'}
            </p>
          </div>
          <a href="/settings/ai" className={cn(CH.chip, 'hover:bg-muted')}>
            Configurar
          </a>
        </div>
      </section>

      <section aria-labelledby="ia-piezas" className="space-y-2">
        <h2 id="ia-piezas" className={CH.titulo}>
          Las piezas
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Bloque
            rotulo="Automatizaciones"
            valor={fmtInt(automatizaciones.activas)}
            ayuda={`${fmtInt(automatizaciones.total)} creadas · ${fmtInt(automatizaciones.carpetas)} carpetas`}
            icono={Zap}
            tono="amber"
            onClick={() => onChangeVista('automatizaciones')}
          />
          <Bloque
            rotulo="Funciones"
            valor={fmtInt(funciones.integradasActivas + funciones.propiasActivas)}
            ayuda={`${fmtInt(funciones.integradas)} integradas · ${fmtInt(funciones.propias)} propias`}
            icono={Wrench}
            tono="violet"
            onClick={() => onChangeVista('funciones')}
          />
          <Bloque
            rotulo="Conectores"
            valor={fmtInt(conectoresActivos.length)}
            ayuda={conectoresActivos.length ? conectoresActivos.map((c) => c.label).join(' · ') : 'Ninguno activo'}
            icono={Plug}
            tono="sky"
            onClick={() => onChangeVista('conectores')}
          />
          <Bloque
            rotulo="Banco de APIs"
            valor={fmtInt(banco.activas)}
            ayuda={banco.apagadas > 0 ? `${fmtInt(banco.apagadas)} apagadas de ${fmtInt(banco.total)}` : `${fmtInt(banco.total)} claves`}
            icono={KeyRound}
            tono={banco.apagadas > 0 ? 'rose' : 'emerald'}
            onClick={() => onChangeVista('banco')}
          />
        </div>
      </section>

      {/* Avisos: lo que hace que la IA deje de contestar sin que nadie se entere. */}
      {(sinKeys || banco.conErrorReciente > 0 || (agente.activo && funciones.integradasActivas + funciones.propiasActivas === 0)) && (
        <section aria-labelledby="ia-avisos" className="space-y-2">
          <h2 id="ia-avisos" className={CH.titulo}>
            Para mirar
          </h2>
          <div className="space-y-2">
            {sinKeys && (
              <Aviso texto="No hay ninguna clave en el banco: todo lo que llame a la IA va a fallar apenas se acabe la cuota de la clave suelta." href="/plugins/gemini" />
            )}
            {banco.conErrorReciente > 0 && (
              <Aviso
                texto={`${banco.conErrorReciente} ${banco.conErrorReciente === 1 ? 'clave falló' : 'claves fallaron'} en las últimas 24 horas. Una clave que se apaga por cuota vuelve sola al día siguiente; una que falla por otra cosa, no.`}
                href="/plugins/gemini"
              />
            )}
            {agente.activo && funciones.integradasActivas + funciones.propiasActivas === 0 && (
              <Aviso texto="El agente está prendido pero no tiene ninguna función habilitada: puede conversar, no puede hacer nada." href="/settings/ai" />
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="ia-uso" className="space-y-2">
        <h2 id="ia-uso" className={CH.titulo}>
          Uso
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Bloque rotulo="Conversaciones con IA" valor={fmtInt(agente.sesiones)} ayuda="Chats con sesión abierta" icono={MessageSquare} tono="indigo" />
          <Bloque rotulo="Última clave usada" valor={fmtDesde(banco.ultimoUso)} ayuda="Del banco de Gemini" icono={KeyRound} />
          <Bloque
            rotulo="Último conector"
            valor={fmtDesde(conectores.find((c) => c.ultimoUso)?.ultimoUso ?? null)}
            ayuda={`${fmtInt(conectores.reduce((n, c) => n + c.credenciales, 0))} credenciales vivas`}
            icono={Plug}
          />
        </div>
      </section>
    </div>
  );
}

function Aviso({ texto, href }: { texto: string; href: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2" role="status">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p className="text-[11px] leading-snug text-muted-foreground">
        {texto}{' '}
        <a href={href} className="font-semibold text-foreground underline underline-offset-2">
          Revisar
        </a>
      </p>
    </div>
  );
}
