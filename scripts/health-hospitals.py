"""Hospital-level check of the Healthcare Supplement's provider payment levels.

Data: CMS Hospital Provider Cost Report public use file, 2023 (data.cms.gov, "Hospital Provider
Cost Report : 2023-12-06", CostReport_2023_Final.csv, downloaded 2026-10-30), short-term acute
(STH) and critical access (CAH) hospitals. Kept locally at
docs/health-research/data/CostReport_2023_Final.csv (gitignored).

What the Supplement changes for a hospital: patients under 65 (today's privately insured, Medicaid
and uninsured patients) are paid by the Health Fund; Medicare patients are unchanged.

Per hospital, from the cost report:
  - Medicaid revenue: "Net Revenue from Medicaid" (Worksheet S-10) [S]; Medicaid cost: Medicaid
    charges x cost-to-charge ratio [S]. S-10 totals 11% of the sample's revenue against Medicaid's
    19.5% of hospital spending in CMS NHE Table 7 (2024), likely supplemental and DSH payments
    missing from S-10, so both are scaled by one national factor to the NHE share [D].
  - Uninsured cost: "Cost of Uncompensated Care" (S-10, charity care plus non-Medicare bad debt
    at cost) [S]. Hospitals are assumed to collect nothing net on it [D].
  - Medicare revenue: not reported. Estimated as the hospital's traditional-Medicare share of
    inpatient days times net patient revenue, scaled by one national factor so the sample's
    Medicare share of revenue equals CMS NHE Table 7's 2024 share (439.8 / 1,634.7) [D]. One
    factor for every hospital assumes Medicare Advantage penetration and the outpatient mix are
    the same everywhere [D]; rural areas have lower MA penetration, so this overstates rural
    Medicare shares and understates rural exposure to the commercial cut.
  - Medicare pays 82 cents per dollar of cost (AHA, 2022) [S]; critical access hospitals are paid
    101% of reasonable cost (42 CFR 413.70) [S].
  - Commercial revenue = net patient revenue - Medicare - Medicaid [D]; commercial cost = total
    costs - Medicare, Medicaid and uninsured costs [D]. Commercial price relative to Medicare =
    (commercial revenue / commercial cost) / Medicare's payment-to-cost ratio [D].
Volumes are in Medicare-equivalent dollars: what Medicare would pay for the care (cost x the
Medicare payment-to-cost ratio). Static: 2023 volumes and costs, no added use by the newly insured.

Payment rules for patients under 65:
  rate r    one rate, r x Medicare, for every under-65 patient (formerly uninsured included);
            r = today's national average is the engine's revenue-neutral start
  cap c     each payer's current rate, commercial capped at c x Medicare (Urban 2026 design);
            formerly uninsured paid at the national average rate
  corridor  rate r, with protected hospitals held harmless (no lower under-65 revenue than
            today). narrow: critical access plus safety net; broad: all rural plus safety net.
            Safety net = top quartile of (Medicaid + uncompensated) cost share [D].
Run: python3 scripts/health-hospitals.py  ->  scripts/output/health-hospitals.json
"""
import csv
import json
import statistics as st

SRC = 'docs/health-research/data/CostReport_2023_Final.csv'
MEDICARE_PCR = 0.82
CAH_PCR = 1.01
NHE_MEDICARE_SHARE = 439.8 / 1634.7
NHE_MEDICAID_SHARE = 318.9 / 1634.7
HOSPITAL_NHE_2024 = 1634.7e9
NHE_2024 = 5278.6e9


def num(x):
    try:
        return float(x)
    except ValueError:
        return 0.0


raw = [r for r in csv.DictReader(open(SRC, newline='', encoding='latin-1')) if r['CCN Facility Type'] in ('STH', 'CAH')]
H = []
for r in raw:
    npr, cost = num(r['Net Patient Revenue']), num(r['Total Costs'])
    days = num(r['Hospital Total Days (V + XVIII + XIX + Unknown) For Adults & Peds'])
    if npr <= 0 or cost <= 0 or days <= 0 or npr + num(r['Total Other Income']) <= 0:
        continue
    H.append({
        'ccn': r['Provider CCN'], 'name': r['Hospital Name'], 'state': r['State Code'],
        'rural': r['Rural Versus Urban'] == 'R', 'cah': r['CCN Facility Type'] == 'CAH',
        'npr': npr, 'cost': cost, 'other': num(r['Total Other Income']), 'net': num(r['Net Income']),
        'ffsShare': min(1, num(r['Hospital Total Days Title XVIII For Adults & Peds']) / days),
        'mcdRev': max(0, num(r['Net Revenue from Medicaid'])),
        'mcdCost': max(0, num(r['Medicaid Charges']) * num(r['Cost To Charge Ratio'])),
        'uninsCost': max(0, num(r['Cost of Uncompensated Care'])),
    })

