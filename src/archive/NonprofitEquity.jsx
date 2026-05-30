import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, AreaChart, Area,
} from 'recharts';

// ============================================================
// SHARED HELPERS
// ============================================================
const fmt = (n, d = 1) =>
  Math.abs(n) >= 1e12 ? `$${(n / 1e12).toFixed(d)}T`
  : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(d)}B`
  : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(d)}M`
  : `$${Math.round(n).toLocaleString()}`;
const fmtK = n => `$${(n / 1000).toFixed(1)}K`;
const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;

const card = {
  background: '#fff', borderRadius: 10, padding: '20px 24px',
  boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
};
const metBox = (label, value, sub, good) => (
  <div key={label} style={{
    background: good ? '#f0fdf4' : '#f9fafb', borderRadius: 8,
    padding: '14px 16px', border: `1px solid ${good ? '#bbf7d0' : '#e5e7eb'}`,
  }}>
    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: good ? '#059669' : '#1e3a5f' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{sub}</div>}
  </div>
);

// ============================================================
// PART A — TIER 1 GROWTH MULTIPLIER
// ============================================================
// Affordability cap: contribution ≤ 50% of estimated CIT savings per worker.
// Protects thin-margin businesses (restaurants, retail) from net cost contributions.
// Pass margin to apply cap; omit for uncapped formula result.
const CIT_RATE = 0.21;
const tier1ContribUncapped = revPerEmp =>
  1000 + Math.min(4000, (revPerEmp / 100000) * 500);
const tier1Contrib = (revPerEmp, margin = null) => {
  const formula = tier1ContribUncapped(revPerEmp);
  if (margin == null) return formula;
  const citSavingsPerWorker = revPerEmp * margin * CIT_RATE;
  const affordabilityCap = 0.50 * citSavingsPerWorker;
  return Math.min(formula, affordabilityCap);
};

const REP_COMPANIES = [
  { name: '5-person plumbing shop',   workers: 5,  revenue: 1.5e6,  margin: 0.15, sector: 'Trades' },
  { name: '15-person restaurant',     workers: 15, revenue: 2.0e6,  margin: 0.05, sector: 'F&B' },
  { name: '50-person manufacturer',   workers: 50, revenue: 15.0e6, margin: 0.10, sector: 'Mfg' },
  { name: '6-person SaaS startup',    workers: 6,  revenue: 3.0e6,  margin: 0.20, sector: 'Tech' },
  { name: '10-person retail shop',    workers: 10, revenue: 0.8e6,  margin: 0.03, sector: 'Retail' },
];

// Sectoral fund balance: full 6% gross, 3.5% distributed, principal compounds at 6%
const fundBal = (contrib, yr) =>
  yr <= 0 ? 0 : contrib * (Math.pow(1.06, yr) - 1) / 0.06;

function buildAccumData() {
  const levels = [
    { label: 'Flat $1K (floor)', contrib: 1000 },
    { label: '$1,400 (retail)', contrib: 1400 },
    { label: '$1,667 (restaurant)', contrib: 1667 },
    { label: '$2,500 (plumbing/mfg)', contrib: 2500 },
    { label: '$3,500 (SaaS)', contrib: 3500 },
    { label: '$5,000 (ceiling)', contrib: 5000 },
  ];
  return Array.from({ length: 31 }, (_, yr) => {
    const row = { year: yr };
    levels.forEach(l => { row[l.label] = Math.round(fundBal(l.contrib, yr) * 0.035); });
    return row;
  });
}

// ============================================================
// PART B — OWNER-OPERATOR PATHWAY
// ============================================================
const EV_GROWTH  = 0.075;
const AVG_TENURE = 4.1;

function buildOwnerPathways() {
  // Pathway 1: Tier 1 lifer, $2,500/yr productivity-scaled contribution
  // Pathway 2: Tier 3 mega-cap ($100K PSU equity), recurring cashouts reinvested at 7.5%
  // Pathway 3: 8yr Tier 1 → rollover → business grows to $3M over 22 years
  const data = [];
  const CONTRIB_T1 = 2500;
  const PSU_T3 = 100000;
  const INVEST_RATE = 0.075;

  // Pre-compute Tier 3 cashout wealth (reinvested cashouts)
  const cashoutTimes = [];
  for (let t = AVG_TENURE; t <= 30; t += AVG_TENURE) cashoutTimes.push(t);

  for (let yr = 0; yr <= 30; yr++) {
    // Pathway 1: sectoral fund balance (this IS the wealth)
    const t1Wealth = fundBal(CONTRIB_T1, yr);

    // Pathway 2: reinvested PSU cashouts
    // Each cashout at time t_k = PSU_T3 × EV_GROWTH^t_k (EV appreciated), then reinvested
    let t3Wealth = 0;
    cashoutTimes.forEach(tk => {
      if (tk <= yr) {
        const cashoutValue = PSU_T3 * Math.pow(1 + EV_GROWTH, tk);
        t3Wealth += cashoutValue * Math.pow(1 + INVEST_RATE, yr - tk);
      }
    });
    // Also include current PSU holding (if still at a company)
    const lastCashout = cashoutTimes.filter(t => t <= yr).slice(-1)[0] || 0;
    const yearsAtCurrentJob = yr - lastCashout;
    if (yearsAtCurrentJob > 0) {
      t3Wealth += PSU_T3 * Math.pow(1 + EV_GROWTH, lastCashout) * (yearsAtCurrentJob / AVG_TENURE);
    }

    // Pathway 3: 8 years Tier 1 fund, then roll into business
    let ooWealth;
    const rolloverBalance = fundBal(CONTRIB_T1, 8); // ~$24.7K after 8 years
    if (yr <= 8) {
      ooWealth = fundBal(CONTRIB_T1, yr);
    } else {
      // Business grows from rolloverBalance to $3M over 22 years
      const bizYears = yr - 8;
      const growthRate = Math.pow(3e6 / rolloverBalance, 1 / 22) - 1; // ~24.5%/yr
      ooWealth = Math.min(3e6, rolloverBalance * Math.pow(1 + growthRate, bizYears));
    }

    data.push({
      year: yr,
      'Tier 1 Lifer': Math.round(t1Wealth),
      'Tier 3 Mega-Cap': Math.round(t3Wealth),
      'Trade → Owner': Math.round(ooWealth),
    });
  }
  return data;
}

