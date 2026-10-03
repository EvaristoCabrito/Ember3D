from pathlib import Path
import json
from PIL import Image,ImageDraw
root=Path('public/game/sprites/big-blue-ox-ai-005');out=Path('work/big-blue-ox-ai/qa');out.mkdir(exist_ok=True)
manifest=json.loads((root/'manifest.json').read_text())
assert len(manifest)==6
for entry in manifest:
 assert len(entry['frames'])==32
 name=entry['animation'];sheet=Image.new('RGB',(1024,4*164),'#ddd');draw=ImageDraw.Draw(sheet)
 for j,f in enumerate(entry['frames']):
  im=Image.open(root/f['file']);assert im.mode=='RGBA' and im.size==(472,250)
  assert im.getchannel('A').getextrema()==(0,255);assert im.getchannel('A').getbbox()
  im.thumbnail((128,135),Image.Resampling.LANCZOS);x=(j%8)*128;y=(j//8)*164
  color=['#ffffff','#17202a','#bb407b','#649553'][j%4];draw.rectangle((x,y,x+127,y+163),fill=color)
  sheet.paste(im,(x,y+22),im);draw.text((x+4,y+4),f'{j+1}: {f["seconds"]:.2f}s',fill='black' if j%4==0 else 'white')
 sheet.save(out/f'{name}-all-32.png')
death=next(e for e in manifest if e['animation']=='death');assert death['frames'][0]['sourceFrame']==96 and death['frames'][0]['seconds']==4;assert all(f['seconds']>=4 for f in death['frames'])
print('PASS: 192 AI RGBA frames, six complete sets, death source begins exactly at 4.00s')
