# Gera o corpo (sem cabeça e sem mãos) a partir do modelo-base MakeHuman hm08 (CC0), com pesos de skinning
# para o esqueleto do Guerreiro Ósseo. Uso: python3 mhbody.py base.obj guerreiro-corpo.js
import sys, json, math, collections, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mhcommon
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
# físico de guerreiro (alvos CC0 do MakeHuman), aplicado na malha original antes do espelhamento
if os.environ.get('MH_ALVOS'):
    V0=[(-x,y,z) for x,y,z in V]; mhcommon.apply_targets(V0, mhcommon.warrior_targets(os.environ['MH_ALVOS'])); V=[(-x,y,z) for x,y,z in V0]
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
# coluna em dois segmentos: lombar (pelve → T12/L1, joint-spine-2) e tórax (→ C7, joint-neck)
B=[['pelve', P('pelvis'), add(P('pelvis'),[0,-1.6,0]), 1.5, None],
   ['lombar', P('pelvis'), P('spine-2'), 1.5, 0],
   ['torax', P('spine-2'), P('neck'), 1.6, 1],
   ['pescoco', P('neck'), P('head'), 0.55, 2]]
for s in ('l','r'):
    B+= [['braco-'+s, P(s+'-shoulder'), P(s+'-elbow'), 0.5, 2],
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
# pesos profissionais do rig "game engine" do MPFB2 (CC0), convertidos para os nossos ossos
PRO=None
if os.environ.get('MH_PESOS'):
    raw=json.load(open(os.environ['MH_PESOS']))['weights']; PRO=collections.defaultdict(dict)
    def ours(bn):
        sd=bn[-1] if bn[-2:] in ('_l','_r') else None
        if bn in ('Root','pelvis'): return {'pelve':1}
        if bn=='spine_01': return {'lombar':1}
        if bn=='spine_02': return {'lombar':0.4,'torax':0.6}
        if bn=='spine_03' or bn.startswith('clavicle'): return {'torax':1}
        if bn in ('neck_01','head'): return {'pescoco':1}
        if bn.startswith('upperarm'): return {'braco-'+sd:1}
        if bn.startswith(('lowerarm','hand','thumb','index','middle','ring','pinky')): return {'antebraco-'+sd:1}
        if bn.startswith('thigh'): return {'coxa-'+sd:1}
        if bn.startswith('calf'): return {'canela-'+sd:1}
        if bn.startswith(('foot','ball')): return {'pe-'+sd:1}
        return {}
    for bn,lst in raw.items():
        for nm,k in ours(bn).items():
            for vi,w in lst: PRO[vi][nm]=PRO[vi].get(nm,0)+w*k
def segd(p,a,b):
    ab=sub(b,a); t=max(0,min(1,dot(sub(p,a),ab)/dot(ab,ab))); q=add(a,mul(ab,t)); return math.dist(p,q),t
CUT_NECK=P('neck')[1]+0.28   # corpo vai até logo abaixo da mandíbula (a cabeça vem de guerreiro-cabeca.js)
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
    if b[0]=='torax':
        if t>0.85 and abs(p[0])<0.9: return [i,1-(t-0.85)/0.3,names.index('pescoco')]
        if t<0.25: return [i,0.5+0.5*t/0.25,names.index('lombar')]
        return [i,1,i]
    if b[0]=='pelve': return [i,0.5+0.5*min(1,(0.73-p[1])/1.0),1] if p[1]>-0.27 else [i,1,i]
    if b[0]=='lombar' and t<0.15: return [i,0.5+0.5*t/0.15,0]
    if b[0]=='lombar' and t>0.75: return [i,0.5+0.5*(1-t)/0.25,names.index('torax')]
    if t<0.22 and b[4] is not None: return [i,0.5+0.5*t/0.22,b[4]]
    if t>0.8:
        ch=[c for c in children[i] if not B[c][0].startswith('coxa') and not B[c][0].startswith('braco')]
        if ch: return [i,0.5+0.5*(1-t)/0.2,ch[0]]
    return [i,1,i]
def wv(i):
    if PRO is not None and PRO.get(i):
        top=sorted(PRO[i].items(),key=lambda kv:-kv[1])[:3]; t=sum(w for _,w in top) or 1; out=[]
        for nm,w in top: out+=[names.index(nm),round(w/t,3)]
        while len(out)<6: out+=[out[0],0]
        return out
    a_,ww,b_=weights(V[i]); return [a_,round(ww,3),b_,round(1-ww,3),a_,0]
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
    w=[wv(i) for i in ids]
    # tecido simples na pelve (roupa de baixo de linho)
    cloth=[1 if all(-1.9<V[i][1]<0.95 and abs(V[i][0])<2.6 for i in f) else 0 for f in faces]
    return {'v':vv,'uv':uv,'w':w,'f':[[m[i] for i in f] for f in faces],'pano':cloth}
def bone_t(p,i):
    a,b=B[i][1],B[i][2]; ab=sub(b,a); return dot(sub(p,a),ab)/dot(ab,ab)
def nearest(p):
    best=None
    for i,b in enumerate(B):
        d,t=segd(p,b[1],b[2]); d-=b[3]
        if best is None or d<best[0]: best=(d,i,t)
    return best[1],best[2]
def vnormals(faces):
    N=collections.defaultdict(lambda:[0,0,0])
    for f in faces:
        n=[0,0,0]
        for k in range(len(f)):
            a,b=V[f[k]],V[f[(k+1)%len(f)]]
            n=add(n,[(a[1]-b[1])*(a[2]+b[2]),(a[2]-b[2])*(a[0]+b[0]),(a[0]-b[0])*(a[1]+b[1])])
        for i in f: N[i]=add(N[i],n)
    return {i:mul(n,1/(math.sqrt(dot(n,n)) or 1)) for i,n in N.items()}
YH=(P('l-upper-leg')[1]+P('r-upper-leg')[1])/2
# peças: nome, textura, espessura (dm), teste por vértice (p, n, osso, t), uv ('torso' = mapa da couraça; senão cilíndrico no osso)
def region(nm): return lambda p,n,bi,t: B[bi][0].startswith(nm)
PIECES=[
 ('couraca','torso',0.16, lambda p,n,bi,t: B[bi][0] in ('torax','lombar') and 1.05<p[1]<5.75, 'torso'),
 ('cinto','leather',0.2, lambda p,n,bi,t: B[bi][0] in ('lombar','pelve') and 0.35<p[1]<=1.05, 'torso'),
 ('saiote','mail',0.22, lambda p,n,bi,t: (B[bi][0]=='pelve' or (B[bi][0].startswith('coxa') and t<0.18)) and -1.7<p[1]<=0.35, 'torso'),
 ('ombreira','plate',0.32, lambda p,n,bi,t: B[bi][0].startswith('braco') and t<0.38 and n[1]>-0.35, 'cil'),
 ('cotoveleira','plate',0.2, lambda p,n,bi,t: (B[bi][0].startswith('braco') and t>0.86) or (B[bi][0].startswith('antebraco') and t<0.12), 'cil'),
 ('bracadeira','bracer',0.13, lambda p,n,bi,t: B[bi][0].startswith('antebraco') and 0.18<t<0.98, 'cil'),
 ('coxote','iron',0.15, lambda p,n,bi,t: B[bi][0].startswith('coxa') and 0.2<t<0.86 and n[2]>-0.35, 'cil'),
 ('joelheira','plate',0.26, lambda p,n,bi,t: ((B[bi][0].startswith('coxa') and t>0.86) or (B[bi][0].startswith('canela') and t<0.14)) and n[2]>0.15, 'cil'),
 ('greva','greave',0.15, lambda p,n,bi,t: B[bi][0].startswith('canela') and 0.14<=t<0.82 and n[2]>-0.15, 'cil'),
 ('bota','leather',0.1, lambda p,n,bi,t: B[bi][0].startswith('pe-') or (B[bi][0].startswith('canela') and t>=0.82), 'cil'),
]
def torso_uv(p):
    a=math.atan2(p[0],p[2]); z=(p[1]-YH)*K
    return [0.5-a/(2*math.pi), (0.61-z)/0.69]
def cyl_uv(p,bi):
    a,b=B[bi][1],B[bi][2]; d=sub(b,a); L=math.sqrt(dot(d,d)); d=mul(d,1/L)
    ref=[0,0,1] if abs(d[2])<0.9 else [0,1,0]; e1=sub(ref,mul(d,dot(ref,d))); e1=mul(e1,1/math.sqrt(dot(e1,e1))); e2=[d[1]*e1[2]-d[2]*e1[1],d[2]*e1[0]-d[0]*e1[2],d[0]*e1[1]-d[1]*e1[0]]
    q=sub(p,a); return [0.5+math.atan2(dot(q,e2),dot(q,e1))/(2*math.pi), dot(q,d)/L]
def armor(faces):
    VN=vnormals(faces); info={}
    for f in faces:
        for i in f:
            if i not in info: bi,t=nearest(V[i]); info[i]=(bi,t)
    out=[]
    for nm,tex,th,test,uvk in PIECES:
        sel=[f for f in faces if all(test(V[i],VN[i],info[i][0],info[i][1]) for i in f)]
        if not sel: continue
        ids=sorted({i for f in sel for i in f}); m={v:n for n,v in enumerate(ids)}
        vv=[[round(c*K,4) for c in add(V[i],mul(VN[i],th))] for i in ids]
        fu=[]
        for f in sel:
            if uvk=='torso': uv=[torso_uv(V[i]) for i in f]
            else:
                bi=max(set(info[i][0] for i in f), key=lambda b:sum(1 for i in f if info[i][0]==b)); uv=[cyl_uv(V[i],bi) for i in f]
            us=[u for u,_ in uv]
            if max(us)-min(us)>0.5: uv=[[u+1 if u<0.5 else u, v] for u,v in uv]   # costura do cilindro
            fu.append([[round(u,4),round(v,4)] for u,v in uv])
        w=[wv(i) for i in ids]
        out.append({'nome':nm,'tex':tex,'v':vv,'w':w,'f':[[m[i] for i in f] for f in sel],'fu':fu})
    return out
H=J['joint-head-2'][1]-J['joint-ground'][1]
hiF=decimate(body,H/52); loF=decimate(body,H/24); mnF=decimate(body,H/15)
hi=pack(hiF); lo=pack(loF); mn=pack(mnF)
arm={'alta':armor(hiF),'baixa':armor(loF),'minima':armor(mnF)}
bones=[{'nome':b[0],'a':[round(c*K,4) for c in b[1]],'b':[round(c*K,4) for c in b[2]]} for b in B]
data={'fonte':'MakeHuman base mesh hm08 (CC0) — makehumancommunity.org','ossos':bones,'alta':hi,'baixa':lo,'minima':mn,'armadura':arm,'chao':round(J['joint-ground'][1]*K,4)}
js='/* Corpo anatômico (sem cabeça e sem mãos) extraído do modelo-base MakeHuman hm08 (CC0, makehumancommunity.org),\n   espelhado para o referencial do Guerreiro Ósseo, com pesos de skinning por osso. Gerado por tools/mhbody.py. */\nwindow.GUERREIRO_CORPO = '+json.dumps(data,separators=(',',':'))+';\n'
open(out,'w').write(js)
print('pecas',[(p['nome'],len(p['f'])) for p in arm['alta']],'baixa',sum(len(p['f']) for p in arm['baixa']));print('minima',len(mn['f']),'armadura minima',sum(len(p['f']) for p in arm['minima']));print('K',K,'alta',len(hi['f']),len(hi['v']),'baixa',len(lo['f']),len(lo['v']),'bytes',len(js))
