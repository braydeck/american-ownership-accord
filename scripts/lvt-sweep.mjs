// What does a higher LVT do to the designs below P80? (Brayden, 2026-10-18.) Holds every other lever
// of two optimized designs fixed and varies only the LVT rate. Reports gains by group, P80's
// income and net-worth tests, the fiscal goal and the Year-5 recession test.
// Run: node scripts/lvt-sweep.mjs → scripts/output/lvt-sweep.json
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const { paramsFromDesign, fxFromParams } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS, runFiscalSimulation } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const V = JSON.parse(readFileSync('src/data/design-variants.json', 'utf8'));
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const G = ['B10', 'P20', 'P40', 'P50', 'P60', 'P70', 'P80'];
const YEARS = Array.from({ length: 35 }, (_, i) => i + 1);
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const out = [];
for (const id of ['21877-opt', '14007-lvt10']) {
  const base = paramsFromDesign(V.find(v => v.id === id));
  for (const lvt of [0.06, 0.08, 0.10, 0.12]) {
    const p = { ...base, lvtRate: lvt }, des = delta(p);
    const r = E.evaluate(des), rec5 = E.evaluate({ ...des, recessionYear: 5 });
    const g = E.gainsTable(des, G, YEARS);
    const fx = fxFromParams(p);
    // Year-10 LVT layer: the household's LVT cost (owners) or rent relief (renters), and its net worth change.
    const lvtCost = Object.fromEntries(['P40', 'P70', 'P80'].map(k => {
      const a = H.getNW(k, 10, ALL, fx), b = H.getNW(k, 10, H.BASE_ONLY, fx);
      return [k, Math.round(a.tax - (b.tax ?? 0))];
    }));
    const rows = runFiscalSimulation(p, 12).rows;
    const row = { design: id, lvt, fiscalGoalYear: r.fiscalGoalYear, goalRecession5: rec5.fiscalGoalYear,
      lvtRevY5PctGdp: +(100 * rows[4].lvtRev / rows[4].nominalGdp).toFixed(2), laborY10: r.laborLevelY10,
      gains: Object.fromEntries(G.map(k => [k, Math.round(avg(g[k].slice(0, 30).map(v => v.income)))])),
      p80MinIncome: Math.round(Math.min(...g.P80.map(v => v.income))), p80NwY10: Math.round(g.P80[9].netWorth),
      p80NwY5: Math.round(g.P80[4].netWorth), taxLayerNwY10: lvtCost, gini: [r.incomeGiniY30, r.nwGiniY30] };
    out.push(row);
    console.log(id, 'LVT', lvt, '| goal', row.fiscalGoalYear, 'rec5', row.goalRecession5, '| LVT rev Y5 %GDP', row.lvtRevY5PctGdp,
      '| gains', JSON.stringify(row.gains), '| P80 min inc', row.p80MinIncome, 'NW Y5', row.p80NwY5, 'Y10', row.p80NwY10, '| Gini', row.gini.join(' '));
  }
}
writeFileSync('scripts/output/lvt-sweep.json', JSON.stringify(out, null, 1));
await server.close();
