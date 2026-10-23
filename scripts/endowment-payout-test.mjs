// Citizen endowment payout-rate test (Brayden, 2026-10-22): citizen scrip and units returned at
// death go to a permanent endowment that pays a share of its 5-year average value to every
// citizen as units. Compares payout rates against the current direct grants at the site defaults.
// Advance variants: the Treasury tranche lends units to keep grants at the scrip grant early.
// Run: node scripts/endowment-payout-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const D = await server.ssrLoadModule('/src/lib/demographics.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');

const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const BOTTOM_HALF = ['B10', 'P10', 'P20', 'P30', 'P40'];
const SCENARIOS = [
  ['Direct grants (current)', {}],
  ['Endowment 3%', { citizenEndowmentOn: true, citizenPayoutRate: 0.03 }],
  ['Endowment 4%', { citizenEndowmentOn: true, citizenPayoutRate: 0.04 }],
  ['Endowment 5%', { citizenEndowmentOn: true, citizenPayoutRate: 0.05 }],
  ['Endowment 4%, no death returns', { citizenEndowmentOn: true, citizenPayoutRate: 0.04, deathReturnRate: 0 }],
  ['Endowment 3% + advance', { citizenEndowmentOn: true, citizenPayoutRate: 0.03, citizenAdvanceOn: true }],
  ['Endowment 4% + advance', { citizenEndowmentOn: true, citizenPayoutRate: 0.04, citizenAdvanceOn: true }],
  ['Endowment 5% + advance', { citizenEndowmentOn: true, citizenPayoutRate: 0.05, citizenAdvanceOn: true }],
];

const results = SCENARIOS.map(([label, d]) => {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones } = F.runFiscalSimulation(p, 75);
  const row = y => rows.find(r => r.year === y);
  const grants = F.realGrantSeries(p, 90);
  const grantAt = t => (grants.find(([y]) => y === t) ?? [0, 0])[1];
  const fx = { ...p, grants, hh: F.householdFiscalSeries(p) };
  const gain = (k, y) => H.getInc(k, y, ALL, fx).total - H.getInc(k, y, H.BASE_ONLY, fx).total;
  const nwGain = (k, y) => H.getNW(k, y, ALL, fx).total - H.getNW(k, y, H.BASE_ONLY, fx).total;
  const account = (birth, age) => { let b = 0; for (let a = 1; a <= age; a++) { const t = birth + a; b = b * 1.05 + (t >= 1 ? grantAt(t) : 0); } return Math.round(b); };
  const perPersonReal = (key, y) => Math.round(row(y)[key] * 1e12 / row(y).population / row(y).priceLevel);
  let bh = 0, n = 0; for (let y = 1; y <= 30; y++) for (const k of BOTTOM_HALF) { bh += gain(k, y); n++; }
  const ev = E.evaluate(d);
  return {
    label,
    grantReal: Object.fromEntries([1, 5, 10, 20, 30, 40, 60].map(y => [y, grantAt(y)])),
    accountAt18: { bornYear0: account(0, 18), bornYear20: account(20, 18), bornYear40: account(40, 18) },
    accountAt60: { bornYear0: account(0, 60), bornYear20: account(20, 60) },
    endowmentPerPersonReal: Object.fromEntries([10, 30, 60].map(y => [y, perPersonReal('endowmentEquity', y)])),
    personalUnitsPerPersonReal: Object.fromEntries([10, 30, 60].map(y => [y, perPersonReal('citizenEquity', y)])),
    advancePerPersonReal: Object.fromEntries([10, 20, 30, 40, 60].map(y => [y, perPersonReal('advanceBalance', y)])),
    advanceRepaidYear: rows.find(r => r.year > 5 && r.advanceBalance === 0)?.year ?? null,
    treasuryTranchePerPersonReal: Object.fromEntries([10, 30, 60].map(y => [y, perPersonReal('treasuryEquity', y)])),
    fiscalGoalYear: milestones.fiscalGoalYear, netCreditorYear: milestones.netCreditorYear, debtFreeYear: milestones.debtFreeYear,
    fiscalGoalAfterYear5Recession: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    p80NetWorthGainY10: Math.round(nwGain('P80', 10)),
    bottom80MinNwGain: ev.minNwGain, bottom80MinNwAt: ev.worstNw, bottom80Pass: ev.bottom80Pass,
    bottomHalfAvgIncomeGain1to30: Math.round(bh / n),
    nwGiniY30: ev.nwGiniY30, incomeGiniY30: ev.incomeGiniY30,
  };
});
writeFileSync('scripts/output/endowment-payout-test.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 1));
await server.close();
