import os,sys,time,json
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2'
ROOT=Path(__file__).resolve().parents[1]

import onnxruntime as ort
from rembg import new_session,remove
from PIL import Image,ImageDraw
opts=ort.SessionOptions();opts.enable_mem_pattern=False;opts.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
session=new_session('u2net',sess_opts=opts,providers=['CPUExecutionProvider'])
print('AI cutter:',session.inner_session.get_providers(),flush=True)
source=ROOT/'work/big-blue-ox-ai/originals';out=ROOT/'public/game/sprites/big-blue-ox-ai-004';out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((ROOT/'work/big-blue-ox-ai/manifest.json').read_text())
start=time.time();count=0
for entry in manifest:
 for f in entry['frames']:
  file=f['file'];dest=out/file
  if not dest.exists():
   image=Image.open(source/file).convert('RGB');cut=remove(image,session=session,alpha_matting=False).convert('RGBA')
   cut=cut.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
   # Same crop for every animation: fixed body scale, fixed ground line.
   w,h=cut.size;cut=cut.crop((round(w*25/640),round(h*25/360),round(w*615/640),round(h*338/360)))
   cut=cut.resize((472,250),Image.Resampling.LANCZOS);cut.save(dest)
  count+=1
  print(f'{count}/192 {file} elapsed={time.time()-start:.0f}s',flush=True)
 entry['cuttingModel']='u2net';entry['outputDirectory']=str(out)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
canvas=Image.new('RGB',(1024,900),'#394d40');d=ImageDraw.Draw(canvas)
for r,(name,prefix) in enumerate([('Idle',''),('Walk','move-'),('Hit','hit-'),('Attack','atk-'),('Death (4.00s onward)','death-'),('Charge attack','atk2-')]):
 d.text((5,r*150+3),name,fill='white')
 for j,i in enumerate([1,9,17,25]):
  im=Image.open(out/f'{prefix}{i}.png');im.thumbnail((248,125));canvas.paste(im,(j*256,r*150+22),im)
canvas.save(ROOT/'work/big-blue-ox-ai/preview.png')
print('AI EXTRACTION COMPLETE',flush=True)
