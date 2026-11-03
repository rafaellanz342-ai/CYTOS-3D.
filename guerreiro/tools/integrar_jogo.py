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

mods = ''.join('<script>/* %s */\n%s</script>\n' % (f, open(os.path.join(G, f), encoding='utf-8').read())
               for f in ['guerreiro-imagens.js', 'guerreiro-cabeca.js', 'guerreiro-corpo.js', 'guerreiro-osseo.js'])
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
first = s.index('function castShadow(')
s = s[:first] + helper.lstrip('\n') + s[first:]
pat = re.compile(r'drawImage\((atlas|atlasWhite|atlasBlack|flareAtlas|walkAtlas|artAtlas)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,\s*([^,()]+(?:\[[^\]]*\])?)\s*,')
s, n = pat.subn(lambda m: 'drawImage(slice(%s, %s, %s, %s, %s), 0, 0, %s, %s,' % (m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(4), m.group(5)), s)
print('chamadas de atlas trocadas por recortes:', n)
open(out, 'w', encoding='utf-8').write(s)
print('bytes:', len(s))
