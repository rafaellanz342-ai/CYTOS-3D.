# Gera o corpo (sem cabeça e sem mãos) a partir do modelo-base MakeHuman hm08 (CC0), com pesos de skinning
# para o esqueleto do Guerreiro Ósseo. Uso: python3 mhbody.py base.obj guerreiro-corpo.js
import sys, json, math, collections
src, out = sys.argv[1], sys.argv[2]
V=[];VT=[];G=collections.OrderedDict();g=None;FUV={}
for line in open(src):
    p=line.split()
    if not p: continue
    if p[0]=='v': x,y,z=map(float,p[1:4]); V.append((-x,y,z))            # espelha: +x passa a ser o lado direito
    elif p[0]=='vt': VT.append(tuple(map(float,p[1:3])))
    elif p[0]=='g': g=p[1]; G.setdefault(g,[])
    elif p[0]=='f':
        idx=[t.split('/') for t in p[1:]]
        f=[int(t[0])-1 for t in idx][::-1]                                 # inverte o sentido (normal para fora)
        G[g].append(f)
        for t in idx:
            if len(t)>1 and t[1]: FUV.setdefault(int(t[0])-1, int(t[1])-1)
J={}
for k,f in G.items():
    if k.startswith('joint'):
        s={i for fc in f for i in fc}; J[k]=[sum(V[i][d] for i in s)/len(s) for d in range(3)]
K=1.85/(J['joint-head-2'][1]-J['joint-ground'][1]+0.15)                # altura total ≈ 1,85 m
def P(n): return J['joint-'+n]
def sub(a,b): return [a[i]-b[i] for i in range(3)]
def add(a,b): return [a[i]+b[i] for i in range(3)]
def mul(a,s): return [x*s for x in a]
def dot(a,b): return sum(a[i]*b[i] for i in range(3))
hipmid=mul(add(P('l-upper-leg'),P('r-upper-leg')),0.5)
# ossos: [nome, a, b, raio, pai]  (raio em dm, só para escolher o osso mais próximo)
B=[['pelve', P('pelvis'), add(P('pelvis'),[0,-1.6,0]), 1.5, None],
   ['coluna', P('pelvis'), P('neck'), 1.55, 0],
   ['pescoco', P('neck'), P('head'), 0.55, 1]]
for s in ('l','r'):
    B+= [['braco-'+s, P(s+'-shoulder'), P(s+'-elbow'), 0.5, 1],
         ['antebraco-'+s, P(s+'-elbow'), P(s+'-hand'), 0.42, None],
         ['coxa-'+s, P(s+'-upper-leg'), P(s+'-knee'), 0.75, 0],
         ['canela-'+s, P(s+'-knee'), P(s+'-ankle'), 0.5, None],
         ['pe-'+s, P(s+'-ankle'), P(s+'-foot-2'), 0.4, None]]
names=[b[0] for b in B]
for b in B:
    n=b[0]
    if n.startswith('antebraco'): b[4]=names.index('braco-'+n[-1])
    if n.startswith('canela'): b[4]=names.index('coxa-'+n[-1])
    if n.startswith('pe-'): b[4]=names.index('canela-'+n[-1])
children=collections.defaultdict(list)
for i,b in enumerate(B):
    if b[4] is not None: children[b[4]].append(i)
def segd(p,a,b):
    ab=sub(b,a); t=max(0,min(1,dot(sub(p,a),ab)/dot(ab,ab))); q=add(a,mul(ab,t)); return math.dist(p,q),t
CUT_NECK=6.35
def wrist_cut(p):
    for s in ('l','r'):
        a,b=P(s+'-elbow'),P(s+'-hand'); ab=sub(b,a); t=dot(sub(p,a),ab)/dot(ab,ab)
        if t>1.02 and math.dist(p,b)<2.5: return True
    return False
body=[f for f in G['body'] if all(V[i][1]<CUT_NECK and not wrist_cut(V[i]) for i in f)]
def weights(p):
    best=None
    for i,b in enumerate(B):
        d,t=segd(p,b[1],b[2]); d-=b[3]
        if best is None or d<best[0]: best=(d,i,t)
    _,i,t=best; b=B[i]
    side = 'l' if p[0]<0 else 'r'
    if b[0]=='coluna' and t>0.85 and abs(p[0])<0.9: return [i,1-(t-0.85)/0.3,names.index('pescoco')]
    if b[0]=='pelve': return [i,0.5+0.5*min(1,(0.73-p[1])/1.0),1] if p[1]>-0.27 else [i,1,i]
    if b[0]=='coluna' and t<0.12: return [i,0.5+0.5*t/0.12,0]
    if t<0.22 and b[4] is not None: return [i,0.5+0.5*t/0.22,b[4]]
    if t>0.8:
        ch=[c for c in children[i] if not B[c][0].startswith('coxa') and not B[c][0].startswith('braco')]
        if ch: return [i,0.5+0.5*(1-t)/0.2,ch[0]]
    return [i,1,i]
def decimate(faces, cell):
    rep={};cl={}
    for f in faces:
        for i in f:
            key=tuple(round(V[i][d]/cell) for d in range(3)); cl.setdefault(key,[]).append(i); rep[i]=key
    cen={}
    for key,ids in cl.items():
        m=[sum(V[j][d] for j in ids)/len(ids) for d in range(3)]
        cen[key]=min(ids,key=lambda i:sum((V[i][d]-m[d])**2 for d in range(3)))
    nf=[]
    for f in faces:
        g2=[]
        for i in f:
            c=cen[rep[i]]
            if c not in g2: g2.append(c)
        if len(g2)>=3: nf.append(g2)
    return nf
def pack(faces):
    ids=sorted({i for f in faces for i in f}); m={v:n for n,v in enumerate(ids)}
    vv=[[round(c*K,4) for c in V[i]] for i in ids]
    uv=[[round(VT[FUV[i]][0],4), round(1-VT[FUV[i]][1],4)] if i in FUV else [0.5,0.5] for i in ids]
    w=[]
    for i in ids:
        a,ww,b=weights(V[i]); w.append([a,round(ww,3),b])
    # tecido simples na pelve (roupa de baixo de linho)
    cloth=[1 if all(-1.9<V[i][1]<0.95 and abs(V[i][0])<2.6 for i in f) else 0 for f in faces]
    return {'v':vv,'uv':uv,'w':w,'f':[[m[i] for i in f] for f in faces],'pano':cloth}
H=J['joint-head-2'][1]-J['joint-ground'][1]
hi=pack(decimate(body,H/52)); lo=pack(decimate(body,H/24))
bones=[{'nome':b[0],'a':[round(c*K,4) for c in b[1]],'b':[round(c*K,4) for c in b[2]]} for b in B]
data={'fonte':'MakeHuman base mesh hm08 (CC0) — makehumancommunity.org','ossos':bones,'alta':hi,'baixa':lo,'chao':round(J['joint-ground'][1]*K,4)}
js='/* Corpo anatômico (sem cabeça e sem mãos) extraído do modelo-base MakeHuman hm08 (CC0, makehumancommunity.org),\n   espelhado para o referencial do Guerreiro Ósseo, com pesos de skinning por osso. Gerado por tools/mhbody.py. */\nwindow.GUERREIRO_CORPO = '+json.dumps(data,separators=(',',':'))+';\n'
open(out,'w').write(js)
print('K',K,'alta',len(hi['f']),len(hi['v']),'baixa',len(lo['f']),len(lo['v']),'bytes',len(js))
