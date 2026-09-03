'use client';

import { useEffect, useState } from 'react';
import { Languages, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';

const themeOptions = [
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
  { id: 'system', icon: Monitor },
] as const;

export function GeneralPreferences() {
  const t = useTranslations('Settings');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <section className="border border-border bg-card">
      <header className="border-b border-border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-primary-foreground"><Palette className="h-4 w-4" /></div>
          <div><h2 className="font-semibold">{t('preferences_title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('preferences_description')}</p></div>
        </div>
      </header>
      <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2"><Languages className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{t('language_title')}</h3></div>
          <p className="mt-1 text-xs text-muted-foreground">{t('language_description')}</p>
          <LanguageSwitcher className="mt-4 h-11 w-full rounded-none" />
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2"><Sun className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{t('appearance_title')}</h3></div>
          <p className="mt-1 text-xs text-muted-foreground">{t('appearance_description')}</p>
          <div className="mt-4 grid grid-cols-3 border border-border" aria-label={t('appearance_title')}>
            {themeOptions.map(({ id, icon: Icon }) => {
              const active = mounted && theme === id;
              return <button key={id} type="button" onClick={() => setTheme(id)} aria-pressed={active} className={cn('flex min-h-11 items-center justify-center gap-2 border-r border-border px-2 text-xs font-semibold last:border-r-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary', active && 'bg-primary text-primary-foreground hover:bg-primary')}><Icon className="h-4 w-4" /><span>{t(`appearance_${id}`)}</span></button>;
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
