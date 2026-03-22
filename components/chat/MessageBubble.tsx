import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, CheckCheck, Check, Loader2, FileText, User, MapPin, CornerUpLeft, Download, FilePenLine, MousePointerClick, Info, Bot, Zap, Megaphone, AlertCircle, RefreshCw, SmilePlus, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { CustomAudioPlayer } from '@/components/ui/custom-audio-player';
import { Message, Reaction } from './types';
import { formatBytes } from './utils';
import { useTranslations } from 'next-intl';

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
  try { quotedData = JSON.parse(quotedJson); } catch (e) { return <p className="text-sm text-foreground line-clamp-2">{quotedJson}</p>; }
  if (!quotedData) return null;

  if (quotedData.messageType === 'imageMessage' && quotedData.mediaUrl) {
    return (<div className="flex items-center gap-2 min-h-[40px]"><img src={quotedData.mediaUrl} alt="Reply" className="h-10 w-10 rounded object-cover" /><p className="text-sm text-foreground line-clamp-2">{quotedData.text || t('image_item')}</p></div>);
  }
  if (quotedData.messageType === 'videoMessage' && quotedData.mediaUrl) {
    return (<div className="flex items-center gap-2 min-h-[40px]"><video src={quotedData.mediaUrl} className="h-10 w-10 rounded object-cover bg-background" /><p className="text-sm text-foreground line-clamp-2">{quotedData.text || t('video_item')}</p></div>);
  }
  if (quotedData.messageType === 'stickerMessage' && quotedData.mediaUrl) {
    return (<div className="flex items-center gap-2 min-h-[40px]"><img src={quotedData.mediaUrl} alt="Reply Sticker" className="h-10 w-10 object-contain" /><p className="text-sm text-foreground line-clamp-2">{t('sticker_item')}</p></div>);
  }
  if (quotedData.messageType === 'audioMessage') {
    return (<div className="flex items-center gap-2 text-foreground min-h-[40px]"><Mic className="h-4 w-4 flex-shrink-0" /><p className="text-sm line-clamp-2">{t('audio_item')}</p></div>);
  }
  if (quotedData.messageType === 'documentMessage') {
    return (<div className="flex items-center gap-2 text-foreground min-h-[40px]"><FileText className="h-4 w-4 flex-shrink-0" /><p className="text-sm line-clamp-2">{quotedData.text || t('document_item')}</p></div>);
  }
  return <p className="text-sm text-foreground line-clamp-2">{quotedData.text || t('message_item')}</p>;
}

