// Figures the canonical doc cites beyond accord-findings.json and health-findings.json, at the
// site defaults (BASE_PARAMS). Fiscal shares are of the Accord's nominal GDP; dollars marked
// real are 2024 dollars. Writes scripts/output/doc-figures.json.
// Run: node scripts/doc-figures.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const R = await server.ssrLoadModule('/src/lib/rent-taxes.js');

const p = F.BASE_PARAMS;
const { rows, milestones } = F.runFiscalSimulation(p, 75);
const row = y => rows.find(r => r.year === y);
const toYr1B = v => Math.round(v * row(1).nominalGdp * 1e12 / R.BASE_YEAR_GDP / 1e9);
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const within = (y0, y1) => rows.filter(r => r.year >= y0 && r.year <= y1);
const pctGdp = (r, v) => r2(v / r.nominalGdp * 100);

const revenue = y => {
  const r = row(y);
  return {
    year: y, total: pctGdp(r, r.totalRev), currentLaw: r2(r.clRev / r.clNominalGdp * 100),
    incomeTax: pctGdp(r, r.incomeTax), capGainsTax: pctGdp(r, r.capGainsTax), payrollTax: pctGdp(r, r.payrollTax),
    ssAboveCap: pctGdp(r, r.payrollFix), vat: pctGdp(r, r.vatGross), fat: pctGdp(r, r.fatRev), lvt: pctGdp(r, r.lvtRev),
    carbon: pctGdp(r, r.carbonRev), smallerRentTaxes: pctGdp(r, r.stableTaxRev), realization: pctGdp(r, r.realizationRev),
    otherTax: pctGdp(r, r.otherTax), healthContribution: pctGdp(r, r.healthContribution), healthConvertedWageTaxes: pctGdp(r, r.healthWageRev),
    healthStatePayments: pctGdp(r, r.healthClawback), healthEmployerTransition: pctGdp(r, r.healthEmployerTransition),
    rentTotal: pctGdp(r, r.lvtRev + r.carbonRev + r.stableTaxRev), vatPlusFat: pctGdp(r, r.vatGross + r.fatRev),
  };
};

const stressCase = over => {
  const s = F.runFiscalSimulation({ ...p, ...over }, 35);
  const hi = s.rows.filter(r => r.intToRev >= 10).map(r => r.year);
  return {
    fiscalGoalYear: s.milestones.fiscalGoalYear, debtY35: r1(s.rows[34].debtToGdp), clDebtY35: r1(s.rows[34].clDebtToGdp),
    peakDebt: r1(Math.max(...s.rows.map(r => r.debtToGdp))), interestAtOrAbove10Years: hi,
    maxIntToRev: r1(Math.max(...s.rows.map(r => r.intToRev))),
  };
};

const grants = F.realGrantSeries(p, 90), grantsNoImm = F.realGrantSeries({ ...p, abundanceFloorOn: false }, 90);
const grantAt = (s, t) => (s.find(([y]) => y === t) ?? [0, 0])[1];
const path = t => 1200 * 1.01 ** (t - 1);
const firstYear = test => rows.find(r => test(r.year))?.year ?? null;

const debtFallsEvery = (y0, y1) => within(y0 + 1, y1).every(r => r.debtToGdp < row(r.year - 1).debtToGdp);
const gd = within(1, 35).map(r => r.grossDebt / r.priceLevel);

