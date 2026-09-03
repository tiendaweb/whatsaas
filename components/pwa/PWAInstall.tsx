'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, MoreVertical, PlusSquare, Share, Smartphone, Zap, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBranding } from '@/providers/branding-provider';

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type PWAInstallContextValue = {
  isInstalled: boolean;
  openInstallDialog: () => void;
};

const PWAInstallContext = createContext<PWAInstallContextValue | null>(null);

function detectInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function detectIOS() {
  const agent = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(agent)
    || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('PWA');
  const { identity } = useBranding();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsInstalled(detectInstalled());
    setIsIOS(detectIOS());

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const handleDisplayMode = () => setIsInstalled(detectInstalled());

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode.addEventListener('change', handleDisplayMode);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode.removeEventListener('change', handleDisplayMode);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') setDialogOpen(false);
  };

  const contextValue = useMemo<PWAInstallContextValue>(() => ({
    isInstalled,
    openInstallDialog: () => setDialogOpen(true),
  }), [isInstalled]);

  const renderInstructions = () => {
    if (isInstalled) {
      return (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t('installed_title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('installed_description', { app: identity.name })}</p>
            </div>
          </div>
        </div>
      );
    }

    if (installPrompt) {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <InstallBenefit icon={Zap} title={t('benefit_access_title')} description={t('benefit_access_description')} />
          <InstallBenefit icon={Smartphone} title={t('benefit_space_title')} description={t('benefit_space_description')} />
        </div>
      );
    }

    const steps = isIOS
      ? [
          { icon: Share, text: t('ios_step_share') },
          { icon: PlusSquare, text: t('ios_step_add') },
          { icon: CheckCircle2, text: t('ios_step_confirm') },
        ]
      : [
          { icon: MoreVertical, text: t('browser_step_menu') },
          { icon: Download, text: t('browser_step_install') },
          { icon: CheckCircle2, text: t('browser_step_confirm') },
        ];

    return (
      <ol className="space-y-2">
        {steps.map(({ icon: Icon, text }, index) => (
          <li key={text} className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold tabular-nums text-primary-foreground">
              {index + 1}
            </span>
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm text-foreground">{text}</span>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <PWAInstallContext.Provider value={contextValue}>
      {children}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:rounded-t-2xl max-md:p-4 md:max-w-[480px]">
          <DialogHeader className="text-left">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Download className="h-5 w-5" />
            </div>
            <DialogTitle>{t('modal_title', { app: identity.name })}</DialogTitle>
            <DialogDescription>
              {isInstalled ? t('modal_installed_description') : t('modal_description')}
            </DialogDescription>
          </DialogHeader>

          {renderInstructions()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('close_button')}</Button>
            {!isInstalled && installPrompt ? (
              <Button onClick={() => void install()}>
                <Download className="h-4 w-4" />
                {t('install_button')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PWAInstallContext.Provider>
  );
}

function InstallBenefit({ icon: Icon, title, description }: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

export function PWAInstallSection() {
  const t = useTranslations('PWA');
  const { identity } = useBranding();
  const { isInstalled, openInstallDialog } = usePWAInstall();

  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto grid max-w-7xl gap-px bg-border md:grid-cols-[0.85fr_1.15fr]">
        <div className="bg-background px-5 py-10 sm:px-8 md:py-14 lg:px-12">
          <span className="text-sm font-bold tabular-nums text-primary">01</span>
          <h2 className="mt-5 max-w-lg text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('section_title', { app: identity.name })}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            {t('section_description')}
          </p>
          <Button className="mt-7 h-12 w-full sm:w-auto" onClick={openInstallDialog}>
            {isInstalled ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {t(isInstalled ? 'installed_button' : 'section_button')}
          </Button>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-3">
          <InstallValue number="01" title={t('value_access_title')} description={t('value_access_description')} />
          <InstallValue number="02" title={t('value_focus_title')} description={t('value_focus_description')} />
          <InstallValue number="03" title={t('value_updates_title')} description={t('value_updates_description')} />
        </div>
      </div>
    </section>
  );
}

function InstallValue({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex min-h-44 flex-col bg-card p-5 sm:p-6 md:min-h-full">
      <span className="text-xs font-bold tabular-nums text-primary">{number}</span>
      <p className="mt-auto pt-8 text-base font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function usePWAInstall() {
  const context = useContext(PWAInstallContext);
  if (!context) throw new Error('usePWAInstall must be used inside PWAProvider');
  return context;
}
