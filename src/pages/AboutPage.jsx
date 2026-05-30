import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const METRICS = [
  { value: 'Year 16', label: 'Fiscal Crossover', sub: 'Revenue exceeds spending' },
  { value: '$1.7M', label: 'Median Net Worth', sub: 'By Year 30' },
  { value: '99%+', label: 'Households Better Off', sub: 'By Year 5' },
  { value: '0.0%', label: 'Retirement Inadequacy', sub: 'All quintiles' },
];

const PRIMARY = [
  { key: 'fiscal', title: 'National Balance Sheet', desc: '35-year sovereign balance sheet projection — deficit, debt, AMCF equity, and fiscal crossover' },
  { key: 'dashboard', title: 'Household Impact', desc: 'Interactive dashboard showing wealth, income, and distributional impact across demographics' },
  { key: 'inequality', title: 'Inequality', desc: 'Three Gini variants, security floor analysis, and provision decomposition — how the Accord reshapes the distribution' },
];

const LAB = [
  { key: 'household', title: 'Distributional Impact', desc: 'Personal calculator showing your household\'s net change under the Accord' },
  { key: 'wealth', title: 'Lifetime Wealth', desc: 'Monte Carlo simulation of wealth accumulation from birth to retirement' },
  { key: 'retirement', title: 'Retirement Security', desc: 'Retirement adequacy analysis across all income quintiles' },
  { key: 'racial', title: 'Racial Wealth Gap', desc: '30-year convergence projection for White, Black, and Hispanic households' },
  { key: 'incometax', title: 'Income Tax Design', desc: 'Two-rate income tax optimizer with distributional impact analysis' },
  { key: 'renttax', title: 'Rent Tax Optimizer', desc: 'LVT, carbon, and financial transaction tax portfolio builder' },
  { key: 'market', title: 'Market Stabilization', desc: 'Historical crash dampening model with AMCF float reduction' },
];

function SimCard({ item, onNavigate }) {
  return (
    <Card
      role="button"
      tabIndex="0"
      className="cursor-pointer transition-all hover:border-accent hover:shadow-md group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => onNavigate(item.key)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(item.key); } }}
    >
      <CardContent className="pt-6 pb-5 px-6">
        <h3 className="text-base font-semibold tracking-tight mb-2">{item.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
        <p className="mt-3 text-sm font-semibold text-accent tracking-wide group-hover:translate-x-0.5 transition-transform">
          Explore →
        </p>
      </CardContent>
    </Card>
  );
}

export default function AboutPage({ onNavigate }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-primary text-primary-foreground">
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 80px)',
          }}
        />
        <div className="relative max-w-3xl mx-auto text-center px-8 pt-24 pb-20">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-6">
            Working Draft
          </p>
          <h1 className="text-5xl font-extrabold tracking-tighter leading-[1.1] mb-5">
            The American<br />Ownership Accord
          </h1>
          <p className="text-base text-primary-foreground/60 leading-relaxed max-w-xl mx-auto mb-10">
            A simulation suite modeling universal wealth building through sovereign equity,
            worker ownership, and fiscal consolidation.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button
              size="lg"
              onClick={() => onNavigate('fiscal')}
              className="bg-accent text-primary font-bold hover:bg-accent/90 px-8"
            >
              National Balance Sheet
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => onNavigate('dashboard')}
              className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 px-8"
            >
              Household Impact
            </Button>
          </div>

          <div className="mt-14 pt-8 border-t border-primary-foreground/10">
            <p className="text-4xl font-extrabold tracking-tight text-accent">Year 16</p>
            <p className="text-sm text-primary-foreground/40 mt-2">
              Fiscal Crossover — the year total revenue structurally exceeds total spending
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="max-w-4xl mx-auto px-8 pt-16 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {METRICS.map((m, i) => (
            <div key={i} className="text-center py-4">
              <p className="text-3xl font-extrabold tracking-tight">{m.value}</p>
              <p className="text-sm font-semibold mt-2">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-[120px] mx-auto">
        <Separator className="bg-accent/40" />
      </div>

      {/* Explore Section */}
      <div className="max-w-4xl mx-auto px-8 pt-12 pb-16">
        <h2 className="text-3xl font-extrabold tracking-tight text-center mb-2">
          Explore the Simulations
        </h2>
        <p className="text-sm text-muted-foreground text-center max-w-md mx-auto mb-12">
          Nine interactive models spanning fiscal policy, distributional impact, and long-term wealth dynamics.
        </p>

        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-muted-foreground mb-4">
          The Three Pillars
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {PRIMARY.map((s) => (
            <SimCard key={s.key} item={s} onNavigate={onNavigate} />
          ))}
        </div>

        <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-muted-foreground mb-4">
          Policy Lab
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LAB.map((s) => (
            <SimCard key={s.key} item={s} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-10 border-t border-border">
        <p className="text-xs text-muted-foreground tracking-wide">
          American Ownership Accord — Working Draft
        </p>
      </div>
    </div>
  );
}
