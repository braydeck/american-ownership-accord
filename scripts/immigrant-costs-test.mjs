// Public-service and infrastructure costs of Abundance Floor residents (Brayden, 2026-10-25):
// compares the engine with and without explicit per-resident federal costs, over 35 years.
// Run: node scripts/immigrant-costs-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const out = [];
for (const [label, d] of [['Costs off (spending grows with all Accord GDP)', { immigrantCostsOn: false, spendingElasticityAllGdp: true }], ['Costs on', {}]]) {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones } = F.runFiscalSimulation(p, 35);
  const R = y => rows[y - 1];
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  const ev = E.evaluate(d);
  out.push({ label,
    costPctGdp: Object.fromEntries([1, 5, 10, 20, 35].map(y => [y, +(((R(y).immigrantServiceSpend + R(y).immigrantCapitalSpend) / R(y).nominalGdp) * 100).toFixed(2)])),
    capitalPctGdp: Object.fromEntries([1, 10, 35].map(y => [y, +((R(y).immigrantCapitalSpend / R(y).nominalGdp) * 100).toFixed(2)])),
    debtToGdp: Object.fromEntries([10, 20, 30, 35].map(y => [y, R(y).debtToGdp])),
    fiscalGoal: milestones.fiscalGoalYear, goalRec5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    goalRec12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear, goalLow: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear,
    netCreditor: milestones.netCreditorYear,
    p80NwY10: Math.round(H.getNW('P80', 10, ALL, fx).total - H.getNW('P80', 10, H.BASE_ONLY, fx).total), bottom80Pass: ev.bottom80Pass, minIncomeGain: ev.minIncomeGain,
  });
}
writeFileSync('scripts/output/immigrant-costs-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
