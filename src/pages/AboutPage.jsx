import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { BASE_PARAMS, runFiscalSimulation, realGrantSeries, carbonDividendPerCapita } from '@/lib/fiscal-engine';
import { DEMO_KEYS, DEMOS, POP } from '@/lib/demographics';
import { getInc, getNW, BASE_ONLY, computeGini } from '@/lib/household-model';
import { fmtDollar, fmtYr } from '@/lib/format';

// Every figure below is computed from the same models the pages run, at the default settings.
// Household figures are 2024 dollars.
const ALL_PROVS = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const P = BASE_PARAMS;
const SIM = runFiscalSimulation(P, 75);
const M = SIM.milestones;
const GOAL_AFTER_RECESSION = runFiscalSimulation({ ...P, recessionYear: 5 }, 75).milestones.fiscalGoalYear;
const ROW = y => SIM.rows.find(r => r.year === y);
const Y30 = ROW(30);

const gain = (k, y) => getInc(k, y, ALL_PROVS).total - getInc(k, y, BASE_ONLY).total;
const BOTTOM_HALF = ['B10', 'P10', 'P20', 'P30', 'P40'];
const avgGain = (keys, y0, y1) => {
  let s = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (const k of keys) { s += gain(k, y); n++; }
  return s / n;
};
const BOTTOM_HALF_GAIN = avgGain(BOTTOM_HALF, 1, 30);
// Share of households ahead on income in every year from 1 to 30.
const AHEAD_EVERY_YEAR = DEMO_KEYS
  .filter(k => Array.from({ length: 30 }, (_, i) => gain(k, i + 1)).every(g => g > 0))
  .reduce((s, k) => s + POP[k], 0);
const gini = fn => computeGini(DEMO_KEYS.map(k => ({ v: Math.max(fn(k), 0), w: POP[k] })));
const NW_GINI_30 = gini(k => getNW(k, 30, ALL_PROVS).total);
const NW_GINI_30_CL = gini(k => getNW(k, 30, BASE_ONLY).total);

const grants = realGrantSeries(P, 35);
const ACCOUNT_AT_18 = grants.slice(1, 19).reduce((b, [, g]) => b * 1.05 + g, 0);

const HEADLINE_METRICS = [
  { value: `${Math.round(Y30.debtToGdp)}%`, label: 'Debt to GDP, Year 30', sub: `${Math.round(Y30.clDebtToGdp)}% under current law` },
  { value: `+${fmtDollar(BOTTOM_HALF_GAIN)}`, label: 'Bottom half, income', sub: 'Average gain a year, Years 1–30' },
  { value: `${Math.round(AHEAD_EVERY_YEAR * 100)}%`, label: 'Households ahead', sub: 'On income, every year from 1 to 30' },
  { value: NW_GINI_30.toFixed(2), label: 'Wealth Gini, Year 30', sub: `${NW_GINI_30_CL.toFixed(2)} under current law` },
];

const TABLE_GROUPS = ['B10', 'P20', 'P40', 'P50', 'P70', 'P80', 'T10', 'T1'];
const TABLE_ROWS = TABLE_GROUPS.map(k => {
  const a = getInc(k, 30, ALL_PROVS).total, c = getInc(k, 30, BASE_ONLY).total;
  return { k, label: DEMOS[k].label, accord: a, cl: c, pct: (a - c) / c };
});

const pct = v => `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)}%`;
const PILLARS = [
  {
    title: 'The public owns a fifth of American companies',
    body: `A ${pct(P.growthTaxRate)} tax on each company's growth in value is paid in new shares to the American Capital Fund until the fund holds 21% of it. Every citizen gets units in the fund each year. A child born in Year 0 holds about ${fmtDollar(ACCOUNT_AT_18)} at 18.`,
  },
  {
    title: 'Workers own a fifth of their employer',
    body: `Every company worth $10M or more moves ${pct(P.equityExciseRate)} of its equity a year into a worker trust until the trust holds 21%. Its dividends go to current workers as profit-sharing and fund units.`,
  },
  {
    title: 'Taxes move to income at the top, consumption and land',
    body: `The corporate income tax is repealed. The income tax is 0% up to $${Math.round(P.incomeTaxThreshold / 1000)}K and rises smoothly to ${pct(P.incomeTaxHigh)} at $${Math.round(P.incomeTaxRiseEnd / 1000)}K, with no deductions. A ${pct(P.vatRate)} VAT, a ${pct(P.lvtRate)} tax on land value and a $${P.carbonRate}/ton carbon tax fund the rest.`,
  },
  {
    title: 'A cash floor replaces means-tested aid',
    body: `Every person receives $${P.prebatePerCapita.toLocaleString()} a year in cash, plus a $${Math.round(carbonDividendPerCapita(P.carbonRate))} carbon dividend. SNAP, the EITC, the child tax credit, TANF and WIC end, along with their phase-outs.`,
  },
];

