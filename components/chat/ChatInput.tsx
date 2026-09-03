'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Bot, CheckSquare2, FileText, Image as ImageIcon, Loader2, Mic, Paintbrush, Paperclip, Pause, Play, Save, Send, Smile, Sparkles, SpellCheck, Square, Trash2, Wand2, Workflow, X, Zap } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { RecordingStatus, QuickReply } from './types';
import { formatTimer } from './utils';
import { useTranslations } from 'next-intl';
import { SaveDraftModal } from './SaveDraftModal';
import type { DraftItem } from '@/components/drafts/types';
import useSWR, { mutate as globalMutate } from 'swr';
import { toast } from 'sonner';

interface ChatInputProps {
  chatId?: number | null;
  isInternalNote: boolean;
  setIsInternalNote: (val: boolean) => void;
  newMessage: string;
  setNewMessage: (val: string) => void;
  recordingStatus: RecordingStatus;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onSendText: (e: React.FormEvent) => void;
  onSendAudio: () => void;
  onSendAttachment: (file: File, caption?: string) => void;
  audioUrl: string | null;
  isAudioPlaying: boolean;
  toggleAudioPlayback: () => void;
  audioPlayerRef: React.RefObject<HTMLAudioElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleFileIconClick: (accept: string) => void;
  onEmojiClick: (emojiData: EmojiClickData) => void;
  setQuickRepliesOpen: (val: boolean) => void;
  showQuickReplySuggestions: boolean;
  setShowQuickReplySuggestions: (val: boolean) => void;
  filteredQuickReplies: QuickReply[];
  draftsShortcutsOpen: boolean;
  setDraftsShortcutsOpen: (val: boolean) => void;
  showDraftSuggestions: boolean;
  setShowDraftSuggestions: (val: boolean) => void;
  filteredDraftSuggestions: DraftItem[];
  onPickDraft: (draft: DraftItem) => void;
  isWindowExpired?: boolean;
  onOpenTemplateDialog?: () => void;
  isGroup?: boolean;
  canUseChatActions?: boolean;
  improveReplyMode?: 'improve' | 'orthography' | 'stylize' | 'suggest';
  isImprovingReply?: boolean;
  onImproveReply?: (mode: 'improve' | 'orthography' | 'stylize') => void;
  onSuggestReply?: () => void;
  onToggleAiAgent?: () => void;
  onTriggerAutomation?: () => void;
}

