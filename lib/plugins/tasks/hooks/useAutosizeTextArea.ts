'use client';

import { useEffect, useRef } from 'react';

export function useAutosizeTextArea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 90), 360)}px`;
  }, [value]);
  return ref;
}