import 'server-only';

import { and, desc, eq, getTableColumns, gte, ilike, like, lte, or, SQL, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  aiConfigs,
  aiSessions,
  aiTools,
  apiKeys,
  automationFolders,
  automationSessions,
  automationTemplates,
  automations,
  campaignLeads,
  campaigns,
  chats,
  contactTags,
  contacts,
  customFields,
  dashboardBookmarkGroups,
  dashboardBookmarkItems,
  departmentMembers,
  departments,
  evolutionInstances,
  featureRequests,
  featureRequestVotes,
  formBuilderForms,
  formBuilderSubmissions,
  funnelStageGroupMembers,
  funnelStageGroups,
  funnelStages,
  hostingerAccounts,
  invitations,
  manualPayments,
  marketplaceOrderLines,
  marketplaceOrderStatusEvents,
  marketplaceOrders,
  messageDraftCategories,
  messageDraftTagLinks,
  messageDraftTags,
  messageDrafts,
  messageReactions,
  messageAudioInsights,
  messages,
  metaAdAccounts,
  metaAdsSyncRuns,
  metaAdsTokens,
  metaCampaignInsightsDaily,
  metaCampaigns,
  miniAppInstalls,
  miniAppRecords,
  paymentAuditEvents,
  pluginSystemStates,
  quickReplies,
  readOnlyApiTokens,
  socialAccounts,
  socialPosts,
  socialPostTargets,
  tags,
  teamAappConnections,
  teamAappRenewalCandidates,
  teamAappRenewalConfigs,
  teamAppMakerAttachments,
  teamAppMakerRecordLinks,
  teamAppMakerRecords,
  teamArticleAttributes,
  teamArticleCustomFields,
  teamArticlePlans,
  teamArticles,
  teamArticleTypes,
  teamArticleVariations,
  teamCustomerContacts,
  teamCustomerNotes,
  teamCustomers,
  teamCustomerStores,
  teamCustomerTransactions,
  teamDesktopPreferences,
  teamDocumentFolders,
  teamDocumentLinks,
  teamDocumentMedia,
  teamDocuments,
  teamBudgets,
  teamCostCenters,
  teamDomains,
  teamEventParticipants,
  teamEvents,
  teamExchangeRates,
  teamFinancialAccounts,
  teamFinancialEntries,
  teamFinancialEntryPayments,
  teamFinancialReceipts,
  teamMarketplaceEntitlements,
  teamMemberPlugins,
  teamMembers,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipReminderRules,
  teamMembershipSubscriptions,
  teamNotes,
  teamNotifications,
  teamPlugins,
  teamCommissionRules,
  teamContracts,
  teamEmployeeProfiles,
  teamMenuItems,
  teamPurchaseOrderItems,
  teamPurchaseOrders,
  teamRadarApps,
  teamRadarInsights,
  teamRadarReports,
  teamRadarWidgets,
  teamSaleCommissions,
  teamSales,
  teamDeals,
  teamScheduledMessages,
  teamSiteFiles,
  teamSites,
  teamSupportTicketComments,
  teamSupportTickets,
  teamTaskAiRuns,
  teamTaskColumns,
  teamTaskComments,
  teamTaskDependencies,
  teamTaskItemLocations,
  teamTaskItems,
  teamTaskMedia,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskTemplates,
  teamTaskWorkspaces,
  teamVendors,
  teams,
  users,
  conversationAiSummaries,
  wabaTemplates,
  webhookEvents,
} from '@/lib/db/schema';
import { getRegisteredPlugins } from '@/lib/plugins/core/registry';

export type ResourceCategory = 'core' | 'crm' | 'communication' | 'automation' | 'operations' | 'plugins' | 'commerce' | 'content' | 'intelligence';

type TableLike = Parameters<typeof getTableColumns>[0];
type ColumnLike = ReturnType<typeof getTableColumns>[string];

export type ReadOnlyResource = {
  key: string;
  title: string;
  description: string;
  category: ResourceCategory;
  table: TableLike;
  idColumn: ColumnLike;
  scope: (teamId: number) => SQL;
  excluded: string[];
  filters: string[];
  search: string[];
  orderColumn: ColumnLike;
  itemLookup: boolean;
};

type ResourceOptions = {
  excluded?: string[];
  filters?: string[];
  search?: string[];
  orderBy?: string;
  id?: string;
  itemLookup?: boolean;
};

function defineResource(
  key: string,
  category: ResourceCategory,
  title: string,
  description: string,
  table: TableLike,
  scope: (teamId: number) => SQL,
  options: ResourceOptions = {},
): ReadOnlyResource {
  const columns = getTableColumns(table);
  const idColumn = columns[options.id || 'id'];
  const orderColumn = columns[options.orderBy || 'updatedAt'] || columns.createdAt || idColumn;
  if (!idColumn || !orderColumn) throw new Error(`Invalid read-only resource definition: ${key}`);
  return {
    key,
    category,
    title,
    description,
    table,
    idColumn,
    orderColumn,
    scope,
    excluded: options.excluded || [],
    filters: Array.from(new Set(['id', ...(options.filters || [])])).filter((name) => Boolean(columns[name])),
    search: (options.search || []).filter((name) => Boolean(columns[name])),
    itemLookup: options.itemLookup !== false,
  };
}

function direct(
  key: string,
  category: ResourceCategory,
  title: string,
  description: string,
  table: TableLike,
  options: ResourceOptions = {},
) {
  const columns = getTableColumns(table);
  if (!columns.teamId) throw new Error(`Resource ${key} does not have teamId`);
  return defineResource(key, category, title, description, table, (teamId) => eq(columns.teamId, teamId), options);
}

