import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  formBuilderForms,
  formBuilderSubmissions,
  hostingerAccounts,
  metaAdAccounts,
  metaCampaignInsightsDaily,
  metaCampaigns,
  miniAppRecords,
  teamCustomers,
  teamDocuments,
  teamDomains,
  teamMembershipSubscriptions,
  teamNotes,
  teamSales,
  teamScheduledMessages,
  teamTaskColumns,
  teamTaskItems,
  teamTaskProjects,
  teams,
  users,
} from '@/lib/db/schema';
import type { PermissionContext } from '@/lib/auth/permissions-guard';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { computeKpis, pipelineBreakdown, type DesktopPeriod } from './kpis';
import { listActivity } from './activity';
import { revenueTrend } from './trend';
import { listDeals } from '@/lib/deals/service';
import { getDesktopLayout } from './preferences';
import { chatScope } from './scope';
import type { DesktopApp, DesktopNowItem, DesktopOverview, DesktopSearchResult } from './types';

const pluginPermissions: Record<string, keyof PermissionContext['permissions']> = {
  notes: 'notesRead', calendar: 'calendarRead', domains: 'domainsRead', articles: 'articlesRead',
  sales: 'salesRead', deals: 'dealsRead', customers: 'customersRead', 'aapp-space': 'aappSpaceRead', memberships: 'membershipsRead',
  tasks: 'tasksRead', 'scheduled-messages': 'scheduledMessagesRead', 'mini-apps': 'miniAppsRead',
  'social-publisher': 'socialPublisherRead', 'form-builder': 'formBuilderRead', hostinger: 'hostingerRead',
  'meta-ads': 'metaAdsRead', documents: 'documentsRead',
};

const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null;
const numeric = (value: unknown) => Number(value ?? 0);

function isPluginAllowed(ctx: PermissionContext, pluginId: string) {
  const permission = pluginPermissions[pluginId];
  return !permission || ctx.role === 'owner' || ctx.permissions[permission] === true;
}


