import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { BASE_PARAMS, runFiscalSimulation, realGrantSeries, carbonDividendPerCapita } from '@/lib/fiscal-engine';
import { DEMO_KEYS, DEMOS, POP } from '@/lib/demographics';
import { getInc, getNW, BASE_ONLY, computeGini, healthLayer, accordIncomeAt, FISCAL_DEFAULTS as H_FX } from '@/lib/household-model';
import { HEALTH_2024, nheShareOfGdp } from '@/lib/health';
import { accordSchedule, startingBandTop } from '@/lib/income-tax';
import { fmtDollar } from '@/lib/format';

// Every figure below is computed from the same models the pages run, at the default settings, over
// the 35 years the fiscal model is built for. Household figures are 2024 dollars.
const ALL_PROVS = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const P = BASE_PARAMS;
const SIM = runFiscalSimulation(P, 35);
const M = SIM.milestones;
const ROW = y => SIM.rows[y - 1];
const real = (row, nominalT) => nominalT * 1e12 / row.priceLevel;
const REC5 = runFiscalSimulation({ ...P, recessionYear: 5 }, 35);
const GOAL_AFTER_RECESSION = REC5.milestones.fiscalGoalYear;
const REC5_Y35 = REC5.rows[34];
const REC5_PEAK_INT = Math.max(...REC5.rows.map(r => r.intToRev));
const LOW_Y35 = runFiscalSimulation({ ...P, growthCase: 'low' }, 35).rows[34];
const MAX_INT_SHARE = Math.max(...SIM.rows.map(r => r.intToRev));
// The lowest rate on income: the starting rate or the minimum rate on all income, whichever is higher.
const START_RATE = Math.max(P.incomeTaxLow, P.incomeTaxFloorRate ?? 0);
const startRatePct = `${+(START_RATE * 100).toFixed(1)}%`;
const START_BAND_K = Math.round(startingBandTop(accordSchedule({ brackets: P.incomeTaxBrackets ?? undefined,
  lowRate: P.incomeTaxLow, highRate: P.incomeTaxHigh, threshold: P.incomeTaxThreshold,
  riseEnd: P.incomeTaxRiseEnd, riseShape: P.incomeTaxRiseShape, floorRate: P.incomeTaxFloorRate })) / 1000);
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
const BOTTOM_HALF_GAIN_Y1 = avgGain(BOTTOM_HALF, 1, 1);
const BOTTOM_HALF_GAIN_Y30 = avgGain(BOTTOM_HALF, 30, 30);
const bottomHalfPct = y => {
  let a = 0, c = 0;
  for (const k of BOTTOM_HALF) { a += getInc(k, y, ALL_PROVS).total; c += getInc(k, y, BASE_ONLY).total; }
  return (a / c - 1) * 100;
};
const AHEAD_EVERY_YEAR = DEMO_KEYS
  .filter(k => Array.from({ length: 30 }, (_, i) => gain(k, i + 1)).every(g => g > 0))
  .reduce((s, k) => s + POP[k], 0);
const incAt = (k, y) => ({ accord: getInc(k, y, ALL_PROVS).total, cl: getInc(k, y, BASE_ONLY).total });
const MEDIAN_INC = incAt('P50', 30);
const INC_POINTS = [
  { label: 'Bottom 10% household income, Year 1', ...incAt('B10', 1) },
  { label: 'Median household income, Year 1', ...incAt('P50', 1) },
  { label: 'Bottom 10% household income, Year 30', ...incAt('B10', 30) },
  { label: 'Median household income, Year 30', ...incAt('P50', 30) },
];
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
const NHE_Y35 = nheShareOfGdp(35, P);
const HEALTH_RATE = `${+(P.healthContributionRate * 100).toFixed(1)}%`;
const HEALTH_RATE_ARTICLE = /^(8|11|18)(\D|$)/.test(HEALTH_RATE) ? 'an' : 'a';
const HOSPITAL_RATE = /^rate(\d+)/.exec(P.healthPaymentLevel)?.[1];
const HELD_HARMLESS = P.healthPaymentLevel.endsWith('-narrow') ? 'critical access and safety-net hospitals'
  : P.healthPaymentLevel.endsWith('-broad') ? 'rural and safety-net hospitals' : null;
// Median household's health line at Year 10: new wages, premiums and copays saved and coverage
// gained, less the health contribution and the taxes on the new wages (2024 dollars).
const MEDIAN_HEALTH_Y10 = (h => h.gain - h.tax + h.coverage)(healthLayer('P50', 10, H_FX, accordIncomeAt('P50', 10, ALL_PROVS, H_FX)));

