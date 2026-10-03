from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8');pos=s.index('  private unitTextureFor(');s=s[:pos]+'''  private unitFootShadowTextures = new Map<HTMLImageElement, THREE.Texture>();

  /** Shadow-only foot support: extend opaque columns in the bottom foot band to
   * its lowest row. The visible sprite remains untouched; gaps between legs remain clear. */
  private unitFootShadowTexture(img: HTMLImageElement): THREE.Texture {
    const cached = this.unitFootShadowTextures.get(img);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = pixels;
    let bottom = -1;
    for (let y = height - 1; y >= 0 && bottom < 0; y--)
      for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 128) { bottom = y; break; }
    const bandTop = Math.max(0, bottom - Math.round(height * 0.12));
    for (let x = 0; x < width; x++) {
      let foot = -1;
      for (let y = bottom; y >= bandTop; y--) if (data[(y * width + x) * 4 + 3] > 128) { foot = y; break; }
      if (foot < 0) continue;
      for (let y = foot + 1; y <= bottom; y++) data[(y * width + x) * 4 + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    this.unitFootShadowTextures.set(img, texture);
    return texture;
  }

'''+s[pos:];s=s.replace('const shadowMaterial = new THREE.MeshBasicMaterial({ map: this.unitTextureFor(img),','const shadowMaterial = new THREE.MeshBasicMaterial({ map: this.unitFootShadowTexture(img),');s=s.replace('entry.shadowMaterial.map = this.unitTextureFor(img);','entry.shadowMaterial.map = this.unitFootShadowTexture(img);');s=s.replace('    for (const tex of this.unitTexCache.values()) tex.dispose();','    for (const tex of this.unitTexCache.values()) tex.dispose();\n    for (const tex of this.unitFootShadowTextures.values()) tex.dispose();\n    this.unitFootShadowTextures.clear();');p.write_text(s,encoding='utf-8')
