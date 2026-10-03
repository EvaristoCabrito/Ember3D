from pathlib import Path
from PIL import Image
import json,shutil,statistics
root=Path('C:/Users/evari/Desktop/Finished Sprites/Minor Horror');out=Path('public/game/sprites/minor-horror-001');out.mkdir(parents=True,exist_ok=True);sound=Path('public/game/MUSIC/SoundFX');manifest=[]
for folder,prefix in [('Idle',''),('ATT','atk-'),('Casting','cast-'),('Walk','move-')]:
 shutil.copy2(next((root/folder).glob('*.json')),out/f'source-{folder}.json')
 p=next((root/folder).glob('*.png'));im=Image.open(p).convert('RGBA');meta=json.loads(next((root/folder).glob('*.json')).read_text());frames=[]
 for name,entry in sorted(meta['frames'].items()):
  f=entry['frame'];frame=im.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']));frames.append(frame)
 heights=[f.getchannel('A').getbbox()[3]-f.getchannel('A').getbbox()[1] for f in frames];scale=520/statistics.median(heights)
 for i,f in enumerate(frames):
  bbox=f.getchannel('A').getbbox();cut=f.crop(bbox);cut=cut.resize((round(cut.width*scale),round(cut.height*scale)),Image.Resampling.LANCZOS);assert cut.width<=600 and cut.height<=640
  canvas=Image.new('RGBA',(600,660));canvas.alpha_composite(cut,((600-cut.width)//2,640-cut.height));canvas.save(out/f'{prefix}{i+1}.png')
 mp3=next((root/folder).glob('*.mp3'),None)
 if mp3:shutil.copy2(mp3,sound/f'MinorHorror{folder}001.mp3')
 manifest.append(dict(animation=folder,frames=len(frames),source=str(p),sourceDurationsMs=[v['duration'] for v in meta['frames'].values()],scale=scale))
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));print('144 transparent frames and 3 action cues installed')
