import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  getReadOnlyApiManager,
  isReadOnlyApiDocsConfigured,
  isReadOnlyApiDocsUnlocked,
} from '@/lib/readonly-api/access';
import { readOnlyPluginCatalogMetadata, readOnlyResourceMetadata, readOnlyResources } from '@/lib/readonly-api/catalog';
import { getReadOnlyTokens } from './actions';
import { DocsCodeGate } from './components/DocsCodeGate';
import { ReadOnlyApiConsole } from './components/ReadOnlyApiConsole';

export async function generateMetadata() {
  const t = await getTranslations('ReadOnlyApi');
  return { title: t('title'), description: t('description') };
}

function resolveOrigin(headersList: Headers) {
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || 'whatspro.uno';
  const protocol = headersList.get('x-forwarded-proto') || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export default async function ReadOnlyApiPage() {
  const manager = await getReadOnlyApiManager();
  if (!manager) notFound();

  const configured = isReadOnlyApiDocsConfigured();
  const unlocked = await isReadOnlyApiDocsUnlocked(manager.user.id);
  if (!unlocked) return <DocsCodeGate configured={configured} />;

  const [tokens, headersList] = await Promise.all([getReadOnlyTokens(), headers()]);
  return (
    <ReadOnlyApiConsole
      resources={[readOnlyPluginCatalogMetadata, ...readOnlyResources.map(readOnlyResourceMetadata)]}
      tokens={tokens}
      baseUrl={resolveOrigin(headersList)}
    />
  );
}
