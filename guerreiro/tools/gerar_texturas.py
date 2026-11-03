# Gera, só com código (numpy), as texturas pintadas do Guerreiro Ósseo: osso, couro, pele, tecido e metal.
# Todas ladrilham sem emenda (ruído no domínio de Fourier e células de Worley com volta nas bordas).
# O relevo vem de um mapa de altura: normais -> luz difusa e brilho especular cozidos na cor, e oclusão nas cavidades.
# Saída: guerreiro/assets/<chave>-claude.jpg (512 px). montar_imagens.py dá preferência a elas sobre as do Canva.
import os, numpy as np
from PIL import Image

N = 512
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
rs = np.random.default_rng

def fbm(seed, beta=2.0, sx=1.0, sy=1.0, lo=2.0, hi=None):
    """ruído 1/f^beta periódico; sx/sy esticam a frequência (fibras); lo/hi limitam a banda (em ciclos por quadro)"""
    r = rs(seed); w = r.standard_normal((N, N))
    fy = np.fft.fftfreq(N)[:, None] * N * sy; fx = np.fft.fftfreq(N)[None, :] * N * sx
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1
    amp = f ** (-beta / 2); amp[f < lo] = 0
    if hi: amp *= np.exp(-(f / hi) ** 2)
    o = np.real(np.fft.ifft2(np.fft.fft2(w) * amp))
    return (o - o.mean()) / (o.std() + 1e-9)

def worley(seed, n, jitter=1.0):
    """F1 e F2 periódicos (em pixels) de n pontos aleatórios"""
    r = rs(seed); p = r.random((n, 2)) * N
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    f1 = np.full((N, N), 1e9, np.float32); f2 = f1.copy(); idx = np.zeros((N, N), np.int32)
    for i, (py, px) in enumerate(p):
        dy = np.abs(yy - py); dy = np.minimum(dy, N - dy)
        dx = np.abs(xx - px); dx = np.minimum(dx, N - dx)
        d = np.sqrt(dx * dx + dy * dy)
        m = d < f1
        f2 = np.where(m, f1, np.minimum(f2, d)); idx = np.where(m, i, idx); f1 = np.where(m, d, f1)
    return f1, f2, idx

def blur(a, s):
    fy = np.fft.fftfreq(N)[:, None]; fx = np.fft.fftfreq(N)[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (np.pi * s) ** 2 * (fx * fx + fy * fy))))

def norm01(a): a = a - a.min(); return a / (a.max() + 1e-9)

def light(h, depth, spec=0.0, shin=20, L=(-0.55, -0.65, 0.52)):
    """sombreamento do relevo: retorna (difuso, especular, oclusão) para multiplicar/somar na cor"""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * depth; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * depth
    nz = 1 / np.sqrt(gx * gx + gy * gy + 1); nx, ny = -gx * nz, -gy * nz
    L = np.array(L) / np.linalg.norm(L)
    dif = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1) / L[2]  # plano = 1
    H = L + np.array([0, 0, 1.0]); H /= np.linalg.norm(H)
    sp = spec * np.clip(nx * H[0] + ny * H[1] + nz * H[2], 0, 1) ** shin
    ao = np.clip(1 - np.maximum(blur(h, 6) - h, 0) * 1.6, 0.35, 1)  # cavidade = mais baixa que a vizinhança
    return dif, sp, ao

def mix(c0, c1, t): t = t[..., None]; return np.array(c0) * (1 - t) + np.array(c1) * t

def save(key, rgb):
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    p = os.path.join(A, key + '-claude.jpg'); im.save(p, quality=92); print(key, p)

def shade(alb, h, depth, spec=0.0, shin=20, sc=(255, 245, 230), dmin=0.55):
    dif, sp, ao = light(h, depth, spec, shin)
    d = (dmin + (1 - dmin) * dif) * ao
    return alb * d[..., None] + sp[..., None] * np.array(sc)

def osso():
    lam = fbm(1, 2.2, sx=0.18, sy=1.0)                       # lamelas: fibras longas na vertical
    big = fbm(2, 3.0)
    f1, f2, _ = worley(3, 260); por = np.exp(-(f1 / 2.4) ** 2)    # canais de Havers (poros)
    c1, c2, _ = worley(4, 22); crack = np.exp(-((c2 - c1) / 1.3) ** 2) * (fbm(5, 2, lo=1) > -0.2)  # fissuras
    h = 0.35 * lam + 0.55 * big - 1.6 * por - 1.4 * crack
    alb = mix((222, 208, 172), (176, 150, 108), norm01(big + 0.4 * fbm(6, 1.6)))
    alb = mix(alb.reshape(-1, 3), (120, 92, 58), (norm01(-big) ** 3 * 0.6).ravel()).reshape(N, N, 3)  # encardido
    alb = mix(alb.reshape(-1, 3), (62, 40, 22), (np.clip(por * 1.3 + crack, 0, 1) * 0.8).ravel()).reshape(N, N, 3)
    stain = np.clip(fbm(7, 3.2) - 1.3, 0, 1)                  # sangue seco
    alb = mix(alb.reshape(-1, 3), (92, 18, 14), (stain * 0.8).ravel()).reshape(N, N, 3)
    save('osso', shade(alb, h, 1.3, spec=0.18, shin=14))

