import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ReferenceLine,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { InfoBox } from '@/components/shared/InfoBox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';

// ─── Formatting ──────────────────────────────────────────────────────────────

const fmtK = v => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}K`;
const fmtKShort = v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}K`;

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const WealthTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>Year {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: {fmtK(p.value)}
        </p>
      ))}
    </div>
  );
};

const RatioTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>Year {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: {p.value?.toFixed(2)}:1
        </p>
      ))}
    </div>
  );
};

// ─── Model Parameters ────────────────────────────────────────────────────────

// Stock portfolio drag from codetermination transfer + EV growth tax (20% of new equity creation)
const STOCK_DRAG  = 0.02;
// AMCF fund real return (S&P 500 long-run real ~5-7%; conservative 5%)
const AMCF_RETURN = 0.05;
// PSU dividend yield post-CIT abolition (dividends rise when corporate income tax removed)
const PSU_DIV_YLD = 0.035;
// Share of private-sector workers at firms with EV > $10M (subject to Equity Excise Tax)
const PSU_ELIG    = 0.70;
// Weighted avg PSU equity per eligible worker at equilibrium:
//   50% at large firms (EV/emp ~$500K × 20% = $100K) +
//   30% at mid-market (EV/emp ~$300K × 20% = $60K) + 20% exempt = $68K ≈ $65K
const PSU_EQUIL   = 65000;
const PSU_RAMP_YRS = 5;       // years to reach full PSU equilibrium (4%/yr Equity Excise)
const LVT_RENT_MAX = 0.25;    // 25% rent reduction at full LVT phase-in (calibrated to 10% LVT rate)
const LVT_RAMP_YRS = 10;      // years to full LVT housing supply effect

// AMCF per-capita grant schedule (2024 real dollars)
// Calibrated to Sim 6 validated outputs. AMCF self-funds by Yr 9 (~11% ownership);
// hits 20% ownership cap at Yr 19, then tracks 20% of total EV organically.
// Grants grow uncapped: $1,066 at Yr 10, $2,678 at Yr 15, $5,597 at Yr 20, $14,784 at Yr 30.
const _S6_PTS = [[9,800],[10,1066],[15,2678],[20,5597],[25,8958],[30,14784],[35,25111]];
function amcfGrantPerCapita(year) {
  if (year <= 3)  return 500;
  if (year <= 6)  return 550;
  if (year <= 9)  return 800;
  for (let i = 1; i < _S6_PTS.length; i++) {
    const [x0, y0] = _S6_PTS[i - 1], [x1, y1] = _S6_PTS[i];
    if (year <= x1) return Math.round(y0 + (y1 - y0) * (year - x0) / (x1 - x0));
  }
  return Math.round(25111 * Math.pow(1.10, year - 35));
}

// ─── Demographic Data (Federal Reserve SCF 2022 / Census / BLS) ──────────────

const GROUPS = {
  white: {
    label: 'White',
    // SCF 2022 median household net worth
    startWealth: 285000,
    // Census median household income
    income: 81000,
    // Asset allocation (SCF)
    stockFrac: 0.23, reFrac: 0.42, retFrac: 0.12,
    // Homeownership rate (Census)
    homeOwn: 0.75,
    // Average household size
    hhSize: 2.5,
    // Employment rate (BLS)
    empRate: 0.72,
    // Savings rate (BLS Consumer Expenditure Survey)
    savingsRate: 0.12,
    // 401(k) participation rate
    k401Part: 0.60,
    // Median renter annual rent
    annualRent: 18000,
    // Consumption as share of income (BLS CES)
    consumeRatio: 0.70,
    // Slight income tax increase above median under Accord (Sections 4.2-4.3)
    incomeTaxAdj: 0.02,
    // Share of net prebate benefit saved (higher for white due to higher income)
    prebateSaveRate: 0.15,
  },
  black: {
    label: 'Black',
    startWealth:  44900,
    income: 56000,
    stockFrac: 0.045, reFrac: 0.43, retFrac: 0.35,
    homeOwn: 0.45,
    hhSize: 2.6,
    empRate: 0.65,
    savingsRate: 0.06,
    k401Part: 0.40,
    annualRent: 14000,
    consumeRatio: 0.85,
    incomeTaxAdj: 0.00,
    prebateSaveRate: 0.08,
  },
  hispanic: {
    label: 'Hispanic',
    startWealth:  61600,
    income: 62000,
    stockFrac: 0.028, reFrac: 0.49, retFrac: 0.22,
    homeOwn: 0.51,
    hhSize: 3.1,
    empRate: 0.68,
    savingsRate: 0.07,
    k401Part: 0.42,
    annualRent: 15000,
    consumeRatio: 0.82,
    incomeTaxAdj: 0.00,
    prebateSaveRate: 0.08,
  },
};

