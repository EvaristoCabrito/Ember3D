import sys,json;sys.path.insert(0,'work/plague-cattle');sys.path.insert(0,'work/video-tools')
import cv2,numpy as np
from PIL import Image
from pathlib import Path
from matte import matte
vids={t:next(q for q in Path('C:/Users/evari/Downloads').glob('*.mp4') if k in q.name) for k,t in [('PlagueCatle','idle'),('20261005020922','walkatk'),('PlguaCatlle','castdeath')]}
# (animation, prefix, video, first source frame, end source frame, endpoint inclusive?)
clips=[('idle','','idle',0,143,True),('walk','move-','walkatk',45,87,False),('attack','atk-','walkatk',124,212,True),
       ('cast','cast-','castdeath',64,136,True),('death','death-','castdeath',138,210,True)]
raw=Path('work/plague-cattle/raw');raw.mkdir(exist_ok=True)
man=[]
for name,prefix,vid,a,b,incl in clips:
  c=cv2.VideoCapture(str(vids[vid]));idx=[]
  for i in range(36):
    idx.append(round(a+(b-a)*i/(35 if incl else 36)))
  for i,s in enumerate(idx):
    c.set(cv2.CAP_PROP_POS_FRAMES,s);ok,f=c.read();assert ok
    Image.fromarray(matte(f)).save(raw/f'{prefix}{i+1}.png')
  man.append(dict(animation=name,video=str(vids[vid]),sourceFrames=idx,fps=24))
  print(name,idx)
# standing reference frames per video for scale matching
for vid in vids:
  c=cv2.VideoCapture(str(vids[vid]));c.set(cv2.CAP_PROP_POS_FRAMES,0);ok,f=c.read()
  Image.fromarray(matte(f)).save(raw/f'stand-{vid}.png')
json.dump(man,open('work/plague-cattle/raw/manifest.json','w'),indent=2)
