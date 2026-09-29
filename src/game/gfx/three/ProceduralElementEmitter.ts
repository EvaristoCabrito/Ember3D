import * as THREE from "three";
import { ELEMENT_LABELS, PLACEABLE_ELEMENT_KINDS, type PlaceableElementKind } from "../params";
import { DEFAULT_FIRE_EMITTER, loadFireFlipbook, ParticleEmitter, type FireEmitterSettings } from "./ThreeVfxSystem";
import type { EnvLight } from "../../lighting";

export type PixelElement = "fire" | "frost" | "lightning" | "poison" | "arcane" | "holy" | "shadow" | "ember";
export type PixelElementSettings = {
  scale: number; intensity: number; density: number; spawnRate: number; particleCount: number;
  lifetime: number; duration: number; velocity: number; verticalForce: number; spread: number;
  drag: number; turbulence: number; rotation: number; emissive: number; opacity: number;
  lightEnabled: boolean; lightIntensity: number; lightRadius: number; lightDecay: number;
  flickerAmount: number; flickerSpeed: number; animationSpeed: number; seed: number; loop: boolean;
  visualsEnabled: boolean;
};
export type PixelElementPreset = {
  id: `procedural_pixel_${PixelElement}`; family: "procedural_pixel"; element: PixelElement;
  label: string; color: number; light: number; radius: number; flicker: number;
  motion: "fire" | "frost" | "electric" | "poison" | "arcane" | "holy" | "shadow" | "ember";
};

const pixelEntries: PixelElementPreset[] = [
  { id:"procedural_pixel_fire",family:"procedural_pixel",element:"fire",label:"Procedural Pixel Fire",color:0xff7624,light:1,radius:3.2,flicker:0.36,motion:"fire" },
  { id:"procedural_pixel_frost",family:"procedural_pixel",element:"frost",label:"Procedural Pixel Frost",color:0x79e7ff,light:1.35,radius:2.1,flicker:0.1,motion:"frost" },
  { id:"procedural_pixel_lightning",family:"procedural_pixel",element:"lightning",label:"Procedural Pixel Lightning",color:0x9ccaff,light:2.3,radius:2.7,flicker:0.75,motion:"electric" },
  { id:"procedural_pixel_poison",family:"procedural_pixel",element:"poison",label:"Procedural Pixel Poison",color:0xa4ef39,light:0.7,radius:1.8,flicker:0.18,motion:"poison" },
  { id:"procedural_pixel_arcane",family:"procedural_pixel",element:"arcane",label:"Procedural Pixel Arcane",color:0xbd7aff,light:1.8,radius:2.25,flicker:0.26,motion:"arcane" },
  { id:"procedural_pixel_holy",family:"procedural_pixel",element:"holy",label:"Procedural Pixel Holy",color:0xffd875,light:1.8,radius:2.25,flicker:0.08,motion:"holy" },
  { id:"procedural_pixel_shadow",family:"procedural_pixel",element:"shadow",label:"Procedural Pixel Shadow",color:0x9b66cb,light:0.55,radius:1.8,flicker:0.2,motion:"shadow" },
  { id:"procedural_pixel_ember",family:"procedural_pixel",element:"ember",label:"Procedural Pixel Ember",color:0xf23943,light:0.9,radius:1.65,flicker:0.3,motion:"ember" },
];

export const PIXEL_ELEMENT_IDS = pixelEntries.map((entry) => entry.element) as readonly PixelElement[];
export const PIXEL_ELEMENT_PRESETS: readonly PixelElementPreset[] = Object.freeze(pixelEntries);
export const pixelPresetsFor = (element: PixelElement): readonly PixelElementPreset[] => PIXEL_ELEMENT_PRESETS.filter((entry) => entry.element === element);
export const pixelPreset = (element: PixelElement, presetId?: string): PixelElementPreset =>
  PIXEL_ELEMENT_PRESETS.find((entry) => entry.element === element && (!presetId || entry.id === presetId)) ??
  PIXEL_ELEMENT_PRESETS.find((entry) => entry.element === element)!;

