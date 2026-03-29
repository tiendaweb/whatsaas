'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { X, Loader2, Users, Download, Wand2, Copy, Sparkles, SpellCheck, Paintbrush, ChevronDown, ChevronUp } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import PusherClient from 'pusher-js';
import { toast } from 'sonner';
import { EmojiClickData } from 'emoji-picker-react';
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Video from "yet-another-react-lightbox/plugins/video";
import "yet-another-react-lightbox/styles.css";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { Chat } from '@/lib/db/schema';
import { Message, Reaction, QuickReply, NewMessagePayload, ChatDetails, ContactData, TeamData, RecordingStatus, UserData } from '@/components/chat/types';
import { fetcher, fileToBase64, isSameDay, formatDateSeparator } from '@/components/chat/utils';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { TemplateDialog } from '@/components/chat/TemplateDialog';
import { QuickRepliesModal } from '@/components/chat/QuickRepliesModal';
import { DraftShortcutsModal } from '@/components/chat/DraftShortcutsModal';
import { DateSeparator } from '@/components/chat/DateSeparator';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import type { DraftItem } from '@/components/drafts/types';

type ImproveReplyMode = 'improve' | 'orthography' | 'stylize';

interface ChatThemeData {
  backgroundType: string;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  userBubbleColor: string;
  contactBubbleColor: string;
  darkBackgroundColor: string;
  darkUserBubbleColor: string;
  darkContactBubbleColor: string;
}

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawJid = params.jid as string;
  const chatNumber = rawJid ? decodeURIComponent(rawJid) : rawJid;
  const instanceIdParam = searchParams.get('instanceId');

  const isGroup = chatNumber ? chatNumber.endsWith('@g.us') : false;
  const remoteJid = chatNumber
    ? (isGroup ? chatNumber : `${chatNumber}@s.whatsapp.net`)
    : null;

  const activeChatRef = useRef<Chat | undefined>(undefined);

  const [newMessage, setNewMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [isSyncingMessages, setIsSyncingMessages] = useState(false);
  const [syncDismissed, setSyncDismissed] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [draftShortcutsOpen, setDraftShortcutsOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [improveDialogOpen, setImproveDialogOpen] = useState(false);
  const [improveMode, setImproveMode] = useState<ImproveReplyMode>('improve');
  const [additionalContext, setAdditionalContext] = useState('');
  const [savedImproveContext, setSavedImproveContext] = useState('');
  const [showSavedImproveContext, setShowSavedImproveContext] = useState(false);
  const [improvedReply, setImprovedReply] = useState('');
  const [isImprovingReply, setIsImprovingReply] = useState(false);
  const [showQuickReplySuggestions, setShowQuickReplySuggestions] = useState(false);
  const [showDraftSuggestions, setShowDraftSuggestions] = useState(false);
  const [draftVariablesModalOpen, setDraftVariablesModalOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<DraftItem | null>(null);
  const [draftVariables, setDraftVariables] = useState<Record<string, string>>({});
  const lastImproveContextChatIdRef = useRef<number | null>(null);
  const [chatSidebarCollapsed, setChatSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatSidebarCollapsed') === 'true';
    }
    return false;
  });

  const toggleChatSidebar = useCallback(() => {
    setChatSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('chatSidebarCollapsed', String(next));
      return next;
    });
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const t = useTranslations('Chat');

  const { data: user } = useSWR<UserData>('/api/user', fetcher);
  const { data: teamData } = useSWR<TeamData>('/api/team', fetcher);
  const { data: chatTheme } = useSWR<ChatThemeData>('/api/chat-theme', fetcher);
  const teamId = teamData?.id;

  const activeThemeBg = chatTheme ? (isDark ? chatTheme.darkBackgroundColor : chatTheme.backgroundColor) : undefined;
  const activeUserBubble = chatTheme ? (isDark ? chatTheme.darkUserBubbleColor : chatTheme.userBubbleColor) : undefined;
  const activeContactBubble = chatTheme ? (isDark ? chatTheme.darkContactBubbleColor : chatTheme.contactBubbleColor) : undefined;
  
  const { data: chats } = useSWR<Chat[]>('/api/chats', fetcher);

  const currentChat = useMemo(() => {
      if (!chats || !remoteJid) return undefined;
      if (instanceIdParam) {
          return chats.find(c => c.remoteJid === remoteJid && c.instanceId === parseInt(instanceIdParam));
      }

      return chats.find(c => c.remoteJid === remoteJid);
  }, [chats, remoteJid, instanceIdParam]);

  const swrKey = useMemo(() => {
      if (!remoteJid) return null;
      
      if (instanceIdParam) {
          return `/api/messages?jid=${remoteJid}&instanceId=${instanceIdParam}`;
      }
      if (currentChat?.id) {
           return `/api/messages?chatId=${currentChat.id}`;
      }

      return `/api/messages?jid=${remoteJid}`;
  }, [remoteJid, instanceIdParam, currentChat]);

  const { data: messages, error, isLoading, mutate: mutateMessages } = useSWR<Message[]>(swrKey, fetcher, { revalidateOnFocus: true });
  
  const { data: contact, mutate: mutateContact } = useSWR<ContactData | null>(
    remoteJid ? `/api/contacts/by-chat?jid=${remoteJid}` : null,
    fetcher
  );
  
  useEffect(() => {
    activeChatRef.current = currentChat;
  }, [currentChat]);

  const { data: instances } = useSWR<any[]>('/api/instance/details', fetcher);
  const activeInstance = instances?.find(i => i.dbId === currentChat?.instanceId);
  const { data: quickReplies } = useSWR<QuickReply[]>('/api/quick-replies', fetcher);
  const { data: drafts } = useSWR<DraftItem[]>('/api/drafts', fetcher);

  const mediaMessages = useMemo(() => {
    if (!messages) return [];
    return messages.filter(msg => (msg.messageType === 'imageMessage' || msg.messageType === 'videoMessage') && msg.mediaUrl);
  }, [messages]);

  const filteredMessages = useMemo(() => {
    if (!messages) return [];
    if (!searchQuery.trim()) return messages;
    return messages.filter(msg =>
      msg.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.mediaCaption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (msg.messageType === 'documentMessage' && msg.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [messages, searchQuery]);

  const slides = useMemo(() => {
    return mediaMessages.map(msg => {
      if (msg.messageType === 'videoMessage' && msg.mediaUrl) {
        return {
          type: "video" as const,
          width: 1280,
          height: 720,
          sources: [{ src: msg.mediaUrl, type: "video/mp4" }]
        };
      }
      return { type: "image" as const, src: msg.mediaUrl! };
    });
  }, [mediaMessages]);

  const filteredQuickReplies = useMemo(() => {
    if (!newMessage.startsWith('/') || !quickReplies) return [];
    const search = newMessage.slice(1).toLowerCase();
    return quickReplies.filter(r => r.shortcut.toLowerCase().startsWith(search));
  }, [newMessage, quickReplies]);

  const filteredDraftSuggestions = useMemo(() => {
    if (!newMessage.startsWith('##') || !drafts) return [];
    const search = newMessage.slice(2).trim().toLowerCase();
    if (!search) return drafts;
    return drafts.filter((draft) => draft.title.toLowerCase().includes(search));
  }, [newMessage, drafts]);

  const draftPlaceholders = useMemo(() => {
    if (!selectedDraft) return [];
    const regex = /\[\[([\w\-. ]+)\]\]/g;
    const set = new Set<string>();
    for (const match of selectedDraft.content.matchAll(regex)) {
      const key = match[1]?.trim();
      if (key) set.add(key);
    }
    return Array.from(set);
  }, [selectedDraft]);

  const handleMediaClick = (messageId: string) => {
    const clickedIndex = mediaMessages.findIndex(msg => msg.id === messageId);
    if (clickedIndex !== -1) { setLightboxIndex(clickedIndex); setLightboxOpen(true); }
  };

  const chatDetails: ChatDetails = {
    remoteJid: remoteJid,
    name: contact?.name || currentChat?.name || currentChat?.pushName || chatNumber || 'Chat',
    profilePicUrl: currentChat?.profilePicUrl || null,
    lastCustomerInteraction: currentChat?.lastCustomerInteraction ? new Date(currentChat.lastCustomerInteraction).toISOString() : null,
    integration: activeInstance?.integration || 'WHATSAPP-BAILEYS'
  };

  const isWaba = activeInstance?.integration === 'WHATSAPP-BUSINESS';
  const isWindowExpired = useMemo(() => {
    if (!isWaba) return false;
    if (!currentChat?.lastCustomerInteraction) return true;
    const start = new Date(currentChat.lastCustomerInteraction).getTime();
    const now = Date.now();
    return (now - start) > 24 * 60 * 60 * 1000;
  }, [isWaba, currentChat?.lastCustomerInteraction]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages && messages.length > 0 && !searchQuery) {
      const timer = setTimeout(() => scrollToBottom(), 100);
      return () => clearTimeout(timer);
    }
  }, [messages, scrollToBottom, searchQuery]);

  useEffect(() => {
    setShowQuickReplySuggestions(newMessage.startsWith('/') && filteredQuickReplies.length > 0);
  }, [newMessage, filteredQuickReplies]);

  useEffect(() => {
    setShowDraftSuggestions(newMessage.startsWith('##') && filteredDraftSuggestions.length > 0);
  }, [newMessage, filteredDraftSuggestions]);

  const { cache: swrCache, mutate: globalMutate } = useSWRConfig();

  useEffect(() => {
    if (!teamId || !remoteJid || !process.env.NEXT_PUBLIC_PUSHER_KEY) return;
    
    const pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2' });
    const channelName = `team-${teamId}`;
    const channel = pusherClient.subscribe(channelName);
    
    channel.bind('new-message', (payload: NewMessagePayload) => {
      const instanceMatch = !currentChat?.instanceId || !payload.instanceId || currentChat.instanceId === payload.instanceId;

      if (payload.remoteJid === remoteJid && instanceMatch) {
        mutateMessages((currentMessages = []) => {
          if (currentMessages.some(msg => msg.id === payload.id)) return currentMessages;
          const messageWithStatus = { ...payload, status: payload.status || (payload.fromMe ? 'sent' : null) };
          return [...(currentMessages || []), messageWithStatus as Message];
        }, false);
        setTimeout(() => scrollToBottom(), 150);
      }
    });
    
    channel.bind('message-status-update', (payload: { messageId: string; status: 'sent' | 'delivered' | 'read' }) => {
      mutateMessages((currentMessages = []) => currentMessages.map(msg => msg.id === payload.messageId ? { ...msg, status: payload.status } : msg), false);
    });

    channel.bind('chat-status-update', (payload: { chatId: number; type: 'ai' | 'automation'; status: string }) => {
      const currentId = activeChatRef.current?.id;

      if (currentId && payload.chatId === currentId) {
          if (payload.type === 'ai') {
              globalMutate(`/api/chats/${payload.chatId}/ai-status`);
          }
          if (payload.type === 'automation') {
              globalMutate(`/api/chats/${payload.chatId}/session`);
          }
      }
    });

    channel.bind('message-reaction', (payload: { messageId: string; chatId: number; emoji: string | null; fromMe: boolean; remoteJid: string | null; participantName: string | null; action: 'add' | 'remove' }) => {
      mutateMessages((currentMessages = []) => currentMessages.map(msg => {
        if (msg.id !== payload.messageId) return msg;
        const currentReactions = msg.reactions || [];
        if (payload.action === 'add' && payload.emoji) {
          const filtered = currentReactions.filter(r => {
            if (payload.fromMe) return !r.fromMe;
            return r.remoteJid !== payload.remoteJid;
          });
          const newReaction: Reaction = {
            id: Date.now(),
            emoji: payload.emoji,
            fromMe: payload.fromMe,
            remoteJid: payload.remoteJid,
            participantName: payload.participantName,
          };
          return { ...msg, reactions: [...filtered, newReaction] };
        } else {
          const filtered = currentReactions.filter(r => {
            if (payload.fromMe) return !r.fromMe;
            return r.remoteJid !== payload.remoteJid;
          });
          return { ...msg, reactions: filtered };
        }
      }), false);
    });

    channel.bind('contact-update', (payload: { remoteJid: string; chatId: number }) => {
      if (payload.remoteJid === remoteJid) {
        mutateContact();
      }
    });

    return () => { pusherClient.unsubscribe(channelName); pusherClient.disconnect(); };
  }, [teamId, remoteJid, mutateMessages, mutateContact, scrollToBottom, globalMutate, currentChat]);

  useEffect(() => {
    if (messages && remoteJid && teamId) {
      if (currentChat && currentChat.unreadCount && currentChat.unreadCount > 0) {
        globalMutate('/api/chats', (currentData: Chat[] | undefined = []) => currentData.map(chat => chat.id === currentChat.id ? { ...chat, unreadCount: 0 } : chat), false);
        fetch('/api/chats/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: currentChat.id }), }).catch(err => console.error(err));
      }
    }
  }, [messages, remoteJid, teamId, globalMutate, swrCache, currentChat]);

  const startRecording = async () => {
    if (recordingStatus !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      const audioChunks: Blob[] = [];
      recorder.ondataavailable = (event) => audioChunks.push(event.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: recorder.mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob); setAudioUrl(audioUrl);
        setRecordingStatus('review');
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start();
      setRecordingStatus('recording');
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      toast.error("Could not start recording.");
    }
  };

  const stopRecording = () => {
    if (recordingStatus !== 'recording' || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  };

  const cancelRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null); setAudioUrl(null);
    setRecordingStatus('idle'); setRecordingTime(0);
    setIsAudioPlaying(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
  };

  const toggleAudioPlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isAudioPlaying) audioPlayerRef.current.pause(); else audioPlayerRef.current.play();
    setIsAudioPlaying(!isAudioPlaying);
  };

  useEffect(() => {
    const audio = audioPlayerRef.current;
    if (audio) {
      const onEnded = () => setIsAudioPlaying(false);
      audio.addEventListener('ended', onEnded);
      return () => audio.removeEventListener('ended', onEnded);
    }
  }, [audioPlayerRef.current]);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !remoteJid) return;
    setRecordingStatus('sending');
    let textToSend = newMessage;

    const messageToQuote = quotedMessage;
    setNewMessage(''); setQuotedMessage(null); setShowQuickReplySuggestions(false);

    let quotedData: any = null;
    if (messageToQuote) {
      quotedData = { id: messageToQuote.id, text: messageToQuote.text || messageToQuote.mediaCaption, messageType: messageToQuote.messageType, mediaUrl: messageToQuote.mediaUrl, mediaMimetype: messageToQuote.mediaMimetype, };
    }
    const tempId = `temp_text_${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId, chatId: currentChat?.id || 0, fromMe: true, messageType: 'conversation', text: textToSend, timestamp: new Date().toISOString(),
      mediaUrl: null, mediaMimetype: null, mediaCaption: null, status: 'sent',
      quotedMessageId: messageToQuote?.id, quotedMessageText: quotedData ? JSON.stringify(quotedData) : null,
      isInternal: isInternalNote,
      isAi: false, isAutomation: false
    };
    mutateMessages((currentMessages = []) => [...currentMessages, optimisticMessage], false);
    const timer = setTimeout(() => scrollToBottom(), 100);
    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            recipientJid: remoteJid, 
            text: textToSend, 
            quotedMessageData: quotedData, 
            isInternal: isInternalNote,
            instanceId: currentChat?.instanceId 
        }),
      });
      const sentMessageData: Message = await response.json();
      if (!response.ok && !sentMessageData.status) throw new Error((sentMessageData as any).error || 'Failed to send message.');
      mutateMessages((currentMessages = []) => currentMessages.map(msg => msg.id === tempId ? { ...sentMessageData, timestamp: new Date(sentMessageData.timestamp).toISOString() } : msg), false);
      globalMutate('/api/chats');
    } catch (sendError: any) {
      mutateMessages((currentMessages = []) => currentMessages.map(msg => msg.id === tempId ? { ...msg, status: 'error' as const, errorMessage: sendError.message } : msg), false);
      toast.error(`Error sending message: ${sendError.message}`);
    } finally { clearTimeout(timer); setRecordingStatus('idle'); }
  };

  const handleSendAudio = async () => {
    if (!audioBlob || !remoteJid || recordingStatus !== 'review') return;
    setRecordingStatus('sending');
    const messageToQuote = quotedMessage; setQuotedMessage(null);
    const tempId = `temp_audio_${Date.now()}`;
    const audioMimeType = audioBlob.type;
    const tempAudioUrl = audioUrl;
    let quotedData: any = null;
    if (messageToQuote) { quotedData = { id: messageToQuote.id, text: messageToQuote.text || messageToQuote.mediaCaption, messageType: messageToQuote.messageType, mediaUrl: messageToQuote.mediaUrl, mediaMimetype: messageToQuote.mediaMimetype, }; }
    const optimisticMessage: Message = { id: tempId, chatId: currentChat?.id || 0, fromMe: true, messageType: 'audioMessage', text: null, timestamp: new Date().toISOString(), mediaUrl: tempAudioUrl, mediaMimetype: audioMimeType, mediaCaption: null, status: 'sent', quotedMessageId: messageToQuote?.id, quotedMessageText: quotedData ? JSON.stringify(quotedData) : null, isAi: false, isAutomation: false };
    mutateMessages((currentMessages = []) => [...currentMessages, optimisticMessage], false);
    const timer = setTimeout(() => scrollToBottom(), 100);
    try {
      const audioBase64 = await fileToBase64(audioBlob);
      const response = await fetch('/api/messages/sendAudio', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ 
              recipientJid: remoteJid, 
              audioBase64, 
              audioMimeType, 
              quotedMessageData: quotedData,
              instanceId: currentChat?.instanceId 
          }), 
      });
      const sentMessageData: Message = await response.json();
      if (!response.ok && !sentMessageData.status) throw new Error((sentMessageData as any).error || 'Failed to send audio.');
      mutateMessages((currentMessages = []) => currentMessages.map(msg => msg.id === tempId ? { ...sentMessageData, timestamp: new Date(sentMessageData.timestamp).toISOString() } : msg), false);
      globalMutate('/api/chats');
    } catch (sendError: any) {
      mutateMessages((currentMessages = []) => currentMessages.map(msg => msg.id === tempId ? { ...msg, status: 'error' as const, errorMessage: sendError.message } : msg), false);
      toast.error(`Error sending audio: ${sendError.message}`);
    } finally { clearTimeout(timer); cancelRecording(); if (tempAudioUrl) URL.revokeObjectURL(tempAudioUrl); }
  };

  const handleSendAttachment = async (file: File) => {
    if (!remoteJid) return;
    const tempMediaUrl = URL.createObjectURL(file);
    const messageToQuote = quotedMessage; 
    setQuotedMessage(null);
    
    const tempId = `temp_media_${Date.now()}`;
    const mimeType = file.type;
    const fileName = file.name;
    const messageType = mimeType.startsWith('image/') || mimeType.startsWith('video/') ? 'imageMessage' : 'documentMessage';
    
    let quotedData: any = null;
    if (messageToQuote) { 
        quotedData = { 
            id: messageToQuote.id, 
            text: messageToQuote.text || messageToQuote.mediaCaption, 
            messageType: messageToQuote.messageType, 
            mediaUrl: messageToQuote.mediaUrl, 
            mediaMimetype: messageToQuote.mediaMimetype 
        }; 
    }

    const optimisticMessage: Message = {
        id: tempId, 
        chatId: currentChat?.id || 0, 
        fromMe: true, 
        messageType: messageType, 
        text: messageType === 'documentMessage' ? fileName : null, 
        timestamp: new Date().toISOString(), 
        mediaUrl: tempMediaUrl, 
        mediaMimetype: mimeType, 
        mediaCaption: null, 
        status: 'sent', 
        quotedMessageId: messageToQuote?.id, 
        quotedMessageText: quotedData ? JSON.stringify(quotedData) : null, 
        isAi: false, 
        isAutomation: false
    };

    mutateMessages((currentMessages = []) => [...currentMessages, optimisticMessage], false);
    const timer = setTimeout(() => scrollToBottom(), 100);

    try {
        const fileBase64 = await fileToBase64(file);
        const response = await fetch('/api/messages/sendMedia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipientJid: remoteJid,
                fileBase64,
                mimeType,
                fileName,
                quotedMessageData: quotedData,
                instanceId: currentChat?.instanceId
            }),
        });
        
        const sentMessageData: Message = await response.json();
        if (!response.ok && !sentMessageData.status) throw new Error((sentMessageData as any).error || 'Failed to send media.');

        mutateMessages((currentMessages = []) => currentMessages.map(msg => msg.id === tempId ? { ...sentMessageData, timestamp: new Date(sentMessageData.timestamp).toISOString() } : msg), false);
        globalMutate('/api/chats');
    } catch (sendError: any) {
        mutateMessages((currentMessages = []) => currentMessages.map(msg => msg.id === tempId ? { ...msg, status: 'error' as const, errorMessage: sendError.message } : msg), false);
        toast.error(`Error sending file: ${sendError.message}`);
    } finally {
        clearTimeout(timer);
        URL.revokeObjectURL(tempMediaUrl);
    }
  };

  const handleRetryMessage = async (msg: Message) => {
    mutateMessages((currentMessages = []) => currentMessages.filter(m => m.id !== msg.id), false);
    if (msg.id.startsWith('error_')) {
      fetch(`/api/messages/${msg.id}`, { method: 'DELETE' }).catch(() => {});
    }
    if (msg.text) {
      setNewMessage(msg.text);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!remoteJid || !currentChat) return;

    mutateMessages((currentMessages = []) => currentMessages.map(msg => {
      if (msg.id !== messageId) return msg;
      const currentReactions = msg.reactions || [];
      if (emoji) {
        const filtered = currentReactions.filter(r => !r.fromMe);
        const newReaction: Reaction = { id: Date.now(), emoji, fromMe: true, remoteJid: null, participantName: null };
        return { ...msg, reactions: [...filtered, newReaction] };
      } else {
        return { ...msg, reactions: currentReactions.filter(r => !r.fromMe) };
      }
    }), false);

    try {
      await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          emoji,
          remoteJid,
          instanceId: currentChat.instanceId,
        }),
      });
    } catch (err: any) {
      mutateMessages();
      toast.error(err.message || 'Failed to send reaction');
    }
  };

  const handleFileIconClick = (acceptType: string) => {
      if (fileInputRef.current) { 
          fileInputRef.current.accept = acceptType; 
          fileInputRef.current.click(); 
      } 
  };
  
  const onEmojiClick = (emojiData: EmojiClickData) => { setNewMessage(prev => prev + emojiData.emoji); };

  const handleSendTemplate = async (templateId: number, variables: Record<string, string>) => {
    if (!remoteJid || !currentChat?.instanceId) return;
    try {
      const response = await fetch('/api/messages/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientJid: remoteJid,
          templateId,
          instanceId: currentChat.instanceId,
          variables
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send template.');
      mutateMessages((currentMessages = []) => [...currentMessages, { ...data, timestamp: new Date(data.timestamp).toISOString() }], false);
      globalMutate('/api/chats');
      toast.success(t('template_sent_success_toast'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSelectDraft = useCallback((draft: DraftItem) => {
    setSelectedDraft(draft);
    setDraftVariables({});
    setDraftVariablesModalOpen(true);
    setShowDraftSuggestions(false);
    setDraftShortcutsOpen(false);
  }, []);

  const handleInsertDraft = useCallback(() => {
    if (!selectedDraft) return;
    const renderedText = selectedDraft.content.replace(/\[\[([\w\-. ]+)\]\]/g, (_, rawKey: string) => {
      const key = rawKey.trim();
      return draftVariables[key] ?? '';
    });
    setNewMessage(renderedText);
    setDraftVariablesModalOpen(false);
    toast.success('Borrador insertado en el chat.');
  }, [draftVariables, selectedDraft]);

  const handleSyncMessages = async (limit: number = 50) => {
    if (!remoteJid || !currentChat?.instanceId) return;
    setIsSyncingMessages(true);
    try {
      const res = await fetch('/api/instance/sync-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: currentChat.instanceId,
          remoteJid,
          limit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('sync_messages.success', { count: data.imported }));
      mutateMessages();
    } catch (err: any) {
      toast.error(err.message || t('sync_messages.error'));
    } finally {
      setIsSyncingMessages(false);
    }
  };

  const requestImprovedReply = useCallback(async (mode: ImproveReplyMode = improveMode) => {
    if (!currentChat?.id) {
      toast.error(t('improve_reply.chat_not_ready_error'));
      return;
    }

    if (!newMessage.trim()) {
      toast.error(t('improve_reply.empty_message_error'));
      return;
    }

    setIsImprovingReply(true);

    try {
      const response = await fetch(`/api/chats/${currentChat.id}/improve-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          composerText: newMessage,
          additionalContext,
          savedContext: savedImproveContext,
          mode,
          metadata: {
            chatName: chatDetails.name,
            contactName: contact?.name || null,
            remoteJid,
            isGroup,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t('improve_reply.generic_error'));
      }

      setSavedImproveContext(data.savedContext || '');
      setImprovedReply(data.suggestion || '');
    } catch (error: any) {
      toast.error(error.message || t('improve_reply.generic_error'));
    } finally {
      setIsImprovingReply(false);
    }
  }, [additionalContext, chatDetails.name, contact?.name, currentChat?.id, improveMode, isGroup, newMessage, remoteJid, savedImproveContext, t]);

  const handleOpenImproveDialog = useCallback(async (mode: ImproveReplyMode) => {
    if (!newMessage.trim()) {
      toast.error(t('improve_reply.empty_message_error'));
      return;
    }

    setImproveMode(mode);
    setImprovedReply('');
    setShowSavedImproveContext(false);
    setImproveDialogOpen(true);
    await requestImprovedReply(mode);
  }, [newMessage, requestImprovedReply, t]);

  const handleInsertImprovedReply = useCallback(() => {
    if (!improvedReply.trim()) return;
    setNewMessage(improvedReply);
    toast.success(t('improve_reply.insert_success_toast'));
    setImproveDialogOpen(false);
  }, [improvedReply, t]);

  const handleCopyImprovedReply = useCallback(async () => {
    if (!improvedReply.trim()) return;

    try {
      await navigator.clipboard.writeText(improvedReply);
      toast.success(t('improve_reply.copy_success_toast'));
    } catch {
      toast.error(t('improve_reply.copy_error_toast'));
    }
  }, [improvedReply, t]);

  const improveActionConfig = useMemo(() => {
    if (improveMode === 'orthography') {
      return {
        title: t('improve_reply.orthography_title'),
        description: t('improve_reply.orthography_description'),
        resultLabel: t('improve_reply.orthography_result_label'),
        resultPlaceholder: t('improve_reply.orthography_result_placeholder'),
        regenerateLabel: t('improve_reply.orthography_button'),
      };
    }

    if (improveMode === 'stylize') {
      return {
        title: t('improve_reply.stylize_title'),
        description: t('improve_reply.stylize_description'),
        resultLabel: t('improve_reply.stylize_result_label'),
        resultPlaceholder: t('improve_reply.stylize_result_placeholder'),
        regenerateLabel: t('improve_reply.stylize_button'),
      };
    }

    return {
      title: t('improve_reply.modal_title'),
      description: t('improve_reply.modal_description'),
      resultLabel: t('improve_reply.result_label'),
      resultPlaceholder: t('improve_reply.result_placeholder'),
      regenerateLabel: t('improve_reply.button'),
    };
  }, [improveMode, t]);

  const improveComposerActions = useMemo(() => ([
    {
      mode: 'improve' as ImproveReplyMode,
      title: t('improve_reply.button'),
      icon: Sparkles,
    },
    {
      mode: 'orthography' as ImproveReplyMode,
      title: t('improve_reply.orthography_button'),
      icon: SpellCheck,
    },
    {
      mode: 'stylize' as ImproveReplyMode,
      title: t('improve_reply.stylize_button'),
      icon: Paintbrush,
    },
  ]), [t]);

  useEffect(() => {
    setSyncDismissed(false);
  }, [remoteJid]);

  useEffect(() => {
    if (!currentChat?.id) {
      return;
    }

    if (lastImproveContextChatIdRef.current === currentChat.id) {
      return;
    }

    lastImproveContextChatIdRef.current = currentChat.id;
    setAdditionalContext('');
    setSavedImproveContext('');
    setShowSavedImproveContext(false);
    setImprovedReply('');
    setImproveDialogOpen(false);
  }, [currentChat?.id]);

  const showSyncBanner = !syncDismissed && currentChat?.instanceId && messages && messages.length === 0 && !isLoading && !error;

  const renderReplyPreview = () => {
    if (!quotedMessage) return null;
    return (
      <div className="relative p-2 px-4 border-t bg-accent">
        <div className="p-2 rounded-md bg-muted border-l-4 border-primary">
          <p className="text-sm font-medium text-primary">Replying...</p>
          <p className="text-sm text-muted-foreground truncate">{quotedMessage.text || 'Media'}</p>
        </div>
        <Button variant="ghost" size="icon" className="absolute top-1 right-2 h-7 w-7 rounded-full" onClick={() => setQuotedMessage(null)}><X className="h-4 w-4 text-muted-foreground" /></Button>
      </div>
    );
  };

  const renderMessages = () => {
    if (isLoading) return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    if (error) return <div className="p-4 text-center text-destructive">Error loading messages.</div>;
    if (!filteredMessages || filteredMessages.length === 0) {
      if (searchQuery) return <div className="p-4 text-center text-muted-foreground">No message found for "{searchQuery}".</div>;
      return <div className="p-4 text-center text-muted-foreground">No messages in this chat yet.</div>;
    }

    return filteredMessages.map((msg, index) => {
        const currentDate = new Date(msg.timestamp);
        let showSeparator = false;
        let dateLabel = '';

        if (index === 0) {
            showSeparator = true;
            dateLabel = formatDateSeparator(currentDate);
        } else {
            const prevMsg = filteredMessages[index - 1];
            const prevDate = new Date(prevMsg.timestamp);
            if (!isSameDay(currentDate, prevDate)) {
                showSeparator = true;
                dateLabel = formatDateSeparator(currentDate);
            }
        }

        return (
            <React.Fragment key={msg.id}>
                {showSeparator && <DateSeparator date={currentDate} label={dateLabel} />}
                <MessageBubble
                    msg={msg}
                    onMediaClick={handleMediaClick}
                    onReply={setQuotedMessage}
                    onRetry={handleRetryMessage}
                    onReact={handleReact}
                    searchQuery={searchQuery}
                    userBubbleColor={activeUserBubble}
                    contactBubbleColor={activeContactBubble}
                    isGroup={isGroup}
                />
            </React.Fragment>
        );
    });
  };

  return (
    <div className="flex h-screen bg-background">
      <div className="flex flex-col flex-1 h-screen">

        <ChatHeader
          chatDetails={chatDetails}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isSidebarCollapsed={chatSidebarCollapsed}
          onToggleSidebar={toggleChatSidebar}
          isGroup={isGroup}
        />

        {showSyncBanner && (
          <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 text-sm shrink-0">
            <Download className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-blue-700 dark:text-blue-300">{t('sync_messages.banner')}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 ml-auto" onClick={() => handleSyncMessages(100)} disabled={isSyncingMessages}>
              {isSyncingMessages ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
              {t('sync_messages.import_btn')}
            </Button>
            <button className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 shrink-0" onClick={() => setSyncDismissed(true)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <main
          className="flex-1 overflow-y-auto p-4 space-y-1"
          style={{
            backgroundColor: activeThemeBg || undefined,
            ...(chatTheme?.backgroundType === 'image' && chatTheme?.backgroundImageUrl
              ? {
                  backgroundImage: `url(${chatTheme.backgroundImageUrl})`,
                  backgroundRepeat: 'repeat',
                  backgroundSize: '200px',
                }
              : {}),
          }}
        >
          {renderMessages()}
          <div ref={messagesEndRef} />
        </main>

        {renderReplyPreview()}

        <footer className="border-t bg-background shrink-0">
          <div className="relative">
            <ChatInput
              isInternalNote={isInternalNote}
              setIsInternalNote={setIsInternalNote}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              recordingStatus={recordingStatus}
              recordingTime={recordingTime}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onCancelRecording={cancelRecording}
              onSendText={handleSendText}
              onSendAudio={handleSendAudio}
              onSendAttachment={handleSendAttachment}
              audioUrl={audioUrl}
              isAudioPlaying={isAudioPlaying}
              toggleAudioPlayback={toggleAudioPlayback}
              audioPlayerRef={audioPlayerRef as React.RefObject<HTMLAudioElement>}
              fileInputRef={fileInputRef as unknown as React.RefObject<HTMLInputElement>}
              handleFileIconClick={handleFileIconClick}
              onEmojiClick={onEmojiClick}
              setQuickRepliesOpen={setQuickRepliesOpen}
              showQuickReplySuggestions={showQuickReplySuggestions}
              setShowQuickReplySuggestions={setShowQuickReplySuggestions}
              filteredQuickReplies={filteredQuickReplies}
              draftsShortcutsOpen={draftShortcutsOpen}
              setDraftsShortcutsOpen={setDraftShortcutsOpen}
              showDraftSuggestions={showDraftSuggestions}
              setShowDraftSuggestions={setShowDraftSuggestions}
              filteredDraftSuggestions={filteredDraftSuggestions}
              onPickDraft={handleSelectDraft}
              isWindowExpired={isWindowExpired}
              onOpenTemplateDialog={() => setTemplateDialogOpen(true)}
              isGroup={isGroup}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end px-3 py-2">
              <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
                {improveComposerActions.map(({ mode, title, icon: Icon }) => {
                  const isLoadingAction = isImprovingReply && improveMode === mode;

                  return (
                    <Button
                      key={mode}
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                      title={title}
                      onClick={() => handleOpenImproveDialog(mode)}
                      disabled={isImprovingReply || !newMessage.trim() || !currentChat?.id}
                    >
                      {isLoadingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </footer>
      </div>

      <ChatSidebar chatDetails={chatDetails} isCollapsed={chatSidebarCollapsed} onToggleCollapse={toggleChatSidebar} isGroup={isGroup} onSyncMessages={() => handleSyncMessages(100)} isSyncingMessages={isSyncingMessages} />

      <QuickRepliesModal open={quickRepliesOpen} onOpenChange={setQuickRepliesOpen} />
      <DraftShortcutsModal
        open={draftShortcutsOpen}
        onOpenChange={setDraftShortcutsOpen}
        drafts={drafts ?? []}
        onSelectDraft={handleSelectDraft}
      />
      <TemplateDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} onSendTemplate={handleSendTemplate} />
      <Dialog open={draftVariablesModalOpen} onOpenChange={setDraftVariablesModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Insertar borrador</DialogTitle>
            <DialogDescription>Completa variables dinámicas antes de insertar el borrador.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            <p className="text-sm font-medium">{selectedDraft?.title}</p>
            {draftPlaceholders.length > 0 ? (
              draftPlaceholders.map((placeholder) => (
                <div key={placeholder} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{placeholder}</p>
                  <Input
                    value={draftVariables[placeholder] ?? ''}
                    onChange={(event) =>
                      setDraftVariables((prev) => ({
                        ...prev,
                        [placeholder]: event.target.value,
                      }))
                    }
                    placeholder={`Ingresa ${placeholder}`}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Este borrador no tiene variables dinámicas.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftVariablesModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleInsertDraft}>Insertar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={improveDialogOpen} onOpenChange={setImproveDialogOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{improveActionConfig.title}</DialogTitle>
            <DialogDescription>{improveActionConfig.description}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('improve_reply.current_text_label')}</label>
              <Textarea value={newMessage} readOnly placeholder={t('improve_reply.current_text_placeholder')} rows={4} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('improve_reply.additional_context_label')}</label>
              <Textarea
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
                placeholder={t('improve_reply.additional_context_placeholder')}
                rows={4}
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setShowSavedImproveContext((prev) => !prev)}
              >
                <div>
                  <p className="text-sm font-medium">{t('improve_reply.saved_context_label')}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(showSavedImproveContext ? 'improve_reply.hide_saved_context' : 'improve_reply.show_saved_context')}
                  </p>
                </div>
                {showSavedImproveContext ? (
                  <ChevronUp className="text-muted-foreground h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" />
                )}
              </button>

              {showSavedImproveContext ? (
                <Textarea
                  className="mt-3"
                  value={savedImproveContext}
                  onChange={(event) => setSavedImproveContext(event.target.value)}
                  placeholder={t('improve_reply.saved_context_placeholder')}
                  rows={6}
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{improveActionConfig.resultLabel}</label>
              <Textarea
                value={improvedReply}
                onChange={(event) => setImprovedReply(event.target.value)}
                placeholder={improveActionConfig.resultPlaceholder}
                rows={7}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleCopyImprovedReply} disabled={!improvedReply.trim()}>
                <Copy className="h-4 w-4" />
                {t('improve_reply.copy_button')}
              </Button>
              <Button type="button" variant="outline" onClick={() => requestImprovedReply(improveMode)} disabled={isImprovingReply || !newMessage.trim()}>
                {isImprovingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {improveActionConfig.regenerateLabel}
              </Button>
            </div>

            <Button type="button" onClick={handleInsertImprovedReply} disabled={!improvedReply.trim()}>
              {t('improve_reply.insert_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Lightbox open={lightboxOpen} close={() => setLightboxOpen(false)} slides={slides} index={lightboxIndex} plugins={[Zoom, Video]} zoom={{ maxZoomPixelRatio: 3, doubleTapDelay: 300 }} />
    </div>
  );
}
