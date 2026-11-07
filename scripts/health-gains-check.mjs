// GDP gains from untying coverage, and one optimizer-style score timing check.
// Run: node scripts/health-gains-check.mjs
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const H = await server.ssrLoadModule('/src/lib/health.js');
const F = await server.ssrLoadModule('/src/lib/fiscal-engine.js');
for (const c of ['zero', 'central', 'high']) {
  const p = { ...F.BASE_PARAMS, healthMobilityGain: c, healthStartupGain: c };
  console.log(c, [2, 5, 10, 20, 35].map(y => [y, +(H.untyingGdpGain(y, p) * 100).toFixed(3)]));
}
await server.close();
