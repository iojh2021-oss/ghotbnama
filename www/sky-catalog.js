/* sky-catalog.js — کاتالوگ کامل ستاره‌ها (Hipparcos تا قدر ۶)، خطوط و مرز رسمی ۸۸ صورت فلکی
 * منبع: پروژهٔ d3-celestial (BSD-3) که داده‌ها را از Hipparcos و IAU گرفته است.
 * یک‌بار دانلود می‌شود و در حافظهٔ دستگاه می‌ماند؛ بعد از آن بدون اینترنت کار می‌کند.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkyCatalog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const D2R = Math.PI / 180;
  const KEY = 'sky.catalog.v1';
  const BASES = [
    'https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/',
    'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/'
  ];
  const FILES = { stars: 'stars.6.json', lines: 'constellations.lines.json', bounds: 'constellations.bounds.json', names: 'starnames.json' };

  const toRA = l => { let r = Number(l) % 360; if (r < 0) r += 360; return r; };
  const abbr = id => String(id == null ? '' : id).replace(/\d+$/, '');
  const r4 = x => Math.round(x * 10000) / 10000;

  function parseStars(gj) {
    const out = [];
    const fs = (gj && gj.features) || [];
    for (const f of fs) {
      const g = f && f.geometry;
      if (!g || g.type !== 'Point' || !g.coordinates) continue;
      const p = f.properties || {};
      const mag = parseFloat(p.mag != null ? p.mag : p.mag_v);
      if (!isFinite(mag)) continue;
      let bv = parseFloat(p.bv != null ? p.bv : p.ci);
      if (!isFinite(bv)) bv = 0.3;
      out.push([r4(toRA(g.coordinates[0])), r4(g.coordinates[1]), Math.round(mag * 100) / 100, Math.round(bv * 100) / 100, f.id != null && isFinite(+f.id) ? +f.id : 0]);
    }
    return out;
  }
  function parseLines(gj) {
    const out = {};
    for (const f of (gj && gj.features) || []) {
      const g = f && f.geometry; if (!g) continue;
      const k = abbr(f.id || (f.properties && (f.properties.desig || f.properties.id)));
      if (!k) continue;
      const parts = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
      const chains = parts.map(ch => ch.map(c => [r4(toRA(c[0])), r4(c[1])])).filter(ch => ch.length > 1);
      if (chains.length) out[k] = (out[k] || []).concat(chains);
    }
    return out;
  }
  function parseBounds(gj) {
    const out = {};
    for (const f of (gj && gj.features) || []) {
      const g = f && f.geometry; if (!g) continue;
      const k = abbr(f.id || (f.properties && (f.properties.desig || f.properties.id)));
      if (!k) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const poly of polys) {
        const ring = poly[0]; if (!ring || ring.length < 3) continue;
        (out[k] = out[k] || []).push(ring.map(c => [r4(toRA(c[0])), r4(c[1])]));
      }
    }
    return out;
  }
  function parseNames(js) {
    const out = {};
    if (!js || typeof js !== 'object') return out;
    for (const k of Object.keys(js)) {
      const v = js[k];
      const name = typeof v === 'string' ? v : (v && (v.name || v.en || v.proper));
      if (name && typeof name === 'string' && isFinite(+k)) out[+k] = name;
    }
    return out;
  }

  function build(raw) {
    const cat = { v: 1, stars: parseStars(raw.stars), lines: parseLines(raw.lines), bounds: raw.bounds ? parseBounds(raw.bounds) : {}, names: raw.names ? parseNames(raw.names) : {} };
    return cat;
  }
  function validate(cat) {
    if (!cat || !cat.stars || cat.stars.length < 1500) return { ok: false, msg: 'تعداد ستاره‌ها کمتر از انتظار است (' + (cat && cat.stars ? cat.stars.length : 0) + ')' };
    const n = Object.keys(cat.lines || {}).length;
    if (n < 60) return { ok: false, msg: 'خطوط صورت‌های فلکی ناقص است (' + n + ' مورد)' };
    return { ok: true, msg: '' };
  }

  function save(cat) {
    try { localStorage.setItem(KEY, JSON.stringify(cat)); return true; } catch (e) { return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return null;
      const cat = JSON.parse(raw);
      return validate(cat).ok ? cat : null;
    } catch (e) { return null; }
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  async function getJson(fetchFn, url, ms) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ms || 25000) : null;
    try {
      const res = await fetchFn(url, ctl ? { signal: ctl.signal, cache: 'no-cache' } : {});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { if (t) clearTimeout(t); }
  }

  // دانلود: هر فایل را از چند آدرس امتحان می‌کند. ستاره‌ها و خطوط ضروری‌اند؛ مرزها و نام‌ها اختیاری.
  async function download(opts) {
    opts = opts || {};
    const fetchFn = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(self) : null);
    if (!fetchFn) throw new Error('این مرورگر دانلود را پشتیبانی نمی‌کند');
    const raw = {}; const errors = [];
    const order = ['stars', 'lines', 'bounds', 'names'];
    let done = 0;
    for (const key of order) {
      let ok = false;
      for (const base of (opts.bases || BASES)) {
        try { raw[key] = await getJson(fetchFn, base + FILES[key], opts.timeout); ok = true; break; }
        catch (e) { errors.push(key + ': ' + (e && e.message ? e.message : e)); }
      }
      if (!ok && (key === 'stars' || key === 'lines')) throw new Error('دانلود ' + FILES[key] + ' ممکن نشد. اینترنت را بررسی کن. (' + errors.slice(-2).join('، ') + ')');
      done++; if (opts.onProgress) opts.onProgress(done, order.length, key);
    }
    const cat = build(raw), v = validate(cat);
    if (!v.ok) throw new Error('داده‌های دانلودشده معتبر نیست: ' + v.msg);
    cat.saved = save(cat);
    cat.at = Date.now();
    return cat;
  }

  /* ---------- تشخیص صورت فلکی از روی مرزهای رسمی ---------- */
  const V = (ra, dec) => { const a = ra * D2R, d = dec * D2R, c = Math.cos(d); return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)]; };
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // نقاط بین دو رأس مرز را در راستای ra/dec (مرزها همیشه روی خطوط ra یا dec‌اند) ریز می‌کنیم
  function densify(ring) {
    const pts = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      let dr = b[0] - a[0]; if (dr > 180) dr -= 360; else if (dr < -180) dr += 360;
      const dd = b[1] - a[1];
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dr) * Math.cos(((a[1] + b[1]) / 2) * D2R), Math.abs(dd)) / 1));
      for (let k = 0; k < n; k++) pts.push(V(a[0] + dr * k / n, a[1] + dd * k / n));
    }
    return pts;
  }
  function makeLocator(bounds) {
    const polys = [];
    for (const k of Object.keys(bounds || {})) for (const ring of bounds[k]) {
      const pts = densify(ring); if (pts.length < 3) continue;
      const c = [0, 0, 0]; pts.forEach(p => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
      const l = Math.hypot(c[0], c[1], c[2]) || 1; c[0] /= l; c[1] /= l; c[2] /= l;
      let cosMin = 1; pts.forEach(p => { cosMin = Math.min(cosMin, dotp(p, c)); });
      polys.push({ k, pts, c, cosMin: cosMin - 1e-6 });
    }
    return {
      count: polys.length,
      at(raDeg, decDeg) { return this.atVec(V(raDeg, decDeg)); },
      atVec(p) {
        // پایهٔ مماس در نقطهٔ p
        const ref = Math.abs(p[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        let e1 = [ref[1] * p[2] - ref[2] * p[1], ref[2] * p[0] - ref[0] * p[2], ref[0] * p[1] - ref[1] * p[0]];
        const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
        const e2 = [p[1] * e1[2] - p[2] * e1[1], p[2] * e1[0] - p[0] * e1[2], p[0] * e1[1] - p[1] * e1[0]];
        for (const poly of polys) {
          if (dotp(p, poly.c) < poly.cosMin) continue;
          // عدد پیچش حول نقطه روی تصویر برجستهٔ استریوگرافیک
          let w = 0, prev = null;
          const n = poly.pts.length;
          for (let i = 0; i <= n; i++) {
            const q = poly.pts[i % n], d = dotp(q, p);
            if (d < -0.9999) { prev = null; continue; }
            const s = 2 / (1 + d), x = dotp(q, e1) * s, y = dotp(q, e2) * s;
            if (prev) { let da = Math.atan2(y, x) - Math.atan2(prev[1], prev[0]); if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI; w += da; }
            prev = [x, y];
          }
          if (Math.abs(w) > Math.PI) return poly.k;
        }
        return null;
      }
    };
  }

  return { KEY, BASES, FILES, parseStars, parseLines, parseBounds, parseNames, build, validate, save, load, clear, download, makeLocator };
});
