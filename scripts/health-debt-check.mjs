// Debt paths in base and stress cases for one design in the optimizer's format.
// Run: node scripts/health-debt-check.mjs '<design JSON>' <paymentLevel>
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const { stableRentFrac, RENT_TAX_DEFAULTS } = await server.ssrLoadModule('/src/lib/rent-taxes.js');
const x = JSON.parse(process.argv[2]), level = process.argv[3];
const b = [[x.threshold, x.low], [Infinity, x.top]];
const des = { incomeTaxBrackets: b, incomeTaxLow: x.low, incomeTaxHigh: x.top, incomeTaxThreshold: x.threshold,
  incomeTaxExemptJoint: x.exemptJoint, incomeTaxExemptSingle: x.exemptJoint / 2, vatRate: x.vatRate, lvtRate: x.lvtRate,
  carbonRate: x.carbonRate, prebatePerCapita: x.prebate, prebateIndex: 0.75, citizenFloorIndex: x.floorIndex, fttPct: x.fttPct,
  stableTaxFrac: stableRentFrac({ ...RENT_TAX_DEFAULTS, fttPct: x.fttPct }),
  healthContributionRate: x.healthRate, healthPaymentLevel: level };
for (const [name, d] of [['base', {}], ['rec5', { recessionYear: 5 }], ['rec12', { recessionYear: 12 }], ['low', { growthCase: 'low' }]]) {
  const rows = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...des, ...d }, 75).rows;
  console.log(name, [10, 20, 30, 35, 50, 75].map(y => [y, rows[y - 1].debtToGdp]).join(' '));
}
const g = E.gainsTable(des, ['B10', 'P30', 'P50', 'P70', 'P80'], Array.from({ length: 30 }, (_, i) => i + 1));
for (const [k, v] of Object.entries(g)) console.log(k, 'avg income gain Yrs 1-30', Math.round(v.reduce((s, q) => s + q.income, 0) / v.length), 'min', Math.round(Math.min(...v.map(q => q.income))));
await server.close();
