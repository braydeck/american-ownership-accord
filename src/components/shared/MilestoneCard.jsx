import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function MilestoneCard({ label, value, sub, className }) {
  return (
    <Card className={cn('py-2', className)}>
      <CardContent className="px-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tracking-tight mt-0.5">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>}
      </CardContent>
    </Card>
  );
}
