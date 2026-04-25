// simulation-10-dashboard.jsx
// American Ownership Accord — Interactive Visualization Dashboard
// 9-chart suite: income, wealth, inequality, tax rates, and crossover analysis over 30 years
// All values in 2024 real (inflation-adjusted) dollars

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, ComposedChart, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Cell
} from 'recharts';

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  DEMOGRAPHIC DATA  (CBO + Federal Reserve SCF, 2024 calibration)         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// taxChg: income tax reform delta from Sim-8 two-rate formula (mR=25%/tR=50%, ETI-adjusted, stdDed $30K/$60K)
//   positive = net tax BURDEN (reduces income), negative = net tax RELIEF
//   B10-P50: relief (std ded shelters low incomes; 25% < current effective rates up to ~$80K)
//   P60+: burden (25% on income above std ded exceeds current marginal rates)
// accordNWG: NW growth rate under Accord (Growth Tax + cap-gains rate reduces compounding)
// accordIncG: after-tax income growth rate under Accord (capital-income demos only)
// Income: CBO Distribution of Household Income 2022, 2024-adjusted
// Wealth: Federal Reserve SCF 2022 mean by percentile band
const DEMOS = {
  B10:  { label:'P0–P10',   short:'B10',  color:'#ef4444',
    income:14500,   nw:-2000,   incG:0.005, nwG:0.005,  accordNWG:0.005,
    hhSz:1.8,  save:0.05, ret:0.04, consume:0.98,
    taxChg:-145,   lvt:0,      homePct:0,    k401Pct:0.05, finPct:0,    bizPct:0    }, // std ded > income → 0 new tax; CL rate ≈0
  P10:  { label:'P10–P20',  short:'P10',  color:'#f97316',
    income:28000,   nw:7000,    incG:0.008, nwG:0.040,  accordNWG:0.040,
    hhSz:2.1,  save:0.05, ret:0.04, consume:0.95,
    taxChg:-1540,  lvt:200,    homePct:0.20, k401Pct:0.15, finPct:0.05, bizPct:0    }, // std ded ($39.6K) > income → 0 new tax; full CL relief
  P20:  { label:'P20–P30',  short:'P20',  color:'#fb923c',
    income:40000,   nw:26000,   incG:0.010, nwG:0.020,  accordNWG:0.020,
    hhSz:2.2,  save:0.10, ret:0.04, consume:0.90,
    taxChg:-3400,  lvt:500,    homePct:0.35, k401Pct:0.20, finPct:0.08, bizPct:0.03 }, // std ded ($41.4K) > income → 0 new tax; full CL relief
  P30:  { label:'P30–P40',  short:'P30',  color:'#fbbf24',
    income:52000,   nw:58000,   incG:0.013, nwG:0.028,  accordNWG:0.028,
    hhSz:2.3,  save:0.12, ret:0.05, consume:0.87,
    taxChg:-1751,  lvt:1000,   homePct:0.45, k401Pct:0.25, finPct:0.12, bizPct:0.06 }, // 25% on $10.6K taxable < CL 8.5% effective
  P40:  { label:'P40–P50',  short:'P40',  color:'#84cc16',
    income:64000,   nw:95000,   incG:0.013, nwG:0.030,  accordNWG:0.030,
    hhSz:2.4,  save:0.15, ret:0.05, consume:0.85,
    taxChg:-1659,  lvt:1000,   homePct:0.50, k401Pct:0.28, finPct:0.10, bizPct:0.05 }, // 25% on $21.4K taxable < CL 11% effective
  P50:  { label:'P50–P60',  short:'P50',  color:'#22c55e',
    income:79000,   nw:148000,  incG:0.015, nwG:0.038,  accordNWG:0.038,
    hhSz:2.5,  save:0.17, ret:0.05, consume:0.82,
    taxChg:-1048,  lvt:1800,   homePct:0.52, k401Pct:0.32, finPct:0.12, bizPct:0.06 }, // 25% on $35.2K taxable < CL 12.5% effective
  P60:  { label:'P60–P70',  short:'P60',  color:'#10b981',
    income:97000,   nw:228000,  incG:0.018, nwG:0.040,  accordNWG:0.040,
    hhSz:2.5,  save:0.20, ret:0.06, consume:0.80,
    taxChg:1138,   lvt:2500,   homePct:0.50, k401Pct:0.30, finPct:0.13, bizPct:0.08 }, // 25% on $53.2K taxable slightly > CL 12.5% effective
  P70:  { label:'P70–P80',  short:'P70',  color:'#06b6d4',
    income:124000,  nw:380000,  incG:0.022, nwG:0.050,  accordNWG:0.050,
    hhSz:2.5,  save:0.22, ret:0.06, consume:0.77,
    taxChg:2180,   lvt:4000,   homePct:0.47, k401Pct:0.30, finPct:0.17, bizPct:0.12 },
  P80:  { label:'P80–P90',  short:'P80',  color:'#3b82f6',
    income:186000,  nw:750000,  incG:0.028, nwG:0.058,  accordNWG:0.058,
    hhSz:2.5,  save:0.25, ret:0.06, consume:0.60,
    taxChg:6307,   lvt:7000,   homePct:0.35, k401Pct:0.25, finPct:0.25, bizPct:0.15 },
  T10:  { label:'P90–P99',  short:'T10',  color:'#8b5cf6',
    income:320000,  nw:2700000, incG:0.035, nwG:0.065,  accordNWG:0.063,
    // ETR now model-derived from Sim-2 distributional engine (VAT+LVT+carbon+income reform)
    hhSz:2.3,  save:0.40, ret:0.07, consume:0.45,
    taxChg:14665,  lvt:12000,  homePct:0.25, k401Pct:0.20, finPct:0.35, bizPct:0.20 },
  T1:   { label:'P99–P99.9',short:'T1',   color:'#ec4899',
    income:1500000, nw:16700000,incG:0.045, nwG:0.075,  accordNWG:0.072, accordIncG:0.022,
    // ETR now model-derived from Sim-2 distributional engine (VAT+LVT+carbon+income reform)
    hhSz:2.1,  save:0.70, ret:0.08, consume:0.25,
    taxChg:202913, lvt:50000,  homePct:0.15, k401Pct:0.15, finPct:0.40, bizPct:0.30 },
  BILL: { label:'Billionaires',short:'Bill',color:'#1d4ed8',
    income:3e8,     nw:4.7e9,   incG:0.080, nwG:0.120,  accordIncG:0.050,
    // ETR now model-derived via billionaireETR(): economic income basis (reported + unrealized)
    // Three Accord channels: income tax reform + PSU equity excise + mark-to-market phase-in
    hhSz:2.0,  save:0.85, ret:0.10, consume:0.01,
    taxChg:83691871, lvt:5e5,  homePct:0.05, k401Pct:0.05, finPct:0.30, bizPct:0.60 },
  ELON: { label:'Elon Musk', short:'Elon', color:'#334155',
    income:1e10,    nw:2.5e11,  incG:0.150, nwG:0.150,  accordIncG:0.124,
    // ETR now model-derived via billionaireETR(): economic income basis (reported + unrealized)
    hhSz:1.0,  save:0.95, ret:0.12, consume:0.001,
    taxChg:2796462204, lvt:5e6, homePct:0.02, k401Pct:0.01, finPct:0.15, bizPct:0.82 },
};
// Order = bottom-to-top percentile (important for stacked chart rendering)
const DEMO_KEYS = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];

// Population share per bracket (each true decile = 0.10; T10/T1 exclude carved-out brackets)
const POP = { B10:0.10, P10:0.10, P20:0.10, P30:0.10, P40:0.10, P50:0.10, P60:0.10, P70:0.10, P80:0.10, T10:0.09, T1:0.0094, BILL:6e-6, ELON:7.5e-9 };

// Programs replaced by the Accord prebate (per HH, 2024 dollars).
// CBO income already includes these transfers — PRE toggle nets them out.
// SNAP ~$110B, EITC ~$70B, CTC ~$120B, TANF ~$16B, WIC ~$6B → ~$322B total
// Aggregate check: Σ(PROG_LOST[k] × POP[k]) × 133M HH ≈ $319B ✓
const PROG_LOST = {
  B10: 5500,  // SNAP $2500 + EITC $1000 + CTC $800 + TANF $1000 + WIC $200
  P10: 5500,  // SNAP $600  + EITC $2500 + CTC $2200 + TANF $100  + WIC $100
  P20: 3200,  // EITC $800  + CTC $2200  + SNAP $200
  P30: 2200,  // EITC $100  + CTC $2100
  P40: 1800,  // CTC $1800
  P50: 1800,  // CTC $1800
  P60: 1400,  // CTC $1400
  P70: 1300,  // CTC $1300
  P80:  900,  // CTC $900 (partial phase-out for higher earners)
  T10:  400,  // CTC partial (phase-out ~$200K+ single / $400K+ MFJ)
  T1:     0,
  BILL:   0,
  ELON:   0,
};

// PSU dividends and cashouts are now model-derived from the three-tier equity engine (see below).
// Carbon dividend is now formula-derived: CARBON_DIV_PER_CAP × hhSz (see below).

// AMCF unit liquidation rates: fraction of annual grant liquidated for cash in a given year.
// Citizens receive AMCF units (equity, not cash) — liquidation is optional. Default = accumulate.
// base_rate reflects structural consumption pressure; high for low-income, near-zero for wealthy.
// Decays over time as wealth builds (pressure_decay): Year 0=1.0, Year 10=0.76, Year 30=0.57.
const AMCF_LIQ_BASE = {
  B10:0.95, P10:0.90, P20:0.80, P30:0.70, P40:0.55, P50:0.40,
  P60:0.25, P70:0.15, P80:0.08, T10:0.03, T1:0.01, BILL:0.00, ELON:0.00,
};
// Current-law all-in effective tax rate (income + payroll − credits)
const CL_ETR   = { B10:0.05,P10:0.12,P20:0.14,P30:0.17,P40:0.18,P50:0.21,P60:0.22,P70:0.24,P80:0.26,T10:0.30,T1:0.37,BILL:0.22,ELON:0.15 };

// AMCF citizen grant per person per year (Sim-6 validated trajectory; Year 1 = $64 confirmed)
const AMCF_ANC = [[0,0],[1,64],[5,503],[10,1724],[15,4421],[20,9430],[25,15397],[30,25924]];

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  DISTRIBUTIONAL ENGINE  (ported from Sim-2; calibrated to IRS SOI + BLS)   ║
// ║  Used to derive model-based ETR, VAT/LVT/carbon burdens, and PSU values     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// 15-bracket consumption ratios and LVT/carbon parameters (IRS SOI + EPA + Census 2024)
// cRat: avg consumption / AGI per bracket (>1.0 = deficit spending by bottom deciles)
const DIST_BRACKETS = [
  { cRat:1.20 }, // $0–10K
  { cRat:1.00 }, // $10–15K
  { cRat:0.97 }, // $15–25K
  { cRat:0.95 }, // $25–40K
  { cRat:0.90 }, // $40–55K
  { cRat:0.84 }, // $55–75K
  { cRat:0.78 }, // $75–100K
  { cRat:0.72 }, // $100–150K
  { cRat:0.64 }, // $150–200K
  { cRat:0.54 }, // $200–500K
  { cRat:0.34 }, // $500K–1M
  { cRat:0.24 }, // $1–2M
  { cRat:0.16 }, // $2–5M
  { cRat:0.12 }, // $5–15M
  { cRat:0.10 }, // $15M+
];

// Carbon tons emitted per household by bracket (EPA household survey)
const CARBON_TONS_BR = [4, 5, 6, 7, 8.5, 10, 11, 12, 13.5, 16, 18, 22, 26, 30, 35];

// Net LVT burden per filer at 10% LVT (renters in lower brackets get relief; net ≈0 through $55K)
const LVT_NET_BR = [0, 0, 0, 0, 0, 0, 400, 1200, 2500, 5500, 14000, 28000, 55000, 110000, 220000];

// Three-tier worker equity: [Tier1 frac, Tier2 frac, Tier3 frac] per bracket (from Sim-2 / BLS)
const TIER_DIST = [
  [0.12,0.20,0.40],[0.15,0.22,0.48],[0.18,0.25,0.52],[0.20,0.27,0.50],[0.22,0.28,0.45],
  [0.24,0.28,0.40],[0.26,0.26,0.36],[0.25,0.24,0.32],[0.22,0.20,0.30],[0.16,0.18,0.25],
  [0.09,0.12,0.20],[0.04,0.08,0.15],[0.02,0.05,0.10],[0.01,0.03,0.07],[0.00,0.01,0.04],
];
// Tier 2: phantom equity per worker (20% of employer EV ÷ headcount); calibrated to BLS firm-size data
const TIER2_PEQ = [25000,30000,38000,48000,60000,70000,80000,90000,100000,100000,100000,100000,100000,100000,100000];
// Tier 3: PSU equity per worker at 20% ownership equilibrium (Year 5+), appreciated at EV_GROWTH/yr
const TIER3_PSU = [40000,55000,75000,100000,135000,165000,200000,260000,325000,400000,500000,650000,800000,950000,1100000];
const PSU_YIELD  = 0.035;   // 3.5% payout yield on all tiers
const EV_GROWTH  = 0.075;   // 7.5% nominal company EV growth for PSU appreciation
const AVG_TENURE = 4.1;     // BLS median job tenure for cashout annualization
const PARTTIME_FTE = [0.20,0.45,0.65,0.90,0.95,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00];

