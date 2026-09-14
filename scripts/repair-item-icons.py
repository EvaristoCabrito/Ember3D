"""Repair missing/corrupt weapon and equipment icons from the in-project master set.

The output contract is a dedicated 256x256 transparent PNG per data.ts item id.
Existing healthy custom icons are preserved; only invalid or absent files are rebuilt.
"""

from __future__ import annotations

import hashlib
import os
import re
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "game" / "data.ts"
ICON_ROOT = ROOT / "public" / "game" / "icons"
MASTER = ICON_ROOT / "refresh-001"

# Items known to have been absent or visually defective in the audit contact sheets.
# Healthy bespoke art outside this list remains untouched.
REMAKE = set("""
weapons/cajado-de-osso weapons/cajado-abissal weapons/cajado-de-ebano weapons/cajado-igneo
weapons/bastao-do-pacto weapons/cajado-tempestuoso weapons/cetro-da-corrupcao weapons/cajado-terrano
weapons/bastao-do-vacuo weapons/cajado-etereo weapons/cajado-da-luz-sombria weapons/cajado-da-chama-purpura
weapons/cajado-funebre weapons/bastao-do-caos weapons/bastao-dos-restos weapons/cajado-do-arcano-puro
weapons/cajado-da-praga weapons/cajado-da-renovacao weapons/cajado-da-esperanca weapons/cajado-da-graca
weapons/cetro-da-luz weapons/bastao-da-purificacao weapons/cajado-do-bispo weapons/cajado-da-comunhao
weapons/cajado-da-justica weapons/espada-da-lealdade weapons/espadao-pesado weapons/martelo-da-justica
weapons/machado-barbaro weapons/arco-longo weapons/arco-elfico weapons/arco-do-cacador weapons/adaga-sombria
weapons/adaga-de-veneno weapons/partisan weapons/lanca-de-defesa weapons/maca-e-escudo-templar
weapons/lanca-e-escudo-templar
equipment/broquel equipment/shield-buckler equipment/shield-round equipment/shield-kite equipment/shield-tower
equipment/cross-kite-shield equipment/ancient-round-shield equipment/adaga-secundaria equipment/hood equipment/cowl
equipment/barbute equipment/sallet equipment/heavy-war-helmet equipment/great-helm equipment/knights-cuirass
equipment/dark-scale-cuirass equipment/brutal-knight-cuirass equipment/heavy-brigandine equipment/scale-armor
equipment/plate-cuirass equipment/chainmail-mantle equipment/massive-pauldrons equipment/spiked-shoulder-armor
equipment/gothic-shoulder-plates equipment/gothic-pauldrons-exceptional equipment/chainmail-leggings
equipment/plate-legs equipment/studded-gauntlets equipment/chainmail-gloves equipment/spiked-gauntlet
equipment/dark-steel-gauntlets equipment/engraved-vambrace equipment/heavy-armored-boots
equipment/ornamental-cloak-clasp equipment/travelers-cloak equipment/leather-cape equipment/wine-cloak
equipment/noble-war-cloak equipment/fur-trimmed-cloak equipment/ornate-noble-cloak equipment/plain-leather-belt
equipment/heavy-iron-buckle equipment/ornamental-belt-end equipment/ornate-dagger-belt equipment/utility-pouch-belt
equipment/amulet equipment/weathered-medallion equipment/heavy-metal-pendant equipment/silver-necklace
equipment/runic-amulet equipment/leather-gorget equipment/iron-talisman equipment/steel-gorget equipment/ancient-pendant
""".split())


def ids_from_block(text: str, start: str, end: str, pattern: str) -> list[str]:
    block = text.split(start, 1)[1].split(end, 1)[0]
    return [a or b for a, b in re.findall(pattern, block, flags=re.MULTILINE)]


def healthy(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 512:
        return False
    try:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path).convert("RGBA") as im:
            return im.width >= 64 and im.height >= 64 and im.getchannel("A").getbbox() is not None
    except (OSError, ValueError):
        return False


