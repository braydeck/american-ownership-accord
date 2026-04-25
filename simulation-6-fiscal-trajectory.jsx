import { useState, useMemo } from "react";
import {
  ComposedChart, Line, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const BASE_PARAMS = {
  growthTaxRate:          0.20,
  equityExciseRate:       0.04,
  creditCapFrac:          0.20,
  vatRate:                0.04,
  lvtRate:                0.10,
  carbonRate:             100,    // $/ton; Laffer peak ~$165/ton
  stableTaxFrac:          0.0076, // FTT + FSL + royalties + spectrum + water (% of GDP)
  prebatePerCapita:       5000,
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
  recessionDepth:         0.04,
};

const EV_COHORTS = [
  { growth: 0.010, share: 0.05 },
  { growth: 0.035, share: 0.20 },
  { growth: 0.065, share: 0.40 },
  { growth: 0.100, share: 0.25 },
  { growth: 0.150, share: 0.10 },
];

const PRESET_OVERRIDES = {
  base:                {},
  conservative:        { startingEV: 40e12, amcfReturn: 0.05, baseRealGdpGrowth: 0.015, codetermBonus: 0.001, baselineSpendingFrac: 0.175 },
  optimistic:          { startingEV: 60e12, amcfReturn: 0.09, baseRealGdpGrowth: 0.035, codetermBonus: 0.006, baselineSpendingFrac: 0.155 },
  slowCodetermination: { equityExciseRate: 0.01, creditCapFrac: 0.10 },
  fastCodetermination: { equityExciseRate: 0.08, creditCapFrac: 0.50 },
  noCredit:            { creditCapFrac: 0 },
  fullCarryforward:    { creditCapFrac: 1.0 },
  recessionYr3:        { recessionYear: 3 },
  recessionYr10:       { recessionYear: 10 },
  highDebt:            { startingDebt: 42e12 },
  currentLaw:          { vatRate: 0, lvtRate: 0, carbonRate: 0, stableTaxFrac: 0, equityExciseRate: 0, growthTaxRate: 0, prebatePerCapita: 0, grantPhaseMultiplier: 0 },
  lowRates:            { baseInterestRate: 0.02, interestReflexivity: 2 },
  highRates:           { baseInterestRate: 0.055, interestReflexivity: 10 },
  popGrowth:           { populationGrowthRate: 0.008 },
  highLvt:             { lvtRate: 0.15 },
  originalAccord:      { vatRate: 0.10, lvtRate: 0.03, carbonRate: 0, stableTaxFrac: 0 },
};

const PRESET_LABELS = {
  base: "Base Case", conservative: "Conservative", optimistic: "Optimistic",
  slowCodetermination: "Slow Codet.", fastCodetermination: "Fast Codet.",
  noCredit: "No Credit (Old)", fullCarryforward: "Full Carryforward",
  recessionYr3: "Recession Yr 3", recessionYr10: "Recession Yr 10",
  highDebt: "High Starting Debt", currentLaw: "Current Law",
  lowRates: "Low Rates", highRates: "High Rates",
  popGrowth: "Pop. Growth", highLvt: "High LVT (15%)",
  originalAccord: "Original Accord",
};

const CHART_TABS = [
  { id: "deficit",  label: "Deficit Trajectory" },
  { id: "debt",     label: "Debt & Net Position" },
  { id: "interest", label: "Interest Burden" },
  { id: "amcf",     label: "AMCF Growth" },
  { id: "revenue",  label: "Revenue vs. Spending" },
  { id: "credits",  label: "Credit Balance" },
];

const SENS_PARAMS = [
  { key: "growthTaxRate",        label: "Growth Tax Rate" },
  { key: "equityExciseRate",     label: "Equity Excise Rate" },
  { key: "creditCapFrac",        label: "Credit Cap Fraction" },
  { key: "vatRate",              label: "VAT Rate" },
  { key: "lvtRate",              label: "LVT Rate" },
  { key: "carbonRate",           label: "Carbon Tax Rate" },
  { key: "prebatePerCapita",     label: "Prebate / Capita" },
  { key: "startingEV",           label: "Starting EV" },
  { key: "amcfReturn",           label: "AMCF Return" },
  { key: "dividendYield",        label: "Dividend Yield" },
  { key: "baseRealGdpGrowth",    label: "Real GDP Growth" },
  { key: "baseInterestRate",     label: "Base Interest Rate" },
  { key: "baselineSpendingFrac", label: "Baseline Spending" },
];

const PARAM_SECTIONS = [
  {
    title: "Core Policy",
    open: true,
    params: [
      { key: "growthTaxRate",        label: "EV Growth Tax",          min: 0.05,   max: 0.35,  step: 0.005,   fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "equityExciseRate",     label: "Equity Excise Rate",     min: 0.005,  max: 0.08,  step: 0.005,   fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "creditCapFrac",        label: "Credit Cap (% of GT)",   min: 0,      max: 1.0,   step: 0.05,    fmt: v => `${(v*100).toFixed(0)}%` },
      { key: "vatRate",              label: "VAT Rate",               min: 0,      max: 0.20,  step: 0.005,   fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "lvtRate",              label: "LVT Rate",               min: 0,      max: 0.25,  step: 0.005,   fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "carbonRate",           label: "Carbon Tax ($/ton)",     min: 0,      max: 250,   step: 5,       fmt: v => `$${v}/ton` },
      { key: "stableTaxFrac",        label: "Stable Taxes (% GDP)",   min: 0,      max: 0.02,  step: 0.001,   fmt: v => `${(v*100).toFixed(2)}%` },
      { key: "prebatePerCapita",     label: "Prebate / Capita / Yr",  min: 1000,   max: 10000, step: 250,     fmt: v => `$${v.toLocaleString()}` },
      { key: "grantPhaseMultiplier", label: "Grant Phase Multiplier", min: 0.5,    max: 2.0,   step: 0.1,     fmt: v => `${v.toFixed(1)}×` },
    ],
  },
  {
    title: "Revenue & Market",
    open: false,
    params: [
      { key: "startingEV",    label: "Starting Enterprise Value",  min: 30e12, max: 80e12, step: 1e12,  fmt: v => `$${(v/1e12).toFixed(0)}T` },
      { key: "amcfReturn",    label: "AMCF Portfolio Return",      min: 0.03,  max: 0.12,  step: 0.005, fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "dividendYield", label: "AMCF Dividend Yield",        min: 0.01,  max: 0.06,  step: 0.005, fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "codetermBonus", label: "Codet. GDP Bonus / Yr",      min: 0,     max: 0.01,  step: 0.001, fmt: v => `${(v*100).toFixed(1)}%` },
    ],
  },
  {
    title: "Fiscal & Macro",
    open: false,
    params: [
      { key: "startingDebt",           label: "Starting Gross Debt",       min: 25e12, max: 50e12, step: 0.5e12, fmt: v => `$${(v/1e12).toFixed(1)}T` },
      { key: "startingGdp",            label: "Starting Real GDP",         min: 24e12, max: 34e12, step: 0.5e12, fmt: v => `$${(v/1e12).toFixed(1)}T` },
      { key: "baseRealGdpGrowth",      label: "Base Real GDP Growth",      min: 0.005, max: 0.05,  step: 0.005,  fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "inflationRate",          label: "Inflation Rate",            min: 0.01,  max: 0.06,  step: 0.005,  fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "baseInterestRate",       label: "Base Interest Rate",        min: 0.01,  max: 0.08,  step: 0.005,  fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "interestReflexivity",    label: "Interest Reflexivity (bp/pp)", min: 0, max: 20,    step: 1,      fmt: v => `${v} bp/pp` },
      { key: "baselineSpendingFrac",   label: "Baseline Spending (% GDP)", min: 0.15,  max: 0.28,  step: 0.005,  fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "spendingEfficiencyGain", label: "Spending Efficiency Gain",  min: 0,     max: 0.002, step: 0.0001, fmt: v => `${(v*10000).toFixed(0)} bp/yr` },
    ],
  },
  {
    title: "Population",
    open: false,
    params: [
      { key: "populationGrowthRate", label: "Population Growth / Yr", min: 0, max: 0.015, step: 0.001, fmt: v => `${(v*100).toFixed(1)}%` },
      { key: "recessionDepth",       label: "Recession Severity",     min: 0.01, max: 0.10, step: 0.01, fmt: v => `${(v*100).toFixed(0)}%` },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function grantFloor(yr, mult) {
  // Minimum grant per capita by phase; $1,200 is the floor from Year 14 onward
  const base = yr <= 3 ? 500 : yr <= 6 ? 550 : yr <= 13 ? 800 : 1200;
  return base * mult;
}

function runFiscalSimulation(p) {
  const rows = [];
  let amcfEquity = 0, creditBalance = 0, hasReachedCap = false;
  let grossDebt = p.startingDebt;
  let realGdp = p.startingGdp;
  let priceLevel = 1.0;
  let pop = p.startingPopulation;
  let cohortEVs = EV_COHORTS.map(c => c.share * p.startingEV);
  let prevTotalEV = p.startingEV;

  // Parallel current-law path
  let clDebt = p.startingDebt;
  let clRealGdp = p.startingGdp;
  let clPriceLevel = 1.0;

  for (let yr = 1; yr <= 35; yr++) {
    // Ownership fraction at start of year — one-way: once cap is reached it stays reached
    const prevOwnershipFrac = prevTotalEV > 0 ? amcfEquity / prevTotalEV : 0;
    if (!hasReachedCap && prevOwnershipFrac >= 0.20) hasReachedCap = true;
    const atCap = hasReachedCap;

    // EV cohort evolution
    cohortEVs = cohortEVs.map((ev, i) => ev * (1 + EV_COHORTS[i].growth));
    if (p.recessionYear > 0 && yr === p.recessionYear) {
      cohortEVs = cohortEVs.map(ev => ev * (1 - p.recessionDepth));
    }
    const totalEV = cohortEVs.reduce((a, b) => a + b, 0);
    const evGrowth = Math.max(0, totalEV - prevTotalEV);
    prevTotalEV = totalEV;

    // Growth Tax — zero once AMCF owns 20%; company obligation discharged
    const growthTax = atCap ? 0 : evGrowth * p.growthTaxRate;
    const equityExcise = totalEV * p.equityExciseRate;
    const creditGenerated = equityExcise;
    const maxCreditUse = growthTax * p.creditCapFrac;
    const available = creditBalance + creditGenerated;
    const creditUsed = Math.min(available, maxCreditUse);
    creditBalance = available - creditUsed;
    const amcfNetScrip = growthTax - creditUsed;

    // AMCF accumulation — Phase 1: scrip-driven; Phase 2: tracks 20% of EV organically
    if (atCap) {
      amcfEquity = totalEV * 0.20; // stake appreciates with the market; no new scrip
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
    const floorPerCap = grantFloor(yr, p.grantPhaseMultiplier);
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
    let gdpGrowth = p.baseRealGdpGrowth + codetermEffect - gdpDrag;
    if (p.recessionYear > 0 && yr === p.recessionYear) gdpGrowth -= p.recessionDepth;
    realGdp *= (1 + gdpGrowth);
    priceLevel *= (1 + p.inflationRate);
    const nominalGdp = realGdp * priceLevel;
    pop *= (1 + p.populationGrowthRate);

    // Revenue — individual income (7.8% GDP, no corporate, bracket adj included),
    // VAT on 55% taxable base (food/housing/healthcare exempt) with compliance ramp,
    // LVT on 20% of GDP land value, payroll donut-hole fix at 0.8% GDP.
    // Prebate is a SPENDING item, not a revenue deduction.
    const vatCompliance = Math.min(0.75 + 0.025 * (yr - 1), 0.90);
    const vatGross = nominalGdp * 0.55 * p.vatRate * vatCompliance;
    const landPremium = 1 + 0.005 * (yr - 1);
    const lvtRev = nominalGdp * 0.20 * landPremium * p.lvtRate;
    // Carbon: Laffer peak ~$165/ton; natural decarbonization 2.5%/yr
    const carbonRev = p.carbonRate * 5e9 * (1 - p.carbonRate / 330) * Math.pow(0.975, yr - 1);
    // Stable rent-based taxes: FTT + FSL + royalties + spectrum + water ≈ 0.76% GDP
    const stableTaxRev = nominalGdp * (p.stableTaxFrac ?? 0);
    const payrollFix = nominalGdp * 0.008;
    const capGainsTax = nominalGdp * 0.012;
    const incomeTax = nominalGdp * 0.078;
    const payrollTax = nominalGdp * 0.054;
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
    const baseSpend = nominalGdp * spendFrac;
    const popScale = pop / p.startingPopulation;
    const prebateSpend = p.prebatePerCapita * pop;
    const childcareSpend = 100e9 * popScale;
    const familyLeaveSpend = 50e9 * popScale;

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

    // Current Law parallel path
    clRealGdp *= (1 + p.baseRealGdpGrowth);
    clPriceLevel *= (1 + p.inflationRate);
    const clNomGdp = clRealGdp * clPriceLevel;
    const clRev = clNomGdp * 0.174;
    const clDtG = clDebt / clNomGdp;
    // Cap at 10%: beyond this, a real sovereign would restructure/monetize before rates go higher
    const clRate = Math.min(p.baseInterestRate + p.interestReflexivity * Math.max(0, clDtG - 1.20) / 100, 0.10);
    const clInterest = clDebt * clRate;
    // CL primary spending ≈ 22% of GDP (includes welfare programs the Accord dissolves)
    const clDeficit = clNomGdp * 0.22 + clInterest - clRev;
    clDebt += clDeficit;

    rows.push({
      year:            yr,
      nominalGdp:      +(nominalGdp / 1e12).toFixed(2),
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

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function computeSensitivity(baseParams) {
  const base = runFiscalSimulation(baseParams).milestones;
  return SENS_PARAMS.map(({ key, label }) => {
    const val = baseParams[key];
    const delta = Math.abs(val) * 0.2 + (val === 0 ? 0.001 : 0);
    const rH = runFiscalSimulation({ ...baseParams, [key]: val + delta }).milestones;
    const rL = runFiscalSimulation({ ...baseParams, [key]: Math.max(0, val - delta) }).milestones;
    return { key, label, baseVal: val, base, high: rH, low: rL };
  });
}

function exportCSV(rows) {
  const headers = ["Year","NominalGDP_T","TotalEV_T","GrowthTax_T","EquityExcise_T",
    "CreditBalance_T","AMCFEquity_T","AMCFDividends_T","GrantsPerCapita",
    "TotalRevenue_T","TotalOutlays_T","Deficit_T","GrossDebt_T","DebtToGDP_pct",
    "NetSovPos_T","IntToRev_pct","CL_Deficit_T","CL_GrossDebt_T"].join(",");
  const dataRows = rows.map(r =>
    [r.year, r.nominalGdp, r.totalEV, r.growthTax, r.equityExcise,
     r.creditBalance, r.amcfEquity, r.amcfDividends, r.grantsPerCapita,
     r.totalRev, r.totalOutlays, r.deficit, r.grossDebt, r.debtToGdp,
     r.netSovPos, r.intToRev, r.clDeficit, r.clGrossDebt].join(",")
  );
  const blob = new Blob([[headers, ...dataRows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "fiscal-trajectory.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// COLORS + FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  accord:       "#16a34a",
  accordLight:  "#86efac",
  currentLaw:   "#2563eb",
  debt:         "#dc2626",
  amcf:         "#7c3aed",
  amcfLight:    "#c4b5fd",
  credits:      "#d97706",
  creditsLight: "#fde68a",
  netPos:       "#0891b2",
  grants:       "#059669",
  compare:      "#0891b2",
};

const ttFmt = (v, unit) => {
  if (v == null) return "—";
  if (unit === "T") return `$${Math.abs(+v).toFixed(2)}T${+v < 0 ? " (surplus)" : ""}`;
  if (unit === "%") return `${(+v).toFixed(1)}%`;
  return String(v);
};

const axisT = v => `$${v}T`;
const axisPct = v => `${v}%`;
const fmtYr = v => v == null ? "Never" : `Year ${v}`;

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function SliderInput({ label, value, min, max, step, onChange, fmt }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: "#4b5563" }}>{label}</span>
        <span style={{ color: "#111827", fontWeight: 600, minWidth: 60, textAlign: "right" }}>{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.accord, cursor: "pointer" }}
      />
    </div>
  );
}

function MilestoneCard({ title, value, color, subtitle, compare }) {
  return (
    <div style={{
      background: "#fff", border: `2px solid ${color}`, borderRadius: 8,
      padding: "10px 14px", flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {compare && <div style={{ fontSize: 11, color: C.compare }}>vs {compare}</div>}
      {subtitle && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART RENDERERS
// ═══════════════════════════════════════════════════════════════════════════

const CHART_HEIGHT = 340;

function DeficitChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "Accord Deficit": r.deficit,
    "Current Law (est.)": r.clDeficit,
    ...(compareRows ? { "Compare": compareRows[r.year - 1]?.deficit } : {}),
  }));
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Annual fiscal deficit/surplus — Accord narrows the gap faster than current-law trajectory
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={axisT} tick={{ fontSize: 11 }} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
          <Tooltip formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "Balance", fill: "#374151", fontSize: 11 }} />
          <Line dataKey="Accord Deficit" stroke={C.accord} strokeWidth={2.5} dot={false} />
          <Line dataKey="Current Law (est.)" stroke={C.currentLaw} strokeWidth={2} strokeDasharray="6 3" dot={false} />
          {compareRows && <Line dataKey="Compare" stroke={C.compare} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function DebtChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "Gross Debt (Accord)": r.grossDebt,
    "AMCF Equity": r.amcfEquity,
    "Net Sovereign Position": r.netSovPos,
    "Gross Debt (CL)": r.clGrossDebt,
    ...(compareRows ? { "Compare Debt": compareRows[r.year - 1]?.grossDebt } : {}),
  }));
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Gross debt vs. AMCF equity — net sovereign position turns negative when AMCF exceeds national debt
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={axisT} tick={{ fontSize: 11 }} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
          <Tooltip formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
          <Line dataKey="Gross Debt (Accord)" stroke={C.debt} strokeWidth={2.5} dot={false} />
          <Line dataKey="Gross Debt (CL)" stroke={C.currentLaw} strokeWidth={2} strokeDasharray="6 3" dot={false} />
          <Line dataKey="AMCF Equity" stroke={C.amcf} strokeWidth={2.5} dot={false} />
          <Line dataKey="Net Sovereign Position" stroke={C.netPos} strokeWidth={2} strokeDasharray="3 3" dot={false} />
          {compareRows && <Line dataKey="Compare Debt" stroke={C.compare} strokeWidth={2} strokeDasharray="4 2" dot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function InterestChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "Accord": r.intToRev,
    "Current Law (est.)": r.clRev > 0 ? +(r.interest / r.clRev * 100).toFixed(1) : 0,
    ...(compareRows ? { "Compare": compareRows[r.year - 1]?.intToRev } : {}),
  }));
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Interest as % of federal revenue — Accord prevents the interest spiral that traps current-law trajectory
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={axisPct} tick={{ fontSize: 11 }} label={{ value: "% of Revenue", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
          <Tooltip formatter={(v, n) => [ttFmt(v, "%"), n]} labelFormatter={v => `Year ${v}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={10} stroke={C.debt} strokeDasharray="5 3" label={{ value: "10% threshold", fill: C.debt, fontSize: 11 }} />
          <Line dataKey="Accord" stroke={C.accord} strokeWidth={2.5} dot={false} />
          <Line dataKey="Current Law (est.)" stroke={C.currentLaw} strokeWidth={2} strokeDasharray="6 3" dot={false} />
          {compareRows && <Line dataKey="Compare" stroke={C.compare} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function AmcfChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "AMCF Equity": r.amcfEquity,
    "Dividends (AMCF)": r.amcfDividends,
    "Grants Total": r.grantsTotal,
    "SPV Surplus": r.spvSurplus,
    ...(compareRows ? { "Compare Equity": compareRows[r.year - 1]?.amcfEquity } : {}),
  }));
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        AMCF equity accumulation — dividends surpass grants to create citizen wealth surplus
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={axisT} tick={{ fontSize: 11 }} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
          <Tooltip formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="AMCF Equity" stroke={C.amcf} strokeWidth={3} dot={false} />
          {compareRows && <Line dataKey="Compare Equity" stroke={C.compare} strokeWidth={2} strokeDasharray="4 2" dot={false} />}
          <Bar dataKey="Dividends (AMCF)" fill={C.accordLight} stackId="flow" />
          <Bar dataKey="Grants Total" fill={C.creditsLight} stackId="target" />
          <Line dataKey="SPV Surplus" stroke={C.grants} strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RevenueChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "Income Tax": r.incomeTax,
    "Payroll Tax": r.payrollTax,
    "VAT (gross)": r.vatGross,
    "LVT": r.lvtRev,
    "Payroll Fix": r.payrollFix,
    "Cap. Gains + Other": +(r.capGainsTax + r.otherTax).toFixed(2),
    "Total Revenue": r.totalRev,
    "Total Outlays": r.totalOutlays,
    "Current Law Revenue": r.clRev,
    ...(compareRows ? { "Compare Outlays": compareRows[r.year - 1]?.totalOutlays } : {}),
  }));
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Revenue components vs. total outlays — prebate/childcare/family leave are spending items funded by AMCF cash flow and new taxes
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={axisT} tick={{ fontSize: 11 }} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
          <Tooltip formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Income Tax" stackId="rev" fill="#60a5fa" />
          <Bar dataKey="Payroll Tax" stackId="rev" fill="#93c5fd" />
          <Bar dataKey="VAT (gross)" stackId="rev" fill={C.accordLight} />
          <Bar dataKey="LVT" stackId="rev" fill="#4ade80" />
          <Bar dataKey="Payroll Fix" stackId="rev" fill="#86efac" />
          <Bar dataKey="Cap. Gains + Other" stackId="rev" fill="#a3e635" />
          <Line dataKey="Total Revenue" stroke={C.accord} strokeWidth={2.5} dot={false} />
          <Line dataKey="Total Outlays" stroke={C.debt} strokeWidth={2.5} dot={false} />
          <Line dataKey="Current Law Revenue" stroke={C.currentLaw} strokeWidth={2} strokeDasharray="6 3" dot={false} />
          {compareRows && <Line dataKey="Compare Outlays" stroke={C.compare} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CreditsChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "Credit Balance": r.creditBalance,
    "Credits Generated": r.creditGenerated,
    "Credits Used": r.creditUsed,
    "AMCF Net Scrip": r.amcfNetScrip,
    ...(compareRows ? { "Compare Credit Bal.": compareRows[r.year - 1]?.creditBalance } : {}),
  }));
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Codetermination credit mechanics — 20% cap means AMCF receives ≥80% of Growth Tax from Year 1
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={axisT} tick={{ fontSize: 11 }} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
          <Tooltip formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area dataKey="Credit Balance" stroke={C.credits} fill={C.creditsLight} strokeWidth={2} />
          {compareRows && <Line dataKey="Compare Credit Bal." stroke={C.compare} strokeWidth={2} strokeDasharray="4 2" dot={false} />}
          <Bar dataKey="Credits Generated" fill="#fbbf24" stackId="flow" />
          <Bar dataKey="Credits Used" fill="#4ade80" stackId="used" />
          <Line dataKey="AMCF Net Scrip" stroke={C.amcf} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SENSITIVITY TABLE
// ═══════════════════════════════════════════════════════════════════════════

function SensitivityTable({ data }) {
  const milestoneKeys = [
    { key: "fiscalCrossoverYear",   label: "Fiscal Crossover",   dir: "lower" },
    { key: "debtPeakYear",          label: "Debt Peak",          dir: "lower" },
    { key: "amcfSelfFundingYear",   label: "AMCF Self-Funds",    dir: "lower" },
    { key: "netCreditorYear",       label: "Net Creditor",       dir: "lower" },
    { key: "interestThresholdYear", label: "Interest < 10%",     dir: "lower" },
  ];

  const cellColor = (base, test, dir) => {
    if (base == null && test == null) return "#f9fafb";
    if (test == null && base != null) return dir === "lower" ? "#fef2f2" : "#f0fdf4";
    if (base == null && test != null) return dir === "lower" ? "#f0fdf4" : "#fef2f2";
    const diff = test - base;
    if (Math.abs(diff) <= 1) return "#f9fafb";
    const better = dir === "lower" ? diff < 0 : diff > 0;
    return better ? "#f0fdf4" : "#fef2f2";
  };

  const thStyle = { padding: "6px 10px", fontSize: 11, fontWeight: 600, background: "#f3f4f6", borderBottom: "2px solid #e5e7eb", textAlign: "center" };
  const tdStyle = { padding: "5px 8px", fontSize: 11, textAlign: "center", borderBottom: "1px solid #f0f0f0" };

  return (
    <div style={{ overflowX: "auto", marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Sensitivity Analysis — ±20% on each parameter; green = earlier/better, red = later/worse
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: "left" }}>Parameter</th>
            {milestoneKeys.map(mk => (
              <th key={mk.key} colSpan={2} style={thStyle}>{mk.label}</th>
            ))}
          </tr>
          <tr>
            <th style={{ ...thStyle, textAlign: "left" }}>+20% / −20%</th>
            {milestoneKeys.map(mk => (
              <>
                <th key={mk.key + "h"} style={{ ...thStyle, color: C.accord }}>+20%</th>
                <th key={mk.key + "l"} style={{ ...thStyle, color: C.debt }}>−20%</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.key}>
              <td style={{ ...tdStyle, textAlign: "left", fontWeight: 500 }}>{row.label}</td>
              {milestoneKeys.map(mk => (
                <>
                  <td key={mk.key + "h"} style={{ ...tdStyle, background: cellColor(row.base[mk.key], row.high[mk.key], mk.dir) }}>
                    {fmtYr(row.high[mk.key])}
                  </td>
                  <td key={mk.key + "l"} style={{ ...tdStyle, background: cellColor(row.base[mk.key], row.low[mk.key], mk.dir) }}>
                    {fmtYr(row.low[mk.key])}
                  </td>
                </>
              ))}
            </tr>
          ))}
          <tr style={{ background: "#f8fafc" }}>
            <td style={{ ...tdStyle, textAlign: "left", fontWeight: 700 }}>Base Case</td>
            {milestoneKeys.map(mk => (
              <td key={mk.key + "base"} colSpan={2} style={{ ...tdStyle, fontWeight: 700 }}>
                {fmtYr(data[0]?.base[mk.key])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER PANEL
// ═══════════════════════════════════════════════════════════════════════════

function ParameterPanel({ params, setParam }) {
  return (
    <div style={{ fontSize: 13 }}>
      {PARAM_SECTIONS.map(section => (
        <details key={section.title} open={section.open} style={{ marginBottom: 8 }}>
          <summary style={{
            cursor: "pointer", fontWeight: 700, fontSize: 12, padding: "6px 8px",
            background: "#f3f4f6", borderRadius: 6, userSelect: "none",
            color: "#374151", listStyle: "none",
          }}>
            ▸ {section.title}
          </summary>
          <div style={{ padding: "8px 4px 0" }}>
            {section.params.map(pc => (
              <SliderInput
                key={pc.key}
                label={pc.label}
                value={params[pc.key]}
                min={pc.min} max={pc.max} step={pc.step}
                onChange={v => setParam(pc.key, v)}
                fmt={pc.fmt}
              />
            ))}
          </div>
        </details>
      ))}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Recession Year</div>
        <select
          value={params.recessionYear}
          onChange={e => setParam("recessionYear", Number(e.target.value))}
          style={{ width: "100%", padding: "4px 6px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d5db" }}
        >
          <option value={0}>None</option>
          <option value={3}>Year 3</option>
          <option value={5}>Year 5</option>
          <option value={10}>Year 10</option>
          <option value={15}>Year 15</option>
          <option value={20}>Year 20</option>
        </select>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function FiscalTrajectorySimulator() {
  const [params, setParams] = useState(BASE_PARAMS);
  const [activePreset, setActivePreset] = useState("base");
  const [activeChart, setActiveChart] = useState("deficit");
  const [compareMode, setCompareMode] = useState(false);
  const [comparePreset, setComparePreset] = useState("conservative");
  const [showSensitivity, setShowSensitivity] = useState(false);
  const [showParams, setShowParams] = useState(true);

  const result = useMemo(() => runFiscalSimulation(params), [params]);
  const compareResult = useMemo(
    () => compareMode ? runFiscalSimulation({ ...BASE_PARAMS, ...PRESET_OVERRIDES[comparePreset] }) : null,
    [compareMode, comparePreset]
  );
  const sensitivityData = useMemo(
    () => showSensitivity ? computeSensitivity(params) : null,
    [params, showSensitivity]
  );

  const setParam = (key, val) => {
    setParams(p => ({ ...p, [key]: val }));
    setActivePreset("custom");
  };
  const applyPreset = (k) => {
    setParams({ ...BASE_PARAMS, ...PRESET_OVERRIDES[k] });
    setActivePreset(k);
  };

  const { rows, milestones: m } = result;
  const cm = compareResult?.milestones;

  // Key Year 6 validation stat
  const yr6 = rows[5];
  const yr6Validation = yr6 ? `(AMCF equity Year 6: $${yr6.amcfEquity.toFixed(1)}T)` : "";

  const btnStyle = (active) => ({
    padding: "5px 11px", fontSize: 12, borderRadius: 4, border: "none",
    cursor: "pointer", fontWeight: active ? 700 : 400,
    background: active ? "#1f2937" : "#e5e7eb",
    color: active ? "#fff" : "#374151",
    transition: "background 0.15s",
  });

  const presetKeys = Object.keys(PRESET_OVERRIDES);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 1200, margin: "0 auto", padding: "16px", background: "#f9fafb", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>
          American Ownership Accord — Fiscal Trajectory Simulator
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
          35-year forward projection · All values in 2024 dollars · {yr6Validation}
        </p>
      </div>

      {/* Milestone Dashboard */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <MilestoneCard
          title="Fiscal Crossover"
          value={fmtYr(m.fiscalCrossoverYear)}
          color={C.accord}
          subtitle="First year of surplus"
          compare={cm ? fmtYr(cm.fiscalCrossoverYear) : null}
        />
        <MilestoneCard
          title="Debt Peak"
          value={fmtYr(m.debtPeakYear)}
          color={C.debt}
          subtitle="Gross debt maximum"
          compare={cm ? fmtYr(cm.debtPeakYear) : null}
        />
        <MilestoneCard
          title="Net Creditor Year"
          value={fmtYr(m.netCreditorYear)}
          color={C.amcf}
          subtitle="AMCF equity > national debt"
          compare={cm ? fmtYr(cm.netCreditorYear) : null}
        />
        <MilestoneCard
          title="AMCF Self-Funding"
          value={fmtYr(m.amcfSelfFundingYear)}
          color={C.grants}
          subtitle="Dividends ≥ citizen grants"
          compare={cm ? fmtYr(cm.amcfSelfFundingYear) : null}
        />
        <MilestoneCard
          title="Interest < 10%"
          value={fmtYr(m.interestThresholdYear)}
          color={m.interestThresholdYear ? C.accord : "#9ca3af"}
          subtitle="of federal revenue"
          compare={cm ? fmtYr(cm.interestThresholdYear) : null}
        />
      </div>

      {/* Presets */}
      <div style={{ background: "#fff", borderRadius: 8, padding: "12px 14px", marginBottom: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Scenario Presets</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {presetKeys.map(k => (
            <button key={k} onClick={() => applyPreset(k)} style={btnStyle(activePreset === k)}>
              {PRESET_LABELS[k]}
            </button>
          ))}
          {activePreset === "custom" && (
            <span style={{ fontSize: 11, color: "#6b7280", alignSelf: "center", marginLeft: 4 }}>
              (custom — sliders modified)
            </span>
          )}
        </div>

        {/* Compare Mode */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox" checked={compareMode}
              onChange={e => setCompareMode(e.target.checked)}
              style={{ accentColor: C.compare }}
            />
            <span style={{ fontWeight: 600, color: C.compare }}>Compare Mode</span>
          </label>
          {compareMode && (
            <>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Compare against:</span>
              <select
                value={comparePreset}
                onChange={e => setComparePreset(e.target.value)}
                style={{ padding: "3px 8px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d5db", color: C.compare }}
              >
                {presetKeys.map(k => (
                  <option key={k} value={k}>{PRESET_LABELS[k]}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: C.compare }}>
                — crossover: {fmtYr(cm?.fiscalCrossoverYear)}, debt peak: {fmtYr(cm?.debtPeakYear)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main content: params + charts */}
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>

        {/* Parameter Panel */}
        <div style={{ width: 270, flexShrink: 0 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "12px 14px", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Parameters</span>
              <button onClick={() => setShowParams(!showParams)} style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>
                {showParams ? "hide" : "show"}
              </button>
            </div>
            {showParams && <ParameterPanel params={params} setParam={setParam} />}
          </div>
        </div>

        {/* Chart Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "#fff", borderRadius: 8, padding: "14px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
            {/* Chart tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
              {CHART_TABS.map(t => (
                <button key={t.id} onClick={() => setActiveChart(t.id)} style={btnStyle(activeChart === t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Active chart */}
            {activeChart === "deficit"  && <DeficitChart  rows={rows} compareRows={compareResult?.rows} />}
            {activeChart === "debt"     && <DebtChart     rows={rows} compareRows={compareResult?.rows} />}
            {activeChart === "interest" && <InterestChart rows={rows} compareRows={compareResult?.rows} />}
            {activeChart === "amcf"     && <AmcfChart     rows={rows} compareRows={compareResult?.rows} />}
            {activeChart === "revenue"  && <RevenueChart  rows={rows} compareRows={compareResult?.rows} />}
            {activeChart === "credits"  && <CreditsChart  rows={rows} compareRows={compareResult?.rows} />}
          </div>

          {/* Data Table — Year milestones */}
          <div style={{ background: "#fff", borderRadius: 8, padding: "12px 14px", marginTop: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", overflowX: "auto" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Key Metrics by Decade</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  {["Year", "Nom. GDP", "AMCF Equity", "Own %", "Gross Debt", "Debt/GDP", "Deficit", "AMCF Cash Flow", "Healthcare Reserve", "Discretionary", "Grants/Cap", "Brake"].map(h => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, borderBottom: "2px solid #e5e7eb", color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 5, 10, 15, 20, 25, 30, 35].map(yr => {
                  const r = rows[yr - 1];
                  if (!r) return null;
                  return (
                    <tr key={yr} style={{ background: r.solventBrakeActive ? "#fff7ed" : "#f0fdf4" }}>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>{yr}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>${r.nominalGdp}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: C.amcf, fontWeight: 600 }}>${r.amcfEquity}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: r.amcfOwnershipPct >= 20 ? C.accord : "#374151" }}>{r.amcfOwnershipPct}%</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: C.debt }}>${r.grossDebt}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: r.debtToGdp > 150 ? C.debt : r.debtToGdp < 100 ? C.accord : "#374151" }}>{r.debtToGdp}%</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: r.deficit < 0 ? C.accord : C.debt }}>{r.deficit < 0 ? `($${Math.abs(r.deficit).toFixed(2)}T)` : `$${r.deficit}T`}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: C.credits }}>${r.amcfCashFlow}T <span style={{ color: "#9ca3af", fontSize: 10 }}>({r.combinedYield}%)</span></td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "#0891b2" }}>${r.healthcareAMCF}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: r.solventBrakeActive ? "#9ca3af" : C.accord }}>{r.solventBrakeActive ? "—" : `$${r.discretionaryAMCF}T`}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>${Number(r.grantsPerCapita).toLocaleString()}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontSize: 10, color: r.solventBrakeActive ? C.debt : C.accord }}>{r.solventBrakeActive ? "ACTIVE" : "off"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sensitivity + Export */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={() => setShowSensitivity(!showSensitivity)}
          style={{ ...btnStyle(showSensitivity), padding: "7px 14px" }}
        >
          {showSensitivity ? "Hide" : "Show"} Sensitivity Analysis
        </button>
        <button
          onClick={() => exportCSV(rows)}
          style={{ padding: "7px 14px", fontSize: 12, borderRadius: 4, border: "1px solid #d1d5db", cursor: "pointer", background: "#fff", color: "#374151" }}
        >
          Export CSV (35 rows)
        </button>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          Base: Growth Tax {(params.growthTaxRate * 100).toFixed(0)}% · VAT {(params.vatRate * 100).toFixed(0)}% · LVT {(params.lvtRate * 100).toFixed(0)}% · Prebate ${params.prebatePerCapita.toLocaleString()}/capita
        </span>
      </div>

      {showSensitivity && sensitivityData && (
        <div style={{ background: "#fff", borderRadius: 8, padding: "14px 16px", marginTop: 10, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <SensitivityTable data={sensitivityData} />
        </div>
      )}
    </div>
  );
}
