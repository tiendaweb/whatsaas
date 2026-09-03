"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  GitBranchPlus,
  MessageCircle,
  Play,
  RotateCcw,
  SendHorizonal,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildMenuSimpleMessage,
  getMenuMarker,
  matchMenuSimpleReplyByMarker,
} from "@/lib/automation/menu-simple";
import {
  findSimulatorChoiceIndex,
  getSimulatorBranchTarget as getChoiceTarget,
  getSimulatorLinearTarget as getDefaultTarget,
  replaceSimulatorVariables,
} from "@/lib/automation/simulator-runtime";
import type {
  AutomationFlowEdge,
  AutomationFlowNode,
  ConditionEntry,
  FormField,
  MenuSimpleMarkerStyle,
  MenuSimpleOption,
} from "@/lib/automation/flow-schema";

type SimulatorAutomation = {
  id: number;
  name: string;
  nodes: unknown;
  edges?: unknown;
};

type SimulatorEvent = {
  id: string;
  kind: "bot" | "user" | "system" | "action";
  title?: string;
  text: string;
};

type PendingChoice = {
  label: string;
  aliases?: string[];
  targetId?: string | null;
  handle?: string | null;
  automationId?: number | null;
  kind?: "choice" | "menu_simple";
  marker?: string;
  nodeId?: string;
  option?: MenuSimpleOption;
  optionIndex?: number;
  fallback?: boolean;
  promptText?: string;
  variable?: string;
  delaySeconds?: number;
};

type AwaitingInput = {
  automationId: number;
  nodeId: string;
  prompt: string;
  variable?: string;
  mode: "collect" | "menu_simple" | "form";
  choices?: PendingChoice[];
  formFields?: FormField[];
  formFieldIndex?: number;
};

type NodeDataRecord = Record<string, unknown>;
type CurrentNodeRef = {
  automationId: number;
  nodeId: string;
} | null;
type AutomationContext = {
  automation: SimulatorAutomation;
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
  nodeById: Map<string, AutomationFlowNode>;
  startNode: AutomationFlowNode | null;
};
type VisitCounts = Map<string, number>;

const STEP_DELAY_MS = 1000;
const MAX_SIMULATION_STEPS = 240;
const MAX_NODE_REVISITS = 48;
// Delays reales (delay nodes / globalDelaySeconds) se respetan pero acotados
// para que la simulación siga siendo usable.
const MAX_SIMULATED_DELAY_MS = 5000;

const NODE_TYPE_LABELS: Record<string, string> = {
  start: "Inicio",
  message: "Mensaje",
  media: "Multimedia",
  options: "Opciones",
  delay: "Espera",
  collect: "Recolectar entrada",
  form: "Formulario",
  save_contact: "Guardar contacto",
  end: "Fin",
  button_message: "Botones",
  list_message: "Lista",
  call_to_action: "Llamada a la accion",
  ai_control: "Control de IA",
  condition: "Condicion",
  go_to_node: "Ir a nodo",
  sticky_note: "Nota sticky",
  menu_simple: "Menu simple",
};

function asNodes(value: unknown): AutomationFlowNode[] {
  return Array.isArray(value) ? (value as AutomationFlowNode[]) : [];
}

function asEdges(value: unknown): AutomationFlowEdge[] {
  return Array.isArray(value) ? (value as AutomationFlowEdge[]) : [];
}

function getNodeData(node: AutomationFlowNode): NodeDataRecord {
  return (node.data ?? {}) as NodeDataRecord;
}

function getNodeLabel(node: AutomationFlowNode) {
  const data = getNodeData(node);
  const referenceName = typeof data.referenceName === "string" ? data.referenceName.trim() : "";
  if (referenceName) return referenceName;
  return NODE_TYPE_LABELS[node.type] ?? node.type;
}

function getMainText(node: AutomationFlowNode) {
  const data = getNodeData(node);
  const candidates = [data.label, data.bodyText, data.caption, data.title, data.buttonText];
  return candidates.find((value) => typeof value === "string" && value.trim()) as string | undefined;
}

function getRenderedMainText(
  node: AutomationFlowNode,
  variables: Record<string, string>,
) {
  const text = getMainText(node);
  return text ? replaceSimulatorVariables(text, variables) : undefined;
}

function getFormFieldPrompt(
  field: FormField,
  variables: Record<string, string>,
) {
  const label = replaceSimulatorVariables(field.label, variables);
  if (field.type !== "menu") return label;
  return buildMenuSimpleMessage({
    label,
    markerStyle: field.markerStyle,
    menuOptions: field.menuOptions ?? [],
  });
}

function matchesFormMenuReply(
  field: FormField,
  text: string,
  variables: Record<string, string>,
) {
  const options = field.menuOptions ?? [];
  for (const option of options) {
    if (!option.matchValue?.trim()) continue;
    if (
      evaluateSimulatorCondition(
        {
          type: option.matchType || "text",
          operator: option.matchOperator || "equals",
          value: option.matchValue,
          value2: option.matchValue2,
        },
        text,
        variables,
      )
    ) {
      return true;
    }
  }
  return matchMenuSimpleReplyByMarker(options, text) !== -1;
}

function getFirstExecutableNode(nodes: AutomationFlowNode[]) {
  return nodes.find((node) => node.type !== "start") ?? nodes[0] ?? null;
}

function nextEvent(kind: SimulatorEvent["kind"], text: string, title?: string): SimulatorEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    text,
    title,
  };
}

