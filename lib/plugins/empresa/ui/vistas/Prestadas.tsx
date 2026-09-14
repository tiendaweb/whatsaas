'use client';

import { Info } from 'lucide-react';
import { CompaniesSection } from '@/lib/plugins/memberships/ui/CompaniesSection';
import { SalesDashboard } from '@/lib/plugins/sales/ui/SalesDashboard';
import { DealsBoard } from '@/lib/plugins/deals/ui/DealsBoard';
import { ContractsDashboard } from '@/lib/plugins/contracts/ui/ContractsDashboard';
import { LimiteDeError } from '../componentes/LimiteDeError';

/**
 * Las vistas que Empresa NO reescribe.
 *
 * Ventas, Oportunidades y Contratos ya existen y funcionan: son miles de
 * líneas con sus altas, sus bajas y sus validaciones. Empresa las agrupa —que es lo que faltaba— en vez de clonarlas;
 * copiar el formulario de un plan acá significaría mantener dos formularios de
 * plan y que el día que cambie uno el otro mienta.
 *
 * Cada una va adentro de su propio límite de error: son pantallas de otras apps
 * y un reventón suyo no puede llevarse el rail de Empresa, que es justo lo que
 * necesitás para irte a otro lado.
 */

/**
 * Aviso de que la lista de abajo no respeta el filtro de marca del rail.
 *
 * Se dice en lugar de esconderse. Estas pantallas son de otras apps y traen sus
 * propios datos; dejar el filtro puesto arriba mientras la lista muestra todo
 * haría creer que lo que se ve ya está recortado, y ese es el tipo de error que
 * termina en una decisión tomada sobre la mitad de los datos.
 */
function AvisoDeMarca({ marca, filtroPropio }: { marca: string | null; filtroPropio?: boolean }) {
  if (!marca) return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2" role="status">
      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Esta lista muestra <strong className="font-semibold text-foreground">todas las marcas</strong>, no sólo {marca}.
        {filtroPropio ? ' Usá el filtro de empresa de la propia lista para recortarla.' : ''}
      </p>
    </div>
  );
}

export function EmpresasView() {
  return (
    <LimiteDeError nombre="Empresas">
      <CompaniesSection />
    </LimiteDeError>
  );
}

export function VentasView({ marca }: { marca: string | null }) {
  return (
    <LimiteDeError nombre="Ventas">
      <AvisoDeMarca marca={marca} />
      <SalesDashboard />
    </LimiteDeError>
  );
}

export function OportunidadesView({ marca }: { marca: string | null }) {
  return (
    <LimiteDeError nombre="Oportunidades">
      <AvisoDeMarca marca={marca} />
      <DealsBoard />
    </LimiteDeError>
  );
}

export function ContratosView() {
  return (
    <LimiteDeError nombre="Contratos">
      <ContractsDashboard />
    </LimiteDeError>
  );
}
