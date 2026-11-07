// Healthcare Supplement household effects: income gain over current law by group, with and without
// the Supplement, and the health layer's parts for each group at Years 2 and 10.
// Run: node scripts/health-households.mjs [rate] [extra params as JSON]
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const D = await server.ssrLoadModule('/src/lib/demographics.js');
const rate = +(process.argv[2] ?? F.BASE_PARAMS.healthContributionRate);
const extra = JSON.parse(process.argv[3] ?? '{}');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const HALF = ['B10', 'P10', 'P20', 'P30', 'P40'];
const fxOf = d => { const p = { ...F.BASE_PARAMS, ...extra, ...d }; return { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) }; };
const scen = { off: fxOf({ healthSupplementOn: false }), on: fxOf({ healthContributionRate: rate }) };
const gain = (fx, k, y) => H.getInc(k, y, ALL, fx).total - H.getInc(k, y, H.BASE_ONLY, fx).total;
const avg = (fx, ks, y0, y1) => { let s = 0, n = 0; for (const k of ks) for (let y = y0; y <= y1; y++) { s += gain(fx, k, y); n++; } return Math.round(s / n); };
const out = { rate, extra, bottomHalf1to30: {}, byGroup: {} };
for (const [n, fx] of Object.entries(scen)) out.bottomHalf1to30[n] = avg(fx, HALF, 1, 30);
for (const k of D.DEMO_KEYS.filter(k => !['BILL', 'ELON'].includes(k))) {
  out.byGroup[k] = { income: D.DEMOS[k].income };
  for (const y of [2, 10, 30]) {
    out.byGroup[k][`Y${y}off`] = Math.round(gain(scen.off, k, y));
    out.byGroup[k][`Y${y}on`] = Math.round(gain(scen.on, k, y));
    out.byGroup[k][`Y${y}health`] = Math.round(H.cashFlowPt(k, y, ALL, false, scen.on).health);
  }
}
writeFileSync(`scripts/output/health-households-${rate}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.bottomHalf1to30));
console.table(out.byGroup);
await server.close();
