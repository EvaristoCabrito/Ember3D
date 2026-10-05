import sys;sys.path.insert(0,'C:/emberashes03D-main/work/video-tools')
import cv2,numpy as np
def bg_model(f):
  h,w=f.shape[:2];lab=f.astype(np.float32)
  g=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY).astype(np.float32)
  sat=lab.max(2)-lab.min(2)
  cand=(g>145)&(sat<14)
  ys,xs=np.nonzero(cand);ys=ys[::7];xs=xs[::7]
  X=np.stack([np.ones_like(xs),xs/w,ys/h,(xs/w)**2,(ys/h)**2,xs*ys/(w*h)],1).astype(np.float32)
  yy,xx=np.mgrid[0:h,0:w];F=np.stack([np.ones_like(xx),xx/w,yy/h,(xx/w)**2,(yy/h)**2,xx*yy/(w*h)],-1).astype(np.float32)
  bg=np.zeros_like(lab)
  for c in range(3):
    coef,*_=np.linalg.lstsq(X,lab[ys,xs,c],rcond=None);bg[:,:,c]=F@coef
  return bg
def matte(f):
  bg=bg_model(f);px=f.astype(np.float32)
  d=px-bg;lum=d.mean(2)
  chroma=np.linalg.norm(d-lum[...,None],axis=2)
  green=np.clip((px[:,:,1]-np.maximum(px[:,:,0],px[:,:,2])-6)/30,0,1)
  # darker than bg beyond shadow depth, or coloured, or green glow
  yy=np.arange(f.shape[0])[:,None]
  depth=np.where(yy>f.shape[0]*0.78,52,38)
  a=np.clip((-lum-depth)/22,0,1)
  a=np.maximum(a,np.clip((chroma-14)/14,0,1))
  a=np.maximum(a,green)
  a=np.maximum(a,np.clip((lum-12)/18,0,1))  # brighter than bg (glow cores)
  hard=(a>0.5).astype(np.uint8)
  hard=cv2.morphologyEx(hard,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
  n,lab_,st,_=cv2.connectedComponentsWithStats(hard,8)
  if n>1:
    big=1+np.argmax(st[1:,4]);keep=np.zeros(n,bool);keep[big]=True
    for i in range(1,n):
      if st[i,4]>40 and green[lab_==i].mean()>0.3: keep[i]=True
    hard=keep[lab_].astype(np.uint8)
  # fill only small interior holes (never the open gaps between legs/tail)
  cnt,_=cv2.findContours(hard,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
  fill=np.zeros_like(hard);cv2.drawContours(fill,cnt,-1,1,cv2.FILLED)
  holes=((fill>0)&(hard==0)).astype(np.uint8)
  n2,hl,hs,_=cv2.connectedComponentsWithStats(holes,4)
  small=np.zeros(n2,bool);small[1:]=hs[1:,4]<60
  solid=((hard>0)|small[hl]).astype(np.uint8)
  inner=cv2.erode(solid,np.ones((3,3),np.uint8))
  edge=cv2.dilate(solid,np.ones((3,3),np.uint8))
  alpha=np.where(inner>0,1.0,np.where(edge>0,a,0.0))
  alpha=np.clip(alpha,0,1)
  # un-premultiply against background colour for soft edges
  al=alpha[...,None];col=np.where(al>0.02,(px-bg*(1-al))/np.maximum(al,0.02),px)
  col=np.clip(col,0,255)
  rgba=np.dstack([cv2.cvtColor(col.astype(np.uint8),cv2.COLOR_BGR2RGB),(alpha*255).astype(np.uint8)])
  return rgba
