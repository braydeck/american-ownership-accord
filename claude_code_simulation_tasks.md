# American Ownership Accord — Simulation Tasks for Claude Code

## Context

The American Ownership Accord is a comprehensive fiscal and ownership reform proposal. The key mechanisms relevant to these simulations are:

1. **EV Growth Tax**: 20% tax on enterprise value *growth* (not existing value), paid in corporate scrip (equity) to the American Capital Fund (AMCF). Existing shareholders retain 100% of pre-growth value and 80% of new value created. Replaces the corporate income tax (reduced to 0%).
2. **Universal Prebate**: $5,000 per capita annually, unconditional, tax-free. Replaces SNAP, EITC, CTC, TANF, WIC (sharp cutoff on prebate activation date, no phased transition).
3. **10% VAT**: Universal, no exemptions. Regressivity offset by prebate.
4. **Worker Codetermination**: 4% annual Equity Excise Tax transfers employer equity to workers until a 20% worker ownership cap is reached (~5 years). Workers receive Phantom Stock Units (PSUs) with dividend rights and cash-out on departure. 20% Stewardship Trust voting bloc for worker governance.
5. **Codetermination Credit**: The Equity Excise generates Codetermination Credits equal to its full value. Credits may offset up to 20% of EV Growth Tax liability in any year, carrying forward indefinitely. This means the AMCF receives at least 80% of the Growth Tax from Year 1, even during the worker equity ramp. This is critical for modeling: the AMCF accumulates ~$4-5T in equity by Year 6, NOT near-zero as a simple deduction model would suggest.
6. **AMCF Citizen Grants**: The greater of 15% of AMCF distributable income or $500 per capita annually. $500 minimum funded via SPV bridge in Phase 1 when distributable income is insufficient. Custodial accounts for children from birth.
7. **Land Value Tax**: 3% on unimproved land value, $250K homeowner exemption.
8. **Payroll Donut Hole Fix**: 12.4% Social Security tax reapplied above $400K.
9. **Income Tax Adjustments**: +3-5% on brackets above median income, more above $1M.
10. **Capital Gains Reform**: 0% up to $200K, 20% from $200K-$1M, ordinary rates above $1M.
11. **$10M Small Business Exemption**: No EV Growth Tax below $10M enterprise value.

The companion documents are `American_Ownership_Main.md` and `Codetermination.md` in the project directory. Read them for full details on any mechanism referenced below.

---

## Task 1: Generational Wealth Projection — "The American Birthright"

### Goal
Monte Carlo simulation tracking a child born in Year 1 of the Accord through age 65, comparing wealth accumulation under the Accord versus the current system.

### Input Assumptions

**AMCF Citizen Grants (model as a function of time):**
- Statutory minimum: $500/person/year at all times (funded via SPV bridge when distributable income insufficient)
- Years 1-3: $500/person/year (floor binding, fund still scaling)
- Years 4-6: $500-600/person/year (15% formula begins approaching and may exceed floor as AMCF reaches $4-5T and generates $100-150B in dividends)
- Years 7-13: $600-1,000/person/year (15% formula exceeds floor as fund compounds rapidly)
- Years 14-18: $1,000-1,500/person/year (Phase 3)
- Years 18+: $1,500-2,500/person/year (Phase 4)
- NOTE: The Codetermination Credit design means the AMCF receives 80% of Growth Tax from Year 1, so the fund is much larger in early years than a simple deduction model would suggest. The 15% formula exceeds the $500 floor much earlier than under the old design.
- Grants deposited into custodial account until age 18, then transfer to personal AMCF account
- Grants vest on 3-year staggered schedule for adults
- The $500 floor means custodial accounts reach ~$15,000-17,000 at age 18 under conservative assumptions, potentially $20,000+ if the 15% formula exceeds the floor during the child's later years

