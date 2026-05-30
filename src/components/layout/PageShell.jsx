import React from 'react';
import { cn } from '@/lib/utils';

export function PageShell({ children, className }) {
  return (
    <div className={cn('max-w-5xl mx-auto px-8 py-10 bg-card', className)}>
      {children}
    </div>
  );
}