export async function getDesktopOverview(ctx: PermissionContext): Promise<DesktopOverview> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const active = (await resolveActivePluginsForTeam(ctx.teamId, ctx.userId)).filter((item) => isPluginAllowed(ctx, item.pluginId));
  const activeIds = new Set(active.map((item) => item.pluginId));
  const apps: DesktopApp[] = active.map(({ pluginId, manifest }) => ({
    id: pluginId,
    name: manifest.displayName,
    href: manifest.navItems.find((item) => item.href.startsWith('/'))?.href ?? manifest.routes[0]?.path ?? '/apps',
    icon: manifest.navItems[0]?.icon,
  })).sort((a, b) => a.name.localeCompare(b.name));

  const scope = await chatScope(ctx);
  const canTasks = activeIds.has('tasks') && ctx.permissions.tasksRead;
  const canCustomers = activeIds.has('customers') && ctx.permissions.customersRead;
  const canMemberships = activeIds.has('memberships') && ctx.permissions.membershipsRead;
  const canDomains = activeIds.has('domains') && ctx.permissions.domainsRead;
  const canSales = activeIds.has('sales') && ctx.permissions.salesRead;
  // El widget de embudo se apaga solo si falta el permiso: devuelve ceros, no un
  // 403. Un agente con permisos acotados tiene que ver su Escritorio igual.
  const canDeals = activeIds.has('deals') && ctx.permissions.dealsRead;
  const canMeta = activeIds.has('meta-ads') && ctx.permissions.metaAdsRead;
  const canHostinger = activeIds.has('hostinger') && ctx.permissions.hostingerRead;
  const canDocs = activeIds.has('documents') && ctx.permissions.documentsRead;
  const canNotes = activeIds.has('notes') && ctx.permissions.notesRead;
  const canForms = activeIds.has('form-builder') && ctx.permissions.formBuilderRead;
  const canMiniApps = activeIds.has('mini-apps') && ctx.permissions.miniAppsRead;
  const canScheduled = activeIds.has('scheduled-messages') && ctx.permissions.scheduledMessagesRead;

  const [userRow, layout, taskCounts, taskRows, taskTargetRows, chatCount, chatRows, customerCount, customerRows,
    membershipRows, domainRows, salesRows, metaRows, metaAccountsRows, metaCampaignRows, hostingerRows,
    documentRows, documentCount, notesCount, formCount, submissionCount, personalRows, scheduledRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, teamName: teams.name }).from(users)
      .innerJoin(teams, eq(teams.id, ctx.teamId)).where(eq(users.id, ctx.userId)).limit(1),
    getDesktopLayout(ctx.teamId, ctx.userId),
    canTasks ? db.select({ total: count(), overdue: sql<number>`count(*) filter (where ${teamTaskItems.dueDate} < now())` })
      .from(teamTaskItems).where(and(eq(teamTaskItems.teamId, ctx.teamId), ne(teamTaskItems.status, 'done'))) : Promise.resolve([{ total: 0, overdue: 0 }]),
    canTasks ? db.select({ id: teamTaskItems.id, title: teamTaskItems.title, dueAt: teamTaskItems.dueDate, project: teamTaskProjects.name, column: teamTaskColumns.title })
      .from(teamTaskItems).innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItems.projectId))
      .innerJoin(teamTaskColumns, eq(teamTaskColumns.id, teamTaskItems.columnId))
      .where(and(eq(teamTaskItems.teamId, ctx.teamId), ne(teamTaskItems.status, 'done')))
      .orderBy(sql`${teamTaskItems.dueDate} asc nulls last`, desc(teamTaskItems.updatedAt)).limit(8) : Promise.resolve([]),
    canTasks ? db.select({ columnId: teamTaskColumns.id, projectName: teamTaskProjects.name }).from(teamTaskColumns)
      .innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskColumns.projectId))
      .where(eq(teamTaskColumns.teamId, ctx.teamId)).orderBy(asc(teamTaskProjects.order), asc(teamTaskColumns.order)).limit(1) : Promise.resolve([]),
    db.select({ total: sql<number>`coalesce(sum(${chats.unreadCount}), 0)` }).from(chats).leftJoin(contacts, eq(contacts.chatId, chats.id)).where(scope),
    db.select({ id: chats.id, name: sql<string>`coalesce(${contacts.name}, ${chats.name}, ${chats.pushName}, ${chats.remoteJid})`, preview: chats.lastMessageText, unread: chats.unreadCount, at: chats.lastMessageTimestamp, remoteJid: chats.remoteJid })
      .from(chats).leftJoin(contacts, eq(contacts.chatId, chats.id)).where(scope).orderBy(desc(chats.lastMessageTimestamp)).limit(6),
    canCustomers ? db.select({ total: count() }).from(teamCustomers).where(eq(teamCustomers.teamId, ctx.teamId)) : Promise.resolve([{ total: 0 }]),
    canCustomers ? db.select({ id: teamCustomers.id, name: teamCustomers.name, status: teamCustomers.status, source: teamCustomers.source, updatedAt: teamCustomers.updatedAt })
      .from(teamCustomers).where(eq(teamCustomers.teamId, ctx.teamId)).orderBy(desc(teamCustomers.updatedAt)).limit(5) : Promise.resolve([]),
    canMemberships ? db.select({ status: teamMembershipSubscriptions.status, paymentStatus: teamMembershipSubscriptions.paymentStatus, endDate: teamMembershipSubscriptions.endDate })
      .from(teamMembershipSubscriptions).where(eq(teamMembershipSubscriptions.teamId, ctx.teamId)) : Promise.resolve([]),
    canDomains ? db.select({ id: teamDomains.id, name: teamDomains.name, expiresAt: teamDomains.expiresAt, autoRenew: teamDomains.autoRenew, status: teamDomains.status })
      .from(teamDomains).where(eq(teamDomains.teamId, ctx.teamId)) : Promise.resolve([]),
    canSales ? db.select({ status: teamSales.status, total: teamSales.total, currency: teamSales.currency, createdAt: teamSales.createdAt })
      .from(teamSales).where(eq(teamSales.teamId, ctx.teamId)) : Promise.resolve([]),
    canMeta ? db.select({ spend: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.spend}), 0)`, results: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.results}), 0)`, clicks: sql<number>`coalesce(sum(${metaCampaignInsightsDaily.clicks}), 0)`, currency: sql<string>`coalesce(max(${metaCampaignInsightsDaily.currency}), 'USD')` })
      .from(metaCampaignInsightsDaily).where(and(eq(metaCampaignInsightsDaily.teamId, ctx.teamId), gte(metaCampaignInsightsDaily.date, thirtyDaysAgo.toISOString().slice(0, 10)))) : Promise.resolve([{ spend: '0', results: '0', clicks: 0, currency: 'USD' }]),
    canMeta ? db.select({ total: count() }).from(metaAdAccounts).where(eq(metaAdAccounts.teamId, ctx.teamId)) : Promise.resolve([{ total: 0 }]),
    canMeta ? db.select({ total: count() }).from(metaCampaigns).where(and(eq(metaCampaigns.teamId, ctx.teamId), or(eq(metaCampaigns.status, 'ACTIVE'), eq(metaCampaigns.effectiveStatus, 'ACTIVE')))) : Promise.resolve([{ total: 0 }]),
    canHostinger ? db.select({ status: hostingerAccounts.status, lastError: hostingerAccounts.lastError, lastSyncedAt: hostingerAccounts.lastSyncedAt })
      .from(hostingerAccounts).where(eq(hostingerAccounts.teamId, ctx.teamId)) : Promise.resolve([]),
    canDocs ? db.select({ id: teamDocuments.id, title: teamDocuments.title, updatedAt: teamDocuments.updatedAt }).from(teamDocuments)
      .where(eq(teamDocuments.teamId, ctx.teamId)).orderBy(desc(teamDocuments.updatedAt)).limit(4) : Promise.resolve([]),
    canDocs ? db.select({ total: count() }).from(teamDocuments).where(eq(teamDocuments.teamId, ctx.teamId)) : Promise.resolve([{ total: 0 }]),
    canNotes ? db.select({ total: count() }).from(teamNotes).where(eq(teamNotes.teamId, ctx.teamId)) : Promise.resolve([{ total: 0 }]),
    canForms ? db.select({ total: count() }).from(formBuilderForms).where(eq(formBuilderForms.teamId, ctx.teamId)) : Promise.resolve([{ total: 0 }]),
    canForms ? db.select({ total: count() }).from(formBuilderSubmissions).where(eq(formBuilderSubmissions.teamId, ctx.teamId)) : Promise.resolve([{ total: 0 }]),
    canMiniApps ? db.select({ recordId: miniAppRecords.recordId, collection: miniAppRecords.collection, data: miniAppRecords.data }).from(miniAppRecords)
      .where(and(eq(miniAppRecords.teamId, ctx.teamId), eq(miniAppRecords.appSlug, 'business-woman-planner'), inArray(miniAppRecords.collection, ['agenda', 'home', 'growth', 'links', 'videos']))) : Promise.resolve([]),
    canScheduled ? db.select({ id: teamScheduledMessages.id, name: teamScheduledMessages.name, nextRunAt: teamScheduledMessages.nextRunAt })
      .from(teamScheduledMessages).where(and(eq(teamScheduledMessages.teamId, ctx.teamId), eq(teamScheduledMessages.status, 'active'), isNotNull(teamScheduledMessages.nextRunAt), lte(teamScheduledMessages.nextRunAt, in30Days)))
      .orderBy(asc(teamScheduledMessages.nextRunAt)).limit(4) : Promise.resolve([]),
  ]);

  const memberships = {
    active: membershipRows.filter((row) => row.status === 'active').length,
    pending: membershipRows.filter((row) => row.status === 'pending' || row.paymentStatus === 'pending').length,
    overdue: membershipRows.filter((row) => row.paymentStatus === 'overdue').length,
    expiring: membershipRows.filter((row) => row.endDate && new Date(row.endDate) <= in30Days && new Date(row.endDate) >= now).length,
  };
  const expiringDomains = domainRows.filter((row) => row.expiresAt && row.expiresAt <= in30Days && row.expiresAt >= now);
  const agenda = personalRows.filter((row) => row.collection === 'agenda').map((row) => {
    const data = row.data as Record<string, unknown>;
    return { id: row.recordId, title: String(data.task ?? ''), date: data.time ? String(data.time) : null, status: data.done ? 'done' : 'pending' };
  }).filter((item) => item.title && item.status !== 'done').slice(0, 5);
  const nowItems: DesktopNowItem[] = [
    ...taskRows.filter((row) => row.dueAt).slice(0, 5).map((row) => ({ id: `task-${row.id}`, kind: 'task' as const, title: row.title, detail: `${row.project} · ${row.column}`, href: '/plugins/tasks', at: iso(row.dueAt), urgent: !!row.dueAt && row.dueAt < now, action: ctx.permissions.tasksWrite ? { type: 'complete-task' as const, id: row.id } : undefined })),
    ...agenda.slice(0, 3).map((item) => ({ id: `agenda-${item.id}`, kind: 'agenda' as const, title: item.title, detail: item.date ?? 'Business Woman', href: '/plugins/mini-apps/business-woman-planner', at: null, urgent: false })),
    ...chatRows.filter((row) => numeric(row.unread) > 0).slice(0, 3).map((row) => ({ id: `chat-${row.id}`, kind: 'chat' as const, title: row.name, detail: `${numeric(row.unread)} sin leer`, href: `/dashboard/chat/${encodeURIComponent(row.remoteJid)}`, at: iso(row.at), urgent: numeric(row.unread) >= 5, action: { type: 'mark-chat-read' as const, id: row.id } })),
    ...expiringDomains.slice(0, 2).map((row) => ({ id: `domain-${row.id}`, kind: 'domain' as const, title: row.name, detail: 'Dominio próximo a vencer', href: '/plugins/domains', at: iso(row.expiresAt), urgent: !!row.expiresAt && row.expiresAt <= new Date(now.getTime() + 7 * 86400000) })),
    ...scheduledRows.slice(0, 2).map((row) => ({ id: `scheduled-${row.id}`, kind: 'scheduled' as const, title: row.name, detail: 'Mensaje programado', href: '/plugins/scheduled-messages', at: iso(row.nextRunAt), urgent: false })),
  ].sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.at ?? '9999').localeCompare(b.at ?? '9999')).slice(0, 10);

  const meta = metaRows[0];
  const paidSales = salesRows.filter((row) => row.status === 'paid' || row.status === 'completed');
  const pendingSales = salesRows.filter((row) => row.status !== 'paid' && row.status !== 'completed' && row.status !== 'cancelled');
  const currency = salesRows[0]?.currency ?? 'USD';
  const currentUser = userRow[0];

  // ── Bloques del rediseño ────────────────────────────────────────────────────
  // Cada uno se apaga por permiso y devuelve su forma vacía, nunca un 403 que
  // dejaría el Escritorio entero en blanco.
  const period = layout.period as DesktopPeriod;
  const [kpis, pipeline, dealRows, activity] = await Promise.all([
    computeKpis(ctx.teamId, period, { sales: canSales, deals: canDeals, contacts: ctx.permissions.contacts }, currency),
    canDeals ? pipelineBreakdown(ctx.teamId) : Promise.resolve([]),
    canDeals ? listDeals(ctx.teamId, { open: true, limit: 4 }) : Promise.resolve([]),
    listActivity(ctx.teamId, 5),
  ]);
  const trend = canSales ? await revenueTrend(ctx.teamId, 6) : [];

  const topDeals = [...dealRows]
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map((deal) => ({
      id: deal.id,
      title: deal.title,
      company: deal.customerName ?? deal.contactName ?? '',
      value: deal.value,
      currency: deal.currency,
      stage: deal.stage,
      probability: deal.probability,
      href: `/plugins/deals/${deal.id}`,
    }));

  // Los próximos compromisos salen de lo que ya se calculó arriba: tareas con
  // vencimiento y agenda. No hace falta otra consulta.
  const upcoming = [
    ...taskRows
      .filter((row) => row.dueAt)
      .slice(0, 5)
      .map((row) => ({
        id: `task-${row.id}`,
        title: row.title,
        kind: 'task' as const,
        at: iso(row.dueAt),
        priority: row.dueAt && row.dueAt < now ? 'high' : 'medium',
        href: '/plugins/tasks',
      })),
    ...agenda.slice(0, 3).map((item) => {
      const parsed = item.date ? new Date(item.date) : null;
      const isDate = parsed != null && Number.isFinite(parsed.getTime());
      return {
      id: `agenda-${item.id}`,
      // Si la agenda guardó una hora suelta en vez de una fecha, se antepone al
      // título en vez de tirarla: "10:10 · Descargar productos…".
      title: !isDate && item.date ? `${item.date} · ${item.title}` : item.title,
      kind: 'meeting' as const,
      // La agenda de la mini-app guarda horas sueltas ("10:10"), no fechas. El
      // contrato de `upcoming.at` es ISO o null, así que lo que no parsea sale
      // como null y el texto queda en `detail` del propio ítem.
      at: isDate ? parsed.toISOString() : null,
      priority: 'medium',
      href: '/plugins/mini-apps/business-woman-planner',
      };
    }),
  ]
    .sort((a, b) => (a.at ?? '9999').localeCompare(b.at ?? '9999'))
    .slice(0, 6);

  if (personalRows.length > 0 && !apps.some((app) => app.id === 'business-woman-planner')) {
    apps.push({ id: 'business-woman-planner', name: 'Business Woman', href: '/plugins/mini-apps/business-woman-planner', icon: 'BriefcaseBusiness' });
    apps.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    generatedAt: now.toISOString(),
    user: { id: currentUser?.id ?? ctx.userId, name: currentUser?.name ?? currentUser?.email?.split('@')[0] ?? 'Usuario', email: currentUser?.email ?? '', teamName: currentUser?.teamName ?? '' },
    permissions: {
      tasksWrite: ctx.permissions.tasksWrite,
      contacts: ctx.permissions.contacts,
      dealsRead: canDeals,
      dealsWrite: canDeals && ctx.permissions.dealsWrite,
      salesRead: canSales,
    },
    layout,
    apps,
    summary: { openTasks: numeric(taskCounts[0]?.total), overdueTasks: numeric(taskCounts[0]?.overdue), unreadChats: numeric(chatCount[0]?.total), customers: numeric(customerCount[0]?.total), activeMemberships: memberships.active, expiringDomains: expiringDomains.length, metaSpend30d: numeric(meta.spend), metaResults30d: numeric(meta.results), metaCurrency: meta.currency ?? 'USD' },
    now: nowItems,
    taskTarget: taskTargetRows[0] ?? null,
    tasks: taskRows.map((row) => ({ id: row.id, title: row.title, project: row.project, column: row.column, dueAt: iso(row.dueAt), overdue: !!row.dueAt && row.dueAt < now })),
    conversations: chatRows.map((row) => ({ id: row.id, name: row.name, preview: row.preview ?? '', unread: numeric(row.unread), at: iso(row.at), href: `/dashboard/chat/${encodeURIComponent(row.remoteJid)}` })),
    customers: customerRows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    memberships,
    revenue: { paid: paidSales.reduce((sum, row) => sum + row.total, 0), pending: pendingSales.reduce((sum, row) => sum + row.total, 0), currency, recentSales: salesRows.filter((row) => row.createdAt >= thirtyDaysAgo).length },
    marketing: { accounts: numeric(metaAccountsRows[0]?.total), activeCampaigns: numeric(metaCampaignRows[0]?.total), spend: numeric(meta.spend), results: numeric(meta.results), clicks: numeric(meta.clicks), currency: meta.currency ?? 'USD' },
    infrastructure: { domains: domainRows.length, expiring: expiringDomains.length, autoRenew: domainRows.filter((row) => row.autoRenew).length, hostingerAccounts: hostingerRows.length, hostingerErrors: hostingerRows.filter((row) => row.status === 'error' || row.lastError).length, lastSync: iso(hostingerRows.map((row) => row.lastSyncedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0]) },
    knowledge: { documents: numeric(documentCount[0]?.total), notes: numeric(notesCount[0]?.total), forms: numeric(formCount[0]?.total), submissions: numeric(submissionCount[0]?.total), recentDocuments: documentRows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })) },
    businessWoman: { agenda, home: personalRows.filter((row) => row.collection === 'home').length, growth: personalRows.filter((row) => row.collection === 'growth').length, links: personalRows.filter((row) => row.collection === 'links').length, videos: personalRows.filter((row) => row.collection === 'videos').length },
    period,
    kpis,
    revenueTrend: trend,
    pipeline,
    topDeals,
    activity,
    upcoming,
  };
}