**Fund Returns:**
- Draw annual returns from historical S&P 500 distribution (mean ~10% nominal, std dev ~16%)
- Apply to both AMCF custodial account compounding and 401(k) comparison
- Run 10,000 Monte Carlo paths

**Worker PSU Accumulation:**
- Employment begins at age 16-22 (model as distribution: 10% at 16, 15% at 18, 40% at 22, 25% at 25, 10% at 28)
- PSU value per worker: employer enterprise value per employee × 20% worker pool share ÷ number of employees
- Use Census Bureau Statistics of US Businesses for employer size distribution: ~50% of workers at firms >500 employees (median EV/employee ~$400-600K), ~30% at firms 20-500 (median ~$200-400K), ~20% at firms <20 (~$100-200K, many below $10M threshold and exempt)
- Workers at exempt firms (<$10M) receive $1,000/year Sectoral Wealth Fund deposit instead
- Dividend yield on PSUs: 3-4% annually (post-CIT-abolition dividend increase)
- Job changes: model using BLS tenure data — average 12 jobs by age 50, with tenure increasing with age (median 2.8 years age 25-34, 4.1 years 35-44, 7.8 years 45-54, 10+ years 55-64)
- At each job change: PSUs redeemed at FMV, proceeds investable; new PSUs begin accruing at new employer

**Wage Trajectory:**
- Use BLS median weekly earnings by age group, annualized
- Age 16-24: $28K; 25-34: $48K; 35-44: $58K; 45-54: $59K; 55-64: $57K
- Apply 2% annual real wage growth trend

**Current System Comparison:**
- 401(k) participation rate: ~50% of workers overall, varying by income (30% for bottom quintile, 70% for top quintile)
- Average employee contribution: 6% of salary; average employer match: 3%
- Social Security: continues under both systems (unchanged)
- No AMCF grants, no PSUs, no prebate

**Prebate Savings:**
- Model assumption that some fraction of prebate is saved/invested
- Bottom quintile: 5% saved ($250/year); middle quintiles: 10-15% ($500-750/year); upper quintiles: 25%+ ($1,250/year)
- These are conservative — many low-income households will consume the full prebate

### Outputs

1. **Median net worth at ages 18, 25, 35, 45, 55, 65** under both systems, with 25th and 75th percentile bands
2. **Probability of reaching $100K, $250K, $500K, $1M** in net worth by age 65 under each system
3. **Breakout by birth income quintile** — what does a child born into the bottom 20% accumulate versus middle 50% versus top 20%?
4. **The "18th Birthday Number"** — what does the median child's custodial AMCF account contain at transfer? Show distribution.
5. **Chart: two wealth trajectory curves** (current vs Accord) with confidence bands, annotated with key milestones ("first job," "peak earning years," "retirement")

### Format
Interactive React artifact (`.jsx`) with sliders for:
- Average market return (default 10%)
- AMCF grant trajectory (conservative/base/optimistic)
- PSU dividend yield (default 3.5%)
- Employment start age (default 22)
- 401(k) participation rate for comparison (default 50%)

User should be able to toggle between income quintile views and see the curves update.

---

## Task 2: Distributional Impact — "Who Pays, Who Gains"

### Goal
Model the net tax burden change for every household in America, across the full income distribution, and produce the headline "X% of Americans are better off" number.

### Input Data Sources

**Income Distribution:**
- Use CPS ASEC or ACS data for household income distribution
- If microdata unavailable, use Census income brackets: $0-10K, $10-15K, $15-25K, $25-35K, $35-50K, $50-75K, $75-100K, $100-150K, $150-200K, $200-500K, $500K-1M, $1M+
- Number of households in each bracket from Census
- Average household size and number of children by bracket

