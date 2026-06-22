// Bottom-up land-value model and Land Value Tax (LVT) revenue.
// Replaces the legacy top-down black box `nomGdp * 0.20 * rate` with an explicit
// model where the $500k homeowner exemption and land-price capitalization are
// separable, tunable inputs.
//
// Sources (all values are tunable planning assumptions, not point estimates):
//   - Sector land values: Fed Financial Accounts B.101 (real estate at market value),
//     USDA farm real estate, Larson (2015) & Albouy et al. aggregate US land value,
//     Lincoln Institute land-share series.
//   - Per-home land distribution: calibrated to the IRS-SOI bracket table in
//     brackets.js (homeownership rate `own`, filer counts) so median per-home land
//     ≈ $100k and only top brackets exceed the $500k exemption.
//
// THE CORE MECHANISM — capitalization:
//   A permanent LVT at rate t drives land prices down because buyers capitalize the
//   ongoing carrying cost. Market value = P0 * i/(i+t), where i = ground-rent yield.
//   At i=4%, t=10% the factor is 0.04/0.14 = 0.2857. With ~$20T taxable land after the
//   exemption, revenue = 0.10 * $20T * 0.2857 ≈ $571B — reproducing the canonical
//   "~$570B at 10%". And 0.70 (taxable land / GDP) * 0.2857 (capitalization) = 0.20 —
//   i.e. the legacy `0.20` constant was silently bundling both factors.

import { BRACKETS, LVT_NET_BASE } from '@/lib/brackets';

// ─── SECTOR LAND VALUES (pre-tax market value P0, $) ─────────────────────────
// Σ p0 ≈ $33T total private taxable-eligible land. Only owner-occupied residential
// carries the homeowner exemption. Owner-occupied gross (~$14.5T) is set so that the
// shielded portion lands at ~$13T, leaving ~$20T taxable after the exemption.
export const LAND_SECTORS = [
  { key: 'ownerOcc',     label: 'Owner-occupied residential', p0: 14.5e12, exempt: true  },
  { key: 'rental',       label: 'Rental / multifamily',       p0:  4.0e12, exempt: false },
  { key: 'commercial',   label: 'Commercial',                 p0:  8.0e12, exempt: false },
  { key: 'agricultural', label: 'Agricultural',               p0:  3.0e12, exempt: false },
  { key: 'vacant',       label: 'Vacant / speculative',       p0:  3.5e12, exempt: false },
];

export const TOTAL_LAND_P0   = LAND_SECTORS.reduce((s, x) => s + x.p0, 0); // ≈ $33T
export const GROUND_RENT_YIELD = 0.04;     // i — ground-rent yield / capitalization discount
export const EXEMPTION_AMOUNT  = 500_000;  // $/home owner-occupied primary-residence exemption (when applied)
export const POPULATION        = 335e6;    // for prebate-per-capita conversion
export const LAND_REF_GDP      = 28.7e12;  // Year-1 nominal GDP the sector P0 values are anchored to
export const PREBATE_BASE      = 5000;     // $/person/yr universal prebate (pre-redirect)

// Land-base growth coupling to nominal GDP. The historical housing/land literature
// (Knoll-Schularick-Steger 2017) finds land has matched or outpaced GDP — but a high
// LVT is explicitly anti-speculative and "deflationary for land", so the *taxed* base
// should grow SLOWER than GDP. Default 0.7 (land grows ~30% slower than nominal GDP);
// 1.0 = tracks GDP (legacy behavior); <0.7 = stronger suppression.
export const LAND_GROWTH_ELASTICITY = 0.7;

// DEFAULT POLICY SCENARIO: the homeowner exemption is OFF and the recovered revenue is
// redirected into a higher prebate. Toggle the exemption back ON (EXEMPTION_AMOUNT) to
// restore the original $500k shield and the base prebate.
export const EXEMPTION_DEFAULT = 0;        // default scenario: no homeowner exemption

// ─── PER-HOME LAND DISTRIBUTION (shape only; scaled to ownerOcc p0) ──────────
// Land value per owner-occupied home by income bracket ($), parallel to BRACKETS.
// homes_i = BRACKETS[i].filers * BRACKETS[i].own. These define the *shape* of the
// distribution; ownerOccTaxable() rescales them so the weighted total equals the
// ownerOcc sector p0, making the exemption math robust to the absolute level.
export const HOME_LAND_BY_BRACKET = [
     25_000,   //  $0-10K
     40_000,   //  $10-15K
     55_000,   //  $15-25K
     70_000,   //  $25-40K
     85_000,   //  $40-55K
    100_000,   //  $55-75K   (≈ national median per-home land)
    120_000,   //  $75-100K
    150_000,   //  $100-150K
    200_000,   //  $150-200K
    320_000,   //  $200-500K
    600_000,   //  $500K-1M   ← first bracket above the $500k exemption
  1_100_000,   //  $1-2M
  2_200_000,   //  $2-5M
  4_500_000,   //  $5-15M
 11_000_000,   //  $15M+
];

