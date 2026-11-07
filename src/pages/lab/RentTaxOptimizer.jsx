import React, { useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { FiscalControls } from '@/components/controls/FiscalControls';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { useUrlValue, useUrlState } from '@/lib/url-state';
import { useFiscalParams } from '@/lib/use-fiscal-params';
import {
  BASE_PARAMS, runFiscalSimulation, carbonRevenueAtRate, carbonDecayFactor,
} from '@/lib/fiscal-engine';
import { lvtRevForFiscal } from '@/lib/land';
import {
  fslRev, fttRev, royaltyRev, spectrumRev, waterRev, stableRentFrac,
  METHANE_FEE_REV, POLLUTION_FEE_SHARE, POLLUTION_FEE_DECAY, BASE_YEAR_GDP, RENT_TAX_DEFAULTS, FTT_VOLUME_DECAY,
  GSIB_ASSETS, EQUITY_VOLUME, FEDERAL_EXTRACTION_SALES, LICENSED_SPECTRUM_VALUE, GROUNDWATER_AF,
} from '@/lib/rent-taxes';

// Runs the National Balance Sheet engine. VAT, LVT, carbon and the prebate are shared fiscal
// parameters; the five smaller rent taxes are page-local and enter the engine as one share of
// GDP (stableTaxFrac), priced the same way the engine prices the defaults (rent-taxes.js).

const FTT_PEAK_PCT = 1 / FTT_VOLUME_DECAY;
const CARBON_PEAK = 165; // carbonRevenueAtRate is rate × (1 − rate/330), which peaks at half of $330
const VAT_MAX = 0.30;

const SMALL_TAXES = [
  { k: 'fslBps',          name: 'Financial Stability Levy', fn: fslRev,      fmt: v => `${v} bp`,      min: 0, max: 50,  step: 5,    help: `Annual levy on the $${(GSIB_ASSETS / 1e12).toFixed(1)}T of assets at US G-SIBs and the US arms of foreign G-SIBs.` },
  { k: 'fttPct',          name: 'Financial transaction tax', fn: fttRev,     fmt: v => `${v.toFixed(2)}%`, min: 0, max: 1, step: 0.05, help: `On $${Math.round(EQUITY_VOLUME / 1e12)}T a year of stock trading (the 2016-2025 average share of GDP). Volume falls 20% at 0.1%; revenue peaks at ${FTT_PEAK_PCT.toFixed(2)}%.` },
  { k: 'royaltyExtraPct', name: 'Resource royalties',        fn: royaltyRev, fmt: v => `+${v} pts`,    min: 0, max: 20,  step: 1,    help: `Added to the 12.5% federal royalty on $${Math.round(FEDERAL_EXTRACTION_SALES / 1e9)}B a year of oil and gas from federal leases.` },
  { k: 'spectrumPct',     name: 'Spectrum holding fee',      fn: spectrumRev, fmt: v => `${v}% / yr`,  min: 0, max: 5,   step: 0.5,  help: `Annual fee on $${Math.round(LICENSED_SPECTRUM_VALUE / 1e9)}B of spectrum licensed to telecom firms.` },
  { k: 'waterFeeAF',      name: 'Groundwater fee',           fn: waterRev,   fmt: v => `$${v} / acre-ft`, min: 0, max: 100, step: 5, help: `On ${Math.round(GROUNDWATER_AF / 1e6)}M acre-feet pumped a year.` },
];
const FIXED_FEES = METHANE_FEE_REV;

const stableFracOf = stableRentFrac;
const debtPct = r => r.grossDebt / r.nominalGdp * 100;
const debt35 = run => debtPct(run.rows[34]);

// VAT rate that brings Year-35 debt to `target`. Debt falls as the VAT rises but not smoothly
// (the solvency brake, prebate indexing and the 25% debt floor all bend it), so the solve first
// brackets the target by stepping out from the current rate, then narrows it by false position.
function solveVat(params, startDebt, target, tol = 0.05) {
  const f = v => debt35(runFiscalSimulation({ ...params, vatRate: v })) - target;
  let a = params.vatRate, fa = startDebt - target;
  if (Math.abs(fa) < tol) return { vat: a, gap: fa };
  const dir = fa > 0 ? 1 : -1;
  let b = a, fb = fa;
  for (let step = 0.01; Math.sign(fb) === Math.sign(fa); step *= 2) {
    if ((dir > 0 && b >= VAT_MAX) || (dir < 0 && b <= 0)) return { vat: b, gap: fb };
    a = b; fa = fb;
    b = Math.min(VAT_MAX, Math.max(0, b + dir * step)); fb = f(b);
  }
  let side = 0, c = b, fc = fb;
  for (let i = 0; i < 30 && Math.abs(fc) > tol; i++) {
    c = (fa * b - fb * a) / (fa - fb); fc = f(c);
    if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
    else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
  }
  return { vat: c, gap: fc };
}

const DEFAULT_RUN = runFiscalSimulation(BASE_PARAMS);
const TARGET_DEBT = debt35(DEFAULT_RUN);
const ENGINE_YR1_GDP = DEFAULT_RUN.rows[0].nominalGdp * 1e12;
// The engine applies each small tax's share of FY2025 GDP to its own GDP each year.
const toEngineYr1 = rev => rev / BASE_YEAR_GDP * ENGINE_YR1_GDP;

const CURVES = {
  lvt: Array.from({ length: 41 }, (_, i) => ({ x: i * 0.5, rev: lvtRevForFiscal({ rate: i * 0.005, year: 1, nominalGdp: ENGINE_YR1_GDP, exemption: 0 }) / 1e9 })),
  carbon: Array.from({ length: 34 }, (_, i) => ({
    x: i * 10,
    yr1: carbonRevenueAtRate(i * 10) / 1e9,
    yr10: carbonRevenueAtRate(i * 10) * carbonDecayFactor(10) / 1e9,
    yr25: carbonRevenueAtRate(i * 10) * carbonDecayFactor(25) / 1e9,
  })),
  fsl: Array.from({ length: 11 }, (_, i) => ({ x: i * 5, rev: toEngineYr1(fslRev(i * 5)) / 1e9 })),
  ftt: Array.from({ length: 21 }, (_, i) => ({ x: +(i * 0.05).toFixed(2), rev: toEngineYr1(fttRev(i * 0.05)) / 1e9 })),
};

const fmtB = n => `$${Math.round(n / 1e9).toLocaleString()}B`;
const fmtPct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;
const pp = (n, d = 1) => Math.abs(n) < 0.5 * 10 ** -d ? `0.0 pts` : `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(d)} pts`;
const usd = v => `$${Math.round(v).toLocaleString()}`;

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};
const TAB_KEYS = ['portfolio', 'replace', 'fiscal', 'curves'];

