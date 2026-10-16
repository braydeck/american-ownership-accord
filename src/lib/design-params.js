// Turns a Design Search record (src/data/design-search.json) back into engine parameters, so
// pages can rerun any searched design on the shared engine and household model.
import { BASE_PARAMS, realGrantSeries, householdFiscalSeries } from '@/lib/fiscal-engine';
import { stableRentRevYr1, RENT_TAX_DEFAULTS, YR1_NOM_GDP } from '@/lib/rent-taxes';

export function paramsFromDesign(d) {
  const brackets = d.brackets.map(([t, r]) => [t ?? Infinity, r]);
  return {
    ...BASE_PARAMS,
    incomeTaxBrackets: brackets,
    incomeTaxLow: brackets[0][1], incomeTaxHigh: brackets[brackets.length - 1][1],
    incomeTaxThreshold: brackets.length > 1 ? brackets[brackets.length - 2][0] : BASE_PARAMS.incomeTaxThreshold,
    incomeTaxExemptJoint: d.exemptJoint, incomeTaxExemptSingle: d.exemptJoint / 2,
    vatRate: d.vatRate, lvtRate: d.lvtRate, carbonRate: d.carbonRate,
    prebatePerCapita: d.prebate, prebateIndex: d.prebateIndex, citizenFloorIndex: d.floorIndex,
    stableTaxFrac: stableRentRevYr1({ ...RENT_TAX_DEFAULTS, fttPct: d.fttPct }) / YR1_NOM_GDP,
  };
}

// The household model's fiscal inputs for a parameter set.
export const fxFromParams = p => ({ ...p, grants: realGrantSeries(p), hh: householdFiscalSeries(p) });
