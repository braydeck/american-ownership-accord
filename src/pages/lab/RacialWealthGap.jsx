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
import { householdFlowsAt, workerEquityAt, wefPriceAt, amcfG, dilutionFactor } from '@/lib/household-model';

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
// Taxes, transfers, worker equity and AMCF grants come from the shared household model at the
// site defaults (src/lib/household-model.js). Each group's own inputs are its income, household
// size, homeownership, portfolio mix and savings behavior.

const ALL_PROVS   = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const AMCF_RETURN = 0.05;  // AMCF fund real return, as in the household model
const YEARS       = 30;

// ─── Demographic Data (Federal Reserve SCF 2022 / Census / BLS) ──────────────

const GROUPS = {
  white: {
    label: 'White',
    startWealth: 285000,   // SCF 2022 median household net worth
    income: 81000,         // Census median household income
    stockFrac: 0.23, reFrac: 0.42, retFrac: 0.12,  // SCF asset allocation
    homeOwn: 0.75,         // Census homeownership rate
    hhSize: 2.5,
    savingsRate: 0.12,     // BLS Consumer Expenditure Survey
    k401Part: 0.60,
    accordSaveRate: 0.15,  // share of the Accord's added cash that is saved
  },
  black: {
    label: 'Black',
    startWealth: 44900, income: 56000,
    stockFrac: 0.045, reFrac: 0.43, retFrac: 0.35,
    homeOwn: 0.45, hhSize: 2.6, savingsRate: 0.06, k401Part: 0.40,
    accordSaveRate: 0.08,
  },
  hispanic: {
    label: 'Hispanic',
    startWealth: 61600, income: 62000,
    stockFrac: 0.028, reFrac: 0.49, retFrac: 0.22,
    homeOwn: 0.51, hhSize: 3.1, savingsRate: 0.07, k401Part: 0.42,
    accordSaveRate: 0.08,
  },
};

// Color palette: each group gets a color family; dark = Accord, light = current
const PALETTE = {
  white:    { accord: '#1E40AF', current: '#93C5FD' },
  black:    { accord: '#1f5d7e', current: '#a9cde0' },
  hispanic: { accord: '#6D28D9', current: '#C4B5FD' },
};

// Real asset returns. Under the Accord, directly held stock moves with the household model's
// dilution path: the revaluation from repealing the corporate income tax, less the AMCF's and the
// worker trusts' growing stakes.
const STOCK_RETURN = 0.05;
const stockReturn = (system, y) => system === 'accord'
  ? (1 + STOCK_RETURN) * dilutionFactor(y, ALL_PROVS) / dilutionFactor(y - 1, ALL_PROVS) - 1
  : STOCK_RETURN;
function wealthReturn(g, system, y) {
  const other = Math.max(0, 1 - g.stockFrac - g.reFrac - g.retFrac);
  return g.stockFrac * stockReturn(system, y) + g.reFrac * 0.03 + g.retFrac * 0.045 + other * 0.02;
}

// AMCF grant per person in 2024 real dollars, from the shared fiscal engine.
const grantAt = y => (y <= 0 ? 0 : amcfG(y));

// Custodial accounts: each year one cohort turns 18 with its childhood units, averaged over the
// 47-year working span, as in the household model.
function custodialAt(y) {
  let custodial = 0;
  for (let c = 1; c <= y; c++) {
    const grantYears = Math.min(c, 18);
    let acct = 0;
    for (let t = c - grantYears + 1; t <= c; t++) acct = acct * (1 + AMCF_RETURN) + grantAt(t);
    custodial += acct * Math.pow(1 + AMCF_RETURN, y - c);
  }
  return custodial / 47;
}

// ─── Core Simulation ─────────────────────────────────────────────────────────