export default function RentTaxOptimizer() {
  const fiscal = useFiscalParams();
  const { values, set, fx } = fiscal;
  const [small, setSmall] = useUrlState(RENT_TAX_DEFAULTS);
  const [tabRaw, setTab] = useUrlValue('tab', 'portfolio');
  const tab = TAB_KEYS.includes(tabRaw) ? tabRaw : 'portfolio';

  const stableTaxFrac = stableFracOf(small);
  const params = useMemo(() => {
    const { grants, hh, ...engineParams } = fx;
    return { ...engineParams, stableTaxFrac };
  }, [fx, stableTaxFrac]);
  const run = useMemo(() => runFiscalSimulation(params), [params]);
  const debtNow = debt35(run);
  const solved = useMemo(() => solveVat(params, debtNow, TARGET_DEBT), [params, debtNow]);

  const y1 = run.rows[0], y30 = run.rows[29], gdp1 = y1.nominalGdp, gdp30 = y30.nominalGdp;
  const rentYr1 = y1.lvtRev + y1.carbonRev + y1.stableTaxRev;
  const rentYr30 = y30.lvtRev + y30.carbonRev + y30.stableTaxRev;
  const consYr1 = rentYr1 + y1.vatGross + y1.fatRev;

  const taxRows = [
    { name: 'Land value tax', rate: fmtPct(values.lvtRate), yr1: y1.lvtRev, yr30Share: y30.lvtRev / gdp30 },
    { name: 'Carbon tax', rate: `$${values.carbonRate}/ton`, yr1: y1.carbonRev, yr30Share: y30.carbonRev / gdp30 },
    ...SMALL_TAXES.map(t => {
      const share = t.fn(small[t.k]) / BASE_YEAR_GDP;
      return { name: t.name, rate: t.fmt(small[t.k]), yr1: share * gdp1, yr30Share: share };
    }),
    { name: 'Air pollution fee', rate: `${Math.round(POLLUTION_FEE_SHARE * 100)}% of damages`, yr1: y1.pollutionFeeRev, yr30Share: y30.pollutionFeeRev / gdp30 },
    { name: 'Methane fee', rate: 'IRA rates', yr1: FIXED_FEES / BASE_YEAR_GDP * gdp1, yr30Share: FIXED_FEES / BASE_YEAR_GDP },
  ];

  const vatLabel = solved.vat <= 0 && solved.gap < 0 ? '0%'
    : solved.vat >= VAT_MAX && solved.gap > 0 ? `above ${fmtPct(VAT_MAX, 0)}` : fmtPct(solved.vat);
  const vatMoves = Math.abs(solved.vat - values.vatRate) >= 0.0005 && Math.abs(solved.gap) < 0.5;

  const smallIsDefault = SMALL_TAXES.every(t => small[t.k] === RENT_TAX_DEFAULTS[t.k]);
  const sharedRentDefault = ['vatRate', 'lvtRate', 'carbonRate', 'prebatePerCapita'].every(k => values[k] === BASE_PARAMS[k]);
  const resetRent = () => {
    setSmall(RENT_TAX_DEFAULTS);
    ['vatRate', 'lvtRate', 'carbonRate', 'prebatePerCapita'].forEach(k => set[k](BASE_PARAMS[k]));
  };

  const trajData = run.rows.map((r, i) => ({
    year: r.year,
    debt: debtPct(r),
    debtDefault: debtPct(DEFAULT_RUN.rows[i]),
    debtCL: r.clDebtToGdp,
    vat: (r.vatGross + r.fatRev) / r.nominalGdp * 100,
    lvt: r.lvtRev / r.nominalGdp * 100,
    carbon: r.carbonRev / r.nominalGdp * 100,
    stable: r.stableTaxRev / r.nominalGdp * 100,
  }));

  return (
    <PageShell>
      <div className="border-l-4 border-[#307ca6] pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Rent Tax Optimizer</h1>
        <p className="text-base font-semibold text-[#307ca6] mt-2">
          Rent taxes raise {fmtPct(rentYr1 / gdp1)} of GDP in Year 1 and {fmtPct(rentYr30 / gdp30)} in Year 30.
          At these rates, a VAT of {vatLabel} keeps debt at {TARGET_DEBT.toFixed(1)}% of GDP in Year 35.
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Rent taxes fall on land, carbon, finance and natural resources. Each extra dollar they raise lets the VAT
          fall while the debt path stays where the default design puts it.
        </p>
      </div>

      <Card className="mt-6">
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rent tax rates</div>
            {!(smallIsDefault && sharedRentDefault) && (
              <Button variant="ghost" size="xs" className="text-[10px] h-5 px-1.5" onClick={resetRent}>Reset</Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mb-4 leading-snug">
            VAT, LVT, carbon and the prebate carry to every page, including Distributional Impact, which shows what
            they do to household budgets. The five smaller rent taxes apply on this page.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <SliderControl label="VAT rate" value={values.vatRate} onChange={set.vatRate} min={0} max={0.25} step={0.005} formatValue={v => fmtPct(v)} />
            <SliderControl label="Land value tax" value={values.lvtRate} onChange={set.lvtRate} min={0} max={0.20} step={0.005} formatValue={v => fmtPct(v)}
              helpText="Annual rate on land value, no homeowner exemption." />
            <SliderControl label="Carbon tax" value={values.carbonRate} onChange={set.carbonRate} min={0} max={250} step={5} formatValue={v => `$${v}/ton`}
              helpText={`Revenue peaks at $${CARBON_PEAK}/ton.`} />
            {SMALL_TAXES.map(t => (
              <SliderControl key={t.k} label={t.name} value={small[t.k]} onChange={v => setSmall({ [t.k]: v })}
                min={t.min} max={t.max} step={t.step} formatValue={t.fmt} helpText={t.help} />
            ))}
            <SliderControl label="Prebate per person" value={values.prebatePerCapita} onChange={set.prebatePerCapita}
              min={1000} max={10000} step={250} formatValue={usd} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="replace">VAT each tax replaces</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal path</TabsTrigger>
          <TabsTrigger value="curves">Revenue curves</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <MilestoneCard label="Rent taxes, Year 1" value={`$${rentYr1.toFixed(2)}T`} sub={`${fmtPct(rentYr1 / gdp1)} of GDP`} />
            <MilestoneCard label="Share of consumption and rent revenue" value={fmtPct(rentYr1 / consYr1, 0)} sub="Year 1, rent taxes vs VAT, FAT and rent taxes" />
            <MilestoneCard label="Debt, Year 35" value={`${debtNow.toFixed(1)}%`} sub={`of GDP at a ${fmtPct(values.vatRate)} VAT`} />
            <MilestoneCard label="VAT that holds Year-35 debt" value={vatLabel} sub={`debt at ${TARGET_DEBT.toFixed(1)}% of GDP`} />
          </div>
          {vatMoves && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                At these rent taxes, the VAT {solved.vat < values.vatRate ? 'can fall' : 'must rise'} from {fmtPct(values.vatRate)} to {vatLabel}.
              </span>
              <Button variant="outline" size="sm" className="text-[11px]" onClick={() => set.vatRate(Math.round(solved.vat * 1000) / 1000)}>
                Set VAT to {vatLabel}
              </Button>
            </div>
          )}

          <Card className="mt-6">
            <CardContent>
              <h3 className="text-sm font-semibold text-foreground mb-3">Revenue by rent tax</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tax</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Year 1</TableHead>
                    <TableHead className="text-right">Year 30, % of GDP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxRows.map(r => (
                    <TableRow key={r.name}>
                      <TableCell className="text-xs">{r.name}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.rate}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtB(r.yr1 * 1e12)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtPct(r.yr30Share, 2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="text-xs font-semibold">All rent taxes</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono text-xs font-semibold">{fmtB(rentYr1 * 1e12)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">{fmtPct(rentYr30 / gdp30, 2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                {values.carbonRate > 0 && <>Carbon falls from {fmtPct(y1.carbonRev / gdp1, 2)} of GDP to {fmtPct(y30.carbonRev / gdp30, 2)} by Year 30 as
                emissions fall 2.5% a year. </>}{values.lvtRate > 0 && <>LVT moves from {fmtPct(y1.lvtRev / gdp1, 2)} to {fmtPct(y30.lvtRev / gdp30, 2)} as land
                values grow more slowly than GDP. </>}The air pollution fee falls {Math.round(POLLUTION_FEE_DECAY * 100)}% a year in real terms as plants cut emissions. The other smaller rent taxes hold their share of GDP.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="replace">
          <ReplaceTable params={params} debtNow={debtNow} small={small} values={values} />
        </TabsContent>

        <TabsContent value="fiscal">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <MilestoneCard label="Debt, Year 35" value={`${debtNow.toFixed(1)}%`} sub={`default design ${TARGET_DEBT.toFixed(1)}%`} />
            <MilestoneCard label="Current law, Year 35" value={`${run.rows[34].clDebtToGdp.toFixed(1)}%`} sub="debt held by the public" />
            <MilestoneCard label="Interest, Year 35" value={`${run.rows[34].intToRev.toFixed(1)}%`} sub="of federal revenue" />
            <MilestoneCard label="Fiscal goal met" value={run.milestones.fiscalGoalYear ? `Year ${run.milestones.fiscalGoalYear}` : 'not by Year 75'}
              sub="interest under 10% of revenue, debt falling" />
          </div>

          <ChartContainer
            title="Debt held by the public, % of GDP"
            subtitle="Current settings against the default design and current law."
            height={260}
            className="mt-6"
          >
            <LineChart data={trajData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="year" tick={CHART_AXIS.tick} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v.toFixed(1)}%`, n]} labelFormatter={v => `Year ${v}`} />
              <Legend />
              <Line dataKey="debt" name="Current settings" stroke="#307ca6" strokeWidth={2.5} dot={false} />
              <Line dataKey="debtDefault" name="Default design" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              <Line dataKey="debtCL" name="Current law" stroke="#c27040" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
            </LineChart>
          </ChartContainer>

          <ChartContainer
            title="Consumption and rent revenue, % of GDP"
            subtitle="VAT includes the Financial Activities Tax, which is levied at the VAT rate."
            height={260}
          >
            <AreaChart data={trajData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="year" tick={CHART_AXIS.tick} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v.toFixed(2)}%`, n]} labelFormatter={v => `Year ${v}`} />
              <Legend />
              <Area dataKey="vat" name="VAT and FAT" stackId="r" stroke="#6b7280" fill="#6b7280" fillOpacity={0.35} />
              <Area dataKey="lvt" name="Land value tax" stackId="r" stroke="#307ca6" fill="#307ca6" fillOpacity={0.5} />
              <Area dataKey="carbon" name="Carbon tax" stackId="r" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
              <Area dataKey="stable" name="Smaller rent taxes" stackId="r" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} />
            </AreaChart>
          </ChartContainer>
        </TabsContent>

        <TabsContent value="curves">
          <ChartContainer
            title="Land value tax: rate vs Year-1 revenue"
            subtitle="A permanent LVT lowers land prices, so revenue rises more slowly than the rate and levels off near total ground rent."
            height={220}
            className="mt-6"
          >
            <LineChart data={CURVES.lvt} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis type="number" dataKey="x" domain={[0, 20]} tick={CHART_AXIS.tick} tickFormatter={v => `${v}%`} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => fmtB(v * 1e9)} labelFormatter={v => `LVT ${v}%`} />
              <ReferenceLine x={values.lvtRate * 100} stroke="#c27040" strokeDasharray="4 2" label={{ value: 'Current', fill: '#c27040', fontSize: 10, position: 'top' }} />
              <Line dataKey="rev" name="LVT revenue" stroke="#307ca6" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ChartContainer>

          <ChartContainer
            title="Carbon tax: rate vs revenue, today's dollars"
            subtitle={`Revenue peaks at $${CARBON_PEAK}/ton (${fmtB(carbonRevenueAtRate(CARBON_PEAK))} in Year 1). At $${values.carbonRate}/ton it is ${fmtB(carbonRevenueAtRate(values.carbonRate))} in Year 1 and ${fmtB(carbonRevenueAtRate(values.carbonRate) * carbonDecayFactor(25))} in Year 25.`}
            height={240}
          >
            <LineChart data={CURVES.carbon} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis type="number" dataKey="x" domain={[0, 330]} tick={CHART_AXIS.tick} tickFormatter={v => `$${v}`} />
              <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [fmtB(v * 1e9), n]} labelFormatter={v => `$${v}/ton`} />
              <ReferenceLine x={values.carbonRate} stroke="#c27040" strokeDasharray="4 2" label={{ value: 'Current', fill: '#c27040', fontSize: 10, position: 'top' }} />
              <Line dataKey="yr1" name="Year 1" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
              <Line dataKey="yr10" name="Year 10" stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              <Line dataKey="yr25" name="Year 25" stroke="#c27040" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
              <Legend />
            </LineChart>
          </ChartContainer>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
            <ChartContainer
              title="Financial Stability Levy: rate vs Year-1 revenue"
              subtitle="Bank assets shrink by up to 10% as the levy rises to 50 bp."
              height={190}
              className="mt-0"
            >
              <LineChart data={CURVES.fsl} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis type="number" dataKey="x" domain={[0, 50]} tick={CHART_AXIS.tick} tickFormatter={v => `${v}bp`} />
                <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => fmtB(v * 1e9)} labelFormatter={v => `${v} bp`} />
                <ReferenceLine x={small.fslBps} stroke="#c27040" strokeDasharray="4 2" />
                <Line dataKey="rev" name="FSL revenue" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ChartContainer>

            <ChartContainer
              title="Financial transaction tax: rate vs Year-1 revenue"
              subtitle={`Revenue peaks at ${FTT_PEAK_PCT.toFixed(2)}% (${fmtB(toEngineYr1(fttRev(FTT_PEAK_PCT)))}). At ${small.fttPct.toFixed(2)}%, trading volume is ${fmtPct(Math.exp(-FTT_VOLUME_DECAY * small.fttPct), 0)} of its untaxed level.`}
              height={190}
              className="mt-0"
            >
              <LineChart data={CURVES.ftt} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis type="number" dataKey="x" domain={[0, 1]} tick={CHART_AXIS.tick} tickFormatter={v => `${v}%`} />
                <YAxis tick={CHART_AXIS.tick} tickFormatter={v => `$${v}B`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => fmtB(v * 1e9)} labelFormatter={v => `FTT ${v}%`} />
                <ReferenceLine x={small.fttPct} stroke="#c27040" strokeDasharray="4 2" />
                <Line dataKey="rev" name="FTT revenue" stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ChartContainer>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-10">
        <FiscalControls {...fiscal} compact only={['Income tax', 'Ownership & grants']}
          note="The other National Balance Sheet parameters, which move the debt path and so the VAT that holds it." />
      </div>

      <InfoBox className="mt-10">
        Runs the National Balance Sheet engine over 35 years. LVT uses the capitalized land model with no homeowner
        exemption. Carbon revenue reaches zero at $330/ton, when emissions stop, and falls 2.5% a year in real terms as the
        economy decarbonizes. The smaller rent taxes are priced on their Year-1 bases and grow with GDP. VAT figures
        include the Financial Activities Tax on banks and insurers, levied at the VAT rate.
      </InfoBox>
    </PageShell>
  );
}

