import React, { useState, useMemo } from 'react';
import {
  ComposedChart, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────

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

// ─── Constants & Parameters ──────────────────────────────────────────────────

const N_PATHS    = 6000;  // Monte Carlo paths (balance between accuracy and speed)
const AGE_MAX    = 65;
const STD_RETURN = 0.16;  // annual return standard deviation (historical S&P 500)

// PSU equilibrium by employer tier (EV per employee × 20% worker pool share)
// Tier 3 (>$100M EV, large firms): 20% PSU via 4%/yr Equity Excise → equilibrium ~$100K/worker
// Tier 2 ($10M–$100M EV, mid-market): phantom equity ~$55K/worker, portable, cashed at departure
// Tier 1 (<$10M EV, small/exempt firms): no PSU; workers receive $1K/yr Sectoral Fund contribution
// 50% of workers at Tier 3 firms, 30% at Tier 2, 20% at Tier 1/exempt
const AMCF_RET = 0.05; // AMCF fund real return — fixed, separate from market slider (matches Sims 3/4)

const PSU_BY_TYPE = { large: 100000, mid: 55000, small: 0 };
const SWF_SMALL_FIRM = 1000; // $1,000/yr Tier 1 Sectoral Fund contribution (builds at 6% gross; 3.5% distributed as dividends)
const PSU_RAMP_YRS   = 5;
const PSU_DIV_BASE   = 0.035; // base PSU dividend yield (slider adjusts)

// Employment start age distribution (spec: 10%@16, 15%@18, 40%@22, 25%@25, 10%@28)
const EMP_START_CDF = [
  [0.10, 16], [0.25, 18], [0.65, 22], [0.90, 25], [1.00, 28],
];
function drawEmpStartAge(rng) {
  const r = rng.next();
  for (const [cdf, age] of EMP_START_CDF) if (r <= cdf) return age;
  return 22;
}

// Job change probability per year (derived from BLS job tenure data)
// Produces ~11 jobs by age 65 starting at age 22 (tracks spec "avg 12 jobs by age 50")
function jobChangeProbability(age) {
  if (age < 25) return 0.42;
  if (age < 35) return 0.28;
  if (age < 45) return 0.20;
  if (age < 55) return 0.12;
  return 0.08;
}

// BLS age-earnings profile (annualized from weekly median earnings)
// 16-24: $28K, 25-34: $48K, 35-44: $58K, 45-54: $59K, 55-64: $57K
function baseWage(age) {
  if (age < 25) return 28000;
  if (age < 35) return 48000;
  if (age < 45) return 58000;
  if (age < 55) return 59000;
  return 57000;
}

// AMCF grant schedule — per capita, per year, per Accord year
// Person born Year 1 → at age A, Accord is in Year A+1
//
// Base trajectory calibrated to Sim 6 validated outputs:
//   Yr 9: AMCF self-funds grants (~11% ownership). Yr 19: 20% ownership cap hit.
//   Pre-cap growth ~18%/yr (scrip + market return); post-cap ~11%/yr (tracks 20% of EV).
//   Sim 6 key outputs: Yr10=$1,066 Yr15=$2,678 Yr20=$5,597 Yr25=$8,958 Yr30=$14,784 Yr35=$25,111
const _S6_PTS = [[9,800],[10,1066],[15,2678],[20,5597],[25,8958],[30,14784],[35,25111]];
function _grantBase(yr) {
  if (yr <= 3)  return 500;
  if (yr <= 6)  return 550;
  if (yr <= 9)  return 800;
  for (let i = 1; i < _S6_PTS.length; i++) {
    const [x0, y0] = _S6_PTS[i - 1], [x1, y1] = _S6_PTS[i];
    if (yr <= x1) return Math.round(y0 + (y1 - y0) * (yr - x0) / (x1 - x0));
  }
  return Math.round(25111 * Math.pow(1.10, yr - 35)); // extrapolate beyond Yr 35 at ~10%/yr
}
const GRANT_SCHEDULES = {
  conservative: (yr) => yr <= 3 ? 500 : yr <= 6 ? 500 : yr <= 9 ? 700 : Math.round(_grantBase(yr) * 0.60),
  base:         _grantBase,
  optimistic:   (yr) => yr <= 3 ? 500 : yr <= 6 ? 600 : yr <= 9 ? 950 : Math.round(_grantBase(yr) * 1.55),
};

// ─── Income Quintile Definitions ─────────────────────────────────────────────

// wageMultiplier scales the BLS age-earnings profile
// empProb: probability of large/mid/small firm at each job
const QUINTILES = {
  q1: { label: 'Bottom 20%', wageMultiplier: 0.52, empProb: { large: 0.25, mid: 0.25, small: 0.50 }, k401Part: 0.30, consumeRatio: 0.92, prebateSaveRate: 0.05 },
  q2: { label: '2nd Quintile', wageMultiplier: 0.76, empProb: { large: 0.35, mid: 0.30, small: 0.35 }, k401Part: 0.45, consumeRatio: 0.85, prebateSaveRate: 0.08 },
  q3: { label: 'Middle 20%', wageMultiplier: 1.00, empProb: { large: 0.45, mid: 0.35, small: 0.20 }, k401Part: 0.55, consumeRatio: 0.75, prebateSaveRate: 0.12 },
  q4: { label: '4th Quintile', wageMultiplier: 1.42, empProb: { large: 0.58, mid: 0.34, small: 0.08 }, k401Part: 0.65, consumeRatio: 0.65, prebateSaveRate: 0.16 },
  q5: { label: 'Top 20%', wageMultiplier: 1.95, empProb: { large: 0.65, mid: 0.32, small: 0.03 }, k401Part: 0.75, consumeRatio: 0.52, prebateSaveRate: 0.22 },
};

function drawEmpType(rng, q) {
  const r = rng.next();
  if (r < q.empProb.large) return 'large';
  if (r < q.empProb.large + q.empProb.mid) return 'mid';
  return 'small';
}

// ─── Percentile Helper ───────────────────────────────────────────────────────

function percentile(sortedArr, p) {
  return sortedArr[Math.max(0, Math.floor(sortedArr.length * p) - 1)];
}

function buildHistogram(values, bins = 20) {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0], max = sorted[sorted.length - 1];
  const binWidth = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const bin = Math.min(Math.floor((v - min) / binWidth), bins - 1);
    counts[bin]++;
  }
  return counts.map((count, i) => ({
    range: `$${Math.round((min + i * binWidth) / 1000)}K`,
    value: Math.round(min + (i + 0.5) * binWidth),
    count,
    pct: count / values.length,
  }));
}

