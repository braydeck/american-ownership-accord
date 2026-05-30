# American Ownership Accord — Simulation Tasks for Claude Code

## Context

The American Ownership Accord is a comprehensive fiscal and ownership reform proposal. The key mechanisms relevant to these simulations are:

1. **EV Growth Tax**: 20% tax on enterprise value *growth* (not existing value), paid in corporate scrip (equity) to the American Capital Fund (AMCF). Existing shareholders retain 100% of pre-growth value and 80% of new value created. Replaces the corporate income tax (reduced to 0%). **The EV Growth Tax ceases generating scrip once the AMCF reaches 20% of total US corporate equity (~Year 19). After that, AMCF holdings grow organically with the market.**
2. **Universal Prebate**: $5,000 per capita annually, unconditional, tax-free, CPI-indexed. Replaces SNAP, EITC, CTC, TANF, WIC (sharp cutoff on prebate activation date, no phased transition).
3. **4% VAT**: Universal, no exemptions. Minimized rate — the Accord maximizes rent taxes first. The $5,000 prebate covers all VAT on $125,000 of consumption (~80% of households pay zero net consumption tax).
4. **10% LVT**: On unimproved land value, $500,000 homeowner exemption. Zero deadweight loss. Year 1 revenue ~$570B. Grows with land values (~GDP + 0.5%/yr land premium).
5. **$100/ton Carbon Tax**: Year 1 revenue ~$348B, declining over time as economy decarbonizes. Self-liquidating by design — serves as 15-20 year fiscal accelerator.
6. **0.5% Financial Transaction Tax**: UK stamp duty parity. Year 1 revenue ~$225B. Trading volume drops ~50% but doubled rate more than compensates. AMCF's 20% non-trading float reduces liquidity impact.
7. **25bp Financial Stability Levy**: On G-SIB total assets (~$20T). Year 1 revenue ~$48B. Captures too-big-to-fail implicit subsidy.
8. **Other Rent Taxes**: Resource royalty reform +8% ($48B), spectrum fees 2% ($15B), groundwater $25/acre-foot ($2.25B), pollution fees ($20B), congestion pricing ($12B). Total other: ~$97B.
4. **Worker Codetermination**: 4% annual Equity Excise Tax transfers employer equity to workers until a 20% worker ownership cap is reached (~5 years). Workers receive Phantom Stock Units (PSUs) with dividend rights and cash-out on departure. 20% Stewardship Trust voting bloc for worker governance.
5. **Codetermination Credit**: The Equity Excise generates Codetermination Credits equal to its full value. Credits may offset up to 20% of EV Growth Tax liability in any year, carrying forward indefinitely. This means the AMCF receives at least 80% of the Growth Tax from Year 1, even during the worker equity ramp. This is critical for modeling: the AMCF accumulates ~$4T in equity by Year 6, NOT near-zero as a simple deduction model would suggest.
6. **AMCF 20% Ownership Cap**: The AMCF accumulates scrip until it reaches 20% of total US corporate equity. Once at 20%, the EV Growth Tax stops generating scrip. The AMCF's domestic holdings grow organically through market appreciation only, permanently locked at 20% ownership. This is mathematically equivalent to an 80/20 proportional share issuance but without disrupting existing stock market mechanics.
7. **AMCF Cash Generation**: The AMCF generates cash through dividends AND proportional buyback participation. When any company executes a share buyback, the AMCF tenders its proportional share — receiving cash while its ownership percentage stays unchanged. Model AMCF cash flow as: `amcf_cash = amcf_equity × combined_payout_yield` where combined yield ramps from ~3.5% initially to ~6% at maturity.
8. **AMCF Distribution Waterfall (10/25/65)**: All AMCF cash is allocated: **10% Healthcare Reserve** (always), **25% Debt Reduction** while interest > 10% of revenue (solvency brake ON) OR **25% General Fund/Discretionary** once interest < 10% (brake OFF), **65% Citizen Grants** (always, subject to $500/capita minimum floor). The 25% debt reduction is applied DIRECTLY against gross debt, not through the deficit. This is critical: `debt = prior_debt + deficit - (amcf_cash × 0.25)` while brake is active.
9. **AMCF Citizen Grants**: 65% of AMCF annual cash income, distributed equally per capita. $500 minimum funded via SPV bridge in Phase 1. Custodial accounts for children from birth.
16. **Land Value Tax**: 10% on unimproved land value, $500K homeowner exemption. (See item 4 above for details.)
17. **Payroll Donut Hole Fix**: 12.4% Social Security tax reapplied above $400K.
18. **Income Tax Adjustments**: +3-5% on brackets above median income, more above $1M.
19. **Capital Gains Reform**: 0% up to $200K, 20% from $200K-$1M, ordinary rates above $1M.
20. **$10M Small Business Exemption**: No EV Growth Tax below $10M enterprise value.

**Validated milestone targets from the fiscal trajectory simulation (with optimized rent tax portfolio):**
- Year 1 deficit: ~$1.72T (below current baseline due to rent tax revenue)
- Debt peak: Year 15-16 (~$51T)
- AMCF self-funds grants: Year 9
- Fiscal crossover (first surplus): Year 16
- Net creditor (AMCF > debt): Year 19
- AMCF hits 20% ownership cap: Year 19
- Solvency brake deactivated: Year ~19
- Debt-free: Year ~26
- ~90% of households better off at Year 1 (T10 marginally negative at -0.6%), rising to 99%+ by Year 5 as T10 flips positive. Only T1+ (~1.5M households) bear permanent net cost.
- Custodial account at age 18: ~$44K (deterministic at 5% real)
- Bottom quintile retirement wealth: $10.95M median (vs $384K current system)
- White-to-Black wealth ratio: 6.3:1 → 1.9:1 by Year 30

