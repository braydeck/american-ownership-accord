// Healthcare Supplement (docs/American Ownership Accord - Healthcare Supplement.md, Oct 25, 2026):
// universal automatic coverage for lawful residents under 65 through the Health Fund, repeal of the
// employer exclusion with mandatory wage conversion, Medicaid federalized with a declining state
// clawback, all-payer rates with a growth cap. Design decisions: docs/engine-spec-2026-10-07.md,
// "Healthcare Supplement"; rulings in docs/handoffs/healthcare-supplement/DECISIONS.md.
//
// The engine's CBO baseline already holds federal Medicaid, Marketplace subsidies and Medicare, so
// the engine adds only the spending that moves onto the federal budget (private premiums, the state
// Medicaid share, new coverage, cost sharing the package absorbs) and subtracts savings.
//
// Every input carries a tag: [S] read from the cited source, [D] arithmetic on sourced figures,
// [U] unsourced (listed in UNSOURCED below and reported next to results). Research notes with
// tables and URLs: docs/health-research/{baseline-inputs,cost-controls,labor-entrepreneurship,gdp-links}.md.
//
// Sources (2024 calendar year unless noted; GDP $29,184B, BEA):
//   CMS NHE historical tables 2024 (nhe-tables.zip): Table 2 (NHE $5,278.6B), Table 21 (Medicaid
//     $931.7B; Marketplace $149.5B, Medigap $38.3B, direct purchase $215.5B), Table 24 (ESI
//     $1,429.1B, employers $1,047.0B, employees $382.1B), Table 4 (out-of-pocket by service),
//     Table 5-4 (state Medicaid $335.0B), Table 5-6 (Marketplace tax credits $116.6B).
//   CMS Age and Sex Tables 2020 (latest): Table 7 per-capita spending, Table 7-1 per-capita OOP,
//     Table 12 out-of-pocket by service for ages 0-64.
//   CMS NHE Projections 2025-2034: NHE 5.4%/yr against GDP 4.1%/yr (1.3 pp).
//   CBO Long-Term Budget Outlook 2025-2055, Table A-1: additional cost growth moves smoothly to
//     0.6% by 2055 for private premiums and Medicaid.
//   CBO Budget and Economic Outlook 2026-2036, LTBO workbook Supplemental Table 1: Medicare net
//     outlays 3.332/4.216/5.001/5.454% of GDP in 2026/2036/2046/2056.
//   CBO Federal Subsidies for Health Insurance 2026-2036 (pub. 62539, July 2026), Table A-1:
//     premium tax credit outlays plus 1332/BHP $129B (FY2025), $100B (2026), $80B (2027).
//   CBO WP 2020-08 (single payer): rate options, induced demand (+10% for the insured with lower
//     cost sharing, +5% with higher; about one-third met). CBO 2008 Key Issues ch. 3: newly
//     insured use 75-95% as much care as the previously insured.
//   KFF Employer Health Benefits Survey 2025; KFF State Health Facts ESI by FPL 2024 (ACS).
//   RTI Maryland All-Payer Model final evaluation (2019): Medicare spending growth 2.8% slower
//     over 2014-2018 (~0.6 pp a year). Urban (Holahan and Simpson 2026); CRFB Health Savers
//     2021; CAQH Index 2025; Sahni, Carrus, Cutler, JAMA 2021.
//   MACPAC MACStats Feb 2026, Exhibits 16, 20, 21. Census P60-288 (2024). KFF Key Facts about
//     the Uninsured (2024). MPI unauthorized profile (2023). HHS 2024 poverty guidelines.
//   CBO/JCT 2026: the employer exclusion costs $471B in income and payroll taxes in FY2026 (check
//     figure; the engine taxes converted wages bottom-up at Accord rates).
import { BRACKETS } from '@/lib/brackets';
import { INCOME_REF_GDP, accordScheduleTax, ssAboveCapBase, SS_RATE, bracketPoints, earnersPerFiler, SS_CAP_SNAPSHOT } from '@/lib/income-tax';