export async function searchDesktop(ctx: PermissionContext, rawQuery: string): Promise<DesktopSearchResult[]> {
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return [];
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const scope = await chatScope(ctx);
  const [tasks, conversations, contactRows, customers, documents, notes, domains, personal] = await Promise.all([
    ctx.permissions.tasksRead ? db.select({ id: teamTaskItems.id, title: teamTaskItems.title, project: teamTaskProjects.name }).from(teamTaskItems).innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItems.projectId)).where(and(eq(teamTaskItems.teamId, ctx.teamId), ilike(teamTaskItems.title, pattern))).limit(5) : [],
    db.select({ id: chats.id, title: sql<string>`coalesce(${contacts.name}, ${chats.name}, ${chats.remoteJid})`, subtitle: chats.lastMessageText, remoteJid: chats.remoteJid }).from(chats).leftJoin(contacts, eq(contacts.chatId, chats.id)).where(and(scope, or(ilike(contacts.name, pattern), ilike(chats.name, pattern), ilike(chats.remoteJid, pattern)))).limit(5),
    ctx.permissions.contacts ? db.select({ id: contacts.id, title: contacts.name }).from(contacts).where(and(eq(contacts.teamId, ctx.teamId), ilike(contacts.name, pattern))).limit(5) : [],
    ctx.permissions.customersRead ? db.select({ id: teamCustomers.id, title: teamCustomers.name, subtitle: teamCustomers.email }).from(teamCustomers).where(and(eq(teamCustomers.teamId, ctx.teamId), or(ilike(teamCustomers.name, pattern), ilike(teamCustomers.email, pattern)))).limit(5) : [],
    ctx.permissions.documentsRead ? db.select({ id: teamDocuments.id, title: teamDocuments.title }).from(teamDocuments).where(and(eq(teamDocuments.teamId, ctx.teamId), or(ilike(teamDocuments.title, pattern), ilike(teamDocuments.contentText, pattern)))).limit(5) : [],
    ctx.permissions.notesRead ? db.select({ id: teamNotes.id, title: teamNotes.title }).from(teamNotes).where(and(eq(teamNotes.teamId, ctx.teamId), or(ilike(teamNotes.title, pattern), ilike(teamNotes.content, pattern)))).limit(5) : [],
    ctx.permissions.domainsRead ? db.select({ id: teamDomains.id, title: teamDomains.name, subtitle: teamDomains.registrar }).from(teamDomains).where(and(eq(teamDomains.teamId, ctx.teamId), ilike(teamDomains.name, pattern))).limit(5) : [],
    ctx.permissions.miniAppsRead ? db.select({ id: miniAppRecords.recordId, collection: miniAppRecords.collection, data: miniAppRecords.data }).from(miniAppRecords).where(and(eq(miniAppRecords.teamId, ctx.teamId), eq(miniAppRecords.appSlug, 'business-woman-planner'), inArray(miniAppRecords.collection, ['agenda', 'home', 'growth', 'links', 'videos']), sql`${miniAppRecords.data}::text ilike ${pattern}`)).limit(5) : [],
  ]);
  return [
    ...tasks.map((row) => ({ id: `task-${row.id}`, type: 'task' as const, title: row.title, subtitle: row.project, href: '/plugins/tasks' })),
    ...conversations.map((row) => ({ id: `chat-${row.id}`, type: 'conversation' as const, title: row.title, subtitle: row.subtitle ?? '', href: `/dashboard/chat/${encodeURIComponent(row.remoteJid)}` })),
    ...contactRows.map((row) => ({ id: `contact-${row.id}`, type: 'contact' as const, title: row.title, subtitle: 'Contacto', href: '/todosloscontactos' })),
    ...customers.map((row) => ({ id: `customer-${row.id}`, type: 'customer' as const, title: row.title, subtitle: row.subtitle ?? 'Cliente', href: '/plugins/customers' })),
    ...documents.map((row) => ({ id: `document-${row.id}`, type: 'document' as const, title: row.title, subtitle: 'Documento', href: `/plugins/documents/doc/${row.id}` })),
    ...notes.map((row) => ({ id: `note-${row.id}`, type: 'note' as const, title: row.title, subtitle: 'Nota', href: '/plugins/notes' })),
    ...domains.map((row) => ({ id: `domain-${row.id}`, type: 'domain' as const, title: row.title, subtitle: row.subtitle ?? 'Dominio', href: '/plugins/domains' })),
    ...personal.map((row) => { const data = row.data as Record<string, unknown>; return { id: `personal-${row.id}`, type: 'personal' as const, title: String(data.task ?? data.title ?? data.name ?? row.collection), subtitle: `Business Woman · ${row.collection}`, href: '/plugins/mini-apps/business-woman-planner' }; }),
  ].slice(0, 24);
}
