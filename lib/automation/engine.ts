import { db } from '@/lib/db/drizzle';
import { 
  automations, 
  automationSessions, 
  contacts, 
  contactTags, 
  messages, 
  evolutionInstances, 
  aiConfigs,
  aiSessions, 
  chats,
  customFields as customFieldDefinitions,
  departments,
  funnelStages,
  tags,
  teamMembers,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { pusherServer } from '@/lib/pusher-server';
import { getEffectiveAIState, overrideDeSesion } from '@/lib/ai/session-state';
import type {
  AutomationCanvasEdge,
  AutomationCanvasNode,
  ButtonMessageButton,
  ConditionEntry,
  FormField,
  GoToNodeData,
  ListMessageItem,
  MenuSimpleOption,
  SaveContactNodeData,
  StartNodeData,
} from '@/lib/automation/flow-schema';
import {
  buildMenuSimpleMessage,
  matchMenuSimpleReplyByMarker,
} from '@/lib/automation/menu-simple';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const GRAPH_API_URL = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";
const NODE_HISTORY_KEY = "__nodeHistory";
/** Una sesión activa sin movimiento en dos semanas es un chat atrapado, no una conversación. */
const SESSION_MAX_IDLE_DAYS = 14;
const FORM_PROGRESS_KEY = "__formProgress";

type FlowData = {
  nodes: AutomationCanvasNode[];
  edges: AutomationCanvasEdge[];
};

type InstanceConfig = {
    instanceName: string;
    accessToken: string;
    metaToken?: string | null;
    metaPhoneNumberId?: string | null;
};

type AutomationSessionVariables = Record<string, unknown> & {
  [NODE_HISTORY_KEY]?: string[];
  [FORM_PROGRESS_KEY]?: {
    nodeId: string;
    fieldIndex: number;
  };
};

function normalizeSessionVariables(raw: unknown): AutomationSessionVariables {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return raw as AutomationSessionVariables;
}

function getNodeHistory(variables: AutomationSessionVariables): string[] {
  const history = variables[NODE_HISTORY_KEY];
  if (!Array.isArray(history)) return [];
  return history.filter((item): item is string => typeof item === "string");
}

function appendNodeToHistory(variables: AutomationSessionVariables, nodeId: string): AutomationSessionVariables {
  return {
    ...variables,
    [NODE_HISTORY_KEY]: [...getNodeHistory(variables), nodeId],
  };
}

function extractStringVariables(variables: AutomationSessionVariables): Record<string, string> {
  return Object.entries(variables).reduce<Record<string, string>>((acc, [key, value]) => {
    if (key !== NODE_HISTORY_KEY && typeof value === "string") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function getFormProgress(
  variables: AutomationSessionVariables,
  nodeId: string,
): { nodeId: string; fieldIndex: number } {
  const progress = variables[FORM_PROGRESS_KEY];
  if (
    progress &&
    typeof progress === 'object' &&
    progress.nodeId === nodeId &&
    Number.isInteger(progress.fieldIndex)
  ) {
    return {
      nodeId,
      fieldIndex: Math.max(0, progress.fieldIndex),
    };
  }
  return { nodeId, fieldIndex: 0 };
}

function buildFormFieldMessage(
  field: FormField,
  variables: AutomationSessionVariables,
): string {
  const stringVariables = extractStringVariables(variables);
  const label = replaceVariables(field.label, stringVariables);
  if (field.type !== 'menu') return label;
  return buildMenuSimpleMessage({
    label,
    markerStyle: field.markerStyle,
    menuOptions: field.menuOptions ?? [],
  });
}

function matchesFormMenuField(
  field: FormField,
  text: string,
  variables: AutomationSessionVariables,
): boolean {
  const options = field.menuOptions ?? [];
  const stringVariables = extractStringVariables(variables);
  for (const option of options) {
    if (!option.matchValue?.trim()) continue;
    if (
      evaluateCondition(
        {
          id: option.id,
          type: option.matchType || 'text',
          operator: option.matchOperator || 'equals',
          value: option.matchValue,
          value2: option.matchValue2,
        },
        text,
        stringVariables,
      )
    ) {
      return true;
    }
  }
  return matchMenuSimpleReplyByMarker(options, text) !== -1;
}

function replaceVariables(text: string, variables: Record<string, string> | null): string {
    if (!text || !variables) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] || "";
    });
}

function resolveVariableTemplate(
  template: string,
  variables: Record<string, string>,
): { value: string; missingVariables: string[] } {
  const missingVariables: string[] = [];
  const value = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const resolved = variables[key];
    if (typeof resolved !== 'string' || !resolved.trim()) {
      missingVariables.push(key);
      return '';
    }
    return resolved.trim();
  }).trim();

  return { value, missingVariables };
}