const HOMES_BY_BRACKET = BRACKETS.map(b => b.filers * b.own);

// ─── OWNER-OCCUPIED EXEMPTION MATH ───────────────────────────────────────────
// Returns owner-occupied land split by a per-home exemption, in $:
//   { gross, shielded, taxable }. The per-home distribution is rescaled so `gross`
//   equals the ownerOcc sector p0.
export function ownerOccTaxable(exemption = EXEMPTION_DEFAULT) {
  const sector = LAND_SECTORS.find(s => s.key === 'ownerOcc');
  const rawGross = HOME_LAND_BY_BRACKET.reduce((s, land, i) => s + land * HOMES_BY_BRACKET[i], 0);
  const scale = sector.p0 / rawGross;
  let gross = 0, shielded = 0;
  HOME_LAND_BY_BRACKET.forEach((land, i) => {
    const perHome = land * scale;
    const homes = HOMES_BY_BRACKET[i];
    gross += perHome * homes;
    shielded += Math.min(perHome, exemption) * homes;
  });
  return { gross, shielded, taxable: gross - shielded };
}

// Total pre-tax taxable land base ($). The exemption applies to owner-occ only.
//   exemption 0       → ~$33T (full TOTAL_LAND_P0)
//   exemption 500_000 → ~$20T
export function taxableBaseP0({ exemption = EXEMPTION_DEFAULT } = {}) {
  const nonOwnerOcc = LAND_SECTORS
    .filter(s => !s.exempt)
    .reduce((s, x) => s + x.p0, 0);
  return nonOwnerOcc + ownerOccTaxable(exemption).taxable;
}

// ─── CAPITALIZATION ──────────────────────────────────────────────────────────
// Market (assessed) value of pre-tax land value `p0` under a permanent LVT at rate t.
//   'capitalized' → p0 * i/(i+t)   (realistic — buyers capitalize the carrying cost)
//   'preTax'      → p0             (naive — assumes assessment ignores the tax)
export function capitalizedValue(p0, rate, {
  assessmentBasis = 'capitalized',
  groundRentYield = GROUND_RENT_YIELD,
} = {}) {
  if (assessmentBasis === 'preTax') return p0;
  return p0 * (groundRentYield / (groundRentYield + rate));
}

export function landPremiumFactor(year) {
  return 1 + 0.005 * (year - 1); // land appreciates ~0.5%/yr above the GDP-linked base
}

// ─── CORE REVENUE ──────────────────────────────────────────────────────────
// Total LVT revenue + per-sector breakdown for a given rate/year/exemption.
// Each sector: assessed = taxableP0 * landPremium * coverage; value = capitalize(assessed);
//   rev = min(rate * value, groundRentYield * assessed)   ← can't exceed 100% of ground rent.
// Note: this returns Year-1-level absolute revenue. The fiscal engines additionally
// scale by nominal GDP via lvtRevForFiscal() so LVT grows with the economy.
export function lvtRevenue({
  rate,
  year = 1,
  exemption = EXEMPTION_DEFAULT,
  assessmentBasis = 'capitalized',
  groundRentYield = GROUND_RENT_YIELD,
  coverage = 1.0,
} = {}) {
  const landPremium = landPremiumFactor(year);
  const ownerTaxable = ownerOccTaxable(exemption).taxable;
  const bySector = LAND_SECTORS.map(s => {
    const taxableP0 = s.exempt ? ownerTaxable : s.p0;
    const assessed = taxableP0 * landPremium * coverage;
    const value = capitalizedValue(assessed, rate, { assessmentBasis, groundRentYield });
    const revenue = Math.min(rate * value, groundRentYield * assessed);
    return { key: s.key, label: s.label, revenue };
  });
  const total = bySector.reduce((sum, x) => sum + x.revenue, 0);
  return {
    total,
    bySector,
    capFactor: assessmentBasis === 'preTax' ? 1 : groundRentYield / (groundRentYield + rate),
    landPremium,
    base: taxableBaseP0({ exemption }),
  };
}

