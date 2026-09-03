export type ClientItem = { _recordId: string; name: string; status: string; notes: string; contacted: boolean; phone?: string };

export type CRMContact = {
  id: number; name: string; phone: string | null; notes: string | null;
  profilePicUrl?: string | null;
  funnelStage?: { id: number; name: string; emoji?: string | null } | null;
  instanceName?: string | null;
  remoteJid?: string | null;
  instanceId?: number | null;
  customerId?: number | null;
  assignedUser?: { id: number; name: string; email: string } | null;
  tags?: { id: number; name: string; color: string }[];
  customData?: Record<string, any>;
};

export type CustomerInternalNote = {
  id: string;
  text: string | null;
  timestamp: string;
  participantName?: string | null;
};

export type CustomerAttachment = {
  id: number;
  url: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};

export type CustomerActivity = {
  internalNotes: CustomerInternalNote[];
  attachments: CustomerAttachment[];
  error?: string;
};

export type ChatMediaMessage = {
  id: string;
  fromMe: boolean;
  messageType: string | null;
  text: string | null;
  timestamp: string;
  mediaUrl: string | null;
  mediaMimetype: string | null;
  mediaCaption: string | null;
  mediaFileLength?: string | null;
  mediaSeconds?: number | null;
};

export type CustomerChatMedia = {
  images: ChatMediaMessage[];
  videos: ChatMediaMessage[];
  docs: ChatMediaMessage[];
  audio: ChatMediaMessage[];
  error?: string;
};

export type ClientProduct = {
  _recordId: string;
  clientId: string;
  name: string;
  category: string;
  frequency: string;
  amount: number;
  currency: string;
  status: string;
  startDate: string;
  notes?: string;
};

export type DetailSource = { type: 'local'; item: ClientItem } | { type: 'crm'; contact: CRMContact };

export type FunnelStage = { id: number; name: string; emoji: string | null };
export type CustomField = { id: number; key: string; name: string; type: 'text' | 'boolean'; position: number };
export type TeamMember = { id: number; name: string; email: string };
