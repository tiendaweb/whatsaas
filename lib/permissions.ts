export type TeamRole = 'owner' | 'admin' | 'agent';

export type ChatVisibility = 'all' | 'assigned' | 'department';

export type MemberPermissions = {
  automation: boolean;
  aiAgent: boolean;
  contacts: boolean;
  drafts: boolean;
  templates: boolean;
  campaigns: boolean;
  settings: boolean;
  notesRead: boolean;
  notesWrite: boolean;
  calendarRead: boolean;
  calendarWrite: boolean;
  domainsRead: boolean;
  domainsWrite: boolean;
  articlesRead: boolean;
  articlesWrite: boolean;
  salesRead: boolean;
  salesWrite: boolean;
  dealsRead: boolean;
  dealsWrite: boolean;
  salesOpsRead: boolean;
  salesOpsWrite: boolean;
  empresaRead: boolean;
  empresaWrite: boolean;
  marketingRead: boolean;
  marketingWrite: boolean;
  iaRead: boolean;
  iaWrite: boolean;
  customersRead: boolean;
  customersWrite: boolean;
  aappSpaceRead: boolean;
  aappSpaceWrite: boolean;
  membershipsRead: boolean;
  membershipsWrite: boolean;
  tasksRead: boolean;
  tasksWrite: boolean;
  scheduledMessagesRead: boolean;
  scheduledMessagesWrite: boolean;
  miniAppsRead: boolean;
  miniAppsWrite: boolean;
  socialPublisherRead: boolean;
  socialPublisherWrite: boolean;
  formBuilderRead: boolean;
  formBuilderWrite: boolean;
  hostingerRead: boolean;
  hostingerWrite: boolean;
  metaAdsRead: boolean;
  metaAdsWrite: boolean;
  documentsRead: boolean;
  documentsWrite: boolean;
  filesRead: boolean;
  sitesRead: boolean;
  sitesWrite: boolean;
  financeRead: boolean;
  financeWrite: boolean;
  purchasesRead: boolean;
  purchasesWrite: boolean;
  hrRead: boolean;
  hrWrite: boolean;
  supportRead: boolean;
  supportWrite: boolean;
  contractsRead: boolean;
  contractsWrite: boolean;
  intelligenceRead: boolean;
  intelligenceWrite: boolean;
  // Leer y enviar conversaciones no tenían permiso propio: la lectura se
  // gobernaba sólo por chatVisibility y el envío por nada. Que el envío cuelgue
  // de `contacts` significaría que quien puede etiquetar puede escribirle al
  // cliente, y eso después no se saca sin romperle el acceso a alguien.
  messagesRead: boolean;
  messagesSend: boolean;
  chatVisibility: ChatVisibility;
};

export const ROLE_PRESETS: Record<TeamRole, MemberPermissions> = {
  owner: {
    automation: true,
    aiAgent: true,
    contacts: true,
    drafts: true,
    templates: true,
    campaigns: true,
    settings: true,
    notesRead: true,
    notesWrite: true,
    calendarRead: true,
    calendarWrite: true,
    domainsRead: true,
    domainsWrite: true,
    articlesRead: true,
    articlesWrite: true,
    salesRead: true,
    salesWrite: true,
    dealsRead: true,
    dealsWrite: true,
    salesOpsRead: true,
    salesOpsWrite: true,
    empresaRead: true,
    empresaWrite: true,
    marketingRead: true,
    marketingWrite: true,
    iaRead: true,
    iaWrite: true,
    customersRead: true,
    customersWrite: true,
    aappSpaceRead: true,
    aappSpaceWrite: true,
    membershipsRead: true,
    membershipsWrite: true,
    tasksRead: true,
    tasksWrite: true,
    scheduledMessagesRead: true,
    scheduledMessagesWrite: true,
    miniAppsRead: true,
    miniAppsWrite: true,
    socialPublisherRead: true,
    socialPublisherWrite: true,
    formBuilderRead: true,
    formBuilderWrite: true,
    hostingerRead: true,
    hostingerWrite: true,
    metaAdsRead: true,
    metaAdsWrite: true,
    documentsRead: true,
    documentsWrite: true,
    filesRead: true,
    sitesRead: true,
    sitesWrite: true,
    financeRead: true,
    financeWrite: true,
    purchasesRead: true,
    purchasesWrite: true,
    hrRead: true,
    hrWrite: true,
    supportRead: true,
    supportWrite: true,
    contractsRead: true,
    contractsWrite: true,
    intelligenceRead: true,
    intelligenceWrite: true,
    messagesRead: true,
    messagesSend: true,
    chatVisibility: 'all',
  },
  admin: {
    automation: true,
    aiAgent: true,
    contacts: true,
    drafts: true,
    templates: true,
    campaigns: true,
    settings: false,
    notesRead: true,
    notesWrite: true,
    calendarRead: true,
    calendarWrite: true,
    domainsRead: true,
    domainsWrite: true,
    articlesRead: true,
    articlesWrite: true,
    salesRead: true,
    salesWrite: true,
    dealsRead: true,
    dealsWrite: true,
    salesOpsRead: true,
    salesOpsWrite: true,
    empresaRead: true,
    empresaWrite: true,
    marketingRead: true,
    marketingWrite: true,
    iaRead: true,
    iaWrite: true,
    customersRead: true,
    customersWrite: true,
    aappSpaceRead: true,
    aappSpaceWrite: true,
    membershipsRead: true,
    membershipsWrite: true,
    tasksRead: true,
    tasksWrite: true,
    scheduledMessagesRead: true,
    scheduledMessagesWrite: true,
    miniAppsRead: true,
    miniAppsWrite: true,
    socialPublisherRead: true,
    socialPublisherWrite: true,
    formBuilderRead: true,
    formBuilderWrite: true,
    hostingerRead: true,
    hostingerWrite: true,
    metaAdsRead: true,
    metaAdsWrite: true,
    documentsRead: true,
    documentsWrite: true,
    filesRead: true,
    sitesRead: true,
    sitesWrite: true,
    financeRead: true,
    financeWrite: true,
    purchasesRead: true,
    purchasesWrite: true,
    hrRead: true,
    hrWrite: true,
    supportRead: true,
    supportWrite: true,
    contractsRead: true,
    contractsWrite: true,
    intelligenceRead: true,
    intelligenceWrite: true,
    messagesRead: true,
    messagesSend: true,
    chatVisibility: 'all',
  },
  agent: {
    automation: false,
    aiAgent: false,
    contacts: false,
    drafts: false,
    templates: false,
    campaigns: false,
    settings: false,
    notesRead: false,
    notesWrite: false,
    calendarRead: false,
    calendarWrite: false,
    domainsRead: false,
    domainsWrite: false,
    articlesRead: false,
    articlesWrite: false,
    salesRead: false,
    salesWrite: false,
    dealsRead: false,
    dealsWrite: false,
    salesOpsRead: false,
    salesOpsWrite: false,
    empresaRead: false,
    empresaWrite: false,
    marketingRead: false,
    marketingWrite: false,
    iaRead: false,
    iaWrite: false,
    customersRead: false,
    customersWrite: false,
    aappSpaceRead: false,
    aappSpaceWrite: false,
    membershipsRead: false,
    membershipsWrite: false,
    tasksRead: true,
    tasksWrite: true,
    scheduledMessagesRead: false,
    scheduledMessagesWrite: false,
    miniAppsRead: false,
    miniAppsWrite: false,
    socialPublisherRead: false,
    socialPublisherWrite: false,
    formBuilderRead: false,
    formBuilderWrite: false,
    hostingerRead: false,
    hostingerWrite: false,
    metaAdsRead: false,
    metaAdsWrite: false,
    documentsRead: true,
    documentsWrite: true,
    filesRead: false,
    sitesRead: false,
    sitesWrite: false,
    financeRead: false,
    financeWrite: false,
    purchasesRead: false,
    purchasesWrite: false,
    hrRead: false,
    hrWrite: false,
    supportRead: true,
    supportWrite: true,
    contractsRead: false,
    contractsWrite: false,
    intelligenceRead: false,
    intelligenceWrite: false,
    messagesRead: true,
    messagesSend: true,
    chatVisibility: 'assigned',
  },
};