// Exemption cost made explicit: revenue with vs without the homeowner exemption,
// holding all else equal. prebatePerCapitaBump = exemptionCost / population.
export function lvtRevenueExemptionComparison({
  rate = 0.10,
  year = 1,
  population = POPULATION,
  ...opts
} = {}) {
  const withExemption    = lvtRevenue({ rate, year, exemption: EXEMPTION_AMOUNT, ...opts }).total;
  const withoutExemption = lvtRevenue({ rate, year, exemption: 0, ...opts }).total;
  const exemptionCost = withoutExemption - withExemption;
  return {
    withExemption,
    withoutExemption,
    exemptionCost,
    prebatePerCapitaBump: exemptionCost / population,
  };
}

// ─── PER-BRACKET NET HOUSEHOLD BURDEN ────────────────────────────────────────
// Net LVT burden per filer by income bracket. The legacy LVT_NET_BASE vector is a
// hand-calibrated NO-exemption, 10%-rate net burden (LVT paid by homeowners net of
// renter rent relief) — which is exactly the default scenario, so at the default
// (exemption 0, rate 10%) this returns LVT_NET_BASE unchanged (no regression).
//
// Two adjustments flow through:
//   • rate / capitalization — scale by (rate/0.10)·(capFactor/capRef), so a different
//     LVT rate moves the whole curve along the concave capitalized path.
//   • homeowner exemption — SUBTRACT the LVT on the shielded portion of each home's land:
//       reduction_i = own_i · min(perHomeLand_i, exemption) · rate · capFactor
//     This zeroes the brackets whose land sits below the exemption (the canonical
//     "shields the vast majority of homeowners") and trims the luxury-residential tail.
export function lvtNetBurdenByBracket({
  rate = 0.10,
  exemption = EXEMPTION_DEFAULT,
  assessmentBasis = 'capitalized',
  groundRentYield = GROUND_RENT_YIELD,
} = {}) {
  const sector = LAND_SECTORS.find(s => s.key === 'ownerOcc');
  const rawGross = HOME_LAND_BY_BRACKET.reduce((s, land, i) => s + land * HOMES_BY_BRACKET[i], 0);
  const scale = sector.p0 / rawGross;
  const capFactor = assessmentBasis === 'preTax' ? 1 : groundRentYield / (groundRentYield + rate);
  const capRef = groundRentYield / (groundRentYield + 0.10); // 10% reference point
  const rateScale = (rate / 0.10) * (capFactor / capRef);
  return LVT_NET_BASE.map((base, i) => {
    const own = BRACKETS[i].own;
    const perHome = HOME_LAND_BY_BRACKET[i] * scale;
    const shieldedReduction = own * Math.min(perHome, exemption) * rate * capFactor;
    return Math.max(0, Math.round(base * rateScale - shieldedReduction));
  });
}

// ─── EXPLICIT HOMEOWNER / RENTER INCIDENCE ───────────────────────────────────
// Splits the blended net burden into its two real components so the household sims
// can show who actually pays:
//   ownerLvt_i     = max(perHomeLand_i − exemption, 0) · rate · capFactor · ownerScalar
//                    (what an OWNING household in bracket i pays — capitalized, exemption-aware)
//   renterRelief_i = rentEstimate_i · rentMax · saveFrac · rampFrac
//                    (what a RENTING household saves as LVT expands housing supply; ramps over years)
//   net_i          = own_i · ownerLvt_i − (1−own_i) · renterRelief_i   (SIGNED — low brackets go
//                    net-negative: renters made better off, which the old floored array hid)
// ownerScalar ≈ 0.70 calibrates the first-principles owner LVT (which overshoots the top tail) so the
// blended net at rate 10% / exemption 0 / full ramp tracks the legacy LVT_NET_BASE for mid/upper brackets.
export const LVT_OWNER_SCALAR   = 0.70;  // owner LVT calibration vs first-principles
export const LVT_RENT_MAX       = 0.25;  // max rent reduction at full ramp (matches RacialWealthGap)
export const LVT_RENT_RAMP_YRS  = 10;    // years to full housing-supply rent relief
export const LVT_RENT_SAVE_FRAC = 0.5;   // half the rent relief is "kept" (matches RacialWealthGap)
export const RENT_INCOME_SHARE  = 0.30;  // renters spend ~30% of income on rent
// Representative household income per bracket (parallel to BRACKETS / HOME_LAND_BY_BRACKET),
// used only to estimate renter rent exposure (personas carry no rent field).
export const BRACKET_INCOME = [
  14500, 28000, 40000, 52000, 64000, 79000, 97000, 124000, 186000,
  320000, 750000, 1500000, 3500000, 10000000, 30000000,
];

