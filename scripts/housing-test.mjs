// Housing test (Brayden, 2026-10-25): with the 1.2% Abundance Floor admission rate, how large must
// the National Housing Corporation be, and how much does private building's response to rents
// (by-right zoning raises it) matter, to keep rents at or below current law?
// Run: node scripts/housing-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const out = [];
const CASES = [];
for (const nhcScale of [3, 5, 7, 9]) CASES.push({ abundanceAdmitRate: 0.012, nhcScale, privateSupplyElasticity: 1 });
for (const nhcScale of [5, 7]) CASES.push({ abundanceAdmitRate: 0.012, nhcScale, privateSupplyElasticity: 2 });
for (const s0 of [2e6, 5.5e6]) CASES.push({ abundanceAdmitRate: 0.012, nhcScale: 7, privateSupplyElasticity: 1, housingShortage0: s0 });
for (const d of CASES) {
  const { abundanceAdmitRate: rate, nhcScale, privateSupplyElasticity: el } = d;
  const { rows } = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...d }, 75);
  const peak = rows.reduce((a, r) => r.rentVsCurrentLawPct > a.rentVsCurrentLawPct ? r : a, rows[0]);
  const closed = rows.find(r => r.year > 1 && r.housingShortageM <= 0)?.year ?? null;
  const nhcTotal20 = rows.slice(0, 20).reduce((a, r) => a + r.nhcUnitsK, 0) / 1e3;
  const { milestones } = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...d }, 75);
  const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
  out.push({ shortage0M: (d.housingShortage0 ?? 4e6) / 1e6, popM: Object.fromEntries([30, 60, 75].map(y => [y, Math.round(rows[y - 1].population / 1e6)])),  fiscalGoal: milestones.fiscalGoalYear, goalRec5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear, goalRec12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear, goalLow: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear, admitRatePct: rate * 100, nhcScale, privateSupplyElasticity: el, peakRentVsCLPct: peak.rentVsCurrentLawPct, peakYear: peak.year,
    rentVsCL: Object.fromEntries([5, 10, 20, 30, 50, 75].map(y => [y, rows[y - 1].rentVsCurrentLawPct])),
    shortageM: Object.fromEntries([10, 20, 30, 50, 75].map(y => [y, rows[y - 1].housingShortageM])), shortageClosedYear: closed,
    nhcUnitsFirst20YearsM: +nhcTotal20.toFixed(1) });
}
writeFileSync('scripts/output/housing-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
