import React from 'react';
import { Badge } from '@/components/ui/badge';

interface DateSeparatorProps {
  date: Date;
  label: string;
}

export function DateSeparator({ label }: DateSeparatorProps) {
  return (
    <div className="flex justify-center my-4 sticky top-2 z-10 opacity-100">
      <Badge variant="secondary" className="text-xs shadow-sm backdrop-blur-sm">
        {label}
      </Badge>
    </div>
  );
}