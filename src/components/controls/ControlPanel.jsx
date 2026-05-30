import React from 'react';
import { cn } from '@/lib/utils';

export function ControlPanel({ children, className, columns = 2 }) {
  return (
    <div className={cn(
      'grid gap-4 p-4 bg-muted/50 rounded-lg border border-border',
      columns === 2 && 'grid-cols-2',
      columns === 1 && 'grid-cols-1',
      columns === 3 && 'grid-cols-3',
      className,
    )}>
      {children}
    </div>
  );
}

export function ControlGroup({ children, className, fullWidth = false }) {
  return (
    <div className={cn(fullWidth && 'col-span-full', className)}>
      {children}
    </div>
  );
}
