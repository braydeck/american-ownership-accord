// Shared fiscal engine for the American Ownership Accord. Every page runs this model.
// Design decisions are recorded in docs/engine-spec-2026-10-07.md.
//
// UNITS: everything this module returns is NOMINAL. Year 0 is FY2025 and rows carry
// `priceLevel`, so pages that present real dollars deflate at the boundary:
// realValue = nominalValue / row.priceLevel. See realGrantSeries and householdFiscalSeries.
import { lvtRevForFiscal, LAND_GROWTH_ELASTICITY, LAND_SECTORS } from '@/lib/land';
import { incomeTaxSplitForFiscal, INCOME_TAX_DEFAULTS, accordSchedule, accordScheduleTax, accordMarginalRate,
  clMarginalRate, ssAboveCapBase, earnersPerFiler, SS_CAP_SNAPSHOT, SS_RATE, etiTopFloor, bracketPoints } from '@/lib/income-tax';
import { BRACKETS } from '@/lib/brackets';
import { STABLE_RENT_FRAC } from '@/lib/rent-taxes';
import { cboFiscalShares, CBO_REV_MIX_2026 } from '@/lib/cbo-baseline';

const BASE_PARAMS = {
  // ── Corporate base and the Growth Tax ──
  growthTaxRate:          0.21,   // canonical §1.1/§2.4: 21% on EV growth
  equityExciseRate:       0.042,  // canonical §6.2: 4.2%/yr → 21% worker equity in 5 yrs
  smallFirmEvShare:       0.08,   // share of corporate EV in Tier 1 firms (<$10M EV), outside the worker trust (assumption)
  creditCapFrac:          0.20,   // codetermination credits offset up to 20% of Growth Tax
  startingEvRatio:        2.4,    // EV/GDP at Year 0: 2015–25 average of nonfinancial equity + debt (Fed Z.1)
  // Financial corporations in the Growth Tax and worker trusts (decided 2026-10-18), on the market
  // value of their equity: $23.19T of financial-sector equity at end-2025 less $14.23T of ETF and
  // other investment-fund shares, which hold already-taxed companies (Fed Z.1). REITs are in;
  // cooperatives (mutual insurers, credit unions) have no shares and are out. Assumption: the
  // same payout yield as nonfinancial corporations.
  financialGrowthTaxOn:   true,
  financialEquityGdp:     0.295,
  revaluationOn:          true,   // one-time rise in corporate value from repealing the corporate tax
  revaluationPct:         0.18,   // central of +13% to +27% (1/(1−t), capital share of incidence)
  entrantShare:           0.015,  // new firms + net issuance as a share of EV per year (Bernstein & Arnott)
  payoutGdpStart:         0.062,  // dividends + net buybacks, % of GDP, Year 1
  payoutGdpMature:        0.082,  // by Year 20; below the ~8–9% cash-flow ceiling with no corporate tax
  // ── The AMCF ──
  citizenScripShare:      0.35,   // share of each year's Growth Tax scrip issued to citizens as units
  citizenFloor:           500,    // $/person/yr in units, CPI-indexed; topped up from the Treasury tranche
  unitSalesOn:            true,   // statutory sale of Treasury-tranche units to private investors
  unitSaleRate:           0.02,   // share of the Treasury tranche sold per year
  unitSaleDiscount:       0.05,   // closed-end-fund discount to NAV on sales
  citizensBuyFirst:       true,   // reinvested citizen dividends buy units offered for sale, at NAV, before private buyers
  privateUnitCap:         0.10,   // max share of fund NAV held by private (domestic-only) buyers; 1 = no cap
  privateUnitTerm:        15,     // years until a privately held unit is repurchased at NAV by the Treasury; 0 = permanent
  bankPostBrake:          false,  // false: Treasury-tranche cash is spent once the brake is off
  ceocOn:                 true,   // Care Economy Ownership Credit: Sectoral Fund deposits + enhanced AMCF grants (canonical §6.1C)
  pseuOn:                 true,   // Public Service and Federal Equity Units for government employees (canonical §7)
  pseuMultiple:           2,      // public employees' extra AMCF units, as a multiple of the citizen grant
  workerProfitShare:      1/3,    // share of the worker trust's dividends paid as cash profit-sharing to each company's current workers
  saleProceedsToDebt:     true,   // true: unit-sale proceeds (net of Treasury buybacks) always retire debt
  assetRateCreditBp:      1,      // bp off the Treasury's rate per point of GDP held in the Treasury tranche
  // ── Revenue ──
  // Default tax and transfer settings: design "21877 optimized, LVT 10%" (decided 2026-10-18,
  // docs/engine-spec-2026-10-07.md, "Income tax shape and the distributional goal").
  vatRate:                0.1478,
  // VAT base (decided 2026-10-16): personal consumption (~68% of GDP) less housing services
  // (owner-occupied imputed rent $2.50T and tenant rent $0.77T, 15.9% of PCE in 2025) and less
  // financial services and insurance ($1.69T), which the FAT taxes instead (BEA via FRED).
  vatBaseFrac:            0.514,
  vatNewHomesOn:          true,   // VAT on new residential construction at the full price, land included (decided 2026-10-16)
  fatOn:                  true,   // Financial Activities Tax on financial firms' profits plus pay (decided 2026-10-16)
  lvtRate:                0.10,
  lvtModel:               'capitalized', // 'capitalized' | 'legacy'
  lvtExemption:           0,             // 0 = no homeowner exemption; 500000 to restore it
  lvtGroundRentYield:     0.04,
  lvtLandElasticity:      LAND_GROWTH_ELASTICITY,
  lvtAssessmentBasis:     'capitalized',
  // Income tax: 0% up to $69K with no standard deduction, then a smooth rise to 59.85% at $248K
  // (thresholds rise with average wages). riseEnd at or below the threshold gives two rates.
  incomeTaxLow:           0,
  incomeTaxHigh:          0.5985,
  incomeTaxThreshold:     69_000,
  incomeTaxRiseEnd:       248_055,
  incomeTaxRiseShape:     2.452,
  incomeTaxExemptSingle:  0,
  incomeTaxExemptJoint:   0,
  incomeTaxEtiTop:        INCOME_TAX_DEFAULTS.etiTop,
  incomeTaxBrackets:      null,   // [[upper income bound, rate], ...]; null = the two-rate low/high/threshold form
  realizationOn:          true,   // gains realized at death and on gifts (incl. charitable), pledged-asset backstop (gaps item 3)
  ssUncapOn:              true,
  ssBackstopOn:           true,   // general revenue tops the OASDI trust funds up to 100% of a year's cost (decided 2026-10-16)   // 12.4% Social Security contribution on all income above the cap, no benefit credit (gaps item 1)
  carbonRate:             106,
  stableTaxFrac:          STABLE_RENT_FRAC,
  publicOptionRevenue:    0.0016, // % of GDP: higher taxable wages as premiums fall (Urban/CBO), phased Yrs 2–6
  // ── Spending ──
  prebatePerCapita:       7150,
  prebateIndex:           0.5,      // share of real GDP-per-person growth the prebate follows on top of CPI (0, 0.5, 1)
  citizenFloorIndex:      0.5,    // same, for the $500 citizen grant floor
  spendingAdjustment:     0,      // points of GDP added to CBO-based baseline spending (scenarios)
  rateSettingSavings:     0.0005, // % of GDP, phased Yrs 2–6 (Maryland all-payer result scaled)
  drugSavings:            0.001,  // % of GDP by Yr 5 (doc §12: $25–40B)
  patentBuyoutNet:        0,      // % of GDP; central 0 (range −0.3 to +0.4)
  spendingElasticity:     0.5,    // share of baseline spending that rises with Accord-created GDP
  // ── Growth and immigration ──
  growthCase:             'central', // 'low' | 'central' | 'high' one-time level effects by channel
  abundanceFloorOn:       true,
  abundanceTarget:        2.8,    // covered workers per Social Security beneficiary
  abundanceRampYears:     4,      // admissions reach the requirement in equal steps
  // ── Macro and debt ──
  startingDebt:           30.17e12, // debt held by the public, end FY2025 (CBO)
  startingGdp:            30.36e12, // FY2025 nominal GDP (CBO); Year-0 dollars
  baseRealGdpGrowth:      0.025,
  inflationRate:          0.025,
  baseInterestRate:       0.035,
  interestReflexivity:    3,      // bp per point of debt/GDP above the threshold (Dallas Fed, cited in doc)
  reflexivityThreshold:   1.0,    // debt held by the public / GDP
  startingPopulation:     341e6,
  populationGrowthRate:   0.004,
  recessionYear:          0,
  recessionSeverity:      'severe',
};

