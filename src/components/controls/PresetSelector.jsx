import React from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export function PresetSelector({ presets, value, onChange, className }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => { if (v) onChange(v); }}
      className={cn('flex flex-wrap gap-1.5', className)}
    >
      {presets.map((p) => (
        <ToggleGroupItem
          key={p.key}
          value={p.key}
          className="text-xs px-3 py-1.5"
        >
          {p.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
