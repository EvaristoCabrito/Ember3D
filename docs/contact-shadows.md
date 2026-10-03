# Ground contact shadows

The player option `contactShadows` now selects a tighter ground-only shadow-depth comparison in GroundAO.patch. It uses the full directional/point shadow map, preserving caster geometry, alpha silhouettes and the selected sharp/soft filtering. Light bias and model-surface bias remain unchanged.

The original normalized directional bias (-0.0015 across a ~4390-unit depth range) represents several world units at the receiver. The contact comparison limits this to -0.00005. Decoration ellipse decals remain hidden. Tactical characters use a separate automatically generated foot mask.

The option requires real cast shadows. It corrects a receiver depth gap; it does not reposition a misplaced model or repair holes in authored caster geometry/textures.

Verification: `scripts/qa-contact-shadows.mjs` measures a continuous contact band, solid caster interior, clear surrounding ground, raised receivers and an opposite light direction. It compiles both Basic and PCF modes, including point shadows, and captures the actual Blender chair and grey rock assets. `scripts/qa-renderer-presets.mjs` exercises the option in the real map preview in both camera modes. TypeScript passes.

## Character sprites

ThreeBattleRenderer now anchors each sprite frame's measured opaque foot row rather than its padded image edge. World-Z yaw is applied after standing the caster upright; the old Euler XYZ order tilted that row, especially for Aldric's asymmetric stance. Sun/moon silhouette rotation pivots around the opaque foot anchor. Tactical artwork compensates for padding below the boots so the visual feet also touch the landscape.

The tactical contact mask derives its silhouette from the bottom eight percent of each sprite frame and extends opaque columns beneath the feet, preserving empty columns between legs. It projects along the camera onto the landscape. Its shader suppresses contact darkening where the active directional light already casts a shadow, preventing a darker overlap seam. Masks and shadow support textures are cached per loaded frame and disposed with the renderer; no per-character setup or Blender asset changes are needed.

`scripts/qa-character-shadows.mjs` uses Aldric, Kael and Neera's actual sprites and BattleEngine/ThreeBattleRenderer. It checks the two ends of each opaque foot band over camera rotations, 30 movement frames, moonlight and raised terrain. This verifies the character path separately from prop fixtures.
