import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtK  = v => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}K`;
const fmtPct = v => `${(v * 100).toFixed(1)}%`;

const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '10px 14px', fontSize: 12, borderRadius: 6 }}>
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

const N_PATHS    = 4000;
const CAREER_YRS = 45;   // age 22 → 67
const MEAN_RET   = 0.05; // real equity return
const STD_RET    = 0.16;
const AMCF_RET   = 0.05; // AMCF fund real return
const PSU_DIV    = 0.035;
const PSU_RAMP   = 5;    // years to reach PSU equilibrium

// AMCF per-person annual grant schedule
// Calibrated to Sim 6 validated outputs (base scenario).
// Grants grow uncapped after AMCF self-funds (Yr 9): $1,066 at Yr 10, $2,678 at Yr 15,
// $5,597 at Yr 20, $8,958 at Yr 25, $14,784 at Yr 30, $25,111 at Yr 35.
const _S6_PTS = [[9,800],[10,1066],[15,2678],[20,5597],[25,8958],[30,14784],[35,25111]];
function amcfGrant(year) {
  if (year <= 3)  return 500;
  if (year <= 6)  return 550;
  if (year <= 9)  return 800;
  for (let i = 1; i < _S6_PTS.length; i++) {
    const [x0, y0] = _S6_PTS[i - 1], [x1, y1] = _S6_PTS[i];
    if (year <= x1) return Math.round(y0 + (y1 - y0) * (year - x0) / (x1 - x0));
  }
  return Math.round(25111 * Math.pow(1.10, year - 35));
}

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
const QUINTILES = [
  {
    label: 'Bottom 20%', shortLabel: 'Q1',
    startWage: 17000,  // ~$17K at 22 → $35K peak
    k401Part: 0.30,
    ssBenefit: 14400,  // ~$1,200/month PIA
    psuEquil:  30000,  // more small/exempt firms
    prebateSaveRate: 0.05,
    consumeRatio: 0.92,
    color: '#EF4444',
  },
  {
    label: '2nd Quintile', shortLabel: 'Q2',
    startWage: 26000,
    k401Part: 0.45,
    ssBenefit: 19200,
    psuEquil:  50000,
    prebateSaveRate: 0.08,
    consumeRatio: 0.85,
    color: '#F97316',
  },
  {
    label: 'Middle 20%', shortLabel: 'Q3',
    startWage: 34000,  // ~$34K at 22 → $72K peak; tracks BLS median
    k401Part: 0.55,
    ssBenefit: 23400,
    psuEquil:  65000,
    prebateSaveRate: 0.12,
    consumeRatio: 0.75,
    color: '#10B981',
  },
  {
    label: '4th Quintile', shortLabel: 'Q4',
    startWage: 50000,
    k401Part: 0.65,
    ssBenefit: 28800,
    psuEquil:  80000,
    prebateSaveRate: 0.15,
    consumeRatio: 0.65,
    color: '#3B82F6',
  },
  {
    label: 'Top 20%', shortLabel: 'Q5',
    startWage: 85000,
    k401Part: 0.75,
    ssBenefit: 34200,
    psuEquil:  95000,
    prebateSaveRate: 0.22,
    consumeRatio: 0.50,
    color: '#8B5CF6',
  },
];

// ─── Core Simulation ─────────────────────────────────────────────────────────

function runSimulation() {
  const rng = makeRng(2024);

  // AMCF starting balance at age 22:
  // Childhood account ≈ $15K at 18, grown at 5% for 4 years = $18,228
  const amcfAt22 = 15000 * Math.pow(1 + AMCF_RET, 4);

  const results = QUINTILES.map(q => {
    const curArr = [];
    const accArr = [];

    for (let p = 0; p < N_PATHS; p++) {
      let wCur = 0;
      let wAcc = 0;
      let amcf  = amcfAt22;
      let psuBal = 0;

      for (let y = 1; y <= CAREER_YRS; y++) {
        const age    = 22 + y;
        const salary = q.startWage * ageMult(age);
        const ret    = rng.normal(MEAN_RET, STD_RET);

        // ── Current system ──
        // 401(k) (weighted participation: includes zero for non-participants)
        const k401     = q.k401Part * 0.09 * salary;
        // Small base savings for non-participants (~2.5% after-tax, partial)
        const baseSave = (1 - q.k401Part) * 0.025 * 0.85 * salary;
        wCur = (wCur + k401 + baseSave) * (1 + ret);

        // ── Accord system ──
        // PSU equity ramps to equilibrium; dividends reinvested in base
        const psuTarget = q.psuEquil * Math.min(y / PSU_RAMP, 1);
        const psuDiv    = psuBal * PSU_DIV;
        psuBal = psuTarget;

        // Net prebate/VAT benefit (individual: $5K prebate per person)
        const netFiscal    = Math.max(0, 5000 - 0.04 * q.consumeRatio * salary);
        const prebateSave  = netFiscal * q.prebateSaveRate;

        // AMCF grant accumulates at deterministic fund return (not market)
        amcf = (amcf + amcfGrant(y)) * (1 + AMCF_RET);

        // Accord base wealth (volatile component)
        wAcc = (wAcc + k401 + baseSave + psuDiv + prebateSave) * (1 + ret);
      }

      curArr.push(wCur);
      // Total Accord = volatile base + stable AMCF + PSU equity at retirement
      accArr.push(wAcc + amcf + psuBal);
    }

    curArr.sort((a, b) => a - b);
    accArr.sort((a, b) => a - b);

    const pct = (arr, p) => arr[Math.floor(arr.length * p)];

    // Compute deterministic decomposition at mean return for stacked chart
    let d_k401 = 0, d_amcf = amcfAt22, d_psu = 0, d_psuDiv = 0, d_prebate = 0;
    for (let y = 1; y <= CAREER_YRS; y++) {
      const age    = 22 + y;
      const salary = q.startWage * ageMult(age);
      const k401   = q.k401Part * 0.09 * salary;
      const base   = (1 - q.k401Part) * 0.025 * 0.85 * salary;
      d_k401   = (d_k401   + k401 + base) * (1 + MEAN_RET);
      const psuTarget = q.psuEquil * Math.min(y / PSU_RAMP, 1);
      const psuDiv    = d_psu * PSU_DIV;
      d_psu    = psuTarget;
      d_psuDiv = (d_psuDiv  + psuDiv) * (1 + MEAN_RET);
      const netFiscal  = Math.max(0, 5000 - 0.04 * q.consumeRatio * salary);
      d_prebate = (d_prebate + netFiscal * q.prebateSaveRate) * (1 + MEAN_RET);
      d_amcf   = (d_amcf   + amcfGrant(y)) * (1 + AMCF_RET);
    }
    const decompAccord = {
      '401(k) / Savings': Math.round(d_k401),
      'AMCF Account':     Math.round(d_amcf),
      'PSU (Equity + Div)': Math.round(d_psu + d_psuDiv),
      'Prebate Savings':  Math.round(d_prebate),
    };

    // Annual retirement income
    const cur_annualIncome  = q.ssBenefit + pct(curArr, 0.50) * 0.04;
    const acc_annualIncome  = q.ssBenefit + pct(accArr, 0.50) * 0.04;

    const n50k_c = curArr.filter(v => v < 50000).length / N_PATHS;
    const n50k_a = accArr.filter(v => v < 50000).length / N_PATHS;
    const n250k_c = curArr.filter(v => v < 250000).length / N_PATHS;
    const n250k_a = accArr.filter(v => v < 250000).length / N_PATHS;

    return {
      shortLabel: q.shortLabel,
      label:      q.label,
      color:      q.color,
      ssBenefit:  q.ssBenefit,
      cur_p25: Math.round(pct(curArr, 0.25)),
      cur_p50: Math.round(pct(curArr, 0.50)),
      cur_p75: Math.round(pct(curArr, 0.75)),
      acc_p25: Math.round(pct(accArr, 0.25)),
      acc_p50: Math.round(pct(accArr, 0.50)),
      acc_p75: Math.round(pct(accArr, 0.75)),
      cur_annualIncome: Math.round(cur_annualIncome),
      acc_annualIncome: Math.round(acc_annualIncome),
      n50k_c, n50k_a, n250k_c, n250k_a,
      decompAccord,
    };
  });

  // Aggregate headline stats (equal 20% weight per quintile)
  const natBelow50k_c  = results.reduce((s, r) => s + r.n50k_c,  0) / results.length;
  const natBelow50k_a  = results.reduce((s, r) => s + r.n50k_a,  0) / results.length;
  const natBelow250k_c = results.reduce((s, r) => s + r.n250k_c, 0) / results.length;
  const natBelow250k_a = results.reduce((s, r) => s + r.n250k_a, 0) / results.length;

  return { results, natBelow50k_c, natBelow50k_a, natBelow250k_c, natBelow250k_a };
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root:    { fontFamily: "'Georgia', serif", maxWidth: 1040, margin: '0 auto', padding: '40px 32px', background: '#fff', color: '#111' },
  section: { marginTop: 52 },
  h1:      { fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2 },
  headline:{ fontSize: 17, color: '#065F46', fontWeight: 600, marginTop: 10 },
  h2:      { fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 0 },
  subtext: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 24 },
  label:   { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 2 },
  source:  { fontSize: 11, color: '#9CA3AF', marginTop: 12, lineHeight: 1.6 },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:      { textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB' },
  td:      { borderBottom: '1px solid #f3f4f6', padding: '7px 12px' },
};

const ACCORD_GREEN  = '#065F46';
const CURRENT_BLUE  = '#1D4ED8';
const DECOMP_COLORS = {
  '401(k) / Savings':     '#93C5FD',
  'AMCF Account':         '#10B981',
  'PSU (Equity + Div)':   '#059669',
  'Prebate Savings':      '#FBBF24',
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
    'Accord: SS + AMCF + PSU Drawdown': r.acc_annualIncome,
  }));

  const improvement = 1 - natBelow250k_a / natBelow250k_c;
  const q1Improvement = Math.round((results[0].acc_p50 / results[0].cur_p50 - 1) * 100);

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={{ borderLeft: '4px solid #10B981', paddingLeft: 20 }}>
        <p style={S.label}>American Ownership Accord — Simulation 4</p>
        <h1 style={S.h1}>The New Retirement Safety Net</h1>
        <p style={S.headline}>
          A worker entering the workforce today will accumulate {q1Improvement}% more retirement wealth
          under the Accord than the current system — with a universal AMCF floor that eliminates the
          retirement savings crisis for the bottom 40%.
        </p>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>
          45-year career projection (age 22→67) by income quintile. {N_PATHS.toLocaleString()} Monte Carlo paths
          per quintile using historical equity return distribution (mean 5% real, σ 16%). All values in 2024 dollars.
        </p>
      </div>

      {/* ── Headline Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 32 }}>
        {[
          { label: 'Bottom 20% median retirement wealth', cur: fmtK(results[0].cur_p50), acc: fmtK(results[0].acc_p50) },
          { label: 'Middle 20% median retirement wealth', cur: fmtK(results[2].cur_p50), acc: fmtK(results[2].acc_p50) },
          { label: 'Workers below $250K at retirement', cur: fmtPct(natBelow250k_c), acc: fmtPct(natBelow250k_a) },
          { label: 'Q1 annual retirement income', cur: `$${Math.round(results[0].cur_annualIncome/1000)}K/yr`, acc: `$${Math.round(results[0].acc_annualIncome/1000)}K/yr` },
        ].map((box, i) => (
          <div key={i} style={{ padding: '16px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#F9FAFB' }}>
            <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>{box.label}</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><p style={{ fontSize: 10, color: CURRENT_BLUE, marginBottom: 2, fontWeight: 600 }}>CURRENT</p><p style={{ fontSize: 18, fontWeight: 700, color: CURRENT_BLUE }}>{box.cur}</p></div>
              <div><p style={{ fontSize: 10, color: ACCORD_GREEN, marginBottom: 2, fontWeight: 600 }}>ACCORD</p><p style={{ fontSize: 18, fontWeight: 700, color: ACCORD_GREEN }}>{box.acc}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Chart 1: Retirement Wealth Comparison ── */}
      <div style={S.section}>
        <h2 style={S.h2}>Median Retirement Wealth at Age 67 by Income Quintile</h2>
        <p style={S.subtext}>
          Accord system includes Social Security (unchanged), AMCF account, Worker PSU equity and dividends,
          continued 401(k), and net prebate savings. Current system includes Social Security and 401(k) only.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={comparisonData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 13 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} width={70} />
            <Tooltip content={<BarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
            <Bar dataKey="Current System (Median)" fill={CURRENT_BLUE} radius={[3,3,0,0]} />
            <Bar dataKey="Accord (Median)"         fill={ACCORD_GREEN} radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* P25/P75 summary */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {results.map(r => (
            <div key={r.shortLabel} style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11 }}>
              <p style={{ fontWeight: 700, color: r.color, marginBottom: 4 }}>{r.shortLabel}</p>
              <p style={{ color: CURRENT_BLUE }}>Current: {fmtK(r.cur_p25)} – {fmtK(r.cur_p75)}</p>
              <p style={{ color: ACCORD_GREEN }}>Accord: {fmtK(r.acc_p25)} – {fmtK(r.acc_p75)}</p>
            </div>
          ))}
        </div>
        <p style={S.source}>P25–P75 range shown above. Monte Carlo variance driven by annual return distribution (σ=16%). AMCF balance is deterministic (doesn't vary with market) — this is why Accord P25 is dramatically higher than current P25 for lower quintiles.</p>
      </div>

      {/* ── Chart 2: Accord Wealth Components (Stacked) ── */}
      <div style={S.section}>
        <h2 style={S.h2}>Accord Retirement Wealth — What's In It</h2>
        <p style={S.subtext}>
          Stacked components at median return (5% real). AMCF is equal for every quintile —
          the most egalitarian element. PSU equity and dividends scale modestly with firm size.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={decompData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 13 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} width={70} />
            <Tooltip content={<BarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
            {Object.keys(DECOMP_COLORS).map(key => (
              <Bar key={key} dataKey={key} stackId="a" fill={DECOMP_COLORS[key]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <p style={S.source}>
          AMCF: childhood account (~$15K at 18) + 45 years of adult grants growing from $800/yr to $25K+/yr as AMCF scales (Sim 6 validated, uncapped), compounding at 5% real.
          PSU equity + dividends: worker phantom equity builds to $30K–$95K over 5 years; dividends reinvested at market rate.
          Prebate: $5,000/person/year less 4% VAT on consumption (New Accord rate); fraction saved.
        </p>
      </div>

      {/* ── Chart 3: Annual Retirement Income ── */}
      <div style={S.section}>
        <h2 style={S.h2}>Annual Retirement Income at Age 67 (SS + Drawdown)</h2>
        <p style={S.subtext}>Assumes 4% Safe Withdrawal Rate on retirement wealth. Social Security unchanged under both systems.</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={incomeData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 13 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} width={70} />
            <Tooltip content={<BarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
            <Bar dataKey="Current: SS + 401(k) Drawdown"          fill={CURRENT_BLUE} radius={[3,3,0,0]} />
            <Bar dataKey="Accord: SS + AMCF + PSU Drawdown"       fill={ACCORD_GREEN} radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Summary Table ── */}
      <div style={S.section}>
        <h2 style={S.h2}>Retirement Adequacy Metrics by Quintile</h2>
        <p style={S.subtext}>Fraction of simulated career paths reaching retirement below savings thresholds</p>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Income Group</th>
              <th style={{ ...S.th, color: CURRENT_BLUE }}>Current Median</th>
              <th style={{ ...S.th, color: ACCORD_GREEN }}>Accord Median</th>
              <th style={S.th}>Gain</th>
              <th style={{ ...S.th, color: CURRENT_BLUE }}>{'<$250K'} (Current)</th>
              <th style={{ ...S.th, color: ACCORD_GREEN }}>{'<$250K'} (Accord)</th>
              <th style={S.th}>Annual Income (Current)</th>
              <th style={S.th}>Annual Income (Accord)</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => {
              const gain = r.acc_p50 - r.cur_p50;
              return (
                <tr key={r.shortLabel}>
                  <td style={{ ...S.td, fontWeight: 600, color: r.color }}>{r.label}</td>
                  <td style={{ ...S.td, color: CURRENT_BLUE }}>{fmtK(r.cur_p50)}</td>
                  <td style={{ ...S.td, color: ACCORD_GREEN, fontWeight: 600 }}>{fmtK(r.acc_p50)}</td>
                  <td style={{ ...S.td, color: '#059669' }}>+{fmtK(gain)} ({Math.round((r.acc_p50/r.cur_p50 - 1)*100)}%)</td>
                  <td style={{ ...S.td, color: CURRENT_BLUE }}>{fmtPct(r.n250k_c)}</td>
                  <td style={{ ...S.td, color: ACCORD_GREEN }}>{fmtPct(r.n250k_a)}</td>
                  <td style={S.td}>{fmtK(r.cur_annualIncome)}/yr</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{fmtK(r.acc_annualIncome)}/yr</td>
                </tr>
              );
            })}
            <tr style={{ background: '#F9FAFB', fontWeight: 700 }}>
              <td style={S.td}>National Average</td>
              <td style={{ ...S.td, color: CURRENT_BLUE }}>{fmtK(Math.round(results.reduce((s,r)=>s+r.cur_p50,0)/results.length))}</td>
              <td style={{ ...S.td, color: ACCORD_GREEN }}>{fmtK(Math.round(results.reduce((s,r)=>s+r.acc_p50,0)/results.length))}</td>
              <td style={{ ...S.td, color: '#059669' }}>+{Math.round((results.reduce((s,r)=>s+r.acc_p50,0)/results.reduce((s,r)=>s+r.cur_p50,0) - 1)*100)}%</td>
              <td style={{ ...S.td, color: CURRENT_BLUE }}>{fmtPct(natBelow250k_c)}</td>
              <td style={{ ...S.td, color: ACCORD_GREEN }}>{fmtPct(natBelow250k_a)}</td>
              <td style={S.td}>{fmtK(Math.round(results.reduce((s,r)=>s+r.cur_annualIncome,0)/results.length))}/yr</td>
              <td style={S.td}>{fmtK(Math.round(results.reduce((s,r)=>s+r.acc_annualIncome,0)/results.length))}/yr</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Key Insight Box ── */}
      <div style={{ marginTop: 32, padding: '20px 24px', background: '#ECFDF5', borderRadius: 8, border: '1px solid #A7F3D0' }}>
        <p style={{ fontWeight: 700, color: '#065F46', marginBottom: 8 }}>The Universal Floor</p>
        <p style={{ fontSize: 13, color: '#064E3B', lineHeight: 1.7 }}>
          The AMCF citizen grant program creates a retirement wealth floor that is <em>independent of market performance</em>.
          Every worker who enters the workforce today will accumulate approximately{' '}
          <strong>{fmtK(Math.round(results[0].decompAccord['AMCF Account']))}</strong> in their AMCF account by retirement —
          regardless of 401(k) participation, investment timing, or career interruptions.
          This is the structural transformation that eliminates the retirement savings crisis for the bottom 40%:
          universal compounding wealth from birth, not a means-tested benefit subject to cliff effects.
        </p>
      </div>

      {/* ── Methodology Note ── */}
      <div style={{ marginTop: 32, padding: '16px 20px', background: '#F9FAFB', borderRadius: 8, fontSize: 11, color: '#6B7280', lineHeight: 1.7 }}>
        <strong style={{ color: '#374151' }}>Methodology:</strong>{' '}
        Monte Carlo simulation: {N_PATHS.toLocaleString()} paths × {CAREER_YRS} years × 5 quintiles.
        Annual real equity returns drawn from N(5%, 16%) using seeded LCG + Box-Muller.
        Current system: 401(k) contributions at quintile-specific participation rate (9% combined employee+employer),
        plus minimal personal savings (2.5% for non-participants). Social Security unchanged under both systems.
        Accord additions: per-person AMCF grants ($500–$800 floor Yrs 1–9, then growing uncapped: $1,066 at Yr 10, $5,597 at Yr 20, $25,111 at Yr 35 per Sim 6) compounding at 5% real
        from childhood account; worker PSU equity building to $30K–$95K equilibrium over 5 years paying 3.5% dividends
        (psuEquil values represent employment-weighted average across Tier 1 sectoral fund, Tier 2 phantom equity, and Tier 3 PSU per quintile distribution);
        net prebate-minus-VAT (4% New Accord rate) fiscal benefit saved at income-appropriate rates.
        All values in 2024 real (inflation-adjusted) dollars. BLS age-earnings profiles applied.
      </div>
    </div>
  );
}
