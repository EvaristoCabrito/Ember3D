from pathlib import Path
from PIL import Image
import json, shutil

root = Path(__file__).resolve().parents[1]
source = Path('C:/Users/evari/Desktop/Finished Sprites/Minor Horror/Death')
originals = root / 'assets/sprite-sources/minor-horror-death-003'
originals.mkdir(parents=True, exist_ok=True)
for ext in ('png', 'json'):
    shutil.copy2(source / f'sprite-max-px-frames-36-rows-6-cols-6.{ext}', originals / f'death.{ext}')
old = root / 'public/game/sprites/minor-horror-002'
out = root / 'public/game/sprites/minor-horror-003'
out.mkdir(exist_ok=True)
for p in old.iterdir():
    if p.is_file(): shutil.copy2(p, out / p.name)
atlas = Image.open(originals / 'death.png').convert('RGBA')
entries = sorted(json.loads((originals / 'death.json').read_text())['frames'].items())
assert len(entries) == 36
ref = Image.open(old / '1.png').getchannel('A').getbbox()
f = entries[0][1]['frame']
first = atlas.crop((f['x'], f['y'], f['x']+f['w'], f['y']+f['h']))
b = first.getchannel('A').getbbox()
scale = (ref[3]-ref[1]) / (b[3]-b[1])
for i, (_, entry) in enumerate(entries):
    f = entry['frame']
    frame = atlas.crop((f['x'], f['y'], f['x']+f['w'], f['y']+f['h']))
    cut = frame.crop(frame.getchannel('A').getbbox())
    cut = cut.resize((round(cut.width*scale), round(cut.height*scale)), Image.Resampling.LANCZOS)
    assert cut.width <= 600 and cut.height <= 640
    canvas = Image.new('RGBA', (600,660))
    canvas.alpha_composite(cut, ((600-cut.width)//2, 640-cut.height))
    canvas.save(out / f'death-{i+1}.png')
manifest = json.loads((old / 'manifest.json').read_text())
manifest.append(dict(animation='Death', source=str(originals / 'death.png'), sourceDurationsMs=[e['duration'] for _,e in entries], scale=scale, referenceStandingHeight=ref[3]-ref[1]))
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2))
shutil.copy2(originals / 'death.json', out / 'source-Death.json')
print('Death: 36 frames,', sum(e['duration'] for _,e in entries)/1000, 'seconds')