const GDP_2024 = 29_184e9;
const share = b => b * 1e9 / GDP_2024;

export const HEALTH_2024 = {
  nhe:               5278.6,  // [S] CMS NHE Table 2
  esiTotal:          1429.1,  // [S] CMS NHE Table 24
  esiEmployer:       1047.0,  // [S] CMS NHE Table 24, all employers
  nongroup:          177.2,   // [D] direct purchase $215.5B less Medigap $38.3B (CMS NHE Table 21)
  nongroupFederal:   116.6,   // [S] Marketplace tax credits and subsidies, CMS NHE Table 5-6
  medicaid:          931.7,   // [S] CMS NHE Table 21
  medicaidState:     335.0,   // [S] state portion of Medicaid, CMS NHE Table 5-4
  // [D] Out-of-pocket on services the package covers (hospital, physician and clinical, other
  // professional, prescription drugs): 2024 all-ages OOP by service (CMS NHE Table 4) times the
  // 2020 under-65 share of each service (CMS age Table 12). Applying 2020 age shares to 2024 is
  // the one step without a source; CMS publishes no later age split.
  oopUnder65Package: 40.6 * 0.817 + 94.3 * 0.724 + 44.8 * 0.806 + 55.0 * 0.670,
  // [D] Lawfully present uninsured under 65: KFF 0-64 uninsured 26.7M (ACS 2024) less MPI
  // unauthorized uninsured 6.61M (2023). Different years and age bases; no direct count exists.
  lawfulUninsured:   26.7e6 - 6.61e6,
  uninsured0to64:    26.7e6,  // [S] KFF Key Facts (ACS 2024)
  under65Pop:        279e6,   // [S] Census 2024 resident population under 65
  // [D] Medicaid spending outside the under-65 package: aged enrollees plus under-65 duals, ~33% of
  // benefits (MACStats Feb 2026, Exhibit 21; upper bound because the groups overlap).
  medicaidLtcShare:  0.33,
};

// CBO 2008: once covered, the previously uninsured use 75-95% as much care as the previously
// insured. [S] Midpoint.
export const NEWLY_INSURED_USE = 0.85;
// CBO WP 2020-08: insured demand rises 10% with lower cost sharing and 5% with higher, and about
// one-third of the added demand is met. [S]
const INDUCED_DEMAND = { zero: 0.10 / 3, copays: 0.05 / 3 };
// Share of package out-of-pocket the Fund absorbs. Zero cost sharing absorbs all of it [S, by
// definition]; income-capped copays outside primary and chronic care absorb a share no source
// measures for this design [U].
const OOP_ABSORBED = { zero: 1, copays: 0.65 };
export const costShareAbsorbed = p => OOP_ABSORBED[p.healthCostSharing] ?? OOP_ABSORBED.copays;