// Color palette: each group gets a color family; dark = Accord, light = current
const PALETTE = {
  white:    { accord: '#1E40AF', current: '#93C5FD' },
  black:    { accord: '#065F46', current: '#6EE7B7' },
  hispanic: { accord: '#6D28D9', current: '#C4B5FD' },
};

// Real asset return assumptions (inflation-adjusted)
function wealthReturn(g, system) {
  // Under Accord: 2% annual drag on stock returns from codetermination transfer + EV growth tax
  const stockR = system === 'accord' ? 0.05 - STOCK_DRAG : 0.05;
  const other  = Math.max(0, 1 - g.stockFrac - g.reFrac - g.retFrac);
  return g.stockFrac * stockR + g.reFrac * 0.03 + g.retFrac * 0.045 + other * 0.02;
}

// ─── Core Simulation ─────────────────────────────────────────────────────────

function runSimulation() {
  const YEARS = 30;
  const chartData = Array.from({ length: YEARS + 1 }, (_, y) => ({ year: y }));
  const decompData  = [];
  const summaryRows = [];

  Object.entries(GROUPS).forEach(([key, g]) => {
    const retC = wealthReturn(g, 'current');
    const retA = wealthReturn(g, 'accord');

    // Current system: base annual savings (after rough ~7% effective tax rate) + 401(k) match
    const baseSave = g.income * (1 - 0.07) * g.savingsRate + g.k401Part * 0.09 * g.income;

    // Accord: net fiscal benefit from prebate − VAT − slight income tax increase
    // 10% VAT on consumption, $5K/capita prebate (unconditional)
    const netFiscal    = Math.max(0, 5000 * g.hhSize - 0.04 * g.consumeRatio * g.income - g.incomeTaxAdj * g.income);
    const prebateSave  = netFiscal * g.prebateSaveRate;

    // PSU equilibrium wealth (takes ~5 years to ramp via 4%/yr Equity Excise Tax)
    const psuEquil = g.empRate * PSU_ELIG * PSU_EQUIL;

    // State variables
    let bwC  = g.startWealth;  // Current system base wealth
    let bwA0 = g.startWealth;  // Accord base wealth (same savings, stock drag only — for decomp)
    let bwA  = g.startWealth;  // Full Accord base wealth (all sources)
    let amcf = 0;              // AMCF account balance
    let psuBal = 0;            // PSU equity balance

    // Decomposition trackers (compounded value at Year 30 of each new source)
    let dPsuDiv = 0, dPrebate = 0, dRent = 0;

    chartData[0][`${key}_c`] = g.startWealth;
    chartData[0][`${key}_a`] = g.startWealth;

    for (let y = 1; y <= YEARS; y++) {
      // ── Current system ──
      bwC  = bwC  * (1 + retC) + baseSave;

      // ── Accord base (used for stock-drag decomposition) ──
      bwA0 = bwA0 * (1 + retA) + baseSave;

      // ── Accord additional sources ──

      // LVT: rent savings phase in over 10 years as housing supply expands
      const rentSave = (1 - g.homeOwn) * g.annualRent * LVT_RENT_MAX
                       * Math.min(y / LVT_RAMP_YRS, 1) * 0.5; // 50% saved, 50% consumed

      // PSU equity ramps to equilibrium by year 5, then stable (recycling loop)
      const psuTarget = psuEquil * Math.min(y / PSU_RAMP_YRS, 1);
      const psuDiv    = psuBal * PSU_DIV_YLD;  // dividends from current PSU holdings
      psuBal = psuTarget;

      // AMCF: citizen grant deposits grow at fund return rate
      // Only count adult grants (~2/household); children's custodial accounts are
      // locked until 18 and leave the household when the child does.
      const grant = amcfGrantPerCapita(y) * 2;
      amcf = amcf * (1 + AMCF_RETURN) + grant;

      // Full Accord base wealth
      bwA = bwA * (1 + retA) + baseSave + prebateSave + rentSave + psuDiv;

      // Compounded decomposition trackers
      dPsuDiv  = dPsuDiv  * (1 + retA) + psuDiv;
      dPrebate = dPrebate * (1 + retA) + prebateSave;
      dRent    = dRent    * (1 + retA) + rentSave;

      // Custodial component: each year one cohort turns 18 with childhood AMCF.
      // Year 1: 17-year-old had 1 year of grants. Year 18: first full 18-year cohort.
      // Averaged over working-age span (47 years).
      let custodial = 0;
      for (let c = 1; c <= y; c++) {
        const grantYears = Math.min(c, 18);
        let acct = 0;
        for (let t = c - grantYears + 1; t <= c; t++) acct = acct * (1 + AMCF_RETURN) + amcfGrantPerCapita(t);
        acct *= Math.pow(1 + AMCF_RETURN, y - c);
        custodial += acct;
      }
      custodial /= 47;

      chartData[y][`${key}_c`] = Math.round(bwC);
      chartData[y][`${key}_a`] = Math.round(bwA + amcf + custodial + psuBal);
    }

    // Compute final custodial at Year 30 for decomposition
    let finalCustodial = 0;
    for (let c = 1; c <= YEARS; c++) {
      const grantYears = Math.min(c, 18);
      let acct = 0;
      for (let t = c - grantYears + 1; t <= c; t++) acct = acct * (1 + AMCF_RETURN) + amcfGrantPerCapita(t);
      acct *= Math.pow(1 + AMCF_RETURN, YEARS - c);
      finalCustodial += acct;
    }
    finalCustodial /= 47;

    const finalC = bwC;
    const finalA = bwA + amcf + finalCustodial + psuBal;
    const totalGain = finalA - finalC;

    // Stock drag = wealth lost due to lower stock returns on existing base
    const stockDragEffect = bwA0 - bwC; // negative for White (lower return on stock-heavy portfolio)

    decompData.push({
      name: g.label,
      'Base Wealth':        Math.round(finalC),
      'AMCF Grants':        Math.round(amcf + finalCustodial),
      'PSU Equity':         Math.round(psuBal),
      'PSU Dividends':      Math.round(dPsuDiv),
      'Prebate / Net VAT':  Math.round(dPrebate),
      'Rent Savings (LVT)': Math.round(dRent),
      'Stock Return Drag':  Math.round(stockDragEffect), // negative = reduces wealth
    });

    [0, 10, 20, 30].forEach(yr => {
      if (yr === 0) return;
      summaryRows.push({
        group:    g.label,
        year:     yr,
        current:  chartData[yr][`${key}_c`],
        accord:   chartData[yr][`${key}_a`],
        ratio_c:  chartData[yr].white_c  ? +(chartData[yr].white_c  / chartData[yr][`${key}_c`]).toFixed(2) : null,
        ratio_a:  chartData[yr].white_a  ? +(chartData[yr].white_a  / chartData[yr][`${key}_a`]).toFixed(2) : null,
      });
    });
  });

  // Ratio chart data
  const ratioData = chartData.map(row => ({
    year: row.year,
    'White:Black (Current)':    row.white_c && row.black_c    ? +(row.white_c / row.black_c).toFixed(2)    : null,
    'White:Black (Accord)':     row.white_a && row.black_a    ? +(row.white_a / row.black_a).toFixed(2)    : null,
    'White:Hispanic (Current)': row.white_c && row.hispanic_c ? +(row.white_c / row.hispanic_c).toFixed(2) : null,
    'White:Hispanic (Accord)':  row.white_a && row.hispanic_a ? +(row.white_a / row.hispanic_a).toFixed(2) : null,
  }));

  return { chartData, ratioData, decompData, summaryRows };
}

