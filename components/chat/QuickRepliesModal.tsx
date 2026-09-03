import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import useSWR, { useSWRConfig } from 'swr';
import { QuickReply } from './types';
import { fetcher } from './utils';

export function QuickRepliesModal({ open, onOpenChange }: { open: boolean, onOpenChange: (v: boolean) => void }) {
  const [shortcuts, setShortcuts] = useState<QuickReply[]>([]);
  const [newShortcut, setNewShortcut] = useState('');
  const [newContent, setNewContent] = useState('');
  const { mutate } = useSWRConfig();

  const { data } = useSWR<QuickReply[]>('/api/quick-replies', fetcher);

  useEffect(() => {
    if (data) setShortcuts(data);
  }, [data]);

  const handleAdd = async () => {
    if (!newShortcut || !newContent) return;
    const cleanShortcut = newShortcut.replace(/^\//, '').toLowerCase();

    try {
      const res = await fetch('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut: cleanShortcut, content: newContent })
      });
      if (!res.ok) throw new Error();
      const newReply = await res.json();
      setShortcuts([newReply, ...shortcuts]);
      setNewShortcut('');
      setNewContent('');
      mutate('/api/quick-replies');
      toast.success('Atajo agregado');
    } catch {
      toast.error('Error al agregar atajo');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch('/api/quick-replies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      setShortcuts(shortcuts.filter(s => s.id !== id));
      mutate('/api/quick-replies');
      toast.success('Atajo eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[500px] lg:max-w-[700px] max-h-[90dvh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
          <DialogTitle>Respuestas rápidas</DialogTitle>
          <DialogDescription>Administra tus atajos. Escribe /atajo para usarlos.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-4 gap-2">
            <Input placeholder="Atajo (ej. hola)" value={newShortcut} onChange={(e) => setNewShortcut(e.target.value)} className="col-span-1" />
            <Input placeholder="Contenido completo del mensaje..." value={newContent} onChange={(e) => setNewContent(e.target.value)} className="col-span-3" />
          </div>
          <Button onClick={handleAdd} disabled={!newShortcut || !newContent}>Agregar nuevo</Button>
          <div className="min-h-0 max-h-[300px] overflow-y-auto space-y-2 mt-2">
            {shortcuts.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2 border rounded bg-muted">
                <div>
                  <span className="font-bold text-primary mr-2">/{s.shortcut}</span>
                  <span className="text-sm text-muted-foreground truncate max-w-[250px] inline-block align-bottom">{s.content}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
