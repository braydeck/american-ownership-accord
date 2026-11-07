// Full optimizer conditions for one design in the optimizer's format, with the Healthcare Supplement.
// Run: node scripts/health-design-check.mjs '<design JSON>' <paymentLevel>
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const { stableRentFrac, RENT_TAX_DEFAULTS } = await server.ssrLoadModule('/src/lib/rent-taxes.js');
const x = JSON.parse(process.argv[2]), level = process.argv[3];
const b = x.fam === 'two' ? [[x.threshold, x.low], [Infinity, x.top]]
  : E.curveBrackets({ low: x.low, top: x.top, start: x.start, end: x.start * x.endRatio, shape: x.shape });
const des = { incomeTaxBrackets: b, incomeTaxLow: b[0][1], incomeTaxHigh: b.at(-1)[1], incomeTaxThreshold: b.at(-2)[0],
  incomeTaxExemptJoint: x.exemptJoint, incomeTaxExemptSingle: x.exemptJoint / 2, vatRate: x.vatRate, lvtRate: x.lvtRate,
  carbonRate: x.carbonRate, prebatePerCapita: x.prebate, prebateIndex: 0.75, citizenFloorIndex: x.floorIndex, fttPct: x.fttPct,
  stableTaxFrac: stableRentFrac({ ...RENT_TAX_DEFAULTS, fttPct: x.fttPct }),
  healthContributionRate: x.healthRate, healthPaymentLevel: level };
const r = E.evaluate(des);
const p80 = Math.min(...E.gainsTable(des, ['P80'], Array.from({ length: 35 }, (_, i) => i + 1)).P80.map(v => v.income));
const rec5 = E.evaluate({ ...des, recessionYear: 5 }), rec12 = E.evaluate({ ...des, recessionYear: 12 }), low = E.evaluate({ ...des, growthCase: 'low' });
const lr = F.runFiscalSimulation({ ...F.BASE_PARAMS, ...des }, 75).rows;
console.log(JSON.stringify({ goal: r.fiscalGoalYear, minInc: r.minIncomeGain, minNw: r.minNwGain, p80MinIncome: Math.round(p80),
  rec5: [rec5.fiscalGoalYear, rec5.bottom80Pass], rec12: [rec12.fiscalGoalYear, rec12.bottom80Pass], low: [low.fiscalGoalYear, low.bottom80Pass],
  netCreditor: F.runFiscalSimulation({ ...F.BASE_PARAMS, ...des }, 35).milestones.netCreditorYear,
  guardIntMax: Math.max(...lr.slice(34).map(q => q.intToRev)), debt35: lr[34].debtToGdp, debt75: lr[74].debtToGdp }));
await server.close();
