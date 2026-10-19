// Household persona model shared by Household Impact, Inequality and the About page: income
// layers, net-worth layers, effective tax rates, and the cash-flow decomposition for the 13
// demographic personas. Values are in Year-0 real dollars. The AMCF deposit path, ownership
// paths and assigned revenue come from the shared fiscal engine through `fx`
// (see use-fiscal-params.js); FISCAL_DEFAULTS is the engine default.
// Design decisions: docs/engine-spec-2026-10-07.md.
import { BRACKETS, CARBON_TONS } from '@/lib/brackets';
import { lvtNetIncidenceArray, PREBATE_BASE, PREBATE_REDIRECTED, EXEMPTION_AMOUNT } from '@/lib/land';
import { DEMOS, DEMO_KEYS, POP, PROG_LOST, AMCF_LIQ_BASE, CL_ETR } from '@/lib/demographics';
import { CL_SCHED, accordSchedule, accordScheduleTax, earnersPerFiler, SS_CAP_SNAPSHOT, SS_RATE } from '@/lib/income-tax';
import { consumptionTaxCoverage, BASE_PARAMS, carbonDividendPerCapita, carbonDecayFactor, realGrantSeries, householdFiscalSeries } from '@/lib/fiscal-engine';
import { psuDividendPerFiler, wefBalancePerFiler, sectoralBalancePerFiler, extraGrantsPerFiler } from '@/lib/worker-equity';

export const BASE_ONLY = new Set(['BASE']);

// Demo → bracket index mapping (0–14, matching BRACKETS)
export const DEMO_BRACKET = {
  B10:1, P10:3, P20:4, P30:4, P40:5, P50:6, P60:6, P70:7, P80:8, T10:9, T1:11, BILL:14, ELON:14,
};

export const FISCAL_DEFAULTS = {
  ...BASE_PARAMS,
  grants: realGrantSeries(BASE_PARAMS),
  hh: householdFiscalSeries(BASE_PARAMS),
};
const hhAt = (fx, y) => fx.hh[Math.min(Math.max(0, Math.round(y)), fx.hh.length - 1)];

// ─── LVT INCIDENCE (residential owner/renter split) ─────────────────────────
// Per-filer net LVT = homeowner LVT − renter rent relief on the household's primary residence.
// Non-residential land LVT is assigned separately by business and financial holdings
// (assignedRentTax below).
export function lvtNetBr(k, y, P, fx = FISCAL_DEFAULTS) {
  const exemption = P.has('LVT_EX') ? EXEMPTION_AMOUNT : 0;
  return lvtNetIncidenceArray({ rate: fx.lvtRate, exemption, year: y })[DEMO_BRACKET[k]];
}

// Prebate per person. The slider sets the no-exemption (redirected) level; turning the
// $500k homeowner exemption on gives back the redirected portion, as in the engine.
export const PREBATE_REDIRECT_DELTA = PREBATE_REDIRECTED - PREBATE_BASE;
// With prebateIndex > 0 it also follows that share of real GDP-per-person growth.
export const prebatePC = (P, fx = FISCAL_DEFAULTS, y = 0) =>
  (P.has('LVT_EX') ? fx.prebatePerCapita - PREBATE_REDIRECT_DELTA : fx.prebatePerCapita)
  * Math.pow(hhAt(fx, y).gdpPerCapIdx ?? 1, fx.prebateIndex ?? 0);

// ─── TAX SCHEDULES ───────────────────────────────────────────────────────────
// Current law: 2024 federal brackets and standard deduction, held fixed in real terms.
// Long-term gains and qualified dividends (prefShare) are taxed at 0/15/20% stacked on top of
// ordinary income, plus the 3.8% NIIT. Above $500K, itemized deductions are taken as 8% of
// income when that beats the standard deduction. Refundable EITC/CTC are not here: they are
// counted in PROG_LOST as programs the prebate replaces. The schedule (CL_SCHED) is in income-tax.js.
// Preferential share of income: capital gains share by bracket plus qualified dividends, which
// rise with income (IRS SOI pattern). Assumption.
const PREF_EXTRA = [0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.04,0.08,0.15,0.20,0.25,0.30];
const prefShare = k => Math.min(0.9, BRACKETS[DEMO_BRACKET[k]].cgShare + PREF_EXTRA[DEMO_BRACKET[k]]);

