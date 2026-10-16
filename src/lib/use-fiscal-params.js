// Fiscal assumptions shared by every page that models household outcomes.
//
// Household Impact, Inequality and the lab pages read the same engine as the National Balance
// Sheet, so they expose the same knobs and stay in sync through SHARED_PARAM_KEYS in
// url-state.js. The engine is nominal; realGrantSeries and householdFiscalSeries deflate to
// Year-0 dollars for the household pages.
import { useMemo } from 'react';
import { useUrlValue } from '@/lib/url-state';
import { BASE_PARAMS, realGrantSeries, householdFiscalSeries } from '@/lib/fiscal-engine';

// Every key here must exist in BASE_PARAMS and in SHARED_PARAM_KEYS, or it will silently
// stop carrying across page navigation.
export const FISCAL_KEYS = [
  'growthTaxRate', 'startingEvRatio', 'revaluationOn', 'citizenScripShare', 'citizenFloor',
  'unitSalesOn', 'unitSaleRate', 'bankPostBrake', 'assetRateCreditBp', 'ceocOn', 'pseuOn',
  'abundanceFloorOn', 'growthCase', 'recessionYear', 'recessionSeverity',
  'incomeTaxLow', 'incomeTaxHigh', 'incomeTaxThreshold',
  'incomeTaxExemptSingle', 'incomeTaxExemptJoint',
  'vatRate', 'lvtRate', 'carbonRate', 'prebatePerCapita',
];

export function useFiscalParams() {
  const entries = FISCAL_KEYS.map(k => [k, useUrlValue(k, BASE_PARAMS[k])]);
  const values  = Object.fromEntries(entries.map(([k, [v]]) => [k, v]));
  const set     = Object.fromEntries(entries.map(([k, [, s]]) => [k, s]));

  const deps = FISCAL_KEYS.map(k => values[k]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fx = useMemo(() => {
    const params = { ...BASE_PARAMS, ...values };
    return { ...params, grants: realGrantSeries(params), hh: householdFiscalSeries(params) };
  }, deps);

  const isDefault = FISCAL_KEYS.every(k => values[k] === BASE_PARAMS[k]);
  const reset = () => FISCAL_KEYS.forEach(k => set[k](BASE_PARAMS[k]));

  return { fx, values, set, isDefault, reset, grants: fx.grants };
}
