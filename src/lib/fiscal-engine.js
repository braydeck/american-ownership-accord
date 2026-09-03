// Shared 35-year fiscal engine for the American Ownership Accord.
//
// Extracted from NationalBalanceSheet.jsx so every page runs the same model instead of
// keeping its own copy or a frozen table of outputs.
//
// UNITS: everything this module returns is NOMINAL. Rows carry `priceLevel` so callers
// that present 2024 real dollars (HouseholdImpact, Inequality) can deflate at the boundary:
// realValue = nominalValue / row.priceLevel. See realGrantSeries below.
import { lvtRevForFiscal, PREBATE_REDIRECTED, LAND_GROWTH_ELASTICITY } from '@/lib/land';
import { incomeTaxRevForFiscal, INCOME_TAX_DEFAULTS } from '@/lib/income-tax';

const BASE_PARAMS = {
  growthTaxRate:          0.21,   // canonical §1.1/§2.4: 21% on EV growth
  equityExciseRate:       0.042,  // canonical §6.2: 4.2%/yr → 21% worker equity in 5 yrs
  creditCapFrac:          0.20,
  vatRate:                0.04,   // canonical §3.1: 4% universal base
  lvtRate:                0.10,
  // Land Value Tax — bottom-up capitalized model (src/lib/land.js). Default scenario:
  // NO homeowner exemption, with the recovered revenue redirected into the prebate.
  lvtModel:               'capitalized', // 'capitalized' | 'legacy'
  lvtExemption:           0,             // 0 = no homeowner exemption; 500000 to restore it
  lvtGroundRentYield:     0.04,          // i — capitalization discount
  lvtLandElasticity:      LAND_GROWTH_ELASTICITY, // land-base growth vs nominal GDP (0.7 = suppressed)
  lvtAssessmentBasis:     'capitalized', // 'capitalized' | 'preTax'
  // Individual income tax — two-bracket bottom-up model (src/lib/income-tax.js):
  // a single/joint standard deduction, lowRate up to the threshold, highRate above it.
  incomeTaxLow:           INCOME_TAX_DEFAULTS.lowRate,
  incomeTaxHigh:          INCOME_TAX_DEFAULTS.highRate,
  incomeTaxThreshold:     INCOME_TAX_DEFAULTS.threshold,
  incomeTaxExemptSingle:  INCOME_TAX_DEFAULTS.exemptSingle,
  incomeTaxExemptJoint:   INCOME_TAX_DEFAULTS.exemptJoint,
  incomeTaxEtiTop:        INCOME_TAX_DEFAULTS.etiTop, // 0.15 Accord / 0.30 conventional
  carbonRate:             100,    // $/ton; Laffer peak ~$165/ton
  stableTaxFrac:          0.0076, // FTT + FSL + royalties + spectrum + water (% of GDP)
  prebatePerCapita:       PREBATE_REDIRECTED, // $6,250 — base $5,000 + redirected exemption revenue
  grantPhaseMultiplier:   1.0,
  startingEV:             50e12,
  amcfReturn:             0.07,
  dividendYield:          0.035,
  codetermBonus:          0.003,
  startingDebt:           36e12,
  startingGdp:            28e12,
  baseRealGdpGrowth:      0.025,
  inflationRate:          0.025,
  baseInterestRate:       0.035,
  interestReflexivity:    5,
  baselineSpendingFrac:   0.165,
  spendingEfficiencyGain: 0.0004,
  startingPopulation:     335e6,
  populationGrowthRate:   0.004,
  recessionYear:          0,
  recessionSeverity:      'severe',
};

const EV_COHORTS = [
  { growth: 0.010, share: 0.05 },
  { growth: 0.035, share: 0.20 },
  { growth: 0.065, share: 0.40 },
  { growth: 0.100, share: 0.25 },
  { growth: 0.150, share: 0.10 },
];

