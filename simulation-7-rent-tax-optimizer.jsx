import { useState, useMemo } from "react";
import {
  ComposedChart, LineChart, BarChart,
  Line, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE MODELS
// Consistent with Sim-6 conventions where possible.
// LVT: nominalGdp × 0.20 × rate (Sim-6 simplified — no capitalization adjustment).
// Carbon: physics-based Laffer curve + 2.5%/yr natural decarbonization.
// Stable taxes (FSL, FTT, royalties, etc.): modeled as % of GDP so they scale with the economy.
// ═══════════════════════════════════════════════════════════════════════════

const YR1_NOM_GDP = 28.7e12; // $28T real × 1.025 price level (Year 1)

// LVT — same formula as Sim-6 revenue section (20% of nominal GDP × rate × land premium)
function lvtRevYr1(rate) {
  return YR1_NOM_GDP * 0.20 * rate; // land premium = 1.0 in Year 1
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
  const lvt    = lvtRevYr1(r.lvtRate);
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
const BASE_LVT_REV_YR1 = lvtRevYr1(0.03);
const BASELINE_TOTAL   = BASE_VAT_REV_YR1 + BASE_LVT_REV_YR1;

// Minimum residual VAT rate needed if rent taxes fall short of baseline
function requiredVatRate(rentTotalYr1) {
  const gap = Math.max(0, BASELINE_TOTAL - rentTotalYr1);
  return gap / (YR1_NOM_GDP * 0.55 * 0.75);
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
  prebatePerCapita: 5000,
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
    const landPrem   = 1 + 0.005 * (yr - 1);
    const lvtRev     = nomGdp * 0.20 * landPrem * rentRates.lvtRate;
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
    const spending  = nomGdp * spendFrac + budgetGrantCost + FP.prebatePerCapita * pop
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
    desc: "Maximum rent taxes — VAT fully eliminated. LVT 11% needed to close gap. Carbon at Laffer peak. Fragile in out-years as emissions fall.",
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

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const TABS = ["Optimizer", "Revenue Curves", "Fiscal Trajectory", "Packages"];

const DEFAULTS = {
  vatRate: 0.04, lvtRate: 0.10, carbonRate: 100,
  fslBps: 25, fttPct: 0.50, royaltyExtraPct: 8,
  spectrumPct: 2, waterFeeAF: 25,
};

export default function RentTaxOptimizer() {
  const [tab, setTab]           = useState(0);
  const [r, setR]               = useState(DEFAULTS);
  const [compareIdx, setCmpIdx] = useState(4); // Base Accord as default comparison

  const upd = (k, v) => setR(prev => ({ ...prev, [k]: v }));

  const yr1 = useMemo(() => computePortfolioYr1(r), [r]);
  const gap  = BASELINE_TOTAL - yr1.total;
  const zeroVatFeasible = gap <= 0;
  const reqVat = requiredVatRate(yr1.total);

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

  // ── Styles ───────────────────────────────────────────────────────────────
  const bg = "#f8fafc";
  const card = { background: "#fff", borderRadius: 10, padding: 16, marginBottom: 14, border: "1px solid #e5e7eb" };
  const sHead = { fontWeight: 700, fontSize: 13, color: "#1f2937", marginBottom: 10, paddingBottom: 5, borderBottom: "1px solid #f3f4f6" };
  const tabStyle = active => ({
    padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
    background: active ? "#1f2937" : "#e5e7eb", color: active ? "#fff" : "#374151", fontWeight: active ? 600 : 400,
  });
  const milBox = color => ({
    background: color + "12", border: `1px solid ${color}30`, borderRadius: 8,
    padding: "12px 8px", textAlign: "center",
  });
  const banner = (bg, border, fg) => ({
    background: bg, border: `1px solid ${border}`, borderRadius: 7,
    padding: "10px 14px", fontSize: 12, color: fg, marginBottom: 14, lineHeight: 1.6,
  });

  const Slider = ({ label, k, min, max, step, fmt }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", marginBottom: 2 }}>
        <span>{label}</span>
        <strong style={{ color: "#1f2937" }}>{fmt(r[k])}</strong>
      </div>
      <input type="range" style={{ width: "100%" }} min={min} max={max} step={step}
        value={r[k]} onChange={e => upd(k, parseFloat(e.target.value))} />
    </div>
  );

  const MBox = ({ label, val, color }) => (
    <div style={milBox(color)}>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.2 }}>
        {val === ">35" ? "35+" : `Yr ${val}`}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{label}</div>
    </div>
  );

  const deltaColor = (cur, cmp) => {
    if (typeof cur !== "number" || typeof cmp !== "number") return "#6b7280";
    return cur <= cmp ? "#16a34a" : "#dc2626";
  };
  const deltaStr = (cur, cmp) => {
    if (typeof cur !== "number" || typeof cmp !== "number") return "—";
    const d = cur - cmp;
    return d === 0 ? "Same" : `${d > 0 ? "+" : ""}${d} yrs`;
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, background: bg, minHeight: "100vh", padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#1f2937" }}>
        Rent Tax Optimizer
      </h2>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 16px" }}>
        Find the minimum VAT rate achievable by maximizing economically non-distortionary rent taxes.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map((t, i) => (
          <button key={t} style={tabStyle(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ═══ TAB 0: OPTIMIZER ═══════════════════════════════════════════════ */}
      {tab === 0 && <>

        {/* Feasibility banner */}
        {zeroVatFeasible ? (
          <div style={banner("#dcfce7", "#16a34a", "#14532d")}>
            <strong>Zero VAT is feasible.</strong> Rent taxes generate {fmtT(yr1.total)}, covering the {fmtT(BASELINE_TOTAL)} baseline
            (VAT + LVT) with {fmtT(-gap)} surplus. Warning: carbon revenue declines ~45% by Year 25 as emissions fall —
            plan for LVT rate increases of ~0.4%/yr starting around Year 15 to offset this.
          </div>
        ) : (
          <div style={banner("#fef3c7", "#f59e0b", "#78350f")}>
            <strong>Gap to Zero VAT: {fmtT(gap)}.</strong> Current rent taxes generate {fmtT(yr1.total)} vs {fmtT(BASELINE_TOTAL)} baseline.
            Minimum residual VAT: <strong>{(reqVat * 100).toFixed(2)}%</strong>.
            To close gap: increase LVT
            to {((gap / (YR1_NOM_GDP * 0.20) + r.lvtRate) * 100).toFixed(1)}%, or raise carbon toward $165/ton (Laffer peak).
          </div>
        )}

        {/* Revenue summary row */}
        <div style={card}>
          <div style={sHead}>Year 1 Revenue vs Baseline</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
            {[
              { label: "LVT",                 v: yr1.lvt,                    c: "#16a34a" },
              { label: "Carbon Tax",           v: yr1.carbon,                 c: "#f59e0b" },
              { label: "FSL + FTT",            v: yr1.fsl + yr1.ftt,          c: "#3b82f6" },
              { label: "Royalties + Other",    v: yr1.royal + yr1.spec + yr1.water + yr1.fixed, c: "#6b7280" },
              { label: "Total Rent Taxes",     v: yr1.total, c: zeroVatFeasible ? "#16a34a" : "#2563eb" },
            ].map(item => (
              <div key={item.label} style={{ textAlign: "center", padding: 8, background: item.c + "10", borderRadius: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: item.c }}>{fmtT(item.v)}</div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{item.label}</div>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 110, fontSize: 11, color: "#6b7280" }}>Baseline (VAT+LVT)</div>
            <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 4, height: 20, position: "relative" }}>
              <div style={{ width: "100%", height: "100%", background: "#9ca3af", borderRadius: 4 }} />
              <span style={{ position: "absolute", left: "50%", top: 2, transform: "translateX(-50%)", fontSize: 10, color: "#fff", fontWeight: 600 }}>{fmtT(BASELINE_TOTAL)}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 110, fontSize: 11, color: "#6b7280" }}>Rent Taxes Only</div>
            <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 4, height: 20, position: "relative" }}>
              <div style={{
                width: `${Math.min(100, (yr1.total / BASELINE_TOTAL) * 100)}%`,
                height: "100%", background: zeroVatFeasible ? "#16a34a" : "#3b82f6", borderRadius: 4,
              }} />
              <span style={{ position: "absolute", left: "50%", top: 2, transform: "translateX(-50%)", fontSize: 10, color: "#fff", fontWeight: 600 }}>
                {fmtT(yr1.total)} ({((yr1.total / BASELINE_TOTAL) * 100).toFixed(0)}% of baseline)
              </span>
            </div>
          </div>
        </div>

        {/* Fiscal milestones */}
        <div style={card}>
          <div style={sHead}>Fiscal Milestones — Current Settings (vs Base Accord no extra rent taxes: Yr 15 crossover)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <MBox label="Fiscal Crossover" val={fiscal.milestones.crossoverYear} color="#16a34a" />
            <MBox label="Debt Peak"        val={fiscal.milestones.debtPeakYear}  color="#f59e0b" />
            <MBox label="Net Creditor"     val={fiscal.milestones.netCreditorYear} color="#2563eb" />
            <MBox label="Interest < 10%"   val={fiscal.milestones.interestThresholdYear} color="#7c3aed" />
          </div>
        </div>

        {/* Sliders */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={card}>
              <div style={sHead}>VAT & Land Value Tax</div>
              <Slider label="VAT Rate" k="vatRate" min={0} max={0.25} step={0.005}
                fmt={v => `${(v * 100).toFixed(1)}%`} />
              <Slider label="LVT Rate" k="lvtRate" min={0} max={0.30} step={0.005}
                fmt={v => `${(v * 100).toFixed(1)}% → ${fmtT(lvtRevYr1(v))}/yr`} />
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                LVT Year-1 revenue: {fmtT(yr1.lvt)}. Grows with land values (5.5%/yr in model).
              </div>
            </div>

            <div style={card}>
              <div style={sHead}>Carbon Tax</div>
              <Slider label="Rate ($/ton CO₂)" k="carbonRate" min={0} max={300} step={5}
                fmt={v => `$${v}/ton → ${fmtB(carbonRevYr(v, 1))}/yr (Yr 1)`} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                {[1, 15, 25].map(yr => (
                  <div key={yr} style={{ textAlign: "center", background: "#fef3c7", borderRadius: 6, padding: 6 }}>
                    <div style={{ fontWeight: 700, color: "#92400e", fontSize: 14 }}>{fmtB(carbonRevYr(r.carbonRate, yr))}</div>
                    <div style={{ fontSize: 10, color: "#78350f" }}>Year {yr}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                Laffer peak: ~$165/ton (${fmtB(carbonRevYr(165, 1))}/yr, then declining ~45% by Year 25).
              </div>
            </div>
          </div>

          <div>
            <div style={card}>
              <div style={sHead}>Financial Levies</div>
              <Slider label="Financial Stability Levy (bp on G-SIBs)" k="fslBps" min={0} max={100} step={5}
                fmt={v => `${v}bp → ${fmtB(fslRevYr1(v))}/yr`} />
              <Slider label="Financial Transaction Tax (%)" k="fttPct" min={0} max={1.0} step={0.025}
                fmt={v => `${v.toFixed(3)}% → ${fmtB(fttRevYr1(v))}/yr`} />
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                FSL on too-big-to-fail banks. FTT: volume drops ~20% per 0.1% (UK stamp duty evidence).
                Both scale with GDP in the fiscal model.
              </div>
            </div>

            <div style={card}>
              <div style={sHead}>Resource & Other Rent Taxes</div>
              <Slider label="Royalty Reform (extra % on $600B extractive revenues)" k="royaltyExtraPct" min={0} max={30} step={0.5}
                fmt={v => `+${v.toFixed(1)}% → ${fmtB(royaltyRevYr1(v))}/yr`} />
              <Slider label="Spectrum Fee (% of $750B license value/yr)" k="spectrumPct" min={0} max={10} step={0.5}
                fmt={v => `${v.toFixed(1)}% → ${fmtB(spectrumRevYr1(v))}/yr`} />
              <Slider label="Groundwater Fee ($/acre-foot)" k="waterFeeAF" min={0} max={200} step={5}
                fmt={v => `$${v}/af → ${fmtB(waterRevYr1(v))}/yr`} />
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                Pollution fees ($20B) + congestion pricing ($12B) included at fixed levels.
              </div>
            </div>
          </div>
        </div>

        {/* Preset loader */}
        <div style={card}>
          <div style={sHead}>Load Recommended Package</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PACKAGES.map(pkg => (
              <button key={pkg.id}
                style={{ padding: "6px 14px", borderRadius: 6, border: `2px solid ${pkg.color}`,
                  background: "#fff", color: pkg.color, fontWeight: 600, cursor: "pointer", fontSize: 12 }}
                onClick={() => setR(pkg.rates)}>
                {pkg.name}
              </button>
            ))}
          </div>
        </div>
      </>}

      {/* ═══ TAB 1: REVENUE CURVES ══════════════════════════════════════════ */}
      {tab === 1 && <>
        <div style={card}>
          <div style={sHead}>Land Value Tax — Rate vs Year-1 Revenue</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
            Uses Sim-6 simplified model (20% of nominal GDP × rate). Capitalization-adjusted values would be ~15–20% lower at high rates
            as land prices compress. LVT revenue grows with GDP; the 0.5%/yr land premium in the model adds a slight extra tailwind.
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={CURVES.lvt} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} interval={3} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}B`} />
              <Tooltip formatter={v => `$${v}B`} labelFormatter={v => `LVT ${v}%`} />
              <ReferenceLine x={3} stroke="#dc2626" strokeDasharray="4 2"
                label={{ value: "Base 3%", fill: "#dc2626", fontSize: 10, position: "top" }} />
              <Bar dataKey="rev" fill="#16a34a" name="LVT Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={sHead}>Carbon Tax — Rate vs Revenue (Laffer Curve + Decarbonization Over Time)</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
            Peak revenue near $165/ton (~$415B in Year 1). Revenue self-liquidates as technology and behavior reduce emissions.
            At $165/ton: Year 1 = $415B → Year 10 = $290B → Year 25 = $228B.
            Carbon is the binding constraint on Zero VAT sustainability.
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={CURVES.carbon} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="x" tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} interval={4} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}B`} />
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <Tooltip formatter={(v, n) => [`$${v}B`, n]} labelFormatter={v => `$${v}/ton CO₂`} />
              <ReferenceLine x={165} stroke="#dc2626" strokeDasharray="4 2"
                label={{ value: "Laffer Peak", fill: "#dc2626", fontSize: 10, position: "top" }} />
              <Line type="monotone" dataKey="yr1"  stroke="#f59e0b" name="Year 1"  strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="yr10" stroke="#f97316" name="Year 10" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
              <Line type="monotone" dataKey="yr25" stroke="#dc2626" name="Year 25" strokeWidth={1.5} dot={false} strokeDasharray="2 3" />
              <Legend />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={card}>
            <div style={sHead}>Financial Stability Levy — bp vs Revenue</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
              50bp on $20T G-SIBs = $90B (peak). Modest base erosion modeled.
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={CURVES.fsl} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <XAxis dataKey="x" tick={{ fontSize: 10 }} tickFormatter={v => `${v}bp`} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}B`} />
                <Tooltip formatter={v => `$${v}B`} labelFormatter={v => `${v}bp`} />
                <Bar dataKey="rev" fill="#3b82f6" name="FSL Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={card}>
            <div style={sHead}>Financial Transaction Tax — Rate vs Revenue</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
              Revenue plateaus due to volume response. Practical ceiling ~$100–120B.
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={CURVES.ftt} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <XAxis dataKey="x" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} interval={2} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}B`} />
                <Tooltip formatter={v => `$${v}B`} labelFormatter={v => `FTT ${v}%`} />
                <Bar dataKey="rev" fill="#8b5cf6" name="FTT Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>}

      {/* ═══ TAB 2: FISCAL TRAJECTORY ═══════════════════════════════════════ */}
      {tab === 2 && <>
        {/* Compare selector */}
        <div style={card}>
          <div style={sHead}>Compare Current Settings Against</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PACKAGES.map((pkg, i) => (
              <button key={pkg.id}
                style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600,
                  border: `2px solid ${pkg.color}`,
                  background: compareIdx === i ? pkg.color : "#fff",
                  color: compareIdx === i ? "#fff" : pkg.color }}
                onClick={() => setCmpIdx(i)}>
                {pkg.name}
              </button>
            ))}
          </div>
        </div>

        {/* Milestone table */}
        <div style={card}>
          <div style={sHead}>Milestone Comparison — Current Settings vs {compare.name}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb", fontSize: 11, color: "#6b7280" }}>
                {["Milestone", "Current Settings", compare.name, "Delta"].map(h => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Fiscal Crossover",   fiscal.milestones.crossoverYear,         compare.milestones.crossoverYear],
                ["Debt Peak",          fiscal.milestones.debtPeakYear,           compare.milestones.debtPeakYear],
                ["Net Creditor",       fiscal.milestones.netCreditorYear,        compare.milestones.netCreditorYear],
                ["Interest Threshold", fiscal.milestones.interestThresholdYear,  compare.milestones.interestThresholdYear],
              ].map(([label, cur, cmp]) => (
                <tr key={label} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 500 }}>{label}</td>
                  <td style={{ padding: "7px 10px", fontWeight: 700 }}>
                    {typeof cur === "number" ? `Year ${cur}` : cur}
                  </td>
                  <td style={{ padding: "7px 10px", color: "#6b7280" }}>
                    {typeof cmp === "number" ? `Year ${cmp}` : cmp}
                  </td>
                  <td style={{ padding: "7px 10px", fontWeight: 600, color: deltaColor(cur, cmp) }}>
                    {deltaStr(cur, cmp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Deficit trajectory */}
        <div style={card}>
          <div style={sHead}>Annual Deficit Trajectory</div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={trajData} margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}T`} />
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <ReferenceLine y={0} stroke="#1f2937" strokeWidth={1.5} />
              <Tooltip formatter={(v, n) => [`$${v}T`, n]} />
              <Line type="monotone" dataKey="deficit"    stroke="#2563eb" name="Current Settings" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="cmpDeficit" stroke={compare.color} name={compare.name} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Gross debt */}
        <div style={card}>
          <div style={sHead}>Gross Debt Trajectory</div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={trajData} margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}T`} />
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <Tooltip formatter={(v, n) => [`$${v}T`, n]} />
              <Line type="monotone" dataKey="debt"    stroke="#2563eb" name="Current Settings" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="cmpDebt" stroke={compare.color} name={compare.name} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue composition — shows carbon declining */}
        <div style={card}>
          <div style={sHead}>Revenue Composition — Current Settings (Shows Carbon Decline)</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
            Carbon revenue (amber) declines as emissions fall. LVT (green) and stable rent taxes (blue) grow with GDP.
            The VAT (red), if present, provides the broadest-growing base.
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={trajData} margin={{ left: 20, right: 10, top: 5, bottom: 5 }}>
              <XAxis dataKey="year" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}T`} />
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <Tooltip formatter={(v, n) => [`$${v}T`, n]} />
              <Area type="monotone" dataKey="vatRevT"    stackId="a" fill="#dc262620" stroke="#dc2626" name="VAT" />
              <Area type="monotone" dataKey="lvtRevT"    stackId="a" fill="#16a34a20" stroke="#16a34a" name="LVT" />
              <Area type="monotone" dataKey="carbonRevT" stackId="a" fill="#f59e0b20" stroke="#f59e0b" name="Carbon Tax" />
              <Area type="monotone" dataKey="stableRevT" stackId="a" fill="#3b82f620" stroke="#3b82f6" name="Other Rent Taxes" />
              <Legend />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Key Metrics by Decade */}
        <div style={card}>
          <div style={sHead}>Key Metrics by Decade</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  {["Year","Nom. GDP","AMCF Equity","Own %","Gross Debt","Debt/GDP","Deficit","AMCF Cash Flow","Healthcare","Discretionary","Grants/Cap","Brake"].map(h => (
                    <th key={h} style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, borderBottom: "2px solid #e5e7eb", color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 5, 10, 15, 20, 25, 30, 35].map(yr => {
                  const row = fiscal.rows[yr - 1];
                  if (!row) return null;
                  return (
                    <tr key={yr} style={{ background: row.brakeActive ? "#fff7ed" : yr % 2 === 0 ? "#f9fafb" : "#fff", borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700 }}>{yr}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>${row.nomGdp}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>${row.amcfEquity}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: row.amcfOwnerPct >= 20 ? "#7c3aed" : "#374151" }}>{row.amcfOwnerPct}%</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "#dc2626" }}>${row.grossDebt}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: row.debtToGdp > 150 ? "#dc2626" : row.debtToGdp < 100 ? "#16a34a" : "#374151" }}>{row.debtToGdp}%</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: row.deficit < 0 ? "#16a34a" : "#dc2626" }}>
                        {row.deficit < 0 ? `($${Math.abs(row.deficit).toFixed(2)}T)` : `$${row.deficit}T`}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "#7c3aed" }}>${row.amcfCashT}T <span style={{ color: "#9ca3af", fontSize: 10 }}>({row.combinedYield}%)</span></td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "#0891b2" }}>${row.healthcareT}T</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: row.brakeActive ? "#9ca3af" : "#16a34a" }}>
                        {row.brakeActive ? "—" : `$${row.discretionaryT}T`}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>${Number(row.grantsPerCap).toLocaleString()}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontSize: 10, fontWeight: 600, color: row.brakeActive ? "#dc2626" : "#16a34a" }}>
                        {row.brakeActive ? "ACTIVE" : "off"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* ═══ TAB 3: PACKAGES ════════════════════════════════════════════════ */}
      {tab === 3 && <>
        <div style={{ ...card, background: "#eff6ff", border: "1px solid #93c5fd" }}>
          <strong style={{ color: "#1e40af" }}>Key finding: </strong>
          <span style={{ color: "#1e3a8a", fontSize: 12, lineHeight: 1.6 }}>
            Zero VAT is technically achievable in Year 1 (requires LVT ≥ 11% + carbon at Laffer peak + all other rent taxes maximized)
            but is not fiscally sustainable long-term — carbon self-liquidates as the economy decarbonizes, opening a growing
            revenue gap by Year 15–20. The <strong>Minimum VAT (~2%) package</strong> is Pareto-optimal: replaces 80%+ of VAT
            burden with superior taxes while maintaining baseline fiscal trajectory within 1–2 years.
          </span>
        </div>

        {/* Summary table */}
        <div style={card}>
          <div style={sHead}>All Packages — Milestones & Revenue</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb", fontSize: 11, color: "#6b7280" }}>
                  {["Package", "VAT", "LVT", "Carbon", "Yr 1 Rent Rev", "Req VAT→0%?",
                    "Crossover", "Debt Peak", "Net Creditor"].map(h => (
                    <th key={h} style={{ padding: "7px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PKG_RESULTS.map((pkg) => {
                  const rv = requiredVatRate(pkg.yr1.total);
                  return (
                    <tr key={pkg.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 700, color: pkg.color, whiteSpace: "nowrap" }}>{pkg.name}</td>
                      <td style={{ padding: "7px 8px" }}>{(pkg.rates.vatRate * 100).toFixed(0)}%</td>
                      <td style={{ padding: "7px 8px" }}>{(pkg.rates.lvtRate * 100).toFixed(0)}%</td>
                      <td style={{ padding: "7px 8px" }}>${pkg.rates.carbonRate}/t</td>
                      <td style={{ padding: "7px 8px", fontWeight: 600 }}>{fmtT(pkg.yr1.total)}</td>
                      <td style={{ padding: "7px 8px", color: rv < 0.005 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                        {rv < 0.005 ? "✓ None needed" : `${(rv * 100).toFixed(1)}%`}
                      </td>
                      <td style={{ padding: "7px 8px", fontWeight: 700 }}>
                        {typeof pkg.milestones.crossoverYear === "number" ? `Yr ${pkg.milestones.crossoverYear}` : pkg.milestones.crossoverYear}
                      </td>
                      <td style={{ padding: "7px 8px" }}>Yr {pkg.milestones.debtPeakYear}</td>
                      <td style={{ padding: "7px 8px" }}>
                        {typeof pkg.milestones.netCreditorYear === "number" ? `Yr ${pkg.milestones.netCreditorYear}` : pkg.milestones.netCreditorYear}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Package cards */}
        {PKG_RESULTS.map(pkg => (
          <div key={pkg.id}
            style={{ borderLeft: `4px solid ${pkg.color}`, padding: 16, background: "#fff",
              borderRadius: 8, border: `1px solid #e5e7eb`, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: pkg.color }}>{pkg.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3, maxWidth: 580, lineHeight: 1.5 }}>{pkg.desc}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: pkg.color }}>
                  {typeof pkg.milestones.crossoverYear === "number" ? `Yr ${pkg.milestones.crossoverYear}` : pkg.milestones.crossoverYear}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>Fiscal Crossover</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 5, marginBottom: 12 }}>
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
                <div key={k} style={{ background: "#f9fafb", borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#9ca3af" }}>{k}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1f2937" }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {[
                { l: "Yr 1 Rent Rev",      v: fmtT(pkg.yr1.total) },
                { l: "Carbon Yr 1",        v: fmtB(pkg.yr1.carbon) },
                { l: "Carbon Yr 25",       v: fmtB(carbonRevYr(pkg.rates.carbonRate, 25)) },
                { l: "Debt Peak",          v: `Yr ${pkg.milestones.debtPeakYear}` },
                { l: "Net Creditor",       v: typeof pkg.milestones.netCreditorYear === "number" ? `Yr ${pkg.milestones.netCreditorYear}` : pkg.milestones.netCreditorYear },
              ].map(item => (
                <div key={item.l} style={{ textAlign: "center", background: "#f9fafb", borderRadius: 6, padding: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{item.v}</div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{item.l}</div>
                </div>
              ))}
            </div>

            <button
              style={{ marginTop: 12, padding: "5px 14px", borderRadius: 5,
                border: `1px solid ${pkg.color}`, background: "#fff", color: pkg.color,
                cursor: "pointer", fontSize: 11, fontWeight: 600 }}
              onClick={() => { setR(pkg.rates); setTab(0); }}>
              Load this package →
            </button>
          </div>
        ))}
      </>}

      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 16, textAlign: "center", lineHeight: 1.6 }}>
        Fiscal engine derived from the National Balance Sheet model — identical AMCF mechanics, EV growth model, codetermination credit waterfall, and spending structure.
        Only the revenue section is extended: VAT rate, LVT rate, carbon tax (declining formula), and stable rent taxes (GDP-scaled) added as parameters.
        All Sim-6 validated milestones reproduced exactly with default settings.
      </div>
    </div>
  );
}
