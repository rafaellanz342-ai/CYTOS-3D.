# Gera guerreiro-imagens.js a partir das imagens em guerreiro/assets/: <chave>-claude.jpg (geradas por código em
# tools/gerar_texturas.py) têm preferência; <chave>-canva.jpg (Canva) ficam como alternativa.
# Chaves aceitas pelo módulo: rosto, metal, osso, couro, pele, tecido (ver setImages em guerreiro-osseo.js).
import base64, os, io
from PIL import Image
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
A = os.path.join(G, 'assets')
out = {}
for k in ['rosto', 'metal', 'osso', 'couro', 'pele', 'tecido']:
    p = next((q for q in (os.path.join(A, k + s) for s in ('-claude.jpg', '-canva.jpg')) if os.path.exists(q)), None)
    if not p: continue
    im = Image.open(p).convert('RGB')
    if k != 'rosto': im = im.resize((256, 256), Image.LANCZOS)   # texturas ladrilháveis: 256 px bastam
    b = io.BytesIO(); im.save(b, 'JPEG', quality=88)
    out[k] = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
js = "/* Texturas do Guerreiro Ósseo (geradas por código em tools/gerar_texturas.py; rosto do Canva) (embutidas para funcionar num único HTML). Gerado por tools/montar_imagens.py. */\n"
js += "window.GUERREIRO_IMAGENS = Object.assign(window.GUERREIRO_IMAGENS || {}, {\n" + ",\n".join("  %s: '%s'" % (k, v) for k, v in out.items()) + "\n});\n"
open(os.path.join(G, 'guerreiro-imagens.js'), 'w').write(js)
print('imagens:', list(out), len(js), 'bytes')
