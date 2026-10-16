// Local refinement around Design 1321 under wage indexing (2026-10-16): the low rate, deduction,
// VAT, prebate, LVT and carbon vary; the 59.4% rate above $400K and the other levers are 1321's.
// Keeps robust designs where P80 is never behind current law (Years 1-35) and ranks them by the
// bottom half's (B10-P40) average income gain in Years 1-10.
// Run: node scripts/refine-1321.mjs → scripts/output/refine-1321.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const DATA = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const d1321 = DATA.passing.find(d => d.id === 1321);
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const BOTTOM = ['B10', 'P10', 'P20', 'P30', 'P40'];
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));

const out = [];
for (const low of [0.10, 0.115, 0.125, 0.14]) for (const ded of [38e3, 50e3, 60e3, 70e3])
  for (const vat of [0.12, 0.133, 0.14, 0.15]) for (const pre of [7150, 7800, 8500, 9200])
    for (const lvt of [0.055, 0.08, 0.10]) for (const co2 of [110, 137]) {
      const rec = { ...d1321, brackets: [[400e3, low], [null, d1321.brackets[1][1]]], exemptJoint: ded, vatRate: vat, prebate: pre, lvtRate: lvt, carbonRate: co2 };
      const design = delta(paramsFromDesign(rec));
      const r = E.evaluate(design);
      if (!(r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 10 && r.minIncomeGain >= 1000 && r.minNwGain >= 1000)) continue;
      const p80 = E.groupGains(design, 'P80', YEARS);
      const p80Min = Math.min(...p80.map(x => x.income));
      if (p80Min < 0) continue;
      const rec5 = E.evaluate({ ...design, recessionYear: 5 }), rec12 = E.evaluate({ ...design, recessionYear: 12 }), lowG = E.evaluate({ ...design, growthCase: 'low' });
      if (!(rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15 && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
        && lowG.fiscalGoalYear != null && lowG.fiscalGoalYear <= 20 && rec5.bottom80Pass && rec12.bottom80Pass && lowG.bottom80Pass)) continue;
      const bottom = BOTTOM.map(k => E.groupGains(design, k, YEARS).map(x => x.income));
      out.push({ low, ded, vat, pre, lvt, co2, fiscalGoalYear: r.fiscalGoalYear, goalRecession5: rec5.fiscalGoalYear,
        p80AvgIncome1to10: Math.round(avg(p80.slice(0, 10).map(x => x.income))), p80MinIncome1to35: Math.round(p80Min),
        p80NetWorthY10: Math.round(p80[9].netWorth), p80NetWorthY30: Math.round(p80[29].netWorth),
        bottomAvgIncome1to10: Math.round(avg(bottom.map(g => avg(g.slice(0, 10))))), bottomAvgIncomeY30: Math.round(avg(bottom.map(g => g[29]))),
        b10Y1: Math.round(bottom[0][0]), incomeGiniY30: r.incomeGiniY30, nwGiniY30: r.nwGiniY30, P50Y30: r.P50Y30, P70Y30: r.P70Y30, T10Y30: r.T10Y30 });
    }
out.sort((a, b) => b.bottomAvgIncome1to10 - a.bottomAvgIncome1to10);
writeFileSync('scripts/output/refine-1321.json', JSON.stringify(out, null, 1));
console.log('robust with P80 never behind:', out.length);
for (const r of out.slice(0, 10)) console.log(JSON.stringify(r));
// Frontier: P80 average gain vs bottom-half gain
const front = out.filter(a => !out.some(b => b !== a && b.p80AvgIncome1to10 >= a.p80AvgIncome1to10 && b.bottomAvgIncome1to10 >= a.bottomAvgIncome1to10
  && (b.p80AvgIncome1to10 > a.p80AvgIncome1to10 || b.bottomAvgIncome1to10 > a.bottomAvgIncome1to10)));
console.log('frontier:'); for (const r of front.sort((a, b) => b.bottomAvgIncome1to10 - a.bottomAvgIncome1to10)) console.log(JSON.stringify(r));
await server.close();