export function ChatInput({
  chatId,
  isInternalNote, setIsInternalNote, newMessage, setNewMessage, recordingStatus, recordingTime,
  onStartRecording, onStopRecording, onCancelRecording, onSendText, onSendAudio, onSendAttachment,
  audioUrl, isAudioPlaying, toggleAudioPlayback, audioPlayerRef,
  fileInputRef, handleFileIconClick, onEmojiClick,
  setQuickRepliesOpen, showQuickReplySuggestions, setShowQuickReplySuggestions, filteredQuickReplies,
  draftsShortcutsOpen, setDraftsShortcutsOpen, showDraftSuggestions, setShowDraftSuggestions, filteredDraftSuggestions, onPickDraft,
  isWindowExpired, onOpenTemplateDialog, isGroup, canUseChatActions = false,
  improveReplyMode = 'improve', isImprovingReply = false, onImproveReply, onSuggestReply,
  onToggleAiAgent, onTriggerAutomation,
}: ChatInputProps) {
  const t = useTranslations('Chat');
  const showAudioUi = recordingStatus === 'recording' || recordingStatus === 'review';
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedQuickReplyIndex, setSelectedQuickReplyIndex] = useState(0);
  const [saveDraftModalOpen, setSaveDraftModalOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'message' | 'internal_note' | 'task'>(isInternalNote ? 'internal_note' : 'message');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const tasksEndpoint = chatId ? `/api/chats/${chatId}/tasks` : null;
  const { data: taskContext } = useSWR<{ enabled: boolean; contactId: number | null }>(
    tasksEndpoint,
    (url: string) => fetch(url).then(async (response) => response.ok ? response.json() : null),
    { revalidateOnFocus: false },
  );
  const isTask = composerMode === 'task';
  const canCreateContactTask = Boolean(taskContext?.enabled && taskContext.contactId);

  useEffect(() => {
    if (taskContext && !canCreateContactTask && composerMode === 'task') {
      setComposerMode('message');
    }
  }, [canCreateContactTask, composerMode, taskContext]);

  const openFilePreview = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setCaption('');
    setTimeout(() => captionRef.current?.focus(), 100);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      openFilePreview(e.target.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        const namedFile = new File([file], `imagen_${Date.now()}.${file.type.split('/')[1] || 'png'}`, { type: file.type });
        openFilePreview(namedFile);
      }
    }
  };

  const closeModal = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmSend = () => {
    if (selectedFile) {
      onSendAttachment(selectedFile, caption.trim() || undefined);
      closeModal();
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (selectedQuickReplyIndex >= filteredQuickReplies.length) setSelectedQuickReplyIndex(0);
  }, [filteredQuickReplies, selectedQuickReplyIndex]);

  // Draft suggestion index handling removed (now handled by full modal triggered with ##)

  const windowExpiredAndNotInternal = isWindowExpired && composerMode === 'message';

  const isImage = selectedFile?.type.startsWith('image/') ?? false;
  const isVideo = selectedFile?.type.startsWith('video/') ?? false;
  const hasMessage = Boolean(newMessage.trim());

  const renderAttachmentMenu = (className: string) => !isInternalNote && !isTask && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <Paperclip className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="mb-1 w-56">
        <DropdownMenuItem onClick={() => handleFileIconClick("image/*,video/*")}><ImageIcon className="mr-2 h-4 w-4" /><span>{t('photos_videos_item')}</span></DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleFileIconClick(".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.stl")}><FileText className="mr-2 h-4 w-4" /><span>{t('document_item2')}</span></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderEmojiButton = (className: string) => !isTask && (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-full p-0 border-none shadow-none bg-transparent">
        <EmojiPicker onEmojiClick={onEmojiClick} />
      </PopoverContent>
    </Popover>
  );

  const improveReplyActions = [
    { mode: 'improve' as const, label: t('improve_reply.button'), icon: Sparkles },
    { mode: 'orthography' as const, label: t('improve_reply.orthography_button'), icon: SpellCheck },
    { mode: 'stylize' as const, label: t('improve_reply.stylize_button'), icon: Paintbrush },
  ];

  const renderImproveReplyMenu = (className: string) => !isTask && !isInternalNote && onImproveReply && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          disabled={!canUseChatActions || !hasMessage || isImprovingReply}
          title={t('improve_reply.button')}
          aria-label={t('improve_reply.button')}
        >
          {isImprovingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="mb-1 w-52">
        {improveReplyActions.map(({ mode, label, icon: Icon }) => (
          <DropdownMenuItem key={mode} onSelect={() => onImproveReply(mode)}>
            {isImprovingReply && improveReplyMode === mode
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Icon className="mr-2 h-4 w-4" />}
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderSuggestReplyButton = (className: string) => !isTask && !isInternalNote && onSuggestReply && (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      disabled={!canUseChatActions || isImprovingReply}
      onClick={onSuggestReply}
      title={t('improve_reply.suggest_button')}
      aria-label={t('improve_reply.suggest_button')}
    >
      {isImprovingReply && improveReplyMode === 'suggest'
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <Sparkles className="h-4 w-4" />}
    </Button>
  );

  const renderUtilityButtons = (className: string) => !isTask && (
    <>
      {!isInternalNote && !isGroup && onToggleAiAgent && (
        <Button type="button" variant="ghost" size="icon" className={className} onClick={onToggleAiAgent} disabled={!canUseChatActions} title={t('ai_agent_title')} aria-label={t('ai_agent_title')}>
          <Bot className="h-4 w-4" />
        </Button>
      )}
      {!isInternalNote && !isGroup && onTriggerAutomation && (
        <Button type="button" variant="ghost" size="icon" className={className} onClick={onTriggerAutomation} disabled={!canUseChatActions} title={t('trigger_automation_btn')} aria-label={t('trigger_automation_btn')}>
          <Workflow className="h-4 w-4" />
        </Button>
      )}
      {!isGroup && (
        <Button variant="ghost" size="icon" className={className} onClick={() => setQuickRepliesOpen(true)} title="Respuestas rápidas">
          <Zap className="h-4 w-4" />
        </Button>
      )}
      {!isGroup && (
        <Button variant="ghost" size="icon" className={className} onClick={() => setDraftsShortcutsOpen(!draftsShortcutsOpen)} title="Borradores (##)">
          <FileText className="h-4 w-4" />
        </Button>
      )}
      {hasMessage && !isGroup && (
        <Button variant="ghost" size="icon" className={`${className} hover:text-primary`} onClick={() => setSaveDraftModalOpen(true)} title={t('save_draft_button') || 'Guardar como borrador'}>
          <Save className="h-4 w-4" />
        </Button>
      )}
    </>
  );

  const renderMessageTextarea = () => (
    <div className="flex-1 relative min-w-0">
      {showQuickReplySuggestions && (
        <div className="absolute bottom-full mb-2 left-0 w-full bg-popover border shadow-lg rounded-md max-h-48 overflow-y-auto z-50">
          {filteredQuickReplies.map((qr, index) => (
            <div
              key={qr.id}
              className={`p-2 cursor-pointer text-sm border-b last:border-0 ${selectedQuickReplyIndex === index ? 'bg-muted' : 'hover:bg-muted'}`}
              onMouseEnter={() => setSelectedQuickReplyIndex(index)}
              onClick={() => { setNewMessage(qr.content); setShowQuickReplySuggestions(false); }}
            >
              <span className="font-bold text-primary mr-2">/{qr.shortcut}</span>
              <span className="text-muted-foreground truncate">{qr.content}</span>
            </div>
          ))}
        </div>
      )}
      {/* Draft suggestions dropdown removed — use ## to open full modern library modal */}
      <Textarea
        placeholder={isTask ? t('task_placeholder') : isInternalNote ? t('add_internal_note_placeholder') : t('type_message_placeholder')}
        className={`min-h-[40px] max-h-[120px] resize-none py-2.5 ${isTask ? 'rounded-xl border-primary/40 bg-primary/5 focus-visible:ring-primary' : isInternalNote ? 'bg-background border-yellow-400 dark:border-yellow-600 focus-visible:ring-yellow-400' : 'bg-background rounded-2xl'}`}
        value={newMessage}
        onPaste={isTask ? undefined : handlePaste}
        onChange={(e) => {
          const value = e.target.value;
          if (composerMode === 'message' && value.trim() === '+++') {
            window.dispatchEvent(new Event('chat:open-trigger-automation'));
            setNewMessage('');
            return;
          }
          setNewMessage(value);
          setSelectedQuickReplyIndex(0);
        }}
        onKeyDown={(e) => {
          if (showQuickReplySuggestions && filteredQuickReplies.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedQuickReplyIndex((prev) => (prev + 1) % filteredQuickReplies.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedQuickReplyIndex((prev) => (prev - 1 + filteredQuickReplies.length) % filteredQuickReplies.length); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const selected = filteredQuickReplies[selectedQuickReplyIndex]; if (selected) { setNewMessage(selected.content); setShowQuickReplySuggestions(false); } return; }
            if (e.key === 'Escape') { e.preventDefault(); setShowQuickReplySuggestions(false); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isTask) void createTask(e);
            else onSendText(e);
          }
        }}
      />
    </div>
  );

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tasksEndpoint || !newMessage.trim() || isCreatingTask) return;
    setIsCreatingTask(true);
    try {
      const response = await fetch(tasksEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newMessage.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'server_error');
      setNewMessage('');
      await globalMutate(tasksEndpoint);
      window.dispatchEvent(new Event('chat:task-created'));
      toast.success(t('task_created'));
    } catch {
      toast.error(t('task_create_error'));
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleComposerSubmit = (event: React.FormEvent) => {
    if (isTask) void createTask(event);
    else onSendText(event);
  };

  return (
    <>
      {/* Media preview modal */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-lg w-full p-0 gap-0 overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">
            {isImage ? 'Enviar imagen' : isVideo ? 'Enviar video' : 'Enviar archivo'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Revisa el archivo adjunto, agrega un título opcional y envíalo al chat.
          </DialogDescription>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold text-sm">
              {isImage ? 'Enviar imagen' : isVideo ? 'Enviar video' : 'Enviar archivo'}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={closeModal}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Preview area */}
          <div className="flex items-center justify-center bg-black/5 dark:bg-black/20 min-h-[240px] max-h-[400px] overflow-hidden">
            {isImage && previewUrl ? (
              <img src={previewUrl} alt="Preview" className="max-h-[400px] max-w-full object-contain" />
            ) : isVideo && previewUrl ? (
              <video src={previewUrl} controls className="max-h-[400px] max-w-full" />
            ) : selectedFile ? (
              <div className="flex flex-col items-center gap-2 p-8">
                <FileText className="h-14 w-14 text-primary" />
                <span className="text-sm font-medium text-center">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            ) : null}
          </div>

          {/* Caption input + send */}
          <div className="flex items-end gap-2 px-3 py-3 border-t bg-card">
            <textarea
              ref={captionRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  confirmSend();
                }
              }}
              placeholder="Agrega un título…"
              rows={1}
              className="flex-1 resize-none bg-muted rounded-2xl px-4 py-2.5 text-sm outline-none border border-transparent focus:border-ring transition-colors min-h-[40px] max-h-[100px]"
              style={{ lineHeight: '1.4' }}
            />
            <Button
              size="icon"
              className="rounded-full h-10 w-10 shrink-0 bg-primary hover:bg-primary/90"
              onClick={confirmSend}
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Normal chat input */}
      <div className="flex flex-col w-full bg-card border-t">
        <div className="flex items-center px-4 pt-2 space-x-4 border-b pb-1">
          <button onClick={() => { setComposerMode('message'); setIsInternalNote(false); }} className={`text-sm font-medium pb-1 ${composerMode === 'message' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{t('message_text')}</button>
          <button onClick={() => { setComposerMode('internal_note'); setIsInternalNote(true); }} className={`text-sm font-medium pb-1 ${composerMode === 'internal_note' ? 'text-yellow-500 dark:text-yellow-400 border-b-2 border-yellow-500 dark:border-yellow-400' : 'text-muted-foreground hover:text-foreground'}`}>{t('internal_note_text')}</button>
          {canCreateContactTask ? (
            <button onClick={() => { setComposerMode('task'); setIsInternalNote(false); }} className={`text-sm font-medium pb-1 ${isTask ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              {t('task_text')}
            </button>
          ) : null}
        </div>

        {windowExpiredAndNotInternal ? (
          <div className="flex flex-col p-4 gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">{t('window_expired_title')}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t('window_expired_description')}</p>
            </div>
            <Button onClick={onOpenTemplateDialog} className="w-fit">
              {t('select_template_btn')}
            </Button>
          </div>
        ) : showAudioUi ? (
          /* Audio recording / review UI */
          <div className={`flex items-center p-2 gap-2 ${isInternalNote ? 'bg-yellow-500/10 dark:bg-yellow-500/5' : ''}`}>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full shrink-0" onClick={onCancelRecording}>
              <Trash2 className="h-5 w-5" />
            </Button>
            <div className="flex flex-1 items-center gap-3 h-[42px] px-4 bg-background rounded-full border shadow-sm">
              {recordingStatus === 'recording' ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
                  </span>
                  <span className="font-mono text-red-600 font-medium text-sm min-w-[40px]">{formatTimer(recordingTime)}</span>
                  <span className="text-xs text-muted-foreground animate-pulse hidden sm:inline">{t('recording_status_text')}</span>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-foreground hover:bg-muted rounded-full shrink-0" onClick={toggleAudioPlayback}>
                    {isAudioPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                  </Button>
                  {audioUrl && <audio ref={audioPlayerRef} src={audioUrl} className="hidden" />}
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden mx-2">
                    <div className={`h-full bg-primary ${isAudioPlaying ? 'animate-progress' : 'w-full'}`} style={{ width: '100%' }}></div>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono min-w-[35px] text-right">{formatTimer(recordingTime)}</span>
                </>
              )}
            </div>
            {recordingStatus === 'recording' ? (
              <Button variant="destructive" size="icon" className="h-9 w-9 text-white rounded-full shadow-sm shrink-0" onClick={onStopRecording}>
                <Square className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button size="icon" className="h-9 w-9 bg-primary hover:bg-primary/90 text-white rounded-full shadow-sm shrink-0" onClick={onSendAudio}>
                <Send className="h-4 w-4 ml-0.5" />
              </Button>
            )}
          </div>
        ) : (
          /* Normal text input */
          <>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />

            <div className={`md:hidden px-3 pb-3 pt-2 ${isInternalNote ? 'bg-yellow-500/10 dark:bg-yellow-500/5' : ''}`}>
              <div className="mb-2 flex items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-1.5 py-1 shadow-sm">
                <div className="flex items-center gap-1">
                  {renderAttachmentMenu("rounded-full text-muted-foreground h-9 w-9")}
                  {renderEmojiButton("rounded-full text-muted-foreground h-9 w-9")}
                  {renderImproveReplyMenu("rounded-full text-muted-foreground h-9 w-9")}
                  {renderSuggestReplyButton("rounded-full text-muted-foreground h-9 w-9")}
                </div>
                <div className="flex items-center gap-1">
                  {renderUtilityButtons("rounded-full text-muted-foreground h-9 w-9")}
                </div>
              </div>

              <div className="flex items-end gap-2">
                {renderMessageTextarea()}
                <Button
                  onClick={handleComposerSubmit}
                  size="icon"
                  disabled={!hasMessage || isCreatingTask}
                  className={`h-10 w-10 shrink-0 rounded-full ${isInternalNote ? 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700' : 'bg-primary hover:bg-primary/90'}`}
                >
                  {isCreatingTask ? <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" /> : isTask ? <CheckSquare2 className="h-4 w-4 text-primary-foreground" /> : <Send className="h-4 w-4 text-white" />}
                </Button>
                {!isInternalNote && !isTask && (
                  <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full text-muted-foreground" onClick={onStartRecording}>
                    <Mic className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>

            <div className={`hidden items-end gap-1 px-2 pb-2 pt-1.5 md:flex ${isInternalNote ? 'bg-yellow-500/10 dark:bg-yellow-500/5' : ''}`}>
              <div className="flex shrink-0 items-center gap-0.5 pb-1">
                {renderAttachmentMenu("rounded-full text-muted-foreground h-8 w-8")}
                {renderEmojiButton("rounded-full text-muted-foreground h-8 w-8")}
                {renderImproveReplyMenu("rounded-full text-muted-foreground h-8 w-8")}
                {renderSuggestReplyButton("rounded-full text-muted-foreground h-8 w-8")}
              </div>

              {renderMessageTextarea()}

              <div className="flex shrink-0 items-center gap-0.5 pb-1">
                {renderUtilityButtons("rounded-full text-muted-foreground h-8 w-8")}
                {hasMessage ? (
                  <Button onClick={handleComposerSubmit} size="icon" disabled={isCreatingTask} className={`rounded-full h-9 w-9 ${isInternalNote ? 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700' : 'bg-primary hover:bg-primary/90'}`}>
                    {isCreatingTask ? <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" /> : isTask ? <CheckSquare2 className="h-4 w-4 text-primary-foreground" /> : <Send className="h-4 w-4 text-white" />}
                  </Button>
                ) : (
                  !isInternalNote && !isTask && (
                    <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground h-9 w-9" onClick={onStartRecording}>
                      <Mic className="h-5 w-5" />
                    </Button>
                  )
                )}
              </div>
            </div>
          </>
        )}

        <SaveDraftModal
          open={saveDraftModalOpen}
          onOpenChange={setSaveDraftModalOpen}
          messageContent={newMessage}
        />
      </div>
    </>
  );
}