k = NHE_MEDICARE_SHARE * sum(h['npr'] for h in H) / sum(h['ffsShare'] * h['npr'] for h in H)
km = NHE_MEDICAID_SHARE * sum(h['npr'] for h in H) / sum(h['mcdRev'] for h in H)
for h in H:
    h['pcr'] = CAH_PCR if h['cah'] else MEDICARE_PCR
    h['mcdRev'] *= km
    h['mcdCost'] *= km
    h['mcrRev'] = min(0.9, k * h['ffsShare']) * h['npr']
    h['mcrCost'] = h['mcrRev'] / h['pcr']
    h['comRev'] = max(0, h['npr'] - h['mcrRev'] - h['mcdRev'])
    h['comCost'] = max(0.02 * h['cost'], h['cost'] - h['mcrCost'] - h['mcdCost'] - h['uninsCost'])
    h['comPrice'] = h['comRev'] / h['comCost'] / h['pcr']
    h['vCom'], h['vMcd'], h['vUnins'] = (h[c] * h['pcr'] for c in ('comCost', 'mcdCost', 'uninsCost'))
    h['u65Rev'] = h['comRev'] + h['mcdRev']
    h['snShare'] = (h['mcdCost'] + h['uninsCost']) / h['cost']
    h['margin'] = h['net'] / (h['npr'] + h['other'])

sn_cut = sorted(h['snShare'] for h in H)[int(0.75 * len(H))]
r_nat = sum(h['u65Rev'] for h in H) / sum(h['vCom'] + h['vMcd'] for h in H)
for h in H:
    h['narrow'] = h['cah'] or h['snShare'] >= sn_cut
    h['broad'] = h['rural'] or h['snShare'] >= sn_cut


def new_u65(h, rule):
    kind, x, prot = rule
    if kind == 'rate':
        new = x * (h['vCom'] + h['vMcd'] + h['vUnins'])
    else:
        new = h['comRev'] * (min(1, x / h['comPrice']) if h['comPrice'] > 0 else 1) + h['mcdRev'] + r_nat * h['vUnins']
    return max(new, h['u65Rev']) if prot and h[prot] else new


def uninsured_pay(h, rule):
    return (rule[1] if rule[0] == 'rate' else r_nat) * h['vUnins']


def summarize(group, rule):
    d = [new_u65(h, rule) - h['u65Rev'] for h in group]
    pct = [x / (h['npr'] + h['other']) * 100 for x, h in zip(d, group)]
    after = [(h['net'] + x) / (h['npr'] + h['other'] + x) for x, h in zip(d, group)]
    return {
        'hospitals': len(group),
        'shareLosingRevenue': round(sum(x < 0 for x in d) / len(group) * 100, 1),
        'medianChangePctRevenue': round(st.median(pct), 1),
        'shareNegativeMarginBefore': round(sum(h['margin'] < 0 for h in group) / len(group) * 100, 1),
        'shareNegativeMarginAfter': round(sum(m < 0 for m in after) / len(group) * 100, 1),
        'shareMarginBelowMinus10After': round(sum(m < -0.10 for m in after) / len(group) * 100, 1),
    }


GROUPS = {
    'all': H,
    'urban': [h for h in H if not h['rural']],
    'rural': [h for h in H if h['rural']],
    'criticalAccess': [h for h in H if h['cah']],
    'safetyNet': [h for h in H if h['snShare'] >= sn_cut],
    'kansasRural': [h for h in H if h['state'] == 'KS' and h['rural']],
}
RULES = {f'rate{round(r * 100)}{"-" + p if p else ""}': ('rate', r, p) for r in (round(r_nat, 2), 1.23, 1.42, 1.5, 1.6, 1.7) for p in (None, 'narrow', 'broad')}
RULES.update({'cap200': ('cap', 2.0, None), 'cap150': ('cap', 1.5, None)})
scale = HOSPITAL_NHE_2024 / sum(h['npr'] for h in H)
share = lambda dollars: round(dollars * scale / NHE_2024 * 100, 2)
out = {
    'calibration': {
        'hospitals': len(H), 'medicareDaysScale': round(k, 3), 'medicaidScale': round(km, 3),
        'nationalUnder65RateXMedicare': round(r_nat, 3),
        'weightedCommercialPriceXMedicare': round(sum(h['comRev'] for h in H) / sum(h['vCom'] for h in H), 2),
        'safetyNetCutoffShare': round(sn_cut, 3),
        'protectedNarrow': sum(h['narrow'] for h in H), 'protectedBroad': sum(h['broad'] for h in H),
    },
    # Saving on today's insured under-65 patients (new-coverage payments are counted in the
    # engine separately), and the hold-harmless top-ups, as shares of 2024 NHE.
    'byRule': {name: {
        'savingShareOfNhe': share(-sum(new_u65(h, rule) - uninsured_pay(h, rule) - h['u65Rev'] for h in H)),
        'holdHarmlessShareOfNhe': share(sum(new_u65(h, rule) - new_u65(h, (rule[0], rule[1], None)) for h in H)),
        **{g: summarize(v, rule) for g, v in GROUPS.items()},
    } for name, rule in RULES.items()},
}
json.dump(out, open('scripts/output/health-hospitals.json', 'w'), indent=1)
print(json.dumps(out['calibration']))
for name, o in out['byRule'].items():
    neg = '  '.join(f"{g} {o[g]['shareNegativeMarginBefore']:.0f}->{o[g]['shareNegativeMarginAfter']:.0f}" for g in GROUPS)
    print(f"{name:16s} save {o['savingShareOfNhe']:5.2f}% hh {o['holdHarmlessShareOfNhe']:4.2f}% | {neg}")
