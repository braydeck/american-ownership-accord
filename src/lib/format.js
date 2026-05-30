// Unified formatting helpers used across simulations

export const fmtK = (v) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${Math.round(abs / 1000)}K`;
};

export const fmtKShort = (v) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${Math.round(abs / 1000)}K`;
};

export const fmtDollar = (v) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
};

export const fmtPct = (v, decimals = 1) => `${(v * 100).toFixed(decimals)}%`;

export const fmtB = (v) => `$${(v / 1e9).toFixed(0)}B`;

export const fmtT = (v) => `$${(v / 1e12).toFixed(2)}T`;

export const axisT = (v) => `$${v}T`;

export const fmtYr = (v) => (v == null ? 'Never' : `Year ${v}`);

export const fmt = (n, d = 1) =>
  Math.abs(n) >= 1e12 ? `$${(n / 1e12).toFixed(d)}T`
  : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(d)}B`
  : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(d)}M`
  : `$${Math.round(n).toLocaleString()}`;
