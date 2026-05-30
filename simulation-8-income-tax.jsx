import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from 'recharts';

// ============================================================
// BRACKET DATA  (IRS SOI + Census, 2024 estimates)
// 15 brackets covering all ~162M filers
// ============================================================
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
// Lower brackets: renters get rent relief > LVT pass-through → net 0
// Middle brackets: homeowners begin paying more LVT than they save in rent
// Upper brackets: large net payer (property wealth concentrated here)
const LVT_NET_BASE = [0, 0, 0, 0, 0, 0, 400, 1200, 2500, 5500, 14000, 28000, 55000, 110000, 220000];

const CL_REVENUE = 2.39e12;  // Calibrated current-law income tax baseline
const TOTAL_POP = BRACKETS.reduce((s, b) => s + b.filers * b.hhSz, 0); // ~330M

// ============================================================
// THREE-TIER WORKER EQUITY ARCHITECTURE
//
// Tier 1  (<$10M EV):  $1,000/yr deposited into Sectoral Wealth Fund.
//   Fund earns 6% gross; 3.5% distributed annually as dividends; 2.5% reinvested.
//   Dividends = fund_balance × 3.5% (balance grows at 6% gross with annual additions).
//   Fund is PORTABLE — follows worker across jobs; no cashout event at departure.
//
// Tier 2  ($10M–$100M EV):  Company contributes cash = phantom_equity × 3.5% into
//   Sectoral Fund each year.  Same fund mechanics as Tier 1 (6% gross growth).
//   Worker income = fund_balance × 3.5%.  At departure: phantom equity stake cashed
//   out at FMV; annualized = (phantom_eq × (1+EV_GROWTH)^tenure) / tenure.
//
// Tier 3  (>$100M EV):  4% annual Equity Excise → 20% PSU ownership by Year 5.
//   Excise reactivates to replenish departed workers' shares (self-perpetuating).
//   PSU holding value appreciates at EV_GROWTH/yr after Year 5 ramp.
//   Dividends = psu_equity × appreciation × 3.5%.
//   At departure: PSU stake cashed out at FMV; annualized = (stake × appreciation) / tenure.
//
// TIER_DIST[i] = [tier1Frac, tier2Frac, tier3Frac]  (non-participating = remainder)
// BLS firm-size data: low-income workers are disproportionately at large Tier 3
// employers (Walmart, Amazon, Target, large healthcare systems).  Higher-income
// brackets are more mixed — more self-employment, small professional firms (Tier 1/2),
// though high-EV tech/finance employers push their Tier 3 PSU values very high.
// ============================================================
const TIER_DIST = [
  // [T1,   T2,   T3  ]
  [0.12, 0.20, 0.40],  // $0–10K:    part-time; many franchise/gig (non-covered); some big-box T3
  [0.15, 0.22, 0.48],  // $10–15K:   full-time low-wage; large employers dominate
  [0.18, 0.25, 0.52],  // $15–25K:   retail, food service, logistics; Tier 3 majority
  [0.20, 0.27, 0.50],  // $25–40K:   Walmart, Amazon warehouse, large healthcare
  [0.22, 0.28, 0.45],  // $40–55K:   manufacturing, healthcare, services
  [0.24, 0.28, 0.40],  // $55–75K
  [0.26, 0.26, 0.36],  // $75–100K:  professional mix; growing self-employment
  [0.25, 0.24, 0.32],  // $100–150K
  [0.22, 0.20, 0.30],  // $150–200K
  [0.16, 0.18, 0.25],  // $200–500K: significant owner/investor fraction
  [0.09, 0.12, 0.20],  // $500K–1M
  [0.04, 0.08, 0.15],  // $1–2M
  [0.02, 0.05, 0.10],  // $2–5M
  [0.01, 0.03, 0.07],  // $5–15M
  [0.00, 0.01, 0.04],  // $15M+:     predominantly capital/owner income
];

// Tier 2: per-worker phantom equity = 20% of employer EV ÷ employee count.
// Typical Tier 2 company: $40M EV, 100–500 employees → $16K–$80K per worker.
// Lower-income workers at larger Tier 2 firms (more co-workers, lower per-worker share).
// Higher-income workers at smaller Tier 2 firms (fewer co-workers, higher per-worker share).
const TIER2_PHANTOM_EQ = [
  25000,  // $0–10K
  30000,  // $10–15K
  38000,  // $15–25K
  48000,  // $25–40K
  60000,  // $40–55K
  70000,  // $55–75K
  80000,  // $75–100K
  90000,  // $100–150K
 100000,  // $150–200K
 100000,  // $200–500K
 100000,  // $500K–1M
 100000,  // $1M+
 100000,
 100000,
 100000,
];

// Tier 3: PSU equity per worker at 20% ownership equilibrium (Year 5+), in 2024 dollars.
// Employment-weighted from actual EV/headcount of dominant employers per bracket:
//   $0–10K:  big-box part-time (Walmart $47.6K, McDonald's corp $29K) → ~$40K avg
//   $15–25K: retail/logistics (Walmart $47.6K, Amazon warehouse $267K, Target $36K) → ~$75K
//   $25–40K: Amazon + Walmart weighted average → ~$100K
//   $40–55K: manufacturing (Ford $160K, GM $125K), large healthcare → ~$135K
//   $75–100K: professional/tech support → ~$200K
//   $100–150K: professional, mid-tier tech → ~$260K
//   $200K+: executive/finance/tech; high EV per worker, but participation drops sharply
// After Year 5, these values appreciate at EV_GROWTH/yr (applied in equityBenefitPerFiler).
const TIER3_PSU_EQ = [
   40000,  // $0–10K
   55000,  // $10–15K
   75000,  // $15–25K
  100000,  // $25–40K
  135000,  // $40–55K
  165000,  // $55–75K
  200000,  // $75–100K
  260000,  // $100–150K
  325000,  // $150–200K
  400000,  // $200–500K
  500000,  // $500K–1M
  650000,  // $1–2M
  800000,  // $2–5M
  950000,  // $5–15M
 1100000,  // $15M+: very high EV/worker at top firms, but only 4% participate
];