// Provider payment levels, as the reduction in national health spending once phased in. [D]
// Medicare's rates are unchanged under the Supplement, so the rate levels are computed for
// patients under 65 only, from 2024 spending by payer and each payer's price relative to Medicare:
//   hospitals: private $558.9B at 2.54x Medicare (RAND RRA1144-2, Round 5.1, 2022); Medicaid
//     $318.9B at 1.048x (AHA payment-to-cost, Medicaid 88 cents vs Medicare 84 cents, 2020).
//   physicians: private $388.3B at 1.394x (CBO WP 2020-08: 125% in 2020 rising to 161% in 2030,
//     2024 interpolated); Medicaid $64.4B at 0.72x (Zuckerman et al., Health Affairs 2021).
//   Spending: CMS NHE Tables 7 and 9, 2024. Static at 2024 price ratios; CBO projects private
//   prices rising against Medicare, so the savings share would grow.
// Prescription drug prices are not included.
//   current: one rate at today's average under-65 payment (the draft's revenue-neutral start).
//   rate142 / rate123: hospitals 142% / 123% and physicians 120% / 111% of Medicare (CBO WP
//     2020-08's two rate scenarios, there applied to all payers).
//   rate150 / rate160: hospitals 150% / 160%; physicians at today's average.
//   -narrow / -broad: the rate with protected hospitals held harmless on under-65 revenue
//     (narrow: critical access and safety-net hospitals, 2,153 of 4,507; broad: all rural and
//     safety-net, 3,032). The top-up's share of the hospital saving at each rate comes from the
//     hospital-level check (scripts/health-hospitals.py, CMS cost reports 2023).
//   cap200: commercial hospital prices capped at 200% of Medicare: Urban 2026, -$114.8B in 2028,
//     over 2028 NHE grown from 2024 at CMS's projected 5.4%/yr.
//   cap150: CRFB 2021, 150% cap saves $1.94T against $1T at 200%; scaled from cap200 by 1.94.
const PAY = {
  hospital: { private: [558.9, 2.54], medicaid: [318.9, 0.88 / 0.84] },
  physician: { private: [388.3, 1.25 + (1.61 - 1.25) * 0.4], medicaid: [64.4, 0.72] },
};
const volume = s => Object.values(s).reduce((t, [d, x]) => t + d / x, 0);
const spend = s => Object.values(s).reduce((t, [d]) => t + d, 0);
const savingAt = (s, rate) => rate == null ? 0 : spend(s) - rate * volume(s);
// Share of the hospital saving paid back to protected hospitals (hospital-level check).
const HOLD_HARMLESS = {
  narrow: { 1.23: 0.177, 1.42: 0.162, 1.5: 0.157, 1.6: 0.168 },
  broad:  { 1.23: 0.544, 1.42: 0.557, 1.5: 0.581, 1.6: 0.658 },
};
const rateCut = (h, ph, protect) =>
  (savingAt(PAY.hospital, h) * (1 - (protect ? HOLD_HARMLESS[protect][h] : 0)) + savingAt(PAY.physician, ph)) / 5278.6;
const NHE_2028 = 5278.6 * 1.054 ** 4;
export const PAYMENT_LEVEL_CUT = {
  current: 0,
  rate160: rateCut(1.6, null), 'rate160-narrow': rateCut(1.6, null, 'narrow'),
  rate150: rateCut(1.5, null), 'rate150-narrow': rateCut(1.5, null, 'narrow'), 'rate150-broad': rateCut(1.5, null, 'broad'),
  rate142: rateCut(1.42, 1.2), 'rate142-narrow': rateCut(1.42, 1.2, 'narrow'), 'rate142-broad': rateCut(1.42, 1.2, 'broad'),
  rate123: rateCut(1.23, 1.11), 'rate123-narrow': rateCut(1.23, 1.11, 'narrow'), 'rate123-broad': rateCut(1.23, 1.11, 'broad'),
  cap200:  114.8 / NHE_2028,
  cap150:  114.8 / NHE_2028 * 1.94,
};
// Administrative savings in a multi-payer system with one claims format and one prior-auth
// rulebook, share of NHE. [D] low: CAQH Index 2025, $20B of remaining transaction savings;
// high: Sahni et al. 2021, $265B a year (about 5% of 2024 NHE). No source models this design.
export const ADMIN_SAVING = { low: 20 / 5278.6, high: 265 / 5278.6 };