const pct0 = v => `${Math.round(v)}%`;
const pctChange = (a, c) => `${a >= c ? '+' : ''}${Math.round((a - c) / c * 100)}%`;
const billions = v => `$${Math.round(v / 1e9)} billion`;
const millions = v => `${(v).toFixed(v < 10 ? 1 : 0)} million`;
const exact = v => `$${Math.round(v).toLocaleString()}`;

const COVERAGE_STATS = [
  { value: `${Math.round(HEALTH_2024.lawfulUninsured / 1e6)} million`, label: 'Uninsured residents who gain coverage in Year 1' },
  { value: '$0', label: 'Premiums and deductibles, in Medicare Plus or a private plan' },
  { value: `+${exact(MEDIAN_HEALTH_Y10)}`, label: 'A year for the median household by Year 10, net of the health contribution' },
];

const HERO_STATS = [
  { label: 'Federal debt as a share of the economy, today to Year 30', value: `${pct0(Y1.debtToGdp)} → ${pct0(Y30.debtToGdp)}`, sub: `Current law: ${pct0(Y30.clDebtToGdp)} at Year 30` },
  { label: 'Interest costs as a share of federal revenue, today to Year 35', value: `${pct0(intShare(Y1))} → ${pct0(intShare(Y35))}`, sub: `Current law: ${pct0(clIntShare(Y35))} at Year 35` },
  { label: 'Income gain for the bottom half of households in Year 1', value: `+${Math.round(bottomHalfPct(1))}%`, sub: `+${exact(BOTTOM_HALF_GAIN_Y1)} a household, rising to +${exact(BOTTOM_HALF_GAIN_Y30)} (+${Math.round(bottomHalfPct(30))}%) by Year 30` },
];

