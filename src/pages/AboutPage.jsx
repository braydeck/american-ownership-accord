import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { BASE_PARAMS, runFiscalSimulation, realGrantSeries, carbonDividendPerCapita } from '@/lib/fiscal-engine';
import { DEMO_KEYS, DEMOS, POP } from '@/lib/demographics';
import { getInc, getNW, BASE_ONLY, computeGini } from '@/lib/household-model';
import { fmtDollar } from '@/lib/format';

// Every figure below is computed from the same models the pages run, at the default settings, over
// the 35 years the fiscal model is built for. Household figures are 2024 dollars.
const ALL_PROVS = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const P = BASE_PARAMS;
const SIM = runFiscalSimulation(P, 35);
const M = SIM.milestones;
const ROW = y => SIM.rows[y - 1];
const real = (row, nominalT) => nominalT * 1e12 / row.priceLevel;
const GOAL_AFTER_RECESSION = runFiscalSimulation({ ...P, recessionYear: 5 }, 35).milestones.fiscalGoalYear;
const NO_IMMIGRATION = realGrantSeries({ ...P, abundanceFloorOn: false }, 35);
const GRANTS = realGrantSeries(P, 35);

// Households
const gain = (k, y) => getInc(k, y, ALL_PROVS).total - getInc(k, y, BASE_ONLY).total;
const BOTTOM_HALF = ['B10', 'P10', 'P20', 'P30', 'P40'];
const avgGain = (keys, y0, y1) => {
  let s = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (const k of keys) { s += gain(k, y); n++; }
  return s / n;
};
const BOTTOM_HALF_GAIN = avgGain(BOTTOM_HALF, 1, 30);
const AHEAD_EVERY_YEAR = DEMO_KEYS
  .filter(k => Array.from({ length: 30 }, (_, i) => gain(k, i + 1)).every(g => g > 0))
  .reduce((s, k) => s + POP[k], 0);
const MEDIAN_INC = { accord: getInc('P50', 30, ALL_PROVS).total, cl: getInc('P50', 30, BASE_ONLY).total };
const MEDIAN_NW = { accord: getNW('P50', 30, ALL_PROVS).total, cl: getNW('P50', 30, BASE_ONLY).total };
const B10_NW = { accord: getNW('B10', 30, ALL_PROVS).total, cl: getNW('B10', 30, BASE_ONLY).total };
const gini = fn => computeGini(DEMO_KEYS.map(k => ({ v: Math.max(fn(k), 0), w: POP[k] })));
const NW_GINI = { accord: gini(k => getNW(k, 30, ALL_PROVS).total), cl: gini(k => getNW(k, 30, BASE_ONLY).total) };
const ACCOUNT_AT_18 = GRANTS.slice(1, 19).reduce((b, [, g]) => b * 1.05 + g, 0);

// Fiscal path
const Y1 = ROW(1), Y10 = ROW(10), Y30 = ROW(30), Y35 = ROW(35);
const intShare = r => r.intToRev;
const clIntShare = r => r.clInterest / r.clRev * 100;

// Housing and health
const SHORTAGE_CLOSED = SIM.rows.find(r => r.year > 1 && r.housingShortageM <= 0)?.year;
const HEALTH_RESERVE_Y10 = real(Y10, Y10.healthcareAMCF);
const HEALTH_SAVINGS_Y10 = (P.rateSettingSavings + P.drugSavings) * real(Y10, Y10.nominalGdp);

const pct0 = v => `${Math.round(v)}%`;
const pctChange = (a, c) => `${a >= c ? '+' : ''}${Math.round((a - c) / c * 100)}%`;
const billions = v => `$${Math.round(v / 1e9)} billion`;
const millions = v => `${(v).toFixed(v < 10 ? 1 : 0)} million`;
const exact = v => `$${Math.round(v).toLocaleString()}`;