const H = HEALTH_2024;
// CBO 62539: premium tax credit outlays plus 1332 waivers and the Basic Health Program fall from
// $129B (FY2025) to $100B (2026) and $80B (2027) as the enhanced credits expire. [S] The federal
// nongroup spending the Fund replaces follows that path and holds the 2027 level after.
const nongroupFederalPath = yr => yr <= 0 ? 1 : yr === 1 ? 100 / 129 : 80 / 129;
const insuredUnder65 = H.under65Pop - H.uninsured0to64;
const packageInsured = H.esiTotal + H.nongroup + H.medicaid * (1 - H.medicaidLtcShare) + H.oopUnder65Package;
// Share of GDP in 2024 for each line.
export const HEALTH_GDP_2024 = {
  nhe: share(H.nhe),
  esiEmployer: share(H.esiEmployer),
  esiEmployee: share(H.esiTotal - H.esiEmployer),
  esiTotal: share(H.esiTotal),
  nongroup: share(H.nongroup),
  nongroupPrivate: share(H.nongroup - H.nongroupFederal),
  nongroupFederal: share(H.nongroupFederal),
  medicaid: share(H.medicaid),
  medicaidState: share(H.medicaidState),
  medicaidFederal: share(H.medicaid - H.medicaidState),
  // Per insured person under 65, the package's spending, times the newly insured's use.
  newCoverage: share(H.lawfulUninsured * NEWLY_INSURED_USE * packageInsured / insuredUnder65),
  oopUnder65: share(H.oopUnder65Package),
};

export const HEALTH_DEFAULTS = {
  healthSupplementOn:      true,
  healthContributionRate:  0.0804,   // dedicated contribution on all income; 0 = the Fund is paid from general revenue
  healthContribExempt:     8000,   // $ of income per filer exempt from the contribution
  healthPaymentLevel:      'rate150-narrow', // key of PAYMENT_LEVEL_CUT: 150% of Medicare under 65, critical access and safety-net hospitals held harmless
  healthAdminSaving:       'low',  // key of ADMIN_SAVING
  healthCapCut:            0.006,  // a year by which capped spending grows below current law (Maryland, RTI 2019) [S]
  healthCapCutYears:       null,   // years the cut lasts (5 = Maryland's measured span); null = every year [U beyond 5]
  healthCapScope:          0.81,   // share of personal health care spending in capped categories (CMS NHE Table 2) [D]
  healthCapMedicareOn:     true,   // the all-payer schedule covers Medicare's provider payments (Maryland's waiver precedent)
  healthCostSharing:       'copays', // 'copays' (draft) or 'zero'
  healthImmigrantAgeFactor: 1,     // added residents' cost relative to the under-65 average [U: no sourced age mix]
  healthReserveToFund:     true,   // the Healthcare Reserve's share of Treasury cash pays Health Fund costs
  healthDiscretionaryShare: 0,     // share of discretionary Treasury cash (brake off) sent to the Health Fund
  healthClawbackStart:     0.90,   // state payment as a share of the former state Medicaid share: the Part D
  healthClawbackEnd:       0.75,   // clawback phasedown (MMA 2003, 90% in 2006 to 75% in 2015) [S]
  healthClawbackYears:     10,
  healthMobilityGain:      'central', // key of MOBILITY_GAIN
  healthStartupGain:       'central', // key of STARTUP_RATE_GAIN
};

// Inputs still without a source, reported next to every result.
export const UNSOURCED = [
  'Copay design: share of package out-of-pocket the Fund absorbs (0.65)',
  'Growth cap beyond five years: Maryland measured 2014-2018 only',
  'Added residents\' age mix (cost set at the under-65 average)',
  'Excess cost growth path between 2034 (CMS 1.3 pp) and 2055 (CBO 0.6 pp): linear',
  'Applying 2020 under-65 out-of-pocket shares to 2024',
  'ESI family-policy share by bracket (rises with the joint-filer share)',
  'Individual-market enrollment above 400% of poverty (0.4 of the subsidized rate)',
  'Filer AGI standing in for family income when mapping KFF coverage rates by poverty level',
  'Prime-age (25-54) share of wages, converting CEA\'s 0.3% of prime-age wages to GDP (0.65)',
  'Induced rise in business formation outside the Medicare-at-65 group: half of Fairlie-Kapur-Gates (central)',
  'Induced businesses become employers at the average rate',
  'Unincorporated self-employment share of workers (6%), for the founder output loss',
];