function through(
  key: string,
  category: ResourceCategory,
  title: string,
  description: string,
  table: TableLike,
  childForeignKey: string,
  parentTable: TableLike,
  parentKey: string,
  options: ResourceOptions = {},
) {
  const childColumns = getTableColumns(table);
  const parentColumns = getTableColumns(parentTable);
  if (!childColumns[childForeignKey] || !parentColumns[parentKey] || !parentColumns.teamId) {
    throw new Error(`Invalid team scope for read-only resource ${key}`);
  }
  return defineResource(
    key,
    category,
    title,
    description,
    table,
    (teamId) => sql`${childColumns[childForeignKey]} in (select ${parentColumns[parentKey]} from ${parentTable} where ${parentColumns.teamId} = ${teamId})`,
    options,
  );
}

const teamColumns = getTableColumns(teams);
const userColumns = getTableColumns(users);
const teamMemberColumns = getTableColumns(teamMembers);
const appMakerAppColumns = getTableColumns(teamRadarApps);

export const readOnlyResources: ReadOnlyResource[] = [
  defineResource('team', 'core', 'Team', 'Current team profile, plan, and subscription state.', teams, (teamId) => eq(teamColumns.id, teamId), { search: ['name'] }),
  direct('team-members', 'core', 'Team members', 'Membership, role, and effective permission configuration.', teamMembers, { filters: ['userId', 'role'], orderBy: 'joinedAt' }),
  defineResource('users', 'core', 'Users', 'User profiles for people who belong to the current team.', users, (teamId) => sql`${userColumns.id} in (select ${teamMemberColumns.userId} from ${teamMembers} where ${teamMemberColumns.teamId} = ${teamId})`, { excluded: ['passwordHash'], search: ['name', 'email'] }),
  direct('activity-logs', 'core', 'Activity log', 'Auditable activity registered for the team.', activityLogs, { filters: ['userId', 'action'], orderBy: 'timestamp', search: ['action', 'ipAddress'] }),
  direct('invitations', 'core', 'Invitations', 'Team invitations and their current status.', invitations, { filters: ['status', 'role'], orderBy: 'invitedAt', search: ['email'] }),
  direct('legacy-api-keys', 'core', 'Legacy API keys', 'Identification and usage metadata for legacy API keys. The key secret is never returned.', apiKeys, { excluded: ['key'], search: ['name'], orderBy: 'createdAt' }),
  direct('read-only-api-tokens', 'core', 'Read-only API tokens', 'Identification, scope, expiration, usage, and revocation metadata. Token hashes and secrets are never returned.', readOnlyApiTokens, { excluded: ['tokenHash'], filters: ['createdBy'], search: ['name'], orderBy: 'createdAt' }),
  direct('instances', 'communication', 'WhatsApp instances', 'Connected channel metadata without access or Meta tokens.', evolutionInstances, { excluded: ['accessToken', 'metaToken'], filters: ['integration'], search: ['instanceName', 'instanceNumber'] }),
  direct('chats', 'communication', 'Chats', 'Every chat visible to the team, including unread and last-message state.', chats, { filters: ['instanceId', 'remoteJid', 'lastMessageFromMe', 'automationDisabled'], orderBy: 'lastMessageTimestamp', search: ['name', 'pushName', 'remoteJid', 'lastMessageText'] }),
  through('messages', 'communication', 'Messages', 'Complete inbound and outbound message history, including private media metadata without a public file URL.', messages, 'chatId', chats, 'id', { excluded: ['mediaUrl'], filters: ['chatId', 'fromMe', 'messageType', 'status', 'isAi', 'isAutomation', 'isInternal'], orderBy: 'timestamp', search: ['text', 'mediaCaption', 'contactName', 'participantName'] }),
  direct('audio-insights', 'communication', 'Audio insights', 'What each WhatsApp voice note actually says: transcript, summary, intent, urgency, sentiment, and mentioned amounts or dates. One row per audio message, generated once by the audio-insights cron.', messageAudioInsights, { filters: ['chatId', 'messageId', 'status', 'intent', 'urgency', 'sentiment'], orderBy: 'generatedAt', search: ['transcript', 'summary'] }),
  through('message-reactions', 'communication', 'Message reactions', 'Reactions associated with team chats.', messageReactions, 'chatId', chats, 'id', { filters: ['chatId', 'messageId', 'fromMe'], orderBy: 'timestamp', search: ['emoji', 'participantName'] }),
  direct('contacts', 'crm', 'Contacts', 'Contacts, ownership, funnel stage, notes, and custom field values.', contacts, { filters: ['chatId', 'assignedUserId', 'assignedDepartmentId', 'funnelStageId'], search: ['name', 'notes'] }),
  direct('tags', 'crm', 'Tags', 'Contact tags configured for the team.', tags, { search: ['name'] }),
  through('contact-tags', 'crm', 'Contact tag assignments', 'Many-to-many assignments between contacts and tags.', contactTags, 'contactId', contacts, 'id', { filters: ['contactId', 'tagId'] }),
  direct('departments', 'crm', 'Departments', 'Departments available for contact and agent assignment.', departments, { search: ['name', 'description'] }),
  through('department-members', 'crm', 'Department members', 'Membership assignments for team departments.', departmentMembers, 'departmentId', departments, 'id', { filters: ['departmentId', 'userId'], orderBy: 'createdAt' }),
  direct('funnel-groups', 'crm', 'Funnel groups', 'Stage groups shared by funnels and agendas.', funnelStageGroups, { search: ['name', 'description'], orderBy: 'order' }),
  direct('funnel-stages', 'crm', 'Funnel stages', 'All sales funnel stages and their order.', funnelStages, { filters: ['groupId'], search: ['name'], orderBy: 'order' }),
  through('funnel-group-members', 'crm', 'Funnel group stage membership', 'Explicit stage membership and ordering inside funnel groups.', funnelStageGroupMembers, 'groupId', funnelStageGroups, 'id', { filters: ['groupId', 'stageId'], orderBy: 'order' }),
  direct('custom-fields', 'crm', 'Custom fields', 'Definitions for contact custom data.', customFields, { filters: ['type'], search: ['name', 'key'], orderBy: 'position' }),
  direct('quick-replies', 'communication', 'Quick replies', 'Reusable response shortcuts.', quickReplies, { search: ['shortcut', 'content'] }),
  direct('waba-templates', 'communication', 'WABA templates', 'WhatsApp Business templates and approval status.', wabaTemplates, { filters: ['instanceId', 'status', 'language', 'category'], search: ['name'] }),
  direct('campaigns', 'communication', 'Campaigns', 'Messaging campaign configuration and delivery counters.', campaigns, { filters: ['instanceId', 'status'], search: ['name'] }),
  through('campaign-leads', 'communication', 'Campaign leads', 'Recipients and delivery result for each campaign.', campaignLeads, 'campaignId', campaigns, 'id', { filters: ['campaignId', 'status'], search: ['phone', 'error'] }),
  direct('draft-categories', 'content', 'Draft categories', 'Categories used to organize message drafts.', messageDraftCategories, { search: ['name'], orderBy: 'order' }),
  direct('draft-tags', 'content', 'Draft tags', 'Tags used by the draft library.', messageDraftTags, { search: ['name'] }),
  direct('drafts', 'content', 'Message drafts', 'Reusable drafts, assignments, stages, and generated content metadata.', messageDrafts, { filters: ['categoryId', 'contactId', 'assignedUserId', 'departmentId', 'isArchived'], search: ['title', 'content'] }),
  through('draft-tag-links', 'content', 'Draft tag assignments', 'Many-to-many links between drafts and draft tags.', messageDraftTagLinks, 'draftId', messageDrafts, 'id', { filters: ['draftId', 'tagId'], id: 'draftId', orderBy: 'draftId', itemLookup: false }),
  direct('automation-folders', 'automation', 'Automation folders', 'Folder hierarchy used to organize automations.', automationFolders, { filters: ['parentId'], search: ['name'], orderBy: 'position' }),
  direct('automations', 'automation', 'Automations', 'Complete automation definitions including nodes, edges, trigger, and status.', automations, { filters: ['folderId', 'instanceId', 'isActive'], search: ['name', 'triggerKeyword', 'note'] }),
  direct('automation-sessions', 'automation', 'Automation sessions', 'Runtime sessions, current node, variables, and status.', automationSessions, { filters: ['automationId', 'chatId', 'contactId', 'status'] }),
  direct('automation-templates', 'automation', 'Automation templates', 'Private automation templates owned by the team.', automationTemplates, { filters: ['instanceId', 'isPublic'], search: ['name', 'description'] }),
  direct('ai-config', 'automation', 'AI configuration', 'AI model and behavior configuration without the provider API key.', aiConfigs, { excluded: ['apiKey'], filters: ['provider', 'isActive'], search: ['model', 'systemPrompt'] }),
  through('ai-sessions', 'automation', 'AI sessions', 'AI conversation state associated with team chats.', aiSessions, 'chatId', chats, 'id', { filters: ['chatId', 'status'], orderBy: 'updatedAt' }),
  direct('ai-tools', 'automation', 'AI tools', 'Tools available to the AI agent and their non-secret action configuration.', aiTools, { filters: ['type', 'isActive'], search: ['name', 'description'] }),
  direct('webhook-events', 'operations', 'Webhook events', 'Inbound WhatsApp event processing history.', webhookEvents, { filters: ['instanceName', 'event', 'status', 'remoteJid'], search: ['messageId', 'error'] }),
  direct('bookmark-groups', 'operations', 'Agenda groups', 'Agenda groups associated with funnel groups.', dashboardBookmarkGroups, { filters: ['funnelStageGroupId'], search: ['name'], orderBy: 'order' }),
  direct('bookmarks', 'operations', 'Agenda items', 'Contacts and items saved in team agendas.', dashboardBookmarkItems, { filters: ['groupId', 'contactId', 'funnelStageGroupId'], search: ['title'], orderBy: 'order' }),
  direct('installed-plugins', 'plugins', 'Installed plugins', 'Installed plugin state without private settings.', teamPlugins, { excluded: ['settings'], filters: ['pluginId', 'enabled'], orderBy: 'installedAt', search: ['pluginId'] }),
  direct('member-plugins', 'plugins', 'Member plugin overrides', 'Per-user plugin activation state.', teamMemberPlugins, { filters: ['pluginId', 'userId', 'enabled'], search: ['pluginId'] }),
  direct('feature-requests', 'plugins', 'Feature requests', 'Requested extensions, categories, votes, and delivery status for the team.', featureRequests, { filters: ['requestedBy', 'appId', 'category', 'status'], search: ['title', 'description'] }),
  through('feature-request-votes', 'plugins', 'Feature request votes', 'Votes attached to feature requests created by this team.', featureRequestVotes, 'requestId', featureRequests, 'id', { filters: ['requestId', 'userId'], orderBy: 'createdAt' }),
  direct('notes', 'plugins', 'Team notes', 'Shared notes created in the Notes plugin. Meeting notes carry an eventId and a commitments array.', teamNotes, { filters: ['createdBy', 'eventId'], search: ['title', 'content'] }),
  direct('calendar-events', 'plugins', 'Calendar events', 'Events available in the Calendar plugin, including meeting/call kind, subtype, outcome, and next action.', teamEvents, { filters: ['createdBy', 'kind', 'customerId', 'status'], search: ['title', 'notes', 'outcome'], orderBy: 'startsAt' }),
  through('event-participants', 'plugins', 'Event participants', 'Structured attendees for calendar events (meetings/calls), replacing the legacy attendees list.', teamEventParticipants, 'eventId', teamEvents, 'id', { filters: ['eventId', 'userId', 'contactId', 'role'] }),
  direct('financial-entries', 'commerce', 'Financial entries', 'Income and expense ledger from the Finance plugin: status, due dates, recurrence, and relations to customer, sale, project, account, and cost center.', teamFinancialEntries, { filters: ['type', 'status', 'customerId', 'saleId', 'projectId', 'accountId', 'costCenterId'], search: ['title', 'description', 'category', 'counterparty'], orderBy: 'occurredOn' }),
  direct('financial-accounts', 'commerce', 'Financial accounts', 'Cash, bank, and payment-provider accounts tracked by the Finance plugin.', teamFinancialAccounts, { filters: ['type', 'isActive'], search: ['name'] }),
  through('financial-entry-payments', 'commerce', 'Financial entry payments', 'Partial payments recorded against a financial entry.', teamFinancialEntryPayments, 'entryId', teamFinancialEntries, 'id', { filters: ['entryId', 'accountId'], orderBy: 'paidOn' }),
  direct('financial-receipts', 'commerce', 'Financial receipts', 'Receipt documents captured from WhatsApp chats and linked to financial entries.', teamFinancialReceipts, { filters: ['entryId', 'chatId'], search: ['fileName', 'notes'] }),
  direct('cost-centers', 'commerce', 'Cost centers', 'Cost centers used to allocate budgets and financial entries.', teamCostCenters, { filters: ['isActive'], search: ['name', 'code'] }),
  direct('budgets', 'commerce', 'Budgets', 'Budgeted amounts per period, category, and cost center.', teamBudgets, { filters: ['costCenterId'], search: ['name', 'category'], orderBy: 'periodStart' }),
  direct('exchange-rates', 'commerce', 'Exchange rates', 'Manually recorded currency exchange rates used for financial reporting.', teamExchangeRates, { filters: ['baseCurrency', 'quoteCurrency'], orderBy: 'rateDate' }),
  direct('notifications', 'plugins', 'Notifications', 'Team notification inbox and delivery state.', teamNotifications, { filters: ['userId', 'read'], search: ['title', 'message'] }),
  direct('domains', 'plugins', 'Domains', 'Domain records managed by the Domains plugin.', teamDomains, { filters: ['status'], search: ['domain'] }),
  direct('hostinger-accounts', 'plugins', 'Hostinger accounts', 'Connected Hostinger account metadata without API tokens.', hostingerAccounts, { excluded: ['token'], filters: ['status'], search: ['label'] }),
  direct('sites', 'plugins', 'Sites', 'Sites and deployment state managed by the Sites plugin.', teamSites, { search: ['title', 'slug'] }),
  direct('site-files', 'plugins', 'Site files', 'File tree and source content for team sites.', teamSiteFiles, { filters: ['siteId'], search: ['path'] }),
  direct('article-types', 'plugins', 'Article types', 'Schemas for catalog articles.', teamArticleTypes, { search: ['name', 'slug'] }),
  direct('article-custom-fields', 'plugins', 'Article custom fields', 'Custom field definitions for article types.', teamArticleCustomFields, { filters: ['articleTypeId', 'type'], search: ['name', 'key'], orderBy: 'position' }),
  direct('article-attributes', 'plugins', 'Article attributes', 'Reusable article attribute values.', teamArticleAttributes, { search: ['name'] }),
  direct('articles', 'plugins', 'Articles', 'Catalog articles and their custom data.', teamArticles, { filters: ['articleTypeId', 'status'], search: ['name', 'sku', 'description'] }),
  direct('article-variations', 'plugins', 'Article variations', 'Variants associated with catalog articles.', teamArticleVariations, { filters: ['articleId'], search: ['name', 'sku'] }),
  direct('article-plans', 'plugins', 'Article plans', 'Commercial plans linked to articles.', teamArticlePlans, { filters: ['articleId'], search: ['name'] }),
  direct('sales', 'commerce', 'Sales', 'Sales records and status from the Sales plugin.', teamSales, { filters: ['status', 'customerId'], search: ['reference'] }),
  // `notes` queda fuera: es texto libre con contenido del cliente, y este
  // catálogo lo consume cualquier token de sólo lectura.
  direct('deals', 'commerce', 'Deals', 'Sales opportunities with stage, value, probability, and the linked sale.', teamDeals, { excluded: ['notes', 'lostReason'], filters: ['stage', 'customerId', 'contactId', 'ownerId', 'source'], orderBy: 'updatedAt', search: ['title'] }),
  direct('customers', 'commerce', 'Customers', 'Customer records maintained by the Customers plugin.', teamCustomers, { filters: ['status'], search: ['name', 'email', 'phone'] }),
  direct('customer-contacts', 'commerce', 'Customer contacts', 'People linked to customer records.', teamCustomerContacts, { filters: ['customerId'], search: ['name', 'email', 'phone'] }),
  direct('customer-notes', 'commerce', 'Customer notes', "A customer's internal log: team notes and AI work reports, with kind ('note' or 'report') and source ('user' or 'connector'). The only note history for customers that have no WhatsApp chat.", teamCustomerNotes, { filters: ['customerId', 'kind', 'source'], search: ['text'] }),
  direct('customer-stores', 'commerce', 'Customer stores', 'Stores linked to customers.', teamCustomerStores, { filters: ['customerId'], search: ['name', 'domain'] }),
  direct('customer-transactions', 'commerce', 'Customer transactions', 'Transaction history linked to customer records.', teamCustomerTransactions, { filters: ['customerId', 'status'], search: ['reference'] }),
  direct('membership-companies', 'commerce', 'Membership companies', 'Companies managed by the Memberships plugin.', teamMembershipCompanies, { search: ['name', 'email', 'phone'] }),
  direct('membership-plans', 'commerce', 'Membership plans', 'Membership plan catalog and billing configuration.', teamMembershipPlans, { filters: ['active'], search: ['name'] }),
  direct('membership-subscriptions', 'commerce', 'Membership subscriptions', 'Customer subscriptions, dates, and service state.', teamMembershipSubscriptions, { filters: ['companyId', 'planId', 'status'], search: ['externalReference'] }),
  direct('membership-reminder-rules', 'commerce', 'Membership reminder rules', 'Reminder rules without provider credentials.', teamMembershipReminderRules, { filters: ['active'], search: ['name'] }),
  direct('aapp-connection', 'plugins', 'AAPP connection', 'AAPP connection and synchronization state without its API key.', teamAappConnections, { excluded: ['apiKey'], filters: ['status'] }),
  direct('aapp-renewal-config', 'plugins', 'AAPP renewal configuration', 'Renewal queue behavior and synchronization configuration.', teamAappRenewalConfigs, { filters: ['enabled'] }),
  direct('aapp-renewal-candidates', 'plugins', 'AAPP renewal candidates', 'Subscriptions detected as renewal candidates.', teamAappRenewalCandidates, { filters: ['subscriptionId', 'status'], search: ['phone'] }),
  direct('task-workspaces', 'plugins', 'Task workspaces', 'Workspaces from the Tasks plugin. Public embed capabilities are reported without disclosing the bearer token.', teamTaskWorkspaces, { excluded: ['embedToken'], search: ['name'] }),
  direct('task-projects', 'plugins', 'Task projects', 'Projects and boards in task workspaces. Public embed capabilities are reported without disclosing the bearer token.', teamTaskProjects, { excluded: ['embedToken'], filters: ['workspaceId'], search: ['name'] }),
  direct('task-columns', 'plugins', 'Task columns', 'Board columns and their ordering.', teamTaskColumns, { filters: ['projectId'], search: ['title'], orderBy: 'position' }),
  direct('tasks', 'plugins', 'Tasks', 'Task records, dates, metadata, checklist, and state.', teamTaskItems, { filters: ['projectId', 'columnId', 'status'], search: ['title', 'notes'] }),
  direct('task-locations', 'plugins', 'Task locations', 'Task placement across projects and columns.', teamTaskItemLocations, { filters: ['taskId', 'projectId', 'columnId'], orderBy: 'position' }),
  direct('task-relations', 'plugins', 'Task relations', 'Relations between tasks and other system entities.', teamTaskRelations, { filters: ['sourceType', 'sourceId', 'targetType', 'targetId'] }),
  direct('task-dependencies', 'plugins', 'Task dependencies', 'Dependency graph between task records.', teamTaskDependencies, { filters: ['taskId', 'dependsOnTaskId'] }),
  direct('task-media', 'plugins', 'Task media', 'Files and media attached to tasks or projects.', teamTaskMedia, { filters: ['ownerType', 'ownerId'], search: ['fileName', 'mimeType'] }),
  direct('task-templates', 'plugins', 'Task templates', 'Reusable task and project templates.', teamTaskTemplates, { filters: ['type'], search: ['name'] }),
  direct('task-comments', 'plugins', 'Task comments', 'Comments attached to task records.', teamTaskComments, { filters: ['taskId', 'userId'], search: ['text'] }),
  direct('scheduled-messages', 'plugins', 'Scheduled messages', 'Messages configured for future or recurring delivery.', teamScheduledMessages, { filters: ['status', 'instanceId'], search: ['name', 'message'] }),
  direct('mini-app-installs', 'plugins', 'Mini-app installs', 'Installed mini applications for the team.', miniAppInstalls, { filters: ['appSlug'], search: ['appSlug'] }),
  direct('mini-app-records', 'plugins', 'Mini-app records', 'All collections and records saved by installed mini-apps.', miniAppRecords, { filters: ['appSlug', 'collection', 'recordId'], search: ['appSlug', 'collection', 'recordId'] }),
  defineResource('app-maker-apps', 'plugins', 'App Maker applications', 'Versioned App Maker definitions for this team, including draft and frozen published versions.', teamRadarApps, (teamId) => and(eq(appMakerAppColumns.teamId, teamId), like(appMakerAppColumns.slug, 'app-maker--%'))!, { filters: ['status'], search: ['slug', 'name'] }),
  direct('app-maker-records', 'plugins', 'App Maker records', 'Operational records owned by App Maker entities.', teamAppMakerRecords, { filters: ['appId', 'entityKey'], search: ['entityKey'] }),
  direct('app-maker-record-links', 'plugins', 'App Maker record links', 'Auditable relation edges between App Maker records and app or WhatsPro resources.', teamAppMakerRecordLinks, { filters: ['appId', 'relationKey', 'sourceRecordId', 'targetKind', 'targetKey', 'targetRecordId'] }),
  direct('app-maker-attachments', 'plugins', 'App Maker attachment metadata', 'Private attachment metadata. Storage paths and binary contents are never exposed by the read-only API.', teamAppMakerAttachments, { excluded: ['storagePath'], filters: ['appId', 'recordId', 'fieldKey'], search: ['fileName', 'mimeType'], orderBy: 'createdAt' }),
  direct('forms', 'plugins', 'Forms', 'Published and draft forms from the Form Builder plugin.', formBuilderForms, { filters: ['status'], search: ['name', 'publicId'] }),
  direct('form-submissions', 'plugins', 'Form submissions', 'Complete form response payloads and review state.', formBuilderSubmissions, { filters: ['formId', 'status'], search: ['messageId'] }),
  direct('social-accounts', 'plugins', 'Social accounts', 'Connected Facebook and Instagram profiles without access tokens.', socialAccounts, { excluded: ['accessToken'], filters: ['platform', 'status'], search: ['name', 'username'] }),
  direct('social-posts', 'plugins', 'Social posts', 'Draft, scheduled, and published social content.', socialPosts, { filters: ['status', 'format'], search: ['caption'] }),
  through('social-post-targets', 'plugins', 'Social post targets', 'Per-account publication result for social posts.', socialPostTargets, 'postId', socialPosts, 'id', { filters: ['postId', 'socialAccountId', 'platform', 'status'] }),
  direct('meta-token-status', 'plugins', 'Meta token status', 'Meta Ads connection status without the access token.', metaAdsTokens, { excluded: ['token'], filters: ['status'], search: ['label', 'lastError'] }),
  direct('meta-ad-accounts', 'plugins', 'Meta ad accounts', 'Advertising accounts, spend, sync, and visibility state.', metaAdAccounts, { filters: ['tokenId', 'visible', 'syncEnabled'], search: ['name', 'accountId', 'businessName'] }),
  direct('meta-campaigns', 'plugins', 'Meta campaigns', 'Campaign configuration and synchronized state.', metaCampaigns, { filters: ['adAccountId', 'status', 'effectiveStatus'], search: ['name', 'campaignId'] }),
  direct('meta-campaign-insights', 'plugins', 'Meta campaign insights', 'Daily campaign performance metrics.', metaCampaignInsightsDaily, { filters: ['adAccountId', 'campaignRowId', 'campaignId', 'date'], orderBy: 'date' }),
  direct('meta-sync-runs', 'plugins', 'Meta sync runs', 'History and result of Meta Ads synchronizations.', metaAdsSyncRuns, { filters: ['adAccountId', 'status', 'trigger'], orderBy: 'startedAt' }),
  direct('document-folders', 'content', 'Document folders', 'Folder hierarchy from the Documents plugin.', teamDocumentFolders, { filters: ['parentId'], search: ['name'], orderBy: 'position' }),
  direct('documents', 'content', 'Documents', 'Complete structured and plain-text document content.', teamDocuments, { filters: ['folderId'], search: ['title', 'contentText'], orderBy: 'updatedAt' }),
  direct('document-links', 'content', 'Document links', 'Relations between internal documents.', teamDocumentLinks, { filters: ['sourceDocumentId', 'targetDocumentId'] }),
  direct('document-media', 'content', 'Document media', 'Media linked to internal documents.', teamDocumentMedia, { filters: ['documentId'], search: ['fileName', 'mimeType'] }),
  direct('desktop-preferences', 'operations', 'Desktop preferences', 'Saved operations desktop layout for team users.', teamDesktopPreferences, { filters: ['userId'] }),
  direct('marketplace-entitlements', 'commerce', 'Marketplace entitlements', 'Active app and feature entitlements for the team.', teamMarketplaceEntitlements, { filters: ['itemId', 'status'] }),
  direct('marketplace-orders', 'commerce', 'Marketplace orders', 'Orders and approval state for marketplace items.', marketplaceOrders, { filters: ['itemId', 'status'], orderBy: 'createdAt' }),
  through('marketplace-order-lines', 'commerce', 'Marketplace order lines', 'Line items belonging to team marketplace orders.', marketplaceOrderLines, 'orderId', marketplaceOrders, 'id', { filters: ['orderId', 'priceId'] }),
  through('marketplace-order-events', 'commerce', 'Marketplace order events', 'Status history for team marketplace orders.', marketplaceOrderStatusEvents, 'orderId', marketplaceOrders, 'id', { filters: ['orderId', 'status'], orderBy: 'createdAt' }),
  direct('manual-payments', 'commerce', 'Manual payments', 'Manual payment orders and review state.', manualPayments, { filters: ['status'], search: ['reference'] }),
  direct('payment-audit-events', 'commerce', 'Payment audit events', 'Auditable payment state changes without provider secrets.', paymentAuditEvents, { filters: ['action', 'entityType', 'entityId'], orderBy: 'createdAt' }),
  through('chat-ai-summaries', 'communication', 'Chat AI summaries', 'AI-generated conversation summaries, one per chat, with message and audio counts.', conversationAiSummaries, 'chatId', chats, 'id', { filters: ['chatId'], orderBy: 'generatedAt', search: ['summary'] }),
  direct('support-tickets', 'operations', 'Support tickets', 'Support tickets with customer, contact, priority, status, and resolution.', teamSupportTickets, { filters: ['customerId', 'contactId', 'chatId', 'status', 'priority', 'assignedUserId'], search: ['subject', 'description', 'resolution'] }),
  through('support-ticket-comments', 'operations', 'Support ticket comments', 'Comment threads on team support tickets.', teamSupportTicketComments, 'ticketId', teamSupportTickets, 'id', { filters: ['ticketId', 'authorUserId', 'isInternal'], orderBy: 'createdAt', search: ['body'] }),
  direct('contracts', 'commerce', 'Contracts', 'Customer contracts with value, dates, renewal, and linked document.', teamContracts, { filters: ['customerId', 'status'], search: ['title', 'description'] }),
  direct('vendors', 'commerce', 'Vendors', 'Purchase vendors and their contact data.', teamVendors, { filters: ['isActive'], search: ['name', 'email', 'taxId'] }),
  direct('purchase-orders', 'commerce', 'Purchase orders', 'Purchase orders with vendor, totals, and reception state.', teamPurchaseOrders, { filters: ['vendorId', 'status'], search: ['orderNumber', 'notes'] }),
  through('purchase-order-items', 'commerce', 'Purchase order items', 'Line items of team purchase orders.', teamPurchaseOrderItems, 'purchaseOrderId', teamPurchaseOrders, 'id', { filters: ['purchaseOrderId', 'articleId'], search: ['description'] }),
  direct('employee-profiles', 'core', 'Employee profiles', 'HR profiles for team members: job title, employment status, hire date.', teamEmployeeProfiles, { filters: ['userId', 'employmentStatus'], search: ['jobTitle'] }),
  direct('commission-rules', 'commerce', 'Commission rules', 'Sales commission rules with rate and scope.', teamCommissionRules, { filters: ['userId', 'articleId', 'isActive'], search: ['name'] }),
  direct('sale-commissions', 'commerce', 'Sale commissions', 'Commissions accrued per sale and user, with settlement status.', teamSaleCommissions, { filters: ['saleId', 'userId', 'ruleId', 'status'], orderBy: 'createdAt' }),
  direct('radar-widgets', 'intelligence', 'Radar widgets', 'Live Radar dashboard widgets with their blocks, section, surface, and position.', teamRadarWidgets, { filters: ['section', 'surface', 'contactId', 'enabled', 'source'], search: ['key', 'title'] }),
  direct('radar-reports', 'intelligence', 'Radar report links', 'Reports linked into Radar with category, contact, and assignee.', teamRadarReports, { filters: ['documentId', 'category', 'contactId', 'assignedUserId'], search: ['summary'] }),
  direct('radar-insights', 'intelligence', 'Radar insights', 'AI-generated insights with severity, confidence, and recommended action.', teamRadarInsights, { filters: ['appSlug', 'contactId', 'severity', 'status'], search: ['title', 'description'] }),
  direct('task-ai-runs', 'operations', 'Task AI runs', 'History of AI runs over tasks and projects: connector, phase, status, and summary.', teamTaskAiRuns, { filters: ['targetType', 'targetId', 'phase', 'status', 'connector'], orderBy: 'createdAt', search: ['summary'] }),
  direct('menu-items', 'core', 'Menu items', 'Pinned navigation items and their order for the team menu.', teamMenuItems, { filters: ['itemKey', 'pinned'], orderBy: 'order', search: ['itemKey'] }),
];

