"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { deleteAutomation } from "@/app/[locale]/(dashboard)/automation/actions";

export function DeleteFlowButton({
  id,
  name,
  redirectTo,
}: {
  id: number;
  name: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!understood) return;
    setIsDeleting(true);
    try {
      await deleteAutomation(id);
      setOpen(false);
      if (redirectTo) {
        window.location.href = redirectTo;
      } else {
        window.location.reload();
      }
    } catch (e) {
      alert("Error al eliminar el flujo");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:bg-destructive/10 h-8 w-8"
        onClick={() => {
          setUnderstood(false);
          setOpen(true);
        }}
        title="Eliminar flujo"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar flujo</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres eliminar el flujo <strong>{name}</strong>?
              Esta acción eliminará permanentemente el flujo y todas sus conexiones.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center space-x-2 py-4 border border-destructive/30 bg-destructive/5 p-3 rounded">
            <Checkbox
              id="confirm-delete"
              checked={understood}
              onCheckedChange={(checked) => setUnderstood(!!checked)}
            />
            <Label htmlFor="confirm-delete" className="text-sm font-medium text-destructive cursor-pointer">
              Entiendo que esta acción no se puede deshacer
            </Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!understood || isDeleting}
            >
              {isDeleting ? "Eliminando..." : "Eliminar flujo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