function runSimulation() {
  const chartData = Array.from({ length: YEARS + 1 }, (_, y) => ({ year: y }));
  const decompData  = [];

  Object.entries(GROUPS).forEach(([key, g]) => {
    // Current system: annual savings (after a ~7% effective tax rate) plus a 9% 401(k) contribution
    const baseSave = g.income * (1 - 0.07) * g.savingsRate + g.k401Part * 0.09 * g.income;

    let bwC = g.startWealth;  // current system
    let bwD = g.startWealth;  // current savings under Accord asset returns (isolates dilution)
    let bwA = g.startWealth;  // Accord base wealth plus saved Accord cash
    let amcf = 0;             // adults' AMCF accounts
    let units = 0;            // Worker Equity Fund units, in Year-1 prices
    let dFlows = 0, dPayouts = 0;

    chartData[0][`${key}_c`] = g.startWealth;
    chartData[0][`${key}_a`] = g.startWealth;

    for (let y = 1; y <= YEARS; y++) {
      const retC = wealthReturn(g, 'current', y), retA = wealthReturn(g, 'accord', y);
      // Taxes and transfers: prebate, carbon dividend, programs replaced, income tax, VAT,
      // residential LVT and rent relief, carbon, the health contribution, converted wages and
      // premiums saved. In-kind coverage for the previously uninsured is not saved.
      const flows = householdFlowsAt({ income: g.income, hhSz: g.hhSize, own: g.homeOwn }, y);
      const we = workerEquityAt(g.income, y);
      const flowSave = flows.net * g.accordSaveRate;
      const payoutSave = we.cash * g.accordSaveRate;

      bwC = bwC * (1 + retC) + baseSave;
      bwD = bwD * (1 + retA) + baseSave;
      bwA = bwA * (1 + retA) + baseSave + flowSave + payoutSave;
      dFlows   = dFlows   * (1 + retA) + flowSave;
      dPayouts = dPayouts * (1 + retA) + payoutSave;

      // Adults' grants (up to two per household); children's custodial accounts leave with them.
      amcf = amcf * (1 + AMCF_RETURN) + grantAt(y) * Math.min(g.hhSize, 2);
      units += we.unitsIssued / wefPriceAt(y);
      const workerEquity = units * wefPriceAt(y) + we.sectoral;

      chartData[y][`${key}_c`] = Math.round(bwC);
      chartData[y][`${key}_a`] = Math.round(bwA + amcf + custodialAt(y) + workerEquity);
      if (y === YEARS) {
        decompData.push({
          name: g.label,
          'Base Wealth':            Math.round(bwC),
          'AMCF Grants':            Math.round(amcf + custodialAt(y)),
          'Worker Equity':          Math.round(workerEquity),
          'Worker Trust Payouts':   Math.round(dPayouts),
          'Taxes and Transfers':    Math.round(dFlows),
          'Stock Dilution':         Math.round(bwD - bwC),
        });
      }
    }
  });

  const ratioData = chartData.map(row => ({
    year: row.year,
    'White:Black (Current)':    +(row.white_c / row.black_c).toFixed(2),
    'White:Black (Accord)':     +(row.white_a / row.black_a).toFixed(2),
    'White:Hispanic (Current)': +(row.white_c / row.hispanic_c).toFixed(2),
    'White:Hispanic (Accord)':  +(row.white_a / row.hispanic_a).toFixed(2),
  }));

  const flowsY1 = Object.fromEntries(Object.entries(GROUPS).map(([key, g]) =>
    [key, householdFlowsAt({ income: g.income, hhSz: g.hhSize, own: g.homeOwn }, 1).net]));

  return { chartData, ratioData, decompData, flowsY1 };
}

// ─── Component ───────────────────────────────────────────────────────────────

const DECOMP_COLORS = {
  'Base Wealth':        '#93C5FD',
  'AMCF Grants':          '#307ca6',
  'Worker Equity':        '#1f5d7e',
  'Worker Trust Payouts': '#a9cde0',
  'Taxes and Transfers':  '#FBBF24',
  'Stock Dilution':       '#c27040',
};