// ─── Gains from untying coverage from jobs ───────────────────────────────────
// GDP level effects, phased in from Year 2 when coverage stops depending on the job.
// Job mobility, CEA (2009) Sec. VI.C: job lock costs 0.3% of prime-age wages in the short run (lower
// bound) and 0.24% of GDP in the long run (speculative). central: 0.3% x wages 43% of GDP x
// prime-age share 0.65 [D/U]; high: 0.24% [S]. Phased in over 10 years.
export const MOBILITY_GAIN = { zero: 0, central: 0.003 * 0.43 * 0.65, high: 0.0024 };
// Entrepreneurship: rise in the employer startup rate, percentage points. BDS startup rate about 8%
// (Decker et al. 2014) x induced rise in business formation x ESI coverage share of people under 65
// (57.8%, KFF/ACS 2024). high: the Medicare-at-65 estimate, +13% (Fairlie, Kapur and Gates 2011) [S];
// central: half of it, since the effect concentrates in older, less healthy workers [U]; zero: no
// effect (Heim and Lurie, IRS data) [S].
export const STARTUP_RATE_GAIN = { zero: 0, central: 8 * 0.065 * 0.578, high: 8 * 0.13 * 0.578 };
// About 0.8% of the productivity level per sustained point of startup rate, reached over about
// three decades (derived from Alon et al. 2018: 3.1% over a ~4 pp decline). [D]
const PRODUCTIVITY_PER_STARTUP_PT = 0.008;
const STARTUP_PHASE_YEARS = 30;
// Founders who leave wage jobs produce about 15% less per hour (Levine and Rubinstein) [S], applied to
// the induced founders: self-employment share 6% [U] x induced rise x ESI share, times labor's 0.65
// output share.
const FOUNDER_OUTPUT_LOSS = 0.15;
const SELF_EMPLOYED_SHARE = 0.06;
export function untyingGdpGain(yr, p) {
  if (!p.healthSupplementOn || yr < 2) return 0;
  const mobility = (MOBILITY_GAIN[p.healthMobilityGain] ?? 0) * Math.min(1, (yr - 1) / 10);
  const pts = STARTUP_RATE_GAIN[p.healthStartupGain] ?? 0;
  const productivity = pts * PRODUCTIVITY_PER_STARTUP_PT * Math.min(1, (yr - 1) / STARTUP_PHASE_YEARS);
  const founderLoss = SELF_EMPLOYED_SHARE * (pts / (8 * 0.578)) * 0.578 * FOUNDER_OUTPUT_LOSS * 0.65 * Math.min(1, (yr - 1) / 5);
  return mobility + productivity - founderLoss;
}

// Current-law excess cost growth: health spending per person over GDP per person. CMS projects
// 1.3 pp through 2034 [S]; CBO's ultimate rate for private premiums and Medicaid is 0.6 pp by
// 2055 [S]; linear between [U].
export function clExcessCostGrowth(fy) {
  if (fy <= 2034) return 0.013;
  const t = Math.min(1, (fy - 2034) / (2055 - 2034));
  return 0.013 * (1 - t) + 0.006 * t;
}
const ramp = (yr, start, end) => Math.min(1, Math.max(0, (yr - start + 1) / (end - start + 1)));

// Health spending relative to GDP, against 2024, on the current-law path (index 1 in 2024).
export function clHealthIndex(yr) {
  let x = 1;
  for (let k = 0; k <= yr; k++) x *= Math.exp(clExcessCostGrowth(2025 + k));
  return x;
}
// Ratio of capped to current-law spending in capped categories. The cap binds from Year 2 (the
// Supplement's cost-control phase) and slows growth by healthCapCut a year.
export function healthCapFactor(yr, p) {
  const last = p.healthCapCutYears == null ? Infinity : 1 + p.healthCapCutYears;
  let x = 1;
  for (let k = 2; k <= Math.min(yr, last); k++) x *= Math.exp(-p.healthCapCut);
  return x;
}
// CBO extended baseline, Medicare net outlays as a share of GDP. [S]
const MEDICARE_POINTS = [[2026, 0.03332], [2036, 0.04216], [2046, 0.05001], [2056, 0.05454]];
function medicareGdp(fy) {
  if (fy <= MEDICARE_POINTS[0][0]) return MEDICARE_POINTS[0][1];
  for (let i = 1; i < MEDICARE_POINTS.length; i++) {
    const [y1, v1] = MEDICARE_POINTS[i], [y0, v0] = MEDICARE_POINTS[i - 1];
    if (fy <= y1) return v0 + (v1 - v0) * (fy - y0) / (y1 - y0);
  }
  return MEDICARE_POINTS.at(-1)[1];
}

