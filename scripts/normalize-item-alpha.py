from pathlib import Path
from io import BytesIO

from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[1]
CLEAN = Path(r"C:\EmberAshes032-clean-source\public\game\icons")
TARGET = ROOT / "public" / "game" / "icons"
PRESERVE = {
    "weapons/adaga-sombria.png", "weapons/arco-composto.png",
    "weapons/arco-do-cacador.png", "weapons/arco-elfico.png",
    "weapons/arco-longo.png", "weapons/cajado-da-comunhao.png",
    "weapons/cajado-da-esperanca.png", "weapons/machado-barbaro.png",
}

def normalize(im: Image.Image, size: int = 256, content: int = 224) -> Image.Image:
    im = im.convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("empty alpha")
    cropped = im.crop(bbox)
    cropped.thumbnail((content, content), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(cropped, ((size-cropped.width)//2, (size-cropped.height)//2))
    return canvas

def main() -> None:
    session = new_session("birefnet-general")
    converted = 0
    for group in ("weapons", "equipment"):
        source_dir, target_dir = CLEAN/group, TARGET/group
        target_dir.mkdir(parents=True, exist_ok=True)
        for src in sorted(source_dir.glob("*.png")):
            rel = f"{group}/{src.name}"
            if rel in PRESERVE:
                continue
            original = Image.open(src).convert("RGB")
            original.thumbnail((512, 512), Image.Resampling.LANCZOS)
            prepared = BytesIO()
            original.save(prepared, "PNG")
            cutout = remove(prepared.getvalue(), session=session, alpha_matting=False)
            normalize(Image.open(BytesIO(cutout))).save(target_dir/src.name, optimize=True)
            converted += 1
            print(f"[{converted}] {rel}", flush=True)
    for rel in sorted(PRESERVE):
        path = TARGET/rel
        if path.exists():
            normalize(Image.open(path)).save(path, optimize=True)
    print(f"DONE {converted} originals + {len(PRESERVE)} protected designs")

if __name__ == "__main__":
    main()