export function getPermissions(role: string, customPermissions?: MemberPermissions | null): MemberPermissions {
  if (role === 'owner') return ROLE_PRESETS.owner;
  const preset = ROLE_PRESETS[role as TeamRole] || ROLE_PRESETS.agent;
  // Los permisos guardados son un JSON viejo: cuando se agrega una clave nueva
  // no está en la fila del miembro. Sin este merge, cada clave nueva nacería en
  // `undefined` (o sea, denegada) para todos los que ya tenían permisos
  // personalizados, incluidos los admins.
  if (customPermissions) return { ...preset, ...customPermissions };
  return preset;
}

export function hasPermission(
  role: string,
  permissions: MemberPermissions | null | undefined,
  resource: keyof Omit<MemberPermissions, 'chatVisibility'>
): boolean {
  if (role === 'owner') return true;
  const perms = getPermissions(role, permissions);
  return perms[resource] === true;
}

export function canSeeAllChats(role: string, permissions: MemberPermissions | null | undefined): boolean {
  if (role === 'owner') return true;
  const perms = getPermissions(role, permissions);
  return perms.chatVisibility === 'all';
}

export function getChatVisibility(role: string, permissions: MemberPermissions | null | undefined): ChatVisibility {
  if (role === 'owner') return 'all';
  const perms = getPermissions(role, permissions);
  return perms.chatVisibility;
}

export type PermissionResource = keyof Omit<MemberPermissions, 'chatVisibility'>;

export const ROUTE_PERMISSIONS: Record<string, PermissionResource> = {
  '/automation': 'automation',
  '/settings/ai': 'aiAgent',
  '/contacts': 'contacts',
  '/drafts': 'drafts',
  '/templates': 'templates',
  '/campaigns': 'campaigns',
  '/plugins/notes': 'notesRead',
  '/plugins/calendar': 'calendarRead',
  '/plugins/domains': 'domainsRead',
  '/plugins/articles': 'articlesRead',
  '/plugins/sales': 'salesRead',
  '/plugins/customers': 'customersRead',
  '/plugins/aapp-space': 'aappSpaceRead',
  '/plugins/memberships': 'membershipsRead',
  '/plugins/tasks': 'tasksRead',
  '/escritorio': 'tasksRead',
  '/plugins/scheduled-messages': 'scheduledMessagesRead',
  '/plugins/mini-apps': 'miniAppsRead',
  '/plugins/social-publisher': 'socialPublisherRead',
  '/plugins/form-builder': 'formBuilderRead',
  '/plugins/hostinger': 'hostingerRead',
  '/plugins/meta-ads': 'metaAdsRead',
  '/plugins/documents': 'documentsRead',
  '/plugins/files': 'filesRead',
  '/plugins/sites': 'sitesRead',
  '/plugins/finance': 'financeRead',
  '/plugins/purchases': 'purchasesRead',
  '/plugins/hr': 'hrRead',
  '/plugins/support': 'supportRead',
  '/plugins/contracts': 'contractsRead',
  '/plugins/intelligence': 'intelligenceRead',
  '/settings': 'settings',
};