// Economic-assumption scenarios (canonical §11.0). Policy parameters are unchanged; only the
// macro, market and growth assumptions move.
const SCENARIO_PRESETS = {
  conservative: { growthCase: 'low', startingEvRatio: 2.0, payoutGdpStart: 0.055, payoutGdpMature: 0.07,
                  baseRealGdpGrowth: 0.018, spendingAdjustment: 0.005 },
  optimistic:   { growthCase: 'high', startingEvRatio: 2.9, payoutGdpStart: 0.07, payoutGdpMature: 0.085,
                  baseRealGdpGrowth: 0.03, spendingAdjustment: -0.005 },
};

// ─── Recession scenarios ───────────────────────────────────────────────────
// profile: offsets from the trigger year → { ev: equity-value shock, gdp: pp off real growth }
// scar:    permanent reduction in potential output (CBO revised US potential down ~5% post-2008)
// recovery: share of the remaining cyclical gap (output and valuation) closed each year
const RECESSION_SCENARIOS = {
  none:     { label: "None", profile: {}, scar: 0, recovery: 0 },
  mild: {
    label: "Mild (2001 dot-com)",
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
    profile: { 0: { ev: -0.40, gdp: -0.024 }, 1: { ev: 0.08, gdp: -0.051 }, 2: { gdp: -0.010 } },
    scar: 0.05, recovery: 0.35,
  },
};

const REV_ELASTICITY = { incomeTax: 1.8, capGains: 5.0, payroll: 1.0, vat: 0.7, lvt: 2.0 };

const CL_REV_TOTAL_2026 = Object.values(CBO_REV_MIX_2026).reduce((a, b) => a + b, 0);
const CL_REV_MIX = [
  { share: CBO_REV_MIX_2026.individual / CL_REV_TOTAL_2026, elasticity: 1.8 },
  { share: CBO_REV_MIX_2026.payroll    / CL_REV_TOTAL_2026, elasticity: 1.0 },
  { share: CBO_REV_MIX_2026.corporate  / CL_REV_TOTAL_2026, elasticity: 6.0 },
  { share: CBO_REV_MIX_2026.other      / CL_REV_TOTAL_2026, elasticity: 1.0 },
];
const CL_STABILIZER_ELASTICITY = 0.30;

const GROWTH_TAX_HWM_YEARS = 3;   // canonical §1.1: rolling 3-year high-water mark
const MAX_INTEREST_RATE = 0.10;   // both paths
const CARBON_DIVIDEND_SHARE = 0.80;
const AMCF_OWNERSHIP_CAP = 0.21;  // per company
const WORKER_EQUITY_CAP  = 0.21;
const HEALTHCARE_RESERVE_SHARE = 0.10;
// Care Economy Ownership Credit (canonical §6.1C fiscal table): $2,000 per FTE-equivalent a year
// into the Sectoral Wealth Fund for 24.9M FTE-equivalents (child and elder caregivers, SSDI
// recipients, full-time students, bridging unemployed). Caregivers and students get one extra
// citizen grant in AMCF units and SSDI recipients two: 37.8M extra grants a year.
const CEOC_DEPOSIT = 2000;
const CEOC_FTE = 24.9e6;
const CEOC_EXTRA_GRANTS = 37.8e6;
// State, local and federal civilian employees (canonical §7: ~20M state and local, ~3M federal).
const PUBLIC_EMPLOYEES = 23e6;
const BRAKE_THRESHOLD_PCT = 10;   // net interest as % of revenue
const FISCAL_GOAL_WINDOW = 75;    // years over which the fiscal goal must hold
const ASSET_CREDIT_PHASE_YEARS = 6; // the rate credit reaches maturing debt over ~6 years
// Gains realized at death and on gifts: Penn Wharton (2021) scores repealing step-up at
// +$146B over FY2022-31 at a 39.6% rate (~0.052% of GDP). Scaled to the Accord's 62.4% top
// rate (50% plus the 12.4% contribution), about 0.08% of GDP. Assumption: the $5M exclusion
// and the added gift and charitable realizations roughly offset.
const REALIZATION_GDP = 0.0008;
// OASDI trust funds (2026 Trustees Report, intermediate). Cost rate, % of taxable payroll:
// 15.37 in 2026, 16.2 in 2040 (CRR summary), 20.45 in 2085, 20.02 in 2100. Income rate: 12.91
// in 2026 to 13.45 in 2100. Reserves start at 151% of 2026 cost. Taxable payroll is 35% of GDP
// (FY2025: $1.32T of OASDI payroll tax at 12.4%).
const SS_COST_RATE = [[2026, 0.1537], [2040, 0.162], [2085, 0.2045], [2100, 0.2002]];
const SS_INCOME_RATE = [[2026, 0.1291], [2100, 0.1345]];
const SS_START_RATIO = 1.51;
const TAXABLE_PAYROLL_GDP = 0.35;
const SS_IMMIGRANT_COST_LAG = 45; // years from arrival to the full benefit cost of an immigrant cohort (assumption)
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};
const IMMIGRANT_REVENUE_FACTOR = 0.6; // CBO 2024: revenue per immigrant-GDP dollar vs average

// Dissolved programs (SNAP, refundable EITC and CTC, TANF, WIC), % of GDP, CBO Feb 2026.
function dissolvedProgramsFrac(yr) {
  const fy = 2025 + yr;
  const t = Math.min(1, Math.max(0, (fy - 2026) / 10));
  return 0.0069 + (0.00495 - 0.0069) * t;
}

