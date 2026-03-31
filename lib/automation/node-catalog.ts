import type { AutomationCanvasNode, AutomationCanvasNodeData, AutomationFlowChannel, AutomationFlowNodeType } from '@/lib/automation/flow-schema';
import {
  AUTOMATION_FLOW_CHANNELS,
  AUTOMATION_FLOW_NODE_TYPES,
  AUTOMATION_TEXT_LIMITS,
  automationNodeDataSchemaByType,
} from '@/lib/automation/flow-schema';

export type AutomationNodeCategory = 'trigger' | 'messages' | 'logic' | 'integrations';
export type AutomationSidebarIconKey =
  | 'message-square'
  | 'image'
  | 'mouse-pointer-click'
  | 'list-checks'
  | 'external-link'
  | 'list'
  | 'split'
  | 'clock'
  | 'x-circle'
  | 'pen-line'
  | 'save'
  | 'bot';

export type AutomationEditableFieldDefinition = {
  key: string;
  labelKey: string;
  input:
    | 'textarea'
    | 'text'
    | 'number'
    | 'select'
    | 'multi-text'
    | 'button-list'
    | 'list-items'
    | 'conditions'
    | 'file'
    | 'crm-mapping';
  required?: boolean;
  placeholderKey?: string;
  helperTextKey?: string;
  min?: number;
  max?: number;
};

export type AutomationConnectionRules = {
  maxIncoming: number | 'many';
  maxOutgoing: number | 'many';
  sourceHandles: 'single' | 'per-option' | 'per-button' | 'per-list-item' | 'per-condition';
  targetHandles: 'single';
  disallowAsSubflowAnchor?: boolean;
  notes: string[];
};

export type AutomationNodeCatalogEntry = {
  type: AutomationFlowNodeType;
  labelKey: string;
  category: AutomationNodeCategory;
  channels: readonly AutomationFlowChannel[];
  editableFields: AutomationEditableFieldDefinition[];
  defaults: Partial<AutomationCanvasNodeData>;
  connectionRules: AutomationConnectionRules;
  aiDescription: string;
  aiExamples: string[];
  sidebar?: {
    icon: AutomationSidebarIconKey;
    colorClass: string;
    iconColorClass: string;
  };
};

const cloneNodeData = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