// ─── Employer contributions by income bracket ───────────────────────────────
// Expected employer contribution per tax filer: the ESI coverage rate at the filer's income as a
// share of the poverty line (KFF, ACS 2024: 14.8% under 100%, 28.2% at 100-199%, 57.7% at
// 200-399%, 80.3% at 400%+) [S], times the KFF 2025 employer share of a single or family policy
// [S], with the family share rising with the joint-filer share [U]. Scaled to the CMS total.
const FPL_2024 = n => 15060 + 5380 * Math.max(0, n - 1);   // [S] HHS 2024 poverty guidelines
const esiRateAtFpl = r => r < 1 ? 0.148 : r < 2 ? 0.282 : r < 4 ? 0.577 : 0.803;
const fplRatio = (bi, agi) => agi / FPL_2024(BRACKETS[bi].hhSz);
const avgOverPoints = (bi, f) => { const pts = bracketPoints(bi); return pts.reduce((s, a) => s + f(fplRatio(bi, a)), 0) / pts.length; };
const ESI_POLICY_RATE = BRACKETS.map((b, bi) => avgOverPoints(bi, esiRateAtFpl));
const KFF_EMPLOYER = { single: 9325 - 1440, family: 26993 - 6850 };
const KFF_WORKER   = { single: 1440, family: 6850 };
const familyShare = b => Math.min(0.9, 0.15 + 0.7 * b.jFrac);
const rawPolicy = (b, bi, v) => ESI_POLICY_RATE[bi] * (familyShare(b) * v.family + (1 - familyShare(b)) * v.single);
const rawTotal = v => BRACKETS.reduce((s, b, bi) => s + b.filers * rawPolicy(b, bi, v), 0);
// Calibration to CMS at the income snapshot's GDP (INCOME_REF_GDP).
const ESI_SCALE = HEALTH_GDP_2024.esiEmployer * INCOME_REF_GDP / rawTotal(KFF_EMPLOYER);
const WORKER_SCALE = HEALTH_GDP_2024.esiEmployee * INCOME_REF_GDP / rawTotal(KFF_WORKER);
export const employerContributionPerFiler = bi => rawPolicy(BRACKETS[bi], bi, KFF_EMPLOYER) * ESI_SCALE;
export const workerPremiumPerFiler = bi => rawPolicy(BRACKETS[bi], bi, KFF_WORKER) * WORKER_SCALE;
export const ESI_CALIBRATION = ESI_SCALE;

// Compensation is unchanged: employers convert the contribution into wages plus the employer's
// payroll tax on them, so cash wages rise by contribution / 1.0765.
export const EMPLOYER_PAYROLL = 0.0765;
export const FICA_RATE = 0.153;
export const convertedWagePerFiler = bi => employerContributionPerFiler(bi) / (1 + EMPLOYER_PAYROLL);