def couro():
    f1, f2, idx = worley(11, 520)                             # grão pebbled
    cell = f2 - f1; grain = np.clip(cell / 6, 0, 1) ** 0.6
    wr = 1 - np.abs(fbm(12, 2.1, sx=1, sy=0.35, lo=3))        # rugas onduladas
    big = fbm(13, 3.0)
    h = 0.55 * grain + 0.6 * wr ** 3 + 0.4 * big
    sc_ = fbm(14, 1.4, sx=2.5, sy=0.15, lo=6); scr = np.clip(np.abs(sc_) < 0.05, 0, 1) * (fbm(15, 3) > 0.8)  # arranhões
    h -= scr * 1.0
    tone = rs(16).random(900)[idx] * 0.25
    alb = mix((84, 52, 32), (40, 22, 12), norm01(-big + tone))
    wear = np.clip(norm01(h) - 0.55, 0, 1) * 1.6                # quinas gastas mais claras
    alb = alb + wear[..., None] * np.array([70, 48, 30])
    alb = alb * (1 - 0.28 * (1 - grain))[..., None]           # sujeira no vale do grão
    stain = np.clip(fbm(17, 3.2) - 1.2, 0, 1)
    alb = mix(alb.reshape(-1, 3), (70, 10, 8), (stain * 0.85).ravel()).reshape(N, N, 3)
    alb = alb + scr[..., None] * np.array([60, 45, 30])
    save('couro', shade(alb, h, 1.6, spec=0.35, shin=10))

def pele():
    big = fbm(21, 3.0); mid = fbm(22, 2.0, lo=6)
    f1, _, _ = worley(23, 3200); pores = np.exp(-(f1 / 1.1) ** 2)  # poros
    l1 = np.abs(fbm(24, 1.3, sx=1, sy=0.2, lo=20, hi=90)); l2 = np.abs(fbm(25, 1.3, sx=0.2, sy=1, lo=20, hi=90))
    lines = np.exp(-(l1 / 0.25) ** 2) + np.exp(-(l2 / 0.25) ** 2)  # sulcos finos cruzados
    vein = np.exp(-(np.abs(fbm(26, 2.6, lo=2)) / 0.08) ** 2) * norm01(fbm(27, 3)) # veias superficiais
    pores = blur(pores, 0.8); h = 0.45 * mid + 0.6 * fbm(33, 3.2) - 0.12 * pores - 0.06 * lines + 0.15 * vein
    # cicatrizes: cordões elevados, mais claros
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32); r = rs(28); scar = np.zeros((N, N), np.float32)
    for _ in range(3):
        x0, y0, a, L = r.random() * N, r.random() * N, r.random() * np.pi, 40 + r.random() * 90
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                dx, dy = xx - x0 - ox, yy - y0 - oy
                t = np.clip(dx * np.cos(a) + dy * np.sin(a), -L / 2, L / 2)
                d = np.hypot(dx - t * np.cos(a), dy - t * np.sin(a)); w = 2.2 * (1 - (2 * t / L) ** 2) + 0.4
                scar = np.maximum(scar, np.exp(-(d / w) ** 2))
    h += 0.9 * scar
    alb = mix((166, 128, 104), (122, 88, 70), norm01(big))
    redd = np.clip(fbm(29, 2.6), 0, None) * 0.08                # rubor irregular
    alb = alb + redd[..., None] * np.array([60, -10, -14])
    frk = np.clip(fbm(30, 0.6, lo=40) - 2.2, 0, 1) * (big > 0)   # sardas
    alb = mix(alb.reshape(-1, 3), (96, 56, 38), (frk * 0.7).ravel()).reshape(N, N, 3)
    alb = mix(alb.reshape(-1, 3), (96, 88, 116), (vein * 0.35).ravel()).reshape(N, N, 3)
    alb = mix(alb.reshape(-1, 3), (190, 136, 124), (scar * 0.6).ravel()).reshape(N, N, 3)
    alb = alb * (1 - 0.06 * pores)[..., None]
    grime = np.clip(fbm(31, 3.0) - 1.3, 0, 1)                   # suor e terra
    alb = mix(alb.reshape(-1, 3), (60, 40, 30), (grime * 0.45).ravel()).reshape(N, N, 3)
    blood = np.clip(fbm(32, 3.4) - 2.6, 0, 1)
    alb = mix(alb.reshape(-1, 3), (110, 16, 12), (blood * 0.6).ravel()).reshape(N, N, 3)
    save('pele', shade(alb, h, 0.7, spec=0.22, shin=16, sc=(255, 220, 200), dmin=0.65))