const PSU_YIELD  = 0.035;  // 3.5% payout yield (all tiers)
const EV_GROWTH  = 0.075;  // 7.5% nominal company EV growth rate for PSU appreciation
const AVG_TENURE = 4.1;    // BLS median job tenure (years) — drives cashout annualization

// Part-time FTE adjustment: equity allocation is proportional to hours worked for hourly
// employees; 40+ hrs/week = 1.0 (full allocation).  Derived from bracket avg AGI ÷
// estimated hourly wage × 2,080 annual full-time hours, blended with the salaried fraction
// in each bracket (salaried workers receive full allocation regardless of hours).
const PARTTIME_FTE = [
  0.20,  // $0–10K:   ~8 hrs/week avg (high gig/part-time fraction, student workers)
  0.45,  // $10–15K:  ~18 hrs/week avg
  0.65,  // $15–25K:  ~27 hrs/week avg (mix full/part-time)
  0.90,  // $25–40K:  mostly full-time; some part-time and seasonal
  0.95,  // $40–55K
  1.00,  // $55K+:    effectively full-time or salaried
  1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
];

// Sectoral fund balance at Year N given fixed annual contribution C.
// The fund earns 6% gross return; 3.5% is paid out as dividends (from earnings),
// and 2.5% is reinvested, growing the principal.  Dividends come from earnings, not
// corpus, so the full 6% compounds the fund balance — use 6% rate, not 2.5% net.
// Year 10 reference: $1K/yr → $13,181 balance → $462 annual dividend.
function sectoralFundBalance(annualContrib, year) {
  if (year <= 0) return 0;
  return annualContrib * (Math.pow(1.06, year) - 1) / 0.06;
}

// Column A: annual dividend income from currently-held worker equity (all three tiers).
function psuDividendPerFiler(bracketIndex, year) {
  const [t1, t2, t3] = TIER_DIST[bracketIndex];

  // Tier 1: $1K/yr into sectoral fund; fund pays 3.5% of accumulated balance annually
  const t1Balance = sectoralFundBalance(1000, year);
  const t1Income  = t1Balance * PSU_YIELD;

  // Tier 2: company routes phantom equity dividends to sectoral fund each year
  const t2Balance = sectoralFundBalance(TIER2_PHANTOM_EQ[bracketIndex] * PSU_YIELD, year);
  const t2Income  = t2Balance * PSU_YIELD;

  // Tier 3: PSU stake ramps to 20% ownership by Year 5, then appreciates with company EV.
  // After ramp, PSU value = issuance_value × (1 + EV_GROWTH)^(years_since_ramp).
  const t3Ramp   = Math.min(1, year / 5);
  const t3Apprec = year > 5 ? Math.pow(1 + EV_GROWTH, year - 5) : 1;
  const t3Income = TIER3_PSU_EQ[bracketIndex] * t3Ramp * t3Apprec * PSU_YIELD;

  return (t1 * t1Income + t2 * t2Income + t3 * t3Income) * PARTTIME_FTE[bracketIndex];
}

// Column B: annualized wealth event from PSU cashout when a worker changes jobs.
// Workers change jobs every AVG_TENURE years on average (BLS).  At departure, their
// PSU/phantom equity stake is redeemed at FMV, which has appreciated at EV_GROWTH
// over their tenure.  Annualized = (stake at departure) ÷ AVG_TENURE.
// Tier 1 sectoral fund is PORTABLE — no cashout event; excluded here.
function psuCashoutPerFiler(bracketIndex, year) {
  const [, t2, t3] = TIER_DIST[bracketIndex];
  const tenureGrowth = Math.pow(1 + EV_GROWTH, AVG_TENURE);  // EV appreciation over one job stint

  // Tier 2: phantom equity stake appreciated over avg tenure, then cashed out
  const t2Cashout = TIER2_PHANTOM_EQ[bracketIndex] * tenureGrowth / AVG_TENURE;

  // Tier 3: PSU stake at current ramp level, appreciated over avg tenure, then cashed out
  const t3Ramp    = Math.min(1, year / 5);
  const t3Cashout = TIER3_PSU_EQ[bracketIndex] * t3Ramp * tenureGrowth / AVG_TENURE;

  return (t2 * t2Cashout + t3 * t3Cashout) * PARTTIME_FTE[bracketIndex];
}

// Universal per-capita prebate — paid to every American (man, woman, child) annually.
// Core redistributionary mechanism: makes the VAT progressive by pre-refunding
// the expected consumption tax burden at the poverty line.
// $5,000/person/year in real 2024 dollars, paid regardless of income or employment.
const PREBATE_PER_PERSON = 5000;

// ============================================================
// AMCF CASH FLOW  (dynamic — floats with equity × payout yield)
// Anchor points from Sim-6 validated base case (LVT 10% + VAT 4%)
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
    const avgInc = b.agi / b.filers;
    const sd = b.jFrac * stdJ + (1 - b.jFrac) * stdS;
    const midBase = Math.max(0, Math.min(avgInc, 1e6) - sd);
    const topBase = Math.max(0, avgInc - 1e6);
    const rawPerFiler = mR * midBase + tR * topBase;
    const eff = rawPerFiler / Math.max(avgInc, 1);
    const eti = avgInc > 1e6 ? etiT : etiM;
    const bFactor = Math.pow(Math.max(0.10, 1 - eff) / Math.max(0.10, 1 - b.effCL), eti);
    const adj = rawPerFiler * b.filers * bFactor;
    total += adj;
    return { ...b, avgInc, sd, rawPerFiler, eff, bFactor, adj };
  });
  return { total, details };
}

