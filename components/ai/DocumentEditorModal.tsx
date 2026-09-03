'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { getAttachmentContent, saveAttachmentContent } from '@/app/[locale]/(dashboard)/settings/ai/actions';

interface Attachment {
  name: string;
  url: string;
}

interface Props {
  attachment: Attachment | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (url: string, newSize: number) => void;
}

export function DocumentEditorModal({ attachment, isOpen, onClose, onSaved }: Props) {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !attachment) return;

    setIsLoading(true);
    setContent('');

    getAttachmentContent(attachment.url).then((result) => {
      if ('error' in result) {
        toast.error(result.error);
        onClose();
      } else {
        setContent(result.content);
      }
      setIsLoading(false);
    });
  }, [isOpen, attachment?.url]);

  const handleSave = async () => {
    if (!attachment) return;
    setIsSaving(true);

    const result = await saveAttachmentContent(attachment.url, content);

    if ('error' in result && result.error) {
      toast.error(result.error);
    } else {
      toast.success('Documento guardado');
      onSaved(attachment.url, new TextEncoder().encode(content).length);
    }

    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-screen w-screen max-h-none max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none">
        <DialogHeader className="flex flex-row items-center justify-between border-b bg-background px-6 py-3 space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="truncate max-w-[60vw]">{attachment?.name ?? ''}</span>
          </DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || isLoading}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={isSaving}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 h-full resize-none rounded-none border-0 font-mono text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
              spellCheck={false}
              autoFocus
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
