// Optimizer for Brayden's distributional goal (2026-10-18): P80 (the 80th-90th percentile) never
// behind current law on income or net worth in any year 1-35, and the largest income gains for the
// eight groups below it (B10-P70, equal population shares), averaged over Years 1-30. Designs must
// also meet the design search's robust conditions. Top income tax rate allowed up to 62%.
// No searched robust design keeps P80's net worth even in Years 5-9 (the Growth Tax dilutes P80's
// stock holdings before AMCF units build up), so the climb is two-stage: while P80's net worth
// falls behind in some year, a move is kept if it raises P80's lowest net-worth gain; once P80 is
// never behind, a move must keep that and raise the gain below P80.
// Three schedule families: two rates (low rate to a threshold, top rate above), the curve, and the
// zero-start curve with no standard deduction (both from scripts/lib/design-search-eval.js). Hill climbing from the best robust designs of both searches,
// moving one or two levers at a time; seeded (42), deterministic.
// Run: node scripts/optimize-below-p80.mjs [iterations=250] [p80NetWorthFloor=0] [recoverBy=1] [shard=0/1] [families=two,curve,zero] [lvtMin=0] [minRise=1.2]; SEEDS=file adds starts
//   → scripts/output/optimize-below-p80[-floor][-recover{Y}][-shard].json
// P80's net-worth gain must be at or above the floor from Year recoverBy on (Brayden, 2026-10-18:
// a dip in Years 5-9 is acceptable if net worth is back to even by Year 10, so floor 0, recoverBy
// 10). shard i/n runs every n-th start, for parallel runs.
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const ITERS = Number(process.argv[2] ?? 250);
const NW_FLOOR = Number(process.argv[3] ?? 0);
const RECOVER_BY = Number(process.argv[4] ?? 1);
const [SHARD, SHARDS] = (process.argv[5] ?? '0/1').split('/').map(Number);
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
// Optional long-run condition (2026-10-25): the government becomes a net creditor by this year in a
// 75-year run. Without it, the optimizer traded the long-run debt path for household gains.
const NET_CREDITOR_BY = process.env.NET_CREDITOR_BY ? Number(process.env.NET_CREDITOR_BY) : null;
const { makeRng } = await server.ssrLoadModule('/src/lib/prng.js');
const { stableRentRevYr1, RENT_TAX_DEFAULTS, YR1_NOM_GDP } = await server.ssrLoadModule('/src/lib/rent-taxes.js');
const B = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const C = JSON.parse(readFileSync('src/data/curve-search.json', 'utf8'));
const Z = JSON.parse(readFileSync('src/data/zero-curve-search.json', 'utf8'));
const FAMS = (process.argv[6] ?? 'two,curve,zero').split(',');
// Lowest LVT allowed (Brayden, 2026-10-18: ideally 10% or above). Starts below it are raised to it.
const LVT_MIN = Number(process.argv[7] ?? 0);
// Narrowest rise allowed for the curve, as end income ÷ start income (Brayden, 2026-10-19: no
// near-jumps like 4148's; 2.5 spreads the rise over at least a 2.5× income range).
const MIN_RISE = Number(process.argv[8] ?? 1.2);
// Optional extra starts in this script's design format (SEEDS=path to a JSON array), e.g. the
// current default, which the searches' robust pool may not contain.
const SEEDS = process.env.SEEDS ? JSON.parse(readFileSync(process.env.SEEDS, 'utf8')) : [];
const rng = makeRng(42);
const normal = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());

