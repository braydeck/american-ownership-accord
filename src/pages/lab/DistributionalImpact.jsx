import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Cell, LineChart, Line, ReferenceLine,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { ControlPanel, ControlGroup } from '@/components/controls/ControlPanel';
import { FiscalControls } from '@/components/controls/FiscalControls';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { BRACKETS } from '@/lib/brackets';
import { useUrlValue } from '@/lib/url-state';
import { useFiscalParams } from '@/lib/use-fiscal-params';
import { householdFlowsAt, workerEquityAt, amcfG } from '@/lib/household-model';

// ─── DISTRIBUTIONAL ENGINE ────────────────────────────────────────────────────
// Every income bracket's average household runs through the shared household model
// (householdFlowsAt), so taxes, transfers and health effects follow the fiscal parameters the
// rest of the site uses. Cash is the change in a year's spendable income against current law;
// coverage is the in-kind value of insurance for the previously uninsured, counted as income.
// Ownership adds the year's AMCF grants (every household member, children's into custodial
// accounts) and worker equity (cash payouts plus Worker Equity Fund units issued), which
// households hold as wealth.
const NEUTRAL_BAND = 100;

function ownershipAt(income, hhSz, y, fx) {
  const we = workerEquityAt(income, y, fx);
  return { amcf: amcfG(y, fx) * hhSz, workerCash: we.cash, workerUnits: we.unitsIssued };
}

function computeDistrib(y, fx) {
  return BRACKETS.map(b => {
    const avgInc = b.agi / b.filers;
    const f = householdFlowsAt({ income: avgInc, hhSz: b.hhSz }, y, fx);
    const o = ownershipAt(avgInc, b.hhSz, y, fx);
    const cash = f.net + f.coverage;
    const withOwnership = cash + o.amcf + o.workerCash + o.workerUnits;
    const clTax = b.effCL * avgInc;
    return {
      label: b.label, avgInc, filers: b.filers, hhSz: b.hhSz, ...f, ...o, cash, withOwnership,
      effCL: clTax / avgInc,
      effAccord: (clTax - cash) / avgInc,
      effAccordOwnership: (clTax - withOwnership) / avgInc,
    };
  });
}

// ─── FORMATTING ──────────────────────────────────────────────────────────────

const fmtDollar = v => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
};
const signed = v => `${v < 0 ? '−' : '+'}$${Math.abs(Math.round(v)).toLocaleString()}`;
const fmtPct = v => `${(v * 100).toFixed(1)}%`;

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const DollarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p className="font-semibold mb-1.5">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="my-0.5">{p.name}: {signed(p.value)}</p>
      ))}
    </div>
  );
};