// ─── Recession scenarios ───────────────────────────────────────────────────
// profile: offsets from the trigger year → { ev: equity-value shock, gdp: pp off real growth }
// scar:    permanent reduction in potential output (CBO revised US potential down ~5% post-2008)
// recovery: share of the remaining cyclical gap closed each year once the shock window ends
const RECESSION_SCENARIOS = {
  none:     { label: "None", profile: {}, scar: 0, recovery: 0 },
  mild: {
    label: "Mild (2001 dot-com)",
    // S&P −13% (2001) / −23% (2002); real growth 1.0% then 1.7% against a ~2.5% trend
    profile: { 0: { ev: -0.12, gdp: -0.015 }, 1: { ev: -0.14, gdp: -0.008 } },
    scar: 0.01, recovery: 0.40,
  },
  moderate: {
    label: "Moderate (1990-91)",
    profile: { 0: { ev: -0.15, gdp: -0.025 }, 1: { ev: -0.03, gdp: -0.010 } },
    scar: 0.02, recovery: 0.40,
  },
  severe: {
    label: "Severe (2008 GFC)",
    // Equity trough in the crash year (S&P −37% in 2008, partial rebound in 2009);
    // output trough one year later (real GDP +0.1% in 2008, −2.6% in 2009 vs 2.5% trend)
    profile: { 0: { ev: -0.40, gdp: -0.024 }, 1: { ev: 0.08, gdp: -0.051 }, 2: { gdp: -0.010 } },
    scar: 0.05, recovery: 0.35,
  },
  // A 1929-33 profile is deliberately omitted. The model has no fiscal reaction function, so
  // it runs 30 years of depression with no rate, tax, or spending response — the result says
  // more about that omission than about the Accord.
};

// Revenue cyclicality, per line, as an elasticity to the cyclical output gap.
// Anything unlisted is 1.0 (falls one-for-one with output).
// Capital gains realizations fell ~70% in 2009; land is the epicentre asset in a
// credit crisis but assessments lag, so LVT keys off the prior year's gap.
const REV_ELASTICITY = { incomeTax: 1.8, capGains: 5.0, payroll: 1.0, vat: 0.7, lvt: 2.0 };

// Current-law receipts mix (share of the 17.4%-of-GDP total) and its own cyclicality.
// Corporate receipts fell 55% in FY2009 — current law's most volatile line, and one
// the Accord does not have; its equity-side hit runs through the Growth Tax instead.
const CL_REV_MIX = [
  { share: 0.50, elasticity: 1.8 },  // individual income
  { share: 0.36, elasticity: 1.0 },  // payroll
  { share: 0.07, elasticity: 6.0 },  // corporate
  { share: 0.07, elasticity: 1.0 },  // excise, customs, estate, other
];

// Automatic stabilizers (UI, SNAP) surge under current law: FY2009 outlays hit 24.4% of
// GDP vs 20.2% in FY2008 against a ~5% output gap. The Accord's equivalent is endogenous —
// budgetGrantCost already rises as AMCF cash flow falls short of the grant floor.
const CL_STABILIZER_ELASTICITY = 0.30;

// Growth Tax loss-recovery window, in years (canonical §1.1: "rolling 3-year high-water mark").
const GROWTH_TAX_HWM_YEARS = 3;

// Ownership ceilings, canonical §5.2 and §"Meidner": the AMCF caps at 21% and worker equity
// caps at 21%, so combined public ownership is 42% and private shareholders keep 58% forever.
// The 21% Growth Tax rate equals the AMCF cap by design — §1.9 depends on private shareholders
// capturing the same 79% of marginal growth whether via scrip issuance or via appreciation.
const AMCF_OWNERSHIP_CAP = 0.21;
const WORKER_EQUITY_CAP  = 0.21;

function grantFloor(yr, mult) {
  // Minimum grant per capita by phase; $1,200 is the floor from Year 14 onward
  const base = yr <= 3 ? 500 : yr <= 6 ? 550 : yr <= 13 ? 800 : 1200;
  return base * mult;
}

