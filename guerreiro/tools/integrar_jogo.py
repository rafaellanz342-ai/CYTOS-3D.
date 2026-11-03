# Monta o jogo "O Atlas Perdido" com o Guerreiro Ósseo integrado e otimizações de desempenho.
# Uso: python3 integrar_jogo.py jogo_original.html saida.html
#  1. Embute guerreiro-imagens/cabeca/corpo/osseo.js antes do script do jogo.
#  2. O drawPlayer da classe Guerreiro passa a desenhar o personagem 3D (pose redesenhada a até 30 Hz).
#  3. Desenhos a partir dos atlas gigantes (até 2048x4608 px, acima do limite de textura de muitos celulares)
#     passam a usar recortes em cache, um canvas pequeno por sprite, criado uma única vez.
import re, sys, os
src, out = sys.argv[1], sys.argv[2]
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
s = open(src, encoding='utf-8').read()

M = os.path.join(G, '..', 'mapa')
mods = ''.join('<script>/* %s */\n%s</script>\n' % (os.path.basename(f), open(f, encoding='utf-8').read())
               for f in [os.path.join(M, 'vendor', 'simplex-noise.js'), os.path.join(M, 'mapa-vida.js')] +
                        [os.path.join(G, f) for f in ['guerreiro-imagens.js', 'guerreiro-armas.js', 'guerreiro-cabeca.js', 'guerreiro-corpo.js', 'guerreiro-osseo.js']])
lib = '<script src="https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/dist/index.umd.js"></script>\n'
assert s.count(lib) == 1
s = s.replace(lib, lib + mods)

# --- Guerreiro 3D no lugar do sprite ---
a = "  const fl = facingLeft(P.dirX, P.dirY), hurt = P.hurtT > 0 ? P.hurtT / .3 : 0;\n"
assert s.count(a) == 1
s = s.replace(a, a + """  if (P.cls.id === 'guerreiro' && window.GuerreiroOsseo) { // Guerreiro Ósseo: corpo anatômico 3D procedural (guerreiro-osseo.js)
    const now = performance.now(), gdt = Math.min(.05, (now - (window.__goT || now)) / 1000); window.__goT = now;
    const go = window.__go || (window.__go = GuerreiroOsseo.create({ scale: 74 }));
    go.setArmor(!!(P.equip && (P.equip.armadura || P.equip.elmo)));
    go.syncFromGame(P, G, gdt);
    const w = P.equip && P.equip.arma;
    go.draw(ctx, x, y, { scale: 74, maxHz: 30, hurt, alpha: P.iframes > 0 && !P.roll ? .7 : 1, rarity: w && w.rarity >= 1 ? RARITY[w.rarity].color : null });
    return;
  }
""")

# --- mapa: chão orgânico, osso trabecular, props pintados, fauna e esporos (mapa/mapa-vida.js) ---
def patch(old, new, count=1):
    global s
    assert s.count(old) == count, old[:80]
    s = s.replace(old, new)
# sem lajotas: tira as juntas, a variação de cor por bloco e o relevo de cada bloco (o tecido passa a ser contínuo)
patch("      if (rt !== 'finger') {\n        if (ji)", "      if (rt !== 'finger' && !window.MapaVida) {\n        if (ji)")
patch("const k = 1 + (sh - .5) * .22 * fl; c = [c[0] * k, c[1] * k, c[2] * k]; if (r.type !== 'finger' && !glow[id]) hz[id] += sh * 3.2;",
      "const k = window.MapaVida ? 1 + (vnoise(wx * .021, wy * .021) - .5) * .14 : 1 + (sh - .5) * .22 * fl; c = [c[0] * k, c[1] * k, c[2] * k]; if (r.type !== 'finger' && !glow[id] && !window.MapaVida) hz[id] += sh * 3.2;")
# tabaqueira anatômica: de verde para o roxo-avermelhado de tecido contundido
patch("else if (r.type === 'fossa') c = [66 + n1 * 26 + n2 * 14, 100 + n1 * 22, 68 + n1 * 16];",
      "else if (r.type === 'fossa') c = window.MapaVida ? [86 + n1 * 26 + n2 * 14, 40 + n1 * 14, 58 + n1 * 18] : [66 + n1 * 26 + n2 * 14, 100 + n1 * 22, 68 + n1 * 16];")
patch("  // 2) ossos voxel (mesmo padrão para todos)",
      "  if (window.MapaVida) MapaVida.tingirTerreno({ tiles, TILE, ISO_K, ISO_OX, ISO_OY, screenToWorld, isoX, isoY, liftAt, groundAt, regionAt, tileCtx, TCOLS, TROWS, WORLD_W, WORLD_H, TEND });\n  // 2) ossos voxel (mesmo padrão para todos)")
patch("    // contorno inferior escuro (assenta o osso no chão)\n    b.cells = null;\n",
      "    // contorno inferior escuro (assenta o osso no chão)\n    b.cells = null;\n    if (window.MapaVida) MapaVida.texturizarOsso(cv);\n")