// VAT points each rent tax stands in for: with that tax at zero, the VAT rate that brings
// Year-35 debt back to its level at the current settings, less the current VAT rate.
function ReplaceTable({ params, debtNow, small, values }) {
  const rows = useMemo(() => {
    const zeroSmall = k => ({ ...params, stableTaxFrac: stableFracOf({ ...small, [k]: 0 }) });
    const cases = [
      { name: 'Land value tax', rate: fmtPct(values.lvtRate), p: { ...params, lvtRate: 0 } },
      { name: 'Carbon tax', rate: `$${values.carbonRate}/ton`, p: { ...params, carbonRate: 0 } },
      ...SMALL_TAXES.map(t => ({ name: t.name, rate: t.fmt(small[t.k]), p: zeroSmall(t.k) })),
      { name: 'Air pollution fee', rate: `${Math.round(POLLUTION_FEE_SHARE * 100)}% of damages`, p: { ...params, pollutionFeeOn: false } },
    ];
    return cases.map(c => {
      const d = debt35(runFiscalSimulation(c.p));
      const s = solveVat(c.p, d, debtNow);
      const solvedOk = Math.abs(s.gap) < 0.5;
      return { name: c.name, rate: c.rate, debt: d - debtNow, vatPts: solvedOk ? (s.vat - params.vatRate) * 100 : null };
    });
  }, [params, debtNow, small, values.lvtRate, values.carbonRate]);

  return (
    <Card className="mt-6">
      <CardContent>
        <h3 className="text-sm font-semibold text-foreground mb-1">What each rent tax is worth in VAT</h3>
        <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
          Each row drops one tax to zero and keeps every other setting. VAT points are the rise in the VAT rate that
          would bring Year-35 debt back to {debtNow.toFixed(1)}% of GDP. The carbon tax returns 80% of its revenue as an
          equal dividend per person, so only a fifth of it reaches the debt.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tax</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Year-35 debt without it</TableHead>
              <TableHead className="text-right">VAT points it replaces</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.name}>
                <TableCell className="text-xs">{r.name}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.rate}</TableCell>
                <TableCell className="text-right font-mono text-xs">{pp(r.debt)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.vatPts == null ? `above ${fmtPct(VAT_MAX, 0)}` : r.vatPts.toFixed(1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
