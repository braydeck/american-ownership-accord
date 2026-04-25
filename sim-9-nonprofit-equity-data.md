# Simulation 9 — Non-Profit Equity: Model Data Reference

All values computed directly from `simulation-9-nonprofit-equity.jsx` formulas.
Numbers rounded to nearest dollar or as noted. Dollar figures in nominal terms.

---

## Part A — Tier 1 Growth Multiplier

**Contribution formula:** `$1,000 + min($4,000, (revenue_per_employee / $100,000) × $500)`
Floor: $1,000/worker. Ceiling: $5,000/worker (requires $800K revenue/employee).
**Affordability cap:** contribution = `min(formula, 50% × CIT_savings_per_worker)` where `CIT_savings = rev/emp × margin × 21%`.
Employer contribution goes to the sectoral fund (6% gross return, 3.5% annual dividend distribution).

### Representative Company Analysis

| Company | Workers | Revenue | Rev / Worker | Formula | **Contrib (capped)** | CIT Savings / Worker | Net / Worker |
|---------|---------|---------|-------------|---------|---------------------|---------------------|--------------|
| 5-person plumbing shop | 5 | $1.5M | $300K | $2,500 | **$2,500** | $9,450 | +$6,950 saved |
| 15-person restaurant | 15 | $2.0M | $133K | $1,667 | **$700** *(cap applied)* | $1,400 | −$700 saved |
| 50-person manufacturer | 50 | $15M | $300K | $2,500 | **$2,500** | $6,300 | +$3,800 saved |
| 6-person SaaS startup | 6 | $3.0M | $500K | $3,500 | **$3,500** | $21,000 | +$17,500 saved |
| 10-person retail shop | 10 | $0.8M | $80K | $1,400 | **$252** *(cap applied)* | $504 | −$252 saved |

Cap calculations:
- Restaurant: 50% × ($133K × 0.05 × 0.21) = 50% × $1,397 = **$700** (formula $1,667 → capped)
- Retail: 50% × ($80K × 0.03 × 0.21) = 50% × $504 = **$252** (formula $1,400 → capped)

> Both thin-margin sectors are now sustainable under the cap — contributions stay within half of CIT savings.
> Fund balances for restaurant workers ($700/yr) and retail workers ($252/yr) accumulate more slowly;
> see updated rows in the dividend table below.

### Annual Worker Dividend by Contribution Level

Fund dividend = `fundBal(contrib, year) × 3.5%`
Fund balance = `contrib × (1.06^year − 1) / 0.06` (6% gross; 3.5% distributed from earnings, not corpus)

| Contribution Level | Year 1 | Year 10 | Year 20 | Year 30 |
|-------------------|--------|---------|---------|---------|
| $252 — retail (capped) | $9 | $117 | $326 | $701 |
| $700 — restaurant (capped) | $25 | $325 | $906 | $1,948 |
| $1,000 — floor | $35 | $461 | $1,287 | $2,767 |
| $2,500 — plumbing / mfg | $88 | $1,153 | $3,219 | $6,917 |
| $3,500 — SaaS | $123 | $1,615 | $4,506 | $9,683 |
| $5,000 — ceiling | $175 | $2,307 | $6,438 | $13,835 |

---

## Part B — Owner-Operator Pathway Comparison

Three pathways modeled over a 30-year career horizon. All figures = total accumulated wealth.

**Parameters:**
- Tier 1 Lifer: $2,500/yr contribution, sectoral fund at 6% gross (wealth = fund balance)
- Tier 3 Mega-Cap: $100K initial PSU equity, EV growth 7.5%/yr, job changes every 4.1 years (BLS avg); cashouts reinvested at 7.5%/yr
- Trade → Owner: 8 years Tier 1 fund accumulation ($24,742 rollover balance), then business launched; grows at ~24.4%/yr to $3M cap over 22 years

| Pathway | Year 1 | Year 10 | Year 20 | Year 30 |
|---------|--------|---------|---------|---------|
| Tier 1 Lifer ($2,500/yr) | $2,500 | $32,953 | $91,965 | $197,645 |
| Tier 3 Mega-Cap ($100K PSU) | $24,400 | $491,600 | $1,986,500 | $6,381,000 |
| Trade → Owner (fund rollover) | $2,500 | $38,275 | $339,076 | $3,000,000 |