function runFiscalSimulation(p) {
  const rows = [];
  let amcfEquity = 0, creditBalance = 0, hasReachedCap = false;
  let workerEquity = 0, workerHasReachedCap = false;
  let grossDebt = p.startingDebt;
  let realGdp = p.startingGdp;
  let priceLevel = 1.0;
  let pop = p.startingPopulation;
  let cohortEVs = EV_COHORTS.map(c => c.share * p.startingEV);
  let prevTotalEV = p.startingEV;
  let evHistory = [p.startingEV];

  // Recession bookkeeping — trend paths are the no-shock counterfactual; scarLevel is the
  // permanent hit to potential output, so the cyclical gap driving revenue elasticity
  // closes over the recovery even though the level never returns to the old trend.
  const rec = RECESSION_SCENARIOS[p.recessionSeverity] ?? RECESSION_SCENARIOS.severe;
  let trendGdp = p.startingGdp;
  let clTrendGdp = p.startingGdp;
  let scarLevel = 0;
  let prevCycGap = 0;

  // Parallel current-law path
  let clDebt = p.startingDebt;
  let clRealGdp = p.startingGdp;
  let clPriceLevel = 1.0;

  for (let yr = 1; yr <= 35; yr++) {
    const shockOffset = p.recessionYear > 0 ? yr - p.recessionYear : -1;
    const shock = shockOffset >= 0 ? rec.profile[shockOffset] : undefined;
    const shockWindow = Object.keys(rec.profile).length;
    const inShockWindow = shockOffset >= 0 && shockOffset < shockWindow;
    // Ownership fractions at start of year — one-way: once a cap is reached it stays reached.
    // The AMCF and the worker Phantom Equity Fund cap independently at 21% each, so combined
    // public ownership settles at 42% and private shareholders retain 58% permanently.
    const prevOwnershipFrac = prevTotalEV > 0 ? amcfEquity / prevTotalEV : 0;
    if (!hasReachedCap && prevOwnershipFrac >= AMCF_OWNERSHIP_CAP) hasReachedCap = true;
    const atCap = hasReachedCap;

    const prevWorkerFrac = prevTotalEV > 0 ? workerEquity / prevTotalEV : 0;
    if (!workerHasReachedCap && prevWorkerFrac >= WORKER_EQUITY_CAP) workerHasReachedCap = true;
    const workerAtCap = workerHasReachedCap;

    // EV cohort evolution
    cohortEVs = cohortEVs.map((ev, i) => ev * (1 + EV_COHORTS[i].growth));
    if (shock?.ev) cohortEVs = cohortEVs.map(ev => ev * (1 + shock.ev));
    const totalEV = cohortEVs.reduce((a, b) => a + b, 0);
    // Rolling high-water mark: the Growth Tax applies only to enterprise value above the
    // highest level of the last GROWTH_TAX_HWM_YEARS years, so a post-crash rebound that
    // merely restores prior value is not taxed as new growth. Without it a 40% crash
    // produces a windfall the year after, because growth is measured off the depressed base.
    // The window is rolling rather than permanent so a single crash does not exempt a
    // company forever once the loss is well behind it.
    const hwm = Math.max(prevTotalEV, ...evHistory);
    const evGrowth = Math.max(0, totalEV - hwm);
    evHistory.push(totalEV);
    if (evHistory.length > GROWTH_TAX_HWM_YEARS) evHistory.shift();
    const evAppreciation = prevTotalEV > 0 ? totalEV / prevTotalEV : 1;
    prevTotalEV = totalEV;

    // Growth Tax — zero once the AMCF hits its cap; company obligation discharged
    const growthTax = atCap ? 0 : evGrowth * p.growthTaxRate;

    // Equity Excise — issues new PSUs worth equityExciseRate of EV each year until worker
    // ownership reaches its cap, then stops. Existing PSUs appreciate with the market, so
    // the worker ownership fraction rises by exactly equityExciseRate per year: 4.2% a year
    // reaches the 21% cap in five years. The excise reactivates in the proposal when
    // departing workers cash out and PSUs return to the pool; that churn is not modelled here.
    const equityExcise = workerAtCap ? 0 : totalEV * p.equityExciseRate;
    workerEquity = workerAtCap
      ? totalEV * WORKER_EQUITY_CAP
      : workerEquity * evAppreciation + equityExcise;
    const workerOwnershipPct = totalEV > 0 ? workerEquity / totalEV : 0;
    const creditGenerated = equityExcise;
    const maxCreditUse = growthTax * p.creditCapFrac;
    const available = creditBalance + creditGenerated;
    const creditUsed = Math.min(available, maxCreditUse);
    creditBalance = available - creditUsed;
    const amcfNetScrip = growthTax - creditUsed;

    // AMCF accumulation — Phase 1: scrip-driven; Phase 2: tracks its cap share of EV organically
    if (atCap) {
      amcfEquity = totalEV * AMCF_OWNERSHIP_CAP; // appreciates with the market; no new scrip
    } else {
      amcfEquity = amcfEquity * (1 + p.amcfReturn) + amcfNetScrip;
    }
    const amcfOwnershipPct = totalEV > 0 ? amcfEquity / totalEV : 0;

    // AMCF Cash Flow: dividends + proportional buyback participation
    // Combined yield ramps from 3.5% → 6% over 20 years
    // (div 1.5%→4% + buyback ~2% = 3.5%→6%)
    const combinedYield = 0.035 + (0.06 - 0.035) * Math.min(yr / 20, 1.0);
    const amcfCashFlow = amcfEquity * combinedYield;

    // Grant floor (phase schedule — minimum commitment, SPV-bridged if AMCF falls short)
    const floorPerCap = grantFloor(yr, p.grantPhaseMultiplier) * priceLevel;
    const grantAllocation = amcfCashFlow * 0.65; // 65% of cash flow to citizens
    const grantFloorTotal = floorPerCap * pop;
    const grantsTotal = Math.max(grantAllocation, grantFloorTotal);
    const grantsPerCapita = grantsTotal / pop;
    const budgetGrantCost = Math.max(0, grantFloorTotal - grantAllocation); // SPV bridge when floor > allocation

    // GDP + Population
    const prevNomGdp = realGdp * priceLevel;
    const debtDragRatio = grossDebt / prevNomGdp;
    const gdpDrag = 0.002 * Math.max(0, debtDragRatio - 1.0);
    const codetermEffect = p.codetermBonus * Math.min(yr / 10, 1.0);
    const trendGrowth = p.baseRealGdpGrowth + codetermEffect - gdpDrag;
    const gdpGrowth = trendGrowth + (shock?.gdp ?? 0);

    // Trend = no-shock counterfactual; potential = trend less the permanent scar.
    // The scar phases in across the shock window, then output recovers toward potential.
    trendGdp *= (1 + trendGrowth);
    if (inShockWindow) scarLevel += rec.scar / shockWindow;
    const potentialGdp = trendGdp * (1 - scarLevel);
    realGdp *= (1 + gdpGrowth);
    if (!inShockWindow) realGdp += (potentialGdp - realGdp) * rec.recovery;
    realGdp = Math.min(realGdp, potentialGdp);

    const cycGap = Math.max(0, 1 - realGdp / potentialGdp);
    // Revenue lines already fall 1-for-1 with output because they are GDP-scaled, so el()
    // applies only the EXCESS elasticity above 1. VAT's 0.7 lifts it (consumption is
    // smoother than output); LVT keys off the prior year's gap because assessments lag.
    const el = line => Math.max(0, 1 - ((REV_ELASTICITY[line] ?? 1.0) - 1) * cycGap);
    const elLvt = Math.max(0, 1 - (REV_ELASTICITY.lvt - 1) * prevCycGap);

    priceLevel *= (1 + p.inflationRate);
    const nominalGdp = realGdp * priceLevel;
    // Spending commitments are rigid in dollars, so they are sized off the pre-shock trend
    // rather than actual or scarred-potential output. Two artifacts this avoids: scaling by
    // actual GDP hands the budget an automatic spending cut in a downturn (FY2009 outlays
    // rose to 24.4% of GDP from 20.2% because dollar commitments did not shrink); scaling by
    // scarred potential pays a permanent dividend for a permanent depression, because
    // spending is a larger share of GDP than revenue. Entitlements do not shrink 5% because
    // potential output fell 5%.
    const trendNomGdp = trendGdp * priceLevel;
    pop *= (1 + p.populationGrowthRate);

    // Revenue — individual income (7.8% GDP, no corporate, bracket adj included),
    // VAT on 55% taxable base (food/housing/healthcare exempt) with compliance ramp,
    // LVT from the bottom-up capitalized land model, payroll donut-hole fix at 0.8% GDP.
    // Prebate is a SPENDING item, not a revenue deduction.
    const vatCompliance = Math.min(0.75 + 0.025 * (yr - 1), 0.90);
    const vatGross = nominalGdp * 0.55 * p.vatRate * vatCompliance * el('vat');
    const lvtRev = lvtRevForFiscal({
      rate: p.lvtRate, year: yr, nominalGdp,
      model: p.lvtModel, exemption: p.lvtExemption,
      assessmentBasis: p.lvtAssessmentBasis,
      groundRentYield: p.lvtGroundRentYield,
      landGrowthElasticity: p.lvtLandElasticity,
    }) * elLvt;
    // Carbon: Laffer peak ~$165/ton; natural decarbonization 2.5%/yr
    // Carbon is a tonnage base, not a GDP share, so it takes the full gap (US emissions
    // fell ~7% in 2009) rather than the excess-only multiplier the GDP-scaled lines use.
    // The $/ton rate indexes to CPI for the same reason the prebate does — a fixed nominal
    // rate is a real carbon-price cut every year, and the Laffer peak scales with it.
    const carbonRev = carbonRevenueAtRate(p.carbonRate) * priceLevel
      * Math.pow(0.975, yr - 1) * Math.max(0, 1 - cycGap);
    // Stable rent-based taxes: FTT + FSL + royalties + spectrum + water ≈ 0.76% GDP
    const stableTaxRev = nominalGdp * (p.stableTaxFrac ?? 0);
    const payrollFix = nominalGdp * 0.008;
    const capGainsTax = nominalGdp * 0.012 * el('capGains');
    const incomeTax = incomeTaxRevForFiscal({
      nominalGdp,
      lowRate: p.incomeTaxLow,
      highRate: p.incomeTaxHigh,
      threshold: p.incomeTaxThreshold,
      exemptSingle: p.incomeTaxExemptSingle,
      exemptJoint: p.incomeTaxExemptJoint,
      etiTop: p.incomeTaxEtiTop,
    }) * el('incomeTax');
    const payrollTax = nominalGdp * 0.054 * el('payroll');
    const otherTax = nominalGdp * 0.010;
    const totalRev = vatGross + lvtRev + carbonRev + stableTaxRev + payrollFix + capGainsTax + incomeTax + payrollTax + otherTax;

    // Spending — baselineSpendingFrac = primary federal (ex-interest, ex-dissolved welfare,
    // ex-new Accord programs). Prebate/childcare/family leave are explicit line items.
    // Interest reflexivity fires only above 120% D/Y (current starting level) to avoid
    // retroactively penalising existing debt at historically low coupon rates.
    const debtToGdp = grossDebt / nominalGdp;
    const effectiveRate = p.baseInterestRate + p.interestReflexivity * Math.max(0, debtToGdp - 1.20) / 100;
    const interest = grossDebt * effectiveRate;
    const spendFrac = Math.max(0.14, p.baselineSpendingFrac - p.spendingEfficiencyGain * yr);
    const baseSpend = trendNomGdp * spendFrac;
    // The prebate, childcare, and family leave are commitments in today's dollars, so they
    // index to CPI. Leaving them fixed in nominal terms inside a model whose revenue scales
    // with nominal GDP would quietly shrink them ~58% in real terms over 35 years.
    const popScale = pop / p.startingPopulation;
    const prebateSpend = p.prebatePerCapita * pop * priceLevel;
    const childcareSpend = 100e9 * popScale * priceLevel;
    const familyLeaveSpend = 50e9 * popScale * priceLevel;

    // AMCF Distribution Waterfall
    // 10% Healthcare Reserve (spending offset) | 25% Debt Reduction OR Discretionary | 65% Citizen Grants
    const healthcareAMCF = amcfCashFlow * 0.10;
    // intToRev computed before waterfall; healthcare offset reduces effective spending first
    const totalSpend = baseSpend + budgetGrantCost + prebateSpend + childcareSpend + familyLeaveSpend - healthcareAMCF;
    const totalOutlays = totalSpend + interest;
    const intToRev = totalRev > 0 ? (interest / totalRev) * 100 : 0;
    const solventBrakeActive = intToRev > 10;
    const debtReductionAMCF = solventBrakeActive ? amcfCashFlow * 0.25 : 0;
    const discretionaryAMCF = solventBrakeActive ? 0 : amcfCashFlow * 0.25;

    // Deficit + Debt — discretionary supplements the budget; debt reduction retires bonds directly
    const deficit = totalOutlays - totalRev - discretionaryAMCF;
    grossDebt = grossDebt + deficit - debtReductionAMCF;
    const netSovPos = grossDebt - amcfEquity;

    // Current Law parallel path — takes the same macro shock, on its own (more cyclical)
    // revenue mix, so the recession comparison is symmetric rather than Accord-only.
    clTrendGdp *= (1 + p.baseRealGdpGrowth);
    clRealGdp *= (1 + p.baseRealGdpGrowth + (shock?.gdp ?? 0));
    const clPotentialGdp = clTrendGdp * (1 - scarLevel);
    if (!inShockWindow) clRealGdp += (clPotentialGdp - clRealGdp) * rec.recovery;
    clRealGdp = Math.min(clRealGdp, clPotentialGdp);
    const clCycGap = Math.max(0, 1 - clRealGdp / clPotentialGdp);
    clPriceLevel *= (1 + p.inflationRate);
    const clNomGdp = clRealGdp * clPriceLevel;
    const clRevDamping = CL_REV_MIX.reduce(
      (a, m) => a + m.share * Math.max(0, 1 - (m.elasticity - 1) * clCycGap), 0);
    const clRev = clNomGdp * 0.174 * clRevDamping;
    const clDtG = clDebt / clNomGdp;
    // Cap at 10%: beyond this, a real sovereign would restructure/monetize before rates go higher
    const clRate = Math.min(p.baseInterestRate + p.interestReflexivity * Math.max(0, clDtG - 1.20) / 100, 0.10);
    const clInterest = clDebt * clRate;
    // CL primary spending ≈ 22% of GDP (includes welfare programs the Accord dissolves),
    // plus the automatic-stabilizer surge the Accord's standing grant floor replaces.
    const clTrendNomGdp = clTrendGdp * clPriceLevel;
    const clStabilizer = clTrendNomGdp * CL_STABILIZER_ELASTICITY * clCycGap;
    const clDeficit = clTrendNomGdp * 0.22 + clStabilizer + clInterest - clRev;
    clDebt += clDeficit;
    prevCycGap = cycGap;

    rows.push({
      year:            yr,
      nominalGdp:      +(nominalGdp / 1e12).toFixed(2),
      priceLevel:      +priceLevel.toFixed(4),
      totalEV:         +(totalEV / 1e12).toFixed(1),
      evGrowth:        +(evGrowth / 1e12).toFixed(2),
      growthTax:       +(growthTax / 1e12).toFixed(3),
      equityExcise:    +(equityExcise / 1e12).toFixed(2),
      creditGenerated: +(creditGenerated / 1e12).toFixed(2),
      creditUsed:      +(creditUsed / 1e12).toFixed(3),
      creditBalance:   +(creditBalance / 1e12).toFixed(2),
      amcfNetScrip:       +(amcfNetScrip / 1e12).toFixed(3),
      amcfEquity:         +(amcfEquity / 1e12).toFixed(2),
      amcfOwnershipPct:   +(amcfOwnershipPct * 100).toFixed(1),
      workerEquity:       +(workerEquity / 1e12).toFixed(2),
      workerOwnershipPct: +(workerOwnershipPct * 100).toFixed(1),
      combinedYield:      +(combinedYield * 100).toFixed(2),
      amcfCashFlow:       +(amcfCashFlow / 1e12).toFixed(3),
      amcfDividends:      +(amcfCashFlow / 1e12).toFixed(3), // alias for chart compatibility
      healthcareAMCF:     +(healthcareAMCF / 1e12).toFixed(3),
      debtReductionAMCF:  +(debtReductionAMCF / 1e12).toFixed(3),
      discretionaryAMCF:  +(discretionaryAMCF / 1e12).toFixed(3),
      solventBrakeActive: solventBrakeActive,
      grantsTotal:        +(grantsTotal / 1e12).toFixed(3),
      grantsPerCapita:    +grantsPerCapita.toFixed(0),
      budgetGrantCost:    +(budgetGrantCost / 1e12).toFixed(3),
      vatGross:        +(vatGross / 1e12).toFixed(2),
      lvtRev:          +(lvtRev / 1e12).toFixed(2),
      carbonRev:       +(carbonRev / 1e12).toFixed(2),
      stableTaxRev:    +(stableTaxRev / 1e12).toFixed(2),
      payrollFix:      +(payrollFix / 1e12).toFixed(2),
      capGainsTax:     +(capGainsTax / 1e12).toFixed(2),
      incomeTax:       +(incomeTax / 1e12).toFixed(2),
      payrollTax:      +(payrollTax / 1e12).toFixed(2),
      otherTax:        +(otherTax / 1e12).toFixed(2),
      totalRev:        +(totalRev / 1e12).toFixed(2),
      cycGap:          +(cycGap * 100).toFixed(2),
      clCycGap:        +(clCycGap * 100).toFixed(2),
      prebateSpend:    +(prebateSpend / 1e12).toFixed(2),
      childcareSpend:  +(childcareSpend / 1e12).toFixed(2),
      familyLeaveSpend:+(familyLeaveSpend / 1e12).toFixed(2),
      baseSpend:       +(baseSpend / 1e12).toFixed(2),
      interest:        +(interest / 1e12).toFixed(2),
      totalOutlays:    +(totalOutlays / 1e12).toFixed(2),
      deficit:         +(deficit / 1e12).toFixed(2),
      grossDebt:       +(grossDebt / 1e12).toFixed(1),
      debtToGdp:       +(debtToGdp * 100).toFixed(1),
      netSovPos:       +(netSovPos / 1e12).toFixed(1),
      intToRev:        +intToRev.toFixed(1),
      clDeficit:       +(clDeficit / 1e12).toFixed(2),
      clGrossDebt:     +(clDebt / 1e12).toFixed(1),
      clDebtToGdp:     +(clDtG * 100).toFixed(1),
      clRev:           +(clRev / 1e12).toFixed(2),
      clInterest:      +(clInterest / 1e12).toFixed(2),
    });
  }

  const m = {
    fiscalCrossoverYear:      rows.find(r => r.deficit < 0)?.year ?? null,
    interestThresholdYear:    rows.find(r => r.intToRev < 10)?.year ?? null,
    debtPeakYear:             rows.reduce((b, r) => r.grossDebt > b.grossDebt ? r : b, rows[0]).year,
    netCreditorYear:          rows.find(r => r.netSovPos < 0)?.year ?? null,
    amcfSelfFundingYear:      rows.find(r => r.amcfCashFlow * 0.65 >= r.grantsTotal)?.year ?? null,
    solvencyBrakeOffYear:     rows.find(r => !r.solventBrakeActive)?.year ?? null,
  };

  return { rows, milestones: m };
}