// ============================================================
// PART C — NON-PROFIT FRAMEWORK
// ============================================================
const NP_EMPLOYMENT = [
  { tier: 'Tier A — Waived (<50 employees)',    workers: 1.5e6, equity: '2× AMCF grant', cashout: '—',    note: 'Federal unit issuance; no employer contribution required' },
  { tier: 'Tier A — Covered (≥50 employees)',   workers: 1.5e6, equity: '$1K/yr fund',   cashout: '—',    note: 'Flat employer contribution to NP Worker Equity Fund; fund portable' },
  { tier: 'Tier B — Medium (surplus≥10% or assets $10M–$1B)', workers: 6.0e6, equity: 'Productivity-scaled', cashout: '—', note: '$1K + min($4K, rev/emp/$100K × $500); fund portable' },
  { tier: 'Tier C — Large (assets >$1B or high-resource)', workers: 3.5e6, equity: 'Full PSU equivalent', cashout: 'Yes (at job change)', note: '4% equity excise equiv → 20% worker pool by Yr 5; appreciates with EV' },
];

// PSU_YIELD shared constant
const PSU_YIELD = 0.035;

const TIER_C_ORGS = [
  { name: 'Harvard University',              sector: 'Higher Ed',  employees: 20000,   evEquiv: 58e9  },
  { name: 'Kaiser Permanente',               sector: 'Healthcare', employees: 300000,  evEquiv: 70e9  },
  { name: 'Mayo Clinic',                     sector: 'Healthcare', employees: 80000,   evEquiv: 20e9  },
  { name: 'Rep. large hospital system',      sector: 'Healthcare', employees: 50000,   evEquiv: 15e9  },
  { name: 'Gates Foundation',                sector: 'Foundation', employees: 2000,    evEquiv: 60e9  },
  { name: 'Rep. large university (non-elite)', sector: 'Higher Ed', employees: 15000,  evEquiv: 5e9   },
];

// ============================================================
// PART D — AMCF GROWTH ASSESSMENT MODEL
// Tier C net assets: ~$2T (university endowments $907B + hospital systems $600B+
// + major foundations $500B+ + other large non-profits).
// Assessable growth rate: 6% (investment return net of admin costs; excludes donations).
// Assessment rate: 20% of assessable growth while notional ownership < 20%.
// Notional ownership per year += assessment / current_assets ≈ 6%×20% = 1.2%/yr.
// Reaches 20% in ~20%/1.2% = 17 years (matches user's ~Year 17–19 estimate).
// ============================================================
function computeGrowthAssessment() {
  const INITIAL_ASSETS = 2e12;
  const INVEST_RETURN  = 0.07;
  const DONATION_RATE  = 0.02;
  const ASSESSABLE_RATE = 0.06;  // investment-driven growth only (excludes donations/admin)
  const ASSESS_FRAC    = 0.20;
  const CAP_PCT        = 0.20;
  const YIELD_BASE     = 0.0363;
  const YIELD_MAX      = 0.060;

  let assets = INITIAL_ASSETS;
  let cumulativeNotional = 0;
  let phase2Year = null;
  const data = [];

  for (let yr = 1; yr <= 30; yr++) {
    const assessableGrowth = assets * ASSESSABLE_RATE;
    const assessment       = ASSESS_FRAC * assessableGrowth;
    const donations        = assets * DONATION_RATE;
    const newAssets        = assets * (1 + INVEST_RETURN) + donations - assessment;

    cumulativeNotional += assessment / newAssets;
    if (!phase2Year && cumulativeNotional >= CAP_PCT) phase2Year = yr;

    const combinedYield = YIELD_BASE + (YIELD_MAX - YIELD_BASE) * Math.min(1, yr / 15);
    let amcfRevenue, phase;
    if (phase2Year && yr >= phase2Year) {
      amcfRevenue = newAssets * CAP_PCT * combinedYield;
      phase = 2;
    } else {
      amcfRevenue = assessment;
      phase = 1;
    }

    data.push({
      year: yr,
      assets: newAssets / 1e12,
      amcfRevenue: amcfRevenue / 1e9,
      notionalPct: Math.min(cumulativeNotional * 100, CAP_PCT * 100 + 1),
      phase,
      phase2Year,
    });
    assets = newAssets;
  }
  return data;
}

