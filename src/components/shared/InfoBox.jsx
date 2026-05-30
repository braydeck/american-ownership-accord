import React from 'react';
import { cn } from '@/lib/utils';

export function InfoBox({ children, className }) {
  return (
    <div className={cn(
      'text-xs text-muted-foreground leading-relaxed p-4 bg-muted/50 rounded-lg border border-border',
      className,
    )}>
      {children}
    </div>
  );
}
