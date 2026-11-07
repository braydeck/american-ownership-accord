// Quick check of the Healthcare Supplement in the engine: fiscal milestones and health lines.
// Run: node scripts/health-quick.mjs [rate]
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const rate = +(process.argv[2] ?? F.BASE_PARAMS.healthContributionRate);
for (const [label, d] of [['off', { healthSupplementOn: false }], [`on ${rate}`, { healthContributionRate: rate }]]) {
  const p = { ...F.BASE_PARAMS, ...d };
  const { rows, milestones } = F.runFiscalSimulation(p, 35);
  const pc = (r, k) => +((r[k] / r.nominalGdp) * 100).toFixed(2);
  console.log(label, JSON.stringify({ goal: milestones.fiscalGoalYear, nc: milestones.netCreditorYear, floor: milestones.debtFloorYear }));
  for (const y of [1, 2, 5, 10, 20, 35]) {
    const r = rows[y - 1];
    console.log(' ', y, JSON.stringify({ debt: r.debtToGdp, rev: pc(r, 'totalRev'), contrib: pc(r, 'healthContribution'), wage: pc(r, 'healthWageRev'),
      claw: pc(r, 'healthClawback'), trans: pc(r, 'healthEmployerTransition'), net: pc(r, 'healthNetOutlays'), imm: pc(r, 'healthImmigrantSpend'), mcare: pc(r, 'healthMedicareSavings'), labor: r.laborLevel }));
  }
}
await server.close();
