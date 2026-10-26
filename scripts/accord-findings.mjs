// Headline findings at the site defaults (BASE_PARAMS), for the About page and the canonical doc.
// Household figures are 2024 real dollars (household model); fiscal levels are nominal unless
// marked real. Writes scripts/output/accord-findings.json.
// Run: node scripts/accord-findings.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
const H = await server.ssrLoadModule('/src/lib/household-model.js');
const D = await server.ssrLoadModule('/src/lib/demographics.js');
const E = await server.ssrLoadModule('/scripts/lib/design-search-eval.js');

const p = F.BASE_PARAMS;
const fx = { ...p, grants: F.realGrantSeries(p, 90), hh: F.householdFiscalSeries(p) };
const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const CL = H.BASE_ONLY;
const { rows, milestones } = F.runFiscalSimulation(p, 75);
const row = y => rows.find(r => r.year === y);
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;

const fiscalAt = y => {
  const r = row(y);
  return {
    year: y, debtToGdp: r1(r.debtToGdp), clDebtToGdp: r1(r.clDebtToGdp), intToRev: r1(r.intToRev),
    revenuePctGdp: r1(r.totalRev / r.nominalGdp * 100), clRevenuePctGdp: r1(r.clRev / r.clNominalGdp * 100),
    deficitPctGdp: r1(r.deficit / r.nominalGdp * 100), clDeficitPctGdp: r1(r.clDeficit / r.clNominalGdp * 100),
    grossDebtRealT: r1(r.grossDebt / r.priceLevel), amcfOwnershipPct: r.amcfOwnershipPct, workerOwnershipPct: r.workerOwnershipPct,
    gdpVsCurrentLawPct: r1((r.accordLevel - 1) * 100),
  };
};
const peakDebt = rows.filter(r => r.year <= 75).reduce((a, r) => r.debtToGdp > a.debtToGdp ? r : a, rows[0]);

const revenueMix = y => {
  const r = row(y), g = r.nominalGdp, pct = v => r1(v / g * 100);
  return { year: y, incomeTax: pct(r.incomeTax), payrollTax: pct(r.payrollTax), payrollFix: pct(r.payrollFix), vat: pct(r.vatGross), fat: pct(r.fatRev),
    lvt: pct(r.lvtRev), carbon: pct(r.carbonRev), rentTaxes: pct(r.stableTaxRev), realization: pct(r.realizationRev), otherTax: pct(r.otherTax), total: pct(r.totalRev) };
};

const stress = {
  recessionYear5: E.evaluate({ recessionYear: 5 }).fiscalGoalYear,
  recessionYear12: E.evaluate({ recessionYear: 12 }).fiscalGoalYear,
  lowGrowth: E.evaluate({ growthCase: 'low' }).fiscalGoalYear,
};

const YEARS = [1, 5, 10, 20, 30];
const personas = Object.fromEntries(D.DEMO_KEYS.map(k => [k, {
  label: D.DEMOS[k].label,
  income: Object.fromEntries(YEARS.map(y => [y, { accord: Math.round(H.getInc(k, y, ALL, fx).total), currentLaw: Math.round(H.getInc(k, y, CL, fx).total) }])),
  netWorth: Object.fromEntries(YEARS.map(y => [y, { accord: Math.round(H.getNW(k, y, ALL, fx).total), currentLaw: Math.round(H.getNW(k, y, CL, fx).total) }])),
}]));

const gain = (k, y) => H.getInc(k, y, ALL, fx).total - H.getInc(k, y, CL, fx).total;
const avgGain = (keys, y0, y1) => {
  let s = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (const k of keys) { s += gain(k, y); n++; }
  return Math.round(s / n);
};
const BOTTOM_HALF = ['B10', 'P10', 'P20', 'P30', 'P40'];
const minGain = k => { let m = Infinity, at = 0; for (let y = 1; y <= 35; y++) { const g = gain(k, y); if (g < m) { m = g; at = y; } } return { gain: Math.round(m), year: at }; };
const betterOffShare = y => r3(D.DEMO_KEYS.filter(k => gain(k, y) > 0).reduce((s, k) => s + D.POP[k], 0));
const firstAheadYear = k => { for (let y = 1; y <= 35; y++) if (gain(k, y) > 0) return y; return null; };