// ============================================================
// FULL ACCORD DISTRIBUTIONAL ENGINE
// ============================================================
function computeAccordDistrib(mR, tR, stdS, stdJ, vatRate, lvtRate, etiM, etiT, amcfPerCap, year) {
  return BRACKETS.map((b, i) => {
    const avgInc = b.agi / b.filers;
    const clTax = b.effCL * avgInc;

    // New income tax (ETI-adjusted per filer)
    const sd = b.jFrac * stdJ + (1 - b.jFrac) * stdS;
    const midBase = Math.max(0, Math.min(avgInc, 1e6) - sd);
    const topBase = Math.max(0, avgInc - 1e6);
    const rawNewTax = mR * midBase + tR * topBase;
    const eff = rawNewTax / Math.max(avgInc, 1);
    const eti = avgInc > 1e6 ? etiT : etiM;
    const bFactor = Math.pow(Math.max(0.10, 1 - eff) / Math.max(0.10, 1 - b.effCL), eti);
    const newTax = rawNewTax * bFactor;

    // VAT burden (Accord 4%, Prior Accord 10%)
    const vatNew = vatRate * b.cRat * avgInc;
    const vatPrior = 0.10 * b.cRat * avgInc;

    // Universal prebate: $5,000/person/year × household size, paid to every American
    const prebate = PREBATE_PER_PERSON * b.hhSz;

    // AMCF dividend: per-capita investment return from AMCF equity × payout yield
    // Adults only; children's AMCF is custodial (locked until 18)
    const amcfBenefit = amcfPerCap * Math.min(b.hhSz, 2);

    // Total cash benefits from the Accord
    const totalBenefits = prebate + amcfBenefit;

    // LVT net burden scaled by current lvtRate vs base 10%
    const lvtBurden = LVT_NET_BASE[i] * (lvtRate / 0.10);

    // Carbon: $100/ton, 80% returned as equal per-capita dividend
    const carbonPaid = CARBON_TONS[i] * 100;
    const carbonDividend = (5e9 * 100 * 0.80 / TOTAL_POP) * b.hhSz;
    const carbonNet = carbonPaid - carbonDividend;

    // LVT for Prior Accord is always 3% — fixed, not slider-dependent
    const lvtBurdenPrior = LVT_NET_BASE[i] * (0.03 / 0.10);

    // Worker equity — same in both Accord designs; toggled on/off in display
    // Column A: ongoing dividend income from held stakes
    // Column B: annualized cashout wealth event at job change (Tier 2 + 3 only)
    const psuDividend = psuDividendPerFiler(i, year);
    const psuCashout  = psuCashoutPerFiler(i, year);

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

// ============================================================
// COMPONENT
// ============================================================
export default function IncomeTaxSimulation() {
  const [activeTab, setActiveTab] = useState(0);
  const [midRate, setMidRate] = useState(0.25);
  const [topRate, setTopRate] = useState(0.50);
  const [etiScenario, setEtiScenario] = useState('low');
  const [stdS, setStdS] = useState(30000);
  const [vatRate, setVatRate] = useState(0.04);
  const [lvtRate, setLvtRate] = useState(0.10);
  const [cgScenario, setCgScenario] = useState('unified');
  const [snapshotYear, setSnapshotYear] = useState(10);
  const [showPSU, setShowPSU] = useState(false);

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

  // Apply PSU offset to deltas when toggle is on (dividends + annualized cashout)
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

  // Styles
  const card = { background: '#fff', borderRadius: 8, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
  const tabBtn = (id) => ({
    padding: '8px 14px', cursor: 'pointer', border: 'none', background: 'none', fontSize: 12,
    borderBottom: activeTab === id ? '2px solid #2563eb' : '2px solid transparent',
    color: activeTab === id ? '#2563eb' : '#6b7280',
    fontWeight: activeTab === id ? 700 : 400,
  });
  const metBox = (label, val, sub, hi) => (
    <div style={{ background: hi ? '#eff6ff' : '#f9fafb', borderRadius: 8, padding: '12px 16px', border: `1px solid ${hi ? '#bfdbfe' : '#e5e7eb'}` }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: hi ? '#1d4ed8' : '#111' }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const TABS = [
    'Rate Optimizer', 'Revenue Heat Map', 'Income Tax Distributional',
    'Full Accord Table', 'Std Deduction Sensitivity', 'Capital Gains Scenarios',
  ];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f3f4f6', minHeight: '100vh', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 4 }}>
          Income Tax Design
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
          Zero-deduction two-rate income tax with unified capital gains. Standard deduction: ${stdS.toLocaleString()} single / ${stdJ.toLocaleString()} joint. No itemized deductions. All income taxed equally.
        </p>

        {/* Global controls */}
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Middle Rate (≤$1M income)</div>
            <input type="range" min={0.18} max={0.30} step={0.01} value={midRate}
              onChange={e => setMidRate(+e.target.value)} style={{ width: '100%' }} />
            <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{fmtPct(midRate)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Top Rate (>$1M income)</div>
            <input type="range" min={0.35} max={0.60} step={0.01} value={topRate}
              onChange={e => setTopRate(+e.target.value)} style={{ width: '100%' }} />
            <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{fmtPct(topRate)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Standard Deduction (single)</div>
            <input type="range" min={20000} max={50000} step={5000} value={stdS}
              onChange={e => setStdS(+e.target.value)} style={{ width: '100%' }} />
            <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>${(stdS / 1000).toFixed(0)}K</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>ETI Scenario</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['low', 'Low (0.15)', 'No deductions, CG unified'], ['moderate', 'Mod (0.30)', 'Standard avoidance']].map(([k, lbl, note]) => (
                <button key={k} onClick={() => setEtiScenario(k)}
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontSize: 11,
                    background: etiScenario === k ? '#2563eb' : '#fff',
                    color: etiScenario === k ? '#fff' : '#374151',
                    borderColor: etiScenario === k ? '#2563eb' : '#d1d5db', fontWeight: 600 }}>
                  {lbl}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
              {etiScenario === 'low' ? 'No deductions, unified CG, loopholes closed' : 'Standard behavioral response'}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          {metBox('Income Tax Revenue', fmt(revenue.total, 2), `ETI-adjusted | ${fmtPct(revenue.total / 28.7e12)} of GDP`, true)}
          {metBox('vs Current Law', `${revenue.total >= CL_REVENUE ? '+' : ''}${fmt(revenue.total - CL_REVENUE, 2)}`, 'CL baseline: $2.39T', revenue.total > CL_REVENUE)}
          {metBox('Sweet Spot (25/50)', fmt(sweetRev, 2), `+${fmt(sweetRev - CL_REVENUE, 0)} vs CL`, false)}
          {metBox('Optimal (30/60)', fmt(optRev, 2), `+${fmt(optRev - CL_REVENUE, 0)} vs CL`, false)}
          {metBox('Households Better Off', `${betterOffPct}%`, `${(betterOffFilers / 1e6).toFixed(0)}M of ${(totalFilers / 1e6).toFixed(0)}M filers`, +betterOffPct > 90)}
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 20, display: 'flex', overflowX: 'auto' }}>
          {TABS.map((label, id) => (
            <button key={id} style={tabBtn(id)} onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </div>

        {/* ===== TAB 0: RATE OPTIMIZER ===== */}
        {activeTab === 0 && (
          <div>
            <div style={card}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Revenue by Income Bracket</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenue.details.map(d => ({
                  name: d.label,
                  newRev: +(d.adj / 1e9).toFixed(1),
                  clRev: +(d.effCL * d.avgInc * d.filers / 1e9).toFixed(1),
                }))} margin={{ left: 20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={65} tick={{ fontSize: 10 }} />
                  <YAxis label={{ value: 'Revenue ($B)', angle: -90, position: 'insideLeft', fontSize: 11 }} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n) => [`$${v.toFixed(0)}B`, n]} />
                  <Legend />
                  <Bar dataKey="clRev" name="Current Law" fill="#d1d5db" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="newRev" name="New Two-Rate" radius={[3, 3, 0, 0]}>
                    {revenue.details.map((d, i) => (
                      <Cell key={i} fill={d.avgInc > 1e6 ? '#dc2626' : d.avgInc > 5e4 ? '#2563eb' : '#60a5fa'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={card}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Design Parameters</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {[
                      ['Middle Rate', fmtPct(midRate), 'Income $stdDed–$1M, unified with CG'],
                      ['Top Rate', fmtPct(topRate), 'Income above $1M, unified with CG'],
                      ['Standard Deduction', `$${stdS.toLocaleString()} / $${stdJ.toLocaleString()}`, 'Single / Joint — only deduction'],
                      ['ETI (top brackets)', etiScenario === 'low' ? '0.15' : '0.30', etiScenario === 'low' ? 'Accord-specific: CG unified, loopholes closed' : 'Conventional estimate'],
                      ['ETI (middle brackets)', '0.20', 'Both scenarios'],
                      ['Capital Gains', 'Ordinary rates', 'No preferential treatment'],
                      ['Deductions', 'Standard only', 'No mortgage, charity, SALT, etc.'],
                    ].map(([k, v, note]) => (
                      <tr key={k} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '6px 0', color: '#6b7280', width: '35%' }}>{k}</td>
                        <td style={{ padding: '6px 4px', fontWeight: 700 }}>{v}</td>
                        <td style={{ padding: '6px 0', color: '#9ca3af', fontSize: 11 }}>{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={card}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Revenue Benchmarks</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {[
                      ['Current Law', CL_REVENUE, 0, false],
                      ['Prior Accord (same income tax)', CL_REVENUE, 0, false],
                      ['Sweet Spot (25% / 50%)', sweetRev, sweetRev - CL_REVENUE, false],
                      ['Optimal (30% / 60%)', optRev, optRev - CL_REVENUE, false],
                      ['Current selection', revenue.total, revenue.total - CL_REVENUE, true],
                    ].map(([k, rev, vs, hi]) => (
                      <tr key={k} style={{ borderBottom: '1px solid #f3f4f6', background: hi ? '#eff6ff' : 'transparent' }}>
                        <td style={{ padding: '7px 4px', fontWeight: hi ? 700 : 400 }}>{k}</td>
                        <td style={{ padding: '7px 4px', fontWeight: 700 }}>{fmt(rev, 2)}</td>
                        <td style={{ padding: '7px 4px', color: vs > 0 ? '#059669' : vs < 0 ? '#dc2626' : '#9ca3af', fontSize: 12 }}>
                          {vs > 0 ? '+' : ''}{vs !== 0 ? fmt(vs, 2) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
                  Revenue increases monotonically across the tested range. Laffer peak at ~83% (ETI=0.20). Sweet spot 25/50 chosen for distributional fairness — $75–200K bracket stays better off vs prior Accord when VAT cut (10%→4%) is included.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 1: HEAT MAP ===== */}
        {activeTab === 1 && (
          <div style={card}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>Revenue Heat Map — 13×26 Grid</h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Revenue in $T. Green = higher. <strong>*</strong> = beats Current Law ($2.39T). ETI: middle 0.20 / top {etiScenario === 'low' ? '0.15' : '0.30'}.
              Std deduction: ${stdS.toLocaleString()} single.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#374151' }}>Mid↓ Top→</th>
                    {heatMap[0].cells.map(c => (
                      <th key={c.tR} style={{ padding: '3px 4px', textAlign: 'center', fontWeight: 600, color: '#374151', minWidth: 40 }}>
                        {Math.round(c.tR * 100)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatMap.map(row => (
                    <tr key={row.mR}>
                      <td style={{ padding: '3px 10px', fontWeight: 700, color: '#374151', textAlign: 'right' }}>
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
            <div style={{ marginTop: 12, fontSize: 11, color: '#6b7280' }}>
              * = meets or exceeds Current Law baseline. Yellow cell = current slider selection. All cells in this grid beat CL — even 18% / 35% produces more revenue than current law due to base-broadening (CG unification, no deductions).
            </div>
          </div>
        )}

        {/* ===== TAB 2: INCOME TAX DISTRIBUTIONAL ===== */}
        {activeTab === 2 && (
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>
              Income Tax Change by Bracket — New Two-Rate vs Current Law
            </h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Key insight: marginal rates fall for most brackets, but effective rates can rise because deductions are eliminated and capital gains are unified with ordinary income.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                    {[
                      'Bracket', 'Avg Income', 'Filers',
                      'CL Marginal', 'New Marginal', 'Marginal Δ',
                      'CL Effective', 'New Effective', 'Effective Δ',
                      'Income Tax Δ/yr', 'ETI Factor', 'Note'
                    ].map((h, i) => (
                      <th key={h} style={{
                        padding: '8px 8px', textAlign: i > 2 ? 'right' : 'left',
                        fontWeight: 700, fontSize: 11,
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
                    const bg = paradox ? '#fef3c7' : warn ? '#fff7ed' : i % 2 === 0 ? '#fff' : '#fafafa';

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: bg }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e3a5f' }}>{d.label}</td>
                        <td style={{ padding: '6px 8px' }}>${(d.avgInc / 1000).toFixed(0)}K</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280' }}>{(d.filers / 1e6).toFixed(1)}M</td>
                        {/* Marginal rates */}
                        <td style={{ padding: '6px 8px', textAlign: 'right', background: '#f9fafb' }}>{fmtPct(clMarginal)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, background: '#f9fafb',
                          color: newMarginal < clMarginal ? '#059669' : newMarginal > clMarginal ? '#dc2626' : '#374151' }}>
                          {fmtPct(newMarginal)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', background: '#f9fafb',
                          color: marginalDelta < 0 ? '#059669' : marginalDelta > 0 ? '#dc2626' : '#6b7280', fontWeight: 700 }}>
                          {marginalDelta > 0 ? '+' : ''}{fmtPct(marginalDelta)}
                        </td>
                        {/* Effective rates */}
                        <td style={{ padding: '6px 8px', textAlign: 'right', background: '#eff6ff' }}>{fmtPct(d.effCL)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, background: '#eff6ff',
                          color: d.eff > d.effCL ? '#dc2626' : '#059669' }}>{fmtPct(d.eff)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, background: '#eff6ff',
                          color: effectiveDelta > 0.005 ? '#dc2626' : effectiveDelta < -0.005 ? '#059669' : '#6b7280' }}>
                          {effectiveDelta > 0 ? '+' : ''}{fmtPct(effectiveDelta)}
                        </td>
                        {/* Tax delta */}
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: delta > 0 ? '#dc2626' : '#059669', fontWeight: 700 }}>
                          {delta > 0 ? '+' : ''}{fmt(delta, 0)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#9ca3af' }}>{d.bFactor.toFixed(3)}</td>
                        <td style={{ padding: '6px 8px', fontSize: 11 }}>
                          {paradox
                            ? <span style={{ color: '#d97706', fontWeight: 700 }}>⚠ Marginal↓ Effective↑</span>
                            : delta < -100
                              ? <span style={{ color: '#059669', fontWeight: 700 }}>Lower bill</span>
                              : delta > 500
                                ? <span style={{ color: '#dc2626', fontWeight: 700 }}>Higher bill</span>
                                : <span style={{ color: '#6b7280' }}>≈ Same</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
              <strong>⚠ "Marginal↓ Effective↑" paradox</strong> (highlighted rows): These brackets see their top marginal rate fall under the new system, yet pay more income tax overall. Cause: (1) itemized deductions eliminated — taxable base widens; (2) capital gains taxed at ordinary rates instead of 15–20% preferential rates. A high earner at $680K faces 25% on nearly all income vs. 17.5% blended effective rate under current law (which reflected deductions + CG preference). The lower marginal rate doesn't compensate for the wider base.
            </div>
          </div>
        )}

        {/* ===== TAB 3: FULL ACCORD TABLE ===== */}
        {activeTab === 3 && (
          <div>
            <div style={card}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>Full Accord Distributional Analysis — Primary Deliverable</h3>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                Complete per-household impact vs Current Law. Prior Accord income tax: +4% ordinary above $75K, +8% above $1M, CG at 0%/20%/ordinary (§4.1+§4.3), deductions preserved. New Accord: flat two-rate, all CG unified, no deductions.
              </p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>VAT Rate: {fmtPct(vatRate)}</div>
                  <input type="range" min={0} max={0.15} step={0.01} value={vatRate}
                    onChange={e => setVatRate(+e.target.value)} style={{ width: 130 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>LVT Rate: {fmtPct(lvtRate)}</div>
                  <input type="range" min={0} max={0.20} step={0.01} value={lvtRate}
                    onChange={e => setLvtRate(+e.target.value)} style={{ width: 130 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Snapshot Year: {snapshotYear}</div>
                  <input type="range" min={1} max={35} step={1} value={snapshotYear}
                    onChange={e => setSnapshotYear(+e.target.value)} style={{ width: 130 }} />
                </div>
                {/* AMCF stats derived from equity × combined yield — not a free parameter */}
                <div style={{ padding: '8px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12, lineHeight: 1.8 }}>
                  <strong>AMCF at Year {snapshotYear}</strong><br />
                  Equity: <strong>{fmt(amcfEquity, 1)}</strong><br />
                  Yield: <strong>{fmtPct(amcfYield)}</strong> (3.63%→6.0% by Yr 15)<br />
                  Cash flow: <strong>{fmt(amcfCashFlow, 0)}/yr</strong><br />
                  Dividend: <strong>${Math.round(amcfPerCap).toLocaleString()}/person/yr</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Worker Equity</div>
                  <button onClick={() => setShowPSU(s => !s)} style={{
                    padding: '8px 16px', borderRadius: 6, border: '2px solid', cursor: 'pointer',
                    fontWeight: 700, fontSize: 12,
                    background: showPSU ? '#14532d' : '#fff',
                    color: showPSU ? '#fff' : '#374151',
                    borderColor: showPSU ? '#14532d' : '#d1d5db',
                  }}>
                    {showPSU ? '✓ Equity On' : 'Equity Off'}
                  </button>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, maxWidth: 110 }}>
                    {showPSU ? 'Dividends + annualized cashout by bracket' : 'Toggle to add PSU dividends + cashout columns'}
                  </div>
                </div>
              </div>
            </div>

            {/* ---- COMPARISON SUMMARY: Prior Accord vs New Accord ---- */}
            <div style={card}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700 }}>
                Prior Accord vs New Two-Rate System — Head-to-Head
              </h4>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>
                Both designs include the <strong>${PREBATE_PER_PERSON.toLocaleString()}/person/yr universal prebate</strong> — it cancels in the head-to-head column but dominates benefits for lower-income households vs Current Law.
                <strong> Prior Accord (§4.1 + §4.3):</strong> 7-bracket structure retained + ordinary rates +4% above $75K median / +8% above $1M + CG at 0%/20%/ordinary + all deductions kept + 10% VAT + 3% LVT + prebate + AMCF.
                <strong> New Accord:</strong> {Math.round(midRate*100)}%/{Math.round(topRate*100)}% flat two-rate + all CG unified + no deductions + {fmtPct(vatRate)} VAT + {fmtPct(lvtRate)} LVT + carbon + prebate + AMCF.
                Year {snapshotYear} AMCF: ${Math.round(amcfPerCap).toLocaleString()}/person.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#374151', color: '#fff' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700 }}>Bracket</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>Avg Income</th>
                      {showPSU && <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, background: '#14532d' }}>PSU Div</th>}
                      {showPSU && <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, background: '#166534' }}>Cashout (ann.)</th>}
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, background: '#4b5563' }}>Prior Accord Δ vs CL</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, background: '#1e3a5f' }}>New Accord Δ vs CL</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, background: '#1a5276' }}>New vs Prior</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distribDisplay.map((d, i) => {
                      const betterVsPrior = d.deltaNewVsPrior < -100;
                      const worseVsPrior  = d.deltaNewVsPrior >  100;
                      const bg = betterVsPrior ? (i%2===0 ? '#f0fdf4' : '#ecfdf5')
                               : worseVsPrior  ? (i%2===0 ? '#fef2f2' : '#fef2f2')
                               : (i%2===0 ? '#fff' : '#fafafa');
                      const dPrior = d.deltaPriorWithPSU;
                      const dNew   = d.deltaWithPSU;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: bg }}>
                          <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1e3a5f' }}>{d.label}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7280' }}>${(d.avgInc/1000).toFixed(0)}K</td>
                          {showPSU && (
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#f0fdf4' }}>
                              −{fmt(d.psuDividend, 0)}
                            </td>
                          )}
                          {showPSU && (
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#ecfdf5' }}>
                              −{fmt(d.psuCashout, 0)}
                            </td>
                          )}
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, background: '#f9fafb',
                            color: dPrior < 0 ? '#059669' : '#dc2626' }}>
                            {dPrior < 0 ? '−' : '+'}{fmt(Math.abs(dPrior), 0)}
                            <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({dPrior < 0 ? '−' : '+'}{Math.abs(d.deltaPriorPct).toFixed(1)}%)</span>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, background: '#f0f9ff',
                            color: dNew < 0 ? '#059669' : '#dc2626' }}>
                            {dNew < 0 ? '−' : '+'}{fmt(Math.abs(dNew), 0)}
                            <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>({dNew < 0 ? '−' : '+'}{Math.abs(d.deltaPct).toFixed(1)}%)</span>
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, background: '#f5f3ff',
                            color: d.deltaNewVsPrior < 0 ? '#059669' : d.deltaNewVsPrior > 0 ? '#dc2626' : '#6b7280' }}>
                            {d.deltaNewVsPrior < 0 ? '−' : d.deltaNewVsPrior > 0 ? '+' : ''}{fmt(Math.abs(d.deltaNewVsPrior), 0)}
                          </td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>
                            {betterVsPrior
                              ? <span style={{ color: '#059669' }}>✓ New better</span>
                              : worseVsPrior
                                ? <span style={{ color: '#dc2626' }}>✗ Prior better</span>
                                : <span style={{ color: '#6b7280' }}>≈ Similar</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {showPSU && (
                <div style={{ marginTop: 10, padding: '8px 14px', background: '#f0fdf4', borderRadius: 6, fontSize: 11, color: '#166534' }}>
                  Worker equity is identical in both Accord designs — shifts both "Prior Δ" and "New Δ" equally, so "New vs Prior" is unaffected by the toggle. <strong>PSU Div:</strong> annual income from held stakes (Tier 1 sectoral fund dividends + Tier 2 phantom-equity fund dividends + Tier 3 PSU dividends at 3.5% yield). Tier 3 PSU values appreciate at 7.5%/yr after Year 5 ramp. <strong>Cashout (ann.):</strong> wealth event when worker changes jobs — PSU/phantom equity redeemed at FMV (7.5% appreciation over ~4.1-year avg tenure), annualized as value ÷ tenure. This is a wealth transfer, not take-home pay — typically reinvested or used for a down payment. Tier 1 sectoral fund is portable: no cashout event.
                </div>
              )}
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {(() => {
                  const priorBetter    = distribDisplay.filter(d => d.priorBetterOff).reduce((s,d) => s+d.filers, 0);
                  const newBetter      = distribDisplay.filter(d => d.betterOff).reduce((s,d) => s+d.filers, 0);
                  const newWinsBrackets = distribDisplay.filter(d => d.deltaNewVsPrior < -100).reduce((s,d) => s+d.filers, 0);
                  return [
                    metBox('Prior Accord better off vs CL', `${(priorBetter/totalFilers*100).toFixed(1)}%`, `${(priorBetter/1e6).toFixed(0)}M filers${showPSU ? ' (incl. PSU)' : ''}`, false),
                    metBox('New Accord better off vs CL', `${(newBetter/totalFilers*100).toFixed(1)}%`, `${(newBetter/1e6).toFixed(0)}M filers${showPSU ? ' (incl. PSU)' : ''}`, newBetter > priorBetter),
                    metBox('New beats Prior (head-to-head)', `${(newWinsBrackets/totalFilers*100).toFixed(1)}%`, 'PSU cancels — not affected by toggle', newWinsBrackets > totalFilers * 0.5),
                  ];
                })()}
              </div>
            </div>

            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                      {[
                        'Bracket', 'Avg Inc', 'Filers',
                        'CL Tax', 'New Inc Tax', 'ΔInc Tax',
                        'VAT Burden', 'LVT Net', 'Carbon Net',
                        'Prebate', 'AMCF Div',
                        ...(showPSU ? ['PSU Div', 'Cashout (ann.)'] : []),
                        'NET Δ vs CL', '% Income', 'Status'
                      ].map((h, i) => (
                        <th key={i} style={{ padding: '8px 8px', textAlign: i > 2 ? 'right' : 'left', fontWeight: 700, fontSize: 11,
                          background: h === 'Prebate' ? '#14532d' : h === 'PSU Div' ? '#14532d' : h === 'Cashout (ann.)' ? '#166534' : h === 'NET Δ vs CL' ? '#1a5276' : undefined,
                          color: '#fff' }}>
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
                        ? i % 2 === 0 ? '#f0fdf4' : '#ecfdf5'
                        : warn ? '#fef9c3' : '#fef2f2';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: bg }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e3a5f' }}>{d.label}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'right' }}>${(d.avgInc / 1000).toFixed(0)}K</td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: '#6b7280' }}>{(d.filers / 1e6).toFixed(1)}M</td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: '#6b7280' }}>${(d.clTax / 1000).toFixed(1)}K</td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 600 }}>${(d.newTax / 1000).toFixed(1)}K</td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: incTaxDelta > 0 ? '#dc2626' : '#059669' }}>
                            {incTaxDelta > 0 ? '+' : ''}{fmt(incTaxDelta, 0)}
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: '#dc2626' }}>
                            +{fmt(d.vatNew, 0)}
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: d.lvtBurden > 0 ? '#dc2626' : '#059669' }}>
                            {d.lvtBurden > 0 ? '+' : ''}{fmt(d.lvtBurden, 0)}
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: d.carbonNet > 0 ? '#dc2626' : '#059669' }}>
                            {d.carbonNet > 0 ? '+' : ''}{fmt(d.carbonNet, 0)}
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#f0fdf4' }}>
                            −{fmt(d.prebate, 0)}
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: '#059669' }}>
                            −{fmt(d.amcfBenefit, 0)}
                          </td>
                          {showPSU && (
                            <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#f0fdf4' }}>
                              −{fmt(d.psuDividend, 0)}
                            </td>
                          )}
                          {showPSU && (
                            <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: '#059669', background: '#ecfdf5' }}>
                              −{fmt(d.psuCashout, 0)}
                            </td>
                          )}
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, background: '#f0f9ff',
                            color: d.delta < 0 ? '#059669' : '#dc2626' }}>
                            {d.delta < 0 ? '−' : '+'}{fmt(Math.abs(d.delta), 0)}
                          </td>
                          <td style={{ padding: '6px 6px', textAlign: 'right', color: d.delta < 0 ? '#059669' : '#dc2626' }}>
                            {d.delta < 0 ? '−' : '+'}{Math.abs(d.deltaPct).toFixed(1)}%
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>
                            {d.betterOff
                              ? <span style={{ color: '#059669' }}>✓ Better</span>
                              : warn
                                ? <span style={{ color: '#d97706' }}>⚠ Review</span>
                                : <span style={{ color: '#dc2626' }}>✗ Higher</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary stats */}
              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {metBox('Households Better Off', `${betterOffPct}%`, `${(betterOffFilers / 1e6).toFixed(0)}M of ${(totalFilers / 1e6).toFixed(0)}M filers`, +betterOffPct > 90)}
                {metBox('Breakeven Bracket', breakEven?.label || 'None (all better off)', 'First bracket with net cost vs CL', false)}
                {metBox('Prior Accord Result', '98.8%', 'Better off (10% VAT, same income tax, $1K AMCF)', false)}
                {metBox('Income Tax Revenue', fmt(revenue.total, 2), `+${fmt(revenue.total - CL_REVENUE, 2)} vs CL`, revenue.total > CL_REVENUE)}
              </div>

              <div style={{ marginTop: 16, padding: '12px 16px', background: '#eff6ff', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
                <strong>How to read this table:</strong> NET Δ = (New Income Tax − CL Tax) + VAT Burden + LVT Net + Carbon Net − Prebate − AMCF Dividend{showPSU ? ' − PSU Dividends − Cashout (ann.)' : ''}. <em>Cashout (ann.) is a wealth event, not income — annualized job-change PSU redemption reinvested or saved, not spent.</em> Negative = better off vs Current Law. <strong>Prebate: ${PREBATE_PER_PERSON.toLocaleString()}/person/yr × household size</strong> — universal payment to every American regardless of income, the core redistributionary mechanism that makes the consumption tax progressive. VAT at {fmtPct(vatRate)} (CL = 0%). Carbon at $100/ton, 80% returned as equal per-capita dividend. LVT net = homeowners pay LVT; renters in lower brackets get net rent relief from reduced landlord costs. AMCF dividend = {fmt(amcfEquity, 1)} equity × {fmtPct(amcfYield)} yield ÷ population = ${Math.round(amcfPerCap).toLocaleString()}/person/yr at Year {snapshotYear}.
              </div>
            </div>
          </div>
        )}

        {/* ===== TAB 4: STD DEDUCTION SENSITIVITY ===== */}
        {activeTab === 4 && (
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Standard Deduction Sensitivity</h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Revenue at fixed rates ({fmtPct(midRate)} / {fmtPct(topRate)}) across standard deduction levels.
              Joint = 2× single. Current: ${stdS.toLocaleString()} / ${stdJ.toLocaleString()}.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stdSensitivity.map(d => ({
                name: `$${(d.s / 1000).toFixed(0)}K`, rev: +(d.rev / 1e12).toFixed(3),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" />
                <YAxis domain={['auto', 'auto']} label={{ value: 'Revenue ($T)', angle: -90, position: 'insideLeft', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}T`} />
                <Tooltip formatter={v => [`$${v.toFixed(3)}T`, 'Revenue']} />
                <Bar dataKey="rev" name="Revenue" radius={[4, 4, 0, 0]}>
                  {stdSensitivity.map((d, i) => <Cell key={i} fill={d.s === stdS ? '#2563eb' : '#93c5fd'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <table style={{ width: '100%', marginTop: 20, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Std Deduction (single)', 'Joint', 'Revenue', 'vs CL', 'vs $30K baseline', 'Filers above deduction'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stdSensitivity.map((d, i) => {
                  const base30 = stdSensitivity[2].rev;
                  const filersAbove = BRACKETS.filter(b => {
                    const avgInc = b.agi / b.filers;
                    const sd = b.jFrac * (d.s * 2) + (1 - b.jFrac) * d.s;
                    return avgInc > sd;
                  }).reduce((s, b) => s + b.filers, 0);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: d.s === stdS ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 10px', fontWeight: d.s === stdS ? 700 : 400 }}>${d.s.toLocaleString()}{d.s === stdS ? ' ←' : ''}</td>
                      <td style={{ padding: '8px 10px' }}>${(d.s * 2).toLocaleString()}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(d.rev, 3)}</td>
                      <td style={{ padding: '8px 10px', color: d.rev >= CL_REVENUE ? '#059669' : '#dc2626' }}>
                        {d.rev >= CL_REVENUE ? '+' : ''}{fmt(d.rev - CL_REVENUE, 0)}
                      </td>
                      <td style={{ padding: '8px 10px', color: d.rev >= base30 ? '#059669' : '#dc2626' }}>
                        {d.rev >= base30 ? '+' : ''}{fmt(d.rev - base30, 0)}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>{(filersAbove / 1e6).toFixed(0)}M</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 12 }}>
              <strong>$30K standard deduction</strong> fully exempts households below ~median income from income tax exposure and generates +{fmt(stdSensitivity[2].rev - CL_REVENUE, 0)} vs CL. Raising to $50K costs ~{fmt(stdSensitivity[2].rev - stdSensitivity[4].rev, 0)} in revenue. Lowering to $20K raises an additional ~{fmt(stdSensitivity[0].rev - stdSensitivity[2].rev, 0)}.
            </div>
          </div>
        )}

        {/* ===== TAB 5: CAPITAL GAINS SCENARIOS ===== */}
        {activeTab === 5 && (
          <div>
            <div style={card}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Capital Gains Treatment Scenarios</h3>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
                Buy-borrow-die loophole closed in all scenarios (estates recognize gains at death). Carried interest taxed as ordinary in B and C.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                {[
                  { key: 'current', label: 'A: Current Pref Rates', note: 'Long-term CG at 15%/20%. Carried interest at CG rates. Buy-borrow-die closed.', extra: 0 },
                  { key: 'pref', label: 'B: Partial Unification', note: 'Carried interest as ordinary income. Short-term CG as ordinary. Long-term CG still preferential (15%/20%).', extra: 150e9 },
                  { key: 'unified', label: 'C: Full Unification', note: 'All income (wages, CG, dividends, interest) taxed at ordinary rates. Highest ETI sensitivity. ~$585B extra.', extra: 585e9 },
                ].map(sc => (
                  <button key={sc.key} onClick={() => setCgScenario(sc.key)}
                    style={{ padding: 16, borderRadius: 8, border: '2px solid', cursor: 'pointer', textAlign: 'left',
                      background: cgScenario === sc.key ? '#eff6ff' : '#fff',
                      borderColor: cgScenario === sc.key ? '#2563eb' : '#e5e7eb' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{sc.label}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12 }}>{sc.note}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{fmt(revenue.total + sc.extra, 2)}</div>
                    <div style={{ fontSize: 12, color: sc.extra > 0 ? '#059669' : '#9ca3af' }}>
                      {sc.extra > 0 ? `+${fmt(sc.extra, 0)} CG premium` : 'No CG uplift'}
                    </div>
                  </button>
                ))}
              </div>

              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Capital Gains by Bracket — Revenue Impact of Full Unification vs Pref Rates</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Bracket', 'CG % of Income', 'CG per Filer', 'Rate A (pref)', 'Rate B (partial)', 'Rate C (unified)', 'Extra Rev C−A'].map(h => (
                        <th key={h} style={{ padding: '8px 8px', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textAlign: 'left' }}>{h}</th>
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
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6',
                          background: b.cgShare > 0.20 ? '#fef3c7' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{b.label}</td>
                          <td style={{ padding: '6px 8px' }}>{(b.cgShare * 100).toFixed(0)}%</td>
                          <td style={{ padding: '6px 8px' }}>${(cgAmt / 1000).toFixed(0)}K</td>
                          <td style={{ padding: '6px 8px' }}>{(rateA * 100).toFixed(0)}%</td>
                          <td style={{ padding: '6px 8px' }}>{(rateB * 100).toFixed(0)}%</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#2563eb' }}>{(rateC * 100).toFixed(0)}%</td>
                          <td style={{ padding: '6px 8px', color: extraRev > 1e9 ? '#059669' : '#9ca3af', fontWeight: extraRev > 50e9 ? 700 : 400 }}>
                            {extraRev > 1e9 ? `+${fmt(extraRev, 0)}` : '< $1B'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 6, fontSize: 12 }}>
                <strong>Full unification premium: ~$585B/year.</strong> 85%+ of the gain comes from the top 3 brackets ($2M+), where CG makes up 35–56% of income. At $100K–$1M, the CG share is only 4–15%, so the per-bracket CG uplift is modest. The $585B figure is the single largest lever in the income tax reform — larger than eliminating itemized deductions alone.
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
