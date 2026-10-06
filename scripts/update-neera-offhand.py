"""Extract Neera's supplied off-hand atlas without resizing or repainting pixels."""
import json
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:\Users\evari\Desktop\Neera\Nerra V2\Offhand')
OUT = ROOT / 'public/game/sprites/neera/neera-v2-001'
atlas = Image.open(SOURCE / 'sprite-max-px-frames-36-rows-6-cols-6.png').convert('RGBA')
metadata = json.loads((SOURCE / 'sprite-max-px-frames-36-rows-6-cols-6.json').read_text())
frames = sorted(metadata['frames'].items())
assert len(frames) == 36
OUT.mkdir(parents=True, exist_ok=True)
for i, (name, entry) in enumerate(frames, 1):
    assert not entry['rotated'] and not entry['trimmed'], name
    r = entry['frame']
    frame = atlas.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    assert frame.getchannel('A').getbbox(), name
    target = OUT / f'atk-short-{i}.png'
    frame.save(target)
    assert Image.open(target).tobytes() == frame.tobytes(), name
print('PASS: 36 frames extracted; every RGBA pixel matches the supplied atlas.')