patch("function drawProp(p) {\n", "function drawProp(p) {\n  if (window.MapaVida && MapaVida.desenharProp(p)) return;\n")
patch("  pushItem(P.x + P.y, drawPlayer, null);\n", "  pushItem(P.x + P.y, drawPlayer, null);\n  if (window.MapaVida) MapaVida.empilhar(pushItem, inView);\n")
patch("  drawArtWorldFX();\n  ctx.globalCompositeOperation = 'source-over';", "  drawArtWorldFX();\n  if (window.MapaVida) MapaVida.brilhos();\n  ctx.globalCompositeOperation = 'source-over';")

# tendão: as células só ganham relevo; o desenho liso vem do MapaVida
patch("if (dT < 12) { c = mix3(c, [214, 202, 172], .85 + .15 * (1 - dT / 12)); hz[id] += 3 * (1 - dT / 12); }",
      "if (dT < 12) { c = window.MapaVida ? mix3(c, [96, 40, 40], .35) : mix3(c, [214, 202, 172], .85 + .15 * (1 - dT / 12)); hz[id] += 3 * (1 - dT / 12); }")
# minimapa: a mesma cor da tabaqueira
patch("r.type === 'fossa' ? [52, 80, 56] :", "r.type === 'fossa' ? (window.MapaVida ? [78, 36, 52] : [52, 80, 56]) :")

# --- armas do Guerreiro: só espada, lança e foice (as três com conjunto de golpes no Guerreiro Ósseo) ---
patch("function makeItem(ilvl, rarity, slot, legendary, chosenBase) {\n",
"""// Guerreiro: só as três armas que têm conjunto de golpes próprio no Guerreiro Ósseo. Lanças usam o ícone vertebral.
const ARMAS_GUERREIRO = [
  ['Lâmina Periosteal', 'gw_espada_0', 'Espada', 1], ['Gládio Cortical', 'gw_espada_1', 'Espada', 1.02], ['Lâmina Hemorrágica', 'gw_espada_2', 'Espada', 1.06],
  ['Espada da Diáfise', 'gw_espada_3', 'Espada', 1], ['Serra Cortical', 'gw_espada_4', 'Espada', 1.08], ['Lâmina Hemática', 'gw_espada_5', 'Espada', 1.1], ['Espadão Osteocortical', 'gw_espada_6', 'Espada', 1.15],
  ['Lança Vertebral', 'gw_lanca_0', 'Lança', 1.04], ['Pique Tibial', 'gw_lanca_1', 'Lança', 1.1], ['Lança do Rádio', 'gw_lanca_2', 'Lança', 1.08], ['Lança da Diáfise Femoral', 'gw_lanca_3', 'Lança', 1.16],
  ['Foice Sináptica', 'gw_foice_0', 'Foice', 1.08], ['Foice Mielínica', 'gw_foice_1', 'Foice', 1.12], ['Foice de Ranvier', 'gw_foice_2', 'Foice', 1.16], ['Foice da Condução Saltatória', 'gw_foice_3', 'Foice', 1.18]
];
// drop equilibrado: primeiro o tipo (espada, lança, foice, 1/3 cada), depois o modelo
const pickArmaGuerreiro = () => { const t = pick(['Espada', 'Lança', 'Foice']); return pick(ARMAS_GUERREIRO.filter(a => a[2] === t)); };
// arte nova: armas antigas (de saves) ganham o ícone pintado pelo nome; o martelo lendário vira a lança
function arteArmaGuerreiro(it) {
  if (!it || it.slot !== 'arma') return it;
  if (it.name === 'Martelo do Capitato') it.name = 'Lança do Capitato';
  if (it.name === 'Lança do Capitato') { it.icon = 'gw_lanca_4'; return it; }
  const a = ARMAS_GUERREIRO.find(b => b[0] === it.name);
  if (a) it.icon = a[1]; else if (/Foice/.test(it.name)) it.icon = 'gw_foice_0'; else if (/Lança|Pique/.test(it.name)) it.icon = 'gw_lanca_0'; else if (armaGuerreiroOk(it)) it.icon = 'gw_espada_0';
  return it;
}
const armaGuerreiroOk = it => !it || it.slot !== 'arma' || /Lâmina|Gládio|Espada|Espadão|Serra|Lança|Pique|Foice/.test(it.name || '');
function makeItem(ilvl, rarity, slot, legendary, chosenBase) {
""")
patch("  base = chosenBase || pick(BASES[baseKey]);",
      "  base = chosenBase || (slot === 'arma' && cls.id === 'guerreiro' ? pickArmaGuerreiro() : pick(BASES[baseKey]));")
# a lendária do Guerreiro era um martelo: vira lança, com o mesmo poder
patch("{ slot:'arma', cls:'guerreiro', name:'Martelo do Capitato', icon:'w_mace2',",
      "{ slot:'arma', cls:'guerreiro', name:'Lança do Capitato', icon:'gw_lanca_4',")
