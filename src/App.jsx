import React, { useState } from 'react';
import GenerationalWealth from '../simulation-1-generational-wealth.jsx';
import DistributionalImpact from '../simulation-2-distributional-impact.jsx';
import RacialWealthGap from '../simulation-3-racial-wealth-gap.jsx';
import RetirementSecurity from '../simulation-4-retirement-security.jsx';
import MarketStabilization from '../simulation-5-market-stabilization.jsx';
import FiscalTrajectory from '../simulation-6-fiscal-trajectory.jsx';

const TABS = [
  { id: 1, label: 'Generational Wealth',   component: GenerationalWealth },
  { id: 2, label: 'Distributional Impact', component: DistributionalImpact },
  { id: 3, label: 'Racial Wealth Gap',     component: RacialWealthGap },
  { id: 4, label: 'Retirement Security',   component: RetirementSecurity },
  { id: 5, label: 'Market Stabilization',  component: MarketStabilization },
  { id: 6, label: 'Fiscal Trajectory',     component: FiscalTrajectory },
];

export default function App() {
  const [active, setActive] = useState(1);
  const ActiveSim = TABS.find(t => t.id === active).component;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div style={{
        background: '#1e3a5f',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>
          American Ownership Accord
        </span>
        <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active === tab.id ? 700 : 400,
                background: active === tab.id ? '#f59e0b' : 'rgba(255,255,255,0.12)',
                color: active === tab.id ? '#1e3a5f' : '#e5e7eb',
                transition: 'background 0.15s',
              }}
            >
              {tab.id}. {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Simulation */}
      <div style={{ padding: '24px' }}>
        <ActiveSim />
      </div>
    </div>
  );
}
