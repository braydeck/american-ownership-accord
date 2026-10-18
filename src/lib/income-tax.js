// Marginal individual income tax (two-rate by default, any number of brackets for the design search), computed bottom-up from the IRS-SOI
// income distribution in brackets.js. Replaces the legacy flat `nomGdp * 0.078`
// black box with an explicit, tunable structure: a standard deduction (single/joint,
// blended per bracket by the joint-filer fraction), a lower marginal rate up to a
// threshold, and an upper rate above it. The deduction comes off the bottom, so income
// above the threshold is taxed at the upper rate in full (standard marginal structure).
//
// Within-bracket spread: each bracket's filers are spread over its income range as
// POINTS_PER_BRACKET equal-weight income levels (bracketPoints), so a threshold or a rising
// rate inside a bracket taxes the filers above it. Bounded brackets use a truncated exponential
// density fitted to the bracket mean; the open top bracket uses a Pareto tail fitted to its mean.
//
// Behavioral response: an elasticity-of-taxable-income (ETI) damping factor shrinks each
// bracket's base as its combined marginal rate rises above current law, per
//   bFactor = ((1 − m_new) / (1 − m_currentLaw)) ^ eti
// where m_new is the Accord's marginal income tax rate plus the 12.4% Social Security
// contribution above the cap (canonical gaps item 5). etiTop applies to filers above ETI_TOP_INCOME
// ($200K, about the top 6% of filers) under any schedule shape: the larger avoidance response is a
// feature of high incomes, not of where a schedule's brackets fall.
//
// Sources: AGI, filer counts, and joint-filer share (jFrac) per bracket from brackets.js
// (IRS SOI, updated June 2026).

import { BRACKETS } from '@/lib/brackets';

// Year-1 nominal GDP the BRACKETS AGI snapshot is anchored to. The fiscal engine scales
// year-1 revenue by nominalGdp/INCOME_REF_GDP so income tax grows with the economy
// (progressivity/thresholds held fixed in nominal terms — see lvtRevForFiscal precedent).
export const INCOME_REF_GDP = 28e12;

export const TOTAL_AGI = BRACKETS.reduce((s, b) => s + b.agi, 0); // ≈ $13.55T

// Defaults for the two-bracket structure.
export const INCOME_TAX_DEFAULTS = {
  lowRate:      0.25,      // marginal rate on taxable income up to the threshold
  highRate:     0.50,      // marginal rate on taxable income above the threshold
  threshold:    1_000_000, // $ income where the high rate kicks in
  exemptSingle: 30_000,    // $ standard deduction for single filers
  exemptJoint:  60_000,    // $ standard deduction for joint filers
  // Elasticity of taxable income with respect to the net-of-tax MARGINAL rate (income tax plus
  // the Social Security contribution above the cap). Below the top rate the real labor response
  // is carried by the engine's labor-supply growth channel, so etiMid is 0 to avoid counting it
  // twice; etiTop covers reporting and avoidance at the top.
  etiMid:       0,
  etiTop:       0.15,      // 0.15 Accord (gains unified, realization backstops) / 0.30 conventional
};

// Income bounds of the BRACKETS rows, in order.
const BRACKET_BOUNDS = [[0, 10e3], [10e3, 15e3], [15e3, 25e3], [25e3, 40e3], [40e3, 55e3], [55e3, 75e3],
  [75e3, 100e3], [100e3, 150e3], [150e3, 200e3], [200e3, 500e3], [500e3, 1e6], [1e6, 2e6], [2e6, 5e6],
  [5e6, 15e6], [15e6, Infinity]];
export const POINTS_PER_BRACKET = 12;