const FormattedText = ({ text, highlight }: { text: string, highlight: string }) => {
  if (!text) return null;
  const parts = highlight.trim() ? text.split(new RegExp(`(${highlight})`, 'gi')) : [text];
  return (
    <span className="whitespace-pre-wrap break-words">
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
        <div className="flex flex-col gap-2 min-w-[200px]">
            <p className="text-sm text-foreground whitespace-pre-wrap">{text}</p>
            
            {interactive?.footer && (
                <p className="text-xs text-muted-foreground">{interactive.footer.text}</p>
            )}

            <div className="flex flex-col gap-2 mt-1 w-full">
                {interactive?.type === 'button' && interactive.action?.buttons?.map((btn: any, idx: number) => (
                    <div key={idx} className="bg-background/50 border border-border/50 rounded-md p-2 text-center text-sm font-medium text-primary shadow-sm">
                        {btn.reply?.title}
                    </div>
                ))}

                {interactive?.type === 'list' && (
                    <div className="bg-background/50 border border-border/50 rounded-md overflow-hidden shadow-sm">
                        <div className="p-2 text-center text-sm font-medium text-primary border-b border-border/50">
                            {interactive.action?.button || t('menu_item')}
                        </div>
                        {interactive.action?.sections?.map((section: any, sIdx: number) => (
                            <div key={sIdx} className="p-2">
                                {section.title && <p className="text-xs font-bold text-muted-foreground mb-1">{section.title}</p>}
                                {section.rows?.map((row: any, rIdx: number) => (
                                    <div key={rIdx} className="text-xs p-1.5 hover:bg-muted rounded cursor-default">
                                        <span className="font-medium block">{row.title}</span>
                                        {row.description && <span className="text-muted-foreground text-[10px]">{row.description}</span>}
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
  searchQuery: string;
  userBubbleColor?: string;
  contactBubbleColor?: string;
  isGroup?: boolean;
}

export function MessageBubble({ msg, onMediaClick, onReply, onRetry, onReact, searchQuery, userBubbleColor, contactBubbleColor, isGroup }: MessageBubbleProps) {
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
          <div className="flex justify-center my-3">
              <div className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-full text-xs text-muted-foreground border border-border/50 shadow-sm">
                  <Info className="h-3 w-3" />
                  <span>{displayText}</span>
              </div>
          </div>
      );
  }

  const isMe = msg.fromMe;
  const isInternal = msg.isInternal;
  const isAi = msg.isAi;
  const isAutomation = msg.isAutomation;
  const isCampaign = msg.messageType === 'campaign';
  const isError = msg.status === 'error';

  const time = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
  const [isHovered, setIsHovered] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const showActions = isHovered || reactionPickerOpen;

  const hasCustomTheme = !!(userBubbleColor || contactBubbleColor);
  let bubbleColor = isMe ? 'bg-primary/10' : 'bg-card';
  let borderColor = '';
  let bubbleStyle: React.CSSProperties = {};

  if (isError) {
      bubbleColor = 'bg-red-500/10 dark:bg-red-500/5';
      borderColor = 'border border-red-500/30';
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
                      <div key={idx} className="bg-card/80 border rounded-md p-2 text-center text-sm font-medium text-primary cursor-pointer hover:bg-muted transition-colors shadow-sm">
                          {label}
                      </div>
                  );
              })}
          </div>
      );
  };

  const renderContent = () => {
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
        <div className="flex flex-col gap-1 p-1">
          <img 
            src={msg.mediaUrl} 
            alt="Sticker" 
            className="rounded-lg max-w-[150px] max-h-[150px] object-contain cursor-pointer" 
            onClick={() => onMediaClick(msg.id)} 
          />
        </div>
      );
    }

    if (isVideo && msg.mediaUrl) {
      return (
        <div className="flex flex-col gap-1">
          <video 
            controls 
            preload="metadata" 
            playsInline 
            src={msg.mediaUrl} 
            className="rounded-lg max-w-xs max-h-60 cursor-pointer bg-black/10" 
            onClick={(e) => { e.preventDefault(); onMediaClick(msg.id); }}
          >
            <a href={msg.mediaUrl}>{t('download_video_text')}</a>
          </video>
          {msg.mediaCaption && (
            <p className="text-sm text-foreground px-1 pb-1">
              <FormattedText text={msg.mediaCaption} highlight={searchQuery} />
            </p>
          )}
        </div>
      );
    }

    if (isImage && msg.mediaUrl) {
      return (
        <div className="flex flex-col gap-1">
          <img 
            src={msg.mediaUrl} 
            alt={msg.mediaCaption || 'Image'} 
            className="rounded-lg max-w-xs max-h-60 object-contain cursor-pointer" 
            onClick={() => onMediaClick(msg.id)} 
            onError={(e) => {
                e.currentTarget.style.display = 'none';
            }}
          />
          {msg.mediaCaption && (
            <p className="text-sm text-foreground px-1 pb-1">
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
        <div className="flex flex-col gap-1">
          <div className="flex items-center p-2 rounded-lg bg-muted/50 min-w-[250px]">
            <div className="flex-shrink-0 mr-3"><FileText className="h-8 w-8 text-muted-foreground" /></div>
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-sm font-medium text-foreground truncate" title={fileName}>
                <FormattedText text={fileName} highlight={searchQuery} />
              </p>
              <p className="text-xs text-muted-foreground">{fileExtension}{fileSize ? ` 窶｢ ${fileSize}` : ''}</p>
            </div>
            <a href={msg.mediaUrl} download={fileName} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground" title={t('download_file_text')}><Download className="h-5 w-5" /></a>
          </div>
          {msg.mediaCaption && (
            <p className="text-sm text-foreground px-1">
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
            <div className="flex flex-col gap-1 min-w-[200px]">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                    <FormattedText text={msg.text || ''} highlight={searchQuery} />
                </p>
                
                {templateData?.hydratedTemplate?.hydratedFooterText && (
                    <p className="text-xs text-muted-foreground mt-1">{templateData.hydratedTemplate.hydratedFooterText}</p>
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
                 <p className="text-sm text-foreground font-medium">
                    <FormattedText text={msg.text || ''} highlight={searchQuery} />
                 </p>
             </div>
        );
    }

    if (msg.messageType === 'contactMessage' && msg.contactName) {
      return (
        <div className="flex items-center p-2 rounded-lg bg-muted/50 min-w-[200px]">
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
        <div className="p-2 rounded-lg bg-muted/50 min-w-[200px]">
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
      return <FormattedText text={msg.text} highlight={searchQuery} />;
    }
    
    return <p className="text-muted-foreground italic text-xs">[{msg.messageType || t('unsupported_message')}]</p>;
  };

  return (
    <div className={`flex group ${isMe ? 'justify-end' : 'justify-start'} ${msg.reactions && msg.reactions.length > 0 ? 'mb-5' : 'mb-2'}`} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className={`relative rounded-lg px-3 text-sm py-2 max-w-[70%] shadow-sm ${bubbleColor} ${borderColor}`} style={bubbleStyle}>
        
        {isGroup && !isMe && (msg.participant || msg.participantName) && (
          <div className="mb-1 text-xs font-semibold text-primary">
            <span>{msg.participantName || (msg.participant ? `~+${msg.participant.split('@')[0]}` : '')}</span>
            {msg.participantName && msg.participant && (
              <span className="text-muted-foreground font-normal ml-1.5">+{msg.participant.split('@')[0]}</span>
            )}
          </div>
        )}

        {isInternal && (
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
        {isAutomation && !isCampaign && (
          <div className="flex items-center gap-1 mb-1 text-xs text-blue-700 dark:text-blue-400 font-medium border-b border-blue-200 dark:border-blue-800 pb-1">
            <Zap className="h-3 w-3" /> {t('automation_title')}
          </div>
        )}

        {showActions && !msg.id.startsWith('temp_') && !isInternal && (
          <div className={`absolute top-0 flex items-center gap-0.5 ${isMe ? '-left-[68px]' : '-right-[68px]'}`}>
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
        
        {msg.quotedMessageText && !msg.messageType?.includes('interactive') && !msg.messageType?.includes('buttons') && !msg.messageType?.includes('list') && (
            <div className="p-2 mb-1 rounded-md bg-foreground/5 border-l-2 border-primary opacity-80"><QuotedMessagePreview quotedJson={msg.quotedMessageText} /></div>
        )}
        
        {renderContent()}
        
        {isError && (
          <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-red-500/20">
            <div className="group relative flex items-center gap-1 text-red-500 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{t('send_failed')}</span>
              {msg.errorMessage && (
                <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 max-w-[280px]">
                  <div className="bg-popover text-popover-foreground text-xs rounded-md px-3 py-2 shadow-md border">
                    {msg.errorMessage}
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
          {isMe && !isError && <ReadReceipt status={msg.status} isInternal={isInternal} />}
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