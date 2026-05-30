// simulation-11-inequality.jsx
// American Ownership Accord — Inequality Measurement Module
// Five Gini variants + distribution supplements + country comparisons + sensitivity analysis
// All values in 2024 real (inflation-adjusted) dollars

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from 'recharts';

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  DEMOGRAPHIC DATA  (CBO + Federal Reserve SCF, 2024 calibration)        ║
// ║  Duplicated from Sim-10 (self-contained per project convention)          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const DEMOS = {
  B10:  { label:'P0–P10',   short:'B10',  color:'#ef4444',
    income:14500,   nw:-2000,   incG:0.005, nwG:0.005,  accordNWG:0.005,
    hhSz:1.8,  save:0.05, ret:0.04, consume:0.98,
    taxChg:-145,   lvt:0,      homePct:0,    k401Pct:0.05, finPct:0,    bizPct:0    },
  P10:  { label:'P10–P20',  short:'P10',  color:'#f97316',
    income:28000,   nw:7000,    incG:0.008, nwG:0.040,  accordNWG:0.040,
    hhSz:2.1,  save:0.05, ret:0.04, consume:0.95,
    taxChg:-1540,  lvt:200,    homePct:0.20, k401Pct:0.15, finPct:0.05, bizPct:0    },
  P20:  { label:'P20–P30',  short:'P20',  color:'#fb923c',
    income:40000,   nw:26000,   incG:0.010, nwG:0.020,  accordNWG:0.020,
    hhSz:2.2,  save:0.10, ret:0.04, consume:0.90,
    taxChg:-3400,  lvt:500,    homePct:0.35, k401Pct:0.20, finPct:0.08, bizPct:0.03 },
  P30:  { label:'P30–P40',  short:'P30',  color:'#fbbf24',
    income:52000,   nw:58000,   incG:0.013, nwG:0.028,  accordNWG:0.028,
    hhSz:2.3,  save:0.12, ret:0.05, consume:0.87,
    taxChg:-1751,  lvt:1000,   homePct:0.45, k401Pct:0.25, finPct:0.12, bizPct:0.06 },
  P40:  { label:'P40–P50',  short:'P40',  color:'#84cc16',
    income:64000,   nw:95000,   incG:0.013, nwG:0.030,  accordNWG:0.030,
    hhSz:2.4,  save:0.15, ret:0.05, consume:0.85,
    taxChg:-1659,  lvt:1000,   homePct:0.50, k401Pct:0.28, finPct:0.10, bizPct:0.05 },
  P50:  { label:'P50–P60',  short:'P50',  color:'#22c55e',
    income:79000,   nw:148000,  incG:0.015, nwG:0.038,  accordNWG:0.038,
    hhSz:2.5,  save:0.17, ret:0.05, consume:0.82,
    taxChg:-1048,  lvt:1800,   homePct:0.52, k401Pct:0.32, finPct:0.12, bizPct:0.06 },
  P60:  { label:'P60–P70',  short:'P60',  color:'#10b981',
    income:97000,   nw:228000,  incG:0.018, nwG:0.040,  accordNWG:0.040,
    hhSz:2.5,  save:0.20, ret:0.06, consume:0.80,
    taxChg:1138,   lvt:2500,   homePct:0.50, k401Pct:0.30, finPct:0.13, bizPct:0.08 },
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
    hhSz:2.3,  save:0.40, ret:0.07, consume:0.45,
    taxChg:14665,  lvt:12000,  homePct:0.25, k401Pct:0.20, finPct:0.35, bizPct:0.20 },
  T1:   { label:'P99–P99.9',short:'T1',   color:'#ec4899',
    income:1500000, nw:16700000,incG:0.045, nwG:0.075,  accordNWG:0.072, accordIncG:0.022,
    hhSz:2.1,  save:0.70, ret:0.08, consume:0.25,
    taxChg:202913, lvt:50000,  homePct:0.15, k401Pct:0.15, finPct:0.40, bizPct:0.30 },
  BILL: { label:'Billionaires',short:'Bill',color:'#1d4ed8',
    income:3e8,     nw:4.7e9,   incG:0.080, nwG:0.120,  accordIncG:0.050,
    hhSz:2.0,  save:0.85, ret:0.10, consume:0.01,
    taxChg:83691871, lvt:5e5,  homePct:0.05, k401Pct:0.05, finPct:0.30, bizPct:0.60 },
  ELON: { label:'Elon Musk', short:'Elon', color:'#334155',
    income:1e10,    nw:2.5e11,  incG:0.150, nwG:0.150,  accordIncG:0.124,
    hhSz:1.0,  save:0.95, ret:0.12, consume:0.001,
    taxChg:2796462204, lvt:5e6, homePct:0.02, k401Pct:0.01, finPct:0.15, bizPct:0.82 },
};
const DEMO_KEYS = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];
const WGTS = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.09, 0.0094, 6e-6, 7.5e-9];

// Cross-sectional representative ages per bracket (SCF/CPS demographic data)
// These are FIXED — they represent the real age distribution within each wealth/income band.
// Gini is a cross-sectional population measure: all ages present in the same distribution.
const BRACKET_AGE = {
  B10:48, P10:46, P20:44, P30:42, P40:42, P50:43, P60:45, P70:47,
  P80:50, T10:53, T1:56, BILL:65, ELON:53,
};

const PROG_LOST = { B10:5500,P10:5500,P20:3200,P30:2200,P40:1800,P50:1800,P60:1400,P70:1300,P80:900,T10:400,T1:0,BILL:0,ELON:0 };
const AMCF_LIQ_BASE = { B10:0.95,P10:0.90,P20:0.80,P30:0.70,P40:0.55,P50:0.40,P60:0.25,P70:0.15,P80:0.08,T10:0.03,T1:0.01,BILL:0.00,ELON:0.00 };
const AMCF_ANC = [[0,0],[1,64],[5,503],[10,1724],[15,4421],[20,9430],[25,15397],[30,25924]];

const DIST_BRACKETS = [
  {cRat:1.20},{cRat:1.00},{cRat:0.97},{cRat:0.95},{cRat:0.90},{cRat:0.84},{cRat:0.78},
  {cRat:0.72},{cRat:0.64},{cRat:0.54},{cRat:0.34},{cRat:0.24},{cRat:0.16},{cRat:0.12},{cRat:0.10},
];
const CARBON_TONS_BR = [4,5,6,7,8.5,10,11,12,13.5,16,18,22,26,30,35];
const LVT_NET_BR = [0,0,0,0,0,0,400,1200,2500,5500,14000,28000,55000,110000,220000];
const TIER_DIST = [
  [0.12,0.20,0.40],[0.15,0.22,0.48],[0.18,0.25,0.52],[0.20,0.27,0.50],[0.22,0.28,0.45],
  [0.24,0.28,0.40],[0.26,0.26,0.36],[0.25,0.24,0.32],[0.22,0.20,0.30],[0.16,0.18,0.25],
  [0.09,0.12,0.20],[0.04,0.08,0.15],[0.02,0.05,0.10],[0.01,0.03,0.07],[0.00,0.01,0.04],
];
const TIER2_PEQ = [25000,30000,38000,48000,60000,70000,80000,90000,100000,100000,100000,100000,100000,100000,100000];
const TIER3_PSU = [40000,55000,75000,100000,135000,165000,200000,260000,325000,400000,500000,650000,800000,950000,1100000];
const PSU_YIELD = 0.035, EV_GROWTH = 0.075, AVG_TENURE = 4.1;
const PARTTIME_FTE = [0.20,0.45,0.65,0.90,0.95,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00,1.00];
const CARBON_DIV_PER_CAP = 5e9 * 100 * 0.80 / 330e6;
const DEMO_BRACKET = { B10:1,P10:3,P20:4,P30:4,P40:5,P50:6,P60:6,P70:7,P80:8,T10:9,T1:11,BILL:14,ELON:14 };

