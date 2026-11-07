import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { ControlGroup } from '@/components/controls/ControlPanel';
import { FiscalControls } from '@/components/controls/FiscalControls';
import { InfoBox } from '@/components/shared/InfoBox';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { BRACKETS } from '@/lib/brackets';
import {
  incomeTaxRevenue, accordSchedule, accordMarginalRate, clMarginalRate, startingBandTop,
  INCOME_TAX_DEFAULTS, INCOME_REF_GDP,
} from '@/lib/income-tax';
import { useUrlValue } from '@/lib/url-state';
import { useFiscalParams } from '@/lib/use-fiscal-params';

// Income tax on the 2024 IRS bracket snapshot, at the schedule the fiscal parameters set (the
// same income-tax module the fiscal engine scales by GDP each year). Revenue includes the
// elasticity of taxable income at the top; capital gains are ordinary income in this schedule.

const ETI = { accord: INCOME_TAX_DEFAULTS.etiTop, conventional: 0.30 };
const CL_REVENUE = BRACKETS.reduce((s, b) => s + b.effCL * b.agi, 0);
const TOTAL_FILERS = BRACKETS.reduce((s, b) => s + b.filers, 0);

const structureOf = (v, etiTop) => ({
  lowRate: v.incomeTaxLow, highRate: v.incomeTaxHigh, threshold: v.incomeTaxThreshold,
  riseEnd: v.incomeTaxRiseEnd, riseShape: v.incomeTaxRiseShape, floorRate: v.incomeTaxFloorRate,
  exemptSingle: v.incomeTaxExemptSingle, exemptJoint: v.incomeTaxExemptJoint, etiTop,
});

