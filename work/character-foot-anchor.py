from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8');old='''      entry.shadowMesh.scale.set(v.scaleX * v.w * this.cameraSpriteScale, elevation + UNIT_SHADOW_GROUND_INSET, 1);
      entry.shadowMesh.position.set(anchor.worldX + v.sway, -(anchor.worldY + v.footY), elevation / 2 - UNIT_SHADOW_GROUND_INSET / 2 + (engine.tacticsCamera ? groundLift : 0));''';new='''      // Sprite frames contain transparent padding below their actual feet. Anchor the
      // opaque foot row, not the bottom of the image rectangle, to the receiver.
      const footRow = Math.max(0.1, base?.v ?? 1);
      const casterHeight = (elevation + UNIT_SHADOW_GROUND_INSET) / footRow;
      const casterCenter = (footRow - 0.5) * casterHeight - UNIT_SHADOW_GROUND_INSET;
      entry.shadowMesh.scale.set(v.scaleX * v.w * this.cameraSpriteScale, casterHeight, 1);
      entry.shadowMesh.position.set(anchor.worldX + v.sway, -(anchor.worldY + v.footY), casterCenter + (engine.tacticsCamera ? groundLift : 0));''';assert old in s;s=s.replace(old,new).replace('          groundLift + elevation / 2 - UNIT_SHADOW_GROUND_INSET / 2);','          groundLift + casterCenter);');p.write_text(s,encoding='utf-8')
