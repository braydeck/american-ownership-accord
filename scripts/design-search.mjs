// Design search for the Accord's tax and transfer levers.
// Provenance: engine and household model in src/lib (docs/engine-spec-2026-10-07.md); lever
// ranges signed off 2026-10-16. Latin hypercube sample, seed 42.
// Run: node scripts/design-search.mjs [designs=5000] [seed=42]
// Writes scripts/output/design-search.csv and scripts/output/design-search-summary.json.
// Stress-tested designs carry goalRecession5, goalRecession12, goalLowGrowth and robust.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const N = Number(process.argv[2] ?? 5000);
const SEED = Number(process.argv[3] ?? 42);

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { makeRng } = await server.ssrLoadModule('/src/lib/prng.js');

// Latin hypercube: each dimension is split into N strata, one draw per stratum, shuffled.
const rng = makeRng(SEED);
const cols = Array.from({ length: E.UNIT_DIMS }, () => {
  const c = Array.from({ length: N }, (_, i) => (i + rng.next()) / N);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
});

const results = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const design = E.designFromUnit(cols.map(c => c[i]));
  results.push({ id: i, ...design, ...E.evaluate(design) });
  if ((i + 1) % 500 === 0) console.log(`${i + 1}/${N} designs, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// Designs where neither Gini can fall without the other rising, among those that pass.
function frontier(rows) {
  return rows.filter(a => !rows.some(b => b !== a
    && b.incomeGiniY30 <= a.incomeGiniY30 && b.nwGiniY30 <= a.nwGiniY30
    && (b.incomeGiniY30 < a.incomeGiniY30 || b.nwGiniY30 < a.nwGiniY30)));
}
// Stress test: designs that pass with a $1,000 margin on both checks are rerun with a severe
// recession in Year 5 and in Year 12 and with the low growth case. Robust designs still meet the
// fiscal goal (by Year 15, Year 22 and Year 20 respectively) and keep the bottom 80% better off.
const MARGIN = 1000;
for (const r of results) {
  if (!(r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 15
    && r.minIncomeGain >= MARGIN && r.minNwGain >= MARGIN)) continue;
  const d = E.designFromUnit(cols.map(c => c[r.id]));
  const rec5 = E.evaluate({ ...d, recessionYear: 5 }), rec12 = E.evaluate({ ...d, recessionYear: 12 });
  const low = E.evaluate({ ...d, growthCase: 'low' });
  Object.assign(r, { goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear, goalLowGrowth: low.fiscalGoalYear });
  r.robust = rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15
    && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
    && low.fiscalGoalYear != null && low.fiscalGoalYear <= 20
    && rec5.bottom80Pass && rec12.bottom80Pass && low.bottom80Pass;
}

const summary = { designs: N, seed: SEED, currentLaw: E.currentLawGinis(), currentDefault: E.evaluate({}), runs: {} };
for (const deadline of [10, 15]) {
  const pass = results.filter(r => r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= deadline);
  const front = frontier(pass).sort((a, b) => a.incomeGiniY30 - b.incomeGiniY30);
  front.forEach(r => { r[`frontier${deadline}`] = true; });
  summary.runs[deadline] = {
    fiscalPass: results.filter(r => r.fiscalGoalYear != null && r.fiscalGoalYear <= deadline).length,
    bottom80Pass: results.filter(r => r.bottom80Pass).length,
    bothPass: pass.length, frontier: front.map(r => r.id),
  };
}
const robust = results.filter(r => r.robust);
const robustFront = frontier(robust).sort((a, b) => a.incomeGiniY30 - b.incomeGiniY30);
robustFront.forEach(r => { r.frontierRobust = true; });
summary.robust = { count: robust.length, frontier: robustFront.map(r => r.id) };
const flat = r => ({ ...r, incomeTaxBrackets: r.incomeTaxBrackets.map(([t, x]) => `${t === Infinity ? 'inf' : t}:${x}`).join(' ') });
const rowsOut = results.map(flat);
const keys = Object.keys(rowsOut.reduce((a, r) => ({ ...a, ...r }), {}));
writeFileSync('scripts/output/design-search.csv', [keys.join(','), ...rowsOut.map(r => keys.map(k => r[k] ?? '').join(','))].join('\n'));
writeFileSync('scripts/output/design-search-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await server.close();
