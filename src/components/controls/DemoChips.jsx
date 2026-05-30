import React from 'react';
import { cn } from '@/lib/utils';

export function DemoChips({ demos, demoKeys, enabled, onToggle, className }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {demoKeys.map((k) => {
        const d = demos[k];
        const on = enabled.includes(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium border transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              on
                ? 'text-white border-transparent'
                : 'bg-muted text-foreground/50 border-border',
            )}
            style={on ? { backgroundColor: d.color } : undefined}
          >
            {d.short}
          </button>
        );
      })}
    </div>
  );
}
