// Validates the CBO current-law shares in src/lib/cbo-baseline.js by rebuilding CBO's own
// debt path from them: CBO revenue and noninterest shares, CBO GDP growth and inflation, CBO's
// average interest rate, starting from CBO's end-FY2025 debt held by the public. If the shares
// are transcribed and interpolated correctly, the rebuilt path lands on CBO's published
// debt/GDP. Run: node scripts/validate-cl-path.mjs
import {
  cboFiscalShares, cboEcon, CBO_FIRST_FY, CBO_DEBT_PUBLIC,
  CBO_GDP_FY2026, CBO_DEBT_PUBLIC_END_FY2025,
} from '../src/lib/cbo-baseline.js';

let gdp = CBO_GDP_FY2026;
let debt = CBO_DEBT_PUBLIC_END_FY2025;
let worst = 0;
console.log('FY    rebuilt  CBO      gap (pts)');
for (let yr = 1; yr <= 31; yr++) {
  const fy = CBO_FIRST_FY + yr - 1;
  if (yr > 1) {
    const e = cboEcon(fy);
    gdp *= (1 + e.realGrowth) * (1 + e.inflation);
  }
  const { revenue, noninterest } = cboFiscalShares(yr);
  const interest = debt * cboEcon(fy).rate;
  debt += (noninterest - revenue) * gdp + interest;
  const target = CBO_DEBT_PUBLIC[fy];
  if (target != null) {
    const pct = 100 * debt / gdp;
    worst = Math.max(worst, Math.abs(pct - target));
    console.log(`${fy}  ${pct.toFixed(1).padStart(6)}%  ${target.toFixed(1).padStart(6)}%  ${(pct - target).toFixed(1).padStart(5)}`);
  }
}
console.log(`Largest gap: ${worst.toFixed(1)} pts of GDP`);
