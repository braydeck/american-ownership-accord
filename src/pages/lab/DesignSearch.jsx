// Design Search: the tax-and-transfer designs that meet the fiscal goal and leave the bottom 80%
// better off. Data comes from scripts/design-search.mjs (5,000 Latin hypercube designs, seed 42),
// written to src/data/design-search.json. Rerun the script after any engine change.
import React, { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ZAxis,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { PresetSelector } from '@/components/controls/PresetSelector';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { useUrlValue } from '@/lib/url-state';
import DATA from '@/data/design-search.json';
import VARIANTS from '@/data/design-variants.json';
import { DesignCompare } from '@/pages/lab/DesignCompare';

// Every design the page can show: searched designs plus named variants of them
// (scripts/design-variants.mjs).
const ALL_DESIGNS = [...DATA.passing, ...VARIANTS];
const designName = d => d.name ?? `Design ${d.id}`;
// Designs compared by default: design 1321 and its variants, and design 133, the robust design
// with the lowest income Gini.
const COMPARE_IDS = ['1321-lvt8', '1321-3rate', '1321-p80', 133];

const COLORS = { variant: '#18181b', fail: '#d4d4d8', pass15: '#9cc3e8', pass10: '#2563C9', robust: '#d4940a', law: '#18181b', accord: '#c27040' };

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const usd = v => `${v < 0 ? '−' : '+'}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}K` : Math.round(Math.abs(v))}`;
const money = v => `$${Math.round(v).toLocaleString()}`;
const threshold = t => (t >= 1e6 ? `$${t / 1e6}M` : `$${t / 1e3}K`);
const yr = v => (v == null ? 'Never' : `Yr ${v}`);
const indexLabel = v => (v === 0 ? 'CPI only' : `CPI + ${v * 100}% of real GDP/person growth`);

function bracketText(brackets) {
  let lo = 0;
  return brackets.map(([hi, rate]) => {
    const seg = hi == null ? `${pct(rate)} above ${threshold(lo)}` : `${pct(rate)} to ${threshold(hi)}`;
    lo = hi;
    return seg;
  }).join(', ');
}

const VIEWS = [
  { key: 'robust', label: 'Robust to recessions' },
  { key: '10', label: 'Goal by Year 10' },
  { key: '15', label: 'Goal by Year 15' },
];

const SORTS = {
  incomeGiniY30: { label: 'Income Gini', dir: 1 },
  nwGiniY30: { label: 'Net-worth Gini', dir: 1 },
  fiscalGoalYear: { label: 'Goal year', dir: 1 },
  P70Y30: { label: 'P70 gain', dir: -1 },
  P80Y30: { label: 'P80 change', dir: -1 },
};

function inView(d, view) {
  if (view === 'robust') return d.robust;
  return d.fiscalGoalYear <= Number(view);
}

export default function DesignSearch() {
  const [view, setView] = useUrlValue('dsview', 'robust');
  const [sortKey, setSortKey] = useUrlValue('dssort', 'incomeGiniY30');
  const defaultId = '1321-p80';
  const [selectedId, setSelectedId] = useState(defaultId);

  const scatter = useMemo(() => {
    const out = { fail: [], pass15: [], pass10: [], robust: [] };
    DATA.points.forEach(([x, y, s], id) => {
      const key = ['fail', 'pass15', 'pass10', 'robust'][s];
      out[key].push({ x, y, id });
    });
    return out;
  }, []);

  const rows = useMemo(() => {
    const { dir } = SORTS[sortKey];
    return DATA.passing.filter(d => inView(d, view))
      .sort((a, b) => dir * ((a[sortKey] ?? 99) - (b[sortKey] ?? 99)));
  }, [view, sortKey]);

  const selected = ALL_DESIGNS.find(d => d.id === selectedId) ?? rows[0];
  const onPoint = p => { if (p?.payload?.id != null && ALL_DESIGNS.some(d => d.id === p.payload.id)) setSelectedId(p.payload.id); };

  return (
    <PageShell>
      <div className="border-l-4 border-[#d4940a] pl-4 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Policy Lab</p>
        <h1 className="text-2xl font-bold tracking-tight">Design Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {DATA.designs.toLocaleString()} combinations of income tax, VAT, LVT, carbon tax, prebate and
          financial transaction tax, each run through the fiscal engine and the household model. A design
          passes when net interest stays under 10% of federal revenue with debt falling as a share of GDP,
          and every household from the bottom 10% through the 70th–80th percentile is better off than
          under current law in income and net worth at Years 5, 10, 20 and 30.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MilestoneCard label="Designs tested" value={DATA.designs.toLocaleString()} sub={`Seeded sample, seed ${DATA.seed}`} />
        <MilestoneCard label="Pass, goal by Year 10" value={DATA.counts.pass10} sub={`${DATA.counts.fiscal10.toLocaleString()} meet the fiscal goal alone`} />
        <MilestoneCard label="Pass, goal by Year 15" value={DATA.counts.pass15} sub={`${DATA.counts.bottom80.toLocaleString()} keep the bottom 80% ahead alone`} />
        <MilestoneCard label="Robust to recessions" value={DATA.counts.robust} sub="Still pass after a severe recession or low growth" />
      </div>

      <ChartContainer
        title="Income and net-worth inequality at Year 30"
        subtitle="Each dot is one design. Lower is more equal on both axes. Select a colored dot to see its levers."
        source={`Gini coefficients across the 13 household groups, weighted by population. Current law: income ${DATA.currentLaw.incomeGiniY30.toFixed(3)}, net worth ${DATA.currentLaw.nwGiniY30.toFixed(3)}. Current Accord settings: ${DATA.currentDefault.incomeGiniY30.toFixed(3)} and ${DATA.currentDefault.nwGiniY30.toFixed(3)}.`}
        height={400}
        className="mt-0"
      >
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis type="number" dataKey="x" name="Income Gini" domain={['auto', 'auto']} {...CHART_AXIS}
                 tickFormatter={v => v.toFixed(2)}
                 label={{ value: 'Income Gini, Year 30', position: 'insideBottom', offset: -12, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="Net-worth Gini" domain={['auto', 'auto']} {...CHART_AXIS}
                 tickFormatter={v => v.toFixed(2)} width={48}
                 label={{ value: 'Net-worth Gini', angle: -90, position: 'insideLeft', fontSize: 11 }} />
          <ZAxis range={[14, 14]} />
          <ZAxis zAxisId="ref" range={[110, 110]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }}
                   formatter={v => (typeof v === 'number' ? v.toFixed(3) : v)}
                   labelFormatter={() => ''} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
          <Scatter name="Fails a condition" data={scatter.fail} fill={COLORS.fail} isAnimationActive={false} />
          <Scatter name="Passes, goal by Year 15" data={scatter.pass15} fill={COLORS.pass15} onClick={onPoint} isAnimationActive={false} />
          <Scatter name="Passes, goal by Year 10" data={scatter.pass10} fill={COLORS.pass10} onClick={onPoint} isAnimationActive={false} />
          <Scatter name="Robust to recessions" data={scatter.robust} fill={COLORS.robust} onClick={onPoint} isAnimationActive={false} />
          <Scatter name="Variants of design 1321" zAxisId="ref" data={VARIANTS.map(v => ({ x: v.incomeGiniY30, y: v.nwGiniY30, id: v.id }))}
                   fill={COLORS.variant} shape="star" onClick={onPoint} isAnimationActive={false} />
          <Scatter name="Current law" zAxisId="ref" data={[{ x: DATA.currentLaw.incomeGiniY30, y: DATA.currentLaw.nwGiniY30 }]}
                   fill={COLORS.law} shape="diamond" isAnimationActive={false} />
          <Scatter name="Current Accord settings" zAxisId="ref" data={[{ x: DATA.currentDefault.incomeGiniY30, y: DATA.currentDefault.nwGiniY30 }]}
                   fill={COLORS.accord} shape="diamond" isAnimationActive={false} />
          {selected && (
            <Scatter name={designName(selected)} zAxisId="ref" data={[{ x: selected.incomeGiniY30, y: selected.nwGiniY30, id: selected.id }]}
                     fill="none" stroke="#18181b" strokeWidth={2} shape="circle" legendType="none" isAnimationActive={false} />
          )}
        </ScatterChart>
      </ChartContainer>

      {selected && <DesignDetail d={selected} />}

      <Card className="mt-6">
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold mb-2">Variants of design 1321</h3>
          <div className="space-y-2">
            {VARIANTS.map(v => (
              <button key={v.id} onClick={() => setSelectedId(v.id)}
                      className={`block w-full text-left rounded-md border px-3 py-2 text-xs hover:bg-muted/50 ${v.id === selected?.id ? 'border-[#d4940a] bg-[#d4940a]/10' : 'border-border'}`}>
                <span className="font-semibold">{v.name}</span>
                <span className="text-muted-foreground"> · {v.note} Fiscal goal {yr(v.fiscalGoalYear)}; P80 income {usd(v.P80Y30)} at Year 30.</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <DesignCompare designs={ALL_DESIGNS}
                     ids={selected && !COMPARE_IDS.includes(selected.id) ? [...COMPARE_IDS, selected.id] : COMPARE_IDS} />

      <Card className="mt-6">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold">Passing designs ({rows.length})</h3>
            <PresetSelector presets={VIEWS} value={view} onChange={setView} />
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-muted-foreground">
            <span>Sort by</span>
            <PresetSelector presets={Object.entries(SORTS).map(([key, s]) => ({ key, label: s.label }))}
                            value={sortKey} onChange={setSortKey} />
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {['Design', 'Income tax', 'VAT / LVT', 'Carbon', 'Prebate', 'Goal', 'Income Gini', 'NW Gini', 'P70, Yr 30', 'P80, Yr 30'].map(h => (
                    <TableHead key={h} className={h === 'Income tax' ? 'whitespace-nowrap' : 'text-right whitespace-nowrap'}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(d => (
                  <TableRow key={d.id} onClick={() => setSelectedId(d.id)}
                            className={`cursor-pointer ${d.id === selected?.id ? 'bg-[#d4940a]/10' : ''}`}>
                    <TableCell className="text-right font-semibold">{d.id}{d.frontierRobust ? ' ★' : ''}</TableCell>
                    <TableCell className="text-[11px] min-w-[180px]">{bracketText(d.brackets)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{pct(d.vatRate)} / {pct(d.lvtRate)}</TableCell>
                    <TableCell className="text-right">${d.carbonRate}</TableCell>
                    <TableCell className="text-right">{money(d.prebate)}</TableCell>
                    <TableCell className="text-right">{yr(d.fiscalGoalYear)}</TableCell>
                    <TableCell className="text-right">{d.incomeGiniY30.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{d.nwGiniY30.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{usd(d.P70Y30)}</TableCell>
                    <TableCell className="text-right">{usd(d.P80Y30)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            ★ No other robust design is more equal on both Ginis. Gains are annual household income
            against current law, in 2024 dollars.
          </p>
        </CardContent>
      </Card>

      <InfoBox className="mt-6">
        <p className="font-semibold text-foreground mb-1">How the search works</p>
        <p>
          Each design draws its levers from these ranges: an income tax with two to four brackets
          (lowest rate 10–25%, top rate 40–60%, thresholds between $100K and $5M), a joint standard
          deduction of $30,000–$80,000 (half for single filers), VAT 0–15%, LVT 0–15% of land value a
          year, a carbon tax of $0–$190 a ton with 80% returned as a dividend, a prebate of
          $3,000–$10,000 a person indexed to CPI plus up to all of real GDP-per-person growth, and a
          financial transaction tax of 0–0.5%. Social Security's 12.4% contribution applies to all
          income above the cap, and gains are taxed at death and on gifts, in every design.
        </p>
        <p className="mt-2">
          Robust designs keep a margin of at least $1,000 on every household check and still pass after
          a severe recession in Year 5 (goal by Year 15), a severe recession in Year 12 (goal by Year 22),
          and the low growth case (goal by Year 20).
        </p>
        <p className="mt-2">
          Inequality is measured across 13 household groups, from the bottom 10% to the wealthiest
          individuals. Labor supply responds to marginal tax rates and transfers, so higher rates shrink
          the economy as well as raising revenue.
        </p>
      </InfoBox>
    </PageShell>
  );
}

const stress = (d, v) => (d.stressTested ? yr(v) : 'Not tested: margin under $1,000');

function DesignDetail({ d }) {
  const items = [
    ['Income tax', bracketText(d.brackets)],
    ['Standard deduction', `${money(d.exemptJoint)} joint, ${money(d.exemptJoint / 2)} single`],
    ['VAT', pct(d.vatRate)],
    ['LVT', `${pct(d.lvtRate)} of land value a year`],
    ['Carbon tax', `$${d.carbonRate} a ton, 80% returned as a dividend`],
    ['Prebate', `${money(d.prebate)} a person, ${indexLabel(d.prebateIndex)}`],
    ['Citizen grant floor', indexLabel(d.floorIndex)],
    ['Financial transaction tax', `${d.fttPct.toFixed(2)}% of each trade`],
  ];
  const outcomes = [
    ['Fiscal goal met', yr(d.fiscalGoalYear)],
    ['After a severe Year-5 recession', stress(d, d.goalRecession5)],
    ['After a severe Year-12 recession', stress(d, d.goalRecession12)],
    ['Low growth case', stress(d, d.goalLowGrowth)],
    ['Debt held by the public, Year 30', `${d.debtToGdpY30}% of GDP`],
    ['Net interest, Year 30', `${d.intToRevY30}% of revenue`],
    ['Labor supply effect on GDP, Year 10', pct(d.laborLevelY10 - 1)],
    ['Smallest bottom-80% income gain', `${usd(d.minIncomeGain)} (${d.worstIncome})`],
    ['Smallest bottom-80% net-worth gain', usd(d.minNwGain)],
  ];
  const gains = [['P50', d.P50Y30], ['P70', d.P70Y30], ['P80', d.P80Y30], ['T10', d.T10Y30]];
  return (
    <Card className="mt-6">
      <CardContent className="pt-4">
        <h3 className="text-sm font-semibold mb-3">
          {designName(d)}{d.robust ? ', robust to recessions' : ''}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <dl className="text-xs space-y-1.5">
            {items.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[150px_1fr] gap-2">
                <dt className="text-muted-foreground">{k}</dt><dd>{v}</dd>
              </div>
            ))}
          </dl>
          <dl className="text-xs space-y-1.5">
            {outcomes.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[200px_1fr] gap-2">
                <dt className="text-muted-foreground">{k}</dt><dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {gains.map(([k, v]) => (
            <MilestoneCard key={k} label={`${k} income, Year 30`} value={usd(v)} sub="vs current law" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
