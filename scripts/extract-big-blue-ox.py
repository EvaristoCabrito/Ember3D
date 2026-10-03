import sys,json
sys.path.insert(0,'work/video-tools')
import cv2,numpy as np
from PIL import Image,ImageDraw
from pathlib import Path
out=Path('public/game/sprites/big-blue-ox-002');out.mkdir(parents=True,exist_ok=True)
clips=[('hit','20261002210336',0,3.5),('atk','20261002210336',3.5,9.5),('move','20261001032938',0,4),('death','20261001032320',4,10),('idle','20261002235621',0,10),('atk2','20261003000335',0,10)]
preview=Image.new('RGB',(1024,6*150),'#394d40');draw=ImageDraw.Draw(preview)
manifest=[]
for row,(name,key,start,end) in enumerate(clips):
 p=next(Path('C:/Users/evari/Downloads').glob('*'+key+'.mp4'));cap=cv2.VideoCapture(str(p));frames=[]
 for i in range(32):
  t=start+(end-start-.05)*i/31;cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,f=cap.read();assert ok
  f=cv2.resize(f,(640,360));h,w=f.shape[:2]
  mask=np.full((h,w),cv2.GC_BGD,np.uint8);mask[30:335,55:610]=cv2.GC_PR_BGD
  gray=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY);bg=np.median(gray[:,np.r_[0:35,615:640]],axis=1)[:,None]
  local=gray.astype(np.float32);mean=cv2.blur(local,(9,9));texture=np.sqrt(np.maximum(0,cv2.blur(local*local,(9,9))-mean*mean));dark=(gray<bg-23)|(texture>7);dark[:40]=False;dark[330:]=False;dark[:,:65]=False;dark[:,605:]=False
  mask[dark]=cv2.GC_PR_FGD
  core=cv2.erode(dark.astype(np.uint8),np.ones((5,5),np.uint8));mask[core>0]=cv2.GC_FGD
  cv2.grabCut(f,mask,None,np.zeros((1,65)),np.zeros((1,65)),2,cv2.GC_INIT_WITH_MASK)
  alpha=np.where((mask==1)|(mask==3),255,0).astype(np.uint8)
  count,labels,stats,_=cv2.connectedComponentsWithStats(alpha)
  if count>1:
   valid=np.flatnonzero(stats[1:,4]>80)+1;alpha=np.where(np.isin(labels,valid),255,0).astype(np.uint8)
  alpha=cv2.morphologyEx(alpha,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
  contours,_=cv2.findContours(alpha,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);alpha[:]=0
  cv2.drawContours(alpha,[c for c in contours if cv2.contourArea(c)>100],-1,255,cv2.FILLED)
  alpha[330:]=0
  rgba=np.dstack((cv2.cvtColor(f,cv2.COLOR_BGR2RGB),alpha));im=Image.fromarray(rgba).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
  # Shared crop and ground line preserve pose, size and death collapse across all frames.
  im=im.crop((25,25,615,338)).resize((472,250),Image.Resampling.LANCZOS)
  file=f'{i+1}.png' if name=='idle' else f'{name}-{i+1}.png';im.save(out/file)
  if i in [0,8,16,24]:
   small=im.copy();small.thumbnail((248,125));preview.paste(small,((i//8)*256,row*150+22),small)
  frames.append(file)
 cap.release();draw.text((5,row*150+3),name,fill='white');manifest.append(dict(animation=name,source=str(p),start=start,end=end,frames=frames,mirrored=True))
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
preview.save('work/big-blue-ox/preview.png')
print('Created 192 transparent mirrored frames')

# Final matte cleanup and contact sheet.
import sys
sys.path.insert(0,'work/video-tools')
import cv2,numpy as np
from PIL import Image,ImageDraw
from pathlib import Path
root=Path('public/game/sprites/big-blue-ox-002')
for p in root.glob('*.png'):
 im=np.array(Image.open(p));rgb=im[:,:,:3];g=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY).astype(np.float32);mean=cv2.blur(g,(5,5));std=np.sqrt(np.maximum(0,cv2.blur(g*g,(5,5))-mean*mean))
 flat=((std<3.8)&(g>65)&(im[:,:,3]>0)).astype(np.uint8)
 n,labels,stats,_=cv2.connectedComponentsWithStats(flat);valid=np.flatnonzero(stats[1:,4]>120)+1;bg=np.isin(labels,valid).astype(np.uint8)
 bg=cv2.dilate(bg,np.ones((3,3),np.uint8));im[:,:,3][bg>0]=0
 n,labels,stats,_=cv2.connectedComponentsWithStats((im[:,:,3]>100).astype(np.uint8));largest=1+np.argmax(stats[1:,4]);im[:,:,3][labels!=largest]=0
 im[:,:,3]=cv2.erode(im[:,:,3],np.ones((3,3),np.uint8));Image.fromarray(im).save(p)
canvas=Image.new('RGB',(1024,900),'#394d40');d=ImageDraw.Draw(canvas)
for r,(name,prefix) in enumerate([('Idle',''),('Walk','move-'),('Hit','hit-'),('Attack','atk-'),('Death','death-'),('Charge attack','atk2-')]):
 d.text((5,r*150+3),name,fill='white')
 for j,i in enumerate([1,9,17,25]):
  im=Image.open(root/f'{prefix}{i}.png');im.thumbnail((248,125));canvas.paste(im,(j*256,r*150+22),im)
canvas.save('work/big-blue-ox/preview.png')
print('Validated',len(list(root.glob('*.png'))),'frames')