function truncExpQuantile(u, lo, hi, beta) {
  if (Math.abs(beta) < 1e-12) return lo + u * (hi - lo);
  return lo + Math.log(1 + u * Math.expm1(beta * (hi - lo))) / beta;
}
function truncExpMean(lo, hi, beta) {
  const w = hi - lo;
  if (Math.abs(beta * w) < 1e-9) return lo + w / 2;
  return lo + w / -Math.expm1(-beta * w) - 1 / beta;
}
// Equal-weight income levels for one bracket, rescaled so their mean is the bracket mean.
function spreadPoints(lo, hi, mean, n) {
  let xs;
  if (hi === Infinity) {
    const alpha = mean / (mean - lo);
    xs = Array.from({ length: n }, (_, i) => lo * Math.pow(1 - (i + 0.5) / n, -1 / alpha));
  } else {
    let a = -50 / (hi - lo), b = 50 / (hi - lo);
    for (let k = 0; k < 100; k++) { const m = (a + b) / 2; if (truncExpMean(lo, hi, m) < mean) a = m; else b = m; }
    const beta = (a + b) / 2;
    xs = Array.from({ length: n }, (_, i) => truncExpQuantile((i + 0.5) / n, lo, hi, beta));
  }
  const scale = mean / (xs.reduce((s, x) => s + x, 0) / n);
  return xs.map(x => x * scale);
}
const POINTS = BRACKETS.map((b, i) => spreadPoints(BRACKET_BOUNDS[i][0], BRACKET_BOUNDS[i][1], b.agi / b.filers, POINTS_PER_BRACKET));
export const bracketPoints = bi => POINTS[bi];

// Per-bracket blended standard deduction: joint filers (jFrac of the bracket) get the
// larger joint deduction; the rest get the single deduction.
function bracketDeduction(b, exemptSingle, exemptJoint) {
  return b.jFrac * exemptJoint + (1 - b.jFrac) * exemptSingle;
}

