// 15-bracket IRS SOI income distribution (shared by Sim-2 and Sim-8)

export const BRACKETS = [
  { label: '$0-10K',    filers: 25.00e6, agi:   130e9, effCL: 0.000, cgShare: 0.02, jFrac: 0.20, hhSz: 1.4, cRat: 1.20, own: 0.15 },
  { label: '$10-15K',   filers: 10.00e6, agi:   120e9, effCL: 0.010, cgShare: 0.02, jFrac: 0.22, hhSz: 1.6, cRat: 1.00, own: 0.28 },
  { label: '$15-25K',   filers: 18.00e6, agi:   340e9, effCL: 0.030, cgShare: 0.02, jFrac: 0.26, hhSz: 1.9, cRat: 0.97, own: 0.36 },
  { label: '$25-40K',   filers: 18.00e6, agi:   580e9, effCL: 0.055, cgShare: 0.02, jFrac: 0.32, hhSz: 2.1, cRat: 0.95, own: 0.46 },
  { label: '$40-55K',   filers: 16.00e6, agi:   760e9, effCL: 0.085, cgShare: 0.02, jFrac: 0.38, hhSz: 2.3, cRat: 0.90, own: 0.55 },
  { label: '$55-75K',   filers: 18.00e6, agi:  1170e9, effCL: 0.110, cgShare: 0.03, jFrac: 0.42, hhSz: 2.4, cRat: 0.84, own: 0.62 },
  { label: '$75-100K',  filers: 15.00e6, agi:  1320e9, effCL: 0.125, cgShare: 0.03, jFrac: 0.46, hhSz: 2.5, cRat: 0.78, own: 0.68 },
  { label: '$100-150K', filers: 17.00e6, agi:  2100e9, effCL: 0.138, cgShare: 0.04, jFrac: 0.55, hhSz: 2.6, cRat: 0.72, own: 0.74 },
  { label: '$150-200K', filers:  8.50e6, agi:  1480e9, effCL: 0.150, cgShare: 0.05, jFrac: 0.60, hhSz: 2.7, cRat: 0.64, own: 0.79 },
  { label: '$200-500K', filers:  8.00e6, agi:  2400e9, effCL: 0.163, cgShare: 0.08, jFrac: 0.65, hhSz: 2.7, cRat: 0.54, own: 0.85 },
  { label: '$500K-1M',  filers:  1.00e6, agi:   680e9, effCL: 0.175, cgShare: 0.15, jFrac: 0.72, hhSz: 2.8, cRat: 0.34, own: 0.90 },
  { label: '$1-2M',     filers:  0.38e6, agi:   530e9, effCL: 0.180, cgShare: 0.25, jFrac: 0.75, hhSz: 2.8, cRat: 0.24, own: 0.92 },
  { label: '$2-5M',     filers:  0.14e6, agi:   430e9, effCL: 0.183, cgShare: 0.35, jFrac: 0.78, hhSz: 2.8, cRat: 0.16, own: 0.93 },
  { label: '$5-15M',    filers:  0.05e6, agi:   430e9, effCL: 0.184, cgShare: 0.45, jFrac: 0.80, hhSz: 2.8, cRat: 0.12, own: 0.94 },
  { label: '$15M+',     filers:  0.04e6, agi:  1080e9, effCL: 0.185, cgShare: 0.56, jFrac: 0.80, hhSz: 2.8, cRat: 0.10, own: 0.95 },
];

export const CARBON_TONS = [4, 5, 6, 7, 8.5, 10, 11, 12, 13.5, 16, 18, 22, 26, 30, 35];

export const LVT_NET_BASE = [0, 0, 0, 0, 0, 0, 400, 1200, 2500, 5500, 14000, 28000, 55000, 110000, 220000];

export const TOTAL_POP = BRACKETS.reduce((s, b) => s + b.filers * b.hhSz, 0);