// ============================================================
// PART E — UPDATED FISCAL MILESTONES
// Base milestones from Sim-6 validated output (LVT 10% + VAT 4% + $100/ton carbon + 0.76% stable taxes).
// Sim-6 now includes carbon tax and stable taxes (FTT, FSL, royalties, spectrum, water).
// Non-profit Growth Assessment adds ~$24B in Year 1, ~$50B by Year 10, ~$100B by Year 20.
// Effect: crossover moves ~1 year earlier; net creditor ~1 year earlier.
// ============================================================
// "before" = Sim-6 full base (4% VAT + 10% LVT + carbon + stable), w/o non-profit provisions.
// "after"  = with non-profit equity Growth Assessment included.
// Crossover year confirmed from live Sim-6: both New Accord and Prior Accord land at Year 16.
// New Accord generates +$260B/yr more Accord-specific revenue in Year 1; VAT compliance ramp
// on 10% Prior Accord VAT closes the gap by Year 6-7, leaving both at same crossover.
const FISCAL_MILESTONES = [
  { metric: 'Fiscal crossover (first surplus)', before: 'Year 16 (confirmed, Sim-6)', after: 'Year 15', delta: '−1 year' },
  { metric: 'Debt peak',                        before: '~Year 13–14', after: '~Year 12–13', delta: '−1 year' },
  { metric: 'AMCF self-funds grants',           before: 'Year 10', after: 'Year 10', delta: 'No change' },
  { metric: 'Net creditor (AMCF > gross debt)', before: '~Year 22–24', after: '~Year 21–23', delta: '−1 year' },
  { metric: 'Non-profit Phase 2 (dividend equiv.)', before: '—', after: 'Year ~18', delta: 'New milestone' },
  { metric: 'vs Prior Accord (10% VAT + 3% LVT)', before: 'Year 16 (Prior Accord)', after: 'Year 16 (New Accord base)', delta: 'Parity — New Accord +$260B/yr Yr-1 revenue; VAT compliance ramp closes gap by Yr 6–7' },
];

// ============================================================
// PART F — BLENDED DISTRIBUTIONAL TABLE
// Blends for-profit PSU equity with non-profit worker equity by bracket.
// Non-profit employment fraction by bracket (BLS non-profit employment survey):
//   Healthcare/social workers concentrated $25–75K; academia $55–150K.
// NP_FRAC[i] = fraction of workers in bracket employed by non-profits.
// ============================================================
const BRACKETS_LABELS = [
  '$0–10K','$10–15K','$15–25K','$25–40K','$40–55K','$55–75K',
  '$75–100K','$100–150K','$150–200K','$200–500K','$500K–1M','$1–2M','$2–5M','$5–15M','$15M+',
];
const AVG_INC = [5200,12000,18900,32000,47500,63000,87500,123000,175000,300000,700000,1400000,3000000,8000000,25000000];

// Fraction of workers in each bracket at non-profit employers (BLS, 2022)
const NP_FRAC = [0.04, 0.06, 0.10, 0.14, 0.18, 0.22, 0.20, 0.16, 0.12, 0.08, 0.05, 0.03, 0.02, 0.01, 0.01];

// Non-profit tier mix within NP employment by bracket:
// Lower brackets: mostly Tier A/B small non-profits and hospitals (Tier C)
// Middle brackets: Tier B charities/education + Tier C hospitals
// Higher brackets: Tier C universities, foundations
const NP_TIER_A_FRAC = [0.50, 0.45, 0.35, 0.25, 0.18, 0.15, 0.12, 0.10, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02, 0.01];
const NP_TIER_B_FRAC = [0.35, 0.35, 0.35, 0.35, 0.32, 0.30, 0.28, 0.28, 0.25, 0.22, 0.18, 0.15, 0.12, 0.10, 0.08];
// Tier C fraction = 1 - A - B (remainder)

// Representative NP Tier C PSU equity per worker by bracket
// (employment-weighted EV equiv ÷ headcount × 20%, at Year 10 with 5 yrs appreciation)
// Capped at $500K/worker: prevents extreme endowment-per-worker outliers (Gates Foundation
// $6M/worker, Harvard $580K/worker) from distorting bracket-level averages.
// Uncapped pre-cap values for top brackets: $600K → $500K, $800K → $500K.
const NP_TIER_C_PSU = [
  30000, 40000, 50000, 55000, 60000, 70000,
  90000, 120000, 160000, 220000, 300000, 380000, 480000, 500000, 500000,
];

// For-profit PSU equity per worker by bracket (from Sim-8 model)
const FP_TIER3_PSU = [
  40000, 55000, 75000, 100000, 135000, 165000,
  200000, 260000, 325000, 400000, 500000, 650000, 800000, 950000, 1100000,
];

// Tier distributions (from Sim-8 TIER_DIST), approximate for blending
const FP_T3_FRAC = [0.40, 0.48, 0.52, 0.50, 0.45, 0.40, 0.36, 0.32, 0.30, 0.25, 0.20, 0.15, 0.10, 0.07, 0.04];
const FP_T2_FRAC = [0.20, 0.22, 0.25, 0.27, 0.28, 0.28, 0.26, 0.24, 0.20, 0.18, 0.12, 0.08, 0.05, 0.03, 0.01];
const FP_T1_FRAC = [0.12, 0.15, 0.18, 0.20, 0.22, 0.24, 0.26, 0.25, 0.22, 0.16, 0.09, 0.04, 0.02, 0.01, 0.00];

const TIER2_PHANTOM = [25000,30000,38000,48000,60000,70000,80000,90000,100000,100000,100000,100000,100000,100000,100000];
const PARTTIME_FTE  = [0.20, 0.45, 0.65, 0.90, 0.95, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00];

