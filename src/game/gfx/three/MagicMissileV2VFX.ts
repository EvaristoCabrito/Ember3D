import * as THREE from "three";

export interface MagicMissileV2Settings {
  missileCount: number; missileScale: number; formationSpacing: number; launchInterval: number;
  projectileSpeed: number; acceleration: number; trajectoryCurvature: number; trajectoryHeight: number;
  seekingStrength: number; turbulence: number; shellDistortion: number; trailLength: number;
  trailThickness: number; trailFragmentation: number; particleCount: number; emissive: number;
  travelLightIntensity: number; travelLightRadius: number; impactSize: number; impactLightIntensity: number;
  impactLightRadius: number; finalImpactMultiplier: number; geometry: boolean; trails: boolean;
  particles: boolean; emissiveEnabled: boolean; bloom: boolean; lights: boolean; seed: number;
}

export const DEFAULT_MAGIC_MISSILE_V2_SETTINGS: MagicMissileV2Settings = {
  missileCount: 3, missileScale: 0.24, formationSpacing: 0.32, launchInterval: 0.06,
  projectileSpeed: 13, acceleration: 1.9, trajectoryCurvature: 0.52, trajectoryHeight: 0.62,
  seekingStrength: 0.84, turbulence: 0.16, shellDistortion: 0.42, trailLength: 0.36,
  trailThickness: 0.075, trailFragmentation: 0.46, particleCount: 22, emissive: 5.2,
  travelLightIntensity: 4.8, travelLightRadius: 3.5, impactSize: 0.38,
  impactLightIntensity: 10, impactLightRadius: 3, finalImpactMultiplier: 1.16,
  geometry: true, trails: true, particles: true, emissiveEnabled: true, bloom: true, lights: true, seed: 44721,
};

const SETTINGS_KEY = "emberash:magic-missile-v2-settings";
export function getActiveMagicMissileV2Settings(): MagicMissileV2Settings {
  if (typeof window === "undefined") return { ...DEFAULT_MAGIC_MISSILE_V2_SETTINGS };
  try { return { ...DEFAULT_MAGIC_MISSILE_V2_SETTINGS, ...JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<MagicMissileV2Settings> }; }
  catch { return { ...DEFAULT_MAGIC_MISSILE_V2_SETTINGS }; }
}
export function setActiveMagicMissileV2Settings(settings: MagicMissileV2Settings): void {
  try { if (typeof window !== "undefined") window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage can be unavailable */ }
}

export interface MagicMissileV2Cast {
  id: string; origin: THREE.Vector3; target: THREE.Vector3; missileCount?: number;
  onImpact: (index: number) => void; onComplete: () => void;
  onTimelineEvent?: (event: MagicMissileV2TimelineEvent, index?: number) => void;
}
export type MagicMissileV2TimelineEvent =
  | "magic_missile_charge" | "magic_missile_launch_1" | "magic_missile_launch_2" | "magic_missile_launch_3"
  | "magic_missile_impact_1" | "magic_missile_impact_2" | "magic_missile_impact_3" | "magic_missile_complete";