const HERO_STATS = [
  { label: 'Federal debt as a share of the economy, today to Year 30', value: `${pct0(Y1.debtToGdp)} → ${pct0(Y30.debtToGdp)}`, sub: `Current law: ${pct0(Y30.clDebtToGdp)} at Year 30` },
  { label: 'Year interest costs fall below 10% of federal revenue', value: `Year ${M.fiscalGoalYear}`, sub: `From ${pct0(intShare(Y1))} today. Current law: ${pct0(clIntShare(Y10))} at Year 10` },
  { label: 'Average yearly income gain for the bottom half of households', value: `+${exact(BOTTOM_HALF_GAIN)}`, sub: 'Years 1–30, against current law' },
];

const SECTIONS = [
  {
    title: 'Income',
    lead: `${Math.round(AHEAD_EVERY_YEAR * 100)}% of households are ahead of current law on income in every year from 1 to 30.`,
    stats: [
      { label: 'Average yearly income gain, bottom half of households', value: `+${exact(BOTTOM_HALF_GAIN)}`, sub: 'Years 1–30, 2024 dollars' },
      { label: 'Change in median household income by Year 30', value: pctChange(MEDIAN_INC.accord, MEDIAN_INC.cl), sub: `${fmtDollar(MEDIAN_INC.accord)}, against ${fmtDollar(MEDIAN_INC.cl)} under current law` },
    ],
    body: `Gains come from the cash prebate of $${P.prebatePerCapita.toLocaleString()} a person a year, a $${Math.round(carbonDividendPerCapita(P.carbonRate))} carbon dividend, a 0% income tax on the first $${Math.round(P.incomeTaxThreshold / 1000)}K, worker profit-sharing and fund dividends. The top 10% pay more in every year.`,
  },
  {
    title: 'Wealth',
    lead: `The median household's net worth reaches ${fmtDollar(MEDIAN_NW.accord)} by Year 30, against ${fmtDollar(MEDIAN_NW.cl)} under current law.`,
    stats: [
      { label: 'Fund account at 18 for a child born in Year 0', value: exact(ACCOUNT_AT_18), sub: 'Yearly grants plus a 5% real return' },
      { label: 'Wealth inequality at Year 30 (Gini, lower is more equal)', value: NW_GINI.accord.toFixed(2), sub: `${NW_GINI.cl.toFixed(2)} under current law` },
    ],
    body: `The bottom 10% hold ${fmtDollar(B10_NW.accord)} at Year 30 against ${fmtDollar(B10_NW.cl)}. Wealth comes from units in the American Capital Fund, which holds ${pct0(Y30.amcfOwnershipPct)} of corporate equity at Year 30 for every resident, and from worker trusts holding ${pct0(Y30.workerOwnershipPct)}.`,
  },
  {
    title: 'Homes',
    lead: `The National Housing Corporation builds about ${millions(Y30.nhcStockM)} homes by Year 30, and the existing shortage closes by Year ${SHORTAGE_CLOSED}.`,
    stats: [
      { label: 'Extra homes private builders add each year, Year 10', value: `${(Y10.privateExtraUnitsK / 1000).toFixed(1)} million`, sub: 'Above current-law construction' },
      { label: 'Rents at Year 30', value: `${Y30.rentVsCurrentLawPct}%`, sub: 'Compared with current law' },
    ],
    body: 'NHC homes are mixed-income and built on land the public keeps. Federal grants go to states and cities that allow mixed-use, mixed-density housing by right, and the land value tax pushes owners to build on held land. Construction keeps pace with immigration by law.',
  },
  {
    title: 'Healthcare',
    lead: 'A public option, Medicare Plus, competes with private insurers, with a guarantee of treatment within 30 days.',
    stats: [
      { label: 'Medical residency slots a year', value: '35K → 70K', sub: 'Doubled to train more doctors' },
      { label: 'Healthcare Reserve funding at Year 10', value: billions(HEALTH_RESERVE_Y10), sub: 'A year, paid from fund dividends' },
    ],
    body: `National rate setting and expanded drug-price negotiation save about ${billions(HEALTH_SAVINGS_Y10)} a year by Year 10. Hospitals are paid to keep 15% of ICU beds ready for surges.`,
  },
  {
    title: 'The federal budget',
    lead: `Federal debt falls every year, from ${pct0(Y1.debtToGdp)} of GDP today to ${pct0(Y30.debtToGdp)} at Year 30. Under current law it rises to ${pct0(Y30.clDebtToGdp)}.`,
    stats: [
      { label: "Year the government's fund holdings exceed federal debt", value: `Year ${M.netCreditorYear}`, sub: 'Never under current law' },
      { label: 'Year federal debt reaches its 25% floor', value: `Year ${M.debtFloorYear}`, sub: 'Congress decides how to use surpluses beyond it' },
    ],
    body: `Interest costs fall below 10% of federal revenue by Year ${M.fiscalGoalYear}, against ${pct0(clIntShare(Y35))} under current law at Year 35. After a 2008-scale recession in Year 5, they are back below 10% by Year ${GOAL_AFTER_RECESSION}.`,
  },
  {
    title: 'Immigration',
    lead: `The United States admits immigrants equal to 1.2% of its population every year. The population reaches ${Math.round(Y30.population / 1e6)} million by Year 30.`,
    stats: [
      { label: 'Fund grant per person at Year 30', value: exact(GRANTS[30][1]), sub: 'With the added immigration, 2024 dollars' },
      { label: 'The same grant without the added immigration', value: exact(NO_IMMIGRATION[30][1]), sub: 'Immigration raises grants for everyone' },
    ],
    body: 'Immigrants add more to the economy than their share of the population, so they raise fund grants for everyone. New residents receive grants and the prebate from arrival, and the budget counts their public-service and infrastructure costs.',
  },
];