The companion documents are `American_Ownership_Main.md` and `Codetermination.md` in the project directory. Read them for full details on any mechanism referenced below.

**PRIORITY ORDER: Build Task 6 (Fiscal Trajectory Simulator) FIRST.** The fiscal trajectory model is the foundation — every other simulation's headline numbers depend on the AMCF accumulation path being credible. Build it, validate it, then use the validated trajectory as input for Tasks 1-5.

---

## Task 6: Fiscal Trajectory Simulator — "The Path to Solvency"

### Goal
Build a comprehensive, interactive fiscal model that projects the Accord's deficit, debt, AMCF accumulation, and interest burden year-by-year over 35 years, with adjustable policy parameters. This is the master model that tests how different design choices affect the three critical milestones: fiscal crossover (deficit hits zero), the 10% interest-to-revenue threshold (solvency brake deactivation), and debt breakeven (gross debt begins declining).

### Why This Matters
The simplified models used during policy development made rough assumptions about revenue ramps, spending levels, and AMCF accumulation. This simulation should be rigorous enough to present to economists, bond analysts, and CBO-style reviewers. It needs to capture the dynamic interactions that the simplified models missed — particularly interest rate reflexivity (higher debt raises rates), AMCF market correlation (equity values and tax revenue move together), and the Codetermination Credit drawdown mechanics.

### Adjustable Parameters (Interactive Sliders)

**Core Policy Levers:**
- Equity Excise rate: 1% to 5% (default 4%) — controls speed of worker equity ramp and duration of AMCF suppression
- Codetermination Credit cap: 0% to 100% of Growth Tax per year (default 20%) — controls how much AMCF collects during and after ramp. 0% = no credit (full deduction, old design). 100% = full carryforward. 20% = current design where AMCF gets at least 80%.
- EV Growth Tax rate: 10% to 30% (default 20%)
- Worker equity equilibrium cap: 10% to 30% (default 20%)
- $10M small business exemption threshold: $5M to $50M (default $10M)
- AMCF citizen grant floor: $0 to $1,000/person (default $500)

**Revenue Assumptions:**
- VAT rate: 5% to 15% (default 10%)
- VAT compliance ramp: years to full compliance (default 3)
- LVT rate: 1% to 5% (default 10%)
- LVT assessment ramp: years to full coverage (default 5)
- LVT theoretical yield at full coverage: $200B to $600B (default $400B)
- Income tax adjustment: additional revenue from bracket increases, $0 to $300B (default $100B)
- Payroll donut hole revenue: $150B to $350B (default $225B)
- Healthcare reform savings ramp: $0 to $150B at maturity (default $80B)
- Immigration reform revenue: $0 to $100B at maturity (default varies)

**Macro Assumptions:**
- Starting national debt: $30T to $45T (default $36T)
- Starting annual deficit: $1.5T to $2.5T (default $1.95T)
- Base GDP: $28T to $35T (default $30T)
- Real GDP growth rate: 1% to 4% (default 2.5%)
- Inflation rate: 1% to 5% (default 2.5%)
- Base Treasury interest rate: 2% to 6% (default 3.5%)
- Interest rate reflexivity: basis points per percentage point of debt-to-GDP (0 to 5bp, default 3bp per Dallas Fed estimate)
- Total US corporate EV at Year 0: $40T to $60T (default $50T)
- Exempt EV share (sub-threshold firms): 5% to 15% (default 8%)
- Tier 2 share of taxable EV: 5% to 20% (default 12%)
- Tier 2 cash election take rate: 50% to 90% (default 70%)

**Market Assumptions:**
- Corporate EV growth distribution: 5 cohorts with adjustable growth rates and shares
  - Default: Declining 1% (10%), Low 3.5% (20%), Median 6.5% (30%), Above-median 10% (25%), High 15% (15%)
- Initial AMCF dividend yield: 1% to 3% (default 1.5%)
- Mature AMCF dividend yield: 2% to 6% (default 4%)
- Dividend yield ramp period: 3 to 12 years (default 8)

**Spending Assumptions:**
- Current federal primary spending (ex-interest): $4.5T to $6T (default $5.2T)
- Prebate cost: auto-calculated from $5,000 × population, ~$1.67-1.70T
- Universal childcare: $50B to $200B (default $100B)
- Paid family leave: $25B to $100B (default $50B)
- Dissolved welfare savings: $250B to $350B (default $290B, sharp cutoff on Day 1)
- SPV bridge cost for grant floor: auto-calculated from grant floor × population minus AMCF distributable income

### Model Architecture

**Year-by-Year Loop (35 years):**

For each year, calculate in order:

