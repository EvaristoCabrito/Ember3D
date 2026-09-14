from pathlib import Path
import sys
from PIL import Image

sheet = Image.open(sys.argv[1]).convert("RGBA")
names = sys.argv[2:6]
root = Path(__file__).resolve().parents[1] / "public" / "game" / "icons" / "weapons"
w, h = sheet.size
cells = ((0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2),
         (0, h // 2, w // 2, h), (w // 2, h // 2, w, h))

for name, cell in zip(names, cells):
    icon = sheet.crop(cell)
    bbox = icon.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"empty icon: {name}")
    icon = icon.crop(bbox)
    icon.thumbnail((224, 224), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    out.alpha_composite(icon, ((256 - icon.width) // 2, (256 - icon.height) // 2))
    out.save(root / f"{name}.png", optimize=True)
    print(f"installed {name}.png")