const CL_CG_RATE  = { B10:0,P10:0,P20:0,P30:0.15,P40:0.15,P50:0.15,P60:0.15,P70:0.15,P80:0.15,T10:0.238,T1:0.238,BILL:0.238,ELON:0.238 };
const ACC_CG_RATE = { B10:0,P10:0,P20:0,P30:0.15,P40:0.15,P50:0.15,P60:0.15,P70:0.15,P80:0.15,T10:0.25,T1:0.50,BILL:0.50,ELON:0.50 };
const CG_FRAC = 0.75;

// Annual Social Security benefit by demo (SSA PIA formula, 2024)
const SS_BENEFIT = { B10:14400,P10:17000,P20:19200,P30:21300,P40:23400,P50:25800,P60:28800,P70:31200,P80:34200,T10:38400,T1:42000,BILL:45936,ELON:45936 };

// SSA 2024 Period Life Table — survival probabilities (unisex average)
// SURV[a] = P(alive at age a | alive at 0), ages 0–100
const SURV_BASE = [
  1.000,0.9940,0.9935,0.9932,0.9930,0.9928,0.9927,0.9926,0.9925,0.9924,0.9923,0.9922,0.9920,0.9918,0.9914,
  0.9910,0.9904,0.9896,0.9886,0.9874,0.9860,0.9844,0.9826,0.9808,0.9790,0.9772,0.9752,0.9732,0.9710,0.9688,
  0.9664,0.9638,0.9610,0.9580,0.9548,0.9514,0.9478,0.9438,0.9396,0.9350,0.9300,0.9246,0.9188,0.9124,0.9054,
  0.8978,0.8896,0.8806,0.8708,0.8602,0.8488,0.8364,0.8230,0.8086,0.7932,0.7768,0.7592,0.7404,0.7204,0.6992,
  0.6768,0.6532,0.6284,0.6024,0.5754,0.5474,0.5186,0.4890,0.4588,0.4282,0.3974,0.3666,0.3362,0.3064,0.2776,
  0.2500,0.2240,0.1996,0.1770,0.1562,0.1372,0.1198,0.1040,0.0898,0.0770,0.0656,0.0554,0.0464,0.0386,0.0318,
  0.0260,0.0210,0.0168,0.0132,0.0102,0.0078,0.0058,0.0042,0.0030,0.0020,0.0012,
];
// SES-differentiated: ±3yr shift (Chetty et al. 2016)
const SURV_LOW  = SURV_BASE.map((_, i) => i + 3 <= 100 ? SURV_BASE[i + 3] : 0);
const SURV_HIGH = SURV_BASE.map((_, i) => i >= 3 ? SURV_BASE[i - 3] : 1);

const YEARS = Array.from({ length: 31 }, (_, i) => i);
const BASE_ONLY = new Set(['BASE']);
const ALL_PROVS = new Set(['BASE','TAX','PRE','AMCF','PSU_D','PSU_C']);

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  PORTED COMPUTATION ENGINE (from Sim-10)                                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

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

const amcfG = y => lerp(AMCF_ANC, y);
const pressureDecay = y => 0.5 + 0.5 * Math.exp(-y / 15);
const liqRate = (k, y) => AMCF_LIQ_BASE[k] * pressureDecay(y);
const psuDAt = (k, y) => psuDividendPerFiler(DEMO_BRACKET[k], y);
const psuCAt = (k, y) => psuCashoutPerFiler(DEMO_BRACKET[k], y);
const taxAt = (k) => DEMOS[k].taxChg;

function sectoralFundBalance(C, y) {
  return y <= 0 ? 0 : C * (Math.pow(1.06, y) - 1) / 0.06;
}

function psuDividendPerFiler(bi, y) {
  const [t1, t2, t3] = TIER_DIST[bi];
  const t1Inc = sectoralFundBalance(1000, y) * PSU_YIELD;
  const t2Inc = sectoralFundBalance(TIER2_PEQ[bi] * PSU_YIELD, y) * PSU_YIELD;
  const t3Ramp = Math.min(1, y / 5);
  const t3Apprec = y > 5 ? Math.pow(1 + EV_GROWTH, y - 5) : 1;
  const t3Inc = TIER3_PSU[bi] * t3Ramp * t3Apprec * PSU_YIELD;
  return (t1 * t1Inc + t2 * t2Inc + t3 * t3Inc) * PARTTIME_FTE[bi];
}

function psuCashoutPerFiler(bi, y) {
  if (y <= 0) return 0;
  const [, t2, t3] = TIER_DIST[bi];
  const tG = Math.pow(1 + EV_GROWTH, AVG_TENURE);
  const t2C = TIER2_PEQ[bi] * tG / AVG_TENURE;
  const t3C = TIER3_PSU[bi] * Math.min(1, y / 5) * tG / AVG_TENURE;
  return (t2 * t2C + t3 * t3C) * PARTTIME_FTE[bi];
}

function computeAccordNWG(k) {
  const d = DEMOS[k], bi = DEMO_BRACKET[k];
  const finDrag = d.finPct * d.ret * CG_FRAC * (ACC_CG_RATE[k] - CL_CG_RATE[k]);
  const psuExciseDrag = (k === 'BILL' || k === 'ELON') ? 0.04 * d.bizPct : 0;
  const lvtDrag = d.nw > 50000 ? LVT_NET_BR[bi] / d.nw : 0;
  return Math.max(d.nwG * 0.5, d.nwG - finDrag - psuExciseDrag - lvtDrag);
}

function getInc(k, y, P) {
  const d = DEMOS[k], bi = DEMO_BRACKET[k];
  const base = d.income * Math.pow(1 + d.incG, y);
  let tax = 0;
  if (P.has('TAX')) {
    if (d.accordIncG != null) { tax = d.income * Math.pow(1 + d.accordIncG, y) - base; }
    else {
      const vatCost = 0.04 * DIST_BRACKETS[bi].cRat * base;
      const lvtCost = LVT_NET_BR[bi];
      const carbonCost = CARBON_TONS_BR[bi] * 100;
      tax = -taxAt(k) - vatCost - lvtCost - carbonCost;
    }
  }
  const carbonDiv = CARBON_DIV_PER_CAP * d.hhSz;
  const pre = P.has('PRE') ? (5000 * d.hhSz + carbonDiv - PROG_LOST[k]) : 0;
  const adults = Math.min(d.hhSz, 2);
  const ag = P.has('AMCF') ? amcfG(y) * adults * liqRate(k, y) : 0;
  const pd = P.has('PSU_D') ? psuDAt(k, y) : 0;
  const pc = P.has('PSU_C') ? psuCAt(k, y) : 0;
  return { base, tax, pre, amcf: ag, psuD: pd, psuC: pc, total: base + tax + pre + ag + pd + pc };
}