1. **Corporate EV by cohort**: grow each cohort's EV at its assigned rate
2. **EV Growth Tax**: configured rate × growth above threshold for each cohort
3. **Equity Excise**: if worker pool below cap, calculate excise at configured rate × current EV
4. **Codetermination Credits**: excise generates credits equal to full value; credits offset up to configured cap% of Growth Tax; remainder flows to AMCF as scrip
5. **Tier 2 cash**: cash election proceeds flowing to AMCF for equity purchases
6. **AMCF equity**: if AMCF ownership < 20% of total corporate EV: prior equity × (1 + market growth rate) + net scrip + tier 2 cash. If AMCF ownership ≥ 20%: prior equity × (1 + market growth rate) only — no new scrip, EV Growth Tax drops to $0. Track ownership as AMCF equity ÷ total corporate EV.
7. **AMCF cash flow**: equity × combined payout yield (dividends + buyback participation), ramping from initial ~3.5% to mature ~6% over configured years
8. **AMCF waterfall**: 10% of cash flow → Healthcare Reserve; 25% → debt reduction (if solvency brake ON) or general fund (if brake OFF); 65% → citizen grants (subject to configured floor × population minimum; shortfall funded by SPV)
9. **Revenue**: individual income tax + payroll + other existing taxes + VAT (ramping) + LVT (ramping) + income adjustment + payroll fix + healthcare reform savings + immigration reform + dissolved welfare savings − lost CIT. NOTE: AMCF cash flow does NOT flow through general fund revenue — it is distributed through the waterfall above.
10. **Spending**: current primary spending + prebate + childcare + family leave + SPV grant bridge − dissolved welfare
11. **Interest**: debt × blended rate, where blended rate = base rate + max(0, (debt-to-GDP − 100)) × reflexivity coefficient / 10000
12. **Deficit**: spending + interest − revenue
13. **Debt**: prior debt + deficit − (amcf_cash × 0.25 if solvency brake ON, else 0). The 25% debt reduction is applied DIRECTLY against gross debt, separate from the deficit calculation. This is critical.
14. **GDP**: prior GDP × (1 + real growth + inflation)
15. **Key ratios**: debt-to-GDP, interest-to-revenue, interest-to-spending, net sovereign position (debt − AMCF equity), AMCF ownership %

**Milestone Detection:**
- Fiscal crossover: first year where deficit ≤ 0
- 10% interest threshold: first year (after Year 3) where interest/revenue ≤ 10%
- Debt peak: first year where debt declines year-over-year
- Net creditor: first year where AMCF equity > gross debt
- AMCF self-funding grants: first year where 65% of AMCF cash income ≥ grant floor × population (SPV bridge no longer needed)
- AMCF ownership cap reached: first year where AMCF equity ≥ 20% of total corporate EV
- Solvency brake deactivated: first year where interest/revenue ≤ 10% (25% allocation flips from debt to discretionary)
- Debt-free: first year where gross debt ≤ 0

### Outputs

1. **Dashboard with milestone numbers prominently displayed**: Crossover Year, 10% Interest Year, Debt Peak Year, Net Creditor Year
2. **Primary chart**: Deficit trajectory (line chart, 35 years)
3. **Debt chart**: Gross debt and net sovereign position (debt minus AMCF equity) on same axes
4. **Interest chart**: Interest as % of revenue, with 10% threshold line highlighted
5. **AMCF chart**: Fund equity value and annual dividend income
6. **Revenue/spending decomposition**: stacked area chart showing all revenue sources and all spending categories over time
7. **Credit balance chart**: total outstanding Codetermination Credits over time, showing accumulation during ramp and drawdown thereafter
8. **Sensitivity summary table**: show how each key milestone changes when each major parameter is adjusted ±20% from default

### Scenario Presets
Build in one-click presets for common scenarios:
- **Base case**: all defaults as described above
- **Conservative**: lower growth (5% median), lower dividend yield (3%), higher interest reflexivity (5bp)
- **Optimistic**: higher growth (8% median), higher yield (5%), lower reflexivity (2bp)
- **Slow codetermination**: 2% excise rate instead of 4%
- **Fast codetermination**: 5% excise rate
- **No credit (old design)**: 0% credit cap — full current-year deduction, AMCF gets zero during ramp
- **Full carryforward**: 100% credit cap — AMCF gets nothing until all credits exhausted
- **Pre-Bush tax rates**: +$200B income tax adjustment
- **Recession at Year 3**: negative 3% EV growth for all cohorts in Year 3, recovery over Years 4-5
- **Recession at Year 10**: same but at Year 10
- **Higher starting debt**: $42T starting debt (post-OBBBA trajectory)
- **Current law comparison**: no Accord — just project current CBO baseline forward for 35 years as a reference line

### Format
Interactive React artifact (`.jsx`) with:
- Slider panel on the left for adjustable parameters, collapsible by category
- Dashboard of milestone numbers at top (large, prominent)
- Tabbed or scrollable chart area showing each chart
- Preset buttons for one-click scenario loading
- "Compare" mode: overlay two scenarios on the same charts with different colors
- Export: download current scenario data as CSV

---

## Task 1: Generational Wealth Projection — "The American Birthright"

### Goal
Monte Carlo simulation tracking a child born in Year 1 of the Accord through age 65, comparing wealth accumulation under the Accord versus the current system.

### Input Assumptions

