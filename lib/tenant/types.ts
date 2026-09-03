import type { Branding, Reseller } from '@/lib/db/schema';

/**
 * Un tenant es siempre un reseller. La plataforma se representa con `null`,
 * no con un Tenant especial, para que el código tenga que decidir explícitamente
 * qué hacer en cada caso en vez de arrastrar un tenant "por defecto".
 */
export type Tenant = {
  resellerId: number;
  slug: string;
  companyName: string;
  status: string;
  hostname: string;
  branding: Branding | null;
  reseller: Reseller;
};
