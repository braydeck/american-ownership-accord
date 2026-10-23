// Direct grants plus units returned at death (Brayden, 2026-10-22). Compares returned units going
// straight to citizens with returned units going to the Treasury tranche while net interest exceeds
// 10% of revenue. Run: node scripts/death-returns-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const scenarios = [
  ['Direct grants', {}],
  ['Death returns to citizens', { deathReturnsOn: true, deathReturnsToTreasuryUntilGoal: false }],
  ['Death returns to Treasury until goal', { deathReturnsOn: true }],
  ['Death returns to Treasury until goal, 0.8% rate', { deathReturnsOn: true, deathReturnRate: 0.008 }],
  ['Death returns to Treasury until goal, 1.6% rate', { deathReturnsOn: true, deathReturnRate: 0.016 }],
];
const out = scenarios.map(([label, d]) => {
  const p = { ...F.BASE_PARAMS, ...d };
  const { milestones } = F.runFiscalSimulation(p, 75);
  const g = F.realGrantSeries(p, 120); const at = t => (g.find(([y]) => y === t) ?? [0, 0])[1];
  const acct = (birth, age) => { let b = 0; for (let a = 1; a <= age; a++) { const t = birth + a; b = b * 1.05 + (t >= 1 ? at(t) : 0); } return Math.round(b); };
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  const ev = E.evaluate(d);
  return {
    label, grant: Object.fromEntries([1, 10, 20, 30, 45, 60, 75].map(y => [y, at(y)])),
    at18: Object.fromEntries([0, 20, 40, 55].map(b => [`born${b}`, acct(b, 18)])),
    fiscalGoal: milestones.fiscalGoalYear,
    goalAfterRecession5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    goalAfterRecession12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear,
    goalLowGrowth: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear,
    netCreditor: milestones.netCreditorYear, debtFree: milestones.debtFreeYear,
    p80NwY10: Math.round(H.getNW('P80', 10, ALL, fx).total - H.getNW('P80', 10, H.BASE_ONLY, fx).total),
    bottom80Pass: ev.bottom80Pass, nwGiniY30: ev.nwGiniY30,
  };
});
writeFileSync('scripts/output/death-returns-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