**AMCF Citizen Grants (model as a function of time):**
- Statutory minimum: $500/person/year at all times (funded via SPV bridge when 65% of cash income is insufficient)
- Allocation: 65% of AMCF annual cash income (dividends + buyback participation), divided equally per capita
- Years 1-4: $500/person/year (floor binding, fund still small)
- Year 5: ~$550 (fund beginning to generate meaningful cash)
- Year 10: ~$1,066 (fund at $12T, generating $570B in cash, 65% = $370B ÷ 350M people)
- Year 15: ~$2,678
- Year 20: ~$5,597 (AMCF at 20% cap, organic growth only)
- Year 25: ~$8,958
- Year 30: ~$14,784
- NOTE: The 65% allocation produces substantially higher grants than the old 15% formula. Use validated simulation data above.
- Grants deposited into custodial account until age 18, then transfer to personal AMCF account
- Grants vest on 3-year staggered schedule for adults
- With the 65% allocation, custodial accounts reach ~$44,000 at age 18 (deterministic at 5% real, identical across all quintiles)

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
- AMCF citizen grants: use validated trajectory — $500 Year 1, $1,066 Year 10, $2,678 Year 15, $5,597 Year 20. Allocation is 65% of AMCF cash income.
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

**LVT Impact:** Complex. Homeowners below the $500K exemption threshold (most Black and Hispanic homeowners) pay minimal LVT. Homeowners with expensive land (disproportionately white, particularly in coastal metros) pay more. Renters (disproportionately Black and Hispanic) benefit from LVT-driven housing supply expansion reducing rents over 5-10 years. Model a 10-15% rent reduction over 10 years in metro areas attributable to LVT.

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

---

## Task 7: Rent Tax Portfolio Optimization — Minimizing the VAT

### Objective

Find the optimal combination of rent tax rates that maximizes revenue from economically non-distortionary taxes, with the goal of minimizing or eliminating the VAT. The core principle: taxes on fixed-supply resources and rent-seeking behavior have zero or near-zero deadweight loss and should be maximized before resorting to consumption taxes that distort economic activity.

### The Optimization Problem

**Objective function:** Minimize the VAT rate (ideally to 0%) while maintaining total consumption/rent tax revenue ≥ $2.0T (the current 10% VAT + 3% LVT target).

**Constraint:** The $5,000/person prebate (CPI-indexed) must be maintained regardless of VAT rate. It serves as the universal income floor replacing SNAP, EITC, CTC, TANF, and WIC. If the VAT is reduced or eliminated, the prebate cost drops only if the prebate amount itself is reduced — which is NOT permitted. The prebate stays at $5,000.

**Decision variables (rates to optimize):**

1. **Land Value Tax rate** (currently 3%, range to test: 3-15%)
   - Homeowner exemption: test both $250K and $500K thresholds
   - Must model capitalization: land value = rental_income / (discount_rate + lvt_rate). As the LVT rises, land values fall, shrinking the base. Use 5% discount rate.
   - Starting unimproved land value: ~$25-30T total US
   - Residential land: ~$16-17T (roughly 1/3 of $49.7T total residential real estate value)
   - Commercial land: ~$6-8T
   - Agricultural land: ~$3.5T
   - The homeowner exemption shields a portion of residential land. At $500K exemption with ~80M owner-occupied homes, estimate ~$10-13T shielded.
   - Revenue = LVT rate × (total land value after capitalization − exempt portion)
   - Key insight: revenue does NOT scale linearly with rate because of capitalization. Going from 3% to 10% roughly doubles revenue, not triples it.

2. **Carbon tax rate** (range: $0-200/ton CO2)
   - US CO2 emissions: ~5 billion metric tons/year
   - Behavioral response: emissions decrease as rate increases. Model as emissions = base × (1 − rate/K) where K calibrates the responsiveness. At $100/ton, emissions should drop ~30-35%. At $200/ton, ~50-60%.
   - Revenue = rate × adjusted emissions
   - Revenue has a Laffer curve — it peaks around $100-150/ton and declines beyond that. Find the peak.
   - Revenue is self-liquidating over 20-30 years as decarbonization occurs. Model the decline trajectory.
   - The carbon tax revenue should be treated as a declining asset — robust in Years 1-15, diminishing in Years 15-30. The fiscal model needs to account for this.

3. **Financial stability levy** (range: 0-50bp on systemically important institution assets)
   - Target: too-big-to-fail banks (roughly $20T in total assets for US G-SIBs)
   - Revenue = levy rate × asset base
   - Behavioral response: some de-risking and possible size reduction. Model modest base erosion (5-10% at 25bp).
   - Revenue range: $30-80B depending on rate.

4. **Electromagnetic spectrum fees** (annual holding fee on licensed spectrum)
   - Current spectrum license value: ~$500B-1T based on recent auction prices
   - Annual fee as % of holding value: test 2-5%
   - Revenue range: $15-40B
   - Minimal behavioral response — spectrum holders can't create more spectrum.

5. **Financial transaction tax** (range: 0-0.2% on equity trades, lower on bonds/derivatives)
   - US equity market annual trading volume: ~$80-100T
   - At 0.1%: theoretical revenue ~$80-100B, but behavioral response (reduced trading volume) brings it to ~$50-80B
   - UK stamp duty at 0.5% has operated since 1986 without measurable harm to productive markets
   - Model volume reduction: at 0.1%, volume drops ~15-25%. At 0.2%, drops ~30-40%.
   - The AMCF's 20% non-trading holdings actually make the FTT more viable — liquidity impact is smaller because AMCF shares don't trade.