export const readOnlyResourceMap = new Map(readOnlyResources.map((resource) => [resource.key, resource]));

function safeColumns(resource: ReadOnlyResource) {
  return Object.fromEntries(
    Object.entries(getTableColumns(resource.table)).filter(([name]) => !resource.excluded.includes(name)),
  );
}

function parseColumnValue(column: ColumnLike, raw: string) {
  if (column.dataType === 'number') {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error('invalid_number');
    return value;
  }
  if (column.dataType === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error('invalid_boolean');
    return raw === 'true';
  }
  if (column.dataType === 'date') {
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) throw new Error('invalid_date');
    return value;
  }
  return raw;
}

export function readOnlyResourceMetadata(resource: ReadOnlyResource) {
  return {
    key: resource.key,
    title: resource.title,
    description: resource.description,
    category: resource.category,
    endpoint: `/api/readonly/v1/${resource.key}`,
    fields: Object.keys(safeColumns(resource)),
    filters: resource.filters,
    searchable: resource.search.length > 0,
    itemLookup: resource.itemLookup,
  };
}

export const readOnlyPluginCatalogMetadata = {
  key: 'plugin-catalog',
  title: 'Plugin catalog',
  description: 'Every plugin registered in the running application, its routes, capabilities, activation model, and team-level state.',
  category: 'plugins' as const,
  endpoint: '/api/readonly/v1/plugin-catalog',
  fields: [
    'id',
    'displayName',
    'activationMode',
    'scopes',
    'routes',
    'navigation',
    'featureFlags',
    'installed',
    'teamEnabled',
    'enabledByDefault',
    'installedAt',
  ],
  filters: ['activationMode', 'installed', 'enabled'],
  searchable: true,
  itemLookup: true,
};