function parseBooleanContactValue(value: string): boolean | undefined {
  const normalized = value.trim().toLocaleLowerCase('es');
  if (['true', '1', 'si', 'sí', 's'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return undefined;
}

async function fileToBase64(filePath: string): Promise<string | null> {
    try {
        const fileBuffer = await fs.readFile(filePath);
        return fileBuffer.toString('base64');
    } catch (error) {
        return null;
    }
}

function evaluateCondition(condition: ConditionEntry, text: string, variables: Record<string, string>): boolean {
    let valueToCheck = text;
    let targetValue = condition.value;
    let targetValue2 = condition.value2;

    if (condition.type === 'variable') {
        const varName = condition.value;
        const varValue = variables[varName];
        return !!varValue;
    }

    if (condition.type === 'time') {
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0');
        const currentMinutes = now.getMinutes().toString().padStart(2, '0');
        valueToCheck = `${currentHours}:${currentMinutes}`;
    }

    if (condition.type === 'number') {
        const numCheck = parseFloat(valueToCheck);
        const numTarget = parseFloat(targetValue);
        const numTarget2 = parseFloat(targetValue2 || '');

        if (isNaN(numCheck) || isNaN(numTarget)) return false;

        switch (condition.operator) {
            case 'equals': return numCheck === numTarget;
            case 'greater_than': return numCheck > numTarget;
            case 'less_than': return numCheck < numTarget;
            case 'gte': return numCheck >= numTarget;
            case 'lte': return numCheck <= numTarget;
            case 'between': return numCheck >= numTarget && numCheck <= numTarget2;
            default: return false;
        }
    }

    const strCheck = String(valueToCheck).toLowerCase();
    const strTarget = String(targetValue).toLowerCase();
    const strTarget2 = String(targetValue2).toLowerCase();

    switch (condition.operator) {
        case 'equals': return strCheck === strTarget;
        case 'not_equals': return strCheck !== strTarget;
        case 'contains': return strCheck.includes(strTarget);
        case 'starts_with': return strCheck.startsWith(strTarget);
        case 'ends_with': return strCheck.endsWith(strTarget);
        case 'greater_than': return strCheck > strTarget;
        case 'less_than': return strCheck < strTarget;
        case 'gte': return strCheck >= strTarget;
        case 'lte': return strCheck <= strTarget;
        case 'between': return strCheck >= strTarget && strCheck <= strTarget2;
        default: return false;
    }
}

/**
 * Menor = se evalúa antes. Los triggers con keywords explícitas (exact_match/contains)
 * son específicos y deben ganarle a los catch-all (first_message matchea cualquier
 * primer mensaje; fallback matchea cualquier mensaje) cuando varias automatizaciones
 * activas de la misma instancia podrían calzar con el mismo texto entrante.
 */
function triggerSpecificityRank(data: StartNodeData): number {
    const keywords = data.keywords || [];
    switch (data.triggerType) {
        case 'exact_match':
        case 'contains':
            return keywords.length > 0 ? 0 : 1;
        case 'fallback':
            return 2;
        case 'first_message':
            return 1;
        default:
            return keywords.length > 0 ? 0 : 1;
    }
}

export async function processAutomation(
  teamId: number,
  chatId: number,
  remoteJid: string,
  incomingText: string,
  instanceData: { instanceName: string; accessToken: string }, 
  instanceId: number
): Promise<boolean> {
  const text = incomingText.trim();
  
  const instance = await db.query.evolutionInstances.findFirst({
      where: eq(evolutionInstances.id, instanceId),
      columns: { accessToken: true, instanceName: true, metaToken: true, metaPhoneNumberId: true }
  });

  if (!instance || !instance.accessToken) {
      return false;
  }

  const config: InstanceConfig = {
      accessToken: instance.accessToken,
      instanceName: instance.instanceName,
      metaToken: instance.metaToken,
      metaPhoneNumberId: instance.metaPhoneNumberId
  };

  let session = await db.query.automationSessions.findFirst({
    where: and(
      eq(automationSessions.chatId, chatId),
      eq(automationSessions.status, 'active')
    ),
    with: { automation: true }
  });

  if (session && session.automation.instanceId !== instanceId) return false;

  // Una sesión viva de una automatización que alguien APAGÓ (o que lleva más
  // de dos semanas sin moverse) no es una conversación en curso: es un chat
  // atrapado. Había 76 chats en "PRIMER MENU" desactivado, y un flujo apagado
  // llegó a mandar 10 mensajes. Se cierra y se sigue como si no hubiera sesión:
  // así el chat puede entrar a otra automatización o a la IA.
  if (session) {
    const idleMs = Date.now() - new Date(session.updatedAt ?? session.createdAt ?? Date.now()).getTime();
    const motivo = !session.automation.isActive ? 'automatizacion_desactivada' : idleMs > SESSION_MAX_IDLE_DAYS * 86_400_000 ? 'sesion_vencida' : null;
    if (motivo) {
      await db.update(automationSessions).set({ status: 'completed', updatedAt: new Date() }).where(eq(automationSessions.id, session.id));
      console.log(`[automation] sesión ${session.id} cerrada (${motivo}) en chat ${chatId}`);
      session = undefined;
    }
  }

  if (!session) {
    // If the chat was manually cut/closed by an operator, do not auto-trigger
    // any automation again until it is manually re-triggered.
    const chatRow = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { automationDisabled: true }
    });
    if (chatRow?.automationDisabled) return false;

    const activeAutomations = await db.query.automations.findMany({
      where: and(
        eq(automations.teamId, teamId),
        eq(automations.isActive, true),
        eq(automations.instanceId, instanceId)
      )
    });

    if (activeAutomations.length === 0) return false;

    const contactData = await db.query.contacts.findFirst({
        where: eq(contacts.chatId, chatId),
        with: { contactTags: true }
    });

    const messageCount = await db.$count(messages, eq(messages.chatId, chatId));
    const isFirstMessage = messageCount <= 1;

    let matchedAutomation = null;
    let fallbackAutomation = null;

    // Sin esto, dos automatizaciones activas para la misma instancia compiten en el
    // orden en que Postgres devuelve las filas (sin ORDER BY, en la práctica el id
    // ascendente), y una automatización genérica de "primer mensaje" sin keywords
    // (ej. un "COMIENZO" catch-all) puede robarle el mensaje a una automatización
    // específica por palabra clave (ej. "COMIENZO Paraguay (Ads)") solo por tener un
    // id menor. Evaluamos primero los triggers con keywords explícitas, dejando
    // first_message/fallback (que matchean cualquier mensaje) para el final.
    const candidates = activeAutomations
      .map((automation) => {
        const nodes = automation.nodes as AutomationCanvasNode[];
        const startNode = nodes.find(n => n.type === 'start');
        if (!startNode) return null;
        return { automation, data: startNode.data as unknown as StartNodeData };
      })
      .filter((candidate): candidate is { automation: typeof activeAutomations[number]; data: StartNodeData } => candidate !== null)
      .sort((a, b) => triggerSpecificityRank(a.data) - triggerSpecificityRank(b.data));

    for (const { automation, data } of candidates) {
        if (data.conditions) {
            if (data.conditions.funnelStageId && (!contactData || contactData.funnelStageId?.toString() !== data.conditions.funnelStageId)) continue;
            if (data.conditions.assignedUserId && (!contactData || contactData.assignedUserId?.toString() !== data.conditions.assignedUserId)) continue;
            if (data.conditions.departmentId && (!contactData || contactData.assignedDepartmentId?.toString() !== data.conditions.departmentId)) continue;
            if (data.conditions.tagId && (!contactData || !contactData.contactTags.some(ct => ct.tagId.toString() === data.conditions?.tagId))) continue;
        }

        const keywords = data.keywords || [];
        let isMatch = false;

        switch (data.triggerType) {
            case 'exact_match': if (keywords.some(k => k.toLowerCase() === text.toLowerCase())) isMatch = true; break;
            case 'contains': if (keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) isMatch = true; break;
            case 'first_message': if (isFirstMessage) isMatch = true; break;
            case 'fallback': fallbackAutomation = automation; break;
            default: if (keywords.length === 0 || keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) isMatch = true;
        }

        if (isMatch) { matchedAutomation = automation; break; }
    }

    const finalAutomation = matchedAutomation || fallbackAutomation;

    if (finalAutomation) {
        const flow = { nodes: finalAutomation.nodes as AutomationCanvasNode[], edges: finalAutomation.edges as AutomationCanvasEdge[] };
        const startNode = flow.nodes.find(n => n.type === 'start');
        
        if (startNode) {
            const [newSession] = await db.insert(automationSessions).values({
                teamId, automationId: finalAutomation.id, chatId, currentNodeId: startNode.id, status: 'active'
            }).returning();
            
            session = { ...newSession, automation: finalAutomation } as any;

            await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
                chatId, type: 'automation', status: 'active'
            });

            const edge = flow.edges.find(e => e.source === startNode.id);
            if (edge) {
                await executeStep(session!, flow, edge.target, text, config, remoteJid, teamId, chatId);
            }
            return true;
        }
    }
    return false;
  }

  const flow = {
      nodes: session.automation.nodes as AutomationCanvasNode[],
      edges: session.automation.edges as AutomationCanvasEdge[]
  };

  const currentNode = flow.nodes.find(n => n.id === session?.currentNodeId);
  
  if (!currentNode) return false;

  let nextNodeId: string | undefined;

  if (currentNode.type === 'collect') {
      const variableName = currentNode.data.variable as string;
      if (variableName) {
          const currentVars = normalizeSessionVariables(session.variables);
          const newVars = { ...currentVars, [variableName]: text };
          
          await db.update(automationSessions)
            .set({ variables: newVars, updatedAt: new Date() })
            .where(eq(automationSessions.id, session.id));
          
          session.variables = newVars;
      }
      const edge = flow.edges.find(e => e.source === currentNode.id);
      nextNodeId = edge?.target;
  }
  else if (currentNode.type === 'form') {
      const fields = (currentNode.data.fields as FormField[]) || [];
      const currentVars = normalizeSessionVariables(session.variables);
      const progress = getFormProgress(currentVars, currentNode.id);
      const field = fields[progress.fieldIndex];

      if (!field) {
          const { [FORM_PROGRESS_KEY]: _completedProgress, ...variablesWithoutProgress } = currentVars;
          await db.update(automationSessions)
            .set({ variables: variablesWithoutProgress, updatedAt: new Date() })
            .where(eq(automationSessions.id, session.id));
          session.variables = variablesWithoutProgress;
          nextNodeId = flow.edges.find(e => e.source === currentNode.id)?.target;
      } else {
          if (field.type === 'menu' && !matchesFormMenuField(field, text, currentVars)) {
              await sendEvolutionMessage(config, remoteJid, "sendText", {
                  text: buildFormFieldMessage(field, currentVars),
              }, teamId, chatId);
              return true;
          }

          const nextIndex = progress.fieldIndex + 1;
          const nextField = fields[nextIndex];
          const variablesWithAnswer: AutomationSessionVariables = {
              ...currentVars,
              [field.variable]: text,
          };

          if (nextField) {
              variablesWithAnswer[FORM_PROGRESS_KEY] = {
                  nodeId: currentNode.id,
                  fieldIndex: nextIndex,
              };
              await db.update(automationSessions)
                .set({ variables: variablesWithAnswer, updatedAt: new Date() })
                .where(eq(automationSessions.id, session.id));
              session.variables = variablesWithAnswer;
              await sendEvolutionMessage(config, remoteJid, "sendText", {
                  text: buildFormFieldMessage(nextField, variablesWithAnswer),
              }, teamId, chatId);
              return true;
          }

          const {
              [FORM_PROGRESS_KEY]: _finishedProgress,
              ...variablesWithoutProgress
          } = variablesWithAnswer;
          await db.update(automationSessions)
            .set({ variables: variablesWithoutProgress, updatedAt: new Date() })
            .where(eq(automationSessions.id, session.id));
          session.variables = variablesWithoutProgress;
          nextNodeId = flow.edges.find(e => e.source === currentNode.id)?.target;
      }
  }
  else if (currentNode.type === 'options' || currentNode.type === 'button_message' || currentNode.type === 'list_message') {
      let selectedEdge: AutomationCanvasEdge | undefined;

      if (currentNode.type === 'options') {
          const options = (currentNode.data.options as string[]) || [];
          let selectedIndex = -1;

          if (!isNaN(Number(text)) && Number(text) > 0 && Number(text) <= options.length) {
              selectedIndex = Number(text) - 1;
          } else {
              selectedIndex = options.findIndex(opt => opt.toLowerCase() === text.toLowerCase());
          }

          if (selectedIndex !== -1) {
              const handleId = `option-${selectedIndex}`;
              selectedEdge = flow.edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          }
      } 
      else if (currentNode.type === 'button_message') {
          const buttons = (currentNode.data.buttons as ButtonMessageButton[]) || [];
          const buttonIndex = buttons.findIndex(b => b.text.toLowerCase() === text.toLowerCase() || b.value === text);
          if (buttonIndex !== -1) {
              const handleId = `btn-${buttons[buttonIndex].id || buttonIndex}`;
              selectedEdge = flow.edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          }
      }
      else if (currentNode.type === 'list_message') {
          const items = (currentNode.data.items as ListMessageItem[]) || [];
          const itemIndex = items.findIndex(i => i.title.toLowerCase() === text.toLowerCase() || i.rowId === text);
          if (itemIndex !== -1) {
              const handleId = `list-${items[itemIndex].id || itemIndex}`;
              selectedEdge = flow.edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          }
      }

      if (selectedEdge) {
          nextNodeId = selectedEdge.target;
      } else {
          await sendEvolutionMessage(config, remoteJid, "sendText", {
             text: "Opção inválida. Por favor, tente novamente."
          }, teamId, chatId);
          return true;
      }
  }
  else if (currentNode.type === 'menu_simple') {
      const menuOptions = (currentNode.data.menuOptions as MenuSimpleOption[]) || [];
      const variables = normalizeSessionVariables(session.variables) as Record<string, string>;

      // Match priority: an option's advanced condition first, then auto match by
      // marker (number/letter/emoji) or option text.
      let matchedOption: MenuSimpleOption | undefined;
      for (const option of menuOptions) {
          if (option.matchValue && option.matchValue.trim()) {
              const cond: ConditionEntry = {
                  id: option.id,
                  type: option.matchType || 'text',
                  operator: option.matchOperator || 'equals',
                  value: option.matchValue,
                  value2: option.matchValue2,
              };
              if (evaluateCondition(cond, text, variables)) {
                  matchedOption = option;
                  break;
              }
          }
      }
      if (!matchedOption) {
          const idx = matchMenuSimpleReplyByMarker(menuOptions, text);
          if (idx !== -1) matchedOption = menuOptions[idx];
      }

      let selectedEdge: AutomationCanvasEdge | undefined;
      if (matchedOption) {
          selectedEdge = flow.edges.find(
              e => e.source === currentNode.id && e.sourceHandle === `menu-${matchedOption!.id}`,
          );
      }
      // No option matched (or its branch isn't wired): use the fallback handle.
      if (!selectedEdge) {
          selectedEdge = flow.edges.find(
              e => e.source === currentNode.id && e.sourceHandle === 'fallback',
          );
      }

      if (selectedEdge) {
          // Optionally store the raw reply (collect behaviour).
          const variableName = (currentNode.data.variable as string | undefined)?.trim();
          if (variableName) {
              const newVars = { ...normalizeSessionVariables(session.variables), [variableName]: text };
              await db.update(automationSessions)
                .set({ variables: newVars, updatedAt: new Date() })
                .where(eq(automationSessions.id, session.id));
              session.variables = newVars;
          }
          // Global delay applied before continuing to the chosen branch.
          const delaySeconds = Number(currentNode.data.globalDelaySeconds) || 0;
          if (delaySeconds > 0) {
              await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
          }
          nextNodeId = selectedEdge.target;
      } else {
          // Invalid reply and no fallback wired: re-send the menu and keep waiting.
          // If NO option/fallback edge exists at all, the flow is stuck here forever;
          // log it so an unwired menu can be traced.
          const hasAnyMenuEdge = flow.edges.some(e => e.source === currentNode.id);
          if (!hasAnyMenuEdge || matchedOption) {
              console.warn(
                  `[automation] menu_simple atascado: nodo "${currentNode.id}" sin arista ` +
                  `${matchedOption ? `para la opción "${matchedOption.id}"` : "de salida"} ` +
                  `ni fallback (automationId=${session.automationId}, chatId=${chatId}).`,
              );
          }
          await sendEvolutionMessage(config, remoteJid, "sendText", {
              text: buildMenuSimpleMessage({
                  label: replaceVariables((currentNode.data.label as string) || '', variables),
                  markerStyle: currentNode.data.markerStyle,
                  menuOptions,
              }),
          }, teamId, chatId);
          return true;
      }
  }
  else {
      const edge = flow.edges.find(e => e.source === currentNode.id);
      nextNodeId = edge?.target;
  }

  if (nextNodeId) {
      await executeStep(session, flow, nextNodeId, text, config, remoteJid, teamId, chatId);
      return true;
  }

  return false;
}

