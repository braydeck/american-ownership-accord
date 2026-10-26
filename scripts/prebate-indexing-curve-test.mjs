// Prebate indexing that rises as debt nears a floor (Brayden, 2026-10-25): three-quarters indexing
// while debt is high, rising to full indexing as debt held by the public falls from the ramp start to
// the 25% floor, and falling back if debt rises again; with the floor rule, surpluses below 25% are
// spent (use left to Congress). Compared with fixed indexing over 35 years.
// Run: node scripts/prebate-indexing-curve-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const BELOW = ['B10', 'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70'];
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const C = (from, extra = {}) => ({ prebateIndex: 0.75, prebateIndexHigh: 1, prebateIndexRampFrom: from, prebateIndexFloor: 0.25, debtFloorOn: true, ...extra });
const cases = [
  ['Three-quarters, fixed', { prebateIndex: 0.75 }],
  ['Full, fixed', { prebateIndex: 1 }],
  ['0.75 to 1 from 45%, floor 25%', C(0.45)],
  ['0.75 to 1 from 60%, floor 25%', C(0.60)],
  ['0.75 to 1 from 70%, floor 25%', C(0.70)],
  ['0.75 to 1 from 60%, no floor rule', C(0.60, { debtFloorOn: false })],
];
const out = cases.map(([label, d]) => {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones: m } = F.runFiscalSimulation(p, 75);
  const g = E.gainsTable(d, [...BELOW, 'P80'], YEARS);
  const below = BELOW.map(k => g[k].map(v => v.income));
  const lr = rows;
  return { label,
    belowP80Avg: Math.round(avg(below.map(s => avg(s.slice(0, 30))))), bottomHalfAvg: Math.round(avg(below.slice(0, 5).map(s => avg(s.slice(0, 30))))),
    p80MinIncome: Math.round(Math.min(...g.P80.map(v => v.income))), p80NwFromY10: Math.round(Math.min(...g.P80.slice(9).map(v => v.netWorth))),
    prebateReal: Object.fromEntries([10, 20, 35].map(y => [y, rows[y - 1].prebateRealPerCapita])),
    indexNow: Object.fromEntries([10, 20, 25, 30, 35].map(y => [y, rows[y - 1].prebateIndexNow])),
    debtGdp: Object.fromEntries([10, 20, 30, 35, 50].map(y => [y, rows[y - 1].debtToGdp])),
    debtY35AfterY5Recession: F.runFiscalSimulation({ ...p, recessionYear: 5 }, 35).rows[34].debtToGdp,
    goal: m.fiscalGoalYear, goalRec5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear, goalRec12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear, goalLow: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear,
    netCreditor: m.netCreditorYear, floorSpendPctGdp: Object.fromEntries([35, 50].map(y => [y, +(rows[y - 1].floorSpend / rows[y - 1].nominalGdp * 100).toFixed(2)])), deficitY35: +(rows[34].deficit / rows[34].nominalGdp * 100).toFixed(1),
    guardPass: !(lr.slice(34).some(r => r.intToRev >= 10) || lr[74].debtToGdp > lr[34].debtToGdp + 5),
  };
});
writeFileSync('scripts/output/prebate-indexing-curve-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
