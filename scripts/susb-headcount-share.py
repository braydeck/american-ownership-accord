"""Calibrate the headcount test's small-firm share from Census SUSB 2022 (Brayden, 2026-10-26).

Source: Census Statistics of U.S. Businesses 2022, us_state_naics_detailedsizes_2022.txt
(https://www2.census.gov/programs-surveys/susb/tables/2022/), U.S. rows, 6-digit NAICS, enterprise
employment size classes under 500 employees. Firms with 500+ employees are treated as worth over $10M.

Method: within each 6-digit industry and size class, value per firm = receipts per firm x an
EV-to-sales multiple (1.0 central; 0.5 and 1.5 as sensitivity). Classes whose average value is under
$10M are "small-value". The headcount share is the share of small-value receipts (a proxy for value)
in classes with 50+ employees; the weighted share applies the 50-to-100 phase-in at each class's
average employment. Averages within a class hide dispersion, so treat the result as approximate.
Run: python3 scripts/susb-headcount-share.py
"""
import csv

SRC = "scripts/data/susb_us_state_naics_detailedsizes_2022.txt"
SMALL_CODES = {"02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17"}

rows = [r for r in csv.DictReader(open(SRC, encoding="latin-1"))
        if r["STATE"] == "00" and len(r["NAICS"]) == 6 and r["NAICS"].isdigit() and r["ENTRSIZE"] in SMALL_CODES]

def num(x):
    try:
        return float(x)
    except ValueError:
        return 0.0

for multiple in (0.5, 1.0, 1.5):
    small_rcpt = small_rcpt_50 = small_rcpt_w = small_emp = small_emp_50 = small_emp_w = 0.0
    for r in rows:
        firms, emp, rcpt = num(r["FIRM"]), num(r["EMPL"]), num(r["RCPT"]) * 1000
        if firms <= 0 or rcpt <= 0:
            continue
        value_per_firm = rcpt / firms * multiple
        if value_per_firm >= 10e6:
            continue
        avg_emp = emp / firms
        weight = min(1.0, max(0.0, (avg_emp - 50) / 50))
        small_rcpt += rcpt; small_emp += emp
        if avg_emp >= 50:
            small_rcpt_50 += rcpt; small_emp_50 += emp
        small_rcpt_w += rcpt * weight; small_emp_w += emp * weight
    print(f"EV/sales {multiple}: value share in 50+ FTE firms {small_rcpt_50 / small_rcpt:.3f}, "
          f"phase-in weighted {small_rcpt_w / small_rcpt:.3f}; employment share {small_emp_50 / small_emp:.3f}, "
          f"weighted {small_emp_w / small_emp:.3f}")
