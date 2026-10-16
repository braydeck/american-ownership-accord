// Named variants of searched designs, evaluated like the search's passing designs and written to
// src/data/design-variants.json for the Design Search page. Variants come from
// scripts/bracket-test-1321.mjs and scripts/p80-local-search.mjs (2026-10-16).
// Run: node scripts/design-variants.mjs
import { createServer } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const { paramsFromDesign } = await server.ssrLoadModule('/src/lib/design-params.js');
const { BASE_PARAMS } = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const DATA = JSON.parse(readFileSync('src/data/design-search.json', 'utf8'));
const d1321 = DATA.passing.find(d => d.id === 1321);

const VARIANTS = [
  { id: '1321-lvt8', name: '1321, LVT 8%', note: 'Design 1321 with LVT raised from 5.5% to 8%.', changes: { lvtRate: 0.08 } },
  { id: '1321-3rate', name: '1321, LVT 8%, three rates', note: 'Adds a 40% bracket from $400K to $800K to soften the jump at $400K.',
    changes: { lvtRate: 0.08, brackets: [[400e3, d1321.brackets[0][1]], [800e3, 0.40], [null, d1321.brackets[1][1]]] } },
  { id: '1321-p80', name: '1321, tuned for P80', note: 'LVT 8%, a 10% low rate, $70K joint deduction, 14% VAT, $6,500 prebate and $110 carbon: the robust setting that keeps P80 furthest ahead in Years 1-10.',
    changes: { lvtRate: 0.08, brackets: [[400e3, 0.10], [null, d1321.brackets[1][1]]], exemptJoint: 70e3, vatRate: 0.14, prebate: 6500, carbonRate: 110 } },
];
const delta = p => Object.fromEntries(Object.keys(p).filter(k => p[k] !== BASE_PARAMS[k]).map(k => [k, p[k]]));
const out = [];
for (const v of VARIANTS) {
  const { lvtRate, ...rest } = v.changes;
  const rec = { ...d1321, ...rest, lvtRate: lvtRate ?? d1321.lvtRate };
  const design = delta(paramsFromDesign(rec));
  const r = E.evaluate(design);
  const rec5 = E.evaluate({ ...design, recessionYear: 5 }), rec12 = E.evaluate({ ...design, recessionYear: 12 }), low = E.evaluate({ ...design, growthCase: 'low' });
  const robust = r.minIncomeGain >= 1000 && r.minNwGain >= 1000
    && rec5.fiscalGoalYear != null && rec5.fiscalGoalYear <= 15 && rec12.fiscalGoalYear != null && rec12.fiscalGoalYear <= 22
    && low.fiscalGoalYear != null && low.fiscalGoalYear <= 20 && rec5.bottom80Pass && rec12.bottom80Pass && low.bottom80Pass;
  out.push({ ...rec, id: v.id, name: v.name, note: v.note, ...r, goalRecession5: rec5.fiscalGoalYear, goalRecession12: rec12.fiscalGoalYear,
    goalLowGrowth: low.fiscalGoalYear, stressTested: true, robust, frontierRobust: false, variant: true });
  console.log(v.name, '| goal', r.fiscalGoalYear, 'rec5', rec5.fiscalGoalYear, 'robust', robust, '| Gini', r.incomeGiniY30, r.nwGiniY30, '| P80 Y30', r.P80Y30);
}
writeFileSync('src/data/design-variants.json', JSON.stringify(out));
await server.close();
