/* sky-chart.js — نقشهٔ قطبی کل آسمان (شبیه نقشه‌های چاپی ستاره‌ها)
 * مرکز: قطب سماوی. شمالی: ساعت صعود مستقیم (RA) رو به راست و ساعت‌گرد؛ جنوبی: آینه‌ای.
 * روی نقشه: ناحیه‌ای که گوشی می‌بیند، افق، سمت‌الرأس، خورشید، ماه و سیاره‌ها.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkyChart = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const SPAN = 120; // نقشه از قطب تا ۳۰ درجه آن‌سوی استوا را نشان می‌دهد
  const FD = '۰۱۲۳۴۵۶۷۸۹';
  const fa = s => String(s).replace(/\d/g, d => FD[d]).replace(/-/g, '−');

  function layout(w, h, mini) {
    const pad = mini ? 3 : 30;
    return { cx: w / 2, cy: h / 2, R: Math.min(w, h) / 2 - pad };
  }
  function project(hemi, L, ra, dec) {
    const k = (hemi === 'N' ? 90 - dec : 90 + dec) / SPAN, a = ra * D2R, s = hemi === 'N' ? 1 : -1;
    return [L.cx + s * L.R * k * Math.sin(a), L.cy - L.R * k * Math.cos(a), k];
  }
  function unproject(hemi, L, x, y) {
    const dx = x - L.cx, dy = y - L.cy, k = Math.hypot(dx, dy) / L.R, s = hemi === 'N' ? 1 : -1;
    let ra = Math.atan2(s * dx, -dy) * R2D; if (ra < 0) ra += 360;
    return { ra, dec: hemi === 'N' ? 90 - SPAN * k : -90 + SPAN * k, k };
  }

  const PAL = {
    n: { bg0: '#10305a', bg1: '#06142b', ring: '#c9a24a', ringSoft: 'rgba(201,162,74,.55)', grid: 'rgba(210,190,140,.28)', line: '234,198,110', lineA: 0.82, star: '244,247,255', name: 'rgba(236,208,140,.92)', hour: 'rgba(236,208,140,.85)', ecl: 'rgba(255,170,110,.55)', hor: '#6fe0cf', below: 'rgba(0,4,12,.52)', foot: '230,185,74', body: '#E6B94A' },
    r: { bg0: '#2a0a0a', bg1: '#0c0303', ring: '#b8503f', ringSoft: 'rgba(184,80,63,.55)', grid: 'rgba(255,120,100,.24)', line: '255,120,100', lineA: 0.7, star: '255,120,100', name: 'rgba(255,140,120,.9)', hour: 'rgba(255,140,120,.85)', ecl: 'rgba(255,130,90,.5)', hor: '#ff9a88', below: 'rgba(0,0,0,.5)', foot: '255,122,98', body: '#ff7a62' }
  };

  /* o: {hemi, mini, red, stars, chains, conLabels, look, footprint, horizon, zenith, below, ecliptic,
         bodies, showNames, target} — همهٔ مختصات J2000 و بر حسب درجه */
  function draw(ctx, w, h, o) {
    const P = o.red ? PAL.r : PAL.n, L = layout(w, h, o.mini), hemi = o.hemi || 'N';
    const Z = (o.zoom && o.zoom.s) || 1;
    if (o.zoom) { L.R *= o.zoom.s; L.cx += o.zoom.tx; L.cy += o.zoom.ty; }
    const pr = (ra, dec) => project(hemi, L, ra, dec);
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2); ctx.clip();

    // پس‌زمینهٔ سرمه‌ای
    const g = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, L.R);
    g.addColorStop(0, P.bg0); g.addColorStop(1, P.bg1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // ناحیهٔ زیر افق تیره‌تر
    if (o.horizon && o.horizon.length > 8 && o.below) {
      ctx.beginPath();
      if (o.below === 'outside') { ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2); }
      o.horizon.forEach((p, i) => { const q = pr(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath(); ctx.fillStyle = P.below; ctx.fill('evenodd');
    }

    // شبکه: دایره‌های میل و پره‌های ساعت
    ctx.lineWidth = 1; ctx.strokeStyle = P.grid; ctx.setLineDash(o.mini ? [1, 3] : [2, 5]);
    const decs = hemi === 'N' ? [60, 30, 0] : [-60, -30, 0];
    decs.forEach(d => { const k = pr(0, d)[2]; ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R * k, 0, Math.PI * 2); ctx.stroke(); });
    const step = o.mini ? 6 : 2;
    for (let hh = 0; hh < 24; hh += step) { const q = pr(hh * 15, hemi === 'N' ? -30 : 30); ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    ctx.setLineDash([]);

    // دایرة‌البروج
    if (o.ecliptic) { ctx.beginPath(); o.ecliptic.forEach((p, i) => { const q = pr(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.strokeStyle = P.ecl; ctx.lineWidth = o.mini ? 0.8 : 1.2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }

    // خطوط صورت‌های فلکی (طلایی)
    ctx.beginPath();
    for (const ch of (o.chains || [])) for (let i = 0; i < ch.length; i++) { const q = pr(ch[i][0], ch[i][1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    ctx.strokeStyle = 'rgba(' + P.line + ',' + (o.mini ? 0.55 : P.lineA) + ')'; ctx.lineWidth = o.mini ? 0.9 : 1.3; ctx.lineJoin = 'round'; ctx.stroke();

    // ستاره‌ها
    const lim = o.mini ? 4.4 : 6.3;
    ctx.fillStyle = 'rgba(' + P.star + ',0.95)'; ctx.beginPath();
    const bright = [];
    for (const s of (o.stars || [])) {
      if (s.mag > lim) continue;
      const dec = s.dec0; if (hemi === 'N' ? dec < -32 : dec > 32) continue;
      const q = pr(s.ra0, dec);
      const r = o.mini ? Math.max(0.45, 0.35 + (4.6 - s.mag) * 0.3) : Math.max(0.6, 0.5 + (5.8 - s.mag) * 0.5) * (1 + 0.22 * (Z - 1));
      ctx.moveTo(q[0] + r, q[1]); ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
      if (!o.mini && s.mag < 1.8) bright.push([q[0], q[1], r]);
    }
    ctx.fill();
    for (const b of bright) { const hg = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2] * 4); hg.addColorStop(0, 'rgba(' + P.star + ',0.45)'); hg.addColorStop(1, 'rgba(' + P.star + ',0)'); ctx.fillStyle = hg; ctx.fillRect(b[0] - b[2] * 4, b[1] - b[2] * 4, b[2] * 8, b[2] * 8); }

    // نام صورت‌های فلکی
    if (!o.mini && o.showNames !== false) {
      ctx.font = '500 ' + (L.R < 200 ? 10 : 12) + 'px system-ui, "Noto Sans Arabic", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const c of (o.conLabels || [])) {
        if (Z < 1.8 && !c.major) continue;
        const q = pr(c.ra, c.dec); if (q[2] > 0.98 || (hemi === 'N' ? c.dec < -26 : c.dec > 26)) continue;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,8,20,.8)'; ctx.strokeText(c.fa, q[0], q[1]);
        ctx.fillStyle = P.name; ctx.fillText(c.fa, q[0], q[1]);
      }
    }

    if (!o.mini && Z >= 1.6 && o.starLabels) {
      ctx.font = '500 10px system-ui, "Noto Sans Arabic", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const t of o.starLabels) {
        if (t.mag > (Z >= 2.6 ? 3.2 : 2.4)) continue;
        const q = pr(t.ra, t.dec); if (q[2] > 0.98) continue;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,8,20,.8)'; ctx.strokeText(t.text, q[0] + 5, q[1] - 5);
        ctx.fillStyle = 'rgba(' + P.star + ',.9)'; ctx.fillText(t.text, q[0] + 5, q[1] - 5);
      }
    }

    // افق و سمت‌الرأس
    if (o.horizon && o.horizon.length > 8) {
      ctx.beginPath(); o.horizon.forEach((p, i) => { const q = pr(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
      ctx.strokeStyle = P.hor; ctx.lineWidth = o.mini ? 1 : 1.6; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (o.zenith) { const q = pr(o.zenith[0], o.zenith[1]); ctx.strokeStyle = P.hor; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q[0], q[1], o.mini ? 2 : 4, 0, 7); ctx.stroke(); if (!o.mini) { ctx.font = '11px system-ui, "Noto Sans Arabic", sans-serif'; ctx.fillStyle = P.hor; ctx.textAlign = 'center'; ctx.fillText('سمت‌الرأس', q[0], q[1] - 11); } }

    // اجرام منظومهٔ شمسی
    for (const b of (o.bodies || [])) {
      const q = pr(b.ra, b.dec), rr = b.type === 'sun' ? 5 : b.type === 'moon' ? 4.5 : 3.2;
      if (hemi === 'N' ? b.dec < -33 : b.dec > 33) continue;
      ctx.fillStyle = b.type === 'sun' ? '#ffe9a8' : b.type === 'moon' ? '#f2eedd' : P.body;
      ctx.beginPath(); ctx.arc(q[0], q[1], o.mini ? rr * 0.8 : rr, 0, 7); ctx.fill();
      if (!o.mini) { ctx.strokeStyle = P.body; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], rr + 3, 0, 7); ctx.stroke(); ctx.font = '600 11px system-ui, "Noto Sans Arabic", sans-serif'; ctx.fillStyle = P.body; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,8,20,.8)'; ctx.strokeText(b.fa, q[0], q[1] + rr + 13); ctx.fillText(b.fa, q[0], q[1] + rr + 13); }
    }

    // قطب سماوی (مرکز)
    ctx.strokeStyle = P.name; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L.cx - 4, L.cy); ctx.lineTo(L.cx + 4, L.cy); ctx.moveTo(L.cx, L.cy - 4); ctx.lineTo(L.cx, L.cy + 4); ctx.stroke();

    // هدف
    if (o.target) { const q = pr(o.target[0], o.target[1]); ctx.strokeStyle = '#' + (o.red ? 'ff7a62' : 'E6B94A'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(q[0], q[1], o.mini ? 4 : 8, 0, 7); ctx.stroke(); }

    // ناحیه‌ای که گوشی می‌بیند
    if (o.footprint && o.footprint.length > 3) {
      ctx.beginPath(); o.footprint.forEach((p, i) => { const q = pr(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
      ctx.fillStyle = 'rgba(' + P.foot + ',0.2)'; ctx.fill(); ctx.strokeStyle = 'rgb(' + P.foot + ')'; ctx.lineWidth = o.mini ? 1.4 : 2; ctx.stroke();
    }
    if (o.look) {
      const q = pr(o.look[0], o.look[1]), a = o.mini ? 4 : 7;
      ctx.strokeStyle = 'rgb(' + P.foot + ')'; ctx.lineWidth = o.mini ? 1.4 : 2;
      ctx.beginPath(); ctx.moveTo(q[0] - a, q[1]); ctx.lineTo(q[0] + a, q[1]); ctx.moveTo(q[0], q[1] - a); ctx.lineTo(q[0], q[1] + a); ctx.stroke();
    }
    ctx.restore();

    // حلقهٔ طلایی دوتایی و برچسب ساعت‌ها (بیرون از برش)
    ctx.strokeStyle = P.ring; ctx.lineWidth = o.mini ? 1.5 : 3; ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2); ctx.stroke();
    if (!o.mini) {
      ctx.strokeStyle = P.ringSoft; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R - 6, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '600 12px system-ui, "Noto Sans Arabic", sans-serif'; ctx.fillStyle = P.hour; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let hh = 0; hh < 24; hh += 2) { const q = project(hemi, { cx: L.cx, cy: L.cy, R: L.R + 16 }, hh * 15, hemi === 'N' ? -30 : 30); ctx.fillText(fa(hh) + 'h', q[0], q[1]); }
      ctx.font = '10px system-ui, "Noto Sans Arabic", sans-serif'; ctx.fillStyle = P.hour;
      decs.forEach(d => { const k = project(hemi, L, 0, d)[2]; ctx.fillText(fa(Math.abs(d)) + '°', L.cx + 12, L.cy - L.R * k + 1); });
    }
    return L;
  }

  return { draw, project, unproject, layout, SPAN };
});
