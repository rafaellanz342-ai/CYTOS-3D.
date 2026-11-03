/* =====================================================================
   GUERREIRO ÓSSEO — "Ortopedista de Guerra" (O Atlas Perdido)
   Personagem 2.5D 100% procedural: um esqueleto 3D real (cinemática
   direta + IK de dois ossos), projetado em isométrico 2:1 e pintado em
   canvas 2D com volumes sombreados. Nenhuma imagem: gira 360°, mantém a
   proporção em todas as animações e combina com qualquer resolução.

   Uso:
     const g = GuerreiroOsseo.create({ scale: 70 });
     g.update(dt, { moving, facing, vx, vy });   // facing em radianos (mundo)
     g.play('golpe');                             // ver ACTIONS
     g.draw(ctx, telaX, telaY, { rarity: '#ffd94a' });
   ===================================================================== */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeIO = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const angLerp = (a, b, k) => a + (((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI) * k;

  // ---------- vetores ----------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  // matriz 3x3 (linhas) — rotações
  const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const mm = (A, B) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return r; };
  const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const sph = (el, az) => [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];

  // ---------- câmera isométrica 2:1 (a mesma do jogo: isoX=(x-y)k, isoY=(x+y)k/2) ----------
  const CP = Math.cos(Math.PI / 6), SP = 0.5, R2 = Math.SQRT1_2;
  const CAM = norm([CP * R2, CP * R2, SP]);              // aponta para o observador
  const LIGHT_W = norm([-0.75, 0.05, 0.85]);             // luz da tocha: alto, à esquerda
  const LIGHT_S = norm([-0.55, -0.83]);                  // a mesma luz, no plano da tela
  const proj = (p, s) => [(p[0] - p[1]) * R2 * s, ((p[0] + p[1]) * R2 * SP - p[2] * CP) * s];
  const depthOf = p => (p[0] + p[1]) * R2 * CP + p[2] * SP;

  // ---------- paleta (tirada da UI do jogo: --bone, --gold, --blood, --iron) ----------
  const MAT = {
    bone: { hi: '#fff7df', base: '#e8dcc0', mid: '#c4ad86', sh: '#7e6a4c', deep: '#2e2318' },
    boneD: { hi: '#efdfb8', base: '#cdb88f', mid: '#a68c62', sh: '#64513a', deep: '#251b12' },
    iron: { hi: '#9a8c86', base: '#5f5351', mid: '#3d3436', sh: '#211b1c', deep: '#0c0809' },
    gold: { hi: '#fff0c0', base: '#e2bd72', mid: '#b98a45', sh: '#74501f', deep: '#2e1c06' },
    blood: { hi: '#e2525a', base: '#b8262f', mid: '#8a1620', sh: '#4a0a10', deep: '#1c0306' },
    leather: { hi: '#8f6142', base: '#5e3a24', mid: '#45291a', sh: '#28170e', deep: '#100804' }
  };
  const INK = '#070506';
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  let GRAIN = null;
  function grain() {
    if (GRAIN) return GRAIN;
    GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 96; const g = GRAIN.getContext('2d'), d = g.createImageData(96, 96);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = Math.random() * 90; }
    g.putImageData(d, 0, 0); return GRAIN;
  }

  // ---------- proporções (metros) ----------
  const SK = { thigh: 0.45, shin: 0.45, ankle: 0.075, hipW: 0.105, torso: 0.5, shW: 0.25, neck: 0.1, headR: 0.13,
    uarm: 0.3, farm: 0.28, blade: 1.0, shieldR: 0.31 };

  // ---------- poses ----------
  // Convenção local (antes do espelho): x = frente, y = esquerda, z = cima. Mão direita (espada) em y<0.
  const BASE = {
    pz: 0.9, rootX: 0, lean: 0.08, twist: -0.1, side: 0, hp: 0.05, hy: 0.08,
    hR: [0.24, -0.3, 0.24], hL: [0.3, 0.2, 0.36],
    fR: [-0.12, -0.15, 0], fL: [0.14, 0.17, 0],
    sp: -0.5, sy: -0.6, sr: 0, shN: [0.85, 0.45, 0.12],
    rPitch: 0, rYaw: 0, rZ: 0, pivZ: 0.5, twoHand: 0, crouch: 0
  };
  const KEYS = Object.keys(BASE);
  const clone = p => { const o = {}; for (const k of KEYS) o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k]; return o; };
  function lerpPose(a, b, k) {
    const o = {};
    for (const key of KEYS) {
      const x = a[key], y = b[key];
      o[key] = Array.isArray(x) ? [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)] : lerp(x, y, k);
    }
    return o;
  }

  // Ações: chaves [tempo normalizado, pose parcial]. Campos ausentes seguem a locomoção.
  // legs:'own' = a ação controla pernas/quadril; senão as pernas continuam andando.
  const ACTIONS = {
    golpe: { dur: 0.46, trail: [0.28, 0.6], keys: [
      [0, {}],
      [0.28, { hR: [0.04, -0.34, 0.66], sp: 1.15, sy: -1.7, twist: -0.42, lean: 0.02, hy: 0.25 }],
      [0.47, { hR: [0.46, 0.1, 0.22], sp: -0.3, sy: 0.85, twist: 0.38, lean: 0.22, hy: -0.1 }],
      [0.68, { hR: [0.32, 0.22, 0.14], sp: -0.55, sy: 1.25, twist: 0.32, lean: 0.18 }],
      [1, {}]] },
    golpe2: { dur: 0.46, trail: [0.26, 0.6], keys: [
      [0, {}],
      [0.26, { hR: [0.16, 0.28, 0.4], sp: 0.18, sy: 2.0, twist: 0.45, lean: 0.06 }],
      [0.5, { hR: [0.42, -0.34, 0.36], sp: 0.08, sy: -1.35, twist: -0.42, lean: 0.14 }],
      [0.7, { hR: [0.3, -0.4, 0.3], sp: -0.05, sy: -1.75, twist: -0.36 }],
      [1, {}]] },
    golpe3: { dur: 0.55, legs: 'own', trail: [0.32, 0.56], keys: [
      [0, {}],
      [0.3, { hR: [-0.06, -0.3, 0.4], sp: 0.08, sy: 0.05, twist: -0.45, lean: 0.0, fR: [-0.3, -0.15, 0], fL: [0.2, 0.18, 0], pz: 0.86 }],
      [0.5, { hR: [0.66, -0.06, 0.42], sp: 0.04, sy: 0.02, twist: 0.32, lean: 0.32, rootX: 0.28, fR: [-0.42, -0.15, 0], fL: [0.32, 0.17, 0], pz: 0.8, hp: 0.1 }],
      [0.72, { hR: [0.6, -0.08, 0.4], sp: 0.02, sy: 0.04, twist: 0.25, lean: 0.25, rootX: 0.24, fR: [-0.4, -0.15, 0], fL: [0.3, 0.17, 0], pz: 0.82 }],
      [1, {}]] },
    esmagar: { dur: 0.85, legs: 'own', trail: [0.42, 0.56], impact: 0.55, keys: [
      [0, {}],
      [0.3, { hR: [-0.02, -0.08, 0.9], hL: [0.05, 0.3, 0.7], sp: 2.0, sy: 0, twist: -0.2, lean: -0.12, hp: -0.2, pz: 0.9, shN: [0.4, 0.9, 0.2] }],
      [0.44, { hR: [0.05, -0.06, 0.95], hL: [0.05, 0.32, 0.72], sp: 2.1, sy: 0, lean: -0.15, rZ: 0.2, fR: [-0.02, -0.15, 0.12], fL: [0.08, 0.17, 0.12], pz: 0.85, hp: -0.25 }],
      [0.55, { hR: [0.56, -0.02, -0.02], hL: [0.25, 0.36, 0.35], sp: -0.95, sy: 0, twist: 0.12, lean: 0.5, rZ: 0, crouch: 1, pz: 0.66, fR: [-0.26, -0.17, 0], fL: [0.28, 0.2, 0], hp: 0.3 }],
      [0.78, { hR: [0.54, -0.04, 0.0], hL: [0.25, 0.36, 0.35], sp: -0.9, sy: 0.05, twist: 0.1, lean: 0.45, pz: 0.7, fR: [-0.26, -0.17, 0], fL: [0.28, 0.2, 0] }],
      [1, {}]] },
    investida: { dur: 0.45, legs: 'own', keys: [
      [0, {}],
      [0.18, { hL: [0.48, 0.06, 0.46], shN: [1, 0.05, 0.1], hR: [-0.22, -0.32, 0.12], sp: -0.25, sy: -2.5, lean: 0.48, twist: 0.25, pz: 0.82, fL: [0.42, 0.14, 0.18], fR: [-0.36, -0.14, 0], hp: 0.2 }],
      [0.82, { hL: [0.5, 0.06, 0.46], shN: [1, 0.05, 0.1], hR: [-0.22, -0.32, 0.12], sp: -0.25, sy: -2.5, lean: 0.5, twist: 0.25, pz: 0.8, fL: [-0.3, 0.14, 0.02], fR: [0.4, -0.14, 0.2], hp: 0.2 }],
      [1, {}]] },
    brado: { dur: 0.9, legs: 'own', impact: 0.3, keys: [
      [0, {}],
      [0.18, { hR: [0.18, -0.2, 0.2], hL: [0.2, 0.2, 0.25], lean: 0.25, hp: 0.3, pz: 0.82 }],
      [0.32, { hR: [0.12, -0.58, 0.58], sp: 1.1, sy: -1.3, hL: [0.12, 0.58, 0.58], shN: [0.3, 1, 0.3], lean: -0.18, hp: -0.4, pz: 0.88, fR: [-0.1, -0.24, 0], fL: [0.12, 0.26, 0] }],
      [0.75, { hR: [0.14, -0.56, 0.56], sp: 1.1, sy: -1.3, hL: [0.14, 0.56, 0.56], shN: [0.3, 1, 0.3], lean: -0.14, hp: -0.3, pz: 0.88, fR: [-0.1, -0.24, 0], fL: [0.12, 0.26, 0] }],
      [1, {}]] },
    redemoinho: { dur: 3, legs: 'own', spin: -15, trail: [0.03, 0.97], keys: [
      [0, {}],
      [0.06, { hR: [0.2, -0.56, 0.4], sp: -0.06, sy: -1.35, sr: 1.5, hL: [0.0, 0.42, 0.42], shN: [-0.2, 1, 0.1], lean: 0.12, twist: 0, pz: 0.84, fR: [-0.08, -0.2, 0], fL: [0.08, 0.2, 0] }],
      [0.94, { hR: [0.2, -0.56, 0.4], sp: -0.06, sy: -1.35, sr: 1.5, hL: [0.0, 0.42, 0.42], shN: [-0.2, 1, 0.1], lean: 0.12, twist: 0, pz: 0.84, fR: [-0.08, -0.2, 0], fL: [0.08, 0.2, 0] }],
      [1, {}]] },
    rolar: { dur: 0.42, legs: 'own', keys: [
      [0, {}],
      [0.15, { pz: 0.62, lean: 0.6, hR: [0.25, -0.15, 0.2], hL: [0.25, 0.15, 0.25], sp: -0.2, sy: -0.3, fR: [0.05, -0.12, 0], fL: [0.12, 0.12, 0], pivZ: 0.45, hp: 0.4 }],
      [0.5, { pz: 0.55, lean: 0.75, rPitch: Math.PI, hR: [0.22, -0.12, 0.18], hL: [0.22, 0.12, 0.2], sp: -0.3, sy: -0.3, fR: [0.2, -0.12, 0.25], fL: [0.22, 0.12, 0.25], pivZ: 0.45, rZ: 0.08, hp: 0.4 }],
      [0.85, { pz: 0.66, lean: 0.4, rPitch: TAU, hR: [0.25, -0.15, 0.2], hL: [0.25, 0.15, 0.3], sp: -0.2, sy: -0.3, fR: [-0.1, -0.13, 0], fL: [0.14, 0.15, 0], pivZ: 0.45 }],
      [1, { rPitch: TAU }]] },
    dano: { dur: 0.32, keys: [
      [0, {}],
      [0.25, { lean: -0.28, twist: 0.25, hp: -0.35, hR: [0.15, -0.32, 0.3], hL: [0.2, 0.32, 0.45] }],
      [1, {}]] },
    morte: { dur: 1.3, legs: 'own', hold: true, keys: [
      [0, {}],
      [0.25, { lean: -0.32, hp: -0.4, twist: 0.3, pz: 0.78, hR: [0.1, -0.4, 0.2], hL: [0.1, 0.4, 0.4], sp: -0.6, sy: -0.8 }],
      [0.55, { lean: -0.2, hp: -0.2, twist: 0.2, pz: 0.62, rPitch: -0.8, pivZ: 0, hR: [0.05, -0.5, 0.1], hL: [0.0, 0.45, 0.3], sp: -0.2, sy: -1.6, fR: [0.15, -0.18, 0], fL: [0.25, 0.2, 0.05] }],
      [0.75, { lean: -0.05, hp: 0.1, twist: 0.1, pz: 0.6, rPitch: -1.42, pivZ: 0, rZ: 0.05, hR: [0.0, -0.6, 0.0], hL: [-0.05, 0.5, 0.15], sp: 0.0, sy: -1.6, fR: [0.25, -0.2, 0.05], fL: [0.35, 0.22, 0.12] }],
      [1, { lean: 0, hp: 0.15, twist: 0.1, pz: 0.6, rPitch: -1.48, pivZ: 0, rZ: 0.02, hR: [0.0, -0.62, 0.0], hL: [-0.05, 0.52, 0.12], sp: 0.0, sy: -1.6, fR: [0.25, -0.2, 0.02], fL: [0.35, 0.22, 0.08] }]] }
  };

  // ---------- IK de dois ossos ----------
  function ik(a, t, l1, l2, pole) {
    const d = sub(t, a); let dl = len(d);
    dl = clamp(dl, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    const u = norm(d), ca = (l1 * l1 + dl * dl - l2 * l2) / (2 * l1 * dl), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    let pp = sub(pole, mul(u, dot(pole, u))); pp = len(pp) < 1e-5 ? norm(cross(u, [0, 0, 1])) : norm(pp);
    return [add(a, add(mul(u, l1 * ca), mul(pp, l1 * sa))), add(a, mul(u, dl))];
  }

  // ---------- pano (Verlet) para capa e tabardo ----------
  function Cloth(cols, rows, seg) { this.cols = cols; this.rows = rows; this.seg = seg; this.p = null; this.o = null; }
  Cloth.prototype.step = function (anchors, dt, shift, colliders, wind, center) {
    const { cols, rows, seg } = this;
    if (!this.p) { this.p = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.p.push(add(anchors[c], [0, 0, -seg * r])); this.o = this.p.map(q => q.slice()); }
    const P = this.p, O = this.o, g = -9.8 * dt * dt, damp = 0.94;
    for (let c = 0; c < cols; c++) { P[c] = anchors[c].slice(); O[c] = anchors[c].slice(); }
    for (let i = cols; i < P.length; i++) {
      const p = P[i], o = O[i];
      p[0] -= shift[0]; p[1] -= shift[1]; o[0] -= shift[0]; o[1] -= shift[1];
      const vx = (p[0] - o[0]) * damp + wind[0] * dt * dt, vy = (p[1] - o[1]) * damp + wind[1] * dt * dt, vz = (p[2] - o[2]) * damp + g;
      O[i] = p.slice(); p[0] += vx; p[1] += vy; p[2] += vz;
    }
    for (let it = 0; it < 4; it++) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (r > 0) this.link(i - cols, i, seg, r === 1);
        if (c > 0 && r > 0) this.link(i - 1, i, this.rest ? this.rest[c - 1] : seg, false);
        if (r > 0 && c > 0) this.link(i - cols - 1, i, Math.hypot(seg, this.rest ? this.rest[c - 1] : seg), false);
      }
      for (let i = cols; i < P.length; i++) {
        const p = P[i];
        for (const k of colliders) { // cápsulas do corpo empurram o pano para fora
          const ab = sub(k.b, k.a), t = clamp(dot(sub(p, k.a), ab) / (dot(ab, ab) || 1), 0, 1), q = add(k.a, mul(ab, t)), d = sub(p, q), dl = len(d);
          if (dl < k.r) { const n = dl > 1e-5 ? mul(d, 1 / dl) : norm(sub(p, center)); P[i] = add(q, mul(n, k.r)); }
        }
        if (P[i][2] < 0.02) P[i][2] = 0.02;
      }
    }
  };
  Cloth.prototype.link = function (i, j, rest, pinI) {
    const P = this.p, a = P[i], b = P[j], d = sub(b, a), l = len(d) || 1e-6, k = (l - rest) / l;
    if (pinI || i < this.cols) { P[j] = sub(b, mul(d, k)); return; }
    P[i] = add(a, mul(d, k * 0.5)); P[j] = sub(b, mul(d, k * 0.5));
  };

  // ======================================================================
  function Warrior(opts) {
    opts = opts || {};
    this.scale = opts.scale || 70;
    this.facing = opts.facing || 0.6; this.facingTarget = this.facing;
    this.t = 0; this.phase = 0; this.move = 0; this.speed = 0;
    this.action = null; this.combo = 0; this.comboT = 0;
    this.rage = 0; this.dead = false;
    this.cape = new Cloth(7, 8, 0.12); this.cape.rest = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
    this.tabF = new Cloth(4, 5, 0.08); this.tabF.rest = [0.06, 0.06, 0.06];
    this.tabB = new Cloth(4, 5, 0.08); this.tabB.rest = [0.06, 0.06, 0.06];
    this.theme = opts.theme || 'carmesim';
    this.trail = []; this.fx = []; this.on = opts.on || null;
  }
  Warrior.ACTIONS = ACTIONS;

  Warrior.prototype.play = function (name, opt) {
    if (this.dead && name !== 'reviver') return 0;
    if (name === 'reviver') { this.dead = false; this.action = null; return 0; }
    if (name === 'golpe') { // combo de 3 golpes: Golpe Cortical
      const busy = this.action && this.action.name.startsWith('golpe') && this.action.t < this.action.dur * 0.55;
      if (busy && !(opt && opt.force)) return 0;
      this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
      name = this.combo === 1 ? 'golpe' : 'golpe' + this.combo; this.comboT = 0.75;
    }
    const def = ACTIONS[name]; if (!def) return 0;
    const dur = (opt && opt.dur) || def.dur;
    this.action = { name, def, t: 0, dur, fired: false };
    if (name === 'morte') this.dead = true;
    if (name === 'brado') this.rage = 1;
    this.emit('start', name);
    return dur;
  };
  Warrior.prototype.emit = function (ev, name) {
    if (ev === 'impact') {
      if (name === 'esmagar') { this.fx.push({ k: 'ring', t: 0, life: 0.6, at: this.local2world([0.95, 0, 0]), col: '255,170,90', r: 1.6, crack: 1 }); this.debris(this.local2world([0.95, 0, 0])); }
      if (name === 'brado') { this.fx.push({ k: 'ring', t: 0, life: 0.7, at: [0, 0, 0], col: '255,70,40', r: 2.2 }); this.fx.push({ k: 'ring', t: -0.12, life: 0.7, at: [0, 0, 0], col: '226,189,114', r: 1.6 }); }
    }
    if (this.on) this.on(ev, name);
  };
  Warrior.prototype.debris = function (at) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, sp = 1 + Math.random() * 2.2;
      this.fx.push({ k: 'shard', t: 0, life: 0.7 + Math.random() * 0.4, p: [at[0], at[1], 0.05], v: [Math.cos(a) * sp, Math.sin(a) * sp, 2.5 + Math.random() * 2.5], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20, sz: 0.03 + Math.random() * 0.04 });
    }
  };
  Warrior.prototype.busy = function () { return !!(this.action && this.action.t < this.action.dur); };

  // ---------- atualização ----------
  Warrior.prototype.update = function (dt, inp) {
    inp = inp || {};
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (inp.facing != null) this.facingTarget = inp.facing;
    const spin = this.action && this.action.def.spin;
    if (spin) this.facing += spin * dt;
    else if (!this.dead && !(this.action && this.action.name === 'rolar')) this.facing = angLerp(this.facing, this.facingTarget, 1 - Math.exp(-dt * 16));
    const moving = !!inp.moving && !this.dead;
    this.move = lerp(this.move, moving ? 1 : 0, 1 - Math.exp(-dt * 10));
    const spd = inp.speed != null ? inp.speed : 2.4;
    if (inp.phase != null) this.phase = inp.phase; else this.phase += dt * spd * this.move / 1.25 * TAU;
    this.comboT = Math.max(0, this.comboT - dt);
    this.rage = Math.max(0, this.rage - dt * 0.12);
    const a = this.action;
    if (a) {
      a.t += dt;
      const imp = a.def.impact; if (imp != null && !a.fired && a.t >= imp * a.dur) { a.fired = true; this.emit('impact', a.name); }
      if (a.t >= a.dur && !a.def.hold) { this.emit('end', a.name); this.action = null; }
    }
    // pose + esqueleto
    this.pose = this.computePose();
    this.solve(this.pose);
    // panos (coordenadas do mundo centradas no personagem; o deslocamento dá inércia)
    const shift = [(inp.vx || 0) * dt, (inp.vy || 0) * dt, 0];
    const wind = [Math.sin(this.t * 1.3) * 1.2 - 0.6, Math.cos(this.t * 0.9) * 1.0 + 0.3, 0];
    const J = this.J, cols = this.colliders();
    this.cape.step(J.capeA, dt, shift, cols, wind, J.chest);
    this.tabF.step(J.tabFA, dt, shift, cols.filter(k => k.leg), wind, J.pel);
    this.tabB.step(J.tabBA, dt, shift, cols.filter(k => k.leg), wind, J.pel);
    // rastro da arma
    const tr = a && a.def.trail, an = a ? a.t / a.dur : 0;
    if (tr && an >= tr[0] && an <= tr[1]) this.trail.push({ tip: J.tip.slice(), mid: mix(J.guard, J.tip, 0.55), t: this.t });
    while (this.trail.length && this.t - this.trail[0].t > (spin ? 0.12 : 0.16)) this.trail.shift();
    // efeitos
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      if (f.k === 'shard') { f.v[2] -= 12 * dt; f.p = add(f.p, mul(f.v, dt)); f.rot += f.vr * dt; if (f.p[2] < 0) { f.p[2] = 0; f.v = [f.v[0] * 0.4, f.v[1] * 0.4, -f.v[2] * 0.3]; f.vr *= 0.5; } }
      if (f.t > f.life) this.fx.splice(i, 1);
    }
  };

  Warrior.prototype.locoPose = function () {
    const p = clone(BASE), m = this.move, ph = this.phase, br = Math.sin(this.t * 2.2);
    // respiração de guarda
    p.pz += br * 0.008; p.lean += br * 0.01; p.hL[2] += br * 0.01; p.sp += br * 0.02;
    if (m < 0.01) return p;
    const S = 0.62 * m, lift = 0.16 * m;
    const foot = (off, side) => {
      let q = (ph + off) % TAU; if (q < 0) q += TAU;
      if (q < Math.PI) return [S / 2 - S * (q / Math.PI), side, 0];
      const u = (q - Math.PI) / Math.PI; return [-S / 2 + S * easeIO(u), side, lift * Math.sin(u * Math.PI)];
    };
    const fR = foot(0, -0.13), fL = foot(Math.PI, 0.13);
    p.fR = mix(p.fR, fR, m); p.fL = mix(p.fL, fL, m);
    p.pz = lerp(p.pz, 0.93 - 0.035 * Math.abs(Math.cos(ph)), m);
    p.lean += 0.1 * m; p.twist = lerp(p.twist, 0.14 * Math.sin(ph), m);
    p.hR = add(p.hR, [0.1 * Math.sin(ph + Math.PI) * m, 0, 0.03 * Math.cos(ph * 2) * m]);
    p.hL = add(p.hL, [0.06 * Math.sin(ph) * m, 0, 0]);
    p.sp -= 0.2 * m; p.hp += 0.05 * m;
    return p;
  };

  Warrior.prototype.computePose = function () {
    const loco = this.locoPose(), a = this.action;
    if (!a) return loco;
    const def = a.def, k = clamp(a.t / a.dur, 0, 1), keys = def.keys;
    const legKeys = ['fR', 'fL', 'pz', 'rootX', 'crouch'];
    const full = part => { const o = clone(loco); for (const key in part) if (def.legs === 'own' || !legKeys.includes(key)) o[key] = Array.isArray(part[key]) ? part[key].slice() : part[key]; return o; };
    let i = 0; while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
    const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
    const u = easeIO(clamp((k - t0) / ((t1 - t0) || 1), 0, 1));
    const p = lerpPose(full(p0), full(p1), u);
    return p;
  };

  // pose -> articulações (locais, já espelhadas e com a raiz aplicada) -> mundo
  Warrior.prototype.solve = function (p) {
    const pel = [0, 0, p.pz];
    const T = mm(mm(Rz(p.twist), Ry(p.lean)), Rx(p.side));
    const Pm = Rz(p.twist * 0.35);
    const tp = v => add(pel, mv(T, v)), tv = v => mv(T, v);
    const L = {};
    L.pel = pel; L.chest = tp([0, 0, SK.torso * 0.72]);
    L.shR = tp([0, -SK.shW, SK.torso - 0.04]); L.shL = tp([0, SK.shW, SK.torso - 0.04]);
    L.neck = tp([0, 0, SK.torso + 0.04]);
    const H = mm(T, mm(Rz(p.hy), Ry(p.hp)));
    L.head = add(L.neck, mv(H, [0.01, 0, SK.neck + SK.headR * 0.75]));
    L.hF = mv(H, [1, 0, 0]); L.hU = mv(H, [0, 0, 1]); L.hS = mv(H, [0, 1, 0]);
    // braços
    const handR = tp(p.hR), handL = tp(p.hL);
    [L.elR, L.haR] = ik(L.shR, handR, SK.uarm, SK.farm, tv([-0.45, -0.55, -0.5]));
    [L.elL, L.haL] = ik(L.shL, handL, SK.uarm, SK.farm, tv([-0.35, 0.6, -0.55]));
    // espada (fêmur de guerra)
    const dir = norm(tv(sph(p.sp, p.sy)));
    let ref = tv([0, 0, 1]); if (Math.abs(dot(ref, dir)) > 0.95) ref = tv([1, 0, 0]);
    let e = norm(cross(dir, ref)); e = norm(add(mul(e, Math.cos(p.sr)), mul(cross(dir, e), Math.sin(p.sr))));
    L.dir = dir; L.edge = e;
    L.pommel = add(L.haR, mul(dir, -0.13)); L.guard = add(L.haR, mul(dir, 0.08)); L.tip = add(L.guard, mul(dir, SK.blade));
    // escudo no antebraço esquerdo
    L.shC = add(mix(L.elL, L.haL, 0.62), mul(norm(tv(p.shN)), 0.07)); L.shN = norm(tv(p.shN));
    L.shU = norm(sub(L.haL, L.elL));
    // pernas
    const hipR = add(pel, mv(Pm, [0, -SK.hipW, -0.03])), hipL = add(pel, mv(Pm, [0, SK.hipW, -0.03]));
    L.hipR = hipR; L.hipL = hipL;
    const poleK = mv(Pm, [1, 0, 0.1]);
    [L.knR, L.anR] = ik(hipR, add(p.fR, [0, 0, SK.ankle]), SK.thigh, SK.shin, add(poleK, [0, -0.15, 0]));
    [L.knL, L.anL] = ik(hipL, add(p.fL, [0, 0, SK.ankle]), SK.thigh, SK.shin, add(poleK, [0, 0.15, 0]));
    L.toR = add(L.anR, mv(Rz(-0.25), [0.15, 0, -0.05])); L.toL = add(L.anL, mv(Rz(0.25), [0.15, 0, -0.05]));
    // pano: âncoras
    L.capeA = []; for (let c = 0; c < 7; c++) L.capeA.push(tp([-0.13 - 0.06 * Math.sin(c / 6 * Math.PI), lerp(0.29, -0.29, c / 6), SK.torso - 0.05]));
    L.tabFA = [-1, -1 / 3, 1 / 3, 1].map(s => tp([0.17, s * 0.09, -0.02])); L.tabBA = [-1, -1 / 3, 1 / 3, 1].map(s => tp([-0.16, s * 0.09, -0.02]));
    // anéis do tronco (seções elípticas; frente da textura em a = 0)
    const ring = (z, rx, ry, M, n) => { const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * TAU - Math.PI; pts.push(add(pel, mv(M, [rx * Math.cos(a), ry * Math.sin(a), z]))); } return pts; };
    const TR = [[-0.02, 0.14, 0.165], [0.06, 0.145, 0.17], [0.14, 0.15, 0.186], [0.22, 0.158, 0.205], [0.3, 0.168, 0.225], [0.38, 0.172, 0.236], [0.45, 0.16, 0.236], [0.51, 0.125, 0.205], [0.56, 0.065, 0.11]];
    L.torsoRings = TR.map(r => ring(r[0], r[1], r[2], T, 16)); this.torsoV = TR.map(r => (0.56 - r[0]) / 0.58);
    L.hipRings = [ring(-0.17, 0.175, 0.205, Pm, 16), ring(-0.07, 0.158, 0.188, Pm, 16), ring(0.02, 0.145, 0.168, T, 16)];
    L.gemBelt = { p: tp([0.17, 0, 0.035]), n: tv([1, 0, 0]) };
    L.tF = tv([1, 0, 0]); L.tS = tv([0, 1, 0]); L.tU = tv([0, 0, 1]);
    this.L = L; this.T = T;
    this.toWorld(p);
  };

  Warrior.prototype.local2world = function (v) { const a = this.facing; return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]]; };

  Warrior.prototype.toWorld = function (p) {
    const pit = Ry(p.rPitch), yaw = this.facing + p.rYaw, c = Math.cos(yaw), s = Math.sin(yaw);
    const piv = p.pivZ;
    const P = v => { let q = [v[0], -v[1], v[2] - piv]; q = mv(pit, q); q = [q[0] + p.rootX, q[1], q[2] + piv + p.rZ]; return [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]]; };
    const V = v => { let q = mv(pit, [v[0], -v[1], v[2]]); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]]; };
    const VEC = { hF: 1, hU: 1, hS: 1, dir: 1, edge: 1, shN: 1, shU: 1, tF: 1, tS: 1, tU: 1 };
    const map = v => (typeof v[0] === 'number' ? P(v) : Array.isArray(v) ? v.map(map) : { p: P(v.p), n: V(v.n) });
    const J = {}, L = this.L;
    for (const k in L) J[k] = VEC[k] ? V(L[k]) : map(L[k]);
    J.torsoV = this.torsoV;
    this.J = J;
  };

  Warrior.prototype.colliders = function () {
    const J = this.J;
    return [
      { a: J.pel, b: J.chest, r: 0.21 }, { a: J.chest, b: J.neck, r: 0.2 },
      { a: J.hipR, b: J.knR, r: 0.11, leg: 1 }, { a: J.knR, b: J.anR, r: 0.09, leg: 1 },
      { a: J.hipL, b: J.knL, r: 0.11, leg: 1 }, { a: J.knL, b: J.anL, r: 0.09, leg: 1 },
      { a: J.pel, b: add(J.pel, [0, 0, -0.15]), r: 0.17, leg: 1 }
    ];
  };

  // ======================================================================
  //  TEXTURAS PROCEDURAIS — geradas uma vez por tema, em canvas
  // ======================================================================
  const THEMES = {
    carmesim: { name: 'Carmesim', cloth: ['#c0303a', '#8a1620', '#3e070d'], trim: '#e2bd72', trimD: '#7a5424', gem: [255, 70, 40], rim: [255, 130, 80] },
    real: { name: 'Real', cloth: ['#7a3a9e', '#4a1a66', '#1c0628'], trim: '#ffd98a', trimD: '#8a6424', gem: [200, 120, 255], rim: [210, 150, 255] },
    peste: { name: 'Peste', cloth: ['#6a8a2a', '#3a5416', '#141f06'], trim: '#cfc77a', trimD: '#5e5a20', gem: [150, 255, 90], rim: [170, 255, 120] },
    obsidiana: { name: 'Obsidiana', cloth: ['#4a4a58', '#26262e', '#0a0a0e'], trim: '#d6dde8', trimD: '#5a6070', gem: [90, 200, 255], rim: [120, 190, 255] }
  };
  function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function noisePx(g, w, h, amp, R) { const d = g.getImageData(0, 0, w, h), a = d.data; for (let i = 0; i < a.length; i += 4) { const n = (R() - 0.5) * amp; a[i] += n; a[i + 1] += n; a[i + 2] += n * 0.9; } g.putImageData(d, 0, 0); }
  function blotch(g, w, h, n, cols, R, r0, r1) { for (let i = 0; i < n; i++) { const x = R() * w, y = R() * h, r = r0 + R() * (r1 - r0), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, cols[i % cols.length]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } }
  function crackLines(g, w, h, n, col, R, lw) { g.strokeStyle = col; g.lineCap = 'round'; for (let i = 0; i < n; i++) { let x = R() * w, y = R() * h, a = R() * TAU; g.lineWidth = lw * (0.5 + R()); g.beginPath(); g.moveTo(x, y); const k = 4 + (R() * 8 | 0); for (let j = 0; j < k; j++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * (3 + R() * 7); y += Math.sin(a) * (3 + R() * 7); g.lineTo(x, y); } g.stroke(); } }
  function paintBone(g, w, h, R, base) {
    g.fillStyle = base || '#e2d3b0'; g.fillRect(0, 0, w, h);
    blotch(g, w, h, Math.max(12, w * h / 2500), ['rgba(150,110,60,.2)', 'rgba(255,250,228,.25)', 'rgba(110,80,45,.14)'], R, 6, Math.max(14, w / 6));
    g.globalAlpha = 0.09; for (let i = 0; i < w / 4; i++) { g.strokeStyle = R() < 0.5 ? '#6e5534' : '#fff6dc'; g.lineWidth = 1; const x = R() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + R() * 8 - 4, h * 0.3, x + R() * 8 - 4, h * 0.6, x + R() * 6 - 3, h); g.stroke(); } g.globalAlpha = 1;
    for (let i = 0; i < w * h / 80; i++) { g.fillStyle = `rgba(70,48,28,${0.12 + R() * 0.3})`; g.beginPath(); g.arc(R() * w, R() * h, 0.4 + R() * 1.1, 0, TAU); g.fill(); }
    crackLines(g, w, h, Math.max(4, w * h / 6000), 'rgba(58,38,20,.5)', R, 1);
    noisePx(g, w, h, 18, R);
  }
  function paintMetal(g, w, h, R, base, rust) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 14, ['rgba(0,0,0,.25)', 'rgba(255,240,230,.08)'], R, 10, w / 3);
    for (let i = 0; i < h * 1.5; i++) { g.strokeStyle = R() < 0.5 ? 'rgba(255,245,235,.06)' : 'rgba(0,0,0,.1)'; g.lineWidth = 0.6 + R(); const y = R() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (R() - 0.5) * 6); g.stroke(); }
    for (let i = 0; i < w / 5; i++) { g.strokeStyle = `rgba(230,220,210,${0.12 + R() * 0.2})`; g.lineWidth = 0.7; const x = R() * w, y = R() * h, a = R() * TAU, l = 4 + R() * 14; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    if (rust) blotch(g, w, h, 10, ['rgba(130,52,22,.28)', 'rgba(90,40,20,.22)'], R, 4, 16);
    noisePx(g, w, h, 14, R);
  }
  function boneShape(g, x1, y1, x2, y2, r, fill, dark) {
    g.lineCap = 'round'; g.strokeStyle = dark; g.lineWidth = r * 2 + 3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * r * 0.9, ny = Math.cos(a) * r * 0.9;
    g.fillStyle = dark; for (const [x, y] of [[x1, y1], [x2, y2]]) for (const sgn of [1, -1]) { g.beginPath(); g.arc(x + nx * sgn, y + ny * sgn, r * 1.05 + 1.5, 0, TAU); g.fill(); }
    g.strokeStyle = fill; g.lineWidth = r * 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.fillStyle = fill; for (const [x, y] of [[x1, y1], [x2, y2]]) for (const sgn of [1, -1]) { g.beginPath(); g.arc(x + nx * sgn, y + ny * sgn, r * 1.05, 0, TAU); g.fill(); }
  }
  function skullShape(g, x, y, r, fill, dark) {
    g.fillStyle = dark; g.beginPath(); g.arc(x, y - r * 0.1, r + 2, 0, TAU); g.fill(); g.fillRect(x - r * 0.62 - 2, y + r * 0.3, r * 1.24 + 4, r * 0.75 + 2);
    g.fillStyle = fill; g.beginPath(); g.arc(x, y - r * 0.1, r, 0, TAU); g.fill(); g.fillRect(x - r * 0.62, y + r * 0.3, r * 1.24, r * 0.72);
    g.fillStyle = dark; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * r * 0.38, y, r * 0.27, r * 0.32, 0, 0, TAU); g.fill(); }
    g.beginPath(); g.moveTo(x - r * 0.12, y + r * 0.42); g.lineTo(x + r * 0.12, y + r * 0.42); g.lineTo(x, y + r * 0.22); g.closePath(); g.fill();
    g.lineWidth = Math.max(1, r * 0.08); g.strokeStyle = dark; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * r * 0.22, y + r * 0.62); g.lineTo(x + i * r * 0.22, y + r); g.stroke(); }
  }
  function trimBand(g, w, y0, y1, th, R, rivets) {
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, th.trim); gr.addColorStop(0.45, '#fff2c8'); gr.addColorStop(1, th.trimD);
    g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, y1, w, 2); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, y0, w, 1);
    g.strokeStyle = th.trimD; g.lineWidth = 1; g.beginPath(); for (let x = 0; x < w; x += 8) { g.moveTo(x, (y0 + y1) / 2 - 2); g.lineTo(x + 4, (y0 + y1) / 2 + 2); g.lineTo(x + 8, (y0 + y1) / 2 - 2); } g.stroke();
    if (rivets) for (let x = rivets / 2; x < w; x += rivets) { g.fillStyle = th.trimD; g.beginPath(); g.arc(x, (y0 + y1) / 2, 2.6, 0, TAU); g.fill(); g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(x - 0.8, (y0 + y1) / 2 - 0.8, 1, 0, TAU); g.fill(); }
  }

  const TEXCACHE = {};
  function buildTextures(themeKey) {
    if (TEXCACHE[themeKey]) return TEXCACHE[themeKey];
    const th = THEMES[themeKey] || THEMES.carmesim, T = {};
    let c, g, R;
    // osso
    [c, g] = mkCanvas(256, 256); paintBone(g, 256, 256, rng(11)); T.bone = c;
    // ferro escovado
    [c, g] = mkCanvas(256, 256); paintMetal(g, 256, 256, rng(21), '#4e4446', true); T.iron = c;
    // ouro
    [c, g] = mkCanvas(128, 128); paintMetal(g, 128, 128, rng(31), th.trim, false); R = rng(32);
    g.strokeStyle = th.trimD; g.globalAlpha = 0.6; g.lineWidth = 1.2; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(R() * 128, R() * 128, 6 + R() * 10, 0, Math.PI * (1 + R())); g.stroke(); } g.globalAlpha = 1; T.gold = c;
    // cota de malha
    [c, g] = mkCanvas(96, 96); g.fillStyle = '#1e191b'; g.fillRect(0, 0, 96, 96); R = rng(41);
    for (let y = 0, row = 0; y < 100; y += 5, row++) for (let x = (row % 2) * 3; x < 100; x += 6) { g.strokeStyle = '#7d7270'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 2.7, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(230,220,210,.7)'; g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, 2.7, 3.6, 5.4); g.stroke(); }
    noisePx(g, 96, 96, 12, R); T.mail = c;
    // couro
    [c, g] = mkCanvas(128, 128); R = rng(51); g.fillStyle = '#5a3824'; g.fillRect(0, 0, 128, 128); blotch(g, 128, 128, 18, ['rgba(0,0,0,.25)', 'rgba(255,200,150,.08)'], R, 6, 30);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(20,10,5,${R() * 0.35})`; g.fillRect(R() * 128, R() * 128, 1 + R(), 1); }
    g.strokeStyle = '#c9a070'; g.lineWidth = 1.2; g.setLineDash([4, 3]); for (const y of [7, 121]) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } g.setLineDash([]);
    noisePx(g, 128, 128, 16, R); T.leather = c;
    // tecido (capa/tabardo) com trama, dobras, barra bordada e emblema de ossos cruzados
    const cloth = (emblem, dark) => {
      const [c, g] = mkCanvas(256, 256), R = rng(dark ? 62 : 61), cl = th.cloth;
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, dark ? cl[1] : cl[0]); gr.addColorStop(1, dark ? cl[2] : cl[1]); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9; i++) { const x = R() * 256, w = 10 + R() * 26, gg = g.createLinearGradient(x - w, 0, x + w, 0); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, `rgba(0,0,0,${0.12 + R() * 0.15})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(x - w, 0, 2 * w, 256); }
      g.globalAlpha = 0.09; g.fillStyle = '#000'; for (let y = 0; y < 256; y += 2) g.fillRect(0, y, 256, 1); g.fillStyle = '#fff'; g.globalAlpha = 0.05; for (let x = 0; x < 256; x += 2) g.fillRect(x, 0, 1, 256); g.globalAlpha = 1;
      blotch(g, 256, 256, 10, ['rgba(0,0,0,.25)', 'rgba(70,20,10,.2)'], R, 10, 40);
      if (!dark) {
        trimBand(g, 256, 206, 218, th, R, 0); trimBand(g, 256, 226, 230, th, R, 0);
        if (emblem) { boneShape(g, 92, 72, 164, 144, 7, th.trim, 'rgba(10,4,6,.8)'); boneShape(g, 164, 72, 92, 144, 7, th.trim, 'rgba(10,4,6,.8)'); skullShape(g, 128, 104, 22, th.trim, 'rgba(10,4,6,.85)'); }
      }
      const fr = g.createLinearGradient(0, 230, 0, 256); fr.addColorStop(0, 'rgba(0,0,0,0)'); fr.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = fr; g.fillRect(0, 230, 256, 26);
      noisePx(g, 256, 256, 12, R); return c;
    };
    T.cape = cloth(true, false); T.cloth = cloth(false, false); T.clothIn = cloth(false, true);
    // couraça: ferro + caixa torácica em relevo, espinha nas costas e cinto dourado
    [c, g] = mkCanvas(512, 256); R = rng(71); paintMetal(g, 512, 256, R, '#463d40', true);
    const W2 = 512, H2 = 256, zTop = 0.56, zBot = -0.02;
    const U = a => (a / TAU + 0.5) * W2, V = z => (zTop - z) / (zTop - zBot) * H2;
    const bonePat = g.createPattern(T.bone, 'repeat');
    const emboss = (path, lw) => {
      g.save(); g.translate(0, 3); g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = lw + 4; path(); g.stroke(); g.restore();
      g.strokeStyle = bonePat; g.lineWidth = lw; path(); g.stroke();
      g.save(); g.translate(0, -lw * 0.28); g.strokeStyle = 'rgba(255,250,232,.55)'; g.lineWidth = Math.max(1.5, lw * 0.22); path(); g.stroke(); g.restore();
      g.save(); g.translate(0, lw * 0.3); g.strokeStyle = 'rgba(70,45,22,.5)'; g.lineWidth = Math.max(1, lw * 0.15); path(); g.stroke(); g.restore();
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const sx of [U(Math.PI / 2), U(-Math.PI / 2)]) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(sx - 1.5, 0, 3, H2); for (let y = 12; y < H2; y += 22) { g.fillStyle = '#2a2224'; g.beginPath(); g.arc(sx + 7, y, 3.2, 0, TAU); g.fill(); g.fillStyle = '#9a8e88'; g.beginPath(); g.arc(sx + 6, y - 1, 1.3, 0, TAU); g.fill(); } }
    for (const [z0, wa] of [[0.17, 1.0], [0.24, 1.15], [0.31, 1.25], [0.38, 1.3], [0.45, 1.2]]) emboss(() => { g.beginPath(); for (let i = 0; i <= 24; i++) { const a = lerp(-wa, wa, i / 24); const x = U(a), y = V(z0 - 0.05 * a * a); i ? g.lineTo(x, y) : g.moveTo(x, y); } }, 11);
    emboss(() => { g.beginPath(); g.moveTo(U(0), V(0.5)); g.lineTo(U(0), V(0.13)); }, 18);
    emboss(() => { g.beginPath(); g.moveTo(U(-1.2), V(0.5)); g.quadraticCurveTo(U(-0.5), V(0.47), U(0), V(0.5)); g.quadraticCurveTo(U(0.5), V(0.47), U(1.2), V(0.5)); }, 9);
    for (const ox of [0, W2]) {
      for (const [z0, wa] of [[0.2, 0.75], [0.28, 0.85], [0.36, 0.85], [0.44, 0.75]]) emboss(() => { g.beginPath(); for (let i = 0; i <= 12; i++) { const a = lerp(-wa, wa, i / 12); const x = ox + a / TAU * W2, y = V(z0 - 0.03 * a * a); i ? g.lineTo(x, y) : g.moveTo(x, y); } }, 8);
      for (let z = 0.5; z > 0.08; z -= 0.055) { const y = V(z); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(ox - 11, y - 7 + 3, 22, 15); g.fillStyle = bonePat; g.fillRect(ox - 10, y - 7, 20, 13); g.fillStyle = 'rgba(255,250,232,.5)'; g.fillRect(ox - 9, y - 7, 18, 2); }
    }
    trimBand(g, W2, V(0.08), V(0.0), th, R, 24);
    skullShape(g, U(0), V(0.045), 13, '#ece0c4', 'rgba(20,10,6,.9)');
    noisePx(g, W2, H2, 10, R); T.torso = c;
    // crânio do elmo (projeção equirretangular: frente no centro)
    const skull = (jaw) => {
      const [c, g] = mkCanvas(256, 128), R = rng(jaw ? 82 : 81); paintBone(g, 256, 128, R, '#e6d8b8');
      if (!jaw) {
        blotch(g, 256, 128, 4, ['rgba(80,55,30,.35)'], R, 18, 26);
        g.fillStyle = 'rgba(60,40,20,.35)'; g.beginPath(); g.ellipse(128, 58, 44, 9, 0, Math.PI, TAU); g.fill();
        for (const s of [-1, 1]) {
          const x = 128 + s * 23, y = 64;
          const gr = g.createRadialGradient(x, y + 2, 2, x, y, 15); gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#140a06'); gr.addColorStop(1, 'rgba(60,40,22,.6)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 17, 14, s * 0.15, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(40,24,10,.8)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y, 17.5, 14.5, s * 0.15, 0, TAU); g.stroke();
          g.strokeStyle = 'rgba(255,248,226,.75)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y - 1, 19, 16, s * 0.15, 3.5, 5.9); g.stroke();
        }
        g.fillStyle = '#0c0604'; g.beginPath(); g.moveTo(121, 88); g.lineTo(135, 88); g.lineTo(128, 76); g.closePath(); g.fill();
        g.fillStyle = 'rgba(60,40,22,.45)'; g.fillRect(104, 92, 48, 4);
        for (let i = 0; i < 7; i++) { g.fillStyle = '#f0e6cc'; g.fillRect(107 + i * 6.3, 96, 5.4, 10); g.fillStyle = 'rgba(40,25,12,.6)'; g.fillRect(107 + i * 6.3, 104, 5.4, 2); }
        crackLines(g, 256, 60, 5, 'rgba(50,30,15,.7)', R, 1.3);
      } else {
        g.fillStyle = 'rgba(40,25,12,.6)'; g.fillRect(96, 40, 64, 5);
        for (let i = 0; i < 9; i++) { g.fillStyle = '#f2e8d0'; g.fillRect(99 + i * 6.6, 45, 5.6, 13); g.fillStyle = 'rgba(40,25,12,.55)'; g.fillRect(99 + i * 6.6, 45, 5.6, 2); }
      }
      return c;
    };
    T.skull = skull(false); T.jaw = skull(true);
    // ombreira: osso com faixa dourada rebitada
    [c, g] = mkCanvas(256, 128); R = rng(91); paintBone(g, 256, 128, R); trimBand(g, 256, 80, 92, th, R, 18); T.pauldron = c;
    // braçadeira (antebraço) e grevas (canela)
    [c, g] = mkCanvas(128, 128); R = rng(92); paintBone(g, 128, 128, R); trimBand(g, 128, 4, 14, th, R, 16); trimBand(g, 128, 112, 122, th, R, 16); T.bracer = c;
    [c, g] = mkCanvas(128, 128); R = rng(93); paintBone(g, 128, 128, R, '#d4c29c');
    g.fillStyle = '#4a2c1a'; g.fillRect(0, 60, 128, 16); g.fillStyle = 'rgba(255,210,160,.18)'; g.fillRect(0, 60, 128, 2); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 76, 128, 2);
    g.strokeStyle = th.trim; g.lineWidth = 2; g.strokeRect(58, 61, 12, 14); T.greave = c;
    // escudo: frente (raios de osso, crânio central) e verso (tábuas + correias)
    [c, g] = mkCanvas(256, 256); R = rng(101);
    { const cl = th.cloth, gr = g.createRadialGradient(110, 100, 10, 128, 128, 130); gr.addColorStop(0, cl[0]); gr.addColorStop(0.65, cl[1]); gr.addColorStop(1, cl[2]); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.globalAlpha = 0.08; g.fillStyle = '#000'; for (let y = 0; y < 256; y += 2) g.fillRect(0, y, 256, 1); g.globalAlpha = 1;
      const bp = g.createPattern(T.bone, 'repeat'); g.lineCap = 'round';
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, x0 = 128 + Math.cos(a) * 40, y0 = 128 + Math.sin(a) * 40, x1 = 128 + Math.cos(a) * 106, y1 = 128 + Math.sin(a) * 106;
        g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 13; g.beginPath(); g.moveTo(x0 + 2, y0 + 3); g.lineTo(x1 + 2, y1 + 3); g.stroke();
        g.strokeStyle = bp; g.lineWidth = 9; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = 'rgba(255,250,232,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 - 1, y0 - 2); g.lineTo(x1 - 1, y1 - 2); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 22; g.beginPath(); g.arc(129, 131, 114, 0, TAU); g.stroke();
      g.strokeStyle = bp; g.lineWidth = 17; g.beginPath(); g.arc(128, 128, 114, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,250,232,.4)'; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 120, 3.4, 5.6); g.stroke();
      g.strokeStyle = th.trim; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 125, 0, TAU); g.stroke();
      for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; g.fillStyle = th.trimD; g.beginPath(); g.arc(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114, 3, 0, TAU); g.fill(); g.fillStyle = '#fff2cc'; g.beginPath(); g.arc(127 + Math.cos(a) * 114, 127 + Math.sin(a) * 114, 1.2, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(131, 132, 38, 0, TAU); g.fill();
      g.fillStyle = bp; g.beginPath(); g.arc(128, 128, 36, 0, TAU); g.fill();
      skullShape(g, 128, 124, 26, '#ece0c4', 'rgba(14,6,4,.9)');
      for (let i = 0; i < 18; i++) { g.strokeStyle = `rgba(0,0,0,${0.15 + R() * 0.25})`; g.lineWidth = 0.8; const x = R() * 256, y = R() * 256, a = R() * TAU, l = 6 + R() * 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      noisePx(g, 256, 256, 12, R); }
    T.shield = c;
    [c, g] = mkCanvas(256, 256); R = rng(102);
    for (let x = 0; x < 256; x += 32) { g.fillStyle = `rgb(${70 + R() * 20 | 0},${44 + R() * 12 | 0},${26 + R() * 8 | 0})`; g.fillRect(x, 0, 32, 256); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, 0, 2, 256);
      g.strokeStyle = 'rgba(30,15,6,.35)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { const xx = x + 4 + R() * 24; g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + 6, 80, xx - 6, 170, xx + 3, 256); g.stroke(); } }
    for (const y of [86, 158]) { g.drawImage(T.leather, 0, 0, 128, 24, 0, y, 256, 24); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, y + 24, 256, 3); for (const x of [40, 216]) { g.fillStyle = '#1a1416'; g.beginPath(); g.arc(x, y + 12, 5, 0, TAU); g.fill(); g.fillStyle = '#8a7e78'; g.beginPath(); g.arc(x - 1, y + 11, 2, 0, TAU); g.fill(); } }
    noisePx(g, 256, 256, 14, R); T.shieldBack = c;
    // lâmina de fêmur: bordas escuras, canal de medula e runas
    [c, g] = mkCanvas(64, 256); R = rng(111); paintBone(g, 64, 256, R, '#e8dbbc');
    { const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(70,48,25,.55)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(0.75, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(70,48,25,.55)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
      g.fillStyle = 'rgba(30,8,8,.7)'; g.fillRect(29, 8, 6, 200); g.fillStyle = th.cloth[1]; g.fillRect(30, 10, 4, 196);
      g.fillStyle = 'rgba(255,90,60,.5)'; g.fillRect(31, 10, 1, 196);
      g.strokeStyle = 'rgba(60,35,15,.6)'; g.lineWidth = 1.2; for (let y = 24; y < 200; y += 18) { const s = (y / 18) % 2 ? 1 : -1, x = 32 + s * 12; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y + 5); g.moveTo(x + 3, y); g.lineTo(x - 3, y + 8); g.stroke(); } }
    T.blade = c;
    T.theme = th;
    return (TEXCACHE[themeKey] = T);
  }
  const FALLBACK = { bone: '#cdbb94', iron: '#4a4042', gold: '#c9a058', mail: '#3a3234', leather: '#5a3824', cape: '#8a1620', cloth: '#8a1620', clothIn: '#4a0a10', torso: '#463d40', skull: '#d8c8a4', jaw: '#d8c8a4', pauldron: '#d8c8a4', bracer: '#d8c8a4', greave: '#d0be98', shield: '#8a1620', shieldBack: '#5a3a20', blade: '#e0d2b0' };
  // material: brilho especular e dureza por textura
  const SPEC = { iron: [0.55, 28], gold: [0.9, 40], mail: [0.4, 10], bone: [0.18, 12], skull: [0.2, 12], jaw: [0.2, 12], pauldron: [0.25, 14], bracer: [0.25, 14], greave: [0.2, 12], torso: [0.4, 22], leather: [0.08, 8], blade: [0.35, 22], shield: [0.12, 10], shieldBack: [0.05, 8] };

  // versão pré-iluminada de uma textura (nível L de NL): escurece com a sombra da tocha ou aquece na luz
  function shadedTex(TX, k, L, NL) {
    TX._lv = TX._lv || {}; const key = k + '@' + L; if (TX._lv[key]) return TX._lv[key];
    const src = TX[k], [c, g] = mkCanvas(src.width, src.height), f = 0.12 + L / (NL - 1) * 1.13;
    g.drawImage(src, 0, 0);
    if (f < 1) { g.fillStyle = `rgba(12,6,9,${Math.min(0.9, (1 - f) * 0.95)})`; g.fillRect(0, 0, c.width, c.height); }
    else { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,214,160,${Math.min(0.4, (f - 1) * 0.5)})`; g.fillRect(0, 0, c.width, c.height); }
    return (TX._lv[key] = c);
  }

  // matriz afim que leva o espaço da textura (px) ao triângulo na tela
  function uvMatrix(t0, t1, t2, s0, s1, s2) {
    const ux = t1[0] - t0[0], uy = t1[1] - t0[1], vx = t2[0] - t0[0], vy = t2[1] - t0[1], det = ux * vy - vx * uy;
    if (Math.abs(det) < 1e-6) return null;
    const px = s1[0] - s0[0], py = s1[1] - s0[1], qx = s2[0] - s0[0], qy = s2[1] - s0[1];
    const a = (px * vy - qx * uy) / det, c = (qx * ux - px * vx) / det, b = (py * vy - qy * uy) / det, d = (qy * ux - py * vx) / det;
    return [a, b, c, d, s0[0] - a * t0[0] - c * t0[1], s0[1] - b * t0[0] - d * t0[1]];
  }

  Warrior.prototype.setTheme = function (k) { this.theme = THEMES[k] ? k : 'carmesim'; };
  Warrior.THEMES = THEMES;

  // ======================================================================
  //  DESENHO — malhas texturizadas, luz por face, ordenação por profundidade
  // ======================================================================
  Warrior.prototype.draw = function (ctx, x, y, o) {
    o = o || {};
    if (!this.J) this.update(0, {});
    const s = o.scale || this.scale, J = this.J;
    const W = Math.ceil(s * 5.2), H = Math.ceil(s * 4.6), ox = W / 2, oy = H * 0.74;
    this._buf = this._buf || {}; // um par de telas por tamanho (permite desenhar o mesmo herói em várias escalas)
    let bf = this._buf[W]; if (!bf) { bf = this._buf[W] = [document.createElement('canvas'), document.createElement('canvas')]; bf.forEach(k => { k.width = W; k.height = H; }); }
    this.cv = bf[0]; this.sil = bf[1]; this.cx = this.cv.getContext('2d'); this.sx = this.sil.getContext('2d');
    const themeKey = this.theme || 'carmesim', TX = buildTextures(themeKey), th = TX.theme;
    const c = this.cx;
    if (!bf.pat || bf.patTheme !== themeKey) { bf.pat = {}; bf.patTheme = themeKey; }
    // textura já iluminada em NL níveis: uma única pintura por face em vez de textura + sombra
    const NL = 10, PAT = bf.pat;
    const patFor = (k, L) => { const key = k + L; let p = PAT[key]; if (p) return p; const lv = shadedTex(TX, k, L, NL); p = PAT[key] = c.createPattern(lv, 'repeat'); return p; };
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.translate(ox, oy);
    c.lineJoin = c.lineCap = 'round';
    const S = p => proj(p, s);
    const faces = [], glows = [];
    const lowDetail = s < 90; // no tamanho do jogo, menos gomos por malha
    const seg = n => Math.max(5, Math.round(n * (lowDetail ? 0.75 : 1.6)));
    const fwd = J.tF, side = J.tS, upv = J.tU;

    const face = (pts, uv, tex, n, opt) => { opt = opt || {}; let cen = [0, 0, 0]; for (const p of pts) cen = add(cen, p); cen = mul(cen, 1 / pts.length); faces.push({ pts, uv, tex, n, two: opt.two, d: depthOf(cen) + (opt.bias || 0), poly: opt.poly }); };
    const basis = d => { let r = Math.abs(dot(d, fwd)) > 0.9 ? upv : fwd; const e1 = norm(cross(d, r)), e2 = cross(d, e1); return [e1, e2]; };
    // tubo (cilindro com perfil de raio) — membros, cabo, cones de chifres
    const tube = (A, B, prof, sides, tex, opt) => {
      opt = opt || {}; sides = seg(sides);
      const d = norm(sub(B, A)), [e1, e2] = basis(d), rings = [];
      for (const [t, r] of prof) { const C = mix(A, B, t), ring = []; for (let k = 0; k <= sides; k++) { const a = k / sides * TAU + (opt.rot || 0), rd = add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a))); ring.push({ p: add(C, mul(rd, r)), n: rd }); } rings.push({ t, ring }); }
      const ur = opt.uRep || 1, vr = opt.vRep || 1;
      for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < sides; k++) {
        const a = rings[j].ring[k], b = rings[j].ring[k + 1], cc = rings[j + 1].ring[k + 1], dd = rings[j + 1].ring[k];
        const n = norm(add(a.n, b.n));
        face([a.p, b.p, cc.p, dd.p], [[k / sides * ur, rings[j].t * vr], [(k + 1) / sides * ur, rings[j].t * vr], [(k + 1) / sides * ur, rings[j + 1].t * vr], [k / sides * ur, rings[j + 1].t * vr]], tex, n, opt);
      }
    };
    // elipsoide em gomos (latitude/longitude); frente (F) no centro da textura
    const ellip = (C, F, Sd, U, rx, ry, rz, lonN, latN, tex, opt) => {
      opt = opt || {}; lonN = seg(lonN); latN = seg(latN);
      const ph0 = opt.ph0 || 0, ph1 = opt.ph1 || Math.PI, grid = [];
      for (let i = 0; i <= latN; i++) { const ph = lerp(ph0, ph1, i / latN), row = []; for (let j = 0; j <= lonN; j++) { const la = j / lonN * TAU - Math.PI, sp = Math.sin(ph), cp = Math.cos(ph);
        const p = add(C, add(add(mul(U, rz * cp), mul(F, rx * sp * Math.cos(la))), mul(Sd, ry * sp * Math.sin(la))));
        row.push({ p, n: norm(add(add(mul(U, cp / rz), mul(F, sp * Math.cos(la) / rx)), mul(Sd, sp * Math.sin(la) / ry))), uv: [j / lonN, ph / Math.PI] }); } grid.push(row); }
      for (let i = 0; i < latN; i++) for (let j = 0; j < lonN; j++) {
        const a = grid[i][j], b = grid[i][j + 1], cc = grid[i + 1][j + 1], dd = grid[i + 1][j], n = norm(add(add(a.n, b.n), add(cc.n, dd.n)));
        if (i === 0 && ph0 === 0) face([dd.p, cc.p, a.p], [dd.uv, cc.uv, [(a.uv[0] + b.uv[0]) / 2, 0]], tex, n, opt);          // polo norte: triângulo
        else if (i === latN - 1 && ph1 === Math.PI) face([a.p, b.p, dd.p], [a.uv, b.uv, [(dd.uv[0] + cc.uv[0]) / 2, 1]], tex, n, opt); // polo sul
        else face([a.p, b.p, cc.p, dd.p], [a.uv, b.uv, cc.uv, dd.uv], tex, n, opt);
      }
    };
    // malha de anéis (tronco, saiote): normais a partir do eixo
    const ringMesh = (rings, axA, axB, tex, uvV, opt) => {
      const ax = sub(axB, axA), al = dot(ax, ax);
      for (let j = 0; j < rings.length - 1; j++) { const r0 = rings[j], r1 = rings[j + 1], n = r0.length - 1;
        for (let k = 0; k < n; k++) {
          const pts = [r0[k], r0[k + 1], r1[k + 1], r1[k]]; let cen = mul(add(add(pts[0], pts[1]), add(pts[2], pts[3])), 0.25);
          const t = dot(sub(cen, axA), ax) / al, nn = norm(sub(cen, add(axA, mul(ax, t))));
          face(pts, [[k / n, uvV[j]], [(k + 1) / n, uvV[j]], [(k + 1) / n, uvV[j + 1]], [k / n, uvV[j + 1]]], tex, nn, opt);
        } }
    };
    const glow = (P, n, r, rgb, a, bias) => glows.push({ P, n, r, rgb, a, d: depthOf(P) + (bias || 0.02) });

    // ---------------- capa e tabardos (pano físico, dupla face) ----------------
    const clothMesh = (cl, texO, texI, centerRef, ragged) => {
      const P = cl.p; if (!P) return; const { cols, rows } = cl;
      for (let r = 0; r < rows - 1; r++) for (let q = 0; q < cols - 1; q++) {
        const a = P[r * cols + q], b = P[r * cols + q + 1], d = P[(r + 1) * cols + q + 1], e = P[(r + 1) * cols + q];
        const cen = mix(mix(a, b, 0.5), mix(e, d, 0.5), 0.5);
        let n = norm(cross(sub(b, a), sub(e, a))); if (dot(n, sub(cen, centerRef)) < 0) n = mul(n, -1);
        const out = dot(n, CAM) > 0, uv = [[q / (cols - 1), r / (rows - 1)], [(q + 1) / (cols - 1), r / (rows - 1)], [(q + 1) / (cols - 1), (r + 1) / (rows - 1)], [q / (cols - 1), (r + 1) / (rows - 1)]];
        let poly = null;
        if (ragged && r === rows - 2) { poly = [a, b]; const k = 4; for (let i = 0; i <= k; i++) { const t = i / k, p = mix(d, e, t); poly.push(add(p, [0, 0, (i % 2 ? 0.05 : -0.03 - 0.03 * (((q * 7 + i * 3) % 5) / 5))])); } }
        face([a, b, d, e], uv, out ? texO : texI, n, { two: true, bias: -0.015, poly });
      }
    };
    const capeRef = add(J.chest, mul(norm([fwd[0], fwd[1], 0]), 0.35));
    clothMesh(this.cape, 'cape', 'clothIn', [capeRef[0], capeRef[1], J.pel[2]], true);
    clothMesh(this.tabF, 'cloth', 'clothIn', J.pel, true);
    clothMesh(this.tabB, 'cloth', 'clothIn', J.pel, true);

    // ---------------- pernas ----------------
    for (const sd of ['R', 'L']) {
      const hip = J['hip' + sd], kn = J['kn' + sd], an = J['an' + sd], to = J['to' + sd];
      tube(hip, kn, [[0, 0.1], [0.35, 0.106], [0.8, 0.082], [1, 0.076]], 10, 'iron');
      tube(kn, an, [[0, 0.07], [0.25, 0.073], [0.75, 0.053], [1, 0.048]], 10, 'greave', { bias: 0.005 });
      tube(add(an, [0, 0, 0.02]), to, [[0, 0.074], [0.55, 0.07], [1, 0.05]], 8, 'leather', { bias: 0.01 });
      ellip(add(kn, mul(fwd, 0.035)), fwd, side, upv, 0.06, 0.068, 0.07, 8, 5, 'bone', { bias: 0.04 });
      const tA = add(mix(hip, J.pel, -0.6), [0, 0, 0.06]), tB = mix(hip, kn, 0.4);
      tube(tA, tB, [[0, 0.06], [0.6, 0.05], [1, 0.03]], 6, 'bone', { bias: 0.045 });
    }

    // ---------------- tronco: couraça com caixa torácica (textura) + saiote de malha ----------------
    ringMesh(J.hipRings, J.pel, J.neck, 'mail', [0, 0.5, 1], { bias: -0.01 });
    ringMesh(J.torsoRings, J.pel, J.neck, 'torso', J.torsoV);
    ellip(add(J.neck, [0, 0, -0.03]), fwd, side, upv, 0.13, 0.15, 0.085, 12, 6, 'cloth', { bias: 0.005 }); // gola
    glow(J.gemBelt.p, J.gemBelt.n, 0.03, th.gem, 0.9);

    // ---------------- cabeça: elmo-crânio texturizado + maxilar + crista ----------------
    const hd = J.head, F = J.hF, U = J.hU, Sd = J.hS, R = SK.headR;
    ellip(hd, F, Sd, U, R * 1.02, R * 0.95, R * 1.06, 14, 9, 'skull', { bias: 0.01 });
    ellip(add(hd, add(mul(F, 0.055), mul(U, -0.085))), F, Sd, U, 0.085, 0.085, 0.062, 10, 6, 'jaw', { bias: 0.012 });
    const rg = this.rage > 0.05 ? this.rage : 0;
    for (const sgn of [-1, 1]) { const la = sgn * 0.086 * TAU, ph = Math.PI * 0.52; const n = norm(add(add(mul(U, Math.cos(ph)), mul(F, Math.sin(ph) * Math.cos(la))), mul(Sd, Math.sin(ph) * Math.sin(la))));
      const P = add(hd, add(add(mul(U, R * 1.06 * Math.cos(ph)), mul(F, R * 1.02 * Math.sin(ph) * Math.cos(la))), mul(Sd, R * 0.95 * Math.sin(ph) * Math.sin(la))));
      glow(P, n, 0.035 + 0.02 * rg, rg ? [255, 70 + (1 - rg) * 80 | 0, 30] : [255, 200, 120], 0.55 + 0.45 * rg, 0.03); }
    for (let i = 0; i < 7; i++) {
      const a = lerp(0.55, -1.9, i / 6), dv = norm(add(mul(F, Math.sin(a)), mul(U, Math.cos(a))));
      tube(add(hd, mul(dv, R * 0.9)), add(hd, mul(dv, R * (1.36 - 0.04 * Math.abs(i - 2)))), [[0, 0.032], [0.5, 0.022], [1, 0.004]], 6, 'bone', { bias: 0.04 + 0.001 * i, vRep: 0.4 });
    }

    // ---------------- braços e ombreiras ----------------
    for (const sd of ['R', 'L']) {
      const sh = J['sh' + sd], el = J['el' + sd], ha = J['ha' + sd];
      tube(sh, el, [[0, 0.07], [0.4, 0.073], [1, 0.058]], 10, 'mail');
      ellip(el, fwd, side, upv, 0.054, 0.054, 0.054, 8, 5, 'bone', { bias: 0.005 });
      tube(el, ha, [[0, 0.066], [0.6, 0.064], [1, 0.05]], 10, 'bracer', { bias: 0.01 });
      ellip(ha, fwd, side, upv, 0.058, 0.055, 0.058, 8, 5, 'iron', { bias: 0.02 });
      const out = norm(sub(sh, J.neck)), Up = norm(add(mul(out, 0.45), [0, 0, 1])), Fp = norm(cross(out, [0, 0, 1])), Sp = norm(cross(Up, Fp));
      const pc = add(sh, add(mul(out, 0.03), [0, 0, 0.035]));
      ellip(pc, Fp, Sp, Up, 0.135, 0.13, 0.115, 12, 7, 'pauldron', { bias: 0.07, ph1: Math.PI * 0.72 });
      const back = mul(fwd, -1);
      for (let k = 0; k < 3; k++) { const dv = norm(add(add(out, mul(Up, 0.9 - k * 0.25)), mul(back, 0.5 + k * 0.4)));
        tube(add(pc, mul(dv, 0.08)), add(pc, mul(dv, 0.21 - k * 0.025)), [[0, 0.032], [0.6, 0.016], [1, 0.003]], 6, 'bone', { bias: 0.071, vRep: 0.5 }); }
      const gp = add(pc, add(mul(fwd, 0.11), [0, 0, 0.03])); glow(gp, norm(add(fwd, [0, 0, 0.4])), 0.022, th.gem, 0.8, 0.08);
    }

    // ---------------- espada: fêmur de guerra ----------------
    {
      const d = J.dir, e = J.edge, g = J.guard;
      tube(J.pommel, g, [[0, 0.027], [0.5, 0.03], [1, 0.027]], 6, 'leather', { bias: 0.03, vRep: 3 });
      ellip(J.pommel, d, e, cross(d, e), 0.05, 0.046, 0.046, 8, 5, 'bone', { bias: 0.031 });
      tube(add(g, mul(e, 0.15)), add(g, mul(e, -0.15)), [[0, 0.018], [0.2, 0.03], [0.5, 0.036], [0.8, 0.03], [1, 0.018]], 6, 'gold', { bias: 0.032 });
      let nb = cross(d, e); if (dot(nb, CAM) < 0) nb = mul(nb, -1);
      const n = lowDetail ? 6 : 10, L = SK.blade, w0 = 0.062;
      const cpt = i => add(add(g, mul(d, i / n * L)), mul(nb, 0.012 * (1 - i / n)));
      const edge = (i, sgn) => { const t = i / n, w = w0 * (1 - Math.pow(t, 2.2)) + 0.003, ser = sgn < 0 && i % 2 && i < n - 1 ? 1.35 : 1; return add(add(g, mul(d, t * L)), mul(e, sgn * w * ser)); };
      for (let i = 0; i < n; i++) for (const sgn of [1, -1]) {
        const p = [edge(i, sgn), edge(i + 1, sgn), cpt(i + 1), cpt(i)], u0 = sgn > 0 ? 0 : 1;
        let fn = norm(cross(sub(p[1], p[0]), sub(p[3], p[0]))); if (dot(fn, nb) < 0) fn = mul(fn, -1);
        face(p, [[u0, i / n], [u0, (i + 1) / n], [0.5, (i + 1) / n], [0.5, i / n]], 'blade', fn, { two: true, bias: 0.035 });
      }
    }

    // ---------------- escudo: disco abaulado, aro e verso ----------------
    {
      const C = J.shC, N = J.shN, u = norm(sub(J.shU, mul(N, dot(J.shU, N)))), v = cross(N, u), Rr = SK.shieldR, K = seg(20);
      const pt = (r, a, off) => add(add(C, mul(N, off)), add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r)));
      const tuv = (r, a) => [0.5 + 0.5 * r / Rr * Math.cos(a), 0.5 + 0.5 * r / Rr * Math.sin(a)];
      const radii = [[0, 0.04], [0.45 * Rr, 0.03], [0.8 * Rr, 0.014], [Rr, 0]];
      for (const side2 of [1, -1]) {
        const tex = side2 > 0 ? 'shield' : 'shieldBack';
        for (let j = 0; j < radii.length - 1; j++) for (let k = 0; k < K; k++) {
          const a0 = k / K * TAU, a1 = (k + 1) / K * TAU, [r0, o0] = radii[j], [r1, o1] = radii[j + 1];
          const oo0 = side2 > 0 ? o0 : -0.03 - o0 * 0.3, oo1 = side2 > 0 ? o1 : -0.03 - o1 * 0.3;
          const p = [pt(r0, a0, oo0), pt(r1, a0, oo1), pt(r1, a1, oo1), pt(r0, a1, oo0)];
          let fn = norm(cross(sub(p[1], p[0]), sub(p[2], p[0]))); if (dot(fn, N) * side2 < 0) fn = mul(fn, -1);
          if (j === 0) face(p.slice(0, 3), [tuv(r0, a0), tuv(r1, a0), tuv(r1, a1)], tex, fn, { bias: 0.05 }); // miolo: leque de triângulos
          else face(p, [tuv(r0, a0), tuv(r1, a0), tuv(r1, a1), tuv(r0, a1)], tex, fn, { bias: 0.05 });
        }
      }
      for (let k = 0; k < K; k++) { const a0 = k / K * TAU, a1 = (k + 1) / K * TAU;
        face([pt(Rr, a0, 0), pt(Rr, a1, 0), pt(Rr, a1, -0.03), pt(Rr, a0, -0.03)], [[k / K, 0], [(k + 1) / K, 0], [(k + 1) / K, 0.1], [k / K, 0.1]], 'iron', norm(add(mul(u, Math.cos((a0 + a1) / 2)), mul(v, Math.sin((a0 + a1) / 2)))), { bias: 0.05 }); }
    }

    // ---------------- render: ordena, aplica textura (UV afim), luz, especular e contraluz ----------------
    faces.sort((a, b) => a.d - b.d); glows.sort((a, b) => a.d - b.d);
    const Hv = norm(add(LIGHT_W, CAM)), rim = th.rim;
    let gi = 0;
    const drawGlow = gl => {
      const v = dot(gl.n, CAM); if (v < 0.05) return; const q = S(gl.P), r = gl.r * s * 2.2;
      c.save(); c.globalCompositeOperation = 'lighter';
      const gg = c.createRadialGradient(q[0], q[1], 0, q[0], q[1], r); gg.addColorStop(0, `rgba(255,255,230,${gl.a})`); gg.addColorStop(0.25, `rgba(${gl.rgb[0]},${gl.rgb[1]},${gl.rgb[2]},${gl.a})`); gg.addColorStop(1, `rgba(${gl.rgb[0]},${gl.rgb[1]},${gl.rgb[2]},0)`);
      c.fillStyle = gg; c.beginPath(); c.arc(q[0], q[1], r, 0, TAU); c.fill(); c.restore();
    };
    for (const f of faces) {
      while (gi < glows.length && glows[gi].d < f.d) drawGlow(glows[gi++]);
      let n = f.n; const vis = dot(n, CAM);
      if (!f.two && vis < -0.02) continue;
      if (f.two && vis < 0) n = mul(n, -1);
      const sp = (f.poly || f.pts).map(S);
      let cx0 = 0, cy0 = 0; for (const q of sp) { cx0 += q[0]; cy0 += q[1]; } cx0 /= sp.length; cy0 /= sp.length;
      c.beginPath();
      sp.forEach((q, i) => { const dx = q[0] - cx0, dy = q[1] - cy0, l = Math.hypot(dx, dy) || 1, ex = q[0] + dx / l * 0.6, ey = q[1] + dy / l * 0.6; i ? c.lineTo(ex, ey) : c.moveTo(ex, ey); });
      c.closePath();
      const lit = 0.44 + 0.72 * Math.max(0, dot(n, LIGHT_W)) + 0.1 * n[2] + (f.tex === 'skull' || f.tex === 'jaw' ? 0.12 : 0);
      const img = TX[f.tex], pat = patFor(f.tex, clamp(Math.round((lit - 0.12) / 1.13 * (NL - 1)), 0, NL - 1));
      const S0 = S(f.pts[0]), S1 = S(f.pts[1]), S3 = S(f.pts[f.pts.length - 1]);
      const M = uvMatrix([f.uv[0][0] * img.width, f.uv[0][1] * img.height], [f.uv[1][0] * img.width, f.uv[1][1] * img.height], [f.uv[f.pts.length - 1][0] * img.width, f.uv[f.pts.length - 1][1] * img.height], S0, S1, S3);
      if (M && pat.setTransform) { pat.setTransform(new DOMMatrix(M)); c.fillStyle = pat; } else c.fillStyle = FALLBACK[f.tex];
      c.fill();
      // luz: ambiente + difusa (tocha) + céu, depois especular e contraluz colorido
      const spc = SPEC[f.tex], hs = spc ? spc[0] * Math.pow(Math.max(0, dot(n, Hv)), spc[1]) : 0;
      const rm = Math.pow(1 - clamp(dot(n, CAM), 0, 1), 3) * Math.max(0, -dot(n, LIGHT_W) + 0.3) * 0.55;
      if (hs > 0.05 || rm > 0.05) { // especular e contraluz colorido
        c.globalCompositeOperation = 'lighter';
        if (hs > 0.05) { c.fillStyle = `rgba(255,246,228,${Math.min(0.85, hs).toFixed(2)})`; c.fill(); }
        if (rm > 0.05) { c.fillStyle = `rgba(${rim[0]},${rim[1]},${rim[2]},${Math.min(0.5, rm).toFixed(2)})`; c.fill(); }
        c.globalCompositeOperation = 'source-over';
      }
    }
    while (gi < glows.length) drawGlow(glows[gi++]);
    // grão de pintura (combina com o cenário pintado do jogo)
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.16;
    c.fillStyle = c.createPattern(grain(), 'repeat'); c.fillRect(0, 0, W, H);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // --- composição no contexto do jogo ---
    const alpha = o.alpha == null ? 1 : o.alpha;
    ctx.save(); ctx.globalAlpha *= alpha;
    // sombra no chão (acompanha o corpo, inclusive na queda)
    const pc = proj([J.pel[0], J.pel[1], 0], s), shW = (this.action && this.action.name === 'morte' ? 0.75 : 0.42) * s;
    const sg = ctx.createRadialGradient(x + pc[0], y + pc[1], 0, x + pc[0], y + pc[1], shW);
    sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x + pc[0], y + pc[1], shW, shW * 0.5, 0, 0, TAU); ctx.fill();
    this.drawFx(ctx, x, y, s, true);
    // silhueta (contorno de tinta + brilho de raridade/fúria)
    const sx = this.sx; sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, W, H); sx.drawImage(this.cv, 0, 0); sx.globalCompositeOperation = 'source-in';
    const glowCol = o.rarity || (this.rage > 0.05 ? `rgba(255,60,30,${(0.35 + 0.5 * this.rage).toFixed(2)})` : null);
    if (glowCol) {
      sx.fillStyle = glowCol; sx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = glowCol; ctx.shadowBlur = s * 0.22; ctx.globalAlpha *= 0.55 + 0.15 * Math.sin(this.t * 4);
      ctx.drawImage(this.sil, x - ox, y - oy); ctx.restore();
      sx.globalCompositeOperation = 'source-in';
    }
    sx.fillStyle = INK; sx.fillRect(0, 0, W, H);
    const ow = Math.max(1, s * 0.022);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.drawImage(this.sil, x - ox + Math.cos(a) * ow, y - oy + Math.sin(a) * ow); }
    ctx.drawImage(this.cv, x - ox, y - oy);
    // lampejo de dano
    if (o.hurt > 0) { sx.fillStyle = `rgba(255,${(200 - 160 * o.hurt) | 0},${(180 - 160 * o.hurt) | 0},1)`; sx.fillRect(0, 0, W, H); ctx.globalAlpha = alpha * 0.7 * o.hurt; ctx.drawImage(this.sil, x - ox, y - oy); ctx.globalAlpha = alpha; }
    this.drawTrail(ctx, x, y, s, o.rarity);
    this.drawFx(ctx, x, y, s, false);
    ctx.restore();
  };

  Warrior.prototype.drawTrail = function (ctx, x, y, s, rar) {
    const T = this.trail; if (T.length < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const col = rar || '#ffd9a0', life = 0.16;
    for (let i = 1; i < T.length; i++) {
      const a = T[i - 1], b = T[i], f = clamp(1 - (this.t - b.t) / life, 0, 1);
      const A1 = proj(a.tip, s), A2 = proj(a.mid, s), B1 = proj(b.tip, s), B2 = proj(b.mid, s);
      const g = ctx.createLinearGradient(x + (A1[0] + B1[0]) / 2, y + (A1[1] + B1[1]) / 2, x + (A2[0] + B2[0]) / 2, y + (A2[1] + B2[1]) / 2);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = f * f * 0.5; ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x + A1[0], y + A1[1]); ctx.lineTo(x + B1[0], y + B1[1]); ctx.lineTo(x + B2[0], y + B2[1]); ctx.lineTo(x + A2[0], y + A2[1]); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = f * 0.85; ctx.strokeStyle = '#fff4dc'; ctx.lineWidth = Math.max(1, s * 0.012 * (0.4 + f)); ctx.beginPath(); ctx.moveTo(x + A1[0], y + A1[1]); ctx.lineTo(x + B1[0], y + B1[1]); ctx.stroke();
    }
    ctx.restore();
  };

  Warrior.prototype.drawFx = function (ctx, x, y, s, ground) {
    for (const f of this.fx) {
      if (f.t < 0) continue;
      const k = f.t / f.life;
      if (f.k === 'ring' && ground) {
        const q = proj(f.at, s), r = f.r * s * (0.2 + 0.8 * Math.sqrt(k));
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${f.col},${(1 - k) * 0.9})`; ctx.lineWidth = s * 0.08 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(x + q[0], y + q[1], r, r * 0.5, 0, 0, TAU); ctx.stroke();
        const g = ctx.createRadialGradient(x + q[0], y + q[1], 0, x + q[0], y + q[1], r);
        g.addColorStop(0, `rgba(${f.col},${(1 - k) * 0.35})`); g.addColorStop(1, `rgba(${f.col},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + q[0], y + q[1], r, r * 0.5, 0, 0, TAU); ctx.fill();
        ctx.restore();
        if (f.crack) { // rachaduras no chão
          ctx.save(); ctx.strokeStyle = `rgba(20,10,8,${0.8 * (1 - k)})`; ctx.lineWidth = Math.max(1, s * 0.025);
          for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3; ctx.beginPath(); ctx.moveTo(x + q[0], y + q[1]); const l = s * (0.4 + (i % 3) * 0.15); ctx.lineTo(x + q[0] + Math.cos(a) * l * 0.6, y + q[1] + Math.sin(a) * l * 0.3 + 2); ctx.lineTo(x + q[0] + Math.cos(a + 0.2) * l, y + q[1] + Math.sin(a + 0.2) * l * 0.5); ctx.stroke(); }
          ctx.restore();
        }
      }
      if (f.k === 'shard' && !ground) {
        const q = proj(f.p, s);
        ctx.save(); ctx.translate(x + q[0], y + q[1]); ctx.rotate(f.rot); ctx.globalAlpha *= clamp((f.life - f.t) * 3, 0, 1);
        ctx.fillStyle = MAT.bone.base; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-f.sz * s, 0); ctx.lineTo(0, -f.sz * s * 0.4); ctx.lineTo(f.sz * s, 0); ctx.lineTo(0, f.sz * s * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Ponte opcional com o estado do jogo "O Atlas Perdido" (objeto P / G).
  Warrior.prototype.syncFromGame = function (P, G, dt) {
    const fac = Math.atan2(P.dirY || 0, P.dirX || 1);
    const a = P.artAction, live = a && G.t - a.start < a.duration;
    if (live && (!this._lastA || this._lastA !== a.start)) {
      this._lastA = a.start;
      const map = { golpe: 'golpe', esmagar: 'esmagar', investida: 'investida', brado: 'brado', redemoinho: 'redemoinho' };
      if (map[a.id]) {
        if (a.id === 'golpe') { this.combo = (P.combo || 1) - 1; this.comboT = 1; }
        this.play(map[a.id], { dur: a.duration, force: true });
      }
    }
    if (P.roll && !(this.action && this.action.name === 'rolar')) this.play('rolar', { dur: 0.32 });
    if (P.hurtT > 0.25 && !(this.action && this.action.name === 'dano') && !this.busy()) this.play('dano');
    if (P.dead && !this.dead) this.play('morte');
    if (!P.dead && this.dead) this.play('reviver');
    this.update(dt, { moving: P.moving, facing: fac, phase: P.walk * 1.7 / 8 * TAU, vx: (P.vx || 0) / 100, vy: (P.vy || 0) / 100 });
  };

  root.GuerreiroOsseo = { create: o => new Warrior(o), Warrior, MAT, project: proj };
})(typeof window !== 'undefined' ? window : globalThis);
