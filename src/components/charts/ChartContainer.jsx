import React from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

export function ChartContainer({
  title,
  subtitle,
  source,
  height = 420,
  children,
  className,
}) {
  return (
    <div className={cn('mt-10', className)}>
      {title && <h3 className="text-lg font-semibold tracking-tight">{title}</h3>}
      {subtitle && <p className="text-sm text-muted-foreground mt-1 mb-4">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
      {source && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{source}</p>
      )}
    </div>
  );
}
