import OpenAI from 'openai';
import { AIProvider, AIProviderConfig, AIMessage, ToolDefinition } from '../types';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import fs from 'fs/promises';
import path from 'path';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private systemPrompt?: string;
  private temperature: number;
  private maxOutputTokens: number;
  private attachments: { name: string; url: string; type: string; size: number }[];

  constructor(config: AIProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.temperature = config.temperature ?? 0.7;
    this.maxOutputTokens = config.maxOutputTokens ?? 1000;
    this.attachments = config.attachments || [];
  }

  private async getFileContent(url: string): Promise<{ data: string, mimeType: string } | null> {
    try {
        let fileData: string;
        let mimeType = 'application/octet-stream';
        
        const cleanPath = url.replace(/\\/g, '/');
        const filePath = path.join(process.cwd(), 'public', cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath);
        
        try {
            await fs.access(filePath);
        } catch {
            return null;
        }

        const fileBuffer = await fs.readFile(filePath);
        fileData = fileBuffer.toString('base64');
            
        if (cleanPath.endsWith('.png')) mimeType = 'image/png';
        else if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (cleanPath.endsWith('.webp')) mimeType = 'image/webp';
        else if (cleanPath.endsWith('.gif')) mimeType = 'image/gif';
        else if (cleanPath.endsWith('.txt') || cleanPath.endsWith('.md') || cleanPath.endsWith('.csv') || cleanPath.endsWith('.json')) mimeType = 'text/plain';

        return { data: fileData, mimeType };
    } catch (e) {
        return null;
    }
  }

  async generateResponse(messages: AIMessage[], tools?: ToolDefinition[]): Promise<AIMessage> {
    const formattedTools: ChatCompletionTool[] | undefined = tools?.map(t => ({
      type: 'function' as const, 
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }
    }));

    const apiMessages: any[] = [...messages.map(m => {
        if (m.role === 'tool') {
            return {
                role: 'tool',
                tool_call_id: m.toolCallId,
                content: m.content
            };
        }
        return {
            role: m.role,
            content: m.content,
            tool_calls: m.toolCalls 
        };
    })];

    let finalSystemPrompt = this.systemPrompt || "";
    const systemImages: { type: 'image_url', image_url: { url: string } }[] = [];

    if (this.attachments.length > 0) {
        for (const att of this.attachments) {
            const file = await this.getFileContent(att.url);
            if (!file) continue;

            if (att.type.startsWith('image/')) {
                systemImages.push({
                    type: 'image_url',
                    image_url: { url: `data:${file.mimeType};base64,${file.data}` }
                });
            } else if (att.type.startsWith('text/') || att.name.endsWith('.txt') || att.name.endsWith('.md') || att.name.endsWith('.csv') || att.name.endsWith('.json')) {
                const textContent = Buffer.from(file.data, 'base64').toString('utf-8');
                finalSystemPrompt += `\n\n--- Knowledge Base (${att.name}) ---\n${textContent}\n--- End ---\n`;
            }
        }
    }

    const systemContent: any[] = [{ type: 'text', text: finalSystemPrompt }];
    systemImages.forEach(img => systemContent.push(img));

    const cleanMessages = apiMessages.filter(m => m.role !== 'system');
    cleanMessages.unshift({ role: 'system', content: systemContent });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: cleanMessages,
      temperature: this.temperature,
      max_tokens: this.maxOutputTokens,
      tools: formattedTools && formattedTools.length > 0 ? formattedTools : undefined,
    });

    const choice = response.choices[0].message;

    return {
      role: 'assistant',
      content: choice.content,
      toolCalls: choice.tool_calls
    };
  }

  async transcribeAudio(audioUrl: string): Promise<string> {
    try {
        // Las rutas internas (`/uploads/audio/xxx.ogg`) se leen del disco: no
        // son URLs que fetch acepte, y servirlas por /api/media exige la sesión
        // del usuario, que desde un cron no existe.
        const file = audioUrl.startsWith('http')
            ? await (async () => {
                const response = await fetch(audioUrl);
                const blob = await response.blob();
                return new File([blob], "audio.mp3", { type: blob.type });
            })()
            : await (async () => {
                const clean = audioUrl.replace(/\\/g, '/');
                const filePath = path.join(process.cwd(), 'public', clean.startsWith('/') ? clean.slice(1) : clean);
                const buffer = await fs.readFile(filePath);
                const extension = path.extname(filePath).toLowerCase();
                // whisper-1 decide el decodificador por la extensión del nombre,
                // así que el nombre tiene que conservar la real: los audios de
                // WhatsApp son .ogg y mandarlos como "audio.mp3" los rechaza.
                const mimeTypes: Record<string, string> = {
                    '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
                    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
                    '.wav': 'audio/wav', '.webm': 'audio/webm', '.flac': 'audio/flac',
                };
                return new File([new Uint8Array(buffer)], `audio${extension || '.ogg'}`, {
                    type: mimeTypes[extension] || 'audio/ogg',
                });
            })();

        const transcription = await this.client.audio.transcriptions.create({
            file: file, 
            model: "whisper-1",
        });
        return transcription.text;
    } catch (e) {
        console.error(e);
        throw e;
    }
  }
}