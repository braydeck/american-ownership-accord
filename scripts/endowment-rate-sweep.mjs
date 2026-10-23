// Endowment payout-rate sweep with a Treasury advance (Brayden, 2026-10-22). The Treasury tranche
// lends units so grants never fall below the scrip grant; in years the endowment's payout covers the
// scrip grant, the endowment repays the advance at advanceRepayRate of its own value. A 100% payout
// with no advance is direct grants plus units returned at death.
// Run: node scripts/endowment-rate-sweep.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);

const scenarios = [['Direct grants', {}]];
for (const [rate, repay] of [[0.05, 0.01], [0.05, 0.03], [0.05, 0.05], [0.10, 0.01], [0.10, 0.03], [0.10, 0.05], [0.15, 0.03], [0.15, 0.05], [1, 0]])
  scenarios.push([rate === 1 ? '100% payout (direct + death returns)' : `${Math.round(rate * 100)}% payout, ${Math.round(repay * 100)}% repay`,
    { citizenEndowmentOn: true, citizenPayoutRate: rate, citizenAdvanceOn: rate < 1, advanceRepayRate: repay }]);

const out = scenarios.map(([label, d]) => {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones } = F.runFiscalSimulation(p, 75);
  const R = y => rows.find(r => r.year === y);
  const g = F.realGrantSeries(p, 120); const at = t => (g.find(([y]) => y === t) ?? [0, 0])[1];
  const acct = (birth, age) => { let b = 0; for (let a = 1; a <= age; a++) { const t = birth + a; b = b * 1.05 + (t >= 1 ? at(t) : 0); } return Math.round(b); };
  const pp = (key, y) => Math.round(R(y)[key] * 1e12 / R(y).population / R(y).priceLevel);
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  const ev = E.evaluate(d);
  return {
    label,
    grant: Object.fromEntries([10, 20, 30, 45, 60, 75].map(y => [y, at(y)])),
    at18: Object.fromEntries([0, 20, 40, 55].map(b => [`born${b}`, acct(b, 18)])),
    endowmentPerPerson: Object.fromEntries([30, 60, 75].map(y => [y, pp('endowmentEquity', y)])),
    advancePerPerson: Object.fromEntries([10, 30, 45, 60].map(y => [y, pp('advanceBalance', y)])),
    advanceRepaidYear: rows.find(r => r.year > 5 && r.advanceBalance === 0)?.year ?? null,
    fiscalGoal: milestones.fiscalGoalYear, goalAfterRecession5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    netCreditor: milestones.netCreditorYear,
    p80NwY10: Math.round(H.getNW('P80', 10, ALL, fx).total - H.getNW('P80', 10, H.BASE_ONLY, fx).total),
    nwGiniY30: ev.nwGiniY30,
  };
});
writeFileSync('scripts/output/endowment-rate-sweep.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
