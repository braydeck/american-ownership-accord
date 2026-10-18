// Evaluates one tax-and-transfer design on the shared engine and household model. Used by
// scripts/design-search.mjs. Lever ranges were signed off by Brayden on 2026-10-16
// (docs/engine-spec-2026-10-07.md, "Design search").
import { runFiscalSimulation, BASE_PARAMS, realGrantSeries, householdFiscalSeries } from '@/lib/fiscal-engine';
import { getInc, getNW, BASE_ONLY, computeGini } from '@/lib/household-model';
import { DEMO_KEYS, POP } from '@/lib/demographics';
import { stableRentRevYr1, RENT_TAX_DEFAULTS, YR1_NOM_GDP } from '@/lib/rent-taxes';

const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
export const BOTTOM_80 = ['B10', 'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70'];
export const CHECK_YEARS = [5, 10, 20, 30];
export const THRESHOLD_GRID = [100e3, 200e3, 400e3, 1e6, 2e6, 5e6];
export const PREBATE_INDEX_OPTIONS = [0, 0.25, 0.5, 0.75, 1];
export const FLOOR_INDEX_OPTIONS = [0, 0.5];

// u: UNIT_DIMS numbers in [0, 1) (one Latin hypercube row) → engine parameters.
export function designFromUnit(u) {
  const nBrackets = 2 + Math.min(2, Math.floor(u[0] * 3));
  const low = 0.10 + 0.15 * u[1];
  const top = 0.40 + 0.20 * u[2];
  // Thresholds: nBrackets − 1 distinct grid points, chosen by a rotation of the grid from u[3].
  const start = Math.floor(u[3] * THRESHOLD_GRID.length);
  const picks = [];
  for (let i = 0; picks.length < nBrackets - 1; i++) {
    const t = THRESHOLD_GRID[(start + i * 2) % THRESHOLD_GRID.length];
    if (!picks.includes(t)) picks.push(t);
    if (i > 20) break;
  }
  picks.sort((a, b) => a - b);
  // Middle rates rise evenly between low and top, with u[4] skewing them toward either end.
  const skew = 0.5 + u[4];
  const rates = Array.from({ length: nBrackets }, (_, i) =>
    low + (top - low) * Math.pow(i / (nBrackets - 1), skew));
  const brackets = rates.map((r, i) => [i < picks.length ? picks[i] : Infinity, +r.toFixed(4)]);
  const exemptJoint = Math.round((30e3 + 50e3 * u[5]) / 1000) * 1000;
  const fttPct = +(0.5 * u[10]).toFixed(3);
  return {
    incomeTaxBrackets: brackets,
    incomeTaxLow: brackets[0][1], incomeTaxHigh: brackets[brackets.length - 1][1],
    incomeTaxThreshold: picks[picks.length - 1],
    incomeTaxExemptJoint: exemptJoint, incomeTaxExemptSingle: exemptJoint / 2,
    vatRate: +(0.15 * u[6]).toFixed(4),
    lvtRate: +(0.15 * u[7]).toFixed(4),
    carbonRate: Math.round(190 * u[8]),
    prebatePerCapita: Math.round((3000 + 7000 * u[9]) / 50) * 50,
    prebateIndex: PREBATE_INDEX_OPTIONS[Math.floor(u[11] * PREBATE_INDEX_OPTIONS.length)],
    citizenFloorIndex: FLOOR_INDEX_OPTIONS[Math.floor(u[12] * FLOOR_INDEX_OPTIONS.length)],
    fttPct,
    stableTaxFrac: stableRentRevYr1({ ...RENT_TAX_DEFAULTS, fttPct }) / YR1_NOM_GDP,
  };
}
export const UNIT_DIMS = 13;

// Curve schedule (Brayden, 2026-10-18): the marginal rate rises from the low rate at a start
// income to the top rate at an end income, following low + (top − low) · t^shape with t running
// 0 → 1 in log income, stepped in CURVE_STEPS brackets. Uses the same low, top and non-income-tax
// lever ranges as designFromUnit; u[0], u[3] and u[4] set start, end and shape.
export const CURVE_STEPS = 16;
export function curveBrackets({ low, top, start, end, shape }) {
  const b = [[start, low]];
  for (let k = 1; k <= CURVE_STEPS; k++)
    b.push([Math.round(start * Math.pow(end / start, k / CURVE_STEPS)), +(low + (top - low) * Math.pow((k - 0.5) / CURVE_STEPS, shape)).toFixed(4)]);
  return [...b, [Infinity, top]];
}
const logRange = (u, a, b) => a * Math.pow(b / a, u);
export function curveDesignFromUnit(u) {
  const base = designFromUnit(u);
  const curve = {
    low: +(0.10 + 0.15 * u[1]).toFixed(4), top: +(0.40 + 0.20 * u[2]).toFixed(4),
    start: Math.round(logRange(u[0], 100e3, 300e3) / 5e3) * 5e3,
    shape: +logRange(u[4], 0.33, 1.5).toFixed(3),
  };
  curve.end = Math.round(curve.start * logRange(u[3], 1.5, 10) / 10e3) * 10e3;
  const brackets = curveBrackets(curve);
  return { ...base, incomeTaxBrackets: brackets, incomeTaxLow: curve.low, incomeTaxHigh: curve.top,
    incomeTaxThreshold: brackets[brackets.length - 2][0], curve };
}

const giniAt = (fn, y) => computeGini(DEMO_KEYS.map(k => ({ v: Math.max(fn(k, y), 0), w: POP[k] })));

