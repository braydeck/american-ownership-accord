import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { ControlPanel, ControlGroup } from '@/components/controls/ControlPanel';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';

// ─── Historical Crash Keyframes ───────────────────────────────────────────────
const CRASH_DATA = {
  '2008': {
    label: '2008 Financial Crisis',
    period: 'Oct 2007 – Mar 2013',
    peakDate: 'Oct 9, 2007',
    troughDate: 'Mar 9, 2009',
    recoveryDate: 'Mar 2013',
    actualDepth: 0.566,
    recoveryMonths: 66,
    forcedSellFraction: 0.65,
    keyframes: [
      [0,  100.0], [2,  96.0], [4,  90.5], [6,  88.0], [8,  83.0],
      [10, 78.5], [11, 72.0], [12, 57.5], [13, 53.0], [14, 50.5],
      [17, 43.4], [20, 51.5], [24, 55.0], [28, 60.5], [32, 67.0],
      [36, 72.0], [40, 76.5], [44, 72.0], [48, 74.0], [52, 82.0],
      [56, 87.5], [60, 93.5], [65, 99.5], [66, 100.0],
    ],
  },
  '2020': {
    label: '2020 COVID Crash',
    period: 'Feb 2020 – Aug 2020',
    peakDate: 'Feb 19, 2020',
    troughDate: 'Mar 23, 2020',
    recoveryDate: 'Aug 18, 2020',
    actualDepth: 0.340,
    recoveryMonths: 6,
    forcedSellFraction: 0.45,
    keyframes: [
      [0, 100.0], [0.5, 93.0], [1.0, 75.5], [1.2, 66.0],
      [2,  73.5], [3,  77.0], [4,  84.5], [5,  91.0], [6, 100.0],
    ],
  },
  '2022': {
    label: '2022 Bear Market',
    period: 'Jan 2022 – Jan 2024',
    peakDate: 'Jan 3, 2022',
    troughDate: 'Oct 12, 2022',
    recoveryDate: 'Jan 2024',
    actualDepth: 0.255,
    recoveryMonths: 24,
    forcedSellFraction: 0.40,
    keyframes: [
      [0, 100.0], [1, 96.5], [2, 92.5], [3, 90.0], [4, 87.0],
      [5, 84.5],  [6, 83.0], [7, 79.5], [8, 78.0], [9, 74.5],
      [10, 76.5], [11, 79.0], [12, 80.5], [14, 83.0], [16, 87.5],
      [18, 90.5], [20, 95.5], [22, 98.5], [24, 100.0],
    ],
  },
};

function computeAmcfEffect(crash, amcfSharePct) {
  const X = amcfSharePct / 100;
  const feedback = 1.20;
  const reduction = X * crash.forcedSellFraction * feedback;
  const newDepth = crash.actualDepth * (1 - reduction);
  const recoverySpeedup = Math.sqrt(newDepth / crash.actualDepth);
  const newRecoveryMonths = Math.round(crash.recoveryMonths * recoverySpeedup);
  return { newDepth, newRecoveryMonths, reduction };
}

function interpolate(keyframes, month) {
  for (let i = 0; i < keyframes.length - 1; i++) {
    const [m0, v0] = keyframes[i];
    const [m1, v1] = keyframes[i + 1];
    if (month >= m0 && month <= m1) {
      const t = (m1 === m0) ? 0 : (month - m0) / (m1 - m0);
      return v0 + (v1 - v0) * t;
    }
  }
  return 100;
}

function buildChartData(crashKey, amcfSharePct) {
  const crash = CRASH_DATA[crashKey];
  const { newDepth, newRecoveryMonths, reduction } = computeAmcfEffect(crash, amcfSharePct);
  const totalMonths = crash.recoveryMonths;
  const data = [];
  for (let m = 0; m <= totalMonths; m += (totalMonths > 30 ? 2 : 0.5)) {
    const monthRounded = Math.round(m * 10) / 10;
    const historical = interpolate(crash.keyframes, monthRounded);
    let amcfVal;
    const kf = crash.keyframes;
    let troughIdx = 0;
    for (let i = 0; i < kf.length; i++) {
      if (kf[i][1] < kf[troughIdx][1]) troughIdx = i;
    }
    const troughMo = kf[troughIdx][0];
    if (monthRounded <= troughMo) {
      amcfVal = 100 - (100 - historical) * (1 - reduction);
    } else {
      const timeInRecovery = monthRounded - troughMo;
      const recoveryRatio = crash.recoveryMonths / newRecoveryMonths;
      const adjustedTime = troughMo + timeInRecovery * recoveryRatio;
      const adjusted = Math.min(adjustedTime, crash.recoveryMonths);
      const baseVal = interpolate(crash.keyframes, adjusted);
      amcfVal = 100 - (100 - baseVal) * (1 - reduction);
    }
    data.push({
      month: monthRounded,
      label: `Month ${Math.round(monthRounded)}`,
      'Historical (Actual)': +historical.toFixed(2),
      [`With AMCF (${amcfSharePct}% passive ownership)`]: +Math.min(100, amcfVal).toFixed(2),
    });
  }
  return { data, stats: computeAmcfEffect(crash, amcfSharePct) };
}