6. **Mineral and resource extraction royalty reform** (federal royalty rate increase + new severance tax)
   - Current federal royalty: 12.5% on public lands (since 1920). Market rate: 18-25%.
   - Revenue from updating to market rate + extending to private extraction: ~$50-100B
   - Minimal distortion — resources are location-fixed and extraction will occur at any reasonable royalty rate.

7. **Water/groundwater extraction fees** (per-acre-foot)
   - Test range: $10-100/acre-foot
   - Total US groundwater extraction: ~80 billion gallons/day (~90 million acre-feet/year)
   - Most is agricultural at very low or zero current cost
   - Revenue range: $10-25B
   - Major economic efficiency benefit: pricing scarcity prevents catastrophic aquifer depletion.

8. **Non-carbon pollution fees** (nitrogen, phosphorus, plastic waste)
   - Revenue range: $15-30B
   - Model as a flat $15-25B block — behavioral response estimates are too uncertain for granular modeling.

9. **Congestion pricing** (federal framework revenue share)
   - Revenue range: $10-20B from federal share
   - Model as a flat $10-15B block.

### Model Architecture

**Step 1: Revenue curves.** For each tax, build a revenue-as-function-of-rate curve that accounts for:
- Base capitalization (LVT)
- Behavioral response / elasticity (carbon, FTT)
- Base erosion from rate increases
- Exemption thresholds (LVT homeowner exemption)

**Step 2: Constraint calculation.** Total required non-VAT revenue = $2.0T − VAT revenue. If rent taxes alone generate ≥ $2.0T, VAT = 0%. Otherwise, VAT fills the gap.

**Step 3: Optimization.** Search the rate space for each tax simultaneously. For each combination:
- Calculate total rent tax revenue
- Calculate required VAT rate to fill gap (if any)
- Calculate prebate coverage (consumption level fully offset by $5K prebate)
- Calculate total economic distortion score (weighted sum of deadweight losses: LVT weight = 0, carbon weight = 0.05, FTT weight = 0.3, VAT weight = 0.25 per dollar of revenue, etc.)
- Calculate political visibility score (VAT = 1.0 per dollar, carbon = 0.5, LVT with exemption = 0.1, financial levies = 0.05)

**Step 4: Pareto frontier.** Plot the tradeoff between:
- Total revenue
- Minimum required VAT rate
- Economic distortion
- Political visibility
- Number of distinct tax mechanisms (complexity cost)

**Step 5: Recommended packages.** Identify 3-5 packages on the Pareto frontier:
- "Zero VAT" — maximum rent taxes, is it feasible?
- "Minimum VAT" — lowest VAT rate that hits the revenue target
- "Balanced" — moderate rent taxes, moderate VAT
- "Simple" — fewest mechanisms that hit the target
- "Maximum efficiency" — lowest total distortion regardless of complexity

### Integration with Task 6 (Fiscal Trajectory)

Once the optimal rent tax portfolio is identified, rerun the Task 6 fiscal trajectory simulator with:
- The recommended LVT rate replacing the prior 3%
- Carbon tax revenue as a new revenue line (declining over time)
- Financial stability levy, spectrum fees, FTT, royalty reform, water fees as new revenue lines
- The recommended VAT rate replacing the current 10%
- Prebate stays at $5,000/person CPI-indexed regardless of VAT rate
- Homeowner exemption updated to $500K if the optimization recommends it

Report the updated milestone table and compare:
- Crossover year: current design vs optimized rent tax design
- Debt-free year
- Grant trajectory
- Conservative scenario performance (this is the key test — does the optimized package still work under conservative assumptions?)

### Key Assumptions to Document

- Discount rate for land capitalization: 5%
- Carbon elasticity: calibrate to published estimates (EPA, IPCC)
- FTT volume elasticity: calibrate to UK stamp duty and Swedish FTT evidence
- All revenue estimates should be in Year 1 dollars with growth trajectories
- Carbon revenue should explicitly model its decline over time
- Report sensitivity to ±20% on each tax's revenue estimate

### Output Format

1. Revenue curve charts for each tax (rate on x-axis, revenue on y-axis)
2. Pareto frontier chart (VAT rate vs total revenue, colored by distortion score)
3. Recommended packages table with all rates, revenues, and metrics
4. Updated fiscal trajectory table for the recommended "Minimum VAT" package
5. Conservative scenario comparison: current design vs optimized design
6. Single-page summary: "Here's the package, here's why, here's what it does to the timeline"

---

## Task 8: Income Tax Simplification — Revenue-Optimal Two-Rate System

### Objective

Find the revenue-maximizing combination of two income tax rates (middle and top) under a radically simplified tax code with no deductions and unified capital gains treatment. Then rerun the full Accord distributional model to produce an updated household impact table.

The core thesis: the Accord eliminates most tax avoidance channels (capital gains taxed as ordinary income, no deductions, pledged asset tax, mark-to-market at death, carried interest reclassification, IRS enforcement floor). This dramatically reduces the elasticity of taxable income (ETI), which means rates can be set higher than conventional wisdom suggests without losing revenue to behavioral response.

### The Proposed Design

