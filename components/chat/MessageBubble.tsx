import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, CheckCheck, Check, Loader2, FileText, User, MapPin, CornerUpLeft, Download, FilePenLine, MousePointerClick, Info, Bot, Zap, Megaphone, AlertCircle, RefreshCw, SmilePlus, Plus, Save, Play, Clock, ListTodo, Radar as RadarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { CustomAudioPlayer } from '@/components/ui/custom-audio-player';
import { Message, Reaction } from './types';
import { formatBytes } from './utils';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import {
  isRadarNoteText,
  isRadarTaskTitle,
  radarNoteBody,
  radarNoteHeadline,
  radarTaskTitle,
} from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';

const hardWrapStyle: React.CSSProperties = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

function ReadReceipt({ status, isInternal }: { status?: string | null, isInternal?: boolean }) {
  if (isInternal) return null;
  if (status === 'error') return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (status === 'read') return <CheckCheck className="h-4 w-4 text-blue-500 dark:text-blue-400" />;
  if (status === 'delivered') return <CheckCheck className="h-4 w-4 text-muted-foreground" />;
  if (status === 'sent') return <Check className="h-4 w-4 text-muted-foreground" />;
  if (status === 'sending') return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
  return <Check className="h-4 w-4 text-muted-foreground" />;
}