// Accord income tax and the Social Security contribution above the cap on converted wages, as a
// share of those wages, plus the share of converted wages under the payroll cap. Computed at the
// income snapshot, which the engine scales with GDP.
export function convertedWageTaxRates(schedule, exemptSingle, exemptJoint, ssUncapOn) {
  let wages = 0, incTax = 0, ssTax = 0, belowCap = 0;
  BRACKETS.forEach((b, bi) => {
    const cw = convertedWagePerFiler(bi);
    const ded = b.jFrac * exemptJoint + (1 - b.jFrac) * exemptSingle;
    const pts = bracketPoints(bi);
    for (const agi of pts) {
      const w = b.filers / pts.length;
      incTax += w * (accordScheduleTax(agi + cw, ded, schedule) - accordScheduleTax(agi, ded, schedule));
      if (ssUncapOn) ssTax += w * SS_RATE * (ssAboveCapBase(agi + cw, b.jFrac) - ssAboveCapBase(agi, b.jFrac));
      const e = earnersPerFiler(b.jFrac);
      const room = Math.max(0, SS_CAP_SNAPSHOT * e - agi);
      belowCap += w * Math.min(cw, room);
      wages += w * cw;
    }
  });
  return { incomeTax: incTax / wages, ssAboveCap: ssTax / wages, belowCapShare: belowCap / wages };
}

// ─── One year of the Supplement on the federal budget ───────────────────────
// trendNomGdp: the no-Accord nominal GDP the baseline is sized on. immigrantsUnder65: added
// residents covered (persons). Returns dollars.
export function healthFiscalYear({ yr, p, trendNomGdp, immigrantsUnder65 }) {
  const fy = 2025 + yr;
  const g = HEALTH_GDP_2024;
  const cl = clHealthIndex(yr) * trendNomGdp;   // current-law health dollars per 2024 GDP share
  const cap = healthCapFactor(yr, p);
  const capped = 1 - p.healthCapScope * (1 - cap);
  const absorbed = g.oopUnder65 * costShareAbsorbed(p);
  const induced = INDUCED_DEMAND[p.healthCostSharing] ?? INDUCED_DEMAND.copays;
  const fundBase = (g.esiTotal + g.nongroup + g.medicaid + absorbed) * (1 + induced) + g.newCoverage;
  const fundSpend = fundBase * cl * capped;
  const existingFederal = (g.medicaidFederal + g.nongroupFederal * nongroupFederalPath(yr)) * cl;
  // Added residents: the package's per-person cost under 65, without long-term care.
  const perEnrollee = (fundBase - g.medicaid * H.medicaidLtcShare) * cl * capped / H.under65Pop;
  const immigrantSpend = perEnrollee * immigrantsUnder65 * p.healthImmigrantAgeFactor;
  const medicareSavings = p.healthCapMedicareOn ? medicareGdp(fy) * trendNomGdp * p.healthCapScope * (1 - cap) : 0;
  // Payment-level and administrative savings are shares of national health spending, phased in
  // over Years 2-6 and counted on the federal budget, which now pays nearly every bill under 65.
  const nheCapped = g.nhe * cl * capped;
  const paymentSavings = nheCapped * (PAYMENT_LEVEL_CUT[p.healthPaymentLevel] ?? 0) * ramp(yr, 2, 6);
  const adminSavings = nheCapped * (ADMIN_SAVING[p.healthAdminSaving] ?? 0) * ramp(yr, 2, 6);
  // Employers convert half their contribution in Year 1 and pay the other half to the Health Fund.
  const conversion = Math.min(1, yr / 2);
  const employerCL = g.esiEmployer * cl;
  const convertedWages = employerCL * conversion / (1 + EMPLOYER_PAYROLL);
  const employerTransition = employerCL * (1 - conversion);
  const t = Math.min(1, Math.max(0, (yr - 1) / Math.max(1, p.healthClawbackYears - 1)));
  const clawbackShare = p.healthClawbackStart + (p.healthClawbackEnd - p.healthClawbackStart) * t;
  // The state payment follows the capped program, as the Part D clawback follows Part D spending.
  const clawback = g.medicaidState * cl * capped * clawbackShare;
  return {
    fundSpend, existingFederal, immigrantSpend, medicareSavings, paymentSavings, adminSavings,
    netOutlays: fundSpend - existingFederal + immigrantSpend - medicareSavings - paymentSavings - adminSavings,
    convertedWages, employerTransition, clawback, perEnrollee,
    employerCL, capFactor: cap,
  };
}

