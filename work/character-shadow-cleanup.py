from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8').replace('const UNIT_SHADOW_GROUND_INSET = 3;','const UNIT_SHADOW_GROUND_INSET = 3;\nconst SHADOW_UP_AXIS = new THREE.Vector3(0, 0, 1);\nconst STANDING_SHADOW_CARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);');s=s.replace('  private unitFacing = new THREE.Quaternion();','  private unitFacing = new THREE.Quaternion();\n  private shadowFootOffset = new THREE.Vector3();');s=s.replace('const offset = (m.userData.contactLocal as THREE.Vector3).clone().multiply(m.scale).applyQuaternion(m.quaternion);','const offset = this.shadowFootOffset.copy(m.userData.contactLocal as THREE.Vector3).multiply(m.scale).applyQuaternion(m.quaternion);');s=s.replace('setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(this.engine.cameraTiltSide))\n        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));\n      entry.shadowMesh.userData.baseQuat = entry.shadowMesh.quaternion.clone();','''setFromAxisAngle(SHADOW_UP_AXIS, THREE.MathUtils.degToRad(this.engine.cameraTiltSide))
        .multiply(STANDING_SHADOW_CARD);
      (entry.shadowMesh.userData.baseQuat ??= new THREE.Quaternion()).copy(entry.shadowMesh.quaternion);''');s=s.replace('''      const contactLocal = new THREE.Vector3(((base?.u0 ?? 0) + (base?.u1 ?? 1)) / 2 - 0.5, 0.5 - footRow, 0);
      entry.shadowMesh.userData.contactLocal = contactLocal;
      entry.shadowMesh.userData.contactAnchor = contactLocal.clone().multiply(entry.shadowMesh.scale)
        .applyQuaternion(entry.shadowMesh.quaternion).add(entry.shadowMesh.position);''','''      const contactLocal = (entry.shadowMesh.userData.contactLocal ??= new THREE.Vector3()) as THREE.Vector3;
      contactLocal.set(((base?.u0 ?? 0) + (base?.u1 ?? 1)) / 2 - 0.5, 0.5 - footRow, 0);
      (entry.shadowMesh.userData.contactAnchor ??= new THREE.Vector3()).copy(contactLocal).multiply(entry.shadowMesh.scale)
        .applyQuaternion(entry.shadowMesh.quaternion).add(entry.shadowMesh.position);''');p.write_text(s,encoding='utf-8')
p=Path('docs/contact-shadows.md');s=p.read_text(encoding='utf-8');s+='''
## Character sprites

ThreeBattleRenderer now anchors each sprite frame's measured opaque foot row rather than its padded image edge. World-Z yaw is applied after standing the caster upright; the old Euler XYZ order tilted that row, especially for Aldric's asymmetric stance. Sun/moon silhouette rotation pivots around the opaque foot anchor. Tactical artwork compensates for padding below the boots so the visual feet also touch the landscape.

`scripts/qa-character-shadows.mjs` uses Aldric, Kael and Neera's actual sprites and BattleEngine/ThreeBattleRenderer. It checks the two ends of each opaque foot band over camera rotations, 30 movement frames, moonlight and raised terrain. This verifies the character path separately from prop fixtures.
''';p.write_text(s,encoding='utf-8')
