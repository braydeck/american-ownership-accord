import React, { useCallback } from 'react';
import { SiteHeader, LAB_ITEMS } from '@/components/layout/SiteHeader';
import { useHashPage } from '@/lib/url-state';
import AboutPage from '@/pages/AboutPage.jsx';
import NationalBalanceSheet from '@/pages/NationalBalanceSheet.jsx';
import HouseholdImpact from '@/pages/HouseholdImpact.jsx';
import Inequality from '@/pages/Inequality.jsx';
import DistributionalImpact from '@/pages/lab/DistributionalImpact.jsx';
import LifetimeWealth from '@/pages/lab/LifetimeWealth.jsx';
import RetirementSecurity from '@/pages/lab/RetirementSecurity.jsx';
import RacialWealthGap from '@/pages/lab/RacialWealthGap.jsx';
import IncomeTaxDesign from '@/pages/lab/IncomeTaxDesign.jsx';
import RentTaxOptimizer from '@/pages/lab/RentTaxOptimizer.jsx';
import MarketStabilization from '@/pages/lab/MarketStabilization.jsx';

const PAGES = {
  fiscal: NationalBalanceSheet,
  dashboard: HouseholdImpact,
  inequality: Inequality,
  household: DistributionalImpact,
  wealth: LifetimeWealth,
  retirement: RetirementSecurity,
  racial: RacialWealthGap,
  incometax: IncomeTaxDesign,
  renttax: RentTaxOptimizer,
  market: MarketStabilization,
};

export default function App() {
  const [activePage, setActivePage] = useHashPage('about');

  const navigate = useCallback((page) => {
    setActivePage(page);
    window.scrollTo(0, 0);
  }, [setActivePage]);

  const ActiveComponent = PAGES[activePage] || null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader activePage={activePage} onNavigate={navigate} />
      {activePage === 'about' ? (
        <AboutPage onNavigate={navigate} />
      ) : (
        <div className="p-6">
          {ActiveComponent && <ActiveComponent />}
        </div>
      )}
    </div>
  );
}
