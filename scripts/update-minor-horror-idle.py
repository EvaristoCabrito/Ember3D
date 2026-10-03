from pathlib import Path
from PIL import Image,ImageDraw
import json,shutil
old=Path('public/game/sprites/minor-horror-001');out=Path('public/game/sprites/minor-horror-002');out.mkdir(exist_ok=True)
for p in old.iterdir():
 if p.is_file():shutil.copy2(p,out/p.name)
sources=Path('assets/sprite-sources/minor-horror-idle-002');sources.mkdir(parents=True,exist_ok=True)
for ext in ['png','json']:shutil.copy2(Path('C:/Users/evari/AppData/Local/Temp')/f'sprite-max-px-frames-36-rows-6-cols-6.{ext}',sources/f'idle.{ext}')
im=Image.open(sources/'idle.png').convert('RGBA');meta=json.loads((sources/'idle.json').read_text());entries=list(sorted(meta['frames'].items()));assert len(entries)==36
ref=Image.open(old/'atk-1.png').getchannel('A').getbbox();height=ref[3]-ref[1]
f=entries[0][1]['frame'];first=im.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']));bbox=first.getchannel('A').getbbox();scale=height/(bbox[3]-bbox[1])
for i,(_,entry) in enumerate(entries):
 f=entry['frame'];frame=im.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']));bbox=frame.getchannel('A').getbbox();cut=frame.crop(bbox);cut=cut.resize((round(cut.width*scale),round(cut.height*scale)),Image.Resampling.LANCZOS);assert cut.width<=600 and cut.height<=640
 canvas=Image.new('RGBA',(600,660));canvas.alpha_composite(cut,((600-cut.width)//2,640-cut.height));canvas.save(out/f'{i+1}.png')
for i in range(1,37):Image.open(old/f'move-{i}.png').transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(out/f'move-{i}.png')
m=json.loads((old/'manifest.json').read_text());idle=next(e for e in m if e['animation']=='Idle');idle.update(source=str(sources/'idle.png'),sourceDurationsMs=[e['duration'] for _,e in entries],scale=scale,referenceStandingHeight=height);next(e for e in m if e['animation']=='Walk')['mirrored']=True;(out/'manifest.json').write_text(json.dumps(m,indent=2));shutil.copy2(sources/'idle.json',out/'source-Idle.json')
canvas=Image.new('RGB',(1200,660),'#4b604c');d=ImageDraw.Draw(canvas)
for j,file in enumerate(['1.png','atk-1.png','cast-1.png','move-1.png']):
 frame=Image.open(out/file);frame.thumbnail((300,600));canvas.paste(frame,(j*300,25),frame);d.text((j*300+15,5),file,fill='white')
canvas.save('work/minor-horror/scale-002.png');print(f'Correct idle: {height}px standing height, 36 frames, 3.240s; walk mirrored')
