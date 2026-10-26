// Zoning reform grants and the immigrant entrepreneurship premium (Brayden, 2026-10-25).
// Run: node scripts/zoning-entrepreneurship-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const scenarios = [
  ['Neither (private share 0.65, no grants, no premium)', { zoningReformOn: false, privateShareOfNewDemand: 0.65, immigrantPremiumOff: true }],
  ['Zoning reform only', { immigrantPremiumOff: true }],
  ['Entrepreneurship premium only', { zoningReformOn: false, privateShareOfNewDemand: 0.65 }],
  ['Both (new default)', {}],
  ['Both, grant $20,000 a unit', { zoningGrantPerUnit: 20000 }],
];
const out = scenarios.map(([label, d]) => {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones } = F.runFiscalSimulation(p, 75);
  const R = y => rows[y - 1];
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  const peak = rows.reduce((a, r) => r.rentVsCurrentLawPct > a.rentVsCurrentLawPct ? r : a, rows[0]);
  return {
    label,
    gdpVsCL: Object.fromEntries([10, 30].map(y => [y, +((R(y).accordLevel - 1) * 100).toFixed(1)])),
    nhcUnitsM: Object.fromEntries([5, 10, 30].map(y => [y, +(R(y).nhcUnitsK / 1e3).toFixed(2)])),
    privateExtraM: Object.fromEntries([10, 30].map(y => [y, +(R(y).privateExtraUnitsK / 1e3).toFixed(2)])),
    peakRent: peak.rentVsCurrentLawPct, peakRentYear: peak.year, rentY30: R(30).rentVsCurrentLawPct,
    zoningSpendPctGdp: Object.fromEntries([5, 10, 30].map(y => [y, +(R(y).zoningSpend / R(y).nominalGdp * 100).toFixed(3)])),
    fiscalGoal: milestones.fiscalGoalYear, goalRec5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    goalRec12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear, goalLow: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear,
    netCreditor: milestones.netCreditorYear, debtFree: milestones.debtFreeYear,
    p80NwY10: Math.round(H.getNW('P80', 10, ALL, fx).total - H.getNW('P80', 10, H.BASE_ONLY, fx).total),
  };
});
writeFileSync('scripts/output/zoning-entrepreneurship-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
