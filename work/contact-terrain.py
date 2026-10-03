from pathlib import Path
p=Path('src/game/gfx/three/ThreeContactShadows.ts');s=p.read_text(encoding='utf-8');s=s.replace('import * as THREE from "three";','import * as THREE from "three";\nimport type { LandscapeSurface } from "./ThreeLandscape";');s=s.replace('  private used = new Set<THREE.Mesh>();','''  private used = new Set<THREE.Mesh>();
  private surface: LandscapeSurface | null = null;
  private heightTexture: THREE.DataTexture | null = null;
  private bounds = new THREE.Vector4();
  setSurface(surface: LandscapeSurface | null): void {
    if (surface === this.surface) return;
    this.surface = surface; this.heightTexture?.dispose(); this.heightTexture = null;
    if (!surface) return;
    const size = 256, values = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      values[y * size + x] = surface.heightAt(surface.minX + x / (size - 1) * (surface.maxX - surface.minX),
        surface.minY + y / (size - 1) * (surface.maxY - surface.minY));
    this.bounds.set(surface.minX, surface.minY, surface.maxX - surface.minX, surface.maxY - surface.minY);
    this.heightTexture = new THREE.DataTexture(values, size, size, THREE.RedFormat, THREE.FloatType);
    this.heightTexture.minFilter = this.heightTexture.magFilter = THREE.NearestFilter;
    this.heightTexture.needsUpdate = true;
  }''');s=s.replace('uvTransform: { value: new THREE.Matrix3() }, alphaCutoff:', 'surfaceMap: { value: null }, hasSurface: { value: false }, surfaceBounds: { value: new THREE.Vector4() },\n          uvTransform: { value: new THREE.Matrix3() }, alphaCutoff:');s=s.replace('uniform float base; uniform vec3 lightDir; uniform mat3 uvTransform;', '''uniform float base; uniform vec3 lightDir; uniform mat3 uvTransform;
          uniform bool hasSurface; uniform sampler2D surfaceMap; uniform vec4 surfaceBounds;
          float floorAt(vec2 xy) {
            if (!hasSurface) return base;
            vec2 p = clamp((xy - surfaceBounds.xy) / surfaceBounds.zw, 0.0, 1.0) * 255.0;
            vec2 f = fract(p); vec2 cell = floor(p);
            vec2 uv = (cell + 0.5) / 256.0;
            float a = texture2D(surfaceMap, uv).r;
            float b = texture2D(surfaceMap, uv + vec2(1.0 / 256.0, 0.0)).r;
            float c = texture2D(surfaceMap, uv + vec2(0.0, 1.0 / 256.0)).r;
            float d = texture2D(surfaceMap, uv + vec2(1.0 / 256.0)).r;
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }''');s=s.replace('world.xy -= lightDir.xy * height / min(-0.08, lightDir.z);\n            world.z = base + 0.04;', '''vec2 originalXY = world.xy;
            world.xy = originalXY - lightDir.xy * height / min(-0.08, lightDir.z);
            // Refine the ray hit once for a sloped receiver instead of a floating flat decal.
            float floorZ = floorAt(world.xy);
            world.xy = originalXY - lightDir.xy * max(0.0, world.z - floorZ) / min(-0.08, lightDir.z);
            world.z = floorAt(world.xy) + 0.04;''');s=s.replace('    u.base.value = ground;', '    u.surfaceMap.value = this.heightTexture; u.hasSurface.value = !!this.heightTexture; u.surfaceBounds.value.copy(this.bounds);\n    u.base.value = ground;');s=s.replace('  dispose(): void { for','  dispose(): void { this.heightTexture?.dispose(); for');p.write_text(s,encoding='utf-8')
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8').replace('    this.projectedContacts.begin(enabled);','    this.projectedContacts.setSurface(this.engine.tacticsCamera ? this.landscape : null);\n    this.projectedContacts.begin(enabled);');p.write_text(s,encoding='utf-8')
