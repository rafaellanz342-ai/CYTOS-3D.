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
  function shadeHex(m, k) { // tom contínuo do material: 0 = sombra profunda, 1 = luz
    const st = [m.deep, m.sh, m.mid, m.base, m.hi].map(hex), x = clamp(k, 0, 1) * 3.2, i = Math.min(3, Math.floor(x)), f = Math.min(1, x - i);
    const a = st[i], b = st[i + 1]; return `rgb(${lerp(a[0], b[0], f) | 0},${lerp(a[1], b[1], f) | 0},${lerp(a[2], b[2], f) | 0})`;
  }
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
    this.cape = new Cloth(5, 6, 0.16); this.cape.rest = [0.15, 0.15, 0.15, 0.15];
    this.tabF = new Cloth(3, 4, 0.1); this.tabF.rest = [0.08, 0.08];
    this.tabB = new Cloth(3, 4, 0.1); this.tabB.rest = [0.08, 0.08];
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
    L.capeA = []; for (let c = 0; c < 5; c++) L.capeA.push(tp([-0.13 - 0.06 * Math.sin(c / 4 * Math.PI), lerp(0.29, -0.29, c / 4), SK.torso - 0.05]));
    L.tabFA = [-1, 0, 1].map(s => tp([0.17, s * 0.09, -0.02])); L.tabBA = [-1, 0, 1].map(s => tp([-0.16, s * 0.09, -0.02]));
    // anéis do tronco (seções elípticas → silhueta convexa)
    const ring = (z, rx, ry, M, o) => { const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; pts.push(add(o, mv(M, [rx * Math.cos(a), ry * Math.sin(a), z]))); } return pts; };
    L.torsoPts = [].concat(ring(0.06, 0.145, 0.17, T, pel), ring(0.22, 0.155, 0.2, T, pel), ring(0.36, 0.17, 0.235, T, pel), ring(0.47, 0.13, 0.22, T, pel));
    L.hipPts = [].concat(ring(-0.1, 0.14, 0.185, Pm, pel), ring(0.04, 0.145, 0.17, T, pel));
    // costelas e cinto (pontos na superfície + normais)
    L.ribs = [];
    for (const [z, w] of [[0.2, 1.05], [0.27, 1.2], [0.34, 1.3], [0.41, 1.3]]) {
      const pts = []; for (let i = 0; i <= 12; i++) { const a = lerp(-w, w, i / 12), rz = z - 0.05 * a * a; const rx = 0.172, ry = 0.228;
        pts.push({ p: tp([rx * Math.cos(a) + 0.008, ry * Math.sin(a), rz]), n: norm(tv([Math.cos(a) / rx, Math.sin(a) / ry, 0])) }); }
      L.ribs.push(pts);
    }
    L.sternum = [0.17, 0.3, 0.45].map(z => ({ p: tp([0.18, 0, z]), n: norm(tv([1, 0, 0])) }));
    L.belt = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU; L.belt.push({ p: tp([0.158 * Math.cos(a), 0.185 * Math.sin(a), 0.035]), n: norm(tv([Math.cos(a), Math.sin(a), 0])) }); }
    L.buckle = { p: tp([0.165, 0, 0.035]), n: norm(tv([1, 0, 0])) };
    // pescoço/capuz
    L.cowl = tp([0.0, 0, SK.torso + 0.02]);
    this.L = L; this.T = T;
    this.toWorld(p);
  };

  Warrior.prototype.local2world = function (v) { const a = this.facing; return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]]; };

  Warrior.prototype.toWorld = function (p) {
    const pit = Ry(p.rPitch), yaw = this.facing + p.rYaw, c = Math.cos(yaw), s = Math.sin(yaw);
    const piv = p.pivZ;
    const P = v => { let q = [v[0], -v[1], v[2] - piv]; q = mv(pit, q); q = [q[0] + p.rootX, q[1], q[2] + piv + p.rZ]; return [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]]; };
    const V = v => { let q = mv(pit, [v[0], -v[1], v[2]]); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]]; };
    const J = {}, L = this.L;
    for (const k in L) {
      const v = L[k];
      if (k === 'hF' || k === 'hU' || k === 'hS' || k === 'dir' || k === 'edge' || k === 'shN' || k === 'shU') J[k] = V(v);
      else if (k === 'ribs') J[k] = v.map(r => r.map(o => ({ p: P(o.p), n: V(o.n) })));
      else if (k === 'sternum' || k === 'belt') J[k] = v.map(o => ({ p: P(o.p), n: V(o.n) }));
      else if (k === 'buckle') J[k] = { p: P(v.p), n: V(v.n) };
      else if (Array.isArray(v[0])) J[k] = v.map(P);
      else J[k] = P(v);
    }
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
  //  DESENHO
  // ======================================================================
  function gradAlong(c, cx, cy, nx, ny, r, m, spec) {
    const g = c.createLinearGradient(cx + nx * r, cy + ny * r, cx - nx * r, cy - ny * r);
    g.addColorStop(0, m.hi); g.addColorStop(spec ? 0.18 : 0.12, m.base); g.addColorStop(0.5, m.mid); g.addColorStop(0.82, m.sh); g.addColorStop(1, m.deep);
    return g;
  }

  Warrior.prototype.draw = function (ctx, x, y, o) {
    o = o || {};
    if (!this.J) this.update(0, {});
    const s = o.scale || this.scale, J = this.J;
    const W = Math.ceil(s * 5.2), H = Math.ceil(s * 4.6), ox = W / 2, oy = H * 0.74;
    this._buf = this._buf || {}; // um par de telas por tamanho (permite desenhar o mesmo herói em várias escalas)
    let bf = this._buf[W]; if (!bf) { bf = this._buf[W] = [document.createElement('canvas'), document.createElement('canvas')]; bf.forEach(k => { k.width = W; k.height = H; }); }
    this.cv = bf[0]; this.sil = bf[1]; this.cx = this.cv.getContext('2d'); this.sx = this.sil.getContext('2d');
    const c = this.cx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.translate(ox, oy);
    c.lineJoin = c.lineCap = 'round';
    const S = p => proj(p, s);
    const prims = [];
    const push = (d, f) => prims.push({ d, f });
    const self = this;

    // --- primitivas ---
    const capsule = (A, B, ra, rb, m, bias) => push(depthOf(mix(A, B, 0.5)) + (bias || 0), () => {
      const a = S(A), b = S(B), Ra = ra * s, Rb = rb * s; let dx = b[0] - a[0], dy = b[1] - a[1]; const dl = Math.hypot(dx, dy);
      if (dl < 0.5) { sphere2D(a[0], a[1], Math.max(Ra, Rb), m); return; }
      dx /= dl; dy /= dl; let nx = -dy, ny = dx; if (nx * LIGHT_S[0] + ny * LIGHT_S[1] < 0) { nx = -nx; ny = -ny; }
      const ang = Math.atan2(dy, dx);
      c.beginPath(); c.arc(a[0], a[1], Ra, ang + Math.PI / 2, ang - Math.PI / 2); c.arc(b[0], b[1], Rb, ang - Math.PI / 2, ang + Math.PI / 2); c.closePath();
      c.fillStyle = gradAlong(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, nx, ny, Math.max(Ra, Rb), m, true); c.fill();
      c.strokeStyle = m.deep; c.globalAlpha = 0.55; c.lineWidth = Math.max(0.6, s * 0.012); c.stroke(); c.globalAlpha = 1;
    });
    function sphere2D(x0, y0, R, m) {
      const g = c.createRadialGradient(x0 + LIGHT_S[0] * R * 0.45, y0 + LIGHT_S[1] * R * 0.45, R * 0.05, x0, y0, R);
      g.addColorStop(0, m.hi); g.addColorStop(0.25, m.base); g.addColorStop(0.65, m.mid); g.addColorStop(0.9, m.sh); g.addColorStop(1, m.deep);
      c.fillStyle = g; c.beginPath(); c.arc(x0, y0, R, 0, TAU); c.fill();
    }
    const sphere = (P, r, m, bias, after) => push(depthOf(P) + (bias || 0), () => { const q = S(P); sphere2D(q[0], q[1], r * s, m); if (after) after(q); });
    const visible = n => dot(n, CAM);
    const hull = pts => { // cadeia monotônica
      const p = pts.map(S).sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
      for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
      up.pop(); lo.pop(); return lo.concat(up);
    };
    const fillHull = (h, m) => {
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; for (const q of h) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]); }
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, r = Math.max(maxx - minx, maxy - miny) / 2;
      c.beginPath(); h.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
      c.fillStyle = gradAlong(c, cx, cy, LIGHT_S[0], LIGHT_S[1], r, m); c.fill();
      c.strokeStyle = m.deep; c.globalAlpha = 0.6; c.lineWidth = Math.max(0.6, s * 0.012); c.stroke(); c.globalAlpha = 1;
    };
    const strokeSurf = (pts, w, m, minVis) => { // traço na superfície, só nos trechos virados para a câmera
      for (const pass of [[m.deep, 1.7], [m.base, 1], [m.hi, 0.35]]) {
        c.strokeStyle = pass[0]; c.lineWidth = w * s * pass[1];
        c.beginPath(); let on = false;
        for (const o of pts) { const v = visible(o.n); const q = S(o.p); const yo = pass[0] === m.hi ? -w * s * 0.3 : 0;
          if (v > (minVis || 0.02)) { if (on) c.lineTo(q[0], q[1] + yo); else c.moveTo(q[0], q[1] + yo); on = true; } else on = false; }
        c.stroke();
      }
    };

    // --- capa (atrás) e tabardo ---
    const cloth = (cl, outer, inner, ragged, centerRef) => {
      const P = cl.p; if (!P) return; const { cols, rows } = cl;
      for (let r = 0; r < rows - 1; r++) for (let q = 0; q < cols - 1; q++) {
        const a = P[r * cols + q], b = P[r * cols + q + 1], d = P[(r + 1) * cols + q + 1], e = P[(r + 1) * cols + q];
        const cen = mix(mix(a, b, 0.5), mix(e, d, 0.5), 0.5);
        let n = norm(cross(sub(b, a), sub(e, a))); const outward = dot(n, sub(cen, centerRef)) > 0 ? 1 : -1; n = mul(n, outward);
        const facing = visible(n) > 0, m = facing ? outer : inner;
        const lit = clamp(0.5 + 0.5 * dot(facing ? n : mul(n, -1), LIGHT_W), 0, 1);
        const last = r === rows - 2;
        push(depthOf(cen) - 0.02, () => {
          const A = S(a), B = S(b), D = S(d), E = S(e);
          c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]);
          if (last && ragged) { // barra esfarrapada
            const k = 4; for (let i = 0; i <= k; i++) { const t = i / k, x0 = lerp(D[0], E[0], t), y0 = lerp(D[1], E[1], t); const j = ((q * 7 + i * 3) % 5) / 5; c.lineTo(x0, y0 + (i % 2 ? -0.06 : 0.05 + 0.05 * j) * s); }
          } else { c.lineTo(D[0], D[1]); c.lineTo(E[0], E[1]); }
          c.closePath();
          const col = shadeHex(m, lit - r * 0.06);
          c.fillStyle = col; c.fill(); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke();
          if (facing && q === 1) { c.strokeStyle = m.sh; c.globalAlpha = 0.35; c.lineWidth = Math.max(0.6, s * 0.012); c.beginPath(); c.moveTo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2); c.lineTo((E[0] + D[0]) / 2, (E[1] + D[1]) / 2); c.stroke(); c.globalAlpha = 1; }
        });
      }
    };
    const capeMid = add(J.chest, mul(norm([J.chest[0] - J.capeA[2][0], J.chest[1] - J.capeA[2][1], 0]), 0.3));
    cloth(this.cape, MAT.blood, { hi: '#5a1016', base: '#4a0c12', mid: '#3a070c', sh: '#22040a', deep: '#120204' }, true, [capeMid[0], capeMid[1], J.pel[2]]);
    cloth(this.tabF, MAT.blood, MAT.blood, true, J.pel);
    cloth(this.tabB, MAT.blood, MAT.blood, true, J.pel);

    // --- pernas ---
    for (const sd of ['R', 'L']) {
      capsule(J['hip' + sd], J['kn' + sd], 0.095, 0.075, MAT.iron);
      capsule(J['kn' + sd], J['an' + sd], 0.064, 0.044, MAT.boneD, 0.01);
      capsule(mix(J['kn' + sd], J['an' + sd], 0.55), mix(J['kn' + sd], J['an' + sd], 0.62), 0.058, 0.054, MAT.leather, 0.012);
      capsule(add(J['an' + sd], [0, 0, 0.02]), J['to' + sd], 0.072, 0.058, MAT.leather, 0.02);
      sphere(add(J['kn' + sd], mul(this.local2world([1, 0, 0]), 0.03)), 0.066, MAT.bone, 0.06); // patela
    }
    // tassetes de osso nos quadris
    for (const sd of ['R', 'L']) { const h = J['hip' + sd], k = J['kn' + sd]; capsule(add(mix(h, J.pel, -0.6), [0, 0, 0.06]), mix(h, k, 0.38), 0.06, 0.035, MAT.boneD, 0.05); }

    // --- tronco ---
    push(depthOf(J.pel) - 0.01, () => fillHull(hull(J.hipPts), MAT.iron));
    push(depthOf(J.chest), () => {
      fillHull(hull(J.torsoPts), MAT.iron);
      // couraça de costelas
      strokeSurf(J.sternum, 0.035, MAT.bone, 0);
      for (const r of J.ribs) strokeSurf(r, 0.024, MAT.bone);
      strokeSurf(J.belt, 0.03, MAT.gold, -0.05);
      if (visible(J.buckle.n) > 0.1) { const q = S(J.buckle.p); sphere2D(q[0], q[1], 0.045 * s, MAT.bone); c.fillStyle = MAT.bone.deep; c.beginPath(); c.arc(q[0] - 0.015 * s, q[1] - 0.005 * s, 0.01 * s, 0, TAU); c.arc(q[0] + 0.015 * s, q[1] - 0.005 * s, 0.01 * s, 0, TAU); c.fill(); }
    });
    // gola/capuz carmesim
    sphere(add(J.cowl, [0, 0, -0.02]), 0.105, MAT.blood, 0.0);

    // --- cabeça: elmo-crânio com crista de vértebras ---
    const hd = J.head, F = J.hF, U = J.hU, Sd = J.hS, R = SK.headR;
    const eyesGlow = this.rage > 0.05 ? this.rage : 0;
    sphere(hd, R, MAT.bone, 0.03, () => {
      // máscara (maxilar) e órbitas
      const fv = visible(F);
      const face = (lx, ly, lz) => add(hd, add(add(mul(F, lx * R), mul(Sd, ly * R)), mul(U, lz * R)));
      if (fv > -0.25) {
        const jaw = S(face(0.55, 0, -0.55)); sphere2D(jaw[0], jaw[1], R * 0.62 * s, MAT.boneD);
        const v = visible(norm(add(F, mul(U, -0.3))));
        if (v > 0) { // dentes
          c.strokeStyle = MAT.bone.deep; c.lineWidth = Math.max(0.6, s * 0.008); c.beginPath();
          for (let i = -2; i <= 2; i++) { const a = S(face(0.86, i * 0.13, -0.55)), b = S(face(0.8, i * 0.13, -0.78)); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
          c.stroke();
        }
      }
      for (const sy of [-0.38, 0.38]) {
        const n = norm(add(F, mul(Sd, sy * 1.1))), v = visible(n); if (v <= 0.02) continue;
        const q = S(face(0.86, sy, 0.02)), rr = R * 0.24 * s;
        c.save(); c.translate(q[0], q[1]); c.scale(Math.max(0.25, v), 1);
        c.fillStyle = INK; c.beginPath(); c.ellipse(0, 0, rr, rr * 1.15, 0, 0, TAU); c.fill();
        const gc = eyesGlow ? `rgba(255,${90 - 60 * eyesGlow | 0},40,` : 'rgba(255,214,140,';
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rr * 0.9); g.addColorStop(0, gc + (0.85) + ')'); g.addColorStop(1, gc + '0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, rr * 0.1, rr * 0.9, 0, TAU); c.fill(); c.restore();
      }
      if (fv > 0.1) { const n1 = S(face(0.95, -0.08, -0.25)), n2 = S(face(0.95, 0.08, -0.25)), n3 = S(face(0.98, 0, -0.08));
        c.fillStyle = INK; c.beginPath(); c.moveTo(n1[0], n1[1]); c.lineTo(n2[0], n2[1]); c.lineTo(n3[0], n3[1]); c.closePath(); c.fill(); }
    });
    for (let i = 0; i < 7; i++) { // crista de vértebras: da testa à nuca
      const a = lerp(0.55, -1.9, i / 6), dirv = norm(add(mul(F, Math.sin(a)), mul(U, Math.cos(a))));
      const base = add(hd, mul(dirv, R * 0.98)), top = add(hd, mul(dirv, R * (1.32 - 0.04 * Math.abs(i - 2))));
      capsule(base, top, 0.03, 0.012, MAT.bone, 0.04 + 0.001 * i);
    }

    // --- braços ---
    const arm = sd => {
      capsule(J['sh' + sd], J['el' + sd], 0.066, 0.056, MAT.iron);
      sphere(J['el' + sd], 0.052, MAT.boneD, 0.005);
      capsule(J['el' + sd], J['ha' + sd], 0.064, 0.05, MAT.bone, 0.01);
      sphere(J['ha' + sd], 0.056, MAT.leather, 0.02);
      // ombreira: osso redondo com chifres
      const out = norm(sub(J['sh' + sd], J.neck)), up = [0, 0, 1];
      const pc = add(J['sh' + sd], add(mul(out, 0.03), mul(up, 0.04)));
      sphere(pc, 0.125, MAT.bone, 0.07, q => {
        c.strokeStyle = MAT.gold.mid; c.lineWidth = Math.max(1, s * 0.02); c.beginPath(); c.arc(q[0], q[1] + 0.02 * s, 0.11 * s, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        c.strokeStyle = MAT.bone.sh; c.lineWidth = Math.max(0.6, s * 0.008); c.beginPath(); c.moveTo(q[0] - 0.05 * s, q[1] - 0.04 * s); c.lineTo(q[0] - 0.01 * s, q[1] - 0.01 * s); c.lineTo(q[0] - 0.03 * s, q[1] + 0.03 * s); c.stroke();
      });
      for (let k = 0; k < 3; k++) {
        const back = mul(self.local2world([-1, 0, 0]), 0.5 + k * 0.4);
        const dv = norm(add(add(out, mul(up, 0.9 - k * 0.25)), back));
        capsule(add(pc, mul(dv, 0.09)), add(pc, mul(dv, 0.2 - k * 0.025)), 0.03, 0.006, MAT.boneD, 0.071);
      }
    };
    arm('R'); arm('L');

    // --- espada: fêmur de guerra ---
    {
      const d = J.dir, e = J.edge, g = J.guard, tip = J.tip;
      capsule(J.pommel, J.guard, 0.026, 0.026, MAT.leather, 0.03);
      sphere(J.pommel, 0.05, MAT.bone, 0.031);              // cabeça do fêmur
      capsule(add(g, mul(e, 0.13)), add(g, mul(e, -0.13)), 0.03, 0.03, MAT.gold, 0.032);
      const bladeD = depthOf(mix(g, tip, 0.45)) + 0.03;
      push(bladeD, () => {
        const w0 = 0.06, pts = [];
        const n = 9;
        for (let i = 0; i <= n; i++) { const t = i / n, w = w0 * (1 - Math.pow(t, 2.2)) + 0.004; pts.push(add(add(g, mul(d, t * SK.blade)), mul(e, w))); }
        const back = []; for (let i = n; i >= 0; i--) { const t = i / n, w = w0 * (1 - Math.pow(t, 2.2)) + 0.004; back.push(add(add(g, mul(d, t * SK.blade)), mul(e, -w * (i % 2 && i < n - 1 ? 1.35 : 1)))); } // lado serrilhado
        const A = pts.map(S), B = back.map(S), G = S(g), Tp = S(tip);
        const nrm = cross(d, e), lit = visible(nrm) > 0 ? nrm : mul(nrm, -1), sh = clamp(0.5 + 0.5 * dot(lit, LIGHT_W), 0, 1);
        const m = MAT.bone;
        c.beginPath(); A.concat(B).forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
        const gr = c.createLinearGradient(G[0], G[1], Tp[0], Tp[1]); gr.addColorStop(0, sh > 0.5 ? m.base : m.mid); gr.addColorStop(0.6, sh > 0.5 ? m.hi : m.base); gr.addColorStop(1, m.mid);
        c.fillStyle = gr; c.fill(); c.strokeStyle = m.deep; c.lineWidth = Math.max(0.7, s * 0.012); c.stroke();
        // fio central (bisel) e canal de medula
        c.beginPath(); const c0 = S(add(g, mul(d, 0.04))), c1 = S(add(g, mul(d, SK.blade * 0.82))); c.moveTo(c0[0], c0[1]); c.lineTo(c1[0], c1[1]);
        c.strokeStyle = m.sh; c.lineWidth = Math.max(0.8, s * 0.016); c.stroke();
        c.strokeStyle = 'rgba(138,22,32,.75)'; c.lineWidth = Math.max(0.5, s * 0.006); c.stroke();
      });
    }

    // --- escudo redondo: rodela de raios ósseos com crânio central ---
    {
      const C = J.shC, N = J.shN; let u = norm(sub(J.shU, mul(N, dot(J.shU, N)))); const v = cross(N, u), Rr = SK.shieldR;
      const ringP = (r, off) => { const pts = []; for (let i = 0; i < 30; i++) { const a = i / 30 * TAU; pts.push(add(add(C, mul(N, off || 0)), add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r)))); } return pts.map(S); };
      const front = visible(N) > 0;
      const poly = pts => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); };
      push(depthOf(C) + 0.05, () => {
        poly(ringP(Rr, front ? -0.035 : 0.035)); c.fillStyle = MAT.iron.sh; c.fill(); // espessura
        const outer = ringP(Rr, 0), cq = S(C);
        poly(outer);
        if (front) {
          const g = c.createRadialGradient(cq[0] + LIGHT_S[0] * Rr * s * 0.4, cq[1] + LIGHT_S[1] * Rr * s * 0.4, 0, cq[0], cq[1], Rr * s * 1.1);
          g.addColorStop(0, MAT.blood.base); g.addColorStop(0.7, MAT.blood.mid); g.addColorStop(1, MAT.blood.sh); c.fillStyle = g; c.fill();
          // raios de osso
          c.lineCap = 'round';
          for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, p0 = S(add(C, add(mul(u, Math.cos(a) * Rr * 0.3), mul(v, Math.sin(a) * Rr * 0.3)))), p1 = S(add(C, add(mul(u, Math.cos(a) * Rr * 0.86), mul(v, Math.sin(a) * Rr * 0.86))));
            c.strokeStyle = MAT.bone.sh; c.lineWidth = s * 0.03; c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
            c.strokeStyle = MAT.bone.base; c.lineWidth = s * 0.017; c.stroke(); }
          poly(ringP(Rr * 0.93, 0.004)); c.strokeStyle = MAT.bone.sh; c.lineWidth = s * 0.06; c.stroke(); c.strokeStyle = MAT.bone.base; c.lineWidth = s * 0.04; c.stroke();
          poly(outer); c.strokeStyle = MAT.gold.mid; c.lineWidth = s * 0.014; c.stroke();
          // crânio central (bossa)
          const bq = S(add(C, mul(N, 0.03))), vis = visible(N);
          c.save(); c.translate(bq[0], bq[1]);
          sphere2D(0, 0, Rr * 0.3 * s, MAT.bone);
          const eu = proj(u, 1), ev = proj(v, 1); // órbitas no plano do escudo
          for (const sx of [-1, 1]) { const ex = (ev[0] * sx * 0.1 + eu[0] * 0.04) * s, ey = (ev[1] * sx * 0.1 + eu[1] * 0.04) * s; c.fillStyle = INK; c.beginPath(); c.ellipse(ex, ey, Rr * 0.075 * s * Math.max(0.35, vis), Rr * 0.08 * s, Math.atan2(ev[1], ev[0]), 0, TAU); c.fill(); }
          c.restore();
        } else {
          c.fillStyle = MAT.leather.mid; c.fill(); c.strokeStyle = MAT.iron.base; c.lineWidth = s * 0.03; c.stroke();
          const a1 = S(add(C, mul(u, Rr * 0.7))), a2 = S(add(C, mul(u, -Rr * 0.7))); c.strokeStyle = MAT.leather.sh; c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.stroke();
        }
      });
    }

    // --- render na tela própria (painter's algorithm) ---
    prims.sort((a, b) => a.d - b.d);
    for (const p of prims) p.f();
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
    const glow = o.rarity || (this.rage > 0.05 ? `rgba(255,60,30,${(0.35 + 0.5 * this.rage).toFixed(2)})` : null);
    if (glow) {
      sx.fillStyle = glow; sx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = glow; ctx.shadowBlur = s * 0.22; ctx.globalAlpha *= 0.55 + 0.15 * Math.sin(this.t * 4);
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
