import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const membershipsSettingsSchema = z.object({
  defaultCurrency: z.string().default('USD'),
});

const manifest: AppPluginManifest<typeof membershipsSettingsSchema> = {
  id: 'memberships',
  displayName: 'Membresías',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [
    { path: '/plugins/memberships/subscriptions', title: 'Suscripciones', scope: 'dashboard.page' },
    { path: '/plugins/memberships/plans', title: 'Planes', scope: 'dashboard.page' },
    { path: '/plugins/memberships/companies', title: 'Empresas', scope: 'dashboard.page' },
    { path: '/plugins/memberships', title: 'Membresías', scope: 'dashboard.page' },
  ],
  navItems: [
    {
      label: 'Suscripciones',
      href: '/plugins/memberships/subscriptions',
      icon: 'CreditCard',
      order: 57,
      requiredPermission: 'memberships.read',
    },
    {
      label: 'Planes',
      href: '/plugins/memberships/plans',
      icon: 'BadgeDollarSign',
      order: 58,
      requiredPermission: 'memberships.read',
    },
    {
      label: 'Empresas',
      href: '/plugins/memberships/companies',
      icon: 'Building2',
      order: 59,
      requiredPermission: 'memberships.read',
    },
  ],
  settingsSchema: membershipsSettingsSchema,
  featureFlags: [],
};

export default manifest;