# presente inicial: uma de cada (espada, lança, foice)
patch("const giftBases = NEW_WEAPONS.filter(w => w[4] === c.weaponBase).slice(-3);",
      "const giftBases = c.id === 'guerreiro' ? [ARMAS_GUERREIRO[6], ARMAS_GUERREIRO[7], ARMAS_GUERREIRO[13]] : NEW_WEAPONS.filter(w => w[4] === c.weaponBase).slice(-3);")
# salvamentos antigos: arma proibida equipada vira uma espada do mesmo nível; as proibidas no inventário saem
patch("  P.weaponPack = sv && sv.weaponPack || [];\n",
      "  P.weaponPack = sv && sv.weaponPack || [];\n  if (c.id === 'guerreiro') { arteArmaGuerreiro(P.equip.arma); (P.inv || []).forEach(arteArmaGuerreiro); if (!armaGuerreiroOk(P.equip.arma)) P.equip.arma = makeItem(Math.max(1, P.level || 1), 0, 'arma', null, ARMAS_GUERREIRO[0]); P.inv = (P.inv || []).filter(armaGuerreiroOk); }\n")
# equipar: bloqueia outras armas
patch("    if(it.cls && it.cls !== P.cls.id) { this.toast('Classe incompatível', 'Esta arma pertence a outra classe.', 'tip', 3); return; }",
      "    if(it.cls && it.cls !== P.cls.id) { this.toast('Classe incompatível', 'Esta arma pertence a outra classe.', 'tip', 3); return; }\n    if (P.cls.id === 'guerreiro' && !armaGuerreiroOk(it)) { this.toast('Arma incompatível', 'O Guerreiro usa só espada, lança ou foice.', 'tip', 3); return; }")

# arte das armas pintadas: spr (chão) e iconTo (inventário, detalhe) desenham o canvas próprio quando existe
patch("function spr(name, x, y, h, o) {\n", "function spr(name, x, y, h, o) {\n  if (GW[name]) return sprGW(GW[name], x, y, h, o || {});\n")
patch("  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);\n",
      "  const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);\n"
      "  if (GW[name]) { // na diagonal, como no inventário de um ARPG: a arma longa preenche a casa\n"
      "    const c = GW[name], p = pad == null ? .06 : pad, an = /foice/.test(name) ? -.25 : .785, cs = Math.abs(Math.cos(an)), sn = Math.abs(Math.sin(an));\n"
      "    const k = Math.min(W * (1 - p * 2) / (c.width * cs + c.height * sn), H * (1 - p * 2) / (c.width * sn + c.height * cs));\n"
      "    g.save(); g.imageSmoothingEnabled = true; g.translate(W / 2, H / 2); g.rotate(an); g.drawImage(c, -c.width * k / 2, -c.height * k / 2, c.width * k, c.height * k); g.restore(); return; }\n")

# --- recortes em cache dos atlas ---
helper = """
// Desempenho: recorte em cache de cada sprite dos atlas gigantes. Texturas acima de 4096 px caem para o desenho
// por software em muitos celulares; um canvas pequeno por sprite (criado uma vez) evita isso.
const __slices = new WeakMap();
function slice(img, x, y, w, h) {
  if (!img) return img; let m = __slices.get(img); if (!m) { m = new Map(); __slices.set(img, m); }
  const k = x + ',' + y + ',' + w + ',' + h; let c = m.get(k);
  if (!c) { c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h); m.set(k, c); }
  return c;
}
"""
helper += """
// Arte das armas do Guerreiro (tools/gerar_armas.py): um canvas por arma, usado no chão (spr) e nos ícones (iconTo).
const GW = {};
(function () { const d = window.GUERREIRO_ARMAS; if (!d) return; const im = new Image();
  im.onload = () => { for (const k in d.map) { const [x, y, w, h] = d.map[k], c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, x, y, w, h, 0, 0, w, h); GW[k] = c; }
    try { if (window.UI && $('ov') && $('ov').querySelector('.inv')) UI.renderChar(); } catch (e) {} };
  im.src = d.atlas; })();
function sprGW(c, x, y, h, o) {
  const w = c.width * h / c.height; ctx.save(); ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot); if (o.flip) ctx.scale(-1, 1); if (o.sx || o.sy) ctx.scale(o.sx || 1, o.sy || 1);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha; if (o.add) ctx.globalCompositeOperation = 'lighter';
  if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 10; }
  ctx.drawImage(c, -w / 2, o.center ? -h / 2 : -h, w, h); ctx.restore(); return w;
}
"""
first = s.index('function castShadow(')
s = s[:first] + helper.lstrip('\n') + s[first:]
pat = re.compile(r'drawImage\((atlas|atlasWhite|atlasBlack|flareAtlas|walkAtlas|artAtlas)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,')
s, n = pat.subn(lambda m: 'drawImage(slice(%s, %s, %s, %s, %s), 0, 0, %s, %s,' % (m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(4), m.group(5)), s)
print('chamadas de atlas trocadas por recortes:', n)
open(out, 'w', encoding='utf-8').write(s)
print('bytes:', len(s))
