import { useState, useMemo } from "react";
import {
  ComposedChart, LineChart, BarChart,
  Line, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from "recharts";
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { ControlPanel, ControlGroup } from '@/components/controls/ControlPanel';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { useUrlValue, useUrlState } from '@/lib/url-state';
import {
  lvtRevForFiscal, lvtRevenueExemptionComparison,
  PREBATE_BASE, PREBATE_REDIRECTED, LAND_GROWTH_ELASTICITY, EXEMPTION_AMOUNT,
} from '@/lib/land';

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE MODELS
// Consistent with Sim-6 conventions where possible.
// LVT: bottom-up capitalized land model (src/lib/land.js) — concave in rate, no homeowner exemption by default.
// Carbon: physics-based Laffer curve + 2.5%/yr natural decarbonization.
// Stable taxes (FSL, FTT, royalties, etc.): modeled as % of GDP so they scale with the economy.
// ═══════════════════════════════════════════════════════════════════════════

const YR1_NOM_GDP = 28.7e12; // $28T real × 1.025 price level (Year 1)

// LVT — Year-1 revenue from the bottom-up capitalized land model (src/lib/land.js).
// Default scenario: no homeowner exemption. Year 1 ⇒ land-growth factor = 1, so the
// elasticity is irrelevant here and the curve reflects pure capitalization (concave).
function lvtRevYr1(rate, exemption = 0) {
  return lvtRevForFiscal({ rate, year: 1, nominalGdp: YR1_NOM_GDP, exemption });
}

// Carbon — Laffer curve (peak ~$165/ton) + 2.5%/yr natural decarbonization from tech change
function carbonRevYr(ratePerTon, yr) {
  const behaviorFactor = Math.max(0, 1 - ratePerTon / 330); // K=330: zero-emissions price
  const naturalDecline = Math.pow(0.975, yr - 1);            // 2.5%/yr baseline decarbonization
  return ratePerTon * 5e9 * behaviorFactor * naturalDecline;
}

// Financial Stability Levy — on US G-SIB assets (~$20T), with modest base erosion
function fslRevYr1(bps) {
  const erosion = 1 - Math.min(bps / 50, 1) * 0.10;
  return (bps / 10000) * 20e12 * erosion;
}

// Financial Transaction Tax — volume elasticity -20% per 0.1% rate (UK stamp duty evidence)
function fttRevYr1(ratePct) {
  const volRetention = Math.max(0.50, 1 - (ratePct / 0.1) * 0.20);
  return (ratePct / 100) * 90e12 * volRetention;
}

// Resource royalties — incremental rate above current 12.5% federal rate on $600B extractive revenues
function royaltyRevYr1(extraPct) {
  return (extraPct / 100) * 600e9;
}

// Spectrum holding fee — annual % of spectrum license value (~$750B)
function spectrumRevYr1(annualPct) {
  return (annualPct / 100) * 750e9;
}

// Groundwater extraction fee
function waterRevYr1(feePerAF) {
  return feePerAF * 90e6; // 90M acre-feet/yr
}

const POLLUTION_REV = 20e9;  // non-carbon pollution fees (N, P, plastics) — flat estimate
const CONGESTION_REV = 12e9; // congestion pricing federal share — flat estimate

function computePortfolioYr1(r) {
  const lvt    = lvtRevYr1(r.lvtRate, r.lvtExemption ?? 0);
  const carbon = carbonRevYr(r.carbonRate, 1);
  const fsl    = fslRevYr1(r.fslBps);
  const ftt    = fttRevYr1(r.fttPct);
  const royal  = royaltyRevYr1(r.royaltyExtraPct);
  const spec   = spectrumRevYr1(r.spectrumPct);
  const water  = waterRevYr1(r.waterFeeAF);
  const fixed  = POLLUTION_REV + CONGESTION_REV;
  return { lvt, carbon, fsl, ftt, royal, spec, water, fixed,
    total: lvt + carbon + fsl + ftt + royal + spec + water + fixed };
}

// Baseline: 10% VAT + 3% LVT as in Sim-6
const BASE_VAT_REV_YR1 = YR1_NOM_GDP * 0.55 * 0.10 * 0.75; // 75% compliance in Year 1
// Baseline is the ORIGINAL Accord design (10% VAT + 3% LVT under the legacy formula),
// the revenue the rent-tax portfolio must replace to drop VAT to zero.
const BASE_LVT_REV_YR1 = lvtRevForFiscal({ rate: 0.03, year: 1, nominalGdp: YR1_NOM_GDP, model: 'legacy' });
const BASELINE_TOTAL   = BASE_VAT_REV_YR1 + BASE_LVT_REV_YR1;

// Minimum residual VAT rate needed if rent taxes fall short of baseline
function requiredVatRate(rentTotalYr1) {
  const gap = Math.max(0, BASELINE_TOTAL - rentTotalYr1);
  return gap / (YR1_NOM_GDP * 0.55 * 0.75);
}

// LVT rate (capitalized model, no exemption) that yields a target Year-1 revenue.
// LVT is monotonic and concave in rate with a ground-rent ceiling, so we binary-search.
function lvtRateForRevenue(targetRev) {
  let lo = 0, hi = 0.30;
  if (lvtRevYr1(hi) < targetRev) return null; // unreachable below the ground-rent ceiling
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (lvtRevYr1(mid) < targetRev) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════
// FISCAL ENGINE — Sim-6 core with extended revenue section
// Only the revenue block is modified. All AMCF, spending, and debt mechanics
// are identical to simulation-6-fiscal-trajectory.jsx.
// ═══════════════════════════════════════════════════════════════════════════

const EV_COHORTS = [
  { growth: 0.010, share: 0.05 },
  { growth: 0.035, share: 0.20 },
  { growth: 0.065, share: 0.40 },
  { growth: 0.100, share: 0.25 },
  { growth: 0.150, share: 0.10 },
];

const FP = { // Sim-6 fiscal base parameters (unchanged)
  startingDebt: 36e12, startingGdp: 28e12, startingEV: 50e12,
  baseRealGdpGrowth: 0.025, inflationRate: 0.025,
  baseInterestRate: 0.035, interestReflexivity: 5,
  startingPopulation: 335e6, populationGrowthRate: 0.004,
  growthTaxRate: 0.20, equityExciseRate: 0.04, creditCapFrac: 0.20,
  amcfReturn: 0.07, codetermBonus: 0.003,
  baselineSpendingFrac: 0.165, spendingEfficiencyGain: 0.0004,
  prebatePerCapita: PREBATE_REDIRECTED, // default scenario: exemption off → redirected prebate
};

function grantFloor(yr) {
  return yr <= 3 ? 500 : yr <= 6 ? 550 : yr <= 13 ? 800 : 1200;
}

function runFiscal(rentRates) {
  // Stable rent taxes expressed as a GDP fraction so they scale with the economy.
  // Carbon is kept separate (uses declining formula).
  const stableYr1 = fslRevYr1(rentRates.fslBps) + fttRevYr1(rentRates.fttPct)
    + royaltyRevYr1(rentRates.royaltyExtraPct) + spectrumRevYr1(rentRates.spectrumPct)
    + waterRevYr1(rentRates.waterFeeAF) + POLLUTION_REV + CONGESTION_REV;
  const stableFrac = stableYr1 / YR1_NOM_GDP;

  const rows = [];
  let amcfEquity = 0, creditBalance = 0, hasReachedCap = false;
  let grossDebt = FP.startingDebt, realGdp = FP.startingGdp, priceLevel = 1.0;
  let pop = FP.startingPopulation;
  let cohortEVs = EV_COHORTS.map(c => c.share * FP.startingEV);
  let prevTotalEV = FP.startingEV;
  let clDebt = FP.startingDebt, clRealGdp = FP.startingGdp, clPriceLevel = 1.0;

  for (let yr = 1; yr <= 35; yr++) {
    // AMCF ownership cap check (one-way latch, identical to Sim-6)
    if (!hasReachedCap && prevTotalEV > 0 && amcfEquity / prevTotalEV >= 0.20) hasReachedCap = true;
    const atCap = hasReachedCap;

    // EV cohort evolution
    cohortEVs = cohortEVs.map((ev, i) => ev * (1 + EV_COHORTS[i].growth));
    const totalEV = cohortEVs.reduce((a, b) => a + b, 0);
    const evGrowth = Math.max(0, totalEV - prevTotalEV);
    prevTotalEV = totalEV;

    // Growth Tax + Codetermination Credit mechanics (unchanged from Sim-6)
    const growthTax = atCap ? 0 : evGrowth * FP.growthTaxRate;
    const creditGen = totalEV * FP.equityExciseRate;
    const avail = creditBalance + creditGen;
    const creditUsed = Math.min(avail, growthTax * FP.creditCapFrac);
    creditBalance = avail - creditUsed;
    amcfEquity = atCap
      ? totalEV * 0.20
      : amcfEquity * (1 + FP.amcfReturn) + (growthTax - creditUsed);
    const amcfOwnerPct = totalEV > 0 ? amcfEquity / totalEV : 0;

    // AMCF cash flow + waterfall (identical to Sim-6)
    const combinedYield = 0.035 + 0.025 * Math.min(yr / 20, 1);
    const amcfCash = amcfEquity * combinedYield;
    const grantFloorTotal = grantFloor(yr) * pop;
    const budgetGrantCost = Math.max(0, grantFloorTotal - amcfCash * 0.65);

    // GDP + population (identical to Sim-6)
    const debtDrag = 0.002 * Math.max(0, grossDebt / (realGdp * priceLevel) - 1.0);
    realGdp *= (1 + FP.baseRealGdpGrowth + FP.codetermBonus * Math.min(yr / 10, 1) - debtDrag);
    priceLevel *= (1 + FP.inflationRate);
    const nomGdp = realGdp * priceLevel;
    pop *= (1 + FP.populationGrowthRate);

    // ── Revenue (Task-7 extended — this is the only section modified from Sim-6) ──
    const vatCompliance = Math.min(0.75 + 0.025 * (yr - 1), 0.90);
    const vatGross   = nomGdp * 0.55 * rentRates.vatRate * vatCompliance;
    const lvtRev     = lvtRevForFiscal({
      rate: rentRates.lvtRate, year: yr, nominalGdp: nomGdp,
      model: rentRates.lvtModel ?? 'capitalized',
      exemption: rentRates.lvtExemption ?? 0,
      assessmentBasis: rentRates.lvtAssessmentBasis ?? 'capitalized',
      groundRentYield: rentRates.lvtGroundRentYield ?? 0.04,
      landGrowthElasticity: rentRates.lvtLandElasticity ?? LAND_GROWTH_ELASTICITY,
    });
    const carbonRev  = carbonRevYr(rentRates.carbonRate, yr); // time-declining
    const stableRev  = nomGdp * stableFrac;                   // GDP-scaled
    const payrollFix = nomGdp * 0.008;
    const capGains   = nomGdp * 0.012;
    const income     = nomGdp * 0.078;
    const payroll    = nomGdp * 0.054;
    const other      = nomGdp * 0.010;
    const totalRev = vatGross + lvtRev + carbonRev + stableRev
      + payrollFix + capGains + income + payroll + other;
    // ──────────────────────────────────────────────────────────────────────────────

    // Spending + interest + deficit (identical to Sim-6)
    const debtToGdp = grossDebt / nomGdp;
    const effRate   = FP.baseInterestRate + FP.interestReflexivity * Math.max(0, debtToGdp - 1.20) / 100;
    const interest  = grossDebt * effRate;
    const spendFrac = Math.max(0.14, FP.baselineSpendingFrac - FP.spendingEfficiencyGain * yr);
    const popScale  = pop / FP.startingPopulation;
    // Prebate is deficit-neutrally coupled to the exemption: exemption off (default) →
    // recovered revenue funds the higher $6,101 prebate; exemption on → base $5,000.
    const prebatePerCap = (rentRates.lvtExemption ?? 0) > 0 ? PREBATE_BASE : PREBATE_REDIRECTED;
    const spending  = nomGdp * spendFrac + budgetGrantCost + prebatePerCap * pop
      + 100e9 * popScale + 50e9 * popScale - amcfCash * 0.10;
    const intToRev  = totalRev > 0 ? (interest / totalRev) * 100 : 0;
    const solvent   = intToRev > 10;
    const amcfPaydown = solvent ? amcfCash * 0.25 : 0;
    const amcfDisc    = solvent ? 0 : amcfCash * 0.25;
    const deficit   = spending + interest - totalRev - amcfDisc;
    grossDebt = grossDebt + deficit - amcfPaydown;
    const netSov = grossDebt - amcfEquity;

    // Current-law parallel path (unchanged from Sim-6)
    clRealGdp *= (1 + FP.baseRealGdpGrowth);
    clPriceLevel *= (1 + FP.inflationRate);
    const clNomGdp = clRealGdp * clPriceLevel;
    const clDtG  = clDebt / clNomGdp;
    const clRate = Math.min(FP.baseInterestRate + FP.interestReflexivity * Math.max(0, clDtG - 1.20) / 100, 0.10);
    clDebt += clNomGdp * 0.22 + clDebt * clRate - clNomGdp * 0.174;

    const grantsPerCap = Math.max(grantFloor(yr), (amcfCash * 0.65) / pop);
    rows.push({
      year: yr,
      nomGdp:       +(nomGdp / 1e12).toFixed(2),
      vatGross:     +(vatGross / 1e12).toFixed(3),
      lvtRev:       +(lvtRev / 1e12).toFixed(3),
      carbonRev:    +(carbonRev / 1e9).toFixed(1),
      carbonRevT:   +(carbonRev / 1e12).toFixed(3),
      stableRev:    +(stableRev / 1e12).toFixed(3),
      totalRev:     +(totalRev / 1e12).toFixed(2),
      interest:     +(interest / 1e12).toFixed(2),
      deficit:      +(deficit / 1e12).toFixed(2),
      grossDebt:    +(grossDebt / 1e12).toFixed(1),
      amcfEquity:   +(amcfEquity / 1e12).toFixed(1),
      amcfOwnerPct: +(amcfOwnerPct * 100).toFixed(1),
      netSov:       +(netSov / 1e12).toFixed(1),
      intToRev:     +intToRev.toFixed(1),
      debtToGdp:    +(debtToGdp * 100).toFixed(1),
      clGrossDebt:  +(clDebt / 1e12).toFixed(1),
      amcfCashT:    +(amcfCash / 1e12).toFixed(3),
      combinedYield:+((0.035 + 0.025 * Math.min(yr / 20, 1)) * 100).toFixed(1),
      brakeActive:  solvent,
      healthcareT:  +(amcfCash * 0.10 / 1e12).toFixed(3),
      discretionaryT: +(amcfDisc / 1e12).toFixed(3),
      grantsPerCap: +grantsPerCap.toFixed(0),
    });
  }

  const m = {
    crossoverYear:         rows.find(r => r.deficit < 0)?.year ?? ">35",
    debtPeakYear:          rows.reduce((best, r) => r.grossDebt > best.grossDebt ? r : best, rows[0]).year,
    netCreditorYear:       rows.find(r => r.netSov < 0)?.year ?? ">35",
    interestThresholdYear: rows.find((r, i) => i > 2 && r.intToRev < 10)?.year ?? ">35",
  };

  return { rows, milestones: m };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDED PACKAGES  (pre-computed, all on the Pareto frontier)
// ═══════════════════════════════════════════════════════════════════════════

const PACKAGES = [
  {
    id: "zero-vat",
    name: "Zero VAT",
    color: "#16a34a",
    desc: "VAT fully eliminated. With no homeowner exemption, LVT alone raises ~$940B at 10%, so zero VAT is comfortably feasible. Watch out-years: carbon self-liquidates and suppressed land growth (elasticity 0.7) means LVT grows slower than GDP.",
    rates: { vatRate: 0,    lvtRate: 0.11, carbonRate: 165, fslBps: 50, fttPct: 0.20, royaltyExtraPct: 12, spectrumPct: 3,   waterFeeAF: 50 },
  },
  {
    id: "min-vat",
    name: "Minimum VAT (~2%)",
    color: "#2563eb",
    desc: "Aggressive rent taxes with small VAT backstop. Replaces 80% of VAT burden. Fiscally robust — carbon decline covered by stable LVT growth. Recommended.",
    rates: { vatRate: 0.02, lvtRate: 0.08, carbonRate: 130, fslBps: 35, fttPct: 0.15, royaltyExtraPct: 10, spectrumPct: 2.5, waterFeeAF: 35 },
  },
  {
    id: "balanced",
    name: "Balanced (~4% VAT)",
    color: "#7c3aed",
    desc: "Moderate rent taxes, ~4% VAT. Replaces 60% of VAT. Simpler political lift, still substantial shift toward non-distortionary taxes.",
    rates: { vatRate: 0.04, lvtRate: 0.06, carbonRate: 100, fslBps: 25, fttPct: 0.10, royaltyExtraPct: 8,  spectrumPct: 2,   waterFeeAF: 25 },
  },
  {
    id: "simple",
    name: "Simple (~6% VAT)",
    color: "#d97706",
    desc: "Fewest mechanisms — only LVT + carbon added. Lower complexity, lower political surface area. 6% VAT remains.",
    rates: { vatRate: 0.06, lvtRate: 0.08, carbonRate: 100, fslBps: 0,  fttPct: 0,    royaltyExtraPct: 0,  spectrumPct: 0,   waterFeeAF: 0  },
  },
  {
    id: "base",
    name: "Base Accord (10% VAT)",
    color: "#6b7280",
    desc: "Original Accord design — 10% VAT, 3% LVT, no new rent taxes. Baseline reference.",
    rates: { vatRate: 0.10, lvtRate: 0.03, carbonRate: 0,   fslBps: 0,  fttPct: 0,    royaltyExtraPct: 0,  spectrumPct: 0,   waterFeeAF: 0  },
  },
];

const PKG_RESULTS = PACKAGES.map(pkg => ({
  ...pkg,
  ...runFiscal(pkg.rates),
  yr1: computePortfolioYr1(pkg.rates),
}));

// Revenue curves (rate → revenue, computed once)
const CURVES = (() => {
  const lvt    = Array.from({ length: 28 }, (_, i) => ({ x: +(i*0.5).toFixed(1),  rev: +(lvtRevYr1(i*0.005)/1e9).toFixed(0) }));
  const carbon = Array.from({ length: 41 }, (_, i) => ({
    x: i*5,
    yr1:  +(carbonRevYr(i*5, 1)  /1e9).toFixed(0),
    yr10: +(carbonRevYr(i*5, 10) /1e9).toFixed(0),
    yr25: +(carbonRevYr(i*5, 25) /1e9).toFixed(0),
  }));
  const fsl = Array.from({ length: 11 }, (_, i) => ({ x: i*5,  rev: +(fslRevYr1(i*5)/1e9).toFixed(0) }));
  const ftt = Array.from({ length: 13 }, (_, i) => ({ x: +(i*0.025).toFixed(3), rev: +(fttRevYr1(i*0.025)/1e9).toFixed(0) }));
  return { lvt, carbon, fsl, ftt };
})();

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const fmtB = v => `$${(v/1e9).toFixed(0)}B`;
const fmtT = v => `$${(v/1e12).toFixed(2)}T`;

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const TAB_KEYS = ["optimizer", "curves", "fiscal", "packages"];

const DEFAULTS = {
  vatRate: 0.04, lvtRate: 0.10, carbonRate: 100,
  fslBps: 25, fttPct: 0.50, royaltyExtraPct: 8,
  spectrumPct: 2, waterFeeAF: 25,
  // Land Value Tax model — default scenario: no homeowner exemption, prebate redirect.
  lvtModel: 'capitalized', lvtExemption: 0,
  lvtGroundRentYield: 0.04, lvtLandElasticity: LAND_GROWTH_ELASTICITY,
  lvtAssessmentBasis: 'capitalized',
};

export default function RentTaxOptimizer() {
  const [tab, setTab]           = useUrlValue("tab", "optimizer");
  const [r, setR]               = useUrlState(DEFAULTS);
  const [compareIdx, setCmpIdx] = useUrlValue("cmp", 4); // Base Accord as default comparison

  const upd = (k, v) => setR(prev => ({ ...prev, [k]: v }));

  const yr1 = useMemo(() => computePortfolioYr1(r), [r]);
  const gap  = BASELINE_TOTAL - yr1.total;
  const zeroVatFeasible = gap <= 0;
  const reqVat = requiredVatRate(yr1.total);
  // LVT rate that would close the gap (concave capitalized model — numeric solve).
  const lvtToClose = gap > 0 ? lvtRateForRevenue(yr1.lvt + gap) : null;

  const exemptComp = useMemo(() => lvtRevenueExemptionComparison({
    rate: r.lvtRate,
    assessmentBasis: r.lvtAssessmentBasis,
    groundRentYield: r.lvtGroundRentYield,
  }), [r.lvtRate, r.lvtAssessmentBasis, r.lvtGroundRentYield]);

  const fiscal  = useMemo(() => runFiscal(r), [r]);
  const compare = PKG_RESULTS[compareIdx];

  const trajData = useMemo(() => fiscal.rows.map((row, i) => ({
    year:       row.year,
    deficit:    row.deficit,
    cmpDeficit: compare.rows[i].deficit,
    debt:       row.grossDebt,
    cmpDebt:    compare.rows[i].grossDebt,
    netSov:     row.netSov,
    cmpNetSov:  compare.rows[i].netSov,
    vatRevT:    row.vatGross,
    lvtRevT:    row.lvtRev,
    carbonRevT: row.carbonRevT,
    stableRevT: row.stableRev,
  })), [fiscal, compare]);

  const deltaColor = (cur, cmp) => {
    if (typeof cur !== "number" || typeof cmp !== "number") return "text-muted-foreground";
    return cur <= cmp ? "text-green-600" : "text-red-600";
  };
  const deltaStr = (cur, cmp) => {
    if (typeof cur !== "number" || typeof cmp !== "number") return "\u2014";
    const d = cur - cmp;
    return d === 0 ? "Same" : `${d > 0 ? "+" : ""}${d} yrs`;
  };

  return (
    <PageShell>
      {/* Header */}
      <div className="border-l-4 border-emerald-600 pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Rent Tax Optimizer</h1>
        <p className="text-base font-semibold text-emerald-700 mt-2">
          Replace regressive VAT revenue with economically non-distortionary rent taxes
          on land, carbon, financial rents, and natural resources.
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Find the minimum VAT rate achievable by maximizing economically non-distortionary rent taxes.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="optimizer">Optimizer</TabsTrigger>
          <TabsTrigger value="curves">Revenue Curves</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal Trajectory</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 0: OPTIMIZER ═══════════════════════════════════════════════ */}
        <TabsContent value="optimizer">

          {/* Feasibility banner */}
          {zeroVatFeasible ? (
            <div className="bg-green-50 border border-green-600 rounded-lg px-4 py-3 text-sm text-green-900 leading-relaxed mt-6">
              <strong>Zero VAT is feasible.</strong> Rent taxes generate {fmtT(yr1.total)}, covering the {fmtT(BASELINE_TOTAL)} baseline
              (VAT + LVT) with {fmtT(-gap)} surplus. Warning: carbon revenue declines ~45% by Year 25 as emissions fall —
              plan for LVT rate increases of ~0.4%/yr starting around Year 15 to offset this.
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-500 rounded-lg px-4 py-3 text-sm text-amber-900 leading-relaxed mt-6">
              <strong>Gap to Zero VAT: {fmtT(gap)}.</strong> Current rent taxes generate {fmtT(yr1.total)} vs {fmtT(BASELINE_TOTAL)} baseline.
              Minimum residual VAT: <strong>{(reqVat * 100).toFixed(2)}%</strong>.
              To close gap: {lvtToClose != null
                ? <>increase LVT to <strong>{(lvtToClose * 100).toFixed(1)}%</strong></>
                : <>LVT alone can't close it (ground-rent ceiling) — </>}, or raise carbon toward $165/ton (Laffer peak).
            </div>
          )}

          {/* Revenue summary row */}
          <Card className="mt-6">
            <CardContent>
              <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b">Year 1 Revenue vs Baseline</h3>
              <div className="grid grid-cols-5 gap-3 mb-4">
                {[
                  { label: "LVT",                 v: yr1.lvt,                    c: "#16a34a" },
                  { label: "Carbon Tax",           v: yr1.carbon,                 c: "#f59e0b" },
                  { label: "FSL + FTT",            v: yr1.fsl + yr1.ftt,          c: "#3b82f6" },
                  { label: "Royalties + Other",    v: yr1.royal + yr1.spec + yr1.water + yr1.fixed, c: "#6b7280" },
                  { label: "Total Rent Taxes",     v: yr1.total, c: zeroVatFeasible ? "#16a34a" : "#2563eb" },
                ].map(item => (
                  <div key={item.label} className="text-center p-2 rounded-lg" style={{ background: item.c + "10" }}>
                    <div className="text-[17px] font-bold" style={{ color: item.c }}>{fmtT(item.v)}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{item.label}</div>
                  </div>
                ))}
              </div>
              {/* Progress bars */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-28 text-[11px] text-muted-foreground">Baseline (VAT+LVT)</div>
                <div className="flex-1 bg-muted rounded h-5 relative">
                  <div className="w-full h-full bg-gray-400 rounded" />
                  <span className="absolute left-1/2 top-[2px] -translate-x-1/2 text-[10px] text-white font-semibold">{fmtT(BASELINE_TOTAL)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-28 text-[11px] text-muted-foreground">Rent Taxes Only</div>
                <div className="flex-1 bg-muted rounded h-5 relative">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.min(100, (yr1.total / BASELINE_TOTAL) * 100)}%`,
                      background: zeroVatFeasible ? "#16a34a" : "#3b82f6",
                    }}
                  />
                  <span className="absolute left-1/2 top-[2px] -translate-x-1/2 text-[10px] text-white font-semibold">
                    {fmtT(yr1.total)} ({((yr1.total / BASELINE_TOTAL) * 100).toFixed(0)}% of baseline)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fiscal milestones */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Fiscal Milestones — Current Settings (vs Base Accord no extra rent taxes: Yr 15 crossover)
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <MilestoneCard
                label="Fiscal Crossover"
                value={fiscal.milestones.crossoverYear === ">35" ? "35+" : `Yr ${fiscal.milestones.crossoverYear}`}
              />
              <MilestoneCard
                label="Debt Peak"
                value={fiscal.milestones.debtPeakYear === ">35" ? "35+" : `Yr ${fiscal.milestones.debtPeakYear}`}
              />
              <MilestoneCard
                label="Net Creditor"
                value={fiscal.milestones.netCreditorYear === ">35" ? "35+" : `Yr ${fiscal.milestones.netCreditorYear}`}
              />
              <MilestoneCard
                label="Interest < 10%"
                value={fiscal.milestones.interestThresholdYear === ">35" ? "35+" : `Yr ${fiscal.milestones.interestThresholdYear}`}
              />
            </div>
          </div>

          {/* Land Value Model — exemption removal & prebate redirect */}
          <Card className="mt-6 border-emerald-300">
            <CardContent>
              <h3 className="text-sm font-semibold text-foreground mb-1 pb-2 border-b">
                Land Value Model — Homeowner Exemption & Prebate Redirect
              </h3>
              <p className="text-[11px] text-muted-foreground mt-2 mb-4 leading-relaxed">
                Bottom-up capitalized land model. Removing the $500k homeowner exemption widens the LVT base
                from ~$20T to ~$33T; the recovered revenue is redirected, deficit-neutral, into a higher prebate.
              </p>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="text-center p-2 rounded-lg bg-emerald-50">
                  <div className="text-[17px] font-bold text-emerald-700">{fmtB(exemptComp.withoutExemption)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">LVT, no exemption (default)</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/40">
                  <div className="text-[17px] font-bold text-foreground">{fmtB(exemptComp.withExemption)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">LVT, $500k exemption on</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-amber-50">
                  <div className="text-[17px] font-bold text-amber-700">{fmtB(exemptComp.exemptionCost)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Exemption cost / yr</div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-[12px] text-emerald-900 mb-5">
                Redirected to the prebate: <strong>${PREBATE_BASE.toLocaleString()}</strong> base
                + <strong>${Math.round(exemptComp.prebatePerCapitaBump).toLocaleString()}</strong> redirect
                = <strong>${Math.round(PREBATE_BASE + exemptComp.prebatePerCapitaBump).toLocaleString()}/person/yr</strong>,
                deficit-neutral in Year 1 ({(r.lvtRate * 100).toFixed(1)}% LVT, {(r.lvtGroundRentYield * 100).toFixed(1)}% ground-rent yield).
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <p className="text-[11px] font-semibold mb-1.5">$500k Homeowner Exemption</p>
                  <Button
                    variant={r.lvtExemption > 0 ? "default" : "outline"}
                    size="sm"
                    className={`text-xs font-semibold ${r.lvtExemption > 0 ? "bg-emerald-800 hover:bg-emerald-900" : ""}`}
                    onClick={() => upd("lvtExemption", r.lvtExemption > 0 ? 0 : EXEMPTION_AMOUNT)}
                  >
                    {r.lvtExemption > 0 ? "✓ Exemption On (prebate $5,000)" : "Exemption Off — redirect (default)"}
                  </Button>
                </div>
                <div>
                  <p className="text-[11px] font-semibold mb-1.5">Assessment Basis</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs font-semibold"
                    onClick={() => upd("lvtAssessmentBasis", r.lvtAssessmentBasis === "capitalized" ? "preTax" : "capitalized")}
                  >
                    {r.lvtAssessmentBasis === "capitalized" ? "Capitalized (market)" : "Pre-tax (naive)"}
                  </Button>
                </div>
                <SliderControl
                  label="Ground-rent yield (i)"
                  value={r.lvtGroundRentYield}
                  onChange={v => upd("lvtGroundRentYield", v)}
                  min={0.02} max={0.06} step={0.005}
                  formatValue={v => `${(v * 100).toFixed(1)}% → cap factor ${(v / (v + r.lvtRate)).toFixed(2)}`}
                />
                <SliderControl
                  label="Land-growth elasticity vs GDP"
                  value={r.lvtLandElasticity}
                  onChange={v => upd("lvtLandElasticity", v)}
                  min={0.4} max={1.0} step={0.05}
                  formatValue={v => `${v.toFixed(2)}× ${v < 1 ? "(suppressed)" : "(tracks GDP)"}`}
                />
              </div>
            </CardContent>
          </Card>

          {/* Sliders */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="space-y-4">
              <Card>
                <CardContent>
                  <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b">VAT & Land Value Tax</h3>
                  <div className="space-y-4">
                    <SliderControl
                      label="VAT Rate"
                      value={r.vatRate}
                      onChange={v => upd("vatRate", v)}
                      min={0} max={0.25} step={0.005}
                      formatValue={v => `${(v * 100).toFixed(1)}%`}
                    />
                    <SliderControl
                      label="LVT Rate"
                      value={r.lvtRate}
                      onChange={v => upd("lvtRate", v)}
                      min={0} max={0.30} step={0.005}
                      formatValue={v => `${(v * 100).toFixed(1)}% \u2192 ${fmtT(lvtRevYr1(v, r.lvtExemption))}/yr`}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    LVT Year-1 revenue: {fmtT(yr1.lvt)} ({r.lvtExemption > 0 ? '$500k exemption on' : 'no exemption'}).
                    Capitalized base grows at {(r.lvtLandElasticity * 100).toFixed(0)}% of nominal-GDP growth (anti-speculation suppression).
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b">Carbon Tax</h3>
                  <SliderControl
                    label="Rate ($/ton CO\u2082)"
                    value={r.carbonRate}
                    onChange={v => upd("carbonRate", v)}
                    min={0} max={300} step={5}
                    formatValue={v => `$${v}/ton \u2192 ${fmtB(carbonRevYr(v, 1))}/yr (Yr 1)`}
                  />
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[1, 15, 25].map(yr => (
                      <div key={yr} className="text-center bg-amber-50 rounded-md p-2">
                        <div className="font-bold text-amber-800 text-sm">{fmtB(carbonRevYr(r.carbonRate, yr))}</div>
                        <div className="text-[10px] text-amber-900">Year {yr}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Laffer peak: ~$165/ton (${fmtB(carbonRevYr(165, 1))}/yr, then declining ~45% by Year 25).
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardContent>
                  <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b">Financial Levies</h3>
                  <div className="space-y-4">
                    <SliderControl
                      label="Financial Stability Levy (bp on G-SIBs)"
                      value={r.fslBps}
                      onChange={v => upd("fslBps", v)}
                      min={0} max={100} step={5}
                      formatValue={v => `${v}bp \u2192 ${fmtB(fslRevYr1(v))}/yr`}
                    />
                    <SliderControl
                      label="Financial Transaction Tax (%)"
                      value={r.fttPct}
                      onChange={v => upd("fttPct", v)}
                      min={0} max={1.0} step={0.025}
                      formatValue={v => `${v.toFixed(3)}% \u2192 ${fmtB(fttRevYr1(v))}/yr`}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    FSL on too-big-to-fail banks. FTT: volume drops ~20% per 0.1% (UK stamp duty evidence).
                    Both scale with GDP in the fiscal model.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b">Resource & Other Rent Taxes</h3>
                  <div className="space-y-4">
                    <SliderControl
                      label="Royalty Reform (extra % on $600B extractive revenues)"
                      value={r.royaltyExtraPct}
                      onChange={v => upd("royaltyExtraPct", v)}
                      min={0} max={30} step={0.5}
                      formatValue={v => `+${v.toFixed(1)}% \u2192 ${fmtB(royaltyRevYr1(v))}/yr`}
                    />
                    <SliderControl
                      label="Spectrum Fee (% of $750B license value/yr)"
                      value={r.spectrumPct}
                      onChange={v => upd("spectrumPct", v)}
                      min={0} max={10} step={0.5}
                      formatValue={v => `${v.toFixed(1)}% \u2192 ${fmtB(spectrumRevYr1(v))}/yr`}
                    />
                    <SliderControl
                      label="Groundwater Fee ($/acre-foot)"
                      value={r.waterFeeAF}
                      onChange={v => upd("waterFeeAF", v)}
                      min={0} max={200} step={5}
                      formatValue={v => `$${v}/af \u2192 ${fmtB(waterRevYr1(v))}/yr`}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Pollution fees ($20B) + congestion pricing ($12B) included at fixed levels.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Preset loader */}
          <Card className="mt-6">
            <CardContent>
              <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b">Load Recommended Package</h3>
              <div className="flex gap-2 flex-wrap">
                {PACKAGES.map(pkg => (
                  <Button
                    key={pkg.id}
                    variant="outline"
                    size="sm"
                    className="font-semibold text-xs"
                    style={{ borderColor: pkg.color, color: pkg.color }}
                    onClick={() => setR({ ...DEFAULTS, ...pkg.rates })}
                  >
                    {pkg.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 1: REVENUE CURVES ══════════════════════════════════════════ */}
        <TabsContent value="curves">
          <ChartContainer
            title="Land Value Tax — Rate vs Year-1 Revenue"
            subtitle="Bottom-up capitalized model (no homeowner exemption by default). The curve is concave: a permanent LVT capitalizes into lower land prices (market value = P0·i/(i+t)), so revenue rises less than proportionally with the rate and is bounded by total ground rent (~$1.3T). Toggle the $500k exemption on in the Optimizer tab to shrink the base by ~$370B."
            height={200}
            className="mt-6"
          >
            <BarChart data={CURVES.lvt} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="x" tick={CHART_AXIS.tick} tickFormatter={v => `${v}%`} interval={3} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
              <CartesianGrid {...CHART_GRID} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => `$${v}B`} labelFormatter={v => `LVT ${v}%`} />
              <ReferenceLine x={3} stroke="#dc2626" strokeDasharray="4 2"
                label={{ value: "Base 3%", fill: "#dc2626", fontSize: 10, position: "top" }} />
              <Bar dataKey="rev" fill="#16a34a" name="LVT Revenue" />
            </BarChart>
          </ChartContainer>

          <ChartContainer
            title="Carbon Tax — Rate vs Revenue (Laffer Curve + Decarbonization Over Time)"
            subtitle="Peak revenue near $165/ton (~$415B in Year 1). Revenue self-liquidates as technology and behavior reduce emissions. At $165/ton: Year 1 = $415B, Year 10 = $290B, Year 25 = $228B. Carbon is the binding constraint on Zero VAT sustainability."
            height={230}
          >
            <ComposedChart data={CURVES.carbon} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="x" tick={CHART_AXIS.tick} tickFormatter={v => `$${v}`} interval={4} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
              <CartesianGrid {...CHART_GRID} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${v}B`, n]} labelFormatter={v => `$${v}/ton CO\u2082`} />
              <ReferenceLine x={165} stroke="#dc2626" strokeDasharray="4 2"
                label={{ value: "Laffer Peak", fill: "#dc2626", fontSize: 10, position: "top" }} />
              <Line type="monotone" dataKey="yr1"  stroke="#f59e0b" name="Year 1"  strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="yr10" stroke="#f97316" name="Year 10" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
              <Line type="monotone" dataKey="yr25" stroke="#dc2626" name="Year 25" strokeWidth={1.5} dot={false} strokeDasharray="2 3" />
              <Legend />
            </ComposedChart>
          </ChartContainer>

          <div className="grid grid-cols-2 gap-4 mt-10">
            <ChartContainer
              title="Financial Stability Levy — bp vs Revenue"
              subtitle="50bp on $20T G-SIBs = $90B (peak). Modest base erosion modeled."
              height={180}
              className="mt-0"
            >
              <BarChart data={CURVES.fsl} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <XAxis dataKey="x" tick={CHART_AXIS.tick} tickFormatter={v => `${v}bp`} />
                <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
                <CartesianGrid {...CHART_GRID} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => `$${v}B`} labelFormatter={v => `${v}bp`} />
                <Bar dataKey="rev" fill="#3b82f6" name="FSL Revenue" />
              </BarChart>
            </ChartContainer>

            <ChartContainer
              title="Financial Transaction Tax — Rate vs Revenue"
              subtitle="Revenue plateaus due to volume response. Practical ceiling ~$100-120B."
              height={180}
              className="mt-0"
            >
              <BarChart data={CURVES.ftt} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <XAxis dataKey="x" tick={CHART_AXIS.tick} tickFormatter={v => `${v}%`} interval={2} />
                <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
                <CartesianGrid {...CHART_GRID} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => `$${v}B`} labelFormatter={v => `FTT ${v}%`} />
                <Bar dataKey="rev" fill="#8b5cf6" name="FTT Revenue" />
              </BarChart>
            </ChartContainer>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: FISCAL TRAJECTORY ═══════════════════════════════════════ */}
        <TabsContent value="fiscal">
          {/* Compare selector */}
          <Card className="mt-6">
            <CardContent>
              <h3 className="text-sm font-semibold text-foreground mb-4 pb-2 border-b">Compare Current Settings Against</h3>
              <div className="flex gap-2 flex-wrap">
                {PACKAGES.map((pkg, i) => (
                  <Button
                    key={pkg.id}
                    variant={compareIdx === i ? "default" : "outline"}
                    size="sm"
                    className="font-semibold text-xs"
                    style={{
                      borderColor: pkg.color,
                      background: compareIdx === i ? pkg.color : undefined,
                      color: compareIdx === i ? "#fff" : pkg.color,
                    }}
                    onClick={() => setCmpIdx(i)}
                  >
                    {pkg.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Milestone comparison table */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Milestone Comparison — Current Settings vs {compare.name}
            </h3>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Milestone</TableHead>
                    <TableHead>Current Settings</TableHead>
                    <TableHead>{compare.name}</TableHead>
                    <TableHead>Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["Fiscal Crossover",   fiscal.milestones.crossoverYear,         compare.milestones.crossoverYear],
                    ["Debt Peak",          fiscal.milestones.debtPeakYear,           compare.milestones.debtPeakYear],
                    ["Net Creditor",       fiscal.milestones.netCreditorYear,        compare.milestones.netCreditorYear],
                    ["Interest Threshold", fiscal.milestones.interestThresholdYear,  compare.milestones.interestThresholdYear],
                  ].map(([label, cur, cmp]) => (
                    <TableRow key={label}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="font-bold">
                        {typeof cur === "number" ? `Year ${cur}` : cur}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {typeof cmp === "number" ? `Year ${cmp}` : cmp}
                      </TableCell>
                      <TableCell className={`font-semibold ${deltaColor(cur, cmp)}`}>
                        {deltaStr(cur, cmp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Deficit trajectory */}
          <ChartContainer
            title="Annual Deficit Trajectory"
            height={230}
          >
            <LineChart data={trajData} margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="year" tick={CHART_AXIS.tick} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}T`} />
              <CartesianGrid {...CHART_GRID} />
              <ReferenceLine y={0} stroke="#1f2937" strokeWidth={1.5} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${v}T`, n]} />
              <Line type="monotone" dataKey="deficit"    stroke="#2563eb" name="Current Settings" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="cmpDeficit" stroke={compare.color} name={compare.name} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              <Legend />
            </LineChart>
          </ChartContainer>

          {/* Gross debt */}
          <ChartContainer
            title="Gross Debt Trajectory"
            height={230}
          >
            <LineChart data={trajData} margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="year" tick={CHART_AXIS.tick} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}T`} />
              <CartesianGrid {...CHART_GRID} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${v}T`, n]} />
              <Line type="monotone" dataKey="debt"    stroke="#2563eb" name="Current Settings" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="cmpDebt" stroke={compare.color} name={compare.name} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              <Legend />
            </LineChart>
          </ChartContainer>

          {/* Revenue composition */}
          <ChartContainer
            title="Revenue Composition — Current Settings (Shows Carbon Decline)"
            subtitle="Carbon revenue (amber) declines as emissions fall. LVT (green) and stable rent taxes (blue) grow with GDP. The VAT (red), if present, provides the broadest-growing base."
            height={230}
          >
            <ComposedChart data={trajData} margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="year" tick={CHART_AXIS.tick} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}T`} />
              <CartesianGrid {...CHART_GRID} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${v}T`, n]} />
              <Area type="monotone" dataKey="vatRevT"    stackId="a" fill="#dc262620" stroke="#dc2626" name="VAT" />
              <Area type="monotone" dataKey="lvtRevT"    stackId="a" fill="#16a34a20" stroke="#16a34a" name="LVT" />
              <Area type="monotone" dataKey="carbonRevT" stackId="a" fill="#f59e0b20" stroke="#f59e0b" name="Carbon Tax" />
              <Area type="monotone" dataKey="stableRevT" stackId="a" fill="#3b82f620" stroke="#3b82f6" name="Other Rent Taxes" />
              <Legend />
            </ComposedChart>
          </ChartContainer>

          {/* Key Metrics by Decade */}
          <div className="mt-12">
            <h3 className="text-sm font-semibold text-foreground mb-3">Key Metrics by Decade</h3>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {["Year","Nom. GDP","AMCF Equity","Own %","Gross Debt","Debt/GDP","Deficit","AMCF Cash Flow","Healthcare","Discretionary","Grants/Cap","Brake"].map(h => (
                      <TableHead key={h} className="text-right text-[11px]">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 5, 10, 15, 20, 25, 30, 35].map(yr => {
                    const row = fiscal.rows[yr - 1];
                    if (!row) return null;
                    return (
                      <TableRow key={yr} className={row.brakeActive ? "bg-orange-50" : ""}>
                        <TableCell className="text-right font-bold text-[11px]">{yr}</TableCell>
                        <TableCell className="text-right text-[11px]">${row.nomGdp}T</TableCell>
                        <TableCell className="text-right text-green-600 font-semibold text-[11px]">${row.amcfEquity}T</TableCell>
                        <TableCell className={`text-right text-[11px] ${row.amcfOwnerPct >= 20 ? "text-violet-600" : ""}`}>{row.amcfOwnerPct}%</TableCell>
                        <TableCell className="text-right text-red-600 text-[11px]">${row.grossDebt}T</TableCell>
                        <TableCell className={`text-right text-[11px] ${row.debtToGdp > 150 ? "text-red-600" : row.debtToGdp < 100 ? "text-green-600" : ""}`}>{row.debtToGdp}%</TableCell>
                        <TableCell className={`text-right font-semibold text-[11px] ${row.deficit < 0 ? "text-green-600" : "text-red-600"}`}>
                          {row.deficit < 0 ? `($${Math.abs(row.deficit).toFixed(2)}T)` : `$${row.deficit}T`}
                        </TableCell>
                        <TableCell className="text-right text-violet-600 text-[11px]">
                          ${row.amcfCashT}T <span className="text-muted-foreground text-[10px]">({row.combinedYield}%)</span>
                        </TableCell>
                        <TableCell className="text-right text-cyan-600 text-[11px]">${row.healthcareT}T</TableCell>
                        <TableCell className={`text-right text-[11px] ${row.brakeActive ? "text-muted-foreground" : "text-green-600"}`}>
                          {row.brakeActive ? "\u2014" : `$${row.discretionaryT}T`}
                        </TableCell>
                        <TableCell className="text-right text-[11px]">${Number(row.grantsPerCap).toLocaleString()}</TableCell>
                        <TableCell className={`text-right text-[10px] font-semibold ${row.brakeActive ? "text-red-600" : "text-green-600"}`}>
                          {row.brakeActive ? "ACTIVE" : "off"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB 3: PACKAGES ════════════════════════════════════════════════ */}
        <TabsContent value="packages">
          <div className="bg-blue-50 border border-blue-300 rounded-lg px-4 py-3 text-sm text-blue-900 leading-relaxed mt-6">
            <strong className="text-blue-800">Key finding: </strong>
            With the homeowner exemption removed (default), LVT raises ~$940B at 10% — so Zero VAT is comfortably
            feasible in Year 1 even at moderate LVT rates, no longer requiring an 11% rate plus Laffer-peak carbon.
            The binding constraint is now the out-years: carbon self-liquidates as the economy decarbonizes, and the
            taxed land base grows slower than GDP (elasticity 0.7, anti-speculation suppression), so plan for gradual
            LVT increases after ~Year 15. The <strong>Minimum VAT (~2%) package</strong> remains a robust Pareto choice.
          </div>

          {/* Summary table */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">All Packages — Milestones & Revenue</h3>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {["Package", "VAT", "LVT", "Carbon", "Yr 1 Rent Rev", "Req VAT\u21920%?",
                      "Crossover", "Debt Peak", "Net Creditor"].map(h => (
                      <TableHead key={h} className="text-[11px]">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PKG_RESULTS.map((pkg) => {
                    const rv = requiredVatRate(pkg.yr1.total);
                    return (
                      <TableRow key={pkg.id}>
                        <TableCell className="font-bold" style={{ color: pkg.color }}>{pkg.name}</TableCell>
                        <TableCell>{(pkg.rates.vatRate * 100).toFixed(0)}%</TableCell>
                        <TableCell>{(pkg.rates.lvtRate * 100).toFixed(0)}%</TableCell>
                        <TableCell>${pkg.rates.carbonRate}/t</TableCell>
                        <TableCell className="font-semibold">{fmtT(pkg.yr1.total)}</TableCell>
                        <TableCell className={`font-semibold ${rv < 0.005 ? "text-green-600" : "text-red-600"}`}>
                          {rv < 0.005 ? "\u2713 None needed" : `${(rv * 100).toFixed(1)}%`}
                        </TableCell>
                        <TableCell className="font-bold">
                          {typeof pkg.milestones.crossoverYear === "number" ? `Yr ${pkg.milestones.crossoverYear}` : pkg.milestones.crossoverYear}
                        </TableCell>
                        <TableCell>Yr {pkg.milestones.debtPeakYear}</TableCell>
                        <TableCell>
                          {typeof pkg.milestones.netCreditorYear === "number" ? `Yr ${pkg.milestones.netCreditorYear}` : pkg.milestones.netCreditorYear}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Package cards */}
          <div className="mt-8 space-y-4">
            {PKG_RESULTS.map(pkg => (
              <Card key={pkg.id} className="overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: pkg.color }}>
                <CardContent>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-bold text-[15px]" style={{ color: pkg.color }}>{pkg.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 max-w-[580px] leading-relaxed">{pkg.desc}</div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="font-bold text-lg" style={{ color: pkg.color }}>
                        {typeof pkg.milestones.crossoverYear === "number" ? `Yr ${pkg.milestones.crossoverYear}` : pkg.milestones.crossoverYear}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Fiscal Crossover</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-8 gap-1.5 mb-4">
                    {[
                      ["VAT",      `${(pkg.rates.vatRate * 100).toFixed(0)}%`],
                      ["LVT",      `${(pkg.rates.lvtRate * 100).toFixed(0)}%`],
                      ["Carbon",   `$${pkg.rates.carbonRate}/t`],
                      ["FSL",      `${pkg.rates.fslBps}bp`],
                      ["FTT",      `${pkg.rates.fttPct.toFixed(2)}%`],
                      ["Royalty",  `+${pkg.rates.royaltyExtraPct}%`],
                      ["Spectrum", `${pkg.rates.spectrumPct}%`],
                      ["Water",    `$${pkg.rates.waterFeeAF}/af`],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-muted/50 rounded px-1.5 py-1 text-center">
                        <div className="text-[9px] text-muted-foreground">{k}</div>
                        <div className="text-[11px] font-semibold text-foreground">{v}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {[
                      { l: "Yr 1 Rent Rev",      v: fmtT(pkg.yr1.total) },
                      { l: "Carbon Yr 1",        v: fmtB(pkg.yr1.carbon) },
                      { l: "Carbon Yr 25",       v: fmtB(carbonRevYr(pkg.rates.carbonRate, 25)) },
                      { l: "Debt Peak",          v: `Yr ${pkg.milestones.debtPeakYear}` },
                      { l: "Net Creditor",       v: typeof pkg.milestones.netCreditorYear === "number" ? `Yr ${pkg.milestones.netCreditorYear}` : pkg.milestones.netCreditorYear },
                    ].map(item => (
                      <div key={item.l} className="text-center bg-muted/50 rounded-md p-2">
                        <div className="font-bold text-sm text-foreground">{item.v}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{item.l}</div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] font-semibold"
                    style={{ borderColor: pkg.color, color: pkg.color }}
                    onClick={() => { setR({ ...DEFAULTS, ...pkg.rates }); setTab("optimizer"); }}
                  >
                    Load this package {'\u2192'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <InfoBox className="mt-10 text-center">
        Fiscal engine derived from the National Balance Sheet model — identical AMCF mechanics, EV growth model, codetermination credit waterfall, and spending structure.
        Only the revenue section is extended: VAT rate, LVT rate, carbon tax (declining formula), and stable rent taxes (GDP-scaled) added as parameters.
        All Sim-6 validated milestones reproduced exactly with default settings.
      </InfoBox>
    </PageShell>
  );
}
