// Seeded LCG PRNG + Box-Muller transform for Monte Carlo simulations

export function makeRng(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    },
    normal(mu = 0, sig = 1) {
      const u1 = Math.max(1e-10, this.next()), u2 = this.next();
      return mu + sig * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}