function estimateVolReduction(amcfSharePct, crashKey) {
  const { reduction } = computeAmcfEffect(CRASH_DATA[crashKey], amcfSharePct);
  return (reduction * CRASH_DATA[crashKey].actualDepth * 0.15 * 100).toFixed(1);
}

const fmtPct = (v, decimals = 1) => `${(v * 100).toFixed(decimals)}%`;

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 8,
  padding: '10px 14px', fontSize: 12, color: '#fafafa',
};

const DrawdownTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>Month {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>
          {p.name.split(' (')[0]}: {p.value >= 100 ? 'At Peak' : `${(100 - p.value).toFixed(1)}% below peak`}
        </p>
      ))}
    </div>
  );
};

const CRASH_LABELS = { '2008': 'Financial Crisis', '2020': 'COVID Crash', '2022': 'Bear Market' };

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarketStabilization() {
  const [crashKey, setCrashKey] = useState('2008');
  const [amcfShare, setAmcfShare] = useState(15);

  const crash = CRASH_DATA[crashKey];
  const { data: chartData, stats } = useMemo(
    () => buildChartData(crashKey, amcfShare), [crashKey, amcfShare]
  );
  const volReduction = estimateVolReduction(amcfShare, crashKey);
  const depthImprovement = ((crash.actualDepth - stats.newDepth) * 100).toFixed(1);
  const recoveryImprovement = crash.recoveryMonths - stats.newRecoveryMonths;

  const allCrashStats = Object.entries(CRASH_DATA).map(([key, c]) => ({
    ...c, key, ...computeAmcfEffect(c, amcfShare),
  }));

  return (
    <PageShell>
      {/* Header */}
      <div className="border-l-4 border-blue-500 pl-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          American Ownership Accord
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Market Stabilization</h1>
        <p className="text-base font-semibold text-blue-700 mt-2">
          The 2008 crash would have been {fmtPct(stats.newDepth)} instead of{' '}
          {fmtPct(crash.actualDepth)} with {amcfShare}% AMCF passive ownership —
          eliminating {depthImprovement} percentage points from the worst financial crisis
          in a generation.
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          The American Capital Fund holds equity passively and permanently — it never sells, never margins,
          never redeems. As its share of total market capitalization grows, the pool of shares eligible for
          forced selling during crashes shrinks, dampening cascade dynamics without any active intervention.
        </p>
      </div>

      {/* Controls */}
      <ControlPanel className="mt-8" columns={1}>
        <ControlGroup>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Crash Scenario
          </p>
          <ToggleGroup
            type="single"
            value={crashKey}
            onValueChange={(v) => { if (v) setCrashKey(v); }}
            className="flex flex-wrap gap-1.5"
          >
            {Object.entries(CRASH_DATA).map(([key]) => (
              <ToggleGroupItem key={key} value={key} className="text-xs px-3 py-1.5">
                {key} ({CRASH_LABELS[key]})
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </ControlGroup>
        <ControlGroup>
          <SliderControl
            label="AMCF Market Share"
            value={amcfShare}
            onChange={setAmcfShare}
            min={5}
            max={25}
            step={1}
            formatValue={(v) => `${v}%`}
            helpText="5% = Phase 1 | 15% = Phase 3 (~Yr 13) | 25% = Phase 4"
          />
        </ControlGroup>
      </ControlPanel>

      {/* Stat Boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        <MilestoneCard label="Actual Crash Depth" value={fmtPct(crash.actualDepth)} sub={crash.troughDate} />
        <MilestoneCard label={`Simulated (${amcfShare}% AMCF)`} value={fmtPct(stats.newDepth)} sub={`-${depthImprovement}pp vs actual`} />
        <MilestoneCard label="Actual Recovery" value={`${crash.recoveryMonths} mo`} sub={crash.recoveryDate} />
        <MilestoneCard label="Simulated Recovery" value={`${stats.newRecoveryMonths} mo`} sub={`${recoveryImprovement} months faster`} />
      </div>

      {/* Main Chart */}
      <ChartContainer
        title={`${crash.label}: Actual vs AMCF-Buffered Price Path`}
        subtitle={`S&P 500 normalized to 100 at ${crash.peakDate} peak. Month 0 = crash peak. Dashed = historical actual. Solid = simulated with AMCF.`}
        source={`Historical data: S&P 500 monthly closing prices (Yahoo Finance). AMCF effect: amcfShare x ${(crash.forcedSellFraction * 100).toFixed(0)}% forced-sell fraction x 1.2x feedback = ${(stats.reduction * 100).toFixed(1)}% amplitude reduction. Recovery compressed by sqrt(depth ratio).`}
        height={380}
      >
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            dataKey="month" type="number"
            domain={[0, crash.recoveryMonths]} tickCount={8}
            tickFormatter={v => `M${Math.round(v)}`}
            label={{ value: 'Months from Peak', position: 'insideBottom', offset: -4, fontSize: 11 }}
            tick={CHART_AXIS.tick}
          />
          <YAxis
            domain={[Math.floor((1 - crash.actualDepth - 0.05) * 100), 102]}
            tickFormatter={v => v >= 100 ? 'Peak' : `${v}`}
            tick={CHART_AXIS.tick} width={55}
            label={{ value: 'Index Level (100 = peak)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11 }}
          />
          <Tooltip content={<DrawdownTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          <ReferenceLine y={100} stroke="#10B981" strokeDasharray="4 3"
            label={{ value: 'Pre-crash peak', position: 'right', fontSize: 10, fill: '#10B981' }} />
          <Line type="monotone" dataKey="Historical (Actual)"
            stroke="#DC2626" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey={`With AMCF (${amcfShare}% passive ownership)`}
            stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ChartContainer>

      {/* Mechanism Explanation */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight mb-4">How It Works: The Float Reduction Mechanism</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { step: '01', title: 'AMCF Never Sells',
              body: 'The AMCF holds equity as a permanent sovereign asset. It issues no redemptions, answers no margin calls, and responds to no fear-driven signals. Its shares are structurally removed from the tradeable float.' },
            { step: '02', title: 'Fewer Marginable Shares',
              body: `With ${amcfShare}% of market cap held by AMCF, only ${100 - amcfShare}% of shares can be margined by levered investors. During a crash, margin calls — which trigger ~${Math.round(crash.forcedSellFraction * 100)}% of forced selling in this scenario — fire on a proportionally smaller pool.` },
            { step: '03', title: 'Cascade Dampening',
              body: 'A shallower initial crash triggers fewer second-wave margin calls, which prevents the cascade amplification that turned a 20% fundamental shock into a 57% market decline in 2008. The 20% feedback multiplier captures this second-order stabilization.' },
          ].map(({ step, title, body }) => (
            <Card key={step} className="bg-blue-50/50 border-blue-200/50">
              <CardContent className="pt-5 pb-4 px-5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-800 mb-2">Step {step}</p>
                <p className="font-semibold text-sm text-blue-900 mb-2">{title}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Comparison Table */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight mb-4">
          All Three Crashes: Impact of {amcfShare}% AMCF Passive Ownership
        </h2>
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Event</TableHead>
                <TableHead className="text-destructive">Actual Depth</TableHead>
                <TableHead className="text-blue-600">AMCF Simulated</TableHead>
                <TableHead className="text-success">Improvement</TableHead>
                <TableHead className="text-destructive">Actual Recovery</TableHead>
                <TableHead className="text-blue-600">AMCF Recovery</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allCrashStats.map((c) => {
                const imp = ((c.actualDepth - c.newDepth) * 100).toFixed(1);
                return (
                  <TableRow key={c.key}>
                    <TableCell className="font-semibold">{c.key}: {c.label}</TableCell>
                    <TableCell className="text-destructive font-semibold">{fmtPct(c.actualDepth)}</TableCell>
                    <TableCell className="text-blue-600 font-semibold">{fmtPct(c.newDepth)}</TableCell>
                    <TableCell className="text-success font-semibold">-{imp}pp</TableCell>
                    <TableCell className="text-destructive">{c.recoveryMonths} months</TableCell>
                    <TableCell className="text-blue-600">{c.newRecoveryMonths} mo (-{c.recoveryMonths - c.newRecoveryMonths} mo)</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Volatility Note */}
      <Card className="mt-8 bg-blue-50/50 border-blue-200/50">
        <CardContent className="pt-5 pb-4 px-5">
          <p className="font-semibold text-blue-900 mb-2">Estimated Annualized Volatility Reduction</p>
          <p className="text-sm text-blue-950 leading-relaxed">
            For the {crash.label} scenario, AMCF passive ownership of{' '}
            <strong>{amcfShare}%</strong> would reduce annualized S&P 500 volatility by approximately{' '}
            <strong>~{volReduction}pp</strong> during crisis periods, from roughly 40% annual vol (2008-2009)
            to ~{(40 - +volReduction).toFixed(1)}%. In normal market conditions, the effect is smaller
            (volatility driven by fundamentals, not forced-selling cascades), but the structural dampener
            on crash amplification is permanent and grows as AMCF market share increases.
          </p>
        </CardContent>
      </Card>

      {/* Methodology */}
      <InfoBox className="mt-6">
        <strong className="text-foreground">Methodology:</strong>{' '}
        Historical price paths reconstructed from S&P 500 monthly closing data (Yahoo Finance) normalized to 100 at each crash's prior peak.
        AMCF effect model: crash amplitude reduction = amcfShare x forcedSellFraction x 1.2 (second-order feedback).
        Forced sell fraction estimated at 65% for 2008, 45% for 2020, 40% for 2022.
        Recovery compression: new_recovery = original x sqrt(newDepth / actualDepth).
        This model does not capture: market maker behavior, ETF rebalancing dynamics, VIX feedback loops, or the psychological signaling effect of
        a large stable sovereign holder.
      </InfoBox>
    </PageShell>
  );
}
