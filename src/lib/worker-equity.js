// Worker equity by IRS-SOI income bracket. Shared by Household Impact, Inequality,
// Distributional Impact and Income Tax Design so the tables and formulas cannot drift between
// pages. Every value is in 2024 real dollars.
//
//   Tier 1 ($0–10M EV):  1.15% of payroll into the portable Sectoral Wealth Fund (6% gross, 3.5% paid out)
//   Tier 2+ ($10M+ EV):  the Equity Excise builds a 21% stake held permanently in each company's
//                        worker trust. Its dividends are split: cash profit-sharing to the
//                        company's current workers, and new Worker Equity Fund units issued to all
//                        workers by hours worked. Units are portable property; nothing is redeemed
//                        when a worker leaves.
// The trust flows come from the fiscal engine (householdFiscalSeries): wefAccrual, profitShare,
// wefPrice and wefYield.
import {
  BASE_PARAMS, householdFiscalSeries, CEOC_DEPOSIT, CEOC_FTE, CEOC_EXTRA_GRANTS, PUBLIC_EMPLOYEES,
} from '@/lib/fiscal-engine';
import { BRACKETS } from '@/lib/brackets';

// [Tier 1, Tier 2, Tier 3] share of filers by bracket (BLS firm-size data), parallel to BRACKETS
export const TIER_DIST = [
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

// Hours-worked fraction by bracket; fund units and profit-sharing are proportional to FTE
export const PARTTIME_FTE = [
  0.20, 0.45, 0.65, 0.90, 0.95,
  1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
];

export const PSU_YIELD = 0.035;  // Sectoral Wealth Fund payout yield (Tier 1, care credit)
const SECTORAL_RETAINED = 0.06 - PSU_YIELD; // 6% gross return, 3.5% paid out, 2.5% retained

// Sectoral fund balance at year y with a fixed annual contribution C. The 3.5% paid out each
// year leaves the fund, so the balance compounds at the retained 2.5%.
export function sectoralFundBalance(C, y) {
  return y <= 0 ? 0 : C * (Math.pow(1 + SECTORAL_RETAINED, y) - 1) / SECTORAL_RETAINED;
}

// Headcount test (decided 2026-10-26): firms under $10M EV still fund a worker trust once they have
// 50 or more FTE workers, phased in to the full target at 100. Share of Tier 1 workers this moves
// into worker trusts: about a quarter of Tier 1 work is in firms with 50+ FTE (assumption), counted
// at three-quarters weight for the 50-100 phase-in.
export const TIER1_HEADCOUNT_SHIFT = 0.25 * 0.75;
const tier1Share = t => t[0] * (1 - TIER1_HEADCOUNT_SHIFT);

// FTE workers per filer (all tiers) and FTE workers at worker-trust (Tier 2 and 3) firms per filer. Fund units go to every
// worker by hours; profit-sharing goes only to workers at companies with a worker trust.
const WORKER_FTE = TIER_DIST.map((t, i) => (t[0] + t[1] + t[2]) * PARTTIME_FTE[i]);
const TRUST_FTE  = TIER_DIST.map((t, i) => (t[0] - tier1Share(t) + t[1] + t[2]) * PARTTIME_FTE[i]);
const TOTAL_WORKER_FTE = BRACKETS.reduce((s, b, i) => s + b.filers * WORKER_FTE[i], 0);
const TOTAL_TRUST_FTE  = BRACKETS.reduce((s, b, i) => s + b.filers * TRUST_FTE[i], 0);

// Care credit FTE-equivalents per filer, relative weights by bracket. Assumption: SSDI
// recipients and full-time students sit mostly in the lower brackets; at-home child and elder
// caregivers appear at every income. Scaled so the total matches the engine's 24.9M.
const CEOC_WEIGHT = [0.25, 0.25, 0.22, 0.18, 0.15, 0.13, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12];
const CEOC_W_TOTAL = BRACKETS.reduce((s, b, i) => s + b.filers * CEOC_WEIGHT[i], 0);
export const ceocFtePerFiler = bi => CEOC_WEIGHT[bi] * CEOC_FTE / CEOC_W_TOTAL;
// Extra citizen grants a year per filer: care credit participants (same weights) and public
// employees (distributed like employment, an assumption).
export function extraGrantsPerFiler(bi, r) {
  const ceoc = r.ceocOn ? CEOC_WEIGHT[bi] * CEOC_EXTRA_GRANTS / CEOC_W_TOTAL : 0;
  const pseu = r.pseuMultiple * WORKER_FTE[bi] * PUBLIC_EMPLOYEES / TOTAL_WORKER_FTE;
  return ceoc + pseu;
}

const DEFAULT_HH = householdFiscalSeries(BASE_PARAMS, 70);
const hhRow = (hh, y) => hh[Math.min(Math.max(0, Math.round(y)), hh.length - 1)];

// Per full-time worker: fund units issued in year y, and profit-sharing at a worker-trust company
export function wefAccrualPerFte(y, hh = DEFAULT_HH) {
  const r = hhRow(hh, y);
  return y <= 0 ? 0 : r.wefAccrual / (TOTAL_WORKER_FTE * r.popScale);
}
export function profitSharePerTrustFte(y, hh = DEFAULT_HH) {
  const r = hhRow(hh, y);
  return y <= 0 ? 0 : r.profitShare / (TOTAL_TRUST_FTE * r.popScale);
}

// Worker Equity Fund units issued in year y to a filer in bracket bi
export function wefAccrualPerFiler(bi, y, hh = DEFAULT_HH) {
  const r = hhRow(hh, y);
  return y <= 0 ? 0 : r.wefAccrual / (TOTAL_WORKER_FTE * r.popScale) * WORKER_FTE[bi];
}

// Value at year y of all units accrued through year y (units move with the fund's unit price)
export function wefBalancePerFiler(bi, y, hh = DEFAULT_HH) {
  let bal = 0;
  for (let t = 1; t <= y; t++) bal += wefAccrualPerFiler(bi, t, hh) * hhRow(hh, y).wefPrice / hhRow(hh, t).wefPrice;
  return bal;
}

// Cash profit-sharing in year y from the worker's own company (Tier 2 and 3 workers only)
export function profitSharePerFiler(bi, y, hh = DEFAULT_HH) {
  const r = hhRow(hh, y);
  return y <= 0 ? 0 : r.profitShare / (TOTAL_TRUST_FTE * r.popScale) * TRUST_FTE[bi];
}

// Tier 1 employers pay 1.15% of all of each worker's wages into the Sectoral Fund (decided
// 2026-10-19). The rate raises about the same total as $1,000 per FTE worker ($25.7B on a $2.2T
// Tier 1 wage base). Wages per filer are AGI less the bracket's gains share (assumption), held at
// Year-0 real levels.
export const SECTORAL_PAYROLL_RATE = 0.0115;
const tier1Contribution = bi => {
  const b = BRACKETS[bi];
  return tier1Share(TIER_DIST[bi]) * SECTORAL_PAYROLL_RATE * b.agi / b.filers * (1 - b.cgShare);
};

// Sectoral Wealth Fund balance per filer at year y: Tier 1 employer contributions plus
// care-credit deposits.
export function sectoralBalancePerFiler(bi, y, hh = DEFAULT_HH) {
  const employer = sectoralFundBalance(tier1Contribution(bi), y);
  const ceoc = hhRow(hh, y).ceocOn ? sectoralFundBalance(CEOC_DEPOSIT * ceocFtePerFiler(bi), y) : 0;
  return employer + ceoc;
}

// Annual worker-equity cash income per filer in bracket bi at year y: Sectoral Fund payouts,
// profit-sharing, and cash dividends on Worker Equity Fund units held at the start of the year.
export function psuDividendPerFiler(bi, y, hh = DEFAULT_HH) {
  const sectoral = sectoralBalancePerFiler(bi, y, hh) * PSU_YIELD;
  const unitDiv = wefBalancePerFiler(bi, y - 1, hh) * hhRow(hh, y).wefYield;
  return sectoral + profitSharePerFiler(bi, y, hh) + unitDiv;
}