def weapon_master(item_id: str) -> Path:
    if item_id.startswith(("cajado", "bastao", "cetro")):
        holy = any(word in item_id for word in ("fe", "graca", "justica", "luz", "bispo", "comunhao", "esperanca", "renovacao", "purificacao"))
        return MASTER / "weapons" / ("holy-staff.png" if holy else "arcane-staff.png")
    if "escudo" in item_id:
        if item_id.startswith("maca"):
            return MASTER / "weapons" / "mace-shield.png"
        if item_id.startswith("lanca"):
            return MASTER / "weapons" / "spear-shield.png"
        return MASTER / "weapons" / "sword-shield.png"
    if item_id.startswith(("arco",)):
        return MASTER / "weapons" / "bow.png"
    if "besta" in item_id:
        return MASTER / "weapons" / "crossbow.png"
    if item_id.startswith(("adaga", "punhal", "misericordia")):
        return MASTER / "weapons" / "dagger.png"
    if item_id.startswith("katar"):
        return MASTER / "weapons" / "katar.png"
    if item_id.startswith(("lanca", "partisan")):
        return MASTER / "weapons" / "spear.png"
    if "guisarme" in item_id:
        return MASTER / "weapons" / "halberd.png"
    if "machado" in item_id:
        return MASTER / "weapons" / "axe.png"
    if item_id.startswith(("martelo", "malho")):
        return MASTER / "weapons" / "hammer.png"
    if any(word in item_id for word in ("espadao", "montante", "zweihander")):
        return MASTER / "weapons" / "greatsword.png"
    if any(word in item_id for word in ("sagrada", "consagrada", "juramento")):
        return MASTER / "weapons" / "ceremonial-blade.png"
    return MASTER / "weapons" / "broad-sword.png"


def equipment_master(item_id: str) -> Path:
    if "shield" in item_id or item_id == "broquel":
        return MASTER / "equipment" / "shield.png"
    if any(word in item_id for word in ("helm", "barbute", "sallet")):
        return MASTER / "equipment" / "helm.png"
    if any(word in item_id for word in ("hood", "cowl")):
        return MASTER / "equipment" / "hood.png"
    if any(word in item_id for word in ("cuirass", "brigandine", "armor", "hauberk")):
        if "leather" in item_id or "brigandine" in item_id:
            return MASTER / "equipment" / "leather-cuirass.png"
        if "chainmail" in item_id:
            return MASTER / "equipment" / "chainmail.png"
        return MASTER / "equipment" / "plate-cuirass.png"
    if any(word in item_id for word in ("shoulder", "pauldron", "mantle")):
        return MASTER / "equipment" / ("leather-shoulders.png" if "leather" in item_id else "plate-shoulders.png")
    if any(word in item_id for word in ("gauntlet", "gloves", "vambrace")):
        return MASTER / "equipment" / "gauntlets.png"
    if any(word in item_id for word in ("legging", "legs", "pants", "greaves")):
        return MASTER / "equipment" / ("leather-legs.png" if "leather" in item_id or "studded" in item_id else "greaves.png")
    if any(word in item_id for word in ("boots", "sabatons")):
        return MASTER / "equipment" / ("boots-transparent-002.png" if "leather" in item_id or "mud" in item_id else "sabatons.png")
    if any(word in item_id for word in ("cloak", "cape")):
        return MASTER / "equipment" / "cloak.png"
    if any(word in item_id for word in ("belt", "buckle")):
        return MASTER / "equipment" / "belt.png"
    if any(word in item_id for word in ("pouch", "satchel")):
        name = "large-backpack.png" if "large" in item_id else "equipment-satchel.png" if "satchel" in item_id else "small-pouch.png"
        return MASTER / "packs" / name
    if "ring" in item_id:
        name = "ancient-ring.png" if "ancient" in item_id else "signet-ring.png" if "signet" in item_id else "black-ring.png" if "black" in item_id else "plain-ring.png"
        return MASTER / "rings" / name
    if any(word in item_id for word in ("amulet", "pendant", "necklace", "talisman", "medallion", "charm", "gorget")):
        return MASTER / "equipment" / "amulet.png"
    return MASTER / "equipment" / "plate-cuirass.png"