function clTaxOne(income, pref, s) {
  const ded = income > 500000 ? Math.max(s.sd, 0.08 * income) : s.sd;
  const ti = Math.max(0, income - ded);
  const prefInc = Math.min(ti, income * pref), ord = ti - prefInc;
  let t = 0, lo = 0;
  for (const [hi, r] of s.br) { if (ord > lo) t += (Math.min(ord, hi) - lo) * r; lo = hi; }
  const seg = (x0, x1, r) => Math.max(0, Math.min(ord + prefInc, x1) - Math.max(ord, x0)) * r;
  t += seg(s.cg[0], s.cg[1], 0.15) + seg(s.cg[1], Infinity, 0.20);
  if (income > s.niit) t += 0.038 * Math.min(income * pref, income - s.niit);
  return t;
}
export function clIncomeTax(income, hhSz, pref = 0) {
  const j = Math.min(1, Math.max(0, hhSz - 1));
  return j * clTaxOne(income, pref, CL_SCHED.joint) + (1 - j) * clTaxOne(income, pref, CL_SCHED.single);
}

// Accord thresholds, the standard deduction and the Social Security cap rise with average wages
// (decided 2026-10-16), measured by real GDP per person, the same index the engine's revenue
// scaling implies. Current-law brackets stay CPI-indexed, as in statute.
const wageIndex = (fx, y) => hhAt(fx, y).gdpPerCapIdx ?? 1;

// Accord income tax on the engine's schedule in year y. All income types are ordinary income.
export function accordIncomeTax(income, hhSz, fx, y = 0) {
  const w = wageIndex(fx, y);
  const jFrac = Math.min(1, Math.max(0, hhSz - 1));
  const ded   = (jFrac * fx.incomeTaxExemptJoint + (1 - jFrac) * fx.incomeTaxExemptSingle) * w;
  const sched = accordSchedule({ brackets: fx.incomeTaxBrackets ?? undefined,
    lowRate: fx.incomeTaxLow, highRate: fx.incomeTaxHigh, threshold: fx.incomeTaxThreshold,
    riseEnd: fx.incomeTaxRiseEnd, riseShape: fx.incomeTaxRiseShape })
    .map(([hi, r]) => [hi * w, r]);
  return accordScheduleTax(income, ded, sched);
}

// Payroll and other taxes as a rate on income: the persona's all-in current-law rate less its
// current-law income tax at Year 0. Unchanged by the Accord except the payroll fix.
export const PAYROLL_RATE = Object.fromEntries(DEMO_KEYS.map(k => {
  const d = DEMOS[k];
  return [k, Math.max(0, CL_ETR[k] - clIncomeTax(d.income, d.hhSz, prefShare(k)) / d.income)];
}));


export const incomeAt = (k, y) => DEMOS[k].income * Math.pow(1 + DEMOS[k].incG, y);
export const clTaxAt = (k, y) => clIncomeTax(incomeAt(k, y), DEMOS[k].hhSz, prefShare(k));
// Income tax reform delta at year y: Accord minus current law on the same income.
export const taxAt = (k, y, fx = FISCAL_DEFAULTS, inc = incomeAt(k, y)) =>
  accordIncomeTax(inc, DEMOS[k].hhSz, fx, y) - clTaxAt(k, y);
// Social Security contribution above the cap: 12.4% on all income above the per-worker cap,
// with no benefit credit. The cap follows average wages (wageIndex).
export function payrollFix(k, y, fx = FISCAL_DEFAULTS, inc = incomeAt(k, y)) {
  if (fx.ssUncapOn === false) return 0;
  const jFrac = BRACKETS[DEMO_BRACKET[k]].jFrac;
  const e = earnersPerFiler(jFrac);
  const cap = SS_CAP_SNAPSHOT * wageIndex(fx, y);
  return SS_RATE * Math.max(0, inc / e - cap) * e;
}

// ─── ACCORD NW GROWTH ────────────────────────────────────────────────────────
// The capital-gains part of the reform lowers the after-tax return on financial portfolios.
// Dilution of existing equity is applied separately (dilutionFactor).
const CL_CG_RATE  = { B10:0, P10:0, P20:0, P30:0.15, P40:0.15, P50:0.15,
                      P60:0.15, P70:0.15, P80:0.15, T10:0.238, T1:0.238, BILL:0.238, ELON:0.238 };