const out = {
  generated: new Date().toISOString().slice(0, 10),
  prebate: {
    statutory: p.prebatePerCapita, realY1: Math.round(row(1).prebateRealPerCapita), realY35: Math.round(row(35).prebateRealPerCapita),
    indexShare: Object.fromEntries([1, 10, 20, 30, 35].map(y => [y, r2(row(y).prebateIndexNow)])),
    vatOffsetSpending: Math.round(p.prebatePerCapita / p.vatRate), costY1T: r2(row(1).prebateSpend),
    carbonDividendY1: Math.round(F.carbonDividendPerCapita(p.carbonRate)),
  },
  revenue: [1, 10, 30].map(revenue),
  ftt: { ratePct: R.RENT_TAX_DEFAULTS.fttPct, yr1RevB: toYr1B(R.fttRev(R.RENT_TAX_DEFAULTS.fttPct)), volumeRetention: +Math.exp(-R.FTT_VOLUME_DECAY * R.RENT_TAX_DEFAULTS.fttPct).toFixed(3),
    peakRatePct: +(1 / R.FTT_VOLUME_DECAY).toFixed(3), peakRevB: toYr1B(R.fttRev(1 / R.FTT_VOLUME_DECAY)) },
  smallRentTaxesYr1B: {
    fsl: toYr1B(R.fslRev(R.RENT_TAX_DEFAULTS.fslBps)), ftt: toYr1B(R.fttRev(R.RENT_TAX_DEFAULTS.fttPct)),
    royalty: toYr1B(R.royaltyRev(R.RENT_TAX_DEFAULTS.royaltyExtraPct)), spectrum: toYr1B(R.spectrumRev(R.RENT_TAX_DEFAULTS.spectrumPct)),
    water: +(R.waterRev(R.RENT_TAX_DEFAULTS.waterFeeAF) * row(1).nominalGdp * 1e12 / R.BASE_YEAR_GDP / 1e9).toFixed(2),
    methane: +(R.METHANE_FEE_REV * row(1).nominalGdp * 1e12 / R.BASE_YEAR_GDP / 1e9).toFixed(2),
    pollutionByYear: Object.fromEntries([1, 10, 20, 30].map(y => [y, Math.round(row(y).pollutionFeeRev * 1000)])),
    pollutionY1PctGdp: r2(row(1).pollutionFeeRev / row(1).nominalGdp * 100),
  },
  interest: {
    byYear: Object.fromEntries(within(1, 12).map(r => [r.year, r1(r.intToRev)])),
    maxThrough35: r1(Math.max(...within(1, 35).map(r => r.intToRev))), y20: r1(row(20).intToRev), y35: r1(row(35).intToRev),
    clY35: r1(row(35).clInterest / row(35).clRev * 100),
    brakeActiveYears: within(1, 75).filter(r => r.solventBrakeActive).map(r => r.year),
    maxThrough75: r1(Math.max(...rows.map(r => r.intToRev))),
  },
  debt: {
    fallsEveryYear1to35: debtFallsEvery(1, 35), fallsEveryYear1to75: debtFallsEvery(1, 75),
    peakThrough75: r1(Math.max(...rows.map(r => r.debtToGdp))),
    grossRealMinT: r1(Math.min(...gd)), grossRealMaxT: r1(Math.max(...gd)),
    netFinancialAssetsY75PctGdp: r1(-row(75).netSovPos / row(75).nominalGdp * 100),
    netSovPosY35PctGdp: r1(row(35).netSovPos / row(35).nominalGdp * 100),
    clDeficitRange1to35: [r1(Math.min(...within(1, 35).map(r => r.clDeficit / r.clNominalGdp * 100))), r1(Math.max(...within(1, 35).map(r => r.clDeficit / r.clNominalGdp * 100)))],
  },
  milestones,
  stress: { recessionYear5: stressCase({ recessionYear: 5 }), recessionYear12: stressCase({ recessionYear: 12 }), lowGrowth: stressCase({ growthCase: 'low' }) },
  grants: {
    perPersonReal: Object.fromEntries([1, 5, 10, 20, 30, 40, 50, 60].map(t => [t, grantAt(grants, t)])),
    noImmigration: Object.fromEntries([10, 30, 60].map(t => [t, grantAt(grantsNoImm, t)])),
    reachesPathYear: firstYear(t => grantAt(grants, t) >= path(t) - 1),
    abovePathYear: firstYear(t => t > 5 && grantAt(grants, t) > path(t) * 1.02),
  },
  population: Object.fromEntries([1, 30, 60, 75].map(y => [y, Math.round(row(y).population / 1e6)])),
  amcfOwnershipPct: Object.fromEntries([1, 5, 7, 10, 20, 30, 50, 75].map(y => [y, row(y).amcfOwnershipPct])),
  gdpVsCurrentLawPct: Object.fromEntries([1, 5, 10, 35].map(y => [y, r1((row(y).accordLevel - 1) * 100)])),
};

writeFileSync('scripts/output/doc-figures.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
await server.close();
