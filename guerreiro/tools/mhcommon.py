# Utilidades compartilhadas pelos geradores: alvos de forma (targets) do MakeHuman/MPFB2 (CC0).
import gzip, os
def read_target(path):
    op = gzip.open if path.endswith('.gz') else open
    d = {}
    with op(path, 'rt') as f:
        for line in f:
            p = line.split()
            if len(p) == 4 and not line.startswith('#'): d[int(p[0])] = (float(p[1]), float(p[2]), float(p[3]))
    return d
def apply_targets(V, items):
    # items: [(arquivo, peso)] — soma os deslocamentos na malha original (antes de espelhar/escalar)
    for path, w in items:
        for i, (dx, dy, dz) in read_target(path).items():
            x, y, z = V[i]; V[i] = (x + dx * w, y + dy * w, z + dz * w)
# físico do guerreiro: homem jovem com musculatura máxima e peso médio
def warrior_targets(dirn):
    return [(os.path.join(dirn, 'caucasian-male-young.target'), 1.0), (os.path.join(dirn, 'universal-male-young-maxmuscle-averageweight.target'), 1.0)]
# expressões compostas a partir das unidades de expressão (FACS simplificado)
EXPRESSOES = {
  'furia':   {'eyebrows-left-down': 1, 'eyebrows-right-down': 1, 'eye-left-slit': 0.5, 'eye-right-slit': 0.5, 'nose-left-elevation': 0.7, 'nose-right-elevation': 0.7, 'mouth-open': 0.85, 'mouth-upward-retraction': 0.6, 'neck-platysma': 0.6},
  'esforco': {'eyebrows-left-down': 0.8, 'eyebrows-right-down': 0.8, 'eye-left-slit': 0.65, 'eye-right-slit': 0.65, 'mouth-retraction': 0.8, 'mouth-upward-retraction': 0.35, 'nose-left-elevation': 0.4, 'nose-right-elevation': 0.4, 'neck-platysma': 0.4},
  'dor':     {'eyebrows-left-inner-up': 1, 'eyebrows-right-inner-up': 1, 'eye-left-closure': 0.55, 'eye-right-closure': 0.55, 'mouth-depression-retraction': 0.7, 'mouth-open': 0.3},
  'morte':   {'eye-left-closure': 0.92, 'eye-right-closure': 0.92, 'mouth-open': 0.45, 'eyebrows-left-inner-up': 0.3, 'eyebrows-right-inner-up': 0.3},
  'piscar':  {'eye-left-closure': 1, 'eye-right-closure': 1},
  'carranca': {'eyebrows-left-down': 0.35, 'eyebrows-right-down': 0.35, 'mouth-depression': 0.25},
}
def expression_deltas(dirn):
    out = {}
    for nome, units in EXPRESSOES.items():
        acc = {}
        for u, w in units.items():
            for i, (dx, dy, dz) in read_target(os.path.join(dirn, u + '.target.gz')).items():
                a = acc.get(i, (0, 0, 0)); acc[i] = (a[0] + dx * w, a[1] + dy * w, a[2] + dz * w)
        out[nome] = acc
    return out
