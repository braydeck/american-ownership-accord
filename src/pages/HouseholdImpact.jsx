// simulation-10-dashboard.jsx
// American Ownership Accord — Household Impact
// 9-chart suite: income, wealth, inequality, tax rates, and crossover analysis over 30 years
// All values in 2024 real (inflation-adjusted) dollars

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, ComposedChart, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Cell
} from 'recharts';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { DemoChips } from '@/components/controls/DemoChips';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS, CHART_TOOLTIP_STYLE } from '@/lib/chart-config';
import { cn } from '@/lib/utils';
import { useUrlValue } from '@/lib/url-state';
import { DEMOS, DEMO_KEYS, POP } from '@/lib/demographics';
import { CARBON_DECARB_RATE } from '@/lib/fiscal-engine';
import { useFiscalParams } from '@/lib/use-fiscal-params';
import {
  BASE_ONLY, FISCAL_DEFAULTS, getInc, getNW, getETR, cashFlowPt, computeGini, amcfG,
} from '@/lib/household-model';
import { FiscalControls } from '@/components/controls/FiscalControls';

const YEARS      = Array.from({ length:31 }, (_, i) => i);
const SNAP_YEARS = [0, 1, 5, 10, 20, 30];

// Gini uses full distribution including billionaires — each weight is exact population share
// BILL: ~800 billionaires / 133M households ≈ 6e-6; ELON: 1 person / 133M households ≈ 7.5e-9
const GINI_INC_DEMOS = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];
const GINI_INC_WGTS  = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.09, 0.0094, 6e-6, 7.5e-9];
const GINI_NW_DEMOS  = ['B10','P10','P20','P30','P40','P50','P60','P70','P80','T10','T1','BILL','ELON'];
const GINI_NW_WGTS   = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.09, 0.0094, 6e-6, 7.5e-9];

const PROVS_CONFIG = [
  { key:'BASE',  label:'Current Law Baseline', color:'#64748b', fixed:true  },
  { key:'TAX',   label:'Tax Reform',            color:'#f97316', fixed:false },
  { key:'PRE',   label:'Prebate + Carbon Div',  color:'#307ca6', fixed:false },
  { key:'AMCF',  label:'AMCF Citizen Grants',   color:'#3b82f6', fixed:false },
  { key:'PSU_D', label:'Worker Dividends & Profit-Sharing', color:'#a855f7', fixed:false },
  { key:'PSU_C', label:'Worker & Sectoral Funds (Wealth)', color:'#f59e0b', fixed:false },
  { key:'LVT_EX',  label:'$500k Homeowner Exemption', color:'#14b8a6', fixed:false,
    tip:'Coupled, deficit-neutral swap: turning the exemption ON also reverts the prebate from $6,250 to $5,000/person. OFF (default) = no exemption + the higher redirected prebate.' },
];

// Stable default Sets for URL state (must be module-level so the hook default reference is stable).
const DEFAULT_PROVS = new Set(['BASE','TAX','PRE','AMCF','PSU_D','PSU_C']);
const DEFAULT_DEMOS = new Set(DEMO_KEYS);

const CHARTS = [
  { id:1,  label:'Income' },
  { id:2,  label:'Net Worth' },
  { id:3,  label:'Wealth Share' },
  { id:4,  label:'Income Share' },
  { id:5,  label:'Tax Rate' },
  { id:7,  label:'Wealth Mix' },
  { id:8,  label:'Cash Flow' },
  { id:9,  label:'Crossover' },
  { id:10, label:'Wealth Flow' },
];

// ╔═══════════════════════════════════════╗
// ║  UTILITIES                            ║
// ╚═══════════════════════════════════════╝

