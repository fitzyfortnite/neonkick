/* GolKafa — ortak simülasyon. Hem tarayıcıda hem Node'da çalışır. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SIM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SIM = {};

  SIM.ARENAS = {
    '1v1': { L: 36, W: 22, goalW: 7, goalD: 2.6 },
    '2v2': { L: 48, W: 30, goalW: 8, goalD: 2.8 },
  };
  SIM.PR = 0.72;          // oyuncu yarıçapı
  SIM.BR = 0.45;          // top yarıçapı
  SIM.MATCH_TIME = 120;   // saniye
  SIM.OT_TIME = 60;
  SIM.TICK = 1 / 60;

  // Kramponlar: mağaza ögeleri de aynı tabloyu kullanır
  SIM.BOOTS = {
    basic:   { name: 'Çırak',        power: 1.00, speed: 1.00, control: 1.00, price: 0,    color: 0x2b2f3a, glow: 0x5c6478, trail: '#8d96b0', rarity: 'sıradan',  desc: 'Herkesin ilk kramponu.' },
    ember:   { name: 'Kor Alev',     power: 1.18, speed: 1.00, control: 0.95, price: 900,  color: 0xd2451e, glow: 0xff7a2a, trail: '#ff6a1a', rarity: 'nadir',   desc: 'Şutlara ateşli bir iz bırakır.' },
    frost:   { name: 'Buz Kristali', power: 0.95, speed: 1.12, control: 1.05, price: 900,  color: 0x7fd3ff, glow: 0xb8ecff, trail: '#8ee8ff', rarity: 'nadir',   desc: 'Hızlı koşular, keskin dönüşler.' },
    venom:   { name: 'Zehir Yeşili', power: 1.05, speed: 1.06, control: 1.10, price: 1500, color: 0x37d26a, glow: 0x7cff9f, trail: '#5dff8a', rarity: 'epik',    desc: 'Top ayağına yapışır.' },
    royal:   { name: 'Kraliyet',     power: 1.12, speed: 1.08, control: 1.08, price: 2600, color: 0x6a3bd8, glow: 0xb08cff, trail: '#c09bff', rarity: 'epik',    desc: 'Mor ışıltı, dengeli güç.' },
    gold:    { name: 'Altın Ayak',   power: 1.25, speed: 1.10, control: 1.12, price: 5000, color: 0xe3b23c, glow: 0xffe28a, trail: '#ffd957', rarity: 'efsanevi', desc: 'Altın izli şut, altın gol.' },
    void:    { name: 'Boşluk',       power: 1.30, speed: 1.14, control: 1.05, price: 7500, color: 0x14101f, glow: 0xff2ea6, trail: '#ff3bb0', rarity: 'efsanevi', desc: 'Karanlıktan çıkan pembe şimşek.' },
    phoenix: { name: 'Anka',         power: 1.35, speed: 1.18, control: 1.15, price: 12000, color: 0xff4d2e, glow: 0xffb347, trail: '#ffa030', rarity: 'mitik',   desc: 'Küllerinden doğan efsane.' },
  };

  // Yetenekler: seviye ile açılır (her 5 seviyede bir)
  SIM.ABILITIES = [
    { id: 'power',   name: 'Sert Şut',     lvl: 5,  cd: 7,  desc: 'Sonraki vuruş %70 daha güçlü ve havalı.' },
    { id: 'dash',    name: 'Hız Çalımı',   lvl: 10, cd: 6,  desc: 'Anlık ileri atılım, rakibi geçersin.' },
    { id: 'curve',   name: 'Falso',        lvl: 15, cd: 8,  desc: 'Sonraki şut havada kıvrılır.' },
    { id: 'boost',   name: 'Turbo',        lvl: 20, cd: 10, desc: '3 saniye boyunca hız ve sınırsız sprint.' },
    { id: 'lob',     name: 'Aşırtma',      lvl: 25, cd: 8,  desc: 'Topu kaleciyi aşan bir yayla gönderir.' },
    { id: 'thunder', name: 'Yıldırım Şut', lvl: 30, cd: 12, desc: 'Durdurulamaz, dümdüz, iki kat güçte şut.' },
  ];

  SIM.createState = function (mode, players, opts) {
    opts = opts || {};
    const A = SIM.ARENAS[mode] || SIM.ARENAS['1v1'];
    const st = {
      mode, L: A.L, W: A.W, goalW: A.goalW, goalD: A.goalD,
      players: [], ball: { x: 0, z: 0, y: SIM.BR, vx: 0, vz: 0, vy: 0, spin: 0 },
      score: [0, 0], time: opts.time || SIM.MATCH_TIME, phase: 'countdown', phaseT: 4.4,
      overtime: false, events: [], lastTouch: -1, winner: -1,
    };
    players.forEach(function (p) {
      st.players.push({
        id: p.id, name: p.name || 'Oyuncu', team: p.team, boots: p.boots || 'basic', ability: p.ability || null,
        bot: !!p.bot, x: 0, z: 0, vx: 0, vz: 0, dx: p.team === 0 ? 1 : -1, dz: 0,
        stamina: 100, kickCd: 0, abCd: 0, abActive: 0, abArmed: null, boostT: 0, dashT: 0, stun: 0, anim: 0,
      });
    });
    SIM.resetPositions(st);
    return st;
  };

  SIM.resetPositions = function (st) {
    const counts = [0, 0];
    st.players.forEach(function (p) {
      const idx = counts[p.team]++;
      const n = st.players.filter(function (q) { return q.team === p.team; }).length;
      p.x = (p.team === 0 ? -1 : 1) * st.L * 0.25;
      p.z = n === 1 ? 0 : (idx === 0 ? -st.W * 0.2 : st.W * 0.2);
      p.vx = p.vz = 0; p.dx = p.team === 0 ? 1 : -1; p.dz = 0; p.dashT = 0; p.stun = 0;
    });
    const b = st.ball; b.x = 0; b.z = 0; b.y = SIM.BR; b.vx = b.vz = b.vy = 0; b.spin = 0;
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function len(x, z) { return Math.sqrt(x * x + z * z); }

  SIM.step = function (st, inputs, dt) {
    st.events = [];
    const L2 = st.L / 2, W2 = st.W / 2, G2 = st.goalW / 2;

    if (st.phase === 'countdown') {
      st.phaseT -= dt;
      if (st.phaseT <= 0) { st.phase = 'play'; st.events.push({ t: 'whistle' }); }
      return;
    }
    if (st.phase === 'goal') {
      st.phaseT -= dt;
      if (st.phaseT <= 0) {
        if (st.overtime || (st.time <= 0 && st.score[0] !== st.score[1])) { endMatch(st); return; }
        SIM.resetPositions(st); st.phase = 'countdown'; st.phaseT = 3.5;
      }
      return;
    }
    if (st.phase === 'end') return;

    // Süre
    st.time -= dt;
    if (st.time <= 0) {
      if (st.score[0] !== st.score[1]) { endMatch(st); return; }
      if (!st.overtime) { st.overtime = true; st.time = SIM.OT_TIME; st.events.push({ t: 'overtime' }); }
      else { st.winner = 2; st.phase = 'end'; st.events.push({ t: 'end' }); return; }
    }

    // Oyuncular
    st.players.forEach(function (p) {
      const inp = inputs[p.id] || {};
      const boots = SIM.BOOTS[p.boots] || SIM.BOOTS.basic;
      p.kickCd = Math.max(0, p.kickCd - dt);
      p.abCd = Math.max(0, p.abCd - dt);
      p.boostT = Math.max(0, p.boostT - dt);
      p.dashT = Math.max(0, p.dashT - dt);
      p.stun = Math.max(0, p.stun - dt);

      let mx = inp.mx || 0, mz = inp.mz || 0;
      if (!isFinite(mx) || !isFinite(mz) || p.stun > 0) { mx = mz = 0; }
      let ml = len(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }

      // Yetenek tetikleme
      if (inp.ab && p.ability && p.abCd <= 0 && p.stun <= 0) {
        const ab = SIM.ABILITIES.find(function (a) { return a.id === p.ability; });
        if (ab) {
          p.abCd = ab.cd;
          st.events.push({ t: 'ability', id: p.id, ab: ab.id });
          if (ab.id === 'dash') { p.dashT = 0.28; }
          else if (ab.id === 'boost') { p.boostT = 3; p.stamina = 100; }
          else { p.abArmed = ab.id; }
        }
      }

      // Hız
      let maxSp = 9.2 * boots.speed;
      const sprint = (inp.sprint && (p.stamina > 0 || p.boostT > 0));
      if (sprint) { maxSp *= 1.42; if (p.boostT <= 0) p.stamina = Math.max(0, p.stamina - 28 * dt); }
      else p.stamina = Math.min(100, p.stamina + 16 * dt);
      if (p.boostT > 0) maxSp *= 1.2;

      if (p.dashT > 0) {
        p.vx = p.dx * 24; p.vz = p.dz * 24;
      } else {
        const tx = mx * maxSp, tz = mz * maxSp;
        const k = Math.min(1, 18 * dt);
        p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
      }
      if (ml > 0.05) { const dl = len(mx, mz); if (dl > 1e-6) { p.dx = mx / dl; p.dz = mz / dl; } }
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.anim += len(p.vx, p.vz) * dt;

      // Saha sınırı (oyuncu kaleye biraz girebilir)
      const inGoalZone = Math.abs(p.z) < G2 - SIM.PR * 0.5;
      const xLim = inGoalZone ? L2 + st.goalD - SIM.PR : L2 - SIM.PR;
      p.x = clamp(p.x, -xLim, xLim);
      p.z = clamp(p.z, -W2 + SIM.PR, W2 - SIM.PR);
    });

    // Oyuncu-oyuncu
    for (let i = 0; i < st.players.length; i++) for (let j = i + 1; j < st.players.length; j++) {
      const a = st.players[i], b = st.players[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = len(dx, dz), min = SIM.PR * 2;
      if (d > 0 && d < min) {
        const nx = dx / d, nz = dz / d, push = (min - d) / 2;
        a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        // çalım sırasında çarpışan rakip sendeler
        if (a.dashT > 0 && b.team !== a.team && b.dashT <= 0) { b.stun = 0.45; b.vx += nx * 9; b.vz += nz * 9; st.events.push({ t: 'tackle', id: b.id }); }
        if (b.dashT > 0 && a.team !== b.team && a.dashT <= 0) { a.stun = 0.45; a.vx -= nx * 9; a.vz -= nz * 9; st.events.push({ t: 'tackle', id: a.id }); }
      }
    }

    // Top fiziği
    const b = st.ball;
    b.vy -= 26 * dt;
    b.y += b.vy * dt;
    if (b.y < SIM.BR) { b.y = SIM.BR; if (b.vy < -2) st.events.push({ t: 'bounce', v: -b.vy }); b.vy = -b.vy * 0.55; if (Math.abs(b.vy) < 0.8) b.vy = 0; }
    const onGround = b.y <= SIM.BR + 0.01;
    const fr = onGround ? Math.exp(-0.75 * dt) : Math.exp(-0.12 * dt);
    b.vx *= fr; b.vz *= fr;
    if (b.spin !== 0) { // falso: hıza dik ivme
      const sp = len(b.vx, b.vz);
      if (sp > 1) { const px = -b.vz / sp, pz = b.vx / sp; b.vx += px * b.spin * dt; b.vz += pz * b.spin * dt; }
      b.spin *= Math.exp(-0.9 * dt);
    }
    b.x += b.vx * dt; b.z += b.vz * dt;

    // Oyuncu-top
    st.players.forEach(function (p) {
      const inp = inputs[p.id] || {};
      const boots = SIM.BOOTS[p.boots] || SIM.BOOTS.basic;
      const dx = b.x - p.x, dz = b.z - p.z, d = len(dx, dz);
      const reach = SIM.PR + SIM.BR + 0.55;
      if (d < reach && b.y < 1.6 && inp.kick && p.kickCd <= 0 && p.stun <= 0) {
        p.kickCd = 0.3;
        const ch = Math.max(0, Math.min(1, +inp.charge || 0));
        let pow = 19 * boots.power * (1 + ch * .45), lift = 2.5 + ch * 2.5, spin = 0, kind = ch > .6 ? 'power' : 'kick';
        if (p.abArmed === 'power') { pow *= 1.7; lift = 6; kind = 'power'; }
        else if (p.abArmed === 'curve') { spin = (p.dz >= 0 ? 1 : -1) * 28; pow *= 1.15; lift = 3.5; kind = 'curve'; }
        else if (p.abArmed === 'lob') { pow *= 0.8; lift = 13; kind = 'lob'; }
        else if (p.abArmed === 'thunder') { pow *= 2.2; lift = 1; kind = 'thunder'; }
        p.abArmed = null;
        const pl = len(p.vx, p.vz);
        // Yön: hareket ediyorsa gittiği yön, yoksa baktığı yön
        let kx = p.dx, kz = p.dz;
        if (pl > 2) { kx = p.vx / pl * 0.7 + p.dx * 0.3; kz = p.vz / pl * 0.7 + p.dz * 0.3; const kl = len(kx, kz); kx /= kl; kz /= kl; }
        // kontrol: topa olan yöndeki sapmayı azaltır
        const ctl = clamp(boots.control, 0.8, 1.3);
        kx = kx * ctl + (dx / d) * (1 - ctl) * 0.5; kz = kz * ctl + (dz / d) * (1 - ctl) * 0.5;
        const kl2 = len(kx, kz); kx /= kl2; kz /= kl2;
        b.vx = kx * pow; b.vz = kz * pow; b.vy = lift; b.spin = spin;
        b.x = p.x + kx * (SIM.PR + SIM.BR + 0.05); b.z = p.z + kz * (SIM.PR + SIM.BR + 0.05);
        st.lastTouch = p.id;
        st.events.push({ t: 'kick', id: p.id, kind, pow, x: b.x, z: b.z, dirx: kx, dirz: kz, ch });
      } else if (d < SIM.PR + SIM.BR && b.y < 1.5) {
        const nx = dx / (d || 1), nz = dz / (d || 1);
        b.x = p.x + nx * (SIM.PR + SIM.BR); b.z = p.z + nz * (SIM.PR + SIM.BR);
        const pv = len(p.vx, p.vz);
        const dot = b.vx * nx + b.vz * nz;
        if (dot < 0) { b.vx -= nx * dot * 1.3; b.vz -= nz * dot * 1.3; }
        b.vx += p.vx * 0.55 + nx * (2.2 + pv * 0.25); b.vz += p.vz * 0.55 + nz * (2.2 + pv * 0.25);
        st.lastTouch = p.id;
        if (pv > 3) st.events.push({ t: 'touch', id: p.id });
      }
    });

    // Duvarlar ve kale
    const inMouth = Math.abs(b.z) < G2 - SIM.BR;
    if (!inMouth) {
      if (b.x > L2 - SIM.BR) { b.x = L2 - SIM.BR; if (b.vx > 0) { b.vx = -b.vx * 0.72; st.events.push({ t: 'wall', v: Math.abs(b.vx) }); } }
      if (b.x < -L2 + SIM.BR) { b.x = -L2 + SIM.BR; if (b.vx < 0) { b.vx = -b.vx * 0.72; st.events.push({ t: 'wall', v: Math.abs(b.vx) }); } }
    } else {
      // kale direkleri / arka ağ
      const back = L2 + st.goalD - SIM.BR;
      if (b.x > back) { b.x = back; b.vx = -Math.abs(b.vx) * 0.25; }
      if (b.x < -back) { b.x = -back; b.vx = Math.abs(b.vx) * 0.25; }
      if (Math.abs(b.x) > L2 + SIM.BR) { // kale içi yan ağlar
        const zl = G2 - SIM.BR;
        if (b.z > zl) { b.z = zl; b.vz = -Math.abs(b.vz) * 0.3; }
        if (b.z < -zl) { b.z = -zl; b.vz = Math.abs(b.vz) * 0.3; }
      }
    }
    // direk çarpması
    [[L2, G2], [L2, -G2], [-L2, G2], [-L2, -G2]].forEach(function (post) {
      const dx = b.x - post[0], dz = b.z - post[1], d = len(dx, dz), min = SIM.BR + 0.18;
      if (d < min && d > 0) {
        const nx = dx / d, nz = dz / d; b.x = post[0] + nx * min; b.z = post[1] + nz * min;
        const dot = b.vx * nx + b.vz * nz; if (dot < 0) { b.vx -= 1.8 * dot * nx; b.vz -= 1.8 * dot * nz; st.events.push({ t: 'post' }); }
      }
    });
    if (b.z > W2 - SIM.BR) { b.z = W2 - SIM.BR; if (b.vz > 0) { b.vz = -b.vz * 0.72; st.events.push({ t: 'wall', v: Math.abs(b.vz) }); } }
    if (b.z < -W2 + SIM.BR) { b.z = -W2 + SIM.BR; if (b.vz < 0) { b.vz = -b.vz * 0.72; st.events.push({ t: 'wall', v: Math.abs(b.vz) }); } }
    if (b.y > 6) { b.y = 6; b.vy = -Math.abs(b.vy) * 0.4; }

    // Gol
    if (inMouth && b.y < 2.4) {
      if (b.x > L2 + SIM.BR) scoreGoal(st, 0);
      else if (b.x < -L2 - SIM.BR) scoreGoal(st, 1);
    }
  };

  function scoreGoal(st, team) {
    st.score[team]++;
    st.phase = 'goal'; st.phaseT = 3.2;
    let scorer = st.players.find(function (p) { return p.id === st.lastTouch; });
    const own = scorer && scorer.team !== team;
    st.events.push({ t: 'goal', team, scorer: scorer ? scorer.id : -1, own: !!own, x: st.ball.x, z: st.ball.z });
  }
  function endMatch(st) {
    st.phase = 'end';
    st.winner = st.score[0] > st.score[1] ? 0 : st.score[1] > st.score[0] ? 1 : 2;
    st.events.push({ t: 'end' });
  }

  // Basit ama hırslı bot
  SIM.botInput = function (st, pid, diff, rng) {
    diff = diff == null ? 0.7 : diff; rng = rng || Math.random;
    const p = st.players.find(function (q) { return q.id === pid; });
    if (!p) return {};
    const b = st.ball, sign = p.team === 0 ? 1 : -1;
    const goalX = sign * st.L / 2, ownGoalX = -goalX;
    const mates = st.players.filter(function (q) { return q.team === p.team; });
    const defender = mates.length > 1 && mates.indexOf(p) === 1;
    const dBall = Math.hypot(b.x - p.x, b.z - p.z);
    let tx, tz, kick = false, sprint = false, ab = false;
    const nearest = mates.slice().sort(function (a, c) { return Math.hypot(b.x - a.x, b.z - a.z) - Math.hypot(b.x - c.x, b.z - c.z); })[0];
    const ballOnOurSide = (b.x * sign) < 0;
    if (defender && nearest !== p && !ballOnOurSide) {
      // bekle: top ile kendi kalem arasında dur
      tx = (b.x + ownGoalX) / 2; tz = b.z * 0.5;
    } else {
      // topun arkasına geç, kaleye doğru it
      const gx = goalX - b.x, gz = 0 - b.z, gl = Math.hypot(gx, gz) || 1;
      const behindX = b.x - gx / gl * 1.3, behindZ = b.z - gz / gl * 1.3;
      const dBehind = Math.hypot(behindX - p.x, behindZ - p.z);
      if (dBehind > 1.2 && dBall > 1.4) { tx = behindX; tz = behindZ; }
      else { tx = b.x + gx / gl * 2; tz = b.z + gz / gl * 2; }
      const aligned = ((b.x - p.x) * sign) > -0.3;
      if (dBall < SIM.PR + SIM.BR + 0.5 && aligned && rng() < diff) kick = true;
      sprint = dBall > 4 || Math.abs(b.x - goalX) < st.L * 0.35;
      if (p.ability && p.abCd <= 0 && dBall < 2.2 && Math.abs(b.x - goalX) < st.L * 0.45 && rng() < 0.03) ab = true;
    }
    // biraz hata payı
    tx += (rng() - 0.5) * (1 - diff) * 4; tz += (rng() - 0.5) * (1 - diff) * 4;
    let mx = tx - p.x, mz = tz - p.z; const ml = Math.hypot(mx, mz) || 1;
    if (ml < 0.3) { mx = mz = 0; } else { mx /= ml; mz /= ml; }
    return { mx, mz, kick, sprint, ab };
  };

  SIM.pack = function (st) {
    return { s: st.score, t: Math.ceil(st.time), ph: st.phase, pt: st.phaseT, ot: st.overtime, w: st.winner,
      b: [st.ball.x, st.ball.z, st.ball.y, st.ball.vx, st.ball.vz, st.ball.vy],
      p: st.players.map(function (p) { return [p.id, p.x, p.z, p.vx, p.vz, p.dx, p.dz, Math.round(p.stamina), p.anim, +p.abCd.toFixed(2), p.stun > 0 ? 1 : 0, p.dashT > 0 ? 1 : 0, p.boostT > 0 ? 1 : 0]; }),
      ev: st.events };
  };

  return SIM;
});
