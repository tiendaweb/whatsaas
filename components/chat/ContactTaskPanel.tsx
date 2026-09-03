'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, HelpCircle, ListTodo, Loader2, Sparkles } from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'sonner';

import { ConversationAiSummary } from '@/components/chat/ConversationAiSummary';
import { ContactTaskDetailModal } from '@/components/chat/ContactTaskDetailModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { cn } from '@/lib/utils';

type ContactTask = {
  id: number;
  title: string;
  notes: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  aiPrompt?: string;
  aiNextStep?: string;
  aiContextQuestion?: string;
  aiContextAnswer?: string;
  aiReadyAt?: string | null;
};

type TasksResponse = {
  enabled: boolean;
  contactId: number | null;
  tasks: ContactTask[];
};

type PluginNavItem = { href?: string };

async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'server_error');
  return data as T;
}

export function ContactTaskPanel({ chatId }: { chatId?: number | null }) {
  const t = useTranslations('chat_Sidebar.contact_tasks');
  const endpoint = chatId ? `/api/chats/${chatId}/tasks` : null;
  const { data, mutate } = useSWR<TasksResponse>(endpoint, jsonFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const { data: pluginNav } = useSWR<PluginNavItem[]>('/api/plugins/nav', jsonFetcher, {
    revalidateOnFocus: false,
  });
  const tasks = data?.tasks ?? [];
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const aiSummaryEnabled = pluginNav?.some((item) => item.href === '/plugins/ai-chat') ?? false;
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);

  const [answerFor, setAnswerFor] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  /**
   * Mismo interruptor que el botón de Tareas: encolar la tarea es lo que la
   * hace visible para ChatGPT/Grok/Claude. Sin esto, un próximo paso escrito
   * desde el chat no llegaba nunca a los conectores.
   */
  const patchAi = async (task: ContactTask, patch: Record<string, unknown>) => {
    if (!endpoint) return;
    setBusyId(task.id);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, ...patch }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'server_error');
      await mutate();
      setAnswerFor(null);
      setAnswer('');
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === 'prompt_required'
          ? t('ai_prompt_required')
          : t('update_error'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleTask = async (task: ContactTask) => {
    if (!endpoint) return;
    const nextStatus = task.status === 'done' ? 'open' : 'done';
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'server_error');
      await mutate();
      window.dispatchEvent(new CustomEvent('chat:task-updated', {
        detail: { taskId: task.id, status: nextStatus },
      }));
    } catch {
      toast.error(t('update_error'));
    }
  };

  if (!chatId) return null;
  if (!tasks.length) return aiSummaryEnabled ? <ConversationAiSummary chatId={chatId} /> : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center font-medium">
          <ListTodo className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{t('title')}</span>
        </h3>
        <span
          className="shrink-0 tabular-nums text-xs font-medium text-muted-foreground"
          aria-label={t('progress_label', { completed: completedTasks, total: tasks.length })}
          title={t('progress_label', { completed: completedTasks, total: tasks.length })}
        >
          {completedTasks}/{tasks.length}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {tasks.map((task) => {
          const done = task.status === 'done';
          return (
            <li key={task.id} className="flex items-start gap-3 py-2">
              <Checkbox
                checked={done}
                onCheckedChange={() => void toggleTask(task)}
                className="mt-0.5"
                aria-label={t(done ? 'reopen' : 'mark_done')}
                title={t(done ? 'reopen' : 'mark_done')}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <button
                  type="button"
                  onClick={() => setOpenTaskId(task.id)}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 break-words text-left text-sm font-medium leading-5 text-foreground hover:underline',
                    done && 'text-muted-foreground line-through',
                  )}
                >
                  {isRadarTaskTitle(task.title) && <RadarTag size="xs" />}
                  <span className="min-w-0 break-words">{radarTaskTitle(task.title)}</span>
                </button>

                {!done && (task.aiNextStep || task.aiContextQuestion || task.aiReadyAt || task.aiPrompt) ? (
                  <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/40 p-2">
                    {task.aiReadyAt ? (
                      <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        <Bot className="h-3 w-3" aria-hidden="true" />
                        {t('ai_queued')}
                      </p>
                    ) : null}
                    {task.aiNextStep ? (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          <span className="font-medium text-foreground">{t('ai_next_step')}: </span>
                          {task.aiNextStep}
                        </span>
                      </p>
                    ) : null}
                    {task.aiContextQuestion && !task.aiContextAnswer ? (
                      <div className="space-y-1.5">
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <HelpCircle className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                          <span className="min-w-0 break-words">
                            <span className="font-medium text-foreground">{t('ai_question')}: </span>
                            {task.aiContextQuestion}
                          </span>
                        </p>
                        {answerFor === task.id ? (
                          <div className="space-y-1.5">
                            <Textarea
                              value={answer}
                              onChange={(event) => setAnswer(event.target.value)}
                              rows={2}
                              maxLength={20000}
                              aria-label={t('ai_question')}
                              placeholder={t('ai_answer_placeholder')}
                              className="min-h-14 resize-none text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!answer.trim() || busyId === task.id}
                              onClick={() => void patchAi(task, { aiContextAnswer: answer.trim() })}
                            >
                              {busyId === task.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              {t('ai_answer_save')}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setAnswerFor(task.id);
                              setAnswer('');
                            }}
                          >
                            {t('ai_answer_save')}
                          </Button>
                        )}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={task.aiReadyAt ? 'secondary' : 'outline'}
                        className="h-7 gap-1 text-xs"
                        disabled={busyId === task.id}
                        onClick={() => void patchAi(task, { aiReady: !task.aiReadyAt })}
                      >
                        {busyId === task.id
                          ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          : <Bot className="h-3 w-3" aria-hidden="true" />}
                        {task.aiReadyAt ? t('ai_unqueue') : t('ai_queue')}
                      </Button>
                      {task.aiReadyAt ? (
                        <span className="text-[10px] leading-3 text-muted-foreground">{t('ai_queued_hint')}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {openTaskId != null && (
        <ContactTaskDetailModal
          taskId={openTaskId}
          onClose={() => {
            setOpenTaskId(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}