const TABLE_GROUPS = ['B10', 'P20', 'P40', 'P50', 'P70', 'P80', 'T10', 'T1'];
const TABLE_ROWS = TABLE_GROUPS.map(k => {
  const a = getInc(k, 30, ALL_PROVS).total, c = getInc(k, 30, BASE_ONLY).total;
  return { k, label: DEMOS[k].label, accord: a, cl: c, pct: (a - c) / c };
});

const pct = v => `${+(v * 100).toFixed(1)}%`;
// Topline changes: a tag, a headline, and two or three short lines with the operative term in bold.
const B = ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>;
const PILLARS = [
  {
    tag: 'Ownership',
    title: 'The public owns a fifth of American companies',
    points: [
      <>A <B>{pct(P.growthTaxRate)} tax on each company's growth</B> in value, paid in new shares</>,
      <>Shares go to the <B>American Capital Fund</B> until it holds 21% of the company</>,
      <><B>Every lawful resident</B> gets fund units each year; units return to the fund at death</>,
    ],
  },
  {
    tag: 'Ownership',
    title: 'Workers own a fifth of their employer',
    points: [
      <>Companies worth <B>$10M or more</B> move <B>{pct(P.equityExciseRate)} of their equity</B> a year into a worker trust</>,
      <>The trust stops growing at <B>21%</B></>,
      <>Its dividends go to <B>current workers</B> as profit-sharing and fund units</>,
    ],
  },
  {
    tag: 'Taxes',
    title: 'Taxes move to top incomes, consumption and land',
    points: [
      <>The <B>corporate income tax is repealed</B></>,
      <>Income tax is <B>0% up to ${Math.round(P.incomeTaxThreshold / 1000)}K</B>, rising smoothly to <B>{pct(P.incomeTaxHigh)} at ${Math.round(P.incomeTaxRiseEnd / 1000)}K</B>, with no deductions</>,
      <>A <B>{pct(P.vatRate)} VAT</B>, a <B>{pct(P.lvtRate)} land value tax</B> and a <B>${P.carbonRate}/ton carbon tax</B></>,
    ],
  },
  {
    tag: 'Cash',
    title: 'A cash floor replaces means-tested aid',
    points: [
      <><B>${P.prebatePerCapita.toLocaleString()} a person a year</B> in cash, rising with prices and income growth</>,
      <>Plus a <B>${Math.round(carbonDividendPerCapita(P.carbonRate))} carbon dividend</B></>,
      <>Replaces <B>SNAP, the EITC, the child tax credit, TANF and WIC</B>, and their phase-outs</>,
    ],
  },
  {
    tag: 'Housing',
    title: 'Homes are built as fast as the country grows',
    points: [
      <>The National Housing Corporation builds <B>mixed-income homes on public land</B></>,
      <>Sized each year to <B>new households and the remaining shortage</B></>,
      <>Grants reward cities that allow <B>mixed-use housing by right</B></>,
    ],
  },
  {
    tag: 'Immigration',
    title: 'Immigration grows by law',
    points: [
      <><B>1.2% of the population</B> admitted every year</>,
      <>Fund grants and the prebate <B>from arrival</B></>,
      <>The budget pays for <B>their public services and infrastructure</B></>,
    ],
  },
  {
    tag: 'Health',
    title: 'A public option and more doctors',
    points: [
      <><B>Medicare Plus</B> competes with private insurers, with treatment <B>within 30 days</B></>,
      <><B>Medical residency slots double</B></>,
      <>Fund dividends pay for a <B>Healthcare Reserve</B></>,
    ],
  },
  {
    tag: 'Budget',
    title: 'Debt falls to a safe floor',
    points: [
      <>Fund dividends and asset sales <B>pay down federal debt</B></>,
      <>Debt stops falling at <B>25% of GDP</B></>,
      <>Beyond the floor, <B>Congress decides</B> how to use surpluses</>,
    ],
  },
];

