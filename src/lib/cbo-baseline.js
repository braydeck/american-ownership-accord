// CBO current-law baseline used for the National Balance Sheet's current-law comparison path.
//
// Provenance (pulled 2026-10-06; still CBO's current baseline as of that date):
//   - The Budget and Economic Outlook: 2026 to 2036 (pub 61882, Feb 11, 2026), Table 1-1,
//     cbo.gov/system/files/2026-02/51118-2026-02-Budget-Projections.xlsx
//     FY2028–29 and FY2033–35 outlays use CBO's timing-adjusted series, as the extended
//     baseline does.
//   - The Long-Term Budget Outlook Data: 2026 to 2056 (pub 62044, Feb 25, 2026), Table 1 and
//     Supplemental Table 1, cbo.gov/system/files/2026-02/62044-2026-LTBO.xlsx
//   - Economic projections: cbo.gov/system/files/2026-02/51135-2026-02-Economic-Projections.xlsx
//     and LTBO Tables 12 and 15. Used only by the validation script.
//
// No imports, so scripts/validate-cl-path.mjs can load it with plain Node.

export const CBO_FIRST_FY = 2026; // engine Year 1

// [fiscal year, revenues % GDP, noninterest outlays % GDP]
// Noninterest = total outlays − net interest. Annual 2026–2036 from Table 1-1; 2041–2056 from
// the extended baseline at five-year steps. Values past 2056 hold at the 2056 level.
export const CBO_FISCAL = [
  [2026, 17.541, 20.091],
  [2027, 17.665, 20.005],
  [2028, 17.514, 19.644],
  [2029, 17.550, 19.824],
  [2030, 17.638, 19.695],
  [2031, 17.699, 19.599],
  [2032, 17.702, 19.612],
  [2033, 17.685, 19.672],
  [2034, 17.681, 19.762],
  [2035, 17.711, 19.794],
  [2036, 17.770, 19.848],
  [2041, 18.060, 20.004],
  [2046, 18.328, 20.353],
  [2051, 18.544, 20.668],
  [2056, 18.798, 21.002],
];

// FY2026 revenue composition (% of GDP, Table 1-1). Customs duties are folded into "other".
export const CBO_REV_MIX_2026 = {
  individual: 8.624, payroll: 5.722, corporate: 1.266, other: 1.311 + 0.617,
};

// Published CBO debt held by the public (% of GDP, end of FY), the validation target.
export const CBO_DEBT_PUBLIC = {
  2025: 99.375, 2026: 100.605, 2030: 107.726, 2036: 120.209,
  2041: 131.710, 2046: 144.497, 2051: 159.029, 2056: 175.076,
};

// Economic assumptions for validation: [calendar year, real GDP growth %, GDP price index %,
// average interest rate on debt held by the public %]. Sparse points, linearly interpolated.
export const CBO_ECON = [
  [2026, 2.364, 2.676, 3.443],
  [2030, 1.783, 2.009, 3.758],
  [2036, 1.766, 1.975, 4.038],
  [2046, 1.707, 1.998, 4.149],
  [2056, 1.484, 2.002, 4.176],
];
export const CBO_GDP_FY2026 = 31902.006e9;
export const CBO_DEBT_PUBLIC_END_FY2025 = 30172.4e9;

function interp(table, fy, col) {
  if (fy <= table[0][0]) return table[0][col];
  const last = table[table.length - 1];
  if (fy >= last[0]) return last[col];
  for (let i = 1; i < table.length; i++) {
    const [x0] = table[i - 1], [x1] = table[i];
    if (fy <= x1) {
      const t = (fy - x0) / (x1 - x0);
      return table[i - 1][col] + t * (table[i][col] - table[i - 1][col]);
    }
  }
  return last[col];
}

// Current-law revenue and noninterest spending as fractions of GDP for engine year `yr`.
export function cboFiscalShares(yr) {
  const fy = CBO_FIRST_FY + yr - 1;
  return { revenue: interp(CBO_FISCAL, fy, 1) / 100, noninterest: interp(CBO_FISCAL, fy, 2) / 100 };
}

export function cboEcon(fy) {
  return {
    realGrowth: interp(CBO_ECON, fy, 1) / 100,
    inflation:  interp(CBO_ECON, fy, 2) / 100,
    rate:       interp(CBO_ECON, fy, 3) / 100,
  };
}
