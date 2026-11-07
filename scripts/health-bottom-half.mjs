// Bottom half (B10-P40): income gain against current law under the pre-Supplement default and the
// closest debt-band design with the Supplement, split into prebate, health and everything else.
// Run: node scripts/health-bottom-half.mjs   Output: scripts/output/health-bottom-half.json
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const Hm = await server.ssrLoadModule('/src/lib/household-model.js');
const { stableRentFrac, RENT_TAX_DEFAULTS } = await server.ssrLoadModule('/src/lib/rent-taxes.js');
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const b = [[195000, 0.1], [Infinity, 0.62]];
const CLOSEST = { incomeTaxBrackets: b, incomeTaxLow: 0.1, incomeTaxHigh: 0.62, incomeTaxThreshold: 195000,
  incomeTaxExemptJoint: 33000, incomeTaxExemptSingle: 16500, vatRate: 0.1162, lvtRate: 0.1402, carbonRate: 125,
  prebatePerCapita: 4600, prebateIndex: 0.75, citizenFloorIndex: 0.5, fttPct: 0.289,
  stableTaxFrac: stableRentFrac({ ...RENT_TAX_DEFAULTS, fttPct: 0.289 }),
  healthContributionRate: 0.0618, healthPaymentLevel: 'rate123' };
const DESIGNS = { preSupplement: { healthSupplementOn: false }, closest: CLOSEST };
const GROUPS = ['B10', 'P10', 'P20', 'P30', 'P40'], YEARS = [1, 5, 10, 20, 30];
const out = {};
for (const [name, d] of Object.entries(DESIGNS)) {
  const p = { ...F.BASE_PARAMS, ...d };
  const fx = { ...p, grants: F.realGrantSeries(p), hh: F.householdFiscalSeries(p) };
  out[name] = {};
  for (const k of GROUPS) {
    out[name][k] = {};
    for (const y of YEARS) {
      const a = Hm.cashFlowPt(k, y, ALL, false, fx), c = Hm.cashFlowPt(k, y, Hm.BASE_ONLY, false, fx);
      const taxes = a.taxRef + a.vat + a.lvt + a.carb + a.payFix + a.assigned + a.psuTax;
      out[name][k][y] = { gain: Math.round(a.net - c.net), prebate: Math.round(a.pre), health: Math.round(a.health), coverage: Math.round(a.coverage ?? 0),
        taxes: Math.round(taxes), other: Math.round(a.net - c.net - a.pre - a.health - (a.coverage ?? 0) - taxes) };
    }
  }
}
writeFileSync('scripts/output/health-bottom-half.json', JSON.stringify(out, null, 1));
for (const k of GROUPS) for (const y of YEARS) {
  const A = out.preSupplement[k][y], B = out.closest[k][y];
  console.log(k, y, 'pre', JSON.stringify(A), 'closest', JSON.stringify(B));
}
await server.close();
