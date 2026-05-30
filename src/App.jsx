import React, { useState, useEffect, useCallback } from 'react';
import GenerationalWealth from '../simulation-1-generational-wealth.jsx';
import DistributionalImpact from '../simulation-2-distributional-impact.jsx';
import RacialWealthGap from '../simulation-3-racial-wealth-gap.jsx';
import RetirementSecurity from '../simulation-4-retirement-security.jsx';
import MarketStabilization from '../simulation-5-market-stabilization.jsx';
import FiscalTrajectory from '../simulation-6-fiscal-trajectory.jsx';
import RentTaxOptimizer from '../simulation-7-rent-tax-optimizer.jsx';
import IncomeTax from '../simulation-8-income-tax.jsx';
import Dashboard from '../simulation-10-dashboard.jsx';
import InequalityMeasurement from '../simulation-11-inequality.jsx';
import AboutPage from './AboutPage.jsx';

const LAB = [
  { key: 'household', label: 'Distributional Impact', component: DistributionalImpact },
  { key: 'wealth', label: 'Lifetime Wealth', component: GenerationalWealth },
  { key: 'retirement', label: 'Retirement Security', component: RetirementSecurity },
  { key: 'racial', label: 'Racial Wealth Gap', component: RacialWealthGap },
  { key: 'incometax', label: 'Income Tax Design', component: IncomeTax },
  { key: 'renttax', label: 'Rent Tax Optimizer', component: RentTaxOptimizer },
  { key: 'market', label: 'Market Stabilization', component: MarketStabilization },
];

const LAB_KEYS = LAB.map(l => l.key);

function resolveComponent(page) {
  if (page === 'fiscal') return FiscalTrajectory;
  if (page === 'dashboard') return Dashboard;
  if (page === 'inequality') return InequalityMeasurement;
  const lab = LAB.find(l => l.key === page);
  if (lab) return lab.component;
  return null;
}

export default function App() {
  const [activePage, setActivePage] = useState('about');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [hoveredItem, setHoveredItem] = useState(null);

  const navigate = useCallback((page) => {
    setActivePage(page);
    setOpenDropdown(null);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!openDropdown) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpenDropdown(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openDropdown]);

  const isLabActive = LAB_KEYS.includes(activePage);

  const navBtn = (label, pageKey, isActive) => (
    <button
      onClick={() => navigate(pageKey)}
      style={{
        background: 'none', border: 'none', color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
        fontSize: 14, fontWeight: isActive ? 600 : 500, cursor: 'pointer', padding: '8px 16px',
        fontFamily: "'DM Sans', sans-serif", position: 'relative', transition: 'color 0.2s',
        borderBottom: isActive ? '2px solid #d4940a' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  );

  const dropdownBtn = (label, dropKey, items, isGroupActive) => {
    const isOpen = openDropdown === dropKey;
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpenDropdown(isOpen ? null : dropKey)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 16px',
            fontSize: 14, fontWeight: isGroupActive ? 600 : 500,
            color: isGroupActive ? '#fff' : 'rgba(255,255,255,0.65)',
            fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 5,
            borderBottom: isGroupActive ? '2px solid #d4940a' : '2px solid transparent',
            transition: 'color 0.2s',
          }}
        >
          {label}
          <span style={{
            display: 'inline-block', fontSize: 10, transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          }}>{'\u25BE'}</span>
        </button>
        {isOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 6,
            background: '#fff', borderRadius: 8, minWidth: 240, zIndex: 100,
            boxShadow: '0 8px 32px rgba(15,29,47,0.15), 0 1px 3px rgba(15,29,47,0.08)',
            border: '1px solid #e8e4df', overflow: 'hidden',
          }}>
            {items.map((item) => {
              const isActive = activePage === item.key;
              const isHovered = hoveredItem === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  onMouseEnter={() => setHoveredItem(item.key)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none',
                    background: isHovered ? '#faf8f5' : '#fff', cursor: 'pointer',
                    padding: '12px 20px', fontSize: 14, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#0f1d2f' : '#5a6577',
                    fontFamily: "'DM Sans', sans-serif",
                    borderLeft: isActive ? '3px solid #d4940a' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const ActiveComponent = activePage === 'about' ? null : resolveComponent(activePage);

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5' }}>
      {/* Overlay to close dropdown */}
      {openDropdown && (
        <div
          onClick={() => setOpenDropdown(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50 }}
        />
      )}

      {/* Header */}
      <header style={{
        background: '#0f1d2f', padding: '0 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, zIndex: 90,
        boxShadow: '0 1px 8px rgba(15,29,47,0.25)',
      }}>
        <button
          onClick={() => navigate('about')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, fontWeight: 700,
            color: '#fff', letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          }}
        >
          American Ownership Accord
        </button>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {navBtn('About', 'about', activePage === 'about')}
          {navBtn('National Balance Sheet', 'fiscal', activePage === 'fiscal')}
          {navBtn('Household Impact', 'dashboard', activePage === 'dashboard')}
          {navBtn('Inequality', 'inequality', activePage === 'inequality')}
          {dropdownBtn('Policy Lab', 'lab', LAB, isLabActive)}
        </nav>
      </header>

      {/* Content */}
      {activePage === 'about' ? (
        <AboutPage onNavigate={navigate} />
      ) : (
        <div style={{ padding: 24 }}>
          {ActiveComponent && <ActiveComponent />}
        </div>
      )}
    </div>
  );
}
