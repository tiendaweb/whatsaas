'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Send, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type WabaTemplate = {
  id: number;
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
};

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendTemplate: (templateId: number, variables: Record<string, string>) => Promise<void>;
}

export function TemplateDialog({ open, onOpenChange, onSendTemplate }: TemplateDialogProps) {
  const t = useTranslations('Chat');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  const { data: templates } = useSWR<WabaTemplate[]>(
    open ? '/api/templates/list' : null,
    fetcher
  );

  const approvedTemplates = templates?.filter(tp => tp.status === 'APPROVED') || [];
  const selectedTemplate = templates?.find(tp => tp.id.toString() === selectedTemplateId);

  const templateVarCount = selectedTemplate
    ? (selectedTemplate.components?.find((c: any) => c.type === 'BODY')?.text?.match(/\{\{(\d+)\}\}/g)?.length || 0)
    : 0;

  const templatePreview = selectedTemplate
    ? (() => {
        let text = selectedTemplate.components?.find((c: any) => c.type === 'BODY')?.text || selectedTemplate.name;
        if (templateVarCount > 0) {
          text = text.replace(/\{\{(\d+)\}\}/g, (_: string, num: string) => templateVariables[num] || `{{${num}}}`);
        }
        return text;
      })()
    : '';

  const handleSend = async () => {
    if (!selectedTemplateId) return;
    setIsSending(true);
    try {
      await onSendTemplate(parseInt(selectedTemplateId), templateVariables);
      handleClose();
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setSelectedTemplateId('');
    setTemplateVariables({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-[480px] lg:max-w-[600px] max-h-[90dvh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
          <DialogTitle>{t('select_template_label')}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="flex flex-col gap-4">
          <Select value={selectedTemplateId} onValueChange={(val) => { setSelectedTemplateId(val); setTemplateVariables({}); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('choose_template_placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {approvedTemplates.map(tp => (
                <SelectItem key={tp.id} value={tp.id.toString()}>
                  {tp.name} ({tp.language})
                </SelectItem>
              ))}
              {approvedTemplates.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">{t('no_approved_templates')}</div>
              )}
            </SelectContent>
          </Select>

          {selectedTemplate && templateVarCount > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">{t('template_variables_label')}</p>
              {Array.from({ length: templateVarCount }, (_, i) => (
                <Input
                  key={i + 1}
                  placeholder={t('value_for_variable_placeholder', { variable: `{{${i + 1}}}` })}
                  value={templateVariables[(i + 1).toString()] || ''}
                  onChange={(e) => setTemplateVariables(prev => ({ ...prev, [(i + 1).toString()]: e.target.value }))}
                />
              ))}
            </div>
          )}

          {selectedTemplate && (
            <div className="bg-muted/50 rounded-md p-3 text-sm text-foreground whitespace-pre-wrap border">
              {templatePreview}
            </div>
          )}
        </div>
        </div>

        <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={handleClose}>{t('cancel_btn')}</Button>
          <Button
            onClick={handleSend}
            disabled={!selectedTemplateId || isSending}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {t('send_template_btn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