const BELOW = ['B10', 'P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70'];
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const BOUNDS = {
  low: [0.10, 0.25], top: [0.40, 0.62], threshold: [100e3, 400e3], start: [100e3, 300e3], endRatio: [MIN_RISE, 10], shape: [0.33, 1.5],
  baseRate: [0, 0.08], zeroEnd: [15e3, 150e3], zeroEndRatio: [3, 60], zeroShape: [0.5, 3],
  exemptJoint: [30e3, 80e3], vatRate: [0, 0.15], lvtRate: [LVT_MIN, 0.15], carbonRate: [0, 190], prebate: [3000, 10000], fttPct: [0, 0.5],
};
const LOG = new Set(['threshold', 'start', 'endRatio', 'shape', 'zeroEnd', 'zeroEndRatio', 'zeroShape']);
const INDEX = { prebateIndex: E.PREBATE_INDEX_OPTIONS, floorIndex: E.FLOOR_INDEX_OPTIONS };
const keysFor = fam => [...(fam === 'two' ? ['low', 'top', 'threshold'] : fam === 'zero' ? ['top', 'baseRate', 'zeroEnd', 'zeroEndRatio', 'zeroShape']
  : ['low', 'top', 'start', 'endRatio', 'shape']), ...(fam === 'zero' ? [] : ['exemptJoint']), 'vatRate', 'lvtRate', 'carbonRate', 'prebate', 'fttPct', 'prebateIndex', 'floorIndex'];

function schedule(x) {
  if (x.fam === 'two') return [[x.threshold, x.low], [Infinity, x.top]];
  // baseRate (Brayden, 2026-10-18): a rate on the bottom band in place of 0%; no later rate falls below it.
  if (x.fam === 'zero') return E.zeroCurveBrackets({ zeroEnd: x.zeroEnd, end: x.zeroEnd * x.zeroEndRatio, top: x.top, shape: x.zeroShape })
    .map(([t, r]) => [t, Math.max(r, x.baseRate ?? 0)]);
  return E.curveBrackets({ low: x.low, top: x.top, start: x.start, end: x.start * x.endRatio, shape: x.shape });
}
function toDesign(x) {
  const b = schedule(x);
  return {
    incomeTaxBrackets: b, incomeTaxLow: b[0][1], incomeTaxHigh: b[b.length - 1][1], incomeTaxThreshold: b[b.length - 2][0],
    incomeTaxExemptJoint: x.exemptJoint, incomeTaxExemptSingle: x.exemptJoint / 2, vatRate: x.vatRate, lvtRate: x.lvtRate,
    carbonRate: x.carbonRate, prebatePerCapita: x.prebate, prebateIndex: x.prebateIndex, citizenFloorIndex: x.floorIndex,
    fttPct: x.fttPct, stableTaxFrac: stableRentRevYr1({ ...RENT_TAX_DEFAULTS, fttPct: x.fttPct }) / YR1_NOM_GDP,
  };
}
function fromRecord(d) {
  const shared = { exemptJoint: d.exemptJoint, vatRate: d.vatRate, lvtRate: d.lvtRate, carbonRate: d.carbonRate, prebate: d.prebate,
    fttPct: d.fttPct, prebateIndex: d.prebateIndex, floorIndex: d.floorIndex, from: d.id };
  if (d.zeroCurve) return { fam: 'zero', ...shared, exemptJoint: 0, low: 0, baseRate: d.zeroCurve.baseRate ?? 0, top: d.zeroCurve.top, zeroEnd: d.zeroCurve.zeroEnd,
    zeroEndRatio: d.zeroCurve.end / d.zeroCurve.zeroEnd, zeroShape: d.zeroCurve.shape };
  if (d.curve) return { fam: 'curve', ...shared, low: d.curve.low, top: d.curve.top, start: d.curve.start, endRatio: d.curve.end / d.curve.start, shape: d.curve.shape };
  if (d.brackets.length !== 2) return null;
  return { fam: 'two', ...shared, low: d.brackets[0][1], top: d.brackets[1][1], threshold: d.brackets[0][0] };
}

