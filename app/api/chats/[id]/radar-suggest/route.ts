import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { aiConfigs, chats, departmentMembers, messages } from '@/lib/db/schema';
import { getAIProviderForConfig } from '@/lib/plugins/ai-chat/service';
import type { AIMessage } from '@/lib/plugins/ai-chat/types';
import { getRadarTarget } from '@/lib/plugins/radar/server/access';

export const dynamic = 'force-dynamic';

// Radar (la skill radar-analyst) nunca redacta mensajes al cliente por diseño
// (SKILL.md, regla 11). Estas sugerencias las genera esta UI, no la skill:
// reusa exactamente el mismo patrón que /api/chats/[id]/improve-reply (modo
// "suggest"), sumando la ficha Radar como contexto extra, y devuelve varias
// variantes en vez de una sola.

async function userCanAccessChat(chatId: number, permCtx: NonNullable<Awaited<ReturnType<typeof getUserPermissionContext>>>) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, permCtx.teamId)),
    with: {
      contact: {
        columns: {
          id: true,
          name: true,
          notes: true,
          customData: true,
          assignedUserId: true,
          assignedDepartmentId: true,
        },
      },
    },
  });

  if (!chat) return { chat: null, allowed: false as const };
  if (permCtx.canSeeAllChats) return { chat, allowed: true as const };

  const contact = chat.contact;
  if (!contact) return { chat, allowed: false as const };
  if (contact.assignedUserId === permCtx.userId) return { chat, allowed: true as const };

  if (permCtx.chatVisibility === 'department' && contact.assignedDepartmentId) {
    const memberships = await db.query.departmentMembers.findMany({
      where: eq(departmentMembers.userId, permCtx.userId),
      columns: { departmentId: true },
    });
    const departmentIds = memberships.map((m) => m.departmentId);
    return { chat, allowed: departmentIds.includes(contact.assignedDepartmentId) };
  }

  return { chat, allowed: false as const };
}

function buildRadarContext(customData: Record<string, unknown> | null | undefined) {
  if (!customData) return null;
  const parts: string[] = [];
  const intencion = customData.radar_intencion;
  const objecion = customData.radar_objecion;
  const estrategia = customData.radar_estrategia;
  const prioridad = customData.radar_prioridad;
  if (typeof prioridad === 'string' && prioridad.trim()) parts.push(`Prioridad Radar: ${prioridad.trim()}`);
  if (typeof intencion === 'string' && intencion.trim()) parts.push(`Intención detectada: ${intencion.trim()}`);
  if (typeof objecion === 'string' && objecion.trim() && objecion.trim() !== 'sin_objecion') {
    parts.push(`Objeción principal: ${objecion.trim()}`);
  }
  if (typeof estrategia === 'string' && estrategia.trim()) parts.push(`Estrategia recomendada por Radar: ${estrategia.trim()}`);
  return parts.length ? parts.join('\n') : null;
}

function buildConversationExcerpt(
  recentMessages: Array<{ fromMe: boolean; text: string | null; mediaCaption: string | null; messageType: string | null }>,
) {
  return recentMessages
    .map((message) => {
      const speaker = message.fromMe ? 'Agent' : 'Customer';
      const content = message.text?.trim() || message.mediaCaption?.trim() || `[${message.messageType || 'message'}]`;
      return `${speaker}: ${content}`;
    })
    .join('\n');
}

const SUGGEST_TASK_INSTRUCTIONS = [
  'Task: propose 2 to 3 short, distinct WhatsApp-ready reply drafts for the human agent to choose from, based on the recent conversation, the saved context, and the Radar sales-intelligence context below.',
  'Rules:',
  '- Each option must be a complete, standalone reply — never a fragment or a list of ideas.',
  '- Keep every option brief, natural, and conversational, matching how a human agent replies on WhatsApp.',
  '- Use the Radar context (intent, objection, recommended strategy) to make the replies more relevant, but do not mention Radar, AI, or that the reply was generated.',
  '- Do not invent discounts, promises, dates, prices, or unavailable information.',
  '- If the conversation gives no clear opening, propose reasonable short follow-up messages instead of refusing.',
  '- Return ONLY a JSON array of strings, e.g. ["option one", "option two"], with no markdown fences, no keys, no explanations.',
].join('\n');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const target = await getRadarTarget();
    if (!target) {
      return NextResponse.json({ error: 'Radar no está habilitado para este usuario' }, { status: 403 });
    }

    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const chatId = Number(id);
    if (!Number.isInteger(chatId) || chatId <= 0) {
      return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });
    }

    const { chat, allowed } = await userCanAccessChat(chatId, permCtx);
    if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [config, recentMessages] = await Promise.all([
      db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, permCtx.teamId) }),
      db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        orderBy: [desc(messages.timestamp)],
        columns: { fromMe: true, text: true, mediaCaption: true, messageType: true },
        limit: 12,
      }),
    ]);

    if (!config) {
      return NextResponse.json({ error: 'AI provider is not configured' }, { status: 400 });
    }

    const radarContext = buildRadarContext(chat.contact?.customData as Record<string, unknown> | null | undefined);
    const orderedMessages = [...recentMessages].reverse();
    const conversationExcerpt = buildConversationExcerpt(orderedMessages);

    const radarSuggestPrompt = [
      config.systemPrompt?.trim() ? `Base team instructions:\n${config.systemPrompt.trim()}` : null,
      SUGGEST_TASK_INSTRUCTIONS,
    ].filter(Boolean).join('\n');

    const provider = await getAIProviderForConfig({ ...config, systemPrompt: radarSuggestPrompt });

    const promptPayload = [
      radarContext ? `Radar context:\n${radarContext}` : null,
      chat.contact?.notes?.trim() ? `Saved notes:\n${chat.contact.notes.trim()}` : null,
      conversationExcerpt ? `Recent conversation:\n${conversationExcerpt}` : null,
    ].filter(Boolean).join('\n\n');

    const aiMessages: AIMessage[] = [{ role: 'user', content: promptPayload || 'No conversation yet.' }];
    const response = await provider.generateResponse(aiMessages);
    const raw = response.content?.trim() ?? '';

    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((s) => s.trim());
      }
    } catch {
      // El proveedor no devolvió JSON limpio: degradamos a una sola sugerencia
      // en vez de fallar, usando la respuesta cruda como única variante.
      if (raw) suggestions = [raw];
    }

    if (!suggestions.length) {
      return NextResponse.json({ error: 'The AI provider returned no suggestions' }, { status: 502 });
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 3) });
  } catch (error) {
    console.error('Error building Radar suggestions:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