type ManualTriggerOptions = {
  automationId: number;
  startNodeId?: string | null;
};

export async function triggerAutomationManually(
  teamId: number,
  chatId: number,
  remoteJid: string,
  instanceId: number,
  options: ManualTriggerOptions
): Promise<boolean> {
  const instance = await db.query.evolutionInstances.findFirst({
    where: eq(evolutionInstances.id, instanceId),
    columns: { accessToken: true, instanceName: true, metaToken: true, metaPhoneNumberId: true }
  });

  if (!instance || !instance.accessToken) return false;

  const automation = await db.query.automations.findFirst({
    where: and(
      eq(automations.id, options.automationId),
      eq(automations.teamId, teamId),
      eq(automations.instanceId, instanceId)
    )
  });

  if (!automation) return false;

  const flow: FlowData = {
    nodes: automation.nodes as AutomationCanvasNode[],
    edges: automation.edges as AutomationCanvasEdge[],
  };

  const startNode = flow.nodes.find((node) => node.type === 'start');
  if (!startNode) return false;

  if (options.startNodeId && options.startNodeId !== 'start') {
    const targetNode = flow.nodes.find((node) => node.id === options.startNodeId && node.type !== 'start');
    if (!targetNode) return false;
  }

  const existingSession = await db.query.automationSessions.findFirst({
    where: and(
      eq(automationSessions.chatId, chatId),
      eq(automationSessions.status, 'active')
    ),
    columns: { id: true }
  });

  if (existingSession) {
    await db.update(automationSessions)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(automationSessions.id, existingSession.id));
  }

  // Manually triggering an automation re-enables auto-triggering for this chat
  // (it may have been disabled by a previous manual close/cut).
  await db.update(chats)
    .set({ automationDisabled: false })
    .where(eq(chats.id, chatId));

  const [newSession] = await db.insert(automationSessions).values({
    teamId,
    automationId: automation.id,
    chatId,
    currentNodeId: startNode.id,
    status: 'active'
  }).returning();

  await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
    chatId, type: 'automation', status: 'active'
  });

  const config: InstanceConfig = {
    accessToken: instance.accessToken,
    instanceName: instance.instanceName,
    metaToken: instance.metaToken,
    metaPhoneNumberId: instance.metaPhoneNumberId
  };

  if (options.startNodeId && options.startNodeId !== 'start') {
    await executeStep(newSession, flow, options.startNodeId, '', config, remoteJid, teamId, chatId);
    return true;
  }

  const edge = flow.edges.find((item) => item.source === startNode.id);
  if (!edge) return false;

  await executeStep(newSession, flow, edge.target, '', config, remoteJid, teamId, chatId);
  return true;
}