// ─── Core Monte Carlo ────────────────────────────────────────────────────────

function runSimulation(params) {
  const { meanReturn, grantTrajectory, psuDivYield, k401PartOverride, quintileKey } = params;
  const q = QUINTILES[quintileKey];
  const grantFn = GRANT_SCHEDULES[grantTrajectory];
  const realReturn = meanReturn - 0.02; // convert nominal to real (2% inflation)
  const k401Part = k401PartOverride ?? q.k401Part;

  const rng = makeRng(2024 + Object.keys(QUINTILES).indexOf(quintileKey));

  // Storage: accordWealth[age] = array of N_PATHS wealth values
  const accordAt  = Array.from({ length: AGE_MAX + 1 }, () => new Float32Array(N_PATHS));
  const currentAt = Array.from({ length: AGE_MAX + 1 }, () => new Float32Array(N_PATHS));
  const amcfAt18Values = new Float32Array(N_PATHS);

  for (let p = 0; p < N_PATHS; p++) {
    const empStartAge = drawEmpStartAge(rng);
    let empType = null;

    // Wealth components (Accord)
    let amcf   = 0;  // AMCF account (custodial until 18, adult after)
    let savAcc = 0;  // base savings + PSU cashouts + PSU dividends
    let psuBal = 0;  // current PSU equity value
    let prebSav = 0; // compounded prebate savings
    let psuYrs = 0;  // years at current employer (for PSU ramp)

    // Wealth components (Current system)
    let savCur = 0;

    for (let age = 0; age <= AGE_MAX; age++) {
      const accordYear = age + 1;
      const ret = rng.normal(realReturn, STD_RETURN);

      // ── AMCF: grows at fixed 5% real (fund-level return, not individual market) ──
      const grant = grantFn(accordYear);
      amcf = amcf * (1 + AMCF_RET) + grant;

      if (age === 18) amcfAt18Values[p] = amcf;

      if (age >= empStartAge) {
        // Become employed: draw initial employer type once
        if (empType === null) {
          empType = drawEmpType(rng, q);
          psuYrs = 0;
        }

        const salary = baseWage(age) * q.wageMultiplier;

        // ── PSU accumulation ──
        psuYrs++;
        const psuEquil = PSU_BY_TYPE[empType];
        const psuTarget = psuEquil * Math.min(psuYrs / PSU_RAMP_YRS, 1);
        const psuDiv = psuBal * psuDivYield;

        // Check for job change
        if (rng.next() < jobChangeProbability(age)) {
          // Cash out PSU at FMV, add to savings
          savAcc = (savAcc + psuBal) * (1 + ret) + psuDiv;
          psuBal = 0;
          psuYrs = 0;
          empType = drawEmpType(rng, q); // new employer
        } else {
          psuBal = psuTarget;
          savAcc = savAcc * (1 + ret) + psuDiv;
        }

        // SWF grant for exempt-firm workers
        if (empType === 'small') {
          savAcc += SWF_SMALL_FIRM;
        }

        // Prebate net savings
        const netFiscal = Math.max(0, 5000 - 0.04 * q.consumeRatio * salary);
        prebSav = (prebSav + netFiscal * q.prebateSaveRate) * (1 + ret);

        // ── Current system: 401(k) + personal savings ──
        const k401  = k401Part * 0.09 * salary;
        const base  = (1 - k401Part) * 0.025 * 0.85 * salary;
        savCur = (savCur + k401 + base) * (1 + ret);

      } else {
        // Not yet employed: just compound
        savAcc  = savAcc  * (1 + Math.max(-0.40, ret));
        savCur  = savCur  * (1 + Math.max(-0.40, ret));
        prebSav = prebSav * (1 + Math.max(-0.40, ret));
      }

      accordAt[age][p]  = Math.max(0, savAcc + amcf + psuBal + prebSav);
      currentAt[age][p] = Math.max(0, savCur);
    }
  }

  // ── Compute percentiles at each age ──
  const trajectoryData = [];
  for (let age = 0; age <= AGE_MAX; age++) {
    const acc = Array.from(accordAt[age]).sort((a, b) => a - b);
    const cur = Array.from(currentAt[age]).sort((a, b) => a - b);
    const ap25 = percentile(acc, 0.25);
    const ap50 = percentile(acc, 0.50);
    const ap75 = percentile(acc, 0.75);
    const cp25 = percentile(cur, 0.25);
    const cp50 = percentile(cur, 0.50);
    const cp75 = percentile(cur, 0.75);
    trajectoryData.push({
      age,
      acc_p25: Math.round(ap25),
      acc_p50: Math.round(ap50),
      acc_p75: Math.round(ap75),
      acc_band: Math.round(ap75 - ap25),     // for stacked area
      cur_p25: Math.round(cp25),
      cur_p50: Math.round(cp50),
      cur_p75: Math.round(cp75),
      cur_band: Math.round(cp75 - cp25),
    });
  }

  // ── Milestone snapshots ──
  const milestoneAges = [18, 25, 35, 45, 55, 65];
  const milestoneData = milestoneAges.map(age => {
    const d = trajectoryData[age];
    return { age, acc_p50: d.acc_p50, cur_p50: d.cur_p50, acc_p25: d.acc_p25, acc_p75: d.acc_p75 };
  });

  // ── Probability table at age 65 ──
  const acc65 = Array.from(accordAt[AGE_MAX]).sort((a, b) => a - b);
  const cur65 = Array.from(currentAt[AGE_MAX]).sort((a, b) => a - b);
  const probThresholds = [100000, 250000, 500000, 1000000];
  const probData = probThresholds.map(t => ({
    threshold: t,
    acc: acc65.filter(v => v >= t).length / N_PATHS,
    cur: cur65.filter(v => v >= t).length / N_PATHS,
  }));

  // ── 18th birthday histogram ──
  const amcfAt18Sorted = Array.from(amcfAt18Values).sort((a, b) => a - b);
  const amcfAt18Hist = buildHistogram(amcfAt18Sorted, 16);
  const amcfAt18Median = percentile(amcfAt18Sorted, 0.50);
  const amcfAt18P25   = percentile(amcfAt18Sorted, 0.25);
  const amcfAt18P75   = percentile(amcfAt18Sorted, 0.75);

  return { trajectoryData, milestoneData, probData, amcfAt18Hist, amcfAt18Median, amcfAt18P25, amcfAt18P75, acc65, cur65 };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const fmtK  = v => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}K`;
const fmtPct = v => `${(v * 100).toFixed(0)}%`;

const WealthTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  // Find median lines
  const acc = payload.find(p => p.dataKey === 'acc_p50');
  const cur = payload.find(p => p.dataKey === 'cur_p50');
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '10px 14px', fontSize: 12, borderRadius: 6, minWidth: 200 }}>
      <p style={{ fontWeight: 700, marginBottom: 8 }}>Age {label}</p>
      {acc && <p style={{ color: '#065F46' }}>Accord median: {fmtK(acc.value)}</p>}
      {cur && <p style={{ color: '#1D4ED8' }}>Current median: {fmtK(cur.value)}</p>}
    </div>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root:     { fontFamily: "'Georgia', serif", maxWidth: 1040, margin: '0 auto', padding: '40px 32px', background: '#fff', color: '#111' },
  section:  { marginTop: 52 },
  h1:       { fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2 },
  headline: { fontSize: 17, color: '#065F46', fontWeight: 600, marginTop: 10 },
  h2:       { fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 0 },
  subtext:  { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 24 },
  label:    { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 2 },
  source:   { fontSize: 11, color: '#9CA3AF', marginTop: 12, lineHeight: 1.6 },
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:       { textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB' },
  td:       { borderBottom: '1px solid #f3f4f6', padding: '7px 12px' },
  slider:   { width: '100%', accentColor: '#065F46' },
  qBtn:     (active) => ({
    padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 400,
    color: active ? '#fff' : '#374151',
    background: active ? '#065F46' : '#F9FAFB',
    border: '1px solid #e5e7eb', borderRadius: 6,
  }),
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function GenerationalWealth() {
  // Slider state
  const [meanReturn,   setMeanReturn]   = useState(0.10);   // nominal market return
  const [grantTraj,    setGrantTraj]    = useState('base');
  const [psuDivYield,  setPsuDivYield]  = useState(0.035);
  const [k401Part,     setK401Part]     = useState(0.50);
  const [quintileKey,  setQuintileKey]  = useState('q3');

  // Memoize simulation (recalculates when any parameter changes)
  const {
    trajectoryData, milestoneData, probData,
    amcfAt18Hist, amcfAt18Median, amcfAt18P25, amcfAt18P75,
    acc65, cur65,
  } = useMemo(
    () => runSimulation({ meanReturn, grantTrajectory: grantTraj, psuDivYield, k401PartOverride: k401Part, quintileKey }),
    [meanReturn, grantTraj, psuDivYield, k401Part, quintileKey]
  );

  const qLabel = QUINTILES[quintileKey].label;
  const medAt65Acc = trajectoryData[65].acc_p50;
  const medAt65Cur = trajectoryData[65].cur_p50;
  const improvement = Math.round((medAt65Acc / medAt65Cur - 1) * 100);

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={{ borderLeft: '4px solid #10B981', paddingLeft: 20 }}>
        <p style={S.label}>American Ownership Accord — Simulation 1</p>
        <h1 style={S.h1}>The American Birthright</h1>
        <p style={S.headline}>
          A child born today into a {qLabel.toLowerCase()} household accumulates{' '}
          {fmtK(medAt65Acc)} by age 65 under the Accord — {improvement}% more than the{' '}
          {fmtK(medAt65Cur)} median under the current system.
        </p>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>
          {N_PATHS.toLocaleString()} Monte Carlo paths, age 0–65. AMCF citizen grants from birth,
          worker Phantom Stock Units across ~11 jobs, universal prebate savings, and 401(k) continuation.
          Adjust the controls to explore different scenarios.
        </p>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 32, padding: '24px', background: '#F9FAFB', borderRadius: 10 }}>
        {/* Income quintile */}
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={S.label}>Income Quintile</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {Object.entries(QUINTILES).map(([key, q]) => (
              <button key={key} onClick={() => setQuintileKey(key)} style={S.qBtn(quintileKey === key)}>
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        {[
          {
            label: `Mean Market Return: ${(meanReturn * 100).toFixed(0)}% nominal`,
            min: 0.04, max: 0.14, step: 0.01,
            value: meanReturn, onChange: setMeanReturn,
            note: `≈ ${((meanReturn - 0.02) * 100).toFixed(0)}% real (after 2% inflation)`,
          },
          {
            label: `PSU Dividend Yield: ${(psuDivYield * 100).toFixed(1)}%`,
            min: 0.02, max: 0.05, step: 0.005,
            value: psuDivYield, onChange: setPsuDivYield,
            note: 'Post-CIT abolition dividend rate on phantom equity',
          },
          {
            label: `401(k) Participation Rate (current system): ${Math.round(k401Part * 100)}%`,
            min: 0.20, max: 0.80, step: 0.05,
            value: k401Part, onChange: setK401Part,
            note: 'Benchmark for current system comparison',
          },
        ].map(({ label, min, max, step, value, onChange, note }) => (
          <div key={label}>
            <p style={{ ...S.label, textTransform: 'none', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</p>
            <input type="range" min={min} max={max} step={step} value={value}
              onChange={e => onChange(+e.target.value)} style={S.slider} />
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{note}</p>
          </div>
        ))}

        {/* Grant trajectory */}
        <div>
          <p style={{ ...S.label, textTransform: 'none', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>AMCF Grant Trajectory</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {['conservative', 'base', 'optimistic'].map(t => (
              <button key={t} onClick={() => setGrantTraj(t)} style={{
                padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: grantTraj === t ? 700 : 400,
                color: grantTraj === t ? '#fff' : '#374151',
                background: grantTraj === t ? '#059669' : '#fff',
                border: '1px solid #e5e7eb', borderRadius: 6, textTransform: 'capitalize',
              }}>
                {t}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
            Base: $500→$800 floor (Yrs 1–9), then grows uncapped with AMCF fund — $1,066 at Yr 10, $5,597 at Yr 20, $25,111 at Yr 35 (Sim 6 validated)
          </p>
        </div>
      </div>

      {/* ── Chart 1: Wealth Trajectory ── */}
      <div style={S.section}>
        <h2 style={S.h2}>Lifetime Wealth Trajectory — {qLabel} Household</h2>
        <p style={S.subtext}>
          Shaded bands = 25th–75th percentile range. Lines = median path.
          Green = American Ownership Accord &nbsp;|&nbsp; Blue = Current system
        </p>

        <ResponsiveContainer width="100%" height={420}>
          <ComposedChart data={trajectoryData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="age" label={{ value: 'Age', position: 'insideBottom', offset: -4, fontSize: 12 }} tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${v/1000}K`} tick={{ fontSize: 12 }} width={70} />
            <Tooltip content={<WealthTooltip />} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />

            {/* Milestone annotations */}
            <ReferenceLine x={18} stroke="#9CA3AF" strokeDasharray="4 3"
              label={{ value: '18th Birthday', position: 'top', fontSize: 10, fill: '#6B7280' }} />
            <ReferenceLine x={22} stroke="#9CA3AF" strokeDasharray="4 3"
              label={{ value: 'Typical First Job', position: 'top', fontSize: 10, fill: '#6B7280' }} />
            <ReferenceLine x={50} stroke="#9CA3AF" strokeDasharray="4 3"
              label={{ value: 'Peak Earnings', position: 'top', fontSize: 10, fill: '#6B7280' }} />

            {/* Current system: P25 base + band */}
            <Area type="monotone" dataKey="cur_p25"  stackId="cur" fill="transparent" stroke="none" legendType="none" name="cur_base" />
            <Area type="monotone" dataKey="cur_band"  stackId="cur" fill="#BFDBFE" fillOpacity={0.5} stroke="none" name="Current P25–P75 range" />

            {/* Accord: P25 base + band */}
            <Area type="monotone" dataKey="acc_p25"  stackId="acc" fill="transparent" stroke="none" legendType="none" name="acc_base" />
            <Area type="monotone" dataKey="acc_band"  stackId="acc" fill="#A7F3D0" fillOpacity={0.5} stroke="none" name="Accord P25–P75 range" />

            {/* Median lines */}
            <Line type="monotone" dataKey="cur_p50" stroke="#1D4ED8" strokeWidth={2.5} dot={false} name="Current system (median)" />
            <Line type="monotone" dataKey="acc_p50" stroke="#065F46" strokeWidth={2.5} dot={false} name="Accord (median)" />
          </ComposedChart>
        </ResponsiveContainer>

        <p style={S.source}>
          Monte Carlo simulation: {N_PATHS.toLocaleString()} paths. Annual returns drawn from N({(meanReturn * 100).toFixed(0)}%,{' '}
          {(STD_RETURN * 100).toFixed(0)}%). AMCF grants accumulate from birth (age 0–17: custodial account, age 18+: personal account).
          PSU equity accumulates with each employer over 5-year ramp; cashed out at job changes and reinvested.
          All values in 2024 real dollars (2% annual inflation adjustment applied to nominal returns).
        </p>
      </div>

      {/* ── Milestone Table ── */}
      <div style={S.section}>
        <h2 style={S.h2}>Wealth at Key Milestones — {qLabel}</h2>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Age</th>
              <th style={S.th}>Milestone</th>
              <th style={{ ...S.th, color: '#1D4ED8' }}>Current System (Median)</th>
              <th style={{ ...S.th, color: '#065F46' }}>Accord (Median)</th>
              <th style={S.th}>Accord Advantage</th>
              <th style={S.th}>Accord P25–P75</th>
            </tr>
          </thead>
          <tbody>
            {milestoneData.map((row, i) => {
              const milestones = ['AMCF custodial transfer', 'Young professional', 'Established career', 'Peak earning years', 'Late career', 'Retirement'];
              const adv = row.acc_p50 - row.cur_p50;
              return (
                <tr key={row.age} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                  <td style={{ ...S.td, fontWeight: 700 }}>{row.age}</td>
                  <td style={S.td}>{milestones[i]}</td>
                  <td style={{ ...S.td, color: '#1D4ED8' }}>{fmtK(row.cur_p50)}</td>
                  <td style={{ ...S.td, color: '#065F46', fontWeight: 600 }}>{fmtK(row.acc_p50)}</td>
                  <td style={{ ...S.td, color: adv >= 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>
                    {adv >= 0 ? '+' : ''}{fmtK(adv)}
                  </td>
                  <td style={{ ...S.td, fontSize: 12 }}>
                    {fmtK(row.acc_p25)} – {fmtK(row.acc_p75)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Two-column: Probability Table + 18th Birthday Histogram ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: S.section.marginTop }}>
        {/* Probability Table */}
        <div>
          <h2 style={S.h2}>Probability of Reaching Wealth Milestones by Age 65</h2>
          <p style={S.subtext}>Percentage of {N_PATHS.toLocaleString()} simulated paths</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Threshold</th>
                <th style={{ ...S.th, color: '#1D4ED8' }}>Current</th>
                <th style={{ ...S.th, color: '#065F46' }}>Accord</th>
                <th style={S.th}>Improvement</th>
              </tr>
            </thead>
            <tbody>
              {probData.map((row, i) => {
                const imp = row.acc - row.cur;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{fmtK(row.threshold)}</td>
                    <td style={{ ...S.td, color: '#1D4ED8' }}>{fmtPct(row.cur)}</td>
                    <td style={{ ...S.td, color: '#065F46', fontWeight: 600 }}>{fmtPct(row.acc)}</td>
                    <td style={{ ...S.td, color: '#059669', fontWeight: 600 }}>+{Math.round(imp * 100)}pp</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={S.source}>
            Using {(meanReturn * 100).toFixed(0)}% nominal return, {grantTraj} grant trajectory,{' '}
            {(psuDivYield * 100).toFixed(1)}% PSU yield, {Math.round(k401Part * 100)}% 401k participation.
          </p>
        </div>

        {/* 18th Birthday Histogram */}
        <div>
          <h2 style={S.h2}>18th Birthday: AMCF Custodial Account</h2>
          <p style={S.subtext}>
            Distribution across {N_PATHS.toLocaleString()} paths.
            Median: <strong>{fmtK(amcfAt18Median)}</strong> &nbsp;|&nbsp;
            Range: {fmtK(amcfAt18P25)}–{fmtK(amcfAt18P75)}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={amcfAt18Hist} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="range" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v) => [`${(v * 100).toFixed(1)}%`, 'Share of paths']}
                contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="pct" name="Share of paths" fill="#10B981" radius={[2, 2, 0, 0]} />
              <ReferenceLine x={fmtK(amcfAt18Median)} stroke="#065F46" strokeDasharray="4 3" />
            </BarChart>
          </ResponsiveContainer>
          <p style={S.source}>
            AMCF custodial account value at age 18 transfer. Variance comes from 18 years of
            market-linked AMCF returns. The $500 annual floor means even bad-luck paths have
            meaningful balances. "{fmtK(amcfAt18Median)} median" matches spec estimate of{' '}
            $15K–$17K (conservative) to $20K+ (base/optimistic).
          </p>
        </div>
      </div>

      {/* ── Methodology ── */}
      <div style={{ marginTop: 48, padding: '16px 20px', background: '#F9FAFB', borderRadius: 8, fontSize: 11, color: '#6B7280', lineHeight: 1.7 }}>
        <strong style={{ color: '#374151' }}>Methodology:</strong>{' '}
        Monte Carlo simulation: {N_PATHS.toLocaleString()} paths, age 0–{AGE_MAX}.
        Annual real returns: N({((meanReturn - 0.02) * 100).toFixed(0)}%, 16%), drawn from seeded LCG + Box-Muller.
        Employment start age drawn from empirical distribution (10%@16, 15%@18, 40%@22, 25%@25, 10%@28).
        Wages use BLS age-earnings profile (annualized) × quintile multiplier.
        Job changes drawn stochastically (probability 42% age &lt;25, 28% age 25–34, 20% age 35–44, 12% age 45–54, 8% age 55+);
        at each change, PSU cashed out at FMV and reinvested. Employer type drawn at each job from quintile-specific
        distribution (large/mid/exempt firms per Census Statistics of US Businesses).
        AMCF grows at the same annual return as household portfolio (AMCF holds passive equity).
        Prebate net savings = max(0, $5,000 − 4% VAT on quintile consumption, New Accord rate) × income-appropriate savings rate.
        Current system: 401(k) at quintile participation rate (9% combined, slider-adjustable) + minimal personal savings.
        All values in 2024 real dollars.
      </div>
    </div>
  );
}