**Current System (per bracket):**
- Federal income tax: calculate using 2024 brackets, standard deduction, filing status distribution
- Payroll tax: 7.65% employee side up to $168.6K cap, 1.45% above, 0.9% additional Medicare above $200K/$250K
- Capital gains tax: use IRS SOI data for average realized capital gains by income bracket; apply 0%/15%/20% structure
- Benefits received: SNAP participation rate and average benefit by income bracket (USDA data); EITC receipt rate and average credit by bracket (IRS SOI); CTC receipt rate and average credit (IRS SOI)

**Accord System (per bracket):**
- Federal income tax: same brackets with +3-5% adjustment above ~$100K, per Accord Section 4.3
- Payroll tax: same as current PLUS 6.2% employee-side reapplied above $400K (donut hole fix)
- Capital gains tax: 0% up to $200K, 20% $200K-$1M, ordinary income rates above $1M
- VAT: 10% on estimated consumption. Consumption-to-income ratio by bracket: bottom decile ~95%, median ~75%, top decile ~40%, top 1% ~15-25%. Use BLS Consumer Expenditure Survey data if available.
- Prebate: $5,000 × household size (unconditional)
- AMCF citizen grants: $500-750/person (Phase 2 estimate, scales higher in later phases; minimum $500 floor applies at all times)
- Worker equity dividends: estimate by bracket based on employment rate, employer size, and PSU value per worker. Exclude top bracket (C-suite excluded from Phantom Equity). Rough estimates: $1,500-2,000 for part-time/small firm workers, $3,000-4,000 for median full-time workers.
- Stock portfolio impact: the worker codetermination transfer (20% of existing ownership over 5 years) reduces existing shareholder claims, while the EV Growth Tax captures 20% of new value growth. Combined effect is approximately ~2% annual drag on existing stock portfolio returns. Apply to median stock wealth by bracket (use Fed SCF data for stock holdings by income/wealth percentile)

### Outputs

1. **Headline number: "X% of American households pay less under the Accord"** — count households where Accord net burden < current net burden
2. **By decile: percentage better off, worse off, neutral** (neutral = within ±$500)
3. **Median dollar change by decile** — how much more or less does each group pay?
4. **Effective tax rate curves** — current vs Accord across the full income range
5. **Breakeven income** — the precise income level where the Accord tips from net benefit to net cost
6. **Household type breakout**: single, married no kids, married with kids, single parent — each has different math due to per-capita prebate
7. **Table: for each decile, show income range, current effective rate, Accord effective rate, dollar change, and percentage of households in that decile who benefit**

### Format
Two deliverables:
1. **React artifact** (`.jsx`) with interactive income slider — user enters their household income, household size, and number of children, and sees their personal before/after comparison. This is the "calculator" that makes the pitch personal.
2. **Static summary chart** — clean bar chart showing dollar change by decile, suitable for embedding in a one-page policy brief. Green bars for deciles that benefit, red for those that pay more.

---

## Task 3: Racial Wealth Gap — "Closing the Divide"

### Goal
Model how the Accord's universal mechanisms affect the racial wealth gap over 10, 20, and 30 years.

### Input Data

**Current Wealth by Race (Federal Reserve SCF, most recent):**
- Median white household net worth: ~$285,000
- Median Black household net worth: ~$44,900
- Median Hispanic household net worth: ~$61,600
- Mean values also useful: white ~$1.1M, Black ~$192K, Hispanic ~$227K

**Asset Composition by Race (SCF):**
- White: ~23% stocks, ~42% real estate, ~12% retirement accounts
- Black: ~4.5% stocks, ~43% real estate, ~35% retirement accounts
- Hispanic: ~2.8% stocks, ~49% real estate, ~22% retirement accounts

**Income by Race (Census):**
- Median white household income: ~$81K
- Median Black household income: ~$56K
- Median Hispanic household income: ~$62K

**Homeownership by Race:**
- White: 75%; Black: 45%; Hispanic: 51%
- Relevant for LVT impact (homeowners with exemption vs renters who benefit from supply expansion)

**Employment and Firm Size by Race:**
- Use BLS/Census data on employment rates by race
- Assume similar employer size distribution across races (simplifying assumption)

