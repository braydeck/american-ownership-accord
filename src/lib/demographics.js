import { realGrantSeries } from '@/lib/fiscal-engine';

// 13-bracket demographic model (CBO + Federal Reserve SCF, 2024 calibration)
// Shared by Household Impact and Inequality through src/lib/household-model.js

// taxChg: income tax reform delta from Sim-8 two-rate formula (mR=25%/tR=50%, ETI-adjusted, stdDed $30K/$60K)
//   positive = net tax BURDEN (reduces income), negative = net tax RELIEF
//   B10-P50: relief (std ded shelters low incomes; 25% < current effective rates up to ~$80K)
//   P60+: burden (25% on income above std ded exceeds current marginal rates)
// accordNWG: NW growth rate under Accord (Growth Tax + cap-gains rate reduces compounding)
// accordIncG: after-tax income growth rate under Accord (capital-income demos only)
// Income: CBO Distribution of Household Income 2022, 2024-adjusted
// Wealth: Federal Reserve SCF 2022 mean by percentile band
export const DEMOS = {
  B10:  { label:'P0–P10',   short:'B10',  color:'#0B3D91',
    income:14500,   nw:-2000,   incG:0.005, nwG:0.005,  accordNWG:0.005,
    hhSz:1.8,  save:0.05, ret:0.04, consume:0.98,
    taxChg:-145,   lvt:0,      homePct:0,    k401Pct:0.05, finPct:0,    bizPct:0    }, // std ded > income → 0 new tax; CL rate ≈0
  P10:  { label:'P10–P20',  short:'P10',  color:'#2563C9',
    income:28000,   nw:7000,    incG:0.008, nwG:0.040,  accordNWG:0.040,
    hhSz:2.1,  save:0.05, ret:0.04, consume:0.95,
    taxChg:-1540,  lvt:200,    homePct:0.20, k401Pct:0.15, finPct:0.05, bizPct:0    }, // std ded ($39.6K) > income → 0 new tax; full CL relief
  P20:  { label:'P20–P30',  short:'P20',  color:'#4A90D9',
    income:40000,   nw:26000,   incG:0.010, nwG:0.020,  accordNWG:0.020,
    hhSz:2.2,  save:0.10, ret:0.04, consume:0.90,
    taxChg:-3400,  lvt:500,    homePct:0.35, k401Pct:0.20, finPct:0.08, bizPct:0.03 }, // std ded ($41.4K) > income → 0 new tax; full CL relief
  P30:  { label:'P30–P40',  short:'P30',  color:'#7FBCEA',
    income:52000,   nw:58000,   incG:0.013, nwG:0.028,  accordNWG:0.028,
    hhSz:2.3,  save:0.12, ret:0.05, consume:0.87,
    taxChg:-1751,  lvt:1000,   homePct:0.45, k401Pct:0.25, finPct:0.12, bizPct:0.06 }, // 25% on $10.6K taxable < CL 8.5% effective
  P40:  { label:'P40–P50',  short:'P40',  color:'#0E7C5A',
    income:64000,   nw:95000,   incG:0.013, nwG:0.030,  accordNWG:0.030,
    hhSz:2.4,  save:0.15, ret:0.05, consume:0.85,
    taxChg:-1659,  lvt:1000,   homePct:0.50, k401Pct:0.28, finPct:0.10, bizPct:0.05 }, // 25% on $21.4K taxable < CL 11% effective
  P50:  { label:'P50–P60',  short:'P50',  color:'#2FA873',
    income:79000,   nw:148000,  incG:0.015, nwG:0.038,  accordNWG:0.038,
    hhSz:2.5,  save:0.17, ret:0.05, consume:0.82,
    taxChg:-1048,  lvt:1800,   homePct:0.52, k401Pct:0.32, finPct:0.12, bizPct:0.06 }, // 25% on $35.2K taxable < CL 12.5% effective
  P60:  { label:'P60–P70',  short:'P60',  color:'#69C79B',
    income:97000,   nw:228000,  incG:0.018, nwG:0.040,  accordNWG:0.040,
    hhSz:2.5,  save:0.20, ret:0.06, consume:0.80,
    taxChg:1138,   lvt:2500,   homePct:0.50, k401Pct:0.30, finPct:0.13, bizPct:0.08 }, // 25% on $53.2K taxable slightly > CL 12.5% effective
  P70:  { label:'P70–P80',  short:'P70',  color:'#B5841E',
    income:124000,  nw:380000,  incG:0.022, nwG:0.050,  accordNWG:0.050,
    hhSz:2.5,  save:0.22, ret:0.06, consume:0.77,
    taxChg:2180,   lvt:4000,   homePct:0.47, k401Pct:0.30, finPct:0.17, bizPct:0.12 },
  P80:  { label:'P80–P90',  short:'P80',  color:'#E0A92E',
    income:186000,  nw:750000,  incG:0.028, nwG:0.058,  accordNWG:0.058,
    hhSz:2.5,  save:0.25, ret:0.06, consume:0.60,
    taxChg:6307,   lvt:7000,   homePct:0.35, k401Pct:0.25, finPct:0.25, bizPct:0.15 },
  T10:  { label:'P90–P99',  short:'T10',  color:'#E8722A',
    income:320000,  nw:2700000, incG:0.035, nwG:0.065,  accordNWG:0.063,
    // ETR now model-derived from Sim-2 distributional engine (VAT+LVT+carbon+income reform)
    hhSz:2.3,  save:0.40, ret:0.07, consume:0.45,
    taxChg:14665,  lvt:12000,  homePct:0.25, k401Pct:0.20, finPct:0.35, bizPct:0.20 },
  T1:   { label:'P99–P99.9',short:'T1',   color:'#D33B22',
    income:1500000, nw:16700000,incG:0.045, nwG:0.075,  accordNWG:0.072, accordIncG:0.022,
    // ETR now model-derived from Sim-2 distributional engine (VAT+LVT+carbon+income reform)
    hhSz:2.1,  save:0.70, ret:0.08, consume:0.25,
    taxChg:202913, lvt:50000,  homePct:0.15, k401Pct:0.15, finPct:0.40, bizPct:0.30 },
  BILL: { label:'Billionaires',short:'Bill',color:'#AC1D1D',
    income:3e8,     nw:4.7e9,   incG:0.080, nwG:0.120,  accordIncG:0.050,
    // ETR now model-derived via billionaireETR(): economic income basis (reported + unrealized)
    // Three Accord channels: income tax reform + PSU equity excise + mark-to-market phase-in
    hhSz:2.0,  save:0.85, ret:0.10, consume:0.01,
    taxChg:83691871, lvt:5e5,  homePct:0.05, k401Pct:0.05, finPct:0.30, bizPct:0.60 },
  ELON: { label:'Elon Musk', short:'Elon', color:'#6E0E14',
    // Net worth $839B (Forbes annual list, March 2026). Grows 7.5% a year real: billionaire
    // wealth has grown about 5 points a year faster than the economy (Saez & Zucman), on 2.5%
    // real GDP growth.
    income:1e10,    nw:8.39e11, incG:0.075, nwG:0.075,  accordIncG:0.124,
    // ETR now model-derived via billionaireETR(): economic income basis (reported + unrealized)
    hhSz:1.0,  save:0.95, ret:0.12, consume:0.001,
    taxChg:2796462204, lvt:5e6, homePct:0.02, k401Pct:0.01, finPct:0.15, bizPct:0.82 },
};
// Order = bottom-to-top percentile (important for stacked chart rendering)
export const DEMO_KEYS = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];

