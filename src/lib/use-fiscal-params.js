// Fiscal assumptions shared by every page that models household outcomes.
//
// Both Household Impact and Inequality read the same engine as the National Balance Sheet,
// so they expose the same knobs and stay in sync through SHARED_PARAM_KEYS in url-state.js.
// The engine is nominal; realGrantSeries deflates the grant path to 2024 real dollars, which
// is the unit both household pages report in.
import { useMemo } from 'react';
import { useUrlValue } from '@/lib/url-state';
import { BASE_PARAMS, realGrantSeries } from '@/lib/fiscal-engine';

// Every key here must exist in BASE_PARAMS and in SHARED_PARAM_KEYS, or it will silently
// stop carrying across page navigation.
export const FISCAL_KEYS = [
  'growthTaxRate', 'amcfReturn', 'startingEV', 'grantPhaseMultiplier',
  'recessionYear', 'recessionSeverity',
  'incomeTaxLow', 'incomeTaxHigh', 'incomeTaxThreshold',
  'incomeTaxExemptSingle', 'incomeTaxExemptJoint',
  'vatRate', 'lvtRate', 'carbonRate', 'prebatePerCapita',
];

// Only these change the AMCF grant path, so the 35-year sim reruns just for them.
const GRANT_KEYS = [
  'growthTaxRate', 'amcfReturn', 'startingEV', 'grantPhaseMultiplier',
  'recessionYear', 'recessionSeverity',
];

export function useFiscalParams() {
  const entries = FISCAL_KEYS.map(k => [k, useUrlValue(k, BASE_PARAMS[k])]);
  const values  = Object.fromEntries(entries.map(([k, [v]]) => [k, v]));
  const set     = Object.fromEntries(entries.map(([k, [, s]]) => [k, s]));

  const grantDeps = GRANT_KEYS.map(k => values[k]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grants = useMemo(
    () => realGrantSeries({ ...BASE_PARAMS, ...Object.fromEntries(GRANT_KEYS.map(k => [k, values[k]])) }),
    grantDeps);

  const fx = useMemo(() => ({ ...values, grants }), [grants, ...FISCAL_KEYS.map(k => values[k])]);

  const isDefault = FISCAL_KEYS.every(k => values[k] === BASE_PARAMS[k]);
  const reset = () => FISCAL_KEYS.forEach(k => set[k](BASE_PARAMS[k]));

  return { fx, values, set, isDefault, reset, grants };
}
