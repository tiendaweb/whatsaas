import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

/**
 * Empresa: el Command Center de la gestión del negocio.
 *
 * El Command Center opera clientes de a uno; Empresa mira el negocio entero
 * —las marcas, los planes, lo que se cobra y lo que falta cobrar— y agrupa las
 * aplicaciones que antes andaban sueltas por el lanzador.
 *
 * No tiene tablas propias a propósito: lee las que ya existen (empresas de
 * membresías, planes, suscripciones, clientes, ventas, oportunidades,
 * contratos, finanzas). Cambiar de opinión sobre qué se agrupa es editar
 * `SECTORES`, no migrar la base.
 */
const empresaSettingsSchema = z.object({
  /**
   * Marca elegida por defecto al entrar (id de `team_membership_companies`).
   * null = todas.
   */
  marcaPorDefecto: z.number().int().positive().nullable().default(null),
  /**
   * Marcas que no se muestran en el panorama ni en el filtro. Se usan para las
   * empresas que quedaron de un sync viejo y no son marcas del negocio.
   */
  marcasOcultas: z.array(z.number().int().positive()).default([]),
});

const manifest: AppPluginManifest<typeof empresaSettingsSchema> = {
  id: 'empresa',
  displayName: 'Empresa',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/empresa', title: 'Empresa', scope: 'dashboard.page' }],
  navItems: [
    {
      label: 'Empresa',
      order: 53,
      href: '/plugins/empresa',
      icon: 'Building2',
      requiredPermission: 'empresa.read',
    },
  ],
  settingsSchema: empresaSettingsSchema,
  featureFlags: [],
};

export default manifest;
export type EmpresaSettings = z.infer<typeof empresaSettingsSchema>;