// Income-tax, VAT and other columns are costs to the household; the table shows each as its
// effect on the household (negative = pays more).
const FLOW_COLUMNS = [
  ['Prebate', d => d.prebate],
  ['Carbon dividend', d => d.dividend],
  ['Programs replaced', d => -d.programs],
  ['Income tax', d => -d.incomeTax],
  ['VAT', d => -d.vat],
  ['LVT net', d => -d.lvt],
  ['Carbon cost', d => -d.carbon],
  ['Payroll above cap', d => -d.ssAboveCap],
  ['Health contribution', d => -d.healthTax],
  ['Health savings', d => d.healthGain],
  ['Coverage', d => d.coverage],
];
const OWNERSHIP_COLUMNS = [
  ['AMCF grants', d => d.amcf],
  ['Worker payouts', d => d.workerCash],
  ['Fund units issued', d => d.workerUnits],
];

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function DistributionalImpact() {
  const [view,         setView]         = useUrlValue('tab', 'national');
  const [snapshotYear, setSnapshotYear] = useUrlValue('yr', 1);
  const [showOwn,      setShowOwn]      = useUrlValue('own', false);
  const { fx, values, set, isDefault, reset, grants } = useFiscalParams();

  // Calculator state
  const [calcIncome, setCalcIncome] = useState(75000);
  const [calcHhSize, setCalcHhSize] = useState(3);
  const [calcOwner,  setCalcOwner]  = useState(true);
  const [calcOver65, setCalcOver65] = useState(false);

  const distrib = useMemo(() => computeDistrib(snapshotYear, fx), [snapshotYear, fx]);
  const netOf = d => showOwn ? d.withOwnership : d.cash;

  const totalFilers = distrib.reduce((s, d) => s + d.filers, 0);
  const betterFilers = distrib.filter(d => netOf(d) > NEUTRAL_BAND).reduce((s, d) => s + d.filers, 0);
  const worseFilers  = distrib.filter(d => netOf(d) < -NEUTRAL_BAND).reduce((s, d) => s + d.filers, 0);
  const pctBetter = betterFilers / totalFilers;
  const firstWorse = distrib.find(d => netOf(d) < -NEUTRAL_BAND);

  const rateData = distrib.map(d => ({
    label: d.label,
    'Current law': +(d.effCL * 100).toFixed(1),
    'Accord': +(d.effAccord * 100).toFixed(1),
    ...(showOwn ? { 'Accord with ownership': +(d.effAccordOwnership * 100).toFixed(1) } : {}),
  }));
  const netChangeData = distrib.map(d => ({ name: d.label, net: Math.round(netOf(d)) }));

  const calc = useMemo(() => {
    const f = householdFlowsAt({
      income: calcIncome, hhSz: calcHhSize, own: calcOwner ? 1 : 0,
      over65: calcOver65, wageIncome: !calcOver65,
    }, snapshotYear, fx);
    const o = ownershipAt(calcIncome, calcHhSize, snapshotYear, fx);
    return { f, o, cash: f.net + f.coverage, total: f.net + f.coverage + o.amcf + o.workerCash + o.workerUnits };
  }, [calcIncome, calcHhSize, calcOwner, calcOver65, snapshotYear, fx]);
  const calcRows = [...FLOW_COLUMNS.map(([k, g]) => [k, g(calc.f)]), ...OWNERSHIP_COLUMNS.map(([k, g]) => [k, g(calc.o)])]
    .filter(([, v]) => Math.abs(v) >= 0.5);

  const vatPct = `${+(fx.vatRate * 100).toFixed(1)}%`;
  const lvtPct = `${+(fx.lvtRate * 100).toFixed(1)}%`;
  const prebateY = distrib[0].prebate / distrib[0].hhSz;
  const columns = [...FLOW_COLUMNS, ...(showOwn ? OWNERSHIP_COLUMNS : [])];

  return (
    <PageShell>
      {/* ── Header ── */}
      <div className="border-l-4 border-[#307ca6] pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">American Ownership Accord</p>
        <h1 className="text-2xl font-bold tracking-tight">Distributional Impact</h1>
        <p className="text-[17px] text-[#307ca6] font-semibold mt-2.5">
          {(pctBetter * 100).toFixed(0)}% of tax filers are better off under the Accord in Year {snapshotYear}
          {showOwn ? ', counting AMCF grants and worker equity' : ' on income alone'}.
          {firstWorse ? ` The lowest bracket that pays more is ${firstWorse.label}.` : ''}
        </p>
        <p className="text-sm text-muted-foreground mt-1.5">
          Each bracket's average household under the Accord's taxes and transfers, against current law: a ${Math.round(prebateY).toLocaleString()} prebate
          per person in Year {snapshotYear}, the carbon dividend, the income tax schedule, a {vatPct} VAT, a {lvtPct} land value tax,
          carbon at ${fx.carbonRate}/ton and universal coverage, less the programs the prebate replaces. All values in 2024 dollars.
        </p>
      </div>

      <Tabs value={view} onValueChange={setView} className="mt-7">
        <TabsList>
          <TabsTrigger value="national">National Picture</TabsTrigger>
          <TabsTrigger value="table">Full Table</TabsTrigger>
          <TabsTrigger value="calculator">My Household</TabsTrigger>
        </TabsList>

        <ControlPanel columns={2} className="mt-5">
          <SliderControl
            label={`Snapshot Year: ${snapshotYear}`}
            value={snapshotYear}
            onChange={setSnapshotYear}
            min={1}
            max={35}
            step={1}
            formatValue={v => `Year ${v}`}
          />
          <ControlGroup>
            <p className="text-xs font-semibold mb-1.5">Ownership</p>
            <Button
              variant={showOwn ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowOwn(s => !s)}
              className={showOwn ? 'bg-[#307ca6] hover:bg-[#307ca6]' : ''}
            >
              {showOwn ? '✓ Ownership included' : 'Income only'}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">
              Adds the year's AMCF grants, worker payouts and Worker Equity Fund units issued.
            </p>
          </ControlGroup>
        </ControlPanel>

        {/* ══ NATIONAL PICTURE ══════════════════════════════════════════════════ */}
        <TabsContent value="national">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-7">
            <MilestoneCard label="Filers better off" value={fmtPct(pctBetter)} className="[&_p:last-of-type]:text-[#307ca6] [&_p.text-xl]:text-[28px]" />
            <MilestoneCard label="Filers worse off" value={fmtPct(worseFilers / totalFilers)} className="[&_p:last-of-type]:text-[#c27040] [&_p.text-xl]:text-[28px]" />
            <MilestoneCard label="First bracket that pays more" value={firstWorse ? firstWorse.label : 'None'} className="[&_p.text-xl]:text-[28px]" />
          </div>

          <ChartContainer
            title={`Annual change against current law by income bracket, Year ${snapshotYear}`}
            subtitle={`Blue: better off by more than $${NEUTRAL_BAND}. Orange: worse off by more than $${NEUTRAL_BAND}. ${showOwn ? 'Includes AMCF grants and worker equity.' : 'Income only.'}`}
            height={340}
            source="Sources: IRS Statistics of Income (2024 estimates); EPA household carbon; BLS Consumer Expenditure Survey; the site's fiscal engine and household model."
          >
            <BarChart data={netChangeData} margin={{ top: 10, right: 30, left: 20, bottom: 40 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="name" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' }} interval={0} />
              <YAxis tickFormatter={fmtDollar} tick={CHART_AXIS.tick} width={70} />
              <Tooltip content={<DollarTooltip />} />
              <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />
              <Bar dataKey="net" name="Change against current law" radius={[3, 3, 0, 0]}>
                {netChangeData.map((d, i) => (
                  <Cell key={i} fill={d.net > NEUTRAL_BAND ? '#307ca6' : d.net < -NEUTRAL_BAND ? '#c27040' : '#9CA3AF'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>

          <ChartContainer
            title="Net tax rate, current law and the Accord"
            subtitle="Taxes paid less transfers received, as a share of income. Below zero, a household receives more than it pays."
            height={300}
            source="Current-law rates: IRS SOI effective federal rates by bracket. Accord rate: current-law rate less the change shown above."
          >
            <LineChart data={rateData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' }} interval={0} />
              <YAxis tickFormatter={v => `${v}%`} tick={CHART_AXIS.tick} width={50} />
              <Tooltip formatter={v => [`${v.toFixed(1)}%`]} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
              <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="4 4" />
              <Line dataKey="Current law" stroke="#1D4ED8" strokeWidth={2.5} dot={false} />
              <Line dataKey="Accord" stroke="#307ca6" strokeWidth={2.5} dot={false} />
              {showOwn && <Line dataKey="Accord with ownership" stroke="#1f5d7e" strokeWidth={2} dot={false} strokeDasharray="5 3" />}
            </LineChart>
          </ChartContainer>

          <div className="mt-12">
            <h2 className="text-lg font-semibold tracking-tight">Summary by income bracket</h2>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Income range</TableHead>
                  <TableHead>Filers</TableHead>
                  <TableHead className="text-blue-700">Current-law rate</TableHead>
                  <TableHead className="text-[#307ca6]">Accord rate</TableHead>
                  <TableHead>Annual change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distrib.map((d, i) => {
                  const net = netOf(d);
                  const eff = showOwn ? d.effAccordOwnership : d.effAccord;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-semibold">{d.label}</TableCell>
                      <TableCell>{(d.filers / 1e6).toFixed(1)}M</TableCell>
                      <TableCell className="text-blue-700">{fmtPct(d.effCL)}</TableCell>
                      <TableCell className={eff < d.effCL ? 'text-[#307ca6]' : 'text-[#c27040]'}>{fmtPct(eff)}</TableCell>
                      <TableCell className={`font-semibold ${net >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>{signed(net)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ══ FULL TABLE ════════════════════════════════════════════════════════ */}
        <TabsContent value="table">
          <div className="mt-7 overflow-x-auto">
            <p className="text-sm text-muted-foreground mb-4">
              Each item's effect on the bracket's average household in Year {snapshotYear}, against current law. Positive: the household
              gains. Negative: it pays more.
            </p>
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1e3a5f] hover:bg-[#1e3a5f]">
                  {['Bracket', 'Avg income', ...columns.map(([k]) => k), 'Net change', '% of income'].map((h, i) => (
                    <TableHead key={h} className={`text-white text-[11px] font-bold ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {distrib.map((d, i) => {
                  const net = netOf(d);
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-bold text-[#1e3a5f]">{d.label}</TableCell>
                      <TableCell className="text-right">{fmtDollar(d.avgInc)}</TableCell>
                      {columns.map(([k, g]) => {
                        const v = g(d);
                        return (
                          <TableCell key={k} className={`text-right ${Math.abs(v) < 0.5 ? 'text-muted-foreground' : v > 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                            {Math.abs(v) < 0.5 ? '0' : fmtDollar(v)}
                          </TableCell>
                        );
                      })}
                      <TableCell className={`text-right font-bold ${net >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>{fmtDollar(net)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{(net / d.avgInc * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <InfoBox className="mt-3">
            <strong>Columns:</strong> Programs replaced are SNAP, EITC, the child tax credit and the other means-tested cash aid the prebate
            replaces. Payroll above cap is the Social Security contribution on wages above the current cap. Health savings are premiums and
            out-of-pocket costs no longer paid, plus employer premiums converted to wages. Coverage is the value of insurance for the
            previously uninsured, in kind.
            {showOwn && ' AMCF grants and Fund units issued are held as wealth; worker payouts are cash.'}
          </InfoBox>
        </TabsContent>

        {/* ══ HOUSEHOLD CALCULATOR ════════════════════════════════════════════ */}
        <TabsContent value="calculator">
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-8 mt-7">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-base font-bold mb-5">Your household</h3>
                <div className="mb-4">
                  <label className="block mb-1.5 text-[13px] font-semibold">Annual household income</label>
                  <div className="flex gap-2 items-center">
                    <span className="text-sm">$</span>
                    <input type="number" value={calcIncome}
                      onChange={e => setCalcIncome(Math.max(0, +e.target.value || 0))}
                      className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
                      min={0} max={50000000} step={1000} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block mb-1.5 text-[13px] font-semibold">Household size</label>
                  <select value={calcHhSize} onChange={e => setCalcHhSize(+e.target.value)}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm">
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[13px] font-semibold mb-3 cursor-pointer">
                  <input type="checkbox" checked={calcOwner} onChange={e => setCalcOwner(e.target.checked)} className="accent-[#307ca6]" />
                  Owns their home
                </label>
                <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
                  <input type="checkbox" checked={calcOver65} onChange={e => setCalcOver65(e.target.checked)} className="accent-[#307ca6]" />
                  65 or older, retired
                </label>
                <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
                  Year {snapshotYear} (set above). Retired households keep Medicare, pay the health contribution on income above the
                  exemption, and lose no programs.
                </p>
              </CardContent>
            </Card>

            <div>
              <Card className={`mb-5 ${calc.cash >= 0 ? 'border-[#307ca6]/30 bg-[#307ca6]/10' : 'border-[#c27040]/30 bg-[#c27040]/10'}`}>
                <CardContent className="py-5 px-6">
                  <p className="text-sm mb-1">Change in income against current law, Year {snapshotYear}:</p>
                  <p className={`text-[32px] font-extrabold ${calc.cash >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>
                    {signed(calc.cash)} a year
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    With the year's AMCF grants and worker equity, held as wealth: {signed(calc.total)}.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  {calcRows.map(([k, v]) => (
                    <div key={k} className="flex justify-between mb-1.5 text-xs">
                      <span>{k}</span>
                      <span className={`font-semibold ${v >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'}`}>{signed(v)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <InfoBox className="mt-4">
                The calculator places the household in its IRS income bracket for consumption share, carbon footprint, health premiums and
                worker equity, and scales the per-person items to household size. Programs replaced are interpolated from the persona
                households on the Household Impact page.
              </InfoBox>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Card className="mt-10">
        <CardContent className="p-5">
          <FiscalControls values={values} set={set} isDefault={isDefault} reset={reset} grants={grants} compact />
        </CardContent>
      </Card>

      <InfoBox className="mt-8">
        <strong className="text-foreground">Methodology:</strong>{' '}
        Bracket data: IRS Statistics of Income 2024 estimates (15 brackets, {Math.round(totalFilers / 1e6)}M filers). Each bracket's average
        household runs through the shared household model at the fiscal parameters above, the same model as Household Impact. Income tax is
        the Accord schedule against current law on the same income. The VAT falls on each bracket's consumption share (BLS CES); the land
        value tax is the residential net, homeowners' tax less renters' rent relief; carbon uses EPA household emissions with the dividend
        returned per person. The prebate follows the engine's indexing path. Health effects are the contribution, converted wages and
        premiums saved, and coverage for the previously uninsured. All values in 2024 dollars.
      </InfoBox>
    </PageShell>
  );
}