// ─── Component ───────────────────────────────────────────────────────────────

const DECOMP_COLORS = {
  'Base Wealth':        '#93C5FD',
  'AMCF Grants':        '#10B981',
  'PSU Equity':         '#059669',
  'PSU Dividends':      '#6EE7B7',
  'Prebate / Net VAT':  '#FBBF24',
  'Rent Savings (LVT)': '#A3E635',
  'Stock Return Drag':  '#EF4444',
};

export default function RacialWealthGap() {
  const { chartData, ratioData, decompData, summaryRows } = useMemo(() => runSimulation(), []);
  const [decompMode, setDecompMode] = useState('advantage');

  // Pull headline numbers from simulation output
  const yr30 = chartData[30];
  const wb_current  = yr30.white_c  && yr30.black_c    ? (yr30.white_c  / yr30.black_c).toFixed(1)    : '—';
  const wh_current  = yr30.white_c  && yr30.hispanic_c ? (yr30.white_c  / yr30.hispanic_c).toFixed(1) : '—';
  const wb_accord   = yr30.white_a  && yr30.black_a    ? (yr30.white_a  / yr30.black_a).toFixed(1)    : '—';
  const wh_accord   = yr30.white_a  && yr30.hispanic_a ? (yr30.white_a  / yr30.hispanic_a).toFixed(1) : '—';

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="border-l-4 border-emerald-500 pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Racial Wealth Gap</h1>
        <p className="text-base font-semibold text-emerald-700 mt-2">
          The Accord's universal mechanisms narrow the white-to-Black wealth ratio
          from 6.3:1 today to {wb_accord}:1 by Year 30 — compared to {wb_current}:1 under the current system.
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-6 leading-relaxed">
          Equal per-capita AMCF grants, universal worker equity (three-tier: Tier 1 sectoral fund, Tier 2 phantom equity, Tier 3 PSU),
          and net prebate transfers disproportionately benefit Black and Hispanic households, which start with less wealth
          and a higher consumption-to-income ratio. The New Accord (VAT 4%, LVT 10%) further amplifies rent relief for renters.
          Simultaneously, the four-percent annual Equity Excise and EV Growth Tax reduce returns on existing stock portfolios — held overwhelmingly by white households.
        </p>
      </div>

      {/* ── Chart 1: Wealth Trajectories ── */}
      <ChartContainer
        className="mt-12"
        title="Median Household Net Worth by Race, 2024–2054"
        subtitle="Solid = American Ownership Accord  |  Dashed = Current system  |  All values in 2024 real dollars"
        source="Sources: Federal Reserve Survey of Consumer Finances (2022); Census Bureau; BLS Consumer Expenditure Survey. Model applies real asset returns: equities 5% (3% under Accord due to 2% codetermination drag), real estate 3%, retirement accounts 4.5%, other 2%."
        height={380}
      >
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="year" label={{ value: 'Years from Accord Enactment', position: 'insideBottom', offset: -4, fontSize: 12 }} tick={CHART_AXIS.tick} />
          <YAxis tickFormatter={fmtKShort} tick={CHART_AXIS.tick} width={70} />
          <Tooltip content={<WealthTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />

          {/* White */}
          <Line dataKey="white_a" name="White (Accord)"    stroke={PALETTE.white.accord}    strokeWidth={2.5} dot={false} />
          <Line dataKey="white_c" name="White (Current)"   stroke={PALETTE.white.current}   strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
          {/* Black */}
          <Line dataKey="black_a" name="Black (Accord)"    stroke={PALETTE.black.accord}    strokeWidth={2.5} dot={false} />
          <Line dataKey="black_c" name="Black (Current)"   stroke={PALETTE.black.current}   strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
          {/* Hispanic */}
          <Line dataKey="hispanic_a" name="Hispanic (Accord)"  stroke={PALETTE.hispanic.accord}  strokeWidth={2.5} dot={false} />
          <Line dataKey="hispanic_c" name="Hispanic (Current)" stroke={PALETTE.hispanic.current} strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
        </LineChart>
      </ChartContainer>

      {/* ── Chart 2: Wealth Ratios ── */}
      <ChartContainer
        className="mt-12"
        title="White-to-Minority Wealth Ratio Over Time"
        subtitle="Under the current system, compounding narrows ratios slowly. The Accord accelerates convergence by injecting new universal wealth sources where they are proportionally most impactful."
        height={300}
      >
        <LineChart data={ratioData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="year" label={{ value: 'Years from Accord Enactment', position: 'insideBottom', offset: -4, fontSize: 12 }} tick={CHART_AXIS.tick} />
          <YAxis domain={[1, 7]} tickFormatter={v => `${v}:1`} tick={CHART_AXIS.tick} width={50} />
          <Tooltip content={<RatioTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
          <ReferenceLine y={1} stroke="#10B981" strokeDasharray="4 4" label={{ value: 'Parity (1:1)', position: 'right', fontSize: 11, fill: '#10B981' }} />

          <Line dataKey="White:Black (Accord)"     stroke="#065F46" strokeWidth={2.5} dot={false} />
          <Line dataKey="White:Black (Current)"    stroke="#6EE7B7" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
          <Line dataKey="White:Hispanic (Accord)"  stroke="#6D28D9" strokeWidth={2.5} dot={false} />
          <Line dataKey="White:Hispanic (Current)" stroke="#C4B5FD" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
        </LineChart>
      </ChartContainer>

      {/* ── Chart 3: Decomposition ── */}
      <div className="mt-12">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {decompMode === 'advantage'
              ? 'Why the Gap Closes — Net Accord Benefit by Group, Year 30'
              : 'Full Wealth at Year 30 — All Sources by Group'}
          </h2>
          <ToggleGroup
            type="single"
            value={decompMode}
            onValueChange={(v) => { if (v) setDecompMode(v); }}
            className="flex gap-1.5"
          >
            <ToggleGroupItem value="advantage" className="text-xs px-3 py-1.5">
              Net Accord Benefit
            </ToggleGroupItem>
            <ToggleGroupItem value="full" className="text-xs px-3 py-1.5">
              Full Breakdown
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          {decompMode === 'advantage'
            ? 'Additional wealth each group gains from the Accord vs. current law at Year 30. The gap closes because minorities gain more — not because White wealth falls. All groups are wealthier under the Accord, but the net benefit is larger for Black and Hispanic households due to equal per-capita AMCF grants and greater rent savings from LVT.'
            : 'Total Accord wealth at Year 30 decomposed by source. Blue base = what the current system would produce; colored segments = additional wealth from each Accord mechanism.'}
        </p>
        <ChartContainer
          source={decompMode === 'advantage'
            ? 'Wealth-building mechanisms only — each bar shows what the Accord adds vs. current law. AMCF grants compound at 5% real. PSU equity builds to equilibrium over 5 years (~$65K weighted average). Prebate/VAT net is positive for all groups at 4% VAT. Rent savings reflect 25% reduction in renter costs from LVT-driven housing supply expansion. The gap closes because these mechanisms deliver more absolute benefit to lower-wealth households.'
            : 'Blue base = current system wealth at Year 30 (starting wealth + savings compounded). Colored segments = additional Accord sources. Sum = total Accord wealth. White\'s base wealth (~$1.1M) dwarfs minority bases, illustrating the structural compounding advantage the Accord mechanisms work against.'}
          height={300}
        >
          <BarChart data={decompData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }} layout="vertical">
            <CartesianGrid {...CHART_GRID} horizontal={false} />
            <XAxis type="number" tickFormatter={fmtKShort} tick={CHART_AXIS.tick} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fontWeight: 600 }} width={75} />
            <Tooltip formatter={(v, name) => [fmtK(v), name]} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <ReferenceLine x={0} stroke="#9CA3AF" />

            {decompMode === 'full' && (
              <Bar key="Base Wealth" dataKey="Base Wealth" stackId="a" fill={DECOMP_COLORS['Base Wealth']} name="Base Wealth (Current System)" />
            )}
            {Object.entries(DECOMP_COLORS)
              .filter(([k]) => k !== 'Base Wealth')
              .filter(([k]) => decompMode === 'full' || k !== 'Stock Return Drag')
              .map(([key, color]) => (
              <Bar key={key} dataKey={key} stackId="a" fill={color} />
            ))}
          </BarChart>
        </ChartContainer>
      </div>

      {/* ── Summary Table ── */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Summary: Median Household Net Worth by Race and Year</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-6">All values in 2024 real dollars</p>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Group</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-blue-600">Current System</TableHead>
                <TableHead className="text-emerald-700">Accord</TableHead>
                <TableHead>Accord Gain</TableHead>
                <TableHead>
                  White:Group Ratio
                  <span className="block font-normal text-[11px] text-muted-foreground">Current → Accord</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { key: 'white',    label: 'White' },
                { key: 'black',    label: 'Black' },
                { key: 'hispanic', label: 'Hispanic' },
              ].map(({ key, label }) =>
                [10, 20, 30].map((yr, i) => {
                  const c = chartData[yr][`${key}_c`];
                  const a = chartData[yr][`${key}_a`];
                  const gain = a - c;
                  const wc = chartData[yr].white_c;
                  const wa = chartData[yr].white_a;
                  const ratioC = key !== 'white' && wc && c ? (wc / c).toFixed(1) : '—';
                  const ratioA = key !== 'white' && wa && a ? (wa / a).toFixed(1) : '—';
                  return (
                    <TableRow key={`${key}-${yr}`} className={i === 0 ? 'bg-muted/30' : ''}>
                      <TableCell
                        className="font-semibold"
                        style={{ color: i === 0 ? PALETTE[key].accord : undefined, fontWeight: i === 0 ? 700 : 400 }}
                      >
                        {i === 0 ? label : ''}
                      </TableCell>
                      <TableCell>Year {yr}</TableCell>
                      <TableCell className="text-blue-700">{fmtK(c)}</TableCell>
                      <TableCell className="text-emerald-700 font-semibold">{fmtK(a)}</TableCell>
                      <TableCell className={gain >= 0 ? 'text-emerald-600' : 'text-red-600'}>+{fmtK(gain)}</TableCell>
                      <TableCell>{key !== 'white' ? `${ratioC}:1 → ${ratioA}:1` : '—'}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Starting ratios */}
        <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
          Starting wealth ratios (Year 0): White:Black = {(GROUPS.white.startWealth / GROUPS.black.startWealth).toFixed(1)}:1 &nbsp;|&nbsp;
          White:Hispanic = {(GROUPS.white.startWealth / GROUPS.hispanic.startWealth).toFixed(1)}:1 &nbsp;|&nbsp;
          By Year 30 under the Accord: {wb_accord}:1 and {wh_accord}:1 respectively.
        </p>
      </div>

      {/* ── Methodology Note ── */}
      <InfoBox className="mt-12">
        <strong className="text-foreground">Methodology:</strong> Deterministic annual model for representative median household of each racial group.
        Current system: base wealth compounds at asset-class-weighted real returns; savings = after-tax income × savings rate + 401(k) employer match.
        Accord system (New Accord: VAT 4%, LVT 10%): same base with (1) 2% drag on stock return component from codetermination + EV growth tax,
        (2) AMCF citizen grants growing from $500/yr (Yr 1) to $14,784/yr (Yr 30) per capita as AMCF fund scales (Sim 6 validated, uncapped) compounding at 5% real,
        (3) worker equity building to equilibrium over 5 years — blended Tier 1 (sectoral fund $1K/yr), Tier 2 (phantom equity ~$55K), Tier 3 (4%/yr Equity Excise → 20% PSU);
        weighted average ~$65K for eligible workers, paying 3.5% annual dividends, (4) net prebate/VAT (4% New Accord rate) fiscal transfer saved at income-appropriate rate, and
        (5) LVT-driven rent reduction phased in over 10 years for renter households (25% maximum at full phase-in, calibrated to 10% LVT rate).
        All values in 2024 inflation-adjusted dollars. The model does not include behavioral changes (e.g., increased labor force participation),
        second-order growth effects, or healthcare cost changes — which would further benefit lower-income households.
      </InfoBox>
    </PageShell>
  );
}
