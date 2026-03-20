import { db } from '@/lib/db/drizzle';
import { ChatThemeForm } from './ChatThemeForm';
import { getTranslations } from 'next-intl/server';

export default async function ChatThemePage() {
  let themeData = null;
  try {
    themeData = await db.query.chatTheme.findFirst();
  } catch (error) {
    console.error('Error loading chat theme:', error);
  }
  const t = await getTranslations('ChatTheme');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('subtitle')}</p>
      <div className="mt-6">
        <ChatThemeForm theme={themeData ?? null} />
      </div>
    </div>
  );
}