export {
  BASE_PARAMS, EV_COHORTS, RECESSION_SCENARIOS, REV_ELASTICITY, CL_REV_MIX,
  CL_STABILIZER_ELASTICITY, GROWTH_TAX_HWM_YEARS, AMCF_OWNERSHIP_CAP, WORKER_EQUITY_CAP,
  grantFloor, runFiscalSimulation,
};

// Carbon receipts at a given $/ton, in year-1 real dollars. 5 Gt base with a Laffer
// behavioral response that reaches zero emissions at $330/ton. The engine's carbonRev line
// uses this, so the dividend the household pages pay out cannot drift from the revenue the
// fiscal model collects. Omitting the (1 - rate/330) term overstates a $100/ton dividend by
// about 44%.
export function carbonRevenueAtRate(rate) {
  return rate * 5e9 * (1 - rate / 330);
}

// 80% of carbon receipts are returned as an equal per-capita dividend.
export function carbonDividendPerCapita(rate, pop = BASE_PARAMS.startingPopulation) {
  return carbonRevenueAtRate(rate) * 0.80 / pop;
}

// Household-received AMCF grant per person, deflated to year-0 (2024) real dollars.
// Year 0 is the current-law baseline and carries no grant.
export function realGrantSeries(params = BASE_PARAMS) {
  const { rows } = runFiscalSimulation(params);
  return [[0, 0], ...rows.map(r => [r.year, Math.round(r.grantsPerCapita / r.priceLevel)])];
}
