// Does a small income tax on the lowest incomes, returned through a larger prebate, do better
// for the groups below P80? (Brayden, 2026-10-18.) Starts from the optimized 21877 and 13610 designs,
// replaces their 0% band (21877's zero band; 13610's standard deduction, which becomes a band of
// the joint deduction's width) with a base rate, and raises the prebate. Scored like
// scripts/optimize-below-p80.mjs: robust, P80 income never behind, P80 net worth even from Year 10.
// Run: node scripts/prebate-vs-base-rate.mjs → scripts/output/prebate-vs-base-rate.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const V = JSON.parse(readFileSync('src/data/design-variants.json', 'utf8'));
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const BELOW = ['B10', 'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70'];
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;

function score(des) {
  const r = E.evaluate(des);
  const row = { fiscalGoalYear: r.fiscalGoalYear, bottom80Pass: r.bottom80Pass, minIncomeGain: r.minIncomeGain, worstIncome: r.worstIncome,
    incomeGiniY30: r.incomeGiniY30, nwGiniY30: r.nwGiniY30, laborLevelY10: r.laborLevelY10 };
  const g = E.gainsTable(des, [...BELOW, 'P80'], YEARS);
  Object.assign(row, {
    belowP80: Math.round(avg(BELOW.map(k => avg(g[k].slice(0, 30).map(v => v.income))))),
    bottomHalf: Math.round(avg(BELOW.slice(0, 5).map(k => avg(g[k].slice(0, 30).map(v => v.income))))),
    byGroup: Object.fromEntries(BELOW.map(k => [k, Math.round(avg(g[k].slice(0, 30).map(v => v.income)))])),
    p80MinIncome: Math.round(Math.min(...g.P80.map(v => v.income))),
    p80NwMinFrom10: Math.round(Math.min(...g.P80.slice(9).map(v => v.netWorth))),
  });
  row.meetsGoal = r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 10 && r.minIncomeGain >= 1000 && r.minNwGain >= 1000
    && row.p80MinIncome >= 0 && row.p80NwMinFrom10 >= 0;
  if (row.meetsGoal) {
    const rec5 = E.evaluate({ ...des, recessionYear: 5 }), rec12 = E.evaluate({ ...des, recessionYear: 12 }), lo = E.evaluate({ ...des, growthCase: 'low' });
    row.goalRecession5 = rec5.fiscalGoalYear;
    row.robust = rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15 && rec5.bottom80Pass && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
      && rec12.bottom80Pass && lo.fiscalGoalYear != null && lo.fiscalGoalYear <= 20 && lo.bottom80Pass;
  }
  return row;
}

const out = [];
for (const id of ['21877-opt', '13610-opt']) {
  const v = V.find(x => x.id === id);
  const p = paramsFromDesign(v);
  const b = p.incomeTaxBrackets, ded = p.incomeTaxExemptJoint;
  for (const base of [0, 0.02, 0.04, 0.06, 0.09]) for (const extra of [0, 500, 1000, 1500, 2000, 2500, 3000, 4000]) {
    let brackets = b;
    // No rate above the base band falls below the base rate.
    if (base > 0) brackets = (ded > 0 ? [[ded, base], ...b] : [[b[0][0], base], ...b.slice(1)]).map(([t, r]) => [t, Math.max(r, base)]);
    const des = delta({ ...p, incomeTaxBrackets: brackets, incomeTaxLow: brackets[0][1], incomeTaxExemptJoint: base > 0 ? 0 : ded,
      incomeTaxExemptSingle: base > 0 ? 0 : ded / 2, prebatePerCapita: p.prebatePerCapita + extra });
    const row = { design: id, baseRate: base, prebate: p.prebatePerCapita + extra, ...score(des) };
    out.push(row);
    console.log(id, 'base', base, 'prebate', row.prebate, '| goal', row.fiscalGoalYear, 'rec5', row.goalRecession5 ?? '-', row.robust ? 'ROBUST' : row.meetsGoal ? 'not robust' : `fails (${row.worstIncome} ${row.minIncomeGain}, P80 min ${row.p80MinIncome}, NW10 ${row.p80NwMinFrom10})`,
      '| below P80', row.belowP80, 'bottom half', row.bottomHalf, 'B10', row.byGroup.B10, 'P70', row.byGroup.P70, '| Gini', row.incomeGiniY30, row.nwGiniY30, '| labor', row.laborLevelY10);
  }
}
writeFileSync('scripts/output/prebate-vs-base-rate.json', JSON.stringify(out, null, 1));
await server.close();
