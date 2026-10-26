// Holistic comparison of the current defaults and the 35-year optimized 12053 design, plus hybrids
// that separate the tax schedule from the prebate indexing (Brayden, 2026-10-25).
// Run: node scripts/compare-35yr-options.mjs
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const V = JSON.parse(readFileSync('src/data/design-variants.json', 'utf8'));
const list = Array.isArray(V) ? V : V.variants;
const base = list.find(x => x.id === '21877-r'), opt = list.find(x => x.id === '12053-35');
const BELOW = ['B10', 'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70'];
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const cases = [
  ['Current settings', paramsFromDesign(base)],
  ['12053 on 35 years', paramsFromDesign(opt)],
  ['12053 schedule, prebate indexed at 0.5', { ...paramsFromDesign(opt), prebateIndex: 0.5 }],
  ['12053 schedule, prebate indexed at 0.75', { ...paramsFromDesign(opt), prebateIndex: 0.75 }],
  ['Current settings, prebate indexed at 0.75', { ...paramsFromDesign(base), prebateIndex: 0.75 }],
  ['Current settings, prebate indexed at 1', { ...paramsFromDesign(base), prebateIndex: 1 }],
];
const out = cases.map(([label, d]) => {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones: m } = F.runFiscalSimulation(p, 75);
  const g = E.gainsTable(d, [...BELOW, 'P80', 'T10'], YEARS);
  const below = BELOW.map(k => g[k].map(v => v.income));
  const ev = E.evaluate(d);
  const r5 = E.evaluate({ ...d, recessionYear: 5 }), r12 = E.evaluate({ ...d, recessionYear: 12 }), lo = E.evaluate({ ...d, growthCase: 'low' });
  return {
    label,
    belowP80Avg: Math.round(avg(below.map(s => avg(s.slice(0, 30))))),
    bottomHalfAvg: Math.round(avg(below.slice(0, 5).map(s => avg(s.slice(0, 30))))),
    b10Avg: Math.round(avg(below[0].slice(0, 30))),
    p80MinIncome: Math.round(Math.min(...g.P80.map(v => v.income))),
    p80NwFromY10: Math.round(Math.min(...g.P80.slice(9).map(v => v.netWorth))),
    t10Y30: Math.round(g.T10[29].income),
    goal: m.fiscalGoalYear, goalRec5: r5.fiscalGoalYear, goalRec12: r12.fiscalGoalYear, goalLow: lo.fiscalGoalYear,
    debtGdp: Object.fromEntries([10, 20, 35].map(y => [y, rows[y - 1].debtToGdp])),
    debtGdpY35Rec5: F.runFiscalSimulation({ ...p, recessionYear: 5 }, 35).rows[34].debtToGdp,
    netCreditor: m.netCreditorYear,
    prebatePctGdpY35: +(rows[34].prebateSpend / rows[34].nominalGdp * 100).toFixed(1),
    incomeGiniY30: ev.incomeGiniY30, nwGiniY30: ev.nwGiniY30,
  };
});
writeFileSync('scripts/output/compare-35yr-options.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
