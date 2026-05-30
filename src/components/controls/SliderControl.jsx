import React, { useId } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export function SliderControl({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  formatValue,
  helpText,
  className,
}) {
  const id = useId();
  const helpId = helpText ? `${id}-help` : undefined;
  const displayValue = formatValue ? formatValue(value) : value;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="text-sm font-mono text-foreground/70">{displayValue}</span>
      </div>
      <Slider
        id={id}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        aria-describedby={helpId}
      />
      {helpText && (
        <p id={helpId} className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
