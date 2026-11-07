import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { householdFlowsAt, workerEquityAt, wefPriceAt, amcfG } from '@/lib/household-model';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtK  = v => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}K`;
const fmtPct = v => `${(v * 100).toFixed(1)}%`;

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? fmtK(p.value) : fmtPct(p.value || 0)}
        </p>
      ))}
    </div>
  );
};

// ─── Seeded PRNG (LCG + Box-Muller) ─────────────────────────────────────────

function makeRng(seed) {
  let s = seed >>> 0;
  return {
    next() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; },
    normal(mu = 0, sig = 1) {
      const u1 = Math.max(1e-10, this.next()), u2 = this.next();
      return mu + sig * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────
// Taxes, transfers, worker equity and AMCF grants come from the shared household model at the
// site defaults (src/lib/household-model.js). The worker enters work at 22 in Accord Year 1, so
// has no childhood AMCF account. Past Year 35, the engine's Year-35 real values are held.

const N_PATHS    = 4000;
const CAREER_YRS = 45;   // age 22 → 67
const MEAN_RET   = 0.05; // real equity return
const STD_RET    = 0.16;
const AMCF_RET   = 0.05; // AMCF fund real return

const amcfGrant = year => (year <= 0 ? 0 : Math.round(amcfG(year)));

// BLS age-wage multipliers relative to age-22 level
// Medians: 22-24 ≈ $28K, 25-34 ≈ $48K, 35-44 ≈ $58K, 45-54 ≈ $59K, 55-64 ≈ $57K
function ageMult(age) {
  if (age < 25) return 1.00;
  if (age < 35) return 1.71;
  if (age < 45) return 2.07;
  if (age < 55) return 2.11;
  return 2.04;
}

// ─── Income Quintile Parameters ──────────────────────────────────────────────

// startWage calibrated so Q3 tracks BLS median weekly earnings
// 401(k) participation from Vanguard How America Saves / BLS data
// SS benefits estimated from SSA PIA formula (2024 bend points)
// accordSaveRate: share of the Accord's added cash the worker saves
const QUINTILES = [
  { label: 'Bottom 20%',   shortLabel: 'Q1', startWage: 17000, k401Part: 0.30, ssBenefit: 14400, accordSaveRate: 0.05, color: '#c27040' },
  { label: '2nd Quintile', shortLabel: 'Q2', startWage: 26000, k401Part: 0.45, ssBenefit: 19200, accordSaveRate: 0.08, color: '#F97316' },
  { label: 'Middle 20%',   shortLabel: 'Q3', startWage: 34000, k401Part: 0.55, ssBenefit: 23400, accordSaveRate: 0.12, color: '#307ca6' },
  { label: '4th Quintile', shortLabel: 'Q4', startWage: 50000, k401Part: 0.65, ssBenefit: 28800, accordSaveRate: 0.15, color: '#3B82F6' },
  { label: 'Top 20%',      shortLabel: 'Q5', startWage: 85000, k401Part: 0.75, ssBenefit: 34200, accordSaveRate: 0.22, color: '#8B5CF6' },
];

// ─── Current Retirees: Year-1 Impact ──────────────────────────────────────────
// Households already retired in Year 1 receive the prebate, carbon dividend and the Year-1 AMCF
// grant, and pay the VAT, carbon costs, residential LVT and the health contribution. They keep
// Medicare and build no worker equity. Social Security keeps its current-law taxability under
// both systems. Single-filer basis; 1.6-person household.
const RETIREE_HHSZ = 1.6;

// Current-law Social Security taxability (single filer, IRS provisional-income rule)
function taxableSS(ss, withdrawal) {
  const combined = withdrawal + 0.5 * ss;
  if (combined <= 25000) return 0;
  if (combined <= 34000) return Math.min(0.5 * ss, 0.5 * (combined - 25000));
  return Math.min(0.85 * ss, 0.85 * (combined - 34000) + Math.min(0.5 * ss, 4500));
}
function currentRetiree(q, income) {
  const ss = q.ssBenefit, withdrawal = Math.max(0, income - ss);
  const taxable = taxableSS(ss, withdrawal) + withdrawal;
  const f = householdFlowsAt({ income, taxableIncome: taxable, hhSz: RETIREE_HHSZ, over65: true, wageIncome: false }, 1);
  const grants = amcfGrant(1) * RETIREE_HHSZ;
  const net = f.net + grants;
  return {
    income: Math.round(income),
    transfers: Math.round(f.prebate + f.dividend + grants),
    vat: Math.round(f.vat),
    incTaxChange: Math.round(f.incomeTax),
    net: Math.round(net),
    netPct: income > 0 ? net / income : 0,
  };
}

// ─── Core Simulation ─────────────────────────────────────────────────────────

// The Accord's additions for one worker in career year y: added cash (taxes and transfers plus
// worker trust payouts) and Worker Equity Fund units issued, from the worker's income bracket.
function accordYear(q, y) {
  const salary = q.startWage * ageMult(22 + y);
  const f = householdFlowsAt({ income: salary, hhSz: 1 }, y);
  const we = workerEquityAt(salary, y);
  return { cash: f.net + we.cash / we.earners, units: we.unitsIssued / we.earners / wefPriceAt(y), sectoral: we.sectoral / we.earners };
}

function runSimulation() {
  const rng = makeRng(2024);

  const results = QUINTILES.map(q => {
    const curArr = [];
    const accArr = [];
    const years = Array.from({ length: CAREER_YRS }, (_, i) => accordYear(q, i + 1));
    const units = years.reduce((s, a) => s + a.units, 0);
    const workerEquity = units * wefPriceAt(CAREER_YRS) + years[CAREER_YRS - 1].sectoral;

    for (let p = 0; p < N_PATHS; p++) {
      let wCur = 0, wAcc = 0, amcf = 0;
      for (let y = 1; y <= CAREER_YRS; y++) {
        const salary = q.startWage * ageMult(22 + y);
        const ret    = rng.normal(MEAN_RET, STD_RET);
        // 401(k) (weighted participation: includes zero for non-participants)
        const k401     = q.k401Part * 0.09 * salary;
        // Small base savings for non-participants (~2.5% after-tax, partial)
        const baseSave = (1 - q.k401Part) * 0.025 * 0.85 * salary;
        wCur = (wCur + k401 + baseSave) * (1 + ret);
        // AMCF grants accumulate at the fund return (not the market draw)
        amcf = (amcf + amcfGrant(y)) * (1 + AMCF_RET);
        wAcc = (wAcc + k401 + baseSave + years[y - 1].cash * q.accordSaveRate) * (1 + ret);
      }
      curArr.push(wCur);
      accArr.push(wAcc + amcf + workerEquity);
    }

    curArr.sort((a, b) => a - b);
    accArr.sort((a, b) => a - b);
    const pct = (arr, p) => arr[Math.floor(arr.length * p)];

    // Deterministic decomposition at the mean return for the stacked chart
    let d_k401 = 0, d_amcf = 0, d_cash = 0;
    for (let y = 1; y <= CAREER_YRS; y++) {
      const salary = q.startWage * ageMult(22 + y);
      d_k401 = (d_k401 + q.k401Part * 0.09 * salary + (1 - q.k401Part) * 0.025 * 0.85 * salary) * (1 + MEAN_RET);
      d_cash = (d_cash + years[y - 1].cash * q.accordSaveRate) * (1 + MEAN_RET);
      d_amcf = (d_amcf + amcfGrant(y)) * (1 + AMCF_RET);
    }
    const decompAccord = {
      '401(k) / Savings':  Math.round(d_k401),
      'AMCF Account':      Math.round(d_amcf),
      'Worker Equity':     Math.round(workerEquity),
      'Accord Cash Saved': Math.round(d_cash),
    };

    const cur_annualIncome = q.ssBenefit + pct(curArr, 0.50) * 0.04;
    const acc_annualIncome = q.ssBenefit + pct(accArr, 0.50) * 0.04;

    return {
      shortLabel: q.shortLabel, label: q.label, color: q.color, ssBenefit: q.ssBenefit,
      cur_p25: Math.round(pct(curArr, 0.25)), cur_p50: Math.round(pct(curArr, 0.50)), cur_p75: Math.round(pct(curArr, 0.75)),
      acc_p25: Math.round(pct(accArr, 0.25)), acc_p50: Math.round(pct(accArr, 0.50)), acc_p75: Math.round(pct(accArr, 0.75)),
      cur_annualIncome: Math.round(cur_annualIncome), acc_annualIncome: Math.round(acc_annualIncome),
      n50k_c:  curArr.filter(v => v < 50000).length / N_PATHS,  n50k_a:  accArr.filter(v => v < 50000).length / N_PATHS,
      n250k_c: curArr.filter(v => v < 250000).length / N_PATHS, n250k_a: accArr.filter(v => v < 250000).length / N_PATHS,
      decompAccord,
      cashY1: years[0].cash,
      retiree: currentRetiree(q, cur_annualIncome),
    };
  });

  // Aggregate headline stats (equal 20% weight per quintile)
  const avg = f => results.reduce((s, r) => s + f(r), 0) / results.length;
  return {
    results,
    natBelow50k_c: avg(r => r.n50k_c), natBelow50k_a: avg(r => r.n50k_a),
    natBelow250k_c: avg(r => r.n250k_c), natBelow250k_a: avg(r => r.n250k_a),
  };
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const ACCORD_GREEN  = '#1f5d7e';
const CURRENT_BLUE  = '#1D4ED8';
const DECOMP_COLORS = {
  '401(k) / Savings':     '#93C5FD',
  'AMCF Account':         '#307ca6',
  'Worker Equity':        '#1f5d7e',
  'Accord Cash Saved':    '#FBBF24',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function RetirementSecurity() {
  const { results, natBelow50k_c, natBelow50k_a, natBelow250k_c, natBelow250k_a } =
    useMemo(() => runSimulation(), []);

  // Build chart datasets
  const comparisonData = results.map(r => ({
    name: r.shortLabel,
    'Current System (Median)': r.cur_p50,
    'Accord (Median)':         r.acc_p50,
  }));

  const decompData = results.map(r => ({
    name: r.shortLabel,
    ...r.decompAccord,
  }));

  const incomeData = results.map(r => ({
    name: r.shortLabel,
    'Current: SS + 401(k) Drawdown': r.cur_annualIncome,
    'Accord: SS + Savings, AMCF and Worker Equity Drawdown': r.acc_annualIncome,
  }));

  const signedK = v => `${v < 0 ? '−' : '+'}$${Math.abs(Math.round(v)).toLocaleString()}`;

  const retireeData = results.map(r => ({ name: r.shortLabel, 'Net Year-1 benefit': r.retiree.net }));

  return (
    <PageShell>
      {/* Header */}
      <div className="border-l-4 border-[#307ca6] pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Retirement Security</h1>
        <p className="text-base font-semibold text-[#307ca6] mt-2">
          A bottom-20% worker who starts work at 22 in Year 1 retires at 67 with median wealth of{' '}
          {fmtK(results[0].acc_p50)} under the Accord, against {fmtK(results[0].cur_p50)} under current law.
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          45-year career projection (age 22-67) by income quintile. {N_PATHS.toLocaleString()} Monte Carlo paths
          per quintile using historical equity return distribution (mean 5% real, sigma 16%), at the site's default
          settings. All values in 2024 dollars.
        </p>
      </div>

      {/* Headline Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
        {[
          { label: 'Bottom 20% median retirement wealth', cur: fmtK(results[0].cur_p50), acc: fmtK(results[0].acc_p50) },
          { label: 'Middle 20% median retirement wealth', cur: fmtK(results[2].cur_p50), acc: fmtK(results[2].acc_p50) },
          { label: 'Workers below $250K at retirement', cur: fmtPct(natBelow250k_c), acc: fmtPct(natBelow250k_a) },
          { label: 'Q1 annual retirement income', cur: `$${Math.round(results[0].cur_annualIncome/1000)}K/yr`, acc: `$${Math.round(results[0].acc_annualIncome/1000)}K/yr` },
        ].map((box, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                {box.label}
              </p>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] font-semibold mb-0.5" style={{ color: CURRENT_BLUE }}>CURRENT</p>
                  <p className="text-lg font-bold" style={{ color: CURRENT_BLUE }}>{box.cur}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold mb-0.5" style={{ color: ACCORD_GREEN }}>ACCORD</p>
                  <p className="text-lg font-bold" style={{ color: ACCORD_GREEN }}>{box.acc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart 1: Retirement Wealth Comparison */}
      <ChartContainer
        title="Median Retirement Wealth at Age 67 by Income Quintile"
        subtitle="Accord: 401(k) and savings, the AMCF account, worker equity, and the saved share of the Accord's added cash. Current law: 401(k) and savings. Social Security is the same under both."
        height={320}
      >
        <BarChart data={comparisonData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="name" tick={CHART_AXIS.tick} />
          <YAxis tickFormatter={fmtK} tick={CHART_AXIS.tick} width={70} />
          <Tooltip content={<BarTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
          <Bar dataKey="Current System (Median)" fill={CURRENT_BLUE} radius={[3,3,0,0]} />
          <Bar dataKey="Accord (Median)"         fill={ACCORD_GREEN} radius={[3,3,0,0]} />
        </BarChart>
      </ChartContainer>

      {/* P25/P75 summary */}
      <div className="flex gap-3 mt-4">
        {results.map(r => (
          <Card key={r.shortLabel} className="flex-1">
            <CardContent className="py-2.5 px-3">
              <p className="text-[11px] font-bold mb-1" style={{ color: r.color }}>{r.shortLabel}</p>
              <p className="text-[11px]" style={{ color: CURRENT_BLUE }}>Current: {fmtK(r.cur_p25)} – {fmtK(r.cur_p75)}</p>
              <p className="text-[11px]" style={{ color: ACCORD_GREEN }}>Accord: {fmtK(r.acc_p25)} – {fmtK(r.acc_p75)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        P25-P75 range shown above. The spread comes from the annual return draws (sigma 16%). The AMCF account and worker
        equity do not vary with the draws, so they raise the Accord's P25 by the same dollar amount as its median.
      </p>

      {/* Current Retirees — Year 1 Impact */}
      <div className="mt-12 rounded-lg border border-[#307ca6]/30 bg-[#307ca6]/5 p-4">
        <h3 className="text-sm font-bold text-[#307ca6]">Current Retirees — Year 1 Impact</h3>
        <p className="text-sm text-[#307ca6] font-semibold mt-1.5">
          In Year 1, retired households in the bottom quintile come out {signedK(results[0].retiree.net)} a year
          and those in the top quintile {signedK(results[4].retiree.net)}, without building career equity.
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Today's retirees receive the prebate, carbon dividend and Year-1 AMCF grant, and pay the VAT, carbon costs,
          residential LVT and the health contribution. They keep Medicare. Social Security keeps its current-law taxability, and
          the rest of the income tax follows the Accord's schedule. Assumes a 1.6-person retiree household; income is Social
          Security plus a 4% draw on existing savings.
        </p>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
          {results.map(r => (
            <Card key={r.shortLabel}>
              <CardContent className="py-2.5 px-3">
                <p className="text-[11px] font-bold mb-0.5" style={{ color: r.color }}>{r.shortLabel}</p>
                <p className="text-[10px] text-muted-foreground">income {fmtK(r.retiree.income)}</p>
                <p className={`text-base font-bold ${r.retiree.net < 0 ? 'text-[#c27040]' : 'text-[#307ca6]'}`}>{signedK(r.retiree.net)}</p>
                <p className="text-[10px] text-muted-foreground">{(r.retiree.netPct * 100).toFixed(0)}% of income</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={retireeData} margin={{ top: 6, right: 24, left: 16, bottom: 6 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="name" tick={CHART_AXIS.tick} />
              <YAxis tickFormatter={fmtK} tick={CHART_AXIS.tick} width={64} />
              <Tooltip content={<BarTooltip />} />
              <Bar dataKey="Net Year-1 benefit" fill={ACCORD_GREEN} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Accord Wealth Components (Stacked) */}
      <ChartContainer
        className="mt-12"
        title="Accord Retirement Wealth — What's In It"
        subtitle="Components at the mean return (5% real). The AMCF account is the same for every quintile."
        source={`AMCF: 45 years of grants (${fmtK(amcfGrant(1))} in Year 1, ${fmtK(amcfGrant(35))} at Year 35, held at that level after), compounding at 5% real. Worker equity: Worker Equity Fund units and Sectoral Fund balances for the worker's income bracket. Accord cash saved: the saved share of the prebate, carbon dividend, income tax change, VAT, LVT, carbon costs, health contribution, converted wages and premiums saved, and worker trust payouts.`}
        height={320}
      >
        <BarChart data={decompData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="name" tick={CHART_AXIS.tick} />
          <YAxis tickFormatter={fmtK} tick={CHART_AXIS.tick} width={70} />
          <Tooltip content={<BarTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
          {Object.keys(DECOMP_COLORS).map(key => (
            <Bar key={key} dataKey={key} stackId="a" fill={DECOMP_COLORS[key]} />
          ))}
        </BarChart>
      </ChartContainer>

      {/* Chart 3: Annual Retirement Income */}
      <ChartContainer
        className="mt-12"
        title="Annual Retirement Income at Age 67 (SS + Drawdown)"
        subtitle="Assumes 4% Safe Withdrawal Rate on retirement wealth. Social Security unchanged under both systems."
        height={280}
      >
        <BarChart data={incomeData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis dataKey="name" tick={CHART_AXIS.tick} />
          <YAxis tickFormatter={fmtK} tick={CHART_AXIS.tick} width={70} />
          <Tooltip content={<BarTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
          <Bar dataKey="Current: SS + 401(k) Drawdown"          fill={CURRENT_BLUE} radius={[3,3,0,0]} />
          <Bar dataKey="Accord: SS + Savings, AMCF and Worker Equity Drawdown" fill={ACCORD_GREEN} radius={[3,3,0,0]} />
        </BarChart>
      </ChartContainer>

      {/* Summary Table */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Retirement Adequacy Metrics by Quintile</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          Fraction of simulated career paths reaching retirement below savings thresholds
        </p>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Income Group</TableHead>
                <TableHead style={{ color: CURRENT_BLUE }}>Current Median</TableHead>
                <TableHead style={{ color: ACCORD_GREEN }}>Accord Median</TableHead>
                <TableHead>Gain</TableHead>
                <TableHead style={{ color: CURRENT_BLUE }}>{'<$250K'} (Current)</TableHead>
                <TableHead style={{ color: ACCORD_GREEN }}>{'<$250K'} (Accord)</TableHead>
                <TableHead>Annual Income (Current)</TableHead>
                <TableHead>Annual Income (Accord)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map(r => {
                const gain = r.acc_p50 - r.cur_p50;
                return (
                  <TableRow key={r.shortLabel}>
                    <TableCell className="font-semibold" style={{ color: r.color }}>{r.label}</TableCell>
                    <TableCell style={{ color: CURRENT_BLUE }}>{fmtK(r.cur_p50)}</TableCell>
                    <TableCell className="font-semibold" style={{ color: ACCORD_GREEN }}>{fmtK(r.acc_p50)}</TableCell>
                    <TableCell className="font-semibold" style={{ color: '#307ca6' }}>+{fmtK(gain)} ({Math.round((r.acc_p50/r.cur_p50 - 1)*100)}%)</TableCell>
                    <TableCell style={{ color: CURRENT_BLUE }}>{fmtPct(r.n250k_c)}</TableCell>
                    <TableCell style={{ color: ACCORD_GREEN }}>{fmtPct(r.n250k_a)}</TableCell>
                    <TableCell>{fmtK(r.cur_annualIncome)}/yr</TableCell>
                    <TableCell className="font-semibold">{fmtK(r.acc_annualIncome)}/yr</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell>National Average</TableCell>
                <TableCell style={{ color: CURRENT_BLUE }}>{fmtK(Math.round(results.reduce((s,r)=>s+r.cur_p50,0)/results.length))}</TableCell>
                <TableCell style={{ color: ACCORD_GREEN }}>{fmtK(Math.round(results.reduce((s,r)=>s+r.acc_p50,0)/results.length))}</TableCell>
                <TableCell style={{ color: '#307ca6' }}>+{Math.round((results.reduce((s,r)=>s+r.acc_p50,0)/results.reduce((s,r)=>s+r.cur_p50,0) - 1)*100)}%</TableCell>
                <TableCell style={{ color: CURRENT_BLUE }}>{fmtPct(natBelow250k_c)}</TableCell>
                <TableCell style={{ color: ACCORD_GREEN }}>{fmtPct(natBelow250k_a)}</TableCell>
                <TableCell>{fmtK(Math.round(results.reduce((s,r)=>s+r.cur_annualIncome,0)/results.length))}/yr</TableCell>
                <TableCell>{fmtK(Math.round(results.reduce((s,r)=>s+r.acc_annualIncome,0)/results.length))}/yr</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Key Insight Box */}
      <Card className="mt-8 bg-[#307ca6]/5 border-[#307ca6]/20">
        <CardContent className="pt-5 pb-4 px-5">
          <p className="font-semibold text-[#307ca6] mb-2">The AMCF Account</p>
          <p className="text-sm text-[#307ca6]/80 leading-relaxed">
            A worker who starts work at 22 in Year 1 holds{' '}
            <strong>{fmtK(Math.round(results[0].decompAccord['AMCF Account']))}</strong> in their AMCF account at 67,
            whatever their 401(k) participation, investment timing or career breaks. The account grows at the fund's return and
            does not depend on the market draw in this simulation. A child born in Year 0 also enters adulthood with a childhood
            account.
          </p>
        </CardContent>
      </Card>

      {/* Methodology Note */}
      <InfoBox className="mt-6">
        <strong className="text-foreground">Methodology:</strong>{' '}
        Monte Carlo simulation: {N_PATHS.toLocaleString()} paths x {CAREER_YRS} years x 5 quintiles.
        Annual real equity returns drawn from N(5%, 16%) using seeded LCG + Box-Muller.
        Current system: 401(k) contributions at quintile-specific participation rate (9% combined employee+employer),
        plus minimal personal savings (2.5% for non-participants). Social Security unchanged under both systems.
        Accord additions, from the shared household model at the site's defaults: per-person AMCF grants (2024 dollars:
        ${amcfGrant(10).toLocaleString()} at Year 10, ${amcfGrant(20).toLocaleString()} at Year 20, ${amcfGrant(35).toLocaleString()} at
        Year 35, held at that level after) compounding at 5% real; Worker Equity Fund units, Sectoral Fund balances and worker trust
        payouts for the worker's income bracket; and the prebate, carbon dividend, income tax change, VAT, residential LVT, carbon
        costs, health contribution, and the converted wages and premiums saved under the Health Fund, with the added cash saved at
        income-appropriate rates. The worker starts at 22 in Year 1, so has no childhood AMCF account. Values past Year 35 hold the
        engine's Year-35 real levels. All values in 2024 dollars. BLS age-earnings profiles applied.
      </InfoBox>
    </PageShell>
  );
}
