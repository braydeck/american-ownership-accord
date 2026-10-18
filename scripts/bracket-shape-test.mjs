// Income tax shape test for designs 4148 and 1976 (Brayden, 2026-10-18). Holds every other lever
// at each design's values and searches three schedule shapes on equal footing:
//   two rates   — low rate to a threshold, top rate above;
//   three rates — adds a middle rate between two thresholds;
//   curve       — the marginal rate rises from the low rate at a start income to the top rate at
//                 an end income, following low + (top − low) · t^shape, where t runs 0 → 1 with
//                 log income. shape < 1 rises quickly just above the start; shape > 1 rises late.
//                 Stepped in 16 brackets, so no step exceeds a few points.
// Pass conditions and recession tests match the design search. Deterministic grid, no sampling.
// Run: node scripts/bracket-shape-test.mjs → scripts/output/bracket-shape-test.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const DATA = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const BOTTOM = ['B10', 'P10', 'P20', 'P30', 'P40'];
const CURVE_STEPS = 16;
const TOP_MAX = 0.62;
const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => +(a + i * step).toFixed(4));
const K = x => `${x / 1e3}K`;

export function curve(low, top, start, end, shape) {
  const b = [[start, low]];
  for (let k = 1; k <= CURVE_STEPS; k++)
    b.push([start * Math.pow(end / start, k / CURVE_STEPS), +(low + (top - low) * Math.pow((k - 0.5) / CURVE_STEPS, shape)).toFixed(4)]);
  return [...b, [Infinity, top]];
}

function schedules(low) {
  const out = [];
  for (const t of [150e3, 175e3, 200e3, 250e3, 300e3]) for (const top of range(0.40, TOP_MAX, 0.02))
    out.push({ shape: 'two', label: `${low} to ${K(t)}, ${top} above`, brackets: [[t, low], [Infinity, top]] });
  for (const t1 of [150e3, 200e3, 250e3, 300e3]) for (const mid of range(0.25, 0.50, 0.05))
    for (const t2 of [400e3, 500e3, 750e3, 1e6, 2e6]) for (const top of range(0.41, TOP_MAX, 0.03)) {
      if (t2 <= t1 || mid >= top) continue;
      out.push({ shape: 'three', label: `${low} to ${K(t1)}, ${mid} to ${K(t2)}, ${top} above`, brackets: [[t1, low], [t2, mid], [Infinity, top]] });
    }
  for (const s of [100e3, 150e3, 200e3, 250e3]) for (const e of [400e3, 600e3, 1e6, 2e6]) for (const shape of [0.33, 0.5, 0.75, 1, 1.5])
    for (const top of range(0.44, TOP_MAX, 0.03)) {
      if (e <= s) continue;
      out.push({ shape: 'curve', label: `${low} at ${K(s)} rising to ${top} at ${K(e)}, shape ${shape}`, brackets: curve(low, top, s, e, shape) });
    }
  return out;
}

const maxStep = b => Math.max(...b.slice(1).map(([, r], i) => r - b[i][1]));

function run(id) {
  const d = DATA.passing.find(x => x.id === id);
  const base = paramsFromDesign(d);
  const rows = [];
  for (const s of schedules(d.brackets[0][1])) {
    const b = s.brackets;
    const des = delta({ ...base, incomeTaxBrackets: b, incomeTaxLow: b[0][1], incomeTaxHigh: b[b.length - 1][1], incomeTaxThreshold: b[b.length - 2][0] });
    const r = E.evaluate(des);
    const row = { design: id, shape: s.shape, label: s.label, brackets: b.map(([t, x]) => [t === Infinity ? null : Math.round(t), x]),
      maxStep: +maxStep(b).toFixed(4), ...r };
    if (r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 10) {
      const rec5 = E.evaluate({ ...des, recessionYear: 5 }), rec12 = E.evaluate({ ...des, recessionYear: 12 }), lo = E.evaluate({ ...des, growthCase: 'low' });
      Object.assign(row, { goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear, goalLowGrowth: lo.fiscalGoalYear });
      row.robust = r.minIncomeGain >= 1000 && r.minNwGain >= 1000
        && rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15 && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
        && lo.fiscalGoalYear != null && lo.fiscalGoalYear <= 20 && rec5.bottom80Pass && rec12.bottom80Pass && lo.bottom80Pass;
      if (row.robust) {
        const p80 = E.groupGains(des, 'P80', YEARS), t10 = E.groupGains(des, 'T10', YEARS);
        const bottom = BOTTOM.map(k => E.groupGains(des, k, YEARS).map(x => x.income));
        Object.assign(row, {
          p80AvgIncome1to10: Math.round(avg(p80.slice(0, 10).map(x => x.income))),
          p80MinIncome1to35: Math.round(Math.min(...p80.map(x => x.income))),
          p80IncomeY30: Math.round(p80[29].income), t10IncomeY10: Math.round(t10[9].income),
          bottomAvgIncome1to10: Math.round(avg(bottom.map(g => avg(g.slice(0, 10))))),
        });
      }
    }
    rows.push(row);
  }
  return rows;
}

const all = [...run(4148), ...run(1976)];
writeFileSync('scripts/output/bracket-shape-test.json', JSON.stringify(all, null, 1));
const fmt = r => [r.label.padEnd(52), 'step', r.maxStep, 'goal', r.fiscalGoalYear, 'r5', r.goalRecession5, 'r12', r.goalRecession12, 'low', r.goalLowGrowth,
  '| P80 1-10', r.p80AvgIncome1to10, 'min', r.p80MinIncome1to35, '| bottom', r.bottomAvgIncome1to10, '| Gini', r.incomeGiniY30, r.nwGiniY30].join(' ');
for (const id of [4148, 1976]) for (const shape of ['two', 'three', 'curve']) {
  const g = all.filter(r => r.design === id && r.shape === shape), rob = g.filter(r => r.robust);
  console.log(`\n${id} ${shape}: ${g.length} schedules, ${rob.length} robust`);
  const goal7 = rob.filter(r => r.fiscalGoalYear <= 7 && r.p80MinIncome1to35 >= 0);
  console.log(' lowest income Gini, goal by Yr 7, P80 never behind:');
  for (const r of [...goal7].sort((a, b) => a.incomeGiniY30 - b.incomeGiniY30).slice(0, 3)) console.log('  ', fmt(r));
  console.log(' smallest largest-step, goal by Yr 7, P80 never behind:');
  for (const r of [...goal7].sort((a, b) => a.maxStep - b.maxStep || a.incomeGiniY30 - b.incomeGiniY30).slice(0, 3)) console.log('  ', fmt(r));
}
await server.close();