function getTotalVisits(visited: VisitCounts) {
  return Array.from(visited.values()).reduce((total, count) => total + count, 0);
}

function evaluateSimulatorCondition(
  condition: Pick<ConditionEntry, "type" | "operator" | "value" | "value2">,
  text: string,
  variables: Record<string, string>,
) {
  let valueToCheck = text;
  const targetValue = condition.value;
  const targetValue2 = condition.value2;

  if (condition.type === "variable") {
    return Boolean(variables[targetValue]);
  }

  if (condition.type === "time") {
    const now = new Date();
    const currentHours = now.getHours().toString().padStart(2, "0");
    const currentMinutes = now.getMinutes().toString().padStart(2, "0");
    valueToCheck = `${currentHours}:${currentMinutes}`;
  }

  if (condition.type === "number") {
    const numCheck = parseFloat(valueToCheck);
    const numTarget = parseFloat(targetValue);
    const numTarget2 = parseFloat(targetValue2 || "");

    if (Number.isNaN(numCheck) || Number.isNaN(numTarget)) return false;

    switch (condition.operator) {
      case "equals":
        return numCheck === numTarget;
      case "greater_than":
        return numCheck > numTarget;
      case "less_than":
        return numCheck < numTarget;
      case "gte":
        return numCheck >= numTarget;
      case "lte":
        return numCheck <= numTarget;
      case "between":
        return !Number.isNaN(numTarget2) && numCheck >= numTarget && numCheck <= numTarget2;
      default:
        return false;
    }
  }

  const strCheck = String(valueToCheck).toLowerCase();
  const strTarget = String(targetValue).toLowerCase();
  const strTarget2 = String(targetValue2).toLowerCase();

  switch (condition.operator) {
    case "equals":
      return strCheck === strTarget;
    case "not_equals":
      return strCheck !== strTarget;
    case "contains":
      return strCheck.includes(strTarget);
    case "starts_with":
      return strCheck.startsWith(strTarget);
    case "ends_with":
      return strCheck.endsWith(strTarget);
    case "greater_than":
      return strCheck > strTarget;
    case "less_than":
      return strCheck < strTarget;
    case "gte":
      return strCheck >= strTarget;
    case "lte":
      return strCheck <= strTarget;
    case "between":
      return strCheck >= strTarget && strCheck <= strTarget2;
    default:
      return false;
  }
}

