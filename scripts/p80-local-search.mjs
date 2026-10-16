// Local search around Design 1321 (8% LVT) for the levers that move P80 in Years 1-10: the low
// rate, the standard deduction, VAT, prebate and carbon. Two income tax schedules: 1321's two
// rates and the three-rate variant with 40% from $400K to $800K. Same pass conditions and
// recession tests as the design search; ranked by P80's average income gain in Years 1-10.
// Deterministic grid. Run: node scripts/p80-local-search.mjs → scripts/output/p80-local-search.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const DATA = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const base = { ...paramsFromDesign(DATA.passing.find(d => d.id === 1321)), lvtRate: 0.08 };
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const TOP = base.incomeTaxBrackets[base.incomeTaxBrackets.length - 1][1];

const out = [];
for (const shape of ['two-rate', 'three-rate']) for (const low of [0.10, 0.115, 0.125])
  for (const ded of [60e3, 70e3, 80e3]) for (const vat of [0.11, 0.12, 0.133, 0.14])
    for (const pre of [6500, 7150, 7800, 8500]) for (const co2 of [80, 110, 137]) {
      const b = shape === 'two-rate' ? [[400e3, low], [Infinity, TOP]] : [[400e3, low], [800e3, 0.40], [Infinity, TOP]];
      const design = delta({ ...base, incomeTaxBrackets: b, incomeTaxLow: low, incomeTaxHigh: TOP,
        incomeTaxThreshold: b[b.length - 2][0], incomeTaxExemptJoint: ded, incomeTaxExemptSingle: ded / 2,
        vatRate: vat, prebatePerCapita: pre, carbonRate: co2 });
      const r = E.evaluate(design);
      if (!(r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 10 && r.minIncomeGain >= 1000 && r.minNwGain >= 1000)) continue;
      const rec5 = E.evaluate({ ...design, recessionYear: 5 }), rec12 = E.evaluate({ ...design, recessionYear: 12 });
      const lowG = E.evaluate({ ...design, growthCase: 'low' });
      const robust = rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15 && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
        && lowG.fiscalGoalYear != null && lowG.fiscalGoalYear <= 20 && rec5.bottom80Pass && rec12.bottom80Pass && lowG.bottom80Pass;
      if (!robust) continue;
      const p80 = E.groupGains(design, 'P80', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30]);
      const inc = Object.fromEntries(p80.map(x => [x.year, Math.round(x.income)]));
      const nw = Object.fromEntries(p80.map(x => [x.year, Math.round(x.netWorth)]));
      out.push({ shape, low, ded, vat, pre, co2, ...r, goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear,
        goalLowGrowth: lowG.fiscalGoalYear, p80Income: inc, p80NetWorth: nw,
        p80AvgIncome1to10: Math.round(p80.slice(0, 10).reduce((s, x) => s + x.income, 0) / 10),
        p80AvgNw1to10: Math.round(p80.slice(0, 10).reduce((s, x) => s + x.netWorth, 0) / 10) });
    }
out.sort((a, b) => b.p80AvgIncome1to10 - a.p80AvgIncome1to10);
writeFileSync('scripts/output/p80-local-search.json', JSON.stringify(out, null, 1));
console.log('robust designs', out.length);
for (const r of out.slice(0, 15)) console.log(r.shape, `low ${r.low} ded ${r.ded} vat ${r.vat} pre ${r.pre} co2 ${r.co2}`, '| P80 avg inc 1-10', r.p80AvgIncome1to10, 'Y1', r.p80Income[1], 'Y10', r.p80Income[10], 'Y20', r.p80Income[20], 'Y30', r.p80Income[30], '| NW avg 1-10', r.p80AvgNw1to10, 'NW Y10', r.p80NetWorth[10], '| goal', r.fiscalGoalYear, 'rec5', r.goalRecession5, '| Gini', r.incomeGiniY30, r.nwGiniY30, '| P70 Y30', r.P70Y30, 'T10 Y30', r.T10Y30);
await server.close();
