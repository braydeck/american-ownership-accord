// Health Fund cost on the federal budget under each provider payment level, growth-cap case and
// cost-sharing design, with no dedicated contribution (the Fund paid from general revenue at
// current tax settings). Prints shares of GDP and the fiscal milestones.
// Run: node scripts/health-cost-scenarios.mjs   Output: scripts/output/health-cost-scenarios.json
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const Hm = await server.ssrLoadModule('/src/lib/health.js');
const YEARS = [2, 5, 10, 20, 35];
const SCENARIOS = {
  off: { healthSupplementOn: false },
  default: {},
  rate142: { healthPaymentLevel: 'rate142' },
  cap200: { healthPaymentLevel: 'cap200' },
  cap150: { healthPaymentLevel: 'cap150' },
  rate123: { healthPaymentLevel: 'rate123' },
  adminHigh: { healthAdminSaving: 'high' },
  capFiveYears: { healthCapCutYears: 5 },
  zeroCostSharing: { healthCostSharing: 'zero' },
  noReserve: { healthReserveToFund: false },
  allDiscretionary: { healthDiscretionaryShare: 1 },
};
const out = { unsourced: Hm.UNSOURCED, paymentCut: Hm.PAYMENT_LEVEL_CUT, adminSaving: Hm.ADMIN_SAVING, scenarios: {} };
for (const [name, d] of Object.entries(SCENARIOS)) {
  const { rows, milestones } = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...d }, 35);
  const pc = (r, k) => +((r[k] / r.nominalGdp) * 100).toFixed(2);
  const years = Object.fromEntries(YEARS.map(y => {
    const r = rows[y - 1];
    const own = pc(r, 'healthWageRev') + pc(r, 'healthClawback') + pc(r, 'healthEmployerTransition');
    const reserve = d.healthReserveToFund === false || d.healthSupplementOn === false ? 0 : pc(r, 'healthcareAMCF');
    return [y, { net: pc(r, 'healthNetOutlays'), fund: pc(r, 'healthFundSpend'), pay: pc(r, 'healthPaymentSavings'),
      admin: pc(r, 'healthAdminSavings'), mcare: pc(r, 'healthMedicareSavings'), own, reserve,
      gap: +(pc(r, 'healthNetOutlays') - own - reserve).toFixed(2), discretionary: pc(r, 'discretionaryAMCF'),
      toFund: pc(r, 'healthDiscretionary'), debt: r.debtToGdp, brake: r.solventBrakeActive }];
  }));
  out.scenarios[name] = { milestones: { goal: milestones.fiscalGoalYear, netCreditor: milestones.netCreditorYear, floor: milestones.debtFloorYear }, years };
  console.log(name, JSON.stringify(out.scenarios[name].milestones));
  for (const y of YEARS) console.log('  ', y, JSON.stringify(years[y]));
}
writeFileSync('scripts/output/health-cost-scenarios.json', JSON.stringify(out, null, 1));
await server.close();
