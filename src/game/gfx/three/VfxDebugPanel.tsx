import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { DEFAULT_FIRE_EMITTER, ParticleEmitter, loadFireFlipbook, type FireEmitterSettings } from "./ThreeVfxSystem";
import { DEFAULT_IMPACT_SETTINGS, FireballImpactVFX, getActiveImpactSettings, setActiveImpactSettings, type ImpactSettings } from "./FireballImpactVFX";
import { FireballExplosionV2 } from "./FireballExplosionV2";

type PreviewState = {
  settings: FireEmitterSettings;
  impactSettings: ImpactSettings;
  mode: "flame" | "impact" | "impact-v2";
  playing: boolean;
  looping: boolean;
  bloomEnabled: boolean;
};

type PreviewControls = {
  restart: () => void;
  frameStep: () => void;
};

type ImpactSlider = { key: keyof ImpactSettings; label: string; min: number; max: number; step: number };
const IMPACT_GROUPS: { title: string; sliders: ImpactSlider[] }[] = [
  { title: "Flash de impacto", sliders: [
    { key: "flashIntensity", label: "Intensidade do flash", min: 2, max: 32, step: 0.5 },
    { key: "flashSize", label: "Tamanho do flash", min: 0.2, max: 1.8, step: 0.01 },
    { key: "flashDuration", label: "Duração do flash", min: 0.02, max: 0.15, step: 0.005 },
    { key: "flashOffset", label: "Atraso do flash", min: 0, max: 0.12, step: 0.005 },
  ] },
  { title: "Explosão principal", sliders: [
    { key: "primaryCount", label: "Partículas de fogo", min: 12, max: 120, step: 1 },
    { key: "primarySize", label: "Tamanho das chamas", min: 0.25, max: 1.5, step: 0.01 },
    { key: "primarySpeed", label: "Velocidade radial", min: 0.6, max: 7, step: 0.1 },
    { key: "primaryDrag", label: "Arrasto do fogo", min: 0.5, max: 10, step: 0.1 },
    { key: "primaryLife", label: "Duração do fogo", min: 0.15, max: 0.8, step: 0.01 },
    { key: "verticalSpread", label: "Abertura vertical", min: 0.2, max: 2.5, step: 0.01 },
    { key: "primaryEmission", label: "Emissão principal", min: 0.5, max: 5, step: 0.1 },
    { key: "primaryOffset", label: "Atraso do fogo", min: 0, max: 0.18, step: 0.005 },
  ] },
  { title: "Chamas secundárias e radiais", sliders: [
    { key: "secondaryCount", label: "Chamas secundárias", min: 0, max: 64, step: 1 },
    { key: "secondarySize", label: "Tamanho secundário", min: 0.3, max: 1.8, step: 0.01 },
    { key: "secondarySpeed", label: "Velocidade secundária", min: 0.2, max: 3.5, step: 0.05 },
    { key: "buoyancy", label: "Convecção ascendente", min: 0, max: 2, step: 0.01 },
    { key: "secondaryLife", label: "Duração secundária", min: 0.25, max: 1.1, step: 0.01 },
    { key: "secondaryOffset", label: "Atraso secundário", min: 0, max: 0.3, step: 0.005 },
    { key: "radialCount", label: "Línguas no chão", min: 0, max: 96, step: 1 },
    { key: "radialSpeed", label: "Velocidade no chão", min: 0.4, max: 5, step: 0.1 },
    { key: "radialOffset", label: "Atraso radial", min: 0, max: 0.25, step: 0.005 },
  ] },
  { title: "Faíscas e brasas", sliders: [
    { key: "sparkCount", label: "Quantidade de faíscas", min: 0, max: 200, step: 1 },
    { key: "sparkSpeed", label: "Velocidade das faíscas", min: 0.5, max: 12, step: 0.1 },
    { key: "sparkGravity", label: "Gravidade das faíscas", min: 0.5, max: 15, step: 0.1 },
    { key: "sparkDrag", label: "Arrasto das faíscas", min: 0, max: 3, step: 0.05 },
    { key: "sparkLife", label: "Duração das faíscas", min: 0.15, max: 1.2, step: 0.01 },
    { key: "sparkOffset", label: "Atraso das faíscas", min: 0, max: 0.2, step: 0.005 },
    { key: "emberCount", label: "Quantidade de brasas", min: 0, max: 72, step: 1 },
    { key: "emberSpeed", label: "Velocidade das brasas", min: 0.3, max: 5, step: 0.1 },
    { key: "emberGravity", label: "Gravidade das brasas", min: 0.5, max: 10, step: 0.1 },
    { key: "emberLife", label: "Duração das brasas", min: 0.2, max: 1.5, step: 0.01 },
    { key: "emberOffset", label: "Atraso das brasas", min: 0, max: 0.35, step: 0.005 },
  ] },
  { title: "Fumaça", sliders: [
    { key: "smokeCount", label: "Quantidade de fumaça", min: 0, max: 64, step: 1 },
    { key: "smokeSize", label: "Tamanho da fumaça", min: 0.3, max: 2, step: 0.01 },
    { key: "smokeRise", label: "Elevação da fumaça", min: 0.1, max: 2, step: 0.01 },
    { key: "smokeExpansion", label: "Expansão da fumaça", min: 0.1, max: 1.5, step: 0.01 },
    { key: "smokeOpacity", label: "Opacidade da fumaça", min: 0, max: 0.8, step: 0.01 },
    { key: "smokeLife", label: "Duração da fumaça", min: 0.4, max: 1.8, step: 0.01 },
    { key: "smokeOffset", label: "Atraso da fumaça", min: 0, max: 0.5, step: 0.005 },
  ] },
  { title: "Luz e animação", sliders: [
    { key: "peakLight", label: "Pico de luz", min: 0, max: 40, step: 0.5 },
    { key: "lightRadius", label: "Raio da luz", min: 1, max: 8, step: 0.1 },
    { key: "lightDecay", label: "Decaimento da luz", min: 0.3, max: 1.5, step: 0.01 },
    { key: "flipbookFps", label: "FPS do flipbook", min: 6, max: 36, step: 1 },
  ] },
];

