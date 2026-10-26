// Named variants of searched designs, evaluated like the search's passing designs and written to
// src/data/design-variants.json for the Design Search page. Variants come from
// scripts/bracket-test-1321.mjs, scripts/p80-local-search.mjs and scripts/refine-1321.mjs (2026-10-16) and
// scripts/bracket-shape-test.mjs (2026-10-18).
// Run: node scripts/design-variants.mjs
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const DATA = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const CURVE = JSON.parse(readFileSync('src/data/curve-search.json', 'utf8'));
const ZERO = JSON.parse(readFileSync('src/data/zero-curve-search.json', 'utf8'));
// Hill climbing is path-dependent, so for each start design keep the better of this run and the
// previous one (scripts/output/optimize-below-p80-recover10-previous.json); income gains below P80
// did not change between them, and every variant is re-scored below.
const OPT_RUNS = [...[0, 1, 2, 3, 4, 5].map(i => `scripts/output/optimize-below-p80-recover10-${i}.json`), 'scripts/output/optimize-below-p80-recover10-previous.json']
  .flatMap(f => JSON.parse(readFileSync(f, 'utf8'))).filter(r => r.p80NeverBehind);
const bestByStart = runs => Object.values(runs.reduce((best, r) => ((!best[r.from] || r.objective > best[r.from].objective) && (best[r.from] = r), best), {}));
const OPT = bestByStart(OPT_RUNS);
// Curves only, LVT held at 10% or above (Brayden, 2026-10-18).
const OPT_LVT10 = bestByStart([0, 1, 2, 3, 4, 5].flatMap(i => JSON.parse(readFileSync(`scripts/output/optimize-below-p80-recover10-curve-zero-lvt10-${i}.json`, 'utf8'))).filter(r => r.p80NeverBehind));
// Curves with LVT at 10% or above, the rise spread over at least a 2.5× income range, after the
// pass-through and small-business changes (2026-10-19); seeded with the then-default 21877 design.
const OPT_RISE = bestByStart([0, 1, 2, 3, 4, 5].flatMap(i => JSON.parse(readFileSync(`scripts/output/optimize-below-p80-recover10-curve-zero-lvt10-rise2.5-${i}.json`, 'utf8'))).filter(r => r.p80NeverBehind));
// Re-optimized 2026-10-25 under the permanent 1.2% Abundance Floor, the housing module, the grant
// path and company dispersion (Year 16 after a Year-5 recession allowed); seeded with the then-default design.
const OPT_HOUSING = bestByStart([0, 1, 2, 3, 4, 5].flatMap(i => JSON.parse(readFileSync(`scripts/output/optimize-below-p80-housing-${i}.json`, 'utf8'))).filter(r => r.p80NeverBehind));
// Re-optimized 2026-10-25 with explicit per-resident costs, scored on 35 years: net creditor by Year 35
// and a guard that nothing breaks through Year 75 (net interest under 10% of revenue, debt/GDP not rising).
const OPT_35 = bestByStart([0, 1, 2, 3, 4, 5].flatMap(i => JSON.parse(readFileSync(`scripts/output/optimize-below-p80-recover10-curve-zero-lvt10-rise2.5-nc35-guard-${i}.json`, 'utf8'))).filter(r => r.p80NeverBehind));
const byId = id => [...DATA.passing, ...CURVE.passing, ...ZERO.passing].find(d => d.id === id);
// Optimized designs from scripts/optimize-below-p80.mjs (P80 income never behind; P80 net worth even
// from Year 10), by start design.
const pctTxt = v => `${+(v * 100).toFixed(1)}%`;
const kTxt = v => (v >= 1e6 ? `$${+(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}K`);
function optimizedNote(start, pool = OPT) {
  const r = pool.find(o => o.from === start);
  const sched = r.fam === 'zero' ? `${pctTxt(r.baseRate ?? 0)} to ${kTxt(r.zeroEnd)} with no standard deduction, rising smoothly to ${pctTxt(r.top)} at ${kTxt(r.zeroEnd * r.zeroEndRatio)}`
    : r.fam === 'curve' ? `${pctTxt(r.low)} to ${kTxt(r.start)}, rising smoothly to ${pctTxt(r.top)} at ${kTxt(r.start * r.endRatio)}, ${kTxt(r.exemptJoint)} joint deduction`
    : `${pctTxt(r.low)} to ${kTxt(r.threshold)}, ${pctTxt(r.top)} above, ${kTxt(r.exemptJoint)} joint deduction`;
  return `Optimized for the largest income gains from B10 through P70, with P80 ahead on income every year and back to even on net worth by Year 10: ${sched}; VAT ${pctTxt(r.vatRate)}, LVT ${pctTxt(r.lvtRate)}, carbon $${r.carbonRate}, prebate $${r.prebate.toLocaleString()}.`;
}
const optimized = (start, pool = OPT) => {
  const r = pool.find(o => o.from === start);
  const curve = r.fam === 'curve' ? { low: r.low, top: r.top, start: r.start, end: Math.round(r.start * r.endRatio), shape: r.shape } : undefined;
  const zeroCurve = r.fam === 'zero' ? { zeroEnd: r.zeroEnd, end: Math.round(r.zeroEnd * r.zeroEndRatio), top: r.top, shape: r.zeroShape, baseRate: r.baseRate ?? 0 } : undefined;
  return { brackets: r.brackets, curve, zeroCurve, exemptJoint: r.exemptJoint, vatRate: r.vatRate, lvtRate: r.lvtRate, carbonRate: r.carbonRate,
    prebate: r.prebate, prebateIndex: r.prebateIndex, floorIndex: r.floorIndex, fttPct: r.fttPct };
};
const d1321 = byId(1321);

