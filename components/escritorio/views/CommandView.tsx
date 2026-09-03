'use client';

import { useTranslations } from 'next-intl';
import { DesktopPage } from '../DesktopPage';
import { CommandCenter } from '../command/CommandCenter';

export function CommandView() {
  const t = useTranslations('DesktopOperations');
  return (
    <DesktopPage title={t('command.title')} subtitle={t('command.subtitle')}>
      <CommandCenter />
    </DesktopPage>
  );
}
