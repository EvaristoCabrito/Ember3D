from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8');pos=s.index('  private unitFootShadowTextures');s=s[:pos]+'''  private unitContactMasks = new Map<HTMLImageElement, { texture: THREE.Texture; top: number; bottom: number }>();
  private unitContactMask(img: HTMLImageElement): { texture: THREE.Texture; top: number; bottom: number } {
    const cached = this.unitContactMasks.get(img);
    if (cached) return cached;
    const width = img.naturalWidth, height = img.naturalHeight;
    const bottom = Math.min(height, Math.ceil((artBase(img)?.v ?? 1) * height) + 3);
    const top = Math.max(0, bottom - Math.ceil(height * 0.08));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = bottom - top;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, top, width, bottom - top, 0, 0, width, bottom - top);
    const pixels = ctx.getImageData(0, 0, width, bottom - top), original = pixels.data.slice();
    // A two-pixel support edge, derived solely from opaque boot pixels, joins the
    // cast silhouette. No ellipse and no blur; transparent gaps stay transparent.
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let alpha = original[i + 3];
      for (let dy = 1; dy <= 3 && y - dy >= 0; dy++) alpha = Math.max(alpha, original[((y - dy) * width + x) * 4 + 3]);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = alpha > 128 ? 255 : 0;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas); texture.minFilter = texture.magFilter = THREE.LinearFilter;
    const result = { texture, top: top / height, bottom: bottom / height };
    this.unitContactMasks.set(img, result); return result;
  }

'''+s[pos:];needle='''      entry.contactMesh.visible = liftFade > 0;''';s=s.replace(needle,'''      entry.contactMesh.visible = liftFade > 0;
      if (engine.tacticsCamera) {
        const contact = this.unitContactMask(img);
        if (entry.contactMaterial.map !== contact.texture) {
          entry.contactMaterial.map = contact.texture; entry.contactMaterial.needsUpdate = true;
        }
        // Project the actual visible boot band onto the receiver along the camera
        // ray. Its screen position therefore meets the painted boots exactly.
        const bandCenter = (0.5 - (contact.top + contact.bottom) / 2) * entry.mesh.scale.y;
        const center = entry.contactMesh.position.copy(entry.mesh.position).addScaledVector(this.unitUp, bandCenter);
        const floor = this.landscape?.heightAt(center.x, center.y) ?? groundLift;
        center.addScaledVector(this.cameraBack, -(center.z - floor) / Math.max(0.1, this.cameraBack.z));
        center.z = (this.landscape?.heightAt(center.x, center.y) ?? floor) + CONTACT_SHADOW_Z;
        const projectedUp = this.unitUp.clone().addScaledVector(this.cameraBack, -this.unitUp.z / Math.max(0.1, this.cameraBack.z));
        const heightScale = projectedUp.length(); projectedUp.normalize();
        entry.contactMesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.cameraRight, projectedUp, SHADOW_UP_AXIS));
        entry.contactMesh.scale.set(entry.mesh.scale.x, entry.mesh.scale.y * (contact.bottom - contact.top) * heightScale, 1);
        entry.contactMaterial.opacity = 0.5 * u.fade;
        entry.contactMaterial.alphaTest = 0.1;
        entry.contactMesh.visible = getDevGfx().contactShadows && getDevGfx().realShadows;
      }''');s=s.replace('    this.contactShadowGroup.visible = false;','    this.contactShadowGroup.visible = this.engine.tacticsCamera && gfx.contactShadows && gfx.realShadows;');s=s.replace('    this.unitFootShadowTextures.clear();','    this.unitFootShadowTextures.clear();\n    for (const mask of this.unitContactMasks.values()) mask.texture.dispose();\n    this.unitContactMasks.clear();');p.write_text(s,encoding='utf-8')
