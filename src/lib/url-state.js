// Hash-based URL state for the SPA. The hash encodes the active page and its tab/filter
// state as `#<page>?<query>` (e.g. `#renttax?tab=curves&lvtRate=0.11`). Works on static
// hosting (Cloudflare Pages) with no redirect config, survives refresh/sharing, and supports
// browser back/forward for page navigation.
//
// Only values that DIFFER from their defaults are written, so a pristine view stays clean
// (`#renttax`) and the URL reflects exactly what the user changed.
import { useState, useEffect, useCallback, useRef } from 'react';

function parseHash() {
  const h = window.location.hash.replace(/^#/, '');
  const qi = h.indexOf('?');
  const page = qi === -1 ? h : h.slice(0, qi);
  const params = new URLSearchParams(qi === -1 ? '' : h.slice(qi + 1));
  return { page, params };
}

function writeHash(page, params, push) {
  const q = params.toString();
  const url = `${window.location.pathname}${window.location.search}#${page}${q ? '?' + q : ''}`;
  // pushState for page navigation (so back/forward works); replaceState for filter tweaks
  // (no history spam, and neither fires hashchange so in-page writes don't disturb routing).
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

function deserialize(str, def) {
  if (def instanceof Set) return new Set(str ? str.split(',') : []);
  if (Array.isArray(def)) return str ? str.split(',') : [];
  if (typeof def === 'number') { const n = Number(str); return Number.isFinite(n) ? n : def; }
  if (typeof def === 'boolean') return str === '1' || str === 'true';
  return str;
}

function serialize(val, def) {
  if (def instanceof Set) return [...val].sort().join(',');
  if (Array.isArray(def)) return val.join(',');
  if (typeof def === 'boolean') return val ? '1' : '0';
  return String(val);
}

function eq(a, b) {
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every(x => b.has(x));
  return a === b;
}

// ─── PAGE ROUTING (App) ──────────────────────────────────────────────────────
// Returns [page, setPage]. Reads the page segment from the hash, follows back/forward,
// and navigating clears the previous page's query.
export function useHashPage(defaultPage) {
  const [page, setPageState] = useState(() => parseHash().page || defaultPage);
  useEffect(() => {
    const sync = () => setPageState(parseHash().page || defaultPage);
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [defaultPage]);
  const setPage = useCallback((p) => {
    writeHash(p, new URLSearchParams(), true);
    setPageState(p);
  }, []);
  return [page, setPage];
}

// ─── SINGLE VALUE (tab, a scalar filter, a toggle Set, a preset) ─────────────
// `defaultValue` MUST be a stable reference (define Sets/arrays as module constants).
export function useUrlValue(key, defaultValue) {
  const [value, setValue] = useState(() => {
    const { params } = parseHash();
    return params.has(key) ? deserialize(params.get(key), defaultValue) : defaultValue;
  });
  const set = useCallback((next) => {
    setValue(prev => {
      const v = typeof next === 'function' ? next(prev) : next;
      const { page, params } = parseHash();
      if (eq(v, defaultValue)) params.delete(key);
      else params.set(key, serialize(v, defaultValue));
      writeHash(page, params, false);
      return v;
    });
  }, [key, defaultValue]);
  return [value, set];
}

// ─── OBJECT OF PRIMITIVES (a page's params/filters bag) ──────────────────────
// `defaults` must be a stable reference. Returns [state, update] where update accepts a
// partial patch object or an updater fn. Only keys present in `defaults` are managed in the
// URL; any other query keys (e.g. a separate tab from useUrlValue) are preserved untouched.
export function useUrlState(defaults) {
  const [state, setState] = useState(() => {
    const { params } = parseHash();
    const init = { ...defaults };
    for (const k of Object.keys(defaults)) {
      if (params.has(k)) init[k] = deserialize(params.get(k), defaults[k]);
    }
    return init;
  });
  const defRef = useRef(defaults);
  const update = useCallback((patch) => {
    setState(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      const { page, params } = parseHash();
      for (const k of Object.keys(defRef.current)) {
        if (eq(next[k], defRef.current[k])) params.delete(k);
        else params.set(k, serialize(next[k], defRef.current[k]));
      }
      writeHash(page, params, false);
      return next;
    });
  }, []);
  return [state, update];
}
