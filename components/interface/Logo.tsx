'use client';

import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranding } from '@/providers/branding-provider';

interface LogoProps {
  className?: string;
  showName?: boolean;
}

export default function Logo({ className, showName = true }: LogoProps) {
  const { branding } = useBranding();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {branding?.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt={branding.name || 'Logo'}
          width={32}
          height={32}
          className="rounded-lg object-cover"
        />
      ) : (
        <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <MessageCircle className="text-primary-foreground h-5 w-5" />
        </div>
      )}
      {showName && (
        <span className="font-bold text-lg text-foreground whitespace-nowrap">
          {branding?.name || 'WhatSaaS'}
        </span>
      )}
    </div>
  );
}