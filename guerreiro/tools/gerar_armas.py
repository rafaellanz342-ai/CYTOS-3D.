# Pinta, só com código, a arte (ícone e sprite de chão) das armas do Guerreiro: 7 espadas, 4 lanças + a lendária e 4 foices.
# Mesmo estilo das texturas do personagem: cada peça (lâmina, haste, empunhadura, guarda, osso) recebe a textura
# gerada em gerar_texturas.py e um mapa de altura (chanfro na lâmina, cúpula nas peças redondas); a luz, o brilho
# e a oclusão são cozidos como no corpo. Saída: guerreiro/assets/armas.png (atlas) e guerreiro/guerreiro-armas.js.
import os, json, base64, io, numpy as np
from PIL import Image, ImageDraw, ImageFilter

G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); A = os.path.join(G, 'assets')
TEX = {k: np.asarray(Image.open(os.path.join(A, k + '-claude.jpg')).convert('RGB'), np.float32) for k in ('metal', 'osso', 'couro', 'tecido')}
rs = np.random.default_rng

def fbm(n, seed, beta=2.2, sx=1.0, sy=1.0):
    w = rs(seed).standard_normal((n, n)); fy = np.fft.fftfreq(n)[:, None] * n * sy; fx = np.fft.fftfreq(n)[None, :] * n * sx
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1; a = f ** (-beta / 2); a[f < 1.5] = 0
    o = np.real(np.fft.ifft2(np.fft.fft2(w) * a)); return (o - o.mean()) / o.std()
# madeira escura da haste: veios longos na vertical
_w = fbm(512, 5, 2.0, sx=1, sy=0.06); _k = fbm(512, 6, 3.0)
TEX['madeira'] = np.stack([58 + 22 * _w + 10 * _k, 36 + 14 * _w + 6 * _k, 22 + 8 * _w + 4 * _k], -1).clip(0, 255)
# aço das lâminas: o metal gravado clareado, menos ferrugem
_m = np.asarray(Image.fromarray(TEX['metal'].astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), np.float32)
TEX['aco'] = _m * 0.3 + np.array([150, 150, 158]) * 0.7
TEX['ouro'] = (TEX['metal'].mean(-1, keepdims=True) * np.array([1.9, 1.45, 0.75]) + np.array([30, 18, 0])).clip(0, 255)
TEX['sangue'] = TEX['couro'] * 0.25 + np.array([120, 10, 12]) * 0.75
TEX['tecido_v'] = TEX['tecido'].mean(-1, keepdims=True) * np.array([1.25, 0.32, 0.3])  # borla carmesim
SPEC = {'aco': 0.9, 'metal': 0.7, 'ouro': 1.0, 'osso': 0.25, 'couro': 0.3, 'madeira': 0.15, 'sangue': 0.8, 'tecido_v': 0.05}

class Icon:
    def __init__(s, w, h):
        s.w, s.h = w, h; s.alb = np.zeros((h, w, 3), np.float32); s.hgt = np.zeros((h, w), np.float32)
        s.a = np.zeros((h, w), np.float32); s.spec = np.zeros((h, w), np.float32); s.glow = np.zeros((h, w, 3), np.float32)
    def mask(s, poly=None, ell=None, line=None, width=1):
        im = Image.new('L', (s.w * 4, s.h * 4)); d = ImageDraw.Draw(im)
        if poly: d.polygon([(x * 4, y * 4) for x, y in poly], fill=255)
        if ell: d.ellipse([v * 4 for v in ell], fill=255)
        if line: d.line([(x * 4, y * 4) for x, y in line], fill=255, width=int(width * 4), joint='curve')
        return np.asarray(im.resize((s.w, s.h), Image.LANCZOS), np.float32) / 255
    def part(s, m, mat, prof='dome', z=0.0, R=6, micro=0.25, tsc=1.0, rot=False, groove=None):
        """m: máscara; prof: 'blade' (chanfro até a aresta central) ou 'dome'; z: altura base (empilha peças)"""
        b = (m > 0.5).astype(np.float32); d = np.zeros_like(b); im = Image.fromarray((b * 255).astype(np.uint8))
        for r in range(1, R + 1): d += (np.asarray(im.filter(ImageFilter.GaussianBlur(r * 0.8)), np.float32) / 255 > 0.93)
        t = np.clip(d / R, 0, 1)
        h = t if prof == 'blade' else np.sqrt(1 - (1 - t) ** 2)
        T = TEX[mat]; yy, xx = np.mgrid[0:s.h, 0:s.w]
        if rot: xx, yy = yy, xx
        al = T[(yy * tsc).astype(int) % 512, (xx * tsc).astype(int) % 512]
        lum = al.mean(-1) / 255
        hh = z + h * 1.0 + (lum - 0.5) * micro
        if groove is not None: hh -= groove * 0.6; al = al * (1 - 0.35 * groove[..., None])
        k = m[..., None]
        s.alb = s.alb * (1 - k) + al * k; s.hgt = s.hgt * (1 - m) + hh * m; s.spec = s.spec * (1 - m) + SPEC[mat] * m
        s.a = np.maximum(s.a, m)
        return t
    def edge(s, m, t, amt=60):  # fio afiado: faixa clara na borda da lâmina
        e = np.clip(1 - t * 4, 0, 1) * m; s.alb += e[..., None] * amt
    def render(s, depth=3.0):
        h = s.hgt * 6
        gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * depth / 6; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * depth / 6
        nz = 1 / np.sqrt(gx * gx + gy * gy + 1); nx, ny = -gx * nz, -gy * nz
        L = np.array([-0.55, -0.65, 0.52]); L /= np.linalg.norm(L); H = L + [0, 0, 1]; H /= np.linalg.norm(H)
        dif = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1) / L[2]
        sp = s.spec * np.clip(nx * H[0] + ny * H[1] + nz * H[2], 0, 1) ** 22
        col = s.alb * (0.42 + 0.58 * dif)[..., None] + sp[..., None] * np.array([255, 244, 228]) + s.glow
        # contorno escuro (leitura no chão escuro do jogo) e um leve brilho quente por fora
        A_ = Image.fromarray((s.a * 255).astype(np.uint8))
        o = np.asarray(A_.filter(ImageFilter.MaxFilter(3)), np.float32) / 255
        rim = np.clip(o - s.a, 0, 1)
        rgb = col * s.a[..., None] + np.array([16, 8, 6]) * rim[..., None]
        alpha = np.clip(s.a + rim * 0.9, 0, 1)
        out = np.dstack([np.where(alpha[..., None] > 0, rgb / np.maximum(alpha, 1e-3)[..., None], 0), alpha * 255]).clip(0, 255).astype(np.uint8)
        return Image.fromarray(out, 'RGBA')

def side(cx, ys, ws, off=None):
    """contorno de uma peça simétrica no eixo vertical: ys alturas, ws meias-larguras"""
    off = off or [0] * len(ys)
    return [(cx + w + o, y) for y, w, o in zip(ys, ws, off)] + [(cx - w + o, y) for y, w, o in reversed(list(zip(ys, ws, off)))]

def blade_poly(cx, y0, y1, wf, n=40, serr=0, wave=0):
    ys = np.linspace(y0, y1, n); t = (ys - y0) / (y1 - y0); w = np.array([wf(v) for v in t])
    R = w.copy(); L = w.copy()
    if serr: R = R + np.where((np.arange(n) % 2 == 0) & (t > 0.15) & (t < 0.9), serr, 0)
    if wave: R = R + np.sin(t * 22) * wave * (t > 0.08); L = L - np.sin(t * 22) * wave * (t > 0.08)
    return [(cx + r, y) for y, r in zip(ys, R)] + [(cx - l, y) for y, l in reversed(list(zip(ys, L)))]

# ---------------- espadas (112 x 400 px, ponta para cima) ----------------
def espada(var):
    W, H = 112, 400; I = Icon(W, H); cx = W / 2
    long_ = var == 6; short = var == 1
    yb = 300 if not long_ else 316; ytip = 6 if not short else 70
    wb = {0: 15, 1: 22, 2: 15, 3: 17, 4: 15, 5: 15, 6: 21}[var]
    wf = (lambda t: 3 + wb * (1 - (1 - t) ** 6)) if not short else (lambda t: 3 + wb * np.sin(min(1, t * 1.4) * 1.5) * (1 - 0.25 * t))
    m = I.mask(blade_poly(cx, ytip, yb, wf, serr=6 if var == 4 else 0, wave=3 if var == 5 else 0))
    yy, xx = np.mgrid[0:H, 0:W]
    groove = None
    if var in (0, 2, 6): groove = (np.abs(xx - cx) < 2.2) * (yy > ytip + 60) * (yy < yb - 10) * 1.0
    mat = 'osso' if var == 3 else 'aco'
    t = I.part(m, mat, 'blade', z=0.4, R=9, micro=0.06)
    if mat == 'aco': I.edge(m, t)
    if var == 2 and groove is not None: I.alb[groove > 0] = [130, 12, 14]; I.spec[groove > 0] = 1.0
    if var == 5: I.alb = I.alb * (1 - 0.5 * m[..., None]) + m[..., None] * np.array([70, 14, 16]) * 0.5
    # guarda
    gw = 44 if var != 6 else 52
    if var in (3, 6):  # guarda de vértebras: três discos de osso
        for k in (-1, 0, 1): I.part(I.mask(ell=(cx + k * gw * 0.62 - 12, yb - 6, cx + k * gw * 0.62 + 12, yb + 12)), 'osso', z=1.0, R=5)
    else:
        gp = [(cx - gw, yb + 2), (cx - gw + 6, yb - 6), (cx, yb - 3), (cx + gw - 6, yb - 6), (cx + gw, yb + 2), (cx + gw - 8, yb + 12), (cx, yb + 9), (cx - gw + 8, yb + 12)]
        I.part(I.mask(gp), 'ouro' if var in (0, 5) else 'metal', z=1.0, R=5)
    # empunhadura de couro com tiras diagonais
    yg0, yg1 = yb + 12, (H - 26 if not short else H - 60)
    mg = I.mask(side(cx, [yg0, yg1], [6.5, 6.5]))
    I.part(mg, 'couro', z=0.6, R=4, groove=((np.sin((yy + xx * 0.8) * 0.75) > 0.6) * mg))
    # pomo: cabeça de fêmur
    I.part(I.mask(ell=(cx - 13, yg1 - 4, cx + 13, yg1 + 22)), 'osso' if var != 0 else 'ouro', z=1.0, R=6)
    return I

# ---------------- lanças (96 x 520) ----------------
def lanca(var):
    W, H = 96, 520; I = Icon(W, H); cx = W / 2; yy, xx = np.mgrid[0:H, 0:W]
    yh1 = {0: 120, 1: 130, 2: 118, 3: 128, 4: 124}[var]   # base da ponta
    shaft_mat = 'osso' if var in (1, 3) else 'madeira'
    I.part(I.mask(side(cx, [yh1, H - 18], [5, 5.5])), shaft_mat, z=0.2, R=4, rot=False)
    # ponteira do cabo
    if var == 3: I.part(I.mask(ell=(cx - 13, H - 30, cx + 13, H - 3)), 'osso', z=0.9, R=6)       # cabeça do fêmur
    else: I.part(I.mask([(cx - 6, H - 22), (cx + 6, H - 22), (cx, H - 2)]), 'metal', z=0.6, R=3)
    # anéis: vértebras (0), ouro (outros)
    for yr in (yh1 + 120, yh1 + 210, yh1 + 236):
        if var == 0: I.part(I.mask(side(cx, [yr, yr + 18], [10, 9])), 'osso', z=0.9, R=4); I.part(I.mask([(cx - 3, yr + 2), (cx + 3, yr + 2), (cx, yr - 9)]), 'osso', z=1.1, R=2)
        else: I.part(I.mask(side(cx, [yr, yr + 8], [7.5, 7.5])), 'ouro', z=0.8, R=3)
    # empunhadura
    mg = I.mask(side(cx, [yh1 + 250, yh1 + 300], [6.6, 6.6])); I.part(mg, 'couro', z=0.6, R=3, groove=((np.sin((yy + xx * 0.8) * 0.75) > 0.6) * mg))
    # alvado
    I.part(I.mask(side(cx, [yh1 - 6, yh1 + 26], [6, 8.5])), 'metal', z=0.8, R=4)
    # ponta
    hw = {0: 15, 1: 8, 2: 13, 3: 20, 4: 16}[var]; ytip = 6
    if var == 1: wf = lambda t: 2 + hw * t ** 0.5
    else: wf = lambda t: 2 + hw * (np.sin(np.pi * min(1, t * 1.05) ** 0.8) if t < 0.95 else np.sin(np.pi * 0.95 ** 0.8) * (1 - (t - 0.95) * 12))
    m = I.mask(blade_poly(cx, ytip, yh1 - 2, wf)); t = I.part(m, 'ouro' if var == 4 else 'aco', 'blade', z=0.5, R=8, micro=0.06); I.edge(m, t)
    if var == 2:  # asas
        for sg in (-1, 1): I.part(I.mask([(cx + sg * 5, yh1 - 4), (cx + sg * 30, yh1 + 6), (cx + sg * 7, yh1 + 12)]), 'aco', 'blade', z=0.7, R=3)
        tas = I.mask(line=[(cx, yh1 + 14), (cx + 6, yh1 + 40), (cx + 2, yh1 + 70)], width=11)   # borla
        I.part(tas, 'tecido_v', z=0.5, R=4, micro=0.5)
    if var == 4:  # Capitato: um osso do carpo cravado na base da ponta, com brilho
        I.part(I.mask(side(cx, [yh1 - 30, yh1 - 4], [11, 11])), 'osso', z=1.2, R=5)
        g = np.exp(-(((xx - cx) / 26) ** 2 + ((yy - (yh1 - 40)) / 70) ** 2)); I.glow += (g * 60)[..., None] * np.array([1.0, 0.7, 0.3]) * I.a[..., None]
    return I

# ---------------- foices (300 x 520) ----------------
def foice(var):
    W, H = 300, 520; I = Icon(W, H); sx = 46; yy, xx = np.mgrid[0:H, 0:W]; ytop = 60
    I.part(I.mask(side(sx, [ytop, H - 18], [5.5, 6])), 'madeira', z=0.2, R=4)
    I.part(I.mask([(sx - 6, H - 22), (sx + 6, H - 22), (sx, H - 2)]), 'metal', z=0.6, R=3)
    for yr in (ytop + 70, H - 90): I.part(I.mask(side(sx, [yr, yr + 9], [8, 8])), 'ouro', z=0.8, R=3)
    for yr in (ytop + 150, ytop + 280):
        mg = I.mask(side(sx, [yr, yr + 44], [7, 7])); I.part(mg, 'couro', z=0.6, R=3, groove=((np.sin((yy + xx * 0.8) * 0.75) > 0.6) * mg))
    I.part(I.mask(side(sx, [ytop - 40, ytop - 8], [1, 6])), 'aco', 'blade', z=0.5, R=3)   # espigão
    # lâmina: sai do topo para a direita e curva para baixo (como no modelo 3D)
    n = 40; L = 236 if var != 3 else 226; out, inn = [], []
    for i in range(n + 1):
        t = i / n; x = sx + 4 + L * t; y = ytop + 6 + 110 * t * t - (18 * np.sin(np.pi * t) if var == 3 else 0)
        w = 44 * (1 - t) ** 0.6 + 1.5
        if var == 2 and 0.12 < t < 0.9 and i % 7 == 0: w *= 0.55     # nós de Ranvier: entalhes no fio
        out.append((x, y - w * 0.22)); inn.append((x, y + w * 0.78))
    m = I.mask(out + inn[::-1])
    tt = I.part(m, 'aco', 'blade', z=0.5, R=10, micro=0.06); I.edge(m, tt)
    if var == 1:  # bainha de mielina: faixas de osso sobre a lâmina
        for k in range(5):
            t0 = 0.08 + k * 0.17; xa = sx + 4 + L * t0
            I.part(m * (np.abs(xx - xa) < 7), 'osso', z=0.9, R=3)
    if var == 3:  # condução saltatória: veias luminosas
        v = np.exp(-(np.abs(np.pad(fbm(512, 77, 2.2), ((0, 8), (0, 0)), mode="wrap")[:H, :W]) / 0.12) ** 2) * m
        I.glow += (v * 220)[..., None] * np.array([1.0, 0.45, 0.25]); I.alb *= (1 - 0.25 * m)[..., None]
    if var == 0 or var == 3:  # crânio no encaixe
        I.part(I.mask(ell=(sx - 22, ytop - 18, sx + 20, ytop + 26)), 'osso', z=1.1, R=8)
        for ex in (sx - 10, sx + 6): I.part(I.mask(ell=(ex - 5, ytop - 2, ex + 5, ytop + 8)), 'sangue', z=0.6, R=2)
    else:
        I.part(I.mask(side(sx, [ytop - 8, ytop + 26], [9, 9])), 'metal', z=1.0, R=4)
    return I

ARMAS = [('gw_espada_%d' % i, espada, i) for i in range(7)] + [('gw_lanca_%d' % i, lanca, i) for i in range(5)] + [('gw_foice_%d' % i, foice, i) for i in range(4)]
if __name__ == '__main__':
    ims = {}
    for k, f, v in ARMAS:
        im = f(v).render(); im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS); ims[k] = im; print(k, im.size)
    Wt = sum(i.width + 2 for i in ims.values()); Ht = max(i.height for i in ims.values())
    at = Image.new('RGBA', (Wt, Ht)); mp = {}; x = 0
    for k, im in ims.items(): at.paste(im, (x, 0)); mp[k] = [x, 0, im.width, im.height]; x += im.width + 2
    at.save(os.path.join(A, 'armas.png')); b = io.BytesIO(); at.save(b, 'PNG', optimize=True)
    js = ("/* Arte das armas do Guerreiro (espadas, lanças, foices), pintada por código em tools/gerar_armas.py. */\n"
          "window.GUERREIRO_ARMAS = { atlas: 'data:image/png;base64,%s', map: %s };\n") % (base64.b64encode(b.getvalue()).decode(), json.dumps(mp))
    open(os.path.join(G, 'guerreiro-armas.js'), 'w').write(js); print('atlas', at.size, len(js), 'bytes')
