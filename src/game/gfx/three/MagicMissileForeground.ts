import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/** A separate DOM surface above water and character canvases. Reuses the live spell,
 * camera and lights without advancing its animation or changing its authored settings. */
export class MagicMissileForeground {
  static readonly layer = 31;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output: OutputPass;
  private size = "";

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0, 0);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, dpr: number, active: boolean, bloom: UnrealBloomPass): void {
    const size = `${width}:${height}:${dpr}`;
    if (size !== this.size) {
      this.size = size;
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(Math.max(1, width), Math.max(1, height));
    }
    if (!active) { this.renderer.clear(); return; }
    this.bloom.strength = bloom.strength;
    this.bloom.radius = bloom.radius;
    this.bloom.threshold = bloom.threshold;
    this.bloom.enabled = bloom.enabled;
    // World lights still illuminate the terrain in the main pass and the same missile
    // materials in this pass. Only missile geometry belongs to the foreground layer.
    scene.traverse(object => { if (object instanceof THREE.Light) object.layers.enable(MagicMissileForeground.layer); });
    const mask = camera.layers.mask;
    const background = scene.background;
    try {
      camera.layers.set(MagicMissileForeground.layer);
      scene.background = null;
      this.composer.render();
    } finally {
      camera.layers.mask = mask;
      scene.background = background;
    }
  }

  /** Compiles and links the spell's shaders in the background (no frame stall), with the scene's
   * lights enabled on this layer exactly as render() does, so the programs match a real cast. */
  warm(scene: THREE.Scene, camera: THREE.Camera): Promise<unknown> {
    scene.traverse(object => { if (object instanceof THREE.Light) object.layers.enable(MagicMissileForeground.layer); });
    const mask = camera.layers.mask;
    camera.layers.set(MagicMissileForeground.layer);
    try {
      return this.renderer.compileAsync(scene, camera);
    } finally {
      camera.layers.mask = mask;
    }
  }

  dispose(): void { this.composer.dispose(); this.bloom.dispose(); this.output.dispose(); this.renderer.dispose(); }
}
