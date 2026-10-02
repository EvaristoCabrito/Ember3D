import * as THREE from "three";

const SQRT3 = Math.sqrt(3);
const PAD = 2.4;
const STEP = 0.1;
export type WaterPatch = { x: number; y: number; level: number; size: number; shape: "round" | "square" };
type WaterFootprint = { size: number; shape: "round" | "square" } | null;

/** Rounded overlapping brush footprints sampled on a rectangular mesh, independent of tile art. */
export function sampleWater(x: number, y: number, cols: number, rows: number, levels: readonly (number | null)[], footprints: readonly WaterFootprint[] = []): { coverage: number; level: number } {
  const row0 = Math.round((y - PAD - 1) / 1.5);
  let coverage = 0, weighted = 0, total = 0;
  for (let row = row0 - 1; row <= row0 + 1; row++) {
    if (row < 0 || row >= rows) continue;
    const col0 = Math.round(x / SQRT3 - 0.5 * (row & 1) - 0.5);
    for (let col = col0 - 1; col <= col0 + 1; col++) {
      if (col < 0 || col >= cols) continue;
      const level = levels[row * cols + col];
      if (level == null || !Number.isFinite(level)) continue;
      const cx = SQRT3 * (col + 0.5 * (row & 1) + 0.5), cy = PAD + 1.5 * row + 1;
      const footprint = footprints[row * cols + col];
      const size = Math.max(0.25, Math.min(1, footprint?.size ?? 1));
      const distance = (footprint?.shape === "square" ? Math.max(Math.abs(x - cx), Math.abs(y - cy)) : Math.hypot(x - cx, y - cy)) / size;
      // Keep the level defined beyond the visible edge so boundary triangles stay flat.
      const weight = Math.max(0, 1 - distance / 2);
      if (!weight) continue;
      coverage = Math.max(coverage, Math.min(1, (1.25 - distance) / 0.2));
      weighted += Math.max(0, Math.min(12, level)) * weight;
      total += weight;
    }
  }
  return { coverage: Math.max(0, coverage), level: total ? weighted / total : 0 };
}

export function sampleWaterPatches(x: number, y: number, patches: readonly WaterPatch[]): { coverage: number; level: number } {
  let coverage = 0, weighted = 0, total = 0;
  for (const patch of patches) {
    if (![patch.x, patch.y, patch.level, patch.size].every(Number.isFinite)) continue;
    const size = Math.max(0.25, Math.min(1, patch.size));
    const distance = (patch.shape === "square" ? Math.max(Math.abs(x-patch.x), Math.abs(y-patch.y)) : Math.hypot(x-patch.x,y-patch.y)) / size;
    const weight = Math.max(0, 1-distance/2);
    coverage = Math.max(coverage, Math.min(1, Math.max(0, (1.25-distance)/0.2)));
    weighted += Math.max(0, Math.min(12, patch.level))*weight; total += weight;
  }
  return { coverage, level: total ? weighted/total : 0 };
}

