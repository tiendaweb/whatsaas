'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useBranding } from '@/providers/branding-provider';

type LogoProps = {
  className?: string;
  showName?: boolean;
};

export default function Logo({ className, showName = true }: LogoProps) {
  const { branding } = useBranding();
  const siteName = branding?.name || 'WhatsPro';
  const logoUrl = branding?.logoUrl;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary ring-1 ring-border/60">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={`${siteName} logo`}
            fill
            sizes="40px"
            className="object-contain p-1.5"
          />
        ) : (
          <span className="text-lg font-bold uppercase">{siteName.slice(0, 1)}</span>
        )}
      </div>

      {showName ? (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-semibold tracking-tight text-foreground">
            {siteName}
          </span>
          <span className="text-xs text-muted-foreground">WhatsApp CRM</span>
        </div>
      ) : null}
    </div>
  );
}
