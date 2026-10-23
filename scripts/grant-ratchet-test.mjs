// Grant smoothing test (Brayden, 2026-10-22): later generations should be better off. The real grant
// per person should not drop when established companies reach the 21% cap. Tests a citizen reserve:
// part of citizen scrip is held back and released at a steady rate. (A Treasury-funded ratchet failed
// the recession tests: goal Year 35-41 after a Year-12 recession.) Run: node scripts/grant-ratchet-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const scenarios = [['Current default', {}]];
const STAB = share => ({ scripReserveShare: share, scripReserveStabilize: true });
for (const [share, drain] of [[0.1, 0], [0.1, 0.03], [0.1, 0.05], [0.15, 0.03], [0.15, 0.05]])
  scenarios.push([`Stabilizing reserve ${share * 100}%, drain ${drain * 100}%`, { ...STAB(share), scripReserveDrain: drain }]);
for (const [share, drain] of [[0.2, 0.03], [0.3, 0.03]])
  scenarios.push([`10 groups ±4%, stabilizing reserve ${share * 100}%, drain ${drain * 100}%`, { incumbentPools: 10, incumbentGrowthSpread: 0.04, ...STAB(share), scripReserveDrain: drain }]);
const out = scenarios.map(([label, d]) => {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones } = F.runFiscalSimulation(p, 75);
  const R = y => rows.find(r => r.year === y);
  const g = F.realGrantSeries(p, 75); const at = t => (g.find(([y]) => y === t) ?? [0, 0])[1];
  const acct = birth => { let b = 0; for (let a = 1; a <= 18; a++) { const t = birth + a; b = b * 1.05 + (t >= 1 ? at(t) : 0); } return Math.round(b); };
  const at18 = Array.from({ length: 56 }, (_, b) => acct(b));
  const firstFall = (arr, off) => { for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return i + off; return null; };
  const grants = Array.from({ length: 75 }, (_, i) => at(i + 1));
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  const ev = E.evaluate(d);
  return {
    label, grants1to40: grants.slice(0, 40), grant: Object.fromEntries([1, 10, 20, 25, 30, 35, 45, 60, 75].map(y => [y, at(y)])),
    firstYearGrantFalls: firstFall(grants, 1),
    at18: Object.fromEntries([0, 10, 15, 20, 30, 40, 55].map(b => [`born${b}`, at18[b]])),
    firstCohortWorseThanPrevious: firstFall(at18, 0),
    treasuryTranchePerPerson: Object.fromEntries([20, 30, 40, 60].map(y => [y, Math.round(R(y).treasuryEquity * 1e12 / R(y).population / R(y).priceLevel)])),
    fiscalGoal: milestones.fiscalGoalYear, goalRec5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    goalRec12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear, goalLow: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear,
    netCreditor: milestones.netCreditorYear, debtFree: milestones.debtFreeYear,
    p80NwY10: Math.round(H.getNW('P80', 10, ALL, fx).total - H.getNW('P80', 10, H.BASE_ONLY, fx).total), nwGiniY30: ev.nwGiniY30,
  };
});
writeFileSync('scripts/output/grant-ratchet-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
