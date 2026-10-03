from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8');s=s.replace('      m.quaternion.copy(m.userData.baseQuat as THREE.Quaternion).premultiply(spin);','''      m.quaternion.copy(m.userData.baseQuat as THREE.Quaternion).premultiply(spin);
      // Turning a silhouette towards the sun/moon must pivot about its opaque feet,
      // not the image rectangle's center (asymmetric sprites otherwise slide sideways).
      if (m.userData.contactLocal && m.userData.contactAnchor) {
        const offset = (m.userData.contactLocal as THREE.Vector3).clone().multiply(m.scale).applyQuaternion(m.quaternion);
        m.position.copy(m.userData.contactAnchor as THREE.Vector3).sub(offset);
      }''');needle='''      entry.shadowMesh.visible = true;
      // Hidden upright cylinder''';s=s.replace(needle,'''      const contactLocal = new THREE.Vector3(((base?.u0 ?? 0) + (base?.u1 ?? 1)) / 2 - 0.5, 0.5 - footRow, 0);
      entry.shadowMesh.userData.contactLocal = contactLocal;
      entry.shadowMesh.userData.contactAnchor = contactLocal.clone().multiply(entry.shadowMesh.scale)
        .applyQuaternion(entry.shadowMesh.quaternion).add(entry.shadowMesh.position);
      entry.shadowMesh.visible = true;
      // Hidden upright cylinder''');p.write_text(s,encoding='utf-8')
p=Path('scripts/qa-character-shadows.mjs');s=p.read_text(encoding='utf-8');s=s.replace(" for(const yaw of [-60,0,30,90]){e.cameraTiltSide=yaw;measure();}"," for(const yaw of [-60,0,30,90]){e.cameraTiltSide=yaw;measure();}\n r.timeOfDay='brightNight';measure();r.timeOfDay='day';");p.write_text(s,encoding='utf-8')