const fmtT = n => `$${(n / 1e12).toFixed(2)}T`;
const fmtB = n => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n) / 1e9).toLocaleString()}B`;
const fmtPct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;
const fmtK = n => n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
const signed = v => `${v < 0 ? '−' : '+'}$${Math.abs(Math.round(v)).toLocaleString()}`;

function heatColor(val, min, max) {
  const t = Math.max(0, Math.min(1, (val - min) / Math.max(max - min, 1)));
  const r = Math.round(239 - t * (239 - 48)), g = Math.round(246 - t * (246 - 124)), b = Math.round(255 - t * (255 - 166));
  return `rgb(${r},${g},${b})`;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

// Incomes for the marginal-rate chart, spaced evenly in log income from $5K to $5M.
const RATE_INCOMES = Array.from({ length: 61 }, (_, i) => Math.round(5000 * Math.pow(1000, i / 60)));
const GRID_TOPS = Array.from({ length: 11 }, (_, i) => +(0.50 + i * 0.02).toFixed(2));
const GRID_FLOORS = Array.from({ length: 11 }, (_, i) => +(i * 0.005).toFixed(3));
const DEDUCTIONS = [0, 10000, 20000, 30000, 40000];

export default function IncomeTaxDesign() {
  const { values, set, isDefault, reset, grants } = useFiscalParams();
  const [eti, setEti] = useUrlValue('eti', 'accord');
  const [tab, setTab] = useUrlValue('tab', 'schedule');
  const etiTop = ETI[eti] ?? ETI.accord;

  const structure = useMemo(() => structureOf(values, etiTop), [values, etiTop]);
  const revenue = useMemo(() => incomeTaxRevenue(structure), [structure]);
  const sched = useMemo(() => accordSchedule(structure), [structure]);
  const bandTop = startingBandTop(sched);
  const topRate = sched[sched.length - 1][1];
  const topReached = sched[sched.length - 2][0];

  const rows = revenue.byBracket.map((x, i) => {
    const b = BRACKETS[i], avgInc = b.agi / b.filers;
    const clTax = b.effCL * avgInc;
    return { ...x, avgInc, filers: b.filers, cgShare: b.cgShare, clTax, clEff: b.effCL, delta: x.perFiler - clTax };
  });
  const lowerBillFilers = rows.filter(r => r.delta < -100).reduce((s, r) => s + r.filers, 0);
  // Brackets whose bill rises, as runs of neighbouring brackets ("$0-10K to $10-15K", "$500K-1M and up").
  const higherRuns = rows.reduce((runs, r, i) => {
    if (r.delta <= 100) return runs;
    const last = runs[runs.length - 1];
    if (last && last.end === i - 1) last.end = i; else runs.push({ start: i, end: i });
    return runs;
  }, []).map(({ start, end }) => end === rows.length - 1 ? `${rows[start].label} and up`
    : start === end ? rows[start].label : `${rows[start].label} to ${rows[end].label}`);

  const rateData = RATE_INCOMES.map(inc => ({
    income: inc,
    'Accord': +(accordMarginalRate(inc, structure.exemptSingle, sched) * 100).toFixed(2),
    'Current law, single': +(clMarginalRate(inc, 0) * 100).toFixed(2),
    'Current law, joint': +(clMarginalRate(inc, 1) * 100).toFixed(2),
  }));

  const grid = useMemo(() => GRID_FLOORS.map(fl => ({
    fl, cells: GRID_TOPS.map(tp => ({ tp, rev: incomeTaxRevenue({ ...structure, floorRate: fl, highRate: tp }).total })),
  })), [structure]);
  const gridRevs = grid.flatMap(r => r.cells.map(c => c.rev));
  const gMin = Math.min(...gridRevs), gMax = Math.max(...gridRevs);

  const dedSensitivity = useMemo(() => DEDUCTIONS.map(s => ({
    s, rev: incomeTaxRevenue({ ...structure, exemptSingle: s, exemptJoint: 2 * s }).total,
  })), [structure]);

  const scheduleLine = `${fmtPct(values.incomeTaxFloorRate, 1)} on all income up to ${fmtK(bandTop)}, rising smoothly to ${fmtPct(topRate, 0)} at ${fmtK(topReached)}`;
  const deductionLine = values.incomeTaxExemptSingle > 0 || values.incomeTaxExemptJoint > 0
    ? `Deduction: $${values.incomeTaxExemptSingle.toLocaleString()} single, $${values.incomeTaxExemptJoint.toLocaleString()} joint.`
    : 'No standard or itemized deductions.';

  return (
    <PageShell>
      <div className="border-l-4 border-[#307ca6] pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">American Ownership Accord</p>
        <h1 className="text-2xl font-bold tracking-tight">Income Tax Design</h1>
        <p className="text-base font-semibold text-[#307ca6] mt-2">
          The income tax raises {fmtT(revenue.total)} on 2024 incomes, {fmtB(revenue.total - CL_REVENUE)} against current law,
          and {Math.round(lowerBillFilers / TOTAL_FILERS * 100)}% of filers pay less.
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          {scheduleLine}. {deductionLine} Capital gains and dividends are taxed as ordinary income.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <MilestoneCard label="Income tax revenue" value={fmtT(revenue.total)} sub={`${fmtPct(revenue.fracOfGdp)} of GDP, 2024 incomes`} />
        <MilestoneCard label="Against current law" value={`${revenue.total >= CL_REVENUE ? '+' : ''}${fmtB(revenue.total - CL_REVENUE)}`} sub={`Current law: ${fmtT(CL_REVENUE)}`} />
        <MilestoneCard label="Tax on capital gains" value={fmtB(revenue.capGains)} sub="Inside the total, at ordinary rates" />
        <MilestoneCard label="Filers who pay less" value={`${Math.round(lowerBillFilers / TOTAL_FILERS * 100)}%`}
          sub={higherRuns.length ? `Pay more: ${higherRuns.join('; ')}` : 'Every bracket pays less'} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-10">
        <TabsList variant="line" className="w-full flex-wrap">
          <TabsTrigger value="schedule">Rate Schedule</TabsTrigger>
          <TabsTrigger value="brackets">By Bracket</TabsTrigger>
          <TabsTrigger value="grid">Rate Grid</TabsTrigger>
          <TabsTrigger value="deduction">Deduction Sensitivity</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <ChartContainer
            title="Marginal income tax rate by income"
            subtitle="The rate on the next dollar of income. Current law shown for single and joint filers at the standard deduction."
            height={320}
            className="mt-6"
            source="Current law: 2024 federal ordinary brackets. Accord: the schedule set in the fiscal parameters below."
          >
            <LineChart data={rateData} margin={{ left: 0, right: 20, bottom: 10 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="income" scale="log" domain={['dataMin', 'dataMax']} type="number"
                ticks={[10e3, 25e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2.5e6, 5e6]} tickFormatter={fmtK} tick={CHART_AXIS.tick} />
              <YAxis tickFormatter={v => `${v}%`} tick={CHART_AXIS.tick} width={45} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={fmtK} formatter={(v, n) => [`${v.toFixed(1)}%`, n]} />
              <Legend />
              <Line type="stepAfter" dataKey="Accord" stroke="#307ca6" strokeWidth={2.5} dot={false} />
              <Line type="stepAfter" dataKey="Current law, single" stroke="#9CA3AF" strokeWidth={1.5} dot={false} />
              <Line type="stepAfter" dataKey="Current law, joint" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ChartContainer>

          <ChartContainer
            title="Income tax revenue by income bracket"
            subtitle="Billions of dollars on 2024 incomes."
            height={300}
            source="IRS Statistics of Income 2024 estimates. Accord revenue includes the elasticity of taxable income above $200K."
          >
            <BarChart data={rows.map(r => ({ name: r.label, cl: +(r.clTax * r.filers / 1e9).toFixed(1), accord: +(r.revenue / 1e9).toFixed(1) }))}
              margin={{ left: 20, right: 10 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="name" angle={-30} textAnchor="end" height={65} tick={{ fontSize: 10 }} interval={0} />
              <YAxis tickFormatter={v => `$${v}B`} tick={CHART_AXIS.tick} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`$${v.toFixed(0)}B`, n]} />
              <Legend />
              <Bar dataKey="cl" name="Current law" fill="#d1d5db" radius={[3, 3, 0, 0]} />
              <Bar dataKey="accord" name="Accord" fill="#307ca6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </TabsContent>

        <TabsContent value="brackets">
          <Card className="mt-6">
            <CardContent className="pt-5 overflow-x-auto">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Income tax by bracket, Accord against current law</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Per filer, on 2024 incomes. Marginal rates are averaged over the incomes within each bracket. The income tax is one part of
                the change each household sees; the Distributional Impact page adds the prebate, VAT, land value tax, carbon and health.
              </p>
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#1e3a5f] hover:bg-[#1e3a5f]">
                    {['Bracket', 'Avg income', 'Filers', 'Marginal, current law', 'Marginal, Accord', 'Effective, current law',
                      'Effective, Accord', 'Change per filer', 'Gains share of income', 'Behavioral factor'].map((h, i) => (
                      <TableHead key={h} className={`text-white text-[11px] font-bold ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.label}>
                      <TableCell className="font-bold text-[#1e3a5f]">{r.label}</TableCell>
                      <TableCell className="text-right">{fmtK(r.avgInc)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{(r.filers / 1e6).toFixed(1)}M</TableCell>
                      <TableCell className="text-right">{fmtPct(r.mCL)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.mNew < r.mCL ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>{fmtPct(r.mNew)}</TableCell>
                      <TableCell className="text-right">{fmtPct(r.clEff)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.eff < r.clEff ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>{fmtPct(r.eff)}</TableCell>
                      <TableCell className={`text-right font-bold ${r.delta <= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>{signed(r.delta)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{fmtPct(r.cgShare, 0)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.bFactor.toFixed(3)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <InfoBox className="mt-4">
                The Accord marginal rate includes the 12.4% Social Security contribution on income above the current cap, which drives the
                behavioral response. The behavioral factor is revenue after that response as a share of revenue before it. Effective
                Accord rates use income tax alone.
              </InfoBox>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grid">
          <Card className="mt-6">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Revenue by top rate and minimum rate</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Income tax revenue in trillions of dollars, 2024 incomes, with the rest of the schedule held as set. The outlined cell is
                closest to the current setting.
              </p>
              <div className="overflow-x-auto">
                <table className="border-collapse text-[11px]">
                  <thead>
                    <tr>
                      <th className="px-2.5 py-1 text-right font-bold text-xs">Minimum ↓ Top →</th>
                      {GRID_TOPS.map(tp => <th key={tp} className="px-1 py-0.5 text-center font-semibold min-w-[44px]">{Math.round(tp * 100)}%</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map(row => (
                      <tr key={row.fl}>
                        <td className="px-2.5 py-0.5 font-bold text-right">{(row.fl * 100).toFixed(1)}%</td>
                        {row.cells.map(c => {
                          const cur = Math.abs(row.fl - values.incomeTaxFloorRate) < 0.0026 && Math.abs(c.tp - values.incomeTaxHigh) < 0.011;
                          return (
                            <td key={c.tp} style={{
                              padding: '3px 4px', textAlign: 'center', minWidth: 44,
                              background: heatColor(c.rev, gMin, gMax),
                              color: c.rev > (gMin + gMax) / 2 ? '#fff' : '#111',
                              fontWeight: cur ? 800 : 400, outline: cur ? '2px solid #d4940a' : 'none',
                            }}>
                              {(c.rev / 1e12).toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Current law raises {fmtT(CL_REVENUE)}. Each half point of minimum rate adds about{' '}
                {fmtB((grid[1].cells[5].rev - grid[0].cells[5].rev))} at a {Math.round(GRID_TOPS[5] * 100)}% top rate.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deduction">
          <Card className="mt-6">
            <CardContent className="pt-5">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Deduction sensitivity</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Revenue with a standard deduction added to the schedule as set. Joint filers get twice the single amount.
              </p>
              <ChartContainer height={260} className="mt-0">
                <BarChart data={dedSensitivity.map(d => ({ name: d.s ? `$${d.s / 1000}K` : 'None', rev: +(d.rev / 1e12).toFixed(3) }))}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="name" tick={CHART_AXIS.tick} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={v => `$${v.toFixed(2)}T`} tick={CHART_AXIS.tick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`$${v.toFixed(3)}T`, 'Revenue']} />
                  <Bar dataKey="rev" name="Revenue" fill="#307ca6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
              <Table className="mt-5">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {['Deduction, single', 'Joint', 'Revenue', 'Against no deduction', 'Against current law'].map(h => (
                      <TableHead key={h} className="text-xs font-semibold">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dedSensitivity.map(d => (
                    <TableRow key={d.s}>
                      <TableCell>${d.s.toLocaleString()}</TableCell>
                      <TableCell>${(2 * d.s).toLocaleString()}</TableCell>
                      <TableCell className="font-semibold">{fmtT(d.rev)}</TableCell>
                      <TableCell>{d.s ? fmtB(d.rev - dedSensitivity[0].rev) : '—'}</TableCell>
                      <TableCell>{fmtB(d.rev - CL_REVENUE)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-10">
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6">
          <FiscalControls values={values} set={set} isDefault={isDefault} reset={reset} grants={grants}
            only={['Income tax']} compact
            note="The income tax parameters the National Balance Sheet runs. Changes here carry to every page." />
          <ControlGroup>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Behavioral response at the top</p>
            <ToggleGroup type="single" value={eti} onValueChange={v => { if (v) setEti(v); }} variant="outline" className="flex">
              <ToggleGroupItem value="accord" className="text-xs px-3 py-1.5 flex-1">Accord ({ETI.accord})</ToggleGroupItem>
              <ToggleGroupItem value="conventional" className="text-xs px-3 py-1.5 flex-1">Conventional ({ETI.conventional})</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground mt-2">
              Elasticity of taxable income above $200K. The Accord value assumes gains are unified and realization backstops close
              deferral; the conventional value is the literature's central estimate.
            </p>
          </ControlGroup>
        </CardContent>
      </Card>

      <InfoBox className="mt-8">
        <strong className="text-foreground">Methodology:</strong>{' '}
        IRS Statistics of Income 2024 estimates, 15 brackets and {Math.round(TOTAL_FILERS / 1e6)}M filers, each spread across 12 incomes
        within its range. Tax is the Accord schedule on all income, including capital gains and dividends, less any deduction. Revenue
        applies the elasticity of taxable income to the change in the net-of-tax marginal rate above $200K; below it, the labor response is
        carried by the fiscal engine's growth channel. Current law uses each bracket's IRS effective federal income tax rate. The fiscal
        engine scales this revenue with nominal GDP each year.
      </InfoBox>
    </PageShell>
  );
}