// Carbon dividend: 80% of $348B revenue distributed equally per capita (equal per person, not per HH)
const CARBON_DIV_PER_CAP = 5e9 * 100 * 0.80 / 330e6; // ≈ $843/person/yr

// Demo → bracket index mapping (0–14, matching DIST_BRACKETS)
// Based on matching DEMO stated income to bracket income midpoint
const DEMO_BRACKET = {
  B10:1, P10:3, P20:4, P30:4, P40:5, P50:6, P60:6, P70:7, P80:8, T10:9, T1:11, BILL:14, ELON:14,
};

// Sectoral fund balance at Year y with fixed annual contribution C at 6% gross growth
function sectoralFundBalance(C, y) {
  return y <= 0 ? 0 : C * (Math.pow(1.06, y) - 1) / 0.06;
}

// Annual PSU dividend income per filer at bracket bi, Year y — from Sim-2 three-tier model
function psuDividendPerFiler(bi, y) {
  const [t1, t2, t3] = TIER_DIST[bi];
  const t1Inc = sectoralFundBalance(1000, y) * PSU_YIELD;
  const t2Inc = sectoralFundBalance(TIER2_PEQ[bi] * PSU_YIELD, y) * PSU_YIELD;
  const t3Ramp   = Math.min(1, y / 5);
  const t3Apprec = y > 5 ? Math.pow(1 + EV_GROWTH, y - 5) : 1;
  const t3Inc = TIER3_PSU[bi] * t3Ramp * t3Apprec * PSU_YIELD;
  return (t1 * t1Inc + t2 * t2Inc + t3 * t3Inc) * PARTTIME_FTE[bi];
}

// Annualized PSU cashout per filer at bracket bi, Year y — from Sim-2 three-tier model
function psuCashoutPerFiler(bi, y) {
  const [, t2, t3] = TIER_DIST[bi];
  const tG = Math.pow(1 + EV_GROWTH, AVG_TENURE);
  const t2C = TIER2_PEQ[bi] * tG / AVG_TENURE;
  const t3C = TIER3_PSU[bi] * Math.min(1, y / 5) * tG / AVG_TENURE;
  return (t2 * t2C + t3 * t3C) * PARTTIME_FTE[bi];
}

// ─── ACCORD NW GROWTH RATE MODEL ──────────────────────────────────────────────
// Capital gains rates by demo — current law and under Accord (from Sim-8 two-rate system)
// Accord: unchanged for income <$200K; 25% on $200K–$1M; 50% on $1M+ (unified rate)
const CL_CG_RATE  = { B10:0,   P10:0,   P20:0,   P30:0.15, P40:0.15, P50:0.15,
                       P60:0.15,P70:0.15,P80:0.15,T10:0.238,T1:0.238, BILL:0.238,ELON:0.238 };
const ACC_CG_RATE = { B10:0,   P10:0,   P20:0,   P30:0.15, P40:0.15, P50:0.15,
                       P60:0.15,P70:0.15,P80:0.15,T10:0.25, T1:0.50,  BILL:0.50, ELON:0.50  };
const CG_FRAC = 0.75;  // fraction of portfolio return that's capital gain (vs dividends/interest)

// Computes after-Accord NW growth rate from model components rather than hand-calibrated values.
// Components:
//   finDrag      — cap gains reform reduces after-tax return on financial portfolio
//   psuExciseDrag — 4%/yr PSU equity excise on large-company business equity (BILL/ELON)
//   lvtDrag      — annual LVT net burden as a fraction of NW
function computeAccordNWG(k) {
  const d  = DEMOS[k];
  const bi = DEMO_BRACKET[k];
  const finDrag       = d.finPct * d.ret * CG_FRAC * (ACC_CG_RATE[k] - CL_CG_RATE[k]);
  const psuExciseDrag = (k === 'BILL' || k === 'ELON') ? 0.04 * d.bizPct : 0;
  const lvtDrag       = d.nw > 50000 ? LVT_NET_BR[bi] / d.nw : 0;
  return Math.max(d.nwG * 0.5, d.nwG - finDrag - psuExciseDrag - lvtDrag);
}

const YEARS      = Array.from({ length:31 }, (_, i) => i);
const SNAP_YEARS = [0, 1, 5, 10, 20, 30];

// Gini uses full distribution including billionaires — each weight is exact population share
// BILL: ~800 billionaires / 133M households ≈ 6e-6; ELON: 1 person / 133M households ≈ 7.5e-9
const GINI_INC_DEMOS = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];
const GINI_INC_WGTS  = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.09, 0.0094, 6e-6, 7.5e-9];
const GINI_NW_DEMOS  = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];
const GINI_NW_WGTS   = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.09, 0.0094, 6e-6, 7.5e-9];

const PROVS_CONFIG = [
  { key:'BASE',  label:'Current Law Baseline', color:'#64748b', fixed:true  },
  { key:'TAX',   label:'Tax Reform',            color:'#f97316', fixed:false },
  { key:'PRE',   label:'Prebate + Carbon Div',  color:'#22c55e', fixed:false },
  { key:'AMCF',  label:'AMCF Citizen Grants',   color:'#3b82f6', fixed:false },
  { key:'PSU_D', label:'PSU Dividends',          color:'#a855f7', fixed:false },
  { key:'PSU_C', label:'PSU Cashouts (Wealth)',  color:'#f59e0b', fixed:false },
];

const CHARTS = [
  { id:1,  label:'Income' },
  { id:2,  label:'Net Worth' },
  { id:3,  label:'Wealth Share' },
  { id:4,  label:'Income Share' },
  { id:5,  label:'Tax Rate' },
  { id:6,  label:'Gini' },
  { id:7,  label:'Wealth Mix' },
  { id:8,  label:'Cash Flow' },
  { id:9,  label:'Crossover' },
  { id:10, label:'Wealth Flow' },
];

// ╔═══════════════════════════════════════╗
// ║  UTILITIES                            ║
// ╚═══════════════════════════════════════╝