const VARIANTS = [
  { id: '1321-lvt8', name: '1321, LVT 8%', note: 'Design 1321 with LVT raised from 5.5% to 8%.', changes: { lvtRate: 0.08 } },
  { id: '1321-3rate', name: '1321, LVT 8%, three rates', note: 'Adds a 40% bracket from $400K to $800K to soften the jump at $400K.',
    changes: { lvtRate: 0.08, brackets: [[400e3, d1321.brackets[0][1]], [800e3, 0.40], [null, d1321.brackets[1][1]]] } },
  { id: '1321-p80', name: '1321, tuned for P80', note: 'LVT 8%, a 10% low rate, $70K joint deduction, 14% VAT, $6,500 prebate and $110 carbon: the robust setting that keeps P80 furthest ahead in Years 1-10.',
    changes: { lvtRate: 0.08, brackets: [[400e3, 0.10], [null, d1321.brackets[1][1]]], exemptJoint: 70e3, vatRate: 0.14, prebate: 6500, carbonRate: 110 } },
  { id: '1321-balanced', name: '1321, refined', note: 'After wage indexing: 12.5% to $400K, $50K joint deduction, 15% VAT, 10% LVT, $8,500 prebate and $137 carbon. Raises both P80 and the bottom half over design 1321, and P80 is never behind.',
    changes: { lvtRate: 0.10, brackets: [[400e3, 0.125], [null, d1321.brackets[1][1]]], exemptJoint: 50e3, vatRate: 0.15, prebate: 8500, carbonRate: 137 } },
  { id: '1321-bottom', name: '1321, refined for the bottom half', note: 'After wage indexing: 14% to $400K, $38K joint deduction, 15% VAT, 10% LVT, $9,200 prebate and $110 carbon. The largest bottom-half gain with P80 never behind.',
    changes: { lvtRate: 0.10, brackets: [[400e3, 0.14], [null, d1321.brackets[1][1]]], exemptJoint: 38e3, vatRate: 0.15, prebate: 9200, carbonRate: 110 } },
  { id: '1976-3rate', base: 1976, name: '1976, three rates', note: 'Adds a 40% bracket from $200K to $500K and raises the top rate to 45.8%.',
    changes: { brackets: [[200e3, 0.1113], [500e3, 0.40], [null, 0.458]] } },
  { id: '4148-3rate', base: 4148, name: '4148, three rates', note: 'Adds a 40% bracket from $200K to $500K and raises the top rate to 58.95%.',
    changes: { brackets: [[200e3, 0.1171], [500e3, 0.40], [null, 0.5895]] } },
  ...[13610, 21877, 1976, 4148].map(start => ({ id: `${start}-opt`, base: start, name: `${start}, optimized below P80`,
    note: optimizedNote(start), changes: optimized(start) })),
  // scripts/lvt-sweep.mjs: the optimized 21877 with only the LVT raised to 10%.
  { id: '21877-lvt10', base: 21877, name: '21877 optimized, LVT 10%', note: 'The optimized 21877 design (0% band, no standard deduction) with only the LVT raised to 10%.',
    changes: { ...optimized(21877), lvtRate: 0.10 } },
  { id: '21877-r', base: 21877, name: '21877, re-optimized', note: optimizedNote(21877, OPT_RISE), changes: optimized(21877, OPT_RISE) },
  { id: '12053-r', base: 12053, name: '12053, optimized, smooth rise', note: optimizedNote(12053, OPT_RISE), changes: optimized(12053, OPT_RISE) },
  { id: '12053-h', base: 12053, name: '12053, optimized for the 1.2% floor and housing', note: optimizedNote(12053, OPT_HOUSING), changes: optimized(12053, OPT_HOUSING) },
  { id: '21877-h', base: 21877, name: '21877, re-optimized for the 1.2% floor and housing', note: optimizedNote('current', OPT_HOUSING), changes: optimized('current', OPT_HOUSING) },
  { id: '12053-35', base: 12053, name: '12053, optimized on 35 years', note: optimizedNote(12053, OPT_35), changes: optimized(12053, OPT_35) },
  { id: '21877-35', base: 21877, name: '21877, re-optimized on 35 years', note: optimizedNote('current', OPT_35), changes: optimized('current', OPT_35) },
  { id: '14007-lvt10', base: 14007, name: '14007, optimized, LVT 10%', note: optimizedNote(14007, OPT_LVT10), changes: optimized(14007, OPT_LVT10) },
  // scripts/prebate-vs-base-rate.mjs: a 2% rate on the zero band, returned through $500 more prebate (the
// only base rate that stayed robust).
  { id: '21877-base2', base: 21877, name: '21877 optimized, 2% base rate', note: 'The optimized 21877 design with a 2% rate in place of the 0% band (no later rate below 2%) and the prebate raised $500 a person. Moves gains from P50-P70 toward B10-P20.',
    changes: (() => { const o = optimized(21877); return { ...o, zeroCurve: { ...o.zeroCurve, baseRate: 0.02 }, brackets: [[o.brackets[0][0], 0.02], ...o.brackets.slice(1)].map(([t, r]) => [t, Math.max(r, 0.02)]), prebate: o.prebate + 500 }; })() },
];
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const out = [];
for (const v of VARIANTS) {
  const src = byId(v.base ?? 1321);
  const rec = { ...src, ...v.changes };
  const design = delta(paramsFromDesign(rec));
  const r = E.evaluate(design);
  const rec5 = E.evaluate({ ...design, recessionYear: 5 }), rec12 = E.evaluate({ ...design, recessionYear: 12 }), low = E.evaluate({ ...design, growthCase: 'low' });
  const robust = r.minIncomeGain >= 1000 && r.minNwGain >= 1000
    && rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15 && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
    && low.fiscalGoalYear != null && low.fiscalGoalYear <= 20 && rec5.bottom80Pass && rec12.bottom80Pass && low.bottom80Pass;
  const GROUPS = ['B10', 'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70', 'P80'];
  const g = E.gainsTable(design, GROUPS, Array.from({ length: 35 }, (_, i) => i + 1));
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const groupFields = { gains: GROUPS.map(k => Math.round(avg(g[k].slice(0, 30).map(x => x.income)))),
    p80Avg1to10: Math.round(avg(g.P80.slice(0, 10).map(x => x.income))), p80MinIncome: Math.round(Math.min(...g.P80.map(x => x.income))),
    p80NwMinFrom10: Math.round(Math.min(...g.P80.slice(9).map(x => x.netWorth))) };
  out.push({ ...rec, id: v.id, name: v.name, note: v.note, ...r, ...groupFields, goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear,
    goalLowGrowth: low.fiscalGoalYear, stressTested: true, robust, frontierRobust: false, variant: true });
  console.log(v.name, '| goal', r.fiscalGoalYear, 'rec5', rec5.fiscalGoalYear, 'robust', robust, '| Gini', r.incomeGiniY30, r.nwGiniY30, '| P80 Y30', r.P80Y30);
}
writeFileSync('src/data/design-variants.json', JSON.stringify(out));
await server.close();
