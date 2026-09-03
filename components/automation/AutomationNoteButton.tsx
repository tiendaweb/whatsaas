"use client";

import React, { useState, useTransition } from "react";
import { StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { updateAutomationNote } from "@/app/[locale]/(dashboard)/automation/actions";

export function AutomationNoteButton({
  id,
  note,
  labels,
}: {
  id: number;
  note?: string | null;
  labels: {
    button: string;
    title: string;
    description: string;
    placeholder: string;
    cancel: string;
    save: string;
    error: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateAutomationNote(id, value);
        setOpen(false);
        window.location.reload();
      } catch {
        alert(labels.error);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(note ?? "");
          setOpen(true);
        }}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        title={labels.button}
      >
        <StickyNote className="h-3 w-3" />
        {labels.button}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
            <DialogDescription>{labels.description}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={labels.placeholder}
            className="min-h-32"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {labels.cancel}
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