// null when the design fails a condition; otherwise its scores.
function score(x) {
  const des = toDesign(x);
  const r = E.evaluate(des);
  if (!(r.bottom80Pass && r.fiscalGoalYear != null && r.fiscalGoalYear <= 10 && r.minIncomeGain >= 1000 && r.minNwGain >= 1000)) return null;
  const g = E.gainsTable(des, [...BELOW, 'P80'], YEARS);
  const p80IncMin = Math.min(...g.P80.map(v => v.income));
  const p80NwMin = Math.min(...g.P80.slice(RECOVER_BY - 1).map(v => v.netWorth));
  if (p80IncMin < 0) return null;
  const rec5 = E.evaluate({ ...des, recessionYear: 5 });
  if (!(rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 16 && rec5.bottom80Pass)) return null; // Year 16 accepted 2026-10-23 with the grant bridge
  const rec12 = E.evaluate({ ...des, recessionYear: 12 });
  if (!(rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22 && rec12.bottom80Pass)) return null;
  const low = E.evaluate({ ...des, growthCase: 'low' });
  if (!(low.fiscalGoalYear != null && low.fiscalGoalYear <= 20 && low.bottom80Pass)) return null;
  let netCreditorYear = null;
  if (NET_CREDITOR_BY) {
    netCreditorYear = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...des }, 75).milestones.netCreditorYear;
    if (!(netCreditorYear != null && netCreditorYear <= NET_CREDITOR_BY)) return null;
  }
  const below = BELOW.map(k => g[k].map(v => v.income));
  return {
    objective: Math.round(avg(below.map(s => avg(s.slice(0, 30))))),
    belowAvg1to10: Math.round(avg(below.map(s => avg(s.slice(0, 10))))),
    bottomHalfAvg1to30: Math.round(avg(below.slice(0, 5).map(s => avg(s.slice(0, 30))))),
    byGroupAvg1to30: Object.fromEntries(BELOW.map((k, i) => [k, Math.round(avg(below[i].slice(0, 30)))])),
    p80MinIncome: Math.round(p80IncMin), p80MinNetWorth: Math.round(p80NwMin), p80LowestNetWorthAnyYear: Math.round(Math.min(...g.P80.map(v => v.netWorth))), p80NeverBehind: p80NwMin >= NW_FLOOR,
    p80NetWorth: [1, 3, 5, 7, 10, 20, 30].map(y => [y, Math.round(g.P80[y - 1].netWorth)]),
    p80AvgIncome1to10: Math.round(avg(g.P80.slice(0, 10).map(v => v.income))),
    netCreditorYear, fiscalGoalYear: r.fiscalGoalYear, goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear, goalLowGrowth: low.fiscalGoalYear,
    incomeGiniY30: r.incomeGiniY30, nwGiniY30: r.nwGiniY30, laborLevelY10: r.laborLevelY10,
  };
}

function mutate(x) {
  const y = { ...x };
  const keys = keysFor(x.fam);
  const n = rng.next() < 0.6 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const k = keys[Math.floor(rng.next() * keys.length)];
    if (INDEX[k]) { const opts = INDEX[k], j = opts.indexOf(y[k]); y[k] = opts[Math.max(0, Math.min(opts.length - 1, j + (rng.next() < 0.5 ? -1 : 1)))]; continue; }
    const [a, b] = BOUNDS[k];
    if (LOG.has(k)) y[k] = Math.min(b, Math.max(a, y[k] * Math.exp(0.15 * normal())));
    else y[k] = Math.min(b, Math.max(a, y[k] + 0.08 * (b - a) * normal()));
  }
  if (y.baseRate != null) y.baseRate = +y.baseRate.toFixed(3);
  if (y.zeroEnd) { y.zeroEnd = Math.round(y.zeroEnd / 1e3) * 1e3; y.zeroShape = +y.zeroShape.toFixed(3); y.zeroEndRatio = +y.zeroEndRatio.toFixed(3); }
  y.low = +y.low.toFixed(4); y.top = +y.top.toFixed(4); y.vatRate = +y.vatRate.toFixed(4); y.lvtRate = +y.lvtRate.toFixed(4); y.fttPct = +y.fttPct.toFixed(3);
  y.carbonRate = Math.round(y.carbonRate); y.prebate = Math.round(y.prebate / 50) * 50; y.exemptJoint = Math.round(y.exemptJoint / 1000) * 1000;
  if (y.threshold) y.threshold = Math.round(y.threshold / 5e3) * 5e3;
  if (y.start) { y.start = Math.round(y.start / 5e3) * 5e3; y.shape = +y.shape.toFixed(3); y.endRatio = +y.endRatio.toFixed(3); }
  if (y.fam !== 'zero' && y.low >= y.top) return x;
  return y;
}