// Current law: 2024 federal brackets and standard deduction. Long-term gains and qualified
// dividends are taxed at 0/15/20% stacked on top of ordinary income, plus the 3.8% NIIT.
export const CL_SCHED = {
  single: { sd: 14600, br: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
            cg: [47025, 518900], niit: 200000 },
  joint:  { sd: 29200, br: [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
            cg: [94050, 583750], niit: 250000 },
};
function clOrdinaryMarginalOne(income, s) {
  const ti = income - s.sd;
  if (ti <= 0) return 0;
  return s.br.find(([hi]) => ti <= hi)[1];
}
// Current-law ordinary marginal rate at an income, blending single and joint by jFrac.
export function clMarginalRate(income, jFrac) {
  return jFrac * clOrdinaryMarginalOne(income, CL_SCHED.joint) + (1 - jFrac) * clOrdinaryMarginalOne(income, CL_SCHED.single);
}

// The Accord schedule as [[upper AGI bound, rate], ...], last bound Infinity. Thresholds are on
// income; the standard deduction comes off the bottom. `brackets` overrides the two-rate
// low/high/threshold form so the design search can test more brackets.
export function accordSchedule({ brackets, lowRate = INCOME_TAX_DEFAULTS.lowRate,
  highRate = INCOME_TAX_DEFAULTS.highRate, threshold = INCOME_TAX_DEFAULTS.threshold } = {}) {
  return brackets ?? [[threshold, lowRate], [Infinity, highRate]];
}
export function accordScheduleTax(income, ded, sched) {
  let t = 0, lo = 0;
  for (const [hi, r] of sched) {
    t += r * Math.max(0, Math.min(income, hi) - Math.max(lo, ded));
    lo = hi;
  }
  return t;
}
export const ETI_TOP_INCOME = 200_000;
export const etiTopFloor = () => ETI_TOP_INCOME;
export function accordMarginalRate(income, ded, sched) {
  if (income <= ded) return 0;
  return sched.find(([hi]) => income <= hi)[1];
}

// Social Security contribution with the taxable maximum removed (canonical gaps item 1): 12.4%
// on all income above the cap (wages, investment and pass-through income), no benefit credit.
// The cap is per worker: $168,600 in 2024, the year the BRACKETS snapshot represents. Earners per
// filer are 1 + 0.6 × the joint share (assumption: 60% of joint returns have two earners).
export const SS_CAP_SNAPSHOT = 168_600;
export const SS_RATE = 0.124;
export const earnersPerFiler = jFrac => 1 + 0.6 * jFrac;
export function ssAboveCapBase(income, jFrac) {
  const e = earnersPerFiler(jFrac);
  return Math.max(0, income / e - SS_CAP_SNAPSHOT) * e;
}

// Per-filer income tax and Social Security contribution for a single bracket, with the ETI
// damping. The single source of the tax math, used by incomeTaxRevenue and by the Income Tax
// Design lab page.
export function bracketIncomeTax(b, {
  brackets,
  lowRate      = INCOME_TAX_DEFAULTS.lowRate,
  highRate     = INCOME_TAX_DEFAULTS.highRate,
  threshold    = INCOME_TAX_DEFAULTS.threshold,
  exemptSingle = INCOME_TAX_DEFAULTS.exemptSingle,
  exemptJoint  = INCOME_TAX_DEFAULTS.exemptJoint,
  etiMid       = INCOME_TAX_DEFAULTS.etiMid,
  etiTop       = INCOME_TAX_DEFAULTS.etiTop,
  ssUncapOn    = true,
} = {}) {
  const meanAgi = b.agi / b.filers;
  const sd = bracketDeduction(b, exemptSingle, exemptJoint);
  const sched = accordSchedule({ brackets, lowRate, highRate, threshold });
  const floor = etiTopFloor(sched);
  const pts = POINTS[BRACKETS.indexOf(b)] ?? [meanAgi];
  let raw = 0, perFiler = 0, ssPerFiler = 0, mNew = 0, mCL = 0;
  for (const agi of pts) {
    const r = accordScheduleTax(agi, sd, sched);
    const ssBase = ssUncapOn ? ssAboveCapBase(agi, b.jFrac) : 0;
    const m = accordMarginalRate(agi, sd, sched) + (ssBase > 0 ? SS_RATE : 0);
    const mc = clMarginalRate(agi, b.jFrac);
    const f = Math.pow(Math.max(0.05, 1 - m) / Math.max(0.05, 1 - mc), agi > floor ? etiTop : etiMid);
    raw += r; perFiler += r * f; ssPerFiler += SS_RATE * ssBase * f; mNew += m; mCL += mc;
  }
  const n = pts.length;
  raw /= n; perFiler /= n; ssPerFiler /= n; mNew /= n; mCL /= n;
  return { meanAgi, sd, rawPerFiler: raw, eff: raw / Math.max(meanAgi, 1), mNew, mCL,
    bFactor: raw > 0 ? perFiler / raw : 1, perFiler, ssPerFiler };
}

// Total individual income tax and Social Security contribution revenue, with a per-bracket
// breakdown, for a given structure.
export function incomeTaxRevenue(structure = {}) {
  const byBracket = BRACKETS.map(b => {
    const { sd, eff, bFactor, perFiler, ssPerFiler, mNew, mCL } = bracketIncomeTax(b, structure);
    return { label: b.label, sd, eff, bFactor, perFiler, mNew, mCL, revenue: perFiler * b.filers,
             ssRevenue: ssPerFiler * b.filers, capGainsRevenue: perFiler * b.filers * b.cgShare };
  });
  const total = byBracket.reduce((s, x) => s + x.revenue, 0);
  // Capital gains are ordinary income under the Accord schedule, so they are already inside
  // `total`. capGains is the part of that revenue levied on gains (each bracket's revenue times
  // its gains share of AGI), split out only so the engine can apply realization cyclicality.
  const capGains = byBracket.reduce((s, x) => s + x.capGainsRevenue, 0);
  const ss = byBracket.reduce((s, x) => s + x.ssRevenue, 0);
  return { total, capGains, ss, byBracket, fracOfGdp: total / INCOME_REF_GDP };
}

// ─── FISCAL-ENGINE DROP-IN ───────────────────────────────────────────────────
// Computes the two-bracket revenue and scales it by nominalGdp/INCOME_REF_GDP so income
// tax grows with the economy.
export function incomeTaxRevForFiscal({ nominalGdp, ...structure }) {
  return incomeTaxRevenue(structure).total * (nominalGdp / INCOME_REF_GDP);
}

// Same revenue split into the tax on capital gains and the tax on all other income.
export function incomeTaxSplitForFiscal({ nominalGdp, ...structure }) {
  const { total, capGains, ss } = incomeTaxRevenue(structure);
  const scale = nominalGdp / INCOME_REF_GDP;
  return { ordinary: (total - capGains) * scale, capGains: capGains * scale, ss: ss * scale };
}
