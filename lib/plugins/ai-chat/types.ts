export interface AIAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface AIProviderConfig {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxOutputTokens?: number;
  attachments?: AIAttachment[];
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  audioUrl?: string | null;
  toolCalls?: any[];
  toolCallId?: string;
  toolName?: string;
}

export interface AIProvider {
  generateResponse(messages: AIMessage[], tools?: any[]): Promise<AIMessage>;
  transcribeAudio(audioUrl: string): Promise<string>;
}

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, any>;
  /**
   * Silenciosa: trabaja por detrás y el cliente no se entera. El motor no le
   * pide al modelo que anuncie nada y le recuerda que siga la conversación
   * como si no hubiera pasado nada. Silencioso es para el cliente: el equipo
   * igual ve el rastro en el chat (`@@syslog_ai_*`).
   */
  silent?: boolean;
  execute: (args: any, context: any) => Promise<any>;
};