export function evaluate(design) {
  const p = { ...BASE_PARAMS, ...design };
  const { rows, milestones: m } = runFiscalSimulation(p, 35);
  const fx = { ...p, grants: realGrantSeries(p), hh: householdFiscalSeries(p) };
  let minIncomeGain = Infinity, minNwGain = Infinity, worstIncome = '', worstNw = '';
  for (const y of CHECK_YEARS) for (const k of BOTTOM_80) {
    const di = getInc(k, y, ALL, fx).total - getInc(k, y, BASE_ONLY, fx).total;
    const dn = getNW(k, y, ALL, fx).total - getNW(k, y, BASE_ONLY, fx).total;
    if (di < minIncomeGain) { minIncomeGain = di; worstIncome = `${k} Yr ${y}`; }
    if (dn < minNwGain) { minNwGain = dn; worstNw = `${k} Yr ${y}`; }
  }
  const inc = (k, y) => getInc(k, y, ALL, fx).total, nw = (k, y) => getNW(k, y, ALL, fx).total;
  const gain = (k, y) => Math.round(getInc(k, y, ALL, fx).total - getInc(k, y, BASE_ONLY, fx).total);
  const r30 = rows[29];
  return {
    fiscalGoalYear: m.fiscalGoalYear, debtFreeYear: m.debtFreeYear, netCreditorYear: m.netCreditorYear,
    intToRevY30: r30.intToRev, debtToGdpY30: r30.debtToGdp, laborLevelY10: rows[9].laborLevel,
    minIncomeGain: Math.round(minIncomeGain), worstIncome, minNwGain: Math.round(minNwGain), worstNw,
    bottom80Pass: minIncomeGain > 0 && minNwGain > 0,
    incomeGiniY30: +giniAt(inc, 30).toFixed(4), nwGiniY30: +giniAt(nw, 30).toFixed(4),
    P50Y30: gain('P50', 30), P70Y30: gain('P70', 30), P80Y30: gain('P80', 30), T10Y30: gain('T10', 30),
  };
}

export function currentLawGinis() {
  const fx = { ...BASE_PARAMS, grants: realGrantSeries(BASE_PARAMS), hh: householdFiscalSeries(BASE_PARAMS) };
  return {
    incomeGiniY30: +giniAt((k, y) => getInc(k, y, BASE_ONLY, fx).total, 30).toFixed(4),
    nwGiniY30: +giniAt((k, y) => getNW(k, y, BASE_ONLY, fx).total, 30).toFixed(4),
  };
}

// Income and net-worth gain against current law for one group in each of `years`.
export function groupGains(design, k, years) {
  const p = { ...BASE_PARAMS, ...design };
  const fx = { ...p, grants: realGrantSeries(p), hh: householdFiscalSeries(p) };
  return years.map(y => ({
    year: y,
    income: getInc(k, y, ALL, fx).total - getInc(k, y, BASE_ONLY, fx).total,
    netWorth: getNW(k, y, ALL, fx).total - getNW(k, y, BASE_ONLY, fx).total,
  }));
}

// Zero-start curve (Brayden, 2026-10-18): no standard deduction. The marginal rate is 0% up to
// zeroEnd, then rises to the top rate at `end`, following top · t^shape with t running 0 → 1 in log
// income, stepped in ZERO_CURVE_STEPS brackets. u[0], u[2], u[3] and u[4] set zeroEnd, top, end
// and shape; the top rate runs 40-62% (62% accepted 2026-10-18).
export const ZERO_CURVE_STEPS = 24;
export function zeroCurveBrackets({ zeroEnd, end, top, shape }) {
  const b = [[zeroEnd, 0]];
  for (let k = 1; k <= ZERO_CURVE_STEPS; k++)
    b.push([Math.round(zeroEnd * Math.pow(end / zeroEnd, k / ZERO_CURVE_STEPS)), +(top * Math.pow((k - 0.5) / ZERO_CURVE_STEPS, shape)).toFixed(4)]);
  return [...b, [Infinity, top]];
}
export function zeroCurveDesignFromUnit(u) {
  const base = designFromUnit(u);
  const zc = {
    zeroEnd: Math.round(logRange(u[0], 15e3, 150e3) / 1e3) * 1e3,
    top: +(0.40 + 0.22 * u[2]).toFixed(4),
    shape: +logRange(u[4], 0.5, 3).toFixed(3),
  };
  zc.end = Math.round(zc.zeroEnd * logRange(u[3], 3, 60) / 10e3) * 10e3;
  const brackets = zeroCurveBrackets(zc);
  return { ...base, incomeTaxBrackets: brackets, incomeTaxLow: 0, incomeTaxHigh: zc.top,
    incomeTaxThreshold: brackets[brackets.length - 2][0], incomeTaxExemptJoint: 0, incomeTaxExemptSingle: 0, zeroCurve: zc };
}

// Income and net-worth gains over current law for each group and year, from one household run.
export function gainsTable(design, groups, years) {
  const p = { ...BASE_PARAMS, ...design };
  const fx = { ...p, grants: realGrantSeries(p), hh: householdFiscalSeries(p) };
  return Object.fromEntries(groups.map(k => [k, years.map(y => ({
    income: getInc(k, y, ALL, fx).total - getInc(k, y, BASE_ONLY, fx).total,
    netWorth: getNW(k, y, ALL, fx).total - getNW(k, y, BASE_ONLY, fx).total,
  }))]));
}