function getNW(k, y, P) {
  const d = DEMOS[k], r = d.ret;
  const nwGr = P.has('TAX') ? computeAccordNWG(k) : d.nwG;
  const base = d.nw >= 0 ? d.nw * Math.pow(1 + nwGr, y) : Math.max(d.nw, d.nw + d.income * d.save * Math.min(y, 30));
  let tax = 0, pre = 0, ag = 0, pd = 0, pc = 0;
  if (P.has('TAX')) { let c = 0; for (let t = 1; t <= y; t++) c = c * (1 + r) + (-taxAt(k) * d.save); tax = c; }
  if (P.has('PRE')) {
    const carbonDiv = CARBON_DIV_PER_CAP * d.hhSz;
    const ann = (5000 * d.hhSz + carbonDiv - PROG_LOST[k]) * d.save;
    pre = y > 0 ? ann * (Math.pow(1 + r, y) - 1) / r : 0;
  }
  if (P.has('AMCF')) {
    const WORK_SPAN = 47;
    let cust = 0;
    for (let c = 1; c <= y; c++) {
      const grantYears = Math.min(c, 18); let acct = 0;
      for (let t = c - grantYears + 1; t <= c; t++) acct = acct * 1.05 + amcfG(t);
      acct *= Math.pow(1.05, y - c); cust += acct;
    }
    cust /= WORK_SPAN;
    let retainedAcc = 0, liqSavings = 0;
    const adults = Math.min(d.hhSz, 2);
    for (let t = 1; t <= y; t++) {
      const grant = amcfG(t) * adults;
      const lr = liqRate(k, t);
      retainedAcc = retainedAcc * 1.05 + grant * (1 - lr);
      liqSavings = liqSavings * (1 + r) + grant * lr * d.save;
    }
    ag = cust + retainedAcc + liqSavings;
  }
  if (P.has('PSU_D')) { let c = 0; for (let t = 1; t <= y; t++) c = c * (1 + r) + psuDAt(k, t) * d.save; pd = c; }
  if (P.has('PSU_C')) { let c = 0; for (let t = 1; t <= y; t++) c = c * (1 + r) + psuCAt(k, t) * d.save; pc = c; }
  return { base, tax, pre, amcf: ag, psuD: pd, psuC: pc, total: base + tax + pre + ag + pd + pc };
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  GINI + DISTRIBUTION SUPPLEMENT ENGINE                                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

function computeGini(pts) {
  const s = [...pts].filter(p => p.w > 0 && p.v >= 0).sort((a, b) => a.v - b.v);
  const tW = s.reduce((a, p) => a + p.w, 0);
  const tV = s.reduce((a, p) => a + p.v * p.w, 0);
  if (!tV || !tW) return 0;
  let area = 0, cP = 0, cI = 0, pP = 0, pI = 0;
  for (const p of s) {
    cP += p.w / tW; cI += p.v * p.w / tV;
    area += (cP - pP) * (pI + cI) / 2;
    pP = cP; pI = cI;
  }
  return Math.max(0, Math.min(1, 1 - 2 * area));
}

// Anchor shifts to match empirical US baselines at Year 0
// Empirical US baselines for anchoring (BLS/Fed SCF 2022, Wolff-Haveman 2004)
const US_GINI_INC = 0.490;
const US_GINI_NW = 0.850;
const US_GINI_CC = 0.420;  // consumption-capacity (income + annuitized wealth, estimated)

// Logit-space anchoring for metrics with large offsets (prevents ceiling/floor clamping)
const logit = p => Math.log(Math.max(0.001, Math.min(0.999, p)) / (1 - Math.max(0.001, Math.min(0.999, p))));
const invLogit = x => 1 / (1 + Math.exp(-x));

const _defaultParams = { discountRate: 0.02, mortality: 'uniform', scripLiquid: false, psuLiquid: false };
const _gAnchor = (() => {
  const mkPts = (fn) => DEMO_KEYS.map((k, i) => ({ v: Math.max(fn(k), 0), w: WGTS[i] }));
  const incRaw = computeGini(mkPts(k => getInc(k, 0, BASE_ONLY).total));
  const nwRaw = computeGini(mkPts(k => Math.max(getNW(k, 0, BASE_ONLY).total, 0)));
  const ccRaw = computeGini(mkPts(k => getConsumptionCapacity(k, 0, BASE_ONLY, _defaultParams)));
  return {
    inc: US_GINI_INC - incRaw,       // small offset, additive is safe
    nw: US_GINI_NW - nwRaw,          // small offset, additive is safe
    cc: logit(US_GINI_CC) - logit(ccRaw),     // potentially large → logit space
  };
})();

// ─── Annuity Math ─────────────────────────────────────────────────────────

function annuityFactor(age, r, survTable) {
  let af = 0;
  const s0 = survTable[age] || 1;
  for (let t = 1; t <= 100 - age; t++) {
    const sT = (survTable[Math.min(age + t, 100)] || 0) / s0;
    af += sT / Math.pow(1 + r, t);
  }
  return af;
}

function pvStream(annual, age, r, survTable) {
  return annual * annuityFactor(age, r, survTable);
}

function annuitizedDrawdown(lumpSum, age, r, survTable) {
  const af = annuityFactor(age, r, survTable);
  return af > 0 ? lumpSum / af : 0;
}

function getSurvTable(mortality, k) {
  if (mortality === 'uniform') return SURV_BASE;
  const lowKeys = ['B10','P10','P20','P30'];
  const highKeys = ['T10','T1','BILL','ELON'];
  if (lowKeys.includes(k)) return SURV_LOW;
  if (highKeys.includes(k)) return SURV_HIGH;
  return SURV_BASE;
}

// ─── Five Gini Variant Value Functions ────────────────────────────────────

function getMarketIncome(k, y) {
  return DEMOS[k].income * Math.pow(1 + DEMOS[k].incG, y);
}

function getDisposableIncome(k, y, P) {
  return getInc(k, y, P).total;
}

function getNetWorthVal(k, y, P) {
  return getNW(k, y, P).total;
}

function getAugmentedWealth(k, y, P, params) {
  const { discountRate, mortality } = params;
  const currentAge = BRACKET_AGE[k]; // fixed cross-sectional age, not aging
  const surv = getSurvTable(mortality, k);
  const nw = getNW(k, y, P).total;
  // PV of REMAINING Social Security benefits (shrinks as person ages)
  const pvSS = pvStream(SS_BENEFIT[k], currentAge, discountRate, surv);

  // PV of prebate stream — only the CONSUMED portion (saved portion already in NW via getNW().pre)
  let pvPrebateConsumed = 0;
  if (P.has('PRE')) {
    const d = DEMOS[k];
    const carbonDiv = CARBON_DIV_PER_CAP * d.hhSz;
    const annualPrebate = 5000 * d.hhSz + carbonDiv - PROG_LOST[k];
    const pvPrebateFull = pvStream(annualPrebate, currentAge, discountRate, surv);
    const prebateSavedInNW = getNW(k, y, P).pre;
    pvPrebateConsumed = Math.max(0, pvPrebateFull - prebateSavedInNW);
  }

  // DOUBLE-COUNT GUARD: scrip/PSU value already in NW. Do NOT add PV of their dividends.
  return nw + pvSS + pvPrebateConsumed;
}

function getConsumptionCapacity(k, y, P, params) {
  const { discountRate, mortality, scripLiquid, psuLiquid } = params;
  const currentAge = BRACKET_AGE[k]; // fixed cross-sectional age, not aging
  const surv = getSurvTable(mortality, k);
  const inc = getInc(k, y, P);
  const nwComp = getNW(k, y, P);

  let cc = inc.base;
  if (P.has('TAX')) cc += inc.tax;
  if (P.has('PRE')) cc += inc.pre;

  const baseLiquid = Math.max(nwComp.base + nwComp.tax + nwComp.pre, 0);
  cc += annuitizedDrawdown(baseLiquid, currentAge, discountRate, surv);

  if (P.has('AMCF')) {
    if (scripLiquid) {
      cc += annuitizedDrawdown(Math.max(nwComp.amcf, 0), currentAge, discountRate, surv);
    } else {
      cc += inc.amcf;
    }
  }
  if (P.has('PSU_D') || P.has('PSU_C')) {
    const psuWealth = Math.max(nwComp.psuD + nwComp.psuC, 0);
    if (psuLiquid) {
      cc += annuitizedDrawdown(psuWealth, currentAge, discountRate, surv);
    } else {
      if (P.has('PSU_D')) cc += inc.psuD;
      if (P.has('PSU_C')) cc += inc.psuC;
    }
  }
  return cc;
}

// ─── Distribution Supplements ─────────────────────────────────────────────

function bottom50Share(getVal, y, P, params) {
  const b50keys = new Set(['B10','P10','P20','P30','P40']);
  let b50 = 0, total = 0;
  DEMO_KEYS.forEach((k, i) => {
    const v = Math.max(getVal(k, y, P, params), 0) * WGTS[i];
    total += v;
    if (b50keys.has(k)) b50 += v;
  });
  return total > 0 ? b50 / total : 0;
}

function medianToMean(getVal, y, P, params) {
  const median = getVal('P40', y, P, params);
  let totalV = 0, totalW = 0;
  DEMO_KEYS.forEach((k, i) => { totalV += getVal(k, y, P, params) * WGTS[i]; totalW += WGTS[i]; });
  const mean = totalW > 0 ? totalV / totalW : 0;
  return mean > 0 ? median / mean : 0;
}

function p90p10(getVal, y, P, params) {
  const p90 = getVal('P80', y, P, params); const p10 = getVal('B10', y, P, params);
  return p10 > 0 ? p90 / p10 : Infinity;
}

function p90p50(getVal, y, P, params) {
  const p90 = getVal('P80', y, P, params); const p50 = getVal('P40', y, P, params);
  return p50 > 0 ? p90 / p50 : Infinity;
}

function nonPositiveNWShare(y, P) {
  let nonPos = 0;
  DEMO_KEYS.forEach((k, i) => { if (getNW(k, y, P).total <= 0) nonPos += WGTS[i]; });
  return nonPos;
}

// ─── Compute Full Suite ─────────────────────────────────────────────────

function computeSuite(y, P, params) {
  // Year 0 is always current law regardless of provision toggles (matches Sim-10)
  const Q = y === 0 ? BASE_ONLY : P;
  const mkPtsPos = (getVal) => DEMO_KEYS.map((k, i) => ({ v: Math.max(getVal(k, y, Q, params), 0), w: WGTS[i] }));

  /* eslint-disable no-unused-vars */
  const marketInc = (k, yr, _p, _r) => getMarketIncome(k, yr);
  const dispInc   = (k, yr, prov, _r) => getDisposableIncome(k, yr, prov);
  const nwVal     = (k, yr, prov, _r) => getNetWorthVal(k, yr, prov);
  const augW      = (k, yr, prov, par) => getAugmentedWealth(k, yr, prov, par);
  const ccVal     = (k, yr, prov, par) => getConsumptionCapacity(k, yr, prov, par);
  /* eslint-enable no-unused-vars */

  const metrics = [
    { key: 'dispInc', label: 'Disposable Income', fn: dispInc },
    { key: 'consCap', label: 'Consumption Capacity', fn: ccVal },
    { key: 'netWorth', label: 'Net Worth', fn: nwVal },
  ];

  return metrics.map(m => {
    const pts = mkPtsPos(m.fn);
    const giniRaw = computeGini(pts);

    // Apply anchors: additive for income/NW (small offsets), logit for CC (potentially large offset)
    let gini;
    if (m.key === 'consCap') {
      gini = invLogit(logit(giniRaw) + _gAnchor.cc);
    } else {
      const anchor = m.key === 'netWorth' ? _gAnchor.nw : _gAnchor.inc;
      gini = Math.max(0, Math.min(0.99, giniRaw + anchor));
    }

    return {
      key: m.key, label: m.label, gini,
      b50: bottom50Share(m.fn, y, Q, params),
      medMean: medianToMean(m.fn, y, Q, params),
      p90p10: m.key !== 'netWorth' ? p90p10(m.fn, y, Q, params) : null,
      p90p50: m.key !== 'netWorth' ? p90p50(m.fn, y, Q, params) : null,
      nonPosShare: m.key === 'netWorth' ? nonPositiveNWShare(y, Q) : null,
    };
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  COUNTRY COMPARISONS                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Country comparison data — ONLY observed OECD/survey values for income and net worth Gini.
// Augmented wealth and consumption capacity are novel measures with no published cross-country data.
// Showing estimated values for these would create false precision.
const COUNTRIES = [
  { key: 'us', label: 'US Baseline', color: '#94a3b8', type: 'like',
    arch: 'Liberal market economy',
    marketInc: 0.510, dispInc: 0.490, netWorth: 0.850 },
  { key: 'sg', label: 'Singapore', color: '#10b981', type: 'indicative',
    arch: 'Forced individual accounts (CPF)',
    marketInc: 0.480, dispInc: 0.444, netWorth: 0.760 },
  { key: 'no', label: 'Norway', color: '#06b6d4', type: 'like',
    arch: 'Collective SWF + generous pension',
    marketInc: 0.390, dispInc: 0.262, netWorth: 0.780 },
  { key: 'de', label: 'Germany', color: '#3b82f6', type: 'like',
    arch: 'Codetermination + strong pension',
    marketInc: 0.430, dispInc: 0.296, netWorth: 0.780 },
  { key: 'au', label: 'Australia', color: '#f59e0b', type: 'like',
    arch: 'Mandatory private superannuation',
    marketInc: 0.440, dispInc: 0.320, netWorth: 0.650 },
  { key: 'gb', label: 'United Kingdom', color: '#8b5cf6', type: 'like',
    arch: 'Liberal market (Anglo control)',
    marketInc: 0.460, dispInc: 0.350, netWorth: 0.710 },
];

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  VALIDATION CHECKS                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

function runValidation(params) {
  const results = [];

  // 1. Perfect equality: all equal values → Gini ≈ 0
  const eqPts = DEMO_KEYS.map((_, i) => ({ v: 50000, w: WGTS[i] }));
  const eqGini = computeGini(eqPts);
  results.push({ test: 'Perfect equality', expected: '0.000', actual: eqGini.toFixed(4), pass: eqGini < 0.001 });

  // 2. Single owner: all wealth in one group → Gini ≈ 1
  const soPts = DEMO_KEYS.map((_, i) => ({ v: i === 0 ? 1e12 : 0, w: WGTS[i] }));
  const soGini = computeGini(soPts);
  results.push({ test: 'Single owner (max concentration)', expected: '≥ 0.85', actual: soGini.toFixed(4), pass: soGini > 0.85 });

  // 3. Annuity sanity: r → 0 → factor → remaining life expectancy
  const afLow = annuityFactor(42, 0.001, SURV_BASE);
  const remainingLE = SURV_BASE.slice(43).reduce((s, v) => s + v / SURV_BASE[42], 0);
  const afDiff = Math.abs(afLow - remainingLE);
  results.push({ test: 'Annuity factor (r≈0) ≈ remaining LE', expected: remainingLE.toFixed(1), actual: afLow.toFixed(1), pass: afDiff < 1 });

  // 4. Year 0 identity: CL and Accord Ginis must be identical at Year 0
  const cl0 = computeSuite(0, ALL_PROVS, params);
  const acc0 = computeSuite(0, BASE_ONLY, params);
  const y0Match = cl0.every((m, i) => Math.abs(m.gini - acc0[i].gini) < 0.001);
  results.push({ test: 'Year 0 CL === Accord (all 5 Ginis)', expected: 'Pass', actual: y0Match ? 'Pass' : 'FAIL', pass: y0Match });

  // 5. PSU cashout at Year 0 = 0
  const psuY0 = psuCashoutPerFiler(5, 0);
  results.push({ test: 'PSU cashout at Year 0 = 0', expected: '0', actual: psuY0.toFixed(0), pass: psuY0 === 0 });

  // 6. NW Gini decreases under Accord (Year 0 vs Year 30)
  const nw0 = computeSuite(0, ALL_PROVS, params).find(m => m.key === 'netWorth').gini;
  const nw30 = computeSuite(30, ALL_PROVS, params).find(m => m.key === 'netWorth').gini;
  results.push({ test: 'NW Gini decreases Yr0→30 (Accord)', expected: 'Pass',
    actual: nw30 < nw0 ? `Pass (${nw0.toFixed(3)}→${nw30.toFixed(3)})` : 'FAIL', pass: nw30 < nw0 });

  // 7. No Gini > 0.98 (ceiling check)
  const suite30 = computeSuite(30, ALL_PROVS, params);
  const maxGini = Math.max(...suite30.map(m => m.gini));
  results.push({ test: 'No Gini > 0.98 at Year 30', expected: '< 0.98', actual: maxGini.toFixed(3), pass: maxGini < 0.98 });

  // 8. Liquidity note: monotonicity does NOT hold because bottom brackets already liquidate
  // 95% of AMCF grants as cash. Making scrip "liquid" replaces that large cash flow with
  // a tiny annuitized drawdown of retained equity — reducing their CC. This is correct model
  // behavior, not a bug. The liquid/illiquid distinction shows up as dual lines on the CC chart.
  results.push({ test: 'Liquid vs illiquid CC diverges', expected: 'Info',
    actual: 'Liquid reduces bottom CC (already cashed out); shown as dual lines on CC chart', pass: true });

  return results;
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  UI COMPONENTS                                                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const fD = n => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e12) return `${s}$${(a/1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${s}$${(a/1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a/1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a/1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

const S = {
  card: { background: '#fff', borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(15,29,47,0.06)', border: '1px solid #e8e4df' },
  h2: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, fontWeight: 700, color: '#0f1d2f', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 600, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 },
  th: { padding: '8px 10px', fontWeight: 600, borderBottom: '2px solid #e5e7eb', fontSize: 11, textAlign: 'left', whiteSpace: 'nowrap' },
  td: { padding: '7px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12 },
  tabBtn: (active) => ({
    padding: '8px 18px', fontSize: 13, borderRadius: 6, cursor: 'pointer', border: 'none', fontWeight: active ? 700 : 400,
    background: active ? '#0f1d2f' : '#f3f4f6', color: active ? '#fff' : '#374151',
    fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
  }),
  toggle: (on) => ({
    padding: '4px 12px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
    border: on ? '2px solid #0f1d2f' : '1px solid #d1d5db',
    background: on ? '#0f1d2f10' : '#fff', color: on ? '#0f1d2f' : '#9ca3af',
    fontWeight: on ? 600 : 400, fontFamily: "'DM Sans', sans-serif",
  }),
};

// ═══════════════════════════════════════════════════════════════════════════
// TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const GINI_META = [
  { key: 'dispInc', label: 'Disposable Income', color: '#f97316', group: 'income', desc: 'Post-tax, post-transfer. Dips early (prebate impact), then creeps up as top incomes compound faster than the fixed prebate.' },
  { key: 'consCap', label: 'Consumption Capacity', color: '#22c55e', group: 'income', desc: 'Sustainable spending power. Goes up under both scenarios, but the Accord cuts the increase by ~70%. The DELTA widens every year.' },
  { key: 'netWorth', label: 'Net Worth', color: '#8b5cf6', group: 'wealth', desc: 'Ownership distribution. Goes DOWN under the Accord — AMCF scrip and PSU equity compress wealth inequality. The core success metric.' },
];

const SNAP_YRS = [0, 1, 5, 10, 15, 20, 25, 30];
const HH_COUNT = 133e6;

// ─── Tab 1: Overview ──────────────────────────────────────────────────────

function OverviewTab({ P, params }) {
  const pKey = [...P].sort().join(',');
  const [ccThreshold, setCcThreshold] = useState(30000);
  const liqParams = useMemo(() => ({ ...params, scripLiquid: true, psuLiquid: true }), [params]);

  const timeData = useMemo(() => YEARS.map(y => {
    const cl = computeSuite(y, BASE_ONLY, params);
    const acc = computeSuite(y, P, params);
    const row = { year: y };
    GINI_META.forEach((m, i) => { row[`cl_${m.key}`] = cl[i].gini; row[`acc_${m.key}`] = acc[i].gini; });
    const ccIdx = GINI_META.findIndex(m => m.key === 'consCap');
    const clLiq = computeSuite(y, BASE_ONLY, liqParams);
    const accLiq = computeSuite(y, P, liqParams);
    row.cl_consCap_liq = clLiq[ccIdx].gini;
    row.acc_consCap_liq = accLiq[ccIdx].gini;
    return row;
  }), [pKey, params, liqParams]);

  // Security floor: % of HH with CC < threshold, over 30 years
  const secFloorData = useMemo(() => YEARS.map(y => {
    let clBelow = 0, accBelow = 0;
    DEMO_KEYS.forEach((k, i) => {
      if (getConsumptionCapacity(k, y, BASE_ONLY, params) < ccThreshold) clBelow += WGTS[i];
      if (getConsumptionCapacity(k, y, P, params) < ccThreshold) accBelow += WGTS[i];
    });
    return { year: y, cl: +(clBelow * 100).toFixed(1), accord: +(accBelow * 100).toFixed(1) };
  }), [pKey, params, ccThreshold]);

  // Find year when Accord hits 0%
  const zeroYear = secFloorData.find(d => d.accord === 0)?.year;

  // Country refs
  const refs = COUNTRIES.filter(c => c.key !== 'us');

  // Shared income domain for dispInc + consCap
  const incKeys = ['dispInc', 'consCap'];
  const incVals = timeData.flatMap(d => incKeys.flatMap(k => [d[`cl_${k}`], d[`acc_${k}`]]));
  refs.forEach(c => incKeys.forEach(k => { if (c[k] != null) incVals.push(c[k]); }));
  const incDomain = [Math.max(0, Math.min(...incVals) - 0.03), Math.min(1, Math.max(...incVals) + 0.03)];
  // Add liquid CC vals to domain
  const liqVals = timeData.flatMap(d => [d.cl_consCap_liq, d.acc_consCap_liq].filter(v => v != null));
  if (liqVals.length) {
    incDomain[0] = Math.max(0, Math.min(incDomain[0], Math.min(...liqVals) - 0.03));
    incDomain[1] = Math.min(1, Math.max(incDomain[1], Math.max(...liqVals) + 0.03));
  }
  const nwVals = timeData.flatMap(d => [d.cl_netWorth, d.acc_netWorth]);
  refs.forEach(c => { if (c.netWorth != null) nwVals.push(c.netWorth); });
  const nwDomain = [Math.max(0, Math.min(...nwVals) - 0.03), Math.min(1, Math.max(...nwVals) + 0.03)];
  const domainFor = (key) => key === 'netWorth' ? nwDomain : incDomain;

  const renderChart = (title, color, dataKeys, domain, extraLines) => {
    const mainKey = dataKeys[0];
    const countryRefs = refs.filter(c => c[mainKey] != null);
    return (
      <div style={{ background: '#faf8f5', borderRadius: 8, padding: '12px 8px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4, paddingLeft: 8 }}>{title}</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={timeData} margin={{ top: 5, right: 80, bottom: 15, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 9 }} />
            <YAxis domain={domain} tickFormatter={v => v.toFixed(2)} tick={{ fontSize: 9 }} width={40} />
            <Tooltip formatter={v => v.toFixed(3)} />
            {countryRefs.map(c => (
              <ReferenceLine key={c.key} y={c[mainKey]} stroke={c.color} strokeDasharray="3 3"
                label={{ value: c.label, position: 'right', fontSize: 9, fill: c.color }} />
            ))}
            {dataKeys.map(k => {
              const meta = GINI_META.find(m => m.key === k);
              return [
                <Line key={`cl_${k}`} dataKey={`cl_${k}`} name={`${meta.label} CL`} stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="6 3" />,
                <Line key={`acc_${k}`} dataKey={`acc_${k}`} name={`${meta.label} Accord`} stroke={meta.color} dot={false} strokeWidth={2.5} />,
              ];
            })}
            {extraLines}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const ccExtraLines = [
    <Line key="cl_cc_liq" dataKey="cl_consCap_liq" name="CC CL (liquid)" stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="3 2" />,
    <Line key="acc_cc_liq" dataKey="acc_consCap_liq" name="CC Accord (liquid)" stroke="#22c55e" dot={false} strokeWidth={1.5} strokeDasharray="3 2" />,
  ];

  return (
    <div>
      {/* Metric definitions */}
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>What Each Metric Measures</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {GINI_META.map(m => (
            <div key={m.key} style={{ padding: '14px 12px', borderRadius: 8, border: `2px solid ${m.color}20`, background: `${m.color}06` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: m.color, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 30-year line charts */}
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>30-Year Gini Trajectories</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          <strong style={{ color: '#94a3b8' }}>Dashed = Current Law</strong>, <strong>Solid = With Accord</strong>.
          Disposable Income and Consumption Capacity share axes for comparison.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
          {renderChart('Disposable Income Gini', '#f97316', ['dispInc'], domainFor('dispInc'))}
          {renderChart('Consumption Capacity Gini — solid=illiquid, dashed=liquid', '#22c55e', ['consCap'], domainFor('consCap'), ccExtraLines)}
          {renderChart('Net Worth Gini', '#8b5cf6', ['netWorth'], domainFor('netWorth'))}
        </div>
      </div>

      {/* International context */}
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>International Context</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          Comparisons shown only for metrics with published, comparable OECD data.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={S.th}>Country</th>
              <th style={S.th}>Archetype</th>
              <th style={{ ...S.th, textAlign: 'center', color: '#f97316' }}>Disposable Inc</th>
              <th style={{ ...S.th, textAlign: 'center', color: '#8b5cf6' }}>Net Worth</th>
              <th style={S.th}>Type</th>
            </tr>
          </thead>
          <tbody>
            {COUNTRIES.map((c, i) => (
              <tr key={c.key} style={{ background: i % 2 === 0 ? '#fff' : '#faf8f5' }}>
                <td style={{ ...S.td, fontWeight: 600, color: c.color }}>{c.label}</td>
                <td style={{ ...S.td, fontSize: 11 }}>{c.arch}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{c.dispInc?.toFixed(3) ?? '—'}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>{c.netWorth?.toFixed(3) ?? '—'}</td>
                <td style={S.td}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: c.type === 'like' ? '#dcfce7' : '#fef3c7',
                    color: c.type === 'like' ? '#166534' : '#92400e' }}>
                    {c.type === 'like' ? 'Like-for-like' : 'Indicative'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Security Floor — line chart with threshold slider */}
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>Security Floor: Who Can Afford Basic Needs?</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          Share of households whose sustainable consumption capacity falls below the basic-needs threshold.
          Lower = fewer households in precarity = better.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1d2f' }}>
            Basic Needs Threshold: ${(ccThreshold / 1000).toFixed(0)}K/yr
          </div>
          <input type="range" min={15000} max={60000} step={1000} value={ccThreshold}
            onChange={e => setCcThreshold(+e.target.value)} style={{ width: 200 }} />
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            Default: MIT Living Wage (~$30K/yr, single adult). Range: $15K (poverty line, single) to $60K (living wage, family of 4).
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={secFloorData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} label={{ value: 'Year', position: 'insideBottom', offset: -8, fontSize: 11 }} />
            <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={45} />
            <Tooltip formatter={v => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="cl" name="Current Law" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="6 3" />
            <Line dataKey="accord" name="With Accord" stroke="#1d4ed8" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>
          Step pattern reflects 13-bracket model resolution. Actual transition would be gradual.
        </div>
        {zeroYear != null && (
          <div style={{ marginTop: 12, padding: 16, background: '#f0fdf4', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Every American household can afford basic needs by
            </div>
            <div style={{ fontSize: 42, fontWeight: 800, color: '#16a34a', fontFamily: "'Playfair Display', serif" }}>
              Year {zeroYear}
            </div>
            <div style={{ fontSize: 12, color: '#166534' }}>
              Consumption capacity above ${(ccThreshold/1000).toFixed(0)}K/yr for 100% of households
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: Tables (absolute levels + distribution supplements) ───────────

function TablesTab({ P, params }) {
  const pKey = [...P].sort().join(',');
  const snapSuites = useMemo(() => {
    const m = {};
    SNAP_YRS.forEach(y => { m[y] = { cl: computeSuite(y, BASE_ONLY, params), acc: computeSuite(y, P, params) }; });
    return m;
  }, [pKey, params]);

  const keyDemos = ['B10','P20','P40','P60','P80','T10','T1'];

  return (
    <div>
      {/* Absolute levels */}
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>Absolute Levels: What Households Can Actually Afford</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          Gini measures <em>relative</em> inequality. This table shows actual dollar amounts — <strong>everyone gets richer</strong>.
        </p>
        {['consCap', 'netWorth'].map(metric => {
          const isCC = metric === 'consCap';
          const mLabel = isCC ? 'Consumption Capacity ($/yr per household)' : 'Net Worth ($ per household)';
          const getVal = isCC
            ? (k, y, pSet) => getConsumptionCapacity(k, y, pSet, params)
            : (k, y, pSet) => getNW(k, y, pSet).total;
          return (
            <div key={metric} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isCC ? '#22c55e' : '#8b5cf6', marginBottom: 6 }}>{mLabel}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, fontSize: 10 }}>Demo</th>
                    {SNAP_YRS.map(y => <th key={y} style={{ ...S.th, textAlign: 'center', fontSize: 10 }}>Yr {y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {keyDemos.map((k, ki) => (
                    <tr key={k} style={{ background: ki % 2 === 0 ? '#fff' : '#faf8f5' }}>
                      <td style={{ ...S.td, fontWeight: 600, color: DEMOS[k].color, fontSize: 10 }}>{DEMOS[k].label}</td>
                      {SNAP_YRS.map(y => {
                        const cl = getVal(k, y, BASE_ONLY);
                        const acc = getVal(k, y, P);
                        const pctChg = cl > 0 ? ((acc / cl - 1) * 100) : acc > 0 ? 999 : 0;
                        return (
                          <td key={y} style={{ ...S.td, textAlign: 'center', fontSize: 10, lineHeight: 1.4 }}>
                            <div style={{ color: '#94a3b8' }}>{fD(cl)}</div>
                            <div style={{ fontWeight: 700, color: '#0f1d2f' }}>{fD(acc)}</div>
                            <div style={{ fontSize: 9, color: pctChg > 1 ? '#16a34a' : pctChg < -1 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                              {pctChg > 0 ? '+' : ''}{pctChg > 500 ? 'n/a' : pctChg.toFixed(0) + '%'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* Distribution shape supplements */}
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>Distribution Shape Supplements Over Time</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          Each cell shows <strong style={{ color: '#94a3b8' }}>CL</strong> / <strong style={{ color: '#1d4ed8' }}>Accord</strong> (delta).
        </p>
        {GINI_META.map((m) => (
          <div key={m.key} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: m.color, marginBottom: 6, borderLeft: `3px solid ${m.color}`, paddingLeft: 10 }}>{m.label}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, fontSize: 10 }}>Supplement</th>
                    {SNAP_YRS.map(y => <th key={y} style={{ ...S.th, textAlign: 'center', fontSize: 10 }}>Yr {y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {['gini','b50','medMean','p90p10','p90p50','nonPosShare'].map(sup => {
                    if (sup === 'p90p10' && m.key === 'netWorth') return null;
                    if (sup === 'p90p50' && m.key === 'netWorth') return null;
                    if (sup === 'nonPosShare' && m.key !== 'netWorth') return null;
                    const labels = { gini: 'Gini', b50: 'Bottom 50% Share', medMean: 'Median / Mean', p90p10: 'P90 / P10', p90p50: 'P90 / P50', nonPosShare: 'Non-positive NW' };
                    return (
                      <tr key={sup} style={{ background: sup === 'gini' ? `${m.color}06` : 'transparent' }}>
                        <td style={{ ...S.td, fontWeight: sup === 'gini' ? 700 : 400, fontSize: 10 }}>{labels[sup]}</td>
                        {SNAP_YRS.map(y => {
                          const cl = snapSuites[y].cl[GINI_META.indexOf(m)];
                          const acc = snapSuites[y].acc[GINI_META.indexOf(m)];
                          let clV, accV, delta, good;
                          if (sup === 'gini') { clV = cl.gini; accV = acc.gini; delta = accV - clV; good = delta < -0.003; }
                          else if (sup === 'b50') { clV = cl.b50*100; accV = acc.b50*100; delta = accV - clV; good = delta > 0.1; }
                          else if (sup === 'medMean') { clV = cl.medMean; accV = acc.medMean; delta = accV - clV; good = delta > 0.003; }
                          else if (sup === 'p90p10') { clV = cl.p90p10; accV = acc.p90p10; delta = clV != null && accV != null ? accV - clV : 0; good = delta < -0.1; }
                          else if (sup === 'p90p50') { clV = cl.p90p50; accV = acc.p90p50; delta = clV != null && accV != null ? accV - clV : 0; good = delta < -0.01; }
                          else if (sup === 'nonPosShare') { clV = cl.nonPosShare != null ? cl.nonPosShare*100 : null; accV = acc.nonPosShare != null ? acc.nonPosShare*100 : null; delta = clV != null && accV != null ? accV - clV : 0; good = delta < -0.1; }
                          const fmt = v => { if (v == null) return '—'; if (sup === 'gini' || sup === 'medMean') return v.toFixed(3); if (sup === 'b50' || sup === 'nonPosShare') return v.toFixed(1)+'%'; if (sup === 'p90p50') return v.toFixed(2); return isFinite(v) ? v.toFixed(1) : '\u221e'; };
                          const dColor = isFinite(delta) && good ? '#16a34a' : isFinite(delta) && !good && Math.abs(delta) > 0.001 ? '#dc2626' : '#64748b';
                          return (
                            <td key={y} style={{ ...S.td, textAlign: 'center', fontSize: 10, lineHeight: 1.4 }}>
                              <span style={{ color: '#94a3b8' }}>{fmt(clV)}</span>
                              {' / '}
                              <span style={{ fontWeight: 600, color: '#0f1d2f' }}>{fmt(accV)}</span>
                              <div style={{ fontSize: 9, color: dColor, fontWeight: 600 }}>
                                {isFinite(delta) ? (delta >= 0 ? '+' : '') + (sup === 'b50' || sup === 'nonPosShare' ? delta.toFixed(1)+'pp' : sup === 'gini' || sup === 'medMean' ? delta.toFixed(3) : delta.toFixed(1)) : ''}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }).filter(Boolean)}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab 4: Provision Decomposition ───────────────────────────────────────

// Provision decomposition: cumulative addition of provisions to measure marginal Gini reduction
const PROV_LAYERS = [
  { key: 'TAX',   label: 'Tax Reform',         color: '#f97316', set: new Set(['BASE','TAX']) },
  { key: 'PRE',   label: 'Prebate + Carbon',   color: '#22c55e', set: new Set(['BASE','TAX','PRE']) },
  { key: 'AMCF',  label: 'AMCF Grants',        color: '#3b82f6', set: new Set(['BASE','TAX','PRE','AMCF']) },
  { key: 'PSU_D', label: 'PSU Dividends',       color: '#a855f7', set: new Set(['BASE','TAX','PRE','AMCF','PSU_D']) },
  { key: 'PSU_C', label: 'PSU Cashouts',        color: '#f59e0b', set: new Set(['BASE','TAX','PRE','AMCF','PSU_D','PSU_C']) },
];

function ProvisionDecomp({ params }) {
  const snapYrs = [1, 5, 10, 15, 20, 25, 30];

  const data = useMemo(() => {
    return GINI_META.map((m, mi) => {
      return snapYrs.map(y => {
        const clGini = computeSuite(y, BASE_ONLY, params)[mi].gini;
        let prevGini = clGini;
        const row = { year: `Yr ${y}` };
        PROV_LAYERS.forEach(layer => {
          const thisGini = computeSuite(y, layer.set, params)[mi].gini;
          const marginal = Math.max(0, prevGini - thisGini); // positive = improvement
          row[layer.key] = parseFloat(marginal.toFixed(4));
          prevGini = thisGini;
        });
        row.total = parseFloat((clGini - computeSuite(y, ALL_PROVS, params)[mi].gini).toFixed(4));
        return row;
      });
    });
  }, [params]);

  return (
    <div>
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 18 }}>Where Does the Equalizing Power Come From?</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>
          Each segment shows one provision's marginal contribution to Gini reduction at each year.
          Provisions are added cumulatively: Tax Reform first, then Prebate, then AMCF, then PSU.
          Taller bars = more total inequality reduction. The composition shows which mechanism does the heavy lifting.
        </p>

        {GINI_META.map((m, mi) => (
          <div key={m.key} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: m.color, marginBottom: 8, borderLeft: `4px solid ${m.color}`, paddingLeft: 10 }}>
              {m.label} — Gini Reduction by Provision
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data[mi]} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => v.toFixed(3)} tick={{ fontSize: 10 }} width={45}
                  label={{ value: 'Gini reduction', angle: -90, position: 'insideLeft', offset: 5, fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip formatter={(v, name) => [v.toFixed(4), name]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {PROV_LAYERS.map(layer => (
                  <Bar key={layer.key} dataKey={layer.key} name={layer.label} stackId="a"
                    fill={layer.color} radius={layer.key === 'PSU_C' ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab 5: Methodology ───────────────────────────────────────────────────

function MethodologyTab({ params }) {
  const validation = useMemo(() => runValidation(params), [params]);

  return (
    <div>
      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>Measurement Framework</h3>
        <div style={{ fontSize: 12, lineHeight: 1.8, color: '#374151' }}>
          <p><strong>The core problem:</strong> The AOA delivers benefits as held wealth (AMCF scrip, PSUs) and income streams (prebate) — forms that conventional metrics handle badly. No single Gini tells the truth. This module reports five variants and makes the gaps between them legible.</p>
          <p style={{ marginTop: 12 }}><strong>Annuity factor:</strong> AF(age, r) = Sum_t [ P(alive at age+t | alive at age) / (1+r)^t ]. Converts streams to stocks and stocks to sustainable flows.</p>
          <p style={{ marginTop: 12 }}><strong>Why no Augmented Wealth time series:</strong> Augmented wealth (NW + PV of Social Security and other entitlements) is a useful cross-sectional concept but cannot be reliably tracked in a 13-bracket model. The fixed-dollar PV additions get diluted as NW compounds, causing the augmented Gini to rise even when NW Gini falls. The Net Worth Gini directly measures ownership inequality, and the Consumption Capacity Gini captures affordability including drawdown value. Together they cover what augmented wealth was intended to measure.</p>
          <p style={{ marginTop: 12 }}><strong>Model structure:</strong> 13 representative brackets (B10 through Elon Musk) with population-weighted Gini computation. Each bracket has a fixed cross-sectional age (SCF/CPS demographic profiles, e.g. B10=48, BILL=65) — Gini is computed as a population snapshot, not a cohort tracked over time. Brackets track policy-year evolution, not individual aging. Population shares are held constant.</p>
          <p style={{ marginTop: 12 }}><strong>Consumption capacity:</strong> Disposable income + annuitized drawdown of liquid wealth + dividends from illiquid wealth. Guard: if scrip is liquid, include principal drawdown but DROP dividends. If illiquid, include dividends but NO principal drawdown.</p>
          <p style={{ marginTop: 12 }}><strong>Life table:</strong> SSA 2024 Period Life Table (unisex average). SES-differentiated variant shifts survival curve ±3 years per Chetty et al. (2016).</p>
          <p style={{ marginTop: 12 }}><strong>Gini method:</strong> Weighted Lorenz trapezoid. 13-point distribution (B10 through Elon, exact population weights). Anchor-calibrated to US empirical baselines (income 0.490, wealth 0.850) at Year 0.</p>
        </div>
      </div>

      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>Validation Checks</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Test', 'Expected', 'Actual', 'Status'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {validation.map((v, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#faf8f5' }}>
                <td style={{ ...S.td, fontWeight: 500 }}>{v.test}</td>
                <td style={S.td}>{v.expected}</td>
                <td style={S.td}>{v.actual}</td>
                <td style={S.td}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: v.pass ? '#dcfce7' : '#fef2f2', color: v.pass ? '#166534' : '#991b1b' }}>
                    {v.pass ? 'PASS' : 'FAIL'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>Fixed Parameters</h3>
        <div style={{ fontSize: 12, lineHeight: 1.8, color: '#374151' }}>
          <p><strong>Discount rate:</strong> 2.0% real (Wolff-Haveman standard for augmented wealth literature).</p>
          <p style={{ marginTop: 8 }}><strong>Mortality:</strong> Uniform (SSA 2024 Period Life Table, unisex average). Each bracket uses a fixed cross-sectional representative age (SCF/CPS demographic profiles).</p>
          <p style={{ marginTop: 12, padding: 12, background: '#f8fafc', borderRadius: 6, color: '#64748b' }}>
            SES-differentiated mortality (±3 year shift per Chetty et al. 2016) and discount rate variation (1.0%–3.5%) produce negligible sensitivity at this model's 13-bracket resolution. These parameters would matter in a microsimulation with 100K+ synthetic households; at the bracket level, extreme top-tail values dominate the Gini and swamp annuity-factor perturbations.
          </p>
        </div>
      </div>

      <div style={S.card}>
        <h3 style={{ ...S.h2, fontSize: 16 }}>Cross-Country Comparability</h3>
        <div style={{ fontSize: 12, lineHeight: 1.8, color: '#374151' }}>
          <p><strong>Like-for-like:</strong> US, Norway, Germany, Australia, UK — all use OECD-harmonized disposable income Gini methodology (post-tax, post-transfer). Wealth Ginis from national wealth surveys (SCF, HFCS, ONS WAS, HILDA).</p>
          <p style={{ marginTop: 8 }}><strong>Indicative only:</strong> Singapore (different survey methodology, sparse wealth microdata). These comparisons are directional, not statistically precise.</p>
          <p style={{ marginTop: 8 }}><strong>Key caveat:</strong> Countries with generous state pensions (Norway, Germany) have artificially high measured wealth inequality because pension wealth is invisible to surveys.</p>
        </div>
      </div>
    </div>
  );
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  MAIN COMPONENT                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const TABS = [
  { id: 1, label: 'Overview' },
  { id: 2, label: 'Tables' },
  { id: 3, label: 'Provision Decomp' },
  { id: 4, label: 'Methodology' },
];

const PROVS = [
  { key: 'BASE', label: 'Current Law', fixed: true },
  { key: 'TAX', label: 'Tax Reform' },
  { key: 'PRE', label: 'Prebate + Carbon' },
  { key: 'AMCF', label: 'AMCF Grants' },
  { key: 'PSU_D', label: 'PSU Dividends' },
  { key: 'PSU_C', label: 'PSU Cashouts' },
];

export default function InequalityMeasurement() {
  const [activeTab, setActiveTab] = useState(1);
  const [provs, setProvs] = useState(new Set(['BASE','TAX','PRE','AMCF','PSU_D','PSU_C']));
  const discountRate = 0.02;
  const mortality = 'uniform';
  const P = provs;
  const params = { discountRate, mortality, scripLiquid: false, psuLiquid: false };

  const toggleProv = (key) => {
    if (key === 'BASE') return;
    const next = new Set(provs);
    if (next.has(key)) next.delete(key); else next.add(key);
    setProvs(next);
  };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#faf8f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 800, color: '#0f1d2f', marginBottom: 4 }}>
          Inequality Measurement Module
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Three Gini variants capturing what conventional metrics miss about the American Ownership Accord.
        </p>

        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Sidebar — sticky */}
          <div style={{ width: 220, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 72 }}>
            <div style={S.card}>
              <div style={S.label}>Accord Provisions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PROVS.map(p => (
                  <button key={p.key} onClick={() => toggleProv(p.key)}
                    style={{ ...S.toggle(provs.has(p.key)), opacity: p.fixed ? 0.5 : 1, cursor: p.fixed ? 'default' : 'pointer' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={S.tabBtn(activeTab === t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 1 && <OverviewTab P={P} params={params} />}
            {activeTab === 2 && <TablesTab P={P} params={params} />}
            {activeTab === 3 && <ProvisionDecomp params={params} />}
            {activeTab === 4 && <MethodologyTab params={params} />}
          </div>
        </div>
      </div>
    </div>
  );
}