**Notes:**
- Tier 3 wealth at Year 10 = 2 cashout events (at yr 4.1 and 8.2) reinvested + current holding; each cashout appreciates at EV rate × reinvestment rate = 7.5% both directions, so total is roughly n_cashouts × PSU × 1.075^T
- Tier 3 at Year 30 = 7 cashout events × ($100K × 1.075^30 = $875,500 each) + current holding ≈ $6.1M + $252K = $6.4M
- Trade → Owner wealth at Year 30 caps at $3M by model design; business growth rate = (3M / 24,742)^(1/22) − 1 ≈ 24.4%/yr
- Rollover balance at Year 8 = `fundBal(2500, 8)` = **$24,742**

---

## Part C — Non-Profit Three-Tier Framework

### Employment by Tier

| Tier | Definition | Workers | Equity Mechanism | Cashout? | Notes |
|------|-----------|---------|-----------------|----------|-------|
| Tier A — Waived | <50 employees | 1.5M | 2× AMCF grant (federal unit issuance) | — | No employer contribution required |
| Tier A — Covered | ≥50 employees | 1.5M | $1,000/yr flat sectoral fund | — | Portable; same as for-profit Tier 1 floor |
| Tier B — Medium | ≥10% surplus or assets $10M–$1B | 6.0M | Productivity-scaled: $1K + min($4K, rev/emp/$100K × $500) | — | Fund portable; same formula as Part A |
| Tier C — Large | Assets >$1B or high-resource | 3.5M | Full PSU equivalent; 4% equity excise → 20% worker pool by Yr 5 | Yes (at job change) | Appreciates with endowment EV |

**Total non-profit workers covered: ~12.5M**

### Representative Tier C Organizations

PSU stake per worker = `min($500K, endowment_EV × 20% / headcount)` (at full ramp, Year 5+)
**$500K per-worker cap** applied to prevent extreme endowment-per-worker outliers from distorting model.

| Organization | Sector | Employees | EV Equiv | Raw Stake | **Capped Stake** | Annual Dividend (Yr 5) | Annualized Cashout |
|-------------|--------|----------|----------|-----------|-----------------|------------------------|-------------------|
| Harvard University | Higher Ed | 20,000 | $58B | $580,000 | **$500,000** *(capped)* | $17,500 | $163,900 |
| Kaiser Permanente | Healthcare | 300,000 | $70B | $46,700 | **$46,700** | $1,633 | $15,300 |
| Mayo Clinic | Healthcare | 80,000 | $20B | $50,000 | **$50,000** | $1,750 | $16,400 |
| Rep. large hospital system | Healthcare | 50,000 | $15B | $60,000 | **$60,000** | $2,100 | $19,700 |
| Gates Foundation | Foundation | 2,000 | $60B | $6,000,000 | **$500,000** *(capped)* | $17,500 | $163,900 |
| Rep. large university (non-elite) | Higher Ed | 15,000 | $5B | $66,700 | **$66,700** | $2,333 | $21,900 |

Cap calculation: stake = min($500K, raw); dividend = stake × 3.5%; cashout = stake × 1.075^4.1 / 4.1 = stake × 0.3278

> **Harvard** ($580K raw → $500K capped): dividend drops from $20,300 → $17,500/yr.
> **Gates Foundation** ($6M raw → $500K capped): dividend drops from $210,000 → $17,500/yr.
> After the cap, both align with the upper end of large universities rather than being extreme outliers.
> Healthcare systems (Kaiser, Mayo, hospitals) are all well below the cap and unchanged.

---

## Part D — AMCF Growth Assessment Model

**Tier C asset base:** ~$2T (university endowments $907B + hospital systems $600B+ + major foundations $500B+)
**Assessment mechanism:** 20% of 6% assessable (investment-driven) growth = **1.2% of assets/yr** transferred to AMCF
**Asset growth net of assessment:** ~7.8%/yr (7% investment return + 2% donations − 1.2% assessment)
**Phase 2 trigger:** when cumulative notional ownership reaches 20% (~Year 18); AMCF switches from assessment to dividend on 20% stake

| Year | Tier C Assets | Cumul. Notional | AMCF Revenue | Phase | Notes |
|------|--------------|-----------------|--------------|-------|-------|
| 1 | $2.16T | 1.1% | $24B | 1 | Assessment = $2T × 0.06 × 0.20 |
| 10 | $4.22T | 11.1% | $51B | 1 | ~$5B/yr growth in AMCF revenue |
| 18 | $7.75T | ~20% | $93B | Transition | Phase 2 triggers; assessment ≈ dividend at crossover |
| 20 | $8.91T | 20% (capped) | $107B | 2 | Dividend = assets × 20% × 6.0% yield |
| 30 | $18.82T | 20% (capped) | $226B | 2 | Full yield rate reached Year 15 |

