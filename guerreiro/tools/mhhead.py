# Extrai a cabeça (pele, olhos e casca de cabelo) do modelo-base MakeHuman (CC0) e gera dados compactos para o módulo JS.
import sys, json, math, collections, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mhcommon
src, out = sys.argv[1], sys.argv[2]
V=[];groups=collections.OrderedDict();g=None
for line in open(src):
    p=line.split()
    if not p: continue
    if p[0]=='v': V.append(tuple(map(float,p[1:4])))
    elif p[0]=='g': g=p[1]; groups.setdefault(g,[])
    elif p[0]=='f': groups[g].append([int(t.split('/')[0])-1 for t in p[1:]])
if os.environ.get('MH_ALVOS'): mhcommon.apply_targets(V, mhcommon.warrior_targets(os.environ['MH_ALVOS']))
def mean(ids): return [sum(V[i][k] for i in ids)/len(ids) for k in range(3)]
eyeL=mean({i for f in groups['helper-l-eye'] for i in f}); eyeR=mean({i for f in groups['helper-r-eye'] for i in f})
NECKJ=mean({i for f in groups['joint-neck'] for i in f}) if 'joint-neck' in groups else None
CUT=(NECKJ[1]+0.16) if NECKJ else 6.05   # um pouco acima da articulação do pescoço
body=[f for f in groups['body'] if all(V[i][1]>CUT for i in f)]
hv={i for f in body for i in f}
# queixo: ponto frontal mais baixo próximo da linha média, acima do pescoço
ez=(eyeL[2]+eyeR[2])/2; ey0=(eyeL[1]+eyeR[1])/2
front=[i for i in hv if abs(V[i][0])<0.15 and V[i][2]>ez-0.45 and ey0-1.8<V[i][1]<ey0-0.5]   # queixo: abaixo dos olhos e à frente do pescoço
chin=min(front,key=lambda i:V[i][1]); chinY=V[chin][1]
top=max(V[i][1] for i in hv)
zs=[V[i][2] for i in hv if V[i][1]>7.0]; zc=(max(zs)+min(zs))/2
ey=(eyeL[1]+eyeR[1])/2; ex=abs(eyeL[0]-eyeR[0])/2
print('olhos',eyeL,eyeR,'queixo',chinY,'topo',top,'zc',zc)
# escala: topo -> queixo = 0,23 m ; centro na altura das orelhas (≈ 2,5 cm abaixo dos olhos)
k=0.23/(top-chinY); cy=ey-0.025/k
def loc(p): return [round((p[2]-zc)*k,4), round(p[0]*k,4), round((p[1]-cy)*k,4)]   # [frente, lado, cima]
# UV no retrato: olhos -> (0,333|0,667 ; 0,287), queixo -> 0,84; atrás das orelhas -> área só de pele
a=0.1667/ex; c=(0.84-0.287)/(chinY-ey)
def uv(p):
    if p[2] < zc-0.15: return [round(0.04+0.02*math.sin(p[0]*3),4), round(0.5+0.3*math.tanh((p[1]-ey)*0.6),4)]
    return [round(0.5-p[0]*a,4), round(0.287+(p[1]-ey)*c,4)]
EXPR=mhcommon.expression_deltas(os.environ['MH_EXPR']) if os.environ.get('MH_EXPR') else {}
def pack(faces, ids_sel=None):
    ids=sorted({i for f in faces for i in f}); m={v:n for n,v in enumerate(ids)}
    ex={}
    for nome,d in EXPR.items():   # deslocamentos esparsos por expressão, no referencial da cabeça [frente, lado, cima]
        lst=[[n,round(d[i][2]*k,4),round(d[i][0]*k,4),round(d[i][1]*k,4)] for n,i in enumerate(ids) if i in d and max(abs(c) for c in d[i])>1e-3]
        if lst: ex[nome]=lst
    return {'ex':ex,'v':[loc(V[i]) for i in ids],'uv':[uv(V[i]) for i in ids],'f':[[m[i] for i in f] for f in faces]}
# LOD baixo: agrupamento de vértices numa grade (≈ 1/14 da altura da cabeça)
def decimate(faces, cell):
    rep={};cl={}
    for f in faces:
        for i in f:
            key=tuple(round(V[i][d]/cell) for d in range(3)); cl.setdefault(key,[]).append(i); rep[i]=key
    center={key:min(ids,key=lambda i:sum((V[i][d]-sum(V[j][d] for j in ids)/len(ids))**2 for d in range(3))) for key,ids in cl.items()}
    nf=[]
    for f in faces:
        g2=[]
        for i in f:
            c2=center[rep[i]]
            if c2 not in g2: g2.append(c2)
        if len(g2)>=3: nf.append(g2)
    return nf
hi=pack(decimate(body,(top-chinY)/22)); lo=pack(decimate(body,(top-chinY)/8.5))
mn=pack(decimate(body,(top-chinY)/4.5)); mn.pop('ex',None)   # mínimo: cabeça com ~15 px na tela do jogo
eyes=[]
for nm in ('helper-l-eye','helper-r-eye'):
    f=groups[nm]; ids=sorted({i for fc in f for i in fc}); m={v:n for n,v in enumerate(ids)}; c0=mean(ids)
    r=max(math.dist(V[i],c0) for i in ids)
    eyes.append({'v':[loc(V[i]) for i in ids],'uv':[[round(0.5+(V[i][0]-c0[0])/(2*r),4),round(0.5-(V[i][1]-c0[1])/(2*r),4)] for i in ids],'f':[[m[i] for i in fc] for fc in f]})
hair=[f for f in groups['helper-hair'] if all(V[i][1]>6.9 for i in f)]
hp=pack(hair)
data={'fonte':'MakeHuman base mesh hm08 (CC0) — makehumancommunity.org','alta':hi,'baixa':lo,'minima':mn,'olhos':eyes,'couro':hp}
js='/* Cabeça anatômica extraída do modelo-base MakeHuman hm08 (CC0, makehumancommunity.org).\n   Coordenadas em metros no referencial da cabeça: [frente, lado, cima], origem na altura das orelhas.\n   uv: projeção frontal alinhada ao retrato (olhos, nariz, boca, queixo). Gerado por tools/mhhead.py. */\nwindow.GUERREIRO_CABECA = '+json.dumps(data,separators=(',',':'))+';\n'
open(out,'w').write(js)
print('minima',len(mn['f']),'alta',len(hi['f']),'baixa',len(lo['f']),'cabelo',len(hp['f']),'olhos',[len(e['f']) for e in eyes],'bytes',len(js))
