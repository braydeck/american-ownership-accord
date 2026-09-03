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
import { useUrlValue, useUrlState } from '@/lib/url-state';
import {
  BASE_PARAMS, RECESSION_SCENARIOS, runFiscalSimulation,
} from '@/lib/fiscal-engine';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

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
    title: "Income Tax (two-bracket)",
    open: false,
    note: "Lower rate up to the threshold, upper rate above it. Standard deduction is blended per bracket by joint-filer share (jFrac). The ETI damps the top base as effective rates rise: 0.15 ≈ Accord (loopholes closed), 0.30 ≈ conventional.",
    params: [
      { key: "incomeTaxLow",          label: "Lower Marginal Rate",   min: 0.10, max: 0.40, step: 0.01,    fmt: v => `${(v*100).toFixed(0)}%` },
      { key: "incomeTaxHigh",         label: "Upper Marginal Rate",   min: 0.30, max: 0.70, step: 0.01,    fmt: v => `${(v*100).toFixed(0)}%` },
      { key: "incomeTaxThreshold",    label: "Upper-Rate Threshold",  min: 0.25e6, max: 5e6, step: 0.25e6, fmt: v => `$${(v/1e6).toFixed(2)}M` },
      { key: "incomeTaxExemptSingle", label: "Deduction (single)",    min: 0,    max: 100000, step: 5000,   fmt: v => `$${(v/1000).toFixed(0)}K` },
      { key: "incomeTaxExemptJoint",  label: "Deduction (joint)",     min: 0,    max: 200000, step: 5000,   fmt: v => `$${(v/1000).toFixed(0)}K` },
      { key: "incomeTaxEtiTop",       label: "Top-Bracket ETI",       min: 0,    max: 0.50,   step: 0.05,   fmt: v => v.toFixed(2) },
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
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════


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
  accord:       "#307ca6",
  accordLight:  "#a9cde0",
  currentLaw:   "#2563eb",
  debt:         "#c27040",
  amcf:         "#7c3aed",
  amcfLight:    "#c4b5fd",
  credits:      "#d97706",
  creditsLight: "#fde68a",
  netPos:       "#0891b2",
  grants:       "#307ca6",
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
        <Bar dataKey="LVT" stackId="rev" fill="#307ca6" />
        <Bar dataKey="Payroll Fix" stackId="rev" fill="#a9cde0" />
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
        <Bar dataKey="Credits Used" fill="#307ca6" stackId="used" />
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
    if (test == null && base != null) return dir === "lower" ? "bg-[#c27040]/10" : "bg-[#307ca6]/10";
    if (base == null && test != null) return dir === "lower" ? "bg-[#307ca6]/10" : "bg-[#c27040]/10";
    const diff = test - base;
    if (Math.abs(diff) <= 1) return undefined;
    const better = dir === "lower" ? diff < 0 : diff > 0;
    return better ? "bg-[#307ca6]/10" : "bg-[#c27040]/10";
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
            {section.note && (
              <p className="text-[10px] text-muted-foreground mb-2 leading-snug">{section.note}</p>
            )}
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

      <div className="pt-2">
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Recession Severity
        </label>
        <select
          value={params.recessionSeverity}
          onChange={e => setParam("recessionSeverity", e.target.value)}
          disabled={params.recessionYear === 0}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {Object.entries(RECESSION_SCENARIOS)
            .filter(([k]) => k !== 'none')
            .map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
          Each scenario is a multi-year equity and output shock with a permanent scar to
          potential output and a recovery path. Applied to the Accord and current law alike,
          each on its own revenue mix.
        </p>
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
      <div className="border-l-4 border-[#307ca6] pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">National Balance Sheet</h1>
        <p className="text-base font-semibold text-[#307ca6] mt-2">
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
                        <TableRow key={yr} className={r.solventBrakeActive ? "bg-orange-50" : "bg-[#307ca6]/5"}>
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