export default function RacialWealthGap() {
  const { chartData, ratioData, decompData, flowsY1 } = useMemo(() => runSimulation(), []);
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
      <div className="border-l-4 border-[#307ca6] pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Racial Wealth Gap</h1>
        <p className="text-base font-semibold text-[#307ca6] mt-2">
          The median white household holds {(GROUPS.white.startWealth / GROUPS.black.startWealth).toFixed(1)} times
          the wealth of the median Black household today. Under the Accord the ratio is {wb_accord}:1 by Year 30,
          against {wb_current}:1 under current law.
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-6 leading-relaxed">
          Every person receives the same AMCF grant, and worker equity builds with hours worked. Those amounts
          are a larger share of wealth for Black and Hispanic households, which start with less. Taxes and
          transfers add ${Math.round(flowsY1.white).toLocaleString()} a year for the median white household in Year 1,{' '}
          ${Math.round(flowsY1.black).toLocaleString()} for the median Black household and ${Math.round(flowsY1.hispanic).toLocaleString()} for the median
          Hispanic household. The AMCF's and worker trusts' stakes dilute existing stock holdings, which white
          households hold more of.
        </p>
      </div>

      {/* ── Chart 1: Wealth Trajectories ── */}
      <ChartContainer
        className="mt-12"
        title="Median Household Net Worth by Race, 2024–2054"
        subtitle="Solid = American Ownership Accord  |  Dashed = Current system  |  All values in 2024 real dollars"
        source="Sources: Federal Reserve Survey of Consumer Finances (2022); Census Bureau; BLS Consumer Expenditure Survey. Real asset returns: equities 5% (under the Accord, adjusted for the revaluation and dilution of existing stock), real estate 3%, retirement accounts 4.5%, other 2%."
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
        subtitle="Ratio of median white household net worth to median Black and Hispanic household net worth."
        height={300}
      >
        <LineChart data={ratioData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="year" label={{ value: 'Years from Accord Enactment', position: 'insideBottom', offset: -4, fontSize: 12 }} tick={CHART_AXIS.tick} />
          <YAxis domain={[1, 7]} tickFormatter={v => `${v}:1`} tick={CHART_AXIS.tick} width={50} />
          <Tooltip content={<RatioTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
          <ReferenceLine y={1} stroke="#307ca6" strokeDasharray="4 4" label={{ value: 'Parity (1:1)', position: 'right', fontSize: 11, fill: '#307ca6' }} />

          <Line dataKey="White:Black (Accord)"     stroke="#1f5d7e" strokeWidth={2.5} dot={false} />
          <Line dataKey="White:Black (Current)"    stroke="#a9cde0" strokeWidth={1.5} dot={false} strokeDasharray="5 4" />
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
            ? 'Wealth each group gains from the Accord at Year 30, against current law. Every group is wealthier under the Accord. AMCF grants and worker equity are about the same dollar amount for each group, so they are a larger share of Black and Hispanic wealth.'
            : 'Accord wealth at Year 30 by source. The blue base is what current law produces; the colored segments are what each part of the Accord adds or removes.'}
        </p>
        <ChartContainer
          source={decompMode === 'advantage'
            ? 'AMCF grants compound at 5% real. Worker equity is Worker Equity Fund units and Sectoral Fund balances. Taxes and transfers and worker trust payouts are the share of each year\'s added cash the household saves, compounded.'
            : 'Base wealth is current-law wealth at Year 30: starting wealth plus savings, compounded. Stock dilution is the change in that wealth from the Accord\'s effect on existing stock.'}
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
              .filter(([k]) => decompMode === 'full' || k !== 'Stock Dilution')
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
                <TableHead className="text-[#307ca6]">Accord</TableHead>
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
                      <TableCell className="text-[#307ca6] font-semibold">{fmtK(a)}</TableCell>
                      <TableCell className={gain >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}>{gain >= 0 ? '+' : '−'}{fmtK(Math.abs(gain))}</TableCell>
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
        <strong className="text-foreground">Methodology:</strong> Deterministic annual model for the median household of each group, at the
        site's default settings. Current law: starting wealth compounds at asset-class-weighted real returns, and the household saves
        after-tax income at its savings rate plus a 9% 401(k) contribution. The Accord adds, from the shared household model:
        (1) the revaluation and dilution of existing stock as the AMCF and worker trusts build their stakes;
        (2) AMCF grants for up to two adults (${grantAt(1).toLocaleString()} a person in Year 1, ${grantAt(10).toLocaleString()} at Year 10,
        ${grantAt(30).toLocaleString()} at Year 30) and children's custodial accounts, compounding at 5% real;
        (3) worker equity for the household's income bracket: Worker Equity Fund units, Sectoral Fund balances and cash payouts;
        (4) taxes and transfers at the household's income: the prebate, carbon dividend, programs the prebate replaces, income tax,
        VAT, residential LVT and rent relief at the group's homeownership rate, carbon costs, the health contribution, and the
        converted wages, premiums and out-of-pocket costs from the Health Fund. The household saves a share of the added cash.
        Income is held at today's real level. In-kind coverage for previously uninsured people is not counted as wealth. All values
        in 2024 dollars.
      </InfoBox>
    </PageShell>
  );
}
