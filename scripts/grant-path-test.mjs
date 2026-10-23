// Grant path test (Brayden, 2026-10-22): grants per person should never fall and later generations
// should be better off. Grants follow a steady real path; a citizen reserve inside the fund takes every
// surplus of scrip and returned units above the path and fills every shortfall below it.
// Run: node scripts/grant-path-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const DISP = { incumbentPools: 10, incumbentGrowthSpread: 0.04 };
const scenarios = [['Dispersion, direct grants', DISP]];
for (const [start, g, yrs] of [[1248, 0.0125, 5], [1248, 0.01, 5], [1150, 0.0125, 5], [1150, 0.015, 5], [1100, 0.015, 5], [1200, 0.01, 5]])
  scenarios.push([`Dispersion, path $${start} +${g * 100}%/yr, cap ${yrs}`, { ...DISP, grantPathOn: true, grantPathStart: start, grantPathGrowth: g, grantPathRecessionBridge: true, grantPathReserveYears: yrs }]);
const CASES = [['base', {}], ['recession Y5', { recessionYear: 5 }], ['recession Y12', { recessionYear: 12 }], ['low growth', { growthCase: 'low' }], ['no dispersion', { incumbentPools: 1, incumbentGrowthSpread: 0 }]];
const out = scenarios.map(([label, d]) => {
  const res = { label };
  for (const [ck, c] of CASES) {
    const p = { ...F.BASE_PARAMS, ...d, ...c };
    const g = F.realGrantSeries(p, 75).slice(1).map(x => x[1]);
    const drops = []; for (let i = 1; i < g.length; i++) if (g[i] < g[i - 1] * 0.99) drops.push(i + 1);
    const { rows } = F.runFiscalSimulation(p, 75);
    res[ck] = { dropYears: drops.map(y => `Y${y} ${g[y - 2]}->${g[y - 1]}`), grant: { 1: g[0], 10: g[9], 30: g[29], 60: g[59], 75: g[74] },
      reservePerPerson: Object.fromEntries([10, 30, 50, 75].map(y => { const r = rows[y - 1]; return [y, Math.round(r.scripReserve * 1e12 / r.population / r.priceLevel)]; })) };
  }
  const p = { ...F.BASE_PARAMS, ...d };
  const { milestones } = F.runFiscalSimulation(p, 75);
  const g = F.realGrantSeries(p, 120); const at = t => (g.find(([y]) => y === t) ?? [0, 0])[1];
  const acct = b => { let x = 0; for (let a = 1; a <= 18; a++) { const t = b + a; x = x * 1.05 + (t >= 1 ? at(t) : 0); } return Math.round(x); };
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  Object.assign(res, {
    at18: Object.fromEntries([0, 10, 20, 30, 40, 55].map(b => [`born${b}`, acct(b)])),
    fiscalGoal: milestones.fiscalGoalYear, goalRec5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    goalRec12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear, goalLow: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear,
    netCreditor: milestones.netCreditorYear, debtFree: milestones.debtFreeYear,
    p80NwY10: Math.round(H.getNW('P80', 10, ALL, fx).total - H.getNW('P80', 10, H.BASE_ONLY, fx).total), nwGiniY30: E.evaluate(d).nwGiniY30,
  });
  return res;
});
writeFileSync('scripts/output/grant-path-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
