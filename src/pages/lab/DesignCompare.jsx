// Side-by-side household outcomes for chosen Design Search designs, by income group and year.
// Each design is rerun on the shared engine and household model (paramsFromDesign), so the
// numbers match Household Impact for the same settings.
import React, { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { scaleSymlog } from 'd3-scale';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { PresetSelector } from '@/components/controls/PresetSelector';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { useUrlValue } from '@/lib/url-state';
import { BASE_PARAMS } from '@/lib/fiscal-engine';
import { getInc, getNW, BASE_ONLY } from '@/lib/household-model';
import { DEMOS, DEMO_KEYS } from '@/lib/demographics';
import { paramsFromDesign, fxFromParams } from '@/lib/design-params';

const ALL = new Set(['BASE', 'TAX', 'PRE', 'AMCF', 'PSU_D', 'PSU_C']);
const HORIZON = 35;
const PALETTE = ['#9cc3e8', '#2563C9', '#0B3D91', '#d4940a', '#69C79B'];
const ACCORD_COLOR = '#c27040';

const fmtMoney = v => {
  const a = Math.abs(v);
  const s = a >= 1e12 ? `$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M`
    : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}K` : `$${Math.round(a)}`;
  return v < 0 ? `−${s}` : s;
};
const fmtDelta = v => (v >= 0 ? `+${fmtMoney(v)}` : fmtMoney(v));
const fmtPct = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1)}%`;

// Household income and net worth for every group in every year, for one parameter set.
function outcomes(fx, P) {
  const out = [];
  for (let y = 0; y <= HORIZON; y++) {
    const row = {};
    for (const k of DEMO_KEYS) row[k] = { inc: getInc(k, y, P, fx).total, nw: getNW(k, y, P, fx).total };
    out.push(row);
  }
  return out;
}

const NW_TICKS = [-75, -50, -25, 0, 25, 50, 100, 250, 500, 1000];

const GROUP_OPTIONS = DEMO_KEYS.map(k => ({ key: k, label: DEMOS[k].short }));

export function DesignCompare({ designs, ids, onRemove }) {
  const [year, setYear] = useUrlValue('dsyr', 10);
  const [table, setTable] = useUrlValue('dstab', 'inc');
  const [group, setGroup] = useUrlValue('dsgrp', 'P80');

  const series = useMemo(() => {
    const defaultFx = fxFromParams(BASE_PARAMS);
    const list = [
      { key: 'Current Accord settings', color: ACCORD_COLOR, fx: defaultFx },
      ...ids.map((id, i) => {
        const d = designs.find(x => x.id === id);
        return { id, key: d.name ?? `Design ${id}`, color: PALETTE[i % PALETTE.length], fx: fxFromParams(paramsFromDesign(d)) };
      }),
    ];
    return {
      law: outcomes(defaultFx, BASE_ONLY),
      list: list.map(s => ({ ...s, data: outcomes(s.fx, ALL) })),
    };
  }, [designs, ids.join(',')]);

  const y = Math.min(HORIZON, Math.max(1, year));
  const law = series.law[y];
  const chartRows = metric => DEMO_KEYS.map(k => {
    const r = { group: DEMOS[k].short, label: DEMOS[k].label };
    for (const s of series.list) {
      const base = law[k][metric];
      r[s.key] = base > 0 ? (s.data[y][k][metric] / base - 1) * 100 : null;
    }
    return r;
  });
  const incRows = chartRows('inc');
  const nwRows = chartRows('nw');
  const noBase = DEMO_KEYS.filter(k => law[k].nw <= 0).map(k => DEMOS[k].short);
  const metric = table === 'inc' ? 'inc' : 'nw';

  // Timeline for one group: dollar change against current law in every year.
  const timeline = metric => Array.from({ length: HORIZON }, (_, i) => {
    const yy = i + 1, r = { year: yy };
    for (const s of series.list) r[s.key] = s.data[yy][group][metric] - series.law[yy][group][metric];
    return r;
  });
  const incLine = timeline('inc'), nwLine = timeline('nw');
  const summary = series.list.map(s => {
    const vals = incLine.map(r => ({ year: r.year, v: r[s.key] }));
    const early = vals.slice(0, 10);
    const worst = vals.reduce((a, b) => (b.v < a.v ? b : a));
    const worstEarly = early.reduce((a, b) => (b.v < a.v ? b : a));
    const firstBehind = vals.find(x => x.v < 0)?.year ?? null;
    return { ...s, avgEarly: early.reduce((a, b) => a + b.v, 0) / 10, worstEarly, worst, firstBehind,
      nw10: nwLine[9][s.key], nw30: nwLine[29][s.key] };
  });
  const lines = series.list.map(s => (
    <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
  ));

  const tooltip = (
    <Tooltip formatter={(v, n) => [v == null ? 'n/a' : fmtPct(v), n]}
             labelFormatter={(g, p) => p?.[0]?.payload?.label ?? g} />
  );
  const bars = series.list.map(s => (
    <Bar key={s.key} dataKey={s.key} fill={s.color} isAnimationActive={false} />
  ));

  return (
    <Card className="mt-6">
      <CardContent className="pt-4">
        <h3 className="text-sm font-semibold">Compared designs</h3>
        <div className="flex flex-wrap gap-2 mt-2 mb-5">
          {series.list.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px]">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
              {s.key}
              {s.id != null && onRemove && (
                <button onClick={() => onRemove(s.id)} className="text-muted-foreground hover:text-foreground ml-0.5" aria-label={`Remove ${s.key}`}>×</button>
              )}
            </span>
          ))}
          <span className="text-[11px] text-muted-foreground self-center">Select any design above and use "Add to comparison" to add it.</span>
        </div>

        <h3 className="text-sm font-semibold">One group over time</h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Change against current law in every year from 1 to {HORIZON}, 2024 dollars.
        </p>
        <PresetSelector presets={GROUP_OPTIONS} value={group} onChange={setGroup} />
        <ChartContainer title={`${DEMOS[group].short} (${DEMOS[group].label}) income change vs current law`} height={280} className="mt-4">
          <LineChart data={incLine} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="year" {...CHART_AXIS} />
            <YAxis {...CHART_AXIS} tickFormatter={fmtMoney} width={64} />
            <ReferenceLine y={0} stroke="#71717a" />
            <Tooltip formatter={(v, n) => [fmtDelta(v), n]} labelFormatter={yy => `Year ${yy}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {lines}
          </LineChart>
        </ChartContainer>
        <ChartContainer title={`${DEMOS[group].short} net worth change vs current law`} height={280} className="mt-6">
          <LineChart data={nwLine} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="year" {...CHART_AXIS} />
            <YAxis {...CHART_AXIS} tickFormatter={fmtMoney} width={64} />
            <ReferenceLine y={0} stroke="#71717a" />
            <Tooltip formatter={(v, n) => [fmtDelta(v), n]} labelFormatter={yy => `Year ${yy}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {lines}
          </LineChart>
        </ChartContainer>
        <div className="rounded-lg border overflow-x-auto mt-4">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {['Design', 'Avg income, Yrs 1–10', 'Worst year, Yrs 1–10', `Worst year, Yrs 1–${HORIZON}`, 'First year behind', 'Net worth, Yr 10', 'Net worth, Yr 30'].map(h => (
                  <TableHead key={h} className={h === 'Design' ? 'whitespace-nowrap' : 'text-right whitespace-nowrap'}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.map(s => (
                <TableRow key={s.key}>
                  <TableCell className="text-xs whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: s.color }} />{s.key}
                  </TableCell>
                  <TableCell className="text-right text-xs">{fmtDelta(s.avgEarly)}</TableCell>
                  <TableCell className="text-right text-xs">{fmtDelta(s.worstEarly.v)} <span className="text-muted-foreground">(Yr {s.worstEarly.year})</span></TableCell>
                  <TableCell className="text-right text-xs">{fmtDelta(s.worst.v)} <span className="text-muted-foreground">(Yr {s.worst.year})</span></TableCell>
                  <TableCell className="text-right text-xs">{s.firstBehind == null ? 'Never' : `Yr ${s.firstBehind}`}</TableCell>
                  <TableCell className="text-right text-xs">{fmtDelta(s.nw10)}</TableCell>
                  <TableCell className="text-right text-xs">{fmtDelta(s.nw30)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <h3 className="text-sm font-semibold mt-10">Every group in one year</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Change against current law in the same year, for every group from the bottom 10% to the
          wealthiest individuals. Income is annual household income after taxes and transfers; net
          worth includes AMCF units, worker fund units and savings. 2024 dollars.
        </p>
        <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-card/95 backdrop-blur border-b border-border">
          <div className="max-w-md">
          <SliderControl
            label={`Year ${y} of the Accord`}
            value={y} onChange={setYear} min={1} max={HORIZON} step={1}
            helpText="Early years show the tax change before ownership builds up; later years include accumulated AMCF and worker fund wealth."
          />
          </div>
        </div>

        <ChartContainer
          title={`Income change vs current law, Year ${y}`}
          height={320}
          className="mt-4"
        >
          <BarChart data={incRows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="group" {...CHART_AXIS} interval={0} />
            <YAxis {...CHART_AXIS} tickFormatter={v => `${v}%`} width={48} />
            <ReferenceLine y={0} stroke="#71717a" />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {bars}
          </BarChart>
        </ChartContainer>

        <ChartContainer
          title={`Net worth change vs current law, Year ${y}`}
          subtitle="The scale compresses large changes so the bottom groups' gains and the top groups' losses fit on one chart."
          height={320}
          className="mt-8"
        >
          <BarChart data={nwRows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="group" {...CHART_AXIS} interval={0} />
            <YAxis {...CHART_AXIS} scale={scaleSymlog().constant(10)} type="number"
                   domain={[-100, 'auto']} ticks={NW_TICKS} tickFormatter={v => `${v}%`} width={52} />
            <ReferenceLine y={0} stroke="#71717a" />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {bars}
          </BarChart>
        </ChartContainer>

        {noBase.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {noBase.join(', ')} {noBase.length > 1 ? 'have' : 'has'} zero or negative net worth under current
            law in Year {y}, so the percentage change is not shown. The table below gives the dollar change.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mt-8 mb-3">
          <h4 className="text-sm font-semibold">Dollar change vs current law, Year {y}</h4>
          <PresetSelector presets={[{ key: 'inc', label: 'Income' }, { key: 'nw', label: 'Net worth' }]}
                          value={table} onChange={setTable} />
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Group</TableHead>
                <TableHead className="text-right whitespace-nowrap">Current law</TableHead>
                {series.list.map(s => (
                  <TableHead key={s.key} className="text-right whitespace-nowrap">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: s.color }} />
                    {s.key}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_KEYS.map(k => (
                <TableRow key={k}>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium text-xs">{DEMOS[k].short}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">{DEMOS[k].label}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs">{fmtMoney(law[k][metric])}</TableCell>
                  {series.list.map(s => {
                    const d = s.data[y][k][metric] - law[k][metric];
                    return (
                      <TableCell key={s.key} className={`text-right text-xs ${d < 0 ? 'text-[#c27040]' : 'text-[#307ca6]'}`}>
                        {fmtDelta(d)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
