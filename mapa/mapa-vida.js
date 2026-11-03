/* =====================================================================
   MAPA VIVO — camada estética do mapa de "O Atlas Perdido"
   - chão orgânico: textura de tecido (simplex-noise, MIT) aplicada sobre o terreno pré-renderizado,
     microflora pintada no chão (capilares, nervos, lascas de osso, coágulos, fibrina) por amostragem de Poisson;
   - osso trabecular: poros e fissuras sobre os platôs de osso;
   - props pintados por código no lugar da pixel art: cisto (cérebro), osteófito (rocha), fístula (gêiser);
   - fauna: ácaros que perambulam e fogem do jogador, enxames de moscas e esporos luminosos.
   Depende de SimplexNoise (vendor/simplex-noise.js). Usa as funções globais do jogo (SX, SY, isoY, liftAt,
   groundAt, ctx, G, P, hash2) apenas no momento das chamadas.
   ===================================================================== */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const SN = root.SimplexNoise ? new root.SimplexNoise('atlas-perdido') : null;
  const n2 = (x, y) => (SN ? SN.noise2D(x, y) : Math.sin(x * 1.7 + y * 2.3) * Math.cos(x * 0.7 - y * 1.1));
  const fbm = (x, y, o) => { let a = 0, f = 1, w = 0.5; for (let i = 0; i < (o || 4); i++) { a += w * n2(x * f, y * f); f *= 2.03; w *= 0.5; } return a; };
  function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

  // ---------- textura de tecido (ladrilhável): manchas de baixa frequência + fibras + rede capilar ----------
  // Retorna um padrão em tons neutros (claro/escuro com alfa) para 'soft-light' sobre o chão já pintado.
  function tissueTile(size) {
    const [c, g] = mk(size, size), im = g.createImageData(size, size), d = im.data, P = size / 64;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      // coordenadas no toro para ladrilhar sem emenda
      const a = x / size * TAU, b = y / size * TAU, R = P / 6;
      const X = Math.cos(a) * R, Y = Math.sin(a) * R, Z = Math.cos(b) * R, W = Math.sin(b) * R;
      const mott = fbm(X + Z * 0.7 + 3.1, Y + W * 0.7 - 1.7, 4);                       // manchas
      const fib = Math.sin((y / size) * TAU * 22 + fbm(X * 2, Z * 2, 2) * 6) * 0.5 + 0.5;  // fibras paralelas
      const cap = Math.abs(fbm(X * 3.1 + 9, W * 3.1 - 4, 3));                           // capilares (vales do ruído)
      let v = 0.5 + mott * 0.32 + (fib - 0.5) * 0.12 - (cap < 0.035 ? (0.035 - cap) * 9 : 0);
      v = clamp(v, 0, 1); const i = (y * size + x) * 4, red = cap < 0.035 ? 1 : 0;
      d[i] = v * 255; d[i + 1] = v * (red ? 120 : 235); d[i + 2] = v * (red ? 120 : 225); d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0); return c;
  }
  // ---------- osso trabecular: poros (células de Voronoi aproximadas por ruído) e fissuras ----------
  function boneTile(size) {
    const [c, g] = mk(size, size), im = g.createImageData(size, size), d = im.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const a = x / size * TAU, b = y / size * TAU, X = Math.cos(a) * 1.4, Y = Math.sin(a) * 1.4, Z = Math.cos(b) * 1.4, W = Math.sin(b) * 1.4;
      const pore = fbm(X * 3 + Z, Y * 3 + W, 3), crack = Math.abs(fbm(X * 1.6 - Z, W * 1.6 + 5, 4));
      let v = 0.62 + fbm(X + 7, Z - 2, 3) * 0.18; if (pore > 0.28) v -= (pore - 0.28) * 2.2; if (crack < 0.02) v -= (0.02 - crack) * 18;
      v = clamp(v, 0, 1); const i = (y * size + x) * 4; d[i] = v * 255; d[i + 1] = v * 236; d[i + 2] = v * 205; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0); return c;
  }
  let TT = null, BT = null;

  // ---------- amostragem de Poisson (Bridson), como em kchapelier/poisson-disk-sampling (MIT) ----------
  function poisson(w, h, r, R, k) {
    const cs = r / Math.SQRT2, gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), grid = new Int32Array(gw * gh).fill(-1), pts = [], act = [];
    const add = p => { pts.push(p); act.push(p); grid[((p[1] / cs) | 0) * gw + ((p[0] / cs) | 0)] = pts.length - 1; };
    add([R() * w, R() * h]);
    while (act.length) {
      const i = (R() * act.length) | 0, p = act[i]; let ok = false;
      for (let t = 0; t < (k || 20); t++) {
        const a = R() * TAU, d = r * (1 + R()), q = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
        if (q[0] < 0 || q[1] < 0 || q[0] >= w || q[1] >= h) continue;
        const gx = (q[0] / cs) | 0, gy = (q[1] / cs) | 0; let far = true;
        for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && far; yy++) for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) { const j = grid[yy * gw + xx]; if (j >= 0 && Math.hypot(pts[j][0] - q[0], pts[j][1] - q[1]) < r) { far = false; break; } }
        if (far) { add(q); ok = true; break; }
      }
      if (!ok) act.splice(i, 1);
    }
    return pts;
  }

  // ---------- 1) chão: textura de tecido + microflora pintada direto nos ladrilhos ----------
  function tingirTerreno(E) {
    const { tiles, TILE, ISO_K, ISO_OX, ISO_OY, screenToWorld, isoX, isoY, liftAt, groundAt, regionAt, tileCtx, TCOLS, TROWS, WORLD_W, WORLD_H } = E; // E.TEND: polilinhas dos tendões
    TT = TT || tissueTile(256);
    const first = tiles.find(t => t); if (!first) return;
    const pat = first.g.createPattern(TT, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(2.2));
    for (const t of tiles) {
      if (!t) continue; const g = t.g, [mc, mg] = mk(t.cv.width, t.cv.height); mg.drawImage(t.cv, 0, 0); // máscara: o vazio continua vazio
      g.save(); g.setTransform(ISO_K, ISO_K * 0.5, -ISO_K, ISO_K * 0.5, ISO_OX - t.c * TILE, ISO_OY - t.r * TILE);
      const q = [[0, 0], [TILE, 0], [0, TILE], [TILE, TILE]].map(([sx, sy]) => screenToWorld(sx + t.c * TILE, sy + t.r * TILE));
      const xs = q.map(v => v.x), ys = q.map(v => v.y);
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 0.85; g.fillStyle = pat;
      g.fillRect(Math.min(...xs) - 200, Math.min(...ys) - 200, Math.max(...xs) - Math.min(...xs) + 400, Math.max(...ys) - Math.min(...ys) + 400);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(mc, 0, 0);
      g.restore();
    }
    // tendões: cordões lisos e brilhantes (curva de Bézier pelos pontos de cada tendão), no lugar dos degraus de célula
    if (E.TEND) for (const T of E.TEND) {
      const pts = []; for (let i = 0; i <= 80; i++) { const t = i / 80, u = 1 - t; pts.push([u * u * T[0][0] + 2 * u * t * T[1][0] + t * t * T[2][0], u * u * T[0][1] + 2 * u * t * T[1][1] + t * t * T[2][1]]); }
      const sp = pts.map(([x, y]) => [isoX(x, y), isoY(x, y) - liftAt(x, y)]);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of sp) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let c = Math.max(0, Math.floor((x0 - 20) / TILE)); c <= Math.min(TCOLS - 1, Math.floor((x1 + 20) / TILE)); c++)
        for (let r = Math.max(0, Math.floor((y0 - 20) / TILE)); r <= Math.min(TROWS - 1, Math.floor((y1 + 20) / TILE)); r++) {
          const g = tileCtx(c, r); g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
          const path = (dy) => { g.beginPath(); sp.forEach(([x, y], i) => (i ? g.lineTo(x, y + dy) : g.moveTo(x, y + dy))); };
          path(3); g.strokeStyle = 'rgba(20,4,6,.55)'; g.lineWidth = 15; g.stroke();          // sombra de contato
          path(0); g.strokeStyle = '#b8a888'; g.lineWidth = 12; g.stroke();                  // corpo do tendão
          path(-1.5); g.strokeStyle = '#e6dcc2'; g.lineWidth = 6; g.stroke();               // brilho perolado
          path(-3); g.strokeStyle = 'rgba(255,250,236,.55)'; g.lineWidth = 1.6; g.stroke();  // reflexo úmido
          for (const dy of [-3.5, 0, 3.5]) { path(dy); g.strokeStyle = 'rgba(120,100,76,.35)'; g.lineWidth = 0.8; g.stroke(); } // fibras colágenas
          g.restore();
        }
    }
    // microflora: desenhada em coordenadas de tela de cada ladrilho que a mancha toca
    const R = rng(4242), pts = poisson(WORLD_W, WORLD_H, 95, R, 12);
    const onTiles = (x0, y0, x1, y1, fn) => {
      for (let c = Math.max(0, Math.floor(x0 / TILE)); c <= Math.min(TCOLS - 1, Math.floor(x1 / TILE)); c++)
        for (let r = Math.max(0, Math.floor(y0 / TILE)); r <= Math.min(TROWS - 1, Math.floor(y1 / TILE)); r++) { const g = tileCtx(c, r); g.save(); fn(g); g.restore(); } // tileCtx já vem deslocado para o ladrilho
    };
    const S = (x, y) => [isoX(x, y), isoY(x, y) - liftAt(x, y)];
    for (const [wx, wy] of pts) {
      if (groundAt(wx, wy) < -900) continue; const reg = regionAt(wx, wy); if (!reg) continue;
      const k = R(), rt = reg.type;
      // coerência por região: dedos = tendão/fibrina; vale e montes = capilares e coágulos; fossa = nervo; carpo = lascas de osso
      const kind = rt === 'carpal' ? (k < 0.6 ? 'osso' : 'fibrina') : rt === 'fossa' ? (k < 0.7 ? 'nervo' : 'capilar') : rt === 'finger' ? (k < 0.5 ? 'fibrina' : k < 0.8 ? 'capilar' : 'coagulo') : (k < 0.42 ? 'capilar' : k < 0.62 ? 'coagulo' : k < 0.8 ? 'nervo' : k < 0.92 ? 'osso' : 'fibrina');
      const [cx, cy] = S(wx, wy), sz = 18 + R() * 26;
      onTiles(cx - sz * 1.6, cy - sz, cx + sz * 1.6, cy + sz, g => paintDecal(g, kind, wx, wy, sz, R, S));
    }
  }
  // traços em perspectiva isométrica (pontos no mundo -> tela) para assentar no chão
  function paintDecal(g, kind, wx, wy, sz, R, S) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = S(x, y); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke(); };
    const seed = Math.floor(wx * 13 + wy * 7);
    if (kind === 'capilar') { // árvore capilar ramificada (vermelho-escuro com brilho úmido)
      const branch = (x, y, a, L, d) => { if (d > 4 || L < 4) return; const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
        line([[x, y], [x + Math.cos(a + 0.3) * L * 0.5, y + Math.sin(a + 0.3) * L * 0.5], [x2, y2]], `rgba(${60 + d * 10},6,14,${0.75 - d * 0.1})`, Math.max(0.6, 2.6 - d * 0.5));
        branch(x2, y2, a - 0.5 - R() * 0.4, L * 0.68, d + 1); branch(x2, y2, a + 0.4 + R() * 0.4, L * 0.62, d + 1); };
      branch(wx, wy, R() * TAU, sz * 0.9, 0);
    } else if (kind === 'nervo') { // fio nervoso amarelado com nódulos (ramos sinuosos)
      const pts = []; let x = wx, y = wy, a = R() * TAU; for (let i = 0; i < 9; i++) { pts.push([x, y]); a += n2(seed + i * 0.4, 3.3) * 0.8; x += Math.cos(a) * sz * 0.35; y += Math.sin(a) * sz * 0.35; }
      line(pts, 'rgba(40,22,6,.55)', 3.2); line(pts, 'rgba(226,190,96,.55)', 1.5);
      for (let i = 2; i < pts.length; i += 3) { const [a2, b2] = S(pts[i][0], pts[i][1]); g.fillStyle = 'rgba(240,206,120,.6)'; g.beginPath(); g.ellipse(a2, b2, 2.2, 1.4, 0, 0, TAU); g.fill(); }
    } else if (kind === 'osso') { // lascas de osso esbranquiçado
      for (let i = 0; i < 4; i++) { const x = wx + (R() - 0.5) * sz, y = wy + (R() - 0.5) * sz, a = R() * TAU, L = 4 + R() * 9;
        line([[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], 'rgba(30,20,12,.5)', 3.4); line([[x, y], [x + Math.cos(a) * L, y + Math.sin(a) * L]], 'rgba(224,210,176,.85)', 2); }
    } else if (kind === 'coagulo') { // coágulo escuro com borda úmida
      const [cx, cy] = S(wx, wy), r = sz * 0.42; const gr = g.createRadialGradient(cx - r * 0.2, cy - r * 0.15, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(70,4,10,.75)'); gr.addColorStop(0.7, 'rgba(40,2,6,.6)'); gr.addColorStop(1, 'rgba(40,2,6,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r, r * 0.5, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,170,160,.18)'; g.beginPath(); g.ellipse(cx - r * 0.25, cy - r * 0.12, r * 0.22, r * 0.08, -0.3, 0, TAU); g.fill();
    } else { // fibrina: filamentos claros e finos
      for (let i = 0; i < 5; i++) { const pts = []; let x = wx + (R() - 0.5) * sz * 0.6, y = wy + (R() - 0.5) * sz * 0.6, a = R() * TAU;
        for (let j = 0; j < 5; j++) { pts.push([x, y]); a += (R() - 0.5) * 0.9; x += Math.cos(a) * sz * 0.22; y += Math.sin(a) * sz * 0.22; }
        line(pts, 'rgba(236,214,190,.32)', 1); }
    }
  }

  // ---------- 2) osso trabecular sobre os platôs ----------
  function texturizarOsso(cv) {
    BT = BT || boneTile(128);
    const [tc, tg] = mk(cv.width, cv.height); tg.fillStyle = tg.createPattern(BT, 'repeat'); tg.fillRect(0, 0, cv.width, cv.height);
    tg.globalCompositeOperation = 'destination-in'; tg.drawImage(cv, 0, 0);            // poros só dentro do osso
    const g = cv.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.6; g.drawImage(tc, 0, 0); g.restore();
  }

  // ---------- 3) props pintados (substituem a pixel art destoante) ----------
  const PROPS = {};
  function propSprite(kind, v) {
    const key = kind + v; if (PROPS[key]) return PROPS[key];
    const R = rng(1000 + v * 97 + kind.length * 13), W = 180, H = 170, [c, g] = mk(W, H), cx = W / 2, base = H - 16;
    if (kind === 'cisto') { // aglomerado de cistos translúcidos com vasos e brilho úmido
      const n = 3 + ((R() * 3) | 0), blobs = [];
      for (let i = 0; i < n; i++) blobs.push([cx + (R() - 0.5) * 70, base - 30 - R() * 40, 24 + R() * 22]);
      blobs.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r] of blobs) {
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        gr.addColorStop(0, 'rgba(255,214,200,.95)'); gr.addColorStop(0.35, 'rgba(200,110,110,.92)'); gr.addColorStop(0.85, 'rgba(110,30,40,.95)'); gr.addColorStop(1, 'rgba(50,8,14,1)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.86, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(90,10,24,.7)'; g.lineWidth = 1.4; for (let k = 0; k < 4; k++) { const a = R() * TAU; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.8); g.quadraticCurveTo(x + Math.cos(a + 0.6) * r * 0.4, y + Math.sin(a + 0.6) * r * 0.3, x + Math.cos(a + 1.2) * r * 0.2, y + Math.sin(a + 1.2) * r * 0.2); g.stroke(); }
        g.fillStyle = 'rgba(255,255,245,.55)'; g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.12, -0.5, 0, TAU); g.fill();
      }
    } else if (kind === 'osteofito') { // esporão ósseo poroso com fissuras e musgo de fibrina
      const pts = []; const N = 14, h = 90 + R() * 40, w = 46 + R() * 18;
      for (let i = 0; i <= N; i++) { const t = i / N, a = Math.PI + t * Math.PI; const r = (t < 0.5 ? t * 2 : (1 - t) * 2); pts.push([cx + Math.cos(a) * w * (0.7 + R() * 0.3), base + Math.sin(a) * h * (0.35 + 0.65 * Math.pow(r, 0.6)) * (0.85 + R() * 0.25)]); }
      const gr = g.createLinearGradient(cx - w, 0, cx + w, 0); gr.addColorStop(0, '#e6d8b8'); gr.addColorStop(0.55, '#b9a47c'); gr.addColorStop(1, '#5e4a32');
      g.fillStyle = gr; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      g.save(); g.clip(); BT = BT || boneTile(128); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.7; g.fillStyle = g.createPattern(BT, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
      g.strokeStyle = 'rgba(40,24,12,.7)'; g.lineWidth = 1.6; for (let k = 0; k < 3; k++) { let x = cx + (R() - 0.5) * w, y = base - h * (0.3 + R() * 0.5); g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (R() - 0.5) * 14; y += 6 + R() * 8; g.lineTo(x, y); } g.stroke(); }
      g.strokeStyle = 'rgba(30,18,10,.85)'; g.lineWidth = 2; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    } else { // fístula: cratera de carne com sangue e bolhas
      const gr = g.createRadialGradient(cx, base - 26, 6, cx, base - 20, 70);
      gr.addColorStop(0, '#1a0204'); gr.addColorStop(0.35, '#5a0a12'); gr.addColorStop(0.62, '#9e2a30'); gr.addColorStop(0.85, '#6a1a1e'); gr.addColorStop(1, 'rgba(40,8,10,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, base - 22, 72, 40, 0, 0, TAU); g.fill();
      g.fillStyle = '#c84a4a'; g.beginPath(); g.ellipse(cx, base - 30, 40, 16, 0, Math.PI, TAU); g.fill(); // lábio superior
      g.fillStyle = '#2a0306'; g.beginPath(); g.ellipse(cx, base - 26, 30, 11, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,20,28,.9)'; g.beginPath(); g.ellipse(cx, base - 24, 24, 7, 0, 0, TAU); g.fill();
      for (let k = 0; k < 5; k++) { const x = cx + (R() - 0.5) * 36, y = base - 24 + (R() - 0.5) * 6, r = 1.5 + R() * 3; g.fillStyle = 'rgba(255,190,180,.5)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(70,10,30,.6)'; g.lineWidth = 1.5; for (let k = 0; k < 6; k++) { const a = Math.PI * (0.05 + R() * 0.9); g.beginPath(); g.moveTo(cx + Math.cos(a) * 40, base - 22 + Math.sin(a) * 18); g.lineTo(cx + Math.cos(a) * 68, base - 22 + Math.sin(a) * 34); g.stroke(); }
    }
    return (PROPS[key] = c);
  }
  const SWAP = { brainrock: 'cisto', rock: 'osteofito', geyser: 'fistula' };
  function desenharProp(p) {
    const kind = SWAP[p.art]; if (!kind) return false;
    const lift = liftAt(p.x, p.y), x = SX(p.x, p.y), y = SY(p.x, p.y, lift), v = (hash2(p.x | 0, p.y | 0) * 4) | 0, cv = propSprite(kind, v);
    const sc = (kind === 'fistula' ? 1.1 : 0.95) * p.h / 90, w = cv.width * sc, h = cv.height * sc;
    shadowAt(x, y + 2, p.h * 0.32, p.h * 0.11, 0.55);
    ctx.drawImage(cv, x - w / 2, y + 6 - h, w, h);
    if (kind === 'fistula' && Math.random() < 0.08) G.parts && G.parts.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y + (Math.random() - 0.5) * 10, z: 6, vz: 40 + Math.random() * 40, grav: 120, life: 0.7, t: 0, size: 2 + Math.random() * 2, col: '#8a1018', type: 'blood' });
    return true;
  }

  // ---------- 4) fauna ----------
  const BUGS = [], SPORES = [];
  let lastT = null;
  function solo(x, y) { return groundAt(x, y) > -900; }
  function atualizar(dt) {
    const px = P.x, py = P.y;
    // ácaros: mantém ~22 por perto do jogador; perambulam pelo ruído e fogem quando ele se aproxima
    while (BUGS.length < 22) { const a = Math.random() * TAU, d = 300 + Math.random() * 700, x = px + Math.cos(a) * d, y = py + Math.sin(a) * d; if (solo(x, y)) BUGS.push({ x, y, h: Math.random() * TAU, sp: 18 + Math.random() * 20, ph: Math.random() * 100, s: 0.7 + Math.random() * 0.6 }); else break; }
    for (let i = BUGS.length - 1; i >= 0; i--) {
      const b = BUGS[i]; b.ph += dt;
      const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);
      if (d > 1400) { BUGS.splice(i, 1); continue; }
      let want = b.h + n2(b.ph * 0.4, i * 7.1) * 2.2 * dt, sp = b.sp;
      if (d < 170) { want = Math.atan2(dy, dx); sp = b.sp * 4.5; } // foge
      b.h = want; const nx = b.x + Math.cos(b.h) * sp * dt, ny = b.y + Math.sin(b.h) * sp * dt;
      if (solo(nx, ny) && Math.abs(liftAt(nx, ny) - liftAt(b.x, b.y)) < 6) { b.x = nx; b.y = ny; b.walk = (b.walk || 0) + sp * dt; } else b.h += Math.PI * (0.5 + Math.random());
    }
    // esporos luminosos: sobem devagar e oscilam; nascem perto de flora nervosa ou ao acaso
    while (SPORES.length < 46) { const a = Math.random() * TAU, d = Math.random() * 900; SPORES.push({ x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, z: Math.random() * 60, t: 0, life: 6 + Math.random() * 8, ph: Math.random() * 100, hue: Math.random() < 0.7 ? 0 : 1 }); }
    for (let i = SPORES.length - 1; i >= 0; i--) { const s = SPORES[i]; s.t += dt; s.ph += dt; s.z += dt * 7; s.x += n2(s.ph * 0.3, i) * 12 * dt; s.y += n2(i, s.ph * 0.3) * 12 * dt; if (s.t > s.life || Math.hypot(s.x - px, s.y - py) > 1200) SPORES.splice(i, 1); }
  }
  function drawBug(b) {
    const lift = liftAt(b.x, b.y), x = SX(b.x, b.y), y = SY(b.x, b.y, lift), s = b.s, w = b.walk || 0;
    const ang = Math.atan2(Math.sin(b.h) + Math.cos(b.h), (Math.cos(b.h) - Math.sin(b.h)) * 2); // direção projetada no isométrico
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.62); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 3, 7 * s, 4 * s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a0a08'; ctx.lineWidth = 1.1;
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) { const sw = Math.sin(w * 0.35 + k * 2 + (sd > 0 ? Math.PI : 0)) * 1.6; ctx.beginPath(); ctx.moveTo((k - 1) * 2.6 * s, 0); ctx.lineTo((k - 1) * 3.4 * s + sw, sd * 6.5 * s); ctx.stroke(); }
    const gr = ctx.createRadialGradient(-1, -1.5, 0.5, 0, 0, 5.5 * s); gr.addColorStop(0, '#b2463a'); gr.addColorStop(0.6, '#5a140e'); gr.addColorStop(1, '#1e0504');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, 5.5 * s, 4 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1e0504'; ctx.beginPath(); ctx.ellipse(5.4 * s, 0, 2 * s, 1.6 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,200,.45)'; ctx.beginPath(); ctx.ellipse(-1.2 * s, -1.6 * s, 1.6 * s, 0.8 * s, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // moscas: enxame em torno de árvores de vasos e poças (só o que está em cena)
  function drawFlies(p) {
    const lift = liftAt(p.x, p.y), x = SX(p.x, p.y), y = SY(p.x, p.y, lift) - p.h * 0.55, t = G.t, seed = hash2(p.x | 0, p.y | 0) * 50;
    ctx.fillStyle = 'rgba(20,8,8,.85)';
    for (let i = 0; i < 7; i++) { const a = t * (2.2 + i * 0.37) + seed + i, r = 10 + 14 * (0.5 + 0.5 * n2(t * 0.6 + i, seed)); const fx = x + Math.cos(a) * r * 1.4, fy = y + Math.sin(a * 1.3) * r * 0.6;
      ctx.fillRect(fx - 1, fy - 1, 2, 2); ctx.fillStyle = 'rgba(200,190,180,.35)'; ctx.fillRect(fx - 2 + Math.sin(t * 60 + i) , fy - 2, 1.5, 1); ctx.fillStyle = 'rgba(20,8,8,.85)'; }
  }
  function empilhar(pushItem, inView) {
    const now = G.t; const dt = lastT == null ? 0 : clamp(now - lastT, 0, 0.05); lastT = now;
    if (G.started && !G.paused) atualizar(dt);
    for (const b of BUGS) if (inView(b.x, b.y, 40)) pushItem(b.x + b.y - 0.5, drawBug, b);
    for (const p of G.props) if ((p.art === 'tree' || p.art === 'tree2' || p.art === 'pool' || p.art === 'geyser') && inView(p.x, p.y, 120)) pushItem(p.x + p.y + 0.5, drawFlies, p);
  }
  // esporos: desenhados no modo aditivo, depois da luz (brilham no escuro)
  function brilhos() {
    for (const s of SPORES) {
      const k = Math.min(1, s.t / 1.5, (s.life - s.t) / 1.5), x = SX(s.x, s.y), y = SY(s.x, s.y, liftAt(s.x, s.y) + s.z), r = 2.2 + Math.sin(s.ph * 3) * 0.6;
      ctx.globalAlpha = 0.55 * k; ctx.fillStyle = s.hue ? '#ffd27a' : '#ff6a4a';
      ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.globalAlpha = 0.14 * k; ctx.fill();
      ctx.globalAlpha = 0.7 * k; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  root.MapaVida = { tingirTerreno, texturizarOsso, desenharProp, empilhar, brilhos, poisson };
})(typeof window !== 'undefined' ? window : globalThis);