function parseBooleanFilter(raw: string | null) {
  if (raw === null) return null;
  if (raw !== 'true' && raw !== 'false') throw new Error('invalid_boolean');
  return raw === 'true';
}

export async function listReadOnlyPlugins(teamId: number, params: URLSearchParams) {
  const [manifests, teamRows, systemRows] = await Promise.all([
    getRegisteredPlugins(),
    db.select().from(teamPlugins).where(eq(teamPlugins.teamId, teamId)),
    db.select().from(pluginSystemStates),
  ]);
  const teamState = new Map(teamRows.map((row) => [row.pluginId, row]));
  const systemState = new Map(systemRows.map((row) => [row.pluginId, row]));
  const query = params.get('q')?.trim().toLowerCase() || '';
  const activationMode = params.get('activationMode');
  const installedFilter = parseBooleanFilter(params.get('installed'));
  const enabledFilter = parseBooleanFilter(params.get('enabled'));

  const data = manifests
    .map((manifest) => {
      const row = teamState.get(manifest.id);
      const defaultRow = systemState.get(manifest.id);
      const teamEnabled = manifest.activationMode === 'system'
        ? true
        : row?.enabled ?? defaultRow?.enabledByDefault ?? false;
      return {
        id: manifest.id,
        displayName: manifest.displayName,
        activationMode: manifest.activationMode,
        scopes: manifest.scopes,
        routes: manifest.routes,
        navigation: manifest.navItems,
        featureFlags: manifest.featureFlags,
        installed: manifest.activationMode === 'system' || Boolean(row?.installed),
        teamEnabled,
        enabledByDefault: defaultRow?.enabledByDefault ?? manifest.activationMode === 'system',
        installedAt: row?.installedAt ?? null,
      };
    })
    .filter((plugin) => !query || `${plugin.id} ${plugin.displayName}`.toLowerCase().includes(query))
    .filter((plugin) => !activationMode || plugin.activationMode === activationMode)
    .filter((plugin) => installedFilter === null || plugin.installed === installedFilter)
    .filter((plugin) => enabledFilter === null || plugin.teamEnabled === enabledFilter)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    object: 'list',
    resource: readOnlyPluginCatalogMetadata.key,
    data,
    meta: { page: 1, perPage: data.length, hasMore: false, nextPage: null },
  };
}

