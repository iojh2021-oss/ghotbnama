/* sky.js — آسمان‌نمای قطب‌نما (نسخهٔ ۲)
 * ستاره‌ها و صورت‌های فلکی واقعی، خورشید، ماه، سیارات، راه شیری، قبله،
 * نوار جهت، نشانگر مرکز، مینی‌مپ قطبی و نقشهٔ کامل آسمان، راهنمای رسیدن به هدف.
 */
(function () {
  'use strict';
  const C = window.SkyCore, DATA = window.SKY_DATA, CAT = window.SkyCatalog, CH = window.SkyChart;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const angDiff = (a, b) => ((a - b + 540) % 360) - 180; // اختلاف علامت‌دار سمت (درجه)

  /* ---------- فارسی‌سازی ---------- */
  const FD = '۰۱۲۳۴۵۶۷۸۹';
  const fa = s => String(s).replace(/\d/g, d => FD[d]).replace(/\./g, '٫').replace(/-/g, '−');
  const faInt = n => fa(Math.round(n).toLocaleString('en').replace(/,/g, '٬'));
  const DIRS = ['شمال', 'شمال‌شرق', 'شرق', 'جنوب‌شرق', 'جنوب', 'جنوب‌غرب', 'غرب', 'شمال‌غرب'];
  const dir8 = az => DIRS[Math.round(C.rev(az) / 45) % 8];
  const normText = s => String(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u064b-\u065f]/g, '').replace(/[ةۀ]/g, 'ه').replace(/ؤ/g, 'و').replace(/[أإآ]/g, 'ا').trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let fmtDate, fmtTime;
  try { fmtDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { fmtDate = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }); }
  try { fmtTime = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { fmtTime = { format: d => d.toTimeString().slice(0, 5) }; }

  /* ---------- تنظیمات (موقعیت و انحراف مغناطیسی مشترک با قطب‌نما) ---------- */
  const DEFAULTS = { lines: true, names: true, starNames: true, grid: false, eqEcl: true, dso: true, milky: true, qibla: true, dayLight: true, red: false, chartNames: true, hemi: '' };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* حافظه غیرفعال */ } }
  };
  const S = Object.assign({}, DEFAULTS, store.get('sky.settings') || {});
  const numOf = v => { const n = Number(v); return v !== null && v !== '' && isFinite(n) ? n : null; };
  const sp = store.get('pos');
  S.posKnown = !!(sp && numOf(sp.lat) !== null && numOf(sp.lon) !== null && Math.abs(sp.lat) <= 90 && Math.abs(sp.lon) <= 180);
  S.lat = S.posKnown ? Number(sp.lat) : 35.6892;
  S.lon = S.posKnown ? Number(sp.lon) : 51.3890;
  const sd = numOf(store.get('decl'));
  S.decl = sd === null ? 0 : clamp(sd, -40, 40);
  if (S.hemi !== 'N' && S.hemi !== 'S') S.hemi = S.lat >= 0 ? 'N' : 'S';
  const save = () => { const o = {}; Object.keys(DEFAULTS).forEach(k => { o[k] = S[k]; }); store.set('sky.settings', o); };
  const savePos = () => { S.posKnown = true; store.set('pos', { lat: S.lat, lon: S.lon }); };
  const saveDecl = () => store.set('decl', S.decl);

  /* ---------- مدل آسمان: ستاره‌ها، خطوط، مرزها ---------- */
  const parseRA = s => { const p = s.trim().split(/\s+/).map(Number); return (p[0] + p[1] / 60) * 15; };
  const parseDec = s => { const t = s.trim(), sg = t[0] === '-' ? -1 : 1; const p = t.replace(/^[+-]/, '').split(/\s+/).map(Number); return sg * (p[0] + p[1] / 60); };
  const ZOD = new Set(['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc']);
  const conMeta = k => DATA.conAll[k] || DATA.constellations[k] && [DATA.constellations[k].en, DATA.constellations[k].fa] || [k, k];
  const short = n => String(n || '').replace(/\s*\(.*\)/, '');
  const isBayer = n => /^\d|^[α-ωΑ-Ω]/.test(n || '');

  const mkStar = (ra, dec, mag, ci, name, faName, con, hip) => ({ type: 'star', ra0: ra, dec0: dec, mag, ci, name: name || '', fa: faName || '', con: con || '', hip: hip || 0, v0: C.eqVec(ra, dec), v: [0, 0, 1] });
  const mkPt = (ra, dec) => ({ ra0: ra, dec0: dec, v0: C.eqVec(ra, dec), v: [0, 0, 1] });

  let stars = [], extraPts = [], conList = [], chainsEq = [], conLabelsEq = [], locator = null, catalog = null, namedStars = [];
  const byName = new Map();
  const dsos = DATA.dso.map(a => ({ type: 'dso', name: a[0], fa: a[1], ra0: parseRA(a[2]), dec0: parseDec(a[3]), mag: a[4], kind: a[5], size: a[6], v0: C.eqVec(parseRA(a[2]), parseDec(a[3])), v: [0, 0, 1] }));

  function buildModel(cat) {
    catalog = cat || null;
    const builtin = DATA.stars.map(a => mkStar(parseRA(a[1]), parseDec(a[2]), a[3], a[6] == null ? 0.2 : a[6], a[0], a[5], a[4]));
    extraPts = [];
    let bn = null;
    if (cat) {
      const list = cat.stars.map(r => mkStar(r[0], r[1], r[2], r[3], (cat.names && cat.names[r[4]]) || '', '', '', r[4]));
      const grid = new Map(), key = (ra, dec) => Math.floor(ra) + ',' + Math.floor(dec);
      list.forEach(s => { const k = key(s.ra0, s.dec0); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(s); });
      const extra = [];
      for (const b of builtin) {
        let best = null, bd = 1e9;
        for (let da = -1; da <= 1; da++) for (let dd = -1; dd <= 1; dd++) {
          const arr = grid.get(key((b.ra0 + da + 360) % 360, b.dec0 + dd)); if (!arr) continue;
          for (const s of arr) { const d = Math.acos(Math.min(1, dot(s.v0, b.v0))) * R2D, dm = Math.abs(s.mag - b.mag); if (d < 0.3 && dm < 0.9 && d + dm * 0.05 < bd) { bd = d + dm * 0.05; best = s; } }
        }
        if (best) { if (!isBayer(b.name) || !best.name) best.name = b.name; best.fa = b.fa; best.con = b.con; }
        else extra.push(b);
      }
      stars = list.concat(extra);
    } else { stars = builtin; }
    byName.clear(); stars.forEach(s => { if (s.name && !byName.has(s.name)) byName.set(s.name, s); });
    namedStars = stars.filter(s => s.name || s.fa);
    conList = [];
    if (cat) {
      for (const k of Object.keys(cat.lines)) {
        const m = conMeta(k);
        const chains = cat.lines[k].map(ch => ch.map(p => { const o = mkPt(p[0], p[1]); extraPts.push(o); return o; }));
        conList.push({ key: k, type: 'con', name: m[0], fa: m[1], zodiac: ZOD.has(k), chains, v0: [0, 0, 1], v: [0, 0, 1] });
      }
    } else {
      for (const k of Object.keys(DATA.constellations)) {
        const c = DATA.constellations[k];
        conList.push({ key: k, type: 'con', name: c.en, fa: c.fa, zodiac: !!c.zodiac, chains: c.lines.map(ch => ch.map(n => byName.get(n)).filter(Boolean)), v0: [0, 0, 1], v: [0, 0, 1] });
      }
    }
    chainsEq = []; conLabelsEq = [];
    for (const c of conList) {
      const a = [0, 0, 0]; let n = 0;
      for (const ch of c.chains) { chainsEq.push(ch.map(p => [p.ra0, p.dec0])); for (const p of ch) { a[0] += p.v0[0]; a[1] += p.v0[1]; a[2] += p.v0[2]; n++; } }
      c.v0 = norm(a); const e = C.vecEq(c.v0); conLabelsEq.push({ ra: e[0], dec: e[1], fa: short(c.fa), major: !!DATA.constellations[c.key] });
    }
    locator = (cat && cat.bounds && CAT && Object.keys(cat.bounds).length > 20) ? CAT.makeLocator(cat.bounds) : null;
    searchCache = null;
  }

  const SOLAR = {
    sun: { type: 'sun', name: 'Sun', fa: 'خورشید', v: [0, 0, 1], mag: -26.7 },
    moon: { type: 'moon', name: 'Moon', fa: 'ماه', v: [0, 0, 1], mag: -10 },
    mercury: { type: 'planet', id: 'mercury', name: 'Mercury', fa: 'عطارد', v: [0, 0, 1], mag: 0, color: '#c9c2b8' },
    venus: { type: 'planet', id: 'venus', name: 'Venus', fa: 'زهره (ناهید)', v: [0, 0, 1], mag: -4, color: '#fff6dc' },
    mars: { type: 'planet', id: 'mars', name: 'Mars', fa: 'مریخ (بهرام)', v: [0, 0, 1], mag: 1, color: '#ff8a5c' },
    jupiter: { type: 'planet', id: 'jupiter', name: 'Jupiter', fa: 'مشتری (برجیس)', v: [0, 0, 1], mag: -2, color: '#f4e3c3' },
    saturn: { type: 'planet', id: 'saturn', name: 'Saturn', fa: 'زحل (کیوان)', v: [0, 0, 1], mag: 0.5, color: '#e8d49a' }
  };
  const planets = [SOLAR.mercury, SOLAR.venus, SOLAR.mars, SOLAR.jupiter, SOLAR.saturn];
  const QIB = { type: 'qibla', name: 'Qibla', fa: 'قبله', v: [0, 1, 0] };
  const DSO_KIND = { open: 'خوشهٔ باز', galaxy: 'کهکشان', nebula: 'سحابی', globular: 'خوشهٔ کروی', center: 'مرکز کهکشان' };

  const MW = [];
  for (let l = 0; l < 360; l += 3) { const e = C.galToEq(l, 0), dl = Math.min(l, 360 - l); MW.push({ l, w: 0.3 + 0.7 * Math.exp(-Math.pow(dl / 65, 2)), v0: C.eqVec(e[0], e[1]), v: [0, 0, 1] }); }
  const ECL_J2000 = []; for (let i = 0; i <= 120; i++) ECL_J2000.push(C.eclToEq(i * 3, 0, 23.4392911));

  /* ---------- حالت برنامه ---------- */
  const view = { az: 180, alt: 38, fov: 85 };
  let mode = 'manual';
  const T = { ms: Date.now(), live: true, play: false };
  const W = { ms: 0, sunAlt: -30, M: null, P: null, horizonEq: [], bodiesEq: [], zenithEq: [0, 90] };
  let selected = null, target = null, hits = [], dirty = true, cam = null, searchCache = null;
  const sens = { f: null, u: null, abs: false, rel: false, iosOff: null, active: false, native: false, got: false };

  /* ---------- بوم‌ها ---------- */
  const canvas = $('sky'), ctx = canvas.getContext('2d');
  const mini = $('mini'), mctx = mini && mini.getContext ? mini.getContext('2d') : null;
  const chartCv = $('chartCv'), cctx = chartCv && chartCv.getContext ? chartCv.getContext('2d') : null;
  let CW = 0, CH_ = 0, DPR = 1, rib = { y: 66, h: 40 }, MINI = 108;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    CW = window.innerWidth; CH_ = window.innerHeight;
    canvas.width = Math.round(CW * DPR); canvas.height = Math.round(CH_ * DPR);
    if (mini) { mini.width = Math.round(MINI * DPR); mini.height = Math.round(MINI * DPR); }
    try { const r = $('ribbonSpace').getBoundingClientRect(); if (r && r.height > 10) rib = { y: r.top, h: r.height }; } catch (e) { /* مقدار پیش‌فرض */ }
    if (chartOpen) sizeChart();
    dirty = true;
  }

  /* ---------- محاسبهٔ دنیا ---------- */
  function setV(M, o) {
    const a = o.v0, v = o.v;
    v[0] = M[0][0] * a[0] + M[0][1] * a[1] + M[0][2] * a[2];
    v[1] = M[1][0] * a[0] + M[1][1] * a[1] + M[1][2] * a[2];
    v[2] = M[2][0] * a[0] + M[2][1] * a[1] + M[2][2] * a[2];
  }
  function recompute() {
    const jd = C.jdFromMs(T.ms), d = C.dayNum(jd), lst = C.rev(C.gmst(jd) + S.lon);
    W.ms = T.ms; W.jd = jd; W.lst = lst;
    const P = C.precessMatrix(jd), E = C.eqToEnuMatrix(lst, S.lat), M = C.mat.mul(E, P);
    W.P = P; W.E = E; W.M = M; W.MT = C.mat.tr(M);
    for (const s of stars) setV(M, s);
    for (const p of extraPts) setV(M, p);
    for (const o of dsos) setV(M, o);
    for (const m of MW) setV(M, m);
    for (const c of conList) setV(M, c);
    const sn = C.sun(d), mn = C.moon(d, sn);
    W.sun = sn; W.moon = mn;
    const eqV = (ra, dec) => C.mat.vec(E, C.eqVec(ra, dec));
    Object.assign(SOLAR.sun, { ra: sn.ra, dec: sn.dec, dist: sn.dist }); SOLAR.sun.v = eqV(sn.ra, sn.dec);
    Object.assign(SOLAR.moon, { ra: mn.ra, dec: mn.dec, dist: mn.dist, frac: mn.frac, elong: mn.elong });
    const aa = C.enuToAltAz(eqV(mn.ra, mn.dec)); // اختلاف منظر ماه
    SOLAR.moon.v = C.altAzToEnu(aa.alt - mn.parallax * Math.cos(aa.alt * D2R), aa.az);
    for (const p of planets) { const q = C.planet(p.id, d, sn); Object.assign(p, { ra: q.ra, dec: q.dec, dist: q.dist, mag: q.mag, phase: q.phase }); p.v = eqV(q.ra, q.dec); }
    W.sunAlt = Math.asin(SOLAR.sun.v[2]) * R2D;
    W.qibla = C.qibla(S.lat, S.lon); QIB.v = C.altAzToEnu(0, W.qibla.az);
    // دادهٔ نقشهٔ قطبی (J2000)
    const MT = W.MT, toEq = v => C.vecEq(C.mat.vec(MT, v));
    W.horizonEq = []; for (let i = 0; i < 90; i++) W.horizonEq.push(toEq(C.altAzToEnu(0, i * 4)));
    W.zenithEq = toEq([0, 0, 1]);
    W.bodiesEq = [SOLAR.sun, SOLAR.moon].concat(planets).map(b => { const e = C.vecEq(C.mat.vec(C.mat.tr(P), C.eqVec(b.ra, b.dec))); return { ra: e[0], dec: e[1], type: b.type, fa: b.fa.split(' ')[0] }; });
    dirty = true;
  }

  /* ---------- دوربین و تصویر برجستهٔ استریوگرافیک ---------- */
  function buildCam() {
    let f, u;
    if (mode === 'sensor' && sens.f) { f = sens.f; u = sens.u; }
    else {
      const az = view.az * D2R, al = view.alt * D2R;
      f = [Math.cos(al) * Math.sin(az), Math.cos(al) * Math.cos(az), Math.sin(al)];
      u = [-Math.sin(al) * Math.sin(az), -Math.sin(al) * Math.cos(az), Math.cos(al)];
    }
    const r = cross(f, u), span = Math.min(CW, CH_);
    cam = { f, u, r, scale: (span / 2) / (2 * Math.tan(view.fov * D2R / 4)), cx: CW / 2, cy: CH_ / 2 };
  }
  function proj(v) {
    const z = dot(v, cam.f);
    if (z < -0.35) return null;
    const k = cam.scale * 2 / (1 + z);
    return [cam.cx + dot(v, cam.r) * k, cam.cy - dot(v, cam.u) * k, z, k];
  }
  function unprojectScreen(x, y) {
    const X = (x - cam.cx) / cam.scale, Y = (cam.cy - y) / cam.scale, rho2 = X * X + Y * Y;
    const z = (4 - rho2) / (4 + rho2), k = (1 + z) / 2, xx = X * k, yy = Y * k;
    return [cam.r[0] * xx + cam.u[0] * yy + cam.f[0] * z, cam.r[1] * xx + cam.u[1] * yy + cam.f[1] * z, cam.r[2] * xx + cam.u[2] * yy + cam.f[2] * z];
  }
  const camAltAz = () => C.enuToAltAz(cam.f);

  /* ---------- رنگ‌ها ---------- */
  const PAL = {
    n: { line: '226,190,108', conName: '240,214,150', star: 'rgba(222,232,250,', grid: 'rgba(150,180,215,0.14)', eq: 'rgba(110,205,190,0.38)', ecl: 'rgba(255,170,110,0.5)', hor: 'rgba(230,185,74,0.9)', card: '#EDF0E4', qibla: '#FF5B3A', dso: 'rgba(180,215,255,', gold: '#E6B94A', sunC: '#ffe9a8' },
    r: { line: '255,100,80', conName: '255,130,110', star: 'rgba(255,120,100,', grid: 'rgba(255,90,70,0.14)', eq: 'rgba(255,90,70,0.34)', ecl: 'rgba(255,140,100,0.5)', hor: 'rgba(255,122,98,0.9)', card: '#ff9a88', qibla: '#ff9a88', dso: 'rgba(255,130,110,', gold: '#ff7a62', sunC: '#ff9a88' }
  };
  const pal = () => S.red ? PAL.r : PAL.n;
  const STAR_RGB = [[170, 197, 255], [238, 243, 255], [255, 241, 205], [255, 208, 160], [255, 176, 132]];
  const colorClass = ci => ci < 0 ? 0 : ci < 0.4 ? 1 : ci < 0.8 ? 2 : ci < 1.3 ? 3 : 4;
  function skyColors() {
    const a = W.sunAlt;
    if (!S.dayLight || a < -14) return ['#030a10', '#0A1B27'];
    const t = clamp((a + 14) / 16, 0, 1), tt = t * t * (3 - 2 * t);
    const night = [3, 10, 16], dayc = [58, 112, 190], tw = [26, 44, 80];
    const mix = (x, y, k) => x.map((c, i) => Math.round(lerp(c, y[i], k)));
    const mid = tt < 0.5 ? mix(night, tw, tt * 2) : mix(tw, dayc, (tt - 0.5) * 2);
    return ['rgb(' + mix(night, mid, 0.55).join(',') + ')', 'rgb(' + mid.join(',') + ')'];
  }
  const nightness = () => S.dayLight ? clamp((-W.sunAlt - 2) / 16, 0, 1) : 1;

  /* ---------- رسم ---------- */
  function label(text, x, y, color, size, align, weight) {
    ctx.font = (weight || 400) + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,8,16,0.78)'; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function polyline(pts, style, width, dash) {
    ctx.beginPath();
    let pen = false, last = null;
    for (const v of pts) {
      const p = proj(v);
      if (!p || (last && Math.hypot(p[0] - last[0], p[1] - last[1]) > CW * 0.9)) { pen = false; last = p; continue; }
      if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      pen = true; last = p;
    }
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  }
  const circlePts = (fn, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(fn(i / n)); return out; };

  function drawMilky(nn) {
    if (!S.milky) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const m of MW) {
      const p = proj(m.v); if (!p) continue;
      const R = (8 + 7 * m.w) * D2R * p[3];
      if (R < 4 || p[0] < -R || p[0] > CW + R || p[1] < -R || p[1] > CH_ + R) continue;
      const core = Math.min(m.l, 360 - m.l) < 28, a = (0.045 + 0.06 * m.w) * nn;
      const rgb = S.red ? '255,70,50' : (core ? '210,185,150' : '150,172,225');
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R);
      g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.fillRect(p[0] - R, p[1] - R, R * 2, R * 2);
    }
    ctx.restore();
  }
  function drawGrid() {
    if (S.grid) {
      for (let alt = 15; alt < 90; alt += 15) polyline(circlePts(t => C.altAzToEnu(alt, t * 360), 120), pal().grid, 1);
      for (let az = 0; az < 360; az += 30) polyline(circlePts(t => C.altAzToEnu(-5 + t * 95, az), 24), pal().grid, 1);
    }
    if (S.eqEcl) {
      polyline(circlePts(t => C.mat.vec(W.E, C.mat.vec(W.P, C.eqVec(t * 360, 0))), 120), pal().eq, 1, [5, 5]);
      polyline(circlePts(t => { const e = C.eclToEq(t * 360, 0, 23.4392911); return C.mat.vec(W.M, C.eqVec(e[0], e[1])); }, 120), pal().ecl, 1.2);
      const p = proj(C.mat.vec(W.M, [0, 0, 1]));
      if (p) { ctx.fillStyle = pal().eq; ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, 7); ctx.fill(); label(S.lat >= 0 ? 'قطب شمال سماوی' : 'قطب جنوب سماوی', p[0], p[1] - 10, pal().eq, 11); }
    }
  }
  function drawLines(nn) {
    if (!S.lines) return;
    ctx.lineWidth = 1.15; ctx.strokeStyle = 'rgba(' + pal().line + ',' + clamp(0.12 + 0.34 * nn, 0, 0.46) + ')';
    ctx.beginPath();
    for (const c of conList) for (const ch of c.chains) {
      let pen = false;
      for (const s of ch) {
        const p = proj(s.v);
        if (!p) { pen = false; continue; }
        if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        pen = true;
      }
    }
    ctx.stroke();
  }
  function drawDSO(nn) {
    if (!S.dso) return;
    for (const o of dsos) {
      if (o.kind === 'center') continue;
      const p = proj(o.v); if (!p) continue;
      const R = Math.max(5, o.size * D2R * p[3] * 0.5), a = (0.55 * nn + 0.1) * (o.v[2] < 0 ? 0.4 : 1);
      ctx.strokeStyle = pal().dso + a + ')'; ctx.fillStyle = pal().dso + (a * 0.18) + ')'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (o.kind === 'galaxy') ctx.ellipse(p[0], p[1], R * 1.6, R * 0.7, -0.6, 0, 7); else ctx.arc(p[0], p[1], R, 0, 7);
      ctx.fill();
      if (o.kind === 'open') ctx.setLineDash([2, 3]);
      ctx.stroke(); ctx.setLineDash([]);
      if (o.kind === 'globular') { ctx.beginPath(); ctx.moveTo(p[0] - R, p[1]); ctx.lineTo(p[0] + R, p[1]); ctx.moveTo(p[0], p[1] - R); ctx.lineTo(p[0], p[1] + R); ctx.stroke(); }
      hits.push({ o, x: p[0], y: p[1], r: Math.max(R, 14), pri: 1 });
      if (view.fov < 95) label(o.fa, p[0], p[1] + R + 11, pal().dso + (a + 0.2) + ')', 11);
    }
  }
  const ALPHAS = [0.35, 0.6, 0.85, 1];
  function drawStars(nn) {
    const lim = S.dayLight ? lerp(-1.5, 6.6, Math.pow(nn, 0.7)) : 6.6;
    const zoom = clamp(Math.sqrt(85 / view.fov), 0.85, 1.9);
    const lblMag = clamp(2.2 + (60 - view.fov) / 24, 1.2, 4.7);
    const buckets = []; for (let i = 0; i < 20; i++) buckets.push([]);
    const glows = [];
    for (const s of stars) {
      if (s.mag > lim) continue;
      const p = proj(s.v); if (!p) continue;
      if (p[0] < -20 || p[0] > CW + 20 || p[1] < -20 || p[1] > CH_ + 20) continue;
      let a = clamp((lim - s.mag) / 1.2, 0, 1); if (a <= 0.01) continue;
      if (s.v[2] < 0) a *= 0.3;
      const r = clamp(0.5 + (5.6 - s.mag) * 0.5, 0.55, 5.2) * zoom;
      const ac = a > 0.9 ? 3 : a > 0.7 ? 2 : a > 0.45 ? 1 : 0;
      const b = buckets[(S.red ? 1 : colorClass(s.ci)) * 4 + ac]; b.push(p[0], p[1], r);
      if (s.mag < 2.2) glows.push([p[0], p[1], r, s.ci, a]);
      if (s.mag < 3.3 || s.fa) hits.push({ o: s, x: p[0], y: p[1], r: Math.max(r + 8, 16), pri: 0 });
      if (S.starNames && (s.fa || s.name) && s.mag < lblMag && a > 0.4 && !isBayer(s.name)) label(s.fa || s.name, p[0] + r + 4, p[1] - r - 3, pal().star + (0.78 * a) + ')', 11, 'start');
    }
    for (const g of glows) {
      const rgb = S.red ? [255, 112, 92] : STAR_RGB[colorClass(g[3])];
      const gr = ctx.createRadialGradient(g[0], g[1], 0, g[0], g[1], g[2] * 4.2);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + 0.4 * g[4] + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = gr; ctx.fillRect(g[0] - g[2] * 4.2, g[1] - g[2] * 4.2, g[2] * 8.4, g[2] * 8.4);
    }
    for (let i = 0; i < 20; i++) {
      const b = buckets[i]; if (!b.length) continue;
      const rgb = S.red ? [255, 112, 92] : STAR_RGB[i >> 2];
      ctx.fillStyle = 'rgba(' + rgb + ',' + ALPHAS[i & 3] + ')'; ctx.beginPath();
      for (let k = 0; k < b.length; k += 3) { ctx.moveTo(b[k] + b[k + 2], b[k + 1]); ctx.arc(b[k], b[k + 1], b[k + 2], 0, 7); }
      ctx.fill();
    }
  }
  function drawConNames(nn) {
    if (!S.names || nn < 0.15) return;
    for (const c of conList) {
      const p = proj(c.v); if (!p) continue;
      if (p[0] < 10 || p[0] > CW - 10 || p[1] < rib.y + rib.h + 40 || p[1] > CH_ - 10) continue;
      const a = (c.v[2] < 0 ? 0.35 : 0.8) * nn;
      label(short(c.fa), p[0], p[1], 'rgba(' + pal().conName + ',' + a + ')', 12.5, 'center', c.zodiac ? 600 : 400);
      if (view.fov < 60) label(c.name, p[0], p[1] + 14, 'rgba(' + pal().conName + ',' + a * 0.6 + ')', 10);
      hits.push({ o: c, x: p[0], y: p[1], r: 22, pri: 3 });
    }
  }
  function discGlow(x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawSolar() {
    for (const p of planets) {
      const q = proj(p.v); if (!q) continue;
      const below = p.v[2] < 0, r = clamp(3 + (1.6 - p.mag) * 0.85, 3, 7.5);
      ctx.globalAlpha = below ? 0.35 : 1;
      discGlow(q[0], q[1], r * 3.4, S.red ? '255,110,90' : '255,240,210', 0.28);
      ctx.fillStyle = S.red ? '#ff7a62' : p.color; ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill();
      ctx.strokeStyle = pal().gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], r + 3, 0, 7); ctx.stroke();
      label(p.fa.split(' ')[0], q[0], q[1] + r + 14, pal().gold, 12, 'center', 600);
      ctx.globalAlpha = 1; hits.push({ o: p, x: q[0], y: q[1], r: 22, pri: -1 });
    }
    const s = proj(SOLAR.sun.v);
    if (s) {
      const below = SOLAR.sun.v[2] < 0, R = Math.max(7, 0.27 * D2R * s[3]);
      ctx.globalAlpha = below ? 0.45 : 1;
      discGlow(s[0], s[1], R * 5, S.red ? '255,90,70' : '255,220,140', 0.5);
      ctx.fillStyle = pal().sunC; ctx.beginPath(); ctx.arc(s[0], s[1], R, 0, 7); ctx.fill();
      label('خورشید', s[0], s[1] + R + 14, pal().gold, 12, 'center', 600);
      ctx.globalAlpha = 1; hits.push({ o: SOLAR.sun, x: s[0], y: s[1], r: Math.max(R + 8, 24), pri: -2 });
    }
    const m = proj(SOLAR.moon.v);
    if (m) {
      const below = SOLAR.moon.v[2] < 0, R = Math.max(9, 0.26 * D2R * m[3]);
      ctx.globalAlpha = below ? 0.45 : 1;
      discGlow(m[0], m[1], R * 3.2, S.red ? '255,110,90' : '220,230,255', 0.18 + 0.2 * SOLAR.moon.frac);
      let ang; const sp2 = s || proj(SOLAR.sun.v);
      if (sp2) ang = Math.atan2(sp2[1] - m[1], sp2[0] - m[0]); else ang = Math.atan2(-dot(SOLAR.sun.v, cam.u), dot(SOLAR.sun.v, cam.r));
      ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(ang);
      ctx.fillStyle = S.red ? '#2a0a08' : '#1a2132'; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      const k = SOLAR.moon.frac, rx = R * Math.abs(2 * k - 1);
      ctx.fillStyle = S.red ? '#ffb4a4' : '#f4efe0'; ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
      if (k < 0.5) ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, -Math.PI / 2, true); else ctx.ellipse(0, 0, rx, R, 0, Math.PI / 2, Math.PI * 1.5, false);
      ctx.closePath(); ctx.fill(); ctx.restore();
      label('ماه', m[0], m[1] + R + 14, pal().gold, 12, 'center', 600);
      ctx.globalAlpha = 1; hits.push({ o: SOLAR.moon, x: m[0], y: m[1], r: Math.max(R + 8, 24), pri: -2 });
    }
  }
  function drawHorizon() {
    polyline(circlePts(t => C.altAzToEnu(0, t * 360), 180), pal().hor, 1.6);
    for (let az = 0; az < 360; az += 10) {
      const p = proj(C.altAzToEnu(0, az)), p2 = proj(C.altAzToEnu(az % 30 === 0 ? 1.8 : 1, az));
      if (!p || !p2) continue;
      ctx.strokeStyle = pal().hor; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    const names = { 0: 'شمال', 90: 'شرق', 180: 'جنوب', 270: 'غرب', 45: 'ش‌ق', 135: 'ج‌ش', 225: 'ج‌غ', 315: 'ش‌غ' };
    for (const az of Object.keys(names)) {
      const a = +az, major = a % 90 === 0, p = proj(C.altAzToEnu(major ? -4.5 : -3.4, a)); if (!p) continue;
      label(names[az], p[0], p[1], pal().card, major ? 17 : 11, 'center', major ? 700 : 400);
    }
    const zp = proj([0, 0, 1]); if (zp) { ctx.strokeStyle = pal().grid; ctx.beginPath(); ctx.arc(zp[0], zp[1], 4, 0, 7); ctx.stroke(); }
  }
  function drawQibla() {
    if (!S.qibla) return;
    const az = W.qibla.az, p = proj(C.altAzToEnu(0, az)); if (!p) return;
    const col = pal().qibla;
    ctx.save(); ctx.translate(p[0], p[1]); ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.stroke();
    ctx.fillStyle = '#0c0f14'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(-9, -52, 18, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(-9, -47, 18, 2.5); ctx.restore();
    label('قبله ' + fa(Math.round(az)) + '°', p[0], p[1] - 64, col, 13, 'center', 600);
    hits.push({ o: QIB, x: p[0], y: p[1] - 40, r: 26, pri: -3 });
  }

  /* نوار جهت بالای صفحه */
  function drawRibbon() {
    const aa = camAltAz(), hdg = aa.az, y0 = rib.y, h = Math.min(rib.h, 40), x0 = 12, x1 = CW - 12, w = x1 - x0;
    const range = 48, ppd = w / (range * 2), cx = CW / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.fillStyle = S.red ? 'rgba(22,4,4,0.62)' : 'rgba(10,27,39,0.62)'; ctx.fillRect(x0, y0, w, h);
    const start = Math.floor((hdg - range) / 5) * 5, names = { 0: 'شمال', 90: 'شرق', 180: 'جنوب', 270: 'غرب', 45: 'ش‌ق', 135: 'ج‌ش', 225: 'ج‌غ', 315: 'ش‌غ' };
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (let d = start; d <= hdg + range + 5; d += 5) {
      const x = cx + (d - hdg) * ppd, dm = ((d % 360) + 360) % 360, major = dm % 15 === 0, card = names[dm] != null;
      ctx.strokeStyle = card ? pal().gold : (S.red ? 'rgba(255,140,120,.6)' : 'rgba(180,200,215,.55)'); ctx.lineWidth = card ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(x, y0 + 2); ctx.lineTo(x, y0 + (card ? 14 : major ? 10 : 6)); ctx.stroke();
      if (card) { ctx.font = (dm % 90 === 0 ? '700 15px' : '500 11px') + ' system-ui, "Noto Sans Arabic", sans-serif'; ctx.fillStyle = dm % 90 === 0 ? pal().gold : pal().card; ctx.fillText(names[dm], x, y0 + 26); }
      else if (dm % 15 === 0) { ctx.font = '500 10px system-ui, "Noto Sans Arabic", sans-serif'; ctx.fillStyle = S.red ? 'rgba(255,150,130,.85)' : 'rgba(190,208,220,.85)'; ctx.fillText(fa(dm), x, y0 + 25); }
    }
    ctx.restore();
    ctx.fillStyle = pal().gold; ctx.beginPath(); ctx.moveTo(cx - 6, y0 + h + 1); ctx.lineTo(cx + 6, y0 + h + 1); ctx.lineTo(cx, y0 + h - 7); ctx.closePath(); ctx.fill();
  }
  function drawReticle() {
    const x = cam.cx, y = cam.cy, g = 5, l = 14;
    ctx.strokeStyle = pal().gold; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(x - g - l, y); ctx.lineTo(x - g, y); ctx.moveTo(x + g, y); ctx.lineTo(x + g + l, y); ctx.moveTo(x, y - g - l); ctx.lineTo(x, y - g); ctx.moveTo(x, y + g); ctx.lineTo(x, y + g + l); ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }

  /* هدف: حلقه یا پیکان لبهٔ صفحه */
  function targetState() {
    if (!target) return null;
    const v = target.v, z = dot(v, cam.f), x = dot(v, cam.r), y = dot(v, cam.u);
    const t = C.enuToAltAz(v), c = camAltAz();
    return { v, x, y, z, sep: Math.acos(clamp(z, -1, 1)) * R2D, dAz: angDiff(t.az, c.az), dAlt: t.alt - c.alt };
  }
  function drawTarget() {
    const st = targetState(); if (!st) return;
    const col = pal().gold, p = proj(st.v);
    if (p && p[0] > 24 && p[0] < CW - 24 && p[1] > rib.y + rib.h + 50 && p[1] < CH_ - 24) {
      const t = (performance.now() % 1600) / 1600;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 1 - t * 0.7;
      ctx.beginPath(); ctx.arc(p[0], p[1], 14 + t * 14, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, 7); ctx.stroke();
      dirty = true;
    } else {
      let dx = st.x, dy = -st.y; if (st.z < 0 && Math.hypot(dx, dy) < 0.05) dx = 1;
      const ang = Math.atan2(dy, dx), mx = CW / 2 - 40, my = CH_ / 2 - 150;
      const k = Math.min(Math.abs(mx / (Math.cos(ang) || 1e-6)), Math.abs(my / (Math.sin(ang) || 1e-6)));
      const px = CW / 2 + Math.cos(ang) * k, py = CH_ / 2 + Math.sin(ang) * k;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-9, -12); ctx.lineTo(-3, 0); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill(); ctx.restore();
      label(fa(Math.round(st.sep)) + '°', px - Math.cos(ang) * 32, py - Math.sin(ang) * 32, col, 13, 'center', 700);
    }
  }

  function draw() {
    buildCam(); hits = [];
    const nn = nightness(), cols = skyColors();
    const g = ctx.createRadialGradient(CW / 2, CH_ * 0.45, 0, CW / 2, CH_ * 0.45, Math.hypot(CW, CH_) * 0.65);
    g.addColorStop(0, S.red ? '#1a0606' : cols[1]); g.addColorStop(1, S.red ? '#080202' : cols[0]);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH_);
    drawMilky(nn); drawGrid(); drawLines(nn); drawDSO(nn); drawStars(nn); drawConNames(nn); drawSolar(); drawHorizon(); drawQibla(); drawTarget();
    drawRibbon(); drawReticle();
    updateInfo(); updateGuide();
  }

  /* ---------- مینی‌مپ و نقشهٔ کامل ---------- */
  function chartState(isMini) {
    const MT = W.MT, toEq = v => C.vecEq(C.mat.vec(MT, v));
    const fp = []; const N = 10, w = CW, h = CH_;
    const per = []; for (let i = 0; i < N; i++) per.push([w * i / N, 0]); for (let i = 0; i < N; i++) per.push([w, h * i / N]); for (let i = 0; i < N; i++) per.push([w - w * i / N, h]); for (let i = 0; i < N; i++) per.push([0, h - h * i / N]);
    for (const q of per) fp.push(toEq(unprojectScreen(q[0], q[1])));
    const lookEq = toEq(cam.f);
    const hemi = S.hemi, lat = S.lat;
    const below = Math.abs(lat) < 0.5 ? null : ((hemi === 'N') === (lat > 0) ? 'outside' : 'inside');
    return { hemi, mini: isMini, red: S.red, stars: stars, chains: chainsEq, conLabels: conLabelsEq, look: lookEq, footprint: fp, horizon: W.horizonEq, zenith: W.zenithEq, below, ecliptic: ECL_J2000, bodies: W.bodiesEq, showNames: S.chartNames, target: target ? toEq(target.v) : null, zoom: isMini ? null : chartZoom, starLabels: isMini ? null : starLabelsEq() };
  }
  function drawMini() {
    if (!mctx || !CH || !cam) return;
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CH.draw(mctx, MINI, MINI, chartState(true));
  }
  let chartOpen = false, chartL = null, chartW = 0, chartH = 0;
  const chartZoom = { s: 1, tx: 0, ty: 0 };
  const starLabelsEq = () => namedStars.filter(t => (t.fa || !isBayer(t.name)) && t.mag < 3.3).map(t => ({ ra: t.ra0, dec: t.dec0, mag: t.mag, text: t.fa ? t.fa.replace(/\s*\(.*\)/, '') : t.name }));
  function sizeChart() {
    const body = $('chartBody'); let w = 0, h = 0;
    try { w = body.clientWidth; h = body.clientHeight; } catch (e) { /* ignore */ }
    chartW = w > 50 ? w : CW; chartH = h > 50 ? h : CH_ - 120;
    chartCv.width = Math.round(chartW * DPR); chartCv.height = Math.round(chartH * DPR);
    chartCv.style.width = chartW + 'px'; chartCv.style.height = chartH + 'px';
  }
  function drawChart() {
    if (!chartOpen || !cctx || !CH || !cam) return;
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    chartL = CH.draw(cctx, chartW, chartH, chartState(false));
  }
  function clampPan() {
    const R0 = CH.layout(chartW, chartH, false).R, lim = R0 * chartZoom.s * 0.9;
    chartZoom.tx = clamp(chartZoom.tx, -lim, lim); chartZoom.ty = clamp(chartZoom.ty, -lim, lim);
  }
  function setChartZoom(s) { chartZoom.s = clamp(s, 1, 4); if (chartZoom.s === 1) { chartZoom.tx = 0; chartZoom.ty = 0; } clampPan(); drawChart(); }
  function openChart() {
    if (!CH) return;
    chartZoom.s = 1; chartZoom.tx = 0; chartZoom.ty = 0;
    for (const s of ['card', 'menu', 'search']) $(s).hidden = true;
    $('chartSheet').hidden = false; chartOpen = true; document.body.classList.add('sheet-open'); document.body.classList.add('chart-open');
    $('chartHemi').textContent = S.hemi === 'N' ? 'نیمکرهٔ شمالی' : 'نیمکرهٔ جنوبی';
    sizeChart(); drawChart();
  }
  function closeChart() { chartOpen = false; $('chartSheet').hidden = true; document.body.classList.remove('sheet-open'); document.body.classList.remove('chart-open'); dirty = true; }
  function conAtVecJ2000(vJ) {
    if (locator) { const k = locator.atVec(vJ); if (k) return { key: k, exact: true }; }
    let best = null, bd = -2;
    for (const c of conList) for (const ch of c.chains) for (const p of ch) { const d = dot(p.v0, vJ); if (d > bd) { bd = d; best = c; } }
    return best && bd > Math.cos(14 * D2R) ? { key: best.key, exact: false } : null;
  }
  function chartTap(x, y) {
    if (!chartL) return;
    const u = CH.unproject(S.hemi, chartL, x, y); if (u.k > 1.02) return;
    // نزدیک‌ترین جرم نام‌دار در ۱۶ پیکسل
    let best = null, bd = 16;
    const cand = namedStars.filter(s => s.mag < 3.2 || s.fa).map(s => ({ o: s, ra: s.ra0, dec: s.dec0 })).concat([SOLAR.sun, SOLAR.moon].concat(planets).map((b, i) => ({ o: b, ra: W.bodiesEq[i].ra, dec: W.bodiesEq[i].dec })));
    for (const c of cand) { const q = CH.project(S.hemi, chartL, c.ra, c.dec), d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = c.o; } }
    if (!best) { const k = conAtVecJ2000(C.eqVec(u.ra, u.dec)); if (k) best = conList.find(c => c.key === k.key) || null; }
    if (best) { closeChart(); setTarget(best); toast('هدف: ' + (best.fa || best.name)); }
  }
  if (chartCv && chartCv.addEventListener) {
    const cp = new Map(); let cpinch = null, cmoved = 0, cdown = 0;
    chartCv.addEventListener('pointerdown', e => { chartCv.setPointerCapture(e.pointerId); cp.set(e.pointerId, [e.clientX, e.clientY]); cmoved = 0; cdown = performance.now(); if (cp.size === 2) { const [a, b] = [...cp.values()]; cpinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: chartZoom.s }; } });
    chartCv.addEventListener('pointermove', e => {
      if (!cp.has(e.pointerId)) return;
      const prev = cp.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1]; cp.set(e.pointerId, [e.clientX, e.clientY]); cmoved += Math.abs(dx) + Math.abs(dy);
      if (cp.size === 2 && cpinch) { const [a, b] = [...cp.values()]; setChartZoom(cpinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(cpinch.d, 1)); return; }
      if (cp.size === 1 && chartZoom.s > 1) { chartZoom.tx += dx; chartZoom.ty += dy; clampPan(); drawChart(); }
    });
    const cEnd = e => { const tapOk = cp.size === 1 && cmoved < 8 && performance.now() - cdown < 500; cp.delete(e.pointerId); if (cp.size < 2) cpinch = null; if (tapOk && e.type === 'pointerup') { const r = chartCv.getBoundingClientRect(); chartTap(e.clientX - r.left, e.clientY - r.top); } };
    chartCv.addEventListener('pointerup', cEnd); chartCv.addEventListener('pointercancel', cEnd);
    chartCv.addEventListener('wheel', e => { e.preventDefault(); setChartZoom(chartZoom.s * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }
  if (mini && mini.addEventListener) mini.addEventListener('click', openChart);

  /* ---------- اطلاعات مرکز دید و راهنمای هدف ---------- */
  let lastInfo = '', lastGuideKey = '', locked = false;
  function updateInfo() {
    const aa = camAltAz(), vJ = C.mat.vec(W.MT, cam.f), k = conAtVecJ2000(vJ);
    let con = '—';
    if (k) { const m = conMeta(k.key); con = (k.exact ? '' : 'نزدیک ') + m[1]; }
    const sub = dir8(aa.az) + ' ' + fa(Math.round(aa.az)) + '° · ارتفاع ' + fa(Math.round(aa.alt)) + '°' + (mode === 'manual' ? ' · میدان ' + fa(Math.round(view.fov)) + '°' : '') + (sens.rel && !sens.abs && mode === 'sensor' ? ' · جهت‌یابی تقریبی' : '');
    const txt = con + '|' + sub;
    if (txt !== lastInfo) { lastInfo = txt; $('infoCon').textContent = con; $('infoSub').textContent = sub; }
  }
  function updateGuide() {
    const g = $('guide');
    const st = targetState();
    if (!st) { if (!g.hidden) g.hidden = true; locked = false; return; }
    if (g.hidden) g.hidden = false;
    const near = st.sep < (locked ? 5 : 3);
    if (near && !locked) { locked = true; try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ } }
    if (!near) locked = false;
    let how;
    if (near) how = 'رو به هدف هستی';
    else { const parts = []; if (Math.abs(st.dAz) >= 1.5 && st.z > -0.2 || st.z <= -0.2) parts.push(fa(Math.round(Math.abs(st.dAz))) + '° به ' + (st.dAz > 0 ? 'راست' : 'چپ')); if (Math.abs(st.dAlt) >= 1.5) parts.push(fa(Math.round(Math.abs(st.dAlt))) + '° ' + (st.dAlt > 0 ? 'بالا' : 'پایین')); how = parts.join('، '); }
    const key = (target.fa || target.name) + '|' + how + '|' + near;
    if (key !== lastGuideKey) { lastGuideKey = key; $('guideName').textContent = (target.fa || target.name); $('guideHow').textContent = how; g.classList.toggle('lock', near); }
  }

  /* ---------- زمان ---------- */
  function updateWhere() {
    const d = new Date(T.ms);
    $('whereDate').textContent = fmtDate.format(d) + ' · ' + fmtTime.format(d);
    const ns = S.lat >= 0 ? 'ش' : 'ج', ew = S.lon >= 0 ? 'ر' : 'غ';
    const sunTxt = W.sunAlt > 0 ? 'روز' : W.sunAlt > -6 ? 'گرگ‌ومیش مدنی' : W.sunAlt > -12 ? 'گرگ‌ومیش دریایی' : W.sunAlt > -18 ? 'گرگ‌ومیش نجومی' : 'شب';
    $('whereMeta').textContent = fa(Math.abs(S.lat).toFixed(2)) + '°' + ns + ' ' + fa(Math.abs(S.lon).toFixed(2)) + '°' + ew + ' · ' + sunTxt + (T.live ? '' : ' · زمان دستی');
    $('tNow').setAttribute('aria-pressed', T.live ? 'true' : 'false');
  }
  let lastFrame = performance.now(), lastClock = 0, lastAux = 0;
  function tick(now) {
    const dt = now - lastFrame; lastFrame = now;
    if (T.play) { T.ms += dt * 600; T.live = false; } else if (T.live) T.ms = Date.now();
    if (Math.abs(T.ms - W.ms) > (T.play ? 1000 : 4000)) recompute();
    if (now - lastClock > 1000) { lastClock = now; updateWhere(); if (selected) renderCard(selected); }
    if (mode === 'sensor' || dirty || T.play) { dirty = false; draw(); if (now - lastAux > 50 || !lastAux) { lastAux = now; drawMini(); if (chartOpen) drawChart(); } }
    requestAnimationFrame(tick);
  }
  function setTime(ms, live) { T.ms = ms; T.live = !!live; T.play = false; setPlayUI(); recompute(); updateWhere(); }
  function setPlayUI() { $('tPlay').setAttribute('aria-pressed', T.play ? 'true' : 'false'); }

  /* ---------- حسگر جهت ---------- */
  function rotZXY(aD, bD, gD) {
    const a = aD * D2R, b = bD * D2R, g = gD * D2R;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    return [[ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg], [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg], [-cb * sg, sb, cb * cg]];
  }
  const mulv = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
  function applyDecl(v) { const d = S.decl * D2R, c = Math.cos(d), s = Math.sin(d); return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]]; }
  const nativeCache = {};
  const isNativeApp = () => { try { const c = window.Capacitor; return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); } catch (e) { return false; } };
  function nativePlugin(name) {
    try {
      if (!isNativeApp()) return null;
      if (nativeCache[name]) return nativeCache[name];
      const cap = window.Capacitor; let pl = null;
      if (typeof cap.registerPlugin === 'function') { try { pl = cap.registerPlugin(name); } catch (e) { pl = null; } }
      if (!pl && cap.Plugins && cap.Plugins[name]) pl = cap.Plugins[name];
      if (pl) nativeCache[name] = pl;
      return pl;
    } catch (e) { return null; }
  }
  let lastSensT = 0;
  function pushVectors(f, u) {
    f = applyDecl(f); u = applyDecl(u);
    const t = performance.now();
    if (sens.f) { const k = 1 - Math.exp(-clamp(t - lastSensT, 1, 200) / 90); f = norm([lerp(sens.f[0], f[0], k), lerp(sens.f[1], f[1], k), lerp(sens.f[2], f[2], k)]); u = norm([lerp(sens.u[0], u[0], k), lerp(sens.u[1], u[1], k), lerp(sens.u[2], u[2], k)]); }
    lastSensT = t; sens.f = f; sens.u = u; dirty = true;
  }
  const screenAng = () => ((screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0)) * D2R;
  function onOrientation(alpha, beta, gamma) { const R = rotZXY(alpha, beta, gamma), a = screenAng(); pushVectors(norm(mulv(R, [0, 0, -1])), norm(mulv(R, [Math.sin(a), Math.cos(a), 0]))); }
  function onNativeMatrix(e) {
    const R = e && e.matrix; if (!R || R.length < 9) return;
    sens.got = true; sens.abs = true;
    const a = screenAng(), sn = Math.sin(a), cs = Math.cos(a);
    pushVectors(norm([-R[2], -R[5], -R[8]]), norm([R[0] * sn + R[1] * cs, R[3] * sn + R[4] * cs, R[6] * sn + R[7] * cs]));
  }
  const onAbs = e => { if (e.alpha == null) return; sens.abs = true; sens.got = true; onOrientation(e.alpha, e.beta, e.gamma); };
  const onRel = e => {
    if (sens.abs || e.alpha == null) return;
    sens.got = true;
    if (e.webkitCompassHeading != null) { if (Math.abs(e.beta) < 45) sens.iosOff = C.rev(-e.webkitCompassHeading - e.alpha); if (sens.iosOff != null) { sens.abs = true; onOrientation(C.rev(e.alpha + sens.iosOff), e.beta, e.gamma); } return; }
    sens.rel = true; onOrientation(e.alpha, e.beta, e.gamma);
  };
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && mode === 'sensor') keepAwake(true); });
  async function startSensor() {
    sens.f = null; sens.got = false; sens.abs = false; sens.rel = false;
    const compass = nativePlugin('NativeCompass');
    if (compass) {
      try {
        if (!sens.nativeHandle) sens.nativeHandle = await compass.addListener('orientation', onNativeMatrix);
        const info = await compass.start();
        if (info && info.available) { sens.native = true; setMode('sensor'); keepAwake(true); toast('گوشی را رو به آسمان بگیر. اگر جهت کج بود، گوشی را به شکل ۸ بچرخان'); return; }
      } catch (e) { /* ادامه با حسگر وب */ }
    }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { toast('اجازهٔ دسترسی به حسگر داده نشد'); return; }
      }
    } catch (e) { /* ادامه */ }
    if (!sens.active) {
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onAbs, true);
      window.addEventListener('deviceorientation', onRel, true);
      sens.active = true;
    }
    setMode('sensor'); keepAwake(true);
    setTimeout(() => { if (mode === 'sensor' && !sens.got) { toast('حسگر جهت پاسخ نمی‌دهد. به حالت نقشه برگشتیم'); setMode('manual'); } }, 2500);
    toast('گوشی را رو به آسمان بگیر. اگر جهت کج بود، گوشی را به شکل ۸ بچرخان');
  }
  function setMode(m) {
    mode = m;
    $('modeManual').setAttribute('aria-pressed', m === 'manual');
    $('modeSensor').setAttribute('aria-pressed', m === 'sensor');
    if (m === 'sensor') view.fov = Math.min(view.fov, 65);
    else { keepAwake(false); const c = nativePlugin('NativeCompass'); if (c && sens.native) { c.stop().catch(() => {}); sens.native = false; } }
    dirty = true;
  }

  /* ---------- لمس ---------- */
  const ptrs = new Map(); let pinch0 = null, moved = 0, downAt = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; downAt = performance.now();
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov: view.fov }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); view.fov = clamp(pinch0.fov * pinch0.d / Math.max(d, 1), 6, 140); dirty = true; return; }
    if (ptrs.size === 1 && mode === 'manual') {
      const k = view.fov / Math.min(CW, CH_) * 1.05;
      view.az = C.rev(view.az - dx * k / Math.max(Math.cos(view.alt * D2R), 0.25)); view.alt = clamp(view.alt + dy * k, -89.5, 89.5); dirty = true;
    }
  });
  const endPtr = e => {
    const wasTap = ptrs.size === 1 && moved < 8 && performance.now() - downAt < 500;
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null;
    if (wasTap && e.type === 'pointerup') tap(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.fov = clamp(view.fov * Math.exp(e.deltaY * 0.0012), 6, 140); dirty = true; }, { passive: false });
  function tap(x, y) {
    let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d <= h.r) { const sc = d + h.pri * 8; if (sc < bd) { bd = sc; best = h.o; } } }
    if (best) openCard(best); else closeSheets();
  }

  /* ---------- کارت اطلاعات ---------- */
  const conName = k => (conMeta(k)[1] || '').replace(/\s*\(.*\)/, '');
  function typeText(o) {
    switch (o.type) {
      case 'star': return 'ستاره' + (o.con ? ' · ' + conName(o.con) : '');
      case 'planet': return 'سیاره'; case 'sun': return 'ستارهٔ منظومهٔ شمسی'; case 'moon': return 'قمر زمین';
      case 'dso': return DSO_KIND[o.kind] || 'جرم عمیق آسمان'; case 'con': return 'صورت فلکی' + (o.zodiac ? ' (منطقة‌البروج)' : '');
      case 'qibla': return 'جهت کعبه روی افق'; default: return '';
    }
  }
  function timeAt(hoursAhead) { const d = new Date(T.ms + hoursAhead * 3600000), same = d.toDateString() === new Date(T.ms).toDateString(); return fa(fmtTime.format(d)) + (same ? '' : ' (فردا)'); }
  function moonPhaseName(e) {
    if (e < 10 || e > 350) return 'محاق (ماه نو)'; if (e < 80) return 'هلال رو به رشد'; if (e < 100) return 'تربیع اول';
    if (e < 170) return 'ماه رو به کامل'; if (e < 190) return 'بدر (ماه کامل)'; if (e < 260) return 'ماه رو به نقصان';
    if (e < 280) return 'تربیع آخر'; return 'هلال رو به محاق';
  }
  const altText = aa => aa.alt < 0 ? fa(Math.abs(Math.round(aa.alt))) + '° زیر افق' : fa(Math.round(aa.alt)) + '° بالای افق';
  function displayName(o) { return o.fa || o.name || (o.hip ? 'HIP ' + o.hip : 'ستاره'); }
  function renderCard(o) {
    const el = $('card');
    if (o.type === 'con') { renderConCard(o); return; }
    const aa = C.enuToAltAz(o.v), rows = [];
    if (o.type !== 'qibla' && o.mag != null && o.mag < 90) rows.push(['قدر ظاهری', fa((+o.mag).toFixed(1))]);
    if (o.type === 'star') { rows.push(['مختصات (J2000)', 'RA ' + fa((o.ra0 / 15).toFixed(2)) + 'h · Dec ' + fa(o.dec0.toFixed(2)) + '°']); }
    if (o.type === 'moon') rows.push(['فاز', moonPhaseName(o.elong) + ' · ' + fa(Math.round(o.frac * 100)) + '٪ روشن']);
    if (o.type === 'planet') rows.push(['فاصله از زمین', fa(o.dist.toFixed(2)) + ' واحد نجومی']);
    if (o.type === 'sun') rows.push(['فاصله', fa(o.dist.toFixed(3)) + ' واحد نجومی']);
    if (o.type === 'qibla') rows.push(['فاصله تا کعبه', faInt(W.qibla.km) + ' کیلومتر']);
    rows.push(['سمت', fa(Math.round(aa.az)) + '° ' + dir8(aa.az)]); rows.push(['ارتفاع', altText(aa)]);
    const ra = o.ra != null ? o.ra : (o.ra0 != null ? o.ra0 : null), dec = o.dec != null ? o.dec : (o.dec0 != null ? o.dec0 : null);
    if (ra != null && o.type !== 'qibla') {
      let rr = ra, dd = dec; if (o.type === 'star' || o.type === 'dso') { const e = C.vecEq(C.mat.vec(W.P, o.v0)); rr = e[0]; dd = e[1]; }
      const h0 = o.type === 'sun' ? -0.833 : o.type === 'moon' ? 0.125 : -0.567, rs = C.riseSet(rr, dd, S.lat, S.lon, W.jd, h0);
      if (rs.circumpolar) rows.push(['وضعیت', 'همیشه بالای افق (دور قطب)']); else if (rs.neverRises) rows.push(['وضعیت', 'در این عرض هرگز بالا نمی‌آید']);
      else { rows.push(['طلوع', timeAt(rs.rise)]); rows.push(['اوج (نصف‌النهار)', timeAt(rs.transit)]); rows.push(['غروب', timeAt(rs.set)]); }
    }
    el.innerHTML = '<div class="sheet-head"><div class="card-title"><h2>' + esc(displayName(o)) + '</h2>' + (o.fa && o.name && o.name !== o.fa ? '<small>' + esc(o.name) + '</small>' : '') + '</div><button class="x" data-close aria-label="بستن">×</button></div>'
      + '<p class="sub">' + esc(typeText(o)) + '</p><dl class="kv">' + rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl>'
      + '<div class="row"><button class="btn" id="cardGuide">راهنمایی تا این هدف</button></div>';
    $('cardGuide').onclick = () => { setTarget(o); closeSheets(); }; bindClose(el);
  }
  function renderConCard(c) {
    const el = $('card'), aa = C.enuToAltAz(c.v);
    const named = stars.filter(s => s.con === c.key && (s.fa || (s.name && !isBayer(s.name)))).sort((a, b) => a.mag - b.mag).slice(0, 4).map(s => s.fa || s.name);
    el.innerHTML = '<div class="sheet-head"><div class="card-title"><h2>' + esc(c.fa) + '</h2><small>' + esc(c.name) + '</small></div><button class="x" data-close aria-label="بستن">×</button></div>'
      + '<p class="sub">' + esc(typeText(c)) + '</p><dl class="kv">' + (named.length ? '<dt>ستاره‌های برجسته</dt><dd>' + esc(named.join('، ')) + '</dd>' : '')
      + '<dt>ارتفاع مرکز</dt><dd>' + altText(aa) + '</dd><dt>سمت</dt><dd>' + fa(Math.round(aa.az)) + '° ' + dir8(aa.az) + '</dd></dl>'
      + '<div class="row"><button class="btn" id="cardGuide">راهنمایی تا این هدف</button></div>';
    $('cardGuide').onclick = () => { setTarget(c); closeSheets(); }; bindClose(el);
  }
  function openCard(o) { selected = o; showSheet('card'); renderCard(o); }

  /* ---------- برگه‌ها ---------- */
  function showSheet(id) { for (const s of ['card', 'menu', 'search']) $(s).hidden = s !== id; document.body.classList.add('sheet-open'); }
  function closeSheets() { for (const s of ['card', 'menu', 'search']) $(s).hidden = true; if (chartOpen) closeChart(); document.body.classList.remove('sheet-open'); selected = null; dirty = true; }
  function bindClose(root) { root.querySelectorAll('[data-close]').forEach(b => { b.onclick = closeSheets; }); }
  bindClose(document);

  const TOGGLES = [['lines', 'خطوط صورت‌های فلکی'], ['names', 'نام صورت‌های فلکی'], ['starNames', 'نام ستاره‌ها'], ['grid', 'شبکهٔ ارتفاع و سمت'], ['eqEcl', 'استوا و دایرة‌البروج'], ['dso', 'خوشه‌ها و سحابی‌ها'], ['milky', 'راه شیری'], ['qibla', 'جهت قبله'], ['dayLight', 'روشنایی آسمان روز'], ['red', 'حالت شب (قرمز)'], ['chartNames', 'نام‌ها روی نقشهٔ کل آسمان']];
  function buildMenu() {
    $('toggles').innerHTML = TOGGLES.map(t => '<label><input type="checkbox" data-k="' + t[0] + '"' + (S[t[0]] ? ' checked' : '') + '> ' + t[1] + '</label>').join('');
    $('toggles').querySelectorAll('input').forEach(i => { i.onchange = () => { S[i.dataset.k] = i.checked; if (i.dataset.k === 'red') document.body.classList.toggle('red', S.red); save(); dirty = true; }; });
    syncFields();
  }
  function catStatusText() {
    return catalog ? ('کاتالوگ کامل: ' + faInt(stars.length) + ' ستاره · ' + faInt(conList.length) + ' صورت فلکی' + (locator ? ' · با مرز رسمی' : '')) : ('کاتالوگ داخلی: ' + faInt(stars.length) + ' ستارهٔ درخشان · ' + faInt(conList.length) + ' صورت فلکی');
  }
  function syncFields() {
    $('fLat').value = S.lat.toFixed(4); $('fLon').value = S.lon.toFixed(4); $('fDecl').value = S.decl;
    const d = new Date(T.ms - new Date(T.ms).getTimezoneOffset() * 60000);
    try { $('fTime').value = d.toISOString().slice(0, 16); } catch (e) { /* ignore */ }
    const n = [];
    if (!S.posKnown) n.push('موقعیت هنوز ذخیره نشده و تهران فرض شده است. «موقعیت من» را بزن.');
    n.push('موقعیت و انحراف مغناطیسی با قطب‌نما مشترک است. در بیشتر نقاط ایران انحراف حدود ۴ تا ۶ درجه شرقی است؛ تا آن را وارد نکنی، جهت آسمان‌نما چند درجه کج می‌ماند.');
    $('sharedNote').hidden = false; $('sharedNote').textContent = n.join(' ');
    updateCatUI();
  }
  function updateCatUI() {
    $('catStatus').textContent = catStatusText();
    $('btnCat').textContent = catalog ? 'به‌روزرسانی کاتالوگ' : 'دانلود کاتالوگ کامل (حدود ۱ مگابایت)';
    $('catBanner').hidden = !!catalog || !!store.get('sky.catHintDismissed') || !CAT;
  }
  function applyFields() {
    const lat = parseFloat($('fLat').value), lon = parseFloat($('fLon').value), dc = parseFloat($('fDecl').value);
    if (isFinite(lat) && Math.abs(lat) <= 90 && isFinite(lon) && Math.abs(lon) <= 180 && (lat !== S.lat || lon !== S.lon)) { S.lat = lat; S.lon = lon; savePos(); }
    if (isFinite(dc) && Math.abs(dc) <= 40 && dc !== S.decl) { S.decl = dc; saveDecl(); }
    recompute(); updateWhere(); syncFields();
  }
  ['fLat', 'fLon', 'fDecl'].forEach(id => $(id).addEventListener('change', applyFields));
  $('fTime').addEventListener('change', e => { const t = Date.parse(e.target.value); if (isFinite(t)) setTime(t, false); });
  function onPos(p) { S.lat = p.coords.latitude; S.lon = p.coords.longitude; savePos(); recompute(); updateWhere(); syncFields(); toast('موقعیت به‌روز شد'); }
  function onPosErr() { toast('موقعیت در دسترس نیست. دسترسی موقعیت یا GPS را بررسی کن، یا مختصات را دستی وارد کن'); }
  $('btnGps').onclick = async () => {
    toast('در حال یافتن موقعیت…');
    const geo = nativePlugin('Geolocation');
    if (geo) {
      try { try { await geo.requestPermissions({ permissions: ['location'] }); } catch (e) { /* دوباره می‌پرسد */ }
        onPos(await geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 })); } catch (e) { onPosErr(); }
      return;
    }
    if (!navigator.geolocation) { toast('این مرورگر موقعیت‌یابی ندارد'); return; }
    navigator.geolocation.getCurrentPosition(onPos, onPosErr, { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 });
  };
  $('btnReset').onclick = () => { Object.assign(S, DEFAULTS); S.hemi = S.lat >= 0 ? 'N' : 'S'; save(); document.body.classList.toggle('red', S.red); buildMenu(); dirty = true; };
  $('btnMenu').onclick = () => { syncFields(); showSheet('menu'); };
  $('btnChart').onclick = openChart;
  $('chartClose').onclick = closeChart;
  $('chartZoomIn').onclick = () => setChartZoom(chartZoom.s * 1.5); $('chartZoomOut').onclick = () => setChartZoom(chartZoom.s / 1.5);
  $('chartHemi').onclick = () => { S.hemi = S.hemi === 'N' ? 'S' : 'N'; save(); $('chartHemi').textContent = S.hemi === 'N' ? 'نیمکرهٔ شمالی' : 'نیمکرهٔ جنوبی'; drawChart(); dirty = true; };

  /* دانلود کاتالوگ */
  let downloading = false;
  async function downloadCatalog() {
    if (!CAT || downloading) return;
    downloading = true; $('btnCat').disabled = true; $('btnCatBanner').disabled = true;
    try {
      const cat = await CAT.download({ onProgress: (d, n) => toast('دانلود کاتالوگ… ' + fa(d) + ' از ' + fa(n)) });
      buildModel(cat); recompute(); buildMenu(); dirty = true;
      toast('کاتالوگ کامل آماده شد: ' + faInt(cat.stars.length) + ' ستاره' + (cat.saved ? '' : ' (ذخیره نشد؛ فقط برای همین بار)'));
    } catch (e) { toast((e && e.message) || 'دانلود ممکن نشد'); }
    downloading = false; $('btnCat').disabled = false; $('btnCatBanner').disabled = false; updateCatUI();
  }
  $('btnCat').onclick = downloadCatalog; $('btnCatBanner').onclick = downloadCatalog;
  $('btnCatLater').onclick = () => { store.set('sky.catHintDismissed', true); updateCatUI(); };

  /* ---------- جست‌وجو و هدف‌های سریع ---------- */
  const TYPE_ORDER = { planet: 0, sun: 0, moon: 0, qibla: 0, con: 1, star: 2, dso: 3 };
  function searchIndex() {
    if (!searchCache) searchCache = [SOLAR.sun, SOLAR.moon].concat(planets, conList, namedStars.filter(s => !isBayer(s.name) || s.fa), dsos);
    return searchCache;
  }
  const QUICK = [['ستارهٔ قطبی', () => byName.get('Polaris')], ['قبله', () => QIB], ['ماه', () => SOLAR.moon], ['خورشید', () => SOLAR.sun], ['زهره', () => SOLAR.venus], ['مشتری', () => SOLAR.jupiter], ['مریخ', () => SOLAR.mars], ['زحل', () => SOLAR.saturn], ['شعرای یمانی', () => byName.get('Sirius')]];
  function runSearch(q) {
    const ul = $('results'); ul.innerHTML = '';
    const n = normText(q);
    let list = searchIndex();
    if (n) list = list.filter(o => normText(o.fa || '').includes(n) || normText(o.name || '').includes(n) || (o.type === 'star' && o.con && normText(conName(o.con)).includes(n)));
    else list = list.filter(o => o.type !== 'star' || o.mag < 1.5);
    list = list.slice().sort((a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || ((a.mag || 0) - (b.mag || 0))).slice(0, 40);
    if (!list.length) { ul.innerHTML = '<li class="none">چیزی پیدا نشد. نام فارسی یا انگلیسی را امتحان کن.</li>'; return; }
    for (const o of list) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.innerHTML = '<span>' + esc(displayName(o)) + ' <small>' + esc(typeText(o)) + '</small></span><small>' + esc(o.name || '') + '</small>';
      b.onclick = () => { setTarget(o); closeSheets(); };
      li.appendChild(b); ul.appendChild(li);
    }
  }
  function buildQuick() {
    const box = $('quick'); box.innerHTML = '';
    for (const [lbl, get] of QUICK) {
      const b = document.createElement('button'); b.className = 'chip'; b.textContent = lbl;
      b.onclick = () => { const o = get(); if (o) { setTarget(o); closeSheets(); } else toast('این هدف در کاتالوگ نیست'); };
      box.appendChild(b);
    }
  }
  $('btnSearch').onclick = () => { showSheet('search'); $('q').value = ''; runSearch(''); setTimeout(() => $('q').focus(), 50); };
  $('q').addEventListener('input', e => runSearch(e.target.value));
  function setTarget(o) {
    target = o; locked = false; lastGuideKey = '';
    if (mode === 'manual') { const aa = C.enuToAltAz(o.v); view.az = aa.az; view.alt = clamp(aa.alt, -80, 85); if (view.fov > 70) view.fov = 60; }
    else toast('گوشی را به سمت پیکان بچرخان');
    dirty = true;
  }
  $('guideClear').onclick = () => { target = null; $('guide').hidden = true; dirty = true; };

  /* ---------- دکمه‌های پایین ---------- */
  $('modeManual').onclick = () => setMode('manual');
  $('modeSensor').onclick = () => { if (mode !== 'sensor') startSensor(); };
  document.querySelectorAll('.timebar [data-d]').forEach(b => { b.onclick = () => setTime(T.ms + (+b.dataset.d), false); });
  $('tNow').onclick = () => setTime(Date.now(), true);
  $('tPlay').onclick = () => { T.play = !T.play; if (!T.play) T.live = false; setPlayUI(); };
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); }

  /* ---------- شروع ---------- */
  document.body.classList.toggle('red', S.red);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  if (!CH) { $('btnChart').hidden = true; $('mini').hidden = true; }
  buildModel(CAT ? CAT.load() : null);
  buildQuick(); buildMenu(); resize(); recompute(); updateWhere();
  requestAnimationFrame(tick);
  window.__sky = { S, view, T, get stars() { return stars; }, get conList() { return conList; }, SOLAR, recompute, draw, buildModel, get locator() { return locator; }, setTarget, openChart, drawChart, drawMini, chartState, chartZoom, setChartZoom };
})();