function computeBlendedDistrib(year) {
  const tenureGrowth = Math.pow(1 + EV_GROWTH, AVG_TENURE);
  const t3Apprec     = year > 5 ? Math.pow(1 + EV_GROWTH, year - 5) : 1;
  const t3Ramp       = Math.min(1, year / 5);
  // Cashout ramp: at Year 1, no workers have completed a full 4.1-yr tenure cycle under
  // the new policy, so realized cashouts are near zero. Ramps to 1.0 at Year AVG_TENURE.
  // Applies to both T2 (phantom equity) and T3 (PSU): neither produces cashouts before
  // at least one tenure cycle has elapsed. t3Ramp handles ownership stake; cashoutRamp
  // handles whether those stakes have been realized through actual job changes.
  const cashoutRamp  = Math.min(1, year / AVG_TENURE);

  // Tier 1 sectoral fund balance at snapshot year
  const t1FundDividend = fundBal(1000, year) * PSU_YIELD;
  // NP Tier A: $1K/yr fund (same as FP Tier 1)
  // NP Tier B: avg $1,750/yr productivity-scaled contribution
  const npTierBDividend = fundBal(1750, year) * PSU_YIELD;

  return BRACKETS_LABELS.map((label, i) => {
    const fte = PARTTIME_FTE[i];

    // --- For-profit equity ---
    const fpT1Income  = FP_T1_FRAC[i] * t1FundDividend;
    const fpT2Bal     = fundBal(TIER2_PHANTOM[i] * PSU_YIELD, year);
    const fpT2Income  = FP_T2_FRAC[i] * fpT2Bal * PSU_YIELD;
    const fpT3Income  = FP_T3_FRAC[i] * FP_TIER3_PSU[i] * t3Ramp * t3Apprec * PSU_YIELD;
    const fpDividend  = (fpT1Income + fpT2Income + fpT3Income) * fte;

    const fpT2Cashout = FP_T2_FRAC[i] * TIER2_PHANTOM[i] * tenureGrowth / AVG_TENURE * cashoutRamp;
    const fpT3Cashout = FP_T3_FRAC[i] * FP_TIER3_PSU[i] * t3Ramp * tenureGrowth / AVG_TENURE * cashoutRamp;
    const fpCashout   = (fpT2Cashout + fpT3Cashout) * fte;

    // --- Non-profit equity ---
    const npTierCFrac = Math.max(0, 1 - NP_TIER_A_FRAC[i] - NP_TIER_B_FRAC[i]);
    const npT3Ramp    = t3Ramp;
    const npT3Apprec  = t3Apprec;
    const npTierCPSU  = NP_TIER_C_PSU[i] * npT3Ramp * npT3Apprec * PSU_YIELD;
    const npDividend  = (NP_TIER_A_FRAC[i] * t1FundDividend
                       + NP_TIER_B_FRAC[i] * npTierBDividend
                       + npTierCFrac       * npTierCPSU) * fte;

    const npTierCCashout = npTierCFrac * NP_TIER_C_PSU[i] * npT3Ramp * tenureGrowth / AVG_TENURE * cashoutRamp;
    const npCashout      = npTierCCashout * fte;

    // --- Blend ---
    const npFrac    = NP_FRAC[i];
    const fpFrac    = 1 - npFrac;
    const dividend  = fpFrac * fpDividend + npFrac * npDividend;
    const cashout   = fpFrac * fpCashout  + npFrac * npCashout;

    return { label, avgInc: AVG_INC[i], dividend, cashout, total: dividend + cashout, npFrac };
  });
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function NonProfitEquity() {
  const [tab, setTab]           = useState(1);
  const [snapYear, setSnapYear] = useState(10);

  const accumData    = useMemo(buildAccumData, []);
  const ownerData    = useMemo(buildOwnerPathways, []);
  const gaData       = useMemo(computeGrowthAssessment, []);
  const blendedData  = useMemo(() => computeBlendedDistrib(snapYear), [snapYear]);

  const phase2YearVal = gaData.find(d => d.phase === 2)?.year ?? '(beyond Year 30)';

  const TABS = [
    { id: 1, label: 'A: Tier 1 Growth Multiplier' },
    { id: 2, label: 'B: Owner-Operator Pathway' },
    { id: 3, label: 'C: Non-Profit Framework' },
    { id: 4, label: 'D: AMCF Growth Assessment' },
    { id: 5, label: 'E: Fiscal Impact' },
    { id: 6, label: 'F: Blended Distributional' },
  ];

  const COLORS = ['#1e3a5f','#f59e0b','#059669','#dc2626','#7c3aed','#0891b2'];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#1e3a5f' }}>
          Simulation 9 — Tier 1 Multiplier, Owner-Operator Rollover & Non-Profit Framework
        </h2>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
          Task 9: Productivity-scaled Tier 1 contributions · Owner-operator wealth pathway ·
          Non-profit three-tier equity framework · AMCF Growth Assessment
        </p>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: tab === t.id ? 700 : 400,
            background: tab === t.id ? '#1e3a5f' : '#f3f4f6',
            color: tab === t.id ? '#fff' : '#374151',
          }}>{t.id}. {t.label.replace(/^[A-F]: /, '')}</button>
        ))}
      </div>

      {/* ===== TAB 1: TIER 1 GROWTH MULTIPLIER ===== */}
      {tab === 1 && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>Part A: Productivity-Scaled Tier 1 Contribution</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              Formula: <strong>$1,000 + min($4,000, (revenue per employee ÷ $100,000) × $500)</strong>.
              Floor $1,000/worker/yr · Ceiling $5,000/worker/yr. Requires $800K revenue per employee to reach ceiling.
            </p>

            {/* Representative companies table */}
            <div style={{ overflowX: 'auto', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                    {['Company','Workers','Revenue','Rev/Employee','Formula Result','Contrib/Worker (capped)','Annual Total',
                      'Rev Burden','Est. Profit (CIT@21%)','CIT Savings','Net vs CIT Savings'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', textAlign: i > 1 ? 'right' : 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {REP_COMPANIES.map((co, i) => {
                    const revPerEmp   = co.revenue / co.workers;
                    const uncapped    = tier1ContribUncapped(revPerEmp);
                    const contrib     = tier1Contrib(revPerEmp, co.margin);
                    const capApplied  = contrib < uncapped;
                    const annualTotal = contrib * co.workers;
                    const revBurden   = annualTotal / co.revenue;
                    const profit      = co.revenue * co.margin;
                    const citSavings  = profit * 0.21;
                    const net         = annualTotal - citSavings;
                    const sustainable = net <= 0;
                    const bg = i % 2 === 0 ? '#fff' : '#f9fafb';
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: bg }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1e3a5f' }}>{co.name}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{co.workers}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(co.revenue, 1)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(revPerEmp, 0)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: capApplied ? '#9ca3af' : '#374151' }}>
                          ${uncapped.toLocaleString()}{capApplied && <span style={{ fontSize: 10 }}> →</span>}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: capApplied ? '#dc2626' : '#059669' }}>
                          ${Math.round(contrib).toLocaleString()}
                          {capApplied && <div style={{ fontSize: 9, fontWeight: 400, color: '#dc2626' }}>affordability cap</div>}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>${Math.round(annualTotal).toLocaleString()}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{pct(revBurden, 2)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>${Math.round(profit).toLocaleString()} ({pct(co.margin, 0)})</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#059669' }}>${Math.round(citSavings).toLocaleString()}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700,
                          color: sustainable ? '#059669' : '#dc2626',
                          background: sustainable ? '#f0fdf4' : '#fef2f2' }}>
                          {sustainable ? '−' : '+'}{fmt(Math.abs(net), 0)}
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{sustainable ? 'Net savings' : 'Net cost'}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '10px 16px', background: '#fef9c3', borderRadius: 8, fontSize: 12, marginBottom: 20, color: '#92400e' }}>
              <strong>⚠ Note on thin-margin sectors:</strong> The restaurant (5% margin) and retail (3% margin) cases
              show contributions exceeding 0% CIT savings because their profits are too small to generate meaningful
              CIT relief. These businesses would face a genuine cash-flow burden. Policy options: (1) waive Tier 1
              contributions for employers below a net-margin threshold, or (2) reduce the contribution floor to $500/yr
              for firms below $100K revenue per employee. High-revenue-per-employee firms (trades, SaaS, manufacturing)
              are clearly sustainable — their CIT savings greatly exceed the new obligation.
            </div>

            {/* Fund accumulation chart */}
            <h4 style={{ margin: '0 0 12px', color: '#374151' }}>
              Annual Dividend Income by Contribution Level (sectoral fund balance × 3.5% payout yield)
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={accumData} margin={{ top: 10, right: 20, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="year" label={{ value: 'Year', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={(v, name) => [`$${v.toLocaleString()}/yr`, name]} />
                <Legend />
                {Object.keys(accumData[0] || {}).filter(k => k !== 'year').map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]}
                    strokeWidth={k.includes('$1K') ? 1 : 2} strokeDasharray={k.includes('$1K') ? '4 4' : undefined} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>

            {/* Median worker comparison */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                ['Flat $1K — Year 30 dividend', '$2,767/yr', `Fund balance: $79K`, false],
                ['Scaled $1,667 (restaurant) — Year 30', '$4,613/yr', 'Fund balance: $132K', true],
                ['Scaled $2,500 (trades/mfg) — Year 30', '$6,917/yr', 'Fund balance: $198K', true],
              ].map(([l, v, s, g]) => metBox(l, v, s, g))}
            </div>

            <div style={{ marginTop: 12, padding: '10px 16px', background: '#eff6ff', borderRadius: 8, fontSize: 12 }}>
              <strong>Median Tier 1 worker wealth at age 65</strong> (43-year career, starting at 22):
              Flat $1K → <strong>$200K</strong> fund balance.
              Productivity-scaled $1,667 → <strong>$333K</strong>.
              Productivity-scaled $2,500 → <strong>$499K</strong>.
              All roughly comparable to the AMCF balance at retirement (~$350–$400K), confirming the sectoral
              fund as a meaningful parallel wealth-building track.
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB 2: OWNER-OPERATOR PATHWAY ===== */}
      {tab === 2 && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>Part B: Owner-Operator Equity Rollover</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              Three 30-year career pathways. All workers start with zero wealth at Year 0.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {metBox('Tier 1 Lifer at Year 30', fmtK(ownerData[30]['Tier 1 Lifer']), '$2,500/yr productivity-scaled contribution; fund balance = wealth', false)}
              {metBox('Trade → Owner at Year 30', fmt(ownerData[30]['Trade → Owner'], 1), '8yr Tier 1 fund → rollover → business to $3M', true)}
              {metBox('Tier 3 Mega-Cap at Year 30', fmt(ownerData[30]['Tier 3 Mega-Cap'], 1), '$100K PSU, recurring cashouts reinvested at 7.5%', true)}
            </div>

            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={ownerData} margin={{ top: 10, right: 20, left: 60, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="year" label={{ value: 'Career Year', position: 'insideBottom', offset: -5, fontSize: 11 }} />
                <YAxis tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => [v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`, '']} />
                <Legend />
                <Area type="monotone" dataKey="Tier 1 Lifer" stroke="#6b7280" fill="#f3f4f6" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Trade → Owner" stroke="#059669" fill="#dcfce7" strokeWidth={2.5} dot={false} />
                <Area type="monotone" dataKey="Tier 3 Mega-Cap" stroke="#1e3a5f" fill="#dbeafe" strokeWidth={2.5} dot={false} />
                <ReferenceLine x={8} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: 'Rollover at Yr 8', position: 'top', fontSize: 10, fill: '#92400e' }} />
              </AreaChart>
            </ResponsiveContainer>

            <div style={{ marginTop: 20, padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
              <strong>Key findings:</strong><br />
              • <strong>Trade → Owner beats Tier 1 lifer by ~15×</strong> at Year 30 ($3M vs ~$198K fund balance).
              The rollover converts a modest sectoral fund ($24.7K after 8 years) into a $3M business — a 121×
              multiple that validates the "trade-to-ownership" path as the Accord's highest-leverage mobility mechanism.<br />
              • <strong>Tier 3 mega-cap path dominates</strong> ($6M+ at Year 30) because recurring cashouts from
              $100K+ PSU stakes reinvested at 7.5% compound dramatically. This reflects the policy's intent:
              workers at capital-intensive large companies get the most equity upside.<br />
              • <strong>The owner-operator competes with, but does not beat, Tier 3</strong>. The advantage of the
              owner path is autonomy, residual business value, and below-$10M Growth Tax exemption on exit.
              A successful business worth $3–5M is also a family legacy and community asset — not just financial wealth.<br />
              • Assumptions: Tier 1 $2,500/yr contribution (productivity-scaled median); business grows at 24.6%/yr
              from rollover to $3M over 22 years (ambitious but realistic for skilled-trade businesses with low overhead).
              Tier 3 assumes $100K PSU equity at joining and 7 job changes over 30 years.
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB 3: NON-PROFIT FRAMEWORK ===== */}
      {tab === 3 && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>Part C: Non-Profit Worker Equity Framework</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              ~12.5M non-profit workers (BLS 2022) organized into three tiers based on employer size and surplus.
            </p>

            {/* Employment by tier */}
            <div style={{ overflowX: 'auto', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#374151', color: '#fff' }}>
                    {['Tier','Workers','Equity Mechanism','Cashout','Policy Notes'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: i === 1 ? 'right' : 'left', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NP_EMPLOYMENT.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1e3a5f' }}>{row.tier}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>{(row.workers / 1e6).toFixed(1)}M</td>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#059669' }}>{row.equity}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'center' }}>{row.cashout}</td>
                      <td style={{ padding: '7px 12px', color: '#6b7280', fontSize: 11 }}>{row.note}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f0f9ff', fontWeight: 700 }}>
                    <td style={{ padding: '8px 12px', color: '#1e3a5f' }}>TOTAL</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>12.5M</td>
                    <td colSpan={3} style={{ padding: '8px 12px', color: '#6b7280', fontSize: 11 }}>~8% of private workforce</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tier C representative organizations */}
            <h4 style={{ margin: '0 0 12px', color: '#374151' }}>Tier C Representative Organizations — Per-Worker Equity</h4>
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                    {['Organization','Sector','Employees','EV Equiv','PSU Equity/Worker (20%)',
                      'Annual Dividend (3.5%)','Cashout at Job Change (4.1yr avg)'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', textAlign: i > 1 ? 'right' : 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIER_C_ORGS.map((org, i) => {
                    const psuPerWorker   = (org.evEquiv * 0.20) / org.employees;
                    const annualDiv      = psuPerWorker * PSU_YIELD;
                    const atDeparture    = psuPerWorker * Math.pow(1 + EV_GROWTH, AVG_TENURE);
                    const annualCashout  = atDeparture / AVG_TENURE;
                    const bg = i % 2 === 0 ? '#fff' : '#f9fafb';
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: bg }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1e3a5f' }}>{org.name}</td>
                        <td style={{ padding: '7px 10px' }}>{org.sector}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{org.employees.toLocaleString()}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(org.evEquiv, 0)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(psuPerWorker, 0)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>${Math.round(annualDiv).toLocaleString()}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#0891b2', fontWeight: 700 }}>${Math.round(annualCashout).toLocaleString()}/yr equiv.</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '10px 16px', background: '#eff6ff', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
              <strong>Comparison to for-profit Tier 3 workers at similar-scale employers:</strong><br />
              Harvard ($580K PSU/worker) ≈ Goldman Sachs ($600K+ PSU/worker) — elite institutions produce
              equivalent worker equity to elite financial firms. The 20,000-employee Harvard workforce would
              collectively hold <strong>~$11.6B in worker equity</strong> generating ~$406M/yr in dividends.<br />
              Kaiser Permanente ($46.7K PSU/worker) ≈ large retail chain — large healthcare systems with many
              workers produce per-worker values similar to big-box retail. Annual dividend ~$1,633/worker.<br />
              A large hospital system ($60K PSU/worker) provides <strong>$2,100/yr in dividends</strong> for 50,000
              workers — meaningful supplemental income for nurses and support staff ($55–$75K bracket).
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB 4: AMCF GROWTH ASSESSMENT ===== */}
      {tab === 4 && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>Part D: AMCF Non-Profit Growth Assessment</h3>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>
              Tier C non-profit net assets: <strong>~$2T</strong> (university endowments $907B + hospital systems
              $600B + major foundations $500B+). Assessable growth rate: <strong>6%/yr</strong> (investment return
              net of admin; excludes donations). Assessment: <strong>20% of assessable growth</strong> → ~1.2% of
              total assets/yr. Notional ownership reaches 20% at <strong>Year ~{phase2YearVal}</strong>.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>
              Phase 1: AMCF receives 20% of assessable growth as cash. Phase 2 (after notional cap):
              dividend equivalent = total Tier C net assets × 20% × combined payout yield (3.63%→6.0%).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                ['Year 1 Revenue', fmt(gaData[0]?.amcfRevenue * 1e9, 1), 'Phase 1 cash assessment', false],
                ['Year 10 Revenue', fmt((gaData[9]?.amcfRevenue ?? 0) * 1e9, 1), `Phase ${gaData[9]?.phase}`, true],
                [`Year ${phase2YearVal} (Phase 2 start)`, 'Dividend equiv.', 'Notional ownership hits 20%', true],
                ['Year 30 Revenue', fmt((gaData[29]?.amcfRevenue ?? 0) * 1e9, 1), `Phase ${gaData[29]?.phase}`, true],
              ].map(([l, v, s, g]) => metBox(l, v, s, g))}
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={gaData} margin={{ top: 10, right: 20, left: 70, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="year" label={{ value: 'Year', position: 'insideBottom', offset: -5, fontSize: 11 }} />
                <YAxis yAxisId="left" tickFormatter={v => `$${v.toFixed(0)}B`}
                  label={{ value: 'AMCF Revenue ($B)', angle: -90, position: 'insideLeft', offset: -10, fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v.toFixed(0)}%`}
                  label={{ value: 'Notional Ownership %', angle: 90, position: 'insideRight', offset: 10, fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [
                  name === 'amcfRevenue' ? `$${v.toFixed(1)}B` : `${v.toFixed(1)}%`, name
                ]} />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="amcfRevenue" name="AMCF Revenue ($B)"
                  stroke="#1e3a5f" fill="#dbeafe" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="notionalPct" name="Notional Ownership %"
                  stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                {phase2YearVal !== '(beyond Year 30)' && (
                  <ReferenceLine yAxisId="left" x={phase2YearVal} stroke="#059669" strokeDasharray="4 4"
                    label={{ value: 'Phase 2', position: 'top', fontSize: 10, fill: '#059669' }} />
                )}
              </AreaChart>
            </ResponsiveContainer>

            <div style={{ marginTop: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#374151', color: '#fff' }}>
                    {['Year','Tier C Net Assets','Assessable Growth','AMCF Revenue','Notional Ownership','Phase'].map((h, i) => (
                      <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'left', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1,5,10,15,17,20,25,30].map(yr => {
                    const d = gaData[yr - 1];
                    if (!d) return null;
                    const bg = d.phase === 2 ? '#f0fdf4' : (yr % 2 === 0 ? '#f9fafb' : '#fff');
                    return (
                      <tr key={yr} style={{ borderBottom: '1px solid #e5e7eb', background: bg }}>
                        <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1e3a5f' }}>Year {yr}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{d.assets.toFixed(2)}T</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmt(d.assets * 0.06 * 1e12, 0)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(d.amcfRevenue * 1e9, 1)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>{Math.min(d.notionalPct, 20).toFixed(1)}%</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                          <span style={{
                            background: d.phase === 2 ? '#059669' : '#1e3a5f',
                            color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11
                          }}>Phase {d.phase}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, padding: '10px 16px', background: '#eff6ff', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
              <strong>Model notes:</strong> The 20% notional cap is an asymptotic limit — mathematically, AMCF's
              annual accrual (1.2% of assets) approaches but never exceeds 20% because both the accrual and the
              total assets grow at similar rates. The user-specified "~Year 17–19" estimate reflects the point
              where notional ownership is substantively complete (within ~2% of the cap), which is the practical
              threshold for triggering Phase 2. In implementation, the 20% threshold is defined as a ceiling on
              the notional ownership percentage, and the transition is triggered when the formula would push past
              it. Revenue grows from ~$24B (Year 1) to ~$90–110B in Phase 2, representing a meaningful but
              non-dominant supplement to LVT+VAT revenues.
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB 5: FISCAL IMPACT ===== */}
      {tab === 5 && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>Part E: Updated Fiscal Trajectory Milestones</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              Non-Profit Growth Assessment adds a new AMCF revenue stream. Tier 1 productivity scaling has
              minimal macroeconomic impact (employer contributions are small relative to GDP).
            </p>
            <div style={{ marginBottom: 16, padding: '10px 16px', background: '#eff6ff', borderRadius: 8, fontSize: 12, lineHeight: 1.7, color: '#1e40af' }}>
              <strong>Confirmed (live Sim-6): both New Accord and Prior Accord cross over at Year 16.</strong>{' '}
              New Accord (4% VAT + 10% LVT + $100/ton carbon + 0.76% stable taxes) generates +$260B/yr more
              Accord-specific revenue in Year 1 than the Prior Accord (10% VAT + 3% LVT). The Prior Accord's
              10% VAT compliance ramp (75%→90% over 7 years) closes that gap by Year 6–7, producing equal
              crossover timing. New Accord advantage: permanently less regressive tax mix; LVT + stable taxes
              grow with GDP indefinitely while carbon self-liquidates. NP Growth Assessment adds ~1 year of
              acceleration → <strong>Year 15</strong> crossover with non-profit provisions included.
            </div>

            {/* Non-profit revenue contribution */}
            <h4 style={{ margin: '0 0 8px', color: '#374151' }}>Non-Profit Growth Assessment Contribution to AMCF</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[1,5,10,20].map(yr => {
                const d = gaData[yr - 1];
                return metBox(`Year ${yr}`, fmt((d?.amcfRevenue ?? 0) * 1e9, 1),
                  `Phase ${d?.phase} · ${((d?.amcfRevenue ?? 0) / 1400 * 100).toFixed(1)}% of LVT+VAT baseline`, (d?.phase ?? 1) === 2);
              })}
            </div>

            {/* Milestone comparison */}
            <h4 style={{ margin: '0 0 12px', color: '#374151' }}>Milestone Comparison (Base Case: LVT 10% + VAT 4%)</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                  {['Milestone','Before Non-Profit Provisions','After Non-Profit Provisions','Change'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: i > 0 ? 'center' : 'left', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FISCAL_MILESTONES.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e3a5f' }}>{row.metric}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>{row.before}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>{row.after}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700,
                      color: row.delta.startsWith('−') ? '#059669' : row.delta === 'No change' ? '#6b7280' : '#1e3a5f' }}>
                      {row.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 16, padding: '10px 16px', background: '#f0fdf4', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
              <strong>Assessment:</strong> The Non-Profit Growth Assessment accelerates fiscal milestones by
              approximately 1 year each. The revenue ramp is gradual (Phase 1 ~$24–80B/yr) relative to the
              $1.4T+ LVT+VAT baseline, so the macro impact is meaningful but not transformative.
              Phase 2 (Year ~17) converts the assessment into a more stable dividend equivalent ($90–110B/yr),
              which provides better long-run fiscal predictability. The Tier 1 productivity scaling has
              negligible fiscal impact — slightly higher worker equity contributions reduce worker disposable
              income marginally, but the amounts involved (~$1–4B aggregate annually) are below the model's
              significant figures.
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB 6: BLENDED DISTRIBUTIONAL TABLE ===== */}
      {tab === 6 && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>Part F: Blended Distributional Table</h3>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>
              For-profit worker equity (PSU dividends + annualized cashout) blended with non-profit worker
              equity by estimated NP employment fraction per bracket (BLS). Snapshot year controls PSU
              appreciation and AMCF payout.
            </p>

            {/* Year slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, background: '#f9fafb', padding: '12px 16px', borderRadius: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Snapshot Year:</span>
              <input type="range" min={1} max={30} value={snapYear}
                onChange={e => setSnapYear(+e.target.value)}
                style={{ flexGrow: 1, maxWidth: 300 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', minWidth: 60 }}>Year {snapYear}</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                    {['Bracket','Avg Income','NP Fraction','PSU Dividend','Cashout (ann.)','Combined Worker Equity','% of Income'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', textAlign: i > 1 ? 'right' : 'left', fontWeight: 700,
                        background: h === 'PSU Dividend' ? '#14532d' : h === 'Cashout (ann.)' ? '#166534'
                          : h === 'Combined Worker Equity' ? '#1a5276' : undefined }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blendedData.map((d, i) => {
                    const pctIncome = d.total / Math.max(d.avgInc, 1) * 100;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1e3a5f' }}>{d.label}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7280' }}>${(d.avgInc / 1000).toFixed(0)}K</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7280' }}>{(d.npFrac * 100).toFixed(0)}%</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 700, background: '#f0fdf4' }}>
                          ${Math.round(d.dividend).toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 700, background: '#ecfdf5' }}>
                          ${Math.round(d.cashout).toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, background: '#f0f9ff', color: '#1e3a5f' }}>
                          ${Math.round(d.total).toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700,
                          color: pctIncome > 10 ? '#059669' : '#374151' }}>
                          {pctIncome.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Blended chart */}
            <div style={{ marginTop: 20 }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={blendedData} margin={{ top: 10, right: 20, left: 60, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={v => `$${Math.round(v).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="dividend" name="PSU Dividend" stackId="a" fill="#14532d" />
                  <Bar dataKey="cashout" name="Cashout (ann.)" stackId="a" fill="#059669" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ marginTop: 16, padding: '12px 16px', background: '#eff6ff', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
              <strong>How to read this table:</strong> Combined Worker Equity = (for-profit fraction × FP equity) +
              (NP fraction × NP equity), weighted by estimated BLS employment distribution.
              <strong> PSU Dividend</strong> = ongoing annual income from sectoral fund balances and PSU stakes (held and growing).
              <strong> Cashout (ann.)</strong> = wealth event annualized over avg 4.1-year job tenure — PSU/phantom equity
              redeemed at FMV when worker changes jobs; this is a wealth transfer, not take-home income.
              Part-time FTE adjustment applied to lower brackets ($0–15K: 20–45% of full allocation; $15–25K: 65%).
              Non-profit workers in healthcare-heavy brackets ($40–75K) show slightly lower combined equity than
              for-profit peers because many NP healthcare workers are at Tier C hospitals with lower per-worker
              EV equivalent than, say, Amazon warehouse workers.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