export async function getReadOnlyPlugin(teamId: number, id: string) {
  const result = await listReadOnlyPlugins(teamId, new URLSearchParams());
  return result.data.find((plugin) => plugin.id === id) || null;
}

/**
 * `extra` son condiciones que el llamador agrega al WHERE. Hoy la usa el
 * conector MCP para recortar los recursos que cuelgan de un chat por la
 * visibilidad del usuario (ver `lib/readonly-api/actor-guard.ts`). Es opcional a
 * propósito: sin ella el comportamiento es exactamente el de siempre, así que la
 * API de sólo lectura por token no cambia.
 */
export async function listReadOnlyResource(
  resource: ReadOnlyResource,
  teamId: number,
  params: URLSearchParams,
  extra: SQL[] = [],
) {
  const page = Math.max(1, Math.min(100_000, Number(params.get('page') || 1) || 1));
  const perPage = Math.max(1, Math.min(100, Number(params.get('per_page') || 50) || 50));
  const columns = getTableColumns(resource.table);
  const conditions: SQL[] = [resource.scope(teamId), ...extra];

  for (const filter of resource.filters) {
    const raw = params.get(filter);
    if (raw === null) continue;
    conditions.push(eq(columns[filter], parseColumnValue(columns[filter], raw)));
  }

  /**
   * Rango de fechas, genérico para todos los recursos.
   *
   * Se aplica sobre la MISMA columna por la que el recurso ordena
   * (`timestamp` en mensajes, `occurredOn` en asientos, `createdAt` en el
   * resto), que es la fecha por la que uno pregunta en cada caso. Sin esto,
   * leer "qué se habló en agosto" obligaba a paginar de a 100 hacia atrás
   * hasta pasarse.
   *
   * Acepta `YYYY-MM-DD` o ISO completo. `to` con fecha suelta se extiende al
   * final del día: pedir `to=2026-08-31` y perder todo lo de ese día sería una
   * trampa silenciosa.
   */
  const desde = params.get('from');
  const hasta = params.get('to');
  if ((desde || hasta) && resource.orderColumn.dataType === 'date') {
    if (desde) {
      const valor = new Date(/^\d{4}-\d{2}-\d{2}$/.test(desde) ? `${desde}T00:00:00` : desde);
      if (Number.isNaN(valor.getTime())) throw new Error('invalid_from');
      conditions.push(gte(resource.orderColumn, valor));
    }
    if (hasta) {
      const valor = new Date(/^\d{4}-\d{2}-\d{2}$/.test(hasta) ? `${hasta}T23:59:59.999` : hasta);
      if (Number.isNaN(valor.getTime())) throw new Error('invalid_to');
      conditions.push(lte(resource.orderColumn, valor));
    }
  }

  const query = params.get('q')?.trim();
  if (query && resource.search.length > 0) {
    conditions.push(or(...resource.search.map((name) => ilike(columns[name], `%${query}%`)))!);
  }

  const rows = await db
    .select(safeColumns(resource))
    .from(resource.table)
    .where(and(...conditions))
    .orderBy(desc(resource.orderColumn), desc(resource.idColumn))
    .limit(perPage + 1)
    .offset((page - 1) * perPage);

  const hasMore = rows.length > perPage;
  return {
    object: 'list',
    resource: resource.key,
    data: hasMore ? rows.slice(0, perPage) : rows,
    meta: { page, perPage, hasMore, nextPage: hasMore ? page + 1 : null },
  };
}

export async function getReadOnlyResource(
  resource: ReadOnlyResource,
  teamId: number,
  id: string,
  extra: SQL[] = [],
) {
  const parsedId = parseColumnValue(resource.idColumn, id);
  const [row] = await db
    .select(safeColumns(resource))
    .from(resource.table)
    .where(and(resource.scope(teamId), eq(resource.idColumn, parsedId), ...extra))
    .limit(1);
  return row || null;
}
