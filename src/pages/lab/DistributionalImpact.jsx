import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, LineChart, Line, ReferenceLine,
} from 'recharts';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { BRACKETS, CARBON_TONS, LVT_NET_BASE, TOTAL_POP } from '@/lib/brackets';
import { lvtNetBurdenByBracket, PREBATE_BASE, PREBATE_REDIRECTED, EXEMPTION_AMOUNT } from '@/lib/land';

// ─── THREE-TIER WORKER EQUITY (from Income Tax Design) ─────────────────────────────────────
// Tier 1 (<$10M EV): $1K/yr sectoral fund at 6% gross; 3.5% distributed as dividends
// Tier 2 ($10M–$100M): phantom equity; company routes dividends to sectoral fund; cashout at departure
// Tier 3 (>$100M): 4% annual Equity Excise → 20% PSU by Year 5; appreciates at EV_GROWTH/yr
const TIER_DIST = [
  [0.12, 0.20, 0.40],  // $0–10K
  [0.15, 0.22, 0.48],  // $10–15K
  [0.18, 0.25, 0.52],  // $15–25K
  [0.20, 0.27, 0.50],  // $25–40K
  [0.22, 0.28, 0.45],  // $40–55K
  [0.24, 0.28, 0.40],  // $55–75K
  [0.26, 0.26, 0.36],  // $75–100K
  [0.25, 0.24, 0.32],  // $100–150K
  [0.22, 0.20, 0.30],  // $150–200K
  [0.16, 0.18, 0.25],  // $200–500K
  [0.09, 0.12, 0.20],  // $500K–1M
  [0.04, 0.08, 0.15],  // $1–2M
  [0.02, 0.05, 0.10],  // $2–5M
  [0.01, 0.03, 0.07],  // $5–15M
  [0.00, 0.01, 0.04],  // $15M+
];

// Tier 2: per-worker phantom equity (20% of employer EV ÷ employee count)
const TIER2_PHANTOM_EQ = [
  25000, 30000, 38000, 48000, 60000, 70000, 80000, 90000,
  100000, 100000, 100000, 100000, 100000, 100000, 100000,
];

// Tier 3: PSU equity per worker at 20% ownership equilibrium (Year 5+)
const TIER3_PSU_EQ = [
   40000,  55000,  75000, 100000, 135000, 165000, 200000,
  260000, 325000, 400000, 500000, 650000, 800000, 950000, 1100000,
];

const PSU_YIELD  = 0.035;
const EV_GROWTH  = 0.075;
const AVG_TENURE = 4.1;

// Part-time FTE adjustment by bracket (hours-worked fraction for equity allocation)
const PARTTIME_FTE = [
  0.20, 0.45, 0.65, 0.90, 0.95,
  1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
];

// Sectoral fund balance at Year N with fixed annual contribution C (6% gross growth)
function sectoralFundBalance(annualContrib, year) {
  if (year <= 0) return 0;
  return annualContrib * (Math.pow(1.06, year) - 1) / 0.06;
}

// Annual dividend income from held worker equity (all three tiers)
function psuDividendPerFiler(bracketIndex, year) {
  const [t1, t2, t3] = TIER_DIST[bracketIndex];
  const t1Balance = sectoralFundBalance(1000, year);
  const t1Income  = t1Balance * PSU_YIELD;
  const t2Balance = sectoralFundBalance(TIER2_PHANTOM_EQ[bracketIndex] * PSU_YIELD, year);
  const t2Income  = t2Balance * PSU_YIELD;
  const t3Ramp   = Math.min(1, year / 5);
  const t3Apprec = year > 5 ? Math.pow(1 + EV_GROWTH, year - 5) : 1;
  const t3Income = TIER3_PSU_EQ[bracketIndex] * t3Ramp * t3Apprec * PSU_YIELD;
  return (t1 * t1Income + t2 * t2Income + t3 * t3Income) * PARTTIME_FTE[bracketIndex];
}

// Annualized wealth event from PSU cashout at job change (Tier 2 + 3 only)
function psuCashoutPerFiler(bracketIndex, year) {
  const [, t2, t3] = TIER_DIST[bracketIndex];
  const tenureGrowth = Math.pow(1 + EV_GROWTH, AVG_TENURE);
  const t2Cashout = TIER2_PHANTOM_EQ[bracketIndex] * tenureGrowth / AVG_TENURE;
  const t3Ramp    = Math.min(1, year / 5);
  const t3Cashout = TIER3_PSU_EQ[bracketIndex] * t3Ramp * tenureGrowth / AVG_TENURE;
  return (t2 * t2Cashout + t3 * t3Cashout) * PARTTIME_FTE[bracketIndex];
}

// ─── AMCF (from Income Tax Design, anchored to National Balance Sheet validated outputs) ──────────────────

const AMCF_EQUITY_ANCHORS = [
  [1, 0.59e12], [5, 4.02e12], [10, 11.99e12], [15, 27.15e12],
  [20, 51.87e12], [25, 84.68e12], [30, 142.58e12], [35, 247.06e12],
];

