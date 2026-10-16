// Shared "Fiscal Assumptions" panel. Renders the National Balance Sheet's parameters on any
// page that models household outcomes, so a reader can change an assumption in one place and
// see it everywhere. Values are URL-backed and survive page navigation.
import React from 'react';
import { SliderControl } from '@/components/controls/SliderControl';
import { Button } from '@/components/ui/button';
import { RECESSION_SCENARIOS } from '@/lib/fiscal-engine';

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const usd = v => `$${Math.round(v).toLocaleString()}`;

const GROUPS = [
  { title: 'Income tax', items: [
    { k: 'incomeTaxLow',          label: v => `Lower rate: ${pct(v, 0)}`,        min: 0.10, max: 0.40, step: 0.01 },
    { k: 'incomeTaxHigh',         label: v => `Upper rate: ${pct(v, 0)}`,        min: 0.30, max: 0.70, step: 0.01 },
    { k: 'incomeTaxThreshold',    label: v => `Upper-rate threshold: $${(v / 1e6).toFixed(2)}M`, min: 0.25e6, max: 5e6, step: 0.25e6 },
    { k: 'incomeTaxExemptSingle', label: v => `Deduction, single: ${usd(v)}`,    min: 0, max: 100000, step: 5000 },
    { k: 'incomeTaxExemptJoint',  label: v => `Deduction, joint: ${usd(v)}`,     min: 0, max: 200000, step: 5000 },
  ]},
  { title: 'Consumption & land', items: [
    { k: 'vatRate',          label: v => `VAT rate: ${pct(v)}`,        min: 0,    max: 0.15, step: 0.005 },
    { k: 'lvtRate',          label: v => `LVT rate: ${pct(v)}`,        min: 0,    max: 0.25, step: 0.005 },
    { k: 'carbonRate',       label: v => `Carbon tax: $${v}/ton`,      min: 0,    max: 250,  step: 5 },
    { k: 'prebatePerCapita', label: v => `Prebate / person: ${usd(v)}`, min: 1000, max: 10000, step: 250 },
  ]},
  { title: 'Ownership & grants', items: [
    { k: 'growthTaxRate',     label: v => `EV Growth Tax: ${pct(v)}`,               min: 0.05, max: 0.35, step: 0.005 },
    { k: 'startingEvRatio',   label: v => `Starting EV: ${v.toFixed(1)}× GDP`,      min: 1.5,  max: 3.5,  step: 0.1 },
    { k: 'citizenScripShare', label: v => `Scrip to citizen units: ${pct(v, 0)}`,   min: 0,    max: 1,    step: 0.05 },
    { k: 'citizenFloor',      label: v => `Citizen floor: ${usd(v)} / person`,      min: 0,    max: 2000, step: 50 },
    { k: 'unitSaleRate',      label: v => `Treasury unit sales: ${pct(v, 1)} / yr`, min: 0,    max: 0.10, step: 0.005 },
    { k: 'assetRateCreditBp', label: v => `Rate credit: ${v} bp per pt of GDP held`, min: 0,   max: 3,    step: 0.5 },
  ], toggles: [
    { k: 'revaluationOn',    label: 'Corporate-tax revaluation (+18%)' },
    { k: 'unitSalesOn',      label: 'Sell Treasury units' },
    { k: 'ceocOn',           label: 'Care Economy Ownership Credit' },
    { k: 'pseuOn',           label: 'Public-employee equity units' },
    { k: 'bankPostBrake',    label: 'Bank AMCF cash after the brake' },
    { k: 'abundanceFloorOn', label: 'Abundance Floor immigration' },
  ]},
];

// `only` limits the panel to named groups, for pages where the other parameters provably
// do not change the output. Passing nothing shows all three.
export function FiscalControls({ values, set, isDefault, reset, grants, compact = false, only }) {
  const groups = only ? GROUPS.filter(g => only.includes(g.title)) : GROUPS;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fiscal Assumptions
        </div>
        {!isDefault && (
          <Button variant="ghost" size="xs" className="text-[10px] h-5 px-1.5" onClick={reset}>
            Reset
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mb-3 leading-snug">
        {only
          ? 'Parameters from the National Balance Sheet that change citizen unit deposits. Tax rates are omitted because they do not enter this calculation.'
          : 'The same parameters the National Balance Sheet runs. Household figures are in today\'s dollars. Citizen units come from a share of Growth Tax scrip, topped up to the floor from the Treasury tranche.'}
      </p>

      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4' : 'space-y-4'}>
        {groups.map(g => (
          <div key={g.title} className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              {g.title}
            </div>
            {g.items.map(it => (
              <SliderControl
                key={it.k}
                label={it.label(values[it.k])}
                value={values[it.k]}
                onChange={set[it.k]}
                min={it.min} max={it.max} step={it.step}
              />
            ))}
            {g.toggles?.map(t => (
              <label key={t.k} className="flex items-center gap-2 text-[11px] font-medium text-foreground cursor-pointer">
                <input type="checkbox" checked={!!values[t.k]} onChange={e => set[t.k](e.target.checked)} className="accent-[#307ca6]" />
                {t.label}
              </label>
            ))}
            {g.title === 'Ownership & grants' && (
              <div>
                <label className="text-[11px] font-medium text-foreground">Growth effects</label>
                <select value={values.growthCase} onChange={e => set.growthCase(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs">
                  <option value="low">Low (literature)</option>
                  <option value="central">Central (literature)</option>
                  <option value="high">High (literature)</option>
                </select>
              </div>
            )}
            {g.title === 'Ownership & grants' && (
              <div>
                <label className="text-[11px] font-medium text-foreground">Recession</label>
                <div className="flex gap-1.5 mt-1">
                  <select
                    value={values.recessionYear}
                    onChange={e => set.recessionYear(Number(e.target.value))}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs">
                    <option value={0}>None</option>
                    {[3, 5, 10, 15, 20].map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                  <select
                    value={values.recessionSeverity}
                    onChange={e => set.recessionSeverity(e.target.value)}
                    disabled={values.recessionYear === 0}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50">
                    {Object.entries(RECESSION_SCENARIOS).filter(([k]) => k !== 'none')
                      .map(([k, sc]) => <option key={k} value={k}>{sc.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {grants && (
        <p className="text-[10px] text-muted-foreground mt-3 leading-snug">
          Citizen unit deposit at Year 30: {usd(grants[30]?.[1] ?? 0)} per person, today's dollars.
        </p>
      )}
    </div>
  );
}
