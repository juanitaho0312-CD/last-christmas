(function () {
  const STOPS = window.LC_STOPS, CH = window.LC_CHAPTERS, MEDIA = window.LC_MEDIA || {}, ROUTE = window.LC_ROUTE;
  const chById = Object.fromEntries(CH.map(c => [c.id, c]));
  const MODE = {
    air: { label: '飛機', icon: '✈', color: '#9fb4d6', style: { weight: 1.6, dashArray: '6 7', opacity: 0.85 } },
    bus: { label: '巴士', icon: '🚌', color: '#e07a5f', style: { weight: 3, opacity: 0.95 } },
    boat: { label: '峽灣遊船', icon: '⛴', color: '#7fc8c0', style: { weight: 3.5, dashArray: '1 7', lineCap: 'round', opacity: 1 } },
    rail: { label: '火車', icon: '🚆', color: '#e8c26a', style: { weight: 3, opacity: 0.95 } },
    walk: { label: '停留', icon: '●', color: '#c9a0dc', style: { weight: 1.5, opacity: 0.7 } },
  };
  const MOOD = { tpe: 'lyric', ist: 'silent', fly1: 'lyric', oldtown: 'joy', ga: 'silent', night: 'sacred', sea: 'lyric', fly2: 'silent', bgnight: 'silent',
    bryggen: 'joy', bus: 'silent', fjord: 'silent', flam: 'silent', nighttrain: 'lyric', oslo: 'joy', street: 'joy', maps: 'silent', deichman: 'lyric', folk: 'silent',
    fram: 'silent', viking: 'sacred', ensjo: 'lyric', barcode: 'silent', natmus: 'silent', home: 'lyric' };
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- map ----------
  const map = L.map('map', { zoomControl: false, worldCopyJump: true, minZoom: 2, zoomSnap: 0.5 }).setView([52, 40], 3);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
  }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, maxNativeZoom: 16, opacity: 0.75,
  }).addTo(map);

  function arc(a, b) {
    const n = 48, out = [], dLat = b[0] - a[0], dLng = b[1] - a[1], dist = Math.hypot(dLat, dLng);
    const bend = Math.min(9, dist * 0.16);
    for (let i = 0; i <= n; i++) { const t = i / n; out.push([a[0] + dLat * t + Math.sin(Math.PI * t) * bend, a[1] + dLng * t]); }
    return out;
  }
  ROUTE.forEach(seg => {
    const m = MODE[seg.mode], pts = seg.arc ? arc(seg.pts[0], seg.pts[1]) : seg.pts;
    if (seg.mode === 'rail') L.polyline(pts, { color: '#0a1322', weight: 6, opacity: 0.9, interactive: false }).addTo(map);
    L.polyline(pts, Object.assign({ color: m.color, interactive: false, className: seg.mode === 'walk' || seg.mode === 'air' ? '' : 'route-glow' }, m.style)).addTo(map);
  });

  const markers = {};
  let placeNo = 0;
  STOPS.forEach((s, i) => {
    const c = chById[s.ch].color, transit = s.kind === 'transit';
    const inner = transit ? `<em>${MODE[s.mode].icon}</em>` : String(++placeNo);
    const icon = L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<div class="mk ${transit ? 'transit' : ''}" style="--c:${c}" data-id="${s.id}"><div class="mk-dot">${inner}</div></div>` });
    const mk = L.marker(s.at, { icon, keyboard: true, title: s.title, zIndexOffset: transit ? 0 : 100 }).addTo(map);
    mk.bindTooltip(`${s.day}　${s.title}`, { className: 'tip', direction: 'top', offset: [0, -12] });
    mk.on('click', () => { stopTour(); openStop(i, true); });
    markers[s.id] = mk;
  });
  const mkEl = id => markers[id].getElement() && markers[id].getElement().querySelector('.mk');

  // ---------- chapters & days ----------
  let activeCh = null;
  const chipBox = $('chapters');
  CH.forEach(c => {
    const n = STOPS.filter(s => s.ch === c.id).length;
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.dataset.ch = c.id;
    b.innerHTML = `<i style="background:${c.color}"></i>${c.name}<span>${n}</span>`;
    b.onclick = () => setChapter(activeCh === c.id ? null : c.id);
    chipBox.appendChild(b);
  });
  function setChapter(id) {
    activeCh = id; stopTour();
    chipBox.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.ch === id));
    STOPS.forEach(s => { const el = mkEl(s.id); if (el) el.classList.toggle('dim', !!id && s.ch !== id); });
    const pts = STOPS.filter(s => !id || s.ch === id).map(s => s.at);
    map.flyToBounds(L.latLngBounds(pts).pad(0.25), { duration: reduce ? 0 : 1.4, maxZoom: 14 });
  }
  const dayBox = $('days');
  window.LC_DAYS.forEach(d => {
    const b = document.createElement('button');
    b.className = 'day'; b.type = 'button'; b.dataset.d = d.d;
    b.innerHTML = `<b>${d.d}</b><span>${d.label}</span>`;
    b.onclick = () => {
      stopTour();
      let i = STOPS.findIndex(s => s.day === d.d);
      if (i < 0) i = STOPS.length - 1; // 12/6：回程抵達
      openStop(i, true);
    };
    dayBox.appendChild(b);
  });
  function markDay(day) { dayBox.querySelectorAll('.day').forEach(b => b.classList.toggle('on', b.dataset.d === day)); }

  // ---------- postcard ----------
  const card = $('card'), stage = $('stageMedia');
  let cur = -1, mi = 0, items = [], seq = [], sp = 0, userSound = false, auto = true, slideTimer = null, progRaf = null, touring = false, tourToken = 0;
  const PHOTO_MS = 4200;

  function openStop(i, fly) {
    cur = i; const s = STOPS[i];
    items = MEDIA[s.id] || [];
    seq = tourSeq(); sp = 0;
    window.LC_MUSIC.setMood(MOOD[s.id] || 'silent');
    Object.keys(markers).forEach(id => { const el = mkEl(id); if (el) el.classList.toggle('active', id === s.id); });
    markDay(s.day);
    $('cMode').textContent = s.kind === 'transit' ? `移動中 · ${MODE[s.mode].label}` : chById[s.ch].name;
    $('cDate').textContent = s.day.replace('/', ' 月 ') + ' 日';
    $('capDate').textContent = s.day; $('capTitle').textContent = s.title;
    $('cTitle').textContent = s.title; $('cSub').textContent = s.sub; $('cBody').textContent = s.body;
    $('sPrev').disabled = i === 0; $('sNext').disabled = i === STOPS.length - 1;
    const th = $('thumbs'); th.innerHTML = '';
    items.forEach((it, k) => {
      const b = document.createElement('button');
      b.className = 'thumb' + (it.t === 'v' ? ' v' : ''); b.type = 'button';
      b.setAttribute('aria-label', (it.t === 'v' ? '影片 ' : '照片 ') + (k + 1));
      b.innerHTML = `<img loading="lazy" alt="" src="${it.t === 'v' ? it.poster : it.src}">`;
      b.onclick = () => { setAuto(false); show(k); };
      th.appendChild(b);
    });
    const go = () => { card.hidden = false; show(0); };
    stage.innerHTML = '';
    if (fly) { card.hidden = true; map.flyTo(s.at, s.zoom, { duration: reduce ? 0 : 1.8 }); setTimeout(go, reduce ? 0 : 1500); }
    else go();
  }
  // 自動播放旅程時每站挑 8 個：開頭、所有有原聲的影片，其餘平均取樣
  function tourSeq() {
    const n = items.length, set = new Set([0]);
    items.forEach((it, k) => { if (it.s) set.add(k); });
    const want = Math.min(n, 8);
    for (let j = 0; j < want; j++) set.add(Math.round(j * (n - 1) / Math.max(1, want - 1)));
    return [...set].filter(k => k < n).sort((a, b) => a - b);
  }
  function show(k) {
    clearTimeout(slideTimer); cancelAnimationFrame(progRaf);
    if (!items.length) { stage.innerHTML = ''; $('mWhen').textContent = ''; $('mCount').textContent = '這一站沒有素材'; return; }
    mi = (k + items.length) % items.length; const it = items[mi];
    [...stage.children].forEach(el => { el.classList.remove('show'); setTimeout(() => el.remove(), 950); });
    const bg = new Image(); bg.className = 'blur'; bg.alt = ''; bg.src = it.t === 'v' ? it.poster : it.src; stage.appendChild(bg);
    let el;
    if (it.t === 'v') {
      el = document.createElement('video');
      const snd = !!it.s || userSound;
      Object.assign(el, { src: it.src, poster: it.poster, muted: !snd, loop: !auto, playsInline: true });
      el.setAttribute('playsinline', '');
      el.play().catch(() => { el.muted = true; el.play().catch(() => {}); window.LC_MUSIC.duck(false); });
      window.LC_MUSIC.duck(snd);
      $('mSound').hidden = false; $('mSound').textContent = snd ? '🔊 原聲' : '🔇 原聲'; $('mSound').setAttribute('aria-pressed', String(snd));
    } else {
      window.LC_MUSIC.duck(false); $('mSound').hidden = true;
      el = new Image(); el.alt = STOPS[cur].title; el.src = it.src;
      if (!reduce) { el.classList.add('kb'); el.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2) + '%'); el.style.setProperty('--dy', (Math.random() * 2 - 1).toFixed(2) + '%'); }
    }
    stage.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { bg.classList.add('show'); el.classList.add('show'); }));
    $('mWhen').textContent = it.when; $('mCount').textContent = `${mi + 1} / ${items.length}`;
    [...$('thumbs').children].forEach((b, n) => b.classList.toggle('on', n === mi));
    const on = $('thumbs').children[mi]; if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    schedule(it, el);
  }
  function schedule(it, el) {
    const bar = $('mProg'); bar.style.width = '0';
    if (!auto) return;
    const run = ms => {
      const t0 = performance.now();
      const step = now => { const p = Math.min(1, (now - t0) / ms); bar.style.width = p * 100 + '%'; if (p < 1) progRaf = requestAnimationFrame(step); };
      progRaf = requestAnimationFrame(step);
      slideTimer = setTimeout(advance, ms);
    };
    if (it.t === 'v') {
      let started = false;
      const begin = () => { if (started) return; started = true; run(Math.min(it.s ? 200000 : 9500, Math.max(3000, (el.duration || 8) * 1000))); };
      el.addEventListener('loadedmetadata', begin); setTimeout(begin, 2500);
    } else run(PHOTO_MS);
  }
  function advance() {
    if (touring) { sp++; if (sp >= seq.length) return tourNext(); return show(seq[sp]); }
    show(mi + 1);
  }
  function setAuto(v) { auto = v; $('sAuto').setAttribute('aria-pressed', String(v)); if (!v) { clearTimeout(slideTimer); cancelAnimationFrame(progRaf); $('mProg').style.width = '0'; } }
  function closeCard() { card.hidden = true; clearTimeout(slideTimer); cancelAnimationFrame(progRaf); stage.innerHTML = ''; window.LC_MUSIC.duck(false); stopTour(); }

  $('mPrev').onclick = () => { setAuto(false); stopTour(); show(mi - 1); };
  $('mNext').onclick = () => { setAuto(false); stopTour(); show(mi + 1); };
  $('sPrev').onclick = () => { stopTour(); if (cur > 0) openStop(cur - 1, true); };
  $('sNext').onclick = () => { stopTour(); if (cur < STOPS.length - 1) openStop(cur + 1, true); };
  $('sAuto').onclick = () => { setAuto(!auto); if (auto) show(mi); };
  $('mSound').onclick = () => {
    const v = stage.querySelector('video'); if (!v) return;
    userSound = v.muted; v.muted = !userSound; window.LC_MUSIC.duck(userSound);
    $('mSound').textContent = userSound ? '🔊 原聲' : '🔇 原聲'; $('mSound').setAttribute('aria-pressed', String(userSound));
  };
  function setMenu(v) { card.classList.toggle('menu', v); $('menuBtn').setAttribute('aria-expanded', String(v)); }
  $('menuBtn').onclick = () => setMenu(!card.classList.contains('menu'));
  $('stageMedia').addEventListener('click', () => setMenu(false));
  $('cardClose').onclick = closeCard;
  card.addEventListener('click', e => { if (e.target === card) closeCard(); });
  document.addEventListener('keydown', e => {
    if (card.hidden) return;
    if (e.key === 'Escape') { if (card.classList.contains('menu')) setMenu(false); else closeCard(); }
    if (e.key === 'ArrowRight') $('mNext').click();
    if (e.key === 'ArrowLeft') $('mPrev').click();
  });

  // ---------- tour ----------
  function startTour(from) {
    if (activeCh) setChapter(null);
    touring = true; setAuto(true);
    $('btnTour').textContent = '■ 停止播放';
    openStop(from || 0, true);
  }
  function tourNext() {
    if (!touring) return;
    if (cur >= STOPS.length - 1) { stopTour(); closeCard(); map.flyToBounds(L.latLngBounds(STOPS.slice(3).map(s => s.at)).pad(0.2), { duration: 2 }); return; }
    openStop(cur + 1, true);
  }
  function stopTour() { if (!touring) return; touring = false; $('btnTour').textContent = '▶ 播放旅程'; }
  $('btnTour').onclick = () => { if (touring) { stopTour(); setAuto(false); } else startTour(cur >= 0 && cur < STOPS.length - 1 ? cur : 0); };

  // ---------- music ----------
  function setMusic(v) { v ? window.LC_MUSIC.start() : window.LC_MUSIC.stop(); $('btnMusic').setAttribute('aria-pressed', String(v)); $('btnMusic').textContent = v ? '♪ 音樂開' : '♪ 音樂'; }
  $('btnMusic').onclick = () => setMusic(!window.LC_MUSIC.on);

  // ---------- intro ----------
  const all = Object.values(MEDIA).flat();
  $('statS').textContent = STOPS.length; $('statP').textContent = all.filter(x => x.t === 'p').length; $('statV').textContent = all.filter(x => x.t === 'v').length;
  function leaveIntro() { $('intro').classList.add('gone'); setMusic(true); }
  $('introTour').onclick = () => { leaveIntro(); setTimeout(() => startTour(0), 600); };
  $('introFree').onclick = () => { leaveIntro(); map.flyToBounds(L.latLngBounds(STOPS.slice(3, -1).map(s => s.at)).pad(0.2), { duration: reduce ? 0 : 2.5 }); };

  // ---------- snow ----------
  const cv = $('snow'), g = cv.getContext('2d'); let flakes = [];
  function size() { cv.width = innerWidth; cv.height = innerHeight; flakes = Array.from({ length: Math.round(innerWidth / 14) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 1.8 + 0.4, v: Math.random() * 0.5 + 0.2, p: Math.random() * 6.28 })); }
  function snow() {
    g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const f of flakes) { f.y += f.v; f.p += 0.01; f.x += Math.sin(f.p) * 0.3; if (f.y > cv.height + 4) { f.y = -4; f.x = Math.random() * cv.width; } g.globalAlpha = 0.25 + f.r / 3; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 6.28); g.fill(); }
    requestAnimationFrame(snow);
  }
  size(); addEventListener('resize', size); if (!reduce) snow();
})();
