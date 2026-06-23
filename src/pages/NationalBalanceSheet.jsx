import React, { useState, useMemo } from "react";
import {
  ComposedChart, Line, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from "recharts";
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { ControlPanel, ControlGroup } from '@/components/controls/ControlPanel';
import { PresetSelector } from '@/components/controls/PresetSelector';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { lvtRevForFiscal, PREBATE_REDIRECTED, LAND_GROWTH_ELASTICITY } from '@/lib/land';
import { useUrlValue, useUrlState } from '@/lib/url-state';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const BASE_PARAMS = {
  growthTaxRate:          0.20,
  equityExciseRate:       0.04,
  creditCapFrac:          0.20,
  vatRate:                0.04,
  lvtRate:                0.10,
  // Land Value Tax — bottom-up capitalized model (src/lib/land.js). Default scenario:
  // NO homeowner exemption, with the recovered revenue redirected into the prebate.
  lvtModel:               'capitalized', // 'capitalized' | 'legacy'
  lvtExemption:           0,             // 0 = no homeowner exemption; 500000 to restore it
  lvtGroundRentYield:     0.04,          // i — capitalization discount
  lvtLandElasticity:      LAND_GROWTH_ELASTICITY, // land-base growth vs nominal GDP (0.7 = suppressed)
  lvtAssessmentBasis:     'capitalized', // 'capitalized' | 'preTax'
  carbonRate:             100,    // $/ton; Laffer peak ~$165/ton
  stableTaxFrac:          0.0076, // FTT + FSL + royalties + spectrum + water (% of GDP)
  prebatePerCapita:       PREBATE_REDIRECTED, // $6,101 — base $5,000 + redirected exemption revenue
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
};

const PRESET_LABELS = {
  base: "Base Case", conservative: "Conservative", optimistic: "Optimistic",
  slowCodetermination: "Slow Codet.", fastCodetermination: "Fast Codet.",
};

const PRESET_LIST = Object.keys(PRESET_OVERRIDES).map(k => ({
  key: k, label: PRESET_LABELS[k],
}));

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
      { key: "grantPhaseMultiplier", label: "Grant Phase Multiplier", min: 0.5,    max: 2.0,   step: 0.1,     fmt: v => `${v.toFixed(1)}x` },
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
    // LVT from the bottom-up capitalized land model, payroll donut-hole fix at 0.8% GDP.
    // Prebate is a SPENDING item, not a revenue deduction.
    const vatCompliance = Math.min(0.75 + 0.025 * (yr - 1), 0.90);
    const vatGross = nominalGdp * 0.55 * p.vatRate * vatCompliance;
    const lvtRev = lvtRevForFiscal({
      rate: p.lvtRate, year: yr, nominalGdp,
      model: p.lvtModel, exemption: p.lvtExemption,
      assessmentBasis: p.lvtAssessmentBasis,
      groundRentYield: p.lvtGroundRentYield,
      landGrowthElasticity: p.lvtLandElasticity,
    });
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

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const ttFmt = (v, unit) => {
  if (v == null) return "\u2014";
  if (unit === "T") return `$${Math.abs(+v).toFixed(2)}T${+v < 0 ? " (surplus)" : ""}`;
  if (unit === "%") return `${(+v).toFixed(1)}%`;
  return String(v);
};

const axisT = v => `$${v}T`;
const axisPct = v => `${v}%`;
const fmtYr = v => v == null ? "Never" : `Year ${v}`;

// ═══════════════════════════════════════════════════════════════════════════
// CHART RENDERERS
// ═══════════════════════════════════════════════════════════════════════════

const CHART_H = 340;

function DeficitChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "Accord Deficit": r.deficit,
    "Current Law (est.)": r.clDeficit,
    ...(compareRows ? { "Compare": compareRows[r.year - 1]?.deficit } : {}),
  }));
  return (
    <ChartContainer
      title="Annual fiscal deficit/surplus"
      subtitle="Accord narrows the gap faster than current-law trajectory"
      height={CHART_H}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={CHART_AXIS.tick} />
        <YAxis tickFormatter={axisT} tick={CHART_AXIS.tick} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "Balance", fill: "#374151", fontSize: 11 }} />
        <Line dataKey="Accord Deficit" stroke={C.accord} strokeWidth={2.5} dot={false} />
        <Line dataKey="Current Law (est.)" stroke={C.currentLaw} strokeWidth={2} strokeDasharray="6 3" dot={false} />
        {compareRows && <Line dataKey="Compare" stroke={C.compare} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
      </ComposedChart>
    </ChartContainer>
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
    <ChartContainer
      title="Gross debt vs. AMCF equity"
      subtitle="Net sovereign position turns negative when AMCF exceeds national debt"
      height={CHART_H}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={CHART_AXIS.tick} />
        <YAxis tickFormatter={axisT} tick={CHART_AXIS.tick} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#374151" strokeWidth={1} />
        <Line dataKey="Gross Debt (Accord)" stroke={C.debt} strokeWidth={2.5} dot={false} />
        <Line dataKey="Gross Debt (CL)" stroke={C.currentLaw} strokeWidth={2} strokeDasharray="6 3" dot={false} />
        <Line dataKey="AMCF Equity" stroke={C.amcf} strokeWidth={2.5} dot={false} />
        <Line dataKey="Net Sovereign Position" stroke={C.netPos} strokeWidth={2} strokeDasharray="3 3" dot={false} />
        {compareRows && <Line dataKey="Compare Debt" stroke={C.compare} strokeWidth={2} strokeDasharray="4 2" dot={false} />}
      </ComposedChart>
    </ChartContainer>
  );
}

