import cv2, numpy as np, json, sys
from skimage.morphology import skeletonize
from collections import deque
O='../assets/img/'
S='/tmp/claude-0/-home-user-EDTECH569-PORTFOLIO/95c852e6-6b04-5eaf-86f9-c2721e7a47a1/scratchpad/'
def tail_path(name, ymin_frac=0.62, open_r=13, npts=14):
    im=cv2.imread(O+name+'.png',cv2.IMREAD_UNCHANGED); h,w=im.shape[:2]
    a=(im[...,3]>110).astype(np.uint8)
    body=cv2.morphologyEx(a,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*open_r+1,2*open_r+1)))
    tail=a & (1-cv2.dilate(body,np.ones((3,3),np.uint8)))
    tail[:int(h*ymin_frac)]=0
    n,lab,st,_=cv2.connectedComponentsWithStats(tail,8)
    if n<2: return None
    cands=[j for j in range(1,n) if st[j,4]>150]
    i=max(cands,key=lambda j: st[j,1]+st[j,3]+0.15*st[j,2])  # lowest-reaching, favour wide
    tail=(lab==i).astype(np.uint8)
    # restore full tail width near the body by re-growing within alpha
    tail=cv2.dilate(tail,np.ones((3,3),np.uint8)) & a
    sk=skeletonize(tail>0).astype(np.uint8)
    ys,xs=np.nonzero(sk); pts=set(zip(ys,xs))
    def nb(p):
        y,x=p; return [(y+dy,x+dx) for dy in(-1,0,1) for dx in(-1,0,1) if (dy or dx) and (y+dy,x+dx) in pts]
    ends=[p for p in pts if len(nb(p))==1]
    dist_body=cv2.distanceTransform((1-body).astype(np.uint8),cv2.DIST_L2,5)
    root=min(ends,key=lambda p:dist_body[p]) if ends else min(pts,key=lambda p:dist_body[p])
    # BFS farthest from root
    prev={root:None}; q=deque([root]); last=root
    while q:
        c=q.popleft(); last=c
        for m in nb(c):
            if m not in prev: prev[m]=c; q.append(m)
    far=max(prev.keys(), key=lambda p: 0)  # placeholder
    # recompute farthest by path length
    dist={root:0}; q=deque([root]); order=[root]
    while q:
        c=q.popleft()
        for m in nb(c):
            if m not in dist: dist[m]=dist[c]+1; q.append(m); order.append(m)
    far=max(dist,key=dist.get)
    path=[]; c=far
    par={}
    q=deque([root]); seen={root}
    while q:
        c2=q.popleft()
        for m in nb(c2):
            if m not in seen: seen.add(m); par[m]=c2; q.append(m)
    c=far
    while c is not None and c!=root: path.append(c); c=par.get(c)
    path.append(root); path=path[::-1]
    dt=cv2.distanceTransform(tail,cv2.DIST_L2,5)
    L=len(path); idx=np.linspace(0,L-1,npts).astype(int)
    out=[]
    for k in idx:
        y,x=path[k]; out.append([int(x),int(y),float(max(3.0,dt[y,x]*1.35+2.0))])
    # extend root a little into the body along the initial direction
    (x0,y0,w0),(x1,y1,_)=out[0],out[1]
    d=np.array([x0-x1,y0-y1],float); d/=np.linalg.norm(d)+1e-6
    out.insert(0,[int(x0+d[0]*10),int(y0+d[1]*10),w0])
    vis=cv2.cvtColor((a*60).astype(np.uint8),cv2.COLOR_GRAY2BGR); vis[tail>0]=(0,120,255)
    for i,(x,y,ww) in enumerate(out):
        cv2.circle(vis,(x,y),int(ww),(0,255,0),1); cv2.putText(vis,str(i),(x+3,y-3),cv2.FONT_HERSHEY_SIMPLEX,0.3,(255,255,255),1)
    return out, vis
res={}; vs=[]
for n in ['SP1_trio_0','SP1_trio_1','SP1_trio_2']:
    r=tail_path(n)
    if r: res[n]=r[0]; vs.append(r[1]); print(n, r[0])
Hm=max(v.shape[0] for v in vs)
vs=[cv2.copyMakeBorder(v,0,Hm-v.shape[0],0,6,cv2.BORDER_CONSTANT) for v in vs]
cv2.imwrite(S+'tails.jpg',np.hstack(vs))
m=json.load(open(O+'meta.json')); m['tails']=res; json.dump(m,open(O+'meta.json','w'),indent=1)
