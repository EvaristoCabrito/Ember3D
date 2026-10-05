"""Slice and normalize Neera's 36-frame attack atlas for the game renderer."""

from __future__ import annotations

import json
from statistics import median
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ARCHIVE = ROOT / "assets" / "sprite-sources" / "neera-attack-001"
SOURCE_IMAGE = SOURCE_ARCHIVE / "attack.png"
SOURCE_JSON = SOURCE_ARCHIVE / "attack.json"
OUTPUT = ROOT / "public" / "game" / "sprites" / "neera"

# Match the existing Neera atk-*.png canvas and its occupied alpha height/baseline.
CANVAS_SIZE = (360, 572)
TARGET_ALPHA_HEIGHT = 516
TARGET_ALPHA_BOTTOM = 544


def main() -> None:
    if not SOURCE_IMAGE.is_file() or not SOURCE_JSON.is_file():
        raise FileNotFoundError("The supplied Neera attack atlas image or JSON is missing.")

    atlas = Image.open(SOURCE_IMAGE).convert("RGBA")
    metadata = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    frames = metadata["frames"]
    if len(frames) != 36:
        raise ValueError(f"Expected 36 attack frames, found {len(frames)}.")

    ordered_frames = sorted(frames)
    alpha_heights = []
    for name in ordered_frames:
        rect = frames[name]["frame"]
        bbox = atlas.crop(
            (rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"])
        ).getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"Frame {name} is fully transparent.")
        alpha_heights.append(bbox[3] - bbox[1])
    source_median_height = median(alpha_heights)

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for index, name in enumerate(ordered_frames, start=1):
        rect = frames[name]["frame"]
        frame = atlas.crop(
            (rect["x"], rect["y"], rect["x"] + rect["w"], rect["y"] + rect["h"])
        )
        bbox = frame.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"Frame {name} is fully transparent.")

        visible = frame.crop(bbox)
        resized_height = round(visible.height * TARGET_ALPHA_HEIGHT / source_median_height)
        resized_width = round(visible.width * TARGET_ALPHA_HEIGHT / source_median_height)
        visible = visible.resize((resized_width, resized_height), Image.Resampling.LANCZOS)

        canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        x = (CANVAS_SIZE[0] - resized_width) // 2
        y = TARGET_ALPHA_BOTTOM - resized_height
        canvas.alpha_composite(visible, (x, y))
        canvas.save(OUTPUT / f"atk-{index}.png", optimize=True)
        ImageOps.mirror(canvas).save(OUTPUT / f"atk-left-{index}.png", optimize=True)

    print(f"Generated 36 right-facing and 36 mirrored Neera attack frames in {OUTPUT}")


if __name__ == "__main__":
    main()
