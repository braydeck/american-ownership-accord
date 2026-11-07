// Healthcare Supplement: solve for the health contribution rate that keeps the Accord's fiscal
// results at or better than the pre-Supplement defaults (fiscal goal Year 9; Year 14 after a Year-5
// recession; Year 9 after Year 12; Year 10 low growth; net creditor Year 29; debt floor Year 34).
// Run: node scripts/health-contribution-solve.mjs [extra params as JSON]
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const extra = JSON.parse(process.argv[2] ?? '{}');
const TARGET = { goal: 9, rec5: 14, rec12: 9, low: 10, nc: 29, floor: 34 };
const run = d => F.runFiscalSimulation({ ...F.BASE_PARAMS, ...extra, ...d }, 35).milestones;
const results = d => {
  const m = run(d);
  return { goal: m.fiscalGoalYear, rec5: run({ ...d, recessionYear: 5 }).fiscalGoalYear, rec12: run({ ...d, recessionYear: 12 }).fiscalGoalYear,
    low: run({ ...d, growthCase: 'low' }).fiscalGoalYear, nc: m.netCreditorYear, floor: m.debtFloorYear };
};
const passes = r => Object.keys(TARGET).every(k => r[k] != null && r[k] <= TARGET[k]);
const out = { extra, baselineOff: results({ healthSupplementOn: false }), scan: [] };
let solved = null;
for (let rate = 0.06; rate <= 0.22 + 1e-9; rate += 0.0025) {
  const r = results({ healthContributionRate: +rate.toFixed(4) });
  out.scan.push({ rate: +rate.toFixed(4), ...r, pass: passes(r) });
  if (solved == null && passes(r)) solved = +rate.toFixed(4);
}
out.solvedRate = solved;
const tag = Object.keys(extra).length ? '-' + Object.entries(extra).map(([k, v]) => `${k}${v}`).join('-') : '';
writeFileSync(`scripts/output/health-contribution-solve${tag}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.baselineOff));
for (const s of out.scan) console.log(JSON.stringify(s));
console.log('solved', solved);
await server.close();
