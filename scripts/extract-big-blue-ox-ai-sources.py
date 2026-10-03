import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('work/video-tools').resolve()))
import cv2
from PIL import Image, ImageDraw
out=Path('work/big-blue-ox-ai/originals');out.mkdir(parents=True,exist_ok=True)
clips=[('hit','20261002210336',0,3.5),('atk','20261002210336',3.5,9.5),('move','20261001032938',0,4),('death','20261001032320',4,10),('idle','20261002235621',0,10),('atk2','20261003000335',0,10)]
manifest=[]
for name,key,start,end in clips:
 p=next(Path('C:/Users/evari/Downloads').glob('*'+key+'.mp4'));cap=cv2.VideoCapture(str(p));fps=cap.get(cv2.CAP_PROP_FPS);total=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));frames=[]
 for i in range(32):
  t=start+(end-start-1/fps)*i/31;idx=round(t*fps);cap.set(cv2.CAP_PROP_POS_FRAMES,idx);ok,f=cap.read();assert ok
  im=Image.fromarray(cv2.cvtColor(f,cv2.COLOR_BGR2RGB));im.thumbnail((960,540));file=f'{i+1}.png' if name=='idle' else f'{name}-{i+1}.png';im.save(out/file);frames.append(dict(file=file,sourceFrame=idx,seconds=idx/fps))
 cap.release();manifest.append(dict(animation=name,source=str(p),start=start,end=end,frames=frames,mirrored=True))
Path('work/big-blue-ox-ai/manifest.json').write_text(json.dumps(manifest,indent=2))
canvas=Image.new('RGB',(1024,4*165),'#222');d=ImageDraw.Draw(canvas)
for j in range(32):
 im=Image.open(out/f'death-{j+1}.png');im.thumbnail((128,140));canvas.paste(im,((j%8)*128,(j//8)*165+20));d.text(((j%8)*128,(j//8)*165),f'{manifest[3]["frames"][j]["seconds"]:.2f}s',fill='white')
canvas.save('work/big-blue-ox-ai/death-source-timing.jpg')
print('192 original frames saved; death starts at source frame 96 (4.00s)',flush=True)
