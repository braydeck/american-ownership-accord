// Housing module (Brayden, 2026-10-25): tracks the housing shortage and rents against current law,
// so the Abundance Floor admission rate and the scale of the National Housing Corporation can be
// tested together. Everything is measured relative to current law: under current law, private
// completions (1.63M units in 2024, Census) just cover need, so the shortage stays at its starting
// level. The Accord adds demand (households formed by Abundance Floor immigrants) and supply (NHC
// units, more private building under the land value tax, and builders responding to higher rents).
// Real rents move with the shortage as a share of the stock.

export const HOUSING_STOCK_0 = 148.3e6;        // housing units, July 2025 (Census Housing Vacancy Survey inventory, FRED ETOTALUSQ176N)
export const CL_COMPLETIONS_0 = 1.63e6;        // 2024 completions excluding manufactured homes (Census)
export const NHC_PEAK_UNITS = 325e3;           // midpoint of the doc's 250,000-400,000 units a year at peak
export const NHC_RAMP_YEARS = 8;               // doc §9.7: price-influence scale by Years 8-15
export const LVT_PHASE_YEARS = 5;

export const HOUSING_DEFAULTS = {
  housingShortage0:        4.0e6,  // central of published estimates: Freddie Mac 3.7M, Up for Growth 3.8M, Zillow 4.5-4.7M (CRS IN12628); range ~2M (Moody's) to 5.5M (NAR)
  immigrantPersonsPerHousehold: 2.75, // assumption; the US average is about 2.5
  nhcScale:                3,      // multiple of the doc's 4-6 million unit target, when nhcSizedToAdmissions is off
  nhcSizedToAdmissions:    true,   // NHC builds one unit per household admitted plus a share of the shortage (decided 2026-10-25)
  nhcShortageYears:        15,     // years over which the NHC closes the existing shortage
  privateShareOfNewDemand: 0.50,   // share of new immigrant households private builders house as demand rises, without zoning reform (assumption)
  zoningReformOn:          true,   // federal grants and existing federal funds conditioned on by-right mixed-use, mixed-density zoning (decided 2026-10-25)
  zoningShareGain:         0.20,   // zoning reform raises private builders' share of new demand by this much (assumption)
  zoningElasticityGain:    1.0,    // and raises their response to rents by this much (assumption)
  zoningGrantPerUnit:      10000,
  nhcOwnershipShare:       0.5,    // share of NHC homes sold as ownership-track (structure only); the rest are market-rate rentals (assumption)
  nhcLandPerUnitRatio:     0.5,    // land value per NHC home relative to the average home, given denser building (assumption)
  nhcLandPaymentShare:     0.75,   // land payment as a share of the LVT the parcel would owe (decided 2026-10-25)  // federal grant per private unit permitted above current law, 2024 dollars (assumption)
  privateDemandRampYears:  8,      // private builders scale up over this many years
  lvtSupplyBoost:          0.10,   // extra private completions under the LVT, share of current-law completions (assumption; Plassmann & Tideman 2000 find a significant rise)
  privateSupplyElasticity: 1.0,    // % rise in private completions per 1% rise in real rents above current law (assumption)
  rentShortageElasticity:  2.0,    // % rise in real rents per 1% of the stock in extra shortage (demand elasticity about 0.5)
};

export function nhcUnits(yr, scale) {
  return NHC_PEAK_UNITS * scale * Math.min(1, yr / NHC_RAMP_YEARS);
}

// One year of the housing account. `state` carries shortage (units), stock (units) and rentGap
// (real rents vs current law, as a fraction) from the previous year.
export function stepHousing(state, yr, extraImmigrantsAdded, hp) {
  const clCompletions = CL_COMPLETIONS_0 * Math.pow(1.004, yr);
  const lvtUnits = clCompletions * hp.lvtSupplyBoost * Math.min(1, yr / LVT_PHASE_YEARS);
  const zoningRamp = hp.zoningReformOn ? Math.min(1, yr / hp.privateDemandRampYears) : 0;
  const responseUnits = clCompletions * (hp.privateSupplyElasticity + hp.zoningElasticityGain * zoningRamp) * Math.max(0, state.rentGap);
  // Once the shortage is closed, the NHC builds only what new immigrant households need.
  const extraDemand = Math.max(0, extraImmigrantsAdded) / hp.immigrantPersonsPerHousehold;
  // Private builders answer part of the new demand directly; zoning and permitting reform raise
  // their share. Sized to admissions, the NHC builds the rest plus a share of the existing shortage.
  const privateShare = hp.privateShareOfNewDemand + hp.zoningShareGain * zoningRamp;
  const privateDemandUnits = extraDemand * privateShare * Math.min(1, yr / hp.privateDemandRampYears);
  const nhc = hp.nhcSizedToAdmissions
    ? (extraDemand - privateDemandUnits + Math.max(0, state.shortage) / hp.nhcShortageYears) * Math.min(1, yr / NHC_RAMP_YEARS)
    : state.shortage > 0 ? nhcUnits(yr, hp.nhcScale) : Math.min(nhcUnits(yr, hp.nhcScale), extraDemand);
  const extraSupply = nhc + lvtUnits + responseUnits + privateDemandUnits;
  const stock = state.stock + clCompletions + extraSupply - 0.002 * state.stock;
  const shortage = state.shortage + extraDemand - extraSupply;
  const shortageChange = (shortage - hp.housingShortage0) / stock;
  const rentGap = hp.rentShortageElasticity * shortageChange;
  const zoningGrantUnits = hp.zoningReformOn ? lvtUnits + responseUnits + privateDemandUnits : 0;
  const nhcStock = (state.nhcStock ?? 0) + nhc;
  return { stock, shortage, rentGap, nhc, nhcStock, lvtUnits, responseUnits: responseUnits + privateDemandUnits, extraDemand, zoningGrantUnits };
}

export function initialHousingState(hp) {
  return { stock: HOUSING_STOCK_0, shortage: hp.housingShortage0, rentGap: 0, nhcStock: 0 };
}