export const AUTOMATION_NODE_CATALOG: AutomationNodeCatalogEntry[] = [
  {
    type: 'start',
    labelKey: 'nodes.start',
    category: 'trigger',
    channels: ['qr', 'api'],
    editableFields: [
      { key: 'triggerType', labelKey: 'trigger_type_label', input: 'select', required: true },
      { key: 'keywords', labelKey: 'keywords_label', input: 'multi-text', max: 20 },
      { key: 'conditions', labelKey: 'conditions_title', input: 'crm-mapping' },
    ],
    defaults: {
      label: 'Start',
      triggerType: 'first_message',
      keywords: [],
      conditions: {},
    },
    connectionRules: {
      maxIncoming: 0,
      maxOutgoing: 'many',
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Exactly one start node per flow.', 'Use as the entry point for the automation.'],
    },
    aiDescription: 'Required entry trigger. Configure how the automation starts and optional CRM-based filters.',
    aiExamples: [
      'Start trigger on first incoming message.',
      'Start when message contains pricing, quote, or plans.',
    ],
  },
  {
    type: 'message',
    labelKey: 'nodes.message',
    category: 'messages',
    channels: ['qr'],
    editableFields: [
      {
        key: 'label',
        labelKey: 'message_text_label',
        input: 'textarea',
        required: true,
        placeholderKey: 'type_placeholder',
        max: AUTOMATION_TEXT_LIMITS.qr.text,
      },
    ],
    defaults: { label: 'Hello! Thanks for reaching out.' },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 1,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Plain text only.', 'Best for QR/Web flows.'],
    },
    aiDescription: 'Send a plain text WhatsApp message to the contact.',
    aiExamples: ['Welcome! Tell me what you need and I will help you.', 'Thanks! I am sending the next steps now.'],
    sidebar: {
      icon: 'message-square',
      colorClass: 'bg-primary/10',
      iconColorClass: 'text-primary',
    },
  },
  {
    type: 'media',
    labelKey: 'nodes.media',
    category: 'messages',
    channels: ['qr'],
    editableFields: [
      { key: 'mediaType', labelKey: 'media_type_label', input: 'select', required: true },
      { key: 'mediaUrl', labelKey: 'file_upload_label', input: 'file' },
      {
        key: 'caption',
        labelKey: 'caption_label',
        input: 'text',
        placeholderKey: 'optional_caption_placeholder',
        max: AUTOMATION_TEXT_LIMITS.qr.mediaCaption,
      },
    ],
    defaults: { mediaType: 'image', mediaUrl: '', caption: '', fileName: '' },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 1,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Supports image, video, audio, or document.', 'Caption is optional except for audio.'],
    },
    aiDescription: 'Send a media asset with optional caption in QR/Web flows.',
    aiExamples: ['Share a product image with caption New arrivals this week.', 'Send a PDF brochure document without caption.'],
    sidebar: {
      icon: 'image',
      colorClass: 'bg-pink-500/10',
      iconColorClass: 'text-pink-500',
    },
  },
  {
    type: 'options',
    labelKey: 'nodes.options',
    category: 'messages',
    channels: ['qr', 'api'],
    editableFields: [
      {
        key: 'label',
        labelKey: 'message_text_label',
        input: 'textarea',
        required: true,
        placeholderKey: 'type_placeholder',
        max: AUTOMATION_TEXT_LIMITS.qr.text,
      },
      {
        key: 'options',
        labelKey: 'menu_options_label',
        input: 'multi-text',
        required: true,
        min: 1,
        max: 10,
      },
    ],
    defaults: { label: 'Choose an option:', options: ['Sales', 'Support'] },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 'many',
      sourceHandles: 'per-option',
      targetHandles: 'single',
      notes: ['Each option should have its own outgoing edge.', 'Use short option labels.'],
    },
    aiDescription: 'Ask the user to choose from numbered text options.',
    aiExamples: ['Question: What do you need? Options: Sales, Billing, Support.', 'Question: Pick a plan. Options: Basic, Pro, Enterprise.'],
    sidebar: {
      icon: 'list',
      colorClass: 'bg-orange-500/10',
      iconColorClass: 'text-orange-500',
    },
  },
  {
    type: 'delay',
    labelKey: 'nodes.delay',
    category: 'logic',
    channels: ['qr', 'api'],
    editableFields: [
      { key: 'seconds', labelKey: 'wait_duration_label', input: 'number', required: true, min: 1, max: 86400 },
    ],
    defaults: { label: 'Wait', seconds: 2 },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 1,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Use seconds as a positive integer.', 'Keep waits practical for chat conversations.'],
    },
    aiDescription: 'Pause the automation for a specific number of seconds before continuing.',
    aiExamples: ['Wait 2 seconds before the follow-up message.', 'Delay 30 seconds before checking for more input.'],
    sidebar: {
      icon: 'clock',
      colorClass: 'bg-blue-500/10',
      iconColorClass: 'text-blue-500',
    },
  },
  {
    type: 'collect',
    labelKey: 'nodes.collect',
    category: 'integrations',
    channels: ['qr', 'api'],
    editableFields: [
      {
        key: 'label',
        labelKey: 'question_label',
        input: 'textarea',
        required: true,
        placeholderKey: 'type_placeholder',
        max: AUTOMATION_TEXT_LIMITS.qr.text,
      },
      {
        key: 'variable',
        labelKey: 'variable_name_label',
        input: 'text',
        required: true,
        placeholderKey: 'variable_name_placeholder',
      },
    ],
    defaults: { label: 'What is your name?', variable: 'user_name' },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 1,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Stores the next user reply in a variable.', 'Prefer snake_case variable names.'],
    },
    aiDescription: 'Ask for a user reply and save it into a named variable.',
    aiExamples: ['Ask for email and store it as customer_email.', 'Ask for order number and store it as order_id.'],
    sidebar: {
      icon: 'pen-line',
      colorClass: 'bg-purple-500/10',
      iconColorClass: 'text-purple-500',
    },
  },
  {
    type: 'save_contact',
    labelKey: 'nodes.save_contact',
    category: 'integrations',
    channels: ['qr', 'api'],
    editableFields: [
      { key: 'nameVariable', labelKey: 'name_variable_label', input: 'text', placeholderKey: 'variable_name_placeholder' },
      { key: 'agentId', labelKey: 'assign_to_agent_label', input: 'select' },
      { key: 'departmentId', labelKey: 'assign_to_department_label', input: 'select' },
      { key: 'funnelStageId', labelKey: 'set_funnel_stage_label', input: 'select' },
      { key: 'tagId', labelKey: 'add_tag_label', input: 'select' },
      { key: 'customFields', labelKey: 'custom_fields_title', input: 'crm-mapping' },
    ],
    defaults: {
      nameVariable: '',
      agentId: 'null',
      departmentId: 'null',
      tagId: 'null',
      funnelStageId: 'null',
      customFields: {},
    },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 1,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Updates CRM/contact attributes.', 'Prefer variables instead of hard-coded values when possible.'],
    },
    aiDescription: 'Persist contact metadata such as owner, department, stage, tags, or mapped custom fields.',
    aiExamples: ['Assign the lead to sales and set funnel stage Qualified.', 'Save {{user_name}} as the contact name and add a VIP tag.'],
    sidebar: {
      icon: 'save',
      colorClass: 'bg-green-500/10',
      iconColorClass: 'text-green-500',
    },
  },
  {
    type: 'end',
    labelKey: 'nodes.end',
    category: 'logic',
    channels: ['qr', 'api'],
    editableFields: [],
    defaults: {},
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 0,
      sourceHandles: 'single',
      targetHandles: 'single',
      disallowAsSubflowAnchor: true,
      notes: ['Terminal node.', 'Ends the automation session immediately.'],
    },
    aiDescription: 'End the automation session cleanly.',
    aiExamples: ['Stop the flow after confirming the request.', 'End the chat when the user says thanks.'],
    sidebar: {
      icon: 'x-circle',
      colorClass: 'bg-destructive/10',
      iconColorClass: 'text-destructive',
    },
  },
  {
    type: 'button_message',
    labelKey: 'nodes.buttons',
    category: 'messages',
    channels: ['api'],
    editableFields: [
      { key: 'bodyText', labelKey: 'message_text_required_label', input: 'textarea', required: true, placeholderKey: 'enter_message_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.body },
      { key: 'footerText', labelKey: 'footer_optional_label', input: 'text', placeholderKey: 'enter_footer_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.footer },
      { key: 'buttons', labelKey: 'buttons_label', input: 'button-list', required: true, min: 1, max: 3 },
    ],
    defaults: {
      bodyText: 'Choose one of the options below.',
      footerText: '',
      buttons: [{ id: 'btn-1', text: 'Option 1', value: 'option_1' }],
    },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 'many',
      sourceHandles: 'per-button',
      targetHandles: 'single',
      disallowAsSubflowAnchor: true,
      notes: ['API only.', 'Each button should map to its own outgoing edge.'],
    },
    aiDescription: 'Send an interactive API button message with up to 3 buttons.',
    aiExamples: ['Ask if the user wants Demo or Pricing with two buttons.', 'Offer Yes and No confirmation buttons.'],
    sidebar: {
      icon: 'mouse-pointer-click',
      colorClass: 'bg-indigo-500/10',
      iconColorClass: 'text-indigo-500',
    },
  },
  {
    type: 'list_message',
    labelKey: 'nodes.list',
    category: 'messages',
    channels: ['api'],
    editableFields: [
      { key: 'title', labelKey: 'header_text_optional_label', input: 'text', placeholderKey: 'header_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.title },
      { key: 'bodyText', labelKey: 'body_text_label', input: 'textarea', required: true, placeholderKey: 'body_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.body },
      { key: 'footerText', labelKey: 'footer_text_optional_label', input: 'text', placeholderKey: 'footer_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.footer },
      { key: 'buttonText', labelKey: 'button_text_label', input: 'text', required: true, placeholderKey: 'button_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.buttonText },
      { key: 'items', labelKey: 'list_items_label', input: 'list-items', required: true, min: 1, max: 10 },
    ],
    defaults: {
      title: '',
      bodyText: 'Please choose one item from the list.',
      footerText: '',
      buttonText: 'Open list',
      items: [{ id: 'item-1', title: 'Option 1', description: '', rowId: 'option_1' }],
    },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 'many',
      sourceHandles: 'per-list-item',
      targetHandles: 'single',
      notes: ['API only.', 'Each list item should map to a branch.'],
    },
    aiDescription: 'Send an interactive API list message with selectable rows.',
    aiExamples: ['List plans Basic, Pro, and Enterprise.', 'Show departments Sales, Billing, and Support.'],
    sidebar: {
      icon: 'list-checks',
      colorClass: 'bg-teal-500/10',
      iconColorClass: 'text-teal-500',
    },
  },
  {
    type: 'call_to_action',
    labelKey: 'nodes.cta',
    category: 'messages',
    channels: ['api'],
    editableFields: [
      { key: 'title', labelKey: 'header_optional_label', input: 'text', placeholderKey: 'enter_header_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.title },
      { key: 'bodyText', labelKey: 'value_text_label', input: 'textarea', required: true, placeholderKey: 'enter_value_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.body },
      { key: 'buttonText', labelKey: 'button_text_label', input: 'text', required: true, placeholderKey: 'click_here_placeholder', max: AUTOMATION_TEXT_LIMITS.api.buttonText },
      { key: 'url', labelKey: 'button_link_label', input: 'text', required: true, placeholderKey: 'enter_url_placeholder', max: AUTOMATION_TEXT_LIMITS.api.ctaUrl },
      { key: 'footerText', labelKey: 'footer_optional_label', input: 'text', placeholderKey: 'enter_footer_text_placeholder', max: AUTOMATION_TEXT_LIMITS.api.footer },
    ],
    defaults: {
      title: '',
      bodyText: 'Open the secure link to continue.',
      buttonText: 'Open link',
      url: 'https://example.com',
      footerText: '',
    },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 1,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['API only.', 'Use a valid https URL in the CTA button.'],
    },
    aiDescription: 'Send an API call-to-action message with a URL button.',
    aiExamples: ['Share the checkout link with button text Pay now.', 'Send a scheduling link with button text Book a call.'],
    sidebar: {
      icon: 'external-link',
      colorClass: 'bg-sky-500/10',
      iconColorClass: 'text-sky-500',
    },
  },
  {
    type: 'ai_control',
    labelKey: 'nodes.ai_control',
    category: 'integrations',
    channels: ['qr', 'api'],
    editableFields: [
      { key: 'action', labelKey: 'action_label', input: 'select', required: true },
    ],
    defaults: { action: 'active' },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 1,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Toggle the AI assistant on or off for the chat.', 'Useful before or after human handoff.'],
    },
    aiDescription: 'Enable or pause the AI assistant for the current chat session.',
    aiExamples: ['Pause AI before assigning to a human.', 'Re-enable AI after the handoff window ends.'],
    sidebar: {
      icon: 'bot',
      colorClass: 'bg-violet-600/10',
      iconColorClass: 'text-violet-600',
    },
  },
  {
    type: 'condition',
    labelKey: 'nodes.condition',
    category: 'logic',
    channels: ['qr', 'api'],
    editableFields: [
      { key: 'conditions', labelKey: 'ConditionProperties.title', input: 'conditions', required: true, min: 1, max: 10 },
    ],
    defaults: {
      conditions: [{ id: 'cond-1', type: 'text', operator: 'equals', value: '' }],
    },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 'many',
      sourceHandles: 'per-condition',
      targetHandles: 'single',
      disallowAsSubflowAnchor: true,
      notes: ['Each condition id can be used as a sourceHandle on outgoing edges.', 'You may also use the fallback handle.'],
    },
    aiDescription: 'Split the flow by evaluating one or more conditions and optional fallback.',
    aiExamples: ['Branch when amount is greater than 100.', 'Branch when variable lead_stage equals enterprise.'],
    sidebar: {
      icon: 'split',
      colorClass: 'bg-yellow-500/10',
      iconColorClass: 'text-yellow-600',
    },
  },
  {
    type: 'go_to_node',
    labelKey: 'nodes.go_to_node',
    category: 'logic',
    channels: ['qr', 'api'],
    editableFields: [
      { key: 'mode', labelKey: 'go_to_mode_label', input: 'select', required: true },
      { key: 'targetNodeId', labelKey: 'go_to_target_node_label', input: 'select' },
      { key: 'targetAutomationId', labelKey: 'go_to_target_automation_label', input: 'select' },
      { key: 'fallbackAction', labelKey: 'go_to_fallback_action_label', input: 'select' },
      { key: 'fallbackNodeId', labelKey: 'go_to_fallback_node_label', input: 'select' },
    ],
    defaults: {
      mode: 'previous_node',
      targetNodeId: '',
      targetAutomationId: '',
      fallbackAction: 'stop',
      fallbackNodeId: '',
    },
    connectionRules: {
      maxIncoming: 'many',
      maxOutgoing: 0,
      sourceHandles: 'single',
      targetHandles: 'single',
      notes: ['Redirect execution to a previous node, a specific node, or another automation flow.'],
    },
    aiDescription: 'Redirect flow execution to another point in this flow or to another automation.',
    aiExamples: ['Return to the previous question when validation fails.', 'Jump to payment flow after user confirms intent.'],
    sidebar: {
      icon: 'split',
      colorClass: 'bg-amber-500/10',
      iconColorClass: 'text-amber-600',
    },
  },
] satisfies AutomationNodeCatalogEntry[];

export const AUTOMATION_SIDEBAR_CATEGORIES: AutomationNodeCategory[] = ['messages', 'logic', 'integrations'];

export function getAutomationNodeCatalogEntry(type: AutomationFlowNodeType) {
  return AUTOMATION_NODE_CATALOG.find((entry) => entry.type === type) ?? null;
}

export function getAutomationNodeDefaults(type: AutomationFlowNodeType): Partial<AutomationCanvasNodeData> {
  return cloneNodeData(getAutomationNodeCatalogEntry(type)?.defaults ?? {});
}

export function mergeAutomationNodeDataWithDefaults<T extends AutomationFlowNodeType>(
  type: T,
  data?: Partial<AutomationCanvasNodeData>,
) {
  return {
    ...getAutomationNodeDefaults(type),
    ...(data ?? {}),
  };
}

export function getEditableFieldDefinition(type: AutomationFlowNodeType, key: string) {
  return getAutomationNodeCatalogEntry(type)?.editableFields.find((field) => field.key === key) ?? null;
}

export function getSidebarNodesByCategory(category: AutomationNodeCategory) {
  return AUTOMATION_NODE_CATALOG.filter((entry) => entry.category === category && entry.sidebar);
}

export function getAllowedAutomationNodeCatalog(channel: AutomationFlowChannel, allowedTypes?: readonly AutomationFlowNodeType[]) {
  const allowedSet = new Set(allowedTypes ?? AUTOMATION_FLOW_NODE_TYPES);
  return AUTOMATION_NODE_CATALOG.filter(
    (entry) => entry.channels.includes(channel) && allowedSet.has(entry.type),
  );
}

export function getAllowedAutomationNodeTypesForChannel(channel: AutomationFlowChannel) {
  return getAllowedAutomationNodeCatalog(channel).map((entry) => entry.type);
}

export function getNodeContentConstraintsForChannel(channel: AutomationFlowChannel) {
  const entries = getAllowedAutomationNodeCatalog(channel);
  return Object.fromEntries(
    entries.map((entry) => {
      const fieldSummary = entry.editableFields.length > 0
        ? entry.editableFields
            .map((field) => {
              const maxText = typeof field.max === 'number' ? ` max ${field.max}` : '';
              const minText = typeof field.min === 'number' ? ` min ${field.min}` : '';
              const requiredText = field.required ? ' required' : ' optional';
              return `${field.key} (${field.input}${requiredText}${minText}${maxText})`;
            })
            .join(', ')
        : 'No editable fields.';

      return [
        entry.type,
        `${entry.aiDescription} Editable fields: ${fieldSummary}. Connection rules: ${entry.connectionRules.notes.join(' ')}`,
      ];
    }),
  ) as Record<AutomationFlowNodeType, string>;
}

export function validateAutomationNodeData<T extends AutomationFlowNodeType>(type: T, data: unknown) {
  const parsed = automationNodeDataSchemaByType[type].safeParse(data);

  if (!parsed.success) {
    return {
      success: false as const,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  return {
    success: true as const,
    data: parsed.data,
  };
}

export function createAutomationCanvasNode(params: {
  type: AutomationFlowNodeType;
  position: { x: number; y: number };
  id?: string;
  data?: Partial<AutomationCanvasNodeData>;
}): AutomationCanvasNode {
  return {
    id: params.id ?? `${params.type}-${Date.now()}`,
    type: params.type,
    position: params.position,
    data: mergeAutomationNodeDataWithDefaults(params.type, params.data),
  };
}

export const AUTOMATION_NODE_TYPE_SET = new Set(AUTOMATION_FLOW_NODE_TYPES);
export const AUTOMATION_CHANNEL_SET = new Set(AUTOMATION_FLOW_CHANNELS);