async function executeStep(
    session: typeof automationSessions.$inferSelect, 
    flow: FlowData, 
    nodeId: string,
    input: string, 
    instance: InstanceConfig,
    remoteJid: string,
    teamId: number,
    chatId: number
) {
    const nextNode = flow.nodes.find(n => n.id === nodeId);
    const sessionVariables = normalizeSessionVariables(session.variables);
    const variablesWithHistory = appendNodeToHistory(sessionVariables, nodeId);
    const variables = extractStringVariables(variablesWithHistory);

    await db.update(automationSessions)
        .set({ currentNodeId: nodeId, variables: variablesWithHistory, updatedAt: new Date() })
        .where(eq(automationSessions.id, session.id));
    
    const updatedSession = { ...session, currentNodeId: nodeId, variables: variablesWithHistory };

    if (!nextNode) {
        await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
        await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
            chatId, type: 'automation', status: 'completed'
        });
        return;
    }

    if (nextNode.type === 'end') {
        await db.update(automationSessions)
            .set({ status: 'completed', updatedAt: new Date() })
            .where(eq(automationSessions.id, session.id));

        // Preserve historical behaviour unless the flow explicitly marks this
        // terminal as recoverable (used by the V3 MENU recovery automation).
        if (nextNode.data.disableAutomation !== false) {
            await db.update(chats)
                .set({ automationDisabled: true })
                .where(eq(chats.id, chatId));
        }

        await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
            chatId, type: 'automation', status: 'completed'
        });
        return;
    }

    if (nextNode.type === 'condition') {
        const conditions = (nextNode.data.conditions as ConditionEntry[]) || [];
        let matchedConditionId: string | null = null;
        
        for (const cond of conditions) {
            if (evaluateCondition(cond, input, variables)) {
                matchedConditionId = cond.id;
                break;
            }
        }

        let targetEdge = null;
        if (matchedConditionId) {
            targetEdge = flow.edges.find(e => e.source === nextNode.id && e.sourceHandle === matchedConditionId);
        }
        if (!targetEdge) {
            targetEdge = flow.edges.find(e => e.source === nextNode.id && e.sourceHandle === 'fallback');
        }

        if (targetEdge) {
            await new Promise(r => setTimeout(r, 500));
            await executeStep(updatedSession, flow, targetEdge.target, input, instance, remoteJid, teamId, chatId);
        } else {
             await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
             await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
                 chatId, type: 'automation', status: 'completed'
             });
        }
        return;
    }

    if (nextNode.type === 'go_to_node') {
        const data = nextNode.data as GoToNodeData;
        const fallbackNodeId = data.fallbackNodeId && flow.nodes.some((node) => node.id === data.fallbackNodeId)
            ? data.fallbackNodeId
            : undefined;
        const fallbackAction = data.fallbackAction
            ? data.fallbackAction
            : fallbackNodeId
                ? 'node'
                : 'stop';

        if (data.mode === 'other_flow') {
            const parsedAutomationId = Number(data.targetAutomationId);
            if (Number.isFinite(parsedAutomationId) && parsedAutomationId > 0) {
                const targetAutomation = await db.query.automations.findFirst({
                    where: and(eq(automations.id, parsedAutomationId), eq(automations.teamId, teamId)),
                });

                if (targetAutomation) {
                    const targetFlow: FlowData = {
                        nodes: targetAutomation.nodes as AutomationCanvasNode[],
                        edges: targetAutomation.edges as AutomationCanvasEdge[],
                    };

                    const targetNode = data.targetNodeId
                        ? targetFlow.nodes.find((node) => node.id === data.targetNodeId)
                        : targetFlow.nodes.find((node) => node.type === 'start');

                    if (targetNode) {
                        await db.update(automationSessions)
                            .set({ status: 'completed', updatedAt: new Date() })
                            .where(eq(automationSessions.id, session.id));

                        const carriedVariables = {
                            ...variablesWithHistory,
                            [NODE_HISTORY_KEY]: [],
                        };

                        const [newSession] = await db.insert(automationSessions).values({
                            teamId,
                            automationId: targetAutomation.id,
                            chatId,
                            contactId: session.contactId,
                            currentNodeId: targetNode.id,
                            variables: carriedVariables,
                            status: 'active',
                        }).returning();

                        await executeStep(newSession, targetFlow, targetNode.id, input, instance, remoteJid, teamId, chatId);
                        return;
                    }
                }
            }

            if (fallbackAction === 'node' && fallbackNodeId) {
                await executeStep(updatedSession, flow, fallbackNodeId, input, instance, remoteJid, teamId, chatId);
            } else {
                await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
                await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
                    chatId, type: 'automation', status: 'completed'
                });
            }
            return;
        }

        let redirectTargetId: string | undefined;
        if (data.mode === 'specific_node') {
            redirectTargetId = data.targetNodeId;
        } else {
            const history = getNodeHistory(variablesWithHistory);
            const previousNodeId = history.length >= 2 ? history[history.length - 2] : undefined;
            redirectTargetId = previousNodeId && previousNodeId !== nextNode.id ? previousNodeId : undefined;
        }

        if (redirectTargetId && flow.nodes.some((node) => node.id === redirectTargetId)) {
            await executeStep(updatedSession, flow, redirectTargetId, input, instance, remoteJid, teamId, chatId);
        } else if (fallbackAction === 'node' && fallbackNodeId) {
            await executeStep(updatedSession, flow, fallbackNodeId, input, instance, remoteJid, teamId, chatId);
        } else {
            await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
            await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
                chatId, type: 'automation', status: 'completed'
            });
        }
        return;
    }

    if (nextNode.type === 'delay') {
        const seconds = Number(nextNode.data.seconds) || 2;
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'save_contact') {
        try {
            await processSaveContact(nextNode, updatedSession, teamId, chatId);
        } catch (error) {
            // CRM enrichment must not block the customer-facing flow. A deleted
            // tag/stage or another recoverable data issue is logged with enough
            // context to repair it, then execution continues to the next node.
            console.error(
                `[automation] save_contact falló; el flujo continuará ` +
                `(automationId=${session.automationId}, sessionId=${session.id}, ` +
                `chatId=${chatId}, nodeId=${nextNode.id}).`,
                error,
            );
        }
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'message' || nextNode.type === 'options') {
        await processTextOutput(nextNode, instance, remoteJid, teamId, chatId, variables);
        if (nextNode.type === 'message') {
             await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
        }
    }
    else if (nextNode.type === 'media') {
        await processMediaOutput(nextNode, instance, remoteJid, teamId, chatId, variables);
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'collect') {
        let text = nextNode.data.label as string;
        text = replaceVariables(text, variables);
        await sendEvolutionMessage(instance, remoteJid, "sendText", { text: text }, teamId, chatId);
    }
    else if (nextNode.type === 'form') {
        const fields = (nextNode.data.fields as FormField[]) || [];
        const firstField = fields[0];
        if (!firstField) {
            await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
            return;
        }
        const variablesWithProgress: AutomationSessionVariables = {
            ...variablesWithHistory,
            [FORM_PROGRESS_KEY]: {
                nodeId: nextNode.id,
                fieldIndex: 0,
            },
        };
        await db.update(automationSessions)
            .set({ variables: variablesWithProgress, updatedAt: new Date() })
            .where(eq(automationSessions.id, session.id));
        await sendEvolutionMessage(instance, remoteJid, "sendText", {
            text: buildFormFieldMessage(firstField, variablesWithProgress),
        }, teamId, chatId);
    }
    else if (nextNode.type === 'menu_simple') {
        const message = buildMenuSimpleMessage({
            label: replaceVariables((nextNode.data.label as string) || '', variables),
            markerStyle: nextNode.data.markerStyle,
            menuOptions: (nextNode.data.menuOptions as MenuSimpleOption[]) || [],
        });
        await sendEvolutionMessage(instance, remoteJid, "sendText", { text: message }, teamId, chatId);
        // Flow pauses here, waiting for the user's reply (handled in processAutomation).
    }
    else if (nextNode.type === 'button_message' || nextNode.type === 'list_message') {
        await processMetaInteractiveOutput(nextNode, instance, remoteJid, teamId, chatId, variables);
    }
    else if (nextNode.type === 'call_to_action') {
        const body = replaceVariables(nextNode.data.bodyText as string || '', variables);
        const footer = nextNode.data.footerText as string;
        const btnText = nextNode.data.buttonText as string || "Visit";
        const url = replaceVariables(nextNode.data.url as string || '', variables);

        let finalMsg = `${body}`;
        if(url) finalMsg += `\n\n🔗 ${btnText}: ${url}`;
        if(footer) finalMsg += `\n\n_${footer}_`;

        await sendEvolutionMessage(instance, remoteJid, "sendText", { text: finalMsg }, teamId, chatId);
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'ai_control') {
        const action = nextNode.data.action as string || 'active';
        const [teamAiConfig, existingAiSession] = await Promise.all([
            db.query.aiConfigs.findFirst({
                where: eq(aiConfigs.teamId, teamId),
                columns: { isActive: true },
            }),
            db.query.aiSessions.findFirst({
                where: eq(aiSessions.chatId, chatId)
            }),
        ]);

        const previousState = getEffectiveAIState(!!teamAiConfig?.isActive, overrideDeSesion(existingAiSession));
        const ahoraIa = new Date();

        // Un nodo del flujo que prende o apaga la IA es una decisión explícita
        // sobre ESE chat: deja override, igual que si lo tocara una persona.
        if (existingAiSession) {
            await db.update(aiSessions)
                .set({ status: action, isOverride: true, overrideAt: ahoraIa, updatedAt: ahoraIa })
                .where(eq(aiSessions.id, existingAiSession.id));
        } else {
            await db.insert(aiSessions).values({
                chatId,
                status: action,
                history: [],
                isOverride: true,
                overrideAt: ahoraIa,
            });
        }

        const nextConversationStatus = action;

        const nextState = getEffectiveAIState(!!teamAiConfig?.isActive, nextConversationStatus);

        if (
            previousState.conversationStatus !== nextState.conversationStatus ||
            previousState.effectiveStatus !== nextState.effectiveStatus
        ) {
            await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
                chatId, type: 'ai', status: nextState.effectiveStatus
            });
        }

        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'sticky_note') {
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'start') {
        // Landing on a start node (e.g. a go_to_node that jumps to another flow's
        // start) must advance to the first real node instead of stalling here.
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
}

