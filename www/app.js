(() => {
  'use strict';

  const M = window.CompassMath;
  const $ = (id) => document.getElementById(id);
  const RAD = Math.PI / 180;
  const KAABA = { lat: 21.4224779, lon: 39.8262006 };
  const TAU = 120;          // smoothing time constant, ms
  const ALIGN_ON = 3;       // degrees: facing Qibla
  const ALIGN_OFF = 5;      // degrees: hysteresis for leaving
  const DIRS = ['شمال', 'شمال شرقی', 'شرق', 'جنوب شرقی', 'جنوب', 'جنوب غربی', 'غرب', 'شمال غربی'];

  const toFa = (v) => String(v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const groupFa = (n) => toFa(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬');

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
  };

  const clampDecl = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(-40, Math.min(40, n)) : 0;
  };

  const state = {
    hasHeading: false,
    gotAbs: false,
    relSeen: 0,
    sx: 0, sy: 1,
    lastT: 0,
    shown: 0,
    lastDeg: -1,
    lastDelta: null,
    accuracy: null,
    lastHintT: 0,
    decl: clampDecl(store.get('decl', 0)),
    vibrate: store.get('vib', true) !== false,
    pos: store.get('pos', null),
    qibla: null,
    aligned: false,
    attached: false,
    fatal: false,
    watchdog: 0,
    statusTimer: 0
  };

  const el = {
    dial: $('dial'),
    degValue: $('degValue'),
    dirName: $('dirName'),
    status: $('status'),
    panel: $('panel'),
    qValue: $('qValue'),
    qGuide: $('qGuide'),
    qMeta: $('qMeta'),
    btnLocate: $('btnLocate'),
    overlay: $('overlay'),
    ovTitle: $('ovTitle'),
    ovText: $('ovText'),
    btnStart: $('btnStart'),
    btnInstall: $('btnInstall'),
    btnCalib: $('btnCalib'),
    btnSettings: $('btnSettings'),
    dlgSettings: $('dlgSettings'),
    dlgCalib: $('dlgCalib'),
    inDecl: $('inDecl'),
    inVib: $('inVib'),
    btnReset: $('btnReset')
  };

  /* ---------- Dial ---------- */

  function buildDial() {
    const parts = [];
    for (let d = 0; d < 360; d += 5) {
      if (d % 90 === 0) continue;
      const major = d % 30 === 0;
      const mid = d % 10 === 0;
      const len = major ? 14 : mid ? 9 : 5;
      const cls = major ? 'tk major' : mid ? 'tk mid' : 'tk';
      parts.push('<line class="' + cls + '" x1="0" y1="-188" x2="0" y2="' + (-188 + len) +
        '" transform="rotate(' + d + ')"/>');
    }
    for (let d = 30; d < 360; d += 30) {
      if (d % 90 === 0) continue;
      parts.push('<text class="num" text-anchor="middle" dominant-baseline="middle" transform="rotate(' +
        d + ') translate(0,-156)">' + toFa(d) + '</text>');
    }
    const cards = [['N', 0, 'card n'], ['E', 90, 'card'], ['S', 180, 'card'], ['W', 270, 'card']];
    cards.forEach((c) => {
      parts.push('<text class="' + c[2] + '" text-anchor="middle" dominant-baseline="middle" transform="rotate(' +
        c[1] + ') translate(0,-148)">' + c[0] + '</text>');
    });
    parts.push('<path class="north" d="M-9 -188 L9 -188 L0 -170 Z"/>');
    parts.push(
      '<g id="qibla" visibility="hidden">' +
        '<line class="q-line" x1="0" y1="-118" x2="0" y2="-178"/>' +
        '<g transform="translate(0,-104)">' +
          '<circle class="q-badge" r="13"/>' +
          '<rect class="q-glyph" x="-6" y="-6" width="12" height="12" rx="1"/>' +
          '<rect class="q-badge" x="-6" y="-2.5" width="12" height="1.8"/>' +
        '</g>' +
      '</g>'
    );
    el.dial.innerHTML = parts.join('');
  }

  /* ---------- Helpers ---------- */

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function showStatus(msg, ms) {
    el.status.textContent = msg;
    el.status.hidden = false;
    clearTimeout(state.statusTimer);
    if (ms) state.statusTimer = setTimeout(() => { el.status.hidden = true; }, ms);
  }

  function screenAngle() {
    let a = 0;
    if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number') {
      a = screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
      a = window.orientation;
    }
    return M.norm(a);
  }

  /* ---------- Sensor input ---------- */

  function ingest(h) {
    if (h === null || h === undefined || !Number.isFinite(h)) return;
    const t = performance.now();
    const r = h * RAD;
    if (!state.hasHeading) {
      state.sx = Math.sin(r);
      state.sy = Math.cos(r);
      state.hasHeading = true;
      onFirstReading();
    } else {
      const dt = Math.min(Math.max(t - state.lastT, 1), 200);
      const k = 1 - Math.exp(-dt / TAU);
      state.sx += (Math.sin(r) - state.sx) * k;
      state.sy += (Math.cos(r) - state.sy) * k;
    }
    state.lastT = t;
  }

  function onAbs(e) {
    if (e.alpha === null || e.alpha === undefined) return;
    state.gotAbs = true;
    ingest(M.headingFromEuler(e.alpha, e.beta, e.gamma, screenAngle()));
  }

  function onRel(e) {
    if (state.gotAbs) return;
    if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
      state.accuracy = typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : null;
      ingest(M.norm(e.webkitCompassHeading + screenAngle()));
      maybeHintCalibration();
      return;
    }
    if (e.alpha === null || e.alpha === undefined) return;
    if (e.absolute === true) {
      ingest(M.headingFromEuler(e.alpha, e.beta, e.gamma, screenAngle()));
    } else {
      state.relSeen++;
    }
  }

  function maybeHintCalibration() {
    const bad = state.accuracy !== null && (state.accuracy < 0 || state.accuracy > 25);
    const now = Date.now();
    if (bad && now - state.lastHintT > 30000) {
      state.lastHintT = now;
      showStatus('دقت سنسور پایین است. گوشی را به شکل ۸ بچرخانید.', 6000);
    }
  }

  function onFirstReading() {
    clearTimeout(state.watchdog);
    el.overlay.hidden = true;
    if (!store.get('calibSeen', false)) {
      store.set('calibSeen', true);
      showStatus('برای دقت بیشتر، گوشی را چند بار به شکل ۸ بچرخانید.', 8000);
    }
  }

  function attach() {
    if (state.attached) return;
    state.attached = true;
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', onAbs, true);
    }
    window.addEventListener('deviceorientation', onRel, true);
  }

  function showFailure(title, text, buttonLabel, fatal) {
    state.fatal = !!fatal;
    el.ovTitle.textContent = title;
    el.ovText.textContent = text;
    el.btnStart.textContent = buttonLabel || 'تلاش دوباره';
    el.overlay.hidden = false;
  }

  function armWatchdog() {
    clearTimeout(state.watchdog);
    state.watchdog = setTimeout(() => {
      if (state.hasHeading) return;
      if (state.relSeen > 0) {
        showFailure(
          'جهت مطلق در دسترس نیست',
          'این دستگاه فقط جهت نسبی می‌دهد؛ احتمالاً مغناطیس‌سنج ندارد یا غیرفعال است.'
        );
      } else {
        showFailure(
          'داده‌ای از سنسور نرسید',
          'اجازه «حسگرهای حرکتی» را برای این سایت یا برنامه بررسی کنید و دوباره امتحان کنید.'
        );
      }
    }, 3500);
  }

  let wakeLock = null;
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { wakeLock = null; }
  }

  async function start() {
    if (!window.isSecureContext) {
      showFailure('اتصال امن لازم است', 'قطب‌نما فقط روی HTTPS یا localhost کار می‌کند.', 'بستن', true);
      return;
    }
    if (!('DeviceOrientationEvent' in window)) {
      showFailure('سنسور پشتیبانی نمی‌شود', 'این مرورگر به سنسور جهت دسترسی نمی‌دهد. Chrome را امتحان کنید.', 'بستن', true);
      return;
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          showFailure('دسترسی رد شد', 'اجازه دسترسی به حرکت و جهت را بدهید. اگر پنجره دیگر نمایش داده نشد، مرورگر را کامل ببندید و دوباره باز کنید.');
          return;
        }
      }
    } catch (e) {
      showFailure('دسترسی ممکن نشد', 'درخواست دسترسی به سنسور با خطا روبه‌رو شد. دوباره امتحان کنید.');
      return;
    }
    el.overlay.hidden = true;
    attach();
    keepAwake();
    armWatchdog();
  }

  /* ---------- Rendering ---------- */

  function updateReadout(deg) {
    setText(el.degValue, toFa(deg));
    setText(el.dirName, DIRS[Math.round(deg / 45) % 8]);
  }

  function updateQiblaGuide(trueH) {
    if (state.qibla === null) return;
    const delta = M.signedDiff(state.qibla, trueH);
    const abs = Math.abs(delta);
    const rounded = Math.round(delta);
    if (rounded === state.lastDelta) return;
    state.lastDelta = rounded;

    const wasAligned = state.aligned;
    state.aligned = wasAligned ? abs <= ALIGN_OFF : abs <= ALIGN_ON;
    el.panel.classList.toggle('aligned', state.aligned);

    if (state.aligned) {
      setText(el.qGuide, 'رو به قبله هستید');
      if (!wasAligned && state.vibrate && navigator.vibrate) {
        try { navigator.vibrate(40); } catch (e) { /* ignore */ }
      }
    } else {
      setText(el.qGuide, toFa(Math.round(abs)) + ' درجه به ' + (delta > 0 ? 'راست' : 'چپ') + ' بچرخید');
    }
  }

  function frame() {
    if (state.hasHeading) {
      const mag = Math.atan2(state.sx, state.sy) / RAD;
      const trueH = M.norm(mag + state.decl);
      const diff = M.signedDiff(trueH, M.norm(state.shown));
      state.shown += Math.abs(diff) < 0.05 ? diff : diff * 0.5;
      if (Math.abs(state.shown) > 720) state.shown = M.norm(state.shown);
      el.dial.setAttribute('transform', 'rotate(' + (-state.shown).toFixed(2) + ')');

      const deg = Math.round(trueH) % 360;
      if (deg !== state.lastDeg) {
        state.lastDeg = deg;
        updateReadout(deg);
      }
      updateQiblaGuide(trueH);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Qibla and location ---------- */

  function applyPosition() {
    const qEl = document.getElementById('qibla');
    if (!state.pos) {
      state.qibla = null;
      if (qEl) qEl.setAttribute('visibility', 'hidden');
      return;
    }
    const km = M.distanceKm(state.pos.lat, state.pos.lon, KAABA.lat, KAABA.lon);
    if (km < 0.2) {
      state.qibla = null;
      if (qEl) qEl.setAttribute('visibility', 'hidden');
      setText(el.qValue, '--');
      setText(el.qGuide, 'شما در مسجدالحرام هستید.');
      el.qMeta.hidden = true;
      return;
    }
    state.qibla = M.bearingTo(state.pos.lat, state.pos.lon, KAABA.lat, KAABA.lon);
    state.lastDelta = null;
    if (qEl) {
      qEl.setAttribute('transform', 'rotate(' + state.qibla.toFixed(2) + ')');
      qEl.setAttribute('visibility', 'visible');
    }
    setText(el.qValue, toFa(Math.round(state.qibla)) + '°');
    setText(el.qMeta, 'فاصله تا کعبه: ' + groupFa(km) + ' کیلومتر');
    el.qMeta.hidden = false;
    setText(el.qGuide, 'گوشی را بچرخانید تا نشان طلایی بالا قرار بگیرد.');
    setText(el.btnLocate, 'به‌روزرسانی موقعیت');
  }

  function locate() {
    if (!('geolocation' in navigator)) {
      showStatus('این دستگاه موقعیت‌یابی را پشتیبانی نمی‌کند.', 6000);
      return;
    }
    el.btnLocate.disabled = true;
    el.btnLocate.textContent = 'در حال تعیین موقعیت…';
    navigator.geolocation.getCurrentPosition(onPosition, onPositionError, {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 600000
    });
  }

  function restoreLocateButton() {
    el.btnLocate.disabled = false;
    el.btnLocate.textContent = state.pos ? 'به‌روزرسانی موقعیت' : 'تعیین موقعیت من';
  }

  function onPosition(p) {
    state.pos = { lat: p.coords.latitude, lon: p.coords.longitude };
    store.set('pos', state.pos);
    restoreLocateButton();
    applyPosition();
  }

  function onPositionError(err) {
    restoreLocateButton();
    const messages = {
      1: 'دسترسی به موقعیت مکانی مجاز نیست. آن را در تنظیمات مرورگر یا برنامه فعال کنید.',
      2: 'موقعیت در دسترس نیست. GPS یا اینترنت را بررسی کنید.',
      3: 'دریافت موقعیت بیش از حد طول کشید. دوباره امتحان کنید.'
    };
    showStatus(messages[err && err.code] || 'تعیین موقعیت انجام نشد.', 7000);
  }

  /* ---------- Settings and dialogs ---------- */

  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function syncSettingsUi() {
    el.inDecl.value = String(state.decl);
    el.inVib.checked = state.vibrate;
  }

  el.inDecl.addEventListener('change', () => {
    state.decl = clampDecl(el.inDecl.value);
    el.inDecl.value = String(state.decl);
    store.set('decl', state.decl);
    state.lastDelta = null;
  });

  el.inVib.addEventListener('change', () => {
    state.vibrate = el.inVib.checked;
    store.set('vib', state.vibrate);
  });

  el.btnReset.addEventListener('click', () => {
    state.decl = 0;
    state.vibrate = true;
    store.set('decl', 0);
    store.set('vib', true);
    state.lastDelta = null;
    syncSettingsUi();
  });

  el.btnSettings.addEventListener('click', () => { syncSettingsUi(); openDialog(el.dlgSettings); });
  el.btnCalib.addEventListener('click', () => openDialog(el.dlgCalib));
  el.btnLocate.addEventListener('click', locate);
  el.btnStart.addEventListener('click', () => {
    if (state.fatal) {
      el.overlay.hidden = true;
    } else {
      start();
    }
  });

  /* ---------- Install, lifecycle, service worker ---------- */

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    el.btnInstall.hidden = false;
  });
  el.btnInstall.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
    deferredPrompt = null;
    el.btnInstall.hidden = true;
  });
  window.addEventListener('appinstalled', () => { el.btnInstall.hidden = true; });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.attached) keepAwake();
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline cache is optional */ });
    });
  }

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const anim = document.querySelector('#dlgCalib animateMotion');
    if (anim) anim.remove();
  }

  /* ---------- Boot ---------- */

  buildDial();
  syncSettingsUi();
  applyPosition();
  requestAnimationFrame(frame);

  const needsGesture = typeof window.DeviceOrientationEvent !== 'undefined' &&
    typeof window.DeviceOrientationEvent.requestPermission === 'function';

  if (needsGesture) {
    el.overlay.hidden = false;
  } else {
    start();
  }
})();
