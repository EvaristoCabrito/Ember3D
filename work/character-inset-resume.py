from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8').replace('const UNIT_SHADOW_GROUND_INSET = 3;','const UNIT_SHADOW_GROUND_INSET = 0.5;');p.write_text(s,encoding='utf-8')
p=Path('scripts/qa-character-shadows.mjs');s=p.read_text(encoding='utf-8-sig').replace('u.footZ+3','u.footZ+0.5').replace('p.z+3','p.z+0.5').replace('u.footZ-u.ground+3','u.footZ-u.ground+0.5');p.write_text(s,encoding='utf-8')