type Bolt = { core: THREE.Mesh; shell: THREE.Mesh; launched: boolean; hit: boolean; launchAt: number; impactAt: number; impactStarted: number; points: THREE.Vector3[]; side: THREE.Vector3; seed: number };
const BOLT_VERTEX = /* glsl */ `uniform float uTime; uniform float uDistort; uniform float uScale; varying vec3 vP; void main(){ vec3 p=position; float n=sin(position.x*14.0+uTime*8.0)*cos(position.y*17.0-uTime*6.0)+sin(position.z*23.0+uTime*4.0)*0.35; p+=normalize(position+vec3(0.001))*n*uDistort; p.x*=0.55; p*=uScale; vP=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`;
const CORE_FRAGMENT = /* glsl */ `uniform float uTime; uniform float uGlow; varying vec3 vP; void main(){ float center=1.0-smoothstep(0.015,0.16,length(vP.xy)); float pulse=0.84+0.16*sin(uTime*19.0+vP.z*20.0); vec3 c=mix(vec3(0.17,0.045,0.55),vec3(0.72,0.46,1.0),center); c=mix(c,vec3(0.97,0.91,1.0),pow(center,3.0)); gl_FragColor=vec4(c*uGlow*pulse,0.98); }`;
const SHELL_FRAGMENT = /* glsl */ `uniform float uTime; uniform float uGlow; uniform float uOpacity; varying vec3 vP; void main(){ float n=sin(vP.x*39.0+uTime*11.0)*sin(vP.y*31.0-uTime*9.0)*sin(vP.z*27.0+uTime*8.0); float bands=0.44+0.56*abs(sin(atan(vP.y,vP.x)*6.0+uTime*4.0)); float a=clamp((0.48+n*0.3)*bands*uOpacity,0.0,0.82); vec3 c=mix(vec3(0.13,0.025,0.43),vec3(0.65,0.35,0.98),bands); gl_FragColor=vec4(c*uGlow,a); }`;
const TRAIL_VERTEX = /* glsl */ `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const TRAIL_FRAGMENT = /* glsl */ `uniform float uTime; uniform float uOpacity; uniform float uBreakup; varying vec2 vUv; void main(){float tip=smoothstep(0.0,0.25,vUv.x);float fade=pow(vUv.x,1.7);float noise=sin(vUv.x*72.0+uTime*8.0)*sin(vUv.x*31.0-uTime*5.0);float cuts=smoothstep(-0.4+uBreakup*0.5,0.48+uBreakup*0.5,noise);float core=1.0-smoothstep(0.22,0.5,abs(vUv.y-0.5));vec3 c=mix(vec3(0.12,0.025,0.46),vec3(0.75,0.52,1.0),tip);c=mix(c,vec3(0.97,0.92,1.0),core*tip);gl_FragColor=vec4(c,uOpacity*fade*cuts*(0.35+0.65*core));}`;

/** Reusable world-space magic-missile V2 effect. The enemy spell continues to use the old V1 renderer. */
export class MagicMissileV2VFX {
  private readonly root = new THREE.Group();
  private readonly bolts: Bolt[] = [];
  private readonly particlesGeometry = new THREE.OctahedronGeometry(0.035, 0);
  private readonly particlesMaterial = new THREE.MeshStandardMaterial({ color: 0xbda1ff, emissive: 0x8a4aff, emissiveIntensity: 2.8, roughness: 0.32, metalness: 0.08 });
  private particles: THREE.InstancedMesh;
  private readonly movingLight = new THREE.PointLight(0x9a66ff, 0, 3.5, 1.8);
  private readonly impactLights = Array.from({ length: 3 }, () => new THREE.PointLight(0xe6d4ff, 0, 3, 1.6));
  private readonly impactBursts: THREE.Mesh[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly trailMeshes: THREE.Mesh[] = [];
  private cast: MagicMissileV2Cast | null = null;
  private settings = getActiveMagicMissileV2Settings();
  private elapsed = 0;
  private rng = 1;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.particles = new THREE.InstancedMesh(this.particlesGeometry, this.particlesMaterial, 3 * 96);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particles.frustumCulled = false; this.particles.count = 0;
    this.root.add(this.particles); this.scene.add(this.root);
    // This light moves every frame. Point-light shadows render six shadow faces per update,
    // which can stall slower GPUs during a cast; keep the real dynamic illumination but let
    // the scene's existing lights provide shadows.
    this.movingLight.castShadow = false; this.scene.add(this.movingLight);
    for (const light of this.impactLights) { light.castShadow = false; this.scene.add(light); }
    for (let i = 0; i < 3; i++) {
      const coreMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDistort: { value: 0.1 }, uScale: { value: 0.001 }, uGlow: { value: 1 } }, vertexShader: BOLT_VERTEX, fragmentShader: CORE_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const shellMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uDistort: { value: 0.3 }, uScale: { value: 0.001 }, uGlow: { value: 1 }, uOpacity: { value: 0 } }, vertexShader: BOLT_VERTEX, fragmentShader: SHELL_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), coreMaterial);
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shellMaterial);
      core.visible = shell.visible = false; core.frustumCulled = shell.frustumCulled = false;
      this.root.add(shell, core);
      this.bolts.push({ core, shell, launched: false, hit: false, launchAt: 0, impactAt: 0, impactStarted: -1, points: [], side: new THREE.Vector3(1, 0, 0), seed: i * 3.17 });
      const burst = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 32), new THREE.MeshBasicMaterial({ color: 0xd9bdff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      burst.visible = false; this.impactBursts.push(burst); this.root.add(burst);
      const trail = this.createTrail(); this.trailMeshes.push(trail); this.root.add(trail);
    }
    this.root.visible = false; this.movingLight.visible = false; for (const light of this.impactLights) light.visible = false;
  }

  setSettings(settings: MagicMissileV2Settings): void {
    this.settings = { ...settings };
    this.particlesMaterial.emissiveIntensity = settings.emissiveEnabled ? settings.emissive : 0;
    if (this.cast) this.update(0);
  }
  hide(): void {
    this.root.visible = false; this.movingLight.visible = false; this.movingLight.intensity = 0;
    for (const light of this.impactLights) { light.visible = false; light.intensity = 0; }
    for (const bolt of this.bolts) { bolt.core.visible = false; bolt.shell.visible = false; }
    for (const burst of this.impactBursts) burst.visible = false;
    for (const trail of this.trailMeshes) trail.visible = false;
    this.particles.count = 0; this.cast = null;
  }
  castSpell(cast: MagicMissileV2Cast): void {
    if (this.disposed) return;
    this.hide(); this.settings = getActiveMagicMissileV2Settings(); this.cast = cast; this.elapsed = 0; this.rng = this.settings.seed >>> 0; this.root.visible = true;
    const count = Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1)));
    const distance = cast.origin.distanceTo(cast.target);
    const flight = THREE.MathUtils.clamp(distance / Math.max(1, this.settings.projectileSpeed), 0.28, 0.48);
    for (let i = 0; i < count; i++) {
      const bolt = this.bolts[i]!; bolt.launched = false; bolt.hit = false; bolt.impactStarted = -1; bolt.launchAt = 0.22 + i * this.settings.launchInterval; bolt.impactAt = bolt.launchAt + flight; bolt.points = [];
      bolt.seed = this.nextRandom() * 100;
      bolt.core.visible = bolt.shell.visible = true;
      const formation = this.formationPosition(cast.origin, i, count, 0);
      bolt.core.position.copy(formation); bolt.shell.position.copy(formation);
      bolt.core.scale.setScalar(0.001); bolt.shell.scale.setScalar(0.001);
      (bolt.core.material as THREE.ShaderMaterial).uniforms.uTime!.value = 0;
      (bolt.shell.material as THREE.ShaderMaterial).uniforms.uTime!.value = 0;
      this.impactBursts[i]!.visible = false; this.trailMeshes[i]!.visible = false;
    }
    this.movingLight.visible = true; this.movingLight.intensity = 0;
    cast.onTimelineEvent?.("magic_missile_charge"); this.update(0);
  }
  update(dt: number): void {
    if (!this.cast || this.disposed) return;
    this.elapsed += Math.min(0.05, Math.max(0, dt)); const t = this.elapsed; const cast = this.cast;
    let lightWeight = new THREE.Vector3(); let lightTotal = 0; let activeParticles = 0;
    for (let i = 0; i < this.bolts.length; i++) {
      const bolt = this.bolts[i]!; const active = i < Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1)));
      if (!active) { bolt.core.visible = bolt.shell.visible = false; this.trailMeshes[i]!.visible = false; continue; }
      const formation = this.formationPosition(cast.origin, i, Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1))), t);
      if (!bolt.launched && t >= bolt.launchAt) { bolt.launched = true; const launch = (`magic_missile_launch_${i + 1}`) as MagicMissileV2TimelineEvent; cast.onTimelineEvent?.(launch, i); }
      let pos = formation; let velocity = new THREE.Vector3(); let progress = 0;
      if (bolt.launched) {
        const flight = Math.max(0.18, bolt.impactAt - bolt.launchAt); progress = THREE.MathUtils.clamp((t - bolt.launchAt) / flight, 0, 1);
        const start = this.formationPosition(cast.origin, i, Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1))), bolt.launchAt);
        const direction = cast.target.clone().sub(start); const forward = direction.clone().normalize(); const up = new THREE.Vector3(0, 0, 1); const side = new THREE.Vector3().crossVectors(forward, up).normalize(); if (side.lengthSq() < 0.01) side.set(1, 0, 0);
        const spread = i - (Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1))) - 1) / 2;
        const c1 = start.clone().lerp(cast.target, 0.31).addScaledVector(side, spread * this.settings.trajectoryCurvature).addScaledVector(up, this.settings.trajectoryHeight * (0.75 + i * 0.16));
        const c2 = start.clone().lerp(cast.target, 0.72).addScaledVector(side, -spread * this.settings.trajectoryCurvature * 0.38).addScaledVector(up, this.settings.trajectoryHeight * 0.38);
        const curve = new THREE.CatmullRomCurve3([start, c1, c2, cast.target.clone()]);
        const accelerated = Math.pow(progress, Math.max(0.45, this.settings.acceleration)); const eased = THREE.MathUtils.lerp(progress, accelerated, this.settings.seekingStrength);
        const wiggle = new THREE.Vector3(Math.sin(t * 18 + bolt.seed) * this.settings.turbulence, Math.cos(t * 15 + bolt.seed * 0.4) * this.settings.turbulence * 0.6, Math.sin(t * 21 + bolt.seed * 0.8) * this.settings.turbulence);
        pos = curve.getPoint(eased).addScaledVector(wiggle, 1 - progress * 0.85);
        const ahead = curve.getPoint(Math.min(1, eased + 0.025)); velocity.copy(ahead).sub(pos).normalize();
        if (t >= bolt.impactAt && !bolt.hit) {
          bolt.hit = true; bolt.impactStarted = t; pos.copy(cast.target);
          const impact = (`magic_missile_impact_${i + 1}`) as MagicMissileV2TimelineEvent; cast.onTimelineEvent?.(impact, i); cast.onImpact(i);
          const finalScale = i === Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1))) - 1 ? this.settings.finalImpactMultiplier : 1;
          this.impactLights[i]!.position.copy(cast.target); this.impactLights[i]!.intensity = this.settings.lights ? this.settings.impactLightIntensity * finalScale : 0; this.impactLights[i]!.distance = this.settings.impactLightRadius; this.impactLights[i]!.visible = true;
          this.impactBursts[i]!.position.copy(cast.target); this.impactBursts[i]!.rotation.set(Math.PI / 2, (i * 0.7), t * 2); this.impactBursts[i]!.visible = true;
        }
        if (!bolt.hit) bolt.points.push(pos.clone());
      }
      const buildup = THREE.MathUtils.smoothstep(t, 0, 0.18); const shell = bolt.shell.material as THREE.ShaderMaterial; const core = bolt.core.material as THREE.ShaderMaterial;
      const formationGrowth = bolt.launched ? 1 : 0.12 + buildup * 0.88;
      const shellScale = this.settings.missileScale * formationGrowth * (bolt.hit ? Math.max(0.02, 1 - (t - bolt.impactStarted) * 8) : 1 + progress * 0.16);
      bolt.core.position.copy(pos); bolt.shell.position.copy(pos);
      if (velocity.lengthSq() > 0.001) { bolt.core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity); bolt.shell.quaternion.copy(bolt.core.quaternion); }
      const approach = progress > 0.74 ? 1 + (progress - 0.74) * 1.6 : 1;
      core.uniforms.uTime!.value = t; core.uniforms.uDistort!.value = this.settings.turbulence * 0.4; core.uniforms.uScale!.value = this.settings.geometry ? shellScale * 0.8 : 0; core.uniforms.uGlow!.value = this.settings.emissiveEnabled ? this.settings.emissive * (0.55 + buildup * 0.4 + progress * 0.35) * approach : 0;
      shell.uniforms.uTime!.value = t; shell.uniforms.uDistort!.value = this.settings.shellDistortion; shell.uniforms.uScale!.value = this.settings.geometry ? shellScale * 1.9 : 0; shell.uniforms.uGlow!.value = this.settings.emissiveEnabled ? this.settings.emissive * 0.7 : 0; shell.uniforms.uOpacity!.value = bolt.hit ? Math.max(0, 1 - (t - bolt.impactStarted) * 9) : this.settings.geometry ? 0.92 : 0;
      bolt.core.visible = this.settings.geometry; bolt.shell.visible = this.settings.geometry && !bolt.hit;
      const burst = this.impactBursts[i]!; if (bolt.hit) { const impactT = t - bolt.impactStarted; const life = Math.max(0, 1 - impactT / 0.12); const mult = i === Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1))) - 1 ? this.settings.finalImpactMultiplier : 1; burst.scale.setScalar(this.settings.impactSize * mult * (1 + impactT * 2.3)); (burst.material as THREE.MeshBasicMaterial).opacity = this.settings.geometry ? life * 0.9 : 0; burst.visible = this.settings.geometry && life > 0; this.impactLights[i]!.intensity = this.settings.lights ? this.settings.impactLightIntensity * life * mult : 0; if (life <= 0) this.impactLights[i]!.visible = false; }
      const trail = this.trailMeshes[i]!; this.updateTrail(trail, bolt.points, pos, velocity, t); trail.visible = this.settings.trails && bolt.points.length > 2 && !bolt.hit;
      if (!bolt.hit && bolt.launched) { lightWeight.addScaledVector(pos, 1); lightTotal++; }
      if (!bolt.hit && bolt.launched && this.settings.particles) activeParticles = this.updateParticles(i, pos, velocity, t, activeParticles);
    }
    this.particles.count = activeParticles; this.particles.instanceMatrix.needsUpdate = true; this.particles.visible = this.settings.particles;
    if (lightTotal) { lightWeight.multiplyScalar(1 / lightTotal); this.movingLight.position.copy(lightWeight); this.movingLight.intensity = this.settings.lights ? this.settings.travelLightIntensity : 0; this.movingLight.distance = this.settings.travelLightRadius; }
    else if (t < 0.2) { this.movingLight.position.copy(cast.origin); this.movingLight.intensity = this.settings.lights ? this.settings.travelLightIntensity * buildup * 0.38 : 0; }
    else { this.movingLight.intensity = 0; this.movingLight.visible = false; }
    const count = Math.max(1, Math.min(3, Math.round(cast.missileCount ?? 1)));
    if (this.bolts.slice(0, count).every((bolt) => bolt.hit) && t > Math.max(...this.bolts.slice(0, count).map((bolt) => bolt.impactStarted)) + 0.19) {
      const active = this.cast; active?.onTimelineEvent?.("magic_missile_complete"); this.hide(); active?.onComplete();
    }
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.hide(); this.scene.remove(this.root); this.scene.remove(this.movingLight); for (const light of this.impactLights) this.scene.remove(light); for (const bolt of this.bolts) { bolt.core.geometry.dispose(); bolt.shell.geometry.dispose(); (bolt.core.material as THREE.Material).dispose(); (bolt.shell.material as THREE.Material).dispose(); } for (const burst of this.impactBursts) { burst.geometry.dispose(); (burst.material as THREE.Material).dispose(); } for (const trail of this.trailMeshes) { trail.geometry.dispose(); (trail.material as THREE.Material).dispose(); } this.particlesGeometry.dispose(); this.particlesMaterial.dispose(); }

  private formationPosition(origin: THREE.Vector3, index: number, count: number, t: number): THREE.Vector3 {
    const side = (index - (count - 1) / 2) * this.settings.formationSpacing;
    return origin.clone().add(new THREE.Vector3(side + Math.sin(t * 8 + index) * 0.025, 0.46 + (index === 2 ? 0.18 : 0), 0.16 + index * 0.08));
  }
  private createTrail(): THREE.Mesh {
    const count = 34; const positions = new Float32Array(count * 2 * 3); const uvs = new Float32Array(count * 2 * 2); const indices: number[] = [];
    for (let i = 0; i < count; i++) { const u = i / (count - 1); uvs.set([u, 0, u, 1], i * 4); if (i < count - 1) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)); geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uBreakup: { value: 0.46 } }, vertexShader: TRAIL_VERTEX, fragmentShader: TRAIL_FRAGMENT, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 8; return mesh;
  }
  private updateTrail(mesh: THREE.Mesh, history: THREE.Vector3[], tip: THREE.Vector3, direction: THREE.Vector3, t: number): void {
    if (history.length < 2) return;
    const count = 34; const activeCount = THREE.MathUtils.clamp(Math.round(this.settings.trailLength * 95), 8, count); const points = history.slice(-activeCount); while (points.length < count) points.unshift(points[0]!); points[points.length - 1] = tip;
    const attr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute; const array = attr.array as Float32Array; const cameraUp = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < count; i++) { const p = points[i]!; const tangent = i < count - 1 ? points[i + 1]!.clone().sub(p).normalize() : direction.clone().normalize(); let side = new THREE.Vector3().crossVectors(tangent, cameraUp).normalize(); if (side.lengthSq() < 0.01) side.set(1, 0, 0); const u = i / (count - 1); const width = this.settings.trailThickness * (0.12 + u * u) * (1 - this.settings.trailFragmentation * (i % 4 === 0 ? 0.56 : 0)); const a = p.clone().addScaledVector(side, width); const b = p.clone().addScaledVector(side, -width); array.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); }
    attr.needsUpdate = true; mesh.geometry.computeBoundingSphere(); const material = mesh.material as THREE.ShaderMaterial; material.uniforms.uTime!.value = t; material.uniforms.uOpacity!.value = this.settings.emissiveEnabled ? this.settings.emissive * 0.16 : 0; material.uniforms.uBreakup!.value = this.settings.trailFragmentation;
  }
  private updateParticles(index: number, pos: THREE.Vector3, velocity: THREE.Vector3, t: number, offset: number): number {
    const perBolt = Math.min(96, Math.max(0, Math.round(this.settings.particleCount))); const current = this.bolts[index]!; this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    for (let i = 0; i < perBolt; i++) { const age = (t * 2.6 + i / Math.max(1, perBolt) + index * 0.17) % 1; const seed = this.random(); const drift = new THREE.Vector3((seed - 0.5) * 0.2, (this.random() - 0.5) * 0.2, (this.random() - 0.5) * 0.2); this.dummy.position.copy(pos).addScaledVector(velocity, -age * this.settings.trailLength).add(drift.multiplyScalar(age)); const size = (1 - age) * 0.046; this.dummy.scale.setScalar(size); this.dummy.rotation.set(t * 6 + i, t * 4 + i * 0.3, i); this.dummy.updateMatrix(); this.particles.setMatrixAt(offset + i, this.dummy.matrix); }
    return offset + perBolt;
  }
  private random(): number { this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0; return this.rng / 4294967296; }
  private nextRandom(): number { return this.random(); }
}
