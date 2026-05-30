// 13-bracket demographic model (CBO + Federal Reserve SCF, 2024 calibration)
// Shared by Sim-10 (Dashboard) and Sim-11 (Inequality)

export const DEMOS = {
  B10:  { label:'P0-P10',   short:'B10',  color:'#ef4444',
    income:14500,   nw:-2000,   incG:0.005, nwG:0.005,  accordNWG:0.005,
    hhSz:1.8,  save:0.05, ret:0.04, consume:0.98,
    taxChg:-145,   lvt:0,      homePct:0,    k401Pct:0.05, finPct:0,    bizPct:0    },
  P10:  { label:'P10-P20',  short:'P10',  color:'#f97316',
    income:28000,   nw:7000,    incG:0.008, nwG:0.040,  accordNWG:0.040,
    hhSz:2.1,  save:0.05, ret:0.04, consume:0.95,
    taxChg:-1540,  lvt:200,    homePct:0.20, k401Pct:0.15, finPct:0.05, bizPct:0    },
  P20:  { label:'P20-P30',  short:'P20',  color:'#fb923c',
    income:40000,   nw:26000,   incG:0.010, nwG:0.020,  accordNWG:0.020,
    hhSz:2.2,  save:0.10, ret:0.04, consume:0.90,
    taxChg:-3400,  lvt:500,    homePct:0.35, k401Pct:0.20, finPct:0.08, bizPct:0.03 },
  P30:  { label:'P30-P40',  short:'P30',  color:'#fbbf24',
    income:52000,   nw:58000,   incG:0.013, nwG:0.028,  accordNWG:0.028,
    hhSz:2.3,  save:0.12, ret:0.05, consume:0.87,
    taxChg:-1751,  lvt:1000,   homePct:0.45, k401Pct:0.25, finPct:0.12, bizPct:0.06 },
  P40:  { label:'P40-P50',  short:'P40',  color:'#84cc16',
    income:64000,   nw:95000,   incG:0.013, nwG:0.030,  accordNWG:0.030,
    hhSz:2.4,  save:0.15, ret:0.05, consume:0.85,
    taxChg:-1659,  lvt:1000,   homePct:0.50, k401Pct:0.28, finPct:0.10, bizPct:0.05 },
  P50:  { label:'P50-P60',  short:'P50',  color:'#22c55e',
    income:79000,   nw:148000,  incG:0.015, nwG:0.038,  accordNWG:0.038,
    hhSz:2.5,  save:0.17, ret:0.05, consume:0.82,
    taxChg:-1048,  lvt:1800,   homePct:0.52, k401Pct:0.32, finPct:0.12, bizPct:0.06 },
  P60:  { label:'P60-P70',  short:'P60',  color:'#10b981',
    income:97000,   nw:228000,  incG:0.018, nwG:0.040,  accordNWG:0.040,
    hhSz:2.5,  save:0.20, ret:0.06, consume:0.80,
    taxChg:1138,   lvt:2500,   homePct:0.50, k401Pct:0.30, finPct:0.13, bizPct:0.08 },
  P70:  { label:'P70-P80',  short:'P70',  color:'#06b6d4',
    income:124000,  nw:380000,  incG:0.022, nwG:0.050,  accordNWG:0.050,
    hhSz:2.5,  save:0.22, ret:0.06, consume:0.77,
    taxChg:2180,   lvt:4000,   homePct:0.47, k401Pct:0.30, finPct:0.17, bizPct:0.12 },
  P80:  { label:'P80-P90',  short:'P80',  color:'#3b82f6',
    income:186000,  nw:750000,  incG:0.028, nwG:0.058,  accordNWG:0.058,
    hhSz:2.5,  save:0.25, ret:0.06, consume:0.60,
    taxChg:6307,   lvt:7000,   homePct:0.35, k401Pct:0.25, finPct:0.25, bizPct:0.15 },
  T10:  { label:'P90-P99',  short:'T10',  color:'#8b5cf6',
    income:320000,  nw:2700000, incG:0.035, nwG:0.065,  accordNWG:0.063,
    hhSz:2.3,  save:0.40, ret:0.07, consume:0.45,
    taxChg:14665,  lvt:12000,  homePct:0.25, k401Pct:0.20, finPct:0.35, bizPct:0.20 },
  T1:   { label:'P99-P99.9',short:'T1',   color:'#ec4899',
    income:1500000, nw:16700000,incG:0.045, nwG:0.075,  accordNWG:0.072, accordIncG:0.022,
    hhSz:2.1,  save:0.70, ret:0.08, consume:0.25,
    taxChg:202913, lvt:50000,  homePct:0.15, k401Pct:0.15, finPct:0.40, bizPct:0.30 },
  BILL: { label:'Billionaires',short:'Bill',color:'#1d4ed8',
    income:3e8,     nw:4.7e9,   incG:0.080, nwG:0.120,  accordIncG:0.050,
    hhSz:2.0,  save:0.85, ret:0.10, consume:0.01,
    taxChg:83691871, lvt:5e5,  homePct:0.05, k401Pct:0.05, finPct:0.30, bizPct:0.60 },
  ELON: { label:'Elon Musk', short:'Elon', color:'#334155',
    income:1e10,    nw:2.5e11,  incG:0.150, nwG:0.150,  accordIncG:0.124,
    hhSz:1.0,  save:0.95, ret:0.12, consume:0.001,
    taxChg:2796462204, lvt:5e6, homePct:0.02, k401Pct:0.01, finPct:0.15, bizPct:0.82 },
};

export const DEMO_KEYS = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];

export const POP = { B10:0.10, P10:0.10, P20:0.10, P30:0.10, P40:0.10, P50:0.10, P60:0.10, P70:0.10, P80:0.10, T10:0.09, T1:0.0094, BILL:6e-6, ELON:7.5e-9 };

export const WGTS = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.09, 0.0094, 6e-6, 7.5e-9];

export const PROG_LOST = {
  B10: 5500, P10: 5500, P20: 3200, P30: 2200, P40: 1800, P50: 1800,
  P60: 1400, P70: 1300, P80:  900, T10:  400, T1:     0, BILL:   0, ELON:   0,
};

export const AMCF_LIQ_BASE = {
  B10:0.95, P10:0.90, P20:0.80, P30:0.70, P40:0.55, P50:0.40,
  P60:0.25, P70:0.15, P80:0.08, T10:0.03, T1:0.01, BILL:0.00, ELON:0.00,
};

export const CL_ETR = {
  B10:0.05, P10:0.12, P20:0.14, P30:0.17, P40:0.18, P50:0.21,
  P60:0.22, P70:0.24, P80:0.26, T10:0.30, T1:0.37, BILL:0.22, ELON:0.15,
};

export const AMCF_ANC = [[0,0],[1,64],[5,503],[10,1724],[15,4421],[20,9430],[25,15397],[30,25924]];
