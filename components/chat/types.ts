export type Reaction = {
  id: number;
  emoji: string;
  fromMe: boolean;
  remoteJid: string | null;
  participantName: string | null;
};

export type Message = {
  isAi: any;
  isAutomation: any;
  id: string;
  chatId: number;
  fromMe: boolean;
  messageType: string | null;
  text: string | null;
  timestamp: string;
  mediaUrl: string | null;
  mediaMimetype: string | null;
  mediaCaption: string | null;
  mediaFileLength?: string | null;
  contactName?: string | null;
  contactVcard?: string | null;
  locationLatitude?: string | null;
  locationLongitude?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  quotedMessageId?: string | null;
  quotedMessageText?: string | null;
  mediaSeconds?: number | null;
  mediaIsPtt?: boolean | null;
  status?: 'sent' | 'delivered' | 'read' | 'error' | null;
  isInternal?: boolean;
  errorMessage?: string | null;
  participant?: string | null;
  participantName?: string | null;
  reactions?: Reaction[];
};

export type QuickReply = {
  id: number;
  shortcut: string;
  content: string;
};

export type NewMessagePayload = Message & {
  remoteJid: string;
  instance: string;
  instanceId?: number; 
};

export type ChatDetails = {
  remoteJid: string | null;
  name?: string | null;
  profilePicUrl?: string | null;
  lastCustomerInteraction?: string | null;
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS';
};

export type ContactData = {
  id: number;
  name: string;
};

export type TeamData = { id: number; };

export type UserData = { id: number; name: string; email: string; };

export type RecordingStatus = 'idle' | 'recording' | 'review' | 'sending';