import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, Send, Paperclip, Trash2, Play, Pause, Square, Smile, Image as ImageIcon, FileText, Zap, X, Save } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { RecordingStatus, QuickReply } from './types';
import { formatTimer } from './utils';
import { useTranslations } from 'next-intl';
import { SaveDraftModal } from './SaveDraftModal';
import type { DraftItem } from '@/components/drafts/types';

interface ChatInputProps {
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
  onSendAttachment: (file: File) => void;
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
}

export function ChatInput({
  isInternalNote, setIsInternalNote, newMessage, setNewMessage, recordingStatus, recordingTime,
  onStartRecording, onStopRecording, onCancelRecording, onSendText, onSendAudio, onSendAttachment,
  audioUrl, isAudioPlaying, toggleAudioPlayback, audioPlayerRef,
  fileInputRef, handleFileIconClick, onEmojiClick,
  setQuickRepliesOpen, showQuickReplySuggestions, setShowQuickReplySuggestions, filteredQuickReplies,
  draftsShortcutsOpen, setDraftsShortcutsOpen, showDraftSuggestions, setShowDraftSuggestions, filteredDraftSuggestions, onPickDraft,
  isWindowExpired, onOpenTemplateDialog, isGroup
}: ChatInputProps) {
  const t = useTranslations('Chat');
  const showAudioUi = recordingStatus === 'recording' || recordingStatus === 'review';
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedQuickReplyIndex, setSelectedQuickReplyIndex] = useState(0);
  const [selectedDraftSuggestionIndex, setSelectedDraftSuggestionIndex] = useState(0);
  const [saveDraftModalOpen, setSaveDraftModalOpen] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const cancelAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const confirmAttachmentSend = () => {
    if (selectedFile) {
      onSendAttachment(selectedFile);
      cancelAttachment();
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (selectedQuickReplyIndex >= filteredQuickReplies.length) {
      setSelectedQuickReplyIndex(0);
    }
  }, [filteredQuickReplies, selectedQuickReplyIndex]);

  useEffect(() => {
    if (selectedDraftSuggestionIndex >= filteredDraftSuggestions.length) {
      setSelectedDraftSuggestionIndex(0);
    }
  }, [filteredDraftSuggestions, selectedDraftSuggestionIndex]);

  if (selectedFile) {
    const isImage = selectedFile.type.startsWith('image/');
    const isVideo = selectedFile.type.startsWith('video/');

    return (
      <div className="flex flex-col w-full bg-card border-t h-full min-h-[300px] relative z-20">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <span className="font-medium text-sm">{t('preview_title') || 'Preview'}</span>
          <Button variant="ghost" size="icon" onClick={cancelAttachment}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center p-4 bg-black/5 dark:bg-black/20 overflow-hidden relative">
          {isImage ? (
            <img src={previewUrl!} alt="Preview" className="max-h-[300px] max-w-full object-contain rounded-md shadow-sm" />
          ) : isVideo ? (
            <video src={previewUrl!} controls className="max-h-[300px] max-w-full rounded-md shadow-sm" />
          ) : (
            <div className="flex flex-col items-center gap-2 p-6 bg-background rounded-lg border shadow-sm">
              <FileText className="h-12 w-12 text-primary" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          )}
        </div>

        <div className="p-3 bg-card border-t flex justify-end items-center">
          <Button onClick={confirmAttachmentSend} className="bg-primary hover:bg-primary/90">
            <Send className="h-4 w-4 mr-2 text-white" />
            {t('send_button') || 'Enviar'}
          </Button>
        </div>
      </div>
    );
  }

  const windowExpiredAndNotInternal = isWindowExpired && !isInternalNote;

  return (
    <div className="flex flex-col w-full bg-card border-t">
      <div className="flex items-center px-4 pt-2 space-x-4 border-b pb-1">
        <button onClick={() => setIsInternalNote(false)} className={`text-sm font-medium pb-1 ${!isInternalNote ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{t('message_text')}</button>
        <button onClick={() => setIsInternalNote(true)} className={`text-sm font-medium pb-1 ${isInternalNote ? 'text-yellow-500 dark:text-yellow-400 border-b-2 border-yellow-500 dark:border-yellow-400' : 'text-muted-foreground hover:text-foreground'}`}>{t('internal_note_text')}</button>
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
      ) : (
        <div className={`flex items-end p-2 gap-2 ${isInternalNote ? 'bg-yellow-500/10 dark:bg-yellow-500/5' : 'bg-transparent'} min-h-[60px]`}>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />

          {!showAudioUi ? (
            <>
              {!isGroup && (
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground h-9 w-9 mb-1" onClick={() => setQuickRepliesOpen(true)}>
                  <Zap className="h-4 w-4" />
                </Button>
              )}
              {!isGroup && (
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground h-9 w-9 mb-1" onClick={() => setDraftsShortcutsOpen(!draftsShortcutsOpen)}>
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              {newMessage.trim() && !isGroup && (
                <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground h-9 w-9 mb-1 hover:text-primary" onClick={() => setSaveDraftModalOpen(true)} title={t('save_draft_button') || 'Guardar como borrador'}>
                  <Save className="h-4 w-4" />
                </Button>
              )}

              {!isInternalNote && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground h-9 w-9 mb-1">
                          <Paperclip className="h-5 w-5" />
                      </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="mb-1 w-56">
                    <DropdownMenuItem onClick={() => handleFileIconClick("image/*,video/*")}><ImageIcon className="mr-2 h-4 w-4" /><span>{t('photos_videos_item')}</span></DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFileIconClick(".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.stl")}><FileText className="mr-2 h-4 w-4" /><span>{t('document_item2')}</span></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground h-9 w-9 mb-1"><Smile className="h-5 w-5" /></Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-full p-0 border-none shadow-none bg-transparent">
                  <EmojiPicker onEmojiClick={onEmojiClick} />
                </PopoverContent>
              </Popover>
            </>
          ) : (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full shrink-0 mb-1" onClick={onCancelRecording}>
              <Trash2 className="h-5 w-5" />
            </Button>
          )}

          <div className="flex-1 relative flex items-center">
            {!showAudioUi ? (
              <>
                {showQuickReplySuggestions && (
                  <div className="absolute bottom-full mb-2 left-0 w-full bg-popover border shadow-lg rounded-md max-h-48 overflow-y-auto z-50">
                    {filteredQuickReplies.map((qr, index) => (
                      <div
                        key={qr.id}
                        className={`p-2 cursor-pointer text-sm border-b last:border-0 ${selectedQuickReplyIndex === index ? 'bg-muted' : 'hover:bg-muted'}`}
                        onMouseEnter={() => setSelectedQuickReplyIndex(index)}
                        onClick={() => {
                          setNewMessage(qr.content);
                          setShowQuickReplySuggestions(false);
                        }}
                      >
                        <span className="font-bold text-primary mr-2">/{qr.shortcut}</span>
                        <span className="text-muted-foreground truncate">{qr.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                {showDraftSuggestions && (
                  <div className="absolute bottom-full mb-2 left-0 w-full bg-popover border shadow-lg rounded-md max-h-48 overflow-y-auto z-50">
                    {filteredDraftSuggestions.map((draft, index) => (
                      <div
                        key={draft.id}
                        className={`p-2 cursor-pointer text-sm border-b last:border-0 ${selectedDraftSuggestionIndex === index ? 'bg-muted' : 'hover:bg-muted'}`}
                        onMouseEnter={() => setSelectedDraftSuggestionIndex(index)}
                        onClick={() => onPickDraft(draft)}
                      >
                        <span className="font-bold text-primary mr-2">##{draft.title}</span>
                        <span className="text-muted-foreground truncate">{draft.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Textarea
                  placeholder={isInternalNote ? t('add_internal_note_placeholder') : t('type_message_placeholder')}
                  className={`min-h-[40px] max-h-[120px] resize-none py-3 ${isInternalNote ? 'bg-background border-yellow-400 dark:border-yellow-600 focus-visible:ring-yellow-400' : 'bg-background rounded-2xl'}`}
                  value={newMessage}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!isInternalNote && value.trim() === '+++') {
                      window.dispatchEvent(new Event('chat:open-trigger-automation'));
                      setNewMessage('');
                      return;
                    }

                    setNewMessage(value);
                    setSelectedQuickReplyIndex(0);
                    setSelectedDraftSuggestionIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (showDraftSuggestions && filteredDraftSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedDraftSuggestionIndex((prev) => (prev + 1) % filteredDraftSuggestions.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedDraftSuggestionIndex((prev) => (prev - 1 + filteredDraftSuggestions.length) % filteredDraftSuggestions.length);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const selected = filteredDraftSuggestions[selectedDraftSuggestionIndex];
                        if (selected) onPickDraft(selected);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowDraftSuggestions(false);
                        return;
                      }
                    }

                    if (showQuickReplySuggestions && filteredQuickReplies.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedQuickReplyIndex((prev) => (prev + 1) % filteredQuickReplies.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedQuickReplyIndex((prev) => (prev - 1 + filteredQuickReplies.length) % filteredQuickReplies.length);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const selected = filteredQuickReplies[selectedQuickReplyIndex];
                        if (selected) {
                          setNewMessage(selected.content);
                          setShowQuickReplySuggestions(false);
                        }
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowQuickReplySuggestions(false);
                        return;
                      }
                    }

                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSendText(e);
                    }
                  }}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center gap-3 h-[42px] px-4 bg-background rounded-full border shadow-sm w-full mb-1">
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
            )}
          </div>

          <div className="flex items-center gap-1 mb-1">
            {!showAudioUi ? (
              newMessage.trim() ? (
                <Button onClick={onSendText} size="icon" className={`rounded-full h-9 w-9 ${isInternalNote ? 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700' : 'bg-primary hover:bg-primary/90'}`}>
                  <Send className="h-4 w-4 text-white" />
                </Button>
              ) : (
                !isInternalNote && (
                    <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground h-9 w-9" onClick={onStartRecording}>
                        <Mic className="h-5 w-5" />
                    </Button>
                )
              )
            ) : (
              recordingStatus === 'recording' ? (
                  <Button variant="destructive" size="icon" className="h-9 w-9 text-white rounded-full shadow-sm shrink-0" onClick={onStopRecording}>
                     <Square className="h-3 w-3 fill-current" />
                  </Button>
              ) : (
                  <Button size="icon" className="h-9 w-9 bg-primary hover:bg-primary/90 text-white rounded-full shadow-sm shrink-0" onClick={onSendAudio}>
                     <Send className="h-4 w-4 ml-0.5" />
                  </Button>
              )
            )}
          </div>
        </div>
      )}

      <SaveDraftModal
        open={saveDraftModalOpen}
        onOpenChange={setSaveDraftModalOpen}
        messageContent={newMessage}
      />
    </div>
  );
}
