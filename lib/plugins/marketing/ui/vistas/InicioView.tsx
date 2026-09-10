'use client';

import { AlertTriangle, Eye, Megaphone, MousePointerClick, Send, Share2, Target, ClipboardList, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResumenMarketing } from '../../shared/api-types';
import type { Vista } from '../../shared/vistas';
import { CH, TONOS, type Tono } from '../estilo';
import { fmtCtr, fmtDesde, fmtDia, fmtInt, fmtMonto, fmtMontos } from '../componentes/format';
import { VacioEstado } from '../componentes/Estados';

/**
 * El panorama: lo que se gastó, lo que se mostró y lo que entró.
 *
 * El gasto va SIEMPRE por moneda y en renglones separados. Las cuentas de Meta
 * del equipo facturan en monedas distintas, y un único número "total gastado"
 * sería mentira.
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
  icono: typeof Megaphone;
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

export function InicioView({ data, onChangeVista }: { data: ResumenMarketing; onChangeVista: (v: Vista) => void }) {
  const { publicidad, difusion, publicaciones, captacion } = data;
  const hayPublicidad = publicidad.cuentas > 0;

  /**
   * ¿El último dato de Meta entra en el rango que se está mirando? Se compara
   * como texto `YYYY-MM-DD`, que es como viene la columna `date`.
   */
  const desde = new Date(Date.now() - data.rangoDias * 86_400_000).toISOString().slice(0, 10);
  const dentroDelRango = publicidad.ultimoDiaConDatos != null && publicidad.ultimoDiaConDatos >= desde;
  const datosViejos = publicidad.ultimoDiaConDatos == null || !dentroDelRango;

  return (
    <div className="space-y-5">
      <section aria-labelledby="mk-inversion" className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="mk-inversion" className={CH.titulo}>
            Últimos {data.rangoDias} días
          </h2>
          <span className={CH.ayuda}>Sincronizado {fmtDesde(publicidad.ultimaSync)}</span>
        </div>

        {/* Un panorama en cero se lee como "no se gastó nada". Cuando lo que
            pasa es que el sync no trae datos hace semanas, hay que decirlo:
            es la diferencia entre una decisión y un malentendido. */}
        {hayPublicidad && (datosViejos || publicidad.cuentasConProblema > 0) && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2" role="status">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-[11px] leading-snug text-muted-foreground">
              {datosViejos && (
                <>
                  El último dato de Meta es del <strong className="font-semibold text-foreground">{fmtDia(publicidad.ultimoDiaConDatos)}</strong>
                  {publicidad.ultimoDiaConDatos && !dentroDelRango && ', o sea fuera de este rango: los ceros de arriba son falta de sincronización, no falta de inversión'}.{' '}
                </>
              )}
              {publicidad.cuentasConProblema > 0 && (
                <>
                  {publicidad.cuentasConProblema} de {publicidad.cuentas} cuentas nunca sincronizaron o fallaron en el último intento.{' '}
                </>
              )}
              <a href="/plugins/meta-ads/cuentas" className="font-semibold text-foreground underline underline-offset-2">
                Revisar las cuentas
              </a>
            </p>
          </div>
        )}

        {hayPublicidad ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Bloque
              rotulo="Invertido"
              valor={publicidad.gasto.length ? fmtMonto(publicidad.gasto[0]) : '—'}
              ayuda={publicidad.gasto.length > 1 ? fmtMontos(publicidad.gasto.slice(1)) : `${fmtInt(publicidad.campanasActivas)} campañas activas`}
              icono={Megaphone}
              tono="violet"
              onClick={() => onChangeVista('anuncios')}
            />
            <Bloque rotulo="Impresiones" valor={fmtInt(publicidad.impresiones)} ayuda={`Alcance pagado`} icono={Eye} tono="sky" />
            <Bloque
              rotulo="Clicks"
              valor={fmtInt(publicidad.clicks)}
              ayuda={`CTR ${fmtCtr(publicidad.clicks, publicidad.impresiones)}`}
              icono={MousePointerClick}
              tono="indigo"
            />
            <Bloque
              rotulo="Resultados"
              valor={fmtInt(publicidad.resultados)}
              ayuda={publicidad.resultados > 0 && publicidad.gasto.length ? `${fmtMonto({ currency: publicidad.gasto[0].currency, cents: Math.round(publicidad.gasto[0].cents / publicidad.resultados) })} c/u` : 'Sin resultados en el rango'}
              icono={Target}
              tono="emerald"
            />
          </div>
        ) : (
          <VacioEstado
            titulo="Todavía no hay cuentas de Meta conectadas"
            ayuda="Conectá una cuenta publicitaria en Meta Ads y acá vas a ver el gasto y los resultados."
          />
        )}
      </section>

      {publicidad.top.length > 0 && (
        <section aria-labelledby="mk-campanas" className="space-y-2">
          <h2 id="mk-campanas" className={CH.titulo}>
            Dónde se fue la plata
          </h2>
          <div className={cn(CH.card, 'divide-y divide-border overflow-hidden')}>
            {publicidad.top.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.nombre}</p>
                  <p className={cn(CH.ayuda, 'truncate')}>
                    {c.cuenta ?? 'Sin cuenta'} · {c.estado}
                    {c.resultados > 0 && ` · ${fmtInt(c.resultados)} resultados`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{c.gasto ? fmtMonto(c.gasto) : '—'}</p>
                  <p className={CH.ayuda}>{c.costoPorResultado ? `${fmtMonto(c.costoPorResultado)} c/u` : `${fmtInt(c.clicks)} clicks`}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="mk-canales" className="space-y-2">
        <h2 id="mk-canales" className={CH.titulo}>
          Los otros canales
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Bloque
            rotulo="Difusión"
            valor={fmtInt(difusion.enviados)}
            ayuda={difusion.disponible ? `${fmtInt(difusion.campanas)} campañas · ${fmtInt(difusion.programadas)} programadas` : 'Función no habilitada'}
            icono={Send}
            tono="emerald"
            onClick={difusion.disponible ? () => onChangeVista('difusion') : undefined}
          />
          <Bloque
            rotulo="Publicaciones"
            valor={fmtInt(publicaciones.publicadas)}
            ayuda={publicaciones.cuentas > 0 ? `${fmtInt(publicaciones.programadas)} programadas` : 'Sin cuentas conectadas'}
            icono={Share2}
            tono="rose"
            onClick={() => onChangeVista('publicaciones')}
          />
          <Bloque
            rotulo="Leads de formularios"
            valor={fmtInt(captacion.enviosDelRango)}
            ayuda={`${fmtInt(captacion.envios)} en total · ${fmtInt(captacion.formularios)} formularios`}
            icono={ClipboardList}
            tono="amber"
            onClick={() => onChangeVista('formularios')}
          />
          <Bloque rotulo="Plantillas" valor={fmtInt(captacion.plantillas)} ayuda="Aprobadas de WhatsApp" icono={RefreshCw} tono="slate" />
        </div>
      </section>
    </div>
  );
}
