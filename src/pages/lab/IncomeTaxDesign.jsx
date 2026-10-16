import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from 'recharts';

import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { ControlPanel, ControlGroup } from '@/components/controls/ControlPanel';
import { InfoBox } from '@/components/shared/InfoBox';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { CHART_GRID, CHART_AXIS, CHART_TOOLTIP_STYLE } from '@/lib/chart-config';
import { BRACKETS, CARBON_TONS, TOTAL_POP } from '@/lib/brackets';
import { lvtNetBurdenByBracket, PREBATE_REDIRECTED } from '@/lib/land';
import { bracketIncomeTax } from '@/lib/income-tax';
import { useUrlValue } from '@/lib/url-state';
import {
  TIER_DIST, PARTTIME_FTE,
  PSU_YIELD, sectoralFundBalance, psuDividendPerFiler, wefAccrualPerFiler,
} from '@/lib/worker-equity';
import { BASE_PARAMS, carbonDividendPerCapita } from '@/lib/fiscal-engine';

// BRACKET DATA, carbon, and net-LVT burden are shared via @/lib/brackets and the
// capitalized land model in @/lib/land (imported above).
const CL_REVENUE = 2.39e12;  // Calibrated current-law income tax baseline

// Worker-equity tables and PSU formulas live in src/lib/worker-equity.js.

// Universal per-capita prebate — paid to every American (man, woman, child) annually.
// Core redistributionary mechanism: makes the VAT progressive by pre-refunding
// the expected consumption tax burden at the poverty line.
// Default scenario: base $5,000 plus redirected homeowner-exemption revenue → ~$6,250/person.
const PREBATE_PER_PERSON = PREBATE_REDIRECTED;

// ============================================================
// AMCF CASH FLOW  (dynamic — floats with equity × payout yield)
// Anchor points from Sim-6 validated base case (LVT 10% + VAT 3%)
// ============================================================
const AMCF_EQUITY_ANCHORS = [
  [1, 0.6e12], [6, 5.2e12], [10, 12.0e12], [15, 27.1e12],
  [20, 55.4e12], [25, 107.4e12], [35, 200e12],
];

function amcfEquityAt(year) {
  const pts = AMCF_EQUITY_ANCHORS;
  if (year <= pts[0][0]) return pts[0][1];
  if (year >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (year >= pts[i][0] && year <= pts[i + 1][0]) {
      const t = (year - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
    }
  }
}

// Payout yield ramps from 3.63% (Year 1) to 6.0% (Year 15+).
// Reflects: (1) 0% CIT removes tax penalty on distributions → higher payouts over time;
// (2) AMCF portfolio shifts toward mature companies with higher payout ratios.
function amcfCombinedYield(year) {
  return 0.0363 + (0.06 - 0.0363) * Math.min(1, year / 15);
}

// Returns per-person per-year AMCF dividend at a given snapshot year
function amcfDividendPerCap(year) {
  const equity = amcfEquityAt(year);
  const yld = amcfCombinedYield(year);
  return (equity * yld) / TOTAL_POP;
}

// ============================================================
// PRIOR ACCORD INCOME TAX DELTA
// Section 4.3: +3-5% on ordinary income above median ($75K); more aggressive above $1M
// Section 4.1: CG at 0% ≤$200K income, 20% $200K–$1M, ordinary rates above $1M
// Deductions are preserved (standard + itemized), so the base doesn't widen.
// ============================================================
function computePriorAccordIncomeTaxDelta(avgInc, cgShare) {
  // Approximate current-law CG rate by income level
  const cgRateCL  = avgInc > 445000 ? 0.20 : avgInc > 40000 ? 0.15 : 0.00;
  // Prior Accord CG rate
  const cgRatePrior = avgInc > 1e6  ? 0.45   // ordinary rates above $1M
                    : avgInc > 200000 ? 0.20  // 20% from $200K–$1M (same as CL high-end)
                    : 0.00;                   // 0% below $200K avg income

  const cgIncome     = cgShare * avgInc;
  const cgDelta      = (cgRatePrior - cgRateCL) * cgIncome;

  // Ordinary income rate adjustment (midpoint of +3-5% range; +8% for $1M+)
  const ordFrac   = 1 - cgShare;
  const ordAdj    = avgInc > 1e6  ? 0.08
                  : avgInc > 75000 ? 0.04
                  : 0;
  const ordDelta  = ordAdj * ordFrac * avgInc;

  return cgDelta + ordDelta;
}

// ============================================================
// REVENUE ENGINE  (ETI-adjusted two-rate income tax)
// ============================================================
function computeRevenue(mR, tR, stdS, stdJ, etiM, etiT) {
  let total = 0;
  const details = BRACKETS.map(b => {
    const { meanAgi, sd, rawPerFiler, eff, bFactor, perFiler } = bracketIncomeTax(b, {
      lowRate: mR, highRate: tR, threshold: 1e6,
      exemptSingle: stdS, exemptJoint: stdJ, etiMid: etiM, etiTop: etiT,
    });
    const adj = perFiler * b.filers;
    total += adj;
    return { ...b, avgInc: meanAgi, sd, rawPerFiler, eff, bFactor, adj };
  });
  return { total, details };
}

// ============================================================
// FULL ACCORD DISTRIBUTIONAL ENGINE
// ============================================================
function computeAccordDistrib(mR, tR, stdS, stdJ, vatRate, lvtRate, etiM, etiT, amcfPerCap, year) {
  // Default scenario: no homeowner exemption. Burden from the shared capitalized model.
  const lvtNet      = lvtNetBurdenByBracket({ rate: lvtRate, exemption: 0 });
  const lvtNetPrior = lvtNetBurdenByBracket({ rate: 0.03,    exemption: 0 }); // Prior Accord = 3% LVT
  return BRACKETS.map((b, i) => {
    const avgInc = b.agi / b.filers;
    const clTax = b.effCL * avgInc;

    // New income tax (ETI-adjusted per filer)
    const newTax = bracketIncomeTax(b, {
      lowRate: mR, highRate: tR, threshold: 1e6,
      exemptSingle: stdS, exemptJoint: stdJ, etiMid: etiM, etiTop: etiT,
    }).perFiler;

    // VAT burden (Accord 3%, Prior Accord 10%)
    const vatNew = vatRate * b.cRat * avgInc;
    const vatPrior = 0.10 * b.cRat * avgInc;

    // Universal prebate × household size (default: redirected $6,250 with exemption off)
    const prebate = PREBATE_PER_PERSON * b.hhSz;

    // AMCF dividend: per-capita investment return from AMCF equity × payout yield
    // Adults only; children's AMCF is custodial (locked until 18)
    const amcfBenefit = amcfPerCap * Math.min(b.hhSz, 2);

    // Total cash benefits from the Accord
    const totalBenefits = prebate + amcfBenefit;

    // LVT net burden from the capitalized model (concave in rate, no exemption by default)
    const lvtBurden = lvtNet[i];

    // Carbon: $100/ton, 80% returned as equal per-capita dividend
    const carbonPaid = CARBON_TONS[i] * 100;
    const carbonDividend = carbonDividendPerCapita(BASE_PARAMS.carbonRate, TOTAL_POP) * b.hhSz;
    const carbonNet = carbonPaid - carbonDividend;

    // LVT for Prior Accord is always 3% — fixed, not slider-dependent
    const lvtBurdenPrior = lvtNetPrior[i];

    // Worker equity — same in both Accord designs; toggled on/off in display
    // Column A: ongoing dividend income from held stakes
    // Column B: Worker Equity Fund units issued that year (wealth, not cash)
    const psuDividend = psuDividendPerFiler(i, year);
    const psuCashout  = wefAccrualPerFiler(i, year);

    // Prior Accord income tax delta (Sections 4.1 + 4.3)
    const priorIncTaxDelta = computePriorAccordIncomeTaxDelta(avgInc, b.cgShare);

    // Net change vs Current Law: (+) = pays more, (−) = better off
    const delta = (newTax - clTax) + vatNew + lvtBurden + carbonNet - totalBenefits;
    // Prior Accord: rate bumps + CG reform + 10% VAT + 3% LVT + prebate + AMCF, no carbon
    const deltaPrior = priorIncTaxDelta + vatPrior + lvtBurdenPrior + 0 - totalBenefits;
    // New vs Prior: positive = new Accord costs more than Prior Accord for this bracket
    const deltaNewVsPrior = delta - deltaPrior;

    return {
      label: b.label,
      avgInc,
      filers: b.filers,
      hhSz: b.hhSz,
      clTax,
      newTax,
      vatNew,
      vatPrior,
      lvtBurden,
      lvtBurdenPrior,
      carbonNet,
      prebate,
      amcfBenefit,
      totalBenefits,
      psuDividend,
      psuCashout,
      priorIncTaxDelta,
      delta,
      deltaPct: delta / Math.max(avgInc, 1) * 100,
      betterOff: delta < 0,
      deltaPrior,
      deltaPriorPct: deltaPrior / Math.max(avgInc, 1) * 100,
      priorBetterOff: deltaPrior < 0,
      deltaNewVsPrior,
    };
  });
}

// ============================================================
// HELPERS
// ============================================================
const fmt = (n, d = 1) =>
  Math.abs(n) >= 1e12 ? `$${(n / 1e12).toFixed(d)}T`
  : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(d)}B`
  : `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;