**Combined yield ramp:** 3.63% → 6.0% over Years 1–15 (rising div + buyback participation)
**Phase 2 formula:** `amcfRevenue = assets × 20% × combinedYield`
**Cumulative notional accumulation rate:** ≈ 1.11%/yr (assessment / newAssets = 0.012 / 1.078 each year)

---

## Part E — Updated Fiscal Milestones

Base = Sim-6 full tax package (4% VAT + 10% LVT + $100/ton carbon + 0.76% stable taxes).
**Crossover year confirmed from live Sim-6** — both New Accord base and Prior Accord land at Year 16.
"Before" = without non-profit equity provisions. "After" = with non-profit Growth Assessment (~$24B Yr 1 → $107B Yr 20 additional AMCF revenue).

| Metric | Before (Sim-6 base) | After (+ NP provisions) | Delta |
|--------|--------------------|-----------------------|-------|
| Fiscal crossover (first surplus) | **Year 16** *(confirmed)* | **Year 15** | −1 year |
| Debt peak | ~Year 13–14 | ~Year 12–13 | −1 year |
| AMCF self-funds grants | Year 10 | Year 10 | No change |
| Net creditor (AMCF > gross debt) | ~Year 22–24 | ~Year 21–23 | −1 year |
| NP Phase 2 (dividend equiv.) | — | Year ~18 | New milestone |
| vs Prior Accord (10% VAT + 3% LVT) | Year 16 *(Prior Accord)* | Year 16 *(New Accord base)* | **Parity** — same crossover, less regressive mix |

> **Key finding:** New Accord and Prior Accord achieve identical Year 16 fiscal crossover.
> New Accord generates +$260B/yr more Accord-specific revenue in Year 1 (carbon + stable taxes more than offset VAT cut).
> The Prior Accord's 10% VAT compliance ramp (75%→90% over 7 years) closes that gap by Year 6–7,
> producing equal crossover timing. New Accord advantage is structural: LVT + stable taxes grow with GDP
> indefinitely, while the Prior Accord's large VAT base is regressive and growth-bounded.
> NP Growth Assessment advances the crossover by 1 further year to **Year 15**.

---

## Part F — Blended Distributional Table

Worker equity = blended for-profit PSU + non-profit equity, weighted by NP employment fraction (BLS 2022) per bracket.
**Dividend** = annual yield on accumulated stake. **Cashout** = annualized value of a job-change event (PSU stake × 1.075^4.1 / 4.1).
**Cashout ramp:** at Year 1, no workers have completed a full 4.1-yr tenure cycle under the new policy. Cashout scales linearly from 0 at Year 0 → full rate at Year 4.1 (`cashoutRamp = min(1, year / 4.1)`). Year 1 cashoutRamp ≈ 0.244; fully ramped by Year 5. This applies to both T2 (phantom equity) and T3 (PSU).
After Year 5, cashout values are constant (tenureGrowth is fixed); only dividends grow as EV appreciates (t3Apprec).
All values are per-worker (not per-household). Part-time FTE adjustment applied.

### Year 1 — Policy Phase-In (t3Ramp = 20%, cashoutRamp = 24.4%, EV appreciation = 0%)

| Income Bracket | Avg Income | NP Share | Dividend / yr | Cashout (ann.) | **Total / yr** |
|---------------|-----------|---------|--------------|----------------|---------------|
| $0 – $10K | $5,200 | 4% | $24 | $127 | **$151** |
| $25 – $40K | $32,000 | 14% | $312 | $1,466 | **$1,778** |
| $40 – $55K | $47,500 | 18% | $394 | $1,870 | **$2,264** |
| $55 – $75K | $63,000 | 22% | $449 | $2,180 | **$2,629** |
| $100 – $150K | $123,000 | 16% | $606 | $2,758 | **$3,364** |
| $200 – $500K | $300,000 | 8% | $759 | $2,999 | **$3,758** |

### Year 10 — Fully Ramped (t3Ramp = 100%, EV appreciation = 1.436×)

