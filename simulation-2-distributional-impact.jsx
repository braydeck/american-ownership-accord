import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, LineChart, Line, ReferenceLine,
} from 'recharts';

// ─── BRACKETS (IRS SOI + Census, 2024 estimates — from Income Tax Design) ─────────────────
// 15 brackets covering all ~162M filers
const BRACKETS = [
  { label: '$0–10K',    filers: 25.00e6, agi:   130e9, effCL: 0.000, cgShare: 0.02, jFrac: 0.20, hhSz: 1.4, cRat: 1.20, own: 0.15 },
  { label: '$10–15K',   filers: 10.00e6, agi:   120e9, effCL: 0.010, cgShare: 0.02, jFrac: 0.22, hhSz: 1.6, cRat: 1.00, own: 0.28 },
  { label: '$15–25K',   filers: 18.00e6, agi:   340e9, effCL: 0.030, cgShare: 0.02, jFrac: 0.26, hhSz: 1.9, cRat: 0.97, own: 0.36 },
  { label: '$25–40K',   filers: 18.00e6, agi:   580e9, effCL: 0.055, cgShare: 0.02, jFrac: 0.32, hhSz: 2.1, cRat: 0.95, own: 0.46 },
  { label: '$40–55K',   filers: 16.00e6, agi:   760e9, effCL: 0.085, cgShare: 0.02, jFrac: 0.38, hhSz: 2.3, cRat: 0.90, own: 0.55 },
  { label: '$55–75K',   filers: 18.00e6, agi:  1170e9, effCL: 0.110, cgShare: 0.03, jFrac: 0.42, hhSz: 2.4, cRat: 0.84, own: 0.62 },
  { label: '$75–100K',  filers: 15.00e6, agi:  1320e9, effCL: 0.125, cgShare: 0.03, jFrac: 0.46, hhSz: 2.5, cRat: 0.78, own: 0.68 },
  { label: '$100–150K', filers: 17.00e6, agi:  2100e9, effCL: 0.138, cgShare: 0.04, jFrac: 0.55, hhSz: 2.6, cRat: 0.72, own: 0.74 },
  { label: '$150–200K', filers:  8.50e6, agi:  1480e9, effCL: 0.150, cgShare: 0.05, jFrac: 0.60, hhSz: 2.7, cRat: 0.64, own: 0.79 },
  { label: '$200–500K', filers:  8.00e6, agi:  2400e9, effCL: 0.163, cgShare: 0.08, jFrac: 0.65, hhSz: 2.7, cRat: 0.54, own: 0.85 },
  { label: '$500K–1M',  filers:  1.00e6, agi:   680e9, effCL: 0.175, cgShare: 0.15, jFrac: 0.72, hhSz: 2.8, cRat: 0.34, own: 0.90 },
  { label: '$1–2M',     filers:  0.38e6, agi:   530e9, effCL: 0.180, cgShare: 0.25, jFrac: 0.75, hhSz: 2.8, cRat: 0.24, own: 0.92 },
  { label: '$2–5M',     filers:  0.14e6, agi:   430e9, effCL: 0.183, cgShare: 0.35, jFrac: 0.78, hhSz: 2.8, cRat: 0.16, own: 0.93 },
  { label: '$5–15M',    filers:  0.05e6, agi:   430e9, effCL: 0.184, cgShare: 0.45, jFrac: 0.80, hhSz: 2.8, cRat: 0.12, own: 0.94 },
  { label: '$15M+',     filers:  0.04e6, agi:  1080e9, effCL: 0.185, cgShare: 0.56, jFrac: 0.80, hhSz: 2.8, cRat: 0.10, own: 0.95 },
];

// Carbon tons emitted per household by bracket (EPA household survey)
const CARBON_TONS = [4, 5, 6, 7, 8.5, 10, 11, 12, 13.5, 16, 18, 22, 26, 30, 35];

// Net LVT burden per filer at 10% LVT rate (negative = net benefit from rent relief)
// Lower brackets: renters get rent relief > LVT pass-through → net ~0
// Middle brackets: homeowners begin paying more LVT than rent savings
// Upper brackets: large net payer (property wealth concentrated here)
const LVT_NET_BASE = [0, 0, 0, 0, 0, 0, 400, 1200, 2500, 5500, 14000, 28000, 55000, 110000, 220000];

const TOTAL_POP = BRACKETS.reduce((s, b) => s + b.filers * b.hhSz, 0); // ~330M

