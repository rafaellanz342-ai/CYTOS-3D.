# Gera guerreiro-imagens.js a partir das imagens do Canva em guerreiro/assets/ (<chave>-canva.jpg).
# Chaves aceitas pelo módulo: rosto, metal, osso, couro, pele, tecido (ver setImages em guerreiro-osseo.js).
import base64, os, io
from PIL import Image
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
A = os.path.join(G, 'assets')
out = {}
for k in ['rosto', 'metal', 'osso', 'couro', 'pele', 'tecido']:
    p = os.path.join(A, k + '-canva.jpg')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB')
    if k != 'rosto': im = im.resize((256, 256), Image.LANCZOS)   # texturas ladrilháveis: 256 px bastam
    b = io.BytesIO(); im.save(b, 'JPEG', quality=88)
    out[k] = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
js = "/* Imagens geradas no Canva para o Guerreiro Ósseo (embutidas para funcionar num único HTML). Gerado por tools/montar_imagens.py. */\n"
js += "window.GUERREIRO_IMAGENS = Object.assign(window.GUERREIRO_IMAGENS || {}, {\n" + ",\n".join("  %s: '%s'" % (k, v) for k, v in out.items()) + "\n});\n"
open(os.path.join(G, 'guerreiro-imagens.js'), 'w').write(js)
print('imagens:', list(out), len(js), 'bytes')
