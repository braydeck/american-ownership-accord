// Year-1 revenue models for the smaller rent taxes, shared by the fiscal engine and the
// Rent Tax Optimizer so both price them the same way. Each has its own base and behavioral
// response; the fiscal engine scales their Year-1 total with nominal GDP thereafter.

export const RENT_TAX_DEFAULTS = {
  fttPct: 0.50, fslBps: 25, royaltyExtraPct: 8, spectrumPct: 2, waterFeeAF: 25,
};

export const YR1_NOM_GDP = 28.7e12; // $28T real × 1.025 price level (Year 1)

// Financial Stability Levy on US G-SIB assets (~$20T), with modest base erosion
export function fslRevYr1(bps) {
  const erosion = 1 - Math.min(bps / 50, 1) * 0.10;
  return (bps / 10000) * 20e12 * erosion;
}
// Financial Transaction Tax: volume falls 20% per 0.1 point of rate (UK stamp duty evidence)
export function fttRevYr1(ratePct) {
  const volRetention = Math.max(0.50, 1 - (ratePct / 0.1) * 0.20);
  return (ratePct / 100) * 90e12 * volRetention;
}
// Incremental royalty above the current 12.5% federal rate on $600B of extractive revenue
export function royaltyRevYr1(extraPct) {
  return (extraPct / 100) * 600e9;
}
// Annual holding fee on spectrum license value (~$750B)
export function spectrumRevYr1(annualPct) {
  return (annualPct / 100) * 750e9;
}
// Groundwater extraction fee on ~90M acre-feet a year
export function waterRevYr1(feePerAF) {
  return feePerAF * 90e6;
}
export const POLLUTION_REV = 20e9;  // non-carbon pollution fees (N, P, plastics), flat estimate
export const CONGESTION_REV = 12e9; // congestion pricing federal share, flat estimate

export function stableRentRevYr1(r = RENT_TAX_DEFAULTS) {
  return fslRevYr1(r.fslBps) + fttRevYr1(r.fttPct) + royaltyRevYr1(r.royaltyExtraPct)
    + spectrumRevYr1(r.spectrumPct) + waterRevYr1(r.waterFeeAF) + POLLUTION_REV + CONGESTION_REV;
}

// The stable rent taxes as a share of GDP at the default rates, about 1.29%.
export const STABLE_RENT_FRAC = stableRentRevYr1() / YR1_NOM_GDP;
