// Healthcare Supplement diagnostics: debt path against the pre-Supplement defaults at several
// contribution rates, and the rate that holds Year-35 debt/GDP at the pre-Supplement level under
// alternative settings. Run: node scripts/health-diagnose.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const run = d => F.runFiscalSimulation({ ...F.BASE_PARAMS, ...d }, 35);
const debtPath = d => run(d).rows.map(r => r.debtToGdp);
// Floor off, so debt keeps falling and Year-35 debt is comparable across settings.
const debt35 = d => run({ debtFloorOn: false, ...d }).rows[34].debtToGdp;
function neutralRate(d, offD) {
  const target = debt35({ ...offD, healthSupplementOn: false });
  let lo = 0.02, hi = 0.30;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (debt35({ ...d, healthContributionRate: m }) > target) lo = m; else hi = m; }
  return +((lo + hi) / 2).toFixed(4);
}
const out = { paths: {}, neutral: {} };
out.paths.off = debtPath({ healthSupplementOn: false });
for (const r of [0.10, 0.12, 0.14, 0.16]) out.paths[r] = debtPath({ healthContributionRate: r });
const cases = {
  default: [{}, {}],
  capGap05: [{ healthCapGap: 0.005 }, {}],
  capNoMedicare: [{ healthCapMedicareOn: false }, {}],
  noCap: [{ healthCapScope: 0 }, {}],
  noAbundanceFloor: [{ abundanceFloorOn: false }, { abundanceFloorOn: false }],
  immigrantsAtOldHealthCost: [{ healthImmigrantFactor: 0.28 }, {}],
};
for (const [n, [d, o]] of Object.entries(cases)) out.neutral[n] = neutralRate(d, o);
const r = run({ healthContributionRate: out.neutral.default }).rows;
out.linesAtNeutral = [1, 5, 10, 20, 35].map(y => { const x = r[y - 1], g = k => +((x[k] / x.nominalGdp) * 100).toFixed(2);
  return { y, contrib: g('healthContribution'), wage: g('healthWageRev'), claw: g('healthClawback'), net: g('healthNetOutlays'), imm: g('healthImmigrantSpend'), mcare: g('healthMedicareSavings'), labor: x.laborLevel, immM: x.extraImmigrantsM }; });
writeFileSync('scripts/output/health-diagnose.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.neutral));
console.log([5, 10, 20, 30, 35].map(y => `Y${y} ` + Object.entries(out.paths).map(([k, v]) => `${k}:${v[y - 1]}`).join(' ')).join('\n'));
console.table(out.linesAtNeutral);
await server.close();