def tecido():
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32); P = 16
    jx = fbm(41, 2.4, lo=2) * 1.2; jy = fbm(42, 2.4, lo=2) * 1.2   # fios tortos
    u = (xx + jx) / P * 2 * np.pi; v = (yy + jy) / P * 2 * np.pi
    warp = np.abs(np.sin(u / 2)); weft = np.abs(np.sin(v / 2))      # trama tafetá: cruzamento alternado
    over = np.sign(np.sin(u / 2) * np.sin(v / 2))
    h = np.where(over > 0, warp ** 0.5 * (0.6 + 0.4 * weft), weft ** 0.5 * (0.6 + 0.4 * warp))
    slub = fbm(43, 1.8, sx=0.05, sy=1) * 0.25 + fbm(44, 1.8, sx=1, sy=0.05) * 0.25  # irregularidade do fio
    fold = fbm(45, 3.2, sx=1, sy=0.3)                                # dobras largas
    h = h + slub + 0.9 * fold
    lum = norm01(fbm(46, 2.6))
    alb = mix((176, 160, 132), (110, 96, 74), lum)
    alb = alb * (0.72 + 0.28 * np.where(over > 0, warp, weft))[..., None]
    holes = (fbm(47, 1.0, lo=20) > 2.6) & (fbm(48, 3) > 0.5)
    alb[holes] *= 0.25; h = np.where(holes, h - 1, h)
    dirt = np.clip(fbm(49, 3.0) - 0.7, 0, 1)
    alb = mix(alb.reshape(-1, 3), (58, 44, 30), (dirt * 0.6).ravel()).reshape(N, N, 3)
    blood = np.clip(fbm(50, 3.2) - 1.4, 0, 1)
    alb = mix(alb.reshape(-1, 3), (90, 14, 12), (blood * 0.85).ravel()).reshape(N, N, 3)
    save('tecido', shade(alb, h, 1.4, spec=0.05, shin=6, dmin=0.5))

def metal():
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    f1, f2, idx = worley(61, 140); ham = -(f1 / 34) ** 2             # martelado: concavidades
    brush = fbm(62, 1.2, sx=1, sy=0.02, lo=30) * 0.15              # escovado horizontal
    # filigrana gravada: volutas em grade periódica (gravura funda, preenchida de sujeira)
    t = 2 * np.pi / 128; s = np.sin(xx * t) * np.cos(yy * t * 2) + 0.5 * np.sin((xx + yy) * t * 2)
    eng = np.exp(-(s / 0.07) ** 2) * (np.abs(np.cos(yy * t * 2)) > 0.25)
    # rebites nos cantos do ladrilho de 128
    rv = np.zeros((N, N), np.float32)
    for cy in range(0, N + 1, 128):
        for cx in range(0, N + 1, 128):
            d = np.hypot(xx - cx, yy - cy); rv = np.maximum(rv, np.clip(1 - (d / 9) ** 2, 0, 1) ** 0.5)
    pit = np.exp(-(worley(63, 1600)[0] / 0.9) ** 2)                 # corrosão puntiforme
    h = 0.3 * ham + 2 * brush - 0.9 * eng + 2.2 * rv - 0.6 * pit + 0.15 * fbm(64, 3)
    base = mix((122, 118, 124), (64, 60, 68), norm01(fbm(65, 2.8) + rs(66).random(140)[idx] * 0.6))
    rust = np.clip(fbm(67, 2.6) - 0.9, 0, 1) * (1 - norm01(h)) * 1.6
    base = mix(base.reshape(-1, 3), (96, 44, 20), np.clip(rust, 0, 0.85).ravel()).reshape(N, N, 3)
    base = mix(base.reshape(-1, 3), (26, 20, 20), (np.clip(eng + pit, 0, 1) * 0.85).ravel()).reshape(N, N, 3)
    blood = np.clip(fbm(68, 3.3) - 1.5, 0, 1)
    base = mix(base.reshape(-1, 3), (70, 8, 10), (blood * 0.85).ravel()).reshape(N, N, 3)
    save('metal', shade(base, h, 1.6, spec=0.9, shin=28, sc=(250, 236, 220), dmin=0.45))

if __name__ == '__main__':
    os.makedirs(A, exist_ok=True)
    for f in (osso, couro, pele, tecido, metal): f()
