// Ranks the robust designs and the named variants on two goals Brayden set (2026-10-16): keep the
// 80th-90th percentile (P80) as close to even with current law as possible, especially in Years
// 1-10, while maximizing gains for the bottom half (B10-P40).
// Run: node scripts/rank-p80-bottom.mjs → scripts/output/rank-p80-bottom.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const DATA = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const VARIANTS = JSON.parse(readFileSync('src/data/design-variants.json', 'utf8'));
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const BOTTOM = ['B10', 'P10', 'P20', 'P30', 'P40'];
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;

export function score(d) {
  const des = delta(paramsFromDesign(d));
  const p80 = E.groupGains(des, 'P80', YEARS);
  const bottom = BOTTOM.map(k => E.groupGains(des, k, YEARS).map(x => x.income));
  const mid = ['P50', 'P60', 'P70'].map(k => E.groupGains(des, k, YEARS).map(x => x.income));
  return {
    id: d.id, name: d.name ?? `Design ${d.id}`,
    p80AvgIncome1to10: Math.round(avg(p80.slice(0, 10).map(x => x.income))),
    p80MinIncome1to10: Math.round(Math.min(...p80.slice(0, 10).map(x => x.income))),
    p80MinIncome1to35: Math.round(Math.min(...p80.map(x => x.income))),
    p80NetWorthY10: Math.round(p80[9].netWorth), p80NetWorthY30: Math.round(p80[29].netWorth),
    bottomAvgIncome1to10: Math.round(avg(bottom.map(g => avg(g.slice(0, 10))))),
    bottomAvgIncomeY30: Math.round(avg(bottom.map(g => g[29]))),
    middleAvgIncome1to10: Math.round(avg(mid.map(g => avg(g.slice(0, 10))))),
    fiscalGoalYear: d.fiscalGoalYear, goalRecession5: d.goalRecession5, incomeGiniY30: d.incomeGiniY30, nwGiniY30: d.nwGiniY30,
  };
}

const pool = [...DATA.passing.filter(d => d.robust), ...VARIANTS.filter(v => v.robust)];
const rows = pool.map(score);
writeFileSync('scripts/output/rank-p80-bottom.json', JSON.stringify(rows, null, 1));
const neverBehind = rows.filter(r => r.p80MinIncome1to35 >= 0);
// Designs where no other design keeps P80 higher in Years 1-10 and also gives the bottom half more.
const front = rows.filter(a => !rows.some(b => b !== a && b.p80AvgIncome1to10 >= a.p80AvgIncome1to10
  && b.bottomAvgIncome1to10 >= a.bottomAvgIncome1to10
  && (b.p80AvgIncome1to10 > a.p80AvgIncome1to10 || b.bottomAvgIncome1to10 > a.bottomAvgIncome1to10)));
console.log(`robust designs ${rows.length}; P80 never behind (Yrs 1-35) ${neverBehind.length}`);
console.log('P80-vs-bottom frontier:');
for (const r of front.sort((a, b) => b.bottomAvgIncome1to10 - a.bottomAvgIncome1to10)) console.log(' ', JSON.stringify(r));
console.log('Named variants:'); for (const r of rows.filter(r => typeof r.id === 'string')) console.log(' ', JSON.stringify(r));
console.log('Top bottom-half gains with P80 never behind:');
for (const r of neverBehind.sort((a, b) => b.bottomAvgIncome1to10 - a.bottomAvgIncome1to10).slice(0, 8)) console.log(' ', JSON.stringify(r));
await server.close();