async function moveToNextAuto(session: typeof automationSessions.$inferSelect, flow: FlowData, currentNodeId: string, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number) {
    const edge = flow.edges.find(e => e.source === currentNodeId);
    if (edge) {
        await new Promise(r => setTimeout(r, 500));
        await executeStep(session, flow, edge.target, '', instance, remoteJid, teamId, chatId);
    } else {
        // Dead-end node: no outgoing edge, so the flow silently ends here. Log it so
        // "the flow cuts off mid-way" can be traced to the exact node/automation.
        console.warn(
            `[automation] flujo cortado: nodo "${currentNodeId}" sin arista de salida ` +
            `(automationId=${session.automationId}, chatId=${chatId}). La sesión se marca como completada.`,
        );
        await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
        await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
            chatId, type: 'automation', status: 'completed'
        });
    }
}

async function processTextOutput(node: AutomationCanvasNode, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number, variables: Record<string, string>) {
    if (node.type === 'message') {
        let text = node.data.label as string;
        text = replaceVariables(text, variables);
        await sendEvolutionMessage(instance, remoteJid, "sendText", { text }, teamId, chatId);
    }
    else if (node.type === 'options') {
        let title = node.data.label as string;
        title = replaceVariables(title, variables);
        const options = (node.data.options as string[]) || [];
        
        let message = `${title}\n\n`;
        options.forEach((opt, idx) => {
            message += `${idx + 1}. ${opt}\n`;
        });
        await sendEvolutionMessage(instance, remoteJid, "sendText", { text: message }, teamId, chatId);
    }
}

