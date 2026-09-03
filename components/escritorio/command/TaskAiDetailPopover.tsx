'use client';

import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function TaskAiDetailPopover({
  open,
  onOpenChange,
  initialText,
  initialField = 'next-step',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText?: string;
  initialField?: 'next-step' | 'context-question';
  onConfirm: (field: 'next-step' | 'context-question' | 'context-answer', text: string) => void;
}) {
  const t = useTranslations('DesktopOperations');
  const [field, setField] = useState<'next-step' | 'context-question' | 'context-answer'>(initialField);
  const [text, setText] = useState(initialText ?? '');

  useEffect(() => {
    if (!open) return;
    setField(initialField);
    setText(initialText ?? '');
  }, [initialField, initialText, open]);

  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    onConfirm(field, clean);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-full text-xs">
          <Plus className="size-3.5" aria-hidden />
          {t('command.taskAi.add')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t('command.taskAi.title')}</p>
          <p className="text-xs text-muted-foreground">{t('command.taskAi.description')}</p>
        </div>
        <div className="space-y-1.5">
          <Label id="task-ai-field-label">{t('command.taskAi.type')}</Label>
          <Select value={field} onValueChange={(value) => setField(value as typeof field)}>
            <SelectTrigger className="w-full" aria-labelledby="task-ai-field-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="next-step">{t('command.taskAi.nextStep')}</SelectItem>
              <SelectItem value="context-question">{t('command.taskAi.contextQuestion')}</SelectItem>
              <SelectItem value="context-answer">{t('command.taskAi.contextAnswer')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-ai-detail">{t('command.taskAi.detail')}</Label>
          <Textarea
            id="task-ai-detail"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            maxLength={20000}
            placeholder={t(
              field === 'next-step'
                ? 'command.taskAi.nextStepPlaceholder'
                : field === 'context-question'
                  ? 'command.taskAi.questionPlaceholder'
                  : 'command.taskAi.answerPlaceholder',
            )}
          />
        </div>
        <Button type="button" className="w-full gap-2" disabled={!text.trim()} onClick={submit}>
          <Save className="size-4" aria-hidden />
          {t('command.taskAi.plan')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