const PRIMARY = [
  { key: 'fiscal', title: 'National Balance Sheet', desc: 'Revenue, spending, debt and fund holdings over 35 years, with every tax and spending setting adjustable' },
  { key: 'dashboard', title: 'Household Impact', desc: 'Income, net worth and taxes for thirteen income groups, from the bottom 10% to the largest fortunes' },
  { key: 'inequality', title: 'Inequality', desc: 'Income, wealth and consumption Ginis, and how much each provision moves them' },
];

const LAB = [
  { key: 'designsearch', title: 'Design Search', desc: 'Thousands of tax and transfer designs tested against interest costs, recessions and household gains' },
  { key: 'incometax', title: 'Income Tax Design', desc: 'Income tax schedules and their effect on each income group' },
  { key: 'lifetimegrants', title: 'Lifetime Grants', desc: 'Fund accounts from birth to 65 by birth cohort, 2024 dollars' },
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

function ResultSection({ s }) {
  return (
    <div className="py-8 border-b border-border/60 last:border-b-0">
      <SectionLabel>{s.title}</SectionLabel>
      <p className="text-lg sm:text-xl font-semibold tracking-tight leading-snug mb-5">{s.lead}</p>
      <div className="grid grid-cols-2 gap-6 mb-4">
        {s.stats.map(st => (
          <div key={st.label} className="rounded-lg border border-border/70 p-4">
            <p className="text-sm font-semibold leading-snug">{st.label}</p>
            <p className="text-3xl font-extrabold tracking-tight mt-2">{st.value}</p>
            <p className="text-xs text-muted-foreground mt-2 leading-snug">{st.sub}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
    </div>
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
            Residents and workers become co-owners of American companies, the tax system moves from
            corporate profits to top incomes, consumption and land, a cash floor replaces
            means-tested aid, and housing is built at the pace the country grows. These models
            project what that does to the federal budget and to households over 35 years.
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

          <div className="mt-14 pt-8 border-t border-primary-foreground/10 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {HERO_STATS.map(st => (
              <div key={st.label}>
                <p className="text-sm font-semibold leading-snug">{st.label}</p>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-accent mt-2">{st.value}</p>
                <p className="text-xs text-primary-foreground/60 mt-2">{st.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-16 pb-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-6">What the Accord changes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map(p => (
            <div key={p.title} className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-accent mb-1.5">{p.tag}</p>
              <h3 className="text-[15px] font-bold tracking-tight leading-snug mb-2.5">{p.title}</h3>
              <ul className="space-y-1.5">
                {p.points.map((pt, i) => (
                  <li key={i} className="text-[13px] text-muted-foreground leading-snug pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[0.55em] before:w-1 before:h-1 before:rounded-full before:bg-muted-foreground/60">{pt}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-10">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">What it does for households and the budget</h2>
      </div>

      {/* Results */}
      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-4 pb-4">
        {SECTIONS.map(s => <ResultSection key={s.title} s={s} />)}
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
          every year. Their net worth still grows, more slowly than under current law.
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