// ─── THREE-TIER WORKER EQUITY (from Income Tax Design) ─────────────────────────────────────
// Tier 1 (<$10M EV): $1K/yr sectoral fund at 6% gross; 3.5% distributed as dividends
// Tier 2 ($10M–$100M): phantom equity; company routes dividends to sectoral fund; cashout at departure
// Tier 3 (>$100M): 4% annual Equity Excise → 20% PSU by Year 5; appreciates at EV_GROWTH/yr
const TIER_DIST = [
  [0.12, 0.20, 0.40],  // $0–10K
  [0.15, 0.22, 0.48],  // $10–15K
  [0.18, 0.25, 0.52],  // $15–25K
  [0.20, 0.27, 0.50],  // $25–40K
  [0.22, 0.28, 0.45],  // $40–55K
  [0.24, 0.28, 0.40],  // $55–75K
  [0.26, 0.26, 0.36],  // $75–100K
  [0.25, 0.24, 0.32],  // $100–150K
  [0.22, 0.20, 0.30],  // $150–200K
  [0.16, 0.18, 0.25],  // $200–500K
  [0.09, 0.12, 0.20],  // $500K–1M
  [0.04, 0.08, 0.15],  // $1–2M
  [0.02, 0.05, 0.10],  // $2–5M
  [0.01, 0.03, 0.07],  // $5–15M
  [0.00, 0.01, 0.04],  // $15M+
];

// Tier 2: per-worker phantom equity (20% of employer EV ÷ employee count)
const TIER2_PHANTOM_EQ = [
  25000, 30000, 38000, 48000, 60000, 70000, 80000, 90000,
  100000, 100000, 100000, 100000, 100000, 100000, 100000,
];

// Tier 3: PSU equity per worker at 20% ownership equilibrium (Year 5+)
const TIER3_PSU_EQ = [
   40000,  55000,  75000, 100000, 135000, 165000, 200000,
  260000, 325000, 400000, 500000, 650000, 800000, 950000, 1100000,
];

const PSU_YIELD  = 0.035;
const EV_GROWTH  = 0.075;
const AVG_TENURE = 4.1;

// Part-time FTE adjustment by bracket (hours-worked fraction for equity allocation)
const PARTTIME_FTE = [
  0.20, 0.45, 0.65, 0.90, 0.95,
  1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
];

// Sectoral fund balance at Year N with fixed annual contribution C (6% gross growth)
function sectoralFundBalance(annualContrib, year) {
  if (year <= 0) return 0;
  return annualContrib * (Math.pow(1.06, year) - 1) / 0.06;
}

// Annual dividend income from held worker equity (all three tiers)
function psuDividendPerFiler(bracketIndex, year) {
  const [t1, t2, t3] = TIER_DIST[bracketIndex];
  const t1Balance = sectoralFundBalance(1000, year);
  const t1Income  = t1Balance * PSU_YIELD;
  const t2Balance = sectoralFundBalance(TIER2_PHANTOM_EQ[bracketIndex] * PSU_YIELD, year);
  const t2Income  = t2Balance * PSU_YIELD;
  const t3Ramp   = Math.min(1, year / 5);
  const t3Apprec = year > 5 ? Math.pow(1 + EV_GROWTH, year - 5) : 1;
  const t3Income = TIER3_PSU_EQ[bracketIndex] * t3Ramp * t3Apprec * PSU_YIELD;
  return (t1 * t1Income + t2 * t2Income + t3 * t3Income) * PARTTIME_FTE[bracketIndex];
}

// Annualized wealth event from PSU cashout at job change (Tier 2 + 3 only)
function psuCashoutPerFiler(bracketIndex, year) {
  const [, t2, t3] = TIER_DIST[bracketIndex];
  const tenureGrowth = Math.pow(1 + EV_GROWTH, AVG_TENURE);
  const t2Cashout = TIER2_PHANTOM_EQ[bracketIndex] * tenureGrowth / AVG_TENURE;
  const t3Ramp    = Math.min(1, year / 5);
  const t3Cashout = TIER3_PSU_EQ[bracketIndex] * t3Ramp * tenureGrowth / AVG_TENURE;
  return (t2 * t2Cashout + t3 * t3Cashout) * PARTTIME_FTE[bracketIndex];
}

// ─── AMCF (from Income Tax Design, anchored to National Balance Sheet validated outputs) ──────────────────
const PREBATE_PER_PERSON = 5000;

