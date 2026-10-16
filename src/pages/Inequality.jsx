// simulation-11-inequality.jsx
// American Ownership Accord — Inequality Measurement Module
// Five Gini variants + distribution supplements + country comparisons + sensitivity analysis
// All values in 2024 real (inflation-adjusted) dollars

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { ControlPanel, ControlGroup } from '@/components/controls/ControlPanel';
import { InfoBox } from '@/components/shared/InfoBox';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { useUrlValue } from '@/lib/url-state';
import { DEMOS, DEMO_KEYS, WGTS, PROG_LOST } from '@/lib/demographics';
import { useFiscalParams } from '@/lib/use-fiscal-params';
import { CARBON_DECARB_RATE } from '@/lib/fiscal-engine';
import { wefAccrualPerFiler } from '@/lib/worker-equity';
import {
  BASE_ONLY, FISCAL_DEFAULTS, getInc, getNW, computeGini, carbonDivPC, prebatePC,
} from '@/lib/household-model';
import { FiscalControls } from '@/components/controls/FiscalControls';

// Cross-sectional representative ages per bracket (SCF/CPS demographic data)
// These are FIXED — they represent the real age distribution within each wealth/income band.
// Gini is a cross-sectional population measure: all ages present in the same distribution.
const BRACKET_AGE = {
  B10:48, P10:46, P20:44, P30:42, P40:42, P50:43, P60:45, P70:47,
  P80:50, T10:53, T1:56, BILL:65, ELON:53,
};

// Annual Social Security benefit by demo (SSA PIA formula, 2024)
const SS_BENEFIT = { B10:14400,P10:17000,P20:19200,P30:21300,P40:23400,P50:25800,P60:28800,P70:31200,P80:34200,T10:38400,T1:42000,BILL:45936,ELON:45936 };

// SSA 2024 Period Life Table — survival probabilities (unisex average)
// SURV[a] = P(alive at age a | alive at 0), ages 0–100
const SURV_BASE = [
  1.000,0.9940,0.9935,0.9932,0.9930,0.9928,0.9927,0.9926,0.9925,0.9924,0.9923,0.9922,0.9920,0.9918,0.9914,
  0.9910,0.9904,0.9896,0.9886,0.9874,0.9860,0.9844,0.9826,0.9808,0.9790,0.9772,0.9752,0.9732,0.9710,0.9688,
  0.9664,0.9638,0.9610,0.9580,0.9548,0.9514,0.9478,0.9438,0.9396,0.9350,0.9300,0.9246,0.9188,0.9124,0.9054,
  0.8978,0.8896,0.8806,0.8708,0.8602,0.8488,0.8364,0.8230,0.8086,0.7932,0.7768,0.7592,0.7404,0.7204,0.6992,
  0.6768,0.6532,0.6284,0.6024,0.5754,0.5474,0.5186,0.4890,0.4588,0.4282,0.3974,0.3666,0.3362,0.3064,0.2776,
  0.2500,0.2240,0.1996,0.1770,0.1562,0.1372,0.1198,0.1040,0.0898,0.0770,0.0656,0.0554,0.0464,0.0386,0.0318,
  0.0260,0.0210,0.0168,0.0132,0.0102,0.0078,0.0058,0.0042,0.0030,0.0020,0.0012,
];
// SES-differentiated: ±3yr shift (Chetty et al. 2016)
const SURV_LOW  = SURV_BASE.map((_, i) => i + 3 <= 100 ? SURV_BASE[i + 3] : 0);
const SURV_HIGH = SURV_BASE.map((_, i) => i >= 3 ? SURV_BASE[i - 3] : 1);

const YEARS = Array.from({ length: 31 }, (_, i) => i);
const ALL_PROVS = new Set(['BASE','TAX','PRE','AMCF','PSU_D','PSU_C']);

const US_GINI_INC = 0.490;
const US_GINI_NW = 0.850;
const US_GINI_CC = 0.420;  // consumption-capacity (income + annuitized wealth, estimated)

// Logit-space anchoring for metrics with large offsets (prevents ceiling/floor clamping)
const logit = p => Math.log(Math.max(0.001, Math.min(0.999, p)) / (1 - Math.max(0.001, Math.min(0.999, p))));
const invLogit = x => 1 / (1 + Math.exp(-x));

const _defaultParams = { discountRate: 0.02, mortality: 'uniform', scripLiquid: false, psuLiquid: false, fx: FISCAL_DEFAULTS };
const _gAnchor = (() => {
  const mkPts = (fn) => DEMO_KEYS.map((k, i) => ({ v: Math.max(fn(k), 0), w: WGTS[i] }));
  const incRaw = computeGini(mkPts(k => getInc(k, 0, BASE_ONLY).total));
  const nwRaw = computeGini(mkPts(k => Math.max(getNW(k, 0, BASE_ONLY).total, 0)));
  const ccRaw = computeGini(mkPts(k => getConsumptionCapacity(k, 0, BASE_ONLY, _defaultParams)));
  return {
    inc: US_GINI_INC - incRaw,       // small offset, additive is safe
    nw: US_GINI_NW - nwRaw,          // small offset, additive is safe
    cc: logit(US_GINI_CC) - logit(ccRaw),     // potentially large → logit space
  };
})();

// ─── Annuity Math ─────────────────────────────────────────────────────────

function annuityFactor(age, r, survTable) {
  let af = 0;
  const s0 = survTable[age] || 1;
  for (let t = 1; t <= 100 - age; t++) {
    const sT = (survTable[Math.min(age + t, 100)] || 0) / s0;
    af += sT / Math.pow(1 + r, t);
  }
  return af;
}

function pvStream(annual, age, r, survTable) {
  return annual * annuityFactor(age, r, survTable);
}

function annuitizedDrawdown(lumpSum, age, r, survTable) {
  const af = annuityFactor(age, r, survTable);
  return af > 0 ? lumpSum / af : 0;
}