const fD = n => {
  if (n === null || n === undefined || isNaN(n)) return '$0';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e12) return `${s}$${(a/1e12).toFixed(1)}T`;
  if (a >= 1e9)  return `${s}$${(a/1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `${s}$${(a/1e6).toFixed(1)}M`;
  if (a >= 1e3)  return `${s}$${(a/1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

// ╔══════════════════════════════════════════════════════╗
// ║  SHARED CHART COMPONENTS                             ║
// ╚══════════════════════════════════════════════════════╝

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const TTip = ({ active, payload, label, fmt, isBar }) => {
  if (!active || !payload?.length) return null;
  const head = isBar ? payload[0]?.payload?.demo : `Year ${label}`;
  return (
    <div style={{ ...TOOLTIP_STYLE, maxWidth:280, zIndex:1000 }}>
      <div className="font-bold mb-1.5 text-zinc-100">{head}</div>
      {payload.slice(0, 12).map((p, i) => {
        const v = fmt ? fmt(p.value) : (typeof p.value === 'number' ? p.value.toFixed(3) : p.value);
        return (
          <div key={i} className="flex items-center gap-1.5 mb-0.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: p.fill || p.stroke }}/>
            <span className="text-zinc-300">{p.name}:</span>
            <b className="ml-auto pl-2">{v}</b>
          </div>
        );
      })}
    </div>
  );
};

// ╔══════════════════════════════════════════════════════╗
// ║  REUSABLE SNAPSHOT MATRIX TABLE                      ║
// ╚══════════════════════════════════════════════════════╝
// Renders a year × demographic matrix with an optional "vs Current Law" delta sub-table.
// deltaFmt(delta, clValue) → string. Defaults to dollar+pct; pass for pp-based charts.
function SnapshotTable({ title, demos, getValue, getCL, fmt, deltaFmt, note }) {
  // Year 0 is always the baseline — ignore provision toggles
  const getV = (k, y) => (y === 0 && getCL) ? getCL(k, y) : getValue(k, y);
  const dFmt = deltaFmt || ((d, clV) => {
    const pos = d >= 0;
    const pct = clV && Math.abs(clV) > 0 ? ` (${pos?'+':''}${(d/Math.abs(clV)*100).toFixed(1)}%)` : '';
    return `${pos?'+':''}${fmt(d)}${pct}`;
  });
  return (
    <div>
      <div className="text-sm font-bold text-foreground mb-1">{title}</div>
      {note && <div className="text-[11px] text-muted-foreground mb-1.5">{note}</div>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-left text-muted-foreground text-[11px] min-w-[50px]">Year</TableHead>
            {demos.map(k => (
              <TableHead key={k} className="text-right text-[11px] font-bold" style={{ color: DEMOS[k].color }}>
                {DEMOS[k].short}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SNAP_YEARS.map((y, i) => (
            <TableRow key={y} className={i % 2 ? 'bg-muted/30' : ''}>
              <TableCell className="text-left font-semibold text-muted-foreground text-[11px]">Yr {y}</TableCell>
              {demos.map(k => (
                <TableCell key={k} className="text-right text-[11px] text-foreground">{fmt(getV(k, y))}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {getCL && (
        <>
          <div className="text-[11px] font-semibold text-muted-foreground mt-3 mb-1">vs Current Law</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left text-muted-foreground text-[11px] min-w-[50px]">Year</TableHead>
                {demos.map(k => (
                  <TableHead key={k} className="text-right text-[11px] font-bold" style={{ color: DEMOS[k].color }}>
                    {DEMOS[k].short}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {SNAP_YEARS.map((y, i) => (
                <TableRow key={y} className={i % 2 ? 'bg-muted/30' : ''}>
                  <TableCell className="text-left font-semibold text-muted-foreground text-[11px]">Yr {y}</TableCell>
                  {demos.map(k => {
                    const v = getV(k, y), cl = getCL(k, y), d = v - cl;
                    return (
                      <TableCell key={k} className={cn(
                        'text-right text-[11px] font-semibold',
                        d >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]'
                      )}>
                        {dFmt(d, cl)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  COMPOSITION MATRIX TABLE                             ║
// ╚══════════════════════════════════════════════════════╝
// One section per demographic. Component rows × snapshot-year columns.
// Each numeric cell has a subtle data-bar background scaled to that row's max across years.
// Positive values → green bar + green text. Negative → red bar + red text.
// isTotal rows render bold with a heavier top border and no bar.
// isSep rows render as a visual divider with label text.
function CompositionTable({ title, demos, getRows, note }) {
  return (
    <div>
      <div className="text-sm font-bold text-foreground mb-3.5">{title}</div>
      {demos.map(k => {
        const d = DEMOS[k];
        const byYear = SNAP_YEARS.map(y => getRows(k, y));
        // Use the row set with the most entries as schema (Year 0 is BASE_ONLY and has fewer rows)
        const schema = byYear.reduce((a, b) => b.length > a.length ? b : a);
        const maxPerRow = schema.map((_, ri) =>
          Math.max(...byYear.map(yr => Math.abs(yr[ri]?.value ?? 0)), 1)
        );
        return (
          <div key={k} className="mb-4.5 overflow-x-auto">
            <div className="text-xs font-bold tracking-wide text-white px-3 py-1.5 rounded-t"
              style={{ backgroundColor: d.color }}>
              {d.label}
            </div>
            <table className="w-full border-collapse text-xs border border-border border-t-0">
              <thead>
                <tr>
                  <th className="text-left p-1.5 px-3 font-bold text-muted-foreground bg-muted/50 border-b border-border min-w-[180px] text-[11px]">Component</th>
                  {SNAP_YEARS.map(y => (
                    <th key={y} className="text-right p-1.5 px-2.5 font-bold text-muted-foreground bg-muted/50 border-b border-border whitespace-nowrap text-[11px]">Year {y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schema.map((row, ri) => {
                  if (row.isSep) return (
                    <tr key={ri}>
                      <td colSpan={6} className="px-3 py-0.5 bg-muted/50 text-[11px] text-muted-foreground italic border-y border-border">
                        {row.name}
                      </td>
                    </tr>
                  );
                  const isTotal = row.isTotal;
                  return (
                    <tr key={ri} className={cn(
                      isTotal ? 'bg-blue-50/50 font-bold border-t-2 border-t-zinc-300' : 'bg-white',
                    )}>
                      <td className={cn(
                        'p-1 px-3 border-b border-zinc-50 whitespace-nowrap text-[12px]',
                        isTotal ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {!isTotal && (
                          <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle"
                            style={{ background: row.fill }}/>
                        )}
                        <span className="align-middle">{row.name}</span>
                      </td>
                      {byYear.map((yr, yi) => {
                        const v = yr[ri]?.value ?? 0;
                        const pct = Math.min(Math.abs(v) / maxPerRow[ri] * 100, 100);
                        const isNeg = v < 0;
                        const barColor = isNeg ? 'rgba(194,112,64,0.10)' : 'rgba(48,124,166,0.10)';
                        const textColor = isTotal ? '#0f172a'
                          : isNeg ? '#c27040'
                          : v > 0 ? '#235f7f' : '#94a3b8';
                        return (
                          <td key={yi} className="p-1 px-2.5 text-right whitespace-nowrap tabular-nums"
                            style={{
                              color: textColor,
                              borderBottom: isTotal ? 'none' : '1px solid #f8fafc',
                              background: (!isTotal && v !== 0)
                                ? `linear-gradient(to right, ${barColor} ${pct}%, transparent ${pct}%)`
                                : 'transparent',
                            }}>
                            {fD(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {note && <div className="text-[11px] text-muted-foreground mt-1 italic">{note}</div>}
    </div>
  );
}

const noData = (
  <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
    Select at least one demographic to display
  </div>
);

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 1: AVERAGE ANNUAL INCOME                      ║
// ╚══════════════════════════════════════════════════════╝
function Chart1({ demos, P, mode, snYear, logScale, normalizedBar, fx }) {
  const lData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const r = { year: y };
    demos.forEach(k => { r[k] = getInc(k, y, Q, fx).total; });
    return r;
  }), [demos.join(','), [...P].sort().join(','), fx]);

  const bData = useMemo(() => demos.map(k => {
    const l = getInc(k, snYear, P, fx);
    return { demo:DEMOS[k].short, key:k, base:l.base, tax:l.tax, pre:l.pre, amcf:l.amcf, psuD:l.psuD, psuC:l.psuC };
  }), [demos.join(','), [...P].sort().join(','), snYear, fx]);

  if (!demos.length) return noData;
  const yAx = logScale ? { scale:'log', domain:[1,'auto'] } : {};

  if (mode === 'bar') {
    const normData = normalizedBar
      ? bData.map(d => { const g = Math.max(Math.abs(d.base), 1) / 100; return { ...d, base:d.base/g, tax:d.tax/g, pre:d.pre/g, amcf:d.amcf/g, psuD:d.psuD/g, psuC:d.psuC/g }; })
      : bData;
    const bFmt = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={normData} margin={{ top:20, right:20, bottom:10, left:90 }}>
          <CartesianGrid {...CHART_GRID}/>
          <XAxis dataKey="demo" tick={{ fill:'#475569', fontSize:12 }}/>
          <YAxis tickFormatter={bFmt} tick={CHART_AXIS.tick} width={85}/>
          <Tooltip content={<TTip fmt={bFmt} isBar/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <Bar dataKey="base" stackId="s" name="Current Law" fill="#94a3b8"/>
          {P.has('TAX') && <Bar dataKey="tax" stackId="s" name="Tax Reform">
            {normData.map((d, i) => <Cell key={i} fill={d.tax >= 0 ? '#a9cde0' : '#e3bda6'}/>)}
          </Bar>}
          {P.has('PRE')   && <Bar dataKey="pre"  stackId="s" name="Prebate+Carbon" fill="#307ca6"/>}
          {P.has('AMCF')  && <Bar dataKey="amcf" stackId="s" name="AMCF Grant"     fill="#3b82f6"/>}
          {P.has('PSU_D') && <Bar dataKey="psuD" stackId="s" name="Worker Dividends"   fill="#a855f7"/>}
          {P.has('PSU_C') && <Bar dataKey="psuC" stackId="s" name="Worker & Sectoral Funds"    fill="#f59e0b"/>}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lData} margin={{ top:20, right:20, bottom:20, left:90 }}>
        <CartesianGrid {...CHART_GRID}/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
        <YAxis tickFormatter={fD} tick={CHART_AXIS.tick} width={85} {...yAx}/>
        <Tooltip content={<TTip fmt={fD}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 2: AVERAGE NET WORTH                          ║
// ╚══════════════════════════════════════════════════════╝
function Chart2({ demos, P, mode, snYear, logScale, normalizedBar, fx }) {
  const lData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const r = { year: y };
    demos.forEach(k => { const t = getNW(k, y, Q, fx).total; r[k] = logScale ? Math.max(t, 1) : t; });
    return r;
  }), [demos.join(','), [...P].sort().join(','), logScale, fx]);

  const bData = useMemo(() => demos.map(k => {
    const l = getNW(k, snYear, P, fx);
    return {
      demo:DEMOS[k].short, key:k,
      base: Math.max(l.base, 0),
      tax:  l.tax,
      pre:  Math.max(l.pre, 0),
      amcf: Math.max(l.amcf, 0),
      psuD: Math.max(l.psuD, 0),
      psuC: Math.max(l.psuC, 0),
    };
  }), [demos.join(','), [...P].sort().join(','), snYear, fx]);

  if (!demos.length) return noData;
  const yAx = logScale ? { scale:'log', domain:[1,'auto'] } : {};

  if (mode === 'bar') {
    const normData = normalizedBar
      ? bData.map(d => { const g = Math.max(Math.abs(d.base), 1) / 100; return { ...d, base:d.base/g, tax:d.tax/g, pre:d.pre/g, amcf:d.amcf/g, psuD:d.psuD/g, psuC:d.psuC/g }; })
      : bData;
    const bFmt = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
    return (
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={normData} margin={{ top:20, right:20, bottom:10, left:90 }}>
          <CartesianGrid {...CHART_GRID}/>
          <XAxis dataKey="demo" tick={{ fill:'#475569', fontSize:12 }}/>
          <YAxis tickFormatter={bFmt} tick={CHART_AXIS.tick} width={85}/>
          <Tooltip content={<TTip fmt={bFmt} isBar/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <Bar dataKey="base" stackId="s" name="Current Law NW" fill="#94a3b8"/>
          {P.has('TAX') && <Bar dataKey="tax" stackId="s" name="Tax Impact">
            {normData.map((d, i) => <Cell key={i} fill={d.tax >= 0 ? '#a9cde0' : '#e3bda6'}/>)}
          </Bar>}
          {P.has('PRE')   && <Bar dataKey="pre"  stackId="s" name="Prebate Savings"  fill="#307ca6"/>}
          {P.has('AMCF')  && <Bar dataKey="amcf" stackId="s" name="AMCF Custodial"   fill="#3b82f6"/>}
          {P.has('PSU_D') && <Bar dataKey="psuD" stackId="s" name="Worker Dividend Savings"  fill="#a855f7"/>}
          {P.has('PSU_C') && <Bar dataKey="psuC" stackId="s" name="Worker & Sectoral Funds"     fill="#f59e0b"/>}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lData} margin={{ top:20, right:20, bottom:20, left:90 }}>
        <CartesianGrid {...CHART_GRID}/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
        <YAxis tickFormatter={fD} tick={CHART_AXIS.tick} width={85} {...yAx}/>
        <Tooltip content={<TTip fmt={fD}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 3: SHARE OF NATIONAL WEALTH                   ║
// ╚══════════════════════════════════════════════════════╝
// Shared stacked data builder: selected demos + "Other" remainder = always 100%.
// DEMO_KEYS order (B10→ELON) is bottom-to-top, so stacking order is automatic.
function buildShareData(demos, getVal) {
  return YEARS.map(y => {
    const vals = {}; let total = 0;
    DEMO_KEYS.forEach(k => { const v = Math.max(getVal(k, y), 0) * POP[k]; vals[k] = v; total += v; });
    const r = { year: y };
    let selectedSum = 0;
    demos.forEach(k => { r[k] = total > 0 ? vals[k] / total * 100 : 0; selectedSum += r[k]; });
    r._other = Math.max(0, 100 - selectedSum);
    return r;
  });
}

function Chart3({ demos, P, stacked, fx }) {
  const lineData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const vals = {}; let total = 0;
    DEMO_KEYS.forEach(k => { const v = Math.max(getNW(k, y, Q, fx).total, 0) * POP[k]; vals[k] = v; total += v; });
    const r = { year: y };
    demos.forEach(k => { r[k] = total > 0 ? vals[k] / total * 100 : 0; });
    return r;
  }), [demos.join(','), [...P].sort().join(','), fx]);

  const stackData = useMemo(() =>
    buildShareData(demos, (k, y) => getNW(k, y, y === 0 ? BASE_ONLY : P, fx).total),
  [demos.join(','), [...P].sort().join(',')]);

  if (!demos.length) return noData;

  if (stacked) {
    const hasOther = stackData[0]?._other > 0.1;
    return (
      <div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Stacked share of national wealth. &quot;Other&quot; (gray) = unselected demographics. Toggle demos freely — chart always sums to 100%.
          Note: Q2/Q3/Q4 each span two decile bands (data limitation; splitting would require fabricated values).
        </p>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={stackData} margin={{ top:10, right:20, bottom:20, left:60 }}>
            <CartesianGrid {...CHART_GRID}/>
            <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={CHART_AXIS.tick} width={55}/>
            <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
            <Legend wrapperStyle={{ fontSize:12 }}/>
            {demos.map(k => (
              <Area key={k} type="monotone" dataKey={k} name={DEMOS[k].label}
                stackId="s" stroke={DEMOS[k].color} fill={DEMOS[k].color} fillOpacity={0.75} dot={false}/>
            ))}
            {hasOther && (
              <Area type="monotone" dataKey="_other" name="Other (not selected)"
                stackId="s" stroke="#cbd5e1" fill="#e2e8f0" fillOpacity={0.6} dot={false}/>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lineData} margin={{ top:20, right:20, bottom:20, left:60 }}>
        <CartesianGrid {...CHART_GRID}/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
        <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={CHART_AXIS.tick} width={55}/>
        <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 4: SHARE OF NATIONAL INCOME                   ║
// ╚══════════════════════════════════════════════════════╝
function Chart4({ demos, P, stacked, fx }) {
  const lineData = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const vals = {}; let total = 0;
    DEMO_KEYS.forEach(k => { const v = Math.max(getInc(k, y, Q, fx).total, 0) * POP[k]; vals[k] = v; total += v; });
    const r = { year: y };
    demos.forEach(k => { r[k] = total > 0 ? vals[k] / total * 100 : 0; });
    return r;
  }), [demos.join(','), [...P].sort().join(','), fx]);

  const stackData = useMemo(() =>
    buildShareData(demos, (k, y) => getInc(k, y, y === 0 ? BASE_ONLY : P, fx).total),
  [demos.join(','), [...P].sort().join(',')]);

  if (!demos.length) return noData;

  if (stacked) {
    const hasOther = stackData[0]?._other > 0.1;
    return (
      <div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Stacked share of national income. &quot;Other&quot; (gray) = unselected demographics. Toggle demos freely — chart always sums to 100%.
          Note: Q2/Q3/Q4 each span two decile bands (data limitation; splitting would require fabricated values).
        </p>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={stackData} margin={{ top:10, right:20, bottom:20, left:60 }}>
            <CartesianGrid {...CHART_GRID}/>
            <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={CHART_AXIS.tick} width={55}/>
            <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
            <Legend wrapperStyle={{ fontSize:12 }}/>
            {demos.map(k => (
              <Area key={k} type="monotone" dataKey={k} name={DEMOS[k].label}
                stackId="s" stroke={DEMOS[k].color} fill={DEMOS[k].color} fillOpacity={0.75} dot={false}/>
            ))}
            {hasOther && (
              <Area type="monotone" dataKey="_other" name="Other (not selected)"
                stackId="s" stroke="#cbd5e1" fill="#e2e8f0" fillOpacity={0.6} dot={false}/>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={380}>
      <LineChart data={lineData} margin={{ top:20, right:20, bottom:20, left:60 }}>
        <CartesianGrid {...CHART_GRID}/>
        <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
        <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={CHART_AXIS.tick} width={55}/>
        <Tooltip content={<TTip fmt={v => `${v.toFixed(2)}%`}/>}/>
        <Legend wrapperStyle={{ fontSize:12 }}/>
        {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
          dot={false} strokeWidth={2.5}/>)}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 5: EFFECTIVE TAX RATE                         ║
// ╚══════════════════════════════════════════════════════╝
function Chart5({ demos, P, fx }) {
  const data = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const r = { year: y };
    demos.forEach(k => { r[k] = parseFloat(getETR(k, y, Q, fx).toFixed(2)); });
    return r;
  }), [demos.join(','), [...P].sort().join(','), fx]);

  if (!demos.length) return noData;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        ETR = taxes paid minus universal prebate/carbon offset / gross income. Negative = prebate exceeds taxes.
        T10/T1/BILL/ELON use explicit ETR anchors calibrated from Accord statutory rates (Day 1 reform applies
        immediately) growing as avoidance channels close. Lower brackets use the net income-tax reform delta.
        AMCF grants and worker-equity income are excluded — those are ownership returns shown in Chart 1.
      </p>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top:10, right:20, bottom:20, left:60 }}>
          <CartesianGrid {...CHART_GRID}/>
          <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
          <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={CHART_AXIS.tick} width={55}/>
          <Tooltip content={<TTip fmt={v => `${v.toFixed(1)}%`}/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" label={{ value:'0%', position:'right', fontSize:11 }}/>
          {demos.map(k => <Line key={k} dataKey={k} name={DEMOS[k].label} stroke={DEMOS[k].color}
            dot={false} strokeWidth={2.5}/>)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 6: GINI COEFFICIENT                           ║
// ╚══════════════════════════════════════════════════════╝
// Empirical US baselines (BLS/Fed SCF 2022). Anchor shifts computed Gini to match
// real year-0 starting levels so chart shows correct baseline + policy deviations.
const US_GINI_INC = 0.490;
const US_GINI_NW  = 0.850;
const _gAnchor = (() => {
  const ip = GINI_INC_DEMOS.map((k, i) => ({ v: Math.max(getInc(k, 0, BASE_ONLY).total, 0), w: GINI_INC_WGTS[i] }));
  const np = GINI_NW_DEMOS.map((k,  i) => ({ v: Math.max(getNW(k,  0, BASE_ONLY).total, 0), w: GINI_NW_WGTS[i]  }));
  return { inc: US_GINI_INC - computeGini(ip), nw: US_GINI_NW - computeGini(np) };
})();

// Country comparison Gini data (OECD/World Bank, post-tax post-transfer, latest available)
const GINI_COMPARISONS = {
  income: [
    { key: 'us',   label: 'US Baseline',    value: 0.490, color: '#94a3b8' },
    { key: 'oecd', label: 'OECD Average',   value: 0.315, color: '#307ca6' },
    { key: 'gb',   label: 'Great Britain',   value: 0.350, color: '#8b5cf6' },
    { key: 'au',   label: 'Australia',       value: 0.320, color: '#f59e0b' },
    { key: 'dk',   label: 'Denmark',          value: 0.280, color: '#06b6d4' },
    { key: 'de',   label: 'Germany',         value: 0.296, color: '#3b82f6' },
  ],
  wealth: [
    { key: 'us',   label: 'US Baseline',    value: 0.850, color: '#94a3b8' },
    { key: 'oecd', label: 'OECD Average',   value: 0.740, color: '#307ca6' },
    { key: 'gb',   label: 'Great Britain',   value: 0.710, color: '#8b5cf6' },
    { key: 'au',   label: 'Australia',       value: 0.650, color: '#f59e0b' },
    { key: 'dk',   label: 'Denmark',         value: 0.840, color: '#06b6d4' },
    { key: 'de',   label: 'Germany',         value: 0.780, color: '#3b82f6' },
  ],
};

function Chart6({ P, fx }) {
  const [showCountries, setShowCountries] = useState({ us: true, oecd: true, gb: false, au: false, dk: false, de: false });
  const data = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? BASE_ONLY : P;
    const incPts = GINI_INC_DEMOS.map((k, i) => ({
      v: Math.max(getInc(k, y, Q, fx).total, 0), w: GINI_INC_WGTS[i]
    }));
    const nwPts = GINI_NW_DEMOS.map((k, i) => ({
      v: Math.max(getNW(k, y, Q, fx).total, 0), w: GINI_NW_WGTS[i]
    }));
    return {
      year: y,
      incomeGini: parseFloat(Math.max(0, Math.min(0.99, computeGini(incPts) + _gAnchor.inc)).toFixed(3)),
      wealthGini: parseFloat(Math.max(0, Math.min(0.99, computeGini(nwPts)  + _gAnchor.nw )).toFixed(3)),
    };
  }), [[...P].sort().join(','), fx]);

  const refLines = (type) => GINI_COMPARISONS[type]
    .filter(c => showCountries[c.key])
    .map(c => <ReferenceLine key={c.key} y={c.value} stroke={c.color} strokeDasharray="3 3"
      label={{ value: `${c.label} (${c.value.toFixed(2)})`, position: 'right', fontSize: 10, fill: c.color }} />);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">
        0 = perfect equality, 1 = perfect inequality. Anchored to empirical US baselines (BLS/SCF 2022).
        Provision toggles show each mechanism's contribution to inequality reduction.
      </p>
      <div className="flex gap-1.5 flex-wrap mb-3 items-center">
        <span className="text-[11px] text-muted-foreground font-semibold">Compare:</span>
        {GINI_COMPARISONS.income.map(c => (
          <Button key={c.key} variant={showCountries[c.key] ? 'outline' : 'ghost'} size="xs"
            onClick={() => setShowCountries(s => ({ ...s, [c.key]: !s[c.key] }))}
            className={cn('text-[11px]', showCountries[c.key] ? 'font-semibold' : 'opacity-60')}
            style={showCountries[c.key] ? { borderColor: c.color, color: c.color, background: `${c.color}15` } : undefined}>
            {c.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-bold text-foreground mb-1">Income Gini</div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top:10, right:80, bottom:20, left:10 }}>
              <CartesianGrid {...CHART_GRID}/>
              <XAxis dataKey="year" tick={{ fill:'#475569', fontSize:10 }}/>
              <YAxis domain={[0.20, 0.55]} tickFormatter={v => v.toFixed(2)} tick={{ fill:'#475569', fontSize:10 }} width={40}/>
              <Tooltip content={<TTip fmt={v => v.toFixed(3)}/>}/>
              {refLines('income')}
              <Line dataKey="incomeGini" name="US Accord" stroke="#0f172a" dot={false} strokeWidth={2.5}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div className="text-sm font-bold text-foreground mb-1">Wealth Gini</div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top:10, right:80, bottom:20, left:10 }}>
              <CartesianGrid {...CHART_GRID}/>
              <XAxis dataKey="year" tick={{ fill:'#475569', fontSize:10 }}/>
              <YAxis domain={[0.60, 0.90]} tickFormatter={v => v.toFixed(2)} tick={{ fill:'#475569', fontSize:10 }} width={40}/>
              <Tooltip content={<TTip fmt={v => v.toFixed(3)}/>}/>
              {refLines('wealth')}
              <Line dataKey="wealthGini" name="US Accord" stroke="#c27040" dot={false} strokeWidth={2.5}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 7: WEALTH COMPOSITION BREAKDOWN               ║
// ╚══════════════════════════════════════════════════════╝
function Chart7({ demos, P, snYear, normalizedBar, fx }) {
  const data = useMemo(() => demos.map(k => {
    const d = DEMOS[k];
    const l = getNW(k, snYear, P, fx);
    const b = Math.max(l.base, 0);
    const other = Math.max(0, b * (1 - d.homePct - d.k401Pct - d.finPct - d.bizPct));
    return {
      demo: d.short, key: k,
      homeEquity:  b * d.homePct,
      k401k:       b * d.k401Pct,
      financial:   b * d.finPct,
      business:    b * d.bizPct,
      other,
      amcf:  P.has('AMCF')  ? Math.max(l.amcf, 0) : 0,
      psuD:  P.has('PSU_D') ? Math.max(l.psuD, 0) : 0,
      psuC:  P.has('PSU_C') ? Math.max(l.psuC, 0) : 0,
    };
  }), [demos.join(','), [...P].sort().join(','), snYear, fx]);

  if (!demos.length) return noData;

  const normData = normalizedBar
    ? data.map(d => {
        const tot = Math.max(d.homeEquity + d.k401k + d.financial + d.business + d.other + d.amcf + d.psuD + d.psuC, 1) / 100;
        return { ...d, homeEquity:d.homeEquity/tot, k401k:d.k401k/tot, financial:d.financial/tot, business:d.business/tot, other:d.other/tot, amcf:d.amcf/tot, psuD:d.psuD/tot, psuC:d.psuC/tot };
      })
    : data;
  const bFmt = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Components of household wealth at Year {snYear}. AMCF, worker dividends, and Worker Fund units appear
        only when those provisions are active. Lower brackets shift from financial assets toward
        AMCF and worker fund units over time.{normalizedBar ? ' Normalized to 100% of total NW.' : ''}
      </p>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={normData} margin={{ top:10, right:20, bottom:10, left:90 }}>
          <CartesianGrid {...CHART_GRID}/>
          <XAxis dataKey="demo" tick={{ fill:'#475569', fontSize:12 }}/>
          <YAxis tickFormatter={bFmt} tick={CHART_AXIS.tick} width={85}/>
          <Tooltip content={<TTip fmt={bFmt} isBar/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          <Bar dataKey="homeEquity" stackId="s" name="Home Equity"    fill="#f97316"/>
          <Bar dataKey="k401k"      stackId="s" name="401K/Savings"   fill="#eab308"/>
          <Bar dataKey="financial"  stackId="s" name="Financial"      fill="#3b82f6"/>
          <Bar dataKey="business"   stackId="s" name="Business Equity" fill="#8b5cf6"/>
          <Bar dataKey="other"      stackId="s" name="Other"          fill="#94a3b8"/>
          {P.has('AMCF')  && <Bar dataKey="amcf" stackId="s" name="AMCF Custodial"  fill="#3b82f6" fillOpacity={0.6}/>}
          {P.has('PSU_D') && <Bar dataKey="psuD" stackId="s" name="Worker Dividend Savings" fill="#a855f7"/>}
          {P.has('PSU_C') && <Bar dataKey="psuC" stackId="s" name="Worker & Sectoral Funds"    fill="#f59e0b"/>}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 8: CASH FLOW DIVERGING BAR                    ║
// ╚══════════════════════════════════════════════════════╝

const CF_BARS = [
  { key:'grossInc', name:'Gross Income',       fill:'#94a3b8', prov:null   },
  { key:'clTax',    name:'Income+Payroll Tax',  fill:'#c27040', prov:null   },
  { key:'taxRef',   name:'Tax Reform Net',      fill:'#f97316', prov:'TAX'  },
  { key:'vat',      name:'VAT Burden',          fill:'#e3bda6', prov:'TAX'  },
  { key:'lvt',      name:'LVT Burden',          fill:'#fdba74', prov:'TAX'  },
  { key:'carb',     name:'Carbon Burden',       fill:'#fcd34d', prov:'TAX'  },
  { key:'payFix',   name:'SS Above Cap',         fill:'#d97706', prov:'TAX'  },
  { key:'assigned', name:'Business Land & Rent Taxes', fill:'#b45309', prov:'TAX' },
  { key:'progLost', name:'Programs Replaced',    fill:'#9a5530', prov:'PRE'  },
  { key:'pre',      name:'Prebate',             fill:'#307ca6', prov:'PRE'  },
  { key:'cdiv',     name:'Carbon Dividend',     fill:'#a9cde0', prov:'PRE'  },
  { key:'ag',       name:'AMCF Liquidation',    fill:'#60a5fa', prov:'AMCF' },
  { key:'pd',       name:'Worker Dividends',       fill:'#c084fc', prov:'PSU_D'},
  { key:'pc',       name:'Worker & Sectoral Funds',        fill:'#fbbf24', prov:'PSU_C'},
  { key:'psuTax',   name:'Tax on Worker & AMCF Income', fill:'#7c2d12', prov:['PSU_D','PSU_C','AMCF']},
];
const provActive = (b, P) => !b.prov || [].concat(b.prov).some(x => P.has(x));

function Chart8({ demos, P, snYear, view, normalizedBar, fx }) {
  const timeData = useMemo(() => {
    const k = demos[0]; if (!k) return [];
    return YEARS.map(y => ({ year:y, ...cashFlowPt(k, y, y === 0 ? BASE_ONLY : P, normalizedBar, fx) }));
  }, [demos[0], [...P].sort().join(','), normalizedBar, fx]);

  const demosData = useMemo(() =>
    demos.map(k => ({ demo:DEMOS[k].short, ...cashFlowPt(k, snYear, P, normalizedBar, fx) })),
  [demos.join(','), [...P].sort().join(','), snYear, normalizedBar]);

  if (!demos.length) return noData;
  const data = view === 'time' ? timeData : demosData;
  const xKey = view === 'time' ? 'year' : 'demo';
  const fmt  = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
  const activeBars = CF_BARS.filter(b => provActive(b, P));
  const demoLabel = demos[0] ? DEMOS[demos[0]].label : '—';

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        {view === 'time'
          ? `${demoLabel} — cash flow components over 30 years.`
          : `All selected demographics — cash flow at Year ${snYear}.`}
        {' '}Positive bars = income & benefits. Negative bars = tax burdens. Line = net disposable
        {normalizedBar ? ' (% of gross income).' : '.'}
      </p>
      <ResponsiveContainer width="100%" height={390}>
        <ComposedChart data={data} margin={{ top:20, right:24, bottom: view==='demos' ? 10 : 30, left:90 }}>
          <CartesianGrid {...CHART_GRID}/>
          <XAxis dataKey={xKey} tick={CHART_AXIS.tick}
            label={view==='time' ? { value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 } : undefined}/>
          <YAxis tickFormatter={fmt} tick={CHART_AXIS.tick} width={85}/>
          <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5}/>
          <Tooltip content={<TTip fmt={fmt} isBar={view==='demos'}/>}/>
          <Legend wrapperStyle={{ fontSize:11 }}/>
          {activeBars.map(b => (
            <Bar key={b.key} dataKey={b.key} name={b.name} stackId="cf" fill={b.fill} fillOpacity={0.85} radius={0}/>
          ))}
          <Line type="monotone" dataKey="net" name="Net Disposable" stroke="#0f172a"
            strokeWidth={2.5} dot={false} legendType="line"/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 10: WEALTH FLOW DIVERGING BAR                 ║
// ╚══════════════════════════════════════════════════════╝

function wealthFlowPt(k, y, P, norm, fx = FISCAL_DEFAULTS) {
  const l = getNW(k, y, P, fx);
  const clNW = getNW(k, y, BASE_ONLY, fx).total;
  // Normalized: CL NW = 100% reference. base bar always anchors at 100%.
  // Tax impact absorbs both the explicit burden AND the Growth Tax compounding drag
  // (accordNWG < nwG), so high-wealth demos see a larger negative tax bar.
  // Floor prevents division by near-zero for negative-NW brackets in transition years.
  const div  = norm ? Math.max(clNW, DEMOS[k].income * 0.25, 1) / 100 : 1;
  const base = norm ? clNW : l.base;
  const tax  = norm ? (l.base - clNW + l.tax) : l.tax;  // compounding delta + explicit burden
  return { base:base/div, tax:tax/div, pre:l.pre/div, amcf:l.amcf/div,
    psuD:l.psuD/div, psuC:l.psuC/div, net:l.total/div };
}

const WF_BARS = [
  { key:'base', name:'Base NW (CL)',     fill:'#94a3b8', prov:null    },
  { key:'tax',  name:'Tax Impact',       fill:'#f97316', prov:'TAX'   },
  { key:'pre',  name:'Prebate Savings',  fill:'#307ca6', prov:'PRE'   },
  { key:'amcf', name:'AMCF Custodial',   fill:'#60a5fa', prov:'AMCF'  },
  { key:'psuD', name:'Worker Dividend Savings',  fill:'#c084fc', prov:'PSU_D' },
  { key:'psuC', name:'Worker & Sectoral Funds',     fill:'#fbbf24', prov:'PSU_C' },
];

// ── Row builders for CompositionTable ────────────────────────────────────────
// Each returns an array of { name, value, fill, isTotal? } for a given (demo, year, provisions).
// Row order is stable across years (same P ⇒ same schema), enabling year-column layout.

function wealthMixRows(k, y, P, fx = FISCAL_DEFAULTS) {
  const d = DEMOS[k];
  const l = getNW(k, y, P, fx);
  const b = Math.max(l.base, 0);
  const rows = [
    { name:'Home Equity',  value: b * d.homePct, fill:'#f97316' },
    { name:'401(k)',       value: b * d.k401Pct, fill:'#eab308' },
    { name:'Financial',   value: b * d.finPct,  fill:'#3b82f6' },
    { name:'Business',    value: b * d.bizPct,  fill:'#8b5cf6' },
    { name:'Other',       value: Math.max(0, b*(1-d.homePct-d.k401Pct-d.finPct-d.bizPct)), fill:'#94a3b8' },
  ];
  if (P.has('AMCF'))  rows.push({ name:'AMCF Units',    value: Math.max(l.amcf, 0), fill:'#60a5fa' });
  if (P.has('PSU_D')) rows.push({ name:'Worker Dividends', value: Math.max(l.psuD, 0), fill:'#a855f7' });
  if (P.has('PSU_C')) rows.push({ name:'Worker & Sectoral Funds',  value: Math.max(l.psuC, 0), fill:'#f59e0b' });
  rows.push({ name:'── TOTAL NET WORTH ──', value: l.total, fill:'', isTotal:true });
  return rows;
}

function cfRows(k, y, P, fx = FISCAL_DEFAULTS) {
  const pt = cashFlowPt(k, y, P, false, fx);
  const rows = [
    { name:'Gross Income',       value: pt.grossInc,  fill:'#94a3b8' },
    { name:'Income/Payroll Tax', value: pt.clTax,     fill:'#c27040' },
  ];
  if (P.has('TAX')) {
    rows.push({ name:'Tax Reform Net',  value: pt.taxRef, fill:'#f97316' });
    rows.push({ name:'VAT Burden',      value: pt.vat,    fill:'#e3bda6' });
    rows.push({ name:'LVT Burden',      value: pt.lvt,    fill:'#fdba74' });
    rows.push({ name:'Carbon Burden',   value: pt.carb,   fill:'#fcd34d' });
    rows.push({ name:'SS Above Cap',     value: pt.payFix, fill:'#d97706' });
    rows.push({ name:'Business Land & Rent Taxes', value: pt.assigned, fill:'#b45309' });
  }
  if (P.has('PRE')) {
    rows.push({ name:'Programs Replaced', value: pt.progLost, fill:'#9a5530' });
    rows.push({ name:'Prebate',           value: pt.pre,      fill:'#307ca6' });
    rows.push({ name:'Carbon Dividend',   value: pt.cdiv,     fill:'#a9cde0' });
  }
  if (P.has('AMCF'))  rows.push({ name:'AMCF Liquidation', value: pt.ag, fill:'#60a5fa' });
  if (P.has('PSU_D')) rows.push({ name:'Worker Dividends',    value: pt.pd, fill:'#c084fc' });
  if (P.has('PSU_C')) rows.push({ name:'Worker & Sectoral Funds',     value: pt.pc, fill:'#fbbf24' });
  if (P.has('PSU_D') || P.has('PSU_C') || P.has('AMCF')) rows.push({ name:'Tax on Worker & AMCF Income', value: pt.psuTax, fill:'#7c2d12' });
  rows.push({ name:'── NET DISPOSABLE ──', value: pt.net, fill:'', isTotal:true });
  return rows;
}

function wfRows(k, y, P, fx = FISCAL_DEFAULTS) {
  const l   = getNW(k, y, P, fx);
  const clNW = getNW(k, y, BASE_ONLY, fx).total;
  const rows = [
    { name:'Base NW (Current Law)', value: clNW,  fill:'#94a3b8' },
  ];
  if (P.has('TAX'))   rows.push({ name:'Tax Impact',       value: l.tax,  fill:'#f97316' });
  if (P.has('PRE'))   rows.push({ name:'Prebate Savings',  value: l.pre,  fill:'#307ca6' });
  if (P.has('AMCF'))  rows.push({ name:'AMCF Custodial',  value: l.amcf, fill:'#60a5fa' });
  if (P.has('PSU_D')) rows.push({ name:'Worker Dividend Savings',  value: l.psuD, fill:'#c084fc' });
  if (P.has('PSU_C')) rows.push({ name:'Worker & Sectoral Funds',     value: l.psuC, fill:'#fbbf24' });
  rows.push({ name:'── TOTAL NET WORTH ──', value: l.total, fill:'', isTotal:true });
  return rows;
}

function Chart10({ demos, P, snYear, view, normalizedBar, logScale, fx }) {
  const timeData = useMemo(() => {
    const k = demos[0]; if (!k) return [];
    return YEARS.map(y => ({ year:y, ...wealthFlowPt(k, y, y === 0 ? BASE_ONLY : P, normalizedBar, fx) }));
  }, [demos[0], [...P].sort().join(','), normalizedBar, fx]);

  const demosData = useMemo(() =>
    demos.map(k => ({ demo:DEMOS[k].short, ...wealthFlowPt(k, snYear, P, normalizedBar, fx) })),
  [demos.join(','), [...P].sort().join(','), snYear, normalizedBar]);

  if (!demos.length) return noData;
  const data = view === 'time' ? timeData : demosData;
  const xKey = view === 'time' ? 'year' : 'demo';
  const fmt  = normalizedBar ? (v => `${v.toFixed(1)}%`) : fD;
  const activeBars = WF_BARS.filter(b => !b.prov || P.has(b.prov));
  const demoLabel  = demos[0] ? DEMOS[demos[0]].label : '—';
  const yAxProps   = logScale && !normalizedBar ? { scale:'log', domain:[1,'auto'] } : {};

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        {view === 'time'
          ? `${demoLabel} — wealth accumulation components over 30 years.`
          : `All selected demographics — wealth flow at Year ${snYear}.`}
        {' '}Positive = wealth gains. Negative = tax drag. Line = net worth total.
        {normalizedBar ? ' Normalized to current-law NW at each year = 100%. Net line above 100% = richer than CL path; below = less wealthy than CL.' : ''}
      </p>
      <ResponsiveContainer width="100%" height={390}>
        <ComposedChart data={data} margin={{ top:20, right:24, bottom: view==='demos' ? 10 : 30, left:90 }}>
          <CartesianGrid {...CHART_GRID}/>
          <XAxis dataKey={xKey} tick={CHART_AXIS.tick}
            label={view==='time' ? { value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 } : undefined}/>
          <YAxis tickFormatter={fmt} tick={CHART_AXIS.tick} width={85} {...yAxProps}/>
          <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5}/>
          <Tooltip content={<TTip fmt={fmt} isBar={view==='demos'}/>}/>
          <Legend wrapperStyle={{ fontSize:11 }}/>
          {activeBars.map(b => (
            <Bar key={b.key} dataKey={b.key} name={b.name} stackId="wf" fill={b.fill} fillOpacity={0.85} radius={0}/>
          ))}
          <Line type="monotone" dataKey="net" name="Net Worth" stroke="#0f172a"
            strokeWidth={2.5} dot={false} legendType="line"/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  CHART 9: CROSSOVER MOMENT                           ║
// ╚══════════════════════════════════════════════════════╝
function Chart9({ demos, P, logScale, fx }) {
  const clProvs = new Set(['BASE']);

  const data = useMemo(() => YEARS.map(y => {
    const Q = y === 0 ? clProvs : P;   // Year 0 = both lines share CL baseline
    const r = { year: y };
    demos.forEach(k => {
      const cl  = getNW(k, y, clProvs, fx).total;
      const acc = getNW(k, y, Q, fx).total;
      r[`${k}_cl`]  = logScale ? Math.max(cl, 1)  : cl;
      r[`${k}_acc`] = logScale ? Math.max(acc, 1) : acc;
    });
    return r;
  }), [demos.join(','), [...P].sort().join(','), logScale, fx]);

  // Find crossover years (start search from y=1 since y=0 is forced equal)
  const crossovers = useMemo(() => {
    const out = {};
    demos.forEach(k => {
      for (let y = 1; y <= 30; y++) {
        const cl  = getNW(k, y, clProvs, fx).total;
        const acc = getNW(k, y, P, fx).total;
        if (acc > cl) { out[k] = y; break; }
      }
    });
    return out;
  }, [demos.join(','), [...P].sort().join(','), fx]);

  if (!demos.length) return noData;
  const yAx = logScale ? { scale:'log', domain:[1,'auto'] } : {};

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Solid lines = Accord net worth. Dashed lines = current law. Vertical markers show when
        Accord permanently overtakes status quo. Negative-wealth demographics cross immediately.
      </p>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top:10, right:20, bottom:20, left:90 }}>
          <CartesianGrid {...CHART_GRID}/>
          <XAxis dataKey="year" label={{ value:'Year', position:'insideBottom', offset:-8, fill:'#64748b', fontSize:12 }} tick={CHART_AXIS.tick}/>
          <YAxis tickFormatter={fD} tick={CHART_AXIS.tick} width={85} {...yAx}/>
          <Tooltip content={<TTip fmt={fD}/>}/>
          <Legend wrapperStyle={{ fontSize:12 }}/>
          {Object.entries(crossovers).map(([k, yr]) =>
            yr !== undefined && yr > 0 && yr < 31 ? (
              <ReferenceLine key={k} x={yr} stroke={DEMOS[k].color} strokeDasharray="4 2"
                label={{ value:`${DEMOS[k].short} Yr${yr}`, position:'top', fontSize:9, fill:DEMOS[k].color }}/>
            ) : null
          )}
          {demos.map(k => [
            <Line key={`${k}_acc`} dataKey={`${k}_acc`} name={`${DEMOS[k].label} (Accord)`}
              stroke={DEMOS[k].color} dot={false} strokeWidth={2.5}/>,
            <Line key={`${k}_cl`}  dataKey={`${k}_cl`}  name={`${DEMOS[k].label} (Current Law)`}
              stroke={DEMOS[k].color} dot={false} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}/>,
          ])}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════╗
// ║  MAIN DASHBOARD                                      ║
// ╚══════════════════════════════════════════════════════╝

const CHART_TITLES = {
  1:  { title:'Average Annual Income', desc:'Household income under current law + each Accord provision. Tax layer is green (relief) or red (burden) per demographic.' },
  2:  { title:'Average Net Worth', desc:'Cumulative household wealth compounded over 30 years. Includes reinvested provision benefits. Log scale recommended for comparing across brackets.' },
  3:  { title:'Share of National Wealth', desc:'Each demographic\'s fraction of total US household wealth. AMCF and worker-equity provisions visibly expand lower-bracket shares over time.' },
  4:  { title:'Share of National Income', desc:'Each demographic\'s fraction of total US household income. Progressive provisions shift shares from top to bottom over 30 years.' },
  5:  { title:'Effective Tax Rate', desc:'(All taxes paid - all benefits received) / gross income. Negative rates mean households receive more than they contribute. Toggle provisions to isolate each one\'s contribution.' },
  6:  { title:'Gini Coefficient', desc:'Income and wealth inequality side by side. Toggle country comparisons to see where the Accord places the US relative to peer nations.' },
  7:  { title:'Wealth Composition Breakdown', desc:'What household wealth is made of at the selected snapshot year. Lower brackets shift from thin financial holdings toward AMCF custodial accounts and worker fund units.' },
  8:  { title:'Cash Flow Diverging Bar', desc:'Income sources (above 0) vs. tax burdens (below 0). Two views: one demographic over time, or all demographics at a snapshot year. Net line shows disposable income.' },
  9:  { title:'Crossover Moment', desc:'When does the Accord make each demographic permanently wealthier than the status quo? Year 0 = shared current law baseline. Accord provisions kick in at Year 1. Solid = Accord; dashed = current law.' },
  10: { title:'Wealth Flow Diverging Bar', desc:'Wealth accumulation components over time. Positive = gains (base NW, prebate savings, AMCF, worker equity). Negative = tax drag. Net line = total Accord net worth. Year 0 = current law baseline for all.' },
};

const CHART_HAS_BAR       = new Set([1, 2, 7]);
const CHART_DEMO_AGNOSTIC = new Set([6]);
const CHART_SNAPSHOT_ONLY = new Set([7]);

export default function Dashboard() {
  const [activeChart, setActiveChart]   = useUrlValue('chart', 1);
  const [mode, setMode]                 = useState('line');
  const [snYear, setSnYear]             = useUrlValue('yr', 10);
  const [logScale, setLogScale]         = useState(false);
  const [activeDemos, setActiveDemos]   = useUrlValue('demos', DEFAULT_DEMOS);
  const [activeProvs, setActiveProvs]   = useUrlValue('provs', DEFAULT_PROVS);
  const [stackedShare, setStackedShare] = useState(false);
  const [normalizedBar, setNormalizedBar] = useState(false);
  const [chart8View, setChart8View]     = useState('time');   // 'time' | 'demos'
  const [chart10View, setChart10View]   = useState('time');

  // Fiscal assumptions, shared with the National Balance Sheet and Inequality.
  const { fx, values: fxValues, set: fxSet, isDefault: fxIsDefault, reset: fxReset, grants } = useFiscalParams();

  const toggleDemo = k => setActiveDemos(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const toggleProv = k => {
    if (k === 'BASE') return;
    setActiveProvs(prev => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const demos = DEMO_KEYS.filter(k => activeDemos.has(k));
  const P = activeProvs;
  const chartTitle = CHART_TITLES[activeChart];

  const showMode       = CHART_HAS_BAR.has(activeChart) && activeChart !== 7;
  const showLogScale   = [1,2,3,4,9,10].includes(activeChart);
  const showStackShare = [3, 4].includes(activeChart);
  const showSnYear     = mode === 'bar' || CHART_SNAPSHOT_ONLY.has(activeChart);
  const showNormBar    = (CHART_HAS_BAR.has(activeChart) && mode === 'bar') || [7,8,10].includes(activeChart);
  const currentMode    = CHART_HAS_BAR.has(activeChart) ? mode : 'line';

  const renderChart = () => {
    switch (activeChart) {
      case 1:  return <Chart1  demos={demos} P={P} mode={currentMode} snYear={snYear} logScale={logScale} normalizedBar={normalizedBar} fx={fx}/>;
      case 2:  return <Chart2  demos={demos} P={P} mode={currentMode} snYear={snYear} logScale={logScale} normalizedBar={normalizedBar} fx={fx}/>;
      case 3:  return <Chart3  demos={demos} P={P} stacked={stackedShare} fx={fx}/>;
      case 4:  return <Chart4  demos={demos} P={P} stacked={stackedShare} fx={fx}/>;
      case 5:  return <Chart5  demos={demos} P={P} fx={fx}/>;
      case 6:  return null; // Gini moved to standalone Inequality module
      case 7:  return <Chart7  demos={demos} P={P} snYear={snYear} normalizedBar={normalizedBar} fx={fx}/>;
      case 8:  return (
        <div>
          <div className="flex gap-2.5 mb-3.5 flex-wrap items-center">
            <span className="text-xs font-semibold text-foreground">View:</span>
            <Button variant={chart8View==='time' ? 'default' : 'outline'} size="sm"
              onClick={() => setChart8View('time')}>Over Time</Button>
            <Button variant={chart8View==='demos' ? 'default' : 'outline'} size="sm"
              onClick={() => setChart8View('demos')}>All Demos (Yr {snYear})</Button>
          </div>
          <Chart8 demos={demos} P={P} snYear={snYear} view={chart8View} normalizedBar={normalizedBar} fx={fx}/>
        </div>
      );
      case 9:  return <Chart9  demos={demos} P={P} logScale={logScale} fx={fx}/>;
      case 10: return (
        <div>
          <div className="flex gap-2.5 mb-3.5 flex-wrap items-center">
            <span className="text-xs font-semibold text-foreground">View:</span>
            <Button variant={chart10View==='time' ? 'default' : 'outline'} size="sm"
              onClick={() => setChart10View('time')}>Over Time</Button>
            <Button variant={chart10View==='demos' ? 'default' : 'outline'} size="sm"
              onClick={() => setChart10View('demos')}>All Demos (Yr {snYear})</Button>
          </div>
          <Chart10 demos={demos} P={P} snYear={snYear} view={chart10View} normalizedBar={normalizedBar} logScale={logScale} fx={fx}/>
        </div>
      );
      default: return null;
    }
  };

  // Sidebar content
  const sidebarContent = (
    <div className="p-4 space-y-4">
      {/* Demographics */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Demographics</div>
        <p className="text-[10px] text-muted-foreground mb-2">
          {CHART_DEMO_AGNOSTIC.has(activeChart)
          ? 'Chart 6 uses full distribution — demo toggles affect provisions only.'
          : (showStackShare && stackedShare)
            ? 'Stacked: demo toggles control which bands are shown. Unselected = gray "Other".'
            : [8,10].includes(activeChart)
              ? '"Over Time" uses first selected demo. "All Demos" shows all selected at snapshot year.'
              : 'Multi-select. Each adds a line or bar group.'}
        </p>
        <DemoChips
          demos={DEMOS}
          demoKeys={DEMO_KEYS}
          enabled={[...activeDemos]}
          onToggle={toggleDemo}
        />
      </div>

      {/* Provisions */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-4">Accord Provisions</div>
        <p className="text-[10px] text-muted-foreground mb-2">Cumulative layers. Each adds its marginal effect.</p>
        <div className="space-y-1">
          {PROVS_CONFIG.map(p => {
            const active = activeProvs.has(p.key);
            return (
              <div key={p.key}
                role="button"
                tabIndex="0"
                title={p.tip}
                onClick={() => toggleProv(p.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProv(p.key); } }}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors border',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-current' : 'border-border',
                )}
                style={active ? { borderColor: p.color, background: `${p.color}18` } : undefined}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }}/>
                <span className={cn('text-xs text-foreground', active ? 'font-semibold' : 'font-normal')}>
                  {p.label}
                </span>
                {p.fixed && <span className="text-[10px] text-muted-foreground ml-auto">always on</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Snapshot year */}
      <div className="mt-4">
        <SliderControl
          label={`Snapshot Year: ${snYear}`}
          value={snYear}
          onChange={setSnYear}
          min={1}
          max={30}
          step={1}
          helpText="Used by bar charts, Charts 7/8/10 'All Demos' view."
        />
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <FiscalControls values={fxValues} set={fxSet} isDefault={fxIsDefault}
                        reset={fxReset} grants={grants} />
      </div>
    </div>
  );

  return (
    <DashboardShell sidebar={sidebarContent}>
      {/* Header bar with title + chart tabs */}
      <div className="bg-zinc-900 text-zinc-50 rounded-lg px-5 py-3 mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-extrabold tracking-tight text-zinc-50">Household Impact</h1>
          <p className="text-[11px] text-zinc-300 mt-0.5">10-chart interactive suite · 30-year trajectories · 2024 real dollars</p>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {CHARTS.map(c => (
            <Button key={c.id}
              variant={activeChart === c.id ? 'default' : 'ghost'}
              size="xs"
              className={cn(
                'text-xs whitespace-nowrap',
                activeChart === c.id
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800'
              )}
              onClick={() => { setActiveChart(c.id); if (!CHART_HAS_BAR.has(c.id)) setMode('line'); }}>
              {c.id}. {c.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Chart card */}
      <Card className="mb-4">
        <CardContent>
          {/* Chart controls bar */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">{chartTitle?.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-[600px]">{chartTitle?.desc}</p>
            </div>
            <div className="flex gap-2 shrink-0 ml-4 flex-wrap justify-end">
              {showStackShare && (
                <>
                  <Button variant={!stackedShare ? 'default' : 'outline'} size="sm"
                    onClick={() => setStackedShare(false)}>Line</Button>
                  <Button variant={stackedShare ? 'default' : 'outline'} size="sm"
                    onClick={() => setStackedShare(true)}>Stacked</Button>
                </>
              )}
              {showMode && (
                <>
                  <Button variant={mode==='line' ? 'default' : 'outline'} size="sm"
                    onClick={() => setMode('line')}>Line</Button>
                  <Button variant={mode==='bar' ? 'default' : 'outline'} size="sm"
                    onClick={() => setMode('bar')}>Bar (Yr {snYear})</Button>
                </>
              )}
              {showNormBar && (
                <Button variant={normalizedBar ? 'default' : 'outline'} size="sm"
                  onClick={() => setNormalizedBar(v => !v)}>
                  {normalizedBar ? '% ON' : '100% / %'}
                </Button>
              )}
              {showLogScale && (
                <Button variant={logScale ? 'default' : 'outline'} size="sm"
                  onClick={() => setLogScale(v => !v)}>
                  {logScale ? 'Log ON' : 'Log Scale'}
                </Button>
              )}
            </div>
          </div>

          {renderChart()}
        </CardContent>
      </Card>

      {/* Key numbers reference */}
      {activeChart === 1 && (
        <Card className="mb-4">
          <CardContent>
            <div className="text-sm font-bold text-foreground mb-2.5">Year {snYear} Income Snapshot</div>
            <div className="flex gap-3 flex-wrap">
              {demos.map(k => {
                const l   = getInc(k, snYear, P, fx);
                const cl  = getInc(k, snYear, BASE_ONLY, fx);
                const delta = l.total - cl.total;
                const pct = cl.total > 0 ? delta / cl.total * 100 : null;
                const pos = delta >= 0;
                return (
                  <div key={k} className="px-3.5 py-2.5 rounded-lg min-w-[140px] border-2"
                    style={{ borderColor: `${DEMOS[k].color}20`, background: `${DEMOS[k].color}08` }}>
                    <div className="text-[11px] font-bold" style={{ color: DEMOS[k].color }}>{DEMOS[k].label}</div>
                    <div className="text-base font-extrabold text-foreground mt-0.5">{fD(l.total)}</div>
                    <div className={cn('text-[11px] mt-0.5', pos ? 'text-[#307ca6]' : 'text-[#c27040]')}>
                      vs CL: {pos ? '+' : ''}{fD(delta)}
                    </div>
                    <div className={cn('text-[11px]', pos ? 'text-[#307ca6]' : 'text-[#c27040]')}>
                      {pct !== null ? `${pos ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {activeChart === 2 && (
        <Card className="mb-4">
          <CardContent>
            <div className="text-sm font-bold text-foreground mb-2.5">Year {snYear} Net Worth Snapshot</div>
            <div className="flex gap-3 flex-wrap">
              {demos.map(k => {
                const l   = getNW(k, snYear, P, fx);
                const cl  = getNW(k, snYear, BASE_ONLY, fx);
                const delta = l.total - cl.total;
                const pct = cl.total > 0 ? delta / cl.total * 100 : null;
                const pos = delta >= 0;
                return (
                  <div key={k} className="px-3.5 py-2.5 rounded-lg min-w-[140px] border-2"
                    style={{ borderColor: `${DEMOS[k].color}20`, background: `${DEMOS[k].color}08` }}>
                    <div className="text-[11px] font-bold" style={{ color: DEMOS[k].color }}>{DEMOS[k].label}</div>
                    <div className="text-base font-extrabold text-foreground mt-0.5">{fD(l.total)}</div>
                    <div className={cn('text-[11px] mt-0.5', pos ? 'text-[#307ca6]' : 'text-[#c27040]')}>
                      vs CL: {pos ? '+' : ''}{fD(delta)}
                    </div>
                    <div className={cn('text-[11px]', pos ? 'text-[#307ca6]' : 'text-[#c27040]')}>
                      {pct !== null ? `${pos ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {(activeChart === 3 || activeChart === 4) && (
        <Card className="mb-4">
          <CardContent>
            <div className="text-sm font-bold text-foreground mb-2.5">
              Year {snYear} {activeChart === 3 ? 'Wealth' : 'Income'} Share Snapshot
            </div>
            <div className="flex gap-3 flex-wrap">
              {(() => {
                const snapDemos = stackedShare ? DEMO_KEYS : demos;
                let total = 0;
                const vals = {};
                DEMO_KEYS.forEach(k => {
                  const v = Math.max(
                    activeChart === 3 ? getNW(k, snYear, P, fx).total : getInc(k, snYear, P, fx).total, 0
                  ) * POP[k];
                  vals[k] = v; total += v;
                });
                return snapDemos.map(k => {
                  const share = total > 0 ? vals[k] / total * 100 : 0;
                  const clTotal = DEMO_KEYS.reduce((s, j) => s + Math.max(
                    activeChart === 3 ? getNW(j, snYear, BASE_ONLY, fx).total : getInc(j, snYear, BASE_ONLY, fx).total, 0
                  ) * POP[j], 0);
                  const clShare = clTotal > 0 ? Math.max(
                    activeChart === 3 ? getNW(k, snYear, BASE_ONLY, fx).total : getInc(k, snYear, BASE_ONLY, fx).total, 0
                  ) * POP[k] / clTotal * 100 : 0;
                  const delta = share - clShare;
                  return (
                    <div key={k} className="px-3.5 py-2.5 rounded-lg min-w-[120px] border-2"
                      style={{ borderColor: `${DEMOS[k].color}20`, background: `${DEMOS[k].color}08` }}>
                      <div className="text-[11px] font-bold" style={{ color: DEMOS[k].color }}>{DEMOS[k].label}</div>
                      <div className="text-lg font-extrabold text-foreground mt-0.5">
                        {share.toFixed(2)}%
                      </div>
                      <div className={cn('text-[11px] mt-0.5', delta >= 0 ? 'text-[#307ca6]' : 'text-[#c27040]')}>
                        vs CL: {delta >= 0 ? '+' : ''}{delta.toFixed(2)}pp
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {activeChart === 9 && (
        <Card className="mb-4">
          <CardContent>
            <div className="text-sm font-bold text-foreground mb-2.5">Crossover Years (Accord NW exceeds Current Law)</div>
            <div className="flex gap-2.5 flex-wrap">
              {demos.map(k => {
                let crossover = null;
                const clP = new Set(['BASE']);
                for (let y = 1; y <= 30; y++) {
                  if (getNW(k, y, P, fx).total > getNW(k, y, clP, fx).total) { crossover = y; break; }
                }
                return (
                  <div key={k} className="px-3.5 py-2 rounded-lg min-w-[130px] border-2"
                    style={{ borderColor: `${DEMOS[k].color}30`, background: `${DEMOS[k].color}08` }}>
                    <div className="text-[11px] font-bold" style={{ color: DEMOS[k].color }}>{DEMOS[k].label}</div>
                    <div className={cn('text-[15px] font-extrabold mt-0.5', crossover !== null ? 'text-[#307ca6]' : 'text-[#c27040]')}>
                      {crossover !== null ? `Year ${crossover}${crossover === 1 ? ' (immediate)' : ''}` : 'Beyond Yr 30'}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snapshot matrix tables and composition tables */}

      {activeChart === 1 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <SnapshotTable title="Annual Income Trajectory"
              demos={demos}
              getValue={(k, y) => getInc(k, y, P, fx).total}
              getCL={(k, y) => getInc(k, y, BASE_ONLY, fx).total}
              fmt={fD}/>
          </CardContent>
        </Card>
      )}

      {activeChart === 2 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <SnapshotTable title="Net Worth Trajectory"
              demos={demos}
              getValue={(k, y) => getNW(k, y, P, fx).total}
              getCL={(k, y) => getNW(k, y, BASE_ONLY, fx).total}
              fmt={fD}/>
          </CardContent>
        </Card>
      )}

      {activeChart === 3 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <SnapshotTable title="Wealth Share Trajectory"
              note="Each demo's % of total national wealth. vs CL in percentage points."
              demos={demos}
              getValue={(k, y) => {
                let t = 0; const v = {};
                DEMO_KEYS.forEach(j => { const x = Math.max(getNW(j, y, P, fx).total, 0)*POP[j]; v[j]=x; t+=x; });
                return t > 0 ? v[k]/t*100 : 0;
              }}
              getCL={(k, y) => {
                let t = 0; const v = {};
                DEMO_KEYS.forEach(j => { const x = Math.max(getNW(j, y, BASE_ONLY, fx).total, 0)*POP[j]; v[j]=x; t+=x; });
                return t > 0 ? v[k]/t*100 : 0;
              }}
              fmt={v => v.toFixed(2)+'%'}
              deltaFmt={d => `${d>=0?'+':''}${d.toFixed(2)}pp`}/>
          </CardContent>
        </Card>
      )}

      {activeChart === 4 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <SnapshotTable title="Income Share Trajectory"
              note="Each demo's % of total national income. vs CL in percentage points."
              demos={demos}
              getValue={(k, y) => {
                let t = 0; const v = {};
                DEMO_KEYS.forEach(j => { const x = Math.max(getInc(j, y, P, fx).total, 0)*POP[j]; v[j]=x; t+=x; });
                return t > 0 ? v[k]/t*100 : 0;
              }}
              getCL={(k, y) => {
                let t = 0; const v = {};
                DEMO_KEYS.forEach(j => { const x = Math.max(getInc(j, y, BASE_ONLY, fx).total, 0)*POP[j]; v[j]=x; t+=x; });
                return t > 0 ? v[k]/t*100 : 0;
              }}
              fmt={v => v.toFixed(2)+'%'}
              deltaFmt={d => `${d>=0?'+':''}${d.toFixed(2)}pp`}/>
          </CardContent>
        </Card>
      )}

      {activeChart === 5 && demos.length > 0 && (
        <>
          <Card className="mb-4">
            <CardContent>
              <h3 className="text-sm font-semibold text-foreground">Effective Tax Rate by Household — Year {snYear}</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                All taxes paid minus all benefits received, ÷ gross income, at the selected year.
                Negative = the household receives more than it contributes.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={demos.map(k => ({
                    demo: DEMOS[k].short,
                    'Current Law': +getETR(k, snYear, BASE_ONLY, fx).toFixed(1),
                    'Accord':      +getETR(k, snYear, P, fx).toFixed(1),
                  }))}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="demo" tick={CHART_AXIS.tick} />
                  <YAxis tickFormatter={v => `${v}%`} tick={CHART_AXIS.tick} />
                  <Tooltip content={<TTip isBar fmt={v => `${(+v).toFixed(1)}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <ReferenceLine y={0} stroke="#1f2937" strokeWidth={1} />
                  <Bar dataKey="Current Law" fill="#94a3b8" radius={[2,2,0,0]} />
                  <Bar dataKey="Accord"      fill="#307ca6" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="mb-4">
            <CardContent>
              <SnapshotTable title="Effective Tax Rate Trajectory"
                note="ETR = taxes minus prebate offset / gross income. AMCF and worker equity excluded (equity income). Negative = prebate {'>'} taxes. vs CL = change in ETR (pp)."
                demos={demos}
                getValue={(k, y) => getETR(k, y, P, fx)}
                getCL={(k, y) => getETR(k, y, BASE_ONLY, fx)}
                fmt={v => v.toFixed(1)+'%'}
                deltaFmt={d => `${d>=0?'+':''}${d.toFixed(1)}pp`}/>
            </CardContent>
          </Card>
        </>
      )}

      {activeChart === 7 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <CompositionTable
              title="Wealth Composition Breakdown — Component x Year"
              demos={demos}
              getRows={(k, y) => wealthMixRows(k, y, y === 0 ? BASE_ONLY : P, fx)}
              note="Bars show relative magnitude within each component row across snapshot years. Values in 2024 real dollars."
            />
          </CardContent>
        </Card>
      )}

      {activeChart === 8 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <CompositionTable
              title="Cash Flow Breakdown — Component x Year"
              demos={demos}
              getRows={(k, y) => cfRows(k, y, y === 0 ? BASE_ONLY : P, fx)}
              note="Negative values (taxes, burdens) shown in red. Positive values (income, benefits) in green. Bars scale to each row's peak across snapshot years."
            />
          </CardContent>
        </Card>
      )}

      {activeChart === 9 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <SnapshotTable title="Accord vs Current Law Net Worth Trajectory"
              demos={demos}
              getValue={(k, y) => getNW(k, y, P, fx).total}
              getCL={(k, y) => getNW(k, y, BASE_ONLY, fx).total}
              fmt={fD}/>
          </CardContent>
        </Card>
      )}

      {activeChart === 10 && demos.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <CompositionTable
              title="Wealth Flow Breakdown — Component x Year"
              demos={demos}
              getRows={(k, y) => wfRows(k, y, y === 0 ? BASE_ONLY : P, fx)}
              note="Tax Impact is negative for most demographics (Growth Tax drag on capital appreciation). AMCF and worker-equity rows show cumulative wealth added vs current law baseline."
            />
          </CardContent>
        </Card>
      )}

      {/* Methodology footer */}
      <InfoBox className="columns-2 gap-6">
        <div className="text-xs font-bold text-muted-foreground mb-1.5">Model Notes &amp; Assumptions</div>
        <p className="mt-0">All values in 2024 real (inflation-adjusted) dollars. <strong>Year 0 = current law baseline</strong> for all line charts — Accord provisions activate at Year 1, making the Year 0-1 jump visible. Bar charts and snapshot cards use the selected snapshot year with all active provisions.</p>
        <p>Citizen AMCF units follow the National Balance Sheet engine: {Math.round(fx.citizenScripShare * 100)}% of each year's Growth Tax scrip is issued to citizens as fund units, topped up to a ${fx.citizenFloor} floor from the Treasury tranche: ${Math.round(amcfG(1, fx)).toLocaleString()}/person in Year 1 and ${Math.round(amcfG(30, fx)).toLocaleString()} in Year 30. Units compound at 5% real. Withdrawals for home, education, business, retirement or hardship are tax-free; other withdrawals are ordinary income (half assumed qualifying).</p>
        <p>The Equity Excise builds a 21% stake in each company worth $10M or more over five years, held permanently in that company's worker trust and voted for its current workers. The trust's dividends go to current workers: {Math.round(fx.workerProfitShare * 100)}% as cash profit-sharing from their own company, the rest as Worker Equity Fund units issued to every worker by hours worked. Units are portable and are never redeemed when a worker changes jobs. They pay cash dividends, which are ordinary income, and count toward net worth. Companies under $10M pay $1,000 per worker a year into the Sectoral Wealth Fund instead.</p>
        <p>Tax reform net change (TAX toggle) compares the Accord with current law at each year's income: the two-rate income tax ({(fx.incomeTaxLow * 100).toFixed(0)}%/{(fx.incomeTaxHigh * 100).toFixed(0)}%) against 2024 federal brackets with preferential capital gains, plus {(fx.vatRate * 100).toFixed(1)}% VAT, {(fx.lvtRate * 100).toFixed(0)}% LVT on the home (owners pay, renters gain rent relief), ${fx.carbonRate}/ton carbon, the 12.4% Social Security contribution on all income above the per-worker cap, and the household share of business-land LVT, the smaller rent taxes and the tax on gains realized at death and on gifts, assigned by business and financial holdings.</p>
        <p>Existing equity holdings are diluted as the AMCF and the worker pool each build to 21% of companies, offset by the one-time revaluation from repealing the corporate tax when that switch is on. Small private businesses below the $10M threshold are not diluted. Capital gains taxed as ordinary income lower the after-tax return on financial portfolios.</p>
        <p>Charts 8 &amp; 10 (diverging bar): positive values stack above zero (income, benefits, wealth gains), negative values stack below zero (taxes, burdens). Net line shows total. &quot;% / 100%&quot; toggle normalizes to % of gross income (Ch.8) or base CL net worth (Ch.10). &quot;All Demos&quot; view shows all selected demographics at snapshot year.</p>
        <p>Gini: computed from full 13-point distribution (B10-Elon) for both income and wealth Gini. Population weights: deciles at 10% each, T10 9%, T1 0.94%, Billionaires 6e-6, Elon 7.5e-9. Anchor-calibrated to match official US statistics at Year 0. Lorenz trapezoid method.</p>
      </InfoBox>
    </DashboardShell>
  );
}
