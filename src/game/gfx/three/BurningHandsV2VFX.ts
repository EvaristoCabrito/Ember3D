import * as THREE from "three";

export interface BurningHandsV2Settings {
  tongueCount: number;
  flameLength: number;
  flameWidth: number;
  turbulence: number;
  lightIntensity: number;
  lightRadius: number;
  geometry: boolean;
  particles: boolean;
  distortion: boolean;
  emissive: boolean;
  lights: boolean;
  bloom: boolean;
}

export const DEFAULT_BURNING_HANDS_V2_SETTINGS: BurningHandsV2Settings = {
  tongueCount: 12,
  flameLength: 1,
  flameWidth: 1,
  turbulence: 0.16,
  lightIntensity: 15,
  lightRadius: 5.2,
  geometry: true,
  particles: true,
  distortion: true,
  emissive: true,
  lights: true,
  bloom: true,
};

const SETTINGS_KEY = "emberash:burning-hands-v2-settings";
export function getActiveBurningHandsV2Settings(): BurningHandsV2Settings {
  if (typeof window === "undefined") return { ...DEFAULT_BURNING_HANDS_V2_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_BURNING_HANDS_V2_SETTINGS, ...JSON.parse(raw) as Partial<BurningHandsV2Settings> } : { ...DEFAULT_BURNING_HANDS_V2_SETTINGS };
  } catch { return { ...DEFAULT_BURNING_HANDS_V2_SETTINGS }; }
}
export function setActiveBurningHandsV2Settings(settings: BurningHandsV2Settings): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage may be disabled */ }
}

export interface BurningHandsV2Cast {
  id: string;
  origin: THREE.Vector3;
  direction: THREE.Vector2;
  length: number;
  width: number;
  worldScale: number;
  settings?: BurningHandsV2Settings;
  onRelease: () => void;
  onComplete: () => void;
}

const IGNITION = 0.5;
const RELEASE = 0.56;
const FINISH = 2.35;
const SEGMENTS = 18;
const SIDES = 7;

