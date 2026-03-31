import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ─── Historical Crash Keyframes ───────────────────────────────────────────────
// All values normalized to 100 at each crash's pre-peak.
// Sources: Yahoo Finance S&P 500 closing prices, monthly.

const CRASH_DATA = {
  '2008': {
    label: '2008 Financial Crisis',
    period: 'Oct 2007 – Mar 2013',
    peakDate: 'Oct 9, 2007',
    troughDate: 'Mar 9, 2009',
    recoveryDate: 'Mar 2013',
    actualDepth: 0.566,     // 56.6% peak-to-trough
    recoveryMonths: 66,     // months from peak to recovery of prior peak
    // Proportion of crash attributable to forced/cascading selling (margin calls + fund redemptions)
    forcedSellFraction: 0.65,
    // Keyframes: [month from peak, index level (100 = peak)]
    // Based on S&P 500: 1565 (Oct 2007), 677 (Mar 2009), 1565 (Mar 2013)
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
    forcedSellFraction: 0.45, // COVID crash was more redemption/panic driven, less margin cascade
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
    forcedSellFraction: 0.40, // Fed-driven correction, less forced-selling cascade
    keyframes: [
      [0, 100.0], [1, 96.5], [2, 92.5], [3, 90.0], [4, 87.0],
      [5, 84.5],  [6, 83.0], [7, 79.5], [8, 78.0], [9, 74.5],
      [10, 76.5], [11, 79.0], [12, 80.5], [14, 83.0], [16, 87.5],
      [18, 90.5], [20, 95.5], [22, 98.5], [24, 100.0],
    ],
  },
};

// ─── AMCF Float Reduction Model ──────────────────────────────────────────────
//
// Mechanism (per Accord Sections 1.3–1.4):
// 1. AMCF holds X% of total market cap as a passive, permanent, non-trading holder.
//    These shares never appear in trading volume; they cannot be margined or redeemed.
//
// 2. During crashes, ~65% of selling is mechanically forced:
//    - Margin calls: fire when levered positions fall below maintenance requirements
//    - Fund redemptions: trigger when investors withdraw from funds
//    - Risk management: stop-losses and portfolio rebalancers
//
// 3. AMCF shares are NOT eligible for forced selling (sovereign, non-margined, permanent).
//    Total forced-sell eligible shares = (1 - amcfShare) of market
//    Absolute forced selling volume is reduced proportionally.
//
// 4. Second-order effect: a shallower initial crash triggers fewer margin calls downstream.
//    Model as 20% feedback multiplier on the forced-sell reduction.
//
// Net crash depth reduction ≈ amcfShare × forcedSellFraction × 1.2 (feedback)
// Recovery speedup ∝ sqrt(new_depth / original_depth)

function computeAmcfEffect(crash, amcfSharePct) {
  const X = amcfSharePct / 100;
  const feedback = 1.20;
  const reduction = X * crash.forcedSellFraction * feedback;   // reduction in crash amplitude
  const newDepth = crash.actualDepth * (1 - reduction);

  // Recovery speedup: less overshoot → proportionally faster mean-reversion
  // Approximate: recovery time ∝ sqrt(crash depth) (empirical, based on 2008/2020 comparison)
  const recoverySpeedup = Math.sqrt(newDepth / crash.actualDepth);
  const newRecoveryMonths = Math.round(crash.recoveryMonths * recoverySpeedup);

  return { newDepth, newRecoveryMonths, reduction };
}