export function AutomationChatSimulator({
  automations,
  currentAutomationId,
  title,
  description,
  className = "",
  onNodeFocus,
}: {
  automations: SimulatorAutomation[];
  currentAutomationId?: number;
  title: string;
  description: string;
  className?: string;
  onNodeFocus?: (nodeId: string) => void;
}) {
  const initialAutomationId = currentAutomationId ?? automations[0]?.id ?? null;
  const [selectedAutomationId, setSelectedAutomationId] = useState<number | null>(initialAutomationId);
  const [currentNode, setCurrentNode] = useState<CurrentNodeRef>(null);
  const [events, setEvents] = useState<SimulatorEvent[]>([]);
  const [pendingChoices, setPendingChoices] = useState<PendingChoice[]>([]);
  const [awaitingInput, setAwaitingInput] = useState<AwaitingInput | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [stepCount, setStepCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingInputRef = useRef<AwaitingInput | null>(null);
  const visitedRef = useRef<VisitCounts>(new Map());
  const variablesRef = useRef<Record<string, string>>({});
  // Espejo del __nodeHistory del motor: nodos visitados en la corrida actual
  // (se vacía al saltar a otro flujo, igual que la sesión nueva del motor).
  const historyRef = useRef<string[]>([]);
  // Último input del usuario: es el "input" que el motor pasa a evaluateCondition.
  const lastInputRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const updateAwaitingInput = (value: AwaitingInput | null) => {
    awaitingInputRef.current = value;
    setAwaitingInput(value);
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [events, pendingChoices, awaitingInput]);

  const automationContexts = useMemo(() => {
    const map = new Map<number, AutomationContext>();
    automations.forEach((automation) => {
      const automationNodes = asNodes(automation.nodes);
      const automationEdges = asEdges(automation.edges);
      map.set(automation.id, {
        automation,
        nodes: automationNodes,
        edges: automationEdges,
        nodeById: new Map(automationNodes.map((node) => [node.id, node] as const)),
        startNode: automationNodes.find((node) => node.type === "start") ?? automationNodes[0] ?? null,
      });
    });
    return map;
  }, [automations]);
  const selectedContext = selectedAutomationId ? automationContexts.get(selectedAutomationId) : undefined;
  const selectedAutomation = selectedContext?.automation ?? automations[0];
  const nodes = selectedContext?.nodes ?? [];
  const edges = selectedContext?.edges ?? [];
  const startNode = selectedContext?.startNode ?? null;

  const append = (items: SimulatorEvent[]) => {
    setEvents((current) => [...current, ...items].slice(-80));
  };

  const reset = () => {
    clearTimer();
    visitedRef.current = new Map();
    variablesRef.current = {};
    historyRef.current = [];
    lastInputRef.current = "";
    setCurrentNode(null);
    setEvents([]);
    setPendingChoices([]);
    updateAwaitingInput(null);
    setInputValue("");
    setIsRunning(false);
    setStepCount(0);
  };

  // Schedule the next node so each step advances after a short pause.
  const advance = (
    automationId: number | null | undefined,
    nodeId: string | null,
    visited: VisitCounts,
    delayMs: number = STEP_DELAY_MS,
  ) => {
    clearTimer();
    // A collect/menu node owns the runtime until the user answers. A stale
    // automatic transition must never be able to clear or bypass that wait.
    if (awaitingInputRef.current) {
      setIsRunning(false);
      return;
    }
    setPendingChoices([]);
    setIsRunning(true);
    const effectiveDelayMs = Number.isFinite(delayMs)
      ? Math.max(STEP_DELAY_MS, Math.min(delayMs, MAX_SIMULATED_DELAY_MS))
      : STEP_DELAY_MS;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runNode(automationId, nodeId, visited);
    }, effectiveDelayMs);
  };

  // Pause the run and wait for the user to pick a branch.
  const waitForChoice = (choices: PendingChoice[]) => {
    clearTimer();
    setIsRunning(false);
    updateAwaitingInput(null);
    setPendingChoices(choices);
  };

  // Stop the run (terminal node or dead end).
  const stop = () => {
    clearTimer();
    setIsRunning(false);
    updateAwaitingInput(null);
    setPendingChoices([]);
  };

  const runNode = (automationId: number | null | undefined, nodeId: string | null, visited: VisitCounts = new Map()) => {
    if (!automationId) {
      append([nextEvent("system", "No hay una automatizacion seleccionada para simular.")]);
      setPendingChoices([]);
      setIsRunning(false);
      return;
    }

    if (!nodeId) {
      append([nextEvent("system", "No hay una conexion para continuar.")]);
      setPendingChoices([]);
      setIsRunning(false);
      return;
    }

    const context = automationContexts.get(automationId);
    if (!context) {
      append([nextEvent("system", `No se encontro la automatizacion destino ${automationId}.`)]);
      setPendingChoices([]);
      setIsRunning(false);
      return;
    }

    const visitKey = `${automationId}:${nodeId}`;
    const totalVisits = getTotalVisits(visited);
    const currentNodeVisits = visited.get(visitKey) ?? 0;
    if (totalVisits >= MAX_SIMULATION_STEPS || currentNodeVisits >= MAX_NODE_REVISITS) {
      append([nextEvent("system", "La simulacion se detuvo para evitar un bucle infinito.")]);
      setPendingChoices([]);
      setIsRunning(false);
      return;
    }

    const node = context.nodeById.get(nodeId);
    if (!node) {
      append([nextEvent("system", `No se encontro el nodo destino ${nodeId}.`)]);
      setPendingChoices([]);
      setIsRunning(false);
      return;
    }

    const nextVisited = new Map(visited);
    nextVisited.set(visitKey, currentNodeVisits + 1);
    visitedRef.current = nextVisited;
    // Igual que appendNodeToHistory del motor: se registra al ENTRAR al nodo.
    historyRef.current = [...historyRef.current, nodeId];
    setCurrentNode({ automationId, nodeId });
    setStepCount((count) => count + 1);
    if (!currentAutomationId || currentAutomationId === automationId) {
      onNodeFocus?.(nodeId);
    }

    const label = getNodeLabel(node);
    const data = getNodeData(node);
    const nodeEvents: SimulatorEvent[] = [
      nextEvent("system", `Nodo actual: ${label}`, NODE_TYPE_LABELS[node.type] ?? node.type),
    ];

    if (node.type === "start") {
      const trigger = data.triggerType ? `Disparador: ${String(data.triggerType)}` : "Entrada del chat";
      nodeEvents.push(nextEvent("action", trigger));
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
      return;
    }

    if (node.type === "message") {
      nodeEvents.push(
        nextEvent(
          "bot",
          getRenderedMainText(node, variablesRef.current) ??
            "Mensaje sin texto configurado.",
        ),
      );
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
      return;
    }

    if (node.type === "media") {
      const mediaType = data.mediaType ? String(data.mediaType) : "archivo";
      const caption = getRenderedMainText(node, variablesRef.current);
      nodeEvents.push(nextEvent("bot", caption ? `[${mediaType}] ${caption}` : `Envia ${mediaType}.`));
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
      return;
    }

    if (node.type === "delay") {
      const seconds = Number(data.seconds) || 2; // mismo default que el motor
      const waitMs = Math.min(seconds * 1000, MAX_SIMULATED_DELAY_MS);
      nodeEvents.push(nextEvent("action", `Espera ${seconds} segundos.`));
      if (seconds * 1000 > MAX_SIMULATED_DELAY_MS) {
        nodeEvents.push(nextEvent("system", "Simulacion: espera acortada a 5s."));
      }
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited, waitMs);
      return;
    }

    if (node.type === "collect") {
      const prompt = getRenderedMainText(node, variablesRef.current) ?? "Solicita un dato al contacto.";
      const variable = typeof data.variable === "string" && data.variable.trim() ? data.variable.trim() : undefined;
      nodeEvents.push(nextEvent("bot", prompt));
      append(nodeEvents);
      clearTimer();
      setIsRunning(false);
      setPendingChoices([]);
      updateAwaitingInput({ automationId, nodeId: node.id, prompt, variable, mode: "collect" });
      return;
    }

    if (node.type === "form") {
      const fields = Array.isArray(data.fields) ? (data.fields as FormField[]) : [];
      const firstField = fields[0];
      if (!firstField) {
        nodeEvents.push(nextEvent("system", "El formulario no tiene campos configurados."));
        append(nodeEvents);
        advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
        return;
      }
      const prompt = getFormFieldPrompt(firstField, variablesRef.current);
      nodeEvents.push(nextEvent("bot", prompt));
      nodeEvents.push(nextEvent("action", `Campo 1 de ${fields.length}: ${firstField.variable}.`));
      append(nodeEvents);
      clearTimer();
      setIsRunning(false);
      setPendingChoices([]);
      updateAwaitingInput({
        automationId,
        nodeId: node.id,
        prompt,
        variable: firstField.variable,
        mode: "form",
        formFields: fields,
        formFieldIndex: 0,
      });
      return;
    }

    if (node.type === "save_contact") {
      nodeEvents.push(nextEvent("action", "Actualiza datos del CRM/contacto."));
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
      return;
    }

    if (node.type === "ai_control") {
      nodeEvents.push(nextEvent("action", `IA: ${String(data.action ?? "sin accion")}.`));
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
      return;
    }

    if (node.type === "call_to_action") {
      nodeEvents.push(
        nextEvent(
          "bot",
          getRenderedMainText(node, variablesRef.current) ??
            "Mensaje con llamada a la accion.",
        ),
      );
      nodeEvents.push(nextEvent("action", `Boton: ${String(data.buttonText ?? "Abrir enlace")}`));
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
      return;
    }

    if (node.type === "options") {
      nodeEvents.push(
        nextEvent(
          "bot",
          getRenderedMainText(node, variablesRef.current) ??
            "Elige una opcion.",
        ),
      );
      const choices = Array.isArray(data.options)
        ? data.options.map((option, index) => ({
            label: String(option),
            handle: `option-${index}`,
            targetId: getChoiceTarget(node.id, `option-${index}`, context.edges),
            automationId,
          }))
        : [];
      append(nodeEvents);
      waitForChoice(choices.length > 0 ? choices : [{ label: "Continuar", targetId: getDefaultTarget(node.id, context.edges), automationId }]);
      return;
    }

    if (node.type === "button_message") {
      nodeEvents.push(
        nextEvent(
          "bot",
          getRenderedMainText(node, variablesRef.current) ??
            "Mensaje con botones.",
        ),
      );
      const choices = Array.isArray(data.buttons)
        ? data.buttons.map(
            (
              button: { id?: string; text?: string; value?: string },
              index,
            ) => {
              const buttonId = button.id || String(index);
              return {
                label: String(button.text ?? "Boton"),
                aliases: [button.id, button.value].filter(
                  (value): value is string => Boolean(value),
                ),
                handle: `btn-${buttonId}`,
                targetId: getChoiceTarget(
                  node.id,
                  `btn-${buttonId}`,
                  context.edges,
                ),
                automationId,
              };
            },
          )
        : [];
      append(nodeEvents);
      waitForChoice(choices.length > 0 ? choices : [{ label: "Continuar", targetId: getDefaultTarget(node.id, context.edges), automationId }]);
      return;
    }

    if (node.type === "list_message") {
      nodeEvents.push(
        nextEvent(
          "bot",
          getRenderedMainText(node, variablesRef.current) ??
            "Mensaje con lista.",
        ),
      );
      const choices = Array.isArray(data.items)
        ? data.items.map(
            (
              item: { id?: string; title?: string; rowId?: string },
              index,
            ) => {
              const itemId = item.id || String(index);
              return {
                label: String(item.title ?? "Item"),
                aliases: [item.id, item.rowId].filter(
                  (value): value is string => Boolean(value),
                ),
                handle: `list-${itemId}`,
                targetId: getChoiceTarget(
                  node.id,
                  `list-${itemId}`,
                  context.edges,
                ),
                automationId,
              };
            },
          )
        : [];
      append(nodeEvents);
      waitForChoice(choices.length > 0 ? choices : [{ label: "Continuar", targetId: getDefaultTarget(node.id, context.edges), automationId }]);
      return;
    }

    if (node.type === "menu_simple") {
      const menuOptions = Array.isArray(data.menuOptions) ? (data.menuOptions as MenuSimpleOption[]) : [];
      const markerStyle = (typeof data.markerStyle === "string" ? data.markerStyle : "emoji_number") as MenuSimpleMarkerStyle;
      const promptText = buildMenuSimpleMessage({
        label:
          typeof data.label === "string"
            ? replaceSimulatorVariables(data.label, variablesRef.current)
            : "Elige una opcion:",
        markerStyle,
        menuOptions,
      });
      const fallback = context.edges.find((edge) => edge.source === node.id && edge.sourceHandle === "fallback");
      const variable = typeof data.variable === "string" && data.variable.trim() ? data.variable.trim() : undefined;
      const delaySeconds = Number(data.globalDelaySeconds) || 0;

      nodeEvents.push(nextEvent("bot", promptText || "Elige una opcion."));
      if (delaySeconds > 0) {
        nodeEvents.push(nextEvent("action", `Retardo configurado: ${delaySeconds} segundos.`));
      }
      if (variable) {
        nodeEvents.push(nextEvent("action", `Guardara la respuesta en ${variable}.`));
      }

      const choices = menuOptions.map((option, index) => {
        const handle = `menu-${option.id}`;
        return {
          label: option.text,
          handle,
          targetId: context.edges.find((edge) => edge.source === node.id && edge.sourceHandle === handle)?.target ?? null,
          automationId,
          kind: "menu_simple" as const,
          marker: getMenuMarker(markerStyle, index),
          nodeId: node.id,
          option,
          optionIndex: index,
          promptText,
          variable,
          delaySeconds,
        };
      });

      const menuChoiceList: PendingChoice[] = [
        ...choices,
        ...(fallback
          ? [{
              label: "Fallback",
              handle: "fallback",
              targetId: fallback.target,
              automationId,
              kind: "menu_simple" as const,
              nodeId: node.id,
              fallback: true,
              promptText,
              variable,
              delaySeconds,
            }]
          : []),
      ];

      append(nodeEvents);
      waitForChoice(menuChoiceList);
      updateAwaitingInput({
        automationId,
        nodeId: node.id,
        prompt: promptText,
        variable,
        mode: "menu_simple",
        choices: menuChoiceList,
      });
      return;
    }

    if (node.type === "condition") {
      // Paridad con el motor: evalúa las condiciones en orden contra el último
      // input del usuario + variables recogidas; sin match (o rama sin edge)
      // cae al fallback; sin fallback, termina el flujo.
      const conditions = Array.isArray(data.conditions) ? (data.conditions as ConditionEntry[]) : [];
      const input = lastInputRef.current;
      const matched = conditions.find((condition) =>
        evaluateSimulatorCondition(condition, input, variablesRef.current),
      );

      let targetEdge = matched
        ? context.edges.find((edge) => edge.source === node.id && edge.sourceHandle === matched.id)
        : undefined;
      if (matched && !targetEdge) {
        nodeEvents.push(nextEvent("system", "La rama cumplida no tiene salida conectada. Sigue por fallback."));
      }
      if (!targetEdge) {
        targetEdge = context.edges.find((edge) => edge.source === node.id && edge.sourceHandle === "fallback");
      }

      if (matched) {
        const conditionLabel =
          matched.label || [matched.type, matched.operator, matched.value].filter(Boolean).join(" ") || "Condicion";
        nodeEvents.push(nextEvent("action", `Condicion cumplida: "${conditionLabel}" (entrada: "${input || "sin entrada"}").`));
      } else {
        nodeEvents.push(
          nextEvent("action", `Ninguna condicion cumplida (entrada: "${input || "sin entrada"}"). Sigue por fallback.`),
        );
      }

      append(nodeEvents);
      if (targetEdge) {
        advance(automationId, targetEdge.target, nextVisited);
      } else {
        append([nextEvent("system", "Ninguna rama conectada. Fin del flujo.")]);
        stop();
      }
      return;
    }

    if (node.type === "go_to_node") {
      // Paridad con engine.ts: fallbackNodeId validado + fallbackAction
      // (default del catálogo: previous_node / stop).
      const fallbackNodeId =
        typeof data.fallbackNodeId === "string" && data.fallbackNodeId && context.nodeById.has(String(data.fallbackNodeId))
          ? String(data.fallbackNodeId)
          : undefined;
      const fallbackAction = data.fallbackAction ? String(data.fallbackAction) : fallbackNodeId ? "node" : "stop";

      const runFallback = (reason: string) => {
        if (fallbackAction === "node" && fallbackNodeId) {
          append([nextEvent("action", `${reason} Usa el nodo de respaldo.`)]);
          advance(automationId, fallbackNodeId, nextVisited);
        } else {
          append([nextEvent("system", `${reason} Fin del flujo.`)]);
          stop();
        }
      };

      if (data.mode === "other_flow") {
        const targetId = Number(data.targetAutomationId);
        const targetContext = automationContexts.get(targetId);
        const configuredTargetNode = data.targetNodeId
          ? targetContext?.nodeById.get(String(data.targetNodeId))
          : undefined;
        const targetNode = configuredTargetNode ?? targetContext?.startNode ?? null;
        nodeEvents.push(nextEvent("action", `Cambia a automatizacion: ${targetContext?.automation.name ?? targetId}.`));
        append(nodeEvents);
        if (!targetContext || !targetNode) {
          runFallback("La automatizacion destino no tiene un comienzo de flujo valido.");
          return;
        }
        // El motor arranca una sesión nueva con historial vacío en el flujo destino.
        historyRef.current = [];
        setSelectedAutomationId(targetContext.automation.id);
        advance(targetContext.automation.id, targetNode.id, nextVisited);
        return;
      }

      if (data.mode === "specific_node") {
        const targetNodeId = data.targetNodeId ? String(data.targetNodeId) : "";
        append(nodeEvents);
        if (targetNodeId && context.nodeById.has(targetNodeId)) {
          const targetNode = context.nodeById.get(targetNodeId);
          append([nextEvent("action", `Salta al nodo: ${targetNode ? getNodeLabel(targetNode) : targetNodeId}.`)]);
          advance(automationId, targetNodeId, nextVisited);
        } else {
          runFallback("El nodo destino configurado no existe.");
        }
        return;
      }

      // previous_node (modo por defecto del catálogo): el goto ya está en el
      // historial, así que el nodo anterior es el penúltimo registro.
      const history = historyRef.current;
      const previousNodeId = history.length >= 2 ? history[history.length - 2] : undefined;
      const validPrevious =
        previousNodeId && previousNodeId !== node.id && context.nodeById.has(previousNodeId)
          ? previousNodeId
          : undefined;

      append(nodeEvents);
      if (validPrevious) {
        const previousNode = context.nodeById.get(validPrevious);
        append([nextEvent("action", `Vuelve al nodo anterior: ${previousNode ? getNodeLabel(previousNode) : validPrevious}.`)]);
        advance(automationId, validPrevious, nextVisited);
      } else {
        runFallback("No hay un nodo anterior al que volver.");
      }
      return;
    }

    if (node.type === "sticky_note") {
      const title = typeof data.title === "string" && data.title.trim().length > 0 ? data.title.trim() : "Nota sticky";
      const body = typeof data.bodyText === "string" && data.bodyText.trim().length > 0 ? data.bodyText.trim() : "Sin contenido.";
      nodeEvents.push(nextEvent("system", `${title}: ${body}`));
      append(nodeEvents);
      advance(automationId, getDefaultTarget(node.id, context.edges), nextVisited);
      return;
    }

    if (node.type === "end") {
      nodeEvents.push(nextEvent("system", "Fin del chat."));
      append(nodeEvents);
      stop();
      return;
    }

    // Do not silently skip data from a future/legacy node type.
    const unsupportedType = String(
      (node as unknown as { type?: unknown }).type ?? "desconocido",
    );
    nodeEvents.push(
      nextEvent(
        "system",
        `El tipo de nodo "${unsupportedType}" no es compatible con esta version del simulador.`,
      ),
    );
    append(nodeEvents);
    stop();
  };

  const start = () => {
    clearTimer();
    visitedRef.current = new Map();
    variablesRef.current = {};
    historyRef.current = [];
    lastInputRef.current = "";
    setEvents([]);
    setPendingChoices([]);
    updateAwaitingInput(null);
    setInputValue("");
    setStepCount(0);
    runNode(selectedAutomation?.id ?? null, startNode?.id ?? null);
  };

  const commitChoice = (
    choice: PendingChoice,
    userText: string,
    choicesPool: PendingChoice[] = pendingChoices,
    fallbackAutomationId: number | null = selectedAutomation?.id ?? null,
  ) => {
    lastInputRef.current = userText;
    const fallbackChoice = choicesPool.find((item) => item.kind === "menu_simple" && item.fallback);
    const resolvedTarget =
      choice.targetId
        ?? (choice.kind === "menu_simple" && !choice.fallback ? fallbackChoice?.targetId : null)
        ?? null;
    const nextEvents = [nextEvent("user", userText)];

    if (!resolvedTarget) {
      nextEvents.push(
        nextEvent(
          "system",
          "La opcion no tiene una salida conectada. El simulador sigue esperando una respuesta valida.",
        ),
      );
      if (choice.kind === "menu_simple" && choice.promptText) {
        nextEvents.push(nextEvent("bot", choice.promptText));
      }
      append(nextEvents);
      setIsRunning(false);
      return;
    }

    if (choice.kind === "menu_simple" && choice.variable) {
      variablesRef.current = { ...variablesRef.current, [choice.variable]: userText };
      nextEvents.push(nextEvent("action", `${choice.variable} = ${userText}`));
    }

    // Paridad con el motor: menu_simple aplica globalDelaySeconds tras la respuesta.
    let delayMs = STEP_DELAY_MS;
    if (choice.kind === "menu_simple" && (choice.delaySeconds ?? 0) > 0) {
      const seconds = choice.delaySeconds ?? 0;
      delayMs = Math.min(seconds * 1000, MAX_SIMULATED_DELAY_MS);
      nextEvents.push(nextEvent("action", `Aplica retardo de ${seconds}s antes de continuar.`));
      if (seconds * 1000 > MAX_SIMULATED_DELAY_MS) {
        nextEvents.push(nextEvent("system", "Simulacion: espera acortada a 5s."));
      }
    }

    append(nextEvents);
    updateAwaitingInput(null);
    advance(choice.automationId ?? fallbackAutomationId, resolvedTarget, visitedRef.current, delayMs);
  };

  const choose = (choice: PendingChoice) => {
    commitChoice(choice, choice.label);
  };

  // Match a typed message against the pending options (by number or by text),
  // mirroring how the real automation engine resolves a reply.
  const matchChoice = (text: string): PendingChoice | null => {
    if (pendingChoices.length === 0) return null;
    const menuChoices = pendingChoices.filter((choice) => choice.kind === "menu_simple" && !choice.fallback);
    if (menuChoices.length > 0) {
      for (const choice of menuChoices) {
        const option = choice.option;
        if (!option?.matchValue?.trim()) continue;
        const condition = {
          type: option.matchType || "text",
          operator: option.matchOperator || "equals",
          value: option.matchValue,
          value2: option.matchValue2,
        };
        if (evaluateSimulatorCondition(condition, text, variablesRef.current)) {
          return choice;
        }
      }

      const markerIndex = matchMenuSimpleReplyByMarker(
        menuChoices.map((choice) => choice.option).filter(Boolean) as MenuSimpleOption[],
        text,
      );
      if (markerIndex !== -1) {
        return menuChoices[markerIndex] ?? null;
      }

      return pendingChoices.find((choice) => choice.kind === "menu_simple" && choice.fallback) ?? null;
    }

    const index = findSimulatorChoiceIndex(pendingChoices, text);
    return index >= 0 ? pendingChoices[index] ?? null : null;
  };

  // Single entry point for the persistent chat input.
  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isRunning) return;
    setInputValue("");
    lastInputRef.current = text;

    if (awaitingInput) {
      if (awaitingInput.mode === "form") {
        const fields = awaitingInput.formFields ?? [];
        const fieldIndex = awaitingInput.formFieldIndex ?? 0;
        const field = fields[fieldIndex];
        if (!field) {
          updateAwaitingInput(null);
          return;
        }

        if (
          field.type === "menu" &&
          !matchesFormMenuReply(field, text, variablesRef.current)
        ) {
          append([
            nextEvent("user", text),
            nextEvent("system", "Opcion invalida. Responde con el numero, marcador o texto de una opcion."),
            nextEvent("bot", awaitingInput.prompt),
          ]);
          return;
        }

        variablesRef.current = {
          ...variablesRef.current,
          [field.variable]: text,
        };
        const nextEvents = [
          nextEvent("user", text),
          nextEvent("action", `${field.variable} = ${text}`),
        ];
        const nextFieldIndex = fieldIndex + 1;
        const nextField = fields[nextFieldIndex];
        if (nextField) {
          const nextPrompt = getFormFieldPrompt(nextField, variablesRef.current);
          nextEvents.push(nextEvent("bot", nextPrompt));
          nextEvents.push(
            nextEvent(
              "action",
              `Campo ${nextFieldIndex + 1} de ${fields.length}: ${nextField.variable}.`,
            ),
          );
          append(nextEvents);
          updateAwaitingInput({
            ...awaitingInput,
            prompt: nextPrompt,
            variable: nextField.variable,
            formFieldIndex: nextFieldIndex,
          });
          return;
        }

        append(nextEvents);
        updateAwaitingInput(null);
        const awaitingContext = automationContexts.get(awaitingInput.automationId);
        advance(
          awaitingInput.automationId,
          awaitingContext
            ? getDefaultTarget(awaitingInput.nodeId, awaitingContext.edges)
            : null,
          visitedRef.current,
        );
        return;
      }

      if (awaitingInput.mode === "menu_simple") {
        const awaitingChoices = awaitingInput.choices ?? pendingChoices;
        const match = (() => {
          const menuChoices = awaitingChoices.filter((choice) => choice.kind === "menu_simple" && !choice.fallback);
          if (menuChoices.length > 0) {
            for (const choice of menuChoices) {
              const option = choice.option;
              if (!option?.matchValue?.trim()) continue;
              const condition = {
                type: option.matchType || "text",
                operator: option.matchOperator || "equals",
                value: option.matchValue,
                value2: option.matchValue2,
              };
              if (evaluateSimulatorCondition(condition, text, variablesRef.current)) {
                return choice;
              }
            }

            const markerIndex = matchMenuSimpleReplyByMarker(
              menuChoices.map((choice) => choice.option).filter(Boolean) as MenuSimpleOption[],
              text,
            );
            if (markerIndex !== -1) {
              return menuChoices[markerIndex] ?? null;
            }

            return awaitingChoices.find((choice) => choice.kind === "menu_simple" && choice.fallback) ?? null;
          }

          return null;
        })();

        if (match) {
          commitChoice(match, text, awaitingChoices, awaitingInput.automationId ?? selectedAutomation?.id ?? null);
          return;
        }

        const menuPrompt = awaitingChoices.find((choice) => choice.kind === "menu_simple")?.promptText ?? awaitingInput.prompt;
        append([
          nextEvent("user", text),
          nextEvent("system", "Opcion invalida. Responde con el numero, marcador o texto de una opcion."),
          ...(menuPrompt ? [nextEvent("bot", menuPrompt)] : []),
        ]);
        return;
      }

      const nodeId = awaitingInput.nodeId;
      const awaitingContext = automationContexts.get(awaitingInput.automationId);
      const nextEvents = [nextEvent("user", text)];
      if (awaitingInput.variable) {
        variablesRef.current = { ...variablesRef.current, [awaitingInput.variable]: text };
        nextEvents.push(nextEvent("action", `${awaitingInput.variable} = ${text}`));
      }
      append(nextEvents);
      updateAwaitingInput(null);
      advance(
        awaitingInput.automationId,
        awaitingContext ? getDefaultTarget(nodeId, awaitingContext.edges) : null,
        visitedRef.current,
      );
      return;
    }

    if (pendingChoices.length > 0) {
      const match = matchChoice(text);
      if (match) {
        commitChoice(match, text);
      } else {
        const menuPrompt = pendingChoices.find((choice) => choice.kind === "menu_simple")?.promptText;
        append([
          nextEvent("user", text),
          nextEvent("system", "Opcion invalida. Responde con el numero, marcador o texto de una opcion."),
          ...(menuPrompt ? [nextEvent("bot", menuPrompt)] : []),
        ]);
      }
      return;
    }

    if (events.length === 0 && startNode) {
      append([nextEvent("user", text)]);
      runNode(selectedAutomation?.id ?? null, startNode.id);
      return;
    }

    append([nextEvent("user", text)]);
  };

  const activeContext = currentNode ? automationContexts.get(currentNode.automationId) : undefined;
  const activeNode = currentNode ? activeContext?.nodeById.get(currentNode.nodeId) : null;
  const activeNodeLabel = activeNode ? getNodeLabel(activeNode) : "Sin nodo activo";
  const activeAutomationName = activeContext?.automation.name ?? selectedAutomation?.name ?? "Automatizacion";
  const menuInputMode = awaitingInput?.mode === "menu_simple";
  const menuPrompt = menuInputMode ? (awaitingInput?.prompt ?? "Elige una opcion:") : null;

  return (
    <section className={["min-h-0 bg-background text-foreground", className].join(" ")}>
      <div className="grid h-full min-h-0 overflow-y-auto rounded-xl border border-border bg-background xl:grid-cols-2 xl:overflow-hidden">
        <aside className="flex min-h-[420px] flex-col border-b border-border bg-card xl:min-h-0 xl:border-b-0 xl:border-r">
          <div className="shrink-0 border-b border-border p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{title}</h2>
                <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{description}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {automations.length > 1 && (
                <Select
                  value={selectedAutomation?.id ? String(selectedAutomation.id) : ""}
                  onValueChange={(value) => {
                    setSelectedAutomationId(Number(value));
                    reset();
                  }}
                >
                  <SelectTrigger className="h-9 w-full rounded-lg border-border bg-background text-xs text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {automations.map((automation) => (
                      <SelectItem key={automation.id} value={String(automation.id)}>
                        {automation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 flex-1 rounded-lg border-border bg-transparent text-xs"
                  onClick={reset}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reiniciar
                </Button>
                <Button
                  size="sm"
                  className="h-9 flex-1 rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
                  onClick={start}
                  disabled={!startNode || isRunning}
                >
                  <Play className="h-3.5 w-3.5" />
                  {isRunning ? "Simulando..." : "Simular"}
                </Button>
              </div>
              <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {stepCount} pasos
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  1s por paso
                </span>
                <span className={isRunning ? "ml-auto text-foreground" : "ml-auto"}>
                  {isRunning ? "Ejecutando" : "Listo"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <GitBranchPlus className="h-4 w-4 text-foreground" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">Trazabilidad</div>
              <div className="text-[10px] text-muted-foreground">{stepCount} pasos recorridos</div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {nodes.map((node) => {
              const isCurrent = Boolean(
                currentNode &&
                  selectedAutomation &&
                  currentNode.automationId === selectedAutomation.id &&
                  currentNode.nodeId === node.id,
              );
              const outgoing = edges.filter((edge) => edge.source === node.id).length;
              return (
                <div
                  key={node.id}
                  className={[
                    "rounded-lg border p-2.5 text-xs transition",
                    isCurrent
                      ? "border-foreground/40 bg-muted ring-1 ring-foreground/10"
                      : "border-border bg-background",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{getNodeLabel(node)}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {NODE_TYPE_LABELS[node.type] ?? node.type}
                      </div>
                    </div>
                    {isCurrent ? (
                      <CheckCircle2 className="h-4 w-4 text-foreground" />
                    ) : (
                      <GitBranchPlus className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {outgoing} salidas
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div className="flex min-h-[620px] w-full flex-col overflow-hidden bg-background xl:h-full xl:min-h-0">
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
            <div className="flex min-w-0 items-center gap-2">
              <Smartphone className="h-4 w-4 shrink-0 text-foreground" />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">{activeAutomationName}</div>
                <div className="truncate text-[9px] text-muted-foreground">{activeNodeLabel}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="rounded-md border border-border bg-muted/30 px-2 py-1">
                {pendingChoices.length > 0
                  ? "Esperando respuesta"
                  : isRunning
                    ? "Ejecutando"
                    : "Listo"}
              </span>
              {menuInputMode ? (
                <span className="rounded-md border border-foreground/20 bg-muted px-2 py-1 text-foreground">
                  Menú simple
                </span>
              ) : null}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/25 px-4 py-4"
          >
            {events.length === 0 ? (
              <div className="mx-auto mt-24 max-w-md rounded-xl border border-border bg-card p-5 text-center text-xs text-muted-foreground shadow-sm">
                <MessageCircle className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
                <div className="font-medium text-foreground">Simulación lista</div>
                <div className="mt-1">Inicia el flujo para visualizar cada paso.</div>
              </div>
            ) : (
              events.map((event) => {
                const isMetaEvent = event.kind === "system" || event.kind === "action";
                return (
                  <div
                    key={event.id}
                    className={[
                      "flex",
                      event.kind === "user"
                        ? "justify-end"
                        : event.kind === "bot"
                          ? "justify-start"
                          : "justify-center",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        isMetaEvent
                          ? "max-w-[92%] rounded-lg border border-border bg-background/80 px-3 py-1 text-[10px] leading-snug text-muted-foreground"
                          : "max-w-[86%] border px-3 py-2 text-xs leading-relaxed shadow-sm sm:max-w-[78%]",
                        event.kind === "user"
                          ? "rounded-2xl rounded-br-sm border-foreground bg-foreground text-background"
                          : event.kind === "bot"
                            ? "rounded-2xl rounded-bl-sm border-border bg-card text-card-foreground"
                            : "",
                      ].join(" ")}
                    >
                      {event.title && (
                        <div
                          className={
                            isMetaEvent
                              ? "mr-1 inline text-[9px] font-semibold opacity-60"
                              : "mb-1 text-[9px] font-semibold opacity-70"
                          }
                        >
                          {event.title}
                        </div>
                      )}
                      <div className={isMetaEvent ? "inline whitespace-pre-wrap break-words" : "whitespace-pre-wrap break-words"}>
                        {event.text}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {menuInputMode ? (
            <div className="shrink-0 border-t border-border bg-background px-3 py-2 text-[10px] text-foreground">
              Responde con el número, marcador o texto de la opción.
            </div>
          ) : null}

          <form
            className="flex shrink-0 items-center gap-2 border-t border-border bg-background p-3"
            onSubmit={(event) => {
              event.preventDefault();
              handleSend();
            }}
          >
            <Input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={
                menuInputMode
                  ? "Escribe la opción..."
                  : awaitingInput
                    ? "Escribe la respuesta del contacto..."
                    : pendingChoices.length > 0
                      ? "Número o texto de una opción..."
                      : events.length === 0
                        ? "Escribe un mensaje para iniciar..."
                        : "Escribe un mensaje..."
              }
              className="h-10 flex-1 rounded-lg border-border bg-card text-xs text-foreground"
              disabled={isRunning}
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-lg bg-foreground text-background hover:bg-foreground/90"
              disabled={isRunning || !inputValue.trim()}
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
