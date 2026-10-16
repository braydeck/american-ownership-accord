// Three-bracket test around Design 1321 with an 8% LVT (agreed 2026-10-16). Holds every other
// lever at design 1321's values and varies the income tax schedule, looking for the schedule that
// keeps P80 closest to even in Years 1-10 while meeting the same pass conditions and recession
// tests as the design search. Deterministic grid, no sampling.
// Run: node scripts/bracket-test-1321.mjs  → scripts/output/bracket-test-1321.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const DATA = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));

const d1321 = DATA.passing.find(d => d.id === 1321);
const base = { ...paramsFromDesign(d1321), lvtRate: 0.08 };
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));

const schedules = [{ label: '1321 two-rate', brackets: base.incomeTaxBrackets }];
for (const low of [0.10, 0.125, 0.15]) for (const t1 of [200e3, 300e3, 400e3])
  for (const mid of [0.25, 0.30, 0.35, 0.40, 0.45]) for (const t2 of [600e3, 800e3, 1e6, 2e6])
    for (const top of [0.55, 0.575, 0.594, 0.60]) {
      if (t2 <= t1) continue;
      schedules.push({ label: `${low}/${t1}/${mid}/${t2}/${top}`, brackets: [[t1, low], [t2, mid], [Infinity, top]] });
    }

const YEARS_EARLY = Array.from({ length: 10 }, (_, i) => i + 1);
const out = [];
for (const s of schedules) {
  const b = s.brackets;
  const design = delta({ ...base, incomeTaxBrackets: b, incomeTaxLow: b[0][1], incomeTaxHigh: b[b.length - 1][1],
    incomeTaxThreshold: b[b.length - 2][0] });
  const r = E.evaluate(design);
  const row = { label: s.label, brackets: b.map(([t, x]) => [t === Infinity ? null : t, x]), ...r };
  if (r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 10) {
    const p80 = E.groupGains(design, 'P80', [...YEARS_EARLY, 15, 20, 25, 30]);
    const t10 = E.groupGains(design, 'T10', [1, 5, 10]);
    row.p80MinIncome1to10 = Math.round(Math.min(...p80.slice(0, 10).map(x => x.income)));
    row.p80MinNw1to10 = Math.round(Math.min(...p80.slice(0, 10).map(x => x.netWorth)));
    row.p80Income = Object.fromEntries(p80.map(x => [x.year, Math.round(x.income)]));
    row.p80NetWorth = Object.fromEntries(p80.map(x => [x.year, Math.round(x.netWorth)]));
    row.t10Income = Object.fromEntries(t10.map(x => [x.year, Math.round(x.income)]));
    const rec5 = E.evaluate({ ...design, recessionYear: 5 }), rec12 = E.evaluate({ ...design, recessionYear: 12 });
    const low = E.evaluate({ ...design, growthCase: 'low' });
    Object.assign(row, { goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear, goalLowGrowth: low.fiscalGoalYear });
    row.robust = r.minIncomeGain >= 1000 && r.minNwGain >= 1000
      && rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15
      && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
      && low.fiscalGoalYear != null && low.fiscalGoalYear <= 20
      && rec5.bottom80Pass && rec12.bottom80Pass && low.bottom80Pass;
  }
  out.push(row);
}
writeFileSync('scripts/output/bracket-test-1321.json', JSON.stringify(out, null, 1));
const robust = out.filter(r => r.robust).sort((a, b) => b.p80MinIncome1to10 - a.p80MinIncome1to10);
console.log(`schedules ${out.length}, pass (goal by Yr 10) ${out.filter(r => r.p80MinIncome1to10 != null).length}, robust ${robust.length}`);
for (const r of [out[0], ...robust.slice(0, 12)]) console.log(r.label.padEnd(28), 'goal', r.fiscalGoalYear, 'rec5', r.goalRecession5, 'rec12', r.goalRecession12, 'low', r.goalLowGrowth,
  '| P80 min inc 1-10', r.p80MinIncome1to10, 'Y1', r.p80Income?.[1], 'Y10', r.p80Income?.[10], 'Y20', r.p80Income?.[20], 'Y30', r.p80Income?.[30], '| P80 NW Y10', r.p80NetWorth?.[10], '| T10 Y5', r.t10Income?.[5], '| P70 Y30', r.P70Y30, '| Gini', r.incomeGiniY30, r.nwGiniY30, 'robust', r.robust);
await server.close();