def rebuild(source: Path, destination: Path, item_id: str) -> None:
    with Image.open(source).convert("RGBA") as original:
        bbox = original.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"master has empty alpha: {source}")
        icon = original.crop(bbox)

    seed = int(hashlib.sha256(item_id.encode()).hexdigest()[:8], 16)
    # Small controlled differences keep related tiers visually coherent without cloning files.
    angle = ((seed % 9) - 4) * 0.7
    if seed & 1:
        icon = ImageOps.mirror(icon)
    icon = icon.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    alpha = icon.getchannel("A")
    rgb = icon.convert("RGB")
    # Preserve the locked source palette. Distinct items must come from distinct drawings,
    # never hue shifts or material recoloring.
    icon = rgb.convert("RGBA")
    icon.putalpha(alpha)
    icon.thumbnail((224, 224), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    canvas.alpha_composite(icon, ((256 - icon.width) // 2, (256 - icon.height) // 2))
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".repair.png")
    canvas.save(temporary, optimize=True)
    for attempt in range(8):
        try:
            os.replace(temporary, destination)
            break
        except OSError:
            if attempt == 7:
                raise
            time.sleep(0.08 * (attempt + 1))


def contact_sheet(group: str, item_ids: list[str]) -> None:
    cols, tile, label_h = 8, 128, 30
    rows = (len(item_ids) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tile, rows * (tile + label_h)), (15, 13, 12))
    draw = ImageDraw.Draw(sheet)
    for index, item_id in enumerate(item_ids):
        x = (index % cols) * tile
        y = (index // cols) * (tile + label_h)
        with Image.open(ICON_ROOT / group / f"{item_id}.png").convert("RGBA") as icon:
            preview = icon.resize((112, 112), Image.Resampling.LANCZOS)
            sheet.paste(preview, (x + 8, y + 8), preview)
        label = item_id if len(item_id) <= 19 else item_id[:18] + "…"
        draw.text((x + 5, y + tile + 7), label, fill=(220, 207, 184))
    output = ROOT / "screenshots" / f"item-icons-{group}.jpg"
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=90, optimize=True)


def main() -> None:
    text = DATA.read_text(encoding="utf-8")
    weapon_ids = ids_from_block(
        text,
        "export const WEAPONS: Record<string, WeaponDef> = {",
        "export function weaponIcon",
        r'^\s*(?:"([^"]+)"|([a-z][a-z0-9-]*)):\s*wpn\(',
    )
    equipment_ids = ids_from_block(
        text,
        "export const EQUIPMENT: Record<string, EquipmentDef> = {",
        "/** Whether a class",
        r'^\s*(?:"([^"]+)"|([a-z][a-z0-9-]*)):\s*\{',
    )

    repaired: list[str] = []
    for group, item_ids, chooser in (
        ("weapons", weapon_ids, weapon_master),
        ("equipment", equipment_ids, equipment_master),
    ):
        for item_id in item_ids:
            target = ICON_ROOT / group / f"{item_id}.png"
            key = f"{group}/{item_id}"
            if healthy(target) and key not in REMAKE:
                continue
            source = chooser(item_id)
            if not healthy(source):
                raise RuntimeError(f"invalid master for {item_id}: {source}")
            rebuild(source, target, item_id)
            repaired.append(f"{group}/{item_id}.png")

    failures = [
        f"{group}/{item_id}.png"
        for group, item_ids in (("weapons", weapon_ids), ("equipment", equipment_ids))
        for item_id in item_ids
        if not healthy(ICON_ROOT / group / f"{item_id}.png")
    ]
    if failures:
        raise RuntimeError("still invalid: " + ", ".join(failures))
    hashes: dict[str, str] = {}
    duplicates: list[str] = []
    for group, item_ids in (("weapons", weapon_ids), ("equipment", equipment_ids)):
        for item_id in item_ids:
            path = ICON_ROOT / group / f"{item_id}.png"
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest in hashes:
                duplicates.append(f"{hashes[digest]} == {group}/{item_id}.png")
            hashes[digest] = f"{group}/{item_id}.png"
    if duplicates:
        raise RuntimeError("duplicate icons: " + ", ".join(duplicates))
    contact_sheet("weapons", weapon_ids)
    contact_sheet("equipment", equipment_ids)
    print(f"repaired={len(repaired)} weapons={len(weapon_ids)} equipment={len(equipment_ids)}")
    for path in repaired:
        print(path)


if __name__ == "__main__":
    main()
