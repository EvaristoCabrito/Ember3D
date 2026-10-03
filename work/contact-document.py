from pathlib import Path
p=Path('docs/contact-shadows.md');p.write_text('''# Ground contact shadows

The player option `contactShadows` now selects a tighter ground-only shadow-depth comparison in GroundAO.patch. It uses the full directional/point shadow map, preserving caster geometry, alpha silhouettes and the selected sharp/soft filtering. Light bias and model-surface bias remain unchanged.

The original normalized directional bias (-0.0015 across a ~4390-unit depth range) represents several world units at the receiver. The contact comparison limits this to -0.00005. This closes the ground gap without clipped projected triangles, ellipse decals, extra shadow-map renders or stencil targets. The old decal groups are hidden in both Three views.

The option requires real cast shadows. It corrects a receiver depth gap; it does not reposition a misplaced model or repair holes in authored caster geometry/textures.

Verification: `scripts/qa-contact-shadows.mjs` measures a continuous contact band, solid caster interior, clear surrounding ground, raised receivers and an opposite light direction. It compiles both Basic and PCF modes, including point shadows, and captures the actual Blender chair and grey rock assets. `scripts/qa-renderer-presets.mjs` exercises the option in the real map preview in both camera modes. TypeScript passes.
''',encoding='utf-8')
p=Path('src/game/OptionsMenu.tsx');s=p.read_text(encoding='utf-8').replace('checked={gfx[key]} onChange=', "checked={gfx[key]} disabled={key === 'contactShadows' && !gfx.realShadows} onChange=");p.write_text(s,encoding='utf-8')