export const DEFAULT_PIXEL_SETTINGS: PixelElementSettings = {
  scale:1,intensity:1,density:1,spawnRate:1,particleCount:40,lifetime:1.8,duration:0,
  velocity:0.55,verticalForce:0.12,spread:0.42,drag:0.4,turbulence:0.35,rotation:1,
  emissive:2,opacity:1,lightEnabled:true,lightIntensity:1.3,lightRadius:1,lightDecay:2,
  flickerAmount:0.2,flickerSpeed:5,animationSpeed:1,seed:713,loop:true,visualsEnabled:true,
};

const PIXEL_DEFAULTS: Record<PixelElement, Partial<PixelElementSettings>> = {
  // Match the first stationary FX Lab fire emitter. Its geometry, flipbook and curve are shared
  // directly below; these defaults mirror DEFAULT_FIRE_EMITTER rather than inventing a new fire.
  fire: { particleCount:26, lifetime:1, velocity:1.02, verticalForce:0.12, spread:1, drag:1.25, turbulence:0.65, emissive:1.15, lightIntensity:1, lightRadius:1, flickerAmount:0.36, flickerSpeed:23 },
  frost: { particleCount:36, lifetime:2.4, velocity:0.28, verticalForce:0.05, spread:0.58, turbulence:0.2, emissive:1.7, lightIntensity:1.2, lightRadius:1, flickerAmount:0.1, flickerSpeed:1.8 },
  lightning: { particleCount:24, lifetime:0.24, velocity:1.5, verticalForce:0.02, spread:0.66, turbulence:1.15, emissive:2.8, lightIntensity:1.6, lightRadius:1, flickerAmount:0.88, flickerSpeed:38 },
  poison: { particleCount:34, lifetime:2.7, velocity:0.24, verticalForce:0.08, spread:0.5, turbulence:0.38, emissive:1.15, lightIntensity:0.7, lightRadius:0.9, flickerAmount:0.18, flickerSpeed:4 },
  arcane: { particleCount:32, lifetime:2.2, velocity:0.62, verticalForce:0.1, spread:0.52, turbulence:0.28, emissive:2.0, lightIntensity:1.3, lightRadius:1, flickerAmount:0.26, flickerSpeed:3 },
  holy: { particleCount:30, lifetime:2.2, velocity:0.38, verticalForce:0.15, spread:0.46, turbulence:0.12, emissive:1.8, lightIntensity:1.2, lightRadius:1, flickerAmount:0.08, flickerSpeed:2.2 },
  shadow: { particleCount:32, lifetime:2.0, velocity:0.46, verticalForce:0.08, spread:0.62, turbulence:0.26, emissive:0.95, lightIntensity:0.55, lightRadius:0.8, flickerAmount:0.2, flickerSpeed:4.5 },
  ember: { particleCount:26, lifetime:2.8, velocity:0.2, verticalForce:0.06, spread:0.58, turbulence:0.42, emissive:1.35, lightIntensity:0.72, lightRadius:0.75, flickerAmount:0.3, flickerSpeed:6 },
};
export const pixelDefaults = (element: PixelElement): PixelElementSettings => ({ ...DEFAULT_PIXEL_SETTINGS, ...PIXEL_DEFAULTS[element] });

/** Registry drives the editor's family, element and preset selectors. Old placements have no
 * family field and remain on their original EffectsRenderer path. */
export const ELEMENT_FX_REGISTRY = Object.freeze([
  ...PLACEABLE_ELEMENT_KINDS.map((element: PlaceableElementKind) => ({ family:"regular" as const, element, preset:`regular_${element}`, label:ELEMENT_LABELS[element], factory:"EffectsRenderer" as const, defaults:{} })),
  ...pixelEntries.map((entry) => ({ ...entry, factory:"ProceduralElementEmitter" as const, defaults:pixelDefaults(entry.element) })),
]);

const sharedCube = new THREE.BoxGeometry(0.095, 0.095, 0.095);
const sharedCrystal = new THREE.OctahedronGeometry(0.075, 0);
const sharedSpark = new THREE.BoxGeometry(0.12, 0.025, 0.025);