- **Standard deduction:** $30K single / $60K joint (zero rate tier). Test sensitivity at $35K/$70K, $40K/$80K, $45K/$90K, $50K/$100K.
- **Middle rate:** Applies to ALL income above the standard deduction up to $1M — wages, salary, capital gains, dividends, interest, business income, partnership distributions, carried interest. No distinction between income types.
- **Top rate:** Applies to ALL income above $1M. Same — no type distinction.
- **One exclusion only:** Primary residence capital gains up to $250K single / $500K joint.
- **No other deductions.** No mortgage interest, no SALT, no charitable, no itemization, no other exclusions.
- **Prebate:** $5,000 per person CPI-indexed (already in the Accord, not new to this task).

### Model Architecture

**Step 1: Revenue estimation under current law.**

Use IRS Statistics of Income (SOI) data for the most recent available year. Build a model of current individual income tax revenue by income bracket, accounting for:
- Current 7-bracket rate structure (10%, 12%, 22%, 24%, 32%, 35%, 37%)
- Current preferential capital gains rates (0%, 15%, 20% + 3.8% NIIT)
- Current standard deduction ($30K joint / $15K single)
- Current itemized deductions (mortgage interest ~$30B, SALT ~$80B, charitable ~$50B, other ~$40B — total ~$200B in tax expenditures)
- Current total individual income tax revenue: ~$2.2-2.5T

**Step 2: Revenue estimation under the two-rate system.**

For each combination of middle rate (test 18% to 30% in 1% increments) and top rate (test 35% to 60% in 1% increments):
- Apply the middle rate to all income above the standard deduction up to $1M, treating ALL income types identically (wages + capital gains + dividends + interest + business + partnership)
- Apply the top rate to all income above $1M, same treatment
- Include the $500K primary residence exclusion (joint; $250K single)
- Include NO other deductions — all itemized deductions eliminated, recovering ~$200B in tax expenditures
- Calculate total revenue
- Calculate revenue change vs current law

This produces a 13 × 26 grid (13 middle rates × 26 top rates) of revenue estimates.

**Step 3: Elasticity of taxable income adjustment.**

The raw revenue calculation from Step 2 assumes no behavioral response. Adjust for ETI:

For the middle rate (income $30K-$1M): use ETI of 0.2. Middle earners have limited avoidance channels even in the current system, and in a no-deduction unified-income-type system they have essentially none.

For the top rate (income above $1M): model TWO ETI scenarios:
- **Low avoidance (ETI = 0.15):** Reflects the Accord's environment where capital gains = ordinary income, no deductions, pledged asset tax closes buy-borrow-die, mark-to-market at death closes deferral, carried interest reclassified, IRS enforcement floor, 0% CIT closes corporate sheltering. Almost no avoidance channels remain. This is the Accord-specific estimate based on the Saez-Slemrod-Giertz (2012) finding that "when the tax base is broad and does not offer avoidance opportunities, the estimated elasticities are never large."
- **Moderate avoidance (ETI = 0.3):** Reflects some residual behavioral response — income shifting to deferred compensation, geographic relocation, reduced effort at the margin, and avoidance channels we haven't anticipated. This is the conservative scenario.

Revenue after behavioral adjustment: for each bracket, adjusted_revenue = raw_revenue × (1 - ETI × (new_rate - old_effective_rate) / (1 - old_effective_rate)). Use current effective rates by bracket from SOI data as the baseline.

**Step 4: Find the revenue-maximizing rate pair.**

For each ETI scenario (low avoidance, moderate avoidance), identify the combination of middle rate and top rate that maximizes total individual income tax revenue after behavioral adjustment.

Report for each scenario:
- Revenue-maximizing middle rate
- Revenue-maximizing top rate
- Total revenue at those rates
- Revenue change vs current law ($)
- Revenue change vs current Accord income tax design (+3-5% above median, more above $1M) ($)
- Revenue change from eliminated deductions specifically ($)
- Revenue change from capital gains unification specifically ($)

Also identify the "revenue plateau" — the range of rate pairs within 2% of maximum revenue. This is the policy-relevant zone where you can trade small amounts of revenue for political palatability.

**Step 5: Distributional impact of income tax change.**

For each income bracket ($0-10K, $10-15K, $15-25K, $25-35K, $35-50K, $50-75K, $75-100K, $100-150K, $150-200K, $200-500K, $500K-1M, $1M-2M, $2M-5M, $5M-15M, $15M+):
- Current effective federal income tax rate (current law, including capital gains preferences and itemized deductions)
- New effective federal income tax rate (two-rate system, unified capital gains, no deductions)
- Net annual change in federal income tax burden ($)
- Include the $5,000 prebate in the effective rate calculation
- Include the $500K primary residence exclusion impact (estimate fraction of households in each bracket that sell homes in a given year and the average gain)
- **Flag any bracket below $200K where the new system produces a higher tax burden than current law.** The main risk is capital gains unification — someone earning $80K with $50K in stock gains currently pays 15% on those gains and under the unified rate would pay 25%. Quantify this impact by bracket and estimate what fraction of households in each bracket have capital gains income.

**Step 6: Standard deduction sensitivity.**

Test standard deductions of $30K, $35K, $40K, $45K, $50K (single; double for joint). For each level:
- Total revenue impact (higher deduction = less revenue)
- Number of additional households moved into zero-rate tier
- Effective rate by bracket (does raising the deduction to $40K eliminate all middle-class tax increases from capital gains unification?)
- Identify the standard deduction level where ALL households below median income ($75K) pay zero or negative combined effective rates after the prebate

**Step 7: Capital gains unification comparison.**