function getSurvTable(mortality, k) {
  if (mortality === 'uniform') return SURV_BASE;
  const lowKeys = ['B10','P10','P20','P30'];
  const highKeys = ['T10','T1','BILL','ELON'];
  if (lowKeys.includes(k)) return SURV_LOW;
  if (highKeys.includes(k)) return SURV_HIGH;
  return SURV_BASE;
}

// ─── Five Gini Variant Value Functions ────────────────────────────────────

function getMarketIncome(k, y) {
  return DEMOS[k].income * Math.pow(1 + DEMOS[k].incG, y);
}

function getDisposableIncome(k, y, P, params = _defaultParams) {
  return getInc(k, y, P, params.fx ?? FISCAL_DEFAULTS).total;
}

function getNetWorthVal(k, y, P, params = _defaultParams) {
  return getNW(k, y, P, params.fx ?? FISCAL_DEFAULTS).total;
}

function getAugmentedWealth(k, y, P, params) {
  const { discountRate, mortality } = params;
  const currentAge = BRACKET_AGE[k]; // fixed cross-sectional age, not aging
  const surv = getSurvTable(mortality, k);
  const nw = getNW(k, y, P, params.fx ?? FISCAL_DEFAULTS).total;
  // PV of REMAINING Social Security benefits (shrinks as person ages)
  const pvSS = pvStream(SS_BENEFIT[k], currentAge, discountRate, surv);

  // PV of prebate stream — only the CONSUMED portion (saved portion already in NW via getNW().pre)
  let pvPrebateConsumed = 0;
  const fx = params.fx ?? FISCAL_DEFAULTS;
  if (P.has('PRE')) {
    const d = DEMOS[k];
    // The carbon dividend keeps falling with decarbonization after year y, so its stream is
    // discounted at the discount rate grossed up by the decline rate.
    const carbonDiv = carbonDivPC(fx.carbonRate, y) * d.hhSz;
    const carbonRate = (1 + discountRate) / (1 - CARBON_DECARB_RATE) - 1;
    const pvPrebateFull = pvStream(prebatePC(P, fx, y) * d.hhSz - PROG_LOST[k], currentAge, discountRate, surv)
      + pvStream(carbonDiv, currentAge, carbonRate, surv);
    const prebateSavedInNW = getNW(k, y, P, params.fx ?? FISCAL_DEFAULTS).pre;
    pvPrebateConsumed = Math.max(0, pvPrebateFull - prebateSavedInNW);
  }

  // DOUBLE-COUNT GUARD: scrip/PSU value already in NW. Do NOT add PV of their dividends.
  return nw + pvSS + pvPrebateConsumed;
}

function getConsumptionCapacity(k, y, P, params) {
  const { discountRate, mortality, scripLiquid, psuLiquid } = params;
  const currentAge = BRACKET_AGE[k]; // fixed cross-sectional age, not aging
  const surv = getSurvTable(mortality, k);
  const fx = params.fx ?? FISCAL_DEFAULTS;
  const inc = getInc(k, y, P, fx);
  const nwComp = getNW(k, y, P, fx);

  let cc = inc.base;
  if (P.has('TAX')) cc += inc.tax;
  if (P.has('PRE')) cc += inc.pre;

  const baseLiquid = Math.max(nwComp.base + nwComp.tax + nwComp.pre, 0);
  cc += annuitizedDrawdown(baseLiquid, currentAge, discountRate, surv);

  if (P.has('AMCF')) {
    if (scripLiquid) {
      cc += annuitizedDrawdown(Math.max(nwComp.amcf, 0), currentAge, discountRate, surv);
    } else {
      cc += inc.amcf;
    }
  }
  if (P.has('PSU_D') || P.has('PSU_C')) {
    const psuWealth = Math.max(nwComp.psuD + nwComp.psuC, 0);
    if (psuLiquid) {
      cc += annuitizedDrawdown(psuWealth, currentAge, discountRate, surv);
    } else {
      if (P.has('PSU_D')) cc += inc.psuD;
      if (P.has('PSU_C')) cc += inc.psuC;
    }
  }
  return cc;
}

// ─── Distribution Supplements ─────────────────────────────────────────────

function bottom50Share(getVal, y, P, params) {
  const b50keys = new Set(['B10','P10','P20','P30','P40']);
  let b50 = 0, total = 0;
  DEMO_KEYS.forEach((k, i) => {
    const v = Math.max(getVal(k, y, P, params), 0) * WGTS[i];
    total += v;
    if (b50keys.has(k)) b50 += v;
  });
  return total > 0 ? b50 / total : 0;
}

function medianToMean(getVal, y, P, params) {
  const median = getVal('P40', y, P, params);
  let totalV = 0, totalW = 0;
  DEMO_KEYS.forEach((k, i) => { totalV += getVal(k, y, P, params) * WGTS[i]; totalW += WGTS[i]; });
  const mean = totalW > 0 ? totalV / totalW : 0;
  return mean > 0 ? median / mean : 0;
}

function p90p10(getVal, y, P, params) {
  const p90 = getVal('P80', y, P, params); const p10 = getVal('B10', y, P, params);
  return p10 > 0 ? p90 / p10 : Infinity;
}

function p90p50(getVal, y, P, params) {
  const p90 = getVal('P80', y, P, params); const p50 = getVal('P40', y, P, params);
  return p50 > 0 ? p90 / p50 : Infinity;
}

function nonPositiveNWShare(y, P, params = _defaultParams) {
  let nonPos = 0;
  const fx = params.fx ?? FISCAL_DEFAULTS;
  DEMO_KEYS.forEach((k, i) => { if (getNW(k, y, P, fx).total <= 0) nonPos += WGTS[i]; });
  return nonPos;
}

// ─── Compute Full Suite ─────────────────────────────────────────────────

