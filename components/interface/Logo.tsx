'use client';

import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranding } from '@/providers/branding-provider';

interface LogoProps {
  className?: string;
  showName?: boolean;
  compact?: boolean;
}

export default function Logo({ className, showName = true, compact = false }: LogoProps) {
  const { branding, identity } = useBranding();

  return (
    <div className={cn('flex items-center', compact ? 'gap-1.5' : 'gap-2', className)}>
      {branding?.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt={branding.name || 'Logo'}
          width={compact ? 24 : 32}
          height={compact ? 24 : 32}
          className={cn('object-cover', compact ? 'rounded-md' : 'rounded-lg')}
        />
      ) : (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center bg-primary',
            compact ? 'size-6 rounded-md' : 'size-8 rounded-lg',
          )}
        >
          <MessageCircle className={cn('text-primary-foreground', compact ? 'size-3.5' : 'size-5')} />
        </div>
      )}
      {showName && (
        <span className={cn('font-bold text-foreground whitespace-nowrap', compact ? 'text-sm' : 'text-lg')}>
          {identity.name}
        </span>
      )}
    </div>
  );
}