const ACC_CG_RATE = { B10:0, P10:0, P20:0, P30:0.25, P40:0.25, P50:0.25,
                      P60:0.25, P70:0.25, P80:0.25, T10:0.25, T1:0.50, BILL:0.50, ELON:0.50 };
const CG_FRAC = 0.75;  // share of portfolio return that is capital gain
export function computeAccordNWG(k) {
  const d = DEMOS[k];
  const finDrag = d.finPct * d.ret * CG_FRAC * Math.max(0, ACC_CG_RATE[k] - CL_CG_RATE[k]);
  return Math.max(d.nwG * 0.5, d.nwG - finDrag);
}

// Share of net worth in equities exposed to Growth Tax and Equity Excise dilution: ~60% of
// retirement accounts, ~70% of other financial assets, and private business equity only where
// the businesses are above the $10M threshold (part of T1, all of Billionaires/Musk). Assumption.
const LARGE_BIZ_SHARE = { T1: 0.5, BILL: 1, ELON: 1 };
const dilutableShare = k => {
  const d = DEMOS[k];
  return 0.6 * d.k401Pct + 0.7 * d.finPct + d.bizPct * (LARGE_BIZ_SHARE[k] ?? 0);
};
// Business equity under $10M held through partnerships, LLCs and small corporations. The Growth
// Tax applies to it (no size line, pass-throughs included) but the Equity Excise does not, and
// most of it never paid the corporate tax, so it is diluted by the AMCF's stake only, with no
// revaluation. Sole proprietorships stay out: 70% of the rest is held through entities, the
// engine's pass-through assumption.
const SMALL_BIZ_ENTITY_SHARE = 0.7;
const smallBizShare = k => DEMOS[k].bizPct * (1 - (LARGE_BIZ_SHARE[k] ?? 0)) * SMALL_BIZ_ENTITY_SHARE;
const smallBizFactor = (y, P, fx) => 1 - (P.has('AMCF') ? hhAt(fx, y).fundOwn : 0);
// Private holders' value relative to current law: the corporate-tax revaluation (TAX), less
// the AMCF's stake (AMCF) and the worker pool (PSU) on the engine's ownership paths.
export function dilutionFactor(y, P, fx = FISCAL_DEFAULTS) {
  const h = hhAt(fx, y);
  const reval = P.has('TAX') ? h.reval : 1;
  const fund = P.has('AMCF') ? h.fundOwn : 0;
  const worker = (P.has('PSU_D') || P.has('PSU_C')) ? h.workerOwn : 0;
  return reval * (1 - fund - worker);
}

// Share of income that is the return on dilutable holdings: the preferential share (gains and
// qualified dividends) times the dilutable share of financial and business assets. Payouts per
// dollar of company value are unchanged by the reform (the engine holds the payout yield on
// revalued value), so this income moves with dilutionFactor. Assumption.
const holdingsIncomeShare = k => {
  const d = DEMOS[k], held = d.finPct + d.bizPct;
  return held > 0 ? prefShare(k) * (0.7 * d.finPct + d.bizPct * (LARGE_BIZ_SHARE[k] ?? 0)) / held : 0;
};
// Pre-tax income under the active provisions: holdings income is revalued and diluted with the
// household's stakes. Small business payouts (at the engine's payout yield on current-law
// holdings) lose the AMCF's share.
export function accordIncomeAt(k, y, P, fx = FISCAL_DEFAULTS) {
  const s = holdingsIncomeShare(k);
  const smallBizPayout = clBaseNW(k, y) * smallBizShare(k) * hhAt(fx, y).wefYield;
  return incomeAt(k, y) * (1 - s + s * dilutionFactor(y, P, fx)) - smallBizPayout * (1 - smallBizFactor(y, P, fx));
}

