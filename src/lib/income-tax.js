// Two-bracket marginal individual income tax, computed bottom-up from the IRS-SOI
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
// bracket's base as its effective rate rises above current law, per
//   bFactor = ((1 − eff_new) / (1 − eff_currentLaw)) ^ eti
// matching the Income Tax Design lab page (computeRevenue). etiMid applies at/below the
// threshold, etiTop above it; etiTop ≈ 0.15 under the Accord (CG unified, loopholes
// closed) or ≈ 0.30 for a conventional estimate.
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
  etiMid:       0.20,      // elasticity of taxable income, brackets at/below threshold
  etiTop:       0.15,      // elasticity above threshold (0.15 Accord / 0.30 conventional)
};

// Per-bracket blended standard deduction: joint filers (jFrac of the bracket) get the
// larger joint deduction; the rest get the single deduction.
function bracketDeduction(b, exemptSingle, exemptJoint) {
  return b.jFrac * exemptJoint + (1 - b.jFrac) * exemptSingle;
}

// Per-filer income tax for a single bracket, including the ETI behavioral damping.
// The single source of the tax math — used by incomeTaxRevenue (this module), and by the
// Income Tax Design lab page's revenue + distributional engines, so the two can't drift.
// Returns intermediates (meanAgi, sd, rawPerFiler, eff, bFactor) alongside the damped
// perFiler so each caller can read whichever fields it needs.
export function bracketIncomeTax(b, {
  lowRate      = INCOME_TAX_DEFAULTS.lowRate,
  highRate     = INCOME_TAX_DEFAULTS.highRate,
  threshold    = INCOME_TAX_DEFAULTS.threshold,
  exemptSingle = INCOME_TAX_DEFAULTS.exemptSingle,
  exemptJoint  = INCOME_TAX_DEFAULTS.exemptJoint,
  etiMid       = INCOME_TAX_DEFAULTS.etiMid,
  etiTop       = INCOME_TAX_DEFAULTS.etiTop,
} = {}) {
  const meanAgi = b.agi / b.filers;
  const sd = bracketDeduction(b, exemptSingle, exemptJoint);
  const midBase = Math.max(0, Math.min(meanAgi, threshold) - sd);
  const topBase = Math.max(0, meanAgi - threshold);
  const rawPerFiler = lowRate * midBase + highRate * topBase;
  const eff = rawPerFiler / Math.max(meanAgi, 1);
  const eti = meanAgi > threshold ? etiTop : etiMid;
  const bFactor = Math.pow(Math.max(0.10, 1 - eff) / Math.max(0.10, 1 - b.effCL), eti);
  const perFiler = rawPerFiler * bFactor;
  return { meanAgi, sd, midBase, topBase, rawPerFiler, eff, bFactor, perFiler };
}

// Total individual income tax revenue + per-bracket breakdown for a given structure.
// Per filer: deduction off the bottom; lowRate on (income−deduction) up to threshold,
//   highRate on income above threshold; then an ETI factor damps the base where the new
//   effective rate exceeds current law.
export function incomeTaxRevenue(structure = {}) {
  const byBracket = BRACKETS.map(b => {
    const { sd, eff, bFactor, perFiler } = bracketIncomeTax(b, structure);
    return { label: b.label, sd, eff, bFactor, perFiler, revenue: perFiler * b.filers };
  });
  const total = byBracket.reduce((s, x) => s + x.revenue, 0);
  return { total, byBracket, fracOfGdp: total / INCOME_REF_GDP };
}

// ─── FISCAL-ENGINE DROP-IN ───────────────────────────────────────────────────
// Computes the two-bracket revenue and scales it by nominalGdp/INCOME_REF_GDP so income
// tax grows with the economy.
export function incomeTaxRevForFiscal({ nominalGdp, ...structure }) {
  return incomeTaxRevenue(structure).total * (nominalGdp / INCOME_REF_GDP);
}