### Modeling Approach

For each racial group, model a representative median household over 30 years:

**AMCF Grants:** Equal per capita — same for all races. This is the most equalizing mechanism because it's completely race-blind and additive to existing wealth.

**Worker PSUs:** Based on employment rate and median income by race. Black and Hispanic workers are more likely to be in service-sector jobs at larger companies (retail, hospitality, logistics), which are above the $10M threshold and generate PSUs. Model PSU accumulation using race-specific median wages and employment rates.

**Prebate Impact:** $5,000/person is a much larger percentage of income for Black ($56K median) and Hispanic ($62K median) households than for white ($81K median). The savings rate differential means more of the prebate becomes investable wealth for lower-income households.

**Stock Portfolio Impact:** Minimal for Black and Hispanic households (they hold almost no stock). Significant for white households (23% of assets). The worker codetermination transfer dilutes existing ownership, and the EV Growth Tax captures 20% of future value growth — both effects reduce returns on existing stock portfolios, disproportionately affecting white household wealth, which is the mechanism that narrows the gap.

**LVT Impact:** Complex. Homeowners below the $250K exemption threshold (most Black and Hispanic homeowners) pay minimal LVT. Homeowners with expensive land (disproportionately white, particularly in coastal metros) pay more. Renters (disproportionately Black and Hispanic) benefit from LVT-driven housing supply expansion reducing rents over 5-10 years. Model a 10-15% rent reduction over 10 years in metro areas attributable to LVT.

**401(k)/Retirement:** Current racial gap in 401(k) participation and balance is enormous. The Accord replaces reliance on 401(k) with universal AMCF and PSU accumulation, which benefits those who currently participate least (Black and Hispanic workers).

### Outputs

1. **Projected median household net worth by race at Year 10, 20, 30** under both systems
2. **White-to-Black wealth ratio over time**: currently ~6.3:1, model trajectory. Show the Accord narrowing this to X:1 by Year 30.
3. **White-to-Hispanic wealth ratio over time**: currently ~4.6:1
4. **Decomposition**: how much of the gap closure comes from AMCF grants vs worker PSUs vs prebate savings vs reduced returns on existing stock portfolios (codetermination + growth tax) vs LVT housing effects?
5. **Chart: three lines** (white, Black, Hispanic median wealth) under current system vs three lines under Accord, showing convergence

### Format
Static charts suitable for a policy brief (`.html` or `.jsx`), plus underlying data tables. Clean, professional, no interactivity needed — this is for presentations and publications.

---

## Task 4: Retirement Security — "The New Safety Net"

### Goal
Model retirement outcomes for workers entering the workforce today under both systems.

### Input Assumptions

**Career Path:**
- Enter workforce at age 22, retire at age 67 (45-year career)
- Wage trajectory: BLS median earnings by age (same as Task 1)
- Model by income quintile: bottom 20% (starting $22K), middle 60% (starting $35-55K), top 20% (starting $70K+)

**Current System:**
- Social Security: use SSA benefit formula — average indexed monthly earnings, bend points, PIA calculation. Rough outcome: median retiree receives ~$22K/year
- 401(k): participation rates by income quintile (30%/45%/55%/65%/75%), average contribution rate 6%, employer match 3% (where offered — only ~50% of employers offer)
- IRA contributions: model supplemental savings for higher quintiles
- Market returns: same distribution as Task 1

**Accord System:**
- Social Security: unchanged, same benefit
- AMCF grants: accumulating from birth (18 years before workforce entry) plus 45 years of working-age grants
- Worker PSUs: accumulating across career with job changes, same model as Task 1
- Prebate: $5,000/year, model savings rate by quintile
- 401(k) continues to exist but becomes supplemental rather than primary retirement vehicle

### Outputs

