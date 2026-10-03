"""Preserve all approved cutouts; distribute four extra holds per animation."""
from pathlib import Path
import json
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'public/game/sprites/big-blue-ox-ai-005'
target = root / 'public/game/sprites/big-blue-ox-ai-006'
target.mkdir(exist_ok=True)
manifest = json.loads((source / 'manifest.json').read_text())
for entry in manifest:
    original = entry['frames']
    assert len(original) == 32
    frames = []
    for i in range(36):
        index = round(i * 31 / 35)
        frame = dict(original[index])
        prefix = '' if entry['animation'] == 'idle' else entry['animation'] + '-'
        frame['file'] = f'{prefix}{i + 1}.png'
        frame['reusedFrom'] = original[index]['file']
        shutil.copy2(source / original[index]['file'], target / frame['file'])
        frames.append(frame)
    entry['frames'] = frames
    entry['outputDirectory'] = str(target)
    entry['expansion'] = '32 approved cutouts with four evenly distributed holds; original endpoints and playback duration preserved'
(target / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print('Created 216 frames; preserved original 32-frame assets.')
