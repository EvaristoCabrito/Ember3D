# Seamless ground on Ember's hex board

Handoff for future sessions and other AI assistants. The user likes this approach and wants it reused for continuous ground materials. Preserve existing artwork, saved-map indices and FX; append new variants.

## Core idea

Treat the board as one continuous material surface. Each hex reveals a clipped portion of that surface. Do not restart the entire square image at the center of every hex: that makes every hex repeat the same features and creates mismatched edges.

This implementation combines board-aligned sampling, mirrored texture repeats and the existing pointy-top hex clip. The source PNG remains unchanged.

## Implementation

- `src/game/hexGround.ts`: `drawHexGround` implements the material mapping.
- `src/game/engine.ts`: ground rendering clips to the hex, then calls the helper for variants accepted by `isHexGroundVariant`.
- `src/game/assets.ts`: `tileVariantName`, `TILE_VARIANT_COUNT`, `HEX_GROUND_001` and `isHexGroundVariant` register assets and opt them into continuous rendering.
- `src/game/GameApp.tsx`: `VARIANT_LABEL` names variants in the editor. Icelands uses the `snow` terrain; City uses selected `plains` indices.

For a hex with screen center `(cx, cy)`, compute board coordinates by removing the camera/layout offset:

```ts
const worldX = cx - layout.ox;
const worldY = cy - layout.oy;
// Caller has already saved the context and clipped it to the hex.
drawHexGround(ctx, image, cx, cy, worldX, worldY, radius);
```

The helper translates by `(cx - worldX, cy - worldY)` so its draws use board coordinates. Adjacent hexes therefore sample exactly the same material at their shared boundary. Camera panning moves the image and hex together, rather than sliding the material under the board.

The repeat size is `period = radius * 8`. One source square spans four hex diameters. The initial `radius * 2` experiment looked too small and produced obvious repeated, kaleidoscopic patterns. Keep the larger scale as the baseline; inspect feature size against the actual human sprites when changing it.

For each repeat intersecting the hex bounding box:

```ts
const flipX = Math.abs(x % 2) === 1;
const flipY = Math.abs(y % 2) === 1;
ctx.translate((x + Number(flipX)) * period, (y + Number(flipY)) * period);
ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
ctx.drawImage(image, 0, 0, period, period);
```

Alternating horizontal and vertical reflection makes neighboring repeats meet at the same source-image edge. This avoids a hard color jump even if the generated source is imperfectly tileable. Use the absolute parity expression above to handle negative board coordinates too. The caller and each repeat use balanced `save`/`restore` calls.

## Geometry and artwork

The pointy-top regular hex uses vertices at angles `60*i - 30` degrees. Its width is `sqrt(3) * radius`, height is `2 * radius`, and row spacing is `1.5 * radius`. Use the engine's existing path; do not bake a hex silhouette into the artwork.

Generate an opaque square, full-bleed ground material with a strictly vertical orthographic view, subdued colors, soft even diffuse lighting and uniform feature density. Avoid borders, bevels, transparent margins, raised dioramas, vignettes, baked edge shadows and large focal objects. Request matching opposite edges as an additional aid. Keep ground contrast restrained so characters remain readable.

Prompt sets are saved beside the assets in `public/game/tiles/hex-ground-001-*-prompts.md`, with the original ten prompts in `hex-ground-001-prompts.md`. Narrow wood boards were requested at about 12–17 cm wide and 60–100 cm long over an approximately 8 m source square; inspect the rendered result against a human sprite instead of trusting prompt dimensions alone.

## Limits and exceptions

- Continuity applies to neighboring cells using the same image and mapping scale. Different materials still have a visible terrain boundary; this technique does not blend grass into snow or water.
- Mirroring removes hard boundary jumps but can reveal symmetry or a change in feature direction. It is not proof that the raw PNG seamlessly tiles with ordinary unmirrored repetition in another engine.
- Do not independently rotate continuous terrain cells: their image coordinates would disagree at the boundary. Existing continuous variants ignore per-cell rotation.
- Coluna is a centered per-cell object, so it retains the original image placement and rotation. Centered props belong in separate object/decor layers when possible.
- Existing water and other FX can cover terrain art; preserve those systems and their settings.
- Icelands variants retain the existing `snow` terrain rules, including the variant without visible snow. Appearance does not create a new gameplay terrain type.

## Adding a variant

1. Save a uniquely named PNG under `public/game/tiles`; preserve the generated original and all prior assets.
2. Append a terrain variant index and increase its `TILE_VARIANT_COUNT`. Never insert or reorder old indices.
3. Register the filename in `tileVariantName` and opt the index into `isHexGroundVariant`. Do not overwrite an existing registration to add a second image for the same terrain.
4. Append the editor label and verify the correct section exposes it. City has a separate index filter; Icelands uses snow variants.
5. Add the image to `public/hex-ground-001-preview.html` and inspect neighboring hexes with grid lines both on and off. Its shared WebGL renderer is copied into display canvases to avoid browser context limits.
6. Save the exact prompt and mapping in a companion Markdown file.

## Verification

With the local Vite server running, execute:

```sh
node scripts/qa-hex-ground-001.mjs
```

The script renders a synthetic gradient through the actual WebGL renderer, compares a hex-clipped board to an independently drawn continuous surface, and checks camera panning. It requires zero transparent gaps and at most two levels of pixel difference. The current checks returned `{ gaps: 0, maxDifference: 0, panDifference: 0 }`.

It also loads the asset preview and writes `screenshots/hex-ground-001-board.png` and `screenshots/hex-ground-001-seam-check.png`. Pixel continuity alone does not establish visual quality: inspect feature scale, symmetry, character readability and material boundaries manually.

## Copyable handoff instruction

Use Ember's existing board-aligned mirrored ground mapping in `src/game/hexGround.ts`. Generate full-bleed opaque top-down materials, append variant indices without replacing assets, register them in `tileVariantName` and `isHexGroundVariant`, and add editor labels in the appropriate section. Keep `period = radius * 8` as the starting scale, preserve camera anchoring and hex clipping, and do not rotate individual continuous cells. Check the actual WebGL preview with neighboring hexes and human sprites, run `scripts/qa-hex-ground-001.mjs`, and preserve existing FX. Read this document for limitations before claiming the raw image itself is tileable.