const ramp = (yr, start, end) => Math.min(1, Math.max(0, (yr - start + 1) / (end - start + 1)));

// One-time level effects on real GDP by channel (docs/a5-a6-research-2026-10-07.md §5e).
const GROWTH_CHANNELS = {
  //                 low     central  high    phase-in years
  taxMix:          [-0.010,  0.005,   0.025,  12],
  codetermination: [ 0.000,  0.003,   0.015,   5],
  housing:         [ 0.000,  0.001,   0.010,  15],
  entrepreneurship:[ 0.000,  0.001,   0.005,  10],
};
// Labor supply responds to the tax and transfer system (replacing the fixed −0.2% channel).
// Substitution: hours follow the earnings-weighted net-of-tax wage, with income tax, payroll and
// the consumption taxes (VAT, carbon) in the wedge. Income effect: hours fall with the rise in
// after-tax income from transfers net of taxes. Elasticities [low case, central, high case]:
// substitution 0.3/0.2/0.1 and income −0.10/−0.05/0 (CBO 2012 review ranges; Bargain & Peichl
// and the 2024 publication-bias meta-analysis put intensive margins near 0.2). Output responds
// with the labor share, 0.65. Phased in over 5 years.
const LABOR_SUB_ELASTICITY = [0.30, 0.20, 0.10];
const LABOR_INC_ELASTICITY = [-0.10, -0.05, 0];
const LABOR_OUTPUT_SHARE = 0.65;
const LABOR_PHASE_YEARS = 5;
export const PCE_GDP_SHARE = 0.68; // personal consumption expenditures as a share of GDP (BEA)
// New residential construction: private residential fixed investment, $1.18T in 2025 (BEA),
// 3.9% of GDP. The VAT reaches housing by taxing new homes once, as New Zealand's GST does.
export const NEW_HOMES_GDP = 0.039;
// Financial Activities Tax: financial firms' profits plus pay (their value added), 7.6% of GDP
// (finance and insurance GDP $2.23T in 2024), taxed at the VAT rate times the share households
// buy (household financial services and insurance $1.69T of $2.23T, 76%). This stands in for
// the VAT the sector's margins escape.
export const FINANCE_VA_GDP = 0.076;
export const FAT_HOUSEHOLD_SHARE = 0.76;
// Share of household consumption the consumption taxes reach, for household burdens and the
// labor wedge: the VAT base, plus new homes and household financial services when they are taxed.
export function consumptionTaxCoverage(p) {
  return (p.vatBaseFrac + (p.vatNewHomesOn ? NEW_HOMES_GDP : 0)
    + (p.fatOn ? FINANCE_VA_GDP * FAT_HOUSEHOLD_SHARE : 0)) / PCE_GDP_SHARE;
}
const CL_EMPLOYEE_PAYROLL = 0.0765, CL_PAYROLL_ABOVE_CAP = 0.0145;
// Current-law marginal rates from the programs the prebate replaces, by bracket: the EITC
// phase-in (negative) at the bottom, then EITC and SNAP phase-outs. Assumption scaled to CBO
// (2012, 2016): low- and moderate-income workers face ~30% effective marginal rates, about a
// third from neither income nor payroll tax.
const CL_PROGRAM_MARGINAL = [-0.05, -0.02, 0.06, 0.08, 0.05, 0.02, 0, 0, 0, 0, 0, 0, 0, 0, 0];
function laborSupplyEffect(p, realIdx, gdpPcIdx, yr) {
  const i = GROWTH_CASE_INDEX[p.growthCase] ?? 1;
  const sched = accordSchedule({ brackets: p.incomeTaxBrackets ?? undefined,
    lowRate: p.incomeTaxLow, highRate: p.incomeTaxHigh, threshold: p.incomeTaxThreshold,
    riseEnd: p.incomeTaxRiseEnd, riseShape: p.incomeTaxRiseShape });
  const vatEff = p.vatRate * 0.9 * consumptionTaxCoverage(p);
  const carbonEff = carbonRevenueAtRate(p.carbonRate) * carbonDecayFactor(yr) / (PCE_GDP_SHARE * p.startingGdp * realIdx);
  const tc = vatEff + carbonEff;
  const prebate = p.prebatePerCapita * Math.pow(gdpPcIdx, p.prebateIndex ?? 0) / gdpPcIdx; // in snapshot-income terms
  const cdiv = carbonDividendPerCapita(p.carbonRate) * carbonDecayFactor(yr) / gdpPcIdx;
  // Filers above ETI_TOP_INCOME respond through the elasticity of taxable income in income-tax.js,
  // which already shrinks their base, so they are left out here.
  const topFloor = etiTopFloor(sched);
  let wSum = 0, sub = 0, inc = 0;
  BRACKETS.forEach((b, bi) => {
    const pts = bracketPoints(bi), mean = b.agi / b.filers;
    const ded = b.jFrac * p.incomeTaxExemptJoint + (1 - b.jFrac) * p.incomeTaxExemptSingle;
    for (const agi of pts) {
      if (agi > topFloor) continue;
      const w = b.agi * (1 - b.cgShare) * agi / mean / pts.length;
      const aboveCap = agi / earnersPerFiler(b.jFrac) > SS_CAP_SNAPSHOT;
      const pay = aboveCap ? CL_PAYROLL_ABOVE_CAP : CL_EMPLOYEE_PAYROLL;
      const ssExtra = p.ssUncapOn && aboveCap ? SS_RATE / 2 : 0;
      const nCL = (1 - clMarginalRate(agi, b.jFrac) - CL_PROGRAM_MARGINAL[bi] - pay) / (1 + pay);
      const nA = (1 - accordMarginalRate(agi, ded, sched) - pay - ssExtra) / (1 + pay + ssExtra) / (1 + tc);
      const taxDelta = accordScheduleTax(agi, ded, sched) - b.effCL * agi + tc * b.cRat * agi
        + (p.ssUncapOn ? SS_RATE * ssAboveCapBase(agi, b.jFrac) : 0);
      const dY = ((prebate + cdiv) * b.hhSz - taxDelta) / (agi * (1 - b.effCL - pay));
      wSum += w; sub += w * Math.log(Math.max(0.05, nA) / Math.max(0.05, nCL)); inc += w * dY;
    }
  });
  const dL = LABOR_SUB_ELASTICITY[i] * sub / wSum + LABOR_INC_ELASTICITY[i] * inc / wSum;
  return LABOR_OUTPUT_SHARE * dL * Math.min(1, yr / LABOR_PHASE_YEARS);
}
const GROWTH_CASE_INDEX = { low: 0, central: 1, high: 2 };

function growthLevelFactor(yr, growthCase) {
  const i = GROWTH_CASE_INDEX[growthCase] ?? 1;
  let level = 1;
  for (const ch of Object.values(GROWTH_CHANNELS)) level *= 1 + ch[i] * Math.min(1, yr / ch[3]);
  if (growthCase === 'high' && yr >= 20) level *= Math.pow(1.001, yr - 19);
  return level;
}