const fD = n => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e12) return `${s}$${(a/1e12).toFixed(1)}T`;
  if (a >= 1e9)  return `${s}$${(a/1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `${s}$${(a/1e6).toFixed(1)}M`;
  if (a >= 1e3)  return `${s}$${(a/1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

function lerp(anc, x) {
  if (x <= anc[0][0]) return anc[0][1];
  if (x >= anc[anc.length-1][0]) return anc[anc.length-1][1];
  for (let i = 0; i < anc.length - 1; i++) {
    if (x >= anc[i][0] && x <= anc[i+1][0]) {
      const t = (x - anc[i][0]) / (anc[i+1][0] - anc[i][0]);
      return anc[i][1] + t * (anc[i+1][1] - anc[i][1]);
    }
  }
  return anc[anc.length-1][1];
}

const amcfG        = y => lerp(AMCF_ANC, y);
// AMCF liquidation rate: structural pressure × time-decay.
// pressure_decay: 1.0 at Year 0, decays toward 0.5 asymptote as household wealth builds.
const pressureDecay = y => 0.5 + 0.5 * Math.exp(-y / 15);
const liqRate       = (k, y) => AMCF_LIQ_BASE[k] * pressureDecay(y);
// PSU values derived from Sim-2 three-tier equity model (replaces hand-crafted PSU_DIV/PSU_CASH)
const psuDAt  = (k, y) => psuDividendPerFiler(DEMO_BRACKET[k], y);
const psuCAt  = (k, y) => psuCashoutPerFiler(DEMO_BRACKET[k], y);
// taxAt: income tax reform delta vs current law, constant in real 2024 dollars.
// (VAT, LVT, carbon are handled separately via DIST_BRACKETS model)
const taxAt   = (k, y) => DEMOS[k].taxChg;

// ╔═══════════════════════════════════════╗
// ║  COMPUTATION ENGINE                   ║
// ╚═══════════════════════════════════════╝

// Returns layered income components for (demographic, year, active provisions)
// tax: negative = net cost to household; positive = net relief (stacks downward in charts)
function getInc(k, y, P) {
  const d  = DEMOS[k];
  const bi = DEMO_BRACKET[k];
  const base = d.income * Math.pow(1 + d.incG, y);
  let tax = 0;
  if (P.has('TAX')) {
    if (d.accordIncG != null) {
      // High-wealth demos (T1/BILL/ELON): income compression model from capital reform
      tax = d.income * Math.pow(1 + d.accordIncG, y) - base;
    } else {
      // Model-derived: income tax reform + VAT (4%, scales with income) + LVT + carbon cost
      const vatCost    = 0.04 * DIST_BRACKETS[bi].cRat * base;
      const lvtCost    = LVT_NET_BR[bi];
      const carbonCost = CARBON_TONS_BR[bi] * 100;
      tax = -taxAt(k, y) - vatCost - lvtCost - carbonCost;
    }
  }
  // PRE: universal prebate + carbon dividend (equal per capita) − programs replaced
  const carbonDiv = CARBON_DIV_PER_CAP * d.hhSz;
  const pre  = P.has('PRE')   ? (5000 * d.hhSz + carbonDiv - PROG_LOST[k]) : 0;
  // AMCF: only the liquidated fraction is cash income. Retained units go to wealth (getNW).
  const ag   = P.has('AMCF')  ? amcfG(y) * d.hhSz * liqRate(k, y) : 0;
  const pd   = P.has('PSU_D') ? psuDAt(k, y) : 0;
  const pc   = P.has('PSU_C') ? psuCAt(k, y) : 0;
  return { base, tax, pre, amcf:ag, psuD:pd, psuC:pc, total: base+tax+pre+ag+pd+pc };
}

// Returns layered NW components — compounded cumulative effects
function getNW(k, y, P) {
  const d = DEMOS[k], r = d.ret;
  // Accord NW growth rate derived from model (cap gains reform + PSU excise + LVT drag)
  const nwGr = P.has('TAX') ? computeAccordNWG(k) : d.nwG;
  const base = d.nw >= 0
    ? d.nw * Math.pow(1 + nwGr, y)
    : Math.max(d.nw, d.nw + d.income * d.save * Math.min(y, 30));

  let tax = 0, pre = 0, ag = 0, pd = 0, pc = 0;

  if (P.has('TAX')) {
    // accordNWG (already applied to base) captures the Accord's drag on capital appreciation.
    // taxAt handles the explicit tax burden on top; no separate accordIncG channel here
    // because income compression for capital earners is already baked into accordNWG.
    let c = 0;
    for (let t = 1; t <= y; t++) c = c * (1 + r) + (-taxAt(k, t) * d.save);
    tax = c;
  }
  if (P.has('PRE')) {
    const carbonDiv = CARBON_DIV_PER_CAP * d.hhSz;
    const ann = (5000 * d.hhSz + carbonDiv - PROG_LOST[k]) * d.save;
    pre = y > 0 ? ann * (Math.pow(1 + r, y) - 1) / r : 0;
  }
  if (P.has('AMCF')) {
    // AMCF custodial account (universal birth account, 5% real = 7.5% nominal − 2.5% inflation)
    const cust = 10000 * Math.pow(1.05, y);
    // Annual grants split: retained units accumulate at AMCF NAV (5% real);
    // liquidated portion is cash income, savings fraction of that reinvested at d.ret.
    let retainedAcc = 0;  // AMCF units held, compounding at fund rate
    let liqSavings  = 0;  // saved fraction of liquidated grants, compounding at household ret rate
    for (let t = 1; t <= y; t++) {
      const grant = amcfG(t) * d.hhSz;
      const lr = liqRate(k, t);
      retainedAcc = retainedAcc * 1.05 + grant * (1 - lr);
      liqSavings  = liqSavings  * (1 + r) + grant * lr * d.save;
    }
    ag = cust + retainedAcc + liqSavings;
  }
  if (P.has('PSU_D')) {
    let c = 0;
    for (let t = 1; t <= y; t++) c = c * (1 + r) + psuDAt(k, t) * d.save;
    pd = c;
  }
  if (P.has('PSU_C')) {
    // PSU cashouts reinvested at full value (wealth event, not subject to savings rate)
    let c = 0;
    for (let t = 1; t <= y; t++) c = c * (1 + r) + psuCAt(k, t);
    pc = c;
  }

  return { base, tax, pre, amcf:ag, psuD:pd, psuC:pc, total: base+tax+pre+ag+pd+pc };
}

// ─── BILLIONAIRE ECONOMIC INCOME ETR MODEL ────────────────────────────────────
// Buy-borrow-die means BILL/ELON's real economic income far exceeds reported income.
// Under current law: only reported income (~$300M) is taxed; unrealized appreciation
// on $4.7B of business equity (~$340M/yr) escapes entirely → economic ETR ≈ 9%.
//
// Three Accord channels that close this gap:
//   (1) Income tax reform (taxAt): higher rates on reported income (immediate)
//   (2) PSU equity excise: 4%/yr on business equity value → direct wealth levy (immediate)
//   (3) Mark-to-market enforcement: unrealized appreciation taxed as income (Years 5–15 ramp)
//
// Denominator uses ECONOMIC income (reported + unrealized biz + unrealized fin) so that
// current-law 9% and Accord 30–55%+ are directly comparable on the same basis.
function billionaireETR(k, y, P) {
  const d    = DEMOS[k];
  const nwGr = P.has('TAX') ? computeAccordNWG(k) : d.nwG;
  const nwY  = d.nw * Math.pow(1 + nwGr, y);
  const incY = d.income * Math.pow(1 + d.incG, y);

  // Unrealized appreciation: the component of economic income invisible to current tax system
  const unrealBiz = nwY * d.bizPct * d.nwG;         // business equity appreciation
  const unrealFin = nwY * d.finPct * d.ret * 0.80;  // 80% of financial return is unrealized gain
  const econInc   = incY + unrealBiz + unrealFin;

  // Current law: taxes only on reported income; unrealized appreciation entirely untaxed
  let taxes = incY * CL_ETR[k];

  if (P.has('TAX')) {
    taxes += taxAt(k, y);                              // (1) income tax reform on reported income
    taxes += 0.04 * d.bizPct * nwY;                   // (2) PSU equity excise on business equity
    const mtmRate = Math.max(0, Math.min(1, (y - 5) / 10));  // ramp 0→1 from Year 5 to Year 15
    taxes += mtmRate * 0.50 * (unrealBiz + unrealFin); // (3) MTM at 50% rate (Accord >$1M rate)
  }
  if (P.has('PRE')) {
    taxes -= (5000 * d.hhSz + CARBON_DIV_PER_CAP * d.hhSz - PROG_LOST[k]);
  }
  return econInc > 0 ? taxes / econInc * 100 : 0;
}

// Effective tax rate: net taxes paid (minus transfers) / income × 100
// BILL/ELON → billionaireETR() on economic income (buy-borrow-die requires this treatment)
// All others → model-derived from Sim-2 distributional engine on reported income:
//   CL income tax + income tax reform (taxAt) + VAT (4%) + LVT net burden + carbon cost
function getETR(k, y, P) {
  if (k === 'BILL' || k === 'ELON') return billionaireETR(k, y, P);

  const d  = DEMOS[k];
  const bi = DEMO_BRACKET[k];
  const g  = d.income * Math.pow(1 + d.incG, y);
  let taxes = g * CL_ETR[k], bens = 0;

  if (P.has('TAX')) {
    const vatCost    = 0.04 * DIST_BRACKETS[bi].cRat * g;
    const lvtCost    = LVT_NET_BR[bi];
    const carbonCost = CARBON_TONS_BR[bi] * 100;
    taxes += taxAt(k, y) + vatCost + lvtCost + carbonCost;
  }
  // PRE: universal prebate + carbon dividend − programs replaced.
  // AMCF and PSU are equity returns, not tax offsets — excluded from ETR.
  if (P.has('PRE')) {
    bens += 5000 * d.hhSz + CARBON_DIV_PER_CAP * d.hhSz - PROG_LOST[k];
  }
  return g > 0 ? (taxes - bens) / g * 100 : 0;
}

// Gini from weighted distribution points (Lorenz trapezoid method)
function computeGini(pts) {
  const s = [...pts].filter(p => p.w > 0 && p.v >= 0).sort((a, b) => a.v - b.v);
  const tW = s.reduce((a, p) => a + p.w, 0);
  const tV = s.reduce((a, p) => a + p.v * p.w, 0);
  if (!tV || !tW) return 0;
  let area = 0, cP = 0, cI = 0, pP = 0, pI = 0;
  for (const p of s) {
    cP += p.w / tW;
    cI += p.v * p.w / tV;
    area += (cP - pP) * (pI + cI) / 2;
    pP = cP; pI = cI;
  }
  return Math.max(0, Math.min(1, 1 - 2 * area));
}

// ╔══════════════════════════════════════════════════════╗
// ║  SHARED CHART COMPONENTS                             ║
// ╚══════════════════════════════════════════════════════╝

const TTip = ({ active, payload, label, fmt, isBar }) => {
  if (!active || !payload?.length) return null;
  const head = isBar ? payload[0]?.payload?.demo : `Year ${label}`;
  return (
    <div style={{ background:'#1e293b', border:'1px solid #475569', borderRadius:8,
      padding:'10px 14px', fontSize:12, color:'#e2e8f0', maxWidth:280, zIndex:1000 }}>
      <div style={{ fontWeight:700, marginBottom:6, color:'#f1f5f9' }}>{head}</div>
      {payload.slice(0, 12).map((p, i) => {
        const v = fmt ? fmt(p.value) : (typeof p.value === 'number' ? p.value.toFixed(3) : p.value);
        return (
          <div key={i} style={{ display:'flex', gap:6, alignItems:'center', marginBottom:2 }}>
            <span style={{ width:10, height:10, borderRadius:2, background:p.fill || p.stroke,
              display:'inline-block', flexShrink:0 }}/>
            <span style={{ color:'#cbd5e1' }}>{p.name}:</span>
            <b style={{ marginLeft:'auto', paddingLeft:8 }}>{v}</b>
          </div>
        );
      })}
    </div>
  );
};

// ╔══════════════════════════════════════════════════════╗
// ║  REUSABLE SNAPSHOT MATRIX TABLE                      ║
// ╚══════════════════════════════════════════════════════╝
// Renders a year × demographic matrix with an optional "vs Current Law" delta sub-table.
// deltaFmt(delta, clValue) → string. Defaults to dollar+pct; pass for pp-based charts.
function SnapshotTable({ title, demos, getValue, getCL, fmt, deltaFmt, note }) {
  // Year 0 is always the baseline — ignore provision toggles
  const getV = (k, y) => (y === 0 && getCL) ? getCL(k, y) : getValue(k, y);
  const thS = { padding:'5px 10px', fontWeight:700, borderBottom:'2px solid #e2e8f0',
    whiteSpace:'nowrap', textAlign:'right', background:'#f8fafc', fontSize:11 };
  const thL = { ...thS, textAlign:'left', color:'#64748b', minWidth:50 };
  const tdS = { padding:'4px 10px', borderBottom:'1px solid #f1f5f9', textAlign:'right',
    whiteSpace:'nowrap', fontSize:11, color:'#0f172a' };
  const tdL = { ...tdS, textAlign:'left', fontWeight:600, color:'#64748b' };
  const tbl = { borderCollapse:'collapse', width:'100%' };
  const dFmt = deltaFmt || ((d, clV) => {
    const pos = d >= 0;
    const pct = clV && Math.abs(clV) > 0 ? ` (${pos?'+':''}${(d/Math.abs(clV)*100).toFixed(1)}%)` : '';
    return `${pos?'+':''}${fmt(d)}${pct}`;
  });
  return (
    <div>
      <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:4 }}>{title}</div>
      {note && <div style={{ fontSize:11, color:'#94a3b8', marginBottom:6 }}>{note}</div>}
      <div style={{ overflowX:'auto' }}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={thL}>Year</th>
              {demos.map(k => <th key={k} style={{ ...thS, color:DEMOS[k].color }}>{DEMOS[k].short}</th>)}
            </tr>
          </thead>
          <tbody>
            {SNAP_YEARS.map((y, i) => (
              <tr key={y} style={{ background: i%2 ? '#f8fafc' : '#fff' }}>
                <td style={tdL}>Yr {y}</td>
                {demos.map(k => <td key={k} style={tdS}>{fmt(getV(k, y))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {getCL && (
        <>
          <div style={{ fontSize:11, fontWeight:600, color:'#94a3b8', margin:'12px 0 4px' }}>vs Current Law</div>
          <div style={{ overflowX:'auto' }}>
            <table style={tbl}>
              <thead>
                <tr>
                  <th style={thL}>Year</th>
                  {demos.map(k => <th key={k} style={{ ...thS, color:DEMOS[k].color }}>{DEMOS[k].short}</th>)}
                </tr>
              </thead>
              <tbody>
                {SNAP_YEARS.map((y, i) => (
                  <tr key={y} style={{ background: i%2 ? '#f8fafc' : '#fff' }}>
                    <td style={tdL}>Yr {y}</td>
                    {demos.map(k => {
                      const v = getV(k, y), cl = getCL(k, y), d = v - cl;
                      return (
                        <td key={k} style={{ ...tdS, color: d>=0 ? '#16a34a' : '#dc2626', fontWeight:600 }}>
                          {dFmt(d, cl)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  COMPOSITION MATRIX TABLE                             ║
// ╚══════════════════════════════════════════════════════╝
// One section per demographic. Component rows × snapshot-year columns.
// Each numeric cell has a subtle data-bar background scaled to that row's max across years.
// Positive values → green bar + green text. Negative → red bar + red text.
// isTotal rows render bold with a heavier top border and no bar.
// isSep rows render as a visual divider with label text.
function CompositionTable({ title, demos, getRows, note }) {
  const thS = { padding:'5px 10px', fontWeight:700, textAlign:'right', background:'#f8fafc',
    fontSize:11, borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap', color:'#64748b' };
  const thL = { ...thS, textAlign:'left', minWidth:180, color:'#475569' };
  return (
    <div>
      <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:14 }}>{title}</div>
      {demos.map(k => {
        const d = DEMOS[k];
        const byYear = SNAP_YEARS.map(y => getRows(k, y));
        const schema = byYear[0];
        const maxPerRow = schema.map((_, ri) =>
          Math.max(...byYear.map(yr => Math.abs(yr[ri]?.value ?? 0)), 1)
        );
        return (
          <div key={k} style={{ marginBottom:18, overflowX:'auto' }}>
            <div style={{
              background:d.color, color:'#fff', padding:'5px 12px',
              fontSize:12, fontWeight:700, borderRadius:'4px 4px 0 0', letterSpacing:'0.02em',
            }}>
              {d.label}
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12,
              border:'1px solid #e2e8f0', borderTop:'none' }}>
              <thead>
                <tr>
                  <th style={thL}>Component</th>
                  {SNAP_YEARS.map(y => <th key={y} style={thS}>Year {y}</th>)}
                </tr>
              </thead>
              <tbody>
                {schema.map((row, ri) => {
                  if (row.isSep) return (
                    <tr key={ri}>
                      <td colSpan={6} style={{ padding:'3px 12px', background:'#f1f5f9',
                        fontSize:11, color:'#64748b', fontStyle:'italic',
                        borderTop:'1px solid #e2e8f0', borderBottom:'1px solid #e2e8f0' }}>
                        {row.name}
                      </td>
                    </tr>
                  );
                  const isTotal = row.isTotal;
                  return (
                    <tr key={ri} style={{
                      background: isTotal ? '#f0f9ff' : 'white',
                      fontWeight: isTotal ? 700 : 400,
                      borderTop: isTotal ? '2px solid #cbd5e1' : 'none',
                    }}>
                      <td style={{ padding:'4px 12px', color: isTotal ? '#0f172a' : '#475569',
                        borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>
                        {!isTotal && (
                          <span style={{ display:'inline-block', width:8, height:8,
                            borderRadius:2, background:row.fill,
                            marginRight:7, verticalAlign:'middle' }}/>
                        )}
                        <span style={{ verticalAlign:'middle' }}>{row.name}</span>
                      </td>
                      {byYear.map((yr, yi) => {
                        const v = yr[ri]?.value ?? 0;
                        const pct = Math.min(Math.abs(v) / maxPerRow[ri] * 100, 100);
                        const isNeg = v < 0;
                        const barColor = isNeg ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)';
                        const textColor = isTotal ? '#0f172a'
                          : isNeg ? '#dc2626'
                          : v > 0 ? '#15803d' : '#94a3b8';
                        return (
                          <td key={yi} style={{
                            padding:'4px 10px', textAlign:'right', whiteSpace:'nowrap',
                            fontVariantNumeric:'tabular-nums', color: textColor,
                            borderBottom: isTotal ? 'none' : '1px solid #f1f5f9',
                            background: (!isTotal && v !== 0)
                              ? `linear-gradient(to right, ${barColor} ${pct}%, transparent ${pct}%)`
                              : 'transparent',
                          }}>
                            {fD(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {note && <div style={{ fontSize:11, color:'#64748b', marginTop:4, fontStyle:'italic' }}>{note}</div>}
    </div>
  );
}

const ChartHeader = ({ title, desc }) => (
  <div style={{ marginBottom:12 }}>
    <div style={{ fontSize:16, fontWeight:700, color:'#0f172a' }}>{title}</div>
    <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{desc}</div>
  </div>
);

const noData = <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
  height:350, color:'#94a3b8', fontSize:14 }}>Select at least one demographic to display</div>;

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 1: AVERAGE ANNUAL INCOME                      ║
// ╚══════════════════════════════════════════════════════╝
function Chart1({ demos, P, mode, snYear, logScale, normalizedBar }) {
  const lData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const r = { year: y };
    demos.forEach(k => { r[k] = getInc(k, y, Q).total; });
    return r;
  }), [demos.join(','), [...P].sort().join(',')]);

  const bData = useMemo(() => demos.map(k => {
    const l = getInc(k, snYear, P);
    return { demo:DEMOS[k].short, key:k, base:l.base, tax:l.tax, pre:l.pre, amcf:l.amcf, psuD:l.psuD, psuC:l.psuC };
  }), [demos.join(','), [...P].sort().join(','), snYear]);

  if (!demos.length) return noData;
  const yAx = logScale ? { scale:'log', domain:[1,'auto'] } : {};

  if (mode === 'bar') {
    const normData = normalizedBar
      ? bData.map(d => { const g = Math.max(Math.abs(d.base), 1) / 100; return { ...d, base:d.base/g, tax:d.tax/g, pre:d.pre/g, amcf:d.amcf/g, psuD:d.psuD/g, psuC:d.psuC/g }; })
      : bData;
    const bFmt = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={normData} margin={{ top:20, right:20, bottom:10, left:90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey="demo" tick={{ fill:'#475569', fontSize:12 }}/>
          <YAxis tickFormatter={bFmt} tick={{ fill:'#475569', fontSize:11 }} width={85}/>
          <Tooltip content={<TTip fmt={bFmt} isBar/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <Bar dataKey="base" stackId="s" name="Current Law" fill="#94a3b8"/>
          {P.has('TAX') && <Bar dataKey="tax" stackId="s" name="Tax Reform">
            {normData.map((d, i) => <Cell key={i} fill={d.tax >= 0 ? '#86efac' : '#fca5a5'}/>)}
          </Bar>}
          {P.has('PRE')   && <Bar dataKey="pre"  stackId="s" name="Prebate+Carbon" fill="#22c55e"/>}
          {P.has('AMCF')  && <Bar dataKey="amcf" stackId="s" name="AMCF Grant"     fill="#3b82f6"/>}
          {P.has('PSU_D') && <Bar dataKey="psuD" stackId="s" name="PSU Dividend"   fill="#a855f7"/>}
          {P.has('PSU_C') && <Bar dataKey="psuC" stackId="s" name="PSU Cashout"    fill="#f59e0b"/>}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lData} margin={{ top:20, right:20, bottom:20, left:90 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
        <YAxis tickFormatter={fD} tick={{ fill:'#475569', fontSize:11 }} width={85} {...yAx}/>
        <Tooltip content={<TTip fmt={fD}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 2: AVERAGE NET WORTH                          ║
// ╚══════════════════════════════════════════════════════╝
function Chart2({ demos, P, mode, snYear, logScale, normalizedBar }) {
  const lData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const r = { year: y };
    demos.forEach(k => { const t = getNW(k, y, Q).total; r[k] = logScale ? Math.max(t, 1) : t; });
    return r;
  }), [demos.join(','), [...P].sort().join(','), logScale]);

  const bData = useMemo(() => demos.map(k => {
    const l = getNW(k, snYear, P);
    return {
      demo:DEMOS[k].short, key:k,
      base: Math.max(l.base, 0),
      tax:  l.tax,
      pre:  Math.max(l.pre, 0),
      amcf: Math.max(l.amcf, 0),
      psuD: Math.max(l.psuD, 0),
      psuC: Math.max(l.psuC, 0),
    };
  }), [demos.join(','), [...P].sort().join(','), snYear]);

  if (!demos.length) return noData;
  const yAx = logScale ? { scale:'log', domain:[1,'auto'] } : {};

  if (mode === 'bar') {
    const normData = normalizedBar
      ? bData.map(d => { const g = Math.max(Math.abs(d.base), 1) / 100; return { ...d, base:d.base/g, tax:d.tax/g, pre:d.pre/g, amcf:d.amcf/g, psuD:d.psuD/g, psuC:d.psuC/g }; })
      : bData;
    const bFmt = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={normData} margin={{ top:20, right:20, bottom:10, left:90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey="demo" tick={{ fill:'#475569', fontSize:12 }}/>
          <YAxis tickFormatter={bFmt} tick={{ fill:'#475569', fontSize:11 }} width={85}/>
          <Tooltip content={<TTip fmt={bFmt} isBar/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <Bar dataKey="base" stackId="s" name="Current Law NW" fill="#94a3b8"/>
          {P.has('TAX') && <Bar dataKey="tax" stackId="s" name="Tax Impact">
            {normData.map((d, i) => <Cell key={i} fill={d.tax >= 0 ? '#86efac' : '#fca5a5'}/>)}
          </Bar>}
          {P.has('PRE')   && <Bar dataKey="pre"  stackId="s" name="Prebate Savings"  fill="#22c55e"/>}
          {P.has('AMCF')  && <Bar dataKey="amcf" stackId="s" name="AMCF Custodial"   fill="#3b82f6"/>}
          {P.has('PSU_D') && <Bar dataKey="psuD" stackId="s" name="PSU Div Savings"  fill="#a855f7"/>}
          {P.has('PSU_C') && <Bar dataKey="psuC" stackId="s" name="PSU Cashouts"     fill="#f59e0b"/>}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lData} margin={{ top:20, right:20, bottom:20, left:90 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
        <YAxis tickFormatter={fD} tick={{ fill:'#475569', fontSize:11 }} width={85} {...yAx}/>
        <Tooltip content={<TTip fmt={fD}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 3: SHARE OF NATIONAL WEALTH                   ║
// ╚══════════════════════════════════════════════════════╝
// Shared stacked data builder: selected demos + "Other" remainder = always 100%.
// DEMO_KEYS order (B10→ELON) is bottom-to-top, so stacking order is automatic.
function buildShareData(demos, getVal) {
  return YEARS.map(y => {
    const vals = {}; let total = 0;
    DEMO_KEYS.forEach(k => { const v = Math.max(getVal(k, y), 0) * POP[k]; vals[k] = v; total += v; });
    const r = { year: y };
    let selectedSum = 0;
    demos.forEach(k => { r[k] = total > 0 ? vals[k] / total * 100 : 0; selectedSum += r[k]; });
    r._other = Math.max(0, 100 - selectedSum);
    return r;
  });
}

function Chart3({ demos, P, stacked }) {
  const lineData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const vals = {}; let total = 0;
    DEMO_KEYS.forEach(k => { const v = Math.max(getNW(k, y, Q).total, 0) * POP[k]; vals[k] = v; total += v; });
    const r = { year: y };
    demos.forEach(k => { r[k] = total > 0 ? vals[k] / total * 100 : 0; });
    return r;
  }), [demos.join(','), [...P].sort().join(',')]);

  const stackData = useMemo(() =>
    buildShareData(demos, (k, y) => getNW(k, y, y === 0 ? BASE_ONLY : P).total),
  [demos.join(','), [...P].sort().join(',')]);

  if (!demos.length) return noData;

  if (stacked) {
    const hasOther = stackData[0]?._other > 0.1;
    return (
      <div>
        <div style={{ fontSize:11, color:'#94a3b8', marginBottom:8 }}>
          Stacked share of national wealth. "Other" (gray) = unselected demographics. Toggle demos freely — chart always sums to 100%.
          Note: Q2/Q3/Q4 each span two decile bands (data limitation; splitting would require fabricated values).
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={stackData} margin={{ top:10, right:20, bottom:20, left:60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
            <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill:'#475569', fontSize:11 }} width={55}/>
            <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
            <Legend wrapperStyle={{ fontSize:12 }}/>
            {demos.map(k => (
              <Area key={k} type="monotone" dataKey={k} name={DEMOS[k].label}
                stackId="s" stroke={DEMOS[k].color} fill={DEMOS[k].color} fillOpacity={0.75} dot={false}/>
            ))}
            {hasOther && (
              <Area type="monotone" dataKey="_other" name="Other (not selected)"
                stackId="s" stroke="#cbd5e1" fill="#e2e8f0" fillOpacity={0.6} dot={false}/>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lineData} margin={{ top:20, right:20, bottom:20, left:60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
        <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill:'#475569', fontSize:11 }} width={55}/>
        <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 4: SHARE OF NATIONAL INCOME                   ║
// ╚══════════════════════════════════════════════════════╝
function Chart4({ demos, P, stacked }) {
  const lineData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const vals = {}; let total = 0;
    DEMO_KEYS.forEach(k => { const v = Math.max(getInc(k, y, Q).total, 0) * POP[k]; vals[k] = v; total += v; });
    const r = { year: y };
    demos.forEach(k => { r[k] = total > 0 ? vals[k] / total * 100 : 0; });
    return r;
  }), [demos.join(','), [...P].sort().join(',')]);

  const stackData = useMemo(() =>
    buildShareData(demos, (k, y) => getInc(k, y, y === 0 ? BASE_ONLY : P).total),
  [demos.join(','), [...P].sort().join(',')]);

  if (!demos.length) return noData;

  if (stacked) {
    const hasOther = stackData[0]?._other > 0.1;
    return (
      <div>
        <div style={{ fontSize:11, color:'#94a3b8', marginBottom:8 }}>
          Stacked share of national income. "Other" (gray) = unselected demographics. Toggle demos freely — chart always sums to 100%.
          Note: Q2/Q3/Q4 each span two decile bands (data limitation; splitting would require fabricated values).
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={stackData} margin={{ top:10, right:20, bottom:20, left:60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
            <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill:'#475569', fontSize:11 }} width={55}/>
            <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
            <Legend wrapperStyle={{ fontSize:12 }}/>
            {demos.map(k => (
              <Area key={k} type="monotone" dataKey={k} name={DEMOS[k].label}
                stackId="s" stroke={DEMOS[k].color} fill={DEMOS[k].color} fillOpacity={0.75} dot={false}/>
            ))}
            {hasOther && (
              <Area type="monotone" dataKey="_other" name="Other (not selected)"
                stackId="s" stroke="#cbd5e1" fill="#e2e8f0" fillOpacity={0.6} dot={false}/>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lineData} margin={{ top:20, right:20, bottom:20, left:60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
        <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill:'#475569', fontSize:11 }} width={55}/>
        <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 5: EFFECTIVE TAX RATE                         ║
// ╚══════════════════════════════════════════════════════╝
function Chart5({ demos, P }) {
  const data = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const r = { year: y };
    demos.forEach(k => { r[k] = parseFloat(getETR(k, y, Q).toFixed(2)); });
    return r;
  }), [demos.join(','), [...P].sort().join(',')]);

  if (!demos.length) return noData;
  return (
    <div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
        ETR = taxes paid minus universal prebate/carbon offset ÷ gross income. Negative = prebate exceeds taxes.
        T10/T1/BILL/ELON use explicit ETR anchors calibrated from Accord statutory rates (Day 1 reform applies
        immediately) growing as avoidance channels close. Lower brackets use the net income-tax reform delta.
        AMCF grants and PSU equity income are excluded — those are ownership returns shown in Chart 1.
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top:10, right:20, bottom:20, left:60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
          <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill:'#475569', fontSize:11 }} width={55}/>
          <Tooltip content={<TTip fmt={v => `${v.toFixed(1)}%`}/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" label={{ value:'0%', position:'right', fontSize:11 }}/>
          {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
            dot={false} strokeWidth={2.5}/>)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 6: GINI COEFFICIENT                           ║
// ╚══════════════════════════════════════════════════════╝
// Empirical US baselines (BLS/Fed SCF 2022). Anchor shifts computed Gini to match
// real year-0 starting levels so chart shows correct baseline + policy deviations.
const US_GINI_INC = 0.490;
const US_GINI_NW  = 0.850;
const BASE_ONLY   = new Set(['BASE']);
const _gAnchor = (() => {
  const ip = GINI_INC_DEMOS.map((k, i) => ({ v: Math.max(getInc(k, 0, BASE_ONLY).total, 0), w: GINI_INC_WGTS[i] }));
  const np = GINI_NW_DEMOS.map((k,  i) => ({ v: Math.max(getNW(k,  0, BASE_ONLY).total, 0), w: GINI_NW_WGTS[i]  }));
  return { inc: US_GINI_INC - computeGini(ip), nw: US_GINI_NW - computeGini(np) };
})();

function Chart6({ P }) {
  const data = useMemo(() => YEARS.map(y => {
    // Year 0 = current law baseline regardless of active provisions,
    // so both lines anchor cleanly at the empirical US starting point.
    const Q = y === 0 ? BASE_ONLY : P;
    const incPts = GINI_INC_DEMOS.map((k, i) => ({
      v: Math.max(getInc(k, y, Q).total, 0), w: GINI_INC_WGTS[i]
    }));
    const nwPts = GINI_NW_DEMOS.map((k, i) => ({
      v: Math.max(getNW(k, y, Q).total, 0), w: GINI_NW_WGTS[i]
    }));
    return {
      year: y,
      incomeGini: parseFloat(Math.max(0, Math.min(0.99, computeGini(incPts) + _gAnchor.inc)).toFixed(3)),
      wealthGini: parseFloat(Math.max(0, Math.min(0.99, computeGini(nwPts)  + _gAnchor.nw )).toFixed(3)),
    };
  }), [[...P].sort().join(',')]);

  return (
    <div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
        0 = perfect equality · 1 = perfect inequality. Anchored to empirical US baselines (BLS/SCF 2022):
        income 0.490, wealth 0.850. Provision toggles show each one's contribution to inequality reduction.
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top:10, right:20, bottom:20, left:60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
          <YAxis domain={[0, 0.95]} tickFormatter={v => v.toFixed(2)} tick={{ fill:'#475569', fontSize:11 }} width={55}/>
          <Tooltip content={<TTip fmt={v => v.toFixed(3)}/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <ReferenceLine y={0.49} stroke="#94a3b8" strokeDasharray="3 3"
            label={{ value:'US income (0.49)', position:'right', fontSize:10, fill:'#94a3b8' }}/>
          <ReferenceLine y={0.32} stroke="#22c55e" strokeDasharray="3 3"
            label={{ value:'OECD avg (0.32)', position:'right', fontSize:10, fill:'#22c55e' }}/>
          <ReferenceLine y={0.28} stroke="#3b82f6" strokeDasharray="3 3"
            label={{ value:'Denmark (0.28)', position:'right', fontSize:10, fill:'#3b82f6' }}/>
          <ReferenceLine y={0.85} stroke="#ef4444" strokeDasharray="3 3"
            label={{ value:'US wealth (0.85)', position:'right', fontSize:10, fill:'#ef4444' }}/>
          <Line dataKey="incomeGini" name="Income Gini" stroke="#0f172a" dot={false} strokeWidth={2.5}/>
          <Line dataKey="wealthGini" name="Wealth Gini" stroke="#dc2626" dot={false} strokeWidth={2.5} strokeDasharray="6 3"/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 7: WEALTH COMPOSITION BREAKDOWN               ║
// ╚══════════════════════════════════════════════════════╝
function Chart7({ demos, P, snYear, normalizedBar }) {
  const data = useMemo(() => demos.map(k => {
    const d = DEMOS[k];
    const l = getNW(k, snYear, P);
    const b = Math.max(l.base, 0);
    const other = Math.max(0, b * (1 - d.homePct - d.k401Pct - d.finPct - d.bizPct));
    return {
      demo: d.short, key: k,
      homeEquity:  b * d.homePct,
      k401k:       b * d.k401Pct,
      financial:   b * d.finPct,
      business:    b * d.bizPct,
      other,
      amcf:  P.has('AMCF')  ? Math.max(l.amcf, 0) : 0,
      psuD:  P.has('PSU_D') ? Math.max(l.psuD, 0) : 0,
      psuC:  P.has('PSU_C') ? Math.max(l.psuC, 0) : 0,
    };
  }), [demos.join(','), [...P].sort().join(','), snYear]);

  if (!demos.length) return noData;

  const normData = normalizedBar
    ? data.map(d => {
        const tot = Math.max(d.homeEquity + d.k401k + d.financial + d.business + d.other + d.amcf + d.psuD + d.psuC, 1) / 100;
        return { ...d, homeEquity:d.homeEquity/tot, k401k:d.k401k/tot, financial:d.financial/tot, business:d.business/tot, other:d.other/tot, amcf:d.amcf/tot, psuD:d.psuD/tot, psuC:d.psuC/tot };
      })
    : data;
  const bFmt = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;

  return (
    <div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
        Components of household wealth at Year {snYear}. AMCF, PSU Dividends, and PSU Cashouts appear
        only when those provisions are active. Lower brackets shift from financial assets toward
        AMCF + PSU over time.{normalizedBar ? ' Normalized to 100% of total NW.' : ''}
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={normData} margin={{ top:10, right:20, bottom:10, left:90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey="demo" tick={{ fill:'#475569', fontSize:12 }}/>
          <YAxis tickFormatter={bFmt} tick={{ fill:'#475569', fontSize:11 }} width={85}/>
          <Tooltip content={<TTip fmt={bFmt} isBar/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <Bar dataKey="homeEquity" stackId="s" name="Home Equity"    fill="#f97316"/>
          <Bar dataKey="k401k"      stackId="s" name="401K/Savings"   fill="#eab308"/>
          <Bar dataKey="financial"  stackId="s" name="Financial"      fill="#3b82f6"/>
          <Bar dataKey="business"   stackId="s" name="Business Equity" fill="#8b5cf6"/>
          <Bar dataKey="other"      stackId="s" name="Other"          fill="#94a3b8"/>
          {P.has('AMCF')  && <Bar dataKey="amcf" stackId="s" name="AMCF Custodial"  fill="#3b82f6" fillOpacity={0.6}/>}
          {P.has('PSU_D') && <Bar dataKey="psuD" stackId="s" name="PSU Div Savings" fill="#a855f7"/>}
          {P.has('PSU_C') && <Bar dataKey="psuC" stackId="s" name="PSU Cashouts"    fill="#f59e0b"/>}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 8: CASH FLOW DIVERGING BAR                    ║
// ╚══════════════════════════════════════════════════════╝

function cashFlowPt(k, y, P, norm) {
  const d = DEMOS[k];
  const gross = d.income * Math.pow(1 + d.incG, y);
  // For accordIncG demos with TAX active, actual earned income is compressed.
  // Apply taxes/VAT on actual Accord income, not the CL hypothetical.
  const actualInc = (d.accordIncG != null && P.has('TAX'))
    ? d.income * Math.pow(1 + d.accordIncG, y)
    : gross;
  // For accordIncG demos with TAX active, reform taxes are embedded in accordIncome
  // (the growth rate already reflects avoidance channel closure + higher statutory rates).
  // Applying CL_ETR on top would double-count taxes already baked into the compression.
  const clTax = (d.accordIncG != null && P.has('TAX'))
    ? 0
    : -(actualInc * CL_ETR[k]);
  const taxRef = P.has('TAX')
    ? (d.accordIncG != null ? actualInc - gross : -taxAt(k, y))
    : 0;
  const vat  = P.has('TAX') ? -(0.04 * d.consume * actualInc) : 0;
  const lvt  = P.has('TAX') ? -(d.lvt * Math.pow(1 + d.incG * 0.5, y)) : 0;
  // Carbon burden: linear with income up to ~$500K ($15K cap), then hard caps for ultra-HNW.
  // Carbon taxes fall on consumption of carbon-intensive goods, not on income directly.
  // Even a billionaire household can only physically consume so much fossil fuel.
  const carbCap = (k === 'BILL' || k === 'ELON') ? 150000 : 15000;
  const carb = P.has('TAX') ? -Math.min(d.income / 68000 * 1800, carbCap) : 0;
  const progLost = P.has('PRE') ? -PROG_LOST[k] : 0;  // programs replaced (negative = lost benefit)
  const pre  = P.has('PRE') ? (5000 * d.hhSz) : 0;
  const cdiv = P.has('PRE') ? CARBON_DIV_PER_CAP * d.hhSz : 0;
  // AMCF: only liquidated fraction is cash income in cash flow chart
  const ag   = P.has('AMCF')  ? amcfG(y) * d.hhSz * liqRate(k, y) : 0;
  const pd   = P.has('PSU_D') ? psuDAt(k, y) : 0;
  const pc   = P.has('PSU_C') ? psuCAt(k, y) : 0;
  const net  = gross + clTax + taxRef + vat + lvt + carb + progLost + pre + cdiv + ag + pd + pc;
  const div  = norm ? Math.max(Math.abs(gross), 1) / 100 : 1;
  return { grossInc:gross/div, clTax:clTax/div, taxRef:taxRef/div, vat:vat/div, lvt:lvt/div,
    carb:carb/div, progLost:progLost/div, pre:pre/div, cdiv:cdiv/div,
    ag:ag/div, pd:pd/div, pc:pc/div, net:net/div };
}

const CF_BARS = [
  { key:'grossInc', name:'Gross Income',       fill:'#94a3b8', prov:null   },
  { key:'clTax',    name:'Income+Payroll Tax',  fill:'#dc2626', prov:null   },
  { key:'taxRef',   name:'Tax Reform Net',      fill:'#f97316', prov:'TAX'  },
  { key:'vat',      name:'VAT Burden',          fill:'#fca5a5', prov:'TAX'  },
  { key:'lvt',      name:'LVT Burden',          fill:'#fdba74', prov:'TAX'  },
  { key:'carb',     name:'Carbon Burden',       fill:'#fcd34d', prov:'TAX'  },
  { key:'progLost', name:'Programs Replaced',    fill:'#b91c1c', prov:'PRE'  },
  { key:'pre',      name:'Prebate',             fill:'#4ade80', prov:'PRE'  },
  { key:'cdiv',     name:'Carbon Dividend',     fill:'#86efac', prov:'PRE'  },
  { key:'ag',       name:'AMCF Liquidation',    fill:'#60a5fa', prov:'AMCF' },
  { key:'pd',       name:'PSU Dividends',       fill:'#c084fc', prov:'PSU_D'},
  { key:'pc',       name:'PSU Cashouts',        fill:'#fbbf24', prov:'PSU_C'},
];

function Chart8({ demos, P, snYear, view, normalizedBar }) {
  const timeData = useMemo(() => {
    const k = demos[0]; if (!k) return [];
    return YEARS.map(y => ({ year:y, ...cashFlowPt(k, y, y === 0 ? BASE_ONLY : P, normalizedBar) }));
  }, [demos[0], [...P].sort().join(','), normalizedBar]);

  const demosData = useMemo(() =>
    demos.map(k => ({ demo:DEMOS[k].short, ...cashFlowPt(k, snYear, P, normalizedBar) })),
  [demos.join(','), [...P].sort().join(','), snYear, normalizedBar]);

  if (!demos.length) return noData;
  const data = view === 'time' ? timeData : demosData;
  const xKey = view === 'time' ? 'year' : 'demo';
  const fmt  = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
  const activeBars = CF_BARS.filter(b => !b.prov || P.has(b.prov));
  const demoLabel = demos[0] ? DEMOS[demos[0]].label : '—';

  return (
    <div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
        {view === 'time'
          ? `${demoLabel} — cash flow components over 30 years.`
          : `All selected demographics — cash flow at Year ${snYear}.`}
        {' '}Positive bars = income & benefits. Negative bars = tax burdens. Line = net disposable
        {normalizedBar ? ' (% of gross income).' : '.'}
      </div>
      <ResponsiveContainer width="100%" height={390}>
        <ComposedChart data={data} margin={{ top:20, right:24, bottom: view==='demos' ? 10 : 30, left:90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey={xKey} tick={{ fill:'#475569', fontSize:11 }}
            label={view==='time' ? { value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 } : undefined}/>
          <YAxis tickFormatter={fmt} tick={{ fill:'#475569', fontSize:11 }} width={85}/>
          <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5}/>
          <Tooltip content={<TTip fmt={fmt} isBar={view==='demos'}/>}/>
          <Legend wrapperStyle={{ fontSize:11 }}/>
          {activeBars.map(b => (
            <Bar key={b.key} dataKey={b.key} name={b.name} stackId="cf" fill={b.fill} fillOpacity={0.85} radius={0}/>
          ))}
          <Line type="monotone" dataKey="net" name="Net Disposable" stroke="#0f172a"
            strokeWidth={2.5} dot={false} legendType="line"/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 10: WEALTH FLOW DIVERGING BAR                 ║
// ╚══════════════════════════════════════════════════════╝

function wealthFlowPt(k, y, P, norm) {
  const l = getNW(k, y, P);
  const clNW = getNW(k, y, BASE_ONLY).total;
  // Normalized: CL NW = 100% reference. base bar always anchors at 100%.
  // Tax impact absorbs both the explicit burden AND the Growth Tax compounding drag
  // (accordNWG < nwG), so high-wealth demos see a larger negative tax bar.
  // Floor prevents division by near-zero for negative-NW brackets in transition years.
  const div  = norm ? Math.max(clNW, DEMOS[k].income * 0.25, 1) / 100 : 1;
  const base = norm ? clNW : l.base;
  const tax  = norm ? (l.base - clNW + l.tax) : l.tax;  // compounding delta + explicit burden
  return { base:base/div, tax:tax/div, pre:l.pre/div, amcf:l.amcf/div,
    psuD:l.psuD/div, psuC:l.psuC/div, net:l.total/div };
}

const WF_BARS = [
  { key:'base', name:'Base NW (CL)',     fill:'#94a3b8', prov:null    },
  { key:'tax',  name:'Tax Impact',       fill:'#f97316', prov:'TAX'   },
  { key:'pre',  name:'Prebate Savings',  fill:'#4ade80', prov:'PRE'   },
  { key:'amcf', name:'AMCF Custodial',   fill:'#60a5fa', prov:'AMCF'  },
  { key:'psuD', name:'PSU Div Savings',  fill:'#c084fc', prov:'PSU_D' },
  { key:'psuC', name:'PSU Cashouts',     fill:'#fbbf24', prov:'PSU_C' },
];

// ── Row builders for CompositionTable ────────────────────────────────────────
// Each returns an array of { name, value, fill, isTotal? } for a given (demo, year, provisions).
// Row order is stable across years (same P ⇒ same schema), enabling year-column layout.

function wealthMixRows(k, y, P) {
  const d = DEMOS[k];
  const l = getNW(k, y, P);
  const b = Math.max(l.base, 0);
  const rows = [
    { name:'Home Equity',  value: b * d.homePct, fill:'#f97316' },
    { name:'401(k)',       value: b * d.k401Pct, fill:'#eab308' },
    { name:'Financial',   value: b * d.finPct,  fill:'#3b82f6' },
    { name:'Business',    value: b * d.bizPct,  fill:'#8b5cf6' },
    { name:'Other',       value: Math.max(0, b*(1-d.homePct-d.k401Pct-d.finPct-d.bizPct)), fill:'#94a3b8' },
  ];
  if (P.has('AMCF'))  rows.push({ name:'AMCF Units',    value: Math.max(l.amcf, 0), fill:'#60a5fa' });
  if (P.has('PSU_D')) rows.push({ name:'PSU Dividends', value: Math.max(l.psuD, 0), fill:'#a855f7' });
  if (P.has('PSU_C')) rows.push({ name:'PSU Cashouts',  value: Math.max(l.psuC, 0), fill:'#f59e0b' });
  rows.push({ name:'── TOTAL NET WORTH ──', value: l.total, fill:'', isTotal:true });
  return rows;
}

function cfRows(k, y, P) {
  const pt = cashFlowPt(k, y, P, false);
  const rows = [
    { name:'Gross Income',       value: pt.grossInc,  fill:'#94a3b8' },
    { name:'Income/Payroll Tax', value: pt.clTax,     fill:'#dc2626' },
  ];
  if (P.has('TAX')) {
    rows.push({ name:'Tax Reform Net',  value: pt.taxRef, fill:'#f97316' });
    rows.push({ name:'VAT Burden',      value: pt.vat,    fill:'#fca5a5' });
    rows.push({ name:'LVT Burden',      value: pt.lvt,    fill:'#fdba74' });
    rows.push({ name:'Carbon Burden',   value: pt.carb,   fill:'#fcd34d' });
  }
  if (P.has('PRE')) {
    rows.push({ name:'Programs Replaced', value: pt.progLost, fill:'#b91c1c' });
    rows.push({ name:'Prebate',           value: pt.pre,      fill:'#4ade80' });
    rows.push({ name:'Carbon Dividend',   value: pt.cdiv,     fill:'#86efac' });
  }
  if (P.has('AMCF'))  rows.push({ name:'AMCF Liquidation', value: pt.ag, fill:'#60a5fa' });
  if (P.has('PSU_D')) rows.push({ name:'PSU Dividends',    value: pt.pd, fill:'#c084fc' });
  if (P.has('PSU_C')) rows.push({ name:'PSU Cashouts',     value: pt.pc, fill:'#fbbf24' });
  rows.push({ name:'── NET DISPOSABLE ──', value: pt.net, fill:'', isTotal:true });
  return rows;
}

function wfRows(k, y, P) {
  const l   = getNW(k, y, P);
  const clNW = getNW(k, y, BASE_ONLY).total;
  const rows = [
    { name:'Base NW (Current Law)', value: clNW,  fill:'#94a3b8' },
  ];
  if (P.has('TAX'))   rows.push({ name:'Tax Impact',       value: l.tax,  fill:'#f97316' });
  if (P.has('PRE'))   rows.push({ name:'Prebate Savings',  value: l.pre,  fill:'#4ade80' });
  if (P.has('AMCF'))  rows.push({ name:'AMCF Custodial',  value: l.amcf, fill:'#60a5fa' });
  if (P.has('PSU_D')) rows.push({ name:'PSU Div Savings',  value: l.psuD, fill:'#c084fc' });
  if (P.has('PSU_C')) rows.push({ name:'PSU Cashouts',     value: l.psuC, fill:'#fbbf24' });
  rows.push({ name:'── TOTAL NET WORTH ──', value: l.total, fill:'', isTotal:true });
  return rows;
}

function Chart10({ demos, P, snYear, view, normalizedBar, logScale }) {
  const timeData = useMemo(() => {
    const k = demos[0]; if (!k) return [];
    return YEARS.map(y => ({ year:y, ...wealthFlowPt(k, y, y === 0 ? BASE_ONLY : P, normalizedBar) }));
  }, [demos[0], [...P].sort().join(','), normalizedBar]);

  const demosData = useMemo(() =>
    demos.map(k => ({ demo:DEMOS[k].short, ...wealthFlowPt(k, snYear, P, normalizedBar) })),
  [demos.join(','), [...P].sort().join(','), snYear, normalizedBar]);

  if (!demos.length) return noData;
  const data = view === 'time' ? timeData : demosData;
  const xKey = view === 'time' ? 'year' : 'demo';
  const fmt  = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
  const activeBars = WF_BARS.filter(b => !b.prov || P.has(b.prov));
  const demoLabel  = demos[0] ? DEMOS[demos[0]].label : '—';
  const yAxProps   = logScale && !normalizedBar ? { scale:'log', domain:[1,'auto'] } : {};

  return (
    <div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
        {view === 'time'
          ? `${demoLabel} — wealth accumulation components over 30 years.`
          : `All selected demographics — wealth flow at Year ${snYear}.`}
        {' '}Positive = wealth gains. Negative = tax drag. Line = net worth total.
        {normalizedBar ? ' Normalized to current-law NW at each year = 100%. Net line above 100% = richer than CL path; below = less wealthy than CL.' : ''}
      </div>
      <ResponsiveContainer width="100%" height={390}>
        <ComposedChart data={data} margin={{ top:20, right:24, bottom: view==='demos' ? 10 : 30, left:90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey={xKey} tick={{ fill:'#475569', fontSize:11 }}
            label={view==='time' ? { value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 } : undefined}/>
          <YAxis tickFormatter={fmt} tick={{ fill:'#475569', fontSize:11 }} width={85} {...yAxProps}/>
          <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5}/>
          <Tooltip content={<TTip fmt={fmt} isBar={view==='demos'}/>}/>
          <Legend wrapperStyle={{ fontSize:11 }}/>
          {activeBars.map(b => (
            <Bar key={b.key} dataKey={b.key} name={b.name} stackId="wf" fill={b.fill} fillOpacity={0.85} radius={0}/>
          ))}
          <Line type="monotone" dataKey="net" name="Net Worth" stroke="#0f172a"
            strokeWidth={2.5} dot={false} legendType="line"/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 9: CROSSOVER MOMENT                           ║
// ╚══════════════════════════════════════════════════════╝
function Chart9({ demos, P, logScale }) {
  const clProvs = new Set(['BASE']);

  const data = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? clProvs : P;   // Year 0 = both lines share CL baseline
    const r = { year: y };
    demos.forEach(k => {
      const cl  = getNW(k, y, clProvs).total;
      const acc = getNW(k, y, Q).total;
      r[`${k}_cl`]  = logScale ? Math.max(cl, 1)  : cl;
      r[`${k}_acc`] = logScale ? Math.max(acc, 1) : acc;
    });
    return r;
  }), [demos.join(','), [...P].sort().join(','), logScale]);

  // Find crossover years (start search from y=1 since y=0 is forced equal)
  const crossovers = useMemo(() => {
    const out = {};
    demos.forEach(k => {
      for (let y = 1; y <= 30; y++) {
        const cl  = getNW(k, y, clProvs).total;
        const acc = getNW(k, y, P).total;
        if (acc > cl) { out[k] = y; break; }
      }
    });
    return out;
  }, [demos.join(','), [...P].sort().join(',')]);

  if (!demos.length) return noData;
  const yAx = logScale ? { scale:'log', domain:[1,'auto'] } : {};

  return (
    <div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
        Solid lines = Accord net worth. Dashed lines = current law. Vertical markers show when
        Accord permanently overtakes status quo. Negative-wealth demographics cross immediately.
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top:10, right:20, bottom:20, left:90 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={{ fill:'#475569', fontSize:11 }}/>
          <YAxis tickFormatter={fD} tick={{ fill:'#475569', fontSize:11 }} width={85} {...yAx}/>
          <Tooltip content={<TTip fmt={fD}/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          {Object.entries(crossovers).map(([k, yr]) =>
            yr !== undefined && yr > 0 && yr < 31 ? (
              <ReferenceLine key={k} x={yr} stroke={DEMOS[k].color} strokeDasharray="4 2"
                label={{ value:`${DEMOS[k].short} Yr${yr}`, position:'top', fontSize:9, fill:DEMOS[k].color }}/>
            ) : null
          )}
          {demos.map(k => [
            <Line key={`${k}_acc`} dataKey={`${k}_acc`} name={`${DEMOS[k].label} (Accord)`}
              stroke={DEMOS[k].color} dot={false} strokeWidth={2.5}/>,
            <Line key={`${k}_cl`}  dataKey={`${k}_cl`}  name={`${DEMOS[k].label} (Current Law)`}
              stroke={DEMOS[k].color} dot={false} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}/>,
          ])}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  MAIN DASHBOARD                                      ║
// ╚══════════════════════════════════════════════════════╝

const CHART_TITLES = {
  1:  { title:'Average Annual Income', desc:'Household income under current law + each Accord provision. Tax layer is green (relief) or red (burden) per demographic.' },
  2:  { title:'Average Net Worth', desc:'Cumulative household wealth compounded over 30 years. Includes reinvested provision benefits. Log scale recommended for comparing across brackets.' },
  3:  { title:'Share of National Wealth', desc:'Each demographic\'s fraction of total US household wealth. AMCF + PSU provisions visibly expand lower-bracket shares over time.' },
  4:  { title:'Share of National Income', desc:'Each demographic\'s fraction of total US household income. Progressive provisions shift shares from top to bottom over 30 years.' },
  5:  { title:'Effective Tax Rate', desc:'(All taxes paid − all benefits received) ÷ gross income. Negative rates mean households receive more than they contribute. Toggle provisions to isolate each one\'s contribution.' },
  6:  { title:'Gini Coefficient', desc:'Whole-distribution inequality. Not demographic-specific — provision toggles show each one\'s contribution to equality. Solid = income Gini; dashed = wealth Gini.' },
  7:  { title:'Wealth Composition Breakdown', desc:'What household wealth is made of at the selected snapshot year. Lower brackets shift from thin financial holdings toward AMCF custodial + PSU equity.' },
  8:  { title:'Cash Flow Diverging Bar', desc:'Income sources (above 0) vs. tax burdens (below 0). Two views: one demographic over time, or all demographics at a snapshot year. Net line shows disposable income.' },
  9:  { title:'Crossover Moment', desc:'When does the Accord make each demographic permanently wealthier than the status quo? Year 0 = shared current law baseline. Accord provisions kick in at Year 1. Solid = Accord; dashed = current law.' },
  10: { title:'Wealth Flow Diverging Bar', desc:'Wealth accumulation components over time. Positive = gains (base NW, prebate savings, AMCF, PSU). Negative = tax drag. Net line = total Accord net worth. Year 0 = current law baseline for all.' },
};

const CHART_HAS_BAR       = new Set([1, 2, 7]);
const CHART_DEMO_AGNOSTIC = new Set([6]);
const CHART_SNAPSHOT_ONLY = new Set([7]);

export default function Dashboard() {
  const [activeChart, setActiveChart]   = useState(1);
  const [mode, setMode]                 = useState('line');
  const [snYear, setSnYear]             = useState(10);
  const [logScale, setLogScale]         = useState(false);
  const [activeDemos, setActiveDemos]   = useState(new Set(['P10','P50','T1']));
  // PSU_C (cashouts) defaults OFF — wealth event, not recurring income. Toggle on to include.
  const [activeProvs, setActiveProvs]   = useState(new Set(['BASE','TAX','PRE','AMCF','PSU_D']));
  const [stackedShare, setStackedShare] = useState(false);
  const [normalizedBar, setNormalizedBar] = useState(false);
  const [chart8View, setChart8View]     = useState('time');   // 'time' | 'demos'
  const [chart10View, setChart10View]   = useState('time');

  const toggleDemo = k => setActiveDemos(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const toggleProv = k => {
    if (k === 'BASE') return;
    setActiveProvs(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const demos = DEMO_KEYS.filter(k => activeDemos.has(k));
  const P = activeProvs;
  const chartTitle = CHART_TITLES[activeChart];

  const showMode       = CHART_HAS_BAR.has(activeChart) && activeChart !== 7;
  const showLogScale   = [1,2,3,4,9,10].includes(activeChart);
  const showStackShare = [3, 4].includes(activeChart);
  const showSnYear     = mode === 'bar' || CHART_SNAPSHOT_ONLY.has(activeChart);
  const showNormBar    = (CHART_HAS_BAR.has(activeChart) && mode === 'bar') || [7,8,10].includes(activeChart);
  const currentMode    = CHART_HAS_BAR.has(activeChart) ? mode : 'line';

  const s = {
    outer: { fontFamily:'system-ui,sans-serif', background:'#f1f5f9', minHeight:'100vh' },
    header: { background:'#0f172a', color:'#f8fafc', padding:'14px 24px', display:'flex',
      alignItems:'center', justifyContent:'space-between', gap:12 },
    title: { fontSize:17, fontWeight:800, letterSpacing:-0.3, color:'#f8fafc' },
    subtitle: { fontSize:11, color:'#94a3b8', marginTop:2 },
    tabs: { display:'flex', gap:4, overflowX:'auto', paddingBottom:2 },
    tab: (active) => ({
      padding:'5px 11px', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600, border:'none',
      background: active ? '#3b82f6' : '#1e293b',
      color: active ? '#fff' : '#94a3b8',
    }),
    body: { display:'flex', gap:0, minHeight:'calc(100vh - 56px)' },
    sidebar: { width:224, flexShrink:0, background:'#fff', borderRight:'1px solid #e2e8f0',
      overflowY:'auto', padding:'16px 12px' },
    sectionHead: { fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase',
      letterSpacing:0.8, marginBottom:8, marginTop:16 },
    main: { flex:1, padding:20, overflowY:'auto' },
    card: { background:'#fff', borderRadius:12, border:'1px solid #e2e8f0',
      padding:'20px 24px', marginBottom:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' },
    controls: { display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:16 },
    btn: (active, color) => ({
      padding:'5px 12px', borderRadius:6, border:`1.5px solid ${color || '#e2e8f0'}`,
      background: active ? (color || '#3b82f6') : '#fff',
      color: active ? '#fff' : (color || '#374151'),
      cursor:'pointer', fontSize:12, fontWeight:600,
    }),
    demoChip: (active, color) => ({
      display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px',
      borderRadius:20, border:`2px solid ${color}`, cursor:'pointer', fontSize:12, fontWeight:600,
      background: active ? color : '#fff',
      color: active ? '#fff' : color,
      marginBottom:5, marginRight:5, userSelect:'none',
    }),
    provRow: (active, color) => ({
      display:'flex', alignItems:'center', gap:8, padding:'6px 8px',
      borderRadius:6, cursor:'pointer', marginBottom:4,
      background: active ? `${color}18` : 'transparent',
      border: `1px solid ${active ? color : '#e2e8f0'}`,
    }),
    provDot: color => ({
      width:10, height:10, borderRadius:'50%', background:color, flexShrink:0,
    }),
    label: { fontSize:12, fontWeight:600, color:'#374151' },
    note: { fontSize:11, color:'#94a3b8', marginTop:4, lineHeight:1.5 },
  };

  const renderChart = () => {
    switch (activeChart) {
      case 1:  return <Chart1  demos={demos} P={P} mode={currentMode} snYear={snYear} logScale={logScale} normalizedBar={normalizedBar}/>;
      case 2:  return <Chart2  demos={demos} P={P} mode={currentMode} snYear={snYear} logScale={logScale} normalizedBar={normalizedBar}/>;
      case 3:  return <Chart3  demos={demos} P={P} stacked={stackedShare}/>;
      case 4:  return <Chart4  demos={demos} P={P} stacked={stackedShare}/>;
      case 5:  return <Chart5  demos={demos} P={P}/>;
      case 6:  return <Chart6  P={P}/>;
      case 7:  return <Chart7  demos={demos} P={P} snYear={snYear} normalizedBar={normalizedBar}/>;
      case 8:  return (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>View:</span>
            <button style={s.btn(chart8View==='time')}  onClick={() => setChart8View('time')}>Over Time</button>
            <button style={s.btn(chart8View==='demos', '#6366f1')} onClick={() => setChart8View('demos')}>All Demos (Yr {snYear})</button>
          </div>
          <Chart8 demos={demos} P={P} snYear={snYear} view={chart8View} normalizedBar={normalizedBar}/>
        </div>
      );
      case 9:  return <Chart9  demos={demos} P={P} logScale={logScale}/>;
      case 10: return (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:600, color:'#374151' }}>View:</span>
            <button style={s.btn(chart10View==='time')}  onClick={() => setChart10View('time')}>Over Time</button>
            <button style={s.btn(chart10View==='demos', '#6366f1')} onClick={() => setChart10View('demos')}>All Demos (Yr {snYear})</button>
          </div>
          <Chart10 demos={demos} P={P} snYear={snYear} view={chart10View} normalizedBar={normalizedBar} logScale={logScale}/>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div style={s.outer}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.title}>American Ownership Accord · Visualization Dashboard</div>
          <div style={s.subtitle}>10-chart interactive suite · 30-year trajectories · 2024 real dollars</div>
        </div>
        <div style={s.tabs}>
          {CHARTS.map(c => (
            <button key={c.id} style={s.tab(activeChart === c.id)}
              onClick={() => { setActiveChart(c.id); if (!CHART_HAS_BAR.has(c.id)) setMode('line'); }}>
              {c.id}. {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={s.body}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          {/* Demographics */}
          <div style={s.sectionHead}>Demographics</div>
          <div style={{ fontSize:10, color:'#94a3b8', marginBottom:8 }}>
            {CHART_DEMO_AGNOSTIC.has(activeChart)
            ? 'Chart 6 uses full distribution — demo toggles affect provisions only.'
            : (showStackShare && stackedShare)
              ? 'Stacked: demo toggles control which bands are shown. Unselected = gray "Other".'
              : [8,10].includes(activeChart)
                ? '"Over Time" uses first selected demo. "All Demos" shows all selected at snapshot year.'
                : 'Multi-select. Each adds a line or bar group.'}
          </div>
          {DEMO_KEYS.map(k => (
            <div key={k} style={s.demoChip(activeDemos.has(k), DEMOS[k].color)}
              onClick={() => toggleDemo(k)}>
              <span>{DEMOS[k].short}</span>
            </div>
          ))}

          {/* Provisions */}
          <div style={s.sectionHead}>Accord Provisions</div>
          <div style={{ fontSize:10, color:'#94a3b8', marginBottom:8 }}>Cumulative layers. Each adds its marginal effect.</div>
          {PROVS_CONFIG.map(p => (
            <div key={p.key} style={s.provRow(activeProvs.has(p.key), p.color)}
              onClick={() => toggleProv(p.key)}>
              <div style={s.provDot(p.color)}/>
              <span style={{ fontSize:12, color:'#374151', fontWeight: activeProvs.has(p.key) ? 600 : 400 }}>
                {p.label}
              </span>
              {p.fixed && <span style={{ fontSize:10, color:'#94a3b8', marginLeft:'auto' }}>always on</span>}
            </div>
          ))}

          {/* Snapshot year */}
          {(showSnYear || true) && (
            <div style={{ marginTop:16 }}>
              <div style={{ ...s.sectionHead, marginTop:0 }}>Snapshot Year: {snYear}</div>
              <input type="range" min={1} max={30} step={1} value={snYear}
                onChange={e => setSnYear(+e.target.value)}
                style={{ width:'100%' }}/>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#94a3b8' }}>
                <span>Yr 1</span><span>Yr 15</span><span>Yr 30</span>
              </div>
              <div style={{ fontSize:10, color:'#94a3b8', marginTop:4 }}>
                Used by bar charts, Charts 7/8/10 "All Demos" view.
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={s.main}>
          {/* Chart card */}
          <div style={s.card}>
            {/* Chart controls bar */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'#0f172a' }}>{chartTitle?.title}</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:3, maxWidth:600 }}>{chartTitle?.desc}</div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0, marginLeft:16, flexWrap:'wrap', justifyContent:'flex-end' }}>
                {showStackShare && (
                  <>
                    <button style={s.btn(!stackedShare)} onClick={() => setStackedShare(false)}>Line</button>
                    <button style={s.btn(stackedShare, '#6366f1')} onClick={() => setStackedShare(true)}>Stacked</button>
                  </>
                )}
                {showMode && (
                  <>
                    <button style={s.btn(mode==='line')} onClick={() => setMode('line')}>Line</button>
                    <button style={s.btn(mode==='bar')}  onClick={() => setMode('bar')}>Bar (Yr {snYear})</button>
                  </>
                )}
                {showNormBar && (
                  <button style={s.btn(normalizedBar, '#7c3aed')} onClick={() => setNormalizedBar(v => !v)}>
                    {normalizedBar ? '% ✓' : '100% / %'}
                  </button>
                )}
                {showLogScale && (
                  <button style={s.btn(logScale, '#0f172a')} onClick={() => setLogScale(v => !v)}>
                    {logScale ? 'Log ✓' : 'Log Scale'}
                  </button>
                )}
              </div>
            </div>

            {renderChart()}
          </div>

          {/* Key numbers reference */}
          {activeChart === 1 && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:10 }}>Year {snYear} Income Snapshot</div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {demos.map(k => {
                  const l   = getInc(k, snYear, P);
                  const cl  = getInc(k, snYear, BASE_ONLY);
                  const delta = l.total - cl.total;
                  const pct = cl.total > 0 ? delta / cl.total * 100 : null;
                  const pos = delta >= 0;
                  return (
                    <div key={k} style={{ padding:'10px 14px', borderRadius:8, border:`2px solid ${DEMOS[k].color}20`,
                      background:`${DEMOS[k].color}08`, minWidth:140 }}>
                      <div style={{ fontSize:11, color:DEMOS[k].color, fontWeight:700 }}>{DEMOS[k].label}</div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#0f172a', marginTop:2 }}>{fD(l.total)}</div>
                      <div style={{ fontSize:11, color: pos ? '#16a34a' : '#dc2626', marginTop:3 }}>
                        vs CL: {pos ? '+' : ''}{fD(delta)}
                      </div>
                      <div style={{ fontSize:11, color: pos ? '#16a34a' : '#dc2626', marginTop:1 }}>
                        {pct !== null ? `${pos ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeChart === 2 && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:10 }}>Year {snYear} Net Worth Snapshot</div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {demos.map(k => {
                  const l   = getNW(k, snYear, P);
                  const cl  = getNW(k, snYear, BASE_ONLY);
                  const delta = l.total - cl.total;
                  const pct = cl.total > 0 ? delta / cl.total * 100 : null;
                  const pos = delta >= 0;
                  return (
                    <div key={k} style={{ padding:'10px 14px', borderRadius:8, border:`2px solid ${DEMOS[k].color}20`,
                      background:`${DEMOS[k].color}08`, minWidth:140 }}>
                      <div style={{ fontSize:11, color:DEMOS[k].color, fontWeight:700 }}>{DEMOS[k].label}</div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#0f172a', marginTop:2 }}>{fD(l.total)}</div>
                      <div style={{ fontSize:11, color: pos ? '#16a34a' : '#dc2626', marginTop:3 }}>
                        vs CL: {pos ? '+' : ''}{fD(delta)}
                      </div>
                      <div style={{ fontSize:11, color: pos ? '#16a34a' : '#dc2626', marginTop:1 }}>
                        {pct !== null ? `${pos ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(activeChart === 3 || activeChart === 4) && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:10 }}>
                Year {snYear} {activeChart === 3 ? 'Wealth' : 'Income'} Share Snapshot
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {(() => {
                  const snapDemos = stackedShare ? DEMO_KEYS : demos;
                  let total = 0;
                  const vals = {};
                  DEMO_KEYS.forEach(k => {
                    const v = Math.max(
                      activeChart === 3 ? getNW(k, snYear, P).total : getInc(k, snYear, P).total, 0
                    ) * POP[k];
                    vals[k] = v; total += v;
                  });
                  return snapDemos.map(k => {
                    const share = total > 0 ? vals[k] / total * 100 : 0;
                    const clTotal = DEMO_KEYS.reduce((s, j) => s + Math.max(
                      activeChart === 3 ? getNW(j, snYear, BASE_ONLY).total : getInc(j, snYear, BASE_ONLY).total, 0
                    ) * POP[j], 0);
                    const clShare = clTotal > 0 ? Math.max(
                      activeChart === 3 ? getNW(k, snYear, BASE_ONLY).total : getInc(k, snYear, BASE_ONLY).total, 0
                    ) * POP[k] / clTotal * 100 : 0;
                    const delta = share - clShare;
                    return (
                      <div key={k} style={{ padding:'10px 14px', borderRadius:8,
                        border:`2px solid ${DEMOS[k].color}20`, background:`${DEMOS[k].color}08`, minWidth:120 }}>
                        <div style={{ fontSize:11, color:DEMOS[k].color, fontWeight:700 }}>{DEMOS[k].label}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', marginTop:2 }}>
                          {share.toFixed(2)}%
                        </div>
                        <div style={{ fontSize:11, color: delta <= 0 ? '#16a34a' : '#dc2626', marginTop:2 }}>
                          vs CL: {delta >= 0 ? '+' : ''}{delta.toFixed(2)}pp
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {activeChart === 9 && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:10 }}>Crossover Years (Accord NW exceeds Current Law)</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {demos.map(k => {
                  let crossover = null;
                  const clP = new Set(['BASE']);
                  for (let y = 1; y <= 30; y++) {
                    if (getNW(k, y, P).total > getNW(k, y, clP).total) { crossover = y; break; }
                  }
                  return (
                    <div key={k} style={{ padding:'8px 14px', borderRadius:8, border:`2px solid ${DEMOS[k].color}30`,
                      background:`${DEMOS[k].color}08`, minWidth:130 }}>
                      <div style={{ fontSize:11, color:DEMOS[k].color, fontWeight:700 }}>{DEMOS[k].label}</div>
                      <div style={{ fontSize:15, fontWeight:800, color: crossover !== null ? '#16a34a' : '#dc2626', marginTop:2 }}>
                        {crossover !== null ? `Year ${crossover}${crossover === 1 ? ' (immediate)' : ''}` : 'Beyond Yr 30'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ SNAPSHOT MATRIX TABLES & MINI CHARTS — trajectory view per active chart ═══ */}

          {activeChart === 1 && demos.length > 0 && (
            <div style={s.card}>
              <SnapshotTable title="Annual Income Trajectory"
                demos={demos}
                getValue={(k, y) => getInc(k, y, P).total}
                getCL={(k, y) => getInc(k, y, BASE_ONLY).total}
                fmt={fD}/>
            </div>
          )}

          {activeChart === 2 && demos.length > 0 && (
            <div style={s.card}>
              <SnapshotTable title="Net Worth Trajectory"
                demos={demos}
                getValue={(k, y) => getNW(k, y, P).total}
                getCL={(k, y) => getNW(k, y, BASE_ONLY).total}
                fmt={fD}/>
            </div>
          )}

          {activeChart === 3 && demos.length > 0 && (
            <div style={s.card}>
              <SnapshotTable title="Wealth Share Trajectory"
                note="Each demo's % of total national wealth. vs CL in percentage points."
                demos={demos}
                getValue={(k, y) => {
                  let t = 0; const v = {};
                  DEMO_KEYS.forEach(j => { const x = Math.max(getNW(j, y, P).total, 0)*POP[j]; v[j]=x; t+=x; });
                  return t > 0 ? v[k]/t*100 : 0;
                }}
                getCL={(k, y) => {
                  let t = 0; const v = {};
                  DEMO_KEYS.forEach(j => { const x = Math.max(getNW(j, y, BASE_ONLY).total, 0)*POP[j]; v[j]=x; t+=x; });
                  return t > 0 ? v[k]/t*100 : 0;
                }}
                fmt={v => v.toFixed(2)+'%'}
                deltaFmt={d => `${d>=0?'+':''}${d.toFixed(2)}pp`}/>
            </div>
          )}

          {activeChart === 4 && demos.length > 0 && (
            <div style={s.card}>
              <SnapshotTable title="Income Share Trajectory"
                note="Each demo's % of total national income. vs CL in percentage points."
                demos={demos}
                getValue={(k, y) => {
                  let t = 0; const v = {};
                  DEMO_KEYS.forEach(j => { const x = Math.max(getInc(j, y, P).total, 0)*POP[j]; v[j]=x; t+=x; });
                  return t > 0 ? v[k]/t*100 : 0;
                }}
                getCL={(k, y) => {
                  let t = 0; const v = {};
                  DEMO_KEYS.forEach(j => { const x = Math.max(getInc(j, y, BASE_ONLY).total, 0)*POP[j]; v[j]=x; t+=x; });
                  return t > 0 ? v[k]/t*100 : 0;
                }}
                fmt={v => v.toFixed(2)+'%'}
                deltaFmt={d => `${d>=0?'+':''}${d.toFixed(2)}pp`}/>
            </div>
          )}

          {activeChart === 5 && demos.length > 0 && (
            <div style={s.card}>
              <SnapshotTable title="Effective Tax Rate Trajectory"
                note="ETR = taxes minus prebate offset ÷ gross income. AMCF/PSU excluded (equity income). Negative = prebate > taxes. vs CL = change in ETR (pp)."
                demos={demos}
                getValue={(k, y) => getETR(k, y, P)}
                getCL={(k, y) => getETR(k, y, BASE_ONLY)}
                fmt={v => v.toFixed(1)+'%'}
                deltaFmt={d => `${d>=0?'+':''}${d.toFixed(1)}pp`}/>
            </div>
          )}

          {activeChart === 6 && (
            <div style={s.card}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Gini Coefficient Trajectory</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%' }}>
                  <thead>
                    <tr>
                      {['Year','Income Gini','Wealth Gini','Δ Income','Δ Wealth'].map((h, i) => (
                        <th key={h} style={{ padding:'5px 12px', fontWeight:700, borderBottom:'2px solid #e2e8f0',
                          textAlign: i===0 ? 'left' : 'right', background:'#f8fafc', fontSize:11, color:'#64748b', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SNAP_YEARS.map((y, i) => {
                      const Q_ = y === 0 ? BASE_ONLY : P;
                      const mk = (demos_, wgts_, pFn) => demos_.map((k, ii) => ({ v: Math.max(pFn(k, y).total, 0), w: wgts_[ii] }));
                      const incG  = Math.max(0, Math.min(0.99, computeGini(mk(GINI_INC_DEMOS, GINI_INC_WGTS, (k,y)=>getInc(k,y,Q_)))        + _gAnchor.inc));
                      const nwG_  = Math.max(0, Math.min(0.99, computeGini(mk(GINI_NW_DEMOS,  GINI_NW_WGTS,  (k,y)=>getNW(k,y,Q_)))         + _gAnchor.nw));
                      const clInc = Math.max(0, Math.min(0.99, computeGini(mk(GINI_INC_DEMOS, GINI_INC_WGTS, (k,y)=>getInc(k,y,BASE_ONLY))) + _gAnchor.inc));
                      const clNw  = Math.max(0, Math.min(0.99, computeGini(mk(GINI_NW_DEMOS,  GINI_NW_WGTS,  (k,y)=>getNW(k,y,BASE_ONLY)))  + _gAnchor.nw));
                      const dI = incG - clInc, dW = nwG_ - clNw;
                      const td = (v, color) => ({ padding:'4px 12px', textAlign:'right', fontSize:11, borderBottom:'1px solid #f1f5f9', color, fontWeight: color ? 600 : 'normal' });
                      return (
                        <tr key={y} style={{ background: i%2 ? '#f8fafc' : '#fff' }}>
                          <td style={{ padding:'4px 12px', fontWeight:600, color:'#64748b', fontSize:11, borderBottom:'1px solid #f1f5f9' }}>Yr {y}</td>
                          <td style={td(incG)}>{incG.toFixed(3)}</td>
                          <td style={td(nwG_)}>{nwG_.toFixed(3)}</td>
                          <td style={td(dI, dI<=0?'#16a34a':'#dc2626')}>{dI>=0?'+':''}{dI.toFixed(3)}</td>
                          <td style={td(dW, dW<=0?'#16a34a':'#dc2626')}>{dW>=0?'+':''}{dW.toFixed(3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeChart === 7 && demos.length > 0 && (
            <div style={s.card}>
              <CompositionTable
                title="Wealth Composition Breakdown — Component × Year"
                demos={demos}
                getRows={(k, y) => wealthMixRows(k, y, y === 0 ? BASE_ONLY : P)}
                note="Bars show relative magnitude within each component row across snapshot years. Values in 2024 real dollars."
              />
            </div>
          )}

          {activeChart === 8 && demos.length > 0 && (
            <div style={s.card}>
              <CompositionTable
                title="Cash Flow Breakdown — Component × Year"
                demos={demos}
                getRows={(k, y) => cfRows(k, y, y === 0 ? BASE_ONLY : P)}
                note="Negative values (taxes, burdens) shown in red. Positive values (income, benefits) in green. Bars scale to each row's peak across snapshot years."
              />
            </div>
          )}

          {activeChart === 9 && demos.length > 0 && (
            <div style={s.card}>
              <SnapshotTable title="Accord vs Current Law Net Worth Trajectory"
                demos={demos}
                getValue={(k, y) => getNW(k, y, P).total}
                getCL={(k, y) => getNW(k, y, BASE_ONLY).total}
                fmt={fD}/>
            </div>
          )}

          {activeChart === 10 && demos.length > 0 && (
            <div style={s.card}>
              <CompositionTable
                title="Wealth Flow Breakdown — Component × Year"
                demos={demos}
                getRows={(k, y) => wfRows(k, y, y === 0 ? BASE_ONLY : P)}
                note="Tax Impact is negative for most demographics (Growth Tax drag on capital appreciation). AMCF and PSU rows show cumulative wealth added vs current law baseline."
              />
            </div>
          )}

          {/* Methodology footer */}
          <div style={{ ...s.card, background:'#f8fafc' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:6 }}>Model Notes & Assumptions</div>
            <div style={{ fontSize:11, color:'#64748b', lineHeight:1.7, columns:2, gap:24 }}>
              <p style={{ marginTop:0 }}>All values in 2024 real (inflation-adjusted) dollars. <strong>Year 0 = current law baseline</strong> for all line charts — Accord provisions activate at Year 1, making the Year 0→1 jump visible. Bar charts and snapshot cards use the selected snapshot year with all active provisions.</p>
              <p>AMCF grants follow Sim-6 validated trajectory: $500/person (Yr 1) → $25,924/person (Yr 30). Custodial account: universal $10K at Year 0, 5% real return.</p>
              <p>PSU provisions ramp from 0→100% over 4.1 years (avg tenure), then grow at 7.5%/yr as equity base appreciates. Billionaires and Elon Musk receive no PSU (capital owners, not employees).</p>
              <p>Tax reform net change (TAX toggle) is the annual household-level delta vs current law: accounts for new two-rate income tax (25%/50%), 4% VAT burden, 10% LVT, $100/ton carbon pass-through, vs income tax cuts. Positive = net burden; negative = net relief.</p>
              <p>Accord NW growth rate for high-wealth demographics is reduced vs current law to capture the 20% Growth Tax excise compounding effect on equity appreciation (Elon: 15%→12%/yr; Billionaires: 12%→9.5%/yr).</p>
              <p>Charts 8 &amp; 10 (diverging bar): positive values stack above zero (income, benefits, wealth gains), negative values stack below zero (taxes, burdens). Net line shows total. "% / 100%" toggle normalizes to % of gross income (Ch.8) or base CL net worth (Ch.10). "All Demos" view shows all selected demographics at snapshot year.</p>
              <p>Gini: computed from full 13-point distribution (B10→Elon) for both income and wealth Gini. Population weights: deciles at 10% each, T10 9%, T1 0.94%, Billionaires 6e-6, Elon 7.5e-9. Anchor-calibrated to match official US statistics at Year 0. Lorenz trapezoid method.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