// Population share per bracket (each true decile = 0.10; T10/T1 exclude carved-out brackets)
export const POP = { B10:0.10, P10:0.10, P20:0.10, P30:0.10, P40:0.10, P50:0.10, P60:0.10, P70:0.10, P80:0.10, T10:0.09, T1:0.0094, BILL:6e-6, ELON:7.5e-9 };

// Programs replaced by the Accord prebate (per HH, 2024 dollars).
// CBO income already includes these transfers — PRE toggle nets them out.
// SNAP ~$110B, EITC ~$70B, CTC ~$120B, TANF ~$16B, WIC ~$6B → ~$322B total
// Aggregate check: Σ(PROG_LOST[k] × POP[k]) × 133M HH ≈ $319B ✓
export const PROG_LOST = {
  B10: 5500,  // SNAP $2500 + EITC $1000 + CTC $800 + TANF $1000 + WIC $200
  P10: 5500,  // SNAP $600  + EITC $2500 + CTC $2200 + TANF $100  + WIC $100
  P20: 3200,  // EITC $800  + CTC $2200  + SNAP $200
  P30: 2200,  // EITC $100  + CTC $2100
  P40: 1800,  // CTC $1800
  P50: 1800,  // CTC $1800
  P60: 1400,  // CTC $1400
  P70: 1300,  // CTC $1300
  P80:  900,  // CTC $900 (partial phase-out for higher earners)
  T10:  400,  // CTC partial (phase-out ~$200K+ single / $400K+ MFJ)
  T1:     0,
  BILL:   0,
  ELON:   0,
};


// AMCF unit liquidation rates: fraction of annual grant liquidated for cash in a given year.
// Citizens receive AMCF units (equity, not cash) — liquidation is optional. Default = accumulate.
// base_rate reflects structural consumption pressure; high for low-income, near-zero for wealthy.
// Decays over time as wealth builds (pressure_decay): Year 0=1.0, Year 10=0.76, Year 30=0.57.
export const AMCF_LIQ_BASE = {
  B10:0.95, P10:0.90, P20:0.80, P30:0.70, P40:0.55, P50:0.40,
  P60:0.25, P70:0.15, P80:0.08, T10:0.03, T1:0.01, BILL:0.00, ELON:0.00,
};
// Current-law all-in effective tax rate (income + payroll − credits)
export const CL_ETR   = { B10:0.05,P10:0.12,P20:0.14,P30:0.17,P40:0.18,P50:0.21,P60:0.22,P70:0.24,P80:0.26,T10:0.30,T1:0.37,BILL:0.22,ELON:0.15 };

export const WGTS = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.09, 0.0094, 6e-6, 7.5e-9];

// Household-received AMCF grant per person, 2024 real dollars, by year.
// Derived live from the shared fiscal engine rather than pinned to a copied table, so the
// National Balance Sheet's defaults and the household pages can no longer drift apart.
// The engine is nominal; realGrantSeries deflates by each row's price level.
// No import cycle: fiscal-engine depends only on land, income-tax, and brackets.
export const AMCF_ANC = realGrantSeries();

