// Design search for the Accord's tax and transfer levers.
// Provenance: engine and household model in src/lib (docs/engine-spec-2026-10-07.md); lever
// ranges signed off 2026-10-16. Latin hypercube sample, seed 42.
// Run: node scripts/design-search.mjs [designs=5000] [seed=42] [family=brackets|curve|zero]
// Writes scripts/output/{name}.csv, scripts/output/{name}-summary.json and the lab page's data,
// src/data/{name}.json, where name is design-search (brackets), curve-search (curve) or
// zero-curve-search (zero). Curve designs are numbered from 10000 and zero-start curves from 20000,
// so ids never collide; design ID0 + i shares its non-income-tax levers with bracket design i.
// Stress-tested designs carry goalRecession5, goalRecession12, goalLowGrowth and robust.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const N = Number(process.argv[2] ?? 5000);
const SEED = Number(process.argv[3] ?? 42);
const FAMILY = process.argv[4] ?? 'brackets';
const NAME = { curve: 'curve-search', zero: 'zero-curve-search' }[FAMILY] ?? 'design-search';
const ID0 = { curve: 10000, zero: 20000 }[FAMILY] ?? 0;

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const fromUnit = { curve: E.curveDesignFromUnit, zero: E.zeroCurveDesignFromUnit }[FAMILY] ?? E.designFromUnit;
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
  const { curve, zeroCurve, ...design } = fromUnit(cols.map(c => c[i]));
  results.push({ id: ID0 + i, idx: i, ...design, ...(curve ? { curve } : {}), ...(zeroCurve ? { zeroCurve } : {}), ...E.evaluate(design) });
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
  const { curve, zeroCurve, ...d } = fromUnit(cols.map(c => c[r.idx]));
  const rec5 = E.evaluate({ ...d, recessionYear: 5 }), rec12 = E.evaluate({ ...d, recessionYear: 12 });
  const low = E.evaluate({ ...d, growthCase: 'low' });
  Object.assign(r, { goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear, goalLowGrowth: low.fiscalGoalYear });
  r.robust = rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15
    && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
    && low.fiscalGoalYear != null && low.fiscalGoalYear <= 20
    && rec5.bottom80Pass && rec12.bottom80Pass && low.bottom80Pass;
}

// Group gains for every design that passes by Year 15, for the page's filters: each group's
// average income gain over Years 1-30, P80's average over Years 1-10, P80's worst income year,
// and P80's lowest net-worth gain from Year 10 on (at or above zero means it has recovered).
const GROUPS = ['B10', 'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70', 'P80'];
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const avg = a => a.reduce((x, v) => x + v, 0) / a.length;
for (const r of results) {
  if (!(r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 15)) continue;
  const { curve, zeroCurve, ...d } = fromUnit(cols.map(c => c[r.idx]));
  const g = E.gainsTable(d, GROUPS, YEARS);
  r.gains = GROUPS.map(k => Math.round(avg(g[k].slice(0, 30).map(v => v.income))));
  r.p80Avg1to10 = Math.round(avg(g.P80.slice(0, 10).map(v => v.income)));
  r.p80MinIncome = Math.round(Math.min(...g.P80.map(v => v.income)));
  r.p80NwMinFrom10 = Math.round(Math.min(...g.P80.slice(9).map(v => v.netWorth)));
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
const flat = ({ curve, zeroCurve, gains, ...r }) => ({ ...r, ...(curve ? { curveShape: `${curve.start}-${curve.end}-${curve.shape}` } : {}),
  ...(zeroCurve ? { curveShape: `0-${zeroCurve.zeroEnd}-${zeroCurve.end}-${zeroCurve.shape}` } : {}), incomeTaxBrackets: r.incomeTaxBrackets.map(([t, x]) => `${t === Infinity ? 'inf' : t}:${x}`).join(' ') });
const rowsOut = results.map(flat);
const keys = Object.keys(rowsOut.reduce((a, r) => ({ ...a, ...r }), {}));
writeFileSync(`scripts/output/${NAME}.csv`, [keys.join(','), ...rowsOut.map(r => keys.map(k => r[k] ?? '').join(','))].join('\n'));
writeFileSync(`scripts/output/${NAME}-summary.json`, JSON.stringify(summary, null, 2));

// Compact data for the Design Search lab page: every design's two Ginis and status, plus the
// full record of each design that passes with the Year-15 deadline.
const status = r => !(r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 15) ? 0
  : r.robust ? 3 : r.fiscalGoalYear <= 10 ? 2 : 1;
const pageData = {
  designs: N, seed: SEED, family: FAMILY, idStart: ID0, currentLaw: summary.currentLaw,
  currentDefault: { incomeGiniY30: summary.currentDefault.incomeGiniY30, nwGiniY30: summary.currentDefault.nwGiniY30,
    fiscalGoalYear: summary.currentDefault.fiscalGoalYear, minIncomeGain: summary.currentDefault.minIncomeGain,
    worstIncome: summary.currentDefault.worstIncome },
  counts: { pass10: summary.runs[10].bothPass, pass15: summary.runs[15].bothPass, robust: summary.robust.count,
    fiscal10: summary.runs[10].fiscalPass, fiscal15: summary.runs[15].fiscalPass, bottom80: summary.runs[10].bottom80Pass },
  points: results.map(r => [r.incomeGiniY30, r.nwGiniY30, status(r)]),
  passing: results.filter(r => status(r) > 0).map(r => ({
    id: r.id, ...(r.curve ? { curve: r.curve } : {}), ...(r.zeroCurve ? { zeroCurve: r.zeroCurve } : {}), brackets: r.incomeTaxBrackets.map(([t, x]) => [t === Infinity ? null : t, x]),
    exemptJoint: r.incomeTaxExemptJoint, vatRate: r.vatRate, lvtRate: r.lvtRate, carbonRate: r.carbonRate,
    prebate: r.prebatePerCapita, prebateIndex: r.prebateIndex, floorIndex: r.citizenFloorIndex, fttPct: r.fttPct,
    fiscalGoalYear: r.fiscalGoalYear, debtFreeYear: r.debtFreeYear, debtToGdpY30: r.debtToGdpY30, intToRevY30: r.intToRevY30,
    laborLevelY10: r.laborLevelY10, minIncomeGain: r.minIncomeGain, worstIncome: r.worstIncome, minNwGain: r.minNwGain,
    incomeGiniY30: r.incomeGiniY30, nwGiniY30: r.nwGiniY30, P50Y30: r.P50Y30, P70Y30: r.P70Y30, P80Y30: r.P80Y30, T10Y30: r.T10Y30,
    goalRecession5: r.goalRecession5 ?? null, goalRecession12: r.goalRecession12 ?? null, goalLowGrowth: r.goalLowGrowth ?? null,
    stressTested: 'goalRecession5' in r, robust: !!r.robust, frontierRobust: !!r.frontierRobust,
    gains: r.gains, p80Avg1to10: r.p80Avg1to10, p80MinIncome: r.p80MinIncome, p80NwMinFrom10: r.p80NwMinFrom10,
  })),
};
writeFileSync(`src/data/${NAME}.json`, JSON.stringify(pageData));
console.log(JSON.stringify(summary, null, 2));
await server.close();