async function processMediaOutput(node: AutomationCanvasNode, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number, variables: Record<string, string> = {}) {
    const data = node.data;
    if (!data.mediaUrl) return;

    try {
        const absolutePath = path.join(process.cwd(), 'public', data.mediaUrl);
        const base64 = await fileToBase64(absolutePath);
        if (!base64) return;

        const caption = replaceVariables(data.caption || '', variables);

        let mediaType = data.mediaType || 'image';

        // WhatsApp treats voice/audio messages as a distinct message type (audioMessage,
        // sent as a PTT/voice note), not as a generic media attachment. The generic
        // sendMedia endpoint silently fails to deliver it even though Evolution API
        // acks the request — mirrors the working /api/messages/sendAudio route.
        if (mediaType === 'audio') {
            const audioPayload = {
                audio: base64,
                mimetype: 'audio/mpeg',
                ptt: true,
            };
            await sendEvolutionMessage(instance, remoteJid, "sendWhatsAppAudio", audioPayload, teamId, chatId, data.mediaUrl, caption);
            return;
        }

        const mimetype = data.mediaMimetype || 'application/octet-stream';

        const payload = {
            media: base64,
            mediatype: mediaType,
            mimetype: mimetype,
            caption: caption,
            fileName: data.fileName || "file"
        };

        await sendEvolutionMessage(instance, remoteJid, "sendMedia", payload, teamId, chatId, data.mediaUrl);

    } catch (e) {
        console.error(e);
    }
}

