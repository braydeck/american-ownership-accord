import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const M = await server.ssrLoadModule('/src/lib/health.js');
const I = await server.ssrLoadModule('/src/lib/income-tax.js');
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
console.log(Object.fromEntries(Object.entries(M.HEALTH_GDP_2024).map(([k,v])=>[k,(v*100).toFixed(2)])));
console.log('ESI scale', M.ESI_CALIBRATION.toFixed(3));
const B=(await server.ssrLoadModule('/src/lib/brackets.js')).BRACKETS;
B.forEach((b,i)=>console.log(b.label, Math.round(M.employerContributionPerFiler(i)), Math.round(M.workerPremiumPerFiler(i)), Math.round(M.oopPerFiler(i)), Math.round(M.nongroupPremiumPerFiler(i))));
const p=F.BASE_PARAMS;
const sched=I.accordSchedule({lowRate:p.incomeTaxLow,highRate:p.incomeTaxHigh,threshold:p.incomeTaxThreshold,riseEnd:p.incomeTaxRiseEnd,riseShape:p.incomeTaxRiseShape});
console.log(M.convertedWageTaxRates(sched,0,0,true));
const P={...M.HEALTH_DEFAULTS};
for (const y of [1,2,5,10,20,35]) { const r=M.healthFiscalYear({yr:y,p:P,trendNomGdp:1,immigrantsUnder65:0}); console.log(y, Object.fromEntries(Object.entries(r).map(([k,v])=>[k,+(v*100).toFixed(2)]))); }
await server.close();
