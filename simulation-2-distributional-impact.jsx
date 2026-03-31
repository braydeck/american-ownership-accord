import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, LineChart, Line, ReferenceLine,
} from 'recharts';

// ─── 2024 Federal Tax Parameters ─────────────────────────────────────────────

// Standard deductions
const STD_DED = { single: 14600, mfj: 29200, hoh: 21900 };

// Brackets: [taxable income threshold, marginal rate]
// Current system
const BRACKETS_CURRENT = {
  single: [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
  mfj:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
};

// Accord: add 3pp to brackets above $75K single / $150K MFJ, 5pp above $1M
// Implemented as post-calculation adjustment
function accordTaxAdj(income, filing) {
  const threshold1 = filing === 'mfj' ? 150000 : 75000;
  const threshold2 = 1000000;
  let adj = 0;
  if (income > threshold1) adj += 0.03 * (Math.min(income, threshold2) - threshold1);
  if (income > threshold2) adj += 0.02 * (income - threshold2); // total 5% above $1M (2% more)
  return adj;
}

function calcFederalTax(income, filing) {
  const brackets = BRACKETS_CURRENT[filing] || BRACKETS_CURRENT.single;
  const ded = STD_DED[filing] || STD_DED.single;
  const taxable = Math.max(0, income - ded);
  let tax = 0, prev = 0;
  for (const [top, rate] of brackets) {
    const band = Math.min(taxable, top) - prev;
    if (band <= 0) break;
    tax += band * rate;
    prev = top;
    if (taxable <= top) break;
  }
  return tax;
}

// ─── Payroll Tax ─────────────────────────────────────────────────────────────

function calcPayrollTax(income, system) {
  // Employee-side only (7.65% to cap, then 1.45%)
  const ssCap    = 168600;
  const ssCap400 = 400000;

  let ss    = Math.min(income, ssCap) * 0.062;  // SS 6.2% to cap
  let mcare = income * 0.0145;                   // Medicare 1.45% uncapped
  let addl  = income > 200000 ? (income - 200000) * 0.009 : 0; // ACA surtax

  // Accord donut-hole fix: reapply 6.2% SS above $400K
  let donut = 0;
  if (system === 'accord' && income > ssCap400) {
    donut = (income - ssCap400) * 0.062;
  }
  return ss + mcare + addl + donut;
}

// ─── Capital Gains Tax ───────────────────────────────────────────────────────

function calcCapGainsTax(gains, income, filing, system) {
  if (gains <= 0) return 0;

  if (system === 'current') {
    // 0% / 15% / 20% thresholds (approx 2024, married)
    const t15 = filing === 'mfj' ? 94050 : 47025;
    const t20 = filing === 'mfj' ? 583750 : 518900;
    if (income + gains <= t15) return 0;
    const gainsAbove15 = Math.max(0, gains - Math.max(0, t15 - income));
    const gainsAbove20 = Math.max(0, gains - Math.max(0, t20 - income));
    return gainsAbove15 * 0.15 + gainsAbove20 * 0.05; // 5% more = 20% total above threshold
  } else {
    // Accord: 0% on first $200K, 20% on $200K–$1M, ordinary rates above $1M
    const band1 = Math.min(gains, Math.max(0, 200000));
    const band2 = Math.min(Math.max(0, gains - 200000), 800000);
    const band3 = Math.max(0, gains - 1000000);
    const ordinaryRate = calcFederalTax(income + gains, filing) / (income + gains) || 0.37;
    return band1 * 0 + band2 * 0.20 + band3 * ordinaryRate;
  }
}

// ─── Benefits (Current System) ───────────────────────────────────────────────

// SNAP: ~$3,600/yr household average; participates based on income and household size
function snapBenefit(income, hhSize) {
  const threshold = hhSize * 20000; // ~130% FPL (rough)
  if (income > threshold) return 0;
  const base = hhSize * 2400; // ~$200/person/month
  return base * Math.max(0, 1 - income / threshold);
}

// EITC 2024 (approximate; single filer or MFJ)
function eitcBenefit(income, children, filing) {
  const c = Math.min(Math.round(children), 3);
  const maxEitc = [632, 4213, 6960, 7830][c];
  const phaseoutStart = filing === 'mfj'
    ? [16370, 22720, 22720, 22720][c]
    : [9520,  21560, 21560, 21560][c];
  const phaseoutEnd = filing === 'mfj'
    ? [25511, 53120, 59478, 63398][c]
    : [18591, 46560, 52918, 56838][c];
  if (income > phaseoutEnd) return 0;
  if (income >= phaseoutStart) {
    return maxEitc * Math.max(0, (phaseoutEnd - income) / (phaseoutEnd - phaseoutStart));
  }
  return maxEitc * Math.min(1, income / phaseoutStart);
}

// CTC: $2,000/child, phases out at $200K single / $400K MFJ
function ctcBenefit(income, children, filing) {
  if (children === 0) return 0;
  const phaseout = filing === 'mfj' ? 400000 : 200000;
  const reduction = Math.max(0, income - phaseout) / 1000 * 50;
  return Math.max(0, children * 2000 - reduction);
}

// ─── VAT and Prebate ─────────────────────────────────────────────────────────

// Consumption-to-income ratios (BLS Consumer Expenditure Survey)
function consumeRatio(income) {
  if (income <=  25000) return 0.95;
  if (income <=  50000) return 0.85;
  if (income <=  75000) return 0.76;
  if (income <= 100000) return 0.70;
  if (income <= 200000) return 0.60;
  if (income <= 500000) return 0.40;
  return 0.22;
}

// ─── Worker Equity Dividends (Accord) ────────────────────────────────────────

// PSU dividends by income bracket (3.5% yield on PSU equity, weighted by employment)
// Based on employer size distribution and PSU equilibrium values from Codetermination.md
function psuDividend(income) {
  if (income <  20000)  return 1200;  // Part-time / small firms, some exempt
  if (income <  50000)  return 2000;  // Mixed large/small employer
  if (income < 100000)  return 3000;  // Majority large-firm employment
  if (income < 400000)  return 3500;  // High-income, large firms
  return 0; // C-suite / executives excluded from phantom equity
}

// Stock portfolio drag: ~2% annual on existing stock holdings (codetermination dilution + growth tax)
// SCF stock wealth by income
function stockDrag(income) {
  if (income <   50000) return 50;
  if (income <  100000) return 400;
  if (income <  200000) return 1800;
  if (income <  500000) return 7000;
  if (income < 1000000) return 35000;
  return 180000;
}

// ─── Compute Household Net Tax Burden ────────────────────────────────────────

function computeBurden(income, hhSize, children, capGains, filing, system, amcfPhase = 'base') {
  const amcfRates = { conservative: 500, base: 600, optimistic: 750 };
  const amcfPerCapita = amcfRates[amcfPhase] || 600;

  if (system === 'current') {
    const fedTax   = calcFederalTax(income, filing);
    const payroll  = calcPayrollTax(income, 'current');
    const cgTax    = calcCapGainsTax(capGains, income, filing, 'current');
    const snap     = snapBenefit(income, hhSize);
    const eitc     = eitcBenefit(income, children, filing);
    const ctc      = ctcBenefit(income, children, filing);
    const netBurden = fedTax + payroll + cgTax - snap - eitc - ctc;
    return {
      netBurden,
      breakdown: {
        'Federal Income Tax': fedTax,
        'Payroll Tax (Emp)': payroll,
        'Capital Gains Tax': cgTax,
        'SNAP / EITC / CTC': -(snap + eitc + ctc),
      }
    };
  } else {
    const fedTax   = calcFederalTax(income, filing) + accordTaxAdj(income, filing);
    const payroll  = calcPayrollTax(income, 'accord');
    const cgTax    = calcCapGainsTax(capGains, income, filing, 'accord');
    const vat      = 0.10 * consumeRatio(income) * income;
    const prebate  = 5000 * hhSize;
    const amcf     = amcfPerCapita * hhSize;
    const psuDiv   = psuDividend(income);
    const drag     = stockDrag(income);
    const netBurden = fedTax + payroll + cgTax + vat + drag - prebate - amcf - psuDiv;
    return {
      netBurden,
      breakdown: {
        'Federal Income Tax': fedTax,
        'Payroll Tax (Emp)': payroll,
        'Capital Gains Tax': cgTax,
        'VAT (10%)': vat,
        'Stock Portfolio Drag': drag,
        'Prebate ($5K/person)': -prebate,
        'AMCF Citizen Grants': -amcf,
        'Worker Equity Dividends': -psuDiv,
      }
    };
  }
}

// ─── Census Income Bracket Data ──────────────────────────────────────────────

// Sources: Census Bureau ACS 2022, IRS SOI, BLS CES
const CENSUS_BRACKETS = [
  { label: '$0–10K',    mid:      5000, hh: 5.0e6,  size: 1.8, kids: 0.3, capGains:      0, filing: 'single' },
  { label: '$10–15K',   mid:     12500, hh: 6.0e6,  size: 2.0, kids: 0.4, capGains:      0, filing: 'single' },
  { label: '$15–25K',   mid:     20000, hh: 13.0e6, size: 2.1, kids: 0.5, capGains:      0, filing: 'single' },
  { label: '$25–35K',   mid:     30000, hh: 13.0e6, size: 2.3, kids: 0.6, capGains:      0, filing: 'single' },
  { label: '$35–50K',   mid:     42000, hh: 16.0e6, size: 2.5, kids: 0.7, capGains:    500, filing: 'mfj'    },
  { label: '$50–75K',   mid:     62000, hh: 19.0e6, size: 2.6, kids: 0.8, capGains:   2000, filing: 'mfj'    },
  { label: '$75–100K',  mid:     87000, hh: 14.0e6, size: 2.7, kids: 0.9, capGains:   5000, filing: 'mfj'    },
  { label: '$100–150K', mid:    120000, hh: 17.0e6, size: 2.8, kids: 1.0, capGains:   8000, filing: 'mfj'    },
  { label: '$150–200K', mid:    170000, hh:  9.0e6, size: 2.9, kids: 1.0, capGains:  20000, filing: 'mfj'    },
  { label: '$200–500K', mid:    300000, hh:  8.0e6, size: 3.0, kids: 0.9, capGains:  40000, filing: 'mfj'    },
  { label: '$500K–1M',  mid:    680000, hh:  1.0e6, size: 3.0, kids: 0.8, capGains: 200000, filing: 'mfj'    },
  { label: '$1M–2M',    mid:   1400000, hh: 0.27e6, size: 2.8, kids: 0.6, capGains: 300000, filing: 'mfj'    },
  { label: '$2M–5M',    mid:   3000000, hh: 0.14e6, size: 2.9, kids: 0.5, capGains:1000000, filing: 'mfj'    },
  { label: '$5M–15M',   mid:   8000000, hh: 0.06e6, size: 2.9, kids: 0.5, capGains:3500000, filing: 'mfj'    },
  { label: '$15M+',     mid:  35000000, hh: 0.03e6, size: 2.8, kids: 0.4, capGains:16000000, filing: 'mfj'   },
];

// ─── Formatting ──────────────────────────────────────────────────────────────

const fmtDollar = v => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
};
const fmtPct = v => `${(v * 100).toFixed(1)}%`;

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root:    { fontFamily: "'Georgia', serif", maxWidth: 1040, margin: '0 auto', padding: '40px 32px', background: '#fff', color: '#111' },
  section: { marginTop: 48 },
  h1:      { fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2 },
  headline:{ fontSize: 17, color: '#065F46', fontWeight: 600, marginTop: 10 },
  h2:      { fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 0 },
  subtext: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 24 },
  label:   { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 2 },
  source:  { fontSize: 11, color: '#9CA3AF', marginTop: 12, lineHeight: 1.6 },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:      { textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB' },
  td:      { borderBottom: '1px solid #f3f4f6', padding: '7px 12px' },
  tab:     (active) => ({
    padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#fff' : '#374151',
    background: active ? '#1D4ED8' : '#F9FAFB',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
  }),
  input:   { padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14, width: '100%' },
};

const DollarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '10px 14px', fontSize: 12, borderRadius: 6 }}>
      <p style={{ fontWeight: 700, marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill, margin: '2px 0' }}>
          {p.name}: {fmtDollar(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function DistributionalImpact() {
  const [view, setView] = useState('national');

  // Calculator state
  const [calcIncome,   setCalcIncome]   = useState(75000);
  const [calcHhSize,   setCalcHhSize]   = useState(3);
  const [calcChildren, setCalcChildren] = useState(1);
  const [calcCapGains, setCalcCapGains] = useState(0);
  const [calcFiling,   setCalcFiling]   = useState('mfj');

  // National analysis (memoized — doesn't change with calculator inputs)
  const national = useMemo(() => {
    const data = CENSUS_BRACKETS.map(b => {
      const cur  = computeBurden(b.mid, b.size, b.kids, b.capGains, b.filing, 'current');
      const acc  = computeBurden(b.mid, b.size, b.kids, b.capGains, b.filing, 'accord');
      const netChange    = -(acc.netBurden - cur.netBurden); // positive = better off
      const effRateCur   = cur.netBurden / b.mid;
      const effRateAcc   = acc.netBurden / b.mid;
      const takeHomeCur  = b.mid - cur.netBurden;
      const takeHomeAcc  = b.mid - acc.netBurden;
      return {
        label:   b.label,
        hh:      b.hh,
        netChange,
        effRateCur,
        effRateAcc,
        takeHomeCur,
        takeHomeAcc,
        betterOff: netChange > 500, // >$500 better
        worseOff:  netChange < -500,
      };
    });

    const totalHH    = data.reduce((s, d) => s + d.hh, 0);
    const betterOffHH = data.filter(d => d.betterOff).reduce((s, d) => s + d.hh, 0);
    const worseOffHH  = data.filter(d => d.worseOff).reduce((s, d) => s + d.hh, 0);

    // Breakeven: first bracket where netChange turns negative
    let breakeven = null;
    for (let i = 0; i < data.length - 1; i++) {
      if (data[i].netChange > 0 && data[i+1].netChange < 0) {
        breakeven = CENSUS_BRACKETS[i].label + '–' + CENSUS_BRACKETS[i+1].label;
      }
    }

    return { data, totalHH, betterOffHH, worseOffHH, breakeven };
  }, []);

  // Calculator results
  const calcResults = useMemo(() => {
    const cur = computeBurden(calcIncome, calcHhSize, calcChildren, calcCapGains, calcFiling, 'current');
    const acc = computeBurden(calcIncome, calcHhSize, calcChildren, calcCapGains, calcFiling, 'accord');
    return { cur, acc, netChange: -(acc.netBurden - cur.netBurden) };
  }, [calcIncome, calcHhSize, calcChildren, calcCapGains, calcFiling]);

  const pctBetter = national.betterOffHH / national.totalHH;

  // Build effective rate line data
  const rateData = national.data.map(d => ({
    label: d.label,
    'Current Effective Rate': +(d.effRateCur * 100).toFixed(1),
    'Accord Effective Rate':  +(d.effRateAcc * 100).toFixed(1),
  }));

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={{ borderLeft: '4px solid #10B981', paddingLeft: 20 }}>
        <p style={S.label}>American Ownership Accord — Simulation 2</p>
        <h1 style={S.h1}>Who Pays, Who Gains</h1>
        <p style={S.headline}>
          {(pctBetter * 100).toFixed(0)}% of American households pay less under the Accord —
          driven by the universal $5,000/person prebate offsetting the 10% VAT for the bottom
          three income quintiles.
        </p>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>
          Net fiscal burden comparison for every American household: federal income tax, payroll tax,
          capital gains tax, and VAT (Accord) versus prebate, AMCF grants, worker equity dividends,
          and current SNAP/EITC/CTC benefits.
        </p>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
        <button style={S.tab(view === 'national')} onClick={() => setView('national')}>National Picture</button>
        <button style={S.tab(view === 'calculator')} onClick={() => setView('calculator')}>My Household Calculator</button>
      </div>

      {/* ══ NATIONAL PICTURE ══════════════════════════════════════════════ */}
      {view === 'national' && (
        <>
          {/* Headline stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 28 }}>
            {[
              { label: 'Households better off', value: fmtPct(pctBetter), color: '#059669' },
              { label: 'Households worse off', value: fmtPct(national.worseOffHH / national.totalHH), color: '#DC2626' },
              { label: 'Breakeven income range', value: national.breakeven || '~$100–150K', color: '#1D4ED8' },
            ].map((box, i) => (
              <div key={i} style={{ padding: '18px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#F9FAFB' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{box.label}</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: box.color }}>{box.value}</p>
              </div>
            ))}
          </div>

          {/* Chart 1: Dollar change by bracket */}
          <div style={S.section}>
            <h2 style={S.h2}>Annual Net Fiscal Change by Income Bracket</h2>
            <p style={S.subtext}>Green = better off under Accord (pays less or receives more). Red = worse off. Neutral band ±$500.</p>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={national.data.map(d => ({ ...d, name: d.label }))}
                margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, angle: -30, textAnchor: 'end' }} interval={0} />
                <YAxis tickFormatter={fmtDollar} tick={{ fontSize: 12 }} width={70} />
                <Tooltip content={<DollarTooltip />} />
                <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
                <Bar dataKey="netChange" name="Net change vs current system" radius={[3,3,0,0]}>
                  {national.data.map((d, i) => (
                    <Cell key={i} fill={d.betterOff ? '#10B981' : d.worseOff ? '#EF4444' : '#9CA3AF'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={S.source}>
              Sources: Census Bureau ACS (2022) household counts; IRS SOI realized capital gains; BLS Consumer Expenditure Survey consumption ratios;
              USDA FNS SNAP participation data; IRS EITC/CTC data. Accord parameters: 10% VAT, $5,000/capita prebate, $600/capita AMCF grants (Phase 2 base estimate),
              worker PSU dividends by employer size, 2% annual stock portfolio drag on existing holdings.
            </p>
          </div>

          {/* Chart 2: Effective Tax Rate Curves */}
          <div style={S.section}>
            <h2 style={S.h2}>Effective Net Tax Rate — Current vs Accord</h2>
            <p style={S.subtext}>
              Net tax burden as percentage of income. Accord effective rate is lower for most households
              due to prebate, AMCF, and PSU dividends offsetting the VAT.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rateData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, angle: -30, textAnchor: 'end' }} interval={0} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} width={50} />
                <Tooltip formatter={(v) => [`${v}%`]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="4 4" />
                <Line dataKey="Current Effective Rate" stroke="#1D4ED8" strokeWidth={2.5} dot={false} />
                <Line dataKey="Accord Effective Rate"  stroke="#059669" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p style={S.source}>
              Effective rate = (net tax burden) / income. Negative rate means household receives more from the Accord than it pays in taxes.
              Bottom brackets show negative effective rate under Accord: prebate + AMCF grants exceed income + VAT liability.
            </p>
          </div>

          {/* Summary table */}
          <div style={S.section}>
            <h2 style={S.h2}>Summary by Income Bracket</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Income Range</th>
                  <th style={S.th}>Households</th>
                  <th style={{ ...S.th, color: '#1D4ED8' }}>Current Rate</th>
                  <th style={{ ...S.th, color: '#059669' }}>Accord Rate</th>
                  <th style={S.th}>Take-home Pay<br /><span style={{ fontWeight: 400, fontSize: 11 }}>Current → Accord</span></th>
                  <th style={S.th}>Net Annual Δ</th>
                  <th style={S.th}>Better Off?</th>
                </tr>
              </thead>
              <tbody>
                {national.data.map((d, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{d.label}</td>
                    <td style={S.td}>{(CENSUS_BRACKETS[i].hh / 1e6).toFixed(1)}M</td>
                    <td style={{ ...S.td, color: '#1D4ED8' }}>{fmtPct(d.effRateCur)}</td>
                    <td style={{ ...S.td, color: d.effRateAcc < d.effRateCur ? '#059669' : '#DC2626' }}>{fmtPct(d.effRateAcc)}</td>
                    <td style={S.td}>
                      <span style={{ color: '#1D4ED8' }}>{fmtDollar(Math.round(d.takeHomeCur / 100) * 100)}</span>
                      <span style={{ color: '#9CA3AF', margin: '0 4px' }}>→</span>
                      <span style={{ color: '#059669', fontWeight: 600 }}>{fmtDollar(Math.round(d.takeHomeAcc / 100) * 100)}</span>
                    </td>
                    <td style={{ ...S.td, color: d.netChange >= 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>
                      {d.netChange >= 0 ? '+' : ''}{fmtDollar(Math.round(d.netChange / 100) * 100)}
                    </td>
                    <td style={S.td}>{d.betterOff ? '✓ Yes' : d.worseOff ? '✗ No' : '≈ Neutral'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ HOUSEHOLD CALCULATOR ══════════════════════════════════════════ */}
      {view === 'calculator' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 32, marginTop: 28 }}>
            {/* Inputs */}
            <div style={{ padding: '24px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#F9FAFB' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Your Household</h3>

              {[
                {
                  label: 'Annual Household Income',
                  input: <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: '#374151' }}>$</span>
                    <input type="number" value={calcIncome} onChange={e => setCalcIncome(+e.target.value || 0)}
                      style={{ ...S.input, flex: 1 }} min={0} max={5000000} step={1000} />
                  </div>
                },
                {
                  label: 'Household Size (people)',
                  input: <select value={calcHhSize} onChange={e => setCalcHhSize(+e.target.value)} style={S.input}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>)}
                  </select>
                },
                {
                  label: 'Number of Children',
                  input: <select value={calcChildren} onChange={e => setCalcChildren(+e.target.value)} style={S.input}>
                    {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                },
                {
                  label: 'Filing Status',
                  input: <select value={calcFiling} onChange={e => setCalcFiling(e.target.value)} style={S.input}>
                    <option value="single">Single</option>
                    <option value="mfj">Married Filing Jointly</option>
                  </select>
                },
                {
                  label: 'Realized Capital Gains This Year',
                  input: <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 14 }}>$</span>
                    <input type="number" value={calcCapGains} onChange={e => setCalcCapGains(+e.target.value || 0)}
                      style={{ ...S.input, flex: 1 }} min={0} step={1000} />
                  </div>
                },
              ].map(({ label, input }, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <label style={{ ...S.label, display: 'block', marginBottom: 6, color: '#374151', textTransform: 'none', fontSize: 13, fontWeight: 600 }}>{label}</label>
                  {input}
                </div>
              ))}

              <div style={{ marginTop: 8, padding: '12px 14px', background: '#EFF6FF', borderRadius: 8, fontSize: 12, color: '#1E40AF' }}>
                Prebate under Accord: <strong>${(5000 * calcHhSize).toLocaleString()}/year</strong><br />
                ($5,000 × {calcHhSize} {calcHhSize === 1 ? 'person' : 'people'} in household)
              </div>
            </div>

            {/* Results */}
            <div>
              {/* Net change banner */}
              <div style={{
                padding: '20px 24px', borderRadius: 10, marginBottom: 20,
                background: calcResults.netChange >= 0 ? '#ECFDF5' : '#FEF2F2',
                border: `1px solid ${calcResults.netChange >= 0 ? '#A7F3D0' : '#FECACA'}`,
              }}>
                <p style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>Under the American Ownership Accord, your household would be:</p>
                <p style={{
                  fontSize: 32, fontWeight: 800,
                  color: calcResults.netChange >= 0 ? '#065F46' : '#991B1B',
                }}>
                  {calcResults.netChange >= 0 ? '▲ ' : '▼ '}
                  {fmtDollar(Math.abs(Math.round(calcResults.netChange)))} per year
                </p>
                <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                  {calcResults.netChange >= 0 ? 'better off' : 'worse off'} than under the current system.
                  {calcResults.netChange < 0 && calcIncome > 150000 && ' Higher income households pay more to fund universal prebate and AMCF.'}
                </p>
              </div>

              {/* Side-by-side breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { title: 'Current System', burden: calcResults.cur, color: '#1D4ED8', bg: '#EFF6FF' },
                  { title: 'American Ownership Accord', burden: calcResults.acc, color: '#065F46', bg: '#ECFDF5' },
                ].map(({ title, burden, color, bg }) => (
                  <div key={title} style={{ padding: '16px 18px', border: `1px solid ${color}30`, borderRadius: 8, background: bg }}>
                    <p style={{ fontWeight: 700, color, marginBottom: 12, fontSize: 14 }}>{title}</p>
                    {Object.entries(burden.breakdown).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                        <span style={{ color: '#374151' }}>{k}</span>
                        <span style={{ fontWeight: 600, color: v < 0 ? '#059669' : '#DC2626' }}>
                          {v < 0 ? '−' : '+'}${Math.abs(Math.round(v)).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    <div style={{ borderTop: '2px solid ' + color + '40', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700 }}>Net Burden</span>
                      <span style={{ fontWeight: 700, color }}>
                        {burden.netBurden < 0 ? '−$' : '$'}{Math.abs(Math.round(burden.netBurden)).toLocaleString()}
                        {burden.netBurden < 0 && ' (net recipient)'}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color, marginTop: 8 }}>
                      Effective rate: {fmtPct(Math.max(-0.5, Math.min(1, burden.netBurden / Math.max(calcIncome, 1))))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Context note */}
          <div style={{ marginTop: 28, padding: '16px 20px', background: '#F9FAFB', borderRadius: 8, fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
            <strong style={{ color: '#374151' }}>Calculator notes:</strong>{' '}
            Estimates use simplified tax calculations and average consumption ratios. Individual results vary based on itemized deductions, investment income,
            employer size (for PSU eligibility), and actual consumption patterns. Capital gains reform applies 0% on first $200K, 20% on $200K–$1M,
            ordinary rates above $1M (under Accord). SNAP/EITC/CTC replaced by universal prebate — households currently receiving benefits may have different
            net outcomes depending on benefit levels. PSU dividends excluded for households in top bracket (C-suite exclusion).
          </div>
        </>
      )}

      {/* Methodology note */}
      <div style={{ marginTop: 40, padding: '16px 20px', background: '#F9FAFB', borderRadius: 8, fontSize: 11, color: '#6B7280', lineHeight: 1.7 }}>
        <strong style={{ color: '#374151' }}>Methodology:</strong>{' '}
        Current system taxes computed from 2024 brackets (standard deduction). Accord income tax includes +3pp above median income (~$75K single, $150K MFJ) and
        +5pp above $1M. Payroll tax adds 6.2% employer-side reapplication above $400K. Capital gains: 0%/20%/ordinary per Accord Section 4. VAT = 10% on estimated
        consumption (BLS CES ratios). Prebate = $5,000/person/year unconditional. AMCF grants = $600/person Phase 2 base. Worker PSU dividends estimated by employer
        size distribution ($1,200–$3,500/yr, C-suite excluded). Stock drag = annual 2% on estimated stock holdings by income bracket (Fed SCF). Decile analysis uses
        Census Bureau household counts and IRS SOI capital gains data.
      </div>
    </div>
  );
}
