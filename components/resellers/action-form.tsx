'use client';

import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

type ActionResult = {
  ok?: boolean;
  success?: boolean;
  error?: string;
  message?: string;
};

/**
 * Un <form action={serverAction}> en un Server Component exige que la action
 * devuelva void, así que no hay dónde mostrar el error. Este wrapper la ejecuta
 * con useActionState y convierte el resultado en un toast.
 */
export function ActionForm({
  action,
  children,
  className,
  successMessage = 'Guardado.',
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
}) {
  const [state, dispatch] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => action(formData),
    null,
  );

  useEffect(() => {
    if (!state) return;

    if (state.error || state.message) {
      // `message` solo llega acompañando a success:false en estas actions.
      if (state.error || state.success === false) {
        toast.error(state.error ?? state.message);
        return;
      }
    }

    if (state.ok || state.success) {
      toast.success(successMessage);
    }
  }, [state, successMessage]);

  return (
    <form action={dispatch} className={className}>
      {children}
    </form>
  );
}
