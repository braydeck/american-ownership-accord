// Healthcare Supplement figures at the site defaults (BASE_PARAMS), for doc Part 10, the engine
// spec and the About page. Fiscal lines are shares of nominal GDP; household lines are 2024 dollars.
// Writes scripts/output/health-findings.json. Run: node scripts/health-findings.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const HL = await server.ssrLoadModule('/src/lib/health.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');

const p = F.BASE_PARAMS;
const { rows } = F.runFiscalSimulation(p, 35);
const off = F.runFiscalSimulation({ ...p, healthSupplementOn: false }, 35).rows;
const r2 = v => Math.round(v * 100) / 100;
const pctGdp = (r, k) => r2(r[k] / r.nominalGdp * 100);
const YEARS = [1, 2, 6, 10, 20, 30, 35];

const fiscal = YEARS.map(y => {
  const r = rows[y - 1];
  const nhe = HL.nheShareOfGdp(y, p);
  return {
    year: y,
    fundSpend: pctGdp(r, 'healthFundSpend'), netOutlays: pctGdp(r, 'healthNetOutlays'),
    contribution: pctGdp(r, 'healthContribution'), convertedWageTaxes: pctGdp(r, 'healthWageRev'),
    stateClawback: pctGdp(r, 'healthClawback'), employerTransition: pctGdp(r, 'healthEmployerTransition'),
    paymentSavings: pctGdp(r, 'healthPaymentSavings'), adminSavings: pctGdp(r, 'healthAdminSavings'),
    medicareSavings: pctGdp(r, 'healthMedicareSavings'), immigrantCoverage: pctGdp(r, 'healthImmigrantSpend'),
    healthcareReserve: pctGdp(r, 'healthcareAMCF'),
    healthcareReserveRealB: Math.round(r.healthcareAMCF * 1e3 / r.priceLevel),
    // National health spending against the current-law path, both on current-law GDP.
    nhePctGdpCurrentLaw: r2(nhe.currentLaw * 100), nhePctGdpAccord: r2(nhe.accord * 100),
  };
});

const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const fxOf = q => ({ ...q, grants: F.realGrantSeries(q, 90), hh: F.householdFiscalSeries(q) });
const fx = fxOf(p), fxOff = fxOf({ ...p, healthSupplementOn: false });
const households = Object.fromEntries(['B10', 'P20', 'P40', 'P50', 'P70', 'P80', 'T10'].map(k => [k, Object.fromEntries([2, 10].map(y => {
  const h = H.healthLayer(k, y, fx, H.accordIncomeAt(k, y, ALL, fx));
  return [y, { newWages: Math.round(h.wages), premiumsAndCostSharingRemoved: Math.round(h.gain - h.wages),
    contributionAndTaxes: Math.round(h.tax), coverageValue: Math.round(h.coverage), net: Math.round(h.gain - h.tax + h.coverage) }];
}))]));
const gain = (f, k, y) => H.getInc(k, y, ALL, f).total - H.getInc(k, y, H.BASE_ONLY, f).total;
const avg = (f, ks) => { let s = 0, n = 0; for (const k of ks) for (let y = 1; y <= 30; y++) { s += gain(f, k, y); n++; } return Math.round(s / n); };
const HALF = ['B10', 'P10', 'P20', 'P30', 'P40'];

const out = {
  generated: new Date().toISOString().slice(0, 10),
  settings: { contributionRate: p.healthContributionRate, contributionExemptPerFiler: p.healthContribExempt, paymentLevel: p.healthPaymentLevel,
    paymentLevelCut: r2(HL.PAYMENT_LEVEL_CUT[p.healthPaymentLevel] * 100), adminSaving: r2(HL.ADMIN_SAVING[p.healthAdminSaving] * 100),
    capCutPerYear: p.healthCapCut, capScope: p.healthCapScope, costSharing: p.healthCostSharing },
  newlyCoveredLawfulResidents: Math.round(HL.HEALTH_2024.lawfulUninsured),
  fiscal,
  withoutSupplement: {
    debt35: { on: r2(rows[34].debtToGdp), off: r2(off[34].debtToGdp) },
    intToRev35: { on: rows[34].intToRev, off: off[34].intToRev },
    bottomHalfAvgGain1to30: { on: avg(fx, HALF), off: avg(fxOff, HALF) },
    bottom80AvgGain1to30: { on: avg(fx, E.BOTTOM_80), off: avg(fxOff, E.BOTTOM_80) },
  },
  households,
  unsourced: HL.UNSOURCED,
};
writeFileSync('scripts/output/health-findings.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await server.close();
