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
    chatVisibility: 'assigned',
  },
};

export function getPermissions(role: string, customPermissions?: MemberPermissions | null): MemberPermissions {
  if (role === 'owner') return ROLE_PRESETS.owner;
  if (customPermissions) return customPermissions;
  return ROLE_PRESETS[role as TeamRole] || ROLE_PRESETS.agent;
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
  '/settings': 'settings',
};
