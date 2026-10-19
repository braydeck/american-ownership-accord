// Design Search: the tax-and-transfer designs that meet the fiscal goal and leave the bottom 80%
// better off. Data comes from scripts/design-search.mjs (5,000 Latin hypercube designs, seed 42),
// written to src/data/design-search.json. Rerun the script after any engine change.
import React, { useEffect, useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ZAxis,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { PresetSelector } from '@/components/controls/PresetSelector';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { useUrlValue } from '@/lib/url-state';
import DATA from '@/data/design-search.json';
import CURVE from '@/data/curve-search.json';
import ZERO from '@/data/zero-curve-search.json';
import VARIANTS from '@/data/design-variants.json';
import { DesignCompare } from '@/pages/lab/DesignCompare';

// Every design the page can show: bracket designs, curve designs (ids from 10000), zero-start
// curves (ids from 20000; same seed, so design 10000 + i and 20000 + i share their other levers with
// bracket design i) and named variants
// (scripts/design-variants.mjs).
const ALL_DESIGNS = [...DATA.passing, ...CURVE.passing, ...ZERO.passing, ...VARIANTS];
const FAMILIES = [
  { key: 'both', label: 'All shapes' },
  { key: 'brackets', label: 'Brackets' },
  { key: 'curve', label: 'Curves' },
  { key: 'zero', label: 'Curves from zero' },
];
const familyData = f => (f === 'brackets' ? [DATA] : f === 'curve' ? [CURVE] : f === 'zero' ? [ZERO] : [DATA, CURVE, ZERO]);
const sumCounts = sets => Object.fromEntries(Object.keys(DATA.counts).map(k => [k, sets.reduce((a, x) => a + x.counts[k], 0)]));
const designName = d => d.name ?? `Design ${d.id}`;
// Designs compared by default: the two robust designs that keep P80 furthest ahead in Years 1-10
// while raising the bottom half most, and the refined variant of design 1321.
const COMPARE_IDS = ['14007-lvt10', '4148-opt', '13610-opt', '21877-opt'];

const COLORS = { variant: '#18181b', fail: '#d4d4d8', pass15: '#9cc3e8', pass10: '#2563C9', robust: '#d4940a', law: '#18181b', accord: '#c27040' };

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const usd = v => `${v < 0 ? '−' : '+'}$${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}K` : Math.round(Math.abs(v))}`;
const money = v => `$${Math.round(v).toLocaleString()}`;
const threshold = t => (t >= 1e6 ? `$${+(t / 1e6).toFixed(2)}M` : `$${Math.round(t / 1e3)}K`);
const yr = v => (v == null ? 'Never' : `Yr ${v}`);
const indexLabel = v => (v === 0 ? 'CPI only' : `CPI + ${v * 100}% of real GDP/person growth`);

function scheduleText(d) {
  if (d.zeroCurve) {
    const { zeroEnd, end, top, shape, baseRate = 0 } = d.zeroCurve;
    const pace = shape < 0.8 ? 'rising fastest near the start' : shape > 1.2 ? 'rising fastest near the end' : 'rising evenly';
    return `${pct(baseRate, 0)} to ${threshold(zeroEnd)} with no standard deduction, then a smooth rise to ${pct(top)} at ${threshold(end)} (${pace})`;
  }
  if (!d.curve) return bracketText(d.brackets);
  const { low, top, start, end, shape } = d.curve;
  const pace = shape < 0.8 ? 'rising fastest near the start' : shape > 1.2 ? 'rising fastest near the end' : 'rising evenly';
  return `${pct(low)} to ${threshold(start)}, then a smooth rise to ${pct(top)} at ${threshold(end)} (${pace})`;
}

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
  bottomHalf: { label: 'Bottom-half gain', dir: -1 },
  belowP80: { label: 'B10–P70 gain', dir: -1 },
  p80MinIncome: { label: 'P80 worst year', dir: -1 },
  fiscalGoalYear: { label: 'Goal year', dir: 1 },
};

// Summary measures the filters and table use, from each design's average income gain by group
// over Years 1-30 (gains: B10, P10, ... P80).
const avgOf = a => a.reduce((s, x) => s + x, 0) / a.length;
function measures(d) {
  const g = d.gains;
  return {
    bottomHalf: g ? avgOf(g.slice(0, 5)) : null,
    middle: g ? avgOf(g.slice(5, 8)) : null,
    belowP80: g ? avgOf(g.slice(0, 8)) : null,
    p80MinIncome: d.p80MinIncome ?? null,
    topRate: d.brackets[d.brackets.length - 1][1],
  };
}

// kind: 'min' keeps designs at or above the value, 'max' at or below, 'range' between the two.
const FILTERS = [
  { k: 'bottomHalf', label: 'Bottom half (B10–P40) gain', kind: 'min', min: 0, max: 25000, step: 250, fmt: v => usd(v) },
  { k: 'middle', label: 'P50–P70 gain', kind: 'min', min: 0, max: 30000, step: 250, fmt: v => usd(v) },
  { k: 'p80MinIncome', label: 'P80 income, worst year', kind: 'min', min: -15000, max: 10000, step: 250, fmt: v => usd(v) },
  { k: 'incomeGiniY30', label: 'Income Gini, Year 30', kind: 'max', min: 0.48, max: 0.66, step: 0.005, fmt: v => v.toFixed(3) },
  { k: 'nwGiniY30', label: 'Net-worth Gini, Year 30', kind: 'max', min: 0.60, max: 0.88, step: 0.005, fmt: v => v.toFixed(3) },
  { k: 'lvtRate', label: 'LVT', kind: 'range', min: 0, max: 0.15, step: 0.005, fmt: v => pct(v) },
  { k: 'vatRate', label: 'VAT', kind: 'range', min: 0, max: 0.15, step: 0.005, fmt: v => pct(v) },
  { k: 'prebate', label: 'Prebate per person', kind: 'range', min: 3000, max: 10000, step: 250, fmt: v => money(v) },
  { k: 'topRate', label: 'Top income tax rate', kind: 'range', min: 0.40, max: 0.62, step: 0.01, fmt: v => pct(v, 0) },
];
const filterDefaults = () => Object.fromEntries(FILTERS.map(f => [f.k,
  f.kind === 'range' ? [f.min, f.max] : f.kind === 'min' ? f.min : f.max]));
function passesFilters(d, filters, p80Recovers) {
  const m = { ...d, ...measures(d) };
  if (p80Recovers && !(d.p80NwMinFrom10 >= 0)) return false;
  return FILTERS.every(f => {
    const v = m[f.k], x = filters[f.k];
    const untouched = f.kind === 'range' ? x[0] === f.min && x[1] === f.max : x === (f.kind === 'min' ? f.min : f.max);
    if (v == null) return untouched;
    if (f.kind === 'min') return untouched || v >= x;
    if (f.kind === 'max') return untouched || v <= x;
    return v >= x[0] - 1e-9 && v <= x[1] + 1e-9;
  });
}

function inView(d, view) {
  if (view === 'robust') return d.robust;
  return d.fiscalGoalYear <= Number(view);
}

export default function DesignSearch() {
  const [view, setView] = useUrlValue('dsview', 'robust');
  const [sortKey, setSortKey] = useUrlValue('dssort', 'incomeGiniY30');
  const [family, setFamily] = useUrlValue('dsfam', 'both');
  const sets = familyData(family);
  const counts = sumCounts(sets);
  const tested = sets.reduce((a, x) => a + x.designs, 0);
  const defaultId = '14007-lvt10';
  const [selectedId, setSelectedId] = useState(defaultId);
  // Filters persist for this browser session so they survive reloads while reviewing.
  const [filters, setFilters] = useState(() => {
    try { return { ...filterDefaults(), ...JSON.parse(sessionStorage.getItem('dsFilters') ?? '{}') }; } catch { return filterDefaults(); }
  });
  const [p80Recovers, setP80Recovers] = useState(() => { try { return sessionStorage.getItem('dsP80Recovers') === '1'; } catch { return false; } });
  const [filtersOpen, setFiltersOpen] = useState(true);
  useEffect(() => { try { sessionStorage.setItem('dsFilters', JSON.stringify(filters)); sessionStorage.setItem('dsP80Recovers', p80Recovers ? '1' : '0'); } catch { /* storage unavailable */ } }, [filters, p80Recovers]);
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const activeFilters = FILTERS.filter(f => JSON.stringify(filters[f.k]) !== JSON.stringify(filterDefaults()[f.k])).length + (p80Recovers ? 1 : 0);
  const [compareIds, setCompareIds] = useState(COMPARE_IDS);
  const addCompare = id => setCompareIds(c => (c.includes(id) || c.length >= 5 ? c : [...c, id]));
  const removeCompare = id => setCompareIds(c => c.filter(x => x !== id));

  const scatter = useMemo(() => {
    const out = { fail: [], pass15: [], pass10: [], robust: [] };
    for (const set of familyData(family)) set.points.forEach(([x, y, s], i) => {
      const key = ['fail', 'pass15', 'pass10', 'robust'][s];
      out[key].push({ x, y, id: (set.idStart ?? 0) + i });
    });
    return out;
  }, [family]);

  const rows = useMemo(() => {
    const { dir } = SORTS[sortKey];
    const key = d => d[sortKey] ?? measures(d)[sortKey] ?? (dir > 0 ? Infinity : -Infinity);
    return [...familyData(family).flatMap(x => x.passing), ...VARIANTS]
      .filter(d => inView(d, view) && passesFilters(d, filters, p80Recovers))
      .sort((a, b) => dir * (key(a) - key(b)));
  }, [view, sortKey, family, filters, p80Recovers]);
  const matchIds = useMemo(() => new Set(rows.map(d => d.id)), [rows]);

  const selected = ALL_DESIGNS.find(d => d.id === selectedId) ?? rows[0];
  const onPoint = p => { if (p?.payload?.id != null && ALL_DESIGNS.some(d => d.id === p.payload.id)) setSelectedId(p.payload.id); };

  return (
    <PageShell>
      <div className="border-l-4 border-[#d4940a] pl-4 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Policy Lab</p>
        <h1 className="text-2xl font-bold tracking-tight">Design Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {(DATA.designs + CURVE.designs + ZERO.designs).toLocaleString()} combinations of income tax, VAT, LVT, carbon tax, prebate and
          financial transaction tax, each run through the fiscal engine and the household model. A design
          passes when net interest stays under 10% of federal revenue with debt falling as a share of GDP,
          and every household from the bottom 10% through the 70th–80th percentile is better off than
          under current law in income and net worth at Years 5, 10, 20 and 30.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-muted-foreground">
        <span>Income tax shape</span>
        <PresetSelector presets={FAMILIES} value={family} onChange={setFamily} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MilestoneCard label="Designs tested" value={tested.toLocaleString()} sub={`Seeded sample, seed ${DATA.seed}`} />
        <MilestoneCard label="Pass, goal by Year 10" value={counts.pass10} sub={`${counts.fiscal10.toLocaleString()} meet the fiscal goal alone`} />
        <MilestoneCard label="Pass, goal by Year 15" value={counts.pass15} sub={`${counts.bottom80.toLocaleString()} keep the bottom 80% ahead alone`} />
        <MilestoneCard label="Robust to recessions" value={counts.robust} sub="Still pass after a severe recession or low growth" />
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
          <Scatter name="Matches the filters below" data={[...scatter.pass15, ...scatter.pass10, ...scatter.robust].filter(p => matchIds.has(p.id))}
                   fill="none" stroke="#18181b" strokeWidth={1} onClick={onPoint} isAnimationActive={false} />
          <Scatter name="Named variants" zAxisId="ref" data={VARIANTS.map(v => ({ x: v.incomeGiniY30, y: v.nwGiniY30, id: v.id }))}
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

      {selected && <DesignDetail d={selected} compared={compareIds.includes(selected.id)}
                                 full={compareIds.length >= 5} onAdd={() => addCompare(selected.id)} />}

      <Card className="mt-6">
        <CardContent className="pt-4">
          <h3 className="text-sm font-semibold mb-2">Named variants</h3>
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

      <DesignCompare designs={ALL_DESIGNS} ids={compareIds} onRemove={removeCompare} />

      <Card className="mt-6">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold">Passing designs ({rows.length})</h3>
            <PresetSelector presets={VIEWS} value={view} onChange={setView} />
          </div>
          <div className="sticky top-14 z-20 -mx-4 px-4 py-2 mb-3 bg-card/95 backdrop-blur border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">Filters · {rows.length} designs match{activeFilters ? ` (${activeFilters} active)` : ''}
                <span className="font-normal text-muted-foreground"> · gains are each group's average annual income gain over Years 1–30</span></p>
              <div className="flex gap-3">
                <button className="text-[11px] underline text-muted-foreground" onClick={() => { setFilters(filterDefaults()); setP80Recovers(false); }}>Reset</button>
                <button className="text-[11px] underline text-muted-foreground" onClick={() => setFiltersOpen(o => !o)}>{filtersOpen ? 'Collapse' : 'Expand'}</button>
              </div>
            </div>
            {filtersOpen && <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mt-2">
              {FILTERS.map(f => {
                const v = filters[f.k];
                const text = f.kind === 'range' ? `${f.fmt(v[0])} to ${f.fmt(v[1])}` : `${f.kind === 'min' ? 'at least' : 'at most'} ${f.fmt(v)}`;
                return (
                  <div key={f.k}>
                    <p className="text-[11px] mb-1"><span className="font-medium">{f.label}</span> <span className="text-muted-foreground">{text}</span></p>
                    <Slider min={f.min} max={f.max} step={f.step} value={f.kind === 'range' ? v : [v]}
                            onValueChange={x => setFilter(f.k, f.kind === 'range' ? x : x[0])} />
                  </div>
                );
              })}
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={p80Recovers} onChange={e => setP80Recovers(e.target.checked)} />
                P80 net worth back to even by Year 10
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-muted-foreground">
              <span>Sort by</span>
              <PresetSelector presets={Object.entries(SORTS).map(([key, s]) => ({ key, label: s.label }))}
                              value={sortKey} onChange={setSortKey} />
            </div>
            </>}
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {['Design', 'Income tax', 'VAT / LVT', 'Carbon', 'Prebate', 'Goal', 'Income Gini', 'NW Gini', 'Bottom half', 'P50–P70', 'P80 worst yr'].map(h => (
                    <TableHead key={h} className={h === 'Income tax' ? 'whitespace-nowrap' : 'text-right whitespace-nowrap'}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(d => (
                  <TableRow key={d.id} onClick={() => setSelectedId(d.id)}
                            className={`cursor-pointer ${d.id === selected?.id ? 'bg-[#d4940a]/10' : ''}`}>
                    <TableCell className="text-right font-semibold whitespace-nowrap">{d.name ?? d.id}{d.frontierRobust ? ' ★' : ''}</TableCell>
                    <TableCell className="text-[11px] min-w-[180px]">{scheduleText(d)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{pct(d.vatRate)} / {pct(d.lvtRate)}</TableCell>
                    <TableCell className="text-right">${d.carbonRate}</TableCell>
                    <TableCell className="text-right">{money(d.prebate)}</TableCell>
                    <TableCell className="text-right">{yr(d.fiscalGoalYear)}</TableCell>
                    <TableCell className="text-right">{d.incomeGiniY30.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{d.nwGiniY30.toFixed(3)}</TableCell>
                    {(() => { const m = measures(d); return [m.bottomHalf, m.middle, m.p80MinIncome].map((v, i) => (
                      <TableCell key={i} className="text-right">{v == null ? '–' : usd(v)}</TableCell>)); })()}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            ★ No other robust design is more equal on both Ginis. Bottom half and P50–P70 are average
            annual household income gains over Years 1–30; P80 worst yr is P80's smallest income gain in
            any year. All against current law, in 2024 dollars.
          </p>
        </CardContent>
      </Card>

      <InfoBox className="mt-6">
        <p className="font-semibold text-foreground mb-1">How the search works</p>
        <p>
          Each design draws its levers from these ranges: an income tax with two to four brackets
          (lowest rate 10–25%, top rate 40–60%, thresholds between $100K and $5M) or a curve (the same
          lowest and top rates, with the marginal rate rising smoothly from a start income of
          $100K–$300K to an end income 1.5 to 10 times higher, in steps of a few points) or a curve from
          zero (no standard deduction: 0% up to $15K–$150K, then a smooth rise to a top rate of
          40–62%), a joint standard
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

function DesignDetail({ d, compared, full, onAdd }) {
  const items = [
    ['Income tax', scheduleText(d)],
    ['Standard deduction', d.zeroCurve ? 'None' : `${money(d.exemptJoint)} joint, ${money(d.exemptJoint / 2)} single`],
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold">
            {designName(d)}{d.robust ? ', robust to recessions' : ''}
          </h3>
          <button onClick={onAdd} disabled={compared || full}
                  className="text-xs rounded-md border border-border px-2.5 py-1 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-default">
            {compared ? 'In comparison' : full ? 'Comparison full (5)' : 'Add to comparison'}
          </button>
        </div>
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