Model three scenarios and compare:
- **Scenario A — Current Accord design:** Capital gains at 0% up to $200K, 20% from $200K-$1M, ordinary rates above $1M. Current bracket structure with +3-5% adjustments.
- **Scenario B — Full unification WITH home exclusion:** All capital gains = ordinary income at the two-rate structure. Primary residence exclusion ($500K joint) retained.
- **Scenario C — Full unification, NO home exclusion:** All capital gains = ordinary income, no exclusions at all.

For each scenario, report:
- Total revenue
- Revenue difference vs other scenarios
- Number of households worse off vs Scenario A
- Average dollar impact for worse-off households
- Specific impact on households with home sales by income bracket

**Step 8: Integration with the Accord fiscal trajectory.**

Take the revenue-optimal rate pair from Step 4 (low-avoidance ETI scenario) and calculate the total net revenue change vs the current Accord income tax design. Feed that revenue change into the Task 6 fiscal trajectory simulator as an adjustment to the income tax revenue line. All other parameters remain at current Accord design (4% VAT, 10% LVT, $100/ton carbon, 0.5% FTT, 25bp FSL, royalty reform, spectrum fees, 10/25/65 AMCF waterfall, 20% ownership cap, etc.).

Report the updated milestone table:
- Crossover year (before and after income tax simplification)
- Debt peak year and amount
- Net creditor year
- Solvency brake off year
- Debt-free year
- Grants/capita at Years 10, 15, 20, 25, 30

**Step 9: Full Accord distributional rerun.**

Using the revenue-optimal rate pair from Step 4, rerun the FULL distributional impact model with ALL Accord provisions at current design:

- Income tax: two-rate system (optimized middle rate, optimized top rate, standard deduction only, no other deductions, capital gains unified with primary residence exclusion)
- VAT: 4%
- LVT: 10% ($500K homeowner exemption)
- Carbon tax: $100/ton (pass-through impact on consumption by income bracket)
- FTT: 0.5%
- Financial stability levy: 25bp
- Prebate: $5,000/person CPI-indexed
- AMCF citizen grants: 65% allocation at validated trajectory ($500 Year 1, scaling per fiscal trajectory)
- Payroll donut hole fix: 12.4% above $400K
- Dissolved welfare: SNAP, EITC, CTC, TANF, WIC savings netted against prebate cost
- Mark-to-market at death: $5M exclusion (estimate impact on estates by income bracket)
- All other enforcement provisions from Sections 4.4-4.8

Output the distributional table in this EXACT format:

```
Income Range | Households | Current Rate | Accord Rate | Take-home Pay (Current → Accord) | Net Annual Δ | Better Off?
```

Use these brackets: $0-10K, $10-15K, $15-25K, $25-35K, $35-50K, $50-75K, $75-100K, $100-150K, $150-200K, $200-500K, $500K-1M, $1M-2M, $2M-5M, $5M-15M, $15M+

For each bracket, calculate the COMBINED effective tax rate including:
- Federal income tax (new two-rate system)
- Payroll tax (employee side: 7.65% up to cap, 1.45% above, 0.9% additional Medicare above $200K/$250K, plus donut hole 6.2% above $400K)
- VAT at 4% (estimated burden based on consumption-to-income ratio by bracket, net of $5K prebate)
- LVT impact (for homeowners above $500K exemption — estimate fraction of households in each bracket affected and average burden)
- Carbon tax pass-through on consumption (estimated energy/transportation cost increase by bracket)
- FTT pass-through (estimate indirect cost through pension fund/401K transaction costs)
- AMCF citizen grant income (at Year 10 trajectory for a mid-phase snapshot)
- Prebate ($5,000 per person × household size)
- Net dissolved welfare impact (lost SNAP/EITC/CTC/TANF/WIC vs prebate replacement)

The "Current Rate" column should reflect the current law combined rate (federal income tax + payroll + estimated state/local + estimated consumption taxes). The "Accord Rate" column should reflect the full Accord package combined rate.

Report summary statistics:
- Total households better off
- Total households worse off
- Percentage of households better off
- Breakeven income level where the Accord becomes net costly
- **Compare to the prior Accord distributional result (~90% better off at Year 1 with the new two-rate income tax, 99%+ by Year 5).** Does the simplified two-rate income tax change this percentage? If so, by how much and why?
- **If any bracket below $200K is worse off than under the PRIOR Accord design (not current law — the prior Accord design), flag it immediately and report the magnitude.** This is the critical test: the income tax simplification should not make middle-class households worse off than the version of the Accord with the old progressive brackets.

### Key Assumptions to Document

- ETI estimates and their sources (Diamond-Saez 2011, Saez-Slemrod-Giertz 2012, Cato critique 2019)
- The rationale for using lower ETI under the Accord (broad base, no deductions, unified income types = fewer avoidance channels)
- IRS SOI data year and any adjustments for income growth
- Consumption-to-income ratios by bracket (for VAT and carbon pass-through estimates)
- Homeownership rates and home sale frequency by bracket (for primary residence exclusion impact)
- Capital gains income as fraction of total income by bracket (for unification impact)
- Household size assumptions by bracket (for prebate and grant calculations)

### Output Format