function amcfEquityAt(year) {
  const pts = AMCF_EQUITY_ANCHORS;
  if (year <= pts[0][0]) return pts[0][1];
  if (year >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (year >= pts[i][0] && year <= pts[i + 1][0]) {
      const t = (year - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
    }
  }
}

// Payout yield ramps from 3.63% (Year 1) to 6.0% (Year 15+)
function amcfCombinedYield(year) {
  return 0.0363 + (0.06 - 0.0363) * Math.min(1, year / 15);
}

function amcfDividendPerCap(year) {
  return (amcfEquityAt(year) * amcfCombinedYield(year)) / TOTAL_POP;
}

// ─── DISTRIBUTIONAL ENGINE ────────────────────────────────────────────────────
// Income tax is UNCHANGED vs current law (base Accord distributional picture).
// Delta = VAT + LVT + carbon + prebate + AMCF + [worker equity]
function computeDistrib(vatRate, lvtRate, year, exemption = 0) {
  const amcfPerCap = amcfDividendPerCap(year);
  // Prebate is deficit-neutrally coupled to the exemption: off (default) → redirected
  // $6,101; on → base $5,000. Burden comes from the shared capitalized land model.
  const prebatePerPerson = exemption > 0 ? PREBATE_BASE : PREBATE_REDIRECTED;
  const lvtNet = lvtNetBurdenByBracket({ rate: lvtRate, exemption });
  return BRACKETS.map((b, i) => {
    const avgInc = b.agi / b.filers;
    const clTax  = b.effCL * avgInc;

    const vatBurden  = vatRate * b.cRat * avgInc;
    const prebate    = prebatePerPerson * b.hhSz;
    const amcfBenefit = amcfPerCap * Math.min(b.hhSz, 2); // adults only; children's AMCF is custodial
    const lvtBurden  = lvtNet[i];

    const carbonPaid     = CARBON_TONS[i] * 100;
    const carbonDividend = (5e9 * 100 * 0.80 / TOTAL_POP) * b.hhSz;
    const carbonNet      = carbonPaid - carbonDividend;

    const psuDividend = psuDividendPerFiler(i, year);
    const psuCashout  = psuCashoutPerFiler(i, year);

    // Net Δ vs Current Law — positive = household pays more
    const delta        = vatBurden + lvtBurden + carbonNet - prebate - amcfBenefit;
    const deltaWithPSU = delta - psuDividend - psuCashout;

    const effCL            = clTax / Math.max(avgInc, 1);
    const effAccord        = (clTax + vatBurden + lvtBurden + carbonNet - prebate - amcfBenefit) / Math.max(avgInc, 1);
    const effAccordWithPSU = effAccord - (psuDividend / Math.max(avgInc, 1));

    return {
      label: b.label, avgInc, filers: b.filers, hhSz: b.hhSz,
      clTax, vatBurden, lvtBurden, carbonNet, prebate, amcfBenefit,
      psuDividend, psuCashout, delta, deltaWithPSU,
      deltaPct: delta / Math.max(avgInc, 1) * 100,
      betterOff:        delta < -100,
      worseOff:         delta >  100,
      betterOffWithPSU: deltaWithPSU < -100,
      effCL, effAccord, effAccordWithPSU,
    };
  });
}

// ─── HOUSEHOLD CALCULATOR HELPERS ────────────────────────────────────────────

// 2024 Federal Tax brackets
const STD_DED = { single: 14600, mfj: 29200 };
const BRACKETS_CURRENT = {
  single: [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
  mfj:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
};

function calcFederalTax(income, filing) {
  const brackets = BRACKETS_CURRENT[filing] || BRACKETS_CURRENT.single;
  const ded = STD_DED[filing] || STD_DED.single;
  const taxable = Math.max(0, income - ded);
  let tax = 0, prev = 0;
  for (const [top, rate] of brackets) {
    const band = Math.min(taxable, top) - prev;
    if (band <= 0) break;
    tax += band * rate;
    prev = top;
    if (taxable <= top) break;
  }
  return tax;
}

function calcPayrollTax(income) {
  const ssCap = 168600;
  return Math.min(income, ssCap) * 0.062 + income * 0.0145 + (income > 200000 ? (income - 200000) * 0.009 : 0);
}

function calcCapGainsTax(gains, income, filing) {
  if (gains <= 0) return 0;
  const t15 = filing === 'mfj' ? 94050 : 47025;
  const t20 = filing === 'mfj' ? 583750 : 518900;
  if (income + gains <= t15) return 0;
  const gainsAbove15 = Math.max(0, gains - Math.max(0, t15 - income));
  const gainsAbove20 = Math.max(0, gains - Math.max(0, t20 - income));
  return gainsAbove15 * 0.15 + gainsAbove20 * 0.05;
}

function snapBenefit(income, hhSize) {
  const threshold = hhSize * 20000;
  if (income > threshold) return 0;
  return hhSize * 2400 * Math.max(0, 1 - income / threshold);
}

function eitcBenefit(income, children, filing) {
  const c = Math.min(Math.round(children), 3);
  const maxEitc = [632, 4213, 6960, 7830][c];
  const phaseoutStart = filing === 'mfj' ? [16370,22720,22720,22720][c] : [9520,21560,21560,21560][c];
  const phaseoutEnd   = filing === 'mfj' ? [25511,53120,59478,63398][c] : [18591,46560,52918,56838][c];
  if (income > phaseoutEnd) return 0;
  if (income >= phaseoutStart) return maxEitc * Math.max(0, (phaseoutEnd - income) / (phaseoutEnd - phaseoutStart));
  return maxEitc * Math.min(1, income / phaseoutStart);
}

function ctcBenefit(income, children, filing) {
  if (children === 0) return 0;
  const phaseout = filing === 'mfj' ? 400000 : 200000;
  return Math.max(0, children * 2000 - Math.max(0, income - phaseout) / 1000 * 50);
}

// Consumption-to-income ratio for household calculator (BLS Consumer Expenditure Survey)
function consumeRatio(income) {
  if (income <=  25000) return 0.95;
  if (income <=  50000) return 0.85;
  if (income <=  75000) return 0.76;
  if (income <= 100000) return 0.70;
  if (income <= 200000) return 0.60;
  if (income <= 500000) return 0.40;
  return 0.22;
}

// Estimated annual carbon tons by income (EPA)
function estimatedCarbonTons(income) {
  if (income <  25000) return 5;
  if (income <  50000) return 7;
  if (income <  75000) return 9;
  if (income < 100000) return 11;
  if (income < 200000) return 13;
  if (income < 500000) return 17;
  return 25;
}

// PSU dividend income by bracket (income-step approximation for calculator)
function psuDividendCalc(income) {
  if (income <  20000)  return 1200;
  if (income <  50000)  return 2100;
  if (income < 100000)  return 3200;
  if (income < 400000)  return 4000;
  return 0;
}

// Annual stock portfolio drag (2% of estimated equity holdings per SCF)
function stockDrag(income) {
  if (income <   50000) return 50;
  if (income <  100000) return 400;
  if (income <  200000) return 1800;
  if (income <  500000) return 7000;
  if (income < 1000000) return 35000;
  return 180000;
}

function computeCalcBurden(income, hhSize, children, capGains, filing) {
  // Current law
  const fedTax  = calcFederalTax(income, filing);
  const payroll = calcPayrollTax(income);
  const cgTax   = calcCapGainsTax(capGains, income, filing);
  const snap    = snapBenefit(income, hhSize);
  const eitc    = eitcBenefit(income, children, filing);
  const ctc     = ctcBenefit(income, children, filing);
  const curBurden = fedTax + payroll + cgTax - snap - eitc - ctc;

  // Accord (income tax unchanged; adds VAT 4%, LVT net, carbon net, prebate, AMCF, PSU)
  const vat      = 0.04 * consumeRatio(income) * income;
  const prebate  = PREBATE_REDIRECTED * hhSize;
  const amcf     = 600 * hhSize; // Year ~2 base AMCF estimate
  const psuDiv   = psuDividendCalc(income);
  const drag     = stockDrag(income);
  const cTons    = estimatedCarbonTons(income);
  const carbonPd = cTons * 100;
  const carbonDv = (5e9 * 100 * 0.80 / 330e6) * hhSize; // ~$1,212/person returned
  const carbonNt = carbonPd - carbonDv;
  const lvtEst   = income > 75000 ? Math.min(income * 0.015, 15000) : 0; // rough renter/owner net

  const accBurden = fedTax + payroll + cgTax + vat + drag + carbonNt + lvtEst - prebate - amcf - psuDiv;

  return {
    cur: {
      netBurden: curBurden,
      breakdown: {
        'Federal Income Tax': fedTax,
        'Payroll Tax (Employee)': payroll,
        'Capital Gains Tax': cgTax,
        'SNAP / EITC / CTC': -(snap + eitc + ctc),
      },
    },
    acc: {
      netBurden: accBurden,
      breakdown: {
        'Federal Income Tax': fedTax,
        'Payroll Tax (Employee)': payroll,
        'Capital Gains Tax': cgTax,
        'VAT (4%)': vat,
        'LVT Net (est.)': lvtEst,
        'Carbon Tax (net)': carbonNt,
        'Stock Portfolio Drag': drag,
        'Prebate ($5K/person)': -prebate,
        'AMCF Citizen Dividend': -amcf,
        'Worker Equity Dividends': -psuDiv,
      },
    },
  };
}

// ─── FORMATTING ──────────────────────────────────────────────────────────────

const fmtDollar = v => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
};
const fmtPct = v => `${(v * 100).toFixed(1)}%`;

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const DollarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p className="font-semibold mb-1.5">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill || p.stroke }} className="my-0.5">
          {p.name}: {fmtDollar(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function DistributionalImpact() {
  const [view,         setView]         = useState('national');
  const [vatRate,      setVatRate]      = useState(0.04);
  const [lvtRate,      setLvtRate]      = useState(0.10);
  const [snapshotYear, setSnapshotYear] = useState(1);
  const [showPSU,      setShowPSU]      = useState(false);
  const [exemptionOn,  setExemptionOn]  = useState(false); // default: no homeowner exemption

  // Calculator state
  const [calcIncome,   setCalcIncome]   = useState(75000);
  const [calcHhSize,   setCalcHhSize]   = useState(3);
  const [calcChildren, setCalcChildren] = useState(1);
  const [calcCapGains, setCalcCapGains] = useState(0);
  const [calcFiling,   setCalcFiling]   = useState('mfj');

  const exemption = exemptionOn ? EXEMPTION_AMOUNT : 0;
  const prebateShown = exemptionOn ? PREBATE_BASE : PREBATE_REDIRECTED;
  const distrib = useMemo(
    () => computeDistrib(vatRate, lvtRate, snapshotYear, exemption),
    [vatRate, lvtRate, snapshotYear, exemption],
  );

  const calcResults = useMemo(
    () => computeCalcBurden(calcIncome, calcHhSize, calcChildren, calcCapGains, calcFiling),
    [calcIncome, calcHhSize, calcChildren, calcCapGains, calcFiling],
  );

  const totalFilers   = distrib.reduce((s, d) => s + d.filers, 0);
  const betterOffHH   = distrib.filter(d => showPSU ? d.betterOffWithPSU : d.betterOff).reduce((s, d) => s + d.filers, 0);
  const worseOffHH    = distrib.filter(d => !(showPSU ? d.betterOffWithPSU : d.betterOff) && (showPSU ? d.deltaWithPSU : d.delta) > 100).reduce((s, d) => s + d.filers, 0);
  const pctBetter     = betterOffHH / totalFilers;

  // Breakeven: first bracket where delta turns positive
  let breakeven = null;
  for (let i = 0; i < distrib.length - 1; i++) {
    const d0 = showPSU ? distrib[i].deltaWithPSU : distrib[i].delta;
    const d1 = showPSU ? distrib[i + 1].deltaWithPSU : distrib[i + 1].delta;
    if (d0 < 0 && d1 > 0 && breakeven === null) {
      breakeven = `${distrib[i].label}–${distrib[i + 1].label}`;
    }
  }

  const amcfPerCap = amcfDividendPerCap(snapshotYear);
  const amcfEquity = amcfEquityAt(snapshotYear);
  const amcfYield  = amcfCombinedYield(snapshotYear);

  // Effective rate data for line chart
  const rateData = distrib.map(d => ({
    label: d.label,
    'Current Law': +(d.effCL * 100).toFixed(1),
    'Accord (base)': +(d.effAccord * 100).toFixed(1),
    ...(showPSU ? { 'Accord + Equity': +(d.effAccordWithPSU * 100).toFixed(1) } : {}),
  }));

  const netChangeData = distrib.map(d => ({
    name: d.label,
    delta: showPSU ? d.deltaWithPSU : d.delta,
    betterOff: showPSU ? d.betterOffWithPSU : d.betterOff,
    worseOff:  (showPSU ? d.deltaWithPSU : d.delta) > 100,
  }));

  const calcNetChange = -(calcResults.acc.netBurden - calcResults.cur.netBurden);

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="border-l-4 border-emerald-600 pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">American Ownership Accord</p>
        <h1 className="text-2xl font-bold tracking-tight">Distributional Impact</h1>
        <p className="text-[17px] text-emerald-800 font-semibold mt-2.5">
          {(pctBetter * 100).toFixed(0)}% of American households are better off under the Accord at Year {snapshotYear} —
          driven by the universal ${prebateShown.toLocaleString()}/person prebate and growing AMCF dividend offsetting the {(vatRate * 100).toFixed(0)}% VAT.
        </p>
        <p className="text-sm text-muted-foreground mt-1.5">
          Net fiscal burden comparison: VAT ({(vatRate * 100).toFixed(0)}%) + LVT net ({(lvtRate * 100).toFixed(0)}%) + carbon ($100/ton) versus
          prebate (${prebateShown.toLocaleString()}/person, {exemptionOn ? '$500k homeowner exemption on' : 'no homeowner exemption — revenue redirected to prebate'}),
          AMCF citizen dividend (${Math.round(amcfPerCap).toLocaleString()}/person at Year {snapshotYear}),
          and worker equity (toggle below). Income tax kept at current law in this base distributional view.
        </p>
      </div>

      {/* ── View toggle ── */}
      <Tabs value={view} onValueChange={setView} className="mt-7">
        <TabsList>
          <TabsTrigger value="national">National Picture</TabsTrigger>
          <TabsTrigger value="table">Full Accord Table</TabsTrigger>
          <TabsTrigger value="calculator">My Household</TabsTrigger>
        </TabsList>

        {/* ── Shared controls (National + Table views) ── */}
        {view !== 'calculator' && (
          <ControlPanel columns={3} className="mt-5">
            <SliderControl
              label={`VAT Rate: ${(vatRate * 100).toFixed(0)}%`}
              value={vatRate}
              onChange={setVatRate}
              min={0}
              max={0.15}
              step={0.01}
              formatValue={v => `${(v * 100).toFixed(0)}%`}
            />
            <SliderControl
              label={`LVT Rate: ${(lvtRate * 100).toFixed(0)}%`}
              value={lvtRate}
              onChange={setLvtRate}
              min={0}
              max={0.20}
              step={0.01}
              formatValue={v => `${(v * 100).toFixed(0)}%`}
            />
            <SliderControl
              label={`Snapshot Year: ${snapshotYear}`}
              value={snapshotYear}
              onChange={setSnapshotYear}
              min={1}
              max={30}
              step={1}
              formatValue={v => `Year ${v}`}
            />
            <ControlGroup>
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="py-3 px-4 text-xs leading-7">
                  <strong>AMCF at Year {snapshotYear}</strong><br />
                  Equity: <strong>${(amcfEquity / 1e12).toFixed(1)}T</strong> &nbsp;|&nbsp;
                  Yield: <strong>{(amcfYield * 100).toFixed(1)}%</strong><br />
                  Dividend: <strong>${Math.round(amcfPerCap).toLocaleString()}/person/yr</strong>
                </CardContent>
              </Card>
            </ControlGroup>
            <ControlGroup>
              <p className="text-xs font-semibold mb-1.5">$500k Homeowner Exemption</p>
              <Button
                variant={exemptionOn ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExemptionOn(s => !s)}
                className={exemptionOn ? 'bg-emerald-800 hover:bg-emerald-900' : ''}
              >
                {exemptionOn ? '✓ Exemption On' : 'Exemption Off'}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[120px]">
                Off (default): prebate ${PREBATE_REDIRECTED.toLocaleString()}. On: $500k shield, prebate $5,000.
              </p>
            </ControlGroup>
            <ControlGroup>
              <p className="text-xs font-semibold mb-1.5">Worker Equity</p>
              <Button
                variant={showPSU ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowPSU(s => !s)}
                className={showPSU ? 'bg-emerald-800 hover:bg-emerald-900' : ''}
              >
                {showPSU ? '✓ Equity On' : 'Equity Off'}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[110px]">PSU dividends + annualized cashout</p>
            </ControlGroup>
          </ControlPanel>
        )}

        {/* ══ NATIONAL PICTURE ══════════════════════════════════════════════════ */}
        <TabsContent value="national">
          {/* Headline stats */}
          <div className="grid grid-cols-3 gap-4 mt-7">
            <MilestoneCard label="Households better off" value={fmtPct(pctBetter)} className="[&_p:last-of-type]:text-emerald-600 [&_p.text-xl]:text-[28px]" />
            <MilestoneCard label="Households worse off" value={fmtPct(worseOffHH / totalFilers)} className="[&_p:last-of-type]:text-red-600 [&_p.text-xl]:text-[28px]" />
            <MilestoneCard label="Breakeven income range" value={breakeven || 'None in range'} className="[&_p:last-of-type]:text-blue-700 [&_p.text-xl]:text-[28px]" />
          </div>

          {/* Chart 1: Net change by bracket */}
          <ChartContainer
            title={`Annual Net Fiscal Change by Income Bracket — Year ${snapshotYear}`}
            subtitle="Green = better off under Accord (pays less or receives more). Red = worse off. Neutral band ±$100."
            height={340}
            source={
              <>
                Sources: IRS Statistics of Income (2024 estimates); EPA household carbon survey; BLS Consumer Expenditure Survey.
                Accord parameters: VAT {(vatRate * 100).toFixed(0)}%, LVT {(lvtRate * 100).toFixed(0)}% ({exemptionOn ? '$500k homeowner exemption' : 'no exemption'}), carbon $100/ton (80% recycled as equal per-capita dividend),
                ${prebateShown.toLocaleString()}/person/yr prebate, AMCF dividend ${Math.round(amcfPerCap).toLocaleString()}/person (National Balance Sheet validated equity base).
                {showPSU ? ' Worker equity (PSU dividends + annualized cashout) included.' : ' Worker equity not included — toggle above.'}
              </>
            }
          >
            <BarChart data={netChangeData.map(d => ({ ...d, netChange: -d.delta }))}
              margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="name" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' }} interval={0} />
              <YAxis tickFormatter={fmtDollar} tick={CHART_AXIS.tick} width={70} />
              <Tooltip content={<DollarTooltip />} />
              <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
              <Bar dataKey="netChange" name="Net change vs current law" radius={[3,3,0,0]}>
                {netChangeData.map((d, i) => (
                  <Cell key={i} fill={d.betterOff ? '#10B981' : d.worseOff ? '#EF4444' : '#9CA3AF'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          {/* Chart 2: Effective Tax Rate */}
          <ChartContainer
            title="Effective Net Tax Rate — Current Law vs Accord"
            subtitle="Net burden as % of income. Accord effective rate is lower for most households due to prebate, AMCF dividend, and LVT rent relief offsetting the VAT. Negative = household receives more from Accord than it pays."
            height={300}
            source="Effective rate = net burden / income. Bottom brackets show negative rate under Accord: prebate + AMCF grants exceed VAT + carbon liability for households near or below poverty line."
          >
            <LineChart data={rateData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' }} interval={0} />
              <YAxis tickFormatter={v => `${v}%`} tick={CHART_AXIS.tick} width={50} />
              <Tooltip formatter={v => [`${v.toFixed(1)}%`]} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
              <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="4 4" />
              <Line dataKey="Current Law"   stroke="#1D4ED8" strokeWidth={2.5} dot={false} />
              <Line dataKey="Accord (base)" stroke="#059669" strokeWidth={2.5} dot={false} />
              {showPSU && <Line dataKey="Accord + Equity" stroke="#065F46" strokeWidth={2} dot={false} strokeDasharray="5 3" />}
            </LineChart>
          </ChartContainer>

          {/* Summary table */}
          <div className="mt-12">
            <h2 className="text-lg font-semibold tracking-tight">Summary by Income Bracket</h2>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Income Range</TableHead>
                  <TableHead>Filers</TableHead>
                  <TableHead className="text-blue-700">Current Rate</TableHead>
                  <TableHead className="text-emerald-600">Accord Rate</TableHead>
                  <TableHead>Net Annual Δ</TableHead>
                  <TableHead>Better Off?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distrib.map((d, i) => {
                  const delta   = showPSU ? d.deltaWithPSU : d.delta;
                  const effAcc  = showPSU ? d.effAccordWithPSU : d.effAccord;
                  const better  = showPSU ? d.betterOffWithPSU : d.betterOff;
                  const worse   = delta > 100;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-semibold">{d.label}</TableCell>
                      <TableCell>{(d.filers / 1e6).toFixed(1)}M</TableCell>
                      <TableCell className="text-blue-700">{fmtPct(d.effCL)}</TableCell>
                      <TableCell className={effAcc < d.effCL ? 'text-emerald-600' : 'text-red-600'}>{fmtPct(effAcc)}</TableCell>
                      <TableCell className={`font-semibold ${delta <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {delta <= 0 ? '+' : ''}{fmtDollar(-delta)}
                      </TableCell>
                      <TableCell>{better ? '✓ Yes' : worse ? '✗ No' : '≈ Neutral'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ══ FULL ACCORD TABLE ════════════════════════════════════════════════ */}
        <TabsContent value="table">
          <div className="mt-7 overflow-x-auto">
            <p className="text-sm text-muted-foreground mb-4">
              Complete per-household impact vs Current Law. Income tax unchanged (base Accord distributional picture).
              VAT {(vatRate * 100).toFixed(0)}% + LVT {(lvtRate * 100).toFixed(0)}% + carbon $100/ton + prebate $5K/person + AMCF ${Math.round(amcfPerCap).toLocaleString()}/person at Year {snapshotYear}.
            </p>
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1e3a5f] hover:bg-[#1e3a5f]">
                  {[
                    'Bracket', 'Avg Inc', 'Filers',
                    'VAT Burden', 'LVT Net', 'Carbon Net',
                    'Prebate', 'AMCF Div',
                    ...(showPSU ? ['PSU Div', 'Cashout (ann.)'] : []),
                    'NET Δ vs CL', '% Income', 'Status',
                  ].map((h, i) => (
                    <TableHead key={i} className={`text-white text-[11px] font-bold ${i > 2 ? 'text-right' : 'text-left'} ${
                      h === 'Prebate' || h === 'PSU Div' ? 'bg-[#14532d]'
                      : h === 'Cashout (ann.)' ? 'bg-[#166534]'
                      : h === 'NET Δ vs CL' ? 'bg-[#1a5276]'
                      : ''
                    }`}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {distrib.map((d, i) => {
                  const delta  = showPSU ? d.deltaWithPSU : d.delta;
                  const better = showPSU ? d.betterOffWithPSU : d.betterOff;
                  const bgClass = better
                    ? (i % 2 === 0 ? 'bg-green-50' : 'bg-emerald-50')
                    : delta > 1000
                      ? 'bg-red-50'
                      : '';
                  return (
                    <TableRow key={i} className={bgClass}>
                      <TableCell className="font-bold text-[#1e3a5f]">{d.label}</TableCell>
                      <TableCell className="text-right">${(d.avgInc / 1000).toFixed(0)}K</TableCell>
                      <TableCell className="text-right text-muted-foreground">{(d.filers / 1e6).toFixed(1)}M</TableCell>
                      <TableCell className="text-right text-red-600">+{fmtDollar(d.vatBurden)}</TableCell>
                      <TableCell className={`text-right ${d.lvtBurden > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {d.lvtBurden > 0 ? '+' : ''}{fmtDollar(d.lvtBurden)}
                      </TableCell>
                      <TableCell className={`text-right ${d.carbonNet > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {d.carbonNet > 0 ? '+' : ''}{fmtDollar(d.carbonNet)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600 bg-green-50">
                        −{fmtDollar(d.prebate)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-600">−{fmtDollar(d.amcfBenefit)}</TableCell>
                      {showPSU && (
                        <TableCell className="text-right font-bold text-emerald-600 bg-green-50">
                          −{fmtDollar(d.psuDividend)}
                        </TableCell>
                      )}
                      {showPSU && (
                        <TableCell className="text-right text-emerald-600 bg-emerald-50">
                          −{fmtDollar(d.psuCashout)}
                        </TableCell>
                      )}
                      <TableCell className={`text-right font-bold bg-blue-50 ${delta < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {delta < 0 ? '−' : '+'}{fmtDollar(Math.abs(delta))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {(Math.abs(d.deltaPct)).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center font-bold text-[11px]">
                        {better
                          ? <span className="text-emerald-600">✓ Better</span>
                          : delta > 100
                            ? <span className="text-red-600">✗ Worse</span>
                            : <span className="text-muted-foreground">≈ Neutral</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {showPSU && (
            <InfoBox className="mt-3 bg-green-50 text-emerald-800 border-emerald-200">
              <strong>PSU Div:</strong> Annual income from held stakes — Tier 1 sectoral fund ($1K/yr at 6% gross, 3.5% distributed) + Tier 2 phantom-equity fund dividends + Tier 3 PSU dividends at 3.5% yield (Tier 3 value appreciates at 7.5%/yr after Year 5 ramp). &nbsp;
              <strong>Cashout (ann.):</strong> Wealth transfer when worker changes jobs — PSU/phantom equity redeemed at FMV, annualized as value ÷ average tenure (4.1 yr). Tier 1 sectoral fund is portable (no cashout event).
            </InfoBox>
          )}
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Accord parameters: VAT {(vatRate * 100).toFixed(0)}% on consumption (BLS consumption ratios by bracket) + LVT {(lvtRate * 100).toFixed(0)}% (net burden — renters receive rent relief; homeowners pay LVT on land value) + carbon $100/ton (80% recycled as equal per-capita dividend = ~${Math.round(5e9 * 100 * 0.80 / 330e6 * 2.5).toLocaleString()}/avg-household) + $5,000/person/yr universal prebate + AMCF dividend ${Math.round(amcfPerCap).toLocaleString()}/person (Year {snapshotYear}, National Balance Sheet validated equity base ${(amcfEquity / 1e12).toFixed(1)}T × {(amcfYield * 100).toFixed(1)}% yield).
            Income tax unchanged vs current law in this base distributional view (see Income Tax Design for income tax reform scenarios).
          </p>
        </TabsContent>

        {/* ══ HOUSEHOLD CALCULATOR ════════════════════════════════════════════ */}
        <TabsContent value="calculator">
          <div className="grid grid-cols-[360px_1fr] gap-8 mt-7">
            {/* Inputs */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-base font-bold mb-5">Your Household</h3>

                {[
                  {
                    label: 'Annual Household Income',
                    input: (
                      <div className="flex gap-2 items-center">
                        <span className="text-sm text-foreground">$</span>
                        <input type="number" value={calcIncome}
                          onChange={e => setCalcIncome(+e.target.value || 0)}
                          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
                          min={0} max={5000000} step={1000} />
                      </div>
                    ),
                  },
                  {
                    label: 'Household Size (people)',
                    input: (
                      <select value={calcHhSize} onChange={e => setCalcHhSize(+e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm">
                        {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>)}
                      </select>
                    ),
                  },
                  {
                    label: 'Number of Children',
                    input: (
                      <select value={calcChildren} onChange={e => setCalcChildren(+e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm">
                        {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    ),
                  },
                  {
                    label: 'Filing Status',
                    input: (
                      <select value={calcFiling} onChange={e => setCalcFiling(e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm">
                        <option value="single">Single</option>
                        <option value="mfj">Married Filing Jointly</option>
                      </select>
                    ),
                  },
                  {
                    label: 'Realized Capital Gains This Year',
                    input: (
                      <div className="flex gap-2 items-center">
                        <span className="text-sm">$</span>
                        <input type="number" value={calcCapGains}
                          onChange={e => setCalcCapGains(+e.target.value || 0)}
                          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
                          min={0} step={1000} />
                      </div>
                    ),
                  },
                ].map(({ label, input }, i) => (
                  <div key={i} className="mb-4">
                    <label className="block mb-1.5 text-[13px] font-semibold text-foreground">{label}</label>
                    {input}
                  </div>
                ))}

                <div className="mt-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
                  Prebate: <strong>${(PREBATE_REDIRECTED * calcHhSize).toLocaleString()}/year</strong> (${PREBATE_REDIRECTED.toLocaleString()} × {calcHhSize}, exemption removed)<br />
                  AMCF: <strong>~$600/person/year</strong> (base Year 1–2 estimate)
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            <div>
              {/* Net change banner */}
              <Card className={`mb-5 ${calcNetChange >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                <CardContent className="py-5 px-6">
                  <p className="text-sm text-foreground mb-1">Under the American Ownership Accord, your household would be:</p>
                  <p className={`text-[32px] font-extrabold ${calcNetChange >= 0 ? 'text-emerald-800' : 'text-red-900'}`}>
                    {calcNetChange >= 0 ? '▲ ' : '▼ '}
                    {fmtDollar(Math.abs(Math.round(calcNetChange)))} per year
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {calcNetChange >= 0 ? 'better off' : 'worse off'} than under the current system.
                    {calcNetChange < 0 && calcIncome > 150000 && ' Higher-income households net-pay more to fund universal prebate and AMCF.'}
                  </p>
                </CardContent>
              </Card>

              {/* Side-by-side breakdown */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { title: 'Current System', burden: calcResults.cur, color: '#1D4ED8', bgClass: 'bg-blue-50 border-blue-200' },
                  { title: 'American Ownership Accord', burden: calcResults.acc, color: '#065F46', bgClass: 'bg-emerald-50 border-emerald-200' },
                ].map(({ title, burden, color, bgClass }) => (
                  <Card key={title} className={bgClass}>
                    <CardContent className="p-4">
                      <p className="font-bold mb-3 text-sm" style={{ color }}>{title}</p>
                      {Object.entries(burden.breakdown).map(([k, v]) => (
                        <div key={k} className="flex justify-between mb-1.5 text-xs">
                          <span className="text-foreground">{k}</span>
                          <span className={`font-semibold ${v < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {v < 0 ? '−' : '+'}${Math.abs(Math.round(v)).toLocaleString()}
                          </span>
                        </div>
                      ))}
                      <div className="border-t-2 mt-2.5 pt-2.5 flex justify-between" style={{ borderColor: color + '40' }}>
                        <span className="font-bold">Net Burden</span>
                        <span className="font-bold" style={{ color }}>
                          {burden.netBurden < 0 ? '−$' : '$'}{Math.abs(Math.round(burden.netBurden)).toLocaleString()}
                          {burden.netBurden < 0 && ' (net recipient)'}
                        </span>
                      </div>
                      <p className="text-[11px] mt-2" style={{ color }}>
                        Effective rate: {fmtPct(Math.max(-0.5, Math.min(1, burden.netBurden / Math.max(calcIncome, 1))))}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <InfoBox className="mt-4">
                <strong className="text-foreground">Calculator notes:</strong>{' '}
                LVT net burden estimated as 1.5% of income above $75K (rough owner-weighted average at 10% LVT; renters net zero or positive from rent relief).
                Carbon tax = ${estimatedCarbonTons(calcIncome)} estimated tons × $100/ton, less $1,212 per-person annual carbon dividend (80% of revenue recycled equally).
                Worker equity dividends use income-bracket approximation ($1,200–$4,000/yr; executives excluded).
                AMCF uses ~$600/person base (Year 1–2); dividend grows substantially by Year 10+ (see National Balance Sheet for trajectory).
                Capital gains reform not modeled here — see Income Tax Design for full income tax + CG reform analysis.
              </InfoBox>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Methodology ── */}
      <InfoBox className="mt-12">
        <strong className="text-foreground">Methodology:</strong>{' '}
        Bracket data: IRS Statistics of Income 2024 estimates (15 brackets, 162M filers). Effective current-law rates calibrated to IRS SOI.
        Accord parameters (base): VAT 4% on consumption (BLS CES ratios by bracket); LVT 10% net burden (renters receive rent relief, homeowners net-pay land value tax — lower brackets net zero);
        carbon $100/ton × EPA household emissions, 80% recycled as equal per-capita dividend (~$1,212/person/yr);
        $5,000/person/yr universal prebate; AMCF equity dividend from National Balance Sheet validated equity trajectory.
        Worker equity (three-tier): Tier 1 sectoral fund ($1K/yr at 6% gross, 3.5% distributed); Tier 2 phantom equity ($25K–$100K/worker) via sectoral fund contributions;
        Tier 3 PSU (4%/yr Equity Excise → 20% ownership, appreciates at 7.5%/yr after Year 5 ramp, 3.5% dividend yield).
        Part-time FTE adjustment applied by bracket. All values in 2024 real dollars. Income tax unchanged vs current law in this view (see Income Tax Design for income tax reform).
      </InfoBox>
    </PageShell>
  );
}
