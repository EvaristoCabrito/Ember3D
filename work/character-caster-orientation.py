from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8');s=s.replace('      const visualUpOffset = (engine.tacticsCamera ? 0 : v.lift) - v.bob - centerYLocal;','''      const transparentFootPadding = (1 - (base?.v ?? 1)) * v.h * v.scaleY * this.cameraSpriteScale;
      const visualUpOffset = (engine.tacticsCamera ? -transparentFootPadding : v.lift) - v.bob - centerYLocal;''');s=s.replace('      entry.shadowMesh.rotation.set(Math.PI / 2, 0, THREE.MathUtils.degToRad(this.engine.cameraTiltSide));','''      // Euler XYZ rotates the card's horizontal axis into Z when yaw is nonzero,
      // lifting one boot (especially Aldric's off-center stance). Yaw around world Z
      // after standing the card upright, so the entire foot row remains level.
      entry.shadowMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(this.engine.cameraTiltSide))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      entry.shadowMesh.userData.baseQuat = entry.shadowMesh.quaternion.clone();''');s=s.replace('      entry.shadowMesh.position.set(anchor.worldX + v.sway, -(anchor.worldY + v.footY), casterCenter + (engine.tacticsCamera ? groundLift : 0));','''      const flatFootOffset = (v.footOffset - (1 - footRow) * v.h) * v.scaleY * this.cameraSpriteScale;
      entry.shadowMesh.position.set(anchor.worldX + v.sway, -(anchor.worldY + v.footY + (engine.tacticsCamera ? 0 : flatFootOffset)), casterCenter + (engine.tacticsCamera ? groundLift : 0));''');p.write_text(s,encoding='utf-8')