export class ThreeWater {
  readonly time = { value: 0 };
  readonly flat = { value: 0 };
  private scale = { value: 1 };
  private material = new THREE.MeshStandardMaterial({ color: 0x278d9e, roughness: 0.6, metalness: 0,
    transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);

  constructor() {
    this.mesh.receiveShadow = true;
    this.material.onBeforeCompile = shader => {
      shader.uniforms.waterTime = this.time;
      shader.uniforms.waterScale = this.scale;
      shader.uniforms.waterFlat = this.flat;
      shader.vertexShader = `uniform float waterTime; uniform float waterScale; uniform float waterFlat;
        attribute float coverage; attribute float waterDepth;
        varying float vWaterCoverage; varying float vWaterDepth; varying vec2 vWaterPoint;
        ${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `
        vec2 p = position.xy / waterScale;
        float phaseA = dot(p, vec2(2.2, 1.5)) + waterTime * 1.4;
        float phaseB = dot(p, vec2(-1.2, 3.1)) - waterTime * 0.9;
        vec2 slope = 0.014 * cos(phaseA) * vec2(2.2, 1.5) + 0.009 * cos(phaseB) * vec2(-1.2, 3.1);
        slope += 0.08 * cos(dot(p, vec2(8.0, 5.0)) + waterTime * 1.8) * vec2(0.8, 0.5);
        vec3 objectNormal = normalize(vec3(-slope, 1.0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`);
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        vec3 transformed = vec3(position);
        transformed.z += waterScale * (0.014 * sin(phaseA) + 0.009 * sin(phaseB));
        transformed.z = mix(transformed.z, 0.8, waterFlat);
        vWaterCoverage = coverage; vWaterDepth = waterDepth; vWaterPoint = p;`);
      shader.fragmentShader = `varying float vWaterCoverage; varying float vWaterDepth; varying vec2 vWaterPoint;
        uniform float waterTime;
        float waterHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float waterNoise(vec2 p) {
          vec2 cell = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(waterHash(cell), waterHash(cell + vec2(1.0, 0.0)), u.x),
            mix(waterHash(cell + vec2(0.0, 1.0)), waterHash(cell + vec2(1.0, 1.0)), u.x), u.y);
        }
        float waterCloud(vec2 p) {
          return waterNoise(p) * 0.57 + waterNoise(p * 2.03 + 13.4) * 0.29
            + waterNoise(p * 4.11 + 7.2) * 0.14;
        }
        ${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `
        #include <color_fragment>
        if (vWaterCoverage < 0.05) discard;
        // World-space texture joins across every brush and stays fixed while the camera moves.
        vec2 drift = vec2(waterTime * 0.055, -waterTime * 0.035);
        float cloud = waterCloud(vWaterPoint * 2.2 + drift);
        float detail = waterNoise(vWaterPoint * 8.0 - drift * 1.7);
        vec2 warp = vec2(cloud, waterCloud(vWaterPoint * 2.2 + drift + 29.0));
        float phase = dot(vWaterPoint, vec2(12.0, 5.0)) + warp.x * 7.0 + waterTime * 0.7;
        float wave = 0.5 + 0.5 * sin(phase);
        float aa = max(fwidth(wave), 0.04);
        float crest = smoothstep(0.76 - aa, 0.96 + aa, wave);
        float broken = smoothstep(0.35, 0.7, waterCloud(vWaterPoint * 3.7 - drift + 51.0));
        float crossWave = sin(dot(vWaterPoint, vec2(-6.0, 15.0)) + warp.y * 5.0 - waterTime * 0.5);
        diffuseColor.rgb *= 0.74 + 0.4 * cloud + 0.08 * detail;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.48, 0.49), crest * broken * 0.24);
        diffuseColor.rgb += vec3(0.018, 0.027, 0.025) * max(0.0, crossWave) * broken;
        float shore = 1.0 - smoothstep(0.015, 0.16, vWaterDepth);
        float foam = shore * (0.035 + 0.09 * crest * broken);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.53, 0.67, 0.62), foam);
        diffuseColor.a *= smoothstep(0.05, 0.55, vWaterCoverage);`);
      // Keep water in the game's muted palette even under strong sun and full-scene bloom.
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        float waterPeak = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
        outgoingLight *= 0.7 / (0.7 + waterPeak);
        #include <opaque_fragment>`);
    };
  }

  rebuild(cols: number, rows: number, tile: number, levels: readonly (number | null)[], allowed: (col: number, row: number) => boolean,
    ground: (x: number, y: number) => number = () => 0, footprints: readonly WaterFootprint[] = [], patches: readonly WaterPatch[] = []): void {
    this.scale.value = tile;
    if (!patches.length && !levels.some(level => level != null && Number.isFinite(level))) {
      this.mesh.geometry.dispose(); this.mesh.geometry = new THREE.BufferGeometry();
      return;
    }
    const positions: number[] = [], coverage: number[] = [], depths: number[] = [], indices: number[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const level = levels[row * cols + col];
      if (level == null || !Number.isFinite(level) || !allowed(col, row)) continue;
      const x = SQRT3 * (col + 0.5 * (row & 1) + 0.5), y = PAD + 1.5 * row + 1;
      minX = Math.min(minX, x - 1.4); maxX = Math.max(maxX, x + 1.4);
      minY = Math.min(minY, y - 1.4); maxY = Math.max(maxY, y + 1.4);
    }
    const buckets = new Map<string, WaterPatch[]>();
    for (const patch of patches) {
      if (![patch.x, patch.y, patch.level, patch.size].every(Number.isFinite)) continue;
      minX = Math.min(minX, patch.x-1.4); maxX = Math.max(maxX, patch.x+1.4);
      minY = Math.min(minY, patch.y-1.4); maxY = Math.max(maxY, patch.y+1.4);
      const key = Math.floor(patch.x/2) + ":" + Math.floor(patch.y/2);
      const list = buckets.get(key) ?? []; list.push(patch); buckets.set(key, list);
    }
    if (!Number.isFinite(minX)) { this.mesh.geometry.dispose(); this.mesh.geometry = new THREE.BufferGeometry(); return; }
    const nx = Math.ceil((maxX - minX) / STEP), ny = Math.ceil((maxY - minY) / STEP);
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const x = minX + ix * STEP, y = minY + iy * STEP;
      const sample = sampleWater(x, y, cols, rows, levels, footprints);
      const nearby: WaterPatch[] = [];
      const bx = Math.floor(x/2), by = Math.floor(y/2);
      for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) nearby.push(...(buckets.get((bx+dx)+":"+(by+dy)) ?? []));
      const free = sampleWaterPatches(x, y, nearby);
      if (free.coverage > sample.coverage) { sample.coverage = free.coverage; sample.level = free.level; }
      let best = Infinity, bc = -1, br = -1;
      const row0 = Math.round((y - PAD - 1) / 1.5);
      for (let row = row0 - 1; row <= row0 + 1; row++) {
        const col0 = Math.round(x / SQRT3 - 0.5 * (row & 1) - 0.5);
        for (let col = col0 - 1; col <= col0 + 1; col++) {
          const distance = (x - SQRT3 * (col + 0.5 * (row & 1) + 0.5)) ** 2 + (y - PAD - 1.5 * row - 1) ** 2;
          if (distance < best) { best = distance; bc = col; br = row; }
        }
      }
      const valid = bc >= 0 && br >= 0 && bc < cols && br < rows && allowed(bc, br);
      const z = (sample.level * 0.65 + 0.035) * tile;
      positions.push(x * tile, -y * tile, z);
      coverage.push(valid ? sample.coverage : 0);
      depths.push(Math.max(0, (z - ground(x * tile, -y * tile)) / tile));
    }
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const a = iy * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      if (coverage[a]! + coverage[b]! + coverage[c]! + coverage[d]! > 0) indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("coverage", new THREE.Float32BufferAttribute(coverage, 1));
    geometry.setAttribute("waterDepth", new THREE.Float32BufferAttribute(depths, 1));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    if (geometry.boundingSphere) geometry.boundingSphere.radius += tile * 0.03;
    this.mesh.geometry.dispose(); this.mesh.geometry = geometry;
  }

  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.material.dispose(); }
}