// ─── REVENUE ASSIGNED BY HOLDINGS ────────────────────────────────────────────
// Non-residential LVT and the smaller rent taxes (FTT, G-SIB levy, royalties, spectrum and
// the rest) fall on owners of business and financial assets. 70% is assigned to US
// households, in proportion to each persona's dilutable holdings; the rest falls on foreign
// and institutional owners. Assumption.
const US_HOUSEHOLD_SHARE = 0.70;
const HOUSEHOLDS_Y0 = 133e6;
const clBaseNW = (k, y) => {
  const d = DEMOS[k];
  return d.nw >= 0 ? d.nw * Math.pow(1 + d.nwG, y) : 0;
};
// Taxes on gains realized at death and on gifts fall on estates above the $5M exclusion, so
// they are assigned to the top 1% personas by the same holdings weights.
const REALIZATION_PAYERS = ['T1', 'BILL', 'ELON'];
// Musk is one living person, so no tax on gains at death falls on him inside the 35-year window;
// his holdings stay in the denominator and his share goes unassigned. T1 and Billionaires are
// groups (about 1.25 million and 800 households) in which some die or give assets away each year.
const REALIZATION_EXEMPT_INDIVIDUALS = ['ELON'];
export function assignedRentTax(k, y, fx = FISCAL_DEFAULTS) {
  const h = hhAt(fx, y);
  const wt = j => clBaseNW(j, y) * dilutableShare(j);
  const hh = j => POP[j] * HOUSEHOLDS_Y0 * (h.popScale ?? 1);
  const denom = DEMO_KEYS.reduce((s, j) => s + wt(j) * hh(j), 0);
  const rent = denom > 0 ? (h.nonResLvt + h.stableTax) * US_HOUSEHOLD_SHARE * wt(k) / denom : 0;
  const denomTop = REALIZATION_PAYERS.reduce((s, j) => s + wt(j) * hh(j), 0);
  const realization = REALIZATION_PAYERS.includes(k) && !REALIZATION_EXEMPT_INDIVIDUALS.includes(k) && denomTop > 0
    ? (h.realization ?? 0) * wt(k) / denomTop : 0;
  return rent + realization;
}

