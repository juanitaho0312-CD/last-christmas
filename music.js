// 配樂引擎：四種情緒，以 Web Audio 即時合成。
//   silent ─ 〈平安夜〉鋼琴與弦樂（公有領域曲，主要配樂）
//   sacred ─ 〈平安夜〉管風琴與合唱式長音（夜晚、神聖）
//   joy    ─ 〈Jingle Bells〉搖擺節奏：鋼琴、雪橇鈴、鼓（公有領域曲，歡樂段落）
//   lyric  ─ 原創旋律的 80 年代合成器抒情曲風（抒情段落）
// 想用自己擁有的音檔：放進 site 資料夾並命名為 bgm_silent.mp3 / bgm_sacred.mp3 / bgm_joy.mp3 / bgm_lyric.mp3，
// 有檔案的情緒會改播檔案。
(function () {
  let ctx, master, wetIn, on = false, mood = 'silent', timer = null, nextBar = 0, bar = 0, bus = null, ducked = false;
  const files = {}; let probed = false, fileNow = null;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const LEVEL = 0.85, DUCK = 0.12;

  // ---------- instruments ----------
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0006, t + a + d); }
  function piano(out, t, m, len, vel) {
    const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900 + vel * 5200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 1.6);
    const d = Math.max(0.5, (2.6 - (m - 48) * 0.028) * (0.6 + len * 0.35));
    env(g, t, 0.005, vel, d); lp.connect(g).connect(out);
    [[1, 1, 'triangle'], [2.001, 0.42, 'sine'], [3.004, 0.16, 'sine'], [4.01, 0.07, 'sine']].forEach(([k, a, type]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f * k; og.gain.value = a;
      o.connect(og).connect(lp); o.start(t); o.stop(t + d + 0.1);
    });
  }
  function strings(out, t, notes, len, gain, bright) {
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = bright || 1500; lp.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.7, len * 0.4));
    g.gain.setValueAtTime(gain, t + len - 0.25); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.7);
    lp.connect(g).connect(out);
    notes.forEach(m => [-7, 6].forEach(c => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = c; const og = ctx.createGain(); og.gain.value = 0.22; o.connect(og).connect(lp); o.start(t); o.stop(t + len + 0.8); }));
  }
  function organ(out, t, m, len, gain) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.12); g.gain.setValueAtTime(gain, t + len - 0.1); g.gain.linearRampToValueAtTime(0.0001, t + len + 0.5); g.connect(out);
    [[0.5, 0.5], [1, 1], [2, 0.5], [3, 0.2], [4, 0.14]].forEach(([k, a]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m) * k; og.gain.value = a; o.connect(og).connect(g); o.start(t); o.stop(t + len + 0.6); });
  }
  function bell(out, t, m, gain) {
    const g = ctx.createGain(); env(g, t, 0.004, gain, 1.6); g.connect(out);
    [[1, 1], [2.76, 0.3], [5.4, 0.1]].forEach(([k, a]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m) * k; og.gain.value = a; o.connect(og).connect(g); o.start(t); o.stop(t + 1.8); });
  }
  function synth(out, t, m, len, gain, type, cut) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = o2.type = type || 'sawtooth'; o.frequency.value = o2.frequency.value = hz(m); o2.detune.value = 9;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(cut || 2200, t); lp.frequency.exponentialRampToValueAtTime(500, t + len + 0.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + len + 0.25);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(out); o.start(t); o2.start(t); o.stop(t + len + 0.3); o2.stop(t + len + 0.3);
  }
  function noise(out, t, dur, gain, type, freq, q) {
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q || 1; g.gain.value = gain;
    s.connect(f).connect(g).connect(out); s.start(t);
  }
  const sleigh = (o, t, g) => noise(o, t, 0.09, g, 'bandpass', 7400, 3);
  const hat = (o, t, g) => noise(o, t, 0.04, g, 'highpass', 8000);
  const snare = (o, t, g, long) => { noise(o, t, long ? 0.32 : 0.16, g, 'bandpass', 1900, 0.7); synth(o, t, 50, 0.08, g * 0.5, 'triangle', 900); };
  function kick(out, t, gain) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g).connect(out); o.start(t); o.stop(t + 0.25); }

  // ---------- scores ----------
  const CH = { C: [36, 60, 64, 67], G: [43, 59, 62, 67], G7: [43, 59, 62, 65], F: [41, 60, 65, 69], Am: [45, 60, 64, 69], Dm: [38, 62, 65, 69], D7: [38, 60, 62, 66] };
  const ph = (a, b, c) => [[0, a, 1.5], [1.5, b, 0.5], [2, c, 1]];
  const hold = (a, b) => [[0, a, 2], [2, b, 1]];
  const SILENT = [ // Stille Nacht (1818), C major, 3/4
    ['C', ph(67, 69, 67)], ['C', [[0, 64, 3]]], ['C', ph(67, 69, 67)], ['C', [[0, 64, 3]]],
    ['G', hold(74, 74)], ['G7', [[0, 71, 3]]], ['C', hold(72, 72)], ['C', [[0, 67, 3]]],
    ['F', hold(69, 69)], ['F', ph(72, 71, 69)], ['C', ph(67, 69, 67)], ['C', [[0, 64, 3]]],
    ['F', hold(69, 69)], ['F', ph(72, 71, 69)], ['C', ph(67, 69, 67)], ['C', [[0, 64, 3]]],
    ['G', hold(74, 74)], ['G7', ph(77, 74, 71)], ['C', [[0, 72, 3]]], ['Am', [[0, 76, 3]]],
    ['C', [[0, 72, 1], [1, 67, 1], [2, 64, 1]]], ['G7', ph(67, 65, 62)], ['C', [[0, 60, 3]]], ['C', []],
  ];
  const q4 = (...n) => n.map((m, i) => [i, m, 1]);
  const JB_CHORUS = [
    ['C', [[0, 76, 1], [1, 76, 1], [2, 76, 2]]], ['C', [[0, 76, 1], [1, 76, 1], [2, 76, 2]]], ['C', [[0, 76, 1], [1, 79, 1], [2, 72, 1.5], [3.5, 74, 0.5]]], ['C', [[0, 76, 4]]],
    ['F', [[0, 77, 1], [1, 77, 1], [2, 77, 1.5], [3.5, 77, 0.5]]], ['C', [[0, 77, 1], [1, 76, 1], [2, 76, 1], [3, 76, 0.5], [3.5, 76, 0.5]]], ['D7', q4(76, 74, 74, 76)], ['G7', [[0, 74, 2], [2, 79, 2]]],
    ['C', [[0, 76, 1], [1, 76, 1], [2, 76, 2]]], ['C', [[0, 76, 1], [1, 76, 1], [2, 76, 2]]], ['C', [[0, 76, 1], [1, 79, 1], [2, 72, 1.5], [3.5, 74, 0.5]]], ['C', [[0, 76, 4]]],
    ['F', [[0, 77, 1], [1, 77, 1], [2, 77, 1.5], [3.5, 77, 0.5]]], ['C', [[0, 77, 1], [1, 76, 1], [2, 76, 1], [3, 76, 0.5], [3.5, 76, 0.5]]], ['G7', q4(79, 79, 77, 74)], ['C', [[0, 72, 4]]],
  ];
  const JB_VERSE = [
    ['C', q4(67, 76, 74, 72)], ['C', [[0, 67, 3], [3, 67, 0.5], [3.5, 67, 0.5]]], ['C', q4(67, 76, 74, 72)], ['F', [[0, 69, 4]]],
    ['F', q4(69, 77, 76, 74)], ['G', [[0, 71, 4]]], ['G7', q4(79, 79, 77, 74)], ['C', [[0, 76, 4]]],
    ['C', q4(67, 76, 74, 72)], ['C', [[0, 67, 4]]], ['C', q4(67, 76, 74, 72)], ['F', [[0, 69, 3], [3, 69, 1]]],
    ['F', q4(69, 77, 76, 74)], ['C', q4(79, 79, 79, 79)], ['G7', q4(81, 79, 77, 74)], ['C', [[0, 72, 2], [2, 79, 2]]],
  ];
  const JOY = [...JB_CHORUS, ...JB_VERSE, ...JB_CHORUS];
  const LYRIC = [ // 原創旋律，C–Am–Dm–G
    ['C', [[0.5, 67, 0.5], [1, 72, 1], [2, 71, 0.5], [2.5, 72, 1.5]]], ['Am', [[0.5, 69, 0.5], [1, 72, 1], [2, 76, 1.5], [3.5, 74, 0.5]]],
    ['Dm', [[0, 74, 1.5], [1.5, 72, 0.5], [2, 69, 1], [3, 65, 1]]], ['G', [[0, 67, 2.5], [3, 67, 0.5], [3.5, 69, 0.5]]],
    ['C', [[0, 72, 1], [1, 76, 1], [2, 79, 1.5], [3.5, 76, 0.5]]], ['Am', [[0, 76, 1], [1, 72, 0.5], [1.5, 69, 1.5], [3, 72, 1]]],
    ['Dm', [[0, 77, 1], [1, 76, 0.5], [1.5, 74, 1], [2.5, 72, 0.5], [3, 74, 1]]], ['G', [[0, 71, 1.5], [1.5, 67, 2.5]]],
  ];

  const MOODS = {
    silent: { bpm: 69, beats: 3, len: SILENT.length, play(o, t, i, B) {
      const [cn, mel] = SILENT[i % 24], c = CH[cn], pass = Math.floor(i / 24) % 2;
      strings(o, t, [c[0] + 12, c[1], c[2], c[3]], B * 3, 0.05 + pass * 0.02, 1300);
      piano(o, t, c[0], 3, 0.16);
      [c[1], c[3], c[2] + 12, c[3], c[2] + 12, c[3]].forEach((m, k) => piano(o, t + k * B / 2, m - 12, 0.6, k ? 0.05 : 0.07));
      mel.forEach(([b, m, l]) => { piano(o, t + b * B, m, l, 0.2); if (pass) { strings(o, t + b * B, [m + 12], l * B, 0.05, 2400); piano(o, t + b * B, m + 12, l, 0.07); } });
    } },
    sacred: { bpm: 60, beats: 3, len: SILENT.length, play(o, t, i, B) {
      const [cn, mel] = SILENT[i % 24], c = CH[cn];
      organ(o, t, c[0] + 12, B * 3, 0.07); strings(o, t, [c[1], c[2], c[3], c[1] + 12], B * 3, 0.07, 1000);
      mel.forEach(([b, m, l]) => { organ(o, t + b * B, m, l * B, 0.085); strings(o, t + b * B, [m], l * B, 0.04, 1800); });
      if (i % 4 === 0) bell(o, t, c[3] + 12, 0.05);
    } },
    joy: { bpm: 126, beats: 4, len: JOY.length, play(o, t, i, B) {
      const [cn, mel] = JOY[i % JOY.length], c = CH[cn], sw = B * 0.64;
      for (let k = 0; k < 4; k++) {
        const bt = t + k * B;
        sleigh(o, bt, 0.03); sleigh(o, bt + sw, 0.018);
        if (k % 2 === 0) kick(o, bt, 0.34); else snare(o, bt, 0.1);
        synth(o, bt, [c[0], c[0] + 7, c[0] + 12, c[0] + 7][k], B * 0.7, 0.16, 'triangle', 500);
        [c[1], c[2], c[3]].forEach(m => piano(o, bt + sw, m, 0.3, 0.06));
      }
      strings(o, t, [c[1], c[2], c[3]], B * 4, 0.028, 1800);
      mel.forEach(([b, m, l]) => { const tt = t + Math.floor(b) * B + (b % 1 ? sw : 0); piano(o, tt, m, l, 0.2); bell(o, tt, m + 12, 0.05); });
    } },
    lyric: { bpm: 106, beats: 4, len: LYRIC.length, play(o, t, i, B) {
      const [cn, mel] = LYRIC[i % 8], c = CH[cn], pass = Math.floor(i / 8);
      strings(o, t, [c[1], c[2], c[3], c[1] + 12], B * 4, 0.06, 1700);
      for (let k = 0; k < 8; k++) {
        const bt = t + k * B / 2;
        synth(o, bt, c[0], B * 0.42, 0.13, 'sawtooth', 420);
        synth(o, bt, [c[1], c[2], c[3], c[2]][k % 4] + 12, B * 0.3, 0.035, 'square', 2600);
        hat(o, bt, k % 2 ? 0.012 : 0.02); sleigh(o, bt, 0.008);
      }
      kick(o, t, 0.32); kick(o, t + B * 2, 0.32); kick(o, t + B * 2.5, 0.2); snare(o, t + B, 0.12, true); snare(o, t + B * 3, 0.12, true);
      if (pass % 4 !== 3) mel.forEach(([b, m, l]) => { synth(o, t + b * B, m, l * B * 0.9, 0.085, 'sawtooth', 3000); bell(o, t + b * B, m + 12, 0.03); });
    } },
  };

  // ---------- transport ----------
  function build(c) {
    ctx = c || new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = LEVEL;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    wetIn = ctx.createGain();
    const d1 = ctx.createDelay(1), d2 = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
    d1.delayTime.value = 0.23; d2.delayTime.value = 0.37; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 2600; wet.gain.value = 0.3;
    wetIn.connect(d1); wetIn.connect(d2); d1.connect(lp); d2.connect(lp); lp.connect(fb).connect(d1); lp.connect(wet).connect(master);
    master.connect(comp).connect(ctx.destination);
  }
  function tick() {
    const M = MOODS[mood], B = 60 / M.bpm;
    while (nextBar < ctx.currentTime + 0.5) { M.play(bus, nextBar, bar++, B); nextBar += B * M.beats; }
  }
  function startMood() {
    clearInterval(timer); timer = null;
    if (bus) { const old = bus; old.gain.cancelScheduledValues(ctx.currentTime); old.gain.setValueAtTime(old.gain.value, ctx.currentTime); old.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2); setTimeout(() => old.disconnect(), 4000); bus = null; }
    if (fileNow) { const a = fileNow; fileNow = null; fade(a, 0, () => a.pause()); }
    if (!on) return;
    if (files[mood]) { fileNow = files[mood]; fileNow.volume = 0; fileNow.play().catch(() => {}); fade(fileNow, ducked ? 0.08 : 0.6); return; }
    bus = ctx.createGain(); bus.gain.setValueAtTime(0, ctx.currentTime); bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.4);
    bus.connect(master); bus.connect(wetIn);
    bar = 0; nextBar = ctx.currentTime + 0.35; tick(); timer = setInterval(tick, 120);
  }
  function fade(a, to, done) { const from = a.volume, t0 = performance.now(); (function f(now) { const p = Math.min(1, (now - t0) / 900); a.volume = from + (to - from) * p; if (p < 1) requestAnimationFrame(f); else if (done) done(); })(t0); }
  async function probe() {
    if (probed) return; probed = true;
    await Promise.all(Object.keys(MOODS).map(async m => { try { const r = await fetch(`bgm_${m}.mp3`, { method: 'HEAD' }); if (r.ok) { files[m] = new Audio(`bgm_${m}.mp3`); files[m].loop = true; } } catch (e) { /* none */ } }));
  }
  async function start() { if (on) return; on = true; if (!ctx) build(); await ctx.resume(); await probe(); if (on) startMood(); }
  function stop() { if (!on) return; on = false; startMood(); }
  function setMood(m) { if (!MOODS[m] || m === mood) return; mood = m; if (on) startMood(); }
  function duck(v) { ducked = v; if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(v ? DUCK : LEVEL, ctx.currentTime, 0.25); } if (fileNow) fade(fileNow, v ? 0.08 : 0.6); }
  // 離線算出某一種情緒的配樂（製作分享影片用）
  async function render(m, secs) {
    const keep = [ctx, master, wetIn];
    build(new OfflineAudioContext(1, Math.floor(44100 * secs), 44100));
    const off = ctx, b = ctx.createGain(); b.connect(master); b.connect(wetIn);
    const M = MOODS[m], B = 60 / M.bpm; let t = 0.1, i = 0;
    while (t < secs) { M.play(b, t, i++, B); t += B * M.beats; }
    [ctx, master, wetIn] = keep;
    return off.startRendering();
  }
  window.LC_MUSIC = { render, start, stop, setMood, duck, get on() { return on; }, get mood() { return mood; } };
})();