const AMCF_EQUITY_ANCHORS = [
  [1, 0.59e12], [5, 4.02e12], [10, 11.99e12], [15, 27.15e12],
  [20, 51.87e12], [25, 84.68e12], [30, 142.58e12], [35, 247.06e12],
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

// Payout yield ramps from 3.63% (Year 1) to 6.0% (Year 15+)
function amcfCombinedYield(year) {
  return 0.0363 + (0.06 - 0.0363) * Math.min(1, year / 15);
}

function amcfDividendPerCap(year) {
  return (amcfEquityAt(year) * amcfCombinedYield(year)) / TOTAL_POP;
}

// ─── DISTRIBUTIONAL ENGINE ────────────────────────────────────────────────────
// Income tax is UNCHANGED vs current law (base Accord distributional picture).
// Delta = VAT + LVT + carbon + prebate + AMCF + [worker equity]
function computeDistrib(vatRate, lvtRate, year) {
  const amcfPerCap = amcfDividendPerCap(year);
  return BRACKETS.map((b, i) => {
    const avgInc = b.agi / b.filers;
    const clTax  = b.effCL * avgInc;

    const vatBurden  = vatRate * b.cRat * avgInc;
    const prebate    = PREBATE_PER_PERSON * b.hhSz;
    const amcfBenefit = amcfPerCap * Math.min(b.hhSz, 2); // adults only; children's AMCF is custodial
    const lvtBurden  = LVT_NET_BASE[i] * (lvtRate / 0.10);

    const carbonPaid     = CARBON_TONS[i] * 100;
    const carbonDividend = (5e9 * 100 * 0.80 / TOTAL_POP) * b.hhSz;
    const carbonNet      = carbonPaid - carbonDividend;

    const psuDividend = psuDividendPerFiler(i, year);
    const psuCashout  = psuCashoutPerFiler(i, year);

    // Net Δ vs Current Law — positive = household pays more
    const delta        = vatBurden + lvtBurden + carbonNet - prebate - amcfBenefit;
    const deltaWithPSU = delta - psuDividend - psuCashout;

    const effCL            = clTax / Math.max(avgInc, 1);
    const effAccord        = (clTax + vatBurden + lvtBurden + carbonNet - prebate - amcfBenefit) / Math.max(avgInc, 1);
    const effAccordWithPSU = effAccord - (psuDividend / Math.max(avgInc, 1));

    return {
      label: b.label, avgInc, filers: b.filers, hhSz: b.hhSz,
      clTax, vatBurden, lvtBurden, carbonNet, prebate, amcfBenefit,
      psuDividend, psuCashout, delta, deltaWithPSU,
      deltaPct: delta / Math.max(avgInc, 1) * 100,
      betterOff:        delta < -100,
      worseOff:         delta >  100,
      betterOffWithPSU: deltaWithPSU < -100,
      effCL, effAccord, effAccordWithPSU,
    };
  });
}

// ─── HOUSEHOLD CALCULATOR HELPERS ────────────────────────────────────────────

// 2024 Federal Tax brackets
const STD_DED = { single: 14600, mfj: 29200 };
const BRACKETS_CURRENT = {
  single: [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
  mfj:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
};

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

function calcPayrollTax(income) {
  const ssCap = 168600;
  return Math.min(income, ssCap) * 0.062 + income * 0.0145 + (income > 200000 ? (income - 200000) * 0.009 : 0);
}

function calcCapGainsTax(gains, income, filing) {
  if (gains <= 0) return 0;
  const t15 = filing === 'mfj' ? 94050 : 47025;
  const t20 = filing === 'mfj' ? 583750 : 518900;
  if (income + gains <= t15) return 0;
  const gainsAbove15 = Math.max(0, gains - Math.max(0, t15 - income));
  const gainsAbove20 = Math.max(0, gains - Math.max(0, t20 - income));
  return gainsAbove15 * 0.15 + gainsAbove20 * 0.05;
}

function snapBenefit(income, hhSize) {
  const threshold = hhSize * 20000;
  if (income > threshold) return 0;
  return hhSize * 2400 * Math.max(0, 1 - income / threshold);
}

function eitcBenefit(income, children, filing) {
  const c = Math.min(Math.round(children), 3);
  const maxEitc = [632, 4213, 6960, 7830][c];
  const phaseoutStart = filing === 'mfj' ? [16370,22720,22720,22720][c] : [9520,21560,21560,21560][c];
  const phaseoutEnd   = filing === 'mfj' ? [25511,53120,59478,63398][c] : [18591,46560,52918,56838][c];
  if (income > phaseoutEnd) return 0;
  if (income >= phaseoutStart) return maxEitc * Math.max(0, (phaseoutEnd - income) / (phaseoutEnd - phaseoutStart));
  return maxEitc * Math.min(1, income / phaseoutStart);
}

function ctcBenefit(income, children, filing) {
  if (children === 0) return 0;
  const phaseout = filing === 'mfj' ? 400000 : 200000;
  return Math.max(0, children * 2000 - Math.max(0, income - phaseout) / 1000 * 50);
}

// Consumption-to-income ratio for household calculator (BLS Consumer Expenditure Survey)
function consumeRatio(income) {
  if (income <=  25000) return 0.95;
  if (income <=  50000) return 0.85;
  if (income <=  75000) return 0.76;
  if (income <= 100000) return 0.70;
  if (income <= 200000) return 0.60;
  if (income <= 500000) return 0.40;
  return 0.22;
}

// Estimated annual carbon tons by income (EPA)
function estimatedCarbonTons(income) {
  if (income <  25000) return 5;
  if (income <  50000) return 7;
  if (income <  75000) return 9;
  if (income < 100000) return 11;
  if (income < 200000) return 13;
  if (income < 500000) return 17;
  return 25;
}

// PSU dividend income by bracket (income-step approximation for calculator)
function psuDividendCalc(income) {
  if (income <  20000)  return 1200;
  if (income <  50000)  return 2100;
  if (income < 100000)  return 3200;
  if (income < 400000)  return 4000;
  return 0;
}

// Annual stock portfolio drag (2% of estimated equity holdings per SCF)
function stockDrag(income) {
  if (income <   50000) return 50;
  if (income <  100000) return 400;
  if (income <  200000) return 1800;
  if (income <  500000) return 7000;
  if (income < 1000000) return 35000;
  return 180000;
}

function computeCalcBurden(income, hhSize, children, capGains, filing) {
  // Current law
  const fedTax  = calcFederalTax(income, filing);
  const payroll = calcPayrollTax(income);
  const cgTax   = calcCapGainsTax(capGains, income, filing);
  const snap    = snapBenefit(income, hhSize);
  const eitc    = eitcBenefit(income, children, filing);
  const ctc     = ctcBenefit(income, children, filing);
  const curBurden = fedTax + payroll + cgTax - snap - eitc - ctc;

  // Accord (income tax unchanged; adds VAT 4%, LVT net, carbon net, prebate, AMCF, PSU)
  const vat      = 0.04 * consumeRatio(income) * income;
  const prebate  = 5000 * hhSize;
  const amcf     = 600 * hhSize; // Year ~2 base AMCF estimate
  const psuDiv   = psuDividendCalc(income);
  const drag     = stockDrag(income);
  const cTons    = estimatedCarbonTons(income);
  const carbonPd = cTons * 100;
  const carbonDv = (5e9 * 100 * 0.80 / 330e6) * hhSize; // ~$1,212/person returned
  const carbonNt = carbonPd - carbonDv;
  const lvtEst   = income > 75000 ? Math.min(income * 0.015, 15000) : 0; // rough renter/owner net

  const accBurden = fedTax + payroll + cgTax + vat + drag + carbonNt + lvtEst - prebate - amcf - psuDiv;

  return {
    cur: {
      netBurden: curBurden,
      breakdown: {
        'Federal Income Tax': fedTax,
        'Payroll Tax (Employee)': payroll,
        'Capital Gains Tax': cgTax,
        'SNAP / EITC / CTC': -(snap + eitc + ctc),
      },
    },
    acc: {
      netBurden: accBurden,
      breakdown: {
        'Federal Income Tax': fedTax,
        'Payroll Tax (Employee)': payroll,
        'Capital Gains Tax': cgTax,
        'VAT (4%)': vat,
        'LVT Net (est.)': lvtEst,
        'Carbon Tax (net)': carbonNt,
        'Stock Portfolio Drag': drag,
        'Prebate ($5K/person)': -prebate,
        'AMCF Citizen Dividend': -amcf,
        'Worker Equity Dividends': -psuDiv,
      },
    },
  };
}

// ─── FORMATTING ──────────────────────────────────────────────────────────────

const fmtDollar = v => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
};
const fmtPct = v => `${(v * 100).toFixed(1)}%`;

// ─── STYLES ──────────────────────────────────────────────────────────────────

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
  th:      { textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 10px', fontWeight: 600, background: '#F9FAFB' },
  td:      { borderBottom: '1px solid #f3f4f6', padding: '6px 10px' },
  tab:     (active) => ({
    padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#fff' : '#374151',
    background: active ? '#065F46' : '#F9FAFB',
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
        <p key={p.dataKey} style={{ color: p.fill || p.stroke, margin: '2px 0' }}>
          {p.name}: {fmtDollar(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function DistributionalImpact() {
  const [view,         setView]         = useState('national');
  const [vatRate,      setVatRate]      = useState(0.04);
  const [lvtRate,      setLvtRate]      = useState(0.10);
  const [snapshotYear, setSnapshotYear] = useState(1);
  const [showPSU,      setShowPSU]      = useState(false);

  // Calculator state
  const [calcIncome,   setCalcIncome]   = useState(75000);
  const [calcHhSize,   setCalcHhSize]   = useState(3);
  const [calcChildren, setCalcChildren] = useState(1);
  const [calcCapGains, setCalcCapGains] = useState(0);
  const [calcFiling,   setCalcFiling]   = useState('mfj');

  const distrib = useMemo(
    () => computeDistrib(vatRate, lvtRate, snapshotYear),
    [vatRate, lvtRate, snapshotYear],
  );

  const calcResults = useMemo(
    () => computeCalcBurden(calcIncome, calcHhSize, calcChildren, calcCapGains, calcFiling),
    [calcIncome, calcHhSize, calcChildren, calcCapGains, calcFiling],
  );

  const totalFilers   = distrib.reduce((s, d) => s + d.filers, 0);
  const betterOffHH   = distrib.filter(d => showPSU ? d.betterOffWithPSU : d.betterOff).reduce((s, d) => s + d.filers, 0);
  const worseOffHH    = distrib.filter(d => !(showPSU ? d.betterOffWithPSU : d.betterOff) && (showPSU ? d.deltaWithPSU : d.delta) > 100).reduce((s, d) => s + d.filers, 0);
  const pctBetter     = betterOffHH / totalFilers;

  // Breakeven: first bracket where delta turns positive
  let breakeven = null;
  for (let i = 0; i < distrib.length - 1; i++) {
    const d0 = showPSU ? distrib[i].deltaWithPSU : distrib[i].delta;
    const d1 = showPSU ? distrib[i + 1].deltaWithPSU : distrib[i + 1].delta;
    if (d0 < 0 && d1 > 0 && breakeven === null) {
      breakeven = `${distrib[i].label}–${distrib[i + 1].label}`;
    }
  }

  const amcfPerCap = amcfDividendPerCap(snapshotYear);
  const amcfEquity = amcfEquityAt(snapshotYear);
  const amcfYield  = amcfCombinedYield(snapshotYear);

  // Effective rate data for line chart
  const rateData = distrib.map(d => ({
    label: d.label,
    'Current Law': +(d.effCL * 100).toFixed(1),
    'Accord (base)': +(d.effAccord * 100).toFixed(1),
    ...(showPSU ? { 'Accord + Equity': +(d.effAccordWithPSU * 100).toFixed(1) } : {}),
  }));

  const netChangeData = distrib.map(d => ({
    name: d.label,
    delta: showPSU ? d.deltaWithPSU : d.delta,
    betterOff: showPSU ? d.betterOffWithPSU : d.betterOff,
    worseOff:  (showPSU ? d.deltaWithPSU : d.delta) > 100,
  }));

  const calcNetChange = -(calcResults.acc.netBurden - calcResults.cur.netBurden);

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={{ borderLeft: '4px solid #10B981', paddingLeft: 20 }}>
        <p style={S.label}>American Ownership Accord</p>
        <h1 style={S.h1}>Distributional Impact</h1>
        <p style={S.headline}>
          {(pctBetter * 100).toFixed(0)}% of American households are better off under the Accord at Year {snapshotYear} —
          driven by the universal $5,000/person prebate and growing AMCF dividend offsetting the {(vatRate * 100).toFixed(0)}% VAT.
        </p>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>
          Net fiscal burden comparison: VAT ({(vatRate * 100).toFixed(0)}%) + LVT net ({(lvtRate * 100).toFixed(0)}%) + carbon ($100/ton) versus
          prebate ($5K/person), AMCF citizen dividend (${Math.round(amcfPerCap).toLocaleString()}/person at Year {snapshotYear}),
          and worker equity (toggle below). Income tax kept at current law in this base distributional view.
        </p>
      </div>

      {/* ── View toggle ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
        <button style={S.tab(view === 'national')}    onClick={() => setView('national')}>National Picture</button>
        <button style={S.tab(view === 'table')}       onClick={() => setView('table')}>Full Accord Table</button>
        <button style={S.tab(view === 'calculator')}  onClick={() => setView('calculator')}>My Household</button>
      </div>

      {/* ── Shared controls (National + Table views) ── */}
      {view !== 'calculator' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginTop: 20, padding: '16px 20px', background: '#F9FAFB', borderRadius: 10 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>VAT Rate: {(vatRate * 100).toFixed(0)}%</p>
            <input type="range" min={0} max={0.15} step={0.01} value={vatRate}
              onChange={e => setVatRate(+e.target.value)} style={{ width: 140 }} />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>LVT Rate: {(lvtRate * 100).toFixed(0)}%</p>
            <input type="range" min={0} max={0.20} step={0.01} value={lvtRate}
              onChange={e => setLvtRate(+e.target.value)} style={{ width: 140 }} />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Snapshot Year: {snapshotYear}</p>
            <input type="range" min={1} max={30} step={1} value={snapshotYear}
              onChange={e => setSnapshotYear(+e.target.value)} style={{ width: 140 }} />
          </div>
          <div style={{ padding: '10px 14px', background: '#ECFDF5', borderRadius: 8, border: '1px solid #A7F3D0', fontSize: 12, lineHeight: 1.8 }}>
            <strong>AMCF at Year {snapshotYear}</strong><br />
            Equity: <strong>${(amcfEquity / 1e12).toFixed(1)}T</strong> &nbsp;|&nbsp;
            Yield: <strong>{(amcfYield * 100).toFixed(1)}%</strong><br />
            Dividend: <strong>${Math.round(amcfPerCap).toLocaleString()}/person/yr</strong>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Worker Equity</p>
            <button onClick={() => setShowPSU(s => !s)} style={{
              padding: '8px 16px', borderRadius: 6, border: '2px solid', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
              background: showPSU ? '#065F46' : '#fff',
              color: showPSU ? '#fff' : '#374151',
              borderColor: showPSU ? '#065F46' : '#D1D5DB',
            }}>
              {showPSU ? '✓ Equity On' : 'Equity Off'}
            </button>
            <p style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4, maxWidth: 110 }}>PSU dividends + annualized cashout</p>
          </div>
        </div>
      )}

      {/* ══ NATIONAL PICTURE ══════════════════════════════════════════════════ */}
      {view === 'national' && (
        <>
          {/* Headline stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 28 }}>
            {[
              { label: 'Households better off', value: fmtPct(pctBetter), color: '#059669' },
              { label: 'Households worse off',  value: fmtPct(worseOffHH / totalFilers), color: '#DC2626' },
              { label: 'Breakeven income range', value: breakeven || 'None in range', color: '#1D4ED8' },
            ].map((box, i) => (
              <div key={i} style={{ padding: '18px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#F9FAFB' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{box.label}</p>
                <p style={{ fontSize: 28, fontWeight: 700, color: box.color }}>{box.value}</p>
              </div>
            ))}
          </div>

          {/* Chart 1: Net change by bracket */}
          <div style={S.section}>
            <h2 style={S.h2}>Annual Net Fiscal Change by Income Bracket — Year {snapshotYear}</h2>
            <p style={S.subtext}>Green = better off under Accord (pays less or receives more). Red = worse off. Neutral band ±$100.</p>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={netChangeData.map(d => ({ ...d, netChange: -d.delta }))}
                margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' }} interval={0} />
                <YAxis tickFormatter={fmtDollar} tick={{ fontSize: 12 }} width={70} />
                <Tooltip content={<DollarTooltip />} />
                <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
                <Bar dataKey="netChange" name="Net change vs current law" radius={[3,3,0,0]}>
                  {netChangeData.map((d, i) => (
                    <Cell key={i} fill={d.betterOff ? '#10B981' : d.worseOff ? '#EF4444' : '#9CA3AF'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p style={S.source}>
              Sources: IRS Statistics of Income (2024 estimates); EPA household carbon survey; BLS Consumer Expenditure Survey.
              Accord parameters: VAT {(vatRate * 100).toFixed(0)}%, LVT {(lvtRate * 100).toFixed(0)}%, carbon $100/ton (80% recycled as equal per-capita dividend),
              $5,000/person/yr prebate, AMCF dividend ${Math.round(amcfPerCap).toLocaleString()}/person (National Balance Sheet validated equity base).
              {showPSU ? ' Worker equity (PSU dividends + annualized cashout) included.' : ' Worker equity not included — toggle above.'}
            </p>
          </div>

          {/* Chart 2: Effective Tax Rate */}
          <div style={S.section}>
            <h2 style={S.h2}>Effective Net Tax Rate — Current Law vs Accord</h2>
            <p style={S.subtext}>
              Net burden as % of income. Accord effective rate is lower for most households
              due to prebate, AMCF dividend, and LVT rent relief offsetting the VAT.
              Negative = household receives more from Accord than it pays.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rateData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' }} interval={0} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} width={50} />
                <Tooltip formatter={v => [`${v.toFixed(1)}%`]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="4 4" />
                <Line dataKey="Current Law"   stroke="#1D4ED8" strokeWidth={2.5} dot={false} />
                <Line dataKey="Accord (base)" stroke="#059669" strokeWidth={2.5} dot={false} />
                {showPSU && <Line dataKey="Accord + Equity" stroke="#065F46" strokeWidth={2} dot={false} strokeDasharray="5 3" />}
              </LineChart>
            </ResponsiveContainer>
            <p style={S.source}>
              Effective rate = net burden / income. Bottom brackets show negative rate under Accord:
              prebate + AMCF grants exceed VAT + carbon liability for households near or below poverty line.
            </p>
          </div>

          {/* Summary table */}
          <div style={S.section}>
            <h2 style={S.h2}>Summary by Income Bracket</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Income Range</th>
                  <th style={S.th}>Filers</th>
                  <th style={{ ...S.th, color: '#1D4ED8' }}>Current Rate</th>
                  <th style={{ ...S.th, color: '#059669' }}>Accord Rate</th>
                  <th style={S.th}>Net Annual Δ</th>
                  <th style={S.th}>Better Off?</th>
                </tr>
              </thead>
              <tbody>
                {distrib.map((d, i) => {
                  const delta   = showPSU ? d.deltaWithPSU : d.delta;
                  const effAcc  = showPSU ? d.effAccordWithPSU : d.effAccord;
                  const better  = showPSU ? d.betterOffWithPSU : d.betterOff;
                  const worse   = delta > 100;
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{d.label}</td>
                      <td style={S.td}>{(d.filers / 1e6).toFixed(1)}M</td>
                      <td style={{ ...S.td, color: '#1D4ED8' }}>{fmtPct(d.effCL)}</td>
                      <td style={{ ...S.td, color: effAcc < d.effCL ? '#059669' : '#DC2626' }}>{fmtPct(effAcc)}</td>
                      <td style={{ ...S.td, color: delta <= 0 ? '#059669' : '#DC2626', fontWeight: 600 }}>
                        {delta <= 0 ? '+' : ''}{fmtDollar(-delta)}
                      </td>
                      <td style={S.td}>{better ? '✓ Yes' : worse ? '✗ No' : '≈ Neutral'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ FULL ACCORD TABLE ════════════════════════════════════════════════ */}
      {view === 'table' && (
        <>
          <div style={{ marginTop: 28, overflowX: 'auto' }}>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              Complete per-household impact vs Current Law. Income tax unchanged (base Accord distributional picture).
              VAT {(vatRate * 100).toFixed(0)}% + LVT {(lvtRate * 100).toFixed(0)}% + carbon $100/ton + prebate $5K/person + AMCF ${Math.round(amcfPerCap).toLocaleString()}/person at Year {snapshotYear}.
            </p>
            <table style={{ ...S.table, fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  {[
                    'Bracket', 'Avg Inc', 'Filers',
                    'VAT Burden', 'LVT Net', 'Carbon Net',
                    'Prebate', 'AMCF Div',
                    ...(showPSU ? ['PSU Div', 'Cashout (ann.)'] : []),
                    'NET Δ vs CL', '% Income', 'Status',
                  ].map((h, i) => (
                    <th key={i} style={{
                      padding: '8px 8px', textAlign: i > 2 ? 'right' : 'left', fontWeight: 700, fontSize: 11,
                      background:
                        h === 'Prebate' ? '#14532d'
                        : h === 'PSU Div' ? '#14532d'
                        : h === 'Cashout (ann.)' ? '#166534'
                        : h === 'NET Δ vs CL' ? '#1a5276'
                        : undefined,
                      color: '#fff',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {distrib.map((d, i) => {
                  const delta  = showPSU ? d.deltaWithPSU : d.delta;
                  const better = showPSU ? d.betterOffWithPSU : d.betterOff;
                  const bg = better ? (i % 2 === 0 ? '#f0fdf4' : '#ecfdf5') : delta > 1000 ? '#fef2f2' : '#fff';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: bg }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e3a5f' }}>{d.label}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right' }}>${(d.avgInc / 1000).toFixed(0)}K</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', color: '#6b7280' }}>{(d.filers / 1e6).toFixed(1)}M</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', color: '#dc2626' }}>+{fmtDollar(d.vatBurden)}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', color: d.lvtBurden > 0 ? '#dc2626' : '#059669' }}>
                        {d.lvtBurden > 0 ? '+' : ''}{fmtDollar(d.lvtBurden)}
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', color: d.carbonNet > 0 ? '#dc2626' : '#059669' }}>
                        {d.carbonNet > 0 ? '+' : ''}{fmtDollar(d.carbonNet)}
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#f0fdf4' }}>
                        −{fmtDollar(d.prebate)}
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', color: '#059669' }}>−{fmtDollar(d.amcfBenefit)}</td>
                      {showPSU && (
                        <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#f0fdf4' }}>
                          −{fmtDollar(d.psuDividend)}
                        </td>
                      )}
                      {showPSU && (
                        <td style={{ padding: '6px 6px', textAlign: 'right', color: '#059669', background: '#ecfdf5' }}>
                          −{fmtDollar(d.psuCashout)}
                        </td>
                      )}
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: delta < 0 ? '#059669' : '#dc2626', background: '#f0f9ff' }}>
                        {delta < 0 ? '−' : '+'}{fmtDollar(Math.abs(delta))}
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', color: '#6b7280' }}>
                        {(Math.abs(d.deltaPct)).toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 6px', textAlign: 'center', fontWeight: 700, fontSize: 11 }}>
                        {better
                          ? <span style={{ color: '#059669' }}>✓ Better</span>
                          : delta > 100
                            ? <span style={{ color: '#dc2626' }}>✗ Worse</span>
                            : <span style={{ color: '#6b7280' }}>≈ Neutral</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showPSU && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0fdf4', borderRadius: 6, fontSize: 11, color: '#166534' }}>
              <strong>PSU Div:</strong> Annual income from held stakes — Tier 1 sectoral fund ($1K/yr at 6% gross, 3.5% distributed) + Tier 2 phantom-equity fund dividends + Tier 3 PSU dividends at 3.5% yield (Tier 3 value appreciates at 7.5%/yr after Year 5 ramp). &nbsp;
              <strong>Cashout (ann.):</strong> Wealth transfer when worker changes jobs — PSU/phantom equity redeemed at FMV, annualized as value ÷ average tenure (4.1 yr). Tier 1 sectoral fund is portable (no cashout event).
            </div>
          )}
          <p style={S.source}>
            Accord parameters: VAT {(vatRate * 100).toFixed(0)}% on consumption (BLS consumption ratios by bracket) + LVT {(lvtRate * 100).toFixed(0)}% (net burden — renters receive rent relief; homeowners pay LVT on land value) + carbon $100/ton (80% recycled as equal per-capita dividend = ~${Math.round(5e9 * 100 * 0.80 / 330e6 * 2.5).toLocaleString()}/avg-household) + $5,000/person/yr universal prebate + AMCF dividend ${Math.round(amcfPerCap).toLocaleString()}/person (Year {snapshotYear}, National Balance Sheet validated equity base ${(amcfEquity / 1e12).toFixed(1)}T × {(amcfYield * 100).toFixed(1)}% yield).
            Income tax unchanged vs current law in this base distributional view (see Income Tax Design for income tax reform scenarios).
          </p>
        </>
      )}

      {/* ══ HOUSEHOLD CALCULATOR ════════════════════════════════════════════ */}
      {view === 'calculator' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 32, marginTop: 28 }}>
            {/* Inputs */}
            <div style={{ padding: '24px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#F9FAFB' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Your Household</h3>

              {[
                {
                  label: 'Annual Household Income',
                  input: (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, color: '#374151' }}>$</span>
                      <input type="number" value={calcIncome}
                        onChange={e => setCalcIncome(+e.target.value || 0)}
                        style={{ ...S.input, flex: 1 }} min={0} max={5000000} step={1000} />
                    </div>
                  ),
                },
                {
                  label: 'Household Size (people)',
                  input: (
                    <select value={calcHhSize} onChange={e => setCalcHhSize(+e.target.value)} style={S.input}>
                      {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>)}
                    </select>
                  ),
                },
                {
                  label: 'Number of Children',
                  input: (
                    <select value={calcChildren} onChange={e => setCalcChildren(+e.target.value)} style={S.input}>
                      {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ),
                },
                {
                  label: 'Filing Status',
                  input: (
                    <select value={calcFiling} onChange={e => setCalcFiling(e.target.value)} style={S.input}>
                      <option value="single">Single</option>
                      <option value="mfj">Married Filing Jointly</option>
                    </select>
                  ),
                },
                {
                  label: 'Realized Capital Gains This Year',
                  input: (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 14 }}>$</span>
                      <input type="number" value={calcCapGains}
                        onChange={e => setCalcCapGains(+e.target.value || 0)}
                        style={{ ...S.input, flex: 1 }} min={0} step={1000} />
                    </div>
                  ),
                },
              ].map(({ label, input }, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <label style={{ ...S.label, display: 'block', marginBottom: 6, color: '#374151', textTransform: 'none', fontSize: 13, fontWeight: 600 }}>{label}</label>
                  {input}
                </div>
              ))}

              <div style={{ marginTop: 8, padding: '12px 14px', background: '#EFF6FF', borderRadius: 8, fontSize: 12, color: '#1E40AF' }}>
                Prebate: <strong>${(5000 * calcHhSize).toLocaleString()}/year</strong> ($5,000 × {calcHhSize})<br />
                AMCF: <strong>~$600/person/year</strong> (base Year 1–2 estimate)
              </div>
            </div>

            {/* Results */}
            <div>
              {/* Net change banner */}
              <div style={{
                padding: '20px 24px', borderRadius: 10, marginBottom: 20,
                background: calcNetChange >= 0 ? '#ECFDF5' : '#FEF2F2',
                border: `1px solid ${calcNetChange >= 0 ? '#A7F3D0' : '#FECACA'}`,
              }}>
                <p style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>Under the American Ownership Accord, your household would be:</p>
                <p style={{ fontSize: 32, fontWeight: 800, color: calcNetChange >= 0 ? '#065F46' : '#991B1B' }}>
                  {calcNetChange >= 0 ? '▲ ' : '▼ '}
                  {fmtDollar(Math.abs(Math.round(calcNetChange)))} per year
                </p>
                <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                  {calcNetChange >= 0 ? 'better off' : 'worse off'} than under the current system.
                  {calcNetChange < 0 && calcIncome > 150000 && ' Higher-income households net-pay more to fund universal prebate and AMCF.'}
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
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
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

              <div style={{ marginTop: 16, padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, fontSize: 12, color: '#6B7280', lineHeight: 1.7 }}>
                <strong style={{ color: '#374151' }}>Calculator notes:</strong>{' '}
                LVT net burden estimated as 1.5% of income above $75K (rough owner-weighted average at 10% LVT; renters net zero or positive from rent relief).
                Carbon tax = ${estimatedCarbonTons(calcIncome)} estimated tons × $100/ton, less $1,212 per-person annual carbon dividend (80% of revenue recycled equally).
                Worker equity dividends use income-bracket approximation ($1,200–$4,000/yr; executives excluded).
                AMCF uses ~$600/person base (Year 1–2); dividend grows substantially by Year 10+ (see National Balance Sheet for trajectory).
                Capital gains reform not modeled here — see Income Tax Design for full income tax + CG reform analysis.
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Methodology ── */}
      <div style={{ marginTop: 48, padding: '16px 20px', background: '#F9FAFB', borderRadius: 8, fontSize: 11, color: '#6B7280', lineHeight: 1.7 }}>
        <strong style={{ color: '#374151' }}>Methodology:</strong>{' '}
        Bracket data: IRS Statistics of Income 2024 estimates (15 brackets, 162M filers). Effective current-law rates calibrated to IRS SOI.
        Accord parameters (base): VAT 4% on consumption (BLS CES ratios by bracket); LVT 10% net burden (renters receive rent relief, homeowners net-pay land value tax — lower brackets net zero);
        carbon $100/ton × EPA household emissions, 80% recycled as equal per-capita dividend (~$1,212/person/yr);
        $5,000/person/yr universal prebate; AMCF equity dividend from National Balance Sheet validated equity trajectory.
        Worker equity (three-tier): Tier 1 sectoral fund ($1K/yr at 6% gross, 3.5% distributed); Tier 2 phantom equity ($25K–$100K/worker) via sectoral fund contributions;
        Tier 3 PSU (4%/yr Equity Excise → 20% ownership, appreciates at 7.5%/yr after Year 5 ramp, 3.5% dividend yield).
        Part-time FTE adjustment applied by bracket. All values in 2024 real dollars. Income tax unchanged vs current law in this view (see Income Tax Design for income tax reform).
      </div>
    </div>
  );
}