const better = (s, c) => s.p80NeverBehind && !c.p80NeverBehind ? true
  : s.p80NeverBehind && c.p80NeverBehind ? s.objective > c.objective
  : !s.p80NeverBehind && !c.p80NeverBehind ? s.p80MinNetWorth > c.p80MinNetWorth : false;

// Starts per family: the 5 robust designs with the highest P80 net-worth floor and the 3 with the
// largest gain below P80, plus the named designs (4148, 1976, 14007, 13610, 21877) when their family runs.
const pool = [...[...B.passing, ...C.passing, ...Z.passing].filter(d => d.robust).map(d => fromRecord(d)).filter(Boolean), ...SEEDS]
  .filter(x => FAMS.includes(x.fam)).map(x => ({ ...x, lvtRate: Math.max(x.lvtRate, LVT_MIN), ...(x.endRatio ? { endRatio: Math.max(x.endRatio, MIN_RISE) } : {}) }));
const scored = pool.map(x => ({ x, s: score(x) })).filter(o => o.s);
const starts = [];
for (const fam of FAMS) {
  const f = scored.filter(o => o.x.fam === fam);
  for (const o of [...[...f].sort((a, b) => b.s.p80MinNetWorth - a.s.p80MinNetWorth).slice(0, 5), ...[...f].sort((a, b) => b.s.objective - a.s.objective).slice(0, 3)])
    if (!starts.includes(o)) starts.push(o);
}
const NAMED_STARTS = [...(FAMS.includes('two') ? [4148, 1976, 14007] : []), ...(FAMS.includes('curve') ? [13610] : []), ...(FAMS.includes('zero') ? [21877] : [])];
for (const sd of SEEDS) { const o = scored.find(o => o.x === pool.find(p => p.from === sd.from && p.zeroEnd === sd.zeroEnd && p.top === sd.top)); if (o && !starts.includes(o)) starts.push(o); }
for (const id of NAMED_STARTS) if (!starts.some(o => o.x.from === id)) { const o = scored.find(o => o.x.from === id); if (o) starts.push(o); }
console.log(`robust designs ${pool.length}, meet P80 condition ${scored.length}, starts ${starts.length}`);

const results = [];
for (const st of starts.filter((_, i) => i % SHARDS === SHARD)) {
  let cur = st;
  for (let i = 0; i < ITERS; i++) {
    const x = mutate(cur.x);
    if (x === cur.x) continue;
    const s = score(x);
    if (s && better(s, cur.s)) cur = { x, s };
  }
  results.push({ start: st.x.from, startObjective: st.s.objective, ...cur.x, brackets: schedule(cur.x).map(([t, r]) => [t === Infinity ? null : Math.round(t), r]), ...cur.s });
  console.log(`from ${st.x.from} (${st.x.fam}): ${st.s.objective} → ${cur.s.objective} | P80 min inc ${cur.s.p80MinIncome} nw ${cur.s.p80MinNetWorth} | goal ${cur.s.fiscalGoalYear} | Gini ${cur.s.incomeGiniY30} ${cur.s.nwGiniY30}`);
}
results.sort((a, b) => (b.p80NeverBehind - a.p80NeverBehind) || (b.p80NeverBehind ? b.objective - a.objective : b.p80MinNetWorth - a.p80MinNetWorth));
writeFileSync(`scripts/output/optimize-below-p80${NW_FLOOR ? `-${-NW_FLOOR}` : ''}${RECOVER_BY > 1 ? `-recover${RECOVER_BY}` : ''}${process.argv[6] ? `-${FAMS.join('-')}` : ''}${LVT_MIN ? `-lvt${Math.round(LVT_MIN * 100)}` : ''}${MIN_RISE > 1.2 ? `-rise${MIN_RISE}` : ''}${NET_CREDITOR_BY ? `-nc${NET_CREDITOR_BY}` : ''}${SHARDS > 1 ? `-${SHARD}` : ''}.json`, JSON.stringify(results, null, 1));
for (const r of results.slice(0, 6)) console.log(JSON.stringify(r));
await server.close();
