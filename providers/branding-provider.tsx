'use client';

import { createContext, useContext } from 'react';
import { Branding } from '@/lib/db/schema';
import type { BrandIdentity } from '@/lib/branding/constants';

interface BrandingContextType {
  branding: Branding | null | undefined;
  identity: BrandIdentity;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({
  children,
  branding,
  identity,
}: {
  children: React.ReactNode;
  branding: Branding | null | undefined;
  identity: BrandIdentity;
}) {
  return (
    <BrandingContext.Provider value={{ branding, identity }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
}