export function lvtIncidenceByBracket({
  rate = 0.10,
  exemption = EXEMPTION_DEFAULT,
  year = LVT_RENT_RAMP_YRS,
  assessmentBasis = 'capitalized',
  groundRentYield = GROUND_RENT_YIELD,
  ownerScalar = LVT_OWNER_SCALAR,
  rentMax = LVT_RENT_MAX,
  rentRampYrs = LVT_RENT_RAMP_YRS,
} = {}) {
  const sector = LAND_SECTORS.find(s => s.key === 'ownerOcc');
  const rawGross = HOME_LAND_BY_BRACKET.reduce((s, land, i) => s + land * HOMES_BY_BRACKET[i], 0);
  const scale = sector.p0 / rawGross;
  const capFactor = assessmentBasis === 'preTax' ? 1 : groundRentYield / (groundRentYield + rate);
  const rampFrac = Math.min(Math.max(year, 0) / rentRampYrs, 1);
  return BRACKETS.map((b, i) => {
    const own = b.own;
    const perHome = HOME_LAND_BY_BRACKET[i] * scale;
    const taxableLand = Math.max(perHome - exemption, 0);
    const ownerLvt = taxableLand * rate * capFactor * ownerScalar;
    const annualRent = BRACKET_INCOME[i] * RENT_INCOME_SHARE;
    const renterRelief = annualRent * rentMax * LVT_RENT_SAVE_FRAC * rampFrac;
    const net = own * ownerLvt - (1 - own) * renterRelief;
    return {
      bracket: b.label,
      own,
      ownerLvt: Math.round(ownerLvt),
      renterRelief: Math.round(renterRelief),
      net: Math.round(net),
    };
  });
}

// Plain signed per-bracket net array (parallel to LVT_NET_BASE, but incidence-aware and signed).
export function lvtNetIncidenceArray(opts = {}) {
  return lvtIncidenceByBracket(opts).map(x => x.net);
}

// Total LVT on NON-residential land (rental + commercial + ag + vacant ≈ $18.5T), capitalized
// ≈ $529B at 10%. NOTE: this is NOT attributed to the household personas — its incidence falls
// on REITs/pensions/foreign/corporate owners and a ~7–10% landlord minority spread across the
// distribution, which a median-household-per-bracket model can't represent. It is captured in
// the fiscal/revenue aggregate (lvtRevForFiscal taxes the full land base), not per-persona.
export function investmentLandLvtTotal({ rate = 0.10, groundRentYield = GROUND_RENT_YIELD } = {}) {
  const nonRes = LAND_SECTORS.filter(s => !s.exempt).reduce((s, x) => s + x.p0, 0);
  const capFactor = groundRentYield / (groundRentYield + rate);
  return nonRes * rate * capFactor;
}

// ─── FISCAL-ENGINE DROP-IN ───────────────────────────────────────────────────
// Replaces `nomGdp * 0.20 * landPremium * rate`. The land base grows with nominal GDP
// raised to `landGrowthElasticity`: elasticity 1.0 tracks GDP (≈ legacy every year, since
// taxableBase * capFactor / LAND_REF_GDP ≈ 0.20 at rate=10%); the default 0.7 grows the
// base ~30% slower than GDP to reflect the LVT's anti-speculation suppression of land
// prices. Off-10% the rate follows the concave capitalized curve. model='legacy'
// reproduces the old constant exactly (for side-by-side comparison).
export function lvtRevForFiscal({
  rate,
  year,
  nominalGdp,
  model = 'capitalized',
  exemption = EXEMPTION_DEFAULT,
  assessmentBasis = 'capitalized',
  groundRentYield = GROUND_RENT_YIELD,
  landGrowthElasticity = LAND_GROWTH_ELASTICITY,
}) {
  if (model === 'legacy') {
    return nominalGdp * 0.20 * landPremiumFactor(year) * rate;
  }
  const base = taxableBaseP0({ exemption });
  const landGrowth = Math.pow(nominalGdp / LAND_REF_GDP, landGrowthElasticity);
  const assessed = base * landGrowth;
  const value = capitalizedValue(assessed, rate, { assessmentBasis, groundRentYield });
  return Math.min(rate * value, groundRentYield * assessed);
}

// Default-scenario prebate: base $5,000 plus the per-capita value of the revenue
// recovered by removing the homeowner exemption (deficit-neutral redirect in Year 1).
export function redirectedPrebate({ rate = 0.10, ...opts } = {}) {
  return PREBATE_BASE + lvtRevenueExemptionComparison({ rate, ...opts }).prebatePerCapitaBump;
}
export const PREBATE_REDIRECTED = Math.round(redirectedPrebate()); // ≈ $6,101/person
