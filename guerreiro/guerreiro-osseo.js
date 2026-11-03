/* =====================================================================
   GUERREIRO ÓSSEO — "Ortopedista de Guerra" (O Atlas Perdido)
   Personagem 2.5D 100% procedural: esqueleto 3D (cinemática direta +
   IK de dois ossos) projetado no isométrico 2:1 do jogo e renderizado
   como malhas texturizadas (texturas geradas por código, UV afim por
   face, luz por face, especular e contraluz). Nenhuma imagem externa.

   Armas: espada de fêmur, lança vertebral e foice longa — cada uma com
   o seu conjunto de golpes. Escudo opcional (espada e lança) com
   bloqueio e golpe de escudo.

   Uso:
     const g = GuerreiroOsseo.create({ scale: 72, weapon: 'lanca', shield: true, theme: 'carmesim' });
     g.update(dt, { moving, facing, vx, vy });
     g.play('golpe');            // golpe | esmagar | investida | redemoinho | brado | rolar | escudo | bloquear | dano | morte
     g.release('bloquear');
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
  const proj = (p, s) => [(p[0] - p[1]) * R2 * s, ((p[0] + p[1]) * R2 * SP - p[2] * CP) * s];
  const depthOf = p => (p[0] + p[1]) * R2 * CP + p[2] * SP;

  const MAT = { bone: { base: '#e8dcc0' } };
  const INK = '#070506';

  // ---------- proporções (metros) ----------
  // Proporções no cânone heroico de 8 cabeças (Loomis; Richer; Gray's Anatomy) para ~1,85 m:
  // cabeça 0,23 m; ombro (acrômio) a 1,51 m; mamilos a 2 cabeças do topo; umbigo a 3; púbis a 4 (metade da altura);
  // fêmur ≈ 2 cabeças; tíbia ≈ 2 cabeças menos o tornozelo; úmero ≈ 1,4 cabeça; antebraço ≈ 1,2; pé ≈ 1,15.
  const SK = { thigh: 0.46, shin: 0.44, ankle: 0.08, hipW: 0.09, torso: 0.55, shW: 0.2, neck: 0.06, headR: 0.115,
    uarm: 0.32, farm: 0.27, blade: 0.88, shieldR: 0.28 };

  // ---------- crânio e face esculpidos (não é uma esfera) ----------
  // la: longitude (0 = frente do rosto), ph: ângulo polar a partir do topo. Devolve [frente, lado, cima] em metros,
  // a partir do centro da cabeça (na altura das orelhas). Medidas médias de adulto: comprimento 0,20 m,
  // largura 0,15 m, altura topo–queixo 0,23 m. Relevos: arco superciliar, órbitas, dorso e asas do nariz,
  // zigomáticos, sulco nasolabial, lábios, queixo, ângulo da mandíbula, têmporas, orelhas e nuca.
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function headShape(la, ph, feat, eyeLa) {
    const v = ph / Math.PI, sp = Math.sin(ph), cp = Math.cos(ph), cl = Math.cos(la), sl = Math.sin(la);
    const front = Math.max(0, cl), lower = sstep(0.5, 0.9, v);
    const ax = cl > 0 ? 0.097 * (1 - 0.1 * lower * (1 - front)) : 0.103 * (1 - 0.42 * sstep(0.55, 0.95, v)); // occipital e nuca
    const ay = 0.077 * (1 - 0.14 * lower - 0.1 * lower * front) * (1 + 0.04 * sstep(0.3, 0.5, v) * (1 - sstep(0.5, 0.7, v)));
    const az = cp > 0 ? 0.11 : 0.072 + 0.046 * Math.pow(front, 1.2);    // a face desce mais que a nuca (queixo)
    let p = [sp * cl * ax, sp * sl * ay, cp * az];
    if (!feat) return p;
    const L = Math.abs(la), e = eyeLa || 0.36;
    const g = (l0, v0, sl0, sv, a) => a * Math.exp(-Math.pow((L - l0) / sl0, 2) / 2 - Math.pow((v - v0) / sv, 2) / 2);
    let b = 0;
    b += g(0, 0.445, 0.55, 0.025, 0.011);                                   // arco superciliar
    b += g(e, 0.5, 0.12, 0.032, -0.017);                                    // órbitas
    b += g(0, 0.5, 0.14, 0.03, -0.006);                                     // raiz do nariz
    b += 0.026 * Math.exp(-Math.pow(la / 0.075, 2) / 2) * sstep(0.47, 0.6, v) * (1 - sstep(0.6, 0.64, v)); // dorso do nariz até a ponta
    b += g(0.17, 0.6, 0.07, 0.022, 0.008);                                  // asas do nariz
    b += g(0.78, 0.53, 0.22, 0.05, 0.011);                                  // zigomáticos (maçãs do rosto)
    b += g(0.35, 0.6, 0.12, 0.04, -0.005);                                  // sulco abaixo da maçã
    b += g(0, 0.675, 0.32, 0.035, 0.008);                                   // boca (arcada dentária)
    b += g(0, 0.678, 0.26, 0.007, -0.004);                                  // fenda dos lábios
    b += g(0, 0.72, 0.2, 0.012, -0.004);                                    // sulco mentolabial
    b += g(0, 0.765, 0.28, 0.03, 0.01);                                     // queixo largo
    b += g(1.2, 0.73, 0.3, 0.06, 0.016);                                    // ângulo da mandíbula (quadrada)
    b += g(1.12, 0.38, 0.2, 0.07, -0.006);                                  // têmporas
    b += g(Math.PI / 2, 0.53, 0.12, 0.05, 0.013);                           // orelhas
    const n = norm(p);
    return add(p, mul(n, b));
  }

  // ======================================================================
  //  POSES E CONJUNTOS DE GOLPES
  //  Convenção local (antes do espelho): x = frente, y = esquerda, z = cima.
  //  hR/hL: mãos no referencial do tronco. sp/sy: elevação/azimute da arma.
  //  twoHand: 1 = mão esquerda presa à haste (lança/foice sem escudo).
  // ======================================================================
  const BASE = {
    pz: 0.92, rootX: 0, lean: 0.08, twist: -0.1, side: 0, hp: 0.05, hy: 0.08,
    hR: [0.24, -0.3, 0.24], hL: [0.3, 0.2, 0.36],
    fR: [-0.12, -0.15, 0], fL: [0.14, 0.17, 0],
    sp: -0.5, sy: -0.6, sr: 0, shN: [0.85, 0.45, 0.12],
    rPitch: 0, rYaw: 0, rZ: 0, pivZ: 0.5, twoHand: 0, crouch: 0
  };
  const KEYS = Object.keys(BASE);
  const clone = p => { const o = {}; for (const k of KEYS) o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k]; return o; };
  const merge = (o, part) => { for (const k in part) o[k] = Array.isArray(part[k]) ? part[k].slice() : part[k]; return o; };
  function lerpPose(a, b, k) {
    const o = {};
    for (const key of KEYS) { const x = a[key], y = b[key]; o[key] = Array.isArray(x) ? [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)] : lerp(x, y, k); }
    return o;
  }
  const FEET_RUN_A = { fL: [0.42, 0.14, 0.18], fR: [-0.36, -0.14, 0] }, FEET_RUN_B = { fL: [-0.3, 0.14, 0.02], fR: [0.4, -0.14, 0.2] };
  const LUNGE = { fR: [-0.42, -0.15, 0], fL: [0.32, 0.17, 0] }, WIDE = { fR: [-0.08, -0.2, 0], fL: [0.08, 0.2, 0] };
  const SLAM_FEET = { fR: [-0.26, -0.17, 0], fL: [0.28, 0.2, 0] };

  const WEAPONS = {
    espada: {
      name: 'Espada de Fêmur', two: false, shieldOk: true, off2: 0,
      base: {}, baseFree: { hL: [0.1, 0.32, 0.16] },
      names: { golpe: 'Golpe Cortical', esmagar: 'Esmagar Trabecular', investida: 'Investida Patelar', redemoinho: 'Redemoinho Articular' },
      moves: {
        golpe: { dur: 0.46, trail: [0.28, 0.6], keys: [[0, {}],
          [0.28, { hR: [0.04, -0.34, 0.66], sp: 1.15, sy: -1.7, twist: -0.42, lean: 0.02, hy: 0.25 }],
          [0.47, { hR: [0.46, 0.1, 0.22], sp: -0.3, sy: 0.85, twist: 0.38, lean: 0.22, hy: -0.1 }],
          [0.68, { hR: [0.32, 0.22, 0.14], sp: -0.55, sy: 1.25, twist: 0.32, lean: 0.18 }], [1, {}]] },
        golpe2: { dur: 0.46, trail: [0.26, 0.6], keys: [[0, {}],
          [0.26, { hR: [0.16, 0.28, 0.4], sp: 0.18, sy: 2.0, twist: 0.45, lean: 0.06 }],
          [0.5, { hR: [0.42, -0.34, 0.36], sp: 0.08, sy: -1.35, twist: -0.42, lean: 0.14 }],
          [0.7, { hR: [0.3, -0.4, 0.3], sp: -0.05, sy: -1.75, twist: -0.36 }], [1, {}]] },
        golpe3: { dur: 0.55, legs: 'own', still: 1, trail: [0.32, 0.56], keys: [[0, {}],
          [0.3, { hR: [-0.06, -0.3, 0.4], sp: 0.08, sy: 0.05, twist: -0.45, lean: 0.0, fR: [-0.3, -0.15, 0], fL: [0.2, 0.18, 0], pz: 0.86 }],
          [0.5, merge({ hR: [0.66, -0.06, 0.42], sp: 0.04, sy: 0.02, twist: 0.32, lean: 0.32, rootX: 0.28, pz: 0.8, hp: 0.1 }, LUNGE)],
          [0.72, merge({ hR: [0.6, -0.08, 0.4], sp: 0.02, sy: 0.04, twist: 0.25, lean: 0.25, rootX: 0.24, pz: 0.82 }, LUNGE)], [1, {}]] },
        esmagar: { dur: 0.85, legs: 'own', still: 1, trail: [0.42, 0.56], impact: 0.55, fxAt: 0.95, keys: [[0, {}],
          [0.3, { hR: [-0.02, -0.08, 0.9], hL: [0.05, 0.3, 0.7], sp: 2.0, sy: 0, twist: -0.2, lean: -0.12, hp: -0.2, pz: 0.9, shN: [0.4, 0.9, 0.2] }],
          [0.44, { hR: [0.05, -0.06, 0.95], hL: [0.05, 0.32, 0.72], sp: 2.1, sy: 0, lean: -0.15, rZ: 0.2, fR: [-0.02, -0.15, 0.12], fL: [0.08, 0.17, 0.12], pz: 0.85, hp: -0.25 }],
          [0.55, merge({ hR: [0.56, -0.02, -0.02], hL: [0.25, 0.36, 0.35], sp: -0.95, sy: 0, twist: 0.12, lean: 0.5, rZ: 0, crouch: 1, pz: 0.66, hp: 0.3 }, SLAM_FEET)],
          [0.78, merge({ hR: [0.54, -0.04, 0.0], hL: [0.25, 0.36, 0.35], sp: -0.9, sy: 0.05, twist: 0.1, lean: 0.45, pz: 0.7 }, SLAM_FEET)], [1, {}]] },
        investida: { dur: 0.45, legs: 'own', dash: 7, keys: [[0, {}],
          [0.18, merge({ hL: [0.48, 0.06, 0.46], shN: [1, 0.05, 0.1], hR: [-0.22, -0.32, 0.12], sp: -0.25, sy: -2.5, lean: 0.48, twist: 0.25, pz: 0.82, hp: 0.2 }, FEET_RUN_A)],
          [0.82, merge({ hL: [0.5, 0.06, 0.46], shN: [1, 0.05, 0.1], hR: [-0.22, -0.32, 0.12], sp: -0.25, sy: -2.5, lean: 0.5, twist: 0.25, pz: 0.8, hp: 0.2 }, FEET_RUN_B)], [1, {}]] },
        redemoinho: { dur: 3, legs: 'own', spin: -15, trail: [0.03, 0.97], keys: [[0, {}],
          [0.06, merge({ hR: [0.2, -0.56, 0.4], sp: -0.06, sy: -1.35, sr: 1.5, hL: [0.0, 0.42, 0.42], shN: [-0.2, 1, 0.1], lean: 0.12, twist: 0, pz: 0.84 }, WIDE)],
          [0.94, merge({ hR: [0.2, -0.56, 0.4], sp: -0.06, sy: -1.35, sr: 1.5, hL: [0.0, 0.42, 0.42], shN: [-0.2, 1, 0.1], lean: 0.12, twist: 0, pz: 0.84 }, WIDE)], [1, {}]] }
      }
    },
    lanca: {
      name: 'Lança Vertebral', two: true, shieldOk: true, len: 2.25, grip: 0.85, gripS: 1.1, off2: 0.34, head: 0.38,
      base: { hR: [0.08, -0.08, 0.3], sp: -0.12, sy: 0.1, sr: 0, twoHand: 1, twist: -0.2, lean: 0.12, fR: [-0.2, -0.15, 0], fL: [0.2, 0.17, 0] },
      shieldAdj: { hR: [-0.06, -0.22, 0.32], sp: 0.06 },
      names: { golpe: 'Estocada', esmagar: 'Salto Empalador', investida: 'Carga da Lança', redemoinho: 'Giro da Haste' },
      moves: {
        golpe: { dur: 0.4, trail: [0.32, 0.55], keys: [[0, {}],
          [0.3, { hR: [-0.1, -0.12, 0.3], sp: -0.06, sy: 0.08, twist: -0.3, lean: 0.05 }],
          [0.5, { hR: [0.44, -0.04, 0.34], sp: -0.04, sy: 0.02, twist: 0.25, lean: 0.26, hp: 0.08 }],
          [0.7, { hR: [0.4, -0.05, 0.33], sp: -0.06, sy: 0.04, twist: 0.2, lean: 0.22 }], [1, {}]] },
        golpe2: { dur: 0.5, trail: [0.3, 0.62], keys: [[0, {}],
          [0.28, { hR: [0.1, -0.28, 0.36], sp: 0.04, sy: -1.0, twist: -0.45 }],
          [0.55, { hR: [0.22, 0.12, 0.34], sp: 0.0, sy: 1.0, twist: 0.45, lean: 0.15 }],
          [0.75, { hR: [0.18, 0.16, 0.32], sp: -0.05, sy: 1.15, twist: 0.4 }], [1, {}]] },
        golpe3: { dur: 0.62, legs: 'own', still: 1, trail: [0.36, 0.62], keys: [[0, {}],
          [0.32, { hR: [-0.16, -0.1, 0.28], sp: -0.05, sy: 0.05, twist: -0.45, pz: 0.84, fR: [-0.32, -0.15, 0], fL: [0.18, 0.18, 0] }],
          [0.52, merge({ hR: [0.5, -0.02, 0.36], sp: -0.02, sy: 0.02, twist: 0.3, lean: 0.38, rootX: 0.4, pz: 0.78, hp: 0.1 }, LUNGE)],
          [0.75, merge({ hR: [0.46, -0.03, 0.35], sp: -0.04, sy: 0.03, twist: 0.25, lean: 0.32, rootX: 0.36, pz: 0.8 }, LUNGE)], [1, {}]] },
        esmagar: { dur: 0.95, legs: 'own', still: 1, impact: 0.58, fxAt: 1.15, trail: [0.46, 0.6], keys: [[0, {}],
          [0.25, { pz: 0.72, hR: [0.0, -0.15, 0.55], sp: 0.6, sy: 0, lean: -0.05, fR: [-0.05, -0.15, 0], fL: [0.08, 0.17, 0], twoHand: 0 }],
          [0.45, { rZ: 0.65, pz: 0.92, hR: [0.05, -0.08, 0.72], sp: -1.0, sy: 0, lean: 0.2, fR: [-0.1, -0.15, 0.22], fL: [0.1, 0.17, 0.26], hp: 0.3, twoHand: 0 }],
          [0.58, merge({ rZ: 0, pz: 0.66, hR: [0.42, -0.04, 0.28], sp: -1.15, sy: 0, lean: 0.5, crouch: 1, hp: 0.35, twoHand: 1 }, SLAM_FEET)],
          [0.8, merge({ pz: 0.7, hR: [0.4, -0.04, 0.3], sp: -1.1, sy: 0, lean: 0.45, twoHand: 1 }, SLAM_FEET)], [1, {}]] },
        investida: { dur: 0.5, legs: 'own', dash: 7.5, trail: [0.2, 0.85], keys: [[0, {}],
          [0.18, merge({ hR: [0.1, -0.1, 0.3], sp: -0.04, sy: 0.02, lean: 0.45, pz: 0.82, twist: -0.2, hp: 0.2 }, FEET_RUN_A)],
          [0.82, merge({ hR: [0.16, -0.1, 0.3], sp: -0.04, sy: 0.02, lean: 0.48, pz: 0.8, twist: -0.2, hp: 0.2 }, FEET_RUN_B)], [1, {}]] },
        redemoinho: { dur: 3, legs: 'own', spin: -13, trail: [0.03, 0.97], keys: [[0, {}],
          [0.06, merge({ hR: [0.3, 0.12, 0.4], sp: 0, sy: -1.5, twist: 0, pz: 0.84, lean: 0.1 }, WIDE)],
          [0.94, merge({ hR: [0.3, 0.12, 0.4], sp: 0, sy: -1.5, twist: 0, pz: 0.84, lean: 0.1 }, WIDE)], [1, {}]] }
      }
    },
    foice: {
      name: 'Foice Longa', two: true, shieldOk: false, len: 1.95, grip: 0.62, off2: -0.46,
      base: { hR: [0.18, 0.05, 0.42], sp: 0.9, sy: -0.7, sr: 0, twoHand: 1, twist: -0.1 },
      names: { golpe: 'Ceifa', esmagar: 'Ceifa do Juízo', investida: 'Passo Sombrio', redemoinho: 'Turbilhão da Ceifa' },
      moves: {
        golpe: { dur: 0.55, trail: [0.3, 0.64], keys: [[0, {}],
          [0.3, { hR: [0.05, -0.15, 0.42], sp: 0.25, sy: -2.0, twist: -0.55, lean: 0.05 }],
          [0.58, { hR: [0.36, 0.18, 0.36], sp: 0.1, sy: 1.2, twist: 0.5, lean: 0.2 }],
          [0.78, { hR: [0.3, 0.22, 0.34], sp: 0.15, sy: 1.5, twist: 0.45 }], [1, {}]] },
        golpe2: { dur: 0.52, trail: [0.3, 0.62], keys: [[0, {}],
          [0.3, { hR: [0.3, 0.2, 0.18], sp: -0.35, sy: 1.5, twist: 0.4, lean: 0.2, pz: 0.84 }],
          [0.58, { hR: [0.22, -0.2, 0.62], sp: 1.0, sy: -1.0, twist: -0.4, lean: -0.05, hp: -0.15 }],
          [0.78, { hR: [0.2, -0.18, 0.6], sp: 1.05, sy: -1.1, twist: -0.35 }], [1, {}]] },
        golpe3: { dur: 0.7, legs: 'own', spinWin: [0.2, 0.72, -TAU], trail: [0.2, 0.76], keys: [[0, {}],
          [0.15, merge({ hR: [0.3, 0.05, 0.4], sp: 0.05, sy: -1.4, pz: 0.84, lean: 0.15, twist: 0 }, WIDE)],
          [0.75, merge({ hR: [0.3, 0.05, 0.4], sp: 0.05, sy: -1.4, pz: 0.84, lean: 0.15, twist: 0 }, WIDE)], [1, {}]] },
        esmagar: { dur: 0.9, legs: 'own', still: 1, impact: 0.55, fxAt: 1.35, trail: [0.38, 0.58], keys: [[0, {}],
          [0.3, { hR: [0.0, -0.05, 0.75], sp: 1.75, sy: 0, lean: -0.12, hp: -0.2, pz: 0.88 }],
          [0.55, merge({ hR: [0.42, -0.02, 0.3], sp: -0.5, sy: 0, lean: 0.42, crouch: 1, pz: 0.68, hp: 0.3 }, SLAM_FEET)],
          [0.8, merge({ hR: [0.4, -0.02, 0.3], sp: -0.48, sy: 0, lean: 0.38, pz: 0.7 }, SLAM_FEET)], [1, {}]] },
        investida: { dur: 0.55, legs: 'own', dash: 8, trail: [0.68, 0.92], keys: [[0, {}],
          [0.15, merge({ hR: [-0.05, -0.2, 0.25], sp: -0.2, sy: -2.6, lean: 0.5, pz: 0.8, twist: -0.2 }, FEET_RUN_A)],
          [0.68, merge({ hR: [-0.05, -0.2, 0.25], sp: -0.2, sy: -2.6, lean: 0.5, pz: 0.8, twist: -0.2 }, FEET_RUN_B)],
          [0.88, merge({ hR: [0.36, 0.18, 0.36], sp: 0.1, sy: 1.2, twist: 0.45, lean: 0.25, pz: 0.84 }, WIDE)], [1, {}]] },
        redemoinho: { dur: 3, legs: 'own', spin: -12, trail: [0.03, 0.97], keys: [[0, {}],
          [0.06, merge({ hR: [0.3, -0.1, 0.42], sp: 0, sy: -1.45, twist: 0, pz: 0.84, lean: 0.12 }, WIDE)],
          [0.94, merge({ hR: [0.3, -0.1, 0.42], sp: 0, sy: -1.45, twist: 0, pz: 0.84, lean: 0.12 }, WIDE)], [1, {}]] }
      }
    }
  };

  const GUARD = { hL: [0.38, 0.06, 0.44], shN: [1, 0.15, 0.12], pz: 0.82, lean: 0.16, hp: 0.15, twist: 0.1, twoHand: 0 };
  const COMMON = {
    brado: { dur: 0.9, legs: 'own', still: 1, impact: 0.3, keys: [[0, {}],
      [0.18, { hR: [0.18, -0.2, 0.2], hL: [0.2, 0.2, 0.25], lean: 0.25, hp: 0.3, pz: 0.82, twoHand: 0 }],
      [0.32, { hR: [0.12, -0.58, 0.58], sp: 1.1, sy: -1.3, hL: [0.12, 0.58, 0.58], shN: [0.3, 1, 0.3], lean: -0.18, hp: -0.4, pz: 0.88, fR: [-0.1, -0.24, 0], fL: [0.12, 0.26, 0], twoHand: 0 }],
      [0.75, { hR: [0.14, -0.56, 0.56], sp: 1.1, sy: -1.3, hL: [0.14, 0.56, 0.56], shN: [0.3, 1, 0.3], lean: -0.14, hp: -0.3, pz: 0.88, fR: [-0.1, -0.24, 0], fL: [0.12, 0.26, 0], twoHand: 0 }], [1, {}]] },
    rolar: { dur: 0.42, legs: 'own', dash: 5.5, keys: [[0, {}],
      [0.15, { pz: 0.62, lean: 0.6, hR: [0.25, -0.15, 0.2], hL: [0.25, 0.15, 0.25], sp: -0.2, sy: -0.3, fR: [0.05, -0.12, 0], fL: [0.12, 0.12, 0], pivZ: 0.45, hp: 0.4, twoHand: 0 }],
      [0.5, { pz: 0.55, lean: 0.75, rPitch: Math.PI, hR: [0.22, -0.12, 0.18], hL: [0.22, 0.12, 0.2], sp: -0.3, sy: -0.3, fR: [0.2, -0.12, 0.25], fL: [0.22, 0.12, 0.25], pivZ: 0.45, rZ: 0.08, hp: 0.4, twoHand: 0 }],
      [0.85, { pz: 0.66, lean: 0.4, rPitch: TAU, hR: [0.25, -0.15, 0.2], hL: [0.25, 0.15, 0.3], sp: -0.2, sy: -0.3, fR: [-0.1, -0.13, 0], fL: [0.14, 0.15, 0], pivZ: 0.45, twoHand: 0 }],
      [1, { rPitch: TAU }]] },
    dano: { dur: 0.32, keys: [[0, {}], [0.25, { lean: -0.28, twist: 0.25, hp: -0.35, hR: [0.15, -0.32, 0.3] }], [1, {}]] },
    morte: { dur: 1.3, legs: 'own', hold: true, keys: [[0, {}],
      [0.25, { lean: -0.32, hp: -0.4, twist: 0.3, pz: 0.78, hR: [0.1, -0.4, 0.2], hL: [0.1, 0.4, 0.4], sp: -0.6, sy: -0.8, twoHand: 0 }],
      [0.55, { lean: -0.2, hp: -0.2, twist: 0.2, pz: 0.62, rPitch: -0.8, pivZ: 0, hR: [0.05, -0.5, 0.1], hL: [0.0, 0.45, 0.3], sp: -0.2, sy: -1.6, fR: [0.15, -0.18, 0], fL: [0.25, 0.2, 0.05], twoHand: 0 }],
      [0.75, { lean: -0.05, hp: 0.1, twist: 0.1, pz: 0.6, rPitch: -1.42, pivZ: 0, rZ: 0.05, hR: [0.0, -0.6, 0.0], hL: [-0.05, 0.5, 0.15], sp: 0.0, sy: -1.6, fR: [0.25, -0.2, 0.05], fL: [0.35, 0.22, 0.12], twoHand: 0 }],
      [1, { lean: 0, hp: 0.15, twist: 0.1, pz: 0.6, rPitch: -1.48, pivZ: 0, rZ: 0.02, hR: [0.0, -0.62, 0.0], hL: [-0.05, 0.52, 0.12], sp: 0.0, sy: -1.6, fR: [0.25, -0.2, 0.02], fL: [0.35, 0.22, 0.08], twoHand: 0 }]] },
    // ---- escudo ----
    bloquear: { dur: 0.18, needShield: 1, hold: true, keys: [[0, {}], [1, GUARD]] },
    bloquearFim: { dur: 0.2, needShield: 1, keys: [[0, GUARD], [1, {}]] },
    escudo: { dur: 0.55, legs: 'own', still: 1, needShield: 1, impact: 0.42, fxAt: 0.75, keys: [[0, {}],
      [0.3, { hL: [0.12, 0.3, 0.42], shN: [0.8, 0.5, 0.1], twist: 0.35, lean: 0.0, pz: 0.86, fR: [-0.28, -0.15, 0], fL: [0.12, 0.18, 0] }],
      [0.45, { hL: [0.58, 0.08, 0.44], shN: [1, 0, 0.05], twist: -0.35, lean: 0.3, rootX: 0.22, pz: 0.82, fR: [-0.36, -0.15, 0], fL: [0.4, 0.17, 0], hp: 0.15 }],
      [0.68, { hL: [0.5, 0.1, 0.44], shN: [1, 0.05, 0.05], twist: -0.25, lean: 0.25, rootX: 0.2, pz: 0.84, fR: [-0.34, -0.15, 0], fL: [0.36, 0.17, 0] }], [1, {}]] }
  };
  COMMON.escudo.names = 'Golpe de Escudo';

  // ---------- IK de dois ossos ----------
  function ik(a, t, l1, l2, pole) {
    const d = sub(t, a); let dl = len(d);
    dl = clamp(dl, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    const u = norm(d), ca = (l1 * l1 + dl * dl - l2 * l2) / (2 * l1 * dl), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    let pp = sub(pole, mul(u, dot(pole, u))); pp = len(pp) < 1e-5 ? norm(cross(u, [0, 0, 1])) : norm(pp);
    return [add(a, add(mul(u, l1 * ca), mul(pp, l1 * sa))), add(a, mul(u, dl))];
  }

  // ---------- pano (Verlet) para capa, tabardos e fitas da lança ----------
  function Cloth(cols, rows, seg, rest) { this.cols = cols; this.rows = rows; this.seg = seg; this.rest = rest; this.p = null; this.o = null; }
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
        const i = r * cols + c, rw = this.rest ? this.rest : seg;
        if (r > 0) this.link(i - cols, i, seg);
        if (c > 0 && r > 0) this.link(i - 1, i, rw);
        if (r > 0 && c > 0) this.link(i - cols - 1, i, Math.hypot(seg, rw));
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
  Cloth.prototype.link = function (i, j, rest) {
    const P = this.p, a = P[i], b = P[j], d = sub(b, a), l = len(d) || 1e-6, k = (l - rest) / l;
    if (i < this.cols) { P[j] = sub(b, mul(d, k)); return; }
    P[i] = add(a, mul(d, k * 0.5)); P[j] = sub(b, mul(d, k * 0.5));
  };

  // ======================================================================
  function Warrior(opts) {
    opts = opts || {};
    this.scale = opts.scale || 70;
    this.facing = opts.facing || 0.6; this.facingTarget = this.facing;
    this.t = 0; this.phase = 0; this.move = 0;
    this.action = null; this.combo = 0; this.comboT = 0;
    this.rage = 0; this.dead = false;
    this.cape = new Cloth(7, 8, 0.12, 0.1);
    this.tabF = new Cloth(4, 5, 0.08, 0.06);
    this.tabB = new Cloth(4, 5, 0.08, 0.06);
    this.tassel = new Cloth(3, 5, 0.06, 0.02);
    this.theme = opts.theme || 'carmesim';
    this.armor = !!opts.armor; // sem armadura: corpo anatômico do atlas (MakeHuman) como base
    this.trail = []; this.fx = []; this.on = opts.on || null;
    this.weapon = 'espada'; this.shield = true;
    this.setWeapon(opts.weapon || 'espada', opts.shield);
  }
  Warrior.WEAPONS = WEAPONS;

  Warrior.prototype.setWeapon = function (w, shield) {
    this.weapon = WEAPONS[w] ? w : 'espada';
    const W = WEAPONS[this.weapon];
    this.shield = W.shieldOk && (shield == null ? this.shield : !!shield);
    this.tassel.p = null; this.action = this.dead ? this.action : null; this.trail = [];
    this.base = merge(merge(clone(BASE), W.base), this.shield ? {} : (W.baseFree || {}));
  };
  Warrior.prototype.setShield = function (on) { this.setWeapon(this.weapon, on); };
  Warrior.prototype.setArmor = function (on) { this.armor = !!on; };
  Warrior.prototype.setTheme = function (k) { this.theme = THEMES[k] ? k : 'carmesim'; };
  Warrior.prototype.moveName = function (k) { const W = WEAPONS[this.weapon]; return (W.names && W.names[k]) || (COMMON[k] && COMMON[k].names) || k; };
  Warrior.prototype.still = function () { return !!(this.action && this.action.def.still && this.action.t < this.action.dur); };

  Warrior.prototype.play = function (name, opt) {
    if (this.dead && name !== 'reviver') return 0;
    if (name === 'reviver') { this.dead = false; this.action = null; return 0; }
    const W = WEAPONS[this.weapon];
    if (name === 'golpe') { // combo de 3 golpes da arma equipada
      const busy = this.action && this.action.name.startsWith('golpe') && this.action.t < this.action.dur * 0.55;
      if (busy && !(opt && opt.force)) return 0;
      this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
      name = this.combo === 1 ? 'golpe' : 'golpe' + this.combo; this.comboT = 0.8;
    }
    const def = W.moves[name] || COMMON[name]; if (!def) return 0;
    if (def.needShield && !this.shield) return 0;
    const dur = (opt && opt.dur) || def.dur;
    this.action = { name, def, t: 0, dur, fired: false };
    if (name === 'morte') this.dead = true;
    if (name === 'brado') this.rage = 1;
    this.emit('start', name);
    return dur;
  };
  Warrior.prototype.release = function (name) {
    if (this.action && this.action.name === name && name === 'bloquear') this.play('bloquearFim');
  };
  Warrior.prototype.emit = function (ev, name) {
    if (ev === 'impact') {
      const d = this.action && this.action.def.fxAt || 0.95, at = this.local2world([d, 0, 0]);
      if (name === 'esmagar') { this.fx.push({ k: 'ring', t: 0, life: 0.6, at, col: '255,170,90', r: 1.6, crack: 1 }); this.debris(at); }
      if (name === 'escudo') { this.fx.push({ k: 'ring', t: 0, life: 0.4, at, col: '226,189,114', r: 0.8 }); }
      if (name === 'brado') { this.fx.push({ k: 'ring', t: 0, life: 0.7, at: [0, 0, 0], col: '255,70,40', r: 2.2 }); this.fx.push({ k: 'ring', t: -0.12, life: 0.7, at: [0, 0, 0], col: '226,189,114', r: 1.6 }); }
    }
    if (this.on) this.on(ev, name);
  };
  Warrior.prototype.debris = function (at) {
    for (let i = 0; i < 16; i++) {
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
    const a = this.action, def = a && a.def;
    const spin = def && def.spin, sw = def && def.spinWin, k = a ? a.t / a.dur : 0;
    if (spin) this.facing += spin * dt;
    else if (sw && k >= sw[0] && k <= sw[1]) this.facing += sw[2] / ((sw[1] - sw[0]) * a.dur) * dt;
    else if (!this.dead && !(a && a.name === 'rolar')) this.facing = angLerp(this.facing, this.facingTarget, 1 - Math.exp(-dt * 16));
    const moving = !!inp.moving && !this.dead;
    this.move = lerp(this.move, moving ? 1 : 0, 1 - Math.exp(-dt * 10));
    const spd = inp.speed != null ? inp.speed : 2.4;
    if (inp.phase != null) this.phase = inp.phase; else this.phase += dt * spd * this.move / 1.25 * TAU;
    this.comboT = Math.max(0, this.comboT - dt);
    this.rage = Math.max(0, this.rage - dt * 0.12);
    if (a) {
      a.t += dt;
      const imp = def.impact; if (imp != null && !a.fired && a.t >= imp * a.dur) { a.fired = true; this.emit('impact', a.name); }
      if (a.t >= a.dur && !def.hold) { this.emit('end', a.name); this.action = null; }
    }
    this.pose = this.computePose();
    this.solve(this.pose);
    // panos (coordenadas do mundo centradas no personagem; o deslocamento dá inércia)
    const shift = [(inp.vx || 0) * dt, (inp.vy || 0) * dt, 0];
    const wind = [Math.sin(this.t * 1.3) * 1.2 - 0.6, Math.cos(this.t * 0.9) * 1.0 + 0.3, 0];
    const J = this.J, cols = this.colliders(), legs = cols.filter(k => k.leg);
    this.cape.step(J.capeA, dt, shift, cols, wind, J.chest);
    this.tabF.step(J.tabFA, dt, shift, legs, wind, J.pel);
    this.tabB.step(J.tabBA, dt, shift, legs, wind, J.pel);
    if (J.tasselA) this.tassel.step(J.tasselA, dt, shift, [], mul(wind, 2), J.tip);
    this.hairStep(dt, shift, wind);
    // rastro da arma
    const tr = def && def.trail, an = a ? a.t / a.dur : 0;
    if (tr && an >= tr[0] && an <= tr[1]) this.trail.push({ tip: J.tip.slice(), mid: J.tmid.slice(), t: this.t });
    while (this.trail.length && this.t - this.trail[0].t > (spin ? 0.12 : 0.16)) this.trail.shift();
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      if (f.k === 'shard') { f.v[2] -= 12 * dt; f.p = add(f.p, mul(f.v, dt)); f.rot += f.vr * dt; if (f.p[2] < 0) { f.p[2] = 0; f.v = [f.v[0] * 0.4, f.v[1] * 0.4, -f.v[2] * 0.3]; f.vr *= 0.5; } }
      if (f.t > f.life) this.fx.splice(i, 1);
    }
  };

  // cabelo: mechas de 4 segmentos que nascem no couro cabeludo da malha anatômica e são penteadas para trás.
  // Cada nó sofre inércia (deslocamento do corpo), gravidade e vento; uma mola o puxa para o penteado em repouso
  // e o crânio (elipsoide) o empurra para fora.
  Warrior.prototype.hairStep = function (dt, shift, wind) {
    const CABD = root.GUERREIRO_CABECA, J = this.J; if (!CABD || !J) return;
    const hd = J.head, F = J.hF, Sd = J.hS, U = J.hU, toW = q => add(hd, add(add(mul(F, q[0]), mul(Sd, q[1])), mul(U, q[2])));
    if (!CABD._roots) { // raízes: vértices do couro cabeludo acima da testa, espaçados
      const vs = CABD.couro.v.filter(q => (q[2] > 0.075 - 0.5 * Math.max(0, 0.06 - q[0]) || q[0] < -0.02) && q[2] > -0.02).sort((a, b) => b[2] - a[2]), out = [];
      for (const q of vs) if (out.every(o => Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2]) > 0.021)) out.push(q);
      CABD._roots = out.slice(0, 60);
    }
    const SEG = 4, L = 0.026;
    const rest = (q, i) => { // penteado em repouso, no referencial da cabeça
      const o = norm([q[0] + 0.01, q[1], q[2] + 0.03]), comb = norm(add(mul(o, 0.12), [-0.9, q[1] * 0.9, -0.35])), pts = [mul(q, 1.03)];
      for (let j = 1; j <= SEG; j++) { const d = norm(add(add(comb, mul(o, -0.25 * j)), [0, 0, -0.15 * j])); pts.push(add(pts[j - 1], mul(d, L * (0.9 + 0.2 * ((i * 7) % 5) / 5)))); } // cada segmento segue a curva do crânio
      return pts;
    };
    if (!this.hair) this.hair = CABD._roots.map((q, i) => { const R0 = rest(q, i).map(toW); return { q, i, p: R0.map(x => x.slice()), o: R0.map(x => x.slice()), w: 0.02 + 0.007 * ((i * 3) % 4) / 3, u: ((i * 5) % 4) * 0.125 }; });
    const g = -9.8 * dt * dt, damp = 0.9, stiff = 0.16;
    for (const cl of this.hair) {
      const R0 = rest(cl.q, cl.i).map(toW), P = cl.p, O = cl.o;
      P[0] = R0[0]; O[0] = R0[0];
      for (let j = 1; j <= SEG; j++) {
        const p = P[j], o = O[j]; p[0] -= shift[0]; p[1] -= shift[1]; o[0] -= shift[0]; o[1] -= shift[1];
        const v = [(p[0] - o[0]) * damp + wind[0] * dt * dt * 0.6, (p[1] - o[1]) * damp + wind[1] * dt * dt * 0.6, (p[2] - o[2]) * damp + g];
        O[j] = p.slice(); P[j] = add(add(p, v), mul(sub(R0[j], add(p, v)), stiff * (1 - j / (SEG + 2))));
      }
      for (let it = 0; it < 3; it++) for (let j = 1; j <= SEG; j++) {
        const d = sub(P[j], P[j - 1]), l = len(d) || 1e-6, rl = len(sub(R0[j], R0[j - 1])); P[j] = add(P[j - 1], mul(d, rl / l));
        const c0 = add(hd, mul(U, 0.012)), r = sub(P[j], c0), m = Math.hypot(dot(r, F) / 0.108, dot(r, Sd) / 0.088, dot(r, U) / 0.122); if (m < 1) P[j] = add(c0, mul(r, 1 / (m || 1))); // crânio
      }
    }
  };

  // ---------- skinning do corpo do atlas ----------
  // Cada osso tem um referencial de repouso (no modelo MakeHuman) e um atual (no esqueleto animado):
  // eixo do osso + vetor de referência (frente) ortogonalizado. Um vértice é levado do referencial de repouso
  // para o atual, esticando só ao longo do eixo (para casar comprimentos), e misturado entre dois ossos.
  const frameOf = (a, b, ref) => { const d = norm(sub(b, a)); let e1 = sub(ref, mul(d, dot(ref, d))); if (len(e1) < 1e-4) e1 = cross(d, [1, 0, 0]); e1 = norm(e1); return { a, d, e1, e2: cross(d, e1), L: len(sub(b, a)) }; };
  Warrior.prototype.skinBody = function (face, lowDetail) {
    const BD = root.GUERREIRO_CORPO, J = this.J, M = lowDetail ? BD.baixa : BD.alta;
    if (!BD._rest) BD._rest = BD.ossos.map(o => frameOf(o.a, o.b, o.nome.startsWith('pe-') ? [0, 1, 0] : [0, 0, 1]));
    const pelA = add(J.pel, mul(J.pU, 0.026)), side = { l: 'L', r: 'R' };
    const cur = BD.ossos.map((o, i) => {
      const n = o.nome, s = side[n[n.length - 1]], r = BD._rest[i];
      if (n === 'pelve') return frameOf(pelA, add(pelA, mul(J.pU, -r.L)), J.pF);
      if (n === 'coluna') return frameOf(pelA, J.neck, J.tF);
      if (n === 'pescoco') return frameOf(J.neck, J.head, J.tF);
      if (n.startsWith('braco')) return frameOf(J['sh' + s], J['el' + s], J.tF);
      if (n.startsWith('antebraco')) return frameOf(J['el' + s], J['ha' + s], J.tF);
      if (n.startsWith('coxa')) return frameOf(J['hip' + s], J['kn' + s], J.pF);
      if (n.startsWith('canela')) return frameOf(J['kn' + s], J['an' + s], J.pF);
      return frameOf(J['an' + s], J['to' + s], [0, 0, 1]);
    });
    const T = (bi, p) => { const r = BD._rest[bi], c = cur[bi], q = sub(p, r.a), k = c.L / r.L;
      return add(c.a, add(add(mul(c.d, dot(q, r.d) * k), mul(c.e1, dot(q, r.e1))), mul(c.e2, dot(q, r.e2)))); };
    const W = M.v.map((p, i) => { const [b1, w, b2] = M.w[i]; return w >= 0.999 ? T(b1, p) : mix(T(b2, p), T(b1, p), w); });
    // sombreamento suave: normais de Newell por face somadas nos vértices; cada face usa a média das normais dos seus vértices
    const FN = M.f.map(fc => { let n = [0, 0, 0]; for (let k = 0; k < fc.length; k++) { const a = W[fc[k]], b = W[fc[(k + 1) % fc.length]]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); } return n; });
    const VN = M.v.map(() => [0, 0, 0]); M.f.forEach((fc, i) => fc.forEach(j => { VN[j] = add(VN[j], FN[i]); }));
    M.f.forEach((fc, i) => {
      let n = [0, 0, 0]; fc.forEach(j => { n = add(n, norm(VN[j])); });
      if (dot(n, FN[i]) < 0) n = FN[i];                              // segurança em dobras
      face(fc.map(j => W[j]), fc.map(j => M.uv[j]), M.pano[i] ? 'linen' : 'body', norm(n), { bias: 0 });
    });
  };

  Warrior.prototype.locoPose = function () {
    const p = clone(this.base), m = this.move, ph = this.phase, br = Math.sin(this.t * 2.2);
    p.pz += br * 0.008; p.lean += br * 0.01; p.hL[2] += br * 0.01; p.sp += br * 0.02; // respiração de guarda
    if (m < 0.01) return p;
    const S = 0.62 * m, lift = 0.16 * m;
    const foot = (off, side) => {
      let q = (ph + off) % TAU; if (q < 0) q += TAU;
      if (q < Math.PI) return [S / 2 - S * (q / Math.PI), side, 0];
      const u = (q - Math.PI) / Math.PI; return [-S / 2 + S * easeIO(u), side, lift * Math.sin(u * Math.PI)];
    };
    p.fR = mix(p.fR, foot(0, -0.13), m); p.fL = mix(p.fL, foot(Math.PI, 0.13), m);
    p.pz = lerp(p.pz, 0.93 - 0.035 * Math.abs(Math.cos(ph)), m);
    p.lean += 0.1 * m; p.twist = lerp(p.twist, 0.14 * Math.sin(ph), m);
    p.hR = add(p.hR, [0.08 * Math.sin(ph + Math.PI) * m, 0, 0.03 * Math.cos(ph * 2) * m]);
    p.hL = add(p.hL, [0.06 * Math.sin(ph) * m, 0, 0]);
    p.sp -= (this.weapon === 'espada' ? 0.2 : 0.05) * m; p.hp += 0.05 * m;
    return p;
  };

  Warrior.prototype.computePose = function () {
    const loco = this.locoPose(), a = this.action, W = WEAPONS[this.weapon];
    let p = loco;
    if (a) {
      const def = a.def, k = clamp(a.t / a.dur, 0, 1), keys = def.keys;
      const legKeys = ['fR', 'fL', 'pz', 'rootX', 'crouch'];
      const full = part => { const o = clone(loco); for (const key in part) if (def.legs === 'own' || !legKeys.includes(key)) o[key] = Array.isArray(part[key]) ? part[key].slice() : part[key]; return o; };
      let i = 0; while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
      const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
      p = lerpPose(full(p0), full(p1), easeIO(clamp((k - t0) / ((t1 - t0) || 1), 0, 1)));
    }
    if (this.shield && W.shieldAdj) { p.hR = add(p.hR, W.shieldAdj.hR); p.sp += W.shieldAdj.sp; } // lança com escudo: pegada por cima
    if (this.shield || !W.two) p.twoHand = 0;
    return p;
  };

  // pose -> articulações -> mundo
  Warrior.prototype.solve = function (p) {
    const W = WEAPONS[this.weapon];
    const pel = [0, 0, p.pz];
    const T = mm(mm(Rz(p.twist), Ry(p.lean)), Rx(p.side));
    const Pm = Rz(p.twist * 0.35);
    const tp = v => add(pel, mv(T, v)), tv = v => mv(T, v);
    const L = {};
    L.pel = pel; L.chest = tp([0, 0, SK.torso * 0.72]);
    L.shR = tp([0, -SK.shW, SK.torso - 0.04]); L.shL = tp([0, SK.shW, SK.torso - 0.04]);
    L.neck = tp([0, 0, SK.torso + 0.06]); // incisura jugular / C7
    const H = mm(T, mm(Rz(p.hy), Ry(p.hp)));
    L.head = add(L.neck, mv(H, [0.025, 0, SK.neck + 0.06])); // centro da cabeça na altura das orelhas (~12 cm acima de C7)
    L.hF = mv(H, [1, 0, 0]); L.hU = mv(H, [0, 0, 1]); L.hS = mv(H, [0, 1, 0]);
    // mão direita + direção da arma
    [L.elR, L.haR] = ik(L.shR, tp(p.hR), SK.uarm, SK.farm, tv([-0.45, -0.55, -0.5]));
    const dir = norm(tv(sph(p.sp, p.sy)));
    let ref = tv([0, 0, 1]); if (Math.abs(dot(ref, dir)) > 0.95) ref = tv([1, 0, 0]);
    let e = norm(cross(dir, ref)); e = norm(add(mul(e, Math.cos(p.sr)), mul(cross(dir, e), Math.sin(p.sr))));
    L.dir = dir; L.edge = e;
    // mão esquerda: escudo/pose livre ou presa à haste (armas de duas mãos)
    let tL = tp(p.hL);
    if (p.twoHand > 0.001) tL = mix(tL, add(L.haR, mul(dir, W.off2)), p.twoHand);
    [L.elL, L.haL] = ik(L.shL, tL, SK.uarm, SK.farm, tv([-0.35, 0.6, -0.55]));
    // geometria da arma
    const h = L.haR;
    if (this.weapon === 'espada') {
      L.pommel = add(h, mul(dir, -0.13)); L.guard = add(h, mul(dir, 0.08)); L.tip = add(L.guard, mul(dir, SK.blade)); L.tmid = mix(L.guard, L.tip, 0.55);
    } else if (this.weapon === 'lanca') {
      const g = this.shield ? W.gripS : W.grip;
      L.butt = add(h, mul(dir, -g)); L.tip = add(h, mul(dir, W.len - g)); L.headB = add(L.tip, mul(dir, -W.head)); L.tmid = add(L.tip, mul(dir, -0.75));
      const tb = add(L.headB, mul(dir, -0.1)); L.tasselA = [-1, 0, 1].map(k => add(tb, mul(e, k * 0.018)));
    } else {
      L.butt = add(h, mul(dir, -W.grip)); L.top = add(h, mul(dir, W.len - W.grip));
      L.tip = add(add(L.top, mul(e, 0.84)), mul(dir, -0.32)); L.tmid = add(add(L.top, mul(e, 0.42)), mul(dir, -0.06));
    }
    // escudo no antebraço esquerdo
    L.shC = add(mix(L.elL, L.haL, 0.62), mul(norm(tv(p.shN)), 0.07)); L.shN = norm(tv(p.shN)); L.shU = norm(sub(L.haL, L.elL));
    // pernas
    const hipR = add(pel, mv(Pm, [0, -SK.hipW, -0.03])), hipL = add(pel, mv(Pm, [0, SK.hipW, -0.03]));
    L.hipR = hipR; L.hipL = hipL;
    const poleK = mv(Pm, [1, 0, 0.1]);
    [L.knR, L.anR] = ik(hipR, add(p.fR, [0, 0, SK.ankle]), SK.thigh, SK.shin, add(poleK, [0, -0.15, 0]));
    [L.knL, L.anL] = ik(hipL, add(p.fL, [0, 0, SK.ankle]), SK.thigh, SK.shin, add(poleK, [0, 0.15, 0]));
    L.toR = add(L.anR, mv(Rz(-0.2), [0.18, 0, -0.06])); L.toL = add(L.anL, mv(Rz(0.2), [0.18, 0, -0.06]));
    L.heR = add(L.anR, mv(Rz(-0.2), [-0.06, 0, -0.05])); L.heL = add(L.anL, mv(Rz(0.2), [-0.06, 0, -0.05])); // calcanhar
    // âncoras dos panos
    L.capeA = []; for (let c = 0; c < 7; c++) L.capeA.push(tp([-0.13 - 0.06 * Math.sin(c / 6 * Math.PI), lerp(0.29, -0.29, c / 6), SK.torso - 0.05]));
    L.tabFA = [-1, -1 / 3, 1 / 3, 1].map(s => tp([0.17, s * 0.09, -0.02])); L.tabBA = [-1, -1 / 3, 1 / 3, 1].map(s => tp([-0.16, s * 0.09, -0.02]));
    // anéis do tronco (seções elípticas; frente da textura em a = 0)
    // seções do tronco medidas de referências anatômicas (z a partir da articulação do quadril):
    // [z, meia largura, profundidade frontal, profundidade dorsal]
    const pec = (a, z) => Math.cos(a) > 0 ? 0.13 * Math.max(0, Math.sin((z - 0.36) / 0.2 * Math.PI)) * Math.exp(-Math.pow((Math.abs(a) - 0.55) / 0.38, 2)) : 0;
    const scap = (a, z) => Math.cos(a) < 0 ? 0.09 * Math.max(0, Math.sin((z - 0.36) / 0.2 * Math.PI)) * Math.exp(-Math.pow((Math.PI - Math.abs(a) - 0.55) / 0.35, 2)) : 0;
    const spine = a => Math.cos(a) < 0 ? -0.07 * Math.exp(-Math.pow((Math.PI - Math.abs(a)) / 0.16, 2)) : 0;
    const glute = (a, z) => Math.cos(a) < 0 ? 0.12 * Math.max(0, 1 - Math.abs(z + 0.04) / 0.1) * Math.exp(-Math.pow((Math.PI - Math.abs(a) - 0.45) / 0.4, 2)) : 0;
    const ring = (z, ry, rf, rb, M, n) => { const pts = []; for (let i = 0; i <= n; i++) { const a = i / n * TAU - Math.PI, rx = Math.cos(a) > 0 ? rf : rb, k = 1 + pec(a, z) + scap(a, z) + spine(a) + glute(a, z); pts.push(add(pel, mv(M, [rx * k * Math.cos(a), ry * Math.sin(a), z]))); } return pts; };
    const TR = [[-0.08, 0.165, 0.1, 0.12], [0.0, 0.17, 0.108, 0.12], [0.08, 0.152, 0.102, 0.105], [0.16, 0.142, 0.1, 0.098], [0.24, 0.148, 0.108, 0.1],
      [0.32, 0.16, 0.115, 0.108], [0.4, 0.174, 0.122, 0.115], [0.46, 0.182, 0.128, 0.12], [0.52, 0.178, 0.12, 0.12], [0.57, 0.14, 0.085, 0.098], [0.61, 0.07, 0.056, 0.062]];
    L.torsoRings = TR.map(r => ring(r[0], r[1], r[2], r[3], T, 18)); this.torsoV = TR.map(r => (0.61 - r[0]) / 0.69);
    L.hipRings = [ring(-0.2, 0.185, 0.125, 0.14, Pm, 18), ring(-0.1, 0.178, 0.115, 0.135, Pm, 18), ring(0.0, 0.17, 0.11, 0.125, T, 18)];
    L.gemBelt = { p: tp([0.115, 0, 0.06]), n: tv([1, 0, 0]) };
    L.pouch = tp([0.03, -0.18, 0.02]);
    L.tF = tv([1, 0, 0]); L.tS = tv([0, 1, 0]); L.tU = tv([0, 0, 1]); L.pF = mv(Pm, [1, 0, 0]); L.pU = mv(Pm, [0, 0, 1]);
    this.L = L;
    this.toWorld(p);
  };

  Warrior.prototype.local2world = function (v) { const a = this.facing; return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]]; };

  Warrior.prototype.toWorld = function (p) {
    const pit = Ry(p.rPitch), yaw = this.facing + p.rYaw, c = Math.cos(yaw), s = Math.sin(yaw), piv = p.pivZ;
    const P = v => { let q = mv(pit, [v[0], -v[1], v[2] - piv]); q = [q[0] + p.rootX, q[1], q[2] + piv + p.rZ]; return [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]]; };
    const V = v => { const q = mv(pit, [v[0], -v[1], v[2]]); return [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]]; };
    const VEC = { hF: 1, hU: 1, hS: 1, dir: 1, edge: 1, shN: 1, shU: 1, tF: 1, tS: 1, tU: 1, pF: 1, pU: 1 };
    const map = v => (typeof v[0] === 'number' ? P(v) : Array.isArray(v) ? v.map(map) : { p: P(v.p), n: V(v.n) });
    const J = {}, L = this.L;
    for (const k in L) J[k] = VEC[k] ? V(L[k]) : map(L[k]);
    J.torsoV = this.torsoV;
    this.J = J;
  };

  Warrior.prototype.colliders = function () {
    const J = this.J;
    return [
      { a: J.pel, b: J.chest, r: 0.21 }, { a: J.chest, b: J.neck, r: 0.22 },
      { a: J.hipR, b: J.knR, r: 0.11, leg: 1 }, { a: J.knR, b: J.anR, r: 0.09, leg: 1 },
      { a: J.hipL, b: J.knL, r: 0.11, leg: 1 }, { a: J.knL, b: J.anL, r: 0.09, leg: 1 },
      { a: J.pel, b: add(J.pel, [0, 0, -0.15]), r: 0.19, leg: 1 }
    ];
  };

  // ======================================================================
  //  TEXTURAS PROCEDURAIS — direção de arte gótica: metal escuro gravado,
  //  couro curtido, osso envelhecido, sangue seco. Geradas uma vez por tema.
  // ======================================================================
  const THEMES = {
    carmesim: { name: 'Carmesim', cloth: ['#9a1e26', '#64101a', '#26050a'], trim: '#c9a25c', trimD: '#5e3e18', gem: [255, 60, 30], rim: [255, 120, 70] },
    real: { name: 'Real', cloth: ['#5e2a7e', '#3a1452', '#160620'], trim: '#e0c27a', trimD: '#6a4a1c', gem: [200, 110, 255], rim: [210, 150, 255] },
    peste: { name: 'Peste', cloth: ['#4e6a22', '#2e4414', '#101806'], trim: '#b8b06a', trimD: '#4a461a', gem: [150, 255, 80], rim: [170, 255, 120] },
    obsidiana: { name: 'Obsidiana', cloth: ['#3e3e4a', '#22222a', '#08080c'], trim: '#c4ccd8', trimD: '#4a5060', gem: [90, 200, 255], rim: [120, 190, 255] }
  };
  function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function noisePx(g, w, h, amp, R) { const d = g.getImageData(0, 0, w, h), a = d.data; for (let i = 0; i < a.length; i += 4) { const n = (R() - 0.5) * amp; a[i] += n; a[i + 1] += n; a[i + 2] += n * 0.9; } g.putImageData(d, 0, 0); }
  function blotch(g, w, h, n, cols, R, r0, r1) { for (let i = 0; i < n; i++) { const x = R() * w, y = R() * h, r = r0 + R() * (r1 - r0), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, cols[i % cols.length]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } }
  function crackLines(g, w, h, n, col, R, lw) { g.strokeStyle = col; g.lineCap = 'round'; for (let i = 0; i < n; i++) { let x = R() * w, y = R() * h, a = R() * TAU; g.lineWidth = lw * (0.5 + R()); g.beginPath(); g.moveTo(x, y); const k = 4 + (R() * 8 | 0); for (let j = 0; j < k; j++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * (3 + R() * 7); y += Math.sin(a) * (3 + R() * 7); g.lineTo(x, y); } g.stroke(); } }
  // sangue seco: mancha, respingos, escorridos e um brilho úmido
  function blood(g, x, y, r, R, drip) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(52,3,6,.92)'); gr.addColorStop(0.55, 'rgba(92,8,12,.78)'); gr.addColorStop(1, 'rgba(92,8,12,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    for (let i = 0; i < 12; i++) { const a = R() * TAU, d = r * (0.7 + R() * 1.5); g.fillStyle = `rgba(${60 + R() * 50 | 0},5,9,${0.55 + R() * 0.35})`; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + R() * r * 0.13, 0, TAU); g.fill(); }
    if (drip) for (let i = 0; i < 3; i++) { const dx = x + (R() - 0.5) * r, l = r * (1 + R() * 2.5), lw = 1 + R() * 2; g.strokeStyle = 'rgba(74,5,9,.82)'; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(dx, y); g.lineTo(dx + (R() - 0.5) * 2, y + l); g.stroke(); g.fillStyle = 'rgba(74,5,9,.9)'; g.beginPath(); g.arc(dx, y + l, lw * 0.95, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,170,160,.2)'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.14, 0, TAU); g.fill();
  }
  // arabesco gótico gravado (sulco escuro + borda clara)
  function scroll(g, x, y, s, sd) {
    g.beginPath(); g.moveTo(x, y);
    g.bezierCurveTo(x + sd * s * 0.3, y - s * 0.65, x + sd * s * 0.95, y - s * 0.45, x + sd * s * 0.82, y - s * 0.02);
    g.bezierCurveTo(x + sd * s * 0.72, y + s * 0.22, x + sd * s * 0.45, y + s * 0.12, x + sd * s * 0.55, y - s * 0.1);
    g.stroke();
  }
  function filigree(g, x, y, s, dark, light) {
    for (const [col, o] of [[light, 1], [dark, 0]]) {
      g.strokeStyle = col; g.lineWidth = Math.max(1, s * 0.07); g.lineCap = 'round'; g.save(); g.translate(o, o);
      for (const sd of [-1, 1]) { scroll(g, x, y, s, sd); g.save(); g.translate(x, y); g.scale(1, -1); g.translate(-x, -y); scroll(g, x, y, s * 0.7, sd); g.restore(); }
      g.beginPath(); g.moveTo(x, y - s * 0.75); g.lineTo(x, y + s * 0.75); g.stroke();
      g.restore();
    }
  }
  function rivet(g, x, y, r, base) { g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x + 1, y + 1.2, r + 0.8, 0, TAU); g.fill(); const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r); gr.addColorStop(0, '#e8e0d8'); gr.addColorStop(0.4, base); gr.addColorStop(1, '#141012'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function paintBone(g, w, h, R, base) {
    g.fillStyle = base || '#d6c6a2'; g.fillRect(0, 0, w, h);
    blotch(g, w, h, Math.max(12, w * h / 2500), ['rgba(120,86,46,.24)', 'rgba(255,248,226,.2)', 'rgba(70,50,28,.2)'], R, 6, Math.max(14, w / 6));
    g.globalAlpha = 0.09; for (let i = 0; i < w / 4; i++) { g.strokeStyle = R() < 0.5 ? '#5e4528' : '#fff6dc'; g.lineWidth = 1; const x = R() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + R() * 8 - 4, h * 0.3, x + R() * 8 - 4, h * 0.6, x + R() * 6 - 3, h); g.stroke(); } g.globalAlpha = 1;
    for (let i = 0; i < w * h / 80; i++) { g.fillStyle = `rgba(60,40,22,${0.12 + R() * 0.3})`; g.beginPath(); g.arc(R() * w, R() * h, 0.4 + R() * 1.1, 0, TAU); g.fill(); }
    crackLines(g, w, h, Math.max(4, w * h / 5000), 'rgba(44,28,14,.55)', R, 1);
    blotch(g, w, h, 6, ['rgba(40,30,20,.25)'], R, 10, w / 4); // encardido
    noisePx(g, w, h, 18, R);
  }
  function paintMetal(g, w, h, R, base, o) {
    o = o || {};
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 16, ['rgba(0,0,0,.32)', 'rgba(255,240,230,.07)', 'rgba(20,24,30,.3)'], R, 10, w / 3);
    for (let i = 0; i < h * 1.5; i++) { g.strokeStyle = R() < 0.5 ? 'rgba(255,245,235,.06)' : 'rgba(0,0,0,.12)'; g.lineWidth = 0.6 + R(); const y = R() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (R() - 0.5) * 6); g.stroke(); }
    for (let i = 0; i < w / 4; i++) { g.strokeStyle = `rgba(235,225,215,${0.1 + R() * 0.22})`; g.lineWidth = 0.7; const x = R() * w, y = R() * h, a = R() * TAU, l = 3 + R() * 14; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    if (o.rust !== false) blotch(g, w, h, 12, ['rgba(120,46,18,.3)', 'rgba(80,36,16,.26)'], R, 3, 14);
    blotch(g, w, h, 8, ['rgba(10,8,6,.35)'], R, 8, w / 4); // fuligem
    if (o.fil) for (let i = 0; i < o.fil; i++) filigree(g, w * (0.2 + 0.6 * R()), h * (0.2 + 0.6 * R()), 10 + R() * 12, 'rgba(0,0,0,.55)', 'rgba(255,240,220,.18)');
    if (o.blood) for (let i = 0; i < o.blood; i++) blood(g, R() * w, R() * h * 0.8, 3 + R() * 8, R, R() < 0.6);
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
  function trimBand(g, w, y0, y1, th, rivets) {
    const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, th.trim); gr.addColorStop(0.4, '#f6e2b0'); gr.addColorStop(1, th.trimD);
    g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y1, w, 2); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, y0, w, 1);
    const ym = (y0 + y1) / 2, a = (y1 - y0) * 0.25;
    g.strokeStyle = th.trimD; g.lineWidth = 1; g.beginPath(); for (let x = 0; x < w; x += 8) { g.moveTo(x, ym - a); g.lineTo(x + 4, ym + a); g.lineTo(x + 8, ym - a); } g.stroke();
    if (rivets) for (let x = rivets / 2; x < w; x += rivets) rivet(g, x, ym, Math.min(3, (y1 - y0) * 0.3), th.trim);
  }
  function strap(g, x0, y0, x1, y1, wd, buckle, th) { // tira de couro costurada, em relevo
    const a = Math.atan2(y1 - y0, x1 - x0), l = Math.hypot(x1 - x0, y1 - y0);
    g.save(); g.translate(x0, y0); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, -wd / 2 + 3, l, wd);
    const gr = g.createLinearGradient(0, -wd / 2, 0, wd / 2); gr.addColorStop(0, '#6a4630'); gr.addColorStop(0.5, '#4a2e1c'); gr.addColorStop(1, '#2a180e');
    g.fillStyle = gr; g.fillRect(0, -wd / 2, l, wd);
    g.strokeStyle = 'rgba(210,170,120,.6)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, -wd / 2 + 2.5); g.lineTo(l, -wd / 2 + 2.5); g.moveTo(0, wd / 2 - 2.5); g.lineTo(l, wd / 2 - 2.5); g.stroke(); g.setLineDash([]);
    if (buckle) { const bx = l * buckle; g.strokeStyle = '#141012'; g.lineWidth = 4; g.strokeRect(bx - 7, -wd / 2 - 3, 14, wd + 6); g.strokeStyle = '#8a8288'; g.lineWidth = 2.2; g.strokeRect(bx - 7, -wd / 2 - 3, 14, wd + 6); g.fillStyle = '#b8b0b4'; g.fillRect(bx - 1, -wd / 2 - 2, 2, wd + 4); }
    g.restore();
  }

  // ---------- imagens externas (geradas no Canva) que refinam as texturas procedurais ----------
  // chaves: rosto, metal, osso, couro, pele, tecido. Sem elas, tudo continua 100% procedural.
  const IMAGES = {}; let IMGVER = 0;
  const TEXCACHE = {};
  function setImages(map) {
    for (const k in map) { const v = map[k]; if (!v) continue;
      if (typeof v === 'string') { const im = new Image(); im.onload = () => { IMAGES[k] = im; IMGVER++; for (const t in TEXCACHE) delete TEXCACHE[t]; }; im.src = v; }
      else { IMAGES[k] = v; IMGVER++; for (const t in TEXCACHE) delete TEXCACHE[t]; } }
  }
  // cobre a textura com a imagem (repetida em ladrilho), opcionalmente recolorida para o tema
  function overlayImg(g, w, h, key, alpha, tint, tile) {
    const im = IMAGES[key]; if (!im) return false;
    g.save(); g.globalAlpha = alpha; const t = tile || w;
    for (let y = 0; y < h; y += t) for (let x = 0; x < w; x += t) g.drawImage(im, x, y, t, t);
    if (tint) { g.globalAlpha = 1; g.globalCompositeOperation = 'color'; g.fillStyle = tint; g.fillRect(0, 0, w, h); }
    g.restore(); return true;
  }
  function buildTextures(themeKey) {
    if (TEXCACHE[themeKey]) return TEXCACHE[themeKey]; void IMGVER;
    const th = THEMES[themeKey] || THEMES.carmesim, T = {};
    let c, g, R;
    [c, g] = mkCanvas(256, 256); paintBone(g, 256, 256, rng(11)); overlayImg(g, 256, 256, 'osso', 0.85); blood(g, 70, 90, 9, rng(12), true); blood(g, 190, 170, 6, rng(13), false); T.bone = c;
    [c, g] = mkCanvas(256, 256); paintMetal(g, 256, 256, rng(21), '#3c383e', { fil: 3, blood: 3 }); overlayImg(g, 256, 256, 'metal', 0.8); T.iron = c;
    // placa: ferro gravado + faixa dourada rebitada na borda inferior
    [c, g] = mkCanvas(256, 128); R = rng(22); paintMetal(g, 256, 128, R, '#46424c', { blood: 2 }); overlayImg(g, 256, 128, 'metal', 0.8, null, 128);
    for (let x = 32; x < 256; x += 64) filigree(g, x, 52, 20, 'rgba(0,0,0,.6)', 'rgba(255,240,220,.2)');
    trimBand(g, 256, 100, 116, th, 21); T.plate = c;
    // aço das lâminas: escovado, fio brilhante nas bordas (u=0 e u=1), gravura e sangue
    [c, g] = mkCanvas(64, 256); R = rng(23); paintMetal(g, 64, 256, R, '#5a5e66', { rust: false });
    { const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.12, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,.15)'); gr.addColorStop(0.55, 'rgba(0,0,0,.15)'); gr.addColorStop(0.88, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.55)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); }
    for (let y = 40; y < 220; y += 46) filigree(g, 32, y, 12, 'rgba(0,0,0,.6)', 'rgba(255,255,255,.25)');
    blood(g, 22, 210, 7, R, false); blood(g, 44, 150, 5, R, false); T.steel = c;
    [c, g] = mkCanvas(128, 128); paintMetal(g, 128, 128, rng(31), th.trim, { rust: false }); R = rng(32);
    g.strokeStyle = th.trimD; g.globalAlpha = 0.7; g.lineWidth = 1.2; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(R() * 128, R() * 128, 6 + R() * 10, 0, Math.PI * (1 + R())); g.stroke(); } g.globalAlpha = 1; T.gold = c;
    [c, g] = mkCanvas(96, 96); g.fillStyle = '#141113'; g.fillRect(0, 0, 96, 96); R = rng(41);
    for (let y = 0, row = 0; y < 100; y += 5, row++) for (let x = (row % 2) * 3; x < 100; x += 6) { g.strokeStyle = '#625a5a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 2.7, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(230,220,210,.65)'; g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, 2.7, 3.6, 5.4); g.stroke(); }
    blotch(g, 96, 96, 5, ['rgba(110,40,16,.35)', 'rgba(60,4,8,.4)'], R, 4, 12); noisePx(g, 96, 96, 12, R); T.mail = c;
    [c, g] = mkCanvas(128, 128); R = rng(51); g.fillStyle = '#3e2618'; g.fillRect(0, 0, 128, 128); blotch(g, 128, 128, 18, ['rgba(0,0,0,.3)', 'rgba(255,200,150,.07)'], R, 6, 30);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(14,7,3,${R() * 0.38})`; g.fillRect(R() * 128, R() * 128, 1 + R(), 1); }
    for (let i = 0; i < 20; i++) { g.strokeStyle = 'rgba(160,120,90,.18)'; g.lineWidth = 0.8; const x = R() * 128, y = R() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + R() * 14 - 7, y + R() * 4 - 2); g.stroke(); }
    g.strokeStyle = '#b08a5a'; g.lineWidth = 1.2; g.setLineDash([4, 3]); for (const y of [7, 121]) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); } g.setLineDash([]);
    blood(g, 90, 60, 6, R, true); noisePx(g, 128, 128, 16, R); overlayImg(g, 128, 128, 'couro', 0.85); T.leather = c;
    // madeira escura da haste
    [c, g] = mkCanvas(64, 256); R = rng(55); g.fillStyle = '#2e1c12'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 40; i++) { const x = R() * 64; g.strokeStyle = R() < 0.5 ? 'rgba(10,5,2,.45)' : 'rgba(120,80,50,.22)'; g.lineWidth = 0.6 + R() * 1.4; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + R() * 10 - 5, 80, x + R() * 10 - 5, 170, x + R() * 6 - 3, 256); g.stroke(); }
    for (let i = 0; i < 3; i++) { const x = R() * 64, y = R() * 256; g.strokeStyle = 'rgba(8,4,2,.55)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, 3, 7, 0, 0, TAU); g.stroke(); }
    noisePx(g, 64, 256, 14, R); T.wood = c;
    // pele (gola de pelo)
    [c, g] = mkCanvas(128, 128); R = rng(57); g.fillStyle = '#21170f'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { const x = R() * 128, y = R() * 128, l = 5 + R() * 10, cl = ['#5a412c', '#140c06', '#7a5a3e', '#3a281a'][i % 4]; g.strokeStyle = cl; g.globalAlpha = 0.55; g.lineWidth = 0.8 + R() * 0.6; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + R() * 4 - 2, y + l * 0.5, x + R() * 6 - 3, y + l); g.stroke(); }
    g.globalAlpha = 1; T.fur = c;
    // chifre: anéis transversais e ponta escura
    [c, g] = mkCanvas(64, 128); R = rng(58); paintBone(g, 64, 128, R, '#b8a07a');
    { const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(40,26,14,.35)'); gr.addColorStop(1, 'rgba(14,8,4,.85)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); }
    for (let y = 4; y < 120; y += 6 + R() * 3) { g.fillStyle = 'rgba(30,18,8,.45)'; g.fillRect(0, y, 64, 2); g.fillStyle = 'rgba(255,240,210,.18)'; g.fillRect(0, y - 1.5, 64, 1.2); }
    T.horn = c;
    // tecido (capa/tabardo): trama, dobras, barra bordada, emblema, sangue e barro na barra
    const cloth = (emblem, dark) => {
      const [c, g] = mkCanvas(256, 256), R = rng(dark ? 62 : 61), cl = th.cloth;
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, dark ? cl[1] : cl[0]); gr.addColorStop(1, dark ? cl[2] : cl[1]); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9; i++) { const x = R() * 256, w = 10 + R() * 26, gg = g.createLinearGradient(x - w, 0, x + w, 0); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, `rgba(0,0,0,${0.14 + R() * 0.16})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(x - w, 0, 2 * w, 256); }
      g.globalAlpha = 0.1; g.fillStyle = '#000'; for (let y = 0; y < 256; y += 2) g.fillRect(0, y, 256, 1); g.fillStyle = '#fff'; g.globalAlpha = 0.05; for (let x = 0; x < 256; x += 2) g.fillRect(x, 0, 1, 256); g.globalAlpha = 1;
      blotch(g, 256, 256, 10, ['rgba(0,0,0,.28)', 'rgba(60,16,8,.22)'], R, 10, 40);
      overlayImg(g, 256, 256, 'tecido', dark ? 0.5 : 0.8, dark ? cl[2] : cl[0], 128);
      if (!dark) {
        trimBand(g, 256, 204, 216, th, 0); trimBand(g, 256, 222, 226, th, 0);
        if (emblem) { boneShape(g, 92, 72, 164, 144, 7, th.trim, 'rgba(10,4,6,.8)'); boneShape(g, 164, 72, 92, 144, 7, th.trim, 'rgba(10,4,6,.8)'); skullShape(g, 128, 104, 22, th.trim, 'rgba(10,4,6,.85)'); }
      }
      for (let i = 0; i < 4; i++) blood(g, R() * 256, 150 + R() * 90, 6 + R() * 10, R, true);
      const fr = g.createLinearGradient(0, 200, 0, 256); fr.addColorStop(0, 'rgba(0,0,0,0)'); fr.addColorStop(1, 'rgba(18,10,4,.7)'); g.fillStyle = fr; g.fillRect(0, 200, 256, 56); // barro na barra
      noisePx(g, 256, 256, 12, R); return c;
    };
    T.cape = cloth(true, false); T.cloth = cloth(false, false); T.clothIn = cloth(false, true);
    // couraça: placa escura gravada + caixa torácica em relevo + bandoleira + espinha + cinto
    [c, g] = mkCanvas(512, 256); R = rng(71); paintMetal(g, 512, 256, R, '#3a363c', {});
    const W2 = 512, H2 = 256, zTop = 0.61, zBot = -0.08;
    const U = a => (a / TAU + 0.5) * W2, V = z => (zTop - z) / (zTop - zBot) * H2;
    const bonePat = g.createPattern(T.bone, 'repeat');
    const emboss = (path, lw) => {
      g.save(); g.translate(0, 3); g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = lw + 4; path(); g.stroke(); g.restore();
      g.strokeStyle = bonePat; g.lineWidth = lw; path(); g.stroke();
      g.save(); g.translate(0, -lw * 0.28); g.strokeStyle = 'rgba(255,250,232,.5)'; g.lineWidth = Math.max(1.5, lw * 0.22); path(); g.stroke(); g.restore();
      g.save(); g.translate(0, lw * 0.3); g.strokeStyle = 'rgba(50,30,14,.55)'; g.lineWidth = Math.max(1, lw * 0.15); path(); g.stroke(); g.restore();
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const a of [Math.PI / 2, -Math.PI / 2]) { const sx = U(a); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(sx - 1.5, 0, 3, H2); for (let y = 12; y < H2 - 20; y += 22) rivet(g, sx + 8, y, 3, '#6a6266'); filigree(g, sx - 26, 120, 22, 'rgba(0,0,0,.6)', 'rgba(255,240,220,.2)'); filigree(g, sx + 34, 80, 18, 'rgba(0,0,0,.6)', 'rgba(255,240,220,.2)'); }
    for (const [z0, wa] of [[0.27, 1.0], [0.33, 1.15], [0.39, 1.25], [0.45, 1.3], [0.51, 1.2]]) emboss(() => { g.beginPath(); for (let i = 0; i <= 24; i++) { const a = lerp(-wa, wa, i / 24); const x = U(a), y = V(z0 - 0.05 * a * a); i ? g.lineTo(x, y) : g.moveTo(x, y); } }, 11);
    emboss(() => { g.beginPath(); g.moveTo(U(0), V(0.56)); g.lineTo(U(0), V(0.26)); }, 18); // esterno
    emboss(() => { g.beginPath(); g.moveTo(U(-1.2), V(0.57)); g.quadraticCurveTo(U(-0.5), V(0.54), U(0), V(0.57)); g.quadraticCurveTo(U(0.5), V(0.54), U(1.2), V(0.57)); }, 9); // clavículas
    for (const ox of [0, W2]) {
      for (const [z0, wa] of [[0.3, 0.75], [0.37, 0.85], [0.44, 0.85], [0.51, 0.75]]) emboss(() => { g.beginPath(); for (let i = 0; i <= 12; i++) { const a = lerp(-wa, wa, i / 12); const x = ox + a / TAU * W2, y = V(z0 - 0.03 * a * a); i ? g.lineTo(x, y) : g.moveTo(x, y); } }, 8);
      for (let z = 0.58; z > 0.1; z -= 0.055) { const y = V(z); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(ox - 11, y - 7 + 3, 22, 15); g.fillStyle = bonePat; g.fillRect(ox - 10, y - 7, 20, 13); g.fillStyle = 'rgba(255,250,232,.5)'; g.fillRect(ox - 9, y - 7, 18, 2); }
    }
    strap(g, U(-0.95), V(0.58), U(0.85), V(0.12), 16, 0.52, th);       // bandoleira pela frente
    strap(g, U(Math.PI - 0.6), V(0.58), U(Math.PI - 0.1), V(0.14), 16, 0, th);
    for (let i = 0; i < 4; i++) blood(g, U((R() - 0.5) * 2.2), V(0.2 + R() * 0.38), 5 + R() * 8, R, true);
    trimBand(g, W2, V(0.1), V(0.02), th, 24);
    skullShape(g, U(0), V(0.065), 13, '#e2d4b4', 'rgba(20,10,6,.9)');
    noisePx(g, W2, H2, 10, R); T.torso = c;
    // rosto (equirretangular, frente no centro): pele curtida, órbitas fundas, cicatriz costurada, lágrimas de sangue
    [c, g] = mkCanvas(256, 128); R = rng(81);
    g.fillStyle = '#8a6a58'; g.fillRect(0, 0, 256, 128);
    blotch(g, 256, 128, 26, ['rgba(120,70,60,.3)', 'rgba(60,40,34,.3)', 'rgba(200,160,140,.15)'], R, 6, 24);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(40,24,18,${R() * 0.25})`; g.fillRect(R() * 256, R() * 128, 1, 1); }
    for (let i = 0; i < 700; i++) { const x = 100 + R() * 56, y = 80 + R() * 22; g.fillStyle = `rgba(22,14,10,${0.2 + R() * 0.3})`; g.fillRect(x, y, 1, 1.5); } // barba por fazer
    for (const s of [-1, 1]) {
      const x = 128 + s * 15, y = 64;
      const gr = g.createRadialGradient(x, y, 2, x, y, 20); gr.addColorStop(0, 'rgba(10,4,2,.95)'); gr.addColorStop(0.55, 'rgba(30,14,10,.75)'); gr.addColorStop(1, 'rgba(60,30,24,0)'); g.fillStyle = gr; g.fillRect(x - 22, y - 22, 44, 44);
      g.fillStyle = '#cfc4b0'; g.beginPath(); g.ellipse(x, y + 1, 6, 3, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff9a2a'; g.beginPath(); g.arc(x + s * 0.5, y + 1, 3, 0, TAU); g.fill(); g.fillStyle = '#100604'; g.beginPath(); g.arc(x + s * 0.5, y + 1, 1.3, 0, TAU); g.fill();
      g.strokeStyle = '#1a0e08'; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + s * 9, y - 9); g.quadraticCurveTo(x, y - 8, x - s * 7, y - 5); g.stroke(); // sobrancelha franzida
      for (let k = 0; k < 2; k++) { const dx = x - 3 + k * 6; g.strokeStyle = 'rgba(96,6,10,.85)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(dx, y + 5); g.lineTo(dx + (R() - 0.5) * 2, y + 18 + R() * 16); g.stroke(); } // lágrimas de sangue
    }
    g.strokeStyle = 'rgba(30,14,10,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(128, 54); g.lineTo(128, 60); g.stroke(); // ruga entre as sobrancelhas
    { const gr = g.createLinearGradient(122, 0, 134, 0); gr.addColorStop(0, 'rgba(30,16,12,.5)'); gr.addColorStop(0.5, 'rgba(220,180,160,.35)'); gr.addColorStop(1, 'rgba(30,16,12,.5)'); g.fillStyle = gr; g.fillRect(122, 62, 12, 16); }
    g.fillStyle = 'rgba(20,8,6,.8)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 4, 77, 2.4, 1.6, 0, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(30,12,10,.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(120, 87); g.quadraticCurveTo(128, 85, 136, 88); g.stroke(); // boca
    g.strokeStyle = 'rgba(220,150,140,.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(140, 46); g.lineTo(148, 82); g.stroke(); // cicatriz
    g.strokeStyle = 'rgba(40,14,12,.9)'; g.lineWidth = 1.2; for (let k = 0; k < 5; k++) { const t = k / 4, x = lerp(140, 148, t), y = lerp(46, 82, t); g.beginPath(); g.moveTo(x - 4, y + 1); g.lineTo(x + 4, y - 1); g.stroke(); }
    noisePx(g, 256, 128, 14, R); T.face = c; T.eyeLa = 0.36;
    if (IMAGES.rosto) {
      const im = IMAGES.rosto, [fc, fg] = mkCanvas(512, 256), tw = 156, thh = 105, x0 = 256 - tw / 2, y0 = 128 - 68 / 190 * 105; // olhos do retrato em ph = 0,5π
      fg.drawImage(c, 0, 0, 512, 256);                                   // pele procedural nas laterais
      const [mc, mg] = mkCanvas(tw, thh); mg.drawImage(im, im.width * 0.1, 0, im.width * 0.8, im.height * 0.95, 0, 0, tw, thh);
      mg.globalCompositeOperation = 'destination-in';                     // máscara oval com borda suave
      mg.save(); mg.translate(tw / 2, thh * 0.5); mg.scale(1, thh / tw * 1.05);
      const gr = mg.createRadialGradient(0, 0, tw * 0.3, 0, 0, tw * 0.5); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = gr; mg.fillRect(-tw, -tw, 2 * tw, 2 * tw); mg.restore();
      fg.drawImage(mc, x0, y0);
      T.face = fc; T.eyeLa = 0.36; T.faceImg = true;
    }
    [c, g] = mkCanvas(64, 64); g.fillStyle = '#8a6a58'; g.fillRect(0, 0, 64, 64); noisePx(g, 64, 64, 18, rng(82)); T.skin = c;
    // cabeça anatômica: o uv é o espaço do retrato (olhos em 0,333/0,667 × 0,287; boca 0,667; queixo 0,84)
    [c, g] = mkCanvas(512, 512); R = rng(88); g.fillStyle = '#8a6a58'; g.fillRect(0, 0, 512, 512);
    blotch(g, 512, 512, 60, ['rgba(120,70,56,.3)', 'rgba(60,38,30,.28)', 'rgba(210,170,150,.14)'], R, 10, 60);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(40,22,16,${R() * 0.2})`; g.fillRect(R() * 512, R() * 512, 1, 1); }
    if (IMAGES.rosto) {
      const [mc, mg] = mkCanvas(512, 512); mg.drawImage(IMAGES.rosto, 0, 0, 512, 512);
      mg.globalCompositeOperation = 'destination-in'; mg.save(); mg.translate(256, 262); mg.scale(1, 1.42);
      const gr = mg.createRadialGradient(0, 0, 120, 0, 0, 178); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = gr; mg.fillRect(-300, -300, 600, 600); mg.restore();
      g.drawImage(mc, 0, 0);
    } else {
      for (const ex of [170, 342]) { const gr = g.createRadialGradient(ex, 147, 4, ex, 147, 34); gr.addColorStop(0, 'rgba(12,5,3,.9)'); gr.addColorStop(1, 'rgba(60,30,24,0)'); g.fillStyle = gr; g.fillRect(ex - 40, 107, 80, 80);
        g.strokeStyle = '#1a0e08'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex + (ex < 256 ? -26 : 26), 118); g.quadraticCurveTo(ex, 110, ex + (ex < 256 ? 22 : -22), 124); g.stroke(); }
      g.fillStyle = 'rgba(20,8,6,.7)'; for (const s2 of [-1, 1]) { g.beginPath(); g.ellipse(256 + s2 * 12, 262, 7, 4, 0, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(40,14,12,.85)'; g.lineWidth = 4; g.beginPath(); g.moveTo(222, 342); g.quadraticCurveTo(256, 336, 290, 344); g.stroke();
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(22,14,10,${0.2 + R() * 0.3})`; g.fillRect(170 + R() * 172, 320 + R() * 120, 1.5, 2); }
    }
    noisePx(g, 512, 512, 10, R); T.head = c;
    // pele do corpo inteiro (o uv é o atlas do MakeHuman): tom curtido, poros, sardas, pequenas cicatrizes
    [c, g] = mkCanvas(512, 512); R = rng(91); g.fillStyle = '#8c6a56'; g.fillRect(0, 0, 512, 512);
    blotch(g, 512, 512, 80, ['rgba(120,70,56,.25)', 'rgba(60,38,30,.22)', 'rgba(210,170,150,.12)'], R, 10, 70);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(40,22,16,${R() * 0.18})`; g.fillRect(R() * 512, R() * 512, 1, 1); }
    for (let i = 0; i < 10; i++) { const x = R() * 512, y = R() * 512, l = 10 + R() * 26, a = R() * TAU; g.strokeStyle = 'rgba(220,160,150,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    noisePx(g, 512, 512, 12, R); overlayImg(g, 512, 512, 'pele', 0.85, null, 256); T.body = c;
    // tanga de linho cru (única peça quando está sem armadura)
    [c, g] = mkCanvas(128, 128); R = rng(92); g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, 128, 128);
    g.globalAlpha = 0.18; g.fillStyle = '#000'; for (let y = 0; y < 128; y += 2) g.fillRect(0, y, 128, 1); g.fillStyle = '#fff'; g.globalAlpha = 0.08; for (let x = 0; x < 128; x += 2) g.fillRect(x, 0, 1, 128); g.globalAlpha = 1;
    blotch(g, 128, 128, 6, ['rgba(0,0,0,.18)'], R, 10, 30); noisePx(g, 128, 128, 10, R); T.linen = c;
    // olho: esclera com veias, íris âmbar-acinzentada, pupila e reflexo
    [c, g] = mkCanvas(64, 64); R = rng(89); g.fillStyle = '#d8cfc0'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(150,40,40,.35)'; g.lineWidth = 0.6; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(R() * 64, R() < 0.5 ? 0 : 64); g.lineTo(32 + (R() - 0.5) * 20, 32 + (R() - 0.5) * 20); g.stroke(); }
    { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 12); gr.addColorStop(0, '#2a1a08'); gr.addColorStop(0.35, '#8a6a3a'); gr.addColorStop(0.8, '#5a6a6a'); gr.addColorStop(1, '#1a1410'); g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 12, 0, TAU); g.fill(); }
    g.fillStyle = '#050302'; g.beginPath(); g.arc(32, 32, 5, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(28, 28, 2, 0, TAU); g.fill(); T.eye = c;
    // mecha de cabelo: fios finos com pontas e bordas transparentes
    [c, g] = mkCanvas(64, 128); R = rng(90);
    for (let i = 0; i < 260; i++) { const x = 4 + R() * 56, l = 60 + R() * 68, cl = ['#3a2a1e', '#120b07', '#4e3a28', '#24180f', '#5e4632'][i % 5];
      const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, cl); gr.addColorStop(0.85, cl); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.strokeStyle = gr; g.globalAlpha = 0.5 + R() * 0.5; g.lineWidth = 0.6 + R() * 0.9; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (R() - 0.5) * 6, l * 0.5, x + (R() - 0.5) * 8, l); g.stroke(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in';
    { const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.2, 'rgba(0,0,0,1)'); gr.addColorStop(0.8, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); }
    T.hairStrand = c;
    // cabelo curto e escuro: fios finos penteados para trás
    [c, g] = mkCanvas(256, 128); R = rng(87); g.fillStyle = '#1c1410'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 3500; i++) { const x = R() * 256, y = R() * 128, l = 4 + R() * 8; g.strokeStyle = ['#3a2a1e', '#0e0906', '#4a3626', '#261a12'][i % 4]; g.globalAlpha = 0.6; g.lineWidth = 0.7 + R() * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 2, y + l); g.stroke(); }
    g.globalAlpha = 1; T.hair = c;
    // pele dos braços: tom curtido, veias, cicatrizes e pintura de guerra
    [c, g] = mkCanvas(256, 256); R = rng(86); g.fillStyle = '#8c6a56'; g.fillRect(0, 0, 256, 256);
    blotch(g, 256, 256, 30, ['rgba(120,70,56,.3)', 'rgba(60,38,30,.28)', 'rgba(210,170,150,.14)'], R, 8, 40);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(40,22,16,${R() * 0.22})`; g.fillRect(R() * 256, R() * 256, 1, 1); }
    g.strokeStyle = 'rgba(70,60,90,.35)'; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) { let x = R() * 256, y = 0; g.lineWidth = 1.5 + R() * 1.5; g.beginPath(); g.moveTo(x, y); while (y < 256) { x += (R() - 0.5) * 14; y += 12 + R() * 14; g.lineTo(x, y); } g.stroke(); } // veias
    for (let i = 0; i < 5; i++) { const x = R() * 256, y = R() * 256, l = 14 + R() * 24, a = R() * TAU; g.strokeStyle = 'rgba(220,160,150,.6)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } // cicatrizes
    g.fillStyle = 'rgba(20,10,10,.5)'; for (let i = 0; i < 3; i++) { const y = 90 + i * 16; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + (x / 16 % 2 ? 5 : -2)); g.lineTo(256, y + 8); g.lineTo(0, y + 8); g.fill(); } // pintura de guerra
    blood(g, 70, 190, 7, R, true); noisePx(g, 256, 256, 14, R); overlayImg(g, 256, 256, 'pele', 0.9); T.arm = c;
    // elmo: ferro negro gravado com faixa dourada na borda
    [c, g] = mkCanvas(256, 128); R = rng(83); paintMetal(g, 256, 128, R, '#3a3640', { blood: 2 });
    for (let x = 16; x < 256; x += 48) filigree(g, x, 46, 16, 'rgba(0,0,0,.65)', 'rgba(255,240,220,.22)');
    trimBand(g, 256, 86, 98, th, 16); T.helm = c;
    // crânio pequeno (ornamentos e bossa do escudo) e maxilar com dentes
    const skull = (jaw) => {
      const [c, g] = mkCanvas(256, 128), R = rng(jaw ? 85 : 84); paintBone(g, 256, 128, R, '#d8c8a4');
      if (!jaw) {
        for (const s of [-1, 1]) { const x = 128 + s * 23, y = 64; const gr = g.createRadialGradient(x, y + 2, 2, x, y, 16); gr.addColorStop(0, '#000'); gr.addColorStop(0.75, '#140a06'); gr.addColorStop(1, 'rgba(60,40,22,.6)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 17, 14, s * 0.15, 0, TAU); g.fill(); }
        g.fillStyle = '#0c0604'; g.beginPath(); g.moveTo(121, 88); g.lineTo(135, 88); g.lineTo(128, 76); g.closePath(); g.fill();
        for (let i = 0; i < 7; i++) { g.fillStyle = '#e8dcc0'; g.fillRect(107 + i * 6.3, 96, 5.4, 10); g.fillStyle = 'rgba(40,25,12,.6)'; g.fillRect(107 + i * 6.3, 104, 5.4, 2); }
      } else {
        g.fillStyle = 'rgba(30,18,8,.7)'; g.fillRect(90, 38, 76, 6);
        for (let i = 0; i < 11; i++) { g.fillStyle = '#ece0c4'; g.fillRect(92 + i * 6.6, 44, 5.6, 14); g.fillStyle = 'rgba(40,25,12,.6)'; g.fillRect(92 + i * 6.6, 44, 5.6, 2.5); }
        blood(g, 110, 62, 6, R, true);
      }
      return c;
    };
    T.skull = skull(false); T.jaw = skull(true);
    [c, g] = mkCanvas(128, 128); R = rng(92); paintBone(g, 128, 128, R); trimBand(g, 128, 4, 14, th, 16); trimBand(g, 128, 112, 122, th, 16); strap(g, 0, 64, 128, 64, 12, 0.5, th); T.bracer = c;
    [c, g] = mkCanvas(128, 128); R = rng(93); paintBone(g, 128, 128, R, '#c6b48e'); strap(g, 0, 68, 128, 68, 14, 0.5, th); T.greave = c;
    // escudo: frente e verso
    [c, g] = mkCanvas(256, 256); R = rng(101);
    { const cl = th.cloth, gr = g.createRadialGradient(110, 100, 10, 128, 128, 130); gr.addColorStop(0, cl[0]); gr.addColorStop(0.65, cl[1]); gr.addColorStop(1, cl[2]); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.globalAlpha = 0.08; g.fillStyle = '#000'; for (let y = 0; y < 256; y += 2) g.fillRect(0, y, 256, 1); g.globalAlpha = 1;
      const bp = g.createPattern(T.bone, 'repeat'); g.lineCap = 'round';
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, x0 = 128 + Math.cos(a) * 40, y0 = 128 + Math.sin(a) * 40, x1 = 128 + Math.cos(a) * 106, y1 = 128 + Math.sin(a) * 106;
        g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = 13; g.beginPath(); g.moveTo(x0 + 2, y0 + 3); g.lineTo(x1 + 2, y1 + 3); g.stroke();
        g.strokeStyle = bp; g.lineWidth = 9; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = 'rgba(255,250,232,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 - 1, y0 - 2); g.lineTo(x1 - 1, y1 - 2); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = 22; g.beginPath(); g.arc(129, 131, 114, 0, TAU); g.stroke();
      const ip = g.createPattern(T.iron, 'repeat'); g.strokeStyle = ip; g.lineWidth = 17; g.beginPath(); g.arc(128, 128, 114, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,250,232,.3)'; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 120, 3.4, 5.6); g.stroke();
      g.strokeStyle = th.trim; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 125, 0, TAU); g.stroke();
      for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; rivet(g, 128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114, 3, '#7a7276'); }
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(131, 132, 38, 0, TAU); g.fill();
      g.fillStyle = bp; g.beginPath(); g.arc(128, 128, 36, 0, TAU); g.fill();
      skullShape(g, 128, 124, 26, '#e2d4b4', 'rgba(14,6,4,.9)');
      for (let i = 0; i < 24; i++) { g.strokeStyle = `rgba(0,0,0,${0.15 + R() * 0.3})`; g.lineWidth = 0.8; const x = R() * 256, y = R() * 256, a = R() * TAU, l = 6 + R() * 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      for (let i = 0; i < 3; i++) blood(g, 60 + R() * 140, 60 + R() * 140, 8 + R() * 10, R, true);
      noisePx(g, 256, 256, 12, R); }
    T.shield = c;
    [c, g] = mkCanvas(256, 256); R = rng(102);
    for (let x = 0; x < 256; x += 32) { g.fillStyle = `rgb(${50 + R() * 20 | 0},${32 + R() * 12 | 0},${20 + R() * 8 | 0})`; g.fillRect(x, 0, 32, 256); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, 0, 2, 256);
      g.strokeStyle = 'rgba(20,10,4,.4)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { const xx = x + 4 + R() * 24; g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + 6, 80, xx - 6, 170, xx + 3, 256); g.stroke(); } }
    strap(g, 0, 98, 256, 98, 24, 0, th); strap(g, 0, 170, 256, 170, 24, 0, th);
    for (const y of [98, 170]) for (const x of [40, 216]) rivet(g, x, y, 5, '#6a6266');
    noisePx(g, 256, 256, 14, R); T.shieldBack = c;
    // lâmina de fêmur
    [c, g] = mkCanvas(64, 256); R = rng(111); paintBone(g, 64, 256, R, '#ddd0b0');
    { const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(60,40,20,.6)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(0.75, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,40,20,.6)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
      g.fillStyle = 'rgba(30,8,8,.75)'; g.fillRect(29, 8, 6, 200); g.fillStyle = th.cloth[1]; g.fillRect(30, 10, 4, 196); g.fillStyle = 'rgba(255,90,60,.45)'; g.fillRect(31, 10, 1, 196);
      g.strokeStyle = 'rgba(50,28,12,.65)'; g.lineWidth = 1.2; for (let y = 24; y < 200; y += 18) { const s = (y / 18) % 2 ? 1 : -1, x = 32 + s * 12; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y + 5); g.moveTo(x + 3, y); g.lineTo(x - 3, y + 8); g.stroke(); }
      blood(g, 20, 30, 8, R, true); blood(g, 46, 70, 6, R, true); blood(g, 14, 140, 5, R, false); }
    T.blade = c;
    T.theme = th;
    return (TEXCACHE[themeKey] = T);
  }
  const FALLBACK = { bone: '#bca984', iron: '#2f2b30', plate: '#34303a', steel: '#5a5e66', gold: '#b8924e', mail: '#2a2426', leather: '#3e2618', wood: '#2e1c12', fur: '#2a1e14', horn: '#8a7458', cape: '#64101a', cloth: '#64101a', clothIn: '#26050a', torso: '#2c282e', face: '#8a6a58', skin: '#8a6a58', arm: '#8c6a56', hair: '#1c1410', head: '#8a6a58', eye: '#d8cfc0', hairStrand: '#2a1c12', body: '#8c6a56', linen: '#6e5e48', helm: '#26232a', skull: '#cfbf9b', jaw: '#cfbf9b', bracer: '#c6b48e', greave: '#c6b48e', shield: '#64101a', shieldBack: '#3a2414', blade: '#d2c4a2' };
  // brilho especular e dureza por material
  const SPEC = { iron: [0.6, 30], plate: [0.65, 30], helm: [0.65, 30], steel: [0.9, 44], gold: [0.9, 40], mail: [0.45, 10], bone: [0.18, 12], skull: [0.2, 12], jaw: [0.2, 12], horn: [0.3, 16], bracer: [0.25, 14], greave: [0.2, 12], torso: [0.5, 24], leather: [0.12, 8], blade: [0.35, 22], shield: [0.12, 10], face: [0.1, 8], skin: [0.1, 8], arm: [0.22, 10], hair: [0.2, 12], head: [0.14, 9], eye: [1.2, 60], hairStrand: [0.35, 18], body: [0.16, 9], linen: [0.04, 6] };

  // textura pré-iluminada no nível L de NL (sombra fria ou luz quente da tocha)
  function shadedTex(TX, k, L, NL) {
    TX._lv = TX._lv || {}; const key = k + '@' + L; if (TX._lv[key]) return TX._lv[key];
    const src = TX[k], [c, g] = mkCanvas(src.width, src.height), f = 0.12 + L / (NL - 1) * 1.13;
    g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; // preserva o alfa (mechas de cabelo)
    if (f < 1) { g.fillStyle = `rgba(10,6,10,${Math.min(0.92, (1 - f) * 0.97)})`; g.fillRect(0, 0, c.width, c.height); }
    else { g.fillStyle = `rgba(255,206,150,${Math.min(0.4, (f - 1) * 0.5)})`; g.fillRect(0, 0, c.width, c.height); }
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
  let GRAIN = null;
  function grain() {
    if (GRAIN) return GRAIN;
    GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 96; const g = GRAIN.getContext('2d'), d = g.createImageData(96, 96);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = Math.random() * 90; }
    g.putImageData(d, 0, 0); return GRAIN;
  }
  Warrior.THEMES = THEMES;

  // ======================================================================
  //  DESENHO — malhas texturizadas, luz por face, ordenação por profundidade
  // ======================================================================
  Warrior.prototype.draw = function (ctx, x, y, o) {
    o = o || {};
    if (!this.J) this.update(0, {});
    const s = o.scale || this.scale, J = this.J;
    const W = Math.ceil(s * 5.6), H = Math.ceil(s * 5), ox = W / 2, oy = H * 0.72;
    this._buf = this._buf || {};
    let bf = this._buf[W]; if (!bf) { bf = this._buf[W] = [document.createElement('canvas'), document.createElement('canvas')]; bf.forEach(k => { k.width = W; k.height = H; }); }
    this.cv = bf[0]; this.sil = bf[1]; this.cx = this.cv.getContext('2d'); this.sx = this.sil.getContext('2d');
    const themeKey = this.theme || 'carmesim', TX = buildTextures(themeKey), th = TX.theme;
    const c = this.cx;
    if (!bf.pat || bf.patTheme !== themeKey || bf.patTX !== TX) { bf.pat = {}; bf.patTheme = themeKey; bf.patTX = TX; }
    const NL = 16, PAT = bf.pat; // níveis de luz pré-calculados por textura
    const patFor = (k, L) => { const key = k + L; let p = PAT[key]; if (p) return p; p = PAT[key] = c.createPattern(shadedTex(TX, k, L, NL), 'repeat'); return p; };
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.translate(ox, oy);
    c.lineJoin = c.lineCap = 'round';
    const S = p => proj(p, s);
    const faces = [], glows = [];
    const lowDetail = s < 90;
    const seg = n => Math.max(5, Math.round(n * (lowDetail ? 0.6 : 1.6)));
    const fine = !lowDetail; // detalhes minúsculos só aparecem de perto
    const fwd = J.tF, side = J.tS, upv = J.tU;
    const atlas = !this.armor && !!root.GUERREIRO_CORPO, handTex = atlas ? 'body' : 'leather';

    const face = (pts, uv, tex, n, opt) => { opt = opt || {}; let cen = [0, 0, 0]; for (const p of pts) cen = add(cen, p); cen = mul(cen, 1 / pts.length); faces.push({ pts, uv, tex, n, two: opt.two, d: depthOf(cen) + (opt.bias || 0), poly: opt.poly }); };
    const basis = d => { const r = Math.abs(dot(d, fwd)) > 0.9 ? upv : fwd; const e1 = norm(cross(d, r)), e2 = cross(d, e1); return [e1, e2]; };
    // tubo com perfil de raio: membros, hastes, chifres, cones
    const tube = (A, B, prof, sides, tex, opt) => {
      opt = opt || {}; sides = seg(sides);
      const d = norm(sub(B, A)), [e1, e2] = basis(d), rings = [];
      for (const [t, r, k2, off] of prof) { // [t, raio, achatamento, deslocamento do ventre muscular]
        const q = k2 || 1, C = add(mix(A, B, t), mul(e2, off || 0)), ring = [];
        for (let k = 0; k <= sides; k++) { const a = k / sides * TAU, ca = Math.cos(a), sa = Math.sin(a); ring.push({ p: add(C, add(mul(e1, ca * r), mul(e2, sa * r * q))), n: norm(add(mul(e1, ca), mul(e2, sa / q))) }); }
        rings.push({ t, ring }); }
      const ur = opt.uRep || 1, vr = opt.vRep || 1;
      for (let j = 0; j < rings.length - 1; j++) for (let k = 0; k < sides; k++) {
        const a = rings[j].ring[k], b = rings[j].ring[k + 1], cc = rings[j + 1].ring[k + 1], dd = rings[j + 1].ring[k];
        face([a.p, b.p, cc.p, dd.p], [[k / sides * ur, rings[j].t * vr], [(k + 1) / sides * ur, rings[j].t * vr], [(k + 1) / sides * ur, rings[j + 1].t * vr], [k / sides * ur, rings[j + 1].t * vr]], tex, norm(add(a.n, b.n)), opt);
      }
    };
    // cadeia de tubos por pontos de controle (chifres curvos)
    const chain = (pts, radii, sides, tex, opt) => { for (let i = 0; i < pts.length - 1; i++) tube(pts[i], pts[i + 1], [[0, radii[i]], [1, radii[i + 1]]], sides, tex, Object.assign({ vRep: 1 / (pts.length - 1) }, opt)); };
    // elipsoide em gomos; frente (F) no centro da textura; faixas de latitude/longitude opcionais
    const ellip = (C, F, Sd, Up, rx, ry, rz, lonN, latN, tex, opt) => {
      opt = opt || {}; lonN = seg(lonN); latN = seg(latN);
      const ph0 = opt.ph0 || 0, ph1 = opt.ph1 || Math.PI, la0 = opt.la0 == null ? -Math.PI : opt.la0, la1 = opt.la1 == null ? Math.PI : opt.la1, grid = [];
      for (let i = 0; i <= latN; i++) { const ph = lerp(ph0, ph1, i / latN), row = []; for (let j = 0; j <= lonN; j++) { const la = lerp(la0, la1, j / lonN), sp = Math.sin(ph), cp = Math.cos(ph);
        const p = add(C, add(add(mul(Up, rz * cp), mul(F, rx * sp * Math.cos(la))), mul(Sd, ry * sp * Math.sin(la))));
        row.push({ p, n: norm(add(add(mul(Up, cp / rz), mul(F, sp * Math.cos(la) / rx)), mul(Sd, sp * Math.sin(la) / ry))), uv: [(la + Math.PI) / TAU, ph / Math.PI] }); } grid.push(row); }
      for (let i = 0; i < latN; i++) for (let j = 0; j < lonN; j++) {
        const a = grid[i][j], b = grid[i][j + 1], cc = grid[i + 1][j + 1], dd = grid[i + 1][j], n = norm(add(add(a.n, b.n), add(cc.n, dd.n)));
        if (i === 0 && ph0 === 0) face([dd.p, cc.p, a.p], [dd.uv, cc.uv, [(a.uv[0] + b.uv[0]) / 2, 0]], tex, n, opt);
        else if (i === latN - 1 && ph1 === Math.PI) face([a.p, b.p, dd.p], [a.uv, b.uv, [(dd.uv[0] + cc.uv[0]) / 2, 1]], tex, n, opt);
        else face([a.p, b.p, cc.p, dd.p], [a.uv, b.uv, cc.uv, dd.uv], tex, n, opt);
      }
    };
    const ringMesh = (rings, axA, axB, tex, uvV, opt) => {
      const ax = sub(axB, axA), al = dot(ax, ax);
      for (let j = 0; j < rings.length - 1; j++) { const r0 = rings[j], r1 = rings[j + 1], n = r0.length - 1;
        for (let k = 0; k < n; k++) {
          const pts = [r0[k], r0[k + 1], r1[k + 1], r1[k]], cen = mul(add(add(pts[0], pts[1]), add(pts[2], pts[3])), 0.25);
          const t = dot(sub(cen, axA), ax) / al;
          face(pts, [[k / n, uvV[j]], [(k + 1) / n, uvV[j]], [(k + 1) / n, uvV[j + 1]], [k / n, uvV[j + 1]]], tex, norm(sub(cen, add(axA, mul(ax, t)))), opt);
        } }
    };
    // lâmina plana de dupla face com aresta central chanfrada (espada, lança, foice)
    const bladeStrip = (cl, wl, wr, tex, bias) => { // cl: pontos do centro; wl/wr: pontos das bordas
      let nb = norm(cross(sub(cl[cl.length - 1], cl[0]), sub(wl[0], wr[0]))); if (dot(nb, CAM) < 0) nb = mul(nb, -1);
      const n = cl.length - 1;
      for (let i = 0; i < n; i++) for (const [edge, u0] of [[wl, 0], [wr, 1]]) {
        const ridge = k => add(cl[k], mul(nb, 0.012 * (1 - k / n)));
        const p = [edge[i], edge[i + 1], ridge(i + 1), ridge(i)];
        let fn = norm(cross(sub(p[1], p[0]), sub(p[3], p[0]))); if (dot(fn, nb) < 0) fn = mul(fn, -1);
        face(p, [[u0, i / n], [u0, (i + 1) / n], [0.5, (i + 1) / n], [0.5, i / n]], tex, fn, { two: true, bias });
      }
    };
    // mão anatômica: palma enluvada + 4 dedos e polegar que envolvem o eixo de empunhadura
    const hand = (sd, ha, fa) => {
      let axis, wrap = true;
      if (sd === 'R') axis = J.dir;
      else if (this.shield) axis = norm(cross(fa, J.shN));
      else if (this.pose && this.pose.twoHand > 0.5) axis = J.dir;
      else { axis = norm(cross(fa, upv)); wrap = false; }
      let u = sub(mul(fa, -1), mul(axis, dot(mul(fa, -1), axis))); u = len(u) < 1e-4 ? norm(cross(axis, upv)) : norm(u); // dorso da mão, voltado para o braço
      const v = cross(axis, u), rg = wrap ? 0.028 : 0.02;
      ellip(add(ha, mul(u, 0.026)), u, axis, v, 0.022, 0.043, 0.032, 8, 5, handTex, { bias: 0.02 }); // palma (≈ 8,5 cm de largura)
      if (!fine) return;
      for (let i = 0; i < 4; i++) {
        const c0 = add(ha, mul(axis, -0.03 + i * 0.02)), pts = [], fr = i === 3 ? 0.85 : 1;
        for (const th of [0.15, 1.2, 2.3, 3.1]) pts.push(add(c0, add(mul(u, Math.cos(th) * (rg + 0.01)), mul(v, Math.sin(th) * (rg + 0.01)))));
        chain(pts, [0.0105 * fr, 0.0098 * fr, 0.009 * fr, 0.0075 * fr], 6, handTex, { bias: 0.022 }); // falanges
      }
      const t0 = add(ha, mul(axis, 0.042)), tp = [];
      for (const th of [0.3, -0.7, -1.5]) tp.push(add(t0, add(mul(u, Math.cos(th) * (rg + 0.011)), mul(v, Math.sin(th) * (rg + 0.011)))));
      chain([add(ha, mul(u, 0.018)), ...tp], [0.013, 0.011, 0.0095, 0.008], 6, handTex, { bias: 0.022 }); // polegar
    };
    const glow = (P, n, r, rgb, a, bias) => glows.push({ P, n, r, rgb, a, d: depthOf(P) + (bias || 0.02) });

    // ---------------- capa, tabardos (pano físico, dupla face) ----------------
    const clothMesh = (cl, texO, texI, centerRef, ragged, bias) => {
      const P = cl.p; if (!P) return; const { cols, rows } = cl;
      for (let r = 0; r < rows - 1; r++) for (let q = 0; q < cols - 1; q++) {
        const a = P[r * cols + q], b = P[r * cols + q + 1], d = P[(r + 1) * cols + q + 1], e = P[(r + 1) * cols + q];
        const cen = mix(mix(a, b, 0.5), mix(e, d, 0.5), 0.5);
        let n = norm(cross(sub(b, a), sub(e, a))); if (dot(n, sub(cen, centerRef)) < 0) n = mul(n, -1);
        const out = dot(n, CAM) > 0, uv = [[q / (cols - 1), r / (rows - 1)], [(q + 1) / (cols - 1), r / (rows - 1)], [(q + 1) / (cols - 1), (r + 1) / (rows - 1)], [q / (cols - 1), (r + 1) / (rows - 1)]];
        let poly = null;
        if (ragged && r === rows - 2) { poly = [a, b]; for (let i = 0; i <= 4; i++) { const p = mix(d, e, i / 4); poly.push(add(p, [0, 0, (i % 2 ? 0.05 : -0.03 - 0.03 * (((q * 7 + i * 3) % 5) / 5))])); } }
        face([a, b, d, e], uv, out ? texO : texI, n, { two: true, bias: bias == null ? -0.015 : bias, poly });
      }
    };
    if (!atlas) {
    const capeRef = add(J.chest, mul(norm([fwd[0], fwd[1], 0]), 0.35));
    clothMesh(this.cape, 'cape', 'clothIn', [capeRef[0], capeRef[1], J.pel[2]], true);
    clothMesh(this.tabF, 'cloth', 'clothIn', J.pel, true);
    clothMesh(this.tabB, 'cloth', 'clothIn', J.pel, true);

    // ---------------- pernas: calça de couro, joelheira discreta, greva fina de osso, bota de couro ----------------
    for (const sd of ['R', 'L']) {
      const hip = J['hip' + sd], kn = J['kn' + sd], an = J['an' + sd], to = J['to' + sd], he = J['he' + sd];
      tube(hip, kn, [[0, 0.088], [0.25, 0.093, 1.05, -0.006], [0.6, 0.082, 1.08, -0.01], [0.88, 0.064], [1, 0.06]], 12, 'leather', { vRep: 0.8 }); // quadríceps e isquiotibiais
      ellip(add(kn, mul(fwd, 0.028)), fwd, side, upv, 0.04, 0.054, 0.058, 10, 6, 'plate', { bias: 0.03 }); // joelheira
      tube(kn, an, [[0, 0.058], [0.22, 0.068, 1.12, 0.016], [0.45, 0.062, 1.08, 0.012], [0.8, 0.043], [1, 0.039]], 12, 'leather', { vRep: 0.8 }); // gastrocnêmio e tendão
      tube(add(mix(kn, an, 0.1), mul(fwd, 0.012)), add(mix(kn, an, 0.82), mul(fwd, 0.01)), [[0, 0.05, 0.5, -0.03], [0.5, 0.048, 0.5, -0.03], [1, 0.04, 0.5, -0.024]], 10, 'greave', { bias: 0.008 }); // greva sobre a tíbia
      tube(he, to, [[0, 0.033, 0.95], [0.2, 0.043, 0.9], [0.55, 0.044, 0.62], [0.85, 0.039, 0.5], [1, 0.026, 0.45]], 10, 'leather', { bias: 0.01, vRep: 0.8 }); // calcanhar, arco e dedos
      tube(add(an, [0, 0, 0.035]), mix(he, to, 0.32), [[0, 0.045], [1, 0.043]], 10, 'leather', { bias: 0.012, vRep: 0.4 }); // cano da bota
      const tA = add(mix(hip, J.pel, -0.6), [0, 0, 0.06]), tB = add(mix(hip, kn, 0.3), mul(fwd, 0.02)); // tasset
      tube(tA, tB, [[0, 0.055], [0.6, 0.05], [1, 0.034]], 8, 'plate', { bias: 0.045 });
    }

    // ---------------- tronco: couraça (caixa torácica, bandoleira) e saiote de malha ----------------
    ringMesh(J.hipRings, J.pel, J.neck, 'mail', [0, 0.5, 1], { bias: -0.01 });
    ringMesh(J.torsoRings, J.pel, J.neck, 'torso', J.torsoV);
    if (fine) ellip(J.pouch, fwd, side, upv, 0.06, 0.04, 0.07, 8, 5, 'leather', { bias: 0.03 });
    glow(J.gemBelt.p, J.gemBelt.n, 0.028, th.gem, 0.9);
    } else this.skinBody(face, lowDetail); // corpo inteiro do atlas anatômico, deformado pelo esqueleto

    // ---------------- cabeça: crânio e rosto esculpidos, cabelo curto ----------------
    const hd = J.head, F = J.hF, U = J.hU, Sd = J.hS, eL = TX.eyeLa;
    const toW = q => add(hd, add(add(mul(F, q[0]), mul(Sd, q[1])), mul(U, q[2])));
    const onHead = (la, ph, sc, feat) => toW(mul(headShape(la, ph, feat, eL), sc || 1));
    // malha esculpida: grade lon/lat sobre headShape; normais por diferenças finitas
    const sculpt = (fn, lonN, latN, la0, la1, ph0, ph1, tex, opt) => {
      lonN = seg(lonN); latN = seg(latN); const G = [];
      for (let i = 0; i <= latN; i++) { const row = []; for (let j = 0; j <= lonN; j++) { const la = lerp(la0, la1, j / lonN), ph = lerp(ph0, ph1, i / latN); row.push({ p: fn(la, ph), uv: [(la + Math.PI) / TAU, ph / Math.PI], la, ph }); } G.push(row); }
      for (let i = 0; i < latN; i++) for (let j = 0; j < lonN; j++) {
        const a = G[i][j], b = G[i][j + 1], cc = G[i + 1][j + 1], dd = G[i + 1][j];
        let n = cross(add(sub(b.p, a.p), sub(cc.p, dd.p)), add(sub(dd.p, a.p), sub(cc.p, b.p))); // normal pelas diagonais da própria grade
        if (len(n) < 1e-9) n = sub(a.p, hd); n = norm(n);
        if (dot(n, sub(mix(a.p, cc.p, 0.5), hd)) < 0) n = mul(n, -1);
        if (i === 0 && ph0 === 0) face([dd.p, cc.p, a.p], [dd.uv, cc.uv, [(a.uv[0] + b.uv[0]) / 2, 0]], tex, n, opt);
        else face([a.p, b.p, cc.p, dd.p], [a.uv, b.uv, cc.uv, dd.uv], tex, n, opt);
      }
    };
    const CABD = root.GUERREIRO_CABECA;
    // pescoço: esternocleidomastoideos e trapézio formam um tronco de cone achatado que entra sob a mandíbula
    if (!atlas) tube(add(J.neck, [0, 0, -0.05]), add(hd, add(mul(U, -0.07), mul(F, -0.015))), [[0, 0.085, 0.85], [0.4, 0.064, 1], [1, 0.057, 1.1]], 12, 'arm', { bias: -0.004, vRep: 0.3 });
    if (CABD) {
      // malha anatômica (MakeHuman, CC0): vértices no referencial da cabeça, normais por face pré-calculadas
      const toV = n => add(add(mul(F, n[0]), mul(Sd, n[1])), mul(U, n[2]));
      const meshLocal = (M, tex, bias, sc, off) => {
        if (!M._n) M._n = M.f.map(fc => { const a = M.v[fc[0]], b = M.v[fc[1]], c2 = M.v[fc[2]]; return norm(cross(sub(b, a), sub(c2, a))); });
        const k = sc || 1, o = off || [0, 0, 0], W = M.v.map(q => toW(add(mul(q, k), o)));
        M.f.forEach((fc, i) => face(fc.map(j => W[j]), fc.map(j => M.uv[j]), tex, toV(M._n[i]), { bias }));
      };
      meshLocal(lowDetail ? CABD.baixa : CABD.alta, 'head', 0.006);
      if (fine) for (const E of CABD.olhos) meshLocal(E, 'eye', 0.0055);
      if (!CABD._couro) { const keep = q => q[2] > 0.072 - 0.5 * Math.max(0, 0.06 - q[0]) || q[0] < -0.02; // linha do cabelo: testa livre, desce nas têmporas e na nuca
        const C2 = CABD.couro, f2 = C2.f.filter(fc => fc.every(j => keep(C2.v[j]))); CABD._couro = { v: C2.v, uv: C2.uv, f: f2 }; }
      if (fine) meshLocal(CABD._couro, 'hair', 0.011, 1.03, [-0.004, 0, 0.004]);       // couro cabeludo (de longe, as mechas bastam)
      // mechas com física (ver Warrior.prototype.hairStep)
      const HS = this.hair; if (HS) HS.forEach((cl, ci) => {
        if (lowDetail && ci % 3) return;
        const P = cl.p, nN = P.length - 1;
        for (let j = 0; j < nN; j++) {
          const a = P[j], b = P[j + 1], w0 = cl.w * (1 - j / nN * 0.75), w1 = cl.w * (1 - (j + 1) / nN * 0.75), out = norm(sub(a, hd));
          const sv = norm(cross(sub(b, a), out)), pts = [add(a, mul(sv, w0)), add(a, mul(sv, -w0)), add(b, mul(sv, -w1)), add(b, mul(sv, w1))];
          let n = norm(cross(sv, sub(b, a))); if (dot(n, out) < 0) n = mul(n, -1);
          face(pts, [[cl.u, j / nN], [cl.u + 0.5, j / nN], [cl.u + 0.5, (j + 1) / nN], [cl.u, (j + 1) / nN]], 'hairStrand', n, { two: true, bias: 0.013 + 0.0004 * ci });
        }
      });
    } else {
      sculpt((la, ph) => onHead(la, ph, 1, true), 28, 18, -Math.PI, Math.PI, 0, Math.PI * 0.94, 'face', { bias: 0.006 }); // cabeça com feições
      const hairline = la => { const L = Math.abs(la); return Math.PI * (L < 1.25 ? 0.3 + 0.1 * Math.pow(L / 1.25, 2) : 0.4 + 0.33 * sstep(1.25, 2.4, L)); };
      const hairF = (la, t) => { const ph = t / Math.PI * hairline(la), q = headShape(la, ph, false, eL), k = 1 - 0.5 * (t / Math.PI);
        return toW([q[0] * (1.02 + 0.02 * k), q[1] * (1.03 + 0.025 * k), q[2] * (1.02 + 0.03 * k) + 0.003]); };
      sculpt(hairF, 28, 8, -Math.PI, Math.PI, 0, Math.PI, 'hair', { bias: 0.012 });
    }
    // trapézio: liga a base do pescoço aos ombros (sem degrau entre pescoço e couraça)
    if (!atlas) for (const sd of ['R', 'L']) tube(add(J.neck, [0, 0, -0.025]), add(J['sh' + sd], [0, 0, 0.035]), [[0, 0.055, 0.8], [0.6, 0.05, 0.75], [1, 0.042, 0.7]], 10, 'arm', { bias: -0.006, vRep: 0.4 });
    const rg = this.rage > 0.05 ? this.rage : 0;
    if (CABD && rg) for (const E of CABD.olhos) { if (!E._c) { E._c = [0, 0, 0]; E.v.forEach(q => { E._c = add(E._c, mul(q, 1 / E.v.length)); }); } const P = toW(add(E._c, [0.012, 0, 0]));
      glow(P, F, 0.012 + 0.02 * rg, [255, 60 + (1 - rg) * 80 | 0, 20], 0.5 + 0.5 * rg, 0.03); }
    else if (!CABD && (!TX.faceImg || rg)) for (const sgn of [-1, 1]) { const la = sgn * eL, ph = Math.PI * 0.5, P = onHead(la, ph, 0.98, true); // olhos acendem na Fúria
      glow(P, norm(sub(P, hd)), 0.012 + 0.02 * rg, rg ? [255, 60 + (1 - rg) * 80 | 0, 20] : [255, 150, 40], 0.5 + 0.5 * rg, 0.03); }

    // ---------------- braços: malha, cotoveleira, braçadeira de osso, manopla; ombreiras em lâminas ----------------
    for (const sd of ['R', 'L']) {
      const sh = J['sh' + sd], el = J['el' + sd], ha = J['ha' + sd], fa = norm(sub(ha, el)), ua = norm(sub(el, sh));
      hand(sd, ha, fa);
      if (atlas) continue;
      tube(sh, el, [[0, 0.074], [0.2, 0.084, 1.05, 0.004], [0.5, 0.074, 1.12, -0.01], [0.75, 0.064, 1.05, -0.006], [1, 0.054]], 12, 'arm', { vRep: 0.6 }); // deltoide, bíceps e tríceps
      ellip(add(sh, add(mul(norm(sub(sh, J.neck)), 0.02), [0, 0, -0.025])), norm(sub(el, sh)), fwd, norm(sub(sh, J.neck)), 0.055, 0.07, 0.065, 10, 6, 'arm', { bias: 0.002 }); // deltoide
      tube(mix(sh, el, 0.58), mix(sh, el, 0.7), [[0, 0.079], [0.5, 0.081], [1, 0.077]], 12, 'leather', { bias: 0.004, vRep: 0.25 });
      ellip(add(el, mul(norm(sub(ua, fa)), 0.015)), ua, side, fa, 0.042, 0.048, 0.048, 8, 5, 'plate', { bias: 0.006 }); // cotoveleira
      tube(el, ha, [[0, 0.058], [0.25, 0.062, 1.15, 0.004], [0.7, 0.046, 1.2], [1, 0.038, 1.3]], 10, 'bracer', { bias: 0.01 }); // antebraço achatado no punho
      const out = norm(sub(sh, J.neck)), Up = norm(add(mul(out, 0.45), [0, 0, 1])), Fp = norm(cross(out, [0, 0, 1])), Sp = norm(cross(Up, Fp));
      for (let k = 1; k >= 0; k--) { // ombreira discreta de duas lâminas
        const pc = add(sh, add(mul(out, 0.03 + 0.03 * k), [0, 0, 0.035 - 0.04 * k]));
        ellip(pc, Fp, Sp, Up, 0.095 - 0.008 * k, 0.09 - 0.007 * k, 0.07 - 0.008 * k, 14, 6, 'plate', { bias: 0.07 - 0.004 * k, ph1: Math.PI * 0.6 });
      }
    }

    // ---------------- arma equipada ----------------
    const d = J.dir, e = J.edge, nb0 = cross(d, e);
    if (this.weapon === 'espada') {
      const g = J.guard;
      tube(J.pommel, g, [[0, 0.027], [0.5, 0.03], [1, 0.027]], 6, 'leather', { bias: 0.03, vRep: 3 });
      ellip(J.pommel, d, e, nb0, 0.05, 0.046, 0.046, 8, 5, 'bone', { bias: 0.031 });
      tube(add(g, mul(e, 0.15)), add(g, mul(e, -0.15)), [[0, 0.018], [0.2, 0.03], [0.5, 0.036], [0.8, 0.03], [1, 0.018]], 6, 'gold', { bias: 0.032 });
      const n = lowDetail ? 6 : 10, cl = [], wl = [], wr = [];
      for (let i = 0; i <= n; i++) { const t = i / n, w = 0.062 * (1 - Math.pow(t, 2.2)) + 0.003, c0 = add(g, mul(d, t * SK.blade)); cl.push(c0); wl.push(add(c0, mul(e, w))); wr.push(add(c0, mul(e, -w * (i % 2 && i < n - 1 ? 1.35 : 1)))); }
      bladeStrip(cl, wl, wr, 'blade', 0.035);
    } else if (this.weapon === 'lanca') {
      const sock = add(J.headB, mul(d, -0.12));
      tube(J.butt, sock, [[0, 0.021], [1, 0.023]], 8, 'wood', { bias: 0.03, vRep: 3 });
      tube(add(J.butt, mul(d, -0.12)), J.butt, [[0, 0.003], [1, 0.026]], 6, 'iron', { bias: 0.031 });
      const grips = [J.haR]; if (!this.shield) grips.push(add(J.haR, mul(d, WEAPONS.lanca.off2)));
      for (const gp of grips) tube(add(gp, mul(d, -0.08)), add(gp, mul(d, 0.08)), [[0, 0.025], [0.5, 0.027], [1, 0.025]], 8, 'leather', { bias: 0.032, vRep: 0.5 });
      for (const t of [0.25, 0.55]) tube(mix(J.butt, sock, t), add(mix(J.butt, sock, t), mul(d, 0.03)), [[0, 0.027], [1, 0.027]], 8, 'gold', { bias: 0.033 });
      tube(sock, J.headB, [[0, 0.024], [0.6, 0.03], [1, 0.022]], 8, 'iron', { bias: 0.034 });
      for (const sg of [-1, 1]) tube(add(J.headB, mul(d, -0.06)), add(add(J.headB, mul(d, -0.1)), mul(e, sg * 0.09)), [[0, 0.016], [1, 0.002]], 6, 'steel', { bias: 0.035 }); // asas
      const n = lowDetail ? 6 : 10, cl = [], wl = [], wr = [];
      for (let i = 0; i <= n; i++) { const t = i / n, w = 0.06 * Math.pow(t < 0.3 ? t / 0.3 : (1 - t) / 0.7, 0.75) + 0.004, c0 = add(J.headB, mul(d, t * WEAPONS.lanca.head)); cl.push(c0); wl.push(add(c0, mul(e, w))); wr.push(add(c0, mul(e, -w))); }
      bladeStrip(cl, wl, wr, 'steel', 0.036);
      clothMesh(this.tassel, 'cloth', 'clothIn', J.tip, false, 0.03);
    } else {
      const top = J.top;
      tube(J.butt, top, [[0, 0.023], [1, 0.025]], 8, 'wood', { bias: 0.03, vRep: 3 });
      tube(add(J.butt, mul(d, -0.1)), J.butt, [[0, 0.003], [1, 0.027]], 6, 'iron', { bias: 0.031 });
      for (const gp of [J.haR, add(J.haR, mul(d, WEAPONS.foice.off2))]) tube(add(gp, mul(d, -0.08)), add(gp, mul(d, 0.08)), [[0, 0.027], [0.5, 0.029], [1, 0.027]], 8, 'leather', { bias: 0.032, vRep: 0.5 });
      for (const t of [0.15, 0.85]) tube(mix(J.butt, top, t), add(mix(J.butt, top, t), mul(d, 0.035)), [[0, 0.03], [1, 0.03]], 8, 'gold', { bias: 0.033 });
      tube(add(top, mul(d, -0.1)), add(top, mul(d, 0.05)), [[0, 0.03], [0.5, 0.038], [1, 0.03]], 8, 'iron', { bias: 0.034 });
      tube(add(top, mul(d, 0.05)), add(top, mul(d, 0.2)), [[0, 0.022], [1, 0.002]], 6, 'steel', { bias: 0.034 }); // espigão
      ellip(add(top, mul(e, -0.04)), mul(e, -1), d, norm(nb0), 0.045, 0.042, 0.045, 8, 6, 'skull', { bias: 0.036 });
      const n = lowDetail ? 7 : 12, cl = [], wl = [], wr = [];
      for (let i = 0; i <= n; i++) { const t = i / n, c0 = add(add(top, mul(e, 0.84 * t)), mul(d, -0.32 * t * t));
        const tg = norm(add(mul(e, 0.84), mul(d, -0.64 * t))), pp = norm(add(mul(e, 0.64 * t), mul(d, 0.84))), w = 0.13 * Math.pow(1 - t, 0.6) + 0.004;
        void tg; cl.push(add(c0, mul(pp, -w * 0.45))); wl.push(add(c0, mul(pp, w * 0.15))); wr.push(add(c0, mul(pp, -w))); }
      bladeStrip(cl, wl, wr, 'steel', 0.037);
    }

    // ---------------- escudo: disco abaulado, aro e verso ----------------
    if (this.shield) {
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
          if (j === 0) face(p.slice(0, 3), [tuv(r0, a0), tuv(r1, a0), tuv(r1, a1)], tex, fn, { bias: 0.05 });
          else face(p, [tuv(r0, a0), tuv(r1, a0), tuv(r1, a1), tuv(r0, a1)], tex, fn, { bias: 0.05 });
        }
      }
      for (let k = 0; k < K; k++) { const a0 = k / K * TAU, a1 = (k + 1) / K * TAU;
        face([pt(Rr, a0, 0), pt(Rr, a1, 0), pt(Rr, a1, -0.03), pt(Rr, a0, -0.03)], [[k / K, 0], [(k + 1) / K, 0], [(k + 1) / K, 0.1], [k / K, 0.1]], 'iron', norm(add(mul(u, Math.cos((a0 + a1) / 2)), mul(v, Math.sin((a0 + a1) / 2)))), { bias: 0.05 }); }
    }

    // ---------------- render: ordena, textura (UV afim) pré-iluminada, especular e contraluz ----------------
    faces.sort((a, b) => a.d - b.d); glows.sort((a, b) => a.d - b.d);
    const Hv = norm(add(LIGHT_W, CAM)), rim = th.rim;
    let gi = 0;
    const drawGlow = gl => {
      if (dot(gl.n, CAM) < 0.05) return; const q = S(gl.P), r = gl.r * s * 2.2;
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
      const lit = 0.45 + 0.76 * Math.max(0, dot(n, LIGHT_W)) + 0.1 * n[2] + (f.tex === 'face' || f.tex === 'head' ? 0.2 : f.tex === 'body' ? 0.08 : f.tex === 'skin' || f.tex === 'arm' ? 0.1 : 0);
      const img = TX[f.tex], pat = patFor(f.tex, clamp(Math.round((lit - 0.12) / 1.13 * (NL - 1)), 0, NL - 1)), last = f.pts.length - 1;
      const M = uvMatrix([f.uv[0][0] * img.width, f.uv[0][1] * img.height], [f.uv[1][0] * img.width, f.uv[1][1] * img.height], [f.uv[last][0] * img.width, f.uv[last][1] * img.height], S(f.pts[0]), S(f.pts[1]), S(f.pts[last]));
      if (M && pat.setTransform) { pat.setTransform(new DOMMatrix(M)); c.fillStyle = pat; } else c.fillStyle = FALLBACK[f.tex];
      c.fill();
      const spc = SPEC[f.tex], hs = spc ? spc[0] * Math.pow(Math.max(0, dot(n, Hv)), spc[1]) : 0;
      const rm = f.tex === 'hairStrand' || f.tex === 'hair' ? 0 : Math.pow(1 - clamp(dot(n, CAM), 0, 1), 3) * Math.max(0, -dot(n, LIGHT_W) + 0.3) * 0.6;
      if (hs > 0.05 || rm > 0.05) {
        c.globalCompositeOperation = 'lighter';
        if (hs > 0.05) { c.fillStyle = `rgba(255,240,220,${Math.min(0.85, hs).toFixed(2)})`; c.fill(); }
        if (rm > 0.05) { c.fillStyle = `rgba(${rim[0]},${rim[1]},${rim[2]},${Math.min(0.5, rm).toFixed(2)})`; c.fill(); }
        c.globalCompositeOperation = 'source-over';
      }
    }
    while (gi < glows.length) drawGlow(glows[gi++]);
    // grão de pintura
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = 0.14;
    c.fillStyle = c.createPattern(grain(), 'repeat'); c.fillRect(0, 0, W, H);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // ---------------- composição no contexto do jogo ----------------
    const alpha = o.alpha == null ? 1 : o.alpha;
    ctx.save(); ctx.globalAlpha *= alpha;
    const pc = proj([J.pel[0], J.pel[1], 0], s), shW = (this.action && this.action.name === 'morte' ? 0.75 : 0.45) * s;
    const sg = ctx.createRadialGradient(x + pc[0], y + pc[1], 0, x + pc[0], y + pc[1], shW);
    sg.addColorStop(0, 'rgba(0,0,0,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x + pc[0], y + pc[1], shW, shW * 0.5, 0, 0, TAU); ctx.fill();
    this.drawFx(ctx, x, y, s, true);
    const sx = this.sx; sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, W, H); sx.drawImage(this.cv, 0, 0); sx.globalCompositeOperation = 'source-in';
    const glowCol = o.rarity || (this.rage > 0.05 ? `rgba(255,60,30,${(0.35 + 0.5 * this.rage).toFixed(2)})` : null);
    if (glowCol) {
      sx.fillStyle = glowCol; sx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = glowCol; ctx.shadowBlur = s * 0.22; ctx.globalAlpha *= 0.55 + 0.15 * Math.sin(this.t * 4);
      ctx.drawImage(this.sil, x - ox, y - oy); ctx.restore();
      sx.globalCompositeOperation = 'source-in';
    }
    sx.fillStyle = INK; sx.fillRect(0, 0, W, H);
    const ow = Math.max(1, s * 0.02);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.drawImage(this.sil, x - ox + Math.cos(a) * ow, y - oy + Math.sin(a) * ow); }
    ctx.drawImage(this.cv, x - ox, y - oy);
    if (o.hurt > 0) { sx.fillStyle = `rgba(255,${(200 - 160 * o.hurt) | 0},${(180 - 160 * o.hurt) | 0},1)`; sx.fillRect(0, 0, W, H); ctx.globalAlpha = alpha * 0.7 * o.hurt; ctx.drawImage(this.sil, x - ox, y - oy); ctx.globalAlpha = alpha; }
    this.drawTrail(ctx, x, y, s, o.rarity);
    this.drawFx(ctx, x, y, s, false);
    ctx.restore();
  };

  Warrior.prototype.drawTrail = function (ctx, x, y, s, rar) {
    const T = this.trail; if (T.length < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const col = rar || (this.weapon === 'foice' ? '#ff9a7a' : '#ffd9a0'), life = 0.16;
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
        if (f.crack) {
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

  // Ponte opcional com o estado do jogo "O Atlas Perdido" (objetos P e G).
  Warrior.prototype.syncFromGame = function (P, G, dt) {
    const w = P.equip && P.equip.arma, n = w ? (w.name || '') + ' ' + (w.icon || '') : '';
    const wk = /Foice|scythe|nw_2[789]|nw_38/i.test(n) ? 'foice' : /Lança|Lanca|Pique|spear/i.test(n) ? 'lanca' : 'espada';
    if (wk !== this.weapon) this.setWeapon(wk, wk !== 'foice');
    const fac = Math.atan2(P.dirY || 0, P.dirX || 1);
    const a = P.artAction, live = a && G.t - a.start < a.duration;
    if (live && this._lastA !== a.start) {
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

  if (root.GUERREIRO_IMAGENS) setImages(root.GUERREIRO_IMAGENS);
  root.GuerreiroOsseo = { create: o => new Warrior(o), Warrior, WEAPONS, THEMES, project: proj, setImages, textures: buildTextures };
})(typeof window !== 'undefined' ? window : globalThis);