const gini = (fn, y) => H.computeGini(D.DEMO_KEYS.map(k => ({ v: Math.max(fn(k, y), 0), w: D.POP[k] })));
const ginis = Object.fromEntries([0, 10, 30].map(y => [y, {
  income: r3(gini((k, t) => H.getInc(k, t, ALL, fx).total, y)), incomeCurrentLaw: r3(gini((k, t) => H.getInc(k, t, CL, fx).total, y)),
  netWorth: r3(gini((k, t) => H.getNW(k, t, ALL, fx).total, y)), netWorthCurrentLaw: r3(gini((k, t) => H.getNW(k, t, CL, fx).total, y)),
}]));

const grantAt = t => (fx.grants.find(([y]) => y === t) ?? [0, 0])[1];
const accountAt = (birth, age) => { let b = 0; for (let a = 1; a <= age; a++) { const t = birth + a; b = b * 1.05 + (t >= 1 ? grantAt(t) : 0); } return Math.round(b); };

const out = {
  generated: new Date().toISOString().slice(0, 10),
  defaults: {
    incomeTax: { zeroUpTo: p.incomeTaxThreshold, topRate: p.incomeTaxHigh, topRateFrom: p.incomeTaxRiseEnd, riseShape: p.incomeTaxRiseShape },
    vatRate: p.vatRate, lvtRate: p.lvtRate, carbonRate: p.carbonRate, prebatePerCapita: p.prebatePerCapita, prebateIndex: p.prebateIndex,
    citizenFloorIndex: p.citizenFloorIndex, growthTaxRate: p.growthTaxRate, equityExciseRate: p.equityExciseRate,
    carbonDividendYear1: Math.round(F.carbonDividendPerCapita(p.carbonRate)),
  },
  milestones, stress,
  peakDebtToGdp: { year: peakDebt.year, pct: r1(peakDebt.debtToGdp) },
  fiscal: [1, 5, 7, 10, 20, 30, 35, 50, 75].map(fiscalAt),
  revenueMix: [1, 10, 30].map(revenueMix),
  households: {
    bottomHalfAvgGain1to30: avgGain(BOTTOM_HALF, 1, 30),
    bottom80AvgGain1to30: avgGain(E.BOTTOM_80, 1, 30),
    minGain: Object.fromEntries(['B10', 'P50', 'P70', 'P80', 'T10'].map(k => [k, minGain(k)])),
    firstAheadYear: Object.fromEntries(['T10', 'T1', 'BILL'].map(k => [k, firstAheadYear(k)])),
    betterOffShare: Object.fromEntries([1, 5, 10, 30].map(y => [y, betterOffShare(y)])),
  },
  ginis, personas,
  grants: {
    perPersonReal: Object.fromEntries([1, 10, 20, 30].map(y => [y, grantAt(y)])),
    accountAt18: { bornYear0: accountAt(0, 18), bornYear10: accountAt(10, 18), bornYear20: accountAt(20, 18) },
    accountAt25BornYear0: accountAt(0, 25),
    perPersonRealLong: Object.fromEntries([40, 50, 60, 80].map(y => [y, grantAt(y)])),
    // Same accumulation as the Lifetime Grants page: 90-year grant path, 5% real, full retention.
    cohorts: Object.fromEntries([['bornYear0', 0], ['bornYear10', 10], ['bornYear20', 20], ['age30AtStart', -30]].map(([key, birth]) => {
      let b = 0, paid = 0, at18 = null;
      for (let a = 1; a <= 60; a++) { const t = birth + a, g = t >= 1 ? grantAt(t) : 0; b = b * 1.05 + g; paid += g; if (a === 18) at18 = Math.round(b); }
      return [key, { at18: birth < 0 ? null : at18, at60: Math.round(b), grantedBy60: Math.round(paid) }];
    })),
    amcfCapYear: rows.find(r => r.amcfOwnershipPct >= 21)?.year ?? null,
  },
};
writeFileSync('scripts/output/accord-findings.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ milestones, stress, peak: out.peakDebtToGdp, households: out.households, ginis, grants: out.grants, fiscal: out.fiscal, revenueMix: out.revenueMix, defaults: out.defaults }, null, 1));
await server.close();
