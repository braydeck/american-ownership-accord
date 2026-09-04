// Lifetime AMCF grants by birth cohort.
//
// Follows one person from birth (or from their age when the Accord starts) to retirement,
// accumulating the annual AMCF grant at the fund's real return. Everything is in 2024 real
// dollars: the shared fiscal engine is nominal, and realGrantSeries deflates it.
//
// The engine's default 35-year horizon is not enough to follow a cohort to 65, so this page
// runs it long. Past Year 19 the AMCF sits at its 21% cap and simply tracks enterprise value,
// so the path is well defined — but a run this long is an extrapolation of the model's growth
// assumptions, not a validated projection, and the page says so.
import React, { useMemo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { PageShell } from '@/components/layout/PageShell';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { SliderControl } from '@/components/controls/SliderControl';
import { MilestoneCard } from '@/components/shared/MilestoneCard';
import { InfoBox } from '@/components/shared/InfoBox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CHART_GRID, CHART_AXIS } from '@/lib/chart-config';
import { useUrlValue } from '@/lib/url-state';
import { realGrantSeries, BASE_PARAMS } from '@/lib/fiscal-engine';
import { useFiscalParams } from '@/lib/use-fiscal-params';
import { FiscalControls } from '@/components/controls/FiscalControls';

const MAX_AGE = 65;
const HORIZON = 90;              // Accord years to project, enough for a Year-20 cohort to hit 65
const REAL_RETURN = 0.05;        // AMCF real return, the same 5% every other page uses

const COHORTS = [
  { key: 'y0',  label: 'Born Year 0',  birthYear: 0,  note: 'Born when the Accord starts' },
  { key: 'y10', label: 'Born Year 10', birthYear: 10, note: 'Born a decade in' },
  { key: 'y20', label: 'Born Year 20', birthYear: 20, note: 'Born after the AMCF caps' },
];

const fmt = v => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M`
  : v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`;
const fmtFull = v => `$${Math.round(v).toLocaleString()}`;

// Account balance and cumulative grants received, year by year, for one cohort.
// A person born in Accord year `birthYear` receives a grant each year from birthYear+1
// through birthYear+age. Years before the Accord begins pay nothing.
function accumulate(grantAt, birthYear, maxAge, ret) {
  const path = [];
  let balance = 0, paid = 0;
  for (let age = 1; age <= maxAge; age++) {
    const t = birthYear + age;
    const grant = t >= 1 ? grantAt(t) : 0;
    balance = balance * (1 + ret) + grant;
    paid += grant;
    path.push({ age, grant, balance, paid });
  }
  return path;
}

export default function LifetimeGrants() {
  const { fx, values, set, isDefault, reset, grants } = useFiscalParams();
  const [currentAge, setCurrentAge] = useUrlValue('age', 30);

  const series = useMemo(
    () => realGrantSeries({ ...BASE_PARAMS, ...values }, HORIZON),
    [values]);

  const grantAt = useMemo(() => {
    const last = series[series.length - 1];
    return y => {
      if (y <= 0) return 0;
      if (y >= last[0]) return last[1];
      const lo = series[Math.floor(y)], hi = series[Math.ceil(y)];
      return lo[1] + (hi[1] - lo[1]) * (y - lo[0]);
    };
  }, [series]);

  const paths = useMemo(() => {
    const out = {};
    COHORTS.forEach(c => { out[c.key] = accumulate(grantAt, c.birthYear, MAX_AGE, REAL_RETURN); });
    // Someone already alive: born `currentAge` years before the Accord starts, so their
    // grants begin partway through life and they get no custodial accumulation.
    out.alive = accumulate(grantAt, -currentAge, MAX_AGE, REAL_RETURN);
    return out;
  }, [grantAt, currentAge]);

  const chartData = useMemo(() => {
    const rows = [];
    for (let age = 1; age <= MAX_AGE; age++) {
      const r = { age };
      COHORTS.forEach(c => { r[c.label] = Math.round(paths[c.key][age - 1].balance); });
      r[`Age ${currentAge} today`] = Math.round(paths.alive[age - 1].balance);
      rows.push(r);
    }
    return rows;
  }, [paths, currentAge]);

  const at = (key, age) => paths[key][age - 1];
  const aliveAt60 = at('alive', 60);
  const bornYear0At18 = at('y0', 18);

  const rows = [
    ...COHORTS.map(c => ({
      label: c.label, note: c.note,
      a18: at(c.key, 18), a30: at(c.key, 30), a60: at(c.key, 60),
    })),
    {
      label: `Age ${currentAge} when the Accord starts`,
      note: `Turns 60 in Accord year ${60 - currentAge}; no custodial years`,
      a18: null, a30: null, a60: aliveAt60,
    },
  ];

  return (
    <PageShell>
      <div className="border-l-4 border-[#d4940a] pl-4 mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Policy Lab</p>
        <h1 className="text-2xl font-bold tracking-tight">Lifetime Grants</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What one person accumulates in AMCF grants, from birth to 65, by the year they were born.
          All figures in 2024 real dollars, compounding at {(REAL_RETURN * 100).toFixed(0)}% real.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MilestoneCard label="Born Year 0, at 18" value={fmtFull(bornYear0At18.balance)}
                       sub={`${fmtFull(bornYear0At18.paid)} paid in`} />
        <MilestoneCard label="Born Year 0, at 60" value={fmt(at('y0', 60).balance)}
                       sub={`${fmt(at('y0', 60).paid)} paid in`} />
        <MilestoneCard label="Born Year 20, at 60" value={fmt(at('y20', 60).balance)}
                       sub={`${fmt(at('y20', 60).paid)} paid in`} />
        <MilestoneCard label={`Age ${currentAge} today, at 60`} value={fmt(aliveAt60.balance)}
                       sub={`${fmt(aliveAt60.paid)} paid in`} />
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="w-full lg:w-[280px] shrink-0 lg:sticky lg:top-[72px]">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="mb-4">
                <SliderControl
                  label={`Your age when the Accord starts: ${currentAge}`}
                  value={currentAge} onChange={setCurrentAge}
                  min={0} max={60} step={1}
                  helpText="Someone already alive gets no custodial years — grants start at whatever age they are."
                />
              </div>
              <div className="pt-4 border-t border-border">
                <FiscalControls values={values} set={set} isDefault={isDefault}
                                reset={reset} grants={grants} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 min-w-0 space-y-5">
          <ChartContainer
            title="Account balance by age"
            subtitle="AMCF grants accumulated and compounded at 5% real, 2024 dollars"
            source="Shared fiscal engine (src/lib/fiscal-engine.js), grant path deflated by each year's price level. Full retention assumed — no liquidation."
          >
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="age" {...CHART_AXIS} label={{ value: 'Age', position: 'insideBottom', offset: -4, fontSize: 11 }} />
              <YAxis {...CHART_AXIS} tickFormatter={fmt} width={62} />
              <Tooltip formatter={v => fmtFull(v)} labelFormatter={a => `Age ${a}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine x={18} stroke="#a1a1aa" strokeDasharray="4 3"
                             label={{ value: 'custodial transfer', fontSize: 10, position: 'top' }} />
              <Line dataKey="Born Year 0"  stroke="#0B3D91" strokeWidth={2} dot={false} />
              <Line dataKey="Born Year 10" stroke="#2563C9" strokeWidth={2} dot={false} />
              <Line dataKey="Born Year 20" stroke="#4A90D9" strokeWidth={2} dot={false} />
              <Line dataKey={`Age ${currentAge} today`} stroke="#d4940a" strokeWidth={2}
                    strokeDasharray="6 3" dot={false} />
            </ComposedChart>
          </ChartContainer>

          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-1">Cohort comparison</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                Account balance, with total grants actually paid in beneath it.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cohort</TableHead>
                    <TableHead className="text-right">At 18</TableHead>
                    <TableHead className="text-right">At 30</TableHead>
                    <TableHead className="text-right">At 60</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.label}>
                      <TableCell>
                        <div className="font-medium text-xs">{r.label}</div>
                        <div className="text-[10px] text-muted-foreground">{r.note}</div>
                      </TableCell>
                      {[r.a18, r.a30, r.a60].map((c, i) => (
                        <TableCell key={i} className="text-right">
                          {c ? (
                            <>
                              <div className="text-xs font-semibold">{fmtFull(c.balance)}</div>
                              <div className="text-[10px] text-muted-foreground">{fmtFull(c.paid)} paid in</div>
                            </>
                          ) : <span className="text-[10px] text-muted-foreground">—</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <InfoBox title="How to read this">
            <p>
              A child born in Year 0 reaches the custodial transfer at 18 with {fmtFull(bornYear0At18.balance)},
              having been granted {fmtFull(bornYear0At18.paid)}. Later cohorts do far better, because the AMCF
              reaches its 21% ownership cap in Year 19 and the annual grant then grows with enterprise value
              rather than with the fund's acquisition of it.
            </p>
            <p className="mt-2">
              Someone already {currentAge} when the Accord begins gets no custodial accumulation and fewer
              compounding years, which is the whole gap between the dashed line and the solid ones.
            </p>
            <p className="mt-2">
              <strong>These are extrapolations past the model's horizon.</strong> The fiscal engine is built
              and validated over 35 years. Following a cohort to 65 runs it to Accord year {HORIZON}, which
              assumes the enterprise-value growth path holds for another half century. Treat the ages past
              about 45 as illustrating the shape of the mechanism, not as a forecast.
            </p>
          </InfoBox>
        </div>
      </div>
    </PageShell>
  );
}
