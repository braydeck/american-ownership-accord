// Healthcare Reserve and Treasury-tranche cash as shares of GDP, without the Supplement and with it
// at the current placeholder contribution rate. Run: node scripts/health-amcf-check.mjs
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
for (const [label, d] of [['Supplement off', { healthSupplementOn: false }], ['Supplement on', {}]]) {
  const { rows } = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...d }, 35);
  console.log(label);
  for (const y of [1, 5, 10, 20, 35]) {
    const r = rows[y - 1], g = k => +((r[k] / r.nominalGdp) * 100).toFixed(2);
    console.log(' ', y, JSON.stringify({ treasuryCash: g('treasuryCash'), reserve: g('healthcareAMCF'), toDebt: g('debtReductionAMCF'), discretionary: g('discretionaryAMCF'), brake: r.solventBrakeActive, reserveRealB: Math.round(r.healthcareAMCF / r.priceLevel * 1000) }));
  }
}
await server.close();
