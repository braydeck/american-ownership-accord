import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

const NAV_ITEMS = [
  { key: 'about', label: 'About' },
  { key: 'fiscal', label: 'National Balance Sheet' },
  { key: 'dashboard', label: 'Household Impact' },
  { key: 'inequality', label: 'Inequality' },
];

const LAB_ITEMS = [
  { key: 'household', label: 'Distributional Impact' },
  { key: 'wealth', label: 'Lifetime Wealth' },
  { key: 'retirement', label: 'Retirement Security' },
  { key: 'racial', label: 'Racial Wealth Gap' },
  { key: 'incometax', label: 'Income Tax Design' },
  { key: 'renttax', label: 'Rent Tax Optimizer' },
  { key: 'market', label: 'Market Stabilization' },
];

const LAB_KEYS = LAB_ITEMS.map((l) => l.key);

export function SiteHeader({ activePage, onNavigate }) {
  const isLabActive = LAB_KEYS.includes(activePage);
  const [labOpen, setLabOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 h-14 bg-primary flex items-center justify-between px-8 shadow-md">
      <button
        onClick={() => onNavigate('about')}
        className="text-base font-bold tracking-tight text-primary-foreground cursor-pointer bg-transparent border-none"
      >
        American Ownership Accord
      </button>

      <nav aria-label="Main navigation" className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            aria-current={activePage === item.key ? 'page' : undefined}
            className={cn(
              'bg-transparent border-none px-4 py-2 text-sm transition-colors',
              'border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-primary',
              activePage === item.key
                ? 'text-primary-foreground font-semibold border-b-accent'
                : 'text-primary-foreground/75 font-medium border-b-transparent hover:text-primary-foreground',
            )}
          >
            {item.label}
          </button>
        ))}

        <DropdownMenu open={labOpen} onOpenChange={setLabOpen}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Policy Lab simulations"
              className={cn(
                'bg-transparent border-none px-4 py-2 text-sm transition-colors',
                'border-b-2 flex items-center gap-1.5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-primary',
                isLabActive
                  ? 'text-primary-foreground font-semibold border-b-accent'
                  : 'text-primary-foreground/75 font-medium border-b-transparent hover:text-primary-foreground',
              )}
            >
              Policy Lab
              <span aria-hidden="true" className={cn(
                'text-[10px] transition-transform inline-block',
                labOpen && 'rotate-180',
              )}>
                {'\u25BE'}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {LAB_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.key}
                onClick={() => { onNavigate(item.key); setLabOpen(false); }}
                className={cn(
                  'cursor-pointer',
                  activePage === item.key && 'font-semibold',
                )}
              >
                {activePage === item.key && (
                  <span className="w-0.5 h-4 bg-accent rounded-full mr-2 shrink-0" />
                )}
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}

export { LAB_ITEMS, LAB_KEYS };
