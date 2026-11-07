// Revenue models for the smaller rent taxes, shared by the fiscal engine and the Rent Tax
// Optimizer so both price them the same way. Each base is measured in its source year and
// carried to FY2025 (the engine's Year 0) as a share of that year's nominal GDP; the engine then
// applies the resulting share of GDP to its own GDP every year. Functions return FY2025 dollars.

export const RENT_TAX_DEFAULTS = {
  fttPct: 0.25, fslBps: 25, royaltyExtraPct: 8, spectrumPct: 2, waterFeeAF: 25,
};

// FY2025 nominal GDP (CBO), the fiscal engine's startingGdp.
export const BASE_YEAR_GDP = 30.36e12;
// Calendar-year nominal GDP, BEA via FRED series GDPA (vintage 2026-09-30).
const GDP_BY_YEAR = {
  2015: 18.295e12, 2016: 18.805e12, 2017: 19.612e12, 2018: 20.657e12, 2019: 21.540e12, 2020: 21.375e12,
  2021: 23.746e12, 2022: 26.060e12, 2023: 27.826e12, 2024: 29.381e12, 2025: 30.861e12,
};
const toBaseYear = (amount, year) => amount / GDP_BY_YEAR[year] * BASE_YEAR_GDP;

// G-SIB assets at year-end 2024. The eight US G-SIBs, consolidated: JPMorgan $4.00T, Bank of
// America $3.26T, Citigroup $2.35T, Wells Fargo $1.93T, Goldman Sachs $1.68T, Morgan Stanley $1.22T,
// BNY $0.42T, State Street $0.35T (FY2024 10-Ks). Foreign G-SIBs' US branches, agencies and bank
// subsidiaries, $2.93T (Federal Reserve, Structure Data for U.S. Offices of Foreign Banking
// Organizations, December 2024; largest TD $495B, RBC $284B, SMBC $236B, MUFG $224B, UBS $213B).
// The foreign figure leaves out their US broker-dealers, so it understates their US operations.
export const US_GSIB_ASSETS = 15.2e12;
export const FOREIGN_GSIB_US_ASSETS = 2.93e12;
export const GSIB_ASSETS = toBaseYear(US_GSIB_ASSETS + FOREIGN_GSIB_US_ASSETS, 2024);
// US equity dollar volume, all US exchanges and FINRA trade reporting facilities (Cboe U.S. Equities
// historical market volume files, annual total notional). Trading swings with markets, from 3.5×
// GDP in 2017 to 6.7× in 2025, so the base is the 2016-2025 average share of GDP.
export const EQUITY_VOLUME_BY_YEAR = {
  2016: 68.8e12, 2017: 68.1e12, 2018: 89.7e12, 2019: 81.1e12, 2020: 121.3e12,
  2021: 142.3e12, 2022: 143.8e12, 2023: 128.7e12, 2024: 153.1e12, 2025: 206.1e12,
};
const volumeShares = Object.entries(EQUITY_VOLUME_BY_YEAR).map(([y, v]) => v / GDP_BY_YEAR[y]);
export const EQUITY_VOLUME_GDP_MULTIPLE = volumeShares.reduce((s, x) => s + x, 0) / volumeShares.length;
export const EQUITY_VOLUME = EQUITY_VOLUME_GDP_MULTIPLE * BASE_YEAR_GDP;
// Sales value of oil and gas from federal leases, about $100B in 2022 (GAO-24-103676, from ONRR data).
export const FEDERAL_EXTRACTION_SALES = toBaseYear(100e9, 2022);
// Radio spectrum held by telecom firms, $0.2T bought at auction plus $0.1T allocated free,
// in 2022 (BEA Working Paper 2024-9). Spectrum the government retains is outside the fee.
export const LICENSED_SPECTRUM_VALUE = toBaseYear(0.3e12, 2022);
// Groundwater withdrawals, 84.7 billion gallons a day in 2015 (USGS), in acre-feet a year.
// A physical volume, so it is not scaled with GDP.
export const GROUNDWATER_AF = 84.7e9 * 365 / 325_851;