1. **Median retirement wealth at age 67 by income quintile** under both systems
2. **Annual retirement income comparison**: Social Security + 401(k) drawdown vs Social Security + AMCF dividends + accumulated PSU value
3. **Percentage of workers reaching retirement with less than $50K, $100K, $250K** under each system
4. **The "retirement gap" closing**: currently ~40% of Americans approach retirement with less than $50K in savings. What does the Accord reduce this to?
5. **Headline number: "Under the Accord, X% fewer Americans reach retirement with inadequate savings"**

### Format
Clean comparative charts (`.jsx` or `.html`). Side-by-side bars showing retirement wealth by quintile under each system.

---

## Task 5: Market Stabilization — "The Steady Hand"

### Goal
Simulate how the AMCF as a passive non-trading holder of 15-20% of US equities would have affected historical market crashes.

### Input Data

**Historical Crash Data:**
- 2008 Financial Crisis: S&P 500 daily prices, Oct 2007 peak to Mar 2009 trough (~57% drawdown), recovery to previous peak by Mar 2013
- 2020 COVID Crash: Feb 2020 peak to Mar 2020 trough (~34% drawdown), recovery by Aug 2020
- 2022 Correction: Jan 2022 peak to Oct 2022 trough (~25% drawdown)
- Use daily closing prices from Yahoo Finance or equivalent

**AMCF Model:**
- AMCF holds 15% of total market capitalization (mature state)
- AMCF does not trade — zero sell volume contribution during drawdowns
- AMCF does not buy during drawdowns (it receives scrip, not market-purchased equity)
- AMCF shares are effectively removed from the tradeable float

**Market Microstructure Assumptions:**
- Price impact of selling: use Kyle's lambda or Amihud illiquidity ratio estimates
- Key insight: during crashes, ~60-70% of selling is mechanically forced (margin calls, fund redemptions, risk management triggers). If 15% of float is non-tradeable, the pool of shares available for forced selling is smaller, which means less forced-selling volume, which means less price impact.
- Simplified model: assume crash depth is proportional to forced selling volume as a fraction of available float. If available float decreases by 15%, forced selling as a fraction of float increases, but absolute selling volume decreases (fewer shares to margin-call against).
- More sophisticated model: use historical volume data during crash periods and model what happens when 15% of outstanding shares generate zero sell orders.

**Secondary Effects:**
- Reduced crash depth means fewer margin calls triggered, which means even less forced selling — positive feedback loop
- Faster recovery because less overshooting
- Lower volatility in normal markets due to reduced float (double-edged: slightly higher volatility from remaining float, but structurally less forced selling)

### Outputs

1. **Simulated crash depth with vs without AMCF** for each historical crash
2. **Recovery time comparison** (days/months to reach pre-crash peak)
3. **Headline number: "The 2008 crash would have been X% instead of 57%"**
4. **Volatility comparison**: annualized volatility with vs without AMCF stabilizer
5. **Interactive chart**: overlay actual historical drawdowns with simulated AMCF-buffered drawdowns

### Format
React artifact (`.jsx`) with interactive chart. User can toggle between crash scenarios and adjust AMCF market share (10%, 15%, 20%) to see sensitivity.

---

## General Technical Notes

- All monetary values in 2024 dollars unless otherwise specified
- Use real returns (inflation-adjusted) for long-horizon projections
- All simulations should include sensitivity analysis on key assumptions
- Monte Carlo simulations should use at least 10,000 paths
- Charts should be clean, professional, minimal — suitable for a policy audience, not an academic one
- Color scheme: use greens for Accord benefits, blues for current system, reds for costs
- Every chart should have a single clear headline takeaway that could be pulled as a quote

## Reference Documents

The full policy documents are in the project directory:
- `American_Ownership_Main.md` — The American Ownership Accord (main tax and fiscal architecture)
- `Codetermination.md` — The codetermination and worker equity framework

Read these for any questions about specific mechanisms, rates, thresholds, or phase-in timelines.