function InterestChart({ rows, compareRows }) {
  const data = rows.map(r => ({
    year: r.year,
    "Accord": r.intToRev,
    "Current Law (est.)": r.clRev > 0 ? +(r.clInterest / r.clRev * 100).toFixed(1) : 0,
    ...(compareRows ? { "Compare": compareRows[r.year - 1]?.intToRev } : {}),
  }));
  return (
    <ChartContainer
      title="Interest as % of federal revenue"
      subtitle="Accord prevents the interest spiral that traps current-law trajectory"
      height={CHART_H}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={CHART_AXIS.tick} />
        <YAxis tickFormatter={axisPct} tick={CHART_AXIS.tick} label={{ value: "% of Revenue", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [ttFmt(v, "%"), n]} labelFormatter={v => `Year ${v}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={10} stroke={C.debt} strokeDasharray="5 3" label={{ value: "10% threshold", fill: C.debt, fontSize: 11 }} />
        <Line dataKey="Accord" stroke={C.accord} strokeWidth={2.5} dot={false} />
        <Line dataKey="Current Law (est.)" stroke={C.currentLaw} strokeWidth={2} strokeDasharray="6 3" dot={false} />
        {compareRows && <Line dataKey="Compare" stroke={C.compare} strokeWidth={2} strokeDasharray="3 3" dot={false} />}
      </ComposedChart>
    </ChartContainer>
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
    <ChartContainer
      title="AMCF equity accumulation"
      subtitle="Dividends surpass grants to create citizen wealth surplus"
      height={CHART_H}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={CHART_AXIS.tick} />
        <YAxis tickFormatter={axisT} tick={CHART_AXIS.tick} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="AMCF Equity" stroke={C.amcf} strokeWidth={3} dot={false} />
        {compareRows && <Line dataKey="Compare Equity" stroke={C.compare} strokeWidth={2} strokeDasharray="4 2" dot={false} />}
        <Bar dataKey="Dividends (AMCF)" fill={C.accordLight} stackId="flow" />
        <Bar dataKey="Grants Total" fill={C.creditsLight} stackId="target" />
        <Line dataKey="SPV Surplus" stroke={C.grants} strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
      </ComposedChart>
    </ChartContainer>
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
    <ChartContainer
      title="Revenue components vs. total outlays"
      subtitle="Prebate/childcare/family leave are spending items funded by AMCF cash flow and new taxes"
      height={CHART_H}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={CHART_AXIS.tick} />
        <YAxis tickFormatter={axisT} tick={CHART_AXIS.tick} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
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
    </ChartContainer>
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
    <ChartContainer
      title="Codetermination credit mechanics"
      subtitle="20% cap means AMCF receives at least 80% of Growth Tax from Year 1"
      height={CHART_H}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="year" tickFormatter={v => `Yr ${v}`} tick={CHART_AXIS.tick} />
        <YAxis tickFormatter={axisT} tick={CHART_AXIS.tick} label={{ value: "$ Trillions", angle: -90, position: "insideLeft", offset: -8, style: { fontSize: 11 } }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [ttFmt(v, "T"), n]} labelFormatter={v => `Year ${v}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area dataKey="Credit Balance" stroke={C.credits} fill={C.creditsLight} strokeWidth={2} />
        {compareRows && <Line dataKey="Compare Credit Bal." stroke={C.compare} strokeWidth={2} strokeDasharray="4 2" dot={false} />}
        <Bar dataKey="Credits Generated" fill="#fbbf24" stackId="flow" />
        <Bar dataKey="Credits Used" fill="#4ade80" stackId="used" />
        <Line dataKey="AMCF Net Scrip" stroke={C.amcf} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
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
    { key: "interestThresholdYear", label: "Interest {'<'} 10%", dir: "lower" },
  ];

  const cellColor = (base, test, dir) => {
    if (base == null && test == null) return undefined;
    if (test == null && base != null) return dir === "lower" ? "bg-red-50" : "bg-green-50";
    if (base == null && test != null) return dir === "lower" ? "bg-green-50" : "bg-red-50";
    const diff = test - base;
    if (Math.abs(diff) <= 1) return undefined;
    const better = dir === "lower" ? diff < 0 : diff > 0;
    return better ? "bg-green-50" : "bg-red-50";
  };

  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold tracking-tight mb-2">Sensitivity Analysis</h3>
      <p className="text-sm text-muted-foreground mb-4">
        +/- 20% on each parameter; green = earlier/better, red = later/worse
      </p>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-left">Parameter</TableHead>
              {milestoneKeys.map(mk => (
                <TableHead key={mk.key} colSpan={2} className="text-center">{mk.label}</TableHead>
              ))}
            </TableRow>
            <TableRow className="bg-muted/50">
              <TableHead className="text-left text-xs">+20% / -20%</TableHead>
              {milestoneKeys.map(mk => (
                <React.Fragment key={mk.key}>
                  <TableHead className="text-center text-xs" style={{ color: C.accord }}>+20%</TableHead>
                  <TableHead className="text-center text-xs" style={{ color: C.debt }}>-20%</TableHead>
                </React.Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(row => (
              <TableRow key={row.key}>
                <TableCell className="text-left font-medium">{row.label}</TableCell>
                {milestoneKeys.map(mk => (
                  <React.Fragment key={mk.key}>
                    <TableCell className={`text-center ${cellColor(row.base[mk.key], row.high[mk.key], mk.dir) ?? ''}`}>
                      {fmtYr(row.high[mk.key])}
                    </TableCell>
                    <TableCell className={`text-center ${cellColor(row.base[mk.key], row.low[mk.key], mk.dir) ?? ''}`}>
                      {fmtYr(row.low[mk.key])}
                    </TableCell>
                  </React.Fragment>
                ))}
              </TableRow>
            ))}
            <TableRow className="bg-muted/30">
              <TableCell className="text-left font-bold">Base Case</TableCell>
              {milestoneKeys.map(mk => (
                <TableCell key={mk.key} colSpan={2} className="text-center font-bold">
                  {fmtYr(data[0]?.base[mk.key])}
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER PANEL
// ═══════════════════════════════════════════════════════════════════════════

function ParameterPanel({ params, setParam }) {
  return (
    <div className="text-sm space-y-2">
      {PARAM_SECTIONS.map(section => (
        <Collapsible key={section.title} defaultOpen={section.open}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 cursor-pointer select-none rounded-md bg-muted/50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:bg-muted/80 transition-colors">
            {section.title}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 px-1 space-y-1">
            {section.params.map(pc => (
              <SliderControl
                key={pc.key}
                label={pc.label}
                value={params[pc.key]}
                min={pc.min}
                max={pc.max}
                step={pc.step}
                onChange={v => setParam(pc.key, v)}
                formatValue={pc.fmt}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}

      <div className="pt-2">
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          $500k Homeowner Exemption
        </label>
        <Button
          variant={params.lvtExemption > 0 ? "default" : "outline"}
          size="sm"
          className="mt-1 w-full text-xs font-semibold"
          onClick={() => setParam("lvtExemption", params.lvtExemption > 0 ? 0 : 500000)}
        >
          {params.lvtExemption > 0 ? "✓ Exemption On ($500k)" : "Exemption Off"}
        </Button>
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
          Exemption only — set the prebate and rates yourself. On shields owner-occupied land
          (LVT ≈$567B at 10%); Off taxes the full base (≈$943B). Lower the prebate slider to
          keep the swap deficit-neutral.
        </p>
      </div>

      <div className="pt-2">
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Recession Year
        </label>
        <select
          value={params.recessionYear}
          onChange={e => setParam("recessionYear", Number(e.target.value))}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
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
  const [params, setParams] = useUrlState(BASE_PARAMS);
  const [activePreset, setActivePreset] = useState("base");
  const [activeChart, setActiveChart] = useUrlValue("tab", "deficit");
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

  const presetKeys = Object.keys(PRESET_OVERRIDES);

  return (
    <PageShell className="max-w-6xl">
      {/* Header */}
      <div className="border-l-4 border-emerald-600 pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">National Balance Sheet</h1>
        <p className="text-base font-semibold text-emerald-700 mt-2">
          35-year forward projection of federal fiscal trajectory under the Accord
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          All values in 2024 dollars
        </p>
      </div>

      {/* Milestone Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
        <MilestoneCard
          label="Fiscal Crossover"
          value={fmtYr(m.fiscalCrossoverYear)}
          sub={cm ? `vs ${fmtYr(cm.fiscalCrossoverYear)}` : "First year of surplus"}
        />
        <MilestoneCard
          label="Debt Peak"
          value={fmtYr(m.debtPeakYear)}
          sub={cm ? `vs ${fmtYr(cm.debtPeakYear)}` : "Gross debt maximum"}
        />
        <MilestoneCard
          label="Net Creditor Year"
          value={fmtYr(m.netCreditorYear)}
          sub={cm ? `vs ${fmtYr(cm.netCreditorYear)}` : "AMCF equity > national debt"}
        />
        <MilestoneCard
          label="AMCF Self-Funding"
          value={fmtYr(m.amcfSelfFundingYear)}
          sub={cm ? `vs ${fmtYr(cm.amcfSelfFundingYear)}` : "Dividends >= citizen grants"}
        />
        <MilestoneCard
          label="Interest < 10%"
          value={fmtYr(m.interestThresholdYear)}
          sub={cm ? `vs ${fmtYr(cm.interestThresholdYear)}` : "of federal revenue"}
        />
      </div>

      {/* Presets + Compare */}
      <Card className="mt-6">
        <CardContent className="pt-5 pb-4 px-5 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Scenario Presets
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <PresetSelector
                presets={PRESET_LIST}
                value={activePreset}
                onChange={applyPreset}
              />
              {activePreset === "custom" && (
                <span className="text-xs text-muted-foreground ml-1">
                  (custom — sliders modified)
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-4 flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={e => setCompareMode(e.target.checked)}
                className="accent-cyan-600"
              />
              <span className="font-semibold text-cyan-700">Compare Mode</span>
            </label>
            {compareMode && (
              <>
                <span className="text-xs text-muted-foreground">Compare against:</span>
                <select
                  value={comparePreset}
                  onChange={e => setComparePreset(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs text-cyan-700"
                >
                  {presetKeys.map(k => (
                    <option key={k} value={k}>{PRESET_LABELS[k]}</option>
                  ))}
                </select>
                <span className="text-xs text-cyan-600">
                  — crossover: {fmtYr(cm?.fiscalCrossoverYear)}, debt peak: {fmtYr(cm?.debtPeakYear)}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main content: params + charts */}
      <div className="flex gap-4 items-start mt-6">

        {/* Parameter Panel */}
        <div className="w-[270px] shrink-0">
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Parameters
                </span>
                <button
                  onClick={() => setShowParams(!showParams)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showParams ? "hide" : "show"}
                </button>
              </div>
              {showParams && <ParameterPanel params={params} setParam={setParam} />}
            </CardContent>
          </Card>
        </div>

        {/* Chart Area */}
        <div className="flex-1 min-w-0 space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4 px-5">
              {/* Chart Tabs */}
              <Tabs value={activeChart} onValueChange={setActiveChart}>
                <TabsList className="mb-4">
                  {CHART_TABS.map(t => (
                    <TabsTrigger key={t.id} value={t.id} className="text-xs">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="deficit">
                  <DeficitChart rows={rows} compareRows={compareResult?.rows} />
                </TabsContent>
                <TabsContent value="debt">
                  <DebtChart rows={rows} compareRows={compareResult?.rows} />
                </TabsContent>
                <TabsContent value="interest">
                  <InterestChart rows={rows} compareRows={compareResult?.rows} />
                </TabsContent>
                <TabsContent value="amcf">
                  <AmcfChart rows={rows} compareRows={compareResult?.rows} />
                </TabsContent>
                <TabsContent value="revenue">
                  <RevenueChart rows={rows} compareRows={compareResult?.rows} />
                </TabsContent>
                <TabsContent value="credits">
                  <CreditsChart rows={rows} compareRows={compareResult?.rows} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Data Table — Key Metrics by Decade */}
          <Card>
            <CardContent className="pt-4 pb-4 px-5">
              <h3 className="text-lg font-semibold tracking-tight mb-3">Key Metrics by Decade</h3>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {["Year", "Nom. GDP", "AMCF Equity", "Own %", "Gross Debt", "Debt/GDP", "Deficit", "AMCF Cash Flow", "Healthcare Reserve", "Discretionary", "Grants/Cap", "Brake"].map(h => (
                        <TableHead key={h} className="text-right whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[1, 5, 10, 15, 20, 25, 30, 35].map(yr => {
                      const r = rows[yr - 1];
                      if (!r) return null;
                      return (
                        <TableRow key={yr} className={r.solventBrakeActive ? "bg-orange-50" : "bg-green-50/50"}>
                          <TableCell className="text-right font-semibold">{yr}</TableCell>
                          <TableCell className="text-right">${r.nominalGdp}T</TableCell>
                          <TableCell className="text-right font-semibold" style={{ color: C.amcf }}>${r.amcfEquity}T</TableCell>
                          <TableCell className="text-right" style={{ color: r.amcfOwnershipPct >= 20 ? C.accord : undefined }}>{r.amcfOwnershipPct}%</TableCell>
                          <TableCell className="text-right" style={{ color: C.debt }}>${r.grossDebt}T</TableCell>
                          <TableCell className="text-right" style={{ color: r.debtToGdp > 150 ? C.debt : r.debtToGdp < 100 ? C.accord : undefined }}>{r.debtToGdp}%</TableCell>
                          <TableCell className="text-right" style={{ color: r.deficit < 0 ? C.accord : C.debt }}>
                            {r.deficit < 0 ? `($${Math.abs(r.deficit).toFixed(2)}T)` : `$${r.deficit}T`}
                          </TableCell>
                          <TableCell className="text-right" style={{ color: C.credits }}>
                            ${r.amcfCashFlow}T <span className="text-muted-foreground text-[10px]">({r.combinedYield}%)</span>
                          </TableCell>
                          <TableCell className="text-right text-cyan-600">${r.healthcareAMCF}T</TableCell>
                          <TableCell className="text-right" style={{ color: r.solventBrakeActive ? "#9ca3af" : C.accord }}>
                            {r.solventBrakeActive ? "\u2014" : `$${r.discretionaryAMCF}T`}
                          </TableCell>
                          <TableCell className="text-right">${Number(r.grantsPerCapita).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-[10px]" style={{ color: r.solventBrakeActive ? C.debt : C.accord }}>
                            {r.solventBrakeActive ? "ACTIVE" : "off"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sensitivity + Export */}
      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <Button
          variant={showSensitivity ? "default" : "outline"}
          size="sm"
          onClick={() => setShowSensitivity(!showSensitivity)}
        >
          {showSensitivity ? "Hide" : "Show"} Sensitivity Analysis
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCSV(rows)}
        >
          Export CSV (35 rows)
        </Button>
        <span className="text-xs text-muted-foreground">
          Base: Growth Tax {(params.growthTaxRate * 100).toFixed(0)}% · VAT {(params.vatRate * 100).toFixed(0)}% · LVT {(params.lvtRate * 100).toFixed(0)}% · Prebate ${params.prebatePerCapita.toLocaleString()}/capita
        </span>
      </div>

      {showSensitivity && sensitivityData && (
        <Card className="mt-4">
          <CardContent className="pt-4 pb-4 px-5">
            <SensitivityTable data={sensitivityData} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