/** One common deterministic emitter for the pixel family. Pixel Fire delegates to the exact
 * stationary fire flipbook emitter used by the first FX Lab preset; other elements share one
 * instanced-particle renderer with preset-specific geometry, motion and color. */
export class ProceduralElementEmitter {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh | null;
  private readonly material: THREE.MeshStandardMaterial | null;
  private readonly preset: PixelElementPreset;
  private settings: PixelElementSettings;
  private readonly particles: { phase:number; orbit:number; height:number; speed:number; size:number; seed:number }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly highlight = new THREE.Color(0xffffff);
  private time = 0;
  private seed: number;
  private lightPriority = true;
  private lightActivity = 0;
  private active = true;
  private disposed = false;
  private fireEmitter: ParticleEmitter | null = null;
  private fireTexture: THREE.Texture | null = null;
  private fireSettings: FireEmitterSettings | null = null;
  private fireDt = 0;

  constructor(private readonly scene:THREE.Scene, preset:PixelElementPreset, settings:Partial<PixelElementSettings>={}) {
    this.preset = preset;
    this.settings = { ...pixelDefaults(preset.element), ...settings };
    this.seed = this.settings.seed >>> 0 || 1;
    if (preset.element === "fire") {
      this.mesh = null;
      this.material = null;
      this.group.scale.setScalar(this.settings.scale);
      this.scene.add(this.group);
      void loadFireFlipbook().then((texture) => {
        if (this.disposed) { texture.dispose(); return; }
        this.fireTexture = texture;
        this.fireEmitter = new ParticleEmitter(texture, null, {
          sceneNear:0.1, sceneFar:2000, viewport:new THREE.Vector2(1,1), intensity:this.settings.emissive*this.settings.intensity,
        });
        this.fireEmitter.setSeed(this.seed);
        this.fireSettings = this.toFireSettings();
        this.fireEmitter.reset(this.fireSettings, true);
        this.group.add(this.fireEmitter.mesh);
      }).catch(() => { /* Keep the rest of the family available if the fire atlas cannot load. */ });
      return;
    }
    this.group.scale.setScalar(this.settings.scale);
    const geometry = preset.motion === "frost" ? sharedCrystal : preset.motion === "electric" ? sharedSpark : sharedCube;
    this.material = new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:this.settings.emissive,roughness:0.55,metalness:0.05,transparent:this.settings.opacity<1,opacity:this.settings.opacity,toneMapped:false});
    const count = Math.max(12, Math.min(160, Math.round(this.settings.particleCount*this.settings.density)));
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = count;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i=0;i<count;i++) this.particles.push({phase:this.random()*Math.PI*2,orbit:this.random()*Math.PI*2,height:this.random(),speed:0.45+this.random()*0.8,size:0.55+this.random()*1.1,seed:this.random()*10});
    this.group.add(this.mesh);
    this.scene.add(this.group);
    this.update(0,1,0);
  }

  setSettings(settings:Partial<PixelElementSettings>):void {
    this.settings = { ...this.settings, ...settings };
    if (this.preset.element === "fire" && this.fireEmitter) {
      const nextSeed = this.settings.seed >>> 0 || 1;
      const nextFireSettings = this.toFireSettings();
      if (this.fireSettings?.particleCount !== nextFireSettings.particleCount || this.fireSettings?.lifetimeScale !== nextFireSettings.lifetimeScale || nextSeed !== this.seed) {
        this.seed = nextSeed;
        this.fireEmitter.setSeed(this.seed);
        this.fireEmitter.reset(nextFireSettings, true);
      }
      this.fireSettings = nextFireSettings;
      this.fireEmitter.material.uniforms.uIntensity!.value = this.settings.emissive * this.settings.intensity;
    }
    if (this.material) {
      this.material.emissiveIntensity = this.settings.emissive*this.settings.intensity;
      this.material.opacity = this.settings.opacity;
      this.material.transparent = this.settings.opacity < 1;
    }
  }

  update(dt:number,tile:number,time:number,x=0,y=0):void {
    if (this.disposed) return;
    const s=this.settings;
    this.time=time*s.animationSpeed;
    const active=s.loop||s.duration<=0||time<s.duration;
    this.active=active;
    this.group.position.set(x,-y,0);
    this.group.scale.setScalar(Math.max(1,tile)*s.scale);
    if (this.preset.element === "fire") {
      this.fireDt += Math.max(0,Math.min(dt,0.08));
      if (this.fireEmitter && this.fireSettings) {
        this.fireEmitter.mesh.position.set(0,0,tile*0.035);
        // The containing group already scales the FX Lab's unit-space particles to one hex.
        this.fireEmitter.mesh.visible=active&&s.visualsEnabled;
        this.fireEmitter.light.visible=false;
        this.fireEmitter.update(dt,this.toFireSettings(),s.loop&&active);
        this.lightActivity=active&&s.lightEnabled&&this.lightPriority?this.fireEmitter.light.intensity:0;
      } else this.lightActivity=0;
      return;
    }
    const mesh=this.mesh;
    if (!mesh || !this.material) return;
    mesh.visible=active&&s.visualsEnabled;
    const age=this.time;
    const count=mesh.count;
    for(let i=0;i<count;i++){
      const p=this.particles[i]!;
      const lifePhase=((age*s.spawnRate+p.phase/(Math.PI*2)*s.lifetime)%s.lifetime)/s.lifetime;
      const phase=p.phase+age*p.speed*s.velocity;
      const wob=Math.sin(phase*2.1+p.seed)*s.turbulence*0.12;
      let px=0,py=0,pz=0;
      switch(this.preset.motion){
        case "electric": {
          const snap=Math.floor(age*(9+s.spawnRate*5)+p.seed*3);
          const irregular=Math.sin(snap*91.7+p.seed*17.0);
          px=Math.sin(phase*4+p.seed)*s.spread*0.48+irregular*s.turbulence*0.16;
          py=Math.cos(phase*5+p.seed)*s.spread*0.42;
          pz=0.08+((phase*1.6+p.height)%1)*0.68;
          break;
        }
        case "frost": {
          const grow=Math.sin(Math.PI*lifePhase);
          const a=p.orbit+age*(p.speed*0.18);
          const radius=s.spread*(0.2+grow*0.8);
          px=Math.cos(a)*radius+wob; py=Math.sin(a)*radius-lifePhase*s.verticalForce*0.55;
          pz=0.12+Math.sin(a*2+p.seed)*0.17; break;
        }
        case "poison": {
          const swell=0.65+0.45*Math.sin(Math.PI*lifePhase);
          const a=p.orbit+age*0.3;
          px=Math.cos(a)*s.spread*0.36+wob; py=Math.sin(a)*s.spread*0.32-lifePhase*s.verticalForce;
          pz=(0.15+lifePhase*0.46)*swell; break;
        }
        case "arcane": {
          const orbitTime=lifePhase<0.45?lifePhase/0.45:1-(lifePhase-0.45)/0.55;
          const radius=s.spread*(lifePhase<0.45?0.2+orbitTime*0.8:0.1+orbitTime*0.9);
          const a=p.orbit+age*(0.8+p.speed*0.65);
          px=Math.cos(a)*radius; py=Math.sin(a)*radius-lifePhase*s.verticalForce*0.35;
          pz=0.2+Math.sin(a*1.7+p.seed)*0.2; break;
        }
        case "holy": {
          const a=p.orbit+age*0.55;
          const r=s.spread*(0.18+lifePhase*0.62);
          px=Math.cos(a)*r; py=Math.sin(a)*r-lifePhase*s.verticalForce;
          pz=0.08+Math.sin(a*1.7+p.seed)*0.14; break;
        }
        case "shadow": {
          const r=s.spread*(0.85-lifePhase*0.7);
          const a=p.orbit+age*0.28;
          px=Math.cos(a)*r; py=Math.sin(a)*r-lifePhase*s.verticalForce*0.45;
          pz=0.06+lifePhase*0.48; break;
        }
        case "ember": {
          const a=p.orbit+phase*0.2;
          px=Math.cos(a)*s.spread*0.55+wob; py=Math.sin(a)*s.spread*0.5-lifePhase*s.verticalForce*0.65;
          pz=0.12+Math.sin(phase*0.7)*0.08; break;
        }
      }
      const lifeEnvelope=Math.sin(Math.PI*lifePhase);
      const pulse=0.64+0.36*Math.sin(phase*1.6+p.seed);
      const size=0.075*p.size*(0.55+0.45*pulse)*s.intensity*Math.max(0.12,lifeEnvelope);
      this.dummy.position.set(px,py,pz);
      this.dummy.scale.setScalar(Math.max(0.008,size));
      if(this.preset.motion==="electric") this.dummy.scale.set(size*2.2,size*0.24,size*0.24);
      this.dummy.rotation.set(phase*0.5*s.rotation,phase*0.8*s.rotation,phase*0.37*s.rotation);
      this.dummy.updateMatrix(); mesh.setMatrixAt(i,this.dummy.matrix);
      const brightness=this.preset.motion==="shadow"?0.12+0.2*pulse:0.28+0.62*(0.5+0.5*Math.sin(phase*1.2+p.seed));
      this.tint.set(this.preset.color).lerp(this.highlight,brightness);
      mesh.setColorAt(i,this.tint);
    }
    mesh.instanceMatrix.needsUpdate=true;
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    const flicker=1-s.flickerAmount*0.5+s.flickerAmount*(0.5+0.5*Math.sin(age*(this.preset.motion==="electric"?38:s.flickerSpeed)+this.settings.seed));
    const activity=this.preset.motion==="electric"?(0.18+0.82*Math.pow(Math.max(0,Math.sin(age*38+this.settings.seed)),6)):(0.58+0.42*Math.sin(age*1.7+this.settings.seed)*Math.sin(age*1.7+this.settings.seed));
    this.lightActivity=active&&s.lightEnabled&&this.lightPriority?s.lightIntensity*this.preset.light*flicker*activity*Math.max(0.1,s.intensity):0;
  }

  getLightSample(x:number,y:number,tile:number):EnvLight|null {
    if(!this.active||!this.settings.lightEnabled||!this.lightPriority||this.lightActivity<=0)return null;
    const c=new THREE.Color(this.preset.color);
    const intensity=this.lightActivity/(4.9*Math.pow(Math.max(1,tile),1.5));
    return {x,y,h:Math.max(1,tile)*0.28,r:this.settings.lightRadius*this.preset.radius*Math.max(1,tile),decay:this.settings.lightDecay,rgb:[c.r*intensity,c.g*intensity,c.b*intensity]};
  }

  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    this.scene.remove(this.group);
    this.fireEmitter?.geometry.dispose();
    this.fireEmitter?.material.dispose();
    this.fireEmitter?.light.removeFromParent();
    this.fireTexture?.dispose();
    this.material?.dispose();
  }
  setLightPriority(enabled:boolean):void{this.lightPriority=enabled;}

  private toFireSettings():FireEmitterSettings {
    const s=this.settings;
    return {
      particleCount:Math.max(12,Math.min(96,Math.round(s.particleCount*s.density*s.spawnRate))),
      particleScale:s.scale*DEFAULT_FIRE_EMITTER.particleScale,velocity:s.velocity,
      drag:s.drag,turbulence:s.turbulence,gravity:DEFAULT_FIRE_EMITTER.gravity,
      flipbookFps:DEFAULT_FIRE_EMITTER.flipbookFps*s.animationSpeed,
      coreIntensity:s.emissive,lightIntensity:DEFAULT_FIRE_EMITTER.lightIntensity*s.lightIntensity*s.intensity,
      lightRadius:DEFAULT_FIRE_EMITTER.lightRadius*s.lightRadius,lifetimeScale:s.lifetime,spread:s.spread,
    };
  }

  private random():number {
    let x=this.seed;
    x^=x<<13; x^=x>>>17; x^=x<<5;
    this.seed=x>>>0;
    return this.seed/4294967296;
  }
}