function makeFlameGeometry(count: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const along: number[] = [];
  const tongue: number[] = [];
  const indices: number[] = [];
  const frameNormal = new THREE.Vector3();
  const frameBinormal = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  for (let strand = 0; strand < count; strand++) {
    const base = positions.length / 3;
    const phase = strand * 2.399963;
    const spread = count <= 1 ? 0 : (strand / (count - 1) - 0.5) * 1.45;
    const depth = Math.sin(phase) * 0.23;
    const path: THREE.Vector3[] = [];
    for (let row = 0; row <= SEGMENTS; row++) {
      const t = row / SEGMENTS;
      const bend = Math.sin(t * 7 + phase) * 0.09 * t + Math.sin(t * 13 + phase * 2) * 0.035 * t;
      path.push(new THREE.Vector3(spread * t + bend, t * (0.88 + (strand % 4) * 0.045), depth + Math.sin(t * 10 + phase) * 0.12 * t));
    }
    for (let row = 0; row <= SEGMENTS; row++) {
      const p = path[row]!;
      tangent.subVectors(path[Math.min(SEGMENTS, row + 1)]!, path[Math.max(0, row - 1)]!).normalize();
      frameNormal.set(1, 0, 0).cross(tangent).normalize();
      if (frameNormal.lengthSq() < 0.01) frameNormal.set(0, 0, 1);
      frameBinormal.crossVectors(tangent, frameNormal).normalize();
      const t = row / SEGMENTS;
      const radius = (0.035 + 0.11 * Math.sin(Math.PI * t) ** 0.7) * (0.72 + (strand % 3) * 0.16);
      for (let side = 0; side <= SIDES; side++) {
        const angle = side / SIDES * Math.PI * 2;
        const nx = frameNormal.x * Math.cos(angle) + frameBinormal.x * Math.sin(angle);
        const ny = frameNormal.y * Math.cos(angle) + frameBinormal.y * Math.sin(angle);
        const nz = frameNormal.z * Math.cos(angle) + frameBinormal.z * Math.sin(angle);
        positions.push(p.x + nx * radius, p.y + ny * radius, p.z + nz * radius);
        normals.push(nx, ny, nz);
        along.push(t);
        tongue.push(strand / Math.max(1, count - 1));
        if (row < SEGMENTS && side < SIDES) {
          const a = base + row * (SIDES + 1) + side;
          const b = a + SIDES + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute("aTongue", new THREE.Float32BufferAttribute(tongue, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const FLAME_MATERIAL = /* glsl */ `
  attribute float aAlong;
  attribute float aTongue;
  uniform float uTime;
  uniform float uTurbulence;
  uniform float uGrowth;
  varying float vAlong;
  varying float vTongue;
  varying vec3 vNormal;
  void main() {
    vAlong = aAlong;
    vTongue = aTongue;
    vec3 p = position;
    float pulse = sin(uTime * 14.0 + aTongue * 29.0 + aAlong * 17.0);
    p.x += pulse * uTurbulence * aAlong * 0.22;
    p.z += cos(uTime * 11.0 + aTongue * 23.0 + aAlong * 15.0) * uTurbulence * aAlong;
    p *= uGrowth;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const FLAME_FRAGMENT = /* glsl */ `
  uniform float uEnergy;
  varying float vAlong;
  varying float vTongue;
  varying vec3 vNormal;
  void main() {
    vec3 ember = vec3(0.62, 0.055, 0.006);
    vec3 orange = vec3(1.0, 0.21, 0.008);
    vec3 gold = vec3(1.0, 0.68, 0.06);
    vec3 core = vec3(1.0, 0.97, 0.70);
    float edge = abs(vTongue - 0.5) * 2.0;
    vec3 color = mix(gold, orange, smoothstep(0.08, 0.82, vAlong));
    color = mix(color, ember, smoothstep(0.54, 1.0, vAlong) * 0.82);
    color = mix(color, core, (1.0 - smoothstep(0.0, 0.46, vAlong)) * (1.0 - edge) * 0.75);
    float lit = 0.72 + 0.28 * abs(dot(normalize(vNormal), normalize(vec3(0.35, 0.45, 0.82))));
    float alpha = (1.0 - smoothstep(0.82, 1.0, vAlong)) * (0.9 - edge * 0.12);
    gl_FragColor = vec4(color * lit * uEnergy, alpha);
  }
`;

/** 3D hand-origin flame fan. It owns only visual geometry and lights; combat resolves targets and damage. */
export class BurningHandsV2VFX {
  readonly group = new THREE.Group();
  private readonly flameMaterial: THREE.ShaderMaterial;
  private readonly flameMesh: THREE.Mesh;
  private readonly shimmer: THREE.Mesh;
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly sparkDummy = new THREE.Object3D();
  private readonly sparks: { phase: number; speed: number; side: number; depth: number; scale: number }[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private elapsed = 0;
  private releaseSent = false;
  private completeSent = false;
  private disposed = false;
  private settings: BurningHandsV2Settings;
  private readonly direction: THREE.Vector2;
  private length: number;
  private width: number;
  private tongueCount: number;

  get finished(): boolean { return this.disposed; }

  constructor(private readonly scene: THREE.Scene, private readonly cast: BurningHandsV2Cast) {
    this.settings = { ...DEFAULT_BURNING_HANDS_V2_SETTINGS, ...cast.settings };
    this.direction = cast.direction.clone().normalize();
    this.length = Math.max(cast.worldScale, cast.length) * this.settings.flameLength;
    this.width = Math.max(cast.worldScale * 0.7, cast.width) * this.settings.flameWidth;
    this.tongueCount = Math.max(8, Math.min(16, Math.round(this.settings.tongueCount)));
    this.group.position.copy(cast.origin);
    this.group.rotation.z = Math.atan2(this.direction.y, this.direction.x) - Math.PI / 2;
    this.group.scale.set(this.width, this.length, this.width * 0.7);

    this.flameMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTurbulence: { value: this.settings.turbulence }, uGrowth: { value: 0 }, uEnergy: { value: 1.45 } },
      vertexShader: FLAME_MATERIAL,
      fragmentShader: FLAME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.flameMesh = new THREE.Mesh(makeFlameGeometry(this.tongueCount), this.flameMaterial);
    this.flameMesh.renderOrder = 34;
    this.group.add(this.flameMesh);

    const shimmerGeometry = new THREE.SphereGeometry(0.5, 18, 12);
    const shimmerMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.13 } },
      vertexShader: `varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec3 vP; void main(){float n=sin(vP.y*21.0+uTime*8.0)*cos(vP.x*17.0-uTime*6.0); gl_FragColor=vec4(1.0,0.38,0.06,uOpacity*(0.5+0.5*n));}`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.shimmer = new THREE.Mesh(shimmerGeometry, shimmerMaterial);
    this.shimmer.scale.set(0.28, 0.92, 0.18);
    this.shimmer.position.set(0, 0.53, 0.02);
    this.group.add(this.shimmer);

    const sparkGeometry = new THREE.TetrahedronGeometry(0.5, 0);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffb02e, toneMapped: false });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, 48);
    this.sparkMesh.count = 32;
    this.group.add(this.sparkMesh);
    for (let i = 0; i < 32; i++) this.sparks.push({ phase: i / 32, speed: 0.4 + (i % 7) * 0.08, side: Math.sin(i * 12.989) * 0.34, depth: Math.cos(i * 4.123) * 0.24, scale: 0.012 + (i % 5) * 0.004 });

    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(i === 0 ? 0xff6a18 : 0xff982b, 0, this.settings.lightRadius * cast.worldScale, 2);
      light.castShadow = false;
      this.lights.push(light);
      this.scene.add(light);
    }
    this.scene.add(this.group);
    this.update(0);
  }

  setSettings(settings: BurningHandsV2Settings): void {
    this.settings = { ...settings };
    const nextCount = Math.max(8, Math.min(16, Math.round(settings.tongueCount)));
    if (nextCount !== this.tongueCount) {
      this.flameMesh.geometry.dispose();
      this.flameMesh.geometry = makeFlameGeometry(nextCount);
      this.tongueCount = nextCount;
    }
    this.length = Math.max(this.cast.worldScale, this.cast.length) * settings.flameLength;
    this.width = Math.max(this.cast.worldScale * 0.7, this.cast.width) * settings.flameWidth;
    this.group.scale.set(this.width, this.length, this.width * 0.7);
    this.lights.forEach((light) => { light.distance = settings.lightRadius * this.cast.worldScale; });
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.elapsed = Math.min(FINISH, this.elapsed + Math.max(0, Math.min(dt, 0.08)));
    const growth = THREE.MathUtils.smoothstep(this.elapsed, 0.12, IGNITION);
    const contraction = 1 - THREE.MathUtils.smoothstep(this.elapsed, RELEASE, RELEASE + 0.13) * 0.17;
    this.flameMaterial.uniforms.uTime!.value = this.elapsed;
    this.flameMaterial.uniforms.uTurbulence!.value = this.settings.turbulence;
    this.flameMaterial.uniforms.uGrowth!.value = growth * contraction;
    this.flameMaterial.uniforms.uEnergy!.value = this.elapsed < RELEASE ? 1.15 + growth * 0.85 : 1.9 * (1 - THREE.MathUtils.smoothstep(this.elapsed, RELEASE + 0.1, FINISH));
    this.flameMesh.visible = this.settings.geometry && growth > 0 && this.elapsed < FINISH;
    this.flameMesh.material = this.flameMaterial;
    const shimmerMaterial = this.shimmer.material as THREE.ShaderMaterial;
    shimmerMaterial.uniforms.uTime!.value = this.elapsed;
    shimmerMaterial.uniforms.uOpacity!.value = this.settings.distortion ? 0.16 * Math.sin(Math.PI * Math.min(1, this.elapsed / FINISH)) : 0;
    this.shimmer.visible = this.settings.geometry && this.settings.distortion && this.elapsed > 0.28 && this.elapsed < FINISH;
    this.sparkMesh.visible = this.settings.geometry && this.settings.particles && this.elapsed > 0.38 && this.elapsed < FINISH;
    for (let i = 0; i < this.sparks.length; i++) {
      const spark = this.sparks[i]!;
      const travel = (spark.phase + this.elapsed * spark.speed * 0.5) % 1;
      this.sparkDummy.position.set(spark.side * (0.2 + travel * 0.8), travel * 0.95, spark.depth + Math.sin(this.elapsed * 9 + i) * 0.035);
      this.sparkDummy.rotation.set(this.elapsed * 4 + i, this.elapsed * 6 + i * 0.4, this.elapsed * 3);
      this.sparkDummy.scale.setScalar(spark.scale * (0.45 + 0.55 * Math.sin(Math.PI * travel)));
      this.sparkDummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.sparkDummy.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;

    const build = THREE.MathUtils.smoothstep(this.elapsed, 0.02, IGNITION);
    const fade = 1 - THREE.MathUtils.smoothstep(this.elapsed, RELEASE + 0.8, FINISH);
    this.lights.forEach((light, index) => {
      const progress = index === 0 ? 0.12 : THREE.MathUtils.clamp((this.elapsed - 0.42 + index * 0.12) / 1.1, 0.1, 0.9);
      const sideways = Math.sin(this.elapsed * 8 + index * 2.3) * this.width * 0.12;
      const forward = this.length * progress;
      const x = this.cast.origin.x + this.direction.x * forward - this.direction.y * sideways;
      const y = this.cast.origin.y + this.direction.y * forward + this.direction.x * sideways;
      light.position.set(x, y, this.cast.origin.z + 0.18 + Math.sin(this.elapsed * 6 + index) * 0.12);
      light.distance = this.settings.lightRadius * this.cast.worldScale;
      light.intensity = this.settings.lights ? this.settings.lightIntensity * build * fade * (index === 0 ? 1 : 0.42) : 0;
      light.visible = this.settings.lights && this.elapsed < FINISH;
    });
    if (!this.releaseSent && this.elapsed >= RELEASE) { this.releaseSent = true; this.cast.onRelease(); }
    if (!this.completeSent && this.elapsed >= FINISH) {
      this.completeSent = true;
      this.cast.onComplete();
      this.dispose();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    for (const light of this.lights) this.scene.remove(light);
    this.flameMesh.geometry.dispose();
    this.flameMaterial.dispose();
    this.shimmer.geometry.dispose();
    (this.shimmer.material as THREE.Material).dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
  }
}