const SLIDERS: { key: keyof FireEmitterSettings; label: string; min: number; max: number; step: number }[] = [
  { key: "flipbookFps", label: "Taxa do flipbook", min: 6, max: 36, step: 1 },
  { key: "particleCount", label: "Quantidade de chamas", min: 12, max: 72, step: 1 },
  { key: "particleScale", label: "Escala da chama", min: 0.55, max: 1.5, step: 0.01 },
  { key: "velocity", label: "Velocidade de subida", min: 0.25, max: 1.6, step: 0.01 },
  { key: "drag", label: "Arrasto do ar", min: 0.2, max: 3, step: 0.01 },
  { key: "turbulence", label: "Turbulência", min: 0, max: 2, step: 0.01 },
  { key: "gravity", label: "Gravidade", min: 0, max: 1.2, step: 0.01 },
  { key: "coreIntensity", label: "Emissão da chama", min: 0.5, max: 3.5, step: 0.01 },
  { key: "lightIntensity", label: "Luz no terreno", min: 0, max: 12, step: 0.1 },
  { key: "lightRadius", label: "Alcance da luz", min: 1, max: 6, step: 0.1 },
];

function mountVfxPreview(canvas: HTMLCanvasElement, state: MutableRefObject<PreviewState>, controls: MutableRefObject<PreviewControls | null>): () => void {
  let disposed = false;
  let raf = 0;
  let last = performance.now();
  let simulationClock = 0;
  let emitter: ParticleEmitter | null = null;
  let impact: FireballImpactVFX | null = null;
  let impactV2: FireballExplosionV2 | null = null;
  let flipbook: THREE.Texture | null = null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x100e0b, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 30);
  camera.position.set(2.25, 2.75, 3.35);
  camera.lookAt(0, 0.48, 0);

  const baseScene = new THREE.Scene();
  baseScene.background = new THREE.Color(0x100e0b);
  baseScene.add(new THREE.HemisphereLight(0xbfc6d2, 0x17120d, 0.62));
  const key = new THREE.DirectionalLight(0xf0e5d2, 1.35);
  key.position.set(-3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  baseScene.add(key);
  baseScene.add(key.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x211c17, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  baseScene.add(ground);

  // A single battlefield hex is the fixed emitter anchor. The flat center and broken stone rim
  // give the warm point light real surfaces to illuminate, while the surrounding plane keeps
  // the light falloff legible in the preview.
  const hex = new THREE.Mesh(
    new THREE.CylinderGeometry(1.22, 1.22, 0.34, 6, 1, false),
    new THREE.MeshStandardMaterial({ color: 0x51473b, roughness: 0.94, metalness: 0.02 }),
  );
  hex.position.y = 0;
  hex.castShadow = true;
  hex.receiveShadow = true;
  baseScene.add(hex);
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(1.18, 6),
    new THREE.MeshStandardMaterial({ color: 0x453b31, roughness: 0.98, metalness: 0 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.rotation.z = Math.PI / 6;
  top.position.y = 0.174;
  top.receiveShadow = true;
  baseScene.add(top);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x62594e, roughness: 0.89, metalness: 0.03 });
  const stoneMat2 = new THREE.MeshStandardMaterial({ color: 0x38332d, roughness: 0.97, metalness: 0.01 });
  const stones = new THREE.Group();
  let seed = 423;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 28; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 0.24 + rand() * 0.87;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), i % 3 === 0 ? stoneMat2 : stoneMat);
    stone.position.set(Math.cos(angle) * radius, 0.19 + rand() * 0.035, Math.sin(angle) * radius);
    stone.scale.set(0.1 + rand() * 0.14, 0.035 + rand() * 0.028, 0.08 + rand() * 0.13);
    stone.rotation.set(rand() * 0.2, rand() * Math.PI, rand() * 0.2);
    stone.castShadow = true;
    stone.receiveShadow = true;
    stones.add(stone);
  }
  baseScene.add(stones);

  const baseTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
  baseTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  baseTarget.depthTexture.format = THREE.DepthFormat;
  baseTarget.depthTexture.minFilter = THREE.NearestFilter;
  baseTarget.depthTexture.magFilter = THREE.NearestFilter;
  const overlayTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });

  const fireScene = new THREE.Scene();
  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms: { uBase: { value: baseTarget.texture }, uFire: { value: overlayTarget.texture } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader: `uniform sampler2D uBase; uniform sampler2D uFire; varying vec2 vUv; void main(){ vec4 base=texture2D(uBase,vUv); vec4 fire=texture2D(uFire,vUv); gl_FragColor=vec4(base.rgb*(1.0-fire.a)+fire.rgb,1.0); }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
  compositeScene.add(compositeQuad);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(compositeScene, compositeCamera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.92, 0.34, 0.7);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    renderer.setSize(pw, ph, false);
    canvas.width = pw;
    canvas.height = ph;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    baseTarget.setSize(pw, ph);
    overlayTarget.setSize(pw, ph);
    composer.setSize(pw, ph);
    if (emitter) (emitter.material.uniforms.uViewport!.value as THREE.Vector2).set(pw, ph);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  controls.current = {
    restart: () => {
      if (state.current.mode === "impact-v2" && impactV2) { impactV2.restart(); return; }
      if (state.current.mode === "impact" && impact) { impact.restart(state.current.impactSettings); return; }
      if (!emitter) return;
      simulationClock = 0;
      emitter.reset(state.current.settings, true);
    },
    frameStep: () => {
      if (state.current.mode === "impact-v2" && impactV2) { impactV2.update(1 / 24, state.current.looping); return; }
      if (state.current.mode === "impact" && impact) { impact.update(1 / Math.max(1, state.current.impactSettings.flipbookFps), state.current.impactSettings, state.current.looping, camera); return; }
      if (!emitter) return;
      const s = state.current.settings;
      emitter.update(1 / Math.max(1, s.flipbookFps), s, state.current.looping);
      simulationClock += 1 / Math.max(1, s.flipbookFps);
      if (flipbook) emitter.material.uniforms.uFlipbook!.value = flipbook;
    },
  };

  void loadFireFlipbook().then((texture) => {
    if (disposed) { texture.dispose(); return; }
    flipbook = texture;
    emitter = new ParticleEmitter(texture, baseTarget.depthTexture!, {
      sceneNear: camera.near,
      sceneFar: camera.far,
      viewport: new THREE.Vector2(canvas.width, canvas.height),
      intensity: state.current.settings.coreIntensity,
    });
    emitter.reset(state.current.settings, true);
    emitter.mesh.position.set(0, 0.13, 0);
    fireScene.add(emitter.mesh);
    emitter.light.position.set(0, 0.55, 0);
    emitter.light.castShadow = false;
    emitter.light.shadow.mapSize.set(512, 512);
    emitter.light.shadow.camera.near = 0.1;
    emitter.light.shadow.camera.far = 8;
    baseScene.add(emitter.light);
    impact = new FireballImpactVFX(texture, baseTarget.depthTexture!, camera.near, camera.far, new THREE.Vector2(canvas.width, canvas.height));
    impact.setOrigin(new THREE.Vector3(0, 0.19, 0));
    impact.mesh.visible = false;
    impact.flash.visible = false;
    fireScene.add(impact.mesh, impact.flash);
    baseScene.add(impact.light);
    void FireballExplosionV2.create(fireScene, camera).then((effect) => {
      if (disposed) { effect.dispose(); return; }
      impactV2 = effect;
      if (state.current.mode === "impact-v2") effect.restart(new THREE.Vector3(0, 0.19, 0));
    }).catch((error) => console.error("Falha ao carregar Explosão V2", error));
    resize();
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const placeImpact = (event: PointerEvent) => {
    if (state.current.mode === "impact-v2" && impactV2) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(top, false)[0];
      if (!hit) return;
      impactV2.restart(hit.point);
      state.current.playing = true;
      return;
    }
    if (state.current.mode !== "impact" || !impact) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(top, false)[0];
    if (!hit) return;
    impact.setOrigin(hit.point);
    impact.restart(state.current.impactSettings);
    state.current.playing = true;
  };
  canvas.addEventListener("pointerdown", placeImpact);

  const animate = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    bloomPass.enabled = state.current.bloomEnabled;
    if (emitter) {
      const s = state.current.settings;
      emitter.material.uniforms.uSceneDepth!.value = baseTarget.depthTexture;
      emitter.material.uniforms.uViewport!.value.set(canvas.width, canvas.height);
      emitter.material.uniforms.uIntensity!.value = s.coreIntensity;
      if (state.current.mode === "flame") {
        if (impactV2) impactV2.hide();
        emitter.mesh.visible = true;
        emitter.light.visible = true;
        if (impact) { impact.mesh.visible = false; impact.flash.visible = false; impact.light.visible = false; }
        if (state.current.playing) {
          emitter.update(dt, s, state.current.looping);
          simulationClock += dt;
          if (!state.current.looping && emitter.particles.slice(0, s.particleCount).every((p) => p.age >= p.life)) {
            state.current.playing = false;
            emitter.light.intensity = 0;
          }
        } else {
          emitter.light.intensity = s.lightIntensity;
          emitter.light.distance = s.lightRadius;
          emitter.setFrame(s);
        }
        if (state.current.looping && simulationClock > 30) simulationClock %= 30;
      } else {
        emitter.mesh.visible = false;
        emitter.light.visible = false;
        if (state.current.mode === "impact-v2") {
          if (impact) { impact.mesh.visible = false; impact.flash.visible = false; impact.light.visible = false; }
          if (impactV2) {
            if (state.current.playing) impactV2.update(dt, state.current.looping);
            else impactV2.hide();
          }
        } else if (impact) {
          if (impactV2) impactV2.hide();
          impact.mesh.visible = true;
          impact.light.visible = true;
          const fx = state.current.impactSettings;
          if (state.current.playing) impact.update(dt, fx, state.current.looping, camera);
          else impact.update(0, fx, state.current.looping, camera);
        }
      }
    }

    renderer.setRenderTarget(baseTarget);
    renderer.clear(true, true, true);
    renderer.render(baseScene, camera);
    renderer.setRenderTarget(overlayTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    if (emitter) renderer.render(fireScene, camera);
    renderer.setRenderTarget(null);
    composer.render(dt);
  };
  raf = requestAnimationFrame(animate);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    controls.current = null;
    canvas.removeEventListener("pointerdown", placeImpact);
    emitter?.dispose();
    impact?.dispose();
    impactV2?.dispose();
    flipbook?.dispose();
    renderer.dispose();
    composer.dispose();
    baseTarget.dispose();
    overlayTarget.dispose();
    (compositeQuad.geometry as THREE.BufferGeometry).dispose();
    compositeMaterial.dispose();
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    hex.geometry.dispose();
    (hex.material as THREE.Material).dispose();
    top.geometry.dispose();
    (top.material as THREE.Material).dispose();
    for (const stone of stones.children) {
      if (stone instanceof THREE.Mesh) stone.geometry.dispose();
    }
    stoneMat.dispose();
    stoneMat2.dispose();
  };
}

export function VfxDebugPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PreviewControls | null>(null);
  const [settings, setSettings] = useState(DEFAULT_FIRE_EMITTER);
  const [impactSettings, setImpactSettings] = useState(DEFAULT_IMPACT_SETTINGS);
  const [mode, setMode] = useState<"flame" | "impact" | "impact-v2">("flame");
  const [playing, setPlaying] = useState(true);
  const [looping, setLooping] = useState(true);
  const [bloomEnabled, setBloomEnabled] = useState(false);
  const stateRef = useRef<PreviewState>({ settings, impactSettings, mode, playing, looping, bloomEnabled });
  stateRef.current = { settings, impactSettings, mode, playing, looping, bloomEnabled };

  const switchMode = (next: "flame" | "impact" | "impact-v2") => {
    stateRef.current.mode = next;
    stateRef.current.playing = true;
    setMode(next);
    setPlaying(true);
    runtimeRef.current?.restart();
  };

  const updateImpactSetting = (key: keyof ImpactSettings, value: number) => {
    const next = { ...stateRef.current.impactSettings, [key]: value };
    stateRef.current.impactSettings = next;
    setActiveImpactSettings(next);
    stateRef.current.playing = true;
    setImpactSettings(next);
    setPlaying(true);
    runtimeRef.current?.restart();
  };

  const restart = () => { stateRef.current.playing = true; setPlaying(true); runtimeRef.current?.restart(); };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const savedImpactSettings = getActiveImpactSettings();
    stateRef.current.impactSettings = savedImpactSettings;
    setImpactSettings(savedImpactSettings);
    return mountVfxPreview(canvas, stateRef, runtimeRef);
  }, []);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-bg/40 p-4" aria-label="VFX debug editor">
      <div>
        <p className="text-sm uppercase tracking-[0.14em] text-muted">Laboratório VFX · etapa {mode === "flame" ? "01" : "02"}</p>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          <span className="text-muted">Efeito</span>
          <select aria-label="Selecionar efeito VFX" value={mode} onChange={(event) => switchMode(event.target.value as "flame" | "impact" | "impact-v2")} className="min-h-11 rounded-md border border-border bg-bg px-3 py-2 font-display text-lg text-fg focus:border-accent focus:outline-none">
            <option value="flame">Emissor de fogo estacionário</option>
            <option value="impact">Explosão de impacto Fireball · original</option>
            <option value="impact-v2">Explosão V2 · novas folhas de fogo e fumaça</option>
          </select>
        </label>
        <p className="text-sm text-muted mt-1">{mode === "flame" ? "Chama contínua ancorada em um hex de batalha." : mode === "impact-v2" ? "Nova versão com os flipbooks de fogo e fumaça anexados. A explosão original continua disponível acima." : "Clique no hex para posicionar e repetir a explosão original. Câmera fixa; sem projétil ou AOE. Ajustes salvos automaticamente neste navegador e aplicados às próximas conjurações de Fireball."}</p>
      </div>
      <canvas ref={canvasRef} onPointerDown={() => { if (mode !== "flame") { stateRef.current.playing = true; setPlaying(true); } }} className={`w-full h-80 rounded-lg border border-border bg-black/40 ${mode !== "flame" ? "cursor-crosshair" : ""}`} aria-label="Animated fire on a battlefield hex" />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={restart} className="min-h-11 rounded-md border border-accent bg-accent/10 px-3 py-2 font-medium hover:bg-accent/20">Reproduzir</button>
        <button type="button" onClick={() => { stateRef.current.playing = false; setPlaying(false); }} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Pausar</button>
        <button type="button" onClick={restart} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Reiniciar</button>
        <button type="button" onClick={() => runtimeRef.current?.frameStep()} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Avançar 1 quadro</button>
        <button type="button" role="switch" aria-checked={looping} onClick={() => { const next = !looping; stateRef.current.looping = next; setLooping(next); }} className={`col-span-2 min-h-11 rounded-md border px-3 py-2 ${looping ? "border-accent text-fg" : "border-border text-muted"}`}>{looping ? "Loop ativado" : "Loop desativado"}</button>
      </div>
      {mode === "flame" ? <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SLIDERS.map(({ key, label, min, max, step }) => (
            <label key={key} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
              <span className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><output className="tabular-nums text-muted">{settings[key].toFixed(key === "particleCount" || key === "flipbookFps" ? 0 : 2)}</output></span>
              <input aria-label={label} type="range" min={min} max={max} step={step} value={settings[key]} onChange={(event) => setSettings((s) => ({ ...s, [key]: Number(event.target.value) }))} />
            </label>
          ))}
        </div>
        <button type="button" onClick={() => { const defaults = { ...DEFAULT_FIRE_EMITTER }; setSettings(defaults); stateRef.current.settings = defaults; restart(); }} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Restaurar valores padrão</button>
      </> : mode === "impact" ? <>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { const next = { ...stateRef.current.impactSettings, seed: Math.floor(Math.random() * 999999) + 1 }; stateRef.current.impactSettings = next; setImpactSettings(next); setActiveImpactSettings(next); restart(); }} className="min-h-11 rounded-md border border-accent bg-accent/10 px-3 py-2 hover:bg-accent/20">Sortear semente · {impactSettings.seed}</button>
          <button type="button" onClick={() => { const defaults = { ...DEFAULT_IMPACT_SETTINGS }; stateRef.current.impactSettings = defaults; setImpactSettings(defaults); setActiveImpactSettings(defaults); restart(); }} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Restaurar valores padrão</button>
        </div>
        {IMPACT_GROUPS.map((group, groupIndex) => <details key={group.title} open={groupIndex < 2} className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer font-medium">{group.title}</summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.sliders.map(({ key, label, min, max, step }) => <label key={key} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
              <span className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><output className="tabular-nums text-muted">{impactSettings[key].toFixed(key === "primaryCount" || key === "secondaryCount" || key === "radialCount" || key === "sparkCount" || key === "emberCount" || key === "smokeCount" || key === "flipbookFps" ? 0 : 2)}</output></span>
              <input aria-label={label} type="range" min={min} max={max} step={step} value={impactSettings[key]} onChange={(event) => updateImpactSetting(key, Number(event.target.value))} />
            </label>)}
          </div>
        </details>)}
      </> : <p className="rounded-md border border-border px-3 py-3 text-sm text-muted">V2 usa as três folhas animadas de fogo e a folha de fumaça enviadas nesta conversa. Clique no hex para reposicionar e reiniciar.</p>}
      <label className="flex min-h-11 items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><span>Bloom de pós-processamento</span><input type="checkbox" checked={bloomEnabled} onChange={(event) => { stateRef.current.bloomEnabled = event.target.checked; setBloomEnabled(event.target.checked); }} /></label>
      <p className="text-xs leading-relaxed text-muted">{mode === "flame" ? "Flipbook com 16 quadros · partículas instanciadas · suavização por profundidade · luz real no terreno" : mode === "impact-v2" ? "Versão adicional · sprites anexados em flipbook · fogo, fumaça e luz · a explosão Etapa 02 permanece preservada" : "Timeline de impacto original · partículas em um draw call · mesma semente reproduz o mesmo padrão · bloom começa desligado para avaliar a estrutura"}</p>
    </section>
  );
}