function heatColor(val, min, max) {
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  const r = Math.round(200 - t * 150);
  const g = Math.round(80 + t * 140);
  const b = Math.round(80 - t * 30);
  return `rgb(${r},${g},${b})`;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

// ============================================================
// COMPONENT
// ============================================================
export default function IncomeTaxSimulation() {
  const [midRate, setMidRate] = useUrlValue('mid', 0.25);
  const [topRate, setTopRate] = useUrlValue('top', 0.50);
  const [etiScenario, setEtiScenario] = useUrlValue('eti', 'low');
  const [stdS, setStdS] = useUrlValue('std', 30000);
  const [vatRate, setVatRate] = useUrlValue('vat', 0.03);
  const [lvtRate, setLvtRate] = useUrlValue('lvt', 0.10);
  const [cgScenario, setCgScenario] = useUrlValue('cg', 'unified');
  const [snapshotYear, setSnapshotYear] = useUrlValue('yr', 10);
  const [showPSU, setShowPSU] = useUrlValue('psu', false);
  const [tab, setTab] = useUrlValue('tab', 'optimizer');

  const stdJ = stdS * 2;
  const etiM = 0.20;
  const etiT = etiScenario === 'low' ? 0.15 : 0.30;

  // AMCF cash flow computed dynamically: equity × combined payout yield
  const amcfEquity = amcfEquityAt(snapshotYear);
  const amcfYield = amcfCombinedYield(snapshotYear);
  const amcfCashFlow = amcfEquity * amcfYield;
  const amcfPerCap = amcfDividendPerCap(snapshotYear); // per person per year

  const revenue = useMemo(
    () => computeRevenue(midRate, topRate, stdS, stdJ, etiM, etiT),
    [midRate, topRate, stdS, stdJ, etiM, etiT]
  );

  const sweetRev = useMemo(() => computeRevenue(0.25, 0.50, 30000, 60000, 0.20, etiT).total, [etiT]);
  const optRev = useMemo(() => computeRevenue(0.30, 0.60, 30000, 60000, 0.20, etiT).total, [etiT]);

  // 13 × 26 revenue heat map
  const heatMap = useMemo(() => {
    const mRates = Array.from({ length: 13 }, (_, i) => 0.18 + i * 0.01);
    const tRates = Array.from({ length: 26 }, (_, i) => 0.35 + i * 0.01);
    return mRates.map(mR => ({
      mR,
      cells: tRates.map(tR => {
        const rev = computeRevenue(mR, tR, stdS, stdJ, etiM, etiT).total;
        return { tR, rev };
      }),
    }));
  }, [stdS, stdJ, etiM, etiT]);

  const hmMax = useMemo(() => Math.max(...heatMap.flatMap(r => r.cells.map(c => c.rev))), [heatMap]);
  const hmMin = useMemo(() => Math.min(...heatMap.flatMap(r => r.cells.map(c => c.rev))), [heatMap]);

  const distribData = useMemo(
    () => computeAccordDistrib(midRate, topRate, stdS, stdJ, vatRate, lvtRate, etiM, etiT, amcfPerCap, snapshotYear),
    [midRate, topRate, stdS, stdJ, vatRate, lvtRate, etiM, etiT, snapshotYear]
  );

  // Apply worker-equity offset to deltas when toggle is on (dividends + fund units issued)
  const distribDisplay = useMemo(() => distribData.map(d => {
    const psu = showPSU ? (d.psuDividend + d.psuCashout) : 0;
    const delta      = d.delta      - psu;
    const deltaPrior = d.deltaPrior - psu;
    return {
      ...d,
      delta,               // override spread — detail table reads this directly
      deltaPrior,          // override spread
      deltaWithPSU:      delta,
      deltaPriorWithPSU: deltaPrior,
      // head-to-head unchanged: PSU cancels out (same in both accords)
      deltaNewVsPrior:   d.deltaNewVsPrior,
      betterOff:         delta < 0,
      priorBetterOff:    deltaPrior < 0,
      deltaPct:          delta / Math.max(d.avgInc, 1) * 100,
      deltaPriorPct:     deltaPrior / Math.max(d.avgInc, 1) * 100,
    };
  }), [distribData, showPSU]);

  const totalFilers = BRACKETS.reduce((s, b) => s + b.filers, 0);
  const betterOffFilers = distribDisplay.reduce((s, d) => s + (d.betterOff ? d.filers : 0), 0);
  const betterOffPct = (betterOffFilers / totalFilers * 100).toFixed(1);
  const breakEven = distribDisplay.find(d => !d.betterOff);

  const cgExtra = cgScenario === 'unified' ? 585e9 : cgScenario === 'pref' ? 150e9 : 0;
  const totalRevWithCG = revenue.total + cgExtra;

  const stdSensitivity = useMemo(() =>
    [20000, 25000, 30000, 40000, 50000].map(s => ({
      s, rev: computeRevenue(midRate, topRate, s, s * 2, etiM, etiT).total,
    })),
    [midRate, topRate, etiM, etiT]
  );

  const TAB_KEYS = ['optimizer', 'heatmap', 'distributional', 'full-accord', 'std-sensitivity', 'capital-gains'];

  return (
    <PageShell>
      {/* Header */}
      <div className="border-l-4 border-[#307ca6] pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Income Tax Design</h1>
        <p className="text-base font-semibold text-[#307ca6] mt-2">
          Zero-deduction two-rate income tax with unified capital gains
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Standard deduction: ${stdS.toLocaleString()} single / ${stdJ.toLocaleString()} joint. No itemized deductions. All income taxed equally.
        </p>
      </div>

      {/* Global controls */}
      <ControlPanel columns={2} className="mt-8 grid-cols-2 lg:grid-cols-4">
        <ControlGroup>
          <SliderControl
            label={`Middle Rate (\u2264$1M income)`}
            value={midRate}
            onChange={setMidRate}
            min={0.18}
            max={0.30}
            step={0.01}
            formatValue={(v) => fmtPct(v)}
          />
        </ControlGroup>
        <ControlGroup>
          <SliderControl
            label={`Top Rate (>$1M income)`}
            value={topRate}
            onChange={setTopRate}
            min={0.35}
            max={0.60}
            step={0.01}
            formatValue={(v) => fmtPct(v)}
          />
        </ControlGroup>
        <ControlGroup>
          <SliderControl
            label="Standard Deduction (single)"
            value={stdS}
            onChange={setStdS}
            min={20000}
            max={50000}
            step={5000}
            formatValue={(v) => `$${(v / 1000).toFixed(0)}K`}
          />
        </ControlGroup>
        <ControlGroup>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            ETI Scenario
          </p>
          <ToggleGroup
            type="single"
            value={etiScenario}
            onValueChange={(v) => { if (v) setEtiScenario(v); }}
            variant="outline"
            className="flex"
          >
            <ToggleGroupItem value="low" className="text-xs px-3 py-1.5 flex-1">
              Low (0.15)
            </ToggleGroupItem>
            <ToggleGroupItem value="moderate" className="text-xs px-3 py-1.5 flex-1">
              Mod (0.30)
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground mt-2">
            {etiScenario === 'low' ? 'No deductions, unified CG, loopholes closed' : 'Standard behavioral response'}
          </p>
        </ControlGroup>
      </ControlPanel>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
        <MilestoneCard
          label="Income Tax Revenue"
          value={fmt(revenue.total, 2)}
          sub={`ETI-adjusted | ${fmtPct(revenue.total / 28.7e12)} of GDP`}
          className={revenue.total > CL_REVENUE ? 'border-blue-200 bg-blue-50/50' : ''}
        />
        <MilestoneCard
          label="vs Current Law"
          value={`${revenue.total >= CL_REVENUE ? '+' : ''}${fmt(revenue.total - CL_REVENUE, 2)}`}
          sub="CL baseline: $2.39T"
          className={revenue.total > CL_REVENUE ? 'border-blue-200 bg-blue-50/50' : ''}
        />
        <MilestoneCard label="Sweet Spot (25/50)" value={fmt(sweetRev, 2)} sub={`+${fmt(sweetRev - CL_REVENUE, 0)} vs CL`} />
        <MilestoneCard label="Optimal (30/60)" value={fmt(optRev, 2)} sub={`+${fmt(optRev - CL_REVENUE, 0)} vs CL`} />
        <MilestoneCard
          label="Households Better Off"
          value={`${betterOffPct}%`}
          sub={`${(betterOffFilers / 1e6).toFixed(0)}M of ${(totalFilers / 1e6).toFixed(0)}M filers`}
          className={+betterOffPct > 90 ? 'border-blue-200 bg-blue-50/50' : ''}
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="mt-10">
        <TabsList variant="line" className="w-full flex-wrap">
          <TabsTrigger value="optimizer">Rate Optimizer</TabsTrigger>
          <TabsTrigger value="heatmap">Revenue Heat Map</TabsTrigger>
          <TabsTrigger value="distributional">Income Tax Distributional</TabsTrigger>
          <TabsTrigger value="full-accord">Full Accord Table</TabsTrigger>
          <TabsTrigger value="std-sensitivity">Std Deduction Sensitivity</TabsTrigger>
          <TabsTrigger value="capital-gains">Capital Gains Scenarios</TabsTrigger>
        </TabsList>

        {/* ===== TAB 0: RATE OPTIMIZER ===== */}
        <TabsContent value="optimizer">
          <ChartContainer
            title="Revenue by Income Bracket"
            height={300}
            className="mt-6"
          >
            <BarChart data={revenue.details.map(d => ({
              name: d.label,
              newRev: +(d.adj / 1e9).toFixed(1),
              clRev: +(d.effCL * d.avgInc * d.filers / 1e9).toFixed(1),
            }))} margin={{ left: 20, right: 10 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="name" angle={-30} textAnchor="end" height={65} tick={{ fontSize: 10 }} />
              <YAxis label={{ value: 'Revenue ($B)', angle: -90, position: 'insideLeft', fontSize: 11 }} tick={CHART_AXIS.tick} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${v.toFixed(0)}B`, n]} />
              <Legend />
              <Bar dataKey="clRev" name="Current Law" fill="#d1d5db" radius={[3, 3, 0, 0]} />
              <Bar dataKey="newRev" name="New Two-Rate" radius={[3, 3, 0, 0]}>
                {revenue.details.map((d, i) => (
                  <Cell key={i} fill={d.avgInc > 1e6 ? '#c27040' : d.avgInc > 5e4 ? '#2563eb' : '#60a5fa'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <Card>
              <CardContent className="pt-5">
                <h3 className="text-lg font-semibold tracking-tight mb-3">Design Parameters</h3>
                <Table>
                  <TableBody>
                    {[
                      ['Middle Rate', fmtPct(midRate), 'Income $stdDed\u2013$1M, unified with CG'],
                      ['Top Rate', fmtPct(topRate), 'Income above $1M, unified with CG'],
                      ['Standard Deduction', `$${stdS.toLocaleString()} / $${stdJ.toLocaleString()}`, 'Single / Joint \u2014 only deduction'],
                      ['ETI (top brackets)', etiScenario === 'low' ? '0.15' : '0.30', etiScenario === 'low' ? 'Accord-specific: CG unified, loopholes closed' : 'Conventional estimate'],
                      ['ETI (middle brackets)', '0.20', 'Both scenarios'],
                      ['Capital Gains', 'Ordinary rates', 'No preferential treatment'],
                      ['Deductions', 'Standard only', 'No mortgage, charity, SALT, etc.'],
                    ].map(([k, v, note]) => (
                      <TableRow key={k}>
                        <TableCell className="text-muted-foreground w-[35%]">{k}</TableCell>
                        <TableCell className="font-bold">{v}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <h3 className="text-lg font-semibold tracking-tight mb-3">Revenue Benchmarks</h3>
                <Table>
                  <TableBody>
                    {[
                      ['Current Law', CL_REVENUE, 0, false],
                      ['Prior Accord (same income tax)', CL_REVENUE, 0, false],
                      ['Sweet Spot (25% / 50%)', sweetRev, sweetRev - CL_REVENUE, false],
                      ['Optimal (30% / 60%)', optRev, optRev - CL_REVENUE, false],
                      ['Current selection', revenue.total, revenue.total - CL_REVENUE, true],
                    ].map(([k, rev, vs, hi]) => (
                      <TableRow key={k} className={hi ? 'bg-blue-50' : ''}>
                        <TableCell className={hi ? 'font-bold' : ''}>{k}</TableCell>
                        <TableCell className="font-bold">{fmt(rev, 2)}</TableCell>
                        <TableCell className={`text-xs ${vs > 0 ? 'text-[#307ca6]' : vs < 0 ? 'text-[#c27040]' : 'text-muted-foreground'}`}>
                          {vs > 0 ? '+' : ''}{vs !== 0 ? fmt(vs, 2) : '\u2014'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <InfoBox className="mt-4 bg-amber-50 border-amber-200 text-amber-900">
                  Revenue increases monotonically across the tested range. Laffer peak at ~83% (ETI=0.20). Sweet spot 25/50 chosen for distributional fairness — $75–200K bracket stays better off vs prior Accord when VAT cut (10%{'\u2192'}3%) is included.
                </InfoBox>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== TAB 1: HEAT MAP ===== */}
        <TabsContent value="heatmap">
          <Card className="mt-6">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Revenue Heat Map — 13x26 Grid</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Revenue in $T. Green = higher. <strong>*</strong> = beats Current Law ($2.39T). ETI: middle 0.20 / top {etiScenario === 'low' ? '0.15' : '0.30'}.
                Std deduction: ${stdS.toLocaleString()} single.
              </p>
              <div className="overflow-x-auto">
                <table className="border-collapse text-[10px]">
                  <thead>
                    <tr>
                      <th className="px-2.5 py-1 text-right font-bold text-xs text-foreground">{'Mid\u2193 Top\u2192'}</th>
                      {heatMap[0].cells.map(c => (
                        <th key={c.tR} className="px-1 py-0.5 text-center font-semibold text-foreground min-w-[40px]">
                          {Math.round(c.tR * 100)}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatMap.map(row => (
                      <tr key={row.mR}>
                        <td className="px-2.5 py-0.5 font-bold text-foreground text-right">
                          {Math.round(row.mR * 100)}%
                        </td>
                        {row.cells.map(cell => {
                          const isCurrent = Math.abs(row.mR - midRate) < 0.005 && Math.abs(cell.tR - topRate) < 0.005;
                          return (
                            <td key={cell.tR} style={{
                              padding: '3px 4px', textAlign: 'center', minWidth: 40,
                              background: isCurrent ? '#fbbf24' : heatColor(cell.rev, hmMin, hmMax),
                              color: cell.rev > (hmMin + hmMax) / 2 ? '#fff' : '#111',
                              fontWeight: isCurrent ? 800 : 400,
                              outline: isCurrent ? '2px solid #f59e0b' : 'none',
                            }}>
                              {(cell.rev / 1e12).toFixed(2)}{cell.rev >= CL_REVENUE ? '*' : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                * = meets or exceeds Current Law baseline. Yellow cell = current slider selection. All cells in this grid beat CL — even 18% / 35% produces more revenue than current law due to base-broadening (CG unification, no deductions).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 2: INCOME TAX DISTRIBUTIONAL ===== */}
        <TabsContent value="distributional">
          <Card className="mt-6">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-1">
                Income Tax Change by Bracket — New Two-Rate vs Current Law
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Key insight: marginal rates fall for most brackets, but effective rates can rise because deductions are eliminated and capital gains are unified with ordinary income.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      {[
                        'Bracket', 'Avg Income', 'Filers',
                        'CL Marginal', 'New Marginal', 'Marginal \u0394',
                        'CL Effective', 'New Effective', 'Effective \u0394',
                        'Income Tax \u0394/yr', 'ETI Factor', 'Note'
                      ].map((h, i) => (
                        <th key={h} className={`px-2 py-2 text-[11px] font-bold ${i > 2 ? 'text-right' : 'text-left'}`}
                          style={{
                            background: [3,4,5].includes(i) ? '#374151' : [6,7,8].includes(i) ? '#1a5276' : undefined,
                          }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.details.map((d, i) => {
                      const clTaxPerFiler = d.effCL * d.avgInc;
                      const newTaxPerFiler = d.adj / d.filers;
                      const delta = newTaxPerFiler - clTaxPerFiler;

                      // Approximate current-law top marginal rate by income level
                      const clMarginal =
                        d.avgInc <  11000 ? 0.10 :
                        d.avgInc <  44725 ? 0.12 :
                        d.avgInc <  95375 ? 0.22 :
                        d.avgInc < 100000 ? 0.24 :
                        d.avgInc < 182050 ? 0.24 :
                        d.avgInc < 231250 ? 0.32 :
                        d.avgInc < 578125 ? 0.35 : 0.37;

                      // New marginal rate: 25% if avg income ≤ $1M, 50% above
                      const newMarginal = d.avgInc > 1e6 ? topRate : midRate;
                      const marginalDelta = newMarginal - clMarginal;

                      const effectiveDelta = d.eff - d.effCL;

                      // Paradox: marginal down but effective up = deduction/CG base-broadening effect
                      const paradox = marginalDelta < 0 && effectiveDelta > 0.005;
                      const warn = d.avgInc > 75000 && d.avgInc < 250000 && delta > 500;
                      const bg = paradox ? 'bg-amber-50' : warn ? 'bg-orange-50' : i % 2 === 0 ? 'bg-white' : 'bg-muted/30';

                      return (
                        <tr key={i} className={`border-b border-border ${bg}`}>
                          <td className="px-2 py-1.5 font-bold text-[#1e3a5f]">{d.label}</td>
                          <td className="px-2 py-1.5">${(d.avgInc / 1000).toFixed(0)}K</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{(d.filers / 1e6).toFixed(1)}M</td>
                          {/* Marginal rates */}
                          <td className="px-2 py-1.5 text-right bg-muted/30">{fmtPct(clMarginal)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold bg-muted/30 ${newMarginal < clMarginal ? 'text-[#307ca6]' : newMarginal > clMarginal ? 'text-[#c27040]' : 'text-foreground'}`}>
                            {fmtPct(newMarginal)}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-bold bg-muted/30 ${marginalDelta < 0 ? 'text-[#307ca6]' : marginalDelta > 0 ? 'text-[#c27040]' : 'text-muted-foreground'}`}>
                            {marginalDelta > 0 ? '+' : ''}{fmtPct(marginalDelta)}
                          </td>
                          {/* Effective rates */}
                          <td className="px-2 py-1.5 text-right bg-blue-50">{fmtPct(d.effCL)}</td>
                          <td className={`px-2 py-1.5 text-right font-bold bg-blue-50 ${d.eff > d.effCL ? 'text-[#c27040]' : 'text-[#307ca6]'}`}>
                            {fmtPct(d.eff)}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-bold bg-blue-50 ${effectiveDelta > 0.005 ? 'text-[#c27040]' : effectiveDelta < -0.005 ? 'text-[#307ca6]' : 'text-muted-foreground'}`}>
                            {effectiveDelta > 0 ? '+' : ''}{fmtPct(effectiveDelta)}
                          </td>
                          {/* Tax delta */}
                          <td className={`px-2 py-1.5 text-right font-bold ${delta > 0 ? 'text-[#c27040]' : 'text-[#307ca6]'}`}>
                            {delta > 0 ? '+' : ''}{fmt(delta, 0)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground">{d.bFactor.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-xs">
                            {paradox
                              ? <span className="text-amber-600 font-bold">{'⚠ Marginal\u2193 Effective\u2191'}</span>
                              : delta < -100
                                ? <span className="text-[#307ca6] font-bold">Lower bill</span>
                                : delta > 500
                                  ? <span className="text-[#c27040] font-bold">Higher bill</span>
                                  : <span className="text-muted-foreground">{'\u2248'} Same</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <InfoBox className="mt-4 bg-amber-50 border-amber-200 text-amber-900">
                <strong>{'⚠ "Marginal\u2193 Effective\u2191" paradox'}</strong> (highlighted rows): These brackets see their top marginal rate fall under the new system, yet pay more income tax overall. Cause: (1) itemized deductions eliminated — taxable base widens; (2) capital gains taxed at ordinary rates instead of 15–20% preferential rates. A high earner at $680K faces 25% on nearly all income vs. 17.5% blended effective rate under current law (which reflected deductions + CG preference). The lower marginal rate doesn't compensate for the wider base.
              </InfoBox>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 3: FULL ACCORD TABLE ===== */}
        <TabsContent value="full-accord">
          <Card className="mt-6">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Full Accord Distributional Analysis — Primary Deliverable</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Complete per-household impact vs Current Law. Prior Accord income tax: +4% ordinary above $75K, +8% above $1M, CG at 0%/20%/ordinary ({'\u00A7'}4.1+{'\u00A7'}4.3), deductions preserved. New Accord: flat two-rate, all CG unified, no deductions.
              </p>
              <div className="flex flex-wrap gap-4 items-start mb-4">
                <div className="w-32">
                  <SliderControl
                    label={`VAT Rate`}
                    value={vatRate}
                    onChange={setVatRate}
                    min={0}
                    max={0.15}
                    step={0.01}
                    formatValue={(v) => fmtPct(v)}
                  />
                </div>
                <div className="w-32">
                  <SliderControl
                    label="LVT Rate"
                    value={lvtRate}
                    onChange={setLvtRate}
                    min={0}
                    max={0.20}
                    step={0.01}
                    formatValue={(v) => fmtPct(v)}
                  />
                </div>
                <div className="w-32">
                  <SliderControl
                    label="Snapshot Year"
                    value={snapshotYear}
                    onChange={setSnapshotYear}
                    min={1}
                    max={35}
                    step={1}
                    formatValue={(v) => `Year ${v}`}
                  />
                </div>
                {/* AMCF stats derived from equity × combined yield — not a free parameter */}
                <div className="px-3.5 py-2 bg-[#307ca6]/10 rounded-lg border border-[#307ca6]/30 text-xs leading-relaxed">
                  <strong>AMCF at Year {snapshotYear}</strong><br />
                  Equity: <strong>{fmt(amcfEquity, 1)}</strong><br />
                  Yield: <strong>{fmtPct(amcfYield)}</strong> (3.63%{'\u2192'}6.0% by Yr 15)<br />
                  Cash flow: <strong>{fmt(amcfCashFlow, 0)}/yr</strong><br />
                  Dividend: <strong>${Math.round(amcfPerCap).toLocaleString()}/person/yr</strong>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Worker Equity</p>
                  <Button
                    variant={showPSU ? 'default' : 'outline'}
                    onClick={() => setShowPSU(s => !s)}
                    className={showPSU ? 'bg-[#307ca6] hover:bg-[#307ca6]' : ''}
                  >
                    {showPSU ? '\u2713 Equity On' : 'Equity Off'}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1 max-w-[110px]">
                    {showPSU ? 'Dividends + fund units issued by bracket' : 'Toggle to add worker dividend and fund-unit columns'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ---- COMPARISON SUMMARY: Prior Accord vs New Accord ---- */}
          <Card className="mt-4">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-2">
                Prior Accord vs New Two-Rate System — Head-to-Head
              </h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Both designs include the <strong>${PREBATE_PER_PERSON.toLocaleString()}/person/yr universal prebate</strong> — it cancels in the head-to-head column but dominates benefits for lower-income households vs Current Law.
                <strong> Prior Accord ({'\u00A7'}4.1 + {'\u00A7'}4.3):</strong> 7-bracket structure retained + ordinary rates +4% above $75K median / +8% above $1M + CG at 0%/20%/ordinary + all deductions kept + 10% VAT + 3% LVT + prebate + AMCF.
                <strong> New Accord:</strong> {Math.round(midRate*100)}%/{Math.round(topRate*100)}% flat two-rate + all CG unified + no deductions + {fmtPct(vatRate)} VAT + {fmtPct(lvtRate)} LVT + carbon + prebate + AMCF.
                Year {snapshotYear} AMCF: ${Math.round(amcfPerCap).toLocaleString()}/person.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#374151] text-white">
                      <th className="px-2.5 py-2 text-left font-bold">Bracket</th>
                      <th className="px-2.5 py-2 text-right font-bold">Avg Income</th>
                      {showPSU && <th className="px-2.5 py-2 text-right font-bold bg-[#307ca6]">PSU Div</th>}
                      {showPSU && <th className="px-2.5 py-2 text-right font-bold bg-[#307ca6]">Fund units (yr)</th>}
                      <th className="px-2.5 py-2 text-right font-bold bg-[#4b5563]">Prior Accord {'\u0394'} vs CL</th>
                      <th className="px-2.5 py-2 text-right font-bold bg-[#1e3a5f]">New Accord {'\u0394'} vs CL</th>
                      <th className="px-2.5 py-2 text-right font-bold bg-[#1a5276]">New vs Prior</th>
                      <th className="px-2.5 py-2 text-center font-bold">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distribDisplay.map((d, i) => {
                      const betterVsPrior = d.deltaNewVsPrior < -100;
                      const worseVsPrior  = d.deltaNewVsPrior >  100;
                      const bg = betterVsPrior ? (i%2===0 ? 'bg-[#307ca6]/10' : 'bg-[#307ca6]/10')
                               : worseVsPrior  ? (i%2===0 ? 'bg-[#c27040]/10' : 'bg-[#c27040]/10')
                               : (i%2===0 ? 'bg-white' : 'bg-muted/30');
                      const dPrior = d.deltaPriorWithPSU;
                      const dNew   = d.deltaWithPSU;
                      return (
                        <tr key={i} className={`border-b border-border ${bg}`}>
                          <td className="px-2.5 py-1.5 font-bold text-[#1e3a5f]">{d.label}</td>
                          <td className="px-2.5 py-1.5 text-right text-muted-foreground">${(d.avgInc/1000).toFixed(0)}K</td>
                          {showPSU && (
                            <td className="px-2.5 py-1.5 text-right font-bold text-[#307ca6] bg-[#307ca6]/10">
                              {'\u2212'}{fmt(d.psuDividend, 0)}
                            </td>
                          )}
                          {showPSU && (
                            <td className="px-2.5 py-1.5 text-right font-bold text-[#307ca6] bg-[#307ca6]/10">
                              {'\u2212'}{fmt(d.psuCashout, 0)}
                            </td>
                          )}
                          <td className={`px-2.5 py-1.5 text-right font-semibold bg-muted/30 ${dPrior < 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                            {dPrior < 0 ? '\u2212' : '+'}{fmt(Math.abs(dPrior), 0)}
                            <span className="text-[10px] text-muted-foreground ml-1">({dPrior < 0 ? '\u2212' : '+'}{Math.abs(d.deltaPriorPct).toFixed(1)}%)</span>
                          </td>
                          <td className={`px-2.5 py-1.5 text-right font-bold bg-blue-50/50 ${dNew < 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                            {dNew < 0 ? '\u2212' : '+'}{fmt(Math.abs(dNew), 0)}
                            <span className="text-[10px] text-muted-foreground ml-1">({dNew < 0 ? '\u2212' : '+'}{Math.abs(d.deltaPct).toFixed(1)}%)</span>
                          </td>
                          <td className={`px-2.5 py-1.5 text-right font-bold bg-violet-50/50 ${d.deltaNewVsPrior < 0 ? 'text-[#307ca6]' : d.deltaNewVsPrior > 0 ? 'text-[#c27040]' : 'text-muted-foreground'}`}>
                            {d.deltaNewVsPrior < 0 ? '\u2212' : d.deltaNewVsPrior > 0 ? '+' : ''}{fmt(Math.abs(d.deltaNewVsPrior), 0)}
                          </td>
                          <td className="px-2.5 py-1.5 text-center font-bold text-xs">
                            {betterVsPrior
                              ? <span className="text-[#307ca6]">{'\u2713'} New better</span>
                              : worseVsPrior
                                ? <span className="text-[#c27040]">{'\u2717'} Prior better</span>
                                : <span className="text-muted-foreground">{'\u2248'} Similar</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {showPSU && (
                <InfoBox className="mt-3 bg-[#307ca6]/10 border-[#307ca6]/30 text-[#307ca6]">
                  Worker equity is identical in both Accord designs — shifts both "Prior {'\u0394'}" and "New {'\u0394'}" equally, so "New vs Prior" is unaffected by the toggle. <strong>PSU Div:</strong> annual worker-equity cash income (Tier 1 Sectoral Fund payouts, profit-sharing from the worker trust, and cash dividends on Worker Equity Fund units already held). <strong>Fund units (yr):</strong> Worker Equity Fund units issued that year by hours worked, from the dividends on the 21% stake the worker trust of each company worth $10M or more holds permanently. Units are portable wealth; nothing is redeemed at a job change.
                </InfoBox>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
                {(() => {
                  const priorBetter    = distribDisplay.filter(d => d.priorBetterOff).reduce((s,d) => s+d.filers, 0);
                  const newBetter      = distribDisplay.filter(d => d.betterOff).reduce((s,d) => s+d.filers, 0);
                  const newWinsBrackets = distribDisplay.filter(d => d.deltaNewVsPrior < -100).reduce((s,d) => s+d.filers, 0);
                  return [
                    <MilestoneCard key="prior" label="Prior Accord better off vs CL" value={`${(priorBetter/totalFilers*100).toFixed(1)}%`} sub={`${(priorBetter/1e6).toFixed(0)}M filers${showPSU ? ' (incl. PSU)' : ''}`} />,
                    <MilestoneCard key="new" label="New Accord better off vs CL" value={`${(newBetter/totalFilers*100).toFixed(1)}%`} sub={`${(newBetter/1e6).toFixed(0)}M filers${showPSU ? ' (incl. PSU)' : ''}`} className={newBetter > priorBetter ? 'border-blue-200 bg-blue-50/50' : ''} />,
                    <MilestoneCard key="head" label="New beats Prior (head-to-head)" value={`${(newWinsBrackets/totalFilers*100).toFixed(1)}%`} sub="PSU cancels \u2014 not affected by toggle" className={newWinsBrackets > totalFilers * 0.5 ? 'border-blue-200 bg-blue-50/50' : ''} />,
                  ];
                })()}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="pt-5">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      {[
                        'Bracket', 'Avg Inc', 'Filers',
                        'CL Tax', 'New Inc Tax', '\u0394Inc Tax',
                        'VAT Burden', 'LVT Net', 'Carbon Net',
                        'Prebate', 'AMCF Div',
                        ...(showPSU ? ['PSU Div', 'Fund units (yr)'] : []),
                        'NET \u0394 vs CL', '% Income', 'Status'
                      ].map((h, i) => (
                        <th key={i} className={`px-2 py-2 text-[11px] font-bold ${i > 2 ? 'text-right' : 'text-left'}`}
                          style={{
                            background: h === 'Prebate' ? '#1a4d68' : h === 'PSU Div' ? '#1a4d68' : h === 'Fund units (yr)' ? '#1f5d7e' : h === 'NET \u0394 vs CL' ? '#1a5276' : undefined,
                          }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {distribDisplay.map((d, i) => {
                      const incTaxDelta = d.newTax - d.clTax;
                      const warn = d.avgInc > 75000 && d.avgInc < 250000 && !d.betterOff;
                      const bg = d.betterOff
                        ? i % 2 === 0 ? 'bg-[#307ca6]/10' : 'bg-[#307ca6]/10'
                        : warn ? 'bg-yellow-100' : 'bg-[#c27040]/10';
                      return (
                        <tr key={i} className={`border-b border-border ${bg}`}>
                          <td className="px-2 py-1.5 font-bold text-[#1e3a5f]">{d.label}</td>
                          <td className="px-1.5 py-1.5 text-right">${(d.avgInc / 1000).toFixed(0)}K</td>
                          <td className="px-1.5 py-1.5 text-right text-muted-foreground">{(d.filers / 1e6).toFixed(1)}M</td>
                          <td className="px-1.5 py-1.5 text-right text-muted-foreground">${(d.clTax / 1000).toFixed(1)}K</td>
                          <td className="px-1.5 py-1.5 text-right font-semibold">${(d.newTax / 1000).toFixed(1)}K</td>
                          <td className={`px-1.5 py-1.5 text-right ${incTaxDelta > 0 ? 'text-[#c27040]' : 'text-[#307ca6]'}`}>
                            {incTaxDelta > 0 ? '+' : ''}{fmt(incTaxDelta, 0)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right text-[#c27040]">
                            +{fmt(d.vatNew, 0)}
                          </td>
                          <td className={`px-1.5 py-1.5 text-right ${d.lvtBurden > 0 ? 'text-[#c27040]' : 'text-[#307ca6]'}`}>
                            {d.lvtBurden > 0 ? '+' : ''}{fmt(d.lvtBurden, 0)}
                          </td>
                          <td className={`px-1.5 py-1.5 text-right ${d.carbonNet > 0 ? 'text-[#c27040]' : 'text-[#307ca6]'}`}>
                            {d.carbonNet > 0 ? '+' : ''}{fmt(d.carbonNet, 0)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right font-bold text-[#307ca6] bg-[#307ca6]/10">
                            {'\u2212'}{fmt(d.prebate, 0)}
                          </td>
                          <td className="px-1.5 py-1.5 text-right text-[#307ca6]">
                            {'\u2212'}{fmt(d.amcfBenefit, 0)}
                          </td>
                          {showPSU && (
                            <td className="px-1.5 py-1.5 text-right font-bold text-[#307ca6] bg-[#307ca6]/10">
                              {'\u2212'}{fmt(d.psuDividend, 0)}
                            </td>
                          )}
                          {showPSU && (
                            <td className="px-1.5 py-1.5 text-right font-bold text-[#307ca6] bg-[#307ca6]/10">
                              {'\u2212'}{fmt(d.psuCashout, 0)}
                            </td>
                          )}
                          <td className={`px-2 py-1.5 text-right font-extrabold bg-blue-50/50 ${d.delta < 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                            {d.delta < 0 ? '\u2212' : '+'}{fmt(Math.abs(d.delta), 0)}
                          </td>
                          <td className={`px-1.5 py-1.5 text-right ${d.delta < 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                            {d.delta < 0 ? '\u2212' : '+'}{Math.abs(d.deltaPct).toFixed(1)}%
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold text-xs">
                            {d.betterOff
                              ? <span className="text-[#307ca6]">{'\u2713'} Better</span>
                              : warn
                                ? <span className="text-amber-600">{'⚠'} Review</span>
                                : <span className="text-[#c27040]">{'\u2717'} Higher</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                <MilestoneCard
                  label="Households Better Off"
                  value={`${betterOffPct}%`}
                  sub={`${(betterOffFilers / 1e6).toFixed(0)}M of ${(totalFilers / 1e6).toFixed(0)}M filers`}
                  className={+betterOffPct > 90 ? 'border-blue-200 bg-blue-50/50' : ''}
                />
                <MilestoneCard label="Breakeven Bracket" value={breakEven?.label || 'None (all better off)'} sub="First bracket with net cost vs CL" />
                <MilestoneCard label="Prior Accord Result" value="98.8%" sub="Better off (10% VAT, same income tax, $1K AMCF)" />
                <MilestoneCard
                  label="Income Tax Revenue"
                  value={fmt(revenue.total, 2)}
                  sub={`+${fmt(revenue.total - CL_REVENUE, 2)} vs CL`}
                  className={revenue.total > CL_REVENUE ? 'border-blue-200 bg-blue-50/50' : ''}
                />
              </div>

              <InfoBox className="mt-4">
                <strong>How to read this table:</strong> NET {'\u0394'} = (New Income Tax {'\u2212'} CL Tax) + VAT Burden + LVT Net + Carbon Net {'\u2212'} Prebate {'\u2212'} AMCF Dividend{showPSU ? ' \u2212 Worker Dividends \u2212 Fund units (yr)' : ''}. <em>Fund units (yr) are wealth, not income: units issued that year, held rather than spent.</em> Negative = better off vs Current Law. <strong>Prebate: ${PREBATE_PER_PERSON.toLocaleString()}/person/yr {'\u00D7'} household size</strong> — universal payment to every American regardless of income, the core redistributionary mechanism that makes the consumption tax progressive. VAT at {fmtPct(vatRate)} (CL = 0%). Carbon at $100/ton, 80% returned as equal per-capita dividend. LVT net = homeowners pay LVT; renters in lower brackets get net rent relief from reduced landlord costs. AMCF dividend = {fmt(amcfEquity, 1)} equity {'\u00D7'} {fmtPct(amcfYield)} yield {'\u00F7'} population = ${Math.round(amcfPerCap).toLocaleString()}/person/yr at Year {snapshotYear}.
              </InfoBox>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 4: STD DEDUCTION SENSITIVITY ===== */}
        <TabsContent value="std-sensitivity">
          <Card className="mt-6">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Standard Deduction Sensitivity</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Revenue at fixed rates ({fmtPct(midRate)} / {fmtPct(topRate)}) across standard deduction levels.
                Joint = 2{'\u00D7'} single. Current: ${stdS.toLocaleString()} / ${stdJ.toLocaleString()}.
              </p>
              <ChartContainer height={260} className="mt-0">
                <BarChart data={stdSensitivity.map(d => ({
                  name: `$${(d.s / 1000).toFixed(0)}K`, rev: +(d.rev / 1e12).toFixed(3),
                }))}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="name" tick={CHART_AXIS.tick} />
                  <YAxis domain={['auto', 'auto']} label={{ value: 'Revenue ($T)', angle: -90, position: 'insideLeft', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}T`} tick={CHART_AXIS.tick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`$${v.toFixed(3)}T`, 'Revenue']} />
                  <Bar dataKey="rev" name="Revenue" radius={[4, 4, 0, 0]}>
                    {stdSensitivity.map((d, i) => <Cell key={i} fill={d.s === stdS ? '#2563eb' : '#93c5fd'} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
              <Table className="mt-5">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {['Std Deduction (single)', 'Joint', 'Revenue', 'vs CL', 'vs $30K baseline', 'Filers above deduction'].map(h => (
                      <TableHead key={h} className="text-xs font-semibold">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stdSensitivity.map((d, i) => {
                    const base30 = stdSensitivity[2].rev;
                    const filersAbove = BRACKETS.filter(b => {
                      const avgInc = b.agi / b.filers;
                      const sd = b.jFrac * (d.s * 2) + (1 - b.jFrac) * d.s;
                      return avgInc > sd;
                    }).reduce((s, b) => s + b.filers, 0);
                    return (
                      <TableRow key={i} className={d.s === stdS ? 'bg-blue-50' : ''}>
                        <TableCell className={d.s === stdS ? 'font-bold' : ''}>${d.s.toLocaleString()}{d.s === stdS ? ' \u2190' : ''}</TableCell>
                        <TableCell>${(d.s * 2).toLocaleString()}</TableCell>
                        <TableCell className="font-semibold">{fmt(d.rev, 3)}</TableCell>
                        <TableCell className={d.rev >= CL_REVENUE ? 'text-[#307ca6]' : 'text-[#c27040]'}>
                          {d.rev >= CL_REVENUE ? '+' : ''}{fmt(d.rev - CL_REVENUE, 0)}
                        </TableCell>
                        <TableCell className={d.rev >= base30 ? 'text-[#307ca6]' : 'text-[#c27040]'}>
                          {d.rev >= base30 ? '+' : ''}{fmt(d.rev - base30, 0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{(filersAbove / 1e6).toFixed(0)}M</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <InfoBox className="mt-4 bg-[#307ca6]/10 border-[#307ca6]/30 text-[#307ca6]">
                <strong>$30K standard deduction</strong> fully exempts households below ~median income from income tax exposure and generates +{fmt(stdSensitivity[2].rev - CL_REVENUE, 0)} vs CL. Raising to $50K costs ~{fmt(stdSensitivity[2].rev - stdSensitivity[4].rev, 0)} in revenue. Lowering to $20K raises an additional ~{fmt(stdSensitivity[0].rev - stdSensitivity[2].rev, 0)}.
              </InfoBox>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 5: CAPITAL GAINS SCENARIOS ===== */}
        <TabsContent value="capital-gains">
          <Card className="mt-6">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Capital Gains Treatment Scenarios</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Buy-borrow-die loophole closed in all scenarios (estates recognize gains at death). Carried interest taxed as ordinary in B and C.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {[
                  { key: 'current', label: 'A: Current Pref Rates', note: 'Long-term CG at 15%/20%. Carried interest at CG rates. Buy-borrow-die closed.', extra: 0 },
                  { key: 'pref', label: 'B: Partial Unification', note: 'Carried interest as ordinary income. Short-term CG as ordinary. Long-term CG still preferential (15%/20%).', extra: 150e9 },
                  { key: 'unified', label: 'C: Full Unification', note: 'All income (wages, CG, dividends, interest) taxed at ordinary rates. Highest ETI sensitivity. ~$585B extra.', extra: 585e9 },
                ].map(sc => (
                  <button key={sc.key} onClick={() => setCgScenario(sc.key)}
                    className={`p-4 rounded-lg border-2 cursor-pointer text-left transition-colors ${cgScenario === sc.key ? 'bg-blue-50 border-blue-500' : 'bg-card border-border hover:border-muted-foreground/30'}`}>
                    <div className="text-sm font-bold mb-2">{sc.label}</div>
                    <div className="text-xs text-muted-foreground mb-3">{sc.note}</div>
                    <div className="text-2xl font-extrabold text-blue-600">{fmt(revenue.total + sc.extra, 2)}</div>
                    <div className={`text-xs mt-1 ${sc.extra > 0 ? 'text-[#307ca6]' : 'text-muted-foreground'}`}>
                      {sc.extra > 0 ? `+${fmt(sc.extra, 0)} CG premium` : 'No CG uplift'}
                    </div>
                  </button>
                ))}
              </div>

              <h3 className="text-sm font-bold mb-3">Capital Gains by Bracket — Revenue Impact of Full Unification vs Pref Rates</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      {['Bracket', 'CG % of Income', 'CG per Filer', 'Rate A (pref)', 'Rate B (partial)', 'Rate C (unified)', 'Extra Rev C\u2212A'].map(h => (
                        <th key={h} className="px-2 py-2 font-semibold border-b-2 border-border text-xs text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {BRACKETS.map((b, i) => {
                      const avgInc = b.agi / b.filers;
                      const cgAmt = b.cgShare * avgInc;
                      const rateA = 0.185; // blended pref
                      const rateB = Math.min(midRate, 0.25);
                      const rateC = avgInc > 1e6 ? topRate : midRate;
                      const extraRev = (rateC - rateA) * cgAmt * b.filers;
                      return (
                        <tr key={i} className={`border-b border-border ${b.cgShare > 0.20 ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-muted/30'}`}>
                          <td className="px-2 py-1.5 font-semibold">{b.label}</td>
                          <td className="px-2 py-1.5">{(b.cgShare * 100).toFixed(0)}%</td>
                          <td className="px-2 py-1.5">${(cgAmt / 1000).toFixed(0)}K</td>
                          <td className="px-2 py-1.5">{(rateA * 100).toFixed(0)}%</td>
                          <td className="px-2 py-1.5">{(rateB * 100).toFixed(0)}%</td>
                          <td className="px-2 py-1.5 font-bold text-blue-600">{(rateC * 100).toFixed(0)}%</td>
                          <td className={`px-2 py-1.5 ${extraRev > 1e9 ? 'text-[#307ca6]' : 'text-muted-foreground'} ${extraRev > 50e9 ? 'font-bold' : ''}`}>
                            {extraRev > 1e9 ? `+${fmt(extraRev, 0)}` : '< $1B'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <InfoBox className="mt-4">
                <strong>Full unification premium: ~$585B/year.</strong> 85%+ of the gain comes from the top 3 brackets ($2M+), where CG makes up 35–56% of income. At $100K–$1M, the CG share is only 4–15%, so the per-bracket CG uplift is modest. The $585B figure is the single largest lever in the income tax reform — larger than eliminating itemized deductions alone.
              </InfoBox>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