function QuotedMessagePreview({ quotedJson }: { quotedJson: string | null }) {
  const t = useTranslations('Chat');
  if (!quotedJson) return null;
  let quotedData: any = null;
  try { quotedData = JSON.parse(quotedJson); } catch (e) { return <p className="text-sm text-foreground line-clamp-2 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{quotedJson}</p>; }
  if (!quotedData) return null;

  if (quotedData.messageType === 'imageMessage' && quotedData.mediaUrl) {
    return (<div className="flex items-center gap-2 min-h-[40px] min-w-0"><img src={quotedData.mediaUrl} alt="Reply" className="h-10 w-10 rounded object-cover shrink-0" /><p className="text-sm text-foreground line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{quotedData.text || t('image_item')}</p></div>);
  }
  if (quotedData.messageType === 'videoMessage' && quotedData.mediaUrl) {
    return (
      <div className="flex items-center gap-2 min-h-[40px] min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-background">
          <Play className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-foreground line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{quotedData.text || t('video_item')}</p>
      </div>
    );
  }
  if (quotedData.messageType === 'stickerMessage' && quotedData.mediaUrl) {
    return (<div className="flex items-center gap-2 min-h-[40px] min-w-0"><img src={quotedData.mediaUrl} alt="Reply Sticker" className="h-10 w-10 shrink-0 object-contain" /><p className="text-sm text-foreground line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{t('sticker_item')}</p></div>);
  }
  if (quotedData.messageType === 'audioMessage') {
    return (<div className="flex items-center gap-2 text-foreground min-h-[40px] min-w-0"><Mic className="h-4 w-4 flex-shrink-0" /><p className="text-sm line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{t('audio_item')}</p></div>);
  }
  if (quotedData.messageType === 'documentMessage') {
    return (<div className="flex items-center gap-2 text-foreground min-h-[40px] min-w-0"><FileText className="h-4 w-4 flex-shrink-0" /><p className="text-sm line-clamp-2 min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{quotedData.text || t('document_item')}</p></div>);
  }
  return <p className="text-sm text-foreground line-clamp-2 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{quotedData.text || t('message_item')}</p>;
}

const FormattedText = ({ text, highlight }: { text: string, highlight: string }) => {
  if (!text) return null;
  const parts = highlight.trim() ? text.split(new RegExp(`(${highlight})`, 'gi')) : [text];
  return (
    <span className="block min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]" style={{ ...hardWrapStyle, whiteSpace: 'pre-wrap' }}>
      {parts.map((part, i) => {
        const isHighlight = highlight.trim() && part.toLowerCase() === highlight.toLowerCase();
        const formatParts = part.split(/(\*.*?\*|_.*?_)/g);
        return (
          <span key={i} className={isHighlight ? "bg-yellow-300 dark:bg-yellow-700 text-black dark:text-white" : ""}>
            {formatParts.map((subPart, j) => {
              if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) return <strong key={j}>{subPart.slice(1, -1)}</strong>;
              if (subPart.startsWith('_') && subPart.endsWith('_') && subPart.length > 2) return <em key={j}>{subPart.slice(1, -1)}</em>;
              return subPart;
            })}
          </span>
        );
      })}
    </span>
  );
};

function InteractiveMessage({ text, metadataJson }: { text: string, metadataJson: string | null }) {
    const t = useTranslations('Chat');
    let interactive: any = null;
    try {
        if (metadataJson) interactive = JSON.parse(metadataJson);
    } catch (e) {}

    return (
        <div className="flex w-full max-w-full flex-col gap-2 min-w-0 sm:w-[200px] sm:max-w-full">
            <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{text}</p>

            {interactive?.footer && (
                <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{interactive.footer.text}</p>
            )}

            <div className="flex flex-col gap-2 mt-1 w-full">
                {interactive?.type === 'button' && interactive.action?.buttons?.map((btn: any, idx: number) => (
                    <div key={idx} className="bg-background/50 border border-border/50 rounded-md p-2 text-center text-sm font-medium text-primary shadow-sm break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>
                        {btn.reply?.title}
                    </div>
                ))}

                {interactive?.type === 'list' && (
                    <div className="bg-background/50 border border-border/50 rounded-md overflow-hidden shadow-sm">
                        <div className="p-2 text-center text-sm font-medium text-primary border-b border-border/50 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>
                            {interactive.action?.button || t('menu_item')}
                        </div>
                        {interactive.action?.sections?.map((section: any, sIdx: number) => (
                            <div key={sIdx} className="p-2">
                                {section.title && <p className="text-xs font-bold text-muted-foreground mb-1 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{section.title}</p>}
                                {section.rows?.map((row: any, rIdx: number) => (
                                    <div key={rIdx} className="text-xs p-1.5 hover:bg-muted rounded cursor-default min-w-0">
                                        <span className="font-medium block break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{row.title}</span>
                                        {row.description && <span className="text-muted-foreground text-[10px] break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{row.description}</span>}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function ReactionsDisplay({ reactions, onReact, isMe }: { reactions: Reaction[]; onReact: (emoji: string) => void; isMe: boolean }) {
  if (!reactions || reactions.length === 0) return null;

  const grouped = reactions.reduce<Record<string, { count: number; names: string[]; hasMyReaction: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, names: [], hasMyReaction: false };
    acc[r.emoji].count++;
    if (r.fromMe) {
      acc[r.emoji].hasMyReaction = true;
    } else if (r.participantName) {
      acc[r.emoji].names.push(r.participantName);
    } else if (r.remoteJid) {
      acc[r.emoji].names.push(r.remoteJid.split('@')[0]);
    }
    return acc;
  }, {});

  return (
    <div className={`absolute -bottom-3 flex gap-0.5 ${isMe ? 'left-1' : 'left-1'}`}>
      {Object.entries(grouped).map(([emoji, data]) => (
        <button
          key={emoji}
          onClick={() => onReact(data.hasMyReaction ? '' : emoji)}
          className="inline-flex items-center gap-0.5 px-0.5 py-0.5 rounded-full text-[11px] bg-background/90 dark:bg-zinc-800 shadow-md backdrop-blur-sm transition-colors cursor-pointer hover:bg-muted"
          title={data.names.length > 0 ? data.names.join(', ') : undefined}
        >
          <span className="text-sm leading-none">{emoji}</span>
          {data.count > 1 && <span className="text-[10px] text-muted-foreground font-medium">{data.count}</span>}
        </button>
      ))}
    </div>
  );
}

function ReactionPicker({ onReact, isMe, onClose }: { onReact: (emoji: string) => void; isMe: boolean; onClose: () => void }) {
  const [showFullPicker, setShowFullPicker] = useState(false);

  if (showFullPicker) {
    return (
      <EmojiPicker
        onEmojiClick={(emojiData: EmojiClickData) => {
          onReact(emojiData.emoji);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-0.5 bg-popover border shadow-lg rounded-full px-1.5 py-1">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onReact(emoji);
            onClose();
          }}
          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-base hover:scale-125 active:scale-95"
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={() => setShowFullPicker(true)}
        className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

interface MessageBubbleProps {
  msg: Message;
  onMediaClick: (messageId: string) => void;
  onReply: (message: Message) => void;
  onRetry?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onSaveDraft?: (content: string) => void;
  onToggleTask?: (taskId: number, currentStatus: string) => void;
  searchQuery: string;
  userBubbleColor?: string;
  contactBubbleColor?: string;
  isGroup?: boolean;
}

export function MessageBubble({ msg, onMediaClick, onReply, onRetry, onReact, onSaveDraft, onToggleTask, searchQuery, userBubbleColor, contactBubbleColor, isGroup }: MessageBubbleProps) {
  const t = useTranslations('Chat');
  if (msg.messageType === 'system') {
      let displayText = msg.text || '';
      if (displayText.startsWith('@@')) {
          const parts = displayText.slice(2).split('|');
          const key = parts[0];
          const params: Record<string, string> = {};
          for (let i = 1; i < parts.length; i++) {
              const eqIdx = parts[i].indexOf('=');
              if (eqIdx > 0) {
                  params[parts[i].slice(0, eqIdx)] = parts[i].slice(eqIdx + 1);
              }
          }
          try {
              displayText = t(key, params);
          } catch {
              displayText = msg.text || '';
          }
      }
      return (
          <div className="flex w-full max-w-full justify-center my-3 min-w-0">
              <div className="flex max-w-full min-w-0 items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                  <Info className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{displayText}</span>
              </div>
          </div>
      );
  }

  const isMe = msg.fromMe;
  const isTask = msg.messageType === 'task';
  let taskMetadata: { taskId?: number; status?: string } = {};
  if (isTask && msg.quotedMessageText) {
    try {
      taskMetadata = JSON.parse(msg.quotedMessageText);
    } catch {}
  }
  const taskDone = taskMetadata.status === 'done';
  const isInternal = Boolean(msg.isInternal) && !isTask;
  // La detección va contra el texto original: el encabezado `🎯 RADAR …` sigue
  // guardado en el mensaje, acá sólo se decide cómo pintarlo.
  const isRadarNote = isInternal && isRadarNoteText(msg.text);
  const isAi = msg.isAi;
  const isAutomation = msg.isAutomation;
  const isCampaign = msg.messageType === 'campaign';
  const isScheduled = msg.messageType === 'scheduled';
  const isAappSpaceScheduled = msg.messageType === 'scheduled_aapp_space';
  const isError = msg.status === 'error';

  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
  const [isHovered, setIsHovered] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const showActions = isHovered || reactionPickerOpen;
  const isTextOnlyMessage = ['text', 'conversation', 'extendedTextMessage', 'scheduled', 'scheduled_aapp_space'].includes(msg.messageType || '') && !!msg.text?.trim();

  const hasCustomTheme = !!(userBubbleColor || contactBubbleColor);
  let bubbleColor = isMe ? 'bg-primary/10' : 'bg-card';
  let borderColor = '';
  let bubbleStyle: React.CSSProperties = {
    ...hardWrapStyle,
    maxWidth: 'min(70%, 42rem)',
  };

  if (isError) {
      bubbleColor = 'bg-red-500/10 dark:bg-red-500/5';
      borderColor = 'border border-red-500/30';
  } else if (isTask) {
      bubbleColor = 'bg-primary/5';
      borderColor = 'border border-primary/20';
  } else if (isRadarNote) {
      bubbleColor = 'bg-indigo-500/10 dark:bg-indigo-500/5';
      borderColor = 'border border-indigo-500/25';
  } else if (isInternal) {
      bubbleColor = 'bg-yellow-500/10 dark:bg-yellow-500/5';
      borderColor = 'border border-yellow-500/20';
  } else if (isAi) {
      bubbleColor = 'bg-purple-500/10 dark:bg-purple-500/5';
      borderColor = 'border border-purple-500/20';
  } else if (isCampaign) {
      bubbleColor = 'bg-emerald-500/10 dark:bg-emerald-500/5';
      borderColor = 'border border-emerald-500/20';
  } else if (isAutomation) {
      bubbleColor = 'bg-blue-500/10 dark:bg-blue-500/5';
      borderColor = 'border border-blue-500/20';
  } else if (hasCustomTheme) {
      bubbleColor = '';
      bubbleStyle = {
        ...bubbleStyle,
        backgroundColor: isMe ? userBubbleColor : contactBubbleColor,
      };
  }

  const renderTemplateButtons = (templateJson: any) => {
      const template = templateJson?.hydratedTemplate;
      if (!template || !template.hydratedButtons) return null;

      return (
          <div className="flex flex-col gap-2 mt-2 w-full">
              {template.hydratedButtons.map((btn: any, idx: number) => {
                  let label = '';
                  if (btn.quickReplyButton) {
                      label = btn.quickReplyButton.displayText;
                  } else if (btn.urlButton) {
                      label = `迫 ${btn.urlButton.displayText}`;
                  } else if (btn.callButton) {
                      label = `到 ${btn.callButton.displayText}`;
                  }

                  return (
                      <div key={idx} className="bg-card/80 border rounded-md p-2 text-center text-sm font-medium text-primary cursor-pointer hover:bg-muted transition-colors shadow-sm break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>
                          {label}
                      </div>
                  );
              })}
          </div>
      );
  };

  const renderContent = () => {
    if (isTask) {
      return (
        <div className="flex min-w-[12rem] max-w-full items-start gap-2.5 py-0.5">
          <Checkbox
            checked={taskDone}
            onCheckedChange={() => {
              if (taskMetadata.taskId) onToggleTask?.(taskMetadata.taskId, taskMetadata.status || 'open');
            }}
            className="mt-0.5"
            aria-label={t(taskDone ? 'task_reopen' : 'task_mark_done')}
            title={t(taskDone ? 'task_reopen' : 'task_mark_done')}
          />
          <span className={`flex min-w-0 items-center gap-1.5 break-words font-medium leading-5 ${taskDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
            {isRadarTaskTitle(msg.text) && <RadarTag size="xs" />}
            <span className="min-w-0 break-words">{radarTaskTitle(msg.text)}</span>
          </span>
        </div>
      );
    }
    if ((msg.messageType === 'interactiveMessage' || msg.messageType === 'buttonsMessage' || msg.messageType === 'listMessage') && msg.quotedMessageText) {
        return <InteractiveMessage text={msg.text || ''} metadataJson={msg.quotedMessageText} />;
    }
    const isVideo = msg.messageType === 'videoMessage' || (msg.mediaMimetype && msg.mediaMimetype.startsWith('video/'));
    const isImage = !isVideo && (msg.messageType === 'imageMessage' || (msg.mediaMimetype && msg.mediaMimetype.startsWith('image/')));
    const isAudio = msg.messageType === 'audioMessage' || (msg.mediaMimetype && msg.mediaMimetype.startsWith('audio/'));
    const isDocument = msg.messageType === 'documentMessage' || (!isVideo && !isImage && !isAudio && msg.mediaUrl);

    if (isAudio && msg.mediaUrl) {
      return <CustomAudioPlayer src={msg.mediaUrl} isMe={isMe} />;
    }
    
    if (msg.messageType === 'stickerMessage' && msg.mediaUrl) {
      return (
        <div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden p-1">
          <img 
            src={msg.mediaUrl} 
            alt="Sticker" 
            className="rounded-lg max-w-full max-h-[150px] object-contain cursor-pointer"
            onClick={() => onMediaClick(msg.id)} 
          />
        </div>
      );
    }

    if (isVideo && msg.mediaUrl) {
      return (
        <div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden">
          <button
            type="button"
            className="relative flex h-40 w-full max-w-full items-center justify-center rounded-lg bg-black/10 text-foreground sm:w-64"
            onClick={() => onMediaClick(msg.id)}
            aria-label={t('video_item')}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 shadow-sm">
              <Play className="h-6 w-6 text-foreground" />
            </div>
          </button>
          {msg.mediaCaption && (
            <p className="text-sm text-foreground px-1 pb-1 min-w-0">
              <FormattedText text={msg.mediaCaption} highlight={searchQuery} />
            </p>
          )}
        </div>
      );
    }

    if (isImage && msg.mediaUrl) {
      return (
        <div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden">
          <img 
            src={msg.mediaUrl} 
            alt={msg.mediaCaption || 'Image'} 
            className="rounded-lg max-w-full max-h-60 object-contain cursor-pointer"
            onClick={() => onMediaClick(msg.id)} 
            onError={(e) => {
                e.currentTarget.style.display = 'none';
            }}
          />
          {msg.mediaCaption && (
            <p className="text-sm text-foreground px-1 pb-1 min-w-0">
              <FormattedText text={msg.mediaCaption} highlight={searchQuery} />
            </p>
          )}
        </div>
      );
    }
    
    if (isDocument && msg.messageType !== 'text' && msg.messageType !== 'conversation' && msg.messageType !== 'extendedTextMessage' && msg.mediaUrl) {
      const fileName = msg.text || 'Document';
      const fileSize = formatBytes(msg.mediaFileLength ?? null);
      const fileExtension = fileName.split('.').pop()?.toUpperCase() || '';
      return (
        <div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden">
          <div className="flex w-full max-w-full items-center p-2 rounded-lg bg-muted/50 min-w-0 sm:w-[250px] sm:max-w-full">
            <div className="flex-shrink-0 mr-3"><FileText className="h-8 w-8 text-muted-foreground" /></div>
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-sm font-medium text-foreground truncate break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle} title={fileName}>
                <FormattedText text={fileName} highlight={searchQuery} />
              </p>
              <p className="text-xs text-muted-foreground">{fileExtension}{fileSize ? ` 窶｢ ${fileSize}` : ''}</p>
            </div>
            <a href={msg.mediaUrl} download={fileName} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground" title={t('download_file_text')}><Download className="h-5 w-5" /></a>
          </div>
          {msg.mediaCaption && (
            <p className="text-sm text-foreground px-1 min-w-0">
              <FormattedText text={msg.mediaCaption} highlight={searchQuery} />
            </p>
          )}
        </div>
      );
    }

    if (msg.messageType === 'templateMessage') {
        let templateData = null;
        try {
            if (msg.quotedMessageText && msg.quotedMessageText.includes('hydratedTemplate')) {
                templateData = JSON.parse(msg.quotedMessageText);
            }
        } catch (e) {}

        return (
            <div className="flex w-full max-w-full flex-col gap-1 min-w-0 sm:w-[200px] sm:max-w-full">
                <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>
                    <FormattedText text={msg.text || ''} highlight={searchQuery} />
                </p>
                
                {templateData?.hydratedTemplate?.hydratedFooterText && (
                    <p className="text-xs text-muted-foreground mt-1 break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{templateData.hydratedTemplate.hydratedFooterText}</p>
                )}

                {templateData && renderTemplateButtons(templateData)}
            </div>
        );
    }

    if (msg.messageType === 'templateButtonReplyMessage') {
        return (
             <div className="flex flex-col">
                 <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                     <MousePointerClick className="h-3 w-3" /> {t('selected_option_text')}
                 </div>
                 <p className="text-sm text-foreground font-medium break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>
                    <FormattedText text={msg.text || ''} highlight={searchQuery} />
                 </p>
             </div>
        );
    }

    if (msg.messageType === 'contactMessage' && msg.contactName) {
      return (
        <div className="flex w-full max-w-full items-center p-2 rounded-lg bg-muted/50 min-w-0 sm:w-[200px] sm:max-w-full">
          <div className="flex-shrink-0 mr-3 p-2 bg-muted rounded-full"><User className="h-6 w-6 text-muted-foreground" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" title={msg.contactName}>{msg.contactName}</p>
            <p className="text-xs text-muted-foreground">{t('contact_item')}</p>
          </div>
        </div>
      );
    }
    
    if (msg.messageType === 'locationMessage' && msg.locationLatitude) {
      const lat = parseFloat(msg.locationLatitude); const lon = parseFloat(msg.locationLongitude!);
      const mapsUrl = `http://googleusercontent.com/maps.google.com/?q=${lat},${lon}`;
      return (
        <div className="w-full max-w-full p-2 rounded-lg bg-muted/50 min-w-0 sm:w-[200px] sm:max-w-full">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center group">
            <div className="flex-shrink-0 mr-3 p-2 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors"><MapPin className="h-6 w-6 text-primary" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary group-hover:underline truncate">{msg.locationName || t('location_item')}</p>
              <p className="text-xs text-muted-foreground">{t('open_map_text')}</p>
            </div>
          </a>
        </div>
      );
    }
    
    if (msg.text) {
      // El texto completo sigue en la data: la nota de Radar se pinta sin su
      // primera línea porque esos metadatos ya están arriba, en el encabezado.
      return <FormattedText text={isRadarNote ? radarNoteBody(msg.text) : msg.text} highlight={searchQuery} />;
    }
    
    return <p className="text-muted-foreground italic text-xs">[{msg.messageType || t('unsupported_message')}]</p>;
  };

  return (
    <div className={`flex w-full min-w-0 max-w-full group ${isMe ? 'justify-end' : 'justify-start'} ${msg.reactions && msg.reactions.length > 0 ? 'mb-5' : 'mb-2'}`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <div className={`relative min-w-0 overflow-visible rounded-lg px-3 text-sm py-2 shadow-sm [overflow-wrap:anywhere] [word-break:break-word] ${bubbleColor} ${borderColor}`} style={bubbleStyle}>
        
        {isGroup && !isMe && (msg.participant || msg.participantName) && (
          <div className="mb-1 min-w-0 text-xs font-semibold text-primary break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>
            <span>{msg.participantName || (msg.participant ? `~+${msg.participant.split('@')[0]}` : '')}</span>
            {msg.participantName && msg.participant && (
              <span className="text-muted-foreground font-normal ml-1.5">+{msg.participant.split('@')[0]}</span>
            )}
          </div>
        )}

        {isRadarNote && (
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-indigo-200 pb-1 dark:border-indigo-800">
            <span className="flex items-center gap-1 text-xs font-bold text-indigo-700 dark:text-indigo-400">
              <RadarIcon className="h-3 w-3" /> Radar
            </span>
            <span className="min-w-0 break-words text-[11px] font-medium text-indigo-600/80 dark:text-indigo-400/80">
              {radarNoteHeadline(msg.text)}
            </span>
          </div>
        )}
        {isInternal && !isRadarNote && (
          <div className="flex items-center gap-1 mb-1 text-xs text-yellow-700 dark:text-yellow-400 font-medium border-b border-yellow-200 dark:border-yellow-800 pb-1">
            <FilePenLine className="h-3 w-3" /> {t('internal_note_title')}
          </div>
        )}
        {isAi && (
          <div className="flex items-center gap-1 mb-1 text-xs text-purple-700 dark:text-purple-400 font-medium border-b border-purple-200 dark:border-purple-800 pb-1">
            <Bot className="h-3 w-3" /> {t('ai_agent_title')}
          </div>
        )}
        {isCampaign && (
          <div className="flex items-center gap-1 mb-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium border-b border-emerald-200 dark:border-emerald-800 pb-1">
            <Megaphone className="h-3 w-3" /> {t('campaign_title')}
          </div>
        )}
        {isTask && (
          <div className="mb-1 flex items-center gap-1 border-b border-primary/20 pb-1 text-xs font-medium text-primary">
            <ListTodo className="h-3 w-3" /> {t('task_message_title')}
          </div>
        )}
        {isScheduled && (
          <div className="mb-1 flex items-center gap-1 border-b border-border pb-1 text-xs font-medium text-muted-foreground">
            <Clock className="h-3 w-3" /> {t('scheduled_message_title')}
          </div>
        )}
        {isAappSpaceScheduled && (
          <div className="mb-1 flex items-center gap-1 border-b border-primary/20 pb-1 text-xs font-medium text-primary">
            <Clock className="h-3 w-3" /> {t('scheduled_aapp_space_title')}
          </div>
        )}
        {isAutomation && !isCampaign && (
          <div className="flex items-center gap-1 mb-1 text-xs text-blue-700 dark:text-blue-400 font-medium border-b border-blue-200 dark:border-blue-800 pb-1">
            <Zap className="h-3 w-3" /> {t('automation_title')}
          </div>
        )}

        {showActions && !msg.id.startsWith('temp_') && !isInternal && !isTask && (
          <div className={`absolute top-0 flex items-center gap-0.5 ${isMe ? '-left-[68px]' : '-right-[68px]'}`}>
            {onSaveDraft && isTextOnlyMessage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full bg-muted/50 hover:bg-muted/70"
                onClick={() => onSaveDraft(msg.text!)}
                title="Guardar en borradores"
              >
                <Save className="h-4 w-4 text-foreground" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-muted/50 hover:bg-muted/70" onClick={() => onReply(msg)}>
              <CornerUpLeft className="h-4 w-4 text-foreground" />
            </Button>
            {onReact && (
              <Popover open={reactionPickerOpen} onOpenChange={setReactionPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-muted/50 hover:bg-muted/70">
                    <SmilePlus className="h-4 w-4 text-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align={isMe ? 'end' : 'start'} className="w-auto p-0 border-none shadow-none bg-transparent">
                  <ReactionPicker
                    onReact={(emoji) => onReact(msg.id, emoji)}
                    isMe={isMe}
                    onClose={() => setReactionPickerOpen(false)}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
        
        {msg.quotedMessageText && !isTask && !msg.messageType?.includes('interactive') && !msg.messageType?.includes('buttons') && !msg.messageType?.includes('list') && (
            <div className="p-2 mb-1 rounded-md bg-foreground/5 border-l-2 border-primary opacity-80 min-w-0 overflow-hidden"><QuotedMessagePreview quotedJson={msg.quotedMessageText} /></div>
        )}
        
        <div className="min-w-0 max-w-full overflow-hidden [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>
          {renderContent()}
        </div>
        
        {isError && (
          <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-red-500/20">
            <div className="group relative flex items-center gap-1 text-red-500 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{t('send_failed')}</span>
              {msg.errorMessage && (
                <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 max-w-[280px]">
                  <div className="bg-popover text-popover-foreground text-xs rounded-md px-3 py-2 shadow-md border">
                    <span className="break-words [overflow-wrap:anywhere] [word-break:break-word]" style={hardWrapStyle}>{msg.errorMessage}</span>
                  </div>
                </div>
              )}
            </div>
            {onRetry && (
              <button
                onClick={() => onRetry(msg)}
                className="ml-auto p-1 rounded-full hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors"
                title={t('retry_send')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        <div className={`flex justify-end items-center space-x-1 mt-1 ${isMe ? '' : 'text-right'}`}>
          <span className="text-xs text-muted-foreground">{time}</span>
          {isMe && !isError && <ReadReceipt status={msg.status} isInternal={isInternal || isTask} />}
        </div>

        {msg.reactions && msg.reactions.length > 0 && (
          <ReactionsDisplay
            reactions={msg.reactions}
            onReact={(emoji) => onReact?.(msg.id, emoji)}
            isMe={isMe}
          />
        )}
      </div>
    </div>
  );
}
