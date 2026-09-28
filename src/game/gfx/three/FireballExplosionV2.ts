import * as THREE from "three";

type Layer = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
  delay: number;
  duration: number;
  size: THREE.Vector2;
  offsetY: number;
  smoke: boolean;
};

const V2_LAYERS = [
  { url: "/game/fx/fire-flipbook-4x4.png?v=1", delay: 0, duration: 0.88, size: new THREE.Vector2(1.75, 1.9), offsetY: 0.32, smoke: false },
  { url: "/game/fx/fire-v2-flame-b.png?v=1", delay: 0.035, duration: 0.94, size: new THREE.Vector2(2.15, 2.1), offsetY: 0.42, smoke: false },
  { url: "/game/fx/fire-v2-flame-c.png?v=1", delay: 0.075, duration: 0.98, size: new THREE.Vector2(2.4, 2.35), offsetY: 0.38, smoke: false },
  { url: "/game/fx/fire-v2-smoke-4x4.png?v=1", delay: 0.22, duration: 2.15, size: new THREE.Vector2(2.5, 2.8), offsetY: 0.9, smoke: true },
] as const;

function createMaterial(texture: THREE.Texture, smoke: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: texture }, uFrame: { value: 0 }, uOpacity: { value: 0 }, uEmission: { value: smoke ? 0.8 : 1.45 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D uAtlas; uniform float uFrame; uniform float uOpacity; uniform float uEmission; varying vec2 vUv; void main(){float frame=clamp(floor(uFrame),0.0,15.0);vec2 cell=vec2(mod(frame,4.0),3.0-floor(frame/4.0));vec2 uv=(cell+clamp(vUv,vec2(0.012),vec2(0.988)))*0.25;vec4 sprite=texture2D(uAtlas,uv);float a=sprite.a*uOpacity;if(a<0.003)discard;gl_FragColor=vec4(sprite.rgb*uEmission,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** A separate, additive Dev Controls effect made from the supplied fire and smoke atlases.
 * The original Etapa 02 FireballImpactVFX is deliberately left untouched. */
export class FireballExplosionV2 {
  readonly light = new THREE.PointLight(0xff7624, 0, 5.4, 1.45);
  private readonly layers: Layer[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly origin = new THREE.Vector3(0, 0.19, 0);
  private worldScale = 1;
  private elapsed = 0;
  private disposed = false;

  private constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera, textures: THREE.Texture[]) {
    this.textures = textures;
    V2_LAYERS.forEach((config, index) => {
      const material = createMaterial(textures[index]!, config.smoke);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.frustumCulled = false;
      mesh.renderOrder = config.smoke ? 34 : 33;
      mesh.visible = false;
      this.layers.push({ mesh, material, delay: config.delay, duration: config.duration, size: config.size, offsetY: config.offsetY, smoke: config.smoke });
      scene.add(mesh);
    });
    this.light.visible = false;
    scene.add(this.light);
  }

  static async create(scene: THREE.Scene, camera: THREE.Camera): Promise<FireballExplosionV2> {
    const loader = new THREE.TextureLoader();
    const textures = await Promise.all(V2_LAYERS.map(async ({ url }) => {
      const texture = await loader.loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      // Each version owns its own texture handles; disposing V2 never invalidates V1.
      return texture;
    }));
    return new FireballExplosionV2(scene, camera, textures);
  }

  restart(point = this.origin): void {
    if (this.disposed) return;
    this.origin.copy(point);
    this.elapsed = 0;
    this.layers.forEach((layer) => { layer.mesh.visible = true; });
    this.light.visible = true;
    this.update(0);
  }

  get finished(): boolean { return this.elapsed >= 2.4; }

  restartAtScale(point: THREE.Vector3, worldScale: number): void {
    this.worldScale = Math.max(0.01, worldScale);
    this.restart(point);
  }

  hide(): void {
    this.layers.forEach((layer) => { layer.mesh.visible = false; });
    this.light.visible = false;
    this.light.intensity = 0;
  }

  update(dt: number, looping = false): void {
    if (this.disposed) return;
    this.elapsed += Math.max(0, Math.min(0.05, dt));
    const t = this.elapsed;
    this.layers.forEach((layer) => {
      const age = t - layer.delay;
      const p = age / layer.duration;
      if (age < 0 || p >= 1) {
        layer.mesh.visible = false;
        return;
      }
      layer.mesh.visible = true;
      layer.mesh.position.set(this.origin.x, this.origin.y + (layer.offsetY + (layer.smoke ? Math.min(0.28, age * 0.16) : 0)) * this.worldScale, this.origin.z);
      layer.mesh.quaternion.copy(this.camera.quaternion);
      const grow = layer.smoke ? 0.78 + p * 0.42 : 0.72 + p * 0.52;
      layer.mesh.scale.set(layer.size.x * grow * this.worldScale, layer.size.y * grow * this.worldScale, 1);
      const textureFrame = Math.min(15, Math.floor(Math.max(0, age) * (layer.smoke ? 15 : 21)));
      layer.material.uniforms.uFrame!.value = textureFrame;
      const fade = layer.smoke ? Math.min(1, age / 0.18) * Math.pow(1 - p, 0.66) : Math.sin(Math.PI * Math.min(1, p)) ** 0.58;
      layer.material.uniforms.uOpacity!.value = fade * (layer.smoke ? 0.94 : 0.78);
    });
    const flash = Math.max(0, 1 - t / 0.34);
    this.light.position.copy(this.origin).y += 0.34;
    this.light.intensity = 24 * flash * flash + (t > 0.34 && t < 1.1 ? 1.4 * (1 - (t - 0.34) / 0.76) : 0);
    this.light.distance = 5.4 * this.worldScale;
    if (t >= 2.4) {
      if (looping) this.restart();
      else this.hide();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const layer of this.layers) {
      this.scene.remove(layer.mesh);
      layer.mesh.geometry.dispose();
      layer.material.dispose();
    }
    this.scene.remove(this.light);
    this.textures.forEach((texture) => texture.dispose());
    this.layers.length = 0;
  }
}
