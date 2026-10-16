// Marginal individual income tax (two-rate by default, any number of brackets for the design search), computed bottom-up from the IRS-SOI
// income distribution in brackets.js. Replaces the legacy flat `nomGdp * 0.078`
// black box with an explicit, tunable structure: a standard deduction (single/joint,
// blended per bracket by the joint-filer fraction), a lower marginal rate up to a
// threshold, and an upper rate above it. The deduction comes off the bottom, so income
// above the threshold is taxed at the upper rate in full (standard marginal structure).
//
// Approximation: each bracket's filers are treated as earning the bracket's mean AGI
// (agi/filers). The $1M default upper-rate threshold sits exactly on a bracket boundary,
// so the marginal kink lands cleanly; within-bracket dispersion is not modeled (a
// first-order simplification, conservative for the top bracket whose mean is well above
// the threshold anyway).
//
// Behavioral response: an elasticity-of-taxable-income (ETI) damping factor shrinks each
// bracket's base as its combined marginal rate rises above current law, per
//   bFactor = ((1 − m_new) / (1 − m_currentLaw)) ^ eti
// where m_new is the Accord's marginal income tax rate plus the 12.4% Social Security
// contribution above the cap (canonical gaps item 5). etiTop applies in the top bracket.
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
  const rawPerFiler = accordScheduleTax(meanAgi, sd, sched);
  const eff = rawPerFiler / Math.max(meanAgi, 1);
  const ssBase = ssUncapOn ? ssAboveCapBase(meanAgi, b.jFrac) : 0;
  const ssMarginal = ssBase > 0 ? SS_RATE : 0;
  const mNew = accordMarginalRate(meanAgi, sd, sched) + ssMarginal;
  const mCL = clMarginalRate(meanAgi, b.jFrac);
  const topFloor = sched.length > 1 ? sched[sched.length - 2][0] : Infinity;
  const eti = meanAgi > topFloor ? etiTop : etiMid;
  const bFactor = Math.pow(Math.max(0.05, 1 - mNew) / Math.max(0.05, 1 - mCL), eti);
  const perFiler = rawPerFiler * bFactor;
  const ssPerFiler = SS_RATE * ssBase * bFactor;
  return { meanAgi, sd, rawPerFiler, eff, mNew, mCL, bFactor, perFiler, ssPerFiler };
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
