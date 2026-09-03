'use client';

import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { deletePlan } from '../../admin-actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface DeletePlanButtonProps {
  id: number;
}

export function DeletePlanButton({ id }: DeletePlanButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este plan? Esta acción no se puede deshacer.')) {
      return;
    }

    startTransition(async () => {
      const result = await deletePlan(id);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Plan eliminado correctamente');
        router.refresh();
      }
    });
  };

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="text-destructive hover:bg-destructive/10"
      onClick={handleDelete}
      disabled={isPending}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
