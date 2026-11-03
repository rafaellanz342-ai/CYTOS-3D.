# Monta guerreiro/arena.html: a demonstração (index.html) como página única, com os módulos embutidos,
# no formato de artefato (sem doctype/html/head/body próprios; título no topo; tema escuro explícito).
import re, os
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
s = open(os.path.join(G, 'index.html'), encoding='utf-8').read()
for f in ['guerreiro-imagens.js', 'guerreiro-cabeca.js', 'guerreiro-corpo.js', 'guerreiro-osseo.js']:
    tag = '<script src="%s"></script>' % f
    assert tag in s, f
    s = s.replace(tag, '<script>/* %s */\n%s</script>' % (f, open(os.path.join(G, f), encoding='utf-8').read()))
for t in ['<!DOCTYPE html>\n', '<html lang="pt-BR">\n', '</html>\n', '</html>', '<head>\n', '</head>\n', '<body>\n', '</body>\n']:
    s = s.replace(t, '')
s = re.sub(r'<meta charset="UTF-8">\n<meta name="viewport"[^>]*>\n', '', s)
assert s.lstrip().startswith('<title>')
s = s.replace(':root{--ink:#070506;', ':root{color-scheme:dark;--ink:#070506;', 1)
s = s.replace('#panel{position:fixed;top:12px;left:12px;', '#panel{position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:calc(12px + env(safe-area-inset-left,0px));')
s = s.replace('#inset{position:fixed;right:12px;top:12px;', '#inset{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));top:calc(12px + env(safe-area-inset-top,0px));')
s = s.replace('#joy{position:fixed;left:22px;', '#joy{position:fixed;left:calc(22px + env(safe-area-inset-left,0px));')
s = s.replace('#acts{position:fixed;right:16px;', '#acts{position:fixed;right:calc(16px + env(safe-area-inset-right,0px));')
open(os.path.join(G, 'arena.html'), 'w', encoding='utf-8').write(s)
print('arena.html', len(s))
