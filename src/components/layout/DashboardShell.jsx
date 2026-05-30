import React from 'react';
import { cn } from '@/lib/utils';

export function DashboardShell({ sidebar, children, className }) {
  return (
    <div className={cn('flex min-h-screen bg-background', className)}>
      {sidebar && (
        <aside className="w-64 shrink-0 border-r border-border bg-card overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)]">
          {sidebar}
        </aside>
      )}
      <main className="flex-1 min-w-0 p-6">
        {children}
      </main>
    </div>
  );
}