const SECTIONS = [
  {
    title: 'Income',
    lead: `${Math.round(AHEAD_EVERY_YEAR * 100)}% of households are ahead of current law on income in every year from 1 to 30.`,
    stats: INC_POINTS.map(s => ({ label: s.label, value: pctChange(s.accord, s.cl), sub: `${exact(s.accord)}, against ${exact(s.cl)} under current law` })),
    body: `Year 1 gains come mostly from the cash prebate: $${P.prebatePerCapita.toLocaleString()} a person, so $${(P.prebatePerCapita * 4).toLocaleString()} for a family of four, plus a $${Math.round(carbonDividendPerCapita(P.carbonRate))} carbon dividend each. By Year 30, fund dividends, worker profit-sharing and a ${startRatePct} income tax on the first $${START_BAND_K}K add to it. The top 10% pay more in every year.`,
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
    lead: `Every lawful resident under 65 is covered from birth or arrival, with no premium and no deductible. ${Math.round(HEALTH_2024.lawfulUninsured / 1e6)} million uninsured residents gain coverage in Year 1.`,
    stats: [
      { label: 'National health spending at Year 35', value: `${(NHE_Y35.accord * 100).toFixed(1)}% of GDP`, sub: `Current law: ${(NHE_Y35.currentLaw * 100).toFixed(1)}%` },
      { label: 'Health gain for the median household, Year 10', value: exact(MEDIAN_HEALTH_Y10), sub: 'New wages, premiums and copays saved, less the health contribution' },
      { label: 'Healthcare Reserve funding at Year 10', value: billions(HEALTH_RESERVE_Y10), sub: 'A year from fund dividends, paid into the Health Fund' },
    ],
    body: `Employers turn their premium payments into wages over two years. ${HEALTH_RATE_ARTICLE === 'an' ? 'An' : 'A'} ${HEALTH_RATE} health contribution on income above $${P.healthContribExempt.toLocaleString()} per tax filer replaces premiums and deductibles. Hospitals are paid ${HOSPITAL_RATE}% of Medicare rates for patients under 65${HELD_HARMLESS ? `, with ${HELD_HARMLESS} held harmless` : ''}, and health spending grows more slowly than under current law. Medical residency slots double, from 35,000 to 70,000 a year.`,
  },
  {
    title: 'The federal budget',
    lead: `Federal debt falls every year, from ${pct0(Y1.debtToGdp)} of GDP today to ${pct0(Y30.debtToGdp)} at Year 30. Under current law it rises to ${pct0(Y30.clDebtToGdp)}.`,
    stats: [
      { label: 'Federal debt at Year 35 after a 2008-scale recession in Year 5', value: pct0(REC5_Y35.debtToGdp), sub: `Current law: ${pct0(REC5_Y35.clDebtToGdp)}` },
      { label: 'Federal debt at Year 35 with slower growth', value: pct0(LOW_Y35.debtToGdp), sub: `Current law: ${pct0(LOW_Y35.clDebtToGdp)}` },
    ],
    body: `Interest costs ${MAX_INT_SHARE < 10 ? 'stay below 10% of federal revenue in every year and fall' : 'fall'} to ${pct0(intShare(Y35))} by Year 35, against ${pct0(clIntShare(Y35))} under current law. After a 2008-scale recession in Year 5, they peak at ${pct0(REC5_PEAK_INT)} and are back below 10% by Year ${GOAL_AFTER_RECESSION}.`,
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
  const a1 = getInc(k, 1, ALL_PROVS).total, c1 = getInc(k, 1, BASE_ONLY).total;
  return { k, label: DEMOS[k].label, accord: a, cl: c, pct: (a - c) / c, pct1: (a1 - c1) / c1, d1: a1 - c1, d30: a - c };
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
      <>The target <B>phases in from $10M to $20M in value, or from 50 to 100 workers</B>, whichever is higher</>,
      <>Its dividends go to <B>current workers</B> as profit-sharing and fund units</>,
    ],
  },
  {
    tag: 'Taxes',
    title: 'Taxes move to top incomes, consumption and land',
    points: [
      <>The <B>corporate income tax is repealed</B></>,
      <>Income tax is <B>{startRatePct} up to ${START_BAND_K}K</B>, rising smoothly to <B>{pct(P.incomeTaxHigh)} at ${Math.round(P.incomeTaxRiseEnd / 1000)}K</B>, with no deductions</>,
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
    title: 'Everyone is covered, with no premiums',
    points: [
      <>Every lawful resident under 65 is <B>covered automatically</B>, in Medicare Plus or a private plan</>,
      <>Employer premiums become <B>wages</B>, and {HEALTH_RATE_ARTICLE} <B>{HEALTH_RATE} health contribution</B> on income replaces premiums</>,
      <><B>One national rate schedule</B> for every plan, with treatment <B>within 30 days</B></>,
    ],
  },
  {
    tag: 'Budget',
    title: 'Debt falls every year',
    points: [
      <>Fund dividends and asset sales <B>pay down federal debt</B></>,
      <>Debt falls to <B>{pct0(Y35.debtToGdp)} of GDP</B> by Year 35</>,
      <>If debt reaches <B>{pct0(P.prebateIndexFloor * 100)} of GDP</B>, Congress decides how to use surpluses</>,
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
            means-tested aid, every resident under 65 is covered with no premiums, and housing is
            built at the pace the country grows. These models
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

      {/* Universal coverage */}
      <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-12">
        <div className="rounded-lg border border-border/70 border-l-4 border-l-accent bg-muted/30 p-5 sm:p-6">
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-accent mb-1.5">Healthcare</p>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-snug mb-2">
            Everyone under 65 is covered from birth or arrival
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
            No application, no premium and no deductible. Coverage stays the same when you change
            jobs, start a business or stop working. Employers turn their premium payments into
            wages, and {HEALTH_RATE_ARTICLE} {HEALTH_RATE} health contribution on income above
            ${P.healthContribExempt.toLocaleString()} per tax filer replaces premiums. National
            health spending is {(NHE_Y35.accord * 100).toFixed(1)}% of GDP at Year 35, against{' '}
            {(NHE_Y35.currentLaw * 100).toFixed(1)}% under current law.
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {COVERAGE_STATS.map(st => (
              <div key={st.label}>
                <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-accent">{st.value}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{st.label}</p>
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
          Change in household income against current law, in Year 1 and Year 30: pre-tax income
          plus the Accord's net change in taxes and cash transfers. The top 10% pay more in every
          year; their net worth still grows, more slowly than under current law.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Income group</th>
                <th className="py-2 pr-4 font-semibold text-right">Change, Year 1</th>
                <th className="py-2 pr-4 font-semibold text-right">Change, Year 30</th>
                <th className="py-2 font-semibold text-right">Income, Year 30</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map(r => (
                <tr key={r.k} className="border-b border-border/60">
                  <td className="py-2 pr-4">{r.label}</td>
                  {[[r.d1, r.pct1], [r.d30, r.pct]].map(([d, pc], i) => (
                    <td key={i} className={`py-2 pr-4 text-right tabular-nums font-semibold ${pc >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                      {pc >= 0 ? '+' : ''}{(pc * 100).toFixed(0)}%
                      <span className="block text-[11px] font-normal text-muted-foreground">{d >= 0 ? '+' : '-'}{fmtDollar(Math.abs(d))}</span>
                    </td>
                  ))}
                  <td className="py-2 text-right tabular-nums">
                    {fmtDollar(r.accord)}
                    <span className="block text-[11px] text-muted-foreground">vs {fmtDollar(r.cl)}</span>
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