// ─── Household layer ─────────────────────────────────────────────────────────
// Per filer, snapshot dollars (the persona model scales by its own income path): what current law
// takes in premiums and out-of-pocket, and the parts the Supplement removes.
// Out-of-pocket per person: CMS age Table 7-1 (2020), ages 0-18 $396, 19-64 $1,003 [S]; adults per
// filer are 1 + the joint-filer share, the rest of the household are children.
const oopRaw = b => { const adults = Math.min(b.hhSz, 1 + b.jFrac); return adults * 1003 + Math.max(0, b.hhSz - adults) * 396; };
// Individual-market enrollment: subsidized coverage spans 100-400% of poverty (ACA) [S]; above 400%
// enrollment is set at 0.4 of that rate [U]; below 100% is Medicaid.
const nongroupAtFpl = r => r < 1 ? 0 : r < 4 ? 1 : 0.4;
const NONGROUP_RATE = BRACKETS.map((b, bi) => avgOverPoints(bi, nongroupAtFpl));
const OOP_SCALE = HEALTH_GDP_2024.oopUnder65 * INCOME_REF_GDP / BRACKETS.reduce((s, b) => s + b.filers * oopRaw(b), 0);
const NONGROUP_SCALE = HEALTH_GDP_2024.nongroupPrivate * INCOME_REF_GDP / BRACKETS.reduce((s, b, bi) => s + b.filers * NONGROUP_RATE[bi], 0);
export const oopPerFiler = bi => oopRaw(BRACKETS[bi]) * OOP_SCALE;
export const nongroupPremiumPerFiler = bi => NONGROUP_RATE[bi] * NONGROUP_SCALE;

// Coverage gained by the lawfully present uninsured, valued at what the Fund spends on them, as
// CBO values Medicaid in household income (CBO, The Distribution of Household Income). In-kind:
// it counts in income, not in savings. Uninsured rates under 65 by poverty level: KFF Key Facts
// about the Uninsured (2026, ACS 2024) [S]: below 200% 16.5%, 200-399% 11.5%, 400%+ 4.5%. Scaled
// to the lawfully present uninsured total, which assumes the unauthorized share of the uninsured
// is the same at every income [D].
const uninsuredAtFpl = r => r < 2 ? 0.165 : r < 4 ? 0.115 : 0.045;
const UNINSURED_RATE = BRACKETS.map((b, bi) => avgOverPoints(bi, uninsuredAtFpl));
const UNINSURED_SCALE = H.lawfulUninsured / BRACKETS.reduce((s, b, bi) => s + b.filers * b.hhSz * UNINSURED_RATE[bi], 0);
const COVERAGE_PER_PERSON = HEALTH_GDP_2024.newCoverage * INCOME_REF_GDP / H.lawfulUninsured;
export const coverageValuePerFiler = bi => BRACKETS[bi].hhSz * UNINSURED_RATE[bi] * UNINSURED_SCALE * COVERAGE_PER_PERSON;

// National health spending as a share of current-law GDP in year yr: the current-law path, and the
// Supplement's path after the growth cap and the phased payment-level and administrative savings.
export function nheShareOfGdp(yr, p) {
  const currentLaw = HEALTH_GDP_2024.nhe * clHealthIndex(yr);
  if (!p.healthSupplementOn) return { currentLaw, accord: currentLaw };
  const capped = 1 - p.healthCapScope * (1 - healthCapFactor(yr, p));
  const cut = ((PAYMENT_LEVEL_CUT[p.healthPaymentLevel] ?? 0) + (ADMIN_SAVING[p.healthAdminSaving] ?? 0)) * ramp(yr, 2, 6);
  return { currentLaw, accord: currentLaw * capped * (1 - cut) };
}
