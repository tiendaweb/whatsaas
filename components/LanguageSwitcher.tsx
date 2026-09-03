'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe } from 'lucide-react';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('Common');
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function onSelectChange(nextLocale: string) {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <Select value={locale} onValueChange={onSelectChange} disabled={isPending}>
      <SelectTrigger className={cn("h-9 w-[140px] gap-2 border-border/60 bg-background/50", className)}>
        <Globe className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder={t('language_placeholder')} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="en">{t('language_english')}</SelectItem>
        <SelectItem value="pt">{t('language_portuguese')}</SelectItem>
        <SelectItem value="es">{t('language_spanish')}</SelectItem>
      </SelectContent>
    </Select>
  );
}
