import React, { useState } from 'react';

const METRICS = [
  { value: 'Year 16', label: 'Fiscal Crossover', sub: 'Revenue exceeds spending' },
  { value: '$1.7M', label: 'Median Net Worth', sub: 'By Year 30' },
  { value: '99%+', label: 'Households Better Off', sub: 'By Year 5' },
  { value: '0.0%', label: 'Retirement Inadequacy', sub: 'All quintiles' },
];

const PRIMARY = [
  { key: 'fiscal', title: 'National Balance Sheet', desc: '35-year sovereign balance sheet projection — deficit, debt, AMCF equity, and fiscal crossover' },
  { key: 'dashboard', title: 'Household Impact', desc: 'Interactive dashboard showing wealth, income, and distributional impact across demographics' },
  { key: 'inequality', title: 'Inequality', desc: 'Three Gini variants, security floor analysis, and provision decomposition — how the Accord reshapes the distribution' },
];

const LAB = [
  { key: 'household', title: 'Distributional Impact', desc: 'Personal calculator showing your household\'s net change under the Accord' },
  { key: 'wealth', title: 'Lifetime Wealth', desc: 'Monte Carlo simulation of wealth accumulation from birth to retirement' },
  { key: 'retirement', title: 'Retirement Security', desc: 'Retirement adequacy analysis across all income quintiles' },
  { key: 'racial', title: 'Racial Wealth Gap', desc: '30-year convergence projection for White, Black, and Hispanic households' },
  { key: 'incometax', title: 'Income Tax Design', desc: 'Two-rate income tax optimizer with distributional impact analysis' },
  { key: 'renttax', title: 'Rent Tax Optimizer', desc: 'LVT, carbon, and financial transaction tax portfolio builder' },
  { key: 'market', title: 'Market Stabilization', desc: 'Historical crash dampening model with AMCF float reduction' },
];

export default function AboutPage({ onNavigate }) {
  const [hoveredCard, setHoveredCard] = useState(null);

  const cardBase = {
    background: '#fff', borderRadius: 8, padding: '28px 24px', cursor: 'pointer',
    border: '1px solid #e8e4df', transition: 'all 0.25s ease',
  };
  const cardHover = { borderColor: '#d4940a', boxShadow: '0 4px 20px rgba(15,29,47,0.08)' };

  const renderCard = (item, i, prefix) => {
    const id = `${prefix}-${i}`;
    const isHovered = hoveredCard === id;
    return (
      <div key={item.key}
        style={{ ...cardBase, ...(isHovered ? cardHover : {}) }}
        onClick={() => onNavigate(item.key)}
        onMouseEnter={() => setHoveredCard(id)}
        onMouseLeave={() => setHoveredCard(null)}
      >
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>{item.title}</div>
        <div style={{ fontSize: 14, color: '#5a6577', lineHeight: 1.5 }}>{item.desc}</div>
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: '#d4940a', letterSpacing: '0.02em' }}>
          Explore {isHovered ? '\u2192' : '\u2190'}
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: '#faf8f5', minHeight: '100vh' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(165deg, #0f1d2f 0%, #162840 50%, #1a3050 100%)',
        padding: '100px 48px 80px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.04,
          backgroundImage: 'repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 80px)',
        }} />
        <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#d4940a', marginBottom: 24 }}>
            Working Draft
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif", fontSize: 52, fontWeight: 800,
            color: '#fff', lineHeight: 1.15, marginBottom: 20, letterSpacing: '-0.01em',
          }}>
            The American<br />Ownership Accord
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, maxWidth: 600, margin: '0 auto 40px' }}>
            A simulation suite modeling universal wealth building through sovereign equity, worker ownership, and fiscal consolidation.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('fiscal')} style={{
              padding: '14px 32px', background: '#d4940a', color: '#0f1d2f', border: 'none',
              borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em',
            }}>
              National Balance Sheet
            </button>
            <button onClick={() => onNavigate('dashboard')} style={{
              padding: '14px 32px', background: 'transparent', color: '#fff',
              border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 6, fontSize: 15,
              fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>
              Household Impact
            </button>
          </div>
          <div style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 36, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, color: '#d4940a' }}>Year 16</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              Fiscal Crossover — the year total revenue structurally exceeds total spending
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
          {METRICS.map((m, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 800, color: '#0f1d2f' }}>{m.value}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', marginTop: 8 }}>{m.label}</div>
              <div style={{ fontSize: 13, color: '#94a0b2', marginTop: 4 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ maxWidth: 120, margin: '0 auto', height: 1, background: '#d4940a', opacity: 0.4 }} />

      {/* Explore Section */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 32px 64px' }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 800, color: '#0f1d2f', marginBottom: 8, textAlign: 'center' }}>
          Explore the Simulations
        </h2>
        <p style={{ fontSize: 15, color: '#5a6577', textAlign: 'center', marginBottom: 48, maxWidth: 500, margin: '0 auto 48px' }}>
          Nine interactive models spanning fiscal policy, distributional impact, and long-term wealth dynamics.
        </p>

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a0b2', marginBottom: 16 }}>The Three Pillars</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 40 }}>
          {PRIMARY.map((s, i) => renderCard(s, i, 'primary'))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a0b2', marginBottom: 16 }}>Policy Lab</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
          {LAB.map((s, i) => renderCard(s, i, 'lab'))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '40px 32px', borderTop: '1px solid #e8e4df' }}>
        <div style={{ fontSize: 13, color: '#94a0b2', letterSpacing: '0.02em' }}>American Ownership Accord — Working Draft</div>
      </div>
    </div>
  );
}
