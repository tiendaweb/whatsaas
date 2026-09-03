'use client';

import { Sidebar } from './Sidebar';
import type { ComponentProps } from 'react';

export function MobileDrawer(props: ComponentProps<typeof Sidebar> & { open: boolean; onClose: () => void }) {
  const { open, onClose, ...sidebar } = props;
  return (
    <>
      <div
        className={`fixed inset-0 z-20 bg-black/20 backdrop-blur-sm lg:hidden ${open ? '' : 'hidden'}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 left-0 z-30 h-full transition-all duration-300 ease-in-out lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar {...sidebar} />
      </div>
    </>
  );
}
