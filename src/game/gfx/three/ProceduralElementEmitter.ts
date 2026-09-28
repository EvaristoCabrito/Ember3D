import * as THREE from "three";
import { ELEMENT_LABELS, PLACEABLE_ELEMENT_KINDS, type PlaceableElementKind } from "../params";

export type PixelElement = "frost" | "lightning" | "poison" | "arcane" | "holy" | "shadow" | "ember";
export type PixelElementSettings = { scale: number; intensity: number; density: number; spawnRate: number; particleCount: number; lifetime: number; duration: number; velocity: number; verticalForce: number; spread: number; drag: number; turbulence: number; rotation: number; emissive: number; opacity: number; lightEnabled: boolean; lightIntensity: number; lightRadius: number; lightDecay: number; flickerAmount: number; flickerSpeed: number; animationSpeed: number; seed: number; loop: boolean };
export type PixelElementPreset = { id: `procedural_pixel_${PixelElement}`; family: "procedural_pixel"; element: PixelElement; label: string; color: number; light: number; radius: number; flicker: number; motion: "rise" | "electric" | "bubble" | "orbit" | "spiral" | "inward" | "ember" };
const entries: PixelElementPreset[] = [
  { id:"procedural_pixel_frost",family:"procedural_pixel",element:"frost",label:"Frost",color:0x79e7ff,light:1.35,radius:2.1,flicker:0.1,motion:"rise" },
  { id:"procedural_pixel_lightning",family:"procedural_pixel",element:"lightning",label:"Lightning",color:0x9ccaff,light:2.3,radius:2.7,flicker:0.75,motion:"electric" },
  { id:"procedural_pixel_poison",family:"procedural_pixel",element:"poison",label:"Poison",color:0xa4ef39,light:0.7,radius:1.8,flicker:0.18,motion:"bubble" },
  { id:"procedural_pixel_arcane",family:"procedural_pixel",element:"arcane",label:"Arcane",color:0xbd7aff,light:1.8,radius:2.25,flicker:0.26,motion:"orbit" },
  { id:"procedural_pixel_holy",family:"procedural_pixel",element:"holy",label:"Holy",color:0xffd875,light:1.8,radius:2.25,flicker:0.08,motion:"spiral" },
  { id:"procedural_pixel_shadow",family:"procedural_pixel",element:"shadow",label:"Shadow",color:0x9b66cb,light:0.55,radius:1.8,flicker:0.2,motion:"inward" },
  { id:"procedural_pixel_ember",family:"procedural_pixel",element:"ember",label:"Ember",color:0xf23943,light:0.9,radius:1.65,flicker:0.3,motion:"ember" },
];
export const PIXEL_ELEMENT_IDS = entries.map(e=>e.element) as readonly PixelElement[];
export const pixelPreset = (element: PixelElement) => entries.find(e=>e.element===element)!;
export const DEFAULT_PIXEL_SETTINGS: PixelElementSettings = { scale:1,intensity:1,density:1,spawnRate:1,particleCount:40,lifetime:1.8,duration:0,velocity:0.55,verticalForce:0.12,spread:0.42,drag:0.4,turbulence:0.35,rotation:1,emissive:2,opacity:1,lightEnabled:true,lightIntensity:1.3,lightRadius:2,lightDecay:2,flickerAmount:0.2,flickerSpeed:5,animationSpeed:1,seed:713,loop:true };
export const ELEMENT_FX_REGISTRY = Object.freeze([
  ...PLACEABLE_ELEMENT_KINDS.map((element:PlaceableElementKind)=>({family:"regular" as const,element,preset:`regular_${element}`,label:ELEMENT_LABELS[element],factory:"EffectsRenderer" as const,defaults:{}})),
  ...entries.map((entry)=>({...entry,factory:"ProceduralElementEmitter" as const,defaults:{...DEFAULT_PIXEL_SETTINGS,lightIntensity:entry.light,lightRadius:entry.radius,flickerAmount:entry.flicker}})),
]);

/** One pooled-geometry, instanced procedural pixel emitter. The map renderer reuses this for all
 * non-fire pixel elements; preset motion changes the particles without duplicating the emitter. */