async function processMetaInteractiveOutput(node: AutomationCanvasNode, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number, variables: Record<string, string>) {
    if (!instance.metaToken || !instance.metaPhoneNumberId) return;

    const data = node.data;
    const bodyText = replaceVariables(data.bodyText || '', variables);
    const footerText = replaceVariables(data.footerText || '', variables);
    const titleText = replaceVariables(data.title || '', variables);

    let interactiveObject: Record<string, unknown> = {
        body: { text: bodyText }
    };

    if (footerText) interactiveObject.footer = { text: footerText };
    if (titleText && node.type === 'list_message') interactiveObject.header = { type: "text", text: titleText }; 

    if (node.type === 'button_message') {
        const buttons = (data.buttons as ButtonMessageButton[]) || [];
        interactiveObject.type = "button";
        interactiveObject.action = {
            buttons: buttons.slice(0, 3).map((b, idx) => ({
                type: "reply",
                reply: {
                    id: b.value || `btn-${idx}`,
                    title: b.text?.substring(0, 20) || "Button"
                }
            }))
        };
    } 
    else if (node.type === 'list_message') {
        const buttonText = data.buttonText || "Options";
        const items = (data.items as ListMessageItem[]) || [];
        
        interactiveObject.type = "list";
        interactiveObject.action = {
            button: buttonText.substring(0, 20),
            sections: [
                {
                    title: "Menu",
                    rows: items.slice(0, 10).map((item, idx) => ({
                        id: item.rowId || `row-${idx}`,
                        title: item.title?.substring(0, 24) || "Item",
                        description: item.description?.substring(0, 72) || ""
                    }))
                }
            ]
        };
    }

    const payload = {
        type: "interactive",
        interactive: interactiveObject
    };

    await sendMetaMessage(instance, remoteJid, payload, teamId, chatId);
}

