import 'server-only';

import { requireReseller } from '@/lib/db/queries/resellers';
import type { Reseller, User } from '@/lib/db/schema';

export type ResellerActionContext = {
  user: User;
  reseller: Reseller;
};

/**
 * Envuelve las server actions del panel de reseller. El resellerId SIEMPRE sale de
 * la sesión, nunca del FormData: si el cliente pudiera mandarlo, un reseller podría
 * editar la marca, los precios o las credenciales de cobro de otro.
 */
export function withReseller<T>(
  action: (ctx: ResellerActionContext, formData: FormData) => Promise<T>,
) {
  return async (formData: FormData): Promise<T | { error: string }> => {
    const ctx = await requireReseller();
    if (!ctx) {
      return { error: 'No autorizado.' };
    }

    return action(ctx as ResellerActionContext, formData);
  };
}