export class ProceduralElementEmitter {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly mesh: THREE.InstancedMesh;
  private readonly preset: PixelElementPreset;
  private readonly settings: PixelElementSettings;
  private readonly particles: { phase:number; orbit:number; height:number; speed:number; size:number; seed:number }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly highlight = new THREE.Color(0xffffff);
  private time = 0;
  private seed: number;
  private lightPriority=true;
  constructor(private readonly scene:THREE.Scene, preset:PixelElementPreset, settings:Partial<PixelElementSettings>={}) {
    this.preset=preset; this.settings={...DEFAULT_PIXEL_SETTINGS,...settings}; this.seed=this.settings.seed>>>0||1;
    this.light=new THREE.PointLight(preset.color,0,preset.radius,2); this.light.visible=this.settings.lightEnabled;
    const geo=new THREE.BoxGeometry(0.095,0.095,0.095);
    const mat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:this.settings.emissive,roughness:0.55,metalness:0.05});
    const count=Math.max(12,Math.min(160,Math.round(this.settings.particleCount*this.settings.density*this.settings.spawnRate)));
    this.mesh=new THREE.InstancedMesh(geo,mat,count); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count=count;
    this.mesh.castShadow=false; this.mesh.receiveShadow=false;
    for(let i=0;i<count;i++) this.particles.push({phase:this.random()*Math.PI*2,orbit:this.random()*Math.PI*2,height:this.random(),speed:0.45+this.random()*0.8,size:0.55+this.random()*1.1,seed:this.random()*10});
    this.group.add(this.mesh); this.group.scale.setScalar(this.settings.scale); this.scene.add(this.group,this.light); this.update(0,0,0);
  }
  update(dt:number, tile:number, time:number, x=0, y=0):void {
    this.time=time*this.settings.animationSpeed; const count=this.mesh.count; const s=this.settings; const age=this.time;
    this.group.position.set(x,-y,0); this.group.scale.setScalar(Math.max(1,tile)*s.scale);
    const active=s.loop||s.duration<=0||time<s.duration; this.mesh.visible=active;
    for(let i=0;i<count;i++){
      const p=this.particles[i]!; const phase=p.phase+age*p.speed; const wob=Math.sin(phase*2.1+p.seed)*s.turbulence*0.12;
      let x=Math.cos(p.orbit+age*0.65)*p.orbit*0.035, z=p.height, y=0;
      switch(this.preset.motion){
        case "electric": x=Math.sin(phase*4+p.seed)*s.spread*0.48; y=Math.cos(phase*5+p.seed)*s.spread*0.42; z=0.2+((phase*1.6+p.height)%1)*0.7; break;
        case "bubble": x=Math.cos(p.orbit+phase*.35)*s.spread*.4+wob; y=Math.sin(p.orbit+phase*.35)*s.spread*.35; z=(p.height+age*p.speed*s.verticalForce)%1; break;
        case "orbit": { const a=p.orbit+age*(0.7+p.speed*.4); x=Math.cos(a)*s.spread*(0.55+z*.65); y=Math.sin(a)*s.spread*(0.5+z*.55); z=.18+(.5+.5*Math.sin(a*1.7+p.seed))*.54; break; }
        case "spiral": { const a=p.orbit+age*.55; const r=s.spread*(.3+z*.55); x=Math.cos(a)*r; y=Math.sin(a)*r; z=(p.height+age*p.speed*s.verticalForce)%1; break; }
        case "inward": { const a=p.orbit+age*.3; const r=s.spread*(.3+.7*(.5+.5*Math.sin(phase))); x=Math.cos(a)*r; y=Math.sin(a)*r; z=.1+(.5+.5*Math.sin(phase*.8))*0.65; break; }
        case "ember": x=Math.cos(p.orbit+phase*.23)*s.spread*.55+wob; y=Math.sin(p.orbit+phase*.23)*s.spread*.5; z=(p.height+age*p.speed*s.verticalForce*.7)%0.85; break;
        default: x=Math.cos(p.orbit+phase*.16)*s.spread*.42+wob; y=Math.sin(p.orbit+phase*.16)*s.spread*.36; z=(p.height+age*p.speed*s.verticalForce)%1;
      }
      const pulse=.65+.35*Math.sin(phase*1.6+p.seed); const size=.07*p.size*(.65+.35*pulse)*s.intensity;
      this.dummy.position.set(x,y,z); this.dummy.scale.setScalar(Math.max(.012,size));
      const electric=this.preset.motion==="electric"; this.dummy.scale.set(electric?size*1.7:size,size*(electric?.24:1),size*(electric?.24:1)); this.dummy.rotation.set(phase*.5*s.rotation,phase*.8*s.rotation,phase*.37*s.rotation); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i,this.dummy.matrix);
      const heat=(.5+.5*Math.sin(phase*1.2+p.seed)); this.tint.set(this.preset.color).lerp(this.highlight,heat*.38); this.mesh.setColorAt(i,this.tint);
    }
    this.mesh.instanceMatrix.needsUpdate=true; if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
    (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity=s.emissive*s.intensity; (this.mesh.material as THREE.MeshStandardMaterial).opacity=s.opacity; (this.mesh.material as THREE.MeshStandardMaterial).transparent=s.opacity<1;
    const flicker=1-s.flickerAmount*.5+s.flickerAmount*(.5+.5*Math.sin(age*(this.preset.motion==="electric"?38:s.flickerSpeed)+this.settings.seed));
    this.light.color.set(this.preset.color); this.light.intensity=active&&s.lightEnabled&&this.lightPriority?s.lightIntensity*this.preset.light*flicker*Math.max(.1,s.intensity):0; this.light.distance=s.lightRadius*this.preset.radius*Math.max(1,tile); this.light.decay=s.lightDecay; this.light.position.copy(this.group.position); this.light.position.z=Math.max(0.6,tile*.3);
  }
  dispose():void{ this.scene.remove(this.group,this.light); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
  setLightPriority(enabled:boolean):void{this.lightPriority=enabled;}
  private random():number { let x=this.seed; x^=x<<13; x^=x>>>17; x^=x<<5; this.seed=x>>>0; return this.seed/4294967296; }
}
