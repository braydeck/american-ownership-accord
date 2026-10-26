// Abundance Floor ramp test (Brayden, 2026-10-25): compares the 4-year admissions ramp with slower
// ramps, and with a cap on admissions as a share of population, on admissions as a share of population, the fiscal goal and stress tests, and households.
// Run: node scripts/immigration-ramp-test.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const BOTTOM_HALF = ['B10', 'P10', 'P20', 'P30', 'P40'];
const out = [];
for (const ramp of [4, 'cap 0.5%', 'cap 0.6%', 'cap 0.8%', 'cap 1.0%', 'cap 1.2%', 'cap 1.5%']) {
  const d = typeof ramp === 'number' ? { abundanceRampYears: ramp } : { abundanceMaxAdmitRate: parseFloat(ramp.slice(4)) / 100 };
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones } = F.runFiscalSimulation(p, 75);
  let prev = 0, prevPop = p.startingPopulation, peakAdd = 0, peakAddYear = 0, peakGrowth = 0;
  for (const r of rows) {
    const addPct = (r.extraImmigrantsM - prev) * 1e6 / prevPop * 100, growth = (r.population / prevPop - 1) * 100;
    if (addPct > peakAdd) { peakAdd = addPct; peakAddYear = r.year; }
    peakGrowth = Math.max(peakGrowth, growth);
    prev = r.extraImmigrantsM; prevPop = r.population;
  }
  const g = F.realGrantSeries(p, 75); const at = t => g.find(([y]) => y === t)[1];
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  const gain = (k, y) => H.getInc(k, y, ALL, fx).total - H.getInc(k, y, H.BASE_ONLY, fx).total;
  let bh = 0, n = 0; for (let y = 1; y <= 30; y++) for (const k of BOTTOM_HALF) { bh += gain(k, y); n++; }
  const ev = E.evaluate(d);
  out.push({
    ramp, peakAdmissionsPctPop: +peakAdd.toFixed(2), peakAdmissionsYear: peakAddYear, peakPopGrowthPct: +peakGrowth.toFixed(2),
    extraImmigrantsM: { 5: rows[4].extraImmigrantsM, 10: rows[9].extraImmigrantsM, 30: rows[29].extraImmigrantsM },
    gdpVsCurrentLawPct: { 10: +((rows[9].accordLevel - 1) * 100).toFixed(1), 30: +((rows[29].accordLevel - 1) * 100).toFixed(1) },
    fiscalGoal: milestones.fiscalGoalYear, goalRec5: E.evaluate({ ...d, recessionYear: 5 }).fiscalGoalYear,
    goalRec12: E.evaluate({ ...d, recessionYear: 12 }).fiscalGoalYear, goalLow: E.evaluate({ ...d, growthCase: 'low' }).fiscalGoalYear,
    netCreditor: milestones.netCreditorYear, debtFree: milestones.debtFreeYear, ssBackstopStart: milestones.ssBackstopStartYear,
    grant: { 10: at(10), 30: at(30), 60: at(60) },
    p80NwY10: Math.round(H.getNW('P80', 10, ALL, fx).total - H.getNW('P80', 10, H.BASE_ONLY, fx).total),
    p80MinIncomeGain: ev.minIncomeGain, bottomHalfAvgGain: Math.round(bh / n), nwGiniY30: ev.nwGiniY30,
  });
}
writeFileSync('scripts/output/immigration-ramp-test.json', JSON.stringify(out, null, 2));
for (const o of out) console.log(JSON.stringify(o));
await server.close();