// Abundance Floor: extra immigrants (millions, cumulative) needed to hold `target` covered
// workers per Social Security beneficiary. Baseline ratio from the 2026 Trustees Report;
// 186M covered workers growing 0.3%/yr; 0.7 covered workers per immigrant. Admissions ramp to
// the requirement in equal steps over `rampYears`.
const SSA_RATIO_POINTS = [[2025, 2.6], [2035, 2.3], [2075, 1.9]];
function baselineWorkerRatio(fy) {
  const pts = SSA_RATIO_POINTS;
  if (fy <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (fy <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + (y1 - y0) * (fy - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}
function abundanceImmigrants(yr, p) {
  if (!p.abundanceFloorOn) return 0;
  const workers = 186e6 * Math.pow(1.003, yr);
  const beneficiaries = workers / baselineWorkerRatio(2025 + yr);
  const extraWorkers = Math.max(0, p.abundanceTarget * beneficiaries - workers);
  const required = extraWorkers / 0.7 / 1e6;
  return required * Math.min(1, yr / Math.max(1, p.abundanceRampYears));
}
const GDP_PER_MILLION_IMMIGRANTS = 0.0033; // CBO 2024 immigration-surge analysis, real GDP level

function citizenFloorPerCap(p, priceLevel) {
  return p.citizenFloor * priceLevel;
}

// horizon: years to project. 35 is the default for the fiscal pages; lifetime pages run 60–100.
function runFiscalSimulation(p, horizon = 35) {
  const rows = [];
  const rec = RECESSION_SCENARIOS[p.recessionSeverity] ?? RECESSION_SCENARIOS.severe;

  // Macro state. realGdpBase is output without the Accord's level effects; trendBase is the
  // no-shock counterfactual used to size rigid spending commitments.
  let realGdpBase = p.startingGdp, trendBase = p.startingGdp;
  let priceLevel = 1.0;
  let scarLevel = 0, prevCycGap = 0;
  let debt = p.startingDebt;
  let ssTrustFund = null, ssDepletionYear = null, ssBackstopStartYear = null;
  let creditBp = 0; // phased-in borrowing-cost credit, in rate units

  // Corporate value. Fundamental values grow with nominal GDP; market value = fundamental ×
  // valuation gap (recession shocks, recovering toward 1). Incumbents and entrants are pools.
  const ev0 = (p.startingEvRatio + (p.financialGrowthTaxOn ? p.financialEquityGdp : 0)) * p.startingGdp
    * (p.revaluationOn ? 1 + p.revaluationPct : 1);
  let fundInc = ev0, fundEnt = 0;
  let valGap = 1;
  let prevNomGdp = p.startingGdp, prevEvTotal = ev0;
  let histInc = [ev0], histEnt = [0];
  let fInc = 0, fEnt = 0;            // AMCF ownership fraction of each pool (per-company cap proxy)
  let workerEquity = 0, workerAtCap = false;
  let wefUnits = 0, wefPrice = 1; // Worker Equity Fund units outstanding (nominal) and unit price index
  let creditBalance = 0;

  // Claims on the AMCF: Treasury tranche, citizen units, private unit holders; plus a
  // diversified pool bought with reinvested citizen dividends.
  let tClaim = 0, cClaim = 0, pClaim = 0, diversified = 0;
  const privateCohorts = []; // private purchases by year, for term repurchase
  let selfFundingYear = null;

  // Current-law path
  let clDebt = p.startingDebt, clRealGdp = p.startingGdp, clTrend = p.startingGdp, clPriceLevel = 1.0;

  for (let yr = 1; yr <= horizon; yr++) {
    const shockOffset = p.recessionYear > 0 ? yr - p.recessionYear : -1;
    const shock = shockOffset >= 0 ? rec.profile[shockOffset] : undefined;
    const shockWindow = Object.keys(rec.profile).length;
    const inShockWindow = shockOffset >= 0 && shockOffset < shockWindow;

    // ── Output ──
    const prevDebtRatio = debt / prevNomGdp;
    const gdpDrag = 0.002 * Math.max(0, prevDebtRatio - 1.0);
    const trendGrowth = p.baseRealGdpGrowth - gdpDrag;
    trendBase *= (1 + trendGrowth);
    if (inShockWindow) scarLevel += rec.scar / shockWindow;
    const potentialBase = trendBase * (1 - scarLevel);
    realGdpBase *= (1 + trendGrowth + (shock?.gdp ?? 0));
    if (!inShockWindow) realGdpBase += (potentialBase - realGdpBase) * rec.recovery;
    realGdpBase = Math.min(realGdpBase, potentialBase);
    const cycGap = Math.max(0, 1 - realGdpBase / potentialBase);

    const immigrants = abundanceImmigrants(yr, p); // millions, cumulative
    const immLevel = 1 + GDP_PER_MILLION_IMMIGRANTS * immigrants;
    const trendRealIdx = trendBase / p.startingGdp;
    const trendPcIdx = trendRealIdx * p.startingPopulation
      / (p.startingPopulation * Math.pow(1 + p.populationGrowthRate, yr) + immigrants * 1e6);
    const laborLevel = 1 + laborSupplyEffect(p, trendRealIdx, trendPcIdx, yr);
    const growthLevel = growthLevelFactor(yr, p.growthCase) * laborLevel;
    const accordLevel = growthLevel * immLevel;
    const realGdp = realGdpBase * accordLevel;
    priceLevel *= (1 + p.inflationRate);
    const nominalGdp = realGdp * priceLevel;
    const trendNomGdpBase = trendBase * priceLevel; // rigid commitments are sized off the trend
    const pop = p.startingPopulation * Math.pow(1 + p.populationGrowthRate, yr) + immigrants * 1e6;
    const popScale = pop / p.startingPopulation;
    const gdpPcIdx = (realGdp / pop) / (p.startingGdp / p.startingPopulation);
    const nomGrowth = nominalGdp / prevNomGdp - 1;

    // ── Corporate value: incumbents and entrants ──
    const e = p.entrantShare;
    const fundTotalPrev = fundInc + fundEnt;
    const births = e * fundTotalPrev;
    fundInc = fundInc * (1 + nomGrowth - e);
    const entSurvivors = fundEnt * (1 + nomGrowth - e);
    fundEnt = entSurvivors + births;
    if (shock?.ev) valGap *= (1 + shock.ev);
    else if (!inShockWindow) valGap += (1 - valGap) * rec.recovery;
    const evInc = fundInc * valGap, evEnt = fundEnt * valGap, totalEV = evInc + evEnt;
    // Births enter with no AMCF stake, diluting the entrant pool's fraction.
    if (fundEnt > 0) fEnt = fEnt * entSurvivors / fundEnt;

    // Growth Tax per pool: 21% of value above the rolling high-water mark, until the fund
    // holds 21% of the pool. Entrants keep arriving, so the entrant pool keeps paying.
    const hwmInc = Math.max(...histInc), hwmEnt = Math.max(...histEnt);
    const taxInc = fInc < AMCF_OWNERSHIP_CAP ? p.growthTaxRate * Math.max(0, evInc - hwmInc) : 0;
    const taxEnt = fEnt < AMCF_OWNERSHIP_CAP ? p.growthTaxRate * Math.max(0, evEnt - hwmEnt) : 0;
    histInc.push(evInc); histEnt.push(evEnt);
    if (histInc.length > GROWTH_TAX_HWM_YEARS) histInc.shift();
    if (histEnt.length > GROWTH_TAX_HWM_YEARS) histEnt.shift();
    const growthTax = taxInc + taxEnt;
    const evGrowth = Math.max(0, totalEV - prevEvTotal);

    // Equity Excise and codetermination credits
    // Tier 2 and larger firms ($10M+ EV) fund a worker trust; Tier 1 firms pay into the Sectoral Fund instead.
    const trustEV = totalEV * (1 - p.smallFirmEvShare);
    const carriedWorker = workerEquity * (prevEvTotal > 0 ? totalEV / prevEvTotal : 1);
    // The excise stops at the cap within the year it is reached, so the trust never overshoots 21%.
    const equityExcise = workerAtCap ? 0 : Math.min(trustEV * p.equityExciseRate, Math.max(0, trustEV * WORKER_EQUITY_CAP - carriedWorker));
    workerEquity = workerAtCap ? trustEV * WORKER_EQUITY_CAP : carriedWorker + equityExcise;
    if (!workerAtCap && workerEquity >= trustEV * WORKER_EQUITY_CAP * (1 - 1e-9)) workerAtCap = true;
    const creditGenerated = equityExcise;
    const available = creditBalance + creditGenerated;
    const creditUsed = Math.min(available, growthTax * p.creditCapFrac);
    creditBalance = available - creditUsed;
    const netShare = growthTax > 0 ? (growthTax - creditUsed) / growthTax : 0;
    // Scrip raises the fund's fraction of each pool, never past the cap.
    const scripInc = Math.min(taxInc * netShare, Math.max(0, AMCF_OWNERSHIP_CAP - fInc) * evInc);
    const scripEnt = Math.min(taxEnt * netShare, Math.max(0, AMCF_OWNERSHIP_CAP - fEnt) * evEnt);
    const amcfNetScrip = scripInc + scripEnt;

    // ── AMCF claims ──
    const domesticBefore = fInc * evInc + fEnt * evEnt;
    diversified *= (1 + nomGrowth - e); // existing holdings are diluted by new issuance like the domestic stake
    const navBefore = domesticBefore + diversified;
    const claimsPrev = tClaim + cClaim + pClaim;
    if (claimsPrev > 0) {
      const k = navBefore / claimsPrev;
      tClaim *= k; cClaim *= k; pClaim *= k;
      for (const c of privateCohorts) c.value *= k;
    }
    fInc += evInc > 0 ? scripInc / evInc : 0;
    fEnt += evEnt > 0 ? scripEnt / evEnt : 0;
    const citizenScrip = amcfNetScrip * p.citizenScripShare;
    tClaim += amcfNetScrip - citizenScrip;
    cClaim += citizenScrip;
    // Citizen floor in units, topped up from the Treasury tranche.
    const floorTotal = citizenFloorPerCap(p, priceLevel) * Math.pow(gdpPcIdx, p.citizenFloorIndex ?? 0) * pop;
    const topUp = Math.min(Math.max(0, floorTotal - citizenScrip), tClaim);
    tClaim -= topUp; cClaim += topUp;
    // Enhanced grants (care credit, public-employee units) are issued from the Treasury tranche,
    // like the floor top-up, at the same per-person grant as every citizen receives.
    const grantPerCap = (citizenScrip + topUp) / pop;
    const ceocGrants = p.ceocOn ? CEOC_EXTRA_GRANTS * popScale : 0;
    const pseuGrants = p.pseuOn ? p.pseuMultiple * PUBLIC_EMPLOYEES * popScale : 0;
    const extraUnits = Math.min(grantPerCap * (ceocGrants + pseuGrants), tClaim);
    const ceocUnits = ceocGrants + pseuGrants > 0 ? extraUnits * ceocGrants / (ceocGrants + pseuGrants) : 0;
    const pseuUnits = extraUnits - ceocUnits;
    tClaim -= extraUnits; cClaim += extraUnits;
    const citizenDeposit = citizenScrip + topUp + extraUnits;
    if (selfFundingYear == null && citizenScrip >= floorTotal) selfFundingYear = yr;

    // Cash: payouts are a share of GDP, paid as a yield on trend corporate value.
    const payoutGdp = p.payoutGdpStart + (p.payoutGdpMature - p.payoutGdpStart) * Math.min(yr / 20, 1);
    const combinedYield = payoutGdp / (p.startingEvRatio * (p.revaluationOn ? 1 + p.revaluationPct : 1));
    const nav = tClaim + cClaim + pClaim;
    const amcfCashFlow = nav * combinedYield;
    const cashT = nav > 0 ? amcfCashFlow * tClaim / nav : 0;
    const cashC = nav > 0 ? amcfCashFlow * cClaim / nav : 0;
    // Worker trust: shares stay in trust permanently, so the 21% stake is a permanent endowment.
    // Its dividends go to current workers: part as cash profit-sharing from their own company,
    // the rest as new Worker Equity Fund units by hours worked. Units are portable property,
    // pay cash dividends, and are diluted by new issuance like any existing holding.
    const workerDividends = workerEquity * combinedYield;
    const workerProfitShare = workerDividends * p.workerProfitShare;
    const workerUnitAccrual = workerDividends - workerProfitShare;
    wefPrice *= (1 + nomGrowth - e);
    wefUnits = wefUnits * (1 + nomGrowth - e) + workerUnitAccrual;
    // Units offered for sale (citizen withdrawals, then Treasury sales) go first to reinvested
    // citizen dividends when citizensBuyFirst is on, then to private buyers up to the cap.
    // Withdrawals the cap leaves unsold are bought by the Treasury tranche; Treasury sales stop.
    // Dividend cash not spent on units buys diversified assets. No company shares are sold.
    const liqRate = 0.375 * (0.5 + 0.5 * Math.exp(-yr / 15));
    const withdrawals = Math.min(cClaim + cashC, citizenDeposit * liqRate);
    let citizenCash = p.citizensBuyFirst ? cashC : 0;
    const citizenBuysW = Math.min(withdrawals, citizenCash);
    citizenCash -= citizenBuysW;
    // Units reaching the end of their term return to the Treasury tranche at NAV.
    let expiryBuyback = 0;
    if (p.privateUnitTerm > 0) {
      while (privateCohorts.length && yr - privateCohorts[0].year >= p.privateUnitTerm) {
        expiryBuyback += privateCohorts.shift().value;
      }
      expiryBuyback = Math.min(expiryBuyback, pClaim);
      pClaim -= expiryBuyback; tClaim += expiryBuyback;
    }
    const navNow = tClaim + cClaim + pClaim + cashC;
    let privateRoom = Math.max(0, p.privateUnitCap * navNow - pClaim);
    const privateBuysW = Math.min(withdrawals - citizenBuysW, privateRoom);
    privateRoom -= privateBuysW;
    const treasuryBuysW = withdrawals - citizenBuysW - privateBuysW;
    const unitsOffered = p.unitSalesOn ? tClaim * p.unitSaleRate : 0;
    const citizenBuysT = Math.min(unitsOffered, citizenCash);
    citizenCash -= citizenBuysT;
    const privateBuysT = Math.min(unitsOffered - citizenBuysT, privateRoom);
    const unitsSold = citizenBuysT + privateBuysT;
    const reinvested = cashC - citizenBuysW - citizenBuysT;
    cClaim += reinvested + citizenBuysT - withdrawals + citizenBuysW;
    diversified += reinvested;
    pClaim += privateBuysW + privateBuysT;
    tClaim += treasuryBuysW - unitsSold;
    if (privateBuysW + privateBuysT > 0) privateCohorts.push({ year: yr, value: privateBuysW + privateBuysT });
    const unitSaleProceeds = citizenBuysT + privateBuysT * (1 - p.unitSaleDiscount)
      - treasuryBuysW - expiryBuyback;
    const fundDomestic = fInc * evInc + fEnt * evEnt;
    const amcfOwnershipPct = totalEV > 0 ? fundDomestic / totalEV : 0;

    // ── Revenue ──
    const el = line => Math.max(0, 1 - ((REV_ELASTICITY[line] ?? 1.0) - 1) * cycGap);
    const elLvt = Math.max(0, 1 - (REV_ELASTICITY.lvt - 1) * prevCycGap);
    const vatCompliance = Math.min(0.75 + 0.025 * (yr - 1), 0.90);
    const vatGross = nominalGdp * (p.vatBaseFrac + (p.vatNewHomesOn ? NEW_HOMES_GDP : 0)) * p.vatRate * vatCompliance * el('vat');
    const fatRev = p.fatOn ? nominalGdp * FINANCE_VA_GDP * p.vatRate * FAT_HOUSEHOLD_SHARE * el('vat') : 0;
    const lvtRev = lvtRevForFiscal({
      rate: p.lvtRate, year: yr, nominalGdp,
      model: p.lvtModel, exemption: p.lvtExemption,
      assessmentBasis: p.lvtAssessmentBasis,
      groundRentYield: p.lvtGroundRentYield,
      landGrowthElasticity: p.lvtLandElasticity,
    }) * elLvt;
    const carbonRev = carbonRevenueAtRate(p.carbonRate) * priceLevel
      * carbonDecayFactor(yr) * Math.max(0, 1 - cycGap);
    const stableTaxRev = nominalGdp * (p.stableTaxFrac ?? 0);
    const incomeTaxSplit = incomeTaxSplitForFiscal({
      nominalGdp, brackets: p.incomeTaxBrackets ?? undefined,
      lowRate: p.incomeTaxLow, highRate: p.incomeTaxHigh, threshold: p.incomeTaxThreshold,
      riseEnd: p.incomeTaxRiseEnd, riseShape: p.incomeTaxRiseShape,
      exemptSingle: p.incomeTaxExemptSingle, exemptJoint: p.incomeTaxExemptJoint, etiTop: p.incomeTaxEtiTop,
      ssUncapOn: p.ssUncapOn,
    });
    // Social Security contribution above the cap (the former "payroll fix"), computed bottom-up.
    const payrollFix = incomeTaxSplit.ss * el('incomeTax');
    const incomeTax = incomeTaxSplit.ordinary * el('incomeTax');
    const capGainsTax = incomeTaxSplit.capGains * el('capGains');
    const payrollTax = nominalGdp * 0.054 * el('payroll');
    const otherTax = nominalGdp * 0.010;
    const realizationRev = p.realizationOn ? nominalGdp * REALIZATION_GDP : 0;
    const publicOptionRev = nominalGdp * p.publicOptionRevenue * ramp(yr, 2, 6);
    const grossRev = vatGross + fatRev + lvtRev + carbonRev + stableTaxRev + payrollFix + capGainsTax
      + incomeTax + payrollTax + otherTax + publicOptionRev + realizationRev;
    // Output added by immigrants is taxed at a lower average rate (CBO 2024).
    const immGdpShare = 1 - 1 / immLevel;
    const totalRev = grossRev * (1 - (1 - IMMIGRANT_REVENUE_FACTOR) * immGdpShare);

    // ── Spending ──
    const cbo = cboFiscalShares(yr);
    const baselineShare = cbo.noninterest - dissolvedProgramsFrac(yr) + p.spendingAdjustment
      - p.rateSettingSavings * ramp(yr, 2, 6) - p.drugSavings * Math.min(1, yr / 5) - p.patentBuyoutNet;
    const baseSpend = baselineShare * trendNomGdpBase * (1 + p.spendingElasticity * (accordLevel - 1));
    const prebateSpend = p.prebatePerCapita * Math.pow(gdpPcIdx, p.prebateIndex ?? 0) * pop * priceLevel;
    const childcareSpend = 100e9 * popScale * priceLevel;
    const familyLeaveSpend = 50e9 * popScale * priceLevel;
    const ceocSpend = p.ceocOn ? CEOC_DEPOSIT * CEOC_FTE * popScale * priceLevel : 0;
    const carbonDividendSpend = carbonRev * CARBON_DIVIDEND_SHARE;
    const healthcareAMCF = cashT * HEALTHCARE_RESERVE_SHARE; // spent on new health commitments
    const totalSpend = baseSpend + prebateSpend + childcareSpend + familyLeaveSpend + carbonDividendSpend + ceocSpend;

    // ── Interest ──
    const debtToGdp = debt / nominalGdp;
    const creditTarget = (p.assetRateCreditBp / 10000) * 100 * (tClaim / nominalGdp);
    creditBp += (creditTarget - creditBp) / ASSET_CREDIT_PHASE_YEARS;
    const effectiveRate = Math.min(MAX_INTEREST_RATE, Math.max(0.005,
      p.baseInterestRate + p.interestReflexivity * Math.max(0, debtToGdp - p.reflexivityThreshold) / 100 - creditBp));
    const interest = debt * effectiveRate;
    const totalOutlays = totalSpend + interest;
    const intToRev = totalRev > 0 ? (interest / totalRev) * 100 : 0;
    const solventBrakeActive = intToRev > BRAKE_THRESHOLD_PCT;

    // Treasury-tranche cash (90%) and unit-sale proceeds retire debt while the brake is on;
    // afterwards they go to the general budget, spent unless banked.
    const treasuryFlow = cashT * (1 - HEALTHCARE_RESERVE_SHARE) + unitSaleProceeds;
    const saleToDebt = p.saleProceedsToDebt ? unitSaleProceeds : 0;
    const debtReductionAMCF = solventBrakeActive ? treasuryFlow : saleToDebt;
    const discretionaryAMCF = solventBrakeActive ? 0 : treasuryFlow - saleToDebt;
    // Net Treasury purchases of units (cap overflow, term repurchases) are a cost even when spent.
    const deficit = totalOutlays - totalRev - (p.bankPostBrake ? discretionaryAMCF : Math.min(0, discretionaryAMCF));
    debt = debt + deficit - debtReductionAMCF;
    // OASDI trust funds: scheduled benefits stay in spending (CBO convention); the balance
    // shows whether they are payable under law. The contribution above the cap is credited
    // to the funds by statute. With the backstop on, general revenue tops the funds up to 100%
    // of the year's cost whenever they fall below it. The transfer is intragovernmental, so it
    // leaves the unified deficit unchanged.
    const fy = 2025 + yr;
    // Benefits follow wages, so the Accord's productivity effects raise cost along with payroll.
    // Extra immigrants pay in now and claim later: their share of cost phases in over 45 years.
    const ssCostGdp = potentialBase * priceLevel * growthLevel * (1 + (immLevel - 1) * Math.min(1, yr / SS_IMMIGRANT_COST_LAG));
    const ssCost = interp(SS_COST_RATE, fy) * TAXABLE_PAYROLL_GDP * ssCostGdp;
    if (ssTrustFund == null) ssTrustFund = SS_START_RATIO * ssCost;
    const ssIncome = interp(SS_INCOME_RATE, fy) * TAXABLE_PAYROLL_GDP * nominalGdp + payrollFix;
    ssTrustFund = ssTrustFund * (1 + effectiveRate) + ssIncome - ssCost;
    if (ssDepletionYear == null && ssTrustFund < 0) ssDepletionYear = yr;
    const ssGeneralTransfer = p.ssBackstopOn ? Math.max(0, ssCost - ssTrustFund) : 0;
    if (ssBackstopStartYear == null && ssGeneralTransfer > 0) ssBackstopStartYear = yr;
    ssTrustFund += ssGeneralTransfer;
    const netSovPos = debt - tClaim;

    // ── Current-law path ──
    clTrend *= (1 + p.baseRealGdpGrowth);
    clRealGdp *= (1 + p.baseRealGdpGrowth + (shock?.gdp ?? 0));
    const clPotential = clTrend * (1 - scarLevel);
    if (!inShockWindow) clRealGdp += (clPotential - clRealGdp) * rec.recovery;
    clRealGdp = Math.min(clRealGdp, clPotential);
    const clCycGap = Math.max(0, 1 - clRealGdp / clPotential);
    clPriceLevel *= (1 + p.inflationRate);
    const clNomGdp = clRealGdp * clPriceLevel;
    const clRevDamping = CL_REV_MIX.reduce((a, m) => a + m.share * Math.max(0, 1 - (m.elasticity - 1) * clCycGap), 0);
    const clRev = clNomGdp * cbo.revenue * clRevDamping;
    const clDtG = clDebt / clNomGdp;
    const clRate = Math.min(MAX_INTEREST_RATE,
      p.baseInterestRate + p.interestReflexivity * Math.max(0, clDtG - p.reflexivityThreshold) / 100);
    const clInterest = clDebt * clRate;
    const clTrendNom = clTrend * clPriceLevel;
    const clStabilizer = clTrendNom * CL_STABILIZER_ELASTICITY * clCycGap;
    const clDeficit = clTrendNom * cbo.noninterest + clStabilizer + clInterest - clRev;
    clDebt += clDeficit;

    prevCycGap = cycGap;
    prevNomGdp = nominalGdp;
    prevEvTotal = totalEV;

    const T = v => +(v / 1e12).toFixed(3);
    rows.push({
      year: yr,
      nominalGdp: T(nominalGdp), priceLevel: +priceLevel.toFixed(4), population: Math.round(pop),
      extraImmigrantsM: +immigrants.toFixed(2), growthLevel: +growthLevel.toFixed(4), accordLevel: +accordLevel.toFixed(4),
      totalEV: T(totalEV), evGrowth: T(evGrowth), growthTax: T(growthTax),
      equityExcise: T(equityExcise), creditGenerated: T(creditGenerated), creditUsed: T(creditUsed), creditBalance: T(creditBalance),
      amcfNetScrip: T(amcfNetScrip), citizenScrip: T(citizenScrip), citizenTopUp: T(topUp),
      amcfEquity: T(tClaim), treasuryEquity: T(tClaim), citizenEquity: T(cClaim), privateUnitEquity: T(pClaim),
      fundNav: T(tClaim + cClaim + pClaim), fundDomestic: T(fundDomestic),
      amcfOwnershipPct: +(amcfOwnershipPct * 100).toFixed(1),
      workerEquity: T(workerEquity), workerDividends: T(workerDividends), workerProfitShare: T(workerProfitShare),
      workerUnitAccrual: T(workerUnitAccrual), wefUnits: T(wefUnits), wefPriceReal: +(wefPrice / priceLevel).toFixed(4), workerOwnershipPct: +((totalEV > 0 ? workerEquity / totalEV : 0) * 100).toFixed(1),
      combinedYield: +(combinedYield * 100).toFixed(2),
      amcfCashFlow: T(amcfCashFlow), amcfDividends: T(amcfCashFlow), treasuryCash: T(cashT),
      healthcareAMCF: T(healthcareAMCF), ssGeneralTransfer: T(ssGeneralTransfer), ssTrustFund: T(ssTrustFund), ssIncome: T(ssIncome), ssCost: T(ssCost), ssTrustFundRatio: +(ssTrustFund / ssCost * 100).toFixed(0), debtReductionAMCF: T(debtReductionAMCF), discretionaryAMCF: T(discretionaryAMCF),
      unitSaleProceeds: T(unitSaleProceeds), citizenWithdrawals: T(withdrawals),
      citizenUnitPurchases: T(citizenBuysW + citizenBuysT), treasuryUnitPurchases: T(treasuryBuysW), expiryBuyback: T(expiryBuyback),
      privateUnitPct: +((tClaim + cClaim + pClaim) > 0 ? pClaim / (tClaim + cClaim + pClaim) * 100 : 0).toFixed(1),
      solventBrakeActive,
      grantsTotal: T(citizenDeposit), grantsPerCapita: +grantPerCap.toFixed(0), budgetGrantCost: 0,
      ceocSpend: T(ceocSpend), ceocUnits: T(ceocUnits), pseuUnits: T(pseuUnits),
      vatGross: T(vatGross), fatRev: T(fatRev), lvtRev: T(lvtRev), carbonRev: T(carbonRev), stableTaxRev: T(stableTaxRev),
      payrollFix: T(payrollFix), realizationRev: T(realizationRev), gdpPerCapIdx: +gdpPcIdx.toFixed(4), laborLevel: +laborLevel.toFixed(4), capGainsTax: T(capGainsTax), incomeTax: T(incomeTax), payrollTax: T(payrollTax),
      otherTax: T(otherTax), publicOptionRev: T(publicOptionRev), totalRev: T(totalRev),
      cycGap: +(cycGap * 100).toFixed(2), clCycGap: +(clCycGap * 100).toFixed(2),
      prebateSpend: T(prebateSpend), carbonDividendSpend: T(carbonDividendSpend), childcareSpend: T(childcareSpend),
      familyLeaveSpend: T(familyLeaveSpend), baseSpend: T(baseSpend), interest: T(interest), effectiveRate: +(effectiveRate * 100).toFixed(2),
      totalOutlays: T(totalOutlays), deficit: T(deficit),
      grossDebt: +(debt / 1e12).toFixed(2), debtToGdp: +(debt / nominalGdp * 100).toFixed(1),
      netSovPos: +(netSovPos / 1e12).toFixed(2), intToRev: +intToRev.toFixed(1),
      clDeficit: T(clDeficit), clGrossDebt: +(clDebt / 1e12).toFixed(1), clDebtToGdp: +(clDtG * 100).toFixed(1),
      clRev: T(clRev), clInterest: T(clInterest),
    });
  }

  // Fiscal goal (decided 2026-10-16): net interest under 10% of revenue and debt/GDP falling,
  // held in every later year of a 75-year window. "Falling" compares each year with five years
  // earlier so a recession's temporary rise does not reset the goal; debt at or below zero passes.
  const longRun = horizon >= FISCAL_GOAL_WINDOW ? null : runFiscalSimulation(p, FISCAL_GOAL_WINDOW);
  const goalRows = longRun?.rows ?? rows;
  const goalOk = goalRows.map((r, i) => r.intToRev < BRAKE_THRESHOLD_PCT
    && (r.grossDebt <= 0 || r.debtToGdp <= goalRows[Math.max(0, i - 5)].debtToGdp));
  let fiscalGoalYear = null;
  for (let i = goalOk.length - 1; i >= 0 && goalOk[i]; i--) fiscalGoalYear = goalRows[i].year;

  // ssDepletionYear: first year the funds would run out without the backstop.
  // ssBackstopStartYear: first year general revenue tops them up (backstop on).
  const ssDepletion = longRun ? longRun.milestones.ssDepletionYear : ssDepletionYear;
  const ssBackstopStart = longRun ? longRun.milestones.ssBackstopStartYear : ssBackstopStartYear;

  const m = {
    fiscalGoalYear,
    ssDepletionYear: ssDepletion,
    ssBackstopStartYear: ssBackstopStart,
    fiscalCrossoverYear:   rows.find(r => r.deficit < 0)?.year ?? null,
    interestThresholdYear: rows.find(r => r.intToRev < BRAKE_THRESHOLD_PCT)?.year ?? null,
    debtPeakYear:          rows.reduce((b, r) => r.grossDebt > b.grossDebt ? r : b, rows[0]).year,
    netCreditorYear:       rows.find(r => r.netSovPos < 0)?.year ?? null,
    amcfSelfFundingYear:   selfFundingYear,
    solvencyBrakeOffYear:  rows.find(r => !r.solventBrakeActive)?.year ?? null,
    debtFreeYear:          rows.find(r => r.grossDebt < 0)?.year ?? null,
  };
  return { rows, milestones: m };
}

export {
  BASE_PARAMS, SCENARIO_PRESETS, RECESSION_SCENARIOS, REV_ELASTICITY, CL_REV_MIX,
  CL_STABILIZER_ELASTICITY, GROWTH_TAX_HWM_YEARS, AMCF_OWNERSHIP_CAP, WORKER_EQUITY_CAP,
  GROWTH_CHANNELS, runFiscalSimulation, abundanceImmigrants, growthLevelFactor,
  CEOC_DEPOSIT, CEOC_FTE, CEOC_EXTRA_GRANTS, PUBLIC_EMPLOYEES,
};

// Carbon receipts at a given $/ton, in year-1 real dollars. 5 Gt base with a Laffer
// behavioral response that reaches zero emissions at $330/ton.
export function carbonRevenueAtRate(rate) {
  return rate * 5e9 * (1 - rate / 330);
}

// Real carbon receipts fall 2.5%/yr as the economy decarbonizes (the $/ton rate itself is
// CPI-indexed). Household pages apply the same factor to the dividend and to household
// emissions, so the real-dollar dividend tracks the revenue the engine collects.
export const CARBON_DECARB_RATE = 0.025;
export function carbonDecayFactor(yr) {
  return Math.pow(1 - CARBON_DECARB_RATE, Math.max(yr, 1) - 1);
}

// 80% of carbon receipts are returned as an equal per-capita dividend.
export function carbonDividendPerCapita(rate, pop = BASE_PARAMS.startingPopulation) {
  return carbonRevenueAtRate(rate) * CARBON_DIVIDEND_SHARE / pop;
}

// Citizen unit deposits per person, deflated to Year-0 dollars. Year 0 carries none.
export function realGrantSeries(params = BASE_PARAMS, horizon = 35) {
  const { rows } = runFiscalSimulation(params, horizon);
  return [[0, 0], ...rows.map(r => [r.year, Math.round(r.grantsPerCapita / r.priceLevel)])];
}

// Share of LVT revenue from non-residential land (rental, commercial, agricultural, vacant).
const NONRES_LAND_SHARE = (() => {
  const total = LAND_SECTORS.reduce((s, x) => s + x.p0, 0);
  return LAND_SECTORS.filter(s => !s.exempt).reduce((s, x) => s + x.p0, 0) / total;
})();

// Per-year series the household pages need, in Year-0 dollars: citizen deposits per person,
// ownership paths for dilution, the revaluation factor, and the revenue lines that are
// assigned to households by holdings or statute.
export function householdFiscalSeries(params = BASE_PARAMS, horizon = 35) {
  const { rows } = runFiscalSimulation(params, horizon);
  const reval = params.revaluationOn ? 1 + params.revaluationPct : 1;
  return [{ year: 0, grant: 0, fundOwn: 0, workerOwn: 0, reval: 1, nonResLvt: 0, stableTax: 0, payrollFix: 0, realization: 0, gdpPerCapIdx: 1, popScale: 1,
    wefAccrual: 0, profitShare: 0, wefPrice: 1, wefYield: 0, ceocOn: params.ceocOn, pseuMultiple: 0 },
    ...rows.map(r => ({
      year: r.year,
      grant: r.grantsPerCapita / r.priceLevel,
      fundOwn: r.amcfOwnershipPct / 100,
      workerOwn: r.workerOwnershipPct / 100,
      reval,
      nonResLvt: r.lvtRev * 1e12 * NONRES_LAND_SHARE / r.priceLevel,
      stableTax: r.stableTaxRev * 1e12 / r.priceLevel,
      payrollFix: r.payrollFix * 1e12 / r.priceLevel,
      realization: r.realizationRev * 1e12 / r.priceLevel,
      gdpPerCapIdx: r.gdpPerCapIdx,
      popScale: r.population / params.startingPopulation,
      wefAccrual: r.workerUnitAccrual * 1e12 / r.priceLevel,
      profitShare: r.workerProfitShare * 1e12 / r.priceLevel,
      wefPrice: r.wefPriceReal,
      wefYield: r.combinedYield / 100,
      ceocOn: params.ceocOn,
      pseuMultiple: params.pseuOn ? params.pseuMultiple : 0,
    }))];
}