export function lerp(anc, x) {
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

export const amcfG = (y, fx = FISCAL_DEFAULTS) => lerp(fx.grants, y);
// Carbon dividend and household emissions both fall with the engine's decarbonization path.
export const carbonDivPC = (rate, y) => carbonDividendPerCapita(rate) * carbonDecayFactor(y);
export const carbonCostAt = (bi, y, fx) => CARBON_TONS[bi] * fx.carbonRate * carbonDecayFactor(y);
export const pressureDecay = y => 0.5 + 0.5 * Math.exp(-y / 15);
export const liqRate = (k, y) => AMCF_LIQ_BASE[k] * pressureDecay(y);

// ─── PSU AND AMCF FLOWS ──────────────────────────────────────────────────────
// PSU_D: worker-equity cash income (Sectoral Fund payouts, profit-sharing, fund-unit dividends).
// PSU_C: Worker Equity Fund units and Sectoral Fund balances held, a wealth layer with no cash
// income. Nothing is redeemed at job changes.
export const psuDAt = (k, y, fx = FISCAL_DEFAULTS) => psuDividendPerFiler(DEMO_BRACKET[k], y, fx.hh);
export const wefBalAt = (k, y, fx = FISCAL_DEFAULTS) =>
  wefBalancePerFiler(DEMO_BRACKET[k], y, fx.hh) + sectoralBalancePerFiler(DEMO_BRACKET[k], y, fx.hh);
// Citizen grants a household receives in a year: one per adult, plus the extra grants from the
// care credit and public-employee units.
const grantCount = (k, y, fx) => Math.min(DEMOS[k].hhSz, 2) + extraGrantsPerFiler(DEMO_BRACKET[k], hhAt(fx, y));
export const psuCAt = () => 0;
// AMCF withdrawals: qualified uses (home, education, business, retirement, hardship) are
// tax-free; the rest is ordinary income. Half assumed qualified.
const AMCF_QUALIFIED_SHARE = 0.5;
export const amcfWithdrawalAt = (k, y, fx = FISCAL_DEFAULTS) =>
  amcfG(y, fx) * grantCount(k, y, fx) * liqRate(k, y);

// Taxable income the Accord adds (worker-equity cash income, non-qualified withdrawals), and the
// income tax on it at the household's marginal rate: Accord schedule with TAX on, current-law
// schedule otherwise.
function extraIncome(k, y, P, fx) {
  return (P.has('PSU_D') ? psuDAt(k, y, fx) : 0)
    + (P.has('AMCF') ? amcfWithdrawalAt(k, y, fx) * (1 - AMCF_QUALIFIED_SHARE) : 0);
}
export function extraIncomeTax(k, y, P, fx = FISCAL_DEFAULTS) {
  const x = extraIncome(k, y, P, fx);
  if (x <= 0) return 0;
  const d = DEMOS[k], inc = accordIncomeAt(k, y, P, fx);
  return P.has('TAX')
    ? accordIncomeTax(inc + x, d.hhSz, fx, y) - accordIncomeTax(inc, d.hhSz, fx, y)
    : clIncomeTax(inc + x, d.hhSz, prefShare(k)) - clIncomeTax(inc, d.hhSz, prefShare(k));
}
// After-tax share of the Accord's taxable flows in year y.
export function extraNetShare(k, y, P, fx = FISCAL_DEFAULTS) {
  const x = extraIncome(k, y, P, fx);
  return x > 0 ? 1 - extraIncomeTax(k, y, P, fx) / x : 1;
}
// Backward-compatible names used by the pages.
export const psuIncomeTax = extraIncomeTax;
export const psuNetShare = extraNetShare;

// All tax-reform cash costs for one persona in year y (positive = cost): income tax delta,
// VAT, residential LVT, carbon, the payroll fix and assigned rent taxes.
function reformCosts(k, y, P, fx) {
  const bi = DEMO_BRACKET[k], inc = accordIncomeAt(k, y, P, fx);
  return {
    incomeTax: taxAt(k, y, fx, inc),
    // The VAT, the VAT on new homes and the FAT reach this share of consumption. Assumption:
    // each is the same share of every bracket's consumption.
    vat: fx.vatRate * BRACKETS[bi].cRat * inc * consumptionTaxCoverage(fx),
    lvt: lvtNetBr(k, y, P, fx),
    carbon: carbonCostAt(bi, y, fx),
    payrollFix: payrollFix(k, y, fx, inc),
    assigned: assignedRentTax(k, y, fx),
  };
}
const sumCosts = c => c.incomeTax + c.vat + c.lvt + c.carbon + c.payrollFix + c.assigned;

// ╔═══════════════════════════════════════╗
// ║  COMPUTATION ENGINE                   ║
// ╚═══════════════════════════════════════╝

// Layered income for (persona, year, active provisions). tax: negative = net cost.
// Households whose wealth is over 10× their income (T1, Billionaires, Musk) pay the taxes assigned
// by holdings out of their portfolios (the companies they own pay them), so those taxes reduce
// net worth (getNW) and not income.
const portfolioPaid = k => DEMOS[k].nw > 10 * DEMOS[k].income;

export function getInc(k, y, P, fx = FISCAL_DEFAULTS) {
  const d = DEMOS[k];
  const base = accordIncomeAt(k, y, P, fx);
  const costs = P.has('TAX') ? reformCosts(k, y, P, fx) : null;
  const tax = costs ? -(sumCosts(costs) - (portfolioPaid(k) ? costs.assigned : 0)) : 0;
  const carbonDiv = carbonDivPC(fx.carbonRate, y) * d.hhSz;
  const pre = P.has('PRE') ? (prebatePC(P, fx, y) * d.hhSz + carbonDiv - PROG_LOST[k]) : 0;
  // AMCF and PSU layers are after the income tax on their taxable part.
  const net = extraNetShare(k, y, P, fx);
  const withdrawal = P.has('AMCF') ? amcfWithdrawalAt(k, y, fx) : 0;
  const nqTaxShare = 1 - AMCF_QUALIFIED_SHARE;
  const ag = withdrawal * (AMCF_QUALIFIED_SHARE + nqTaxShare * net);
  const pd = P.has('PSU_D') ? psuDAt(k, y, fx) * net : 0;
  const pc = 0;
  return { base, tax, pre, amcf: ag, psuD: pd, psuC: pc, total: base + tax + pre + ag + pd + pc };
}

// Layered net worth, compounded.
// Pre-reform wealth carried forward under the active provisions (growth, then dilution).
function baseNW(k, y, P, fx) {
  const d = DEMOS[k];
  if (d.nw < 0) return Math.max(d.nw, d.nw + d.income * d.save * Math.min(y, 30));
  const nwGr = P.has('TAX') ? computeAccordNWG(k) : d.nwG;
  const ds = dilutableShare(k), sb = smallBizShare(k);
  return d.nw * Math.pow(1 + nwGr, y) * (1 - ds - sb + ds * dilutionFactor(y, P, fx) + sb * smallBizFactor(y, P, fx));
}

export function getNW(k, y, P, fx = FISCAL_DEFAULTS) {
  const d = DEMOS[k], r = d.ret;
  const base = baseNW(k, y, P, fx);

  let tax = 0, pre = 0, ag = 0, pd = 0, pc = 0;
  if (P.has('TAX')) {
    // Taxes assigned by holdings (business-land LVT, the smaller rent taxes, realization) are set
    // on current-law holdings. When the reform has drawn a household's wealth below its
    // current-law path, its holdings and so these taxes shrink in proportion, the year after.
    // Households whose wealth is over 10× their income pay the reform out of their portfolio, so
    // the cost compounds at the portfolio's growth rate, and the tax on their investment income
    // (the bracket's gains share of income) shrinks as the taxes draw their holdings down.
    // Dilution already lowers that income (accordIncomeAt), so only the tax drawdown counts here.
    const rc = portfolioPaid(k) ? Math.min(r, computeAccordNWG(k)) : r;
    const capShare = portfolioPaid(k) ? BRACKETS[DEMO_BRACKET[k]].cgShare : 0;
    let c = 0;
    for (let t = 1; t <= y; t++) {
      const costs = reformCosts(k, t, P, fx);
      const clW = clBaseNW(k, t - 1);
      const bW = baseNW(k, t - 1, P, fx);
      const held = clW > 0 ? Math.min(1, Math.max(0, (bW + c) / clW)) : 1;
      const heldAfterTax = bW > 0 ? Math.min(1, Math.max(0, (bW + c) / bW)) : 1;
      const shrink = (1 - held) * costs.assigned
        + (1 - heldAfterTax) * capShare * (costs.incomeTax + costs.payrollFix);
      c = c * (1 + rc) - (sumCosts(costs) - shrink) * d.save;
    }
    tax = c;
  }
  if (P.has('PRE')) {
    let c = 0;
    for (let t = 1; t <= y; t++) {
      const ann = prebatePC(P, fx, t) * d.hhSz + carbonDivPC(fx.carbonRate, t) * d.hhSz - PROG_LOST[k];
      c = c * (1 + r) + ann * d.save;
    }
    pre = c;
  }
  if (P.has('AMCF')) {
    // Custodial accounts: each year one cohort turns 18 with its childhood units, averaged over
    // the 47-year working span. Units compound at 5% real.
    const WORK_SPAN = 47;
    let cust = 0;
    for (let c = 1; c <= y; c++) {
      const grantYears = Math.min(c, 18);
      let acct = 0;
      for (let t = c - grantYears + 1; t <= c; t++) acct = acct * 1.05 + amcfG(t, fx);
      acct *= Math.pow(1.05, y - c);
      cust += acct;
    }
    cust /= WORK_SPAN;
    let retainedAcc = 0, liqSavings = 0;
    for (let t = 1; t <= y; t++) {
      const grant = amcfG(t, fx) * grantCount(k, t, fx);
      const lr = liqRate(k, t);
      const netW = AMCF_QUALIFIED_SHARE + (1 - AMCF_QUALIFIED_SHARE) * extraNetShare(k, t, P, fx);
      retainedAcc = retainedAcc * 1.05 + grant * (1 - lr);
      liqSavings  = liqSavings  * (1 + r) + grant * lr * netW * d.save;
    }
    ag = cust + retainedAcc + liqSavings;
  }
  if (P.has('PSU_D')) {
    let c = 0;
    for (let t = 1; t <= y; t++) c = c * (1 + r) + psuDAt(k, t, fx) * extraNetShare(k, t, P, fx) * d.save;
    pd = c;
  }
  if (P.has('PSU_C')) pc = wefBalAt(k, y, fx);
  return { base, tax, pre, amcf: ag, psuD: pd, psuC: pc, total: base + tax + pre + ag + pd + pc };
}

// ─── BILLIONAIRE ECONOMIC-INCOME ETR ─────────────────────────────────────────
// For Billionaires and Musk, reported income understates economic income, so the rate is taken
// on reported income plus unrealized appreciation. Current law taxes reported income; the
// Accord adds the income tax reform, LVT, the Social Security contribution above the cap, and
// assigned rent taxes, which include the tax on gains realized at death and on gifts.
export function billionaireETR(k, y, P, fx = FISCAL_DEFAULTS) {
  const d    = DEMOS[k];
  const nwGr = P.has('TAX') ? computeAccordNWG(k) : d.nwG;
  const nwY  = d.nw * Math.pow(1 + nwGr, y);
  const incY = accordIncomeAt(k, y, P, fx);
  const unrealBiz = nwY * d.bizPct * d.nwG;
  const unrealFin = nwY * d.finPct * d.ret * 0.80;
  const econInc   = incY + unrealBiz + unrealFin;
  let taxes = clTaxAt(k, y) + incomeAt(k, y) * PAYROLL_RATE[k];
  if (P.has('TAX')) {
    taxes += sumCosts(reformCosts(k, y, P, fx));
  }
  if (P.has('PRE')) {
    taxes -= (prebatePC(P, fx, y) * d.hhSz + carbonDivPC(fx.carbonRate, y) * d.hhSz - PROG_LOST[k]);
  }
  return econInc > 0 ? taxes / econInc * 100 : 0;
}

// Effective tax rate: (taxes − transfers) / income × 100. AMCF and PSU are excluded.
export function getETR(k, y, P, fx = FISCAL_DEFAULTS) {
  if (k === 'BILL' || k === 'ELON') return billionaireETR(k, y, P, fx);
  const d = DEMOS[k];
  const g = accordIncomeAt(k, y, P, fx);
  let taxes = clTaxAt(k, y) + incomeAt(k, y) * PAYROLL_RATE[k], bens = 0;
  if (P.has('TAX')) taxes += sumCosts(reformCosts(k, y, P, fx));
  if (P.has('PRE')) bens += prebatePC(P, fx, y) * d.hhSz + carbonDivPC(fx.carbonRate, y) * d.hhSz - PROG_LOST[k];
  return g > 0 ? (taxes - bens) / g * 100 : 0;
}

// Gini from weighted distribution points (Lorenz trapezoid method)
export function computeGini(pts) {
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

// Cash-flow decomposition. Matches getInc: net − current-law net equals the Accord delta.
export function cashFlowPt(k, y, P, norm, fx = FISCAL_DEFAULTS) {
  const d = DEMOS[k];
  const gross = accordIncomeAt(k, y, P, fx);
  const clTax = -(clTaxAt(k, y) + incomeAt(k, y) * PAYROLL_RATE[k]);
  const c = P.has('TAX') ? reformCosts(k, y, P, fx) : null;
  const taxRef = c ? -c.incomeTax : 0;
  const vat  = c ? -c.vat : 0;
  const lvt  = c ? -c.lvt : 0;
  const carb = c ? -c.carbon : 0;
  const payFix = c ? -c.payrollFix : 0;
  const assigned = c && !portfolioPaid(k) ? -c.assigned : 0;
  const progLost = P.has('PRE') ? -PROG_LOST[k] : 0;
  const pre  = P.has('PRE') ? prebatePC(P, fx, y) * d.hhSz : 0;
  const cdiv = P.has('PRE') ? carbonDivPC(fx.carbonRate, y) * d.hhSz : 0;
  const ag   = P.has('AMCF')  ? amcfWithdrawalAt(k, y, fx) : 0;
  const pd   = P.has('PSU_D') ? psuDAt(k, y, fx) : 0;
  const pc   = 0;
  const psuTax = -extraIncomeTax(k, y, P, fx);
  const net  = gross + clTax + taxRef + vat + lvt + carb + payFix + assigned + progLost + pre + cdiv + ag + pd + pc + psuTax;
  const div  = norm ? Math.max(Math.abs(gross), 1) / 100 : 1;
  return { grossInc:gross/div, clTax:clTax/div, taxRef:taxRef/div, vat:vat/div, lvt:lvt/div,
    carb:carb/div, payFix:payFix/div, assigned:assigned/div, progLost:progLost/div, pre:pre/div, cdiv:cdiv/div,
    ag:ag/div, pd:pd/div, pc:pc/div, psuTax:psuTax/div, net:net/div };
}