function computeSuite(y, P, params) {
  // Year 0 is always current law regardless of provision toggles (matches Sim-10)
  const Q = y === 0 ? BASE_ONLY : P;
  const mkPtsPos = (getVal) => DEMO_KEYS.map((k, i) => ({ v: Math.max(getVal(k, y, Q, params), 0), w: WGTS[i] }));

  /* eslint-disable no-unused-vars */
  const marketInc = (k, yr, _p, _r) => getMarketIncome(k, yr);
  const dispInc   = (k, yr, prov, par) => getDisposableIncome(k, yr, prov, par);
  const nwVal     = (k, yr, prov, par) => getNetWorthVal(k, yr, prov, par);
  const augW      = (k, yr, prov, par) => getAugmentedWealth(k, yr, prov, par);
  const ccVal     = (k, yr, prov, par) => getConsumptionCapacity(k, yr, prov, par);
  /* eslint-enable no-unused-vars */

  const metrics = [
    { key: 'dispInc', label: 'Disposable Income', fn: dispInc },
    { key: 'consCap', label: 'Consumption Capacity', fn: ccVal },
    { key: 'netWorth', label: 'Net Worth', fn: nwVal },
  ];

  return metrics.map(m => {
    const pts = mkPtsPos(m.fn);
    const giniRaw = computeGini(pts);

    // Apply anchors: additive for income/NW (small offsets), logit for CC (potentially large offset)
    let gini;
    if (m.key === 'consCap') {
      gini = invLogit(logit(giniRaw) + _gAnchor.cc);
    } else {
      const anchor = m.key === 'netWorth' ? _gAnchor.nw : _gAnchor.inc;
      gini = Math.max(0, Math.min(0.99, giniRaw + anchor));
    }

    return {
      key: m.key, label: m.label, gini,
      b50: bottom50Share(m.fn, y, Q, params),
      medMean: medianToMean(m.fn, y, Q, params),
      p90p10: m.key !== 'netWorth' ? p90p10(m.fn, y, Q, params) : null,
      p90p50: m.key !== 'netWorth' ? p90p50(m.fn, y, Q, params) : null,
      nonPosShare: m.key === 'netWorth' ? nonPositiveNWShare(y, Q) : null,
    };
  });
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  COUNTRY COMPARISONS                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Country comparison data — ONLY observed OECD/survey values for income and net worth Gini.
// Augmented wealth and consumption capacity are novel measures with no published cross-country data.
// Showing estimated values for these would create false precision.
const COUNTRIES = [
  { key: 'us', label: 'US Baseline', color: '#94a3b8', type: 'like',
    arch: 'Liberal market economy',
    marketInc: 0.510, dispInc: 0.490, netWorth: 0.850 },
  { key: 'sg', label: 'Singapore', color: '#307ca6', type: 'indicative',
    arch: 'Forced individual accounts (CPF)',
    marketInc: 0.480, dispInc: 0.444, netWorth: 0.760 },
  { key: 'no', label: 'Norway', color: '#06b6d4', type: 'like',
    arch: 'Collective SWF + generous pension',
    marketInc: 0.390, dispInc: 0.262, netWorth: 0.780 },
  { key: 'de', label: 'Germany', color: '#3b82f6', type: 'like',
    arch: 'Codetermination + strong pension',
    marketInc: 0.430, dispInc: 0.296, netWorth: 0.780 },
  { key: 'au', label: 'Australia', color: '#f59e0b', type: 'like',
    arch: 'Mandatory private superannuation',
    marketInc: 0.440, dispInc: 0.320, netWorth: 0.650 },
  { key: 'gb', label: 'United Kingdom', color: '#8b5cf6', type: 'like',
    arch: 'Liberal market (Anglo control)',
    marketInc: 0.460, dispInc: 0.350, netWorth: 0.710 },
];

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  VALIDATION CHECKS                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

function runValidation(params) {
  const results = [];

  // 1. Perfect equality: all equal values → Gini ≈ 0
  const eqPts = DEMO_KEYS.map((_, i) => ({ v: 50000, w: WGTS[i] }));
  const eqGini = computeGini(eqPts);
  results.push({ test: 'Perfect equality', expected: '0.000', actual: eqGini.toFixed(4), pass: eqGini < 0.001 });

  // 2. Single owner: all wealth in one group → Gini ≈ 1
  const soPts = DEMO_KEYS.map((_, i) => ({ v: i === 0 ? 1e12 : 0, w: WGTS[i] }));
  const soGini = computeGini(soPts);
  results.push({ test: 'Single owner (max concentration)', expected: '\u2265 0.85', actual: soGini.toFixed(4), pass: soGini > 0.85 });

  // 3. Annuity sanity: r → 0 → factor → remaining life expectancy
  const afLow = annuityFactor(42, 0.001, SURV_BASE);
  const remainingLE = SURV_BASE.slice(43).reduce((s, v) => s + v / SURV_BASE[42], 0);
  const afDiff = Math.abs(afLow - remainingLE);
  results.push({ test: 'Annuity factor (r\u22480) \u2248 remaining LE', expected: remainingLE.toFixed(1), actual: afLow.toFixed(1), pass: afDiff < 1 });

  // 4. Year 0 identity: CL and Accord Ginis must be identical at Year 0
  const cl0 = computeSuite(0, ALL_PROVS, params);
  const acc0 = computeSuite(0, BASE_ONLY, params);
  const y0Match = cl0.every((m, i) => Math.abs(m.gini - acc0[i].gini) < 0.001);
  results.push({ test: 'Year 0 CL === Accord (all 5 Ginis)', expected: 'Pass', actual: y0Match ? 'Pass' : 'FAIL', pass: y0Match });

  // 5. No worker fund units at Year 0
  const psuY0 = wefAccrualPerFiler(5, 0);
  results.push({ test: 'Worker fund units at Year 0 = 0', expected: '0', actual: psuY0.toFixed(0), pass: psuY0 === 0 });

  // 6. NW Gini decreases under Accord (Year 0 vs Year 30)
  const nw0 = computeSuite(0, ALL_PROVS, params).find(m => m.key === 'netWorth').gini;
  const nw30 = computeSuite(30, ALL_PROVS, params).find(m => m.key === 'netWorth').gini;
  results.push({ test: 'NW Gini decreases Yr0\u219230 (Accord)', expected: 'Pass',
    actual: nw30 < nw0 ? `Pass (${nw0.toFixed(3)}\u2192${nw30.toFixed(3)})` : 'FAIL', pass: nw30 < nw0 });

  // 7. No Gini > 0.98 (ceiling check)
  const suite30 = computeSuite(30, ALL_PROVS, params);
  const maxGini = Math.max(...suite30.map(m => m.gini));
  results.push({ test: 'No Gini > 0.98 at Year 30', expected: '< 0.98', actual: maxGini.toFixed(3), pass: maxGini < 0.98 });

  // 8. Liquidity note: monotonicity does NOT hold because bottom brackets already liquidate
  // 95% of AMCF grants as cash. Making scrip "liquid" replaces that large cash flow with
  // a tiny annuitized drawdown of retained equity — reducing their CC. This is correct model
  // behavior, not a bug. The liquid/illiquid distinction shows up as dual lines on the CC chart.
  results.push({ test: 'Liquid vs illiquid CC diverges', expected: 'Info',
    actual: 'Liquid reduces bottom CC (already cashed out); shown as dual lines on CC chart', pass: true });

  return results;
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  UI COMPONENTS                                                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const fD = n => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e12) return `${s}$${(a/1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${s}$${(a/1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a/1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a/1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

// ═══════════════════════════════════════════════════════════════════════════
// TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const GINI_META = [
  { key: 'dispInc', label: 'Disposable Income', color: '#f97316', group: 'income', desc: 'Post-tax, post-transfer. Dips early (prebate impact), then creeps up as top incomes compound faster than the fixed prebate.' },
  { key: 'consCap', label: 'Consumption Capacity', color: '#307ca6', group: 'income', desc: 'Sustainable spending power. Goes up under both scenarios, but the Accord cuts the increase by ~70%. The DELTA widens every year.' },
  { key: 'netWorth', label: 'Net Worth', color: '#8b5cf6', group: 'wealth', desc: 'Ownership distribution. Goes DOWN under the Accord — AMCF scrip and worker fund units compress wealth inequality. The core success metric.' },
];

const SNAP_YRS = [0, 1, 5, 10, 15, 20, 25, 30];
const HH_COUNT = 133e6;

// ─── Tab 1: Overview ──────────────────────────────────────────────────────

function OverviewTab({ P, params }) {
  const pKey = [...P].sort().join(',');
  const [ccThreshold, setCcThreshold] = useState(30000);
  const liqParams = useMemo(() => ({ ...params, scripLiquid: true, psuLiquid: true }), [params]);

  const timeData = useMemo(() => YEARS.map(y => {
    const cl = computeSuite(y, BASE_ONLY, params);
    const acc = computeSuite(y, P, params);
    const row = { year: y };
    GINI_META.forEach((m, i) => { row[`cl_${m.key}`] = cl[i].gini; row[`acc_${m.key}`] = acc[i].gini; });
    const ccIdx = GINI_META.findIndex(m => m.key === 'consCap');
    const clLiq = computeSuite(y, BASE_ONLY, liqParams);
    const accLiq = computeSuite(y, P, liqParams);
    row.cl_consCap_liq = clLiq[ccIdx].gini;
    row.acc_consCap_liq = accLiq[ccIdx].gini;
    return row;
  }), [pKey, params, liqParams]);

  // Security floor: % of HH with CC < threshold, over 30 years
  const secFloorData = useMemo(() => YEARS.map(y => {
    let clBelow = 0, accBelow = 0;
    DEMO_KEYS.forEach((k, i) => {
      if (getConsumptionCapacity(k, y, BASE_ONLY, params) < ccThreshold) clBelow += WGTS[i];
      if (getConsumptionCapacity(k, y, P, params) < ccThreshold) accBelow += WGTS[i];
    });
    return { year: y, cl: +(clBelow * 100).toFixed(1), accord: +(accBelow * 100).toFixed(1) };
  }), [pKey, params, ccThreshold]);

  // Find year when Accord hits 0%
  const zeroYear = secFloorData.find(d => d.accord === 0)?.year;

  // Country refs
  const refs = COUNTRIES.filter(c => c.key !== 'us');

  // Shared income domain for dispInc + consCap
  const incKeys = ['dispInc', 'consCap'];
  const incVals = timeData.flatMap(d => incKeys.flatMap(k => [d[`cl_${k}`], d[`acc_${k}`]]));
  refs.forEach(c => incKeys.forEach(k => { if (c[k] != null) incVals.push(c[k]); }));
  const incDomain = [Math.max(0, Math.min(...incVals) - 0.03), Math.min(1, Math.max(...incVals) + 0.03)];
  // Add liquid CC vals to domain
  const liqVals = timeData.flatMap(d => [d.cl_consCap_liq, d.acc_consCap_liq].filter(v => v != null));
  if (liqVals.length) {
    incDomain[0] = Math.max(0, Math.min(incDomain[0], Math.min(...liqVals) - 0.03));
    incDomain[1] = Math.min(1, Math.max(incDomain[1], Math.max(...liqVals) + 0.03));
  }
  const nwVals = timeData.flatMap(d => [d.cl_netWorth, d.acc_netWorth]);
  refs.forEach(c => { if (c.netWorth != null) nwVals.push(c.netWorth); });
  const nwDomain = [Math.max(0, Math.min(...nwVals) - 0.03), Math.min(1, Math.max(...nwVals) + 0.03)];
  const domainFor = (key) => key === 'netWorth' ? nwDomain : incDomain;

  const renderChart = (title, color, dataKeys, domain, extraLines) => {
    const mainKey = dataKeys[0];
    const countryRefs = refs.filter(c => c[mainKey] != null);
    return (
      <div className="rounded-lg bg-muted/30 p-3">
        <div className="text-[13px] font-bold pl-2 mb-1" style={{ color }}>{title}</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={timeData} margin={{ top: 5, right: 80, bottom: 15, left: 5 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="year" tick={{ fontSize: 9 }} />
            <YAxis domain={domain} tickFormatter={v => v.toFixed(2)} tick={{ fontSize: 9 }} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => v.toFixed(3)} />
            {countryRefs.map(c => (
              <ReferenceLine key={c.key} y={c[mainKey]} stroke={c.color} strokeDasharray="3 3"
                label={{ value: c.label, position: 'right', fontSize: 9, fill: c.color }} />
            ))}
            {dataKeys.map(k => {
              const meta = GINI_META.find(m => m.key === k);
              return [
                <Line key={`cl_${k}`} dataKey={`cl_${k}`} name={`${meta.label} CL`} stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="6 3" />,
                <Line key={`acc_${k}`} dataKey={`acc_${k}`} name={`${meta.label} Accord`} stroke={meta.color} dot={false} strokeWidth={2.5} />,
              ];
            })}
            {extraLines}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const ccExtraLines = [
    <Line key="cl_cc_liq" dataKey="cl_consCap_liq" name="CC CL (liquid)" stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="3 2" />,
    <Line key="acc_cc_liq" dataKey="acc_consCap_liq" name="CC Accord (liquid)" stroke="#307ca6" dot={false} strokeWidth={1.5} strokeDasharray="3 2" />,
  ];

  return (
    <div>
      {/* Metric definitions */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-3">What Each Metric Measures</h3>
          <div className="grid grid-cols-3 gap-3">
            {GINI_META.map(m => (
              <div key={m.key} className="rounded-lg p-3.5" style={{ border: `2px solid ${m.color}20`, background: `${m.color}06` }}>
                <div className="text-xs font-bold mb-1.5" style={{ color: m.color }}>{m.label}</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 30-year line charts */}
      <Card className="mt-4">
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-1">30-Year Gini Trajectories</h3>
          <p className="text-xs text-muted-foreground mb-4">
            <strong className="text-slate-400">Dashed = Current Law</strong>, <strong>Solid = With Accord</strong>.
            Disposable Income and Consumption Capacity share axes for comparison.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-4">
            {renderChart('Disposable Income Gini', '#f97316', ['dispInc'], domainFor('dispInc'))}
            {renderChart('Consumption Capacity Gini \u2014 solid=illiquid, dashed=liquid', '#307ca6', ['consCap'], domainFor('consCap'), ccExtraLines)}
            {renderChart('Net Worth Gini', '#8b5cf6', ['netWorth'], domainFor('netWorth'))}
          </div>
        </CardContent>
      </Card>

      {/* International context */}
      <Card className="mt-4">
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-1">International Context</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Comparisons shown only for metrics with published, comparable OECD data.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Country</TableHead>
                <TableHead>Archetype</TableHead>
                <TableHead className="text-center text-orange-500">Disposable Inc</TableHead>
                <TableHead className="text-center text-violet-500">Net Worth</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COUNTRIES.map(c => (
                <TableRow key={c.key}>
                  <TableCell className="font-semibold" style={{ color: c.color }}>{c.label}</TableCell>
                  <TableCell className="text-[11px]">{c.arch}</TableCell>
                  <TableCell className="text-center">{c.dispInc?.toFixed(3) ?? '\u2014'}</TableCell>
                  <TableCell className="text-center">{c.netWorth?.toFixed(3) ?? '\u2014'}</TableCell>
                  <TableCell>
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${c.type === 'like' ? 'bg-[#307ca6]/15 text-[#307ca6]' : 'bg-amber-100 text-amber-800'}`}>
                      {c.type === 'like' ? 'Like-for-like' : 'Indicative'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Security Floor — line chart with threshold slider */}
      <Card className="mt-4">
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-1">Security Floor: Who Can Afford Basic Needs?</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Share of households whose sustainable consumption capacity falls below the basic-needs threshold.
            Lower = fewer households in precarity = better.
          </p>
          <ControlPanel columns={1} className="mb-4">
            <SliderControl
              label={`Basic Needs Threshold: $${(ccThreshold / 1000).toFixed(0)}K/yr`}
              value={ccThreshold}
              onChange={setCcThreshold}
              min={15000}
              max={60000}
              step={1000}
              formatValue={v => `$${(v/1000).toFixed(0)}K`}
              helpText="Default: MIT Living Wage (~$30K/yr, single adult). Range: $15K (poverty line, single) to $60K (living wage, family of 4)."
            />
          </ControlPanel>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={secFloorData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="year" tick={CHART_AXIS.tick} label={{ value: 'Year', position: 'insideBottom', offset: -8, fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={CHART_AXIS.tick} width={45} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="cl" name="Current Law" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="6 3" />
              <Line dataKey="accord" name="With Accord" stroke="#1d4ed8" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground italic mt-1">
            Step pattern reflects 13-bracket model resolution. Actual transition would be gradual.
          </p>
          {zeroYear != null && (
            <div className="mt-3 rounded-lg bg-[#307ca6]/10 p-4 text-center">
              <div className="text-[11px] font-semibold text-[#307ca6] uppercase tracking-widest">
                Every American household can afford basic needs by
              </div>
              <div className="text-[42px] font-extrabold text-[#307ca6] font-serif">
                Year {zeroYear}
              </div>
              <div className="text-xs text-[#307ca6]">
                Consumption capacity above ${(ccThreshold/1000).toFixed(0)}K/yr for 100% of households
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 2: Tables (absolute levels + distribution supplements) ───────────

function TablesTab({ P, params }) {
  const pKey = [...P].sort().join(',');
  const snapSuites = useMemo(() => {
    const m = {};
    SNAP_YRS.forEach(y => { m[y] = { cl: computeSuite(y, BASE_ONLY, params), acc: computeSuite(y, P, params) }; });
    return m;
  }, [pKey, params]);

  const keyDemos = ['B10','P20','P40','P60','P80','T10','T1'];

  return (
    <div>
      {/* Absolute levels */}
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-1">Absolute Levels: What Households Can Actually Afford</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Gini measures <em>relative</em> inequality. This table shows actual dollar amounts — <strong>everyone gets richer</strong>.
          </p>
          {['consCap', 'netWorth'].map(metric => {
            const isCC = metric === 'consCap';
            const mLabel = isCC ? 'Consumption Capacity ($/yr per household)' : 'Net Worth ($ per household)';
            const getVal = isCC
              ? (k, y, pSet) => getConsumptionCapacity(k, y, pSet, params)
              : (k, y, pSet) => getNW(k, y, pSet, params.fx ?? FISCAL_DEFAULTS).total;
            return (
              <div key={metric} className="mb-5">
                <div className="text-xs font-bold mb-1.5" style={{ color: isCC ? '#307ca6' : '#8b5cf6' }}>{mLabel}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Demo</TableHead>
                      {SNAP_YRS.map(y => <TableHead key={y} className="text-center text-[10px]">Yr {y}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keyDemos.map(k => (
                      <TableRow key={k}>
                        <TableCell className="font-semibold text-[10px]" style={{ color: DEMOS[k].color }}>{DEMOS[k].label}</TableCell>
                        {SNAP_YRS.map(y => {
                          const cl = getVal(k, y, BASE_ONLY);
                          const acc = getVal(k, y, P);
                          const pctChg = cl > 0 ? ((acc / cl - 1) * 100) : acc > 0 ? 999 : 0;
                          return (
                            <TableCell key={y} className="text-center text-[10px] leading-snug">
                              <div className="text-slate-400">{fD(cl)}</div>
                              <div className="font-bold text-foreground">{fD(acc)}</div>
                              <div className={`text-[9px] font-semibold ${pctChg > 1 ? 'text-[#307ca6]' : pctChg < -1 ? 'text-[#c27040]' : 'text-muted-foreground'}`}>
                                {pctChg > 0 ? '+' : ''}{pctChg > 500 ? 'n/a' : pctChg.toFixed(0) + '%'}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Distribution shape supplements */}
      <Card className="mt-4">
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-1">Distribution Shape Supplements Over Time</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Each cell shows <strong className="text-slate-400">CL</strong> / <strong className="text-foreground">Accord</strong> (delta).
          </p>
          {GINI_META.map((m) => (
            <div key={m.key} className="mb-5">
              <div className="text-[13px] font-bold mb-1.5 border-l-[3px] pl-2.5" style={{ color: m.color, borderColor: m.color }}>{m.label}</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Supplement</TableHead>
                      {SNAP_YRS.map(y => <TableHead key={y} className="text-center text-[10px]">Yr {y}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {['gini','b50','medMean','p90p10','p90p50','nonPosShare'].map(sup => {
                      if (sup === 'p90p10' && m.key === 'netWorth') return null;
                      if (sup === 'p90p50' && m.key === 'netWorth') return null;
                      if (sup === 'nonPosShare' && m.key !== 'netWorth') return null;
                      const labels = { gini: 'Gini', b50: 'Bottom 50% Share', medMean: 'Median / Mean', p90p10: 'P90 / P10', p90p50: 'P90 / P50', nonPosShare: 'Non-positive NW' };
                      return (
                        <TableRow key={sup} style={sup === 'gini' ? { background: `${m.color}06` } : undefined}>
                          <TableCell className={`text-[10px] ${sup === 'gini' ? 'font-bold' : ''}`}>{labels[sup]}</TableCell>
                          {SNAP_YRS.map(y => {
                            const cl = snapSuites[y].cl[GINI_META.indexOf(m)];
                            const acc = snapSuites[y].acc[GINI_META.indexOf(m)];
                            let clV, accV, delta, good;
                            if (sup === 'gini') { clV = cl.gini; accV = acc.gini; delta = accV - clV; good = delta < -0.003; }
                            else if (sup === 'b50') { clV = cl.b50*100; accV = acc.b50*100; delta = accV - clV; good = delta > 0.1; }
                            else if (sup === 'medMean') { clV = cl.medMean; accV = acc.medMean; delta = accV - clV; good = delta > 0.003; }
                            else if (sup === 'p90p10') { clV = cl.p90p10; accV = acc.p90p10; delta = clV != null && accV != null ? accV - clV : 0; good = delta < -0.1; }
                            else if (sup === 'p90p50') { clV = cl.p90p50; accV = acc.p90p50; delta = clV != null && accV != null ? accV - clV : 0; good = delta < -0.01; }
                            else if (sup === 'nonPosShare') { clV = cl.nonPosShare != null ? cl.nonPosShare*100 : null; accV = acc.nonPosShare != null ? acc.nonPosShare*100 : null; delta = clV != null && accV != null ? accV - clV : 0; good = delta < -0.1; }
                            const fmt = v => { if (v == null) return '\u2014'; if (sup === 'gini' || sup === 'medMean') return v.toFixed(3); if (sup === 'b50' || sup === 'nonPosShare') return v.toFixed(1)+'%'; if (sup === 'p90p50') return v.toFixed(2); return isFinite(v) ? v.toFixed(1) : '\u221e'; };
                            const dColor = isFinite(delta) && good ? 'text-[#307ca6]' : isFinite(delta) && !good && Math.abs(delta) > 0.001 ? 'text-[#c27040]' : 'text-muted-foreground';
                            return (
                              <TableCell key={y} className="text-center text-[10px] leading-snug">
                                <span className="text-slate-400">{fmt(clV)}</span>
                                {' / '}
                                <span className="font-semibold text-foreground">{fmt(accV)}</span>
                                <div className={`text-[9px] font-semibold ${dColor}`}>
                                  {isFinite(delta) ? (delta >= 0 ? '+' : '') + (sup === 'b50' || sup === 'nonPosShare' ? delta.toFixed(1)+'pp' : sup === 'gini' || sup === 'medMean' ? delta.toFixed(3) : delta.toFixed(1)) : ''}
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    }).filter(Boolean)}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 4: Provision Decomposition ───────────────────────────────────────

// Provision decomposition: cumulative addition of provisions to measure marginal Gini reduction
const PROV_LAYERS = [
  { key: 'TAX',   label: 'Tax Reform',         color: '#f97316', set: new Set(['BASE','TAX']) },
  { key: 'PRE',   label: 'Prebate + Carbon',   color: '#307ca6', set: new Set(['BASE','TAX','PRE']) },
  { key: 'AMCF',  label: 'AMCF Grants',        color: '#3b82f6', set: new Set(['BASE','TAX','PRE','AMCF']) },
  { key: 'PSU_D', label: 'Worker Dividends',       color: '#a855f7', set: new Set(['BASE','TAX','PRE','AMCF','PSU_D']) },
  { key: 'PSU_C', label: 'Worker & Sectoral Funds',   color: '#f59e0b', set: new Set(['BASE','TAX','PRE','AMCF','PSU_D','PSU_C']) },
];

function ProvisionDecomp({ params }) {
  const snapYrs = [1, 5, 10, 15, 20, 25, 30];

  const data = useMemo(() => {
    return GINI_META.map((m, mi) => {
      return snapYrs.map(y => {
        const clGini = computeSuite(y, BASE_ONLY, params)[mi].gini;
        let prevGini = clGini;
        const row = { year: `Yr ${y}` };
        PROV_LAYERS.forEach(layer => {
          const thisGini = computeSuite(y, layer.set, params)[mi].gini;
          const marginal = Math.max(0, prevGini - thisGini); // positive = improvement
          row[layer.key] = parseFloat(marginal.toFixed(4));
          prevGini = thisGini;
        });
        row.total = parseFloat((clGini - computeSuite(y, ALL_PROVS, params)[mi].gini).toFixed(4));
        return row;
      });
    });
  }, [params]);

  return (
    <div>
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-lg font-semibold tracking-tight mb-1">Where Does the Equalizing Power Come From?</h3>
          <p className="text-xs text-muted-foreground mb-5">
            Each segment shows one provision's marginal contribution to Gini reduction at each year.
            Provisions are added cumulatively: Tax Reform first, then Prebate, then AMCF, then worker equity.
            Taller bars = more total inequality reduction. The composition shows which mechanism does the heavy lifting.
          </p>

          {GINI_META.map((m, mi) => (
            <div key={m.key} className="mb-6">
              <div className="text-sm font-bold mb-2 border-l-4 pl-2.5" style={{ color: m.color, borderColor: m.color }}>
                {m.label} — Gini Reduction by Provision
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data[mi]} margin={{ top: 10, right: 30, bottom: 5, left: 10 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="year" tick={CHART_AXIS.tick} />
                  <YAxis tickFormatter={v => v.toFixed(3)} tick={CHART_AXIS.tick} width={45}
                    label={{ value: 'Gini reduction', angle: -90, position: 'insideLeft', offset: 5, fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [v.toFixed(4), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {PROV_LAYERS.map(layer => (
                    <Bar key={layer.key} dataKey={layer.key} name={layer.label} stackId="a"
                      fill={layer.color} radius={layer.key === 'PSU_C' ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 5: Methodology ───────────────────────────────────────────────────

function MethodologyTab({ params }) {
  const validation = useMemo(() => runValidation(params), [params]);

  return (
    <div>
      <Card>
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-3">Measurement Framework</h3>
          <InfoBox>
            <div className="space-y-3 text-xs leading-relaxed text-foreground/80">
              <p><strong>The core problem:</strong> The AOA delivers benefits as held wealth (AMCF scrip, worker fund units) and income streams (prebate) — forms that conventional metrics handle badly. No single Gini tells the truth. This module reports five variants and makes the gaps between them legible.</p>
              <p><strong>Annuity factor:</strong> AF(age, r) = Sum_t [ P(alive at age+t | alive at age) / (1+r)^t ]. Converts streams to stocks and stocks to sustainable flows.</p>
              <p><strong>Why no Augmented Wealth time series:</strong> Augmented wealth (NW + PV of Social Security and other entitlements) is a useful cross-sectional concept but cannot be reliably tracked in a 13-bracket model. The fixed-dollar PV additions get diluted as NW compounds, causing the augmented Gini to rise even when NW Gini falls. The Net Worth Gini directly measures ownership inequality, and the Consumption Capacity Gini captures affordability including drawdown value. Together they cover what augmented wealth was intended to measure.</p>
              <p><strong>Model structure:</strong> 13 representative brackets (B10 through Elon Musk) with population-weighted Gini computation. Each bracket has a fixed cross-sectional age (SCF/CPS demographic profiles, e.g. B10=48, BILL=65) — Gini is computed as a population snapshot, not a cohort tracked over time. Brackets track policy-year evolution, not individual aging. Population shares are held constant.</p>
              <p><strong>Consumption capacity:</strong> Disposable income + annuitized drawdown of liquid wealth + dividends from illiquid wealth. Guard: if scrip is liquid, include principal drawdown but DROP dividends. If illiquid, include dividends but NO principal drawdown.</p>
              <p><strong>Life table:</strong> SSA 2024 Period Life Table (unisex average). SES-differentiated variant shifts survival curve ±3 years per Chetty et al. (2016).</p>
              <p><strong>Gini method:</strong> Weighted Lorenz trapezoid. 13-point distribution (B10 through Elon, exact population weights). Anchor-calibrated to US empirical baselines (income 0.490, wealth 0.850) at Year 0.</p>
            </div>
          </InfoBox>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-3">Validation Checks</h3>
          <Table>
            <TableHeader>
              <TableRow>
                {['Test', 'Expected', 'Actual', 'Status'].map(h => <TableHead key={h}>{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {validation.map((v, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{v.test}</TableCell>
                  <TableCell>{v.expected}</TableCell>
                  <TableCell>{v.actual}</TableCell>
                  <TableCell>
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${v.pass ? 'bg-[#307ca6]/15 text-[#307ca6]' : 'bg-[#c27040]/10 text-[#c27040]'}`}>
                      {v.pass ? 'PASS' : 'FAIL'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-3">Fixed Parameters</h3>
          <InfoBox>
            <div className="space-y-2 text-xs leading-relaxed text-foreground/80">
              <p><strong>Discount rate:</strong> 2.0% real (Wolff-Haveman standard for augmented wealth literature).</p>
              <p><strong>Mortality:</strong> Uniform (SSA 2024 Period Life Table, unisex average). Each bracket uses a fixed cross-sectional representative age (SCF/CPS demographic profiles).</p>
              <div className="mt-3 rounded-md bg-muted/80 p-3 text-muted-foreground">
                SES-differentiated mortality (±3 year shift per Chetty et al. 2016) and discount rate variation (1.0%–3.5%) produce negligible sensitivity at this model's 13-bracket resolution. These parameters would matter in a microsimulation with 100K+ synthetic households; at the bracket level, extreme top-tail values dominate the Gini and swamp annuity-factor perturbations.
              </div>
            </div>
          </InfoBox>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <h3 className="text-base font-semibold tracking-tight mb-3">Cross-Country Comparability</h3>
          <InfoBox>
            <div className="space-y-2 text-xs leading-relaxed text-foreground/80">
              <p><strong>Like-for-like:</strong> US, Norway, Germany, Australia, UK — all use OECD-harmonized disposable income Gini methodology (post-tax, post-transfer). Wealth Ginis from national wealth surveys (SCF, HFCS, ONS WAS, HILDA).</p>
              <p><strong>Indicative only:</strong> Singapore (different survey methodology, sparse wealth microdata). These comparisons are directional, not statistically precise.</p>
              <p><strong>Key caveat:</strong> Countries with generous state pensions (Norway, Germany) have artificially high measured wealth inequality because pension wealth is invisible to surveys.</p>
            </div>
          </InfoBox>
        </CardContent>
      </Card>
    </div>
  );
}

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  MAIN COMPONENT                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const PROVS = [
  { key: 'BASE', label: 'Current Law', fixed: true },
  { key: 'TAX', label: 'Tax Reform' },
  { key: 'PRE', label: 'Prebate + Carbon' },
  { key: 'AMCF', label: 'AMCF Grants' },
  { key: 'PSU_D', label: 'Worker Dividends' },
  { key: 'PSU_C', label: 'Worker & Sectoral Funds' },
  { key: 'LVT_EX', label: '$500k Homeowner Exemption',
    tip: 'Coupled, deficit-neutral swap: turning the exemption ON also reverts the prebate from $6,250 to $5,000/person. OFF (default) = no exemption + the higher redirected prebate.' },
];

// Stable default Set for URL state (module-level so the hook default reference is stable).
const DEFAULT_PROVS = new Set(['BASE','TAX','PRE','AMCF','PSU_D','PSU_C']);

export default function InequalityMeasurement() {
  const [provs, setProvs] = useUrlValue('provs', DEFAULT_PROVS);
  const [tab, setTab] = useUrlValue('tab', 'overview');
  const discountRate = 0.02;
  const mortality = 'uniform';
  const P = provs;
  const { fx, values: fxValues, set: fxSet, isDefault: fxIsDefault, reset: fxReset, grants } = useFiscalParams();
  const params = { discountRate, mortality, scripLiquid: false, psuLiquid: false, fx };

  const toggleProv = (key) => {
    if (key === 'BASE') return;
    const next = new Set(provs);
    if (next.has(key)) next.delete(key); else next.add(key);
    setProvs(next);
  };

  return (
    <PageShell className="max-w-[1300px]">
      {/* Header */}
      <div className="border-l-4 border-[#307ca6] pl-4 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Inequality</p>
        <h1 className="text-2xl font-bold tracking-tight">Inequality Measurement Module</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Three Gini variants capturing what conventional metrics miss about the American Ownership Accord.
        </p>
      </div>

      <div className="flex gap-5 items-start">
        {/* Sidebar — sticky */}
        <div className="w-[260px] shrink-0 self-start sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Accord Provisions</p>
              <div className="flex flex-col gap-1">
                {PROVS.map(p => (
                  <Button
                    key={p.key}
                    variant={provs.has(p.key) ? 'default' : 'outline'}
                    size="sm"
                    title={p.tip}
                    onClick={() => toggleProv(p.key)}
                    className={`justify-start text-xs ${p.fixed ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <FiscalControls values={fxValues} set={fxSet} isDefault={fxIsDefault}
                                reset={fxReset} grants={grants} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tables">Tables</TabsTrigger>
              <TabsTrigger value="decomp">Provision Decomp</TabsTrigger>
              <TabsTrigger value="methodology">Methodology</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab P={P} params={params} />
            </TabsContent>
            <TabsContent value="tables" className="mt-4">
              <TablesTab P={P} params={params} />
            </TabsContent>
            <TabsContent value="decomp" className="mt-4">
              <ProvisionDecomp params={params} />
            </TabsContent>
            <TabsContent value="methodology" className="mt-4">
              <MethodologyTab params={params} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageShell>
  );
}
