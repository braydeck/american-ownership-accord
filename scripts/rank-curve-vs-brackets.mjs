// Ranks the robust bracket designs (src/data/design-search.json) and robust curve designs
// (src/data/curve-search.json) on Brayden's goals (2026-10-16): P80 as close to even as possible in
// Years 1-10 and never behind, and the largest bottom-half (B10-P40) gains. The two searches share
// seed 42, so curve design 10000 + i has the same non-income-tax levers as bracket design i.
// Run: node scripts/rank-curve-vs-brackets.mjs → scripts/output/rank-curve-vs-brackets.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const B = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const C = JSON.parse(readFileSync('src/data/curve-search.json', 'utf8'));
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const BOTTOM = ['B10', 'P10', 'P20', 'P30', 'P40'];
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const maxStep = b => Math.max(...b.slice(1).map(([, r], i) => r - b[i][1]));

function score(d, family) {
  const des = delta(paramsFromDesign(d));
  const p80 = E.groupGains(des, 'P80', YEARS);
  const bottom = BOTTOM.map(k => E.groupGains(des, k, YEARS).map(x => x.income));
  return {
    id: d.id, family, curve: d.curve, brackets: d.brackets.length > 4 ? undefined : d.brackets, maxStep: +maxStep(d.brackets).toFixed(3),
    exemptJoint: d.exemptJoint, vatRate: d.vatRate, lvtRate: d.lvtRate, carbonRate: d.carbonRate, prebate: d.prebate, prebateIndex: d.prebateIndex, fttPct: d.fttPct,
    fiscalGoalYear: d.fiscalGoalYear, goalRecession5: d.goalRecession5, goalRecession12: d.goalRecession12, goalLowGrowth: d.goalLowGrowth,
    incomeGiniY30: d.incomeGiniY30, nwGiniY30: d.nwGiniY30,
    p80AvgIncome1to10: Math.round(avg(p80.slice(0, 10).map(x => x.income))),
    p80MinIncome1to10: Math.round(Math.min(...p80.slice(0, 10).map(x => x.income))),
    p80MinIncome1to35: Math.round(Math.min(...p80.map(x => x.income))),
    bottomAvgIncome1to10: Math.round(avg(bottom.map(g => avg(g.slice(0, 10))))),
  };
}
const rows = [...B.passing.filter(d => d.robust).map(d => score(d, 'brackets')), ...C.passing.filter(d => d.robust).map(d => score(d, 'curve'))];
writeFileSync('scripts/output/rank-curve-vs-brackets.json', JSON.stringify(rows, null, 1));
const front = rs => rs.filter(a => !rs.some(b => b !== a && b.p80AvgIncome1to10 >= a.p80AvgIncome1to10 && b.bottomAvgIncome1to10 >= a.bottomAvgIncome1to10
  && (b.p80AvgIncome1to10 > a.p80AvgIncome1to10 || b.bottomAvgIncome1to10 > a.bottomAvgIncome1to10)));
const line = r => [String(r.id).padEnd(6), r.family.padEnd(8), r.curve ? `${r.curve.low} @${r.curve.start / 1e3}K -> ${r.curve.top} @${r.curve.end / 1e3}K s${r.curve.shape}` : JSON.stringify(r.brackets),
  'step', r.maxStep, 'ded', r.exemptJoint, 'VAT', r.vatRate, 'LVT', r.lvtRate, 'C', r.carbonRate, 'pre', r.prebate, 'idx', r.prebateIndex,
  '| goal', r.fiscalGoalYear, r.goalRecession5, r.goalRecession12, r.goalLowGrowth, '| P80 avg', r.p80AvgIncome1to10, 'min10', r.p80MinIncome1to10, 'min35', r.p80MinIncome1to35,
  '| bottom', r.bottomAvgIncome1to10, '| Gini', r.incomeGiniY30, r.nwGiniY30].join(' ');
for (const fam of ['brackets', 'curve']) {
  const rs = rows.filter(r => r.family === fam), nb = rs.filter(r => r.p80MinIncome1to35 >= 0);
  console.log(`\n${fam}: robust ${rs.length}, P80 never behind ${nb.length}`);
  console.log(' P80-vs-bottom frontier among P80-never-behind:');
  for (const r of front(nb).sort((a, b) => b.bottomAvgIncome1to10 - a.bottomAvgIncome1to10)) console.log('  ', line(r));
  console.log(' lowest income Gini among P80-never-behind:');
  for (const r of [...nb].sort((a, b) => a.incomeGiniY30 - b.incomeGiniY30).slice(0, 4)) console.log('  ', line(r));
}
await server.close();
