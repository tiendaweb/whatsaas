import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomers,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipSubscriptions,
} from '@/lib/db/schema';
import type { MembresiasEmpresa } from '../shared/api-types';

/**
 * Marcas, planes y suscripciones para las tres vistas de la cabina.
 *
 * Una sola consulta por tabla y una sola pasada: las tres pantallas comparten
 * el filtro de marca y los mismos totales, y separarlas en tres endpoints
 * hacía que el mismo número —cuántas suscripciones tiene un plan— se calculara
 * distinto en cada una.
 *
 * Las MONEDAS no se suman entre sí: el equipo cotiza en ARS, USD y PYG, y un
 * total único sería un número inventado. Cada corte se devuelve como lista por
 * moneda, igual que en el resto de Empresa.
 */
export async function getMembresiasEmpresa(teamId: number, marcaId: number | null): Promise<MembresiasEmpresa> {
  const hoy = new Date().toISOString().slice(0, 10);

  const [marcasFilas, planesFilas, subsFilas] = await Promise.all([
    db
      .select({
        id: teamMembershipCompanies.id,
        name: teamMembershipCompanies.name,
        status: teamMembershipCompanies.status,
        logoUrl: teamMembershipCompanies.logoUrl,
        website: teamMembershipCompanies.website,
        currencies: teamMembershipCompanies.currencies,
        defaultCurrency: teamMembershipCompanies.defaultCurrency,
      })
      .from(teamMembershipCompanies)
      .where(eq(teamMembershipCompanies.teamId, teamId))
      .orderBy(asc(teamMembershipCompanies.position), asc(teamMembershipCompanies.name)),
    db
      .select({
        id: teamMembershipPlans.id,
        name: teamMembershipPlans.name,
        companyId: teamMembershipPlans.companyId,
        price: teamMembershipPlans.price,
        currency: teamMembershipPlans.currency,
        prices: teamMembershipPlans.prices,
        billingType: teamMembershipPlans.billingType,
        billingLabel: teamMembershipPlans.billingLabel,
        visibility: teamMembershipPlans.visibility,
        status: teamMembershipPlans.status,
      })
      .from(teamMembershipPlans)
      // Los planes privados VIAJAN, aunque la lista arranque sin mostrarlos.
      // Filtrarlos acá parecía lo correcto —Empresa es la vista comercial y un
      // plan privado es el que no se ofrece—, pero esta misma pantalla tiene un
      // editor que escribe `visibility`: marcar uno como privado lo hacía
      // desaparecer de la lista y ya no había desde dónde volver a hacerlo
      // público. El ocultamiento es de la interfaz, que puede deshacerlo.
      .where(eq(teamMembershipPlans.teamId, teamId))
      .orderBy(asc(teamMembershipPlans.position), asc(teamMembershipPlans.name)),
    db
      .select({
        id: teamMembershipSubscriptions.id,
        numero: teamMembershipSubscriptions.subscriptionNumber,
        planId: teamMembershipSubscriptions.planId,
        planNombre: teamMembershipSubscriptions.planNameSnapshot,
        companyId: teamMembershipSubscriptions.companyId,
        cliente: teamCustomers.name,
        price: teamMembershipSubscriptions.price,
        currency: teamMembershipSubscriptions.currency,
        billingType: teamMembershipSubscriptions.billingType,
        status: teamMembershipSubscriptions.status,
        paymentStatus: teamMembershipSubscriptions.paymentStatus,
        startDate: teamMembershipSubscriptions.startDate,
        endDate: teamMembershipSubscriptions.endDate,
      })
      .from(teamMembershipSubscriptions)
      .leftJoin(teamCustomers, eq(teamCustomers.id, teamMembershipSubscriptions.customerId))
      .where(eq(teamMembershipSubscriptions.teamId, teamId))
      .orderBy(desc(teamMembershipSubscriptions.startDate))
      .limit(2000),
  ]);

  const deLaMarca = <T extends { companyId: number | null }>(fila: T) =>
    marcaId == null || fila.companyId === marcaId;

  const planes = planesFilas.filter(deLaMarca);
  const suscripciones = subsFilas.filter(deLaMarca);

  const activa = (s: (typeof subsFilas)[number]) => s.status === 'active';
  const porVencer = (s: (typeof subsFilas)[number]) => {
    if (!activa(s) || !s.endDate) return false;
    const dias = (Date.parse(`${s.endDate}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000;
    return dias >= 0 && dias <= 30;
  };

  const porMoneda = (filas: Array<{ price: number; currency: string }>) => {
    const mapa = new Map<string, number>();
    for (const fila of filas) {
      if (!fila.price) continue;
      const currency = (fila.currency || '').trim().toUpperCase() || 'ARS';
      mapa.set(currency, (mapa.get(currency) ?? 0) + fila.price);
    }
    return [...mapa.entries()].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents);
  };

  /** Lo que entra por mes: lo anual se prorratea, y sólo lo que sigue vivo. */
  const mensual = suscripciones.filter(activa).map((s) => ({
    price: s.billingType === 'annual' || s.billingType === 'yearly' ? Math.round(s.price / 12) : s.price,
    currency: s.currency,
  }));

  const suscripcionesPorPlan = new Map<number, number>();
  for (const s of subsFilas) {
    if (s.planId == null || !activa(s)) continue;
    suscripcionesPorPlan.set(s.planId, (suscripcionesPorPlan.get(s.planId) ?? 0) + 1);
  }

  return {
    marcas: marcasFilas.map((m) => {
      const susDeLaMarca = subsFilas.filter((s) => s.companyId === m.id);
      return {
        id: m.id,
        name: m.name,
        status: m.status,
        logoUrl: m.logoUrl,
        website: m.website,
        currencies: m.currencies ?? [],
        defaultCurrency: m.defaultCurrency,
        planes: planesFilas.filter((p) => p.companyId === m.id).length,
        // Los dos números, porque la lista de planes se puede ver con o sin los
        // privados y el contador de la marca tiene que coincidir con lo que la
        // pantalla está mostrando en ese momento.
        planesPublicos: planesFilas.filter((p) => p.companyId === m.id && p.visibility === 'public').length,
        activas: susDeLaMarca.filter(activa).length,
        porVencer: susDeLaMarca.filter(porVencer).length,
        recurrente: porMoneda(
          susDeLaMarca.filter(activa).map((s) => ({
            price: s.billingType === 'annual' || s.billingType === 'yearly' ? Math.round(s.price / 12) : s.price,
            currency: s.currency,
          })),
        ),
      };
    }),
    planes: planes.map((p) => ({
      id: p.id,
      name: p.name,
      companyId: p.companyId,
      marca: marcasFilas.find((m) => m.id === p.companyId)?.name ?? null,
      price: p.price,
      currency: p.currency,
      prices: p.prices ?? [],
      billingType: p.billingType,
      billingLabel: p.billingLabel,
      visibility: p.visibility,
      status: p.status,
      suscripciones: suscripcionesPorPlan.get(p.id) ?? 0,
    })),
    suscripciones: suscripciones.map((s) => ({
      id: s.id,
      numero: s.numero,
      cliente: s.cliente,
      plan: s.planNombre || null,
      companyId: s.companyId,
      marca: marcasFilas.find((m) => m.id === s.companyId)?.name ?? null,
      price: s.price,
      currency: s.currency,
      billingType: s.billingType,
      status: s.status,
      paymentStatus: s.paymentStatus,
      inicio: s.startDate,
      vence: s.endDate,
      porVencer: porVencer(s),
    })),
    totales: {
      marcas: marcasFilas.length,
      planes: planes.length,
      activas: suscripciones.filter(activa).length,
      porVencer: suscripciones.filter(porVencer).length,
      recurrente: porMoneda(mensual),
    },
  };
}