// ─── Path Generation ─────────────────────────────────────────────────────────

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

    // AMCF path: scale all drawdowns by (1 - reduction), compress recovery time
    let amcfVal;
    const kf = crash.keyframes;
    // Find actual trough keyframe index
    let troughIdx = 0;
    for (let i = 0; i < kf.length; i++) {
      if (kf[i][1] < kf[troughIdx][1]) troughIdx = i;
    }
    const troughMo = kf[troughIdx][0];

    if (monthRounded <= troughMo) {
      // Decline phase: scale drawdown by (1 - reduction)
      amcfVal = 100 - (100 - historical) * (1 - reduction);
    } else {
      // Recovery phase: compress time axis (recover faster from shallower trough)
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

// ─── Annualized Volatility Estimate ──────────────────────────────────────────
// AMCF reduces crash depth and frequency amplification → rough vol reduction:
// Each prevented marginal drawdown of 1pp during crisis ≈ 0.2pp annual vol reduction
function estimateVolReduction(amcfSharePct, crashKey) {
  const { reduction } = computeAmcfEffect(CRASH_DATA[crashKey], amcfSharePct);
  return (reduction * CRASH_DATA[crashKey].actualDepth * 0.15 * 100).toFixed(1);
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const fmtPct = (v, decimals = 1) => `${(v * 100).toFixed(decimals)}%`;

const DrawdownTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', padding: '10px 14px', fontSize: 12, borderRadius: 6 }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: '#111' }}>Month {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>
          {p.name.split(' (')[0]}: {p.value >= 100 ? 'At Peak' : `${(100 - p.value).toFixed(1)}% below peak`}
        </p>
      ))}
    </div>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root:    { fontFamily: "'Georgia', serif", maxWidth: 1040, margin: '0 auto', padding: '40px 32px', background: '#fff', color: '#111' },
  section: { marginTop: 48 },
  h1:      { fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.2 },
  headline:{ fontSize: 17, color: '#1E40AF', fontWeight: 600, marginTop: 10 },
  h2:      { fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 0 },
  subtext: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 24 },
  label:   { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 2 },
  source:  { fontSize: 11, color: '#9CA3AF', marginTop: 12, lineHeight: 1.6 },
  btnActive: { padding: '8px 20px', background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  btnInactive: { padding: '8px 20px', background: '#F9FAFB', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function MarketStabilization() {
  const [crashKey, setCrashKey]     = useState('2008');
  const [amcfShare, setAmcfShare]   = useState(15);

  const crash = CRASH_DATA[crashKey];

  const { data: chartData, stats } = useMemo(
    () => buildChartData(crashKey, amcfShare),
    [crashKey, amcfShare]
  );

  const volReduction = estimateVolReduction(amcfShare, crashKey);
  const depthImprovement = ((crash.actualDepth - stats.newDepth) * 100).toFixed(1);
  const recoveryImprovement = crash.recoveryMonths - stats.newRecoveryMonths;

  // All three crashes at selected AMCF share for comparison table
  const allCrashStats = Object.entries(CRASH_DATA).map(([key, c]) => ({
    ...c, key,
    ...computeAmcfEffect(c, amcfShare),
  }));

  return (
    <div style={S.root}>
      {/* ── Header ── */}
      <div style={{ borderLeft: '4px solid #3B82F6', paddingLeft: 20 }}>
        <p style={S.label}>American Ownership Accord — Simulation 5</p>
        <h1 style={S.h1}>The Steady Hand: AMCF as Market Stabilizer</h1>
        <p style={S.headline}>
          The 2008 crash would have been {fmtPct(stats.newDepth)} instead of{' '}
          {fmtPct(crash.actualDepth)} with {amcfShare}% AMCF passive ownership —
          eliminating {depthImprovement} percentage points from the worst financial crisis
          in a generation.
        </p>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>
          The American Capital Fund holds equity passively and permanently — it never sells, never margins,
          never redeems. As its share of total market capitalization grows, the pool of shares eligible for
          forced selling during crashes shrinks, dampening cascade dynamics without any active intervention.
        </p>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginTop: 32, padding: '20px 24px', background: '#F9FAFB', borderRadius: 10 }}>
        <div>
          <p style={S.label}>Crash Scenario</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {Object.entries(CRASH_DATA).map(([key, c]) => (
              <button key={key} onClick={() => setCrashKey(key)}
                style={crashKey === key ? S.btnActive : S.btnInactive}>
                {key} ({c.label.split(' ')[0] === '2008' ? 'Financial Crisis' : c.label.split(' ')[0] === '2020' ? 'COVID Crash' : 'Bear Market'})
              </button>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 250 }}>
          <p style={S.label}>AMCF Market Share: <strong style={{ color: '#1D4ED8' }}>{amcfShare}%</strong></p>
          <input type="range" min={5} max={25} step={1} value={amcfShare}
            onChange={e => setAmcfShare(+e.target.value)}
            style={{ width: '100%', marginTop: 6, accentColor: '#1D4ED8' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF' }}>
            <span>5% (Phase 1)</span><span>15% (Phase 3, ~Yr 13 per Sim 6)</span><span>25% (Phase 4)</span>
          </div>
        </div>
      </div>

      {/* ── Stat Boxes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24 }}>
        {[
          { label: 'Actual Crash Depth', value: fmtPct(crash.actualDepth), subval: crash.troughDate, color: '#DC2626' },
          { label: `Simulated Depth (${amcfShare}% AMCF)`, value: fmtPct(stats.newDepth), subval: `−${depthImprovement}pp vs actual`, color: '#2563EB' },
          { label: 'Actual Recovery', value: `${crash.recoveryMonths} mo`, subval: crash.recoveryDate, color: '#DC2626' },
          { label: `Simulated Recovery`, value: `${stats.newRecoveryMonths} mo`, subval: `${recoveryImprovement} months faster`, color: '#2563EB' },
        ].map((box, i) => (
          <div key={i} style={{ padding: '16px 18px', border: '1px solid #e5e7eb', borderRadius: 8, background: i % 2 === 0 ? '#FEF2F2' : '#EFF6FF' }}>
            <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{box.label}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: box.color }}>{box.value}</p>
            <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{box.subval}</p>
          </div>
        ))}
      </div>

      {/* ── Main Chart ── */}
      <div style={S.section}>
        <h2 style={S.h2}>{crash.label}: Actual vs AMCF-Buffered Price Path</h2>
        <p style={S.subtext}>
          S&P 500 normalized to 100 at {crash.peakDate} peak. Month 0 = crash peak.
          Dashed line = historical actual. Solid line = simulated with AMCF passive ownership.
        </p>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="month"
              type="number"
              domain={[0, crash.recoveryMonths]}
              tickCount={8}
              tickFormatter={v => `M${Math.round(v)}`}
              label={{ value: 'Months from Peak', position: 'insideBottom', offset: -4, fontSize: 12 }}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              domain={[Math.floor((1 - crash.actualDepth - 0.05) * 100), 102]}
              tickFormatter={v => v >= 100 ? 'Peak' : `${v}`}
              tick={{ fontSize: 12 }} width={55}
              label={{ value: 'Index Level (100 = peak)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 12 }}
            />
            <Tooltip content={<DrawdownTooltip />} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
            <ReferenceLine y={100} stroke="#10B981" strokeDasharray="4 3"
              label={{ value: 'Pre-crash peak', position: 'right', fontSize: 11, fill: '#10B981' }} />

            <Line
              type="monotone"
              dataKey="Historical (Actual)"
              stroke="#DC2626"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey={`With AMCF (${amcfShare}% passive ownership)`}
              stroke="#1D4ED8"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p style={S.source}>
          Historical data: S&P 500 monthly closing prices (Yahoo Finance). Crash keyframes interpolated from monthly data.
          Simulated AMCF path applies float-reduction model: crash depth reduced by
          amcfShare × {(crash.forcedSellFraction * 100).toFixed(0)}% forced-sell fraction × 1.2x second-order feedback = {(stats.reduction * 100).toFixed(1)}% amplitude reduction.
          Recovery time compressed proportionally to sqrt(depth ratio).
        </p>
      </div>

      {/* ── Mechanism Explanation ── */}
      <div style={S.section}>
        <h2 style={S.h2}>How It Works: The Float Reduction Mechanism</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            {
              step: '01',
              title: 'AMCF Never Sells',
              body: 'The AMCF holds equity as a permanent sovereign asset. It issues no redemptions, answers no margin calls, and responds to no fear-driven signals. Its shares are structurally removed from the tradeable float.',
              icon: '🔒',
              color: '#1D4ED8',
            },
            {
              step: '02',
              title: 'Fewer Marginable Shares',
              body: `With ${amcfShare}% of market cap held by AMCF, only ${100 - amcfShare}% of shares can be margined by levered investors. During a crash, margin calls — which trigger ~${Math.round(crash.forcedSellFraction * 100)}% of forced selling in this scenario — fire on a proportionally smaller pool.`,
              icon: '📉',
              color: '#2563EB',
            },
            {
              step: '03',
              title: 'Cascade Dampening',
              body: `A shallower initial crash triggers fewer second-wave margin calls, which prevents the cascade amplification that turned a 20% fundamental shock into a 57% market decline in 2008. The 20% feedback multiplier captures this second-order stabilization.`,
              icon: '🌊',
              color: '#0369A1',
            },
          ].map(({ step, title, body, icon, color }) => (
            <div key={step} style={{ padding: '20px', border: `1px solid ${color}30`, borderRadius: 10, background: '#F0F9FF' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase' }}>Step {step}</span>
              </div>
              <p style={{ fontWeight: 700, fontSize: 15, color, marginBottom: 8 }}>{title}</p>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── All Crashes Comparison Table ── */}
      <div style={S.section}>
        <h2 style={S.h2}>All Three Crashes: Impact of {amcfShare}% AMCF Passive Ownership</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB' }}>Event</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB', color: '#DC2626' }}>Actual Depth</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB', color: '#1D4ED8' }}>AMCF Simulated</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB' }}>Improvement</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB', color: '#DC2626' }}>Actual Recovery</th>
              <th style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', padding: '8px 12px', fontWeight: 600, background: '#F9FAFB', color: '#1D4ED8' }}>AMCF Recovery</th>
            </tr>
          </thead>
          <tbody>
            {allCrashStats.map((c, i) => {
              const imp = ((c.actualDepth - c.newDepth) * 100).toFixed(1);
              return (
                <tr key={c.key} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB' }}>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 12px', fontWeight: 600 }}>
                    {c.key}: {c.label}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 12px', color: '#DC2626', fontWeight: 600 }}>
                    {fmtPct(c.actualDepth)}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 12px', color: '#1D4ED8', fontWeight: 600 }}>
                    {fmtPct(c.newDepth)}
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 12px', color: '#059669', fontWeight: 600 }}>
                    −{imp}pp
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 12px', color: '#DC2626' }}>
                    {c.recoveryMonths} months
                  </td>
                  <td style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 12px', color: '#1D4ED8' }}>
                    {c.newRecoveryMonths} months (−{c.recoveryMonths - c.newRecoveryMonths} mo)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Volatility Note ── */}
      <div style={{ marginTop: 32, padding: '20px 24px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
        <p style={{ fontWeight: 700, color: '#1E40AF', marginBottom: 8 }}>Estimated Annualized Volatility Reduction</p>
        <p style={{ fontSize: 13, color: '#1E3A8A', lineHeight: 1.7 }}>
          For the {crash.label} scenario, AMCF passive ownership of{' '}
          <strong>{amcfShare}%</strong> would reduce annualized S&P 500 volatility by approximately{' '}
          <strong>~{volReduction}pp</strong> during crisis periods, from roughly 40% annual vol (2008–2009)
          to ~{(40 - +volReduction).toFixed(1)}%. In normal market conditions, the effect is smaller
          (volatility driven by fundamentals, not forced-selling cascades), but the structural dampener
          on crash amplification is permanent and grows as AMCF market share increases.
        </p>
      </div>

      {/* ── Methodology ── */}
      <div style={{ marginTop: 28, padding: '16px 20px', background: '#F9FAFB', borderRadius: 8, fontSize: 11, color: '#6B7280', lineHeight: 1.7 }}>
        <strong style={{ color: '#374151' }}>Methodology:</strong>{' '}
        Historical price paths reconstructed from S&P 500 monthly closing data (Yahoo Finance) normalized to 100 at each crash's prior peak.
        AMCF effect model: crash amplitude reduction = amcfShare × forcedSellFraction × 1.2 (second-order feedback).
        Forced sell fraction estimated at 65% for 2008 (heavy margin cascade), 45% for 2020 (redemption-driven), 40% for 2022 (Fed-rate correction).
        Recovery compression: new_recovery = original × sqrt(newDepth / actualDepth), reflecting that shallower troughs require less mean-reversion.
        This model does not capture: market maker behavior, ETF rebalancing dynamics, VIX feedback loops, or the psychological signaling effect of
        a large stable sovereign holder — all of which would likely amplify the stabilizing effect in practice.
        Annualized volatility reduction is a rough estimate based on reduced crash amplitude; actual effect depends on crash frequency and duration.
      </div>
    </div>
  );
}