1. **Revenue heat map:** Middle rate (x-axis) vs top rate (y-axis), colored by total revenue, for both ETI scenarios. Mark the revenue-maximizing pair and the revenue plateau zone.
2. **Revenue-maximizing rate pair** for each ETI scenario, with confidence range.
3. **Income-tax-only distributional table:** Effective federal income tax rate by bracket under current law, current Accord design, and optimized two-rate system. Shows the isolated effect of the income tax change.
4. **Standard deduction sensitivity table:** Revenue and distributional impact at each deduction level.
5. **Capital gains unification comparison table:** Scenarios A, B, C with revenue and household impact.
6. **Updated fiscal trajectory milestones** with the optimized income tax integrated.
7. **Full Accord distributional table (Step 9):** The master table showing combined effective rates, take-home pay, and net annual change for every bracket under the complete Accord package with the optimized two-rate income tax. THIS IS THE PRIMARY DELIVERABLE — it replaces the prior distributional table and must be in the exact format specified above.
8. **One-page summary:** "Here are the rates, here's the revenue, here's who's affected, here's what it does to the timeline, and here's the comparison to the prior Accord design."

---

## Task 10: Accord Visualization Dashboard

See separate Task 10 instructions document for full specification. Key modeling notes for integration:

### CRITICAL: AMCF Grants Are Unit Distributions, Not Cash

AMCF citizen grants are equity unit distributions, not cash payments. Citizens receive ownership shares in the AMCF fund. Units appreciate with the fund's NAV. Citizens MAY liquidate vested units for cash at any time, but the default state is accumulation.

**This means AMCF grants split into two streams for every demographic and every year:**

1. **AMCF liquidation income** = annual grant × liquidation_rate → this IS cash income. Shows in income charts and cash flow waterfall.
2. **AMCF retained units** = annual grant × (1 - liquidation_rate) → this IS wealth accumulation. Shows in wealth charts. Retained units compound at the AMCF fund growth rate (7.5% nominal) until eventually liquidated.

**Tax treatment of liquidation:** Unit grants are tax-free when received (no income recognition). Liquidation triggers ordinary income tax on the appreciation since receipt (cost basis = NAV at date of grant). Tax rate: 25% on appreciation falling within sub-$1M total income, 50% on appreciation pushing total income above $1M. There is NO separate capital gains rate — all income is income under the two-rate system.

### Liquidation Rate Model

Use a smooth function:

```
liquidation_rate(percentile, year) = base_rate(percentile) × pressure_decay(year)
```

**base_rate(percentile)** — structural consumption pressure:

| Percentile | base_rate |
|---|---|
| P0-P10 | 0.95 |
| P10-P20 | 0.90 |
| P20-P30 | 0.80 |
| P30-P40 | 0.70 |
| P40-P50 | 0.55 |
| P50-P60 | 0.40 |
| P60-P70 | 0.25 |
| P70-P80 | 0.15 |
| P80-P90 | 0.08 |
| P90-P99 | 0.03 |
| P99-P99.9 | 0.01 |
| Billionaires | 0.00 |
| Elon | 0.00 |

**pressure_decay(year):**

```
pressure_decay(year) = 0.5 + 0.5 × exp(-year / 15)
```

Produces: Year 0 = 1.0, Year 5 = 0.86, Year 10 = 0.76, Year 15 = 0.68, Year 20 = 0.63, Year 30 = 0.57.

### Income vs Wealth Classification

Three ALWAYS-CASH income streams (show in income charts by default):
1. **Prebate:** $5,000/person/year. Pure cash.
2. **Carbon dividend:** ~$843/person/year. Pure cash.
3. **PSU dividends:** 3.5% yield on held stakes. Pure cash.

One CONDITIONAL cash stream:
4. **AMCF liquidation:** grant × liquidation_rate. Cash only when citizen sells units.

Two WEALTH-ONLY streams (show in wealth charts, OFF by default in income charts):
5. **AMCF retained units:** Compounding. Wealth only.
6. **PSU cashouts:** Lump sum on job change. Wealth event — toggleable in income charts, OFF by default.

### Additional Red Flag Corrections

**Carbon dividend:** MUST be flat per-capita: `household_carbon_dividend = household_size × $843`. Does NOT scale with income. Fix any formula that produces higher carbon dividends for wealthier households.

**Carbon burden:** Cap at `min(income / 68000 × 1800, $15000)` for households up to $1M income. Hard cap $150,000 for billionaires and Elon — one household can only burn so much carbon regardless of wealth.

**PSU eligibility by demographic:** Use FTE-adjusted eligibility:

| Demo | % PSU-eligible | Avg FTE | Effective FTE |
|---|---|---|---|
| P0-P10 | 80% | 0.20 | 0.16 |
| P10-P20 | 85% | 0.45 | 0.38 |
| P20-P30 | 88% | 0.60 | 0.53 |
| P30-P40 | 90% | 0.75 | 0.68 |
| P40-P50 | 92% | 0.85 | 0.78 |
| P50-P60 | 92% | 0.90 | 0.83 |
| P60-P70 | 90% | 0.95 | 0.86 |
| P70-P80 | 90% | 0.95 | 0.86 |
| P80-P90 | 85% | 0.95 | 0.81 |
| P90-P99 | 75% | 0.85 | 0.64 |
| P99-P99.9 | 35% | 0.95 | 0.33 |
| Billionaires | 5% | 1.0 | 0.05 |
| Elon | 0% | — | 0.00 |

Gig workers and platform workers are included as employees at their FTE-adjusted hours. All workers performing labor for an entity are eligible regardless of contractor classification.
