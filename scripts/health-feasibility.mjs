// Which optimizer condition the current default tax design fails, by health contribution rate.
// Run: node scripts/health-feasibility.mjs [paymentLevel=current]
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const level = process.argv[2] ?? 'current';
for (let r = 0; r <= 0.2401; r += 0.03) {
  const d = { healthContributionRate: +r.toFixed(2), healthPaymentLevel: level };
  const e = E.evaluate(d);
  const m = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...d }, 35);
  console.log(JSON.stringify({ rate: d.healthContributionRate, goal: e.fiscalGoalYear, nc: e.netCreditorYear, debt35: m.rows[34].debtToGdp,
    minInc: e.minIncomeGain, worstInc: e.worstIncome, minNw: e.minNwGain, worstNw: e.worstNw, P80Y30: e.P80Y30, labor10: e.laborLevelY10 }));
}
await server.close();