const PRIMARY = [
  { key: 'fiscal', title: 'National Balance Sheet', desc: 'Revenue, spending, debt and fund holdings for 75 years, with every tax and spending setting adjustable' },
  { key: 'dashboard', title: 'Household Impact', desc: 'Income, net worth and taxes for thirteen income groups, from the bottom 10% to the largest fortunes' },
  { key: 'inequality', title: 'Inequality', desc: 'Income, wealth and consumption Ginis, and how much each provision moves them' },
];

const LAB = [
  { key: 'designsearch', title: 'Design Search', desc: 'Thousands of tax and transfer designs tested against the fiscal goal, recessions and household gains' },
  { key: 'incometax', title: 'Income Tax Design', desc: 'Income tax schedules and their effect on each income group' },
  { key: 'lifetimegrants', title: 'Lifetime Grants', desc: 'Citizen fund accounts from birth to 65 by birth cohort, 2024 dollars' },
  { key: 'household', title: 'Distributional Impact', desc: 'A calculator for one household\'s net change under the Accord' },
  { key: 'wealth', title: 'Lifetime Wealth', desc: 'Monte Carlo simulation of wealth from birth to retirement' },
  { key: 'retirement', title: 'Retirement Security', desc: 'Retirement adequacy across income quintiles' },
  { key: 'racial', title: 'Racial Wealth Gap', desc: 'Wealth paths for White, Black and Hispanic households' },
  { key: 'renttax', title: 'Rent Tax Optimizer', desc: 'Land, carbon and financial transaction tax portfolios' },
  { key: 'market', title: 'Market Stabilization', desc: 'How a long-term public holder changes crash depth' },
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

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-muted-foreground mb-4">{children}</p>
  );
}

export default function AboutPage({ onNavigate }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 80px)',
          }}
        />
        <div className="relative max-w-3xl mx-auto text-center px-4 sm:px-8 pt-20 sm:pt-24 pb-16 sm:pb-20">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-accent mb-6">
            Working Draft
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tighter leading-[1.1] mb-5">
            The American<br />Ownership Accord
          </h1>
          <p className="text-base text-primary-foreground/70 leading-relaxed max-w-xl mx-auto mb-10">
            Citizens and workers become co-owners of American companies, the tax system moves from
            corporate profits to top incomes, consumption and land, and a cash floor replaces
            means-tested aid. These models project what that does to the federal budget and to
            households.
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
            <p className="text-4xl font-extrabold tracking-tight text-accent">{fmtYr(M.fiscalGoalYear)}</p>
            <p className="text-sm text-primary-foreground/60 mt-2 max-w-md mx-auto">
              Interest falls below 10% of federal revenue and debt keeps shrinking as a share of
              GDP in every later year. {fmtYr(GOAL_AFTER_RECESSION)} if a recession hits in Year 5.
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-16 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {HEADLINE_METRICS.map((m) => (
            <div key={m.label} className="text-center py-4">
              <p className="text-3xl font-extrabold tracking-tight">{m.value}</p>
              <p className="text-sm font-semibold mt-2">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-[120px] mx-auto">
        <Separator className="bg-accent/40" />
      </div>

      {/* Who gains and who pays */}
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-12 pb-4">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3">
          The bottom 90% gain, the top 10% pay
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          Household income at Year 30: pre-tax income plus the Accord's net change in taxes and
          cash transfers, including fund withdrawals and worker dividends. The top 10% pay more in
          every year. Their net worth still grows,
          more slowly than under current law.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Income group</th>
                <th className="py-2 pr-4 font-semibold text-right">Accord</th>
                <th className="py-2 pr-4 font-semibold text-right">Current law</th>
                <th className="py-2 font-semibold text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map(r => (
                <tr key={r.k} className="border-b border-border/60">
                  <td className="py-2 pr-4">{r.label}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtDollar(r.accord)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{fmtDollar(r.cl)}</td>
                  <td className={`py-2 text-right tabular-nums font-semibold ${r.pct >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                    {r.pct >= 0 ? '+' : ''}{(r.pct * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">2024 dollars. Groups are income percentiles of households.</p>
      </div>

      {/* How it works */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-12 pb-4">
        <SectionLabel>What the Accord does</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PILLARS.map(p => (
            <div key={p.title}>
              <h3 className="text-base font-semibold tracking-tight mb-1.5">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Explore Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-14 pb-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-10">
          Explore the models
        </h2>

        <SectionLabel>Main models</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {PRIMARY.map((s) => (
            <SimCard key={s.key} item={s} onNavigate={onNavigate} />
          ))}
        </div>

        <SectionLabel>Policy Lab</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LAB.map((s) => (
            <SimCard key={s.key} item={s} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      <div className="text-center py-10 border-t border-border">
        <p className="text-xs text-muted-foreground tracking-wide">
          American Ownership Accord · Working Draft
        </p>
      </div>
    </div>
  );
}
