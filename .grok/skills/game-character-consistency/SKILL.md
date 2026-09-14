---
name: game-character-consistency
description: >
  Deep guide for CHARACTER IDENTITY across images: turnarounds (front/side/
  back), state and damage variants, palette swaps, equipment changes, and
  same-character-in-context sets. Use whenever generating character
  turnarounds, character sheets, variants of an existing sprite, or any
  same-subject multi-image set. Complements game-asset-core.
metadata:
  short-description: "Same character, every image"
user-invocable: false
---

# Character Consistency

The product is the IDENTITY, not any single image.
Users state WHAT they need, not how — apply everything here even when
the request never mentions it.


## 1. Asymmetry bookkeeping (turnarounds)

Before prompting, write the side-map table for every view. Example: "her
left arm sleeved" →

| view  | sleeved arm appears on | staff hand appears on |
|-------|------------------------|----------------------|
| front | viewer's RIGHT         | (as designed)        |
| right profile | near side = her right = BARE | ...          |
| back  | viewer's LEFT          | mirrored from front  |

Prompt each view with VIEWER-relative words from this table, never
body-relative words. Verify each output against the table, not the original
sentence.

## 2. Hands and props

- A held item must be GRIPPED: check the hand-object contact point in every
  image. A staff floating beside an open hand = fail.
- The item stays in the SAME hand across all views/frames (mirror it
  correctly in back views).

## 3. Edit-chain protocol

- One base image; every view/variant/state via `imagine_image_to_image` with the base
  `file_path` (or the nearest neighbor view): "Keep this exact character — same
  face, colors, proportions, outfit, scale, background — change only <X>."
- Views must be genuinely rotated (a side view is a strict profile: nose,
  chest, toes all pointing at the frame edge), not three slightly-turned
  fronts.
- KEEP THE STYLE WORDS in every edit prompt ("stylized 2D game art, cel
  shading" or whatever the set uses). Edits without style words drift
  toward photorealism.

## 4. Variants (damage / palette / equipment)

- State the freeze-list first in the prompt (pose, framing, background,
  everything not being changed), then the single change.
- Damage states are STATES, not action frames: worn, cracked, dented — no
  debris flying mid-air.
- Verify by viewing base and variant together: background hue, framing,
  proportions, and all unrequested details must match. Escalating states
  (hurt → critical) must be strictly ordered when viewed as a set.

## 5. Verify

For every image in the set, describe blind: which side has the marker
detail, what's in each hand, face/proportion match to base. One mismatch =
targeted retry of that image only.

## 6. Master framing & roster-wide scale (multi-class rosters)

When generating a roster of distinct classes/characters meant to share one
human scale (e.g. every playable class in a game), lock these BEFORE writing
any prompt, and repeat them in every class's prompt, not just the first:

- identical human scale across every class — same head-to-boots proportional
  height, same shoulder width reference
- full body visible, boots to head, in every image
- consistent camera distance and focal perspective across classes — do not
  let a "cooler angle" creep in for one class
- consistent ground baseline (the same feet-line y-position) across classes
- generous extra canvas margin sized for the WIDEST class's equipment (a
  Lancer's spear, a caster's staff, a long bow, a flowing cloak, cast FX) —
  size the margin for the roster's most extreme silhouette, not per-class, so
  nothing crosses the image boundary and no class needs a different crop

Normalize from the BODY, never from the total ink bounding box. A bbox-fit
scale (auto-fitting cell/canvas to whatever ink is present) always includes
held weapons, staffs, bows, cloaks, and effects — so a Lancer's long spear
makes his bbox taller/wider than a sword-and-board class's, and naive
bbox-fit scaling shrinks his BODY to compensate. The body must render at the
same size as every other class regardless of what it's carrying.

In `generate2dsprite`'s processor, this means: do not let each class's
`process` run compute its own auto-fit scale independently. Process the
roster's reference/master character first (usually the plainest silhouette,
e.g. the protagonist), then read that run's `auto_fit_scale`/`scale_used`
from `pipeline-meta.json` and pass it to every other class via
`--locked-scale <value>` or `--reference-meta <path-to-master-pipeline-meta.json>`.
This applies one shared px-scale across the whole roster instead of letting
each character's own bbox (weapon included) drive its size.