// Financial Stability Levy on G-SIB assets, with up to 10% base erosion at 50 bp.
export function fslRev(bps) {
  const erosion = 1 - Math.min(bps / 50, 1) * 0.10;
  return (bps / 10000) * GSIB_ASSETS * erosion;
}
// Financial Transaction Tax: trading volume falls 20% at a 0.1% rate (UK stamp duty evidence) and
// keeps falling at the same proportional rate as the tax rises, so revenue peaks near 0.45%.
export const FTT_VOLUME_DECAY = -Math.log(0.8) / 0.1;
export function fttRev(ratePct) {
  return (ratePct / 100) * EQUITY_VOLUME * Math.exp(-FTT_VOLUME_DECAY * ratePct);
}
// Royalty points added to the 12.5% federal rate on oil and gas from federal leases.
export function royaltyRev(extraPct) {
  return (extraPct / 100) * FEDERAL_EXTRACTION_SALES;
}
// Annual holding fee on licensed spectrum value.
export function spectrumRev(annualPct) {
  return (annualPct / 100) * LICENSED_SPECTRUM_VALUE;
}
// Groundwater extraction fee per acre-foot, in FY2025 dollars.
export function waterRev(feePerAF) {
  return feePerAF * GROUNDWATER_AF;
}
// Methane fee at the Inflation Reduction Act's Waste Emissions Charge rates ($900 rising to $1,500 a
// ton on oil and gas facilities above the intensity thresholds): CBO scored its repeal at $7.2B of
// revenue over 2025-2034.
export const METHANE_FEE_REV = 0.72e9;

// Air pollution fee on SO2, NOx and directly emitted PM2.5 from power plants and industry, at 25% of
// EPA's damage per ton for each sector. Emissions are EPA's 2025 national estimates (Air Pollutant
// Emissions Trends Data, Tier 1, released 4 Sep 2026): 1.41M tons SO2, 2.90M tons NOx, 0.59M tons
// PM2.5 from electric utilities, industrial fuel combustion, chemical, metals, petroleum and other
// industrial processes. Damages per ton are EPA BenMAP sector benefit-per-ton values (2025, 2016
// dollars, 2% discount, PM2.5 mortality), $200B a year in total, carried to 2025 dollars with the
// GDP deflator (FRED A191RD3A086NBEA, 98.241 -> 128.893). Vehicles, home heating, wildfires and
// farm dust are outside the fee.
export const POLLUTION_DAMAGES_2025 = 199.9e9 * 128.893 / 98.241;
export const POLLUTION_FEE_SHARE = 0.25;
export const POLLUTION_FEE_Y0 = POLLUTION_DAMAGES_2025 * POLLUTION_FEE_SHARE;
// Revenue falls 9% a year in real terms as plants abate: power-plant SO2 fell from 15.9M tons in 1990
// to 0.69M in 2023 under the Acid Rain Program and later rules, about 9% a year (same EPA workbook).
export const POLLUTION_FEE_DECAY = 0.09;
export const pollutionFeeReal = yr => POLLUTION_FEE_Y0 * Math.pow(1 - POLLUTION_FEE_DECAY, Math.max(yr, 1) - 1);

export function stableRentRev(r = RENT_TAX_DEFAULTS) {
  return fslRev(r.fslBps) + fttRev(r.fttPct) + royaltyRev(r.royaltyExtraPct)
    + spectrumRev(r.spectrumPct) + waterRev(r.waterFeeAF) + METHANE_FEE_REV;
}
// The smaller rent taxes as a share of GDP, the engine's stableTaxFrac.
export const stableRentFrac = (r = RENT_TAX_DEFAULTS) => stableRentRev(r) / BASE_YEAR_GDP;
export const STABLE_RENT_FRAC = stableRentFrac();