async function sendEvolutionMessage(
    instance: InstanceConfig,
    remoteJid: string,
    endpoint: "sendText" | "sendMedia" | "sendWhatsAppAudio",
    contentPayload: any,
    teamId: number,
    chatId: number,
    localMediaUrl?: string,
    captionOverride?: string
) {
    try {
        const number = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');

        // sendWhatsAppAudio is a distinct Evolution endpoint from sendText/sendMedia and
        // doesn't recognize linkPreview/mentionsEveryOne — keep its payload minimal and
        // matching the proven-working shape used by /api/messages/sendAudio.
        const payload = endpoint === 'sendWhatsAppAudio'
            ? { number, delay: 1200, presence: 'recording', ...contentPayload }
            : { number, delay: 1000, linkPreview: true, mentionsEveryOne: false, ...contentPayload };

        const response = await fetch(
            `${EVOLUTION_API_URL}/message/${endpoint}/${instance.instanceName}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': instance.accessToken
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000)
            }
        );

        const data = await response.json();
        
        if (response.ok && data?.key?.id) {
            const messageId = data.key.id;
            const timestamp = new Date();
            
            let previewText = "Message";
            if (endpoint === 'sendText') previewText = contentPayload.text;
            else if (endpoint === 'sendMedia') previewText = contentPayload.caption || "Media";
            else if (endpoint === 'sendWhatsAppAudio') previewText = captionOverride || "Audio";

            let messageType = 'conversation';
            if (endpoint === 'sendMedia') {
                messageType = `${contentPayload.mediatype}Message`;
            } else if (endpoint === 'sendWhatsAppAudio') {
                messageType = 'audioMessage';
            }

            let mediaDetails = {};
            if (localMediaUrl) {
                mediaDetails = {
                    mediaUrl: localMediaUrl,
                    mediaMimetype: contentPayload.mimetype,
                    mediaCaption: endpoint === 'sendWhatsAppAudio' ? captionOverride : contentPayload.caption
                };
            }

            const newMessage = {
                id: messageId, 
                chatId: chatId, 
                fromMe: true, 
                messageType: messageType, 
                text: previewText, 
                timestamp, 
                status: 'sent' as const, 
                isInternal: false,
                isAutomation: true, 
                quotedMessageText: null, 
                ...mediaDetails
            };

            await db.insert(messages).values(newMessage).onConflictDoNothing();

            await db.update(chats).set({ 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp, 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent' 
            }).where(eq(chats.id, chatId));

            const pusherChannel = `team-${teamId}`;
            
            await pusherServer.trigger(pusherChannel, 'new-message', { 
                ...newMessage,
                timestamp: timestamp.toISOString(),
                remoteJid, 
                instance: instance.instanceName,
            });

            await pusherServer.trigger(pusherChannel, 'chat-list-update', { 
                id: chatId, 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp.toISOString(), 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent', 
                remoteJid 
            });
        }
    } catch (e) { 
        console.error(e); 
    }
}

async function sendMetaMessage(instance: InstanceConfig, remoteJid: string, messagePayload: any, teamId: number, chatId: number) {
    if (!instance.metaToken || !instance.metaPhoneNumberId) return;

    try {
        const cleanPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        const payload = {
            messaging_product: "whatsapp",
            to: cleanPhone,
            ...messagePayload
        };

        const response = await fetch(`${GRAPH_API_URL}/${GRAPH_API_VERSION}/${instance.metaPhoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${instance.metaToken}`
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });

        const data = await response.json();
        
        if (response.ok && data?.messages?.[0]?.id) {
            const messageId = data.messages[0].id;
            const timestamp = new Date();
            
            let previewText = "Interactive Message";
            let interactiveMetadata = null;

            if (messagePayload.type === 'interactive') {
                const interactive = messagePayload.interactive;
                previewText = interactive.body.text;
                interactiveMetadata = JSON.stringify(interactive);
            }

            const newMessage = {
                id: messageId, 
                chatId: chatId, 
                fromMe: true, 
                messageType: 'interactiveMessage', 
                text: previewText, 
                timestamp, 
                status: 'sent' as const, 
                isInternal: false,
                quotedMessageText: interactiveMetadata
            };

            await db.insert(messages).values(newMessage).onConflictDoNothing();

            await db.update(chats).set({ 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp, 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent' 
            }).where(eq(chats.id, chatId));

            const pusherChannel = `team-${teamId}`;
            
            await pusherServer.trigger(pusherChannel, 'new-message', { 
                ...newMessage,
                timestamp: timestamp.toISOString(),
                remoteJid, 
                instance: instance.instanceName,
            });

            await pusherServer.trigger(pusherChannel, 'chat-list-update', { 
                id: chatId, 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp.toISOString(), 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent', 
                remoteJid 
            });
        }
    } catch (e) { 
        console.error(e); 
    }
}

async function processSaveContact(node: AutomationCanvasNode, session: typeof automationSessions.$inferSelect, teamId: number, chatId: number) {
    const data = node.data as SaveContactNodeData;
    const variables = extractStringVariables(normalizeSessionVariables(session.variables));

    await db.transaction(async (tx) => {
        const currentContact = await tx.query.contacts.findFirst({
            where: and(eq(contacts.chatId, chatId), eq(contacts.teamId, teamId)),
        });

        const configuredFields = await tx.query.customFields.findMany({
            where: eq(customFieldDefinitions.teamId, teamId),
        });
        const fieldsByKey = new Map(configuredFields.map((field) => [field.key, field]));
        const customDataUpdates: Record<string, string | boolean> = {};

        for (const [key, rawTemplate] of Object.entries(data.customFields ?? {})) {
            const field = fieldsByKey.get(key);
            if (!field) {
                console.warn(`[automation] campo personalizado desconocido "${key}" (teamId=${teamId}, nodeId=${node.id}).`);
                continue;
            }

            const template = String(rawTemplate ?? '');
            const resolved = resolveVariableTemplate(template, variables);
            if (resolved.missingVariables.length > 0 || !resolved.value) {
                console.warn(
                    `[automation] no se actualiza "${key}": variable faltante o vacía ` +
                    `(${resolved.missingVariables.join(', ') || 'valor vacío'}, nodeId=${node.id}).`,
                );
                continue;
            }

            if (field.type === 'boolean') {
                const booleanValue = parseBooleanContactValue(resolved.value);
                if (booleanValue === undefined) {
                    console.warn(`[automation] valor booleano inválido para "${key}": "${resolved.value}" (nodeId=${node.id}).`);
                    continue;
                }
                customDataUpdates[key] = booleanValue;
            } else {
                customDataUpdates[key] = resolved.value;
            }
        }

        const valuesToSet: Record<string, unknown> = { updatedAt: new Date() };
        if (data.nameVariable) {
            const resolvedName = resolveVariableTemplate(data.nameVariable, variables);
            if (resolvedName.missingVariables.length === 0 && resolvedName.value) {
                valuesToSet.name = resolvedName.value;
            }
        }

        const parseConfiguredId = (value: string | undefined) => {
            if (!value || value === 'null') return undefined;
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
        };
        const agentId = parseConfiguredId(data.agentId);
        const departmentId = parseConfiguredId(data.departmentId);
        const funnelStageId = parseConfiguredId(data.funnelStageId);
        const tagId = parseConfiguredId(data.tagId);
        const [validAgent, validDepartment, validFunnelStage, validTag] = await Promise.all([
            agentId
                ? tx.select({ id: teamMembers.userId })
                    .from(teamMembers)
                    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, agentId)))
                    .limit(1)
                : Promise.resolve([]),
            departmentId
                ? tx.select({ id: departments.id })
                    .from(departments)
                    .where(and(eq(departments.teamId, teamId), eq(departments.id, departmentId)))
                    .limit(1)
                : Promise.resolve([]),
            funnelStageId
                ? tx.select({ id: funnelStages.id })
                    .from(funnelStages)
                    .where(and(eq(funnelStages.teamId, teamId), eq(funnelStages.id, funnelStageId)))
                    .limit(1)
                : Promise.resolve([]),
            tagId
                ? tx.select({ id: tags.id })
                    .from(tags)
                    .where(and(eq(tags.teamId, teamId), eq(tags.id, tagId)))
                    .limit(1)
                : Promise.resolve([]),
        ]);

        if (agentId && validAgent.length > 0) valuesToSet.assignedUserId = agentId;
        else if (agentId) console.warn(`[automation] agente inexistente o ajeno al equipo "${agentId}" (teamId=${teamId}, nodeId=${node.id}).`);
        if (departmentId && validDepartment.length > 0) valuesToSet.assignedDepartmentId = departmentId;
        else if (departmentId) console.warn(`[automation] departamento inexistente o ajeno al equipo "${departmentId}" (teamId=${teamId}, nodeId=${node.id}).`);
        if (funnelStageId && validFunnelStage.length > 0) valuesToSet.funnelStageId = funnelStageId;
        else if (funnelStageId) console.warn(`[automation] etapa inexistente o ajena al equipo "${funnelStageId}" (teamId=${teamId}, nodeId=${node.id}).`);

        const nextCustomData = {
            ...((currentContact?.customData as Record<string, unknown> | null) ?? {}),
            ...customDataUpdates,
        };
        if (Object.keys(nextCustomData).length > 0) valuesToSet.customData = nextCustomData;

        let contactId: number;
        if (currentContact) {
            await tx.update(contacts).set(valuesToSet).where(eq(contacts.id, currentContact.id));
            contactId = currentContact.id;
        } else {
            if (!valuesToSet.name) {
                const chat = await tx.query.chats.findFirst({
                    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
                    columns: { name: true, pushName: true },
                });
                valuesToSet.name = chat?.name || chat?.pushName || 'Nuevo contacto';
            }
            const [createdContact] = await tx.insert(contacts).values({
                ...valuesToSet,
                teamId,
                chatId,
            } as typeof contacts.$inferInsert).returning({ id: contacts.id });
            contactId = createdContact.id;
        }

        if (tagId && validTag.length > 0) {
            await tx.insert(contactTags).values({ contactId, tagId }).onConflictDoNothing();
        } else if (tagId) {
            console.warn(`[automation] etiqueta inexistente o ajena al equipo "${tagId}" (teamId=${teamId}, nodeId=${node.id}).`);
        }
    });
}