| Income Bracket | Avg Income | NP Share | Dividend / yr | Cashout (ann.) | **Total / yr** |
|---------------|-----------|---------|--------------|----------------|---------------|
| $0 – $10K | $5,200 | 4% | $186 | $1,334 | **$1,520** |
| $25 – $40K | $32,000 | 14% | $2,368 | $16,883 | **$19,251** |
| $40 – $55K | $47,500 | 18% | $2,987 | $21,483 | **$24,470** |
| $55 – $75K | $63,000 | 22% | $3,416 | $24,660 | **$28,076** |
| $100 – $150K | $123,000 | 16% | $4,545 | $32,759 | **$37,304** |
| $200 – $500K | $300,000 | 8% | $5,613 | $39,740 | **$45,353** |

### Year 20 — Mature Phase (t3Ramp = 100%, EV appreciation = 2.959×)

| Income Bracket | Avg Income | NP Share | Dividend / yr | Cashout (ann.) | **Total / yr** |
|---------------|-----------|---------|--------------|----------------|---------------|
| $0 – $10K | $5,200 | 4% | $406 | $1,334 | **$1,740** |
| $25 – $40K | $32,000 | 14% | $5,086 | $16,883 | **$21,969** |
| $40 – $55K | $47,500 | 18% | $6,398 | $21,483 | **$27,881** |
| $55 – $75K | $63,000 | 22% | $7,333 | $24,660 | **$31,993** |
| $100 – $150K | $123,000 | 16% | $9,687 | $32,759 | **$42,446** |
| $200 – $500K | $300,000 | 8% | $11,823 | $39,740 | **$51,563** |

### Year 30 — Long-Run Equilibrium (t3Ramp = 100%, EV appreciation = 6.100×)

| Income Bracket | Avg Income | NP Share | Dividend / yr | Cashout (ann.) | **Total / yr** |
|---------------|-----------|---------|--------------|----------------|---------------|
| $0 – $10K | $5,200 | 4% | $844 | $1,334 | **$2,178** |
| $25 – $40K | $32,000 | 14% | $10,555 | $16,883 | **$27,438** |
| $40 – $55K | $47,500 | 18% | $13,291 | $21,483 | **$34,774** |
| $55 – $75K | $63,000 | 22% | $15,219 | $24,660 | **$39,879** |
| $100 – $150K | $123,000 | 16% | $20,062 | $32,759 | **$52,821** |
| $200 – $500K | $300,000 | 8% | $24,459 | $39,740 | **$64,199** |

### Observations

- **Year 1 cashout correction:** the previous version showed Year 1 cashouts of ~$6K–$12K, which was wrong — it used steady-state cashout rates before anyone had completed a tenure cycle. The corrected model applies `cashoutRamp = 0.244` at Year 1 (1yr / 4.1yr avg tenure), reducing Year 1 cashouts to ~$127–$2,999 depending on bracket. This is the correct interpretation: at Year 1, roughly 24% of the eventual steady-state cashout flow has materialized.
- **Cashout values are constant across Years 5–30** (after cashoutRamp reaches 1.0) because the formula uses fixed tenure growth (1.075^4.1 = 1.344×) — it models the annualized rate of job-change realizations, not compounded future value. Only dividends grow via EV appreciation.
- **T3 ownership verification:** at Year 1, t3Ramp = 0.2 → workers hold 4% of their employer's equity (one year of the 4% annual excise). Combined with cashoutRamp = 0.244, Year 1 T3 cashout is ~4.9% of the Year 10 steady-state value. This is correct — the policy is in its earliest phase.
- **$0–$10K bracket** grows slowly: part-time FTE adjustment (0.20) and low Tier 3 penetration limit equity accrual. Year 30 total ($2,178) is meaningful relative to a $5,200 average income (~42%).
- **$40–$55K sweet spot:** Year 10 total ($24,470) represents ~51% of average annual income — the largest proportional gain in the distribution, driven by high Tier 3 FP penetration (45%) and 18% NP share.
- **Non-profit workers** in the $55–$75K bracket (22% NP share, concentrated in healthcare) receive slightly less equity than FP peers due to lower NP Tier C PSU values ($70K) vs FP Tier 3 ($165K). The $500K NP cap primarily affects Harvard and Gates Foundation at the top brackets.
- **EV appreciation (t3Apprec):** 1.0× → 1.436× → 2.959× → 6.100× over Years 5/10/20/30, reflecting 7.5%/yr EV growth compounding from Year 5 onward. Dividends grow proportionally; cashouts do not.

---

*Source: `simulation-9-nonprofit-equity.jsx` — computed values as of April 2026*
