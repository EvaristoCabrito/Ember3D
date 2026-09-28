import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { DEFAULT_FIRE_EMITTER, ParticleEmitter, loadFireFlipbook, type FireEmitterSettings } from "./ThreeVfxSystem";
import { DEFAULT_IMPACT_SETTINGS, FireballImpactVFX, getActiveImpactSettings, setActiveImpactSettings, type ImpactSettings } from "./FireballImpactVFX";
import { FireballExplosionV2 } from "./FireballExplosionV2";
import { DEFAULT_PHANTASMAL_FORCE_SETTINGS, getActivePhantasmalForceSettings, PhantasmalForceVFX, setActivePhantasmalForceSettings, type PhantasmalForceSettings } from "./PhantasmalForceVFX";
import { BlessVFX, DEFAULT_BLESS_VFX_SETTINGS, getActiveBlessVfxSettings, setActiveBlessVfxSettings, type BlessVfxSettings } from "./BlessVFX";
import { DEFAULT_MAGIC_MISSILE_V2_SETTINGS, getActiveMagicMissileV2Settings, MagicMissileV2VFX, setActiveMagicMissileV2Settings, type MagicMissileV2Settings } from "./MagicMissileV2VFX";

type PreviewState = {
  settings: FireEmitterSettings;
  impactSettings: ImpactSettings;
  phantasmalSettings: PhantasmalForceSettings;
  blessSettings: BlessVfxSettings;
  magicMissileV2Settings: MagicMissileV2Settings;
  mode: "flame" | "impact" | "impact-v2" | "phantasmal" | "bless" | "magic-missile-v2";
  playing: boolean;
  looping: boolean;
  bloomEnabled: boolean;
};

type PreviewControls = {
  restart: () => void;
  frameStep: () => void;
  setPhantasmalSettings: (settings: PhantasmalForceSettings) => void;
  setBlessSettings: (settings: BlessVfxSettings) => void;
  setMagicMissileV2Settings: (settings: MagicMissileV2Settings) => void;
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

const PHANTASMAL_SLIDERS: { key: keyof PhantasmalForceSettings; label: string; min: number; max: number; step: number; integer?: boolean }[] = [
  { key: "radius", label: "Raio do campo", min: 0.7, max: 3.2, step: 0.05 },
  { key: "tendrilCount", label: "Quantidade de tendrils", min: 4, max: 14, step: 1, integer: true },
  { key: "tendrilThickness", label: "Espessura dos tendrils", min: 0.01, max: 0.09, step: 0.002 },
  { key: "tendrilTurbulence", label: "Turbulência dos tendrils", min: 0, max: 0.5, step: 0.01 },
  { key: "splineNoise", label: "Ruído das curvas", min: 0, max: 0.7, step: 0.01 },
  { key: "particleCount", label: "Quantidade de partículas", min: 80, max: 520, step: 10, integer: true },
  { key: "particleAttraction", label: "Atração das partículas", min: 0.5, max: 5, step: 0.1 },
  { key: "spiralStrength", label: "Força espiral", min: 0, max: 3.5, step: 0.05 },
  { key: "compressionDuration", label: "Duração da compressão", min: 0.08, max: 0.24, step: 0.01 },
  { key: "coreSize", label: "Tamanho do núcleo", min: 0.04, max: 0.28, step: 0.01 },
  { key: "coreEmission", label: "Emissão do núcleo", min: 1, max: 14, step: 0.25 },
  { key: "buildupLight", label: "Luz de preparação", min: 0, max: 8, step: 0.1 },
  { key: "impactLight", label: "Luz do impacto", min: 1, max: 36, step: 0.5 },
  { key: "lightRadius", label: "Alcance da luz", min: 1, max: 8, step: 0.1 },
  { key: "shellRadius", label: "Raio da onda", min: 0.7, max: 3.5, step: 0.05 },
  { key: "shellSpeed", label: "Velocidade da onda", min: 3, max: 18, step: 0.25 },
  { key: "distortionStrength", label: "Distorção da onda", min: 0, max: 0.5, step: 0.01 },
  { key: "residualLifetime", label: "Duração residual", min: 0.2, max: 1.2, step: 0.02 },
];

type BlessNumericKey = { [K in keyof BlessVfxSettings]: BlessVfxSettings[K] extends number ? K : never }[keyof BlessVfxSettings];
type BlessToggleKey = { [K in keyof BlessVfxSettings]: BlessVfxSettings[K] extends boolean ? K : never }[keyof BlessVfxSettings];
const BLESS_SLIDERS: { key: BlessNumericKey; label: string; min: number; max: number; step: number; integer?: boolean }[] = [
  { key: "waveSpeed", label: "Velocidade da onda", min: 0.5, max: 1.8, step: 0.05 },
  { key: "waveRadius", label: "Raio da onda", min: 0.75, max: 1.15, step: 0.01 },
  { key: "waveHeight", label: "Altura da onda", min: 0.1, max: 0.8, step: 0.01 },
  { key: "waveThickness", label: "Espessura da onda", min: 0.04, max: 0.25, step: 0.01 },
  { key: "waveTurbulence", label: "Turbulência da onda", min: 0, max: 0.5, step: 0.01 },
  { key: "casterParticles", label: "Partículas do conjurador", min: 8, max: 64, step: 1, integer: true },
  { key: "allyParticles", label: "Partículas por aliado", min: 8, max: 48, step: 1, integer: true },
  { key: "strandCount", label: "Fios por aliado", min: 4, max: 10, step: 1, integer: true },
  { key: "strandThickness", label: "Espessura dos fios", min: 0.01, max: 0.06, step: 0.002 },
  { key: "strandHeight", label: "Altura dos fios", min: 0.35, max: 1.4, step: 0.02 },
  { key: "strandCurvature", label: "Curvatura dos fios", min: 0, max: 1.1, step: 0.02 },
  { key: "absorptionSpeed", label: "Velocidade de absorção", min: 0.5, max: 1.8, step: 0.05 },
  { key: "emissive", label: "Emissão HDR", min: 0, max: 10, step: 0.1 },
  { key: "casterLight", label: "Luz do conjurador", min: 0, max: 16, step: 0.25 },
  { key: "casterLightRadius", label: "Raio da luz central", min: 1, max: 9, step: 0.1 },
  { key: "allyLight", label: "Luz por aliado", min: 0, max: 8, step: 0.1 },
  { key: "allyLightRadius", label: "Raio da luz dos aliados", min: 0.5, max: 5, step: 0.1 },
  { key: "lightDecay", label: "Decaimento da luz", min: 0.4, max: 1.6, step: 0.05 },
  { key: "duration", label: "Duração total", min: 1, max: 2.4, step: 0.05 },
];

type MagicMissileNumericKey = { [K in keyof MagicMissileV2Settings]: MagicMissileV2Settings[K] extends number ? K : never }[keyof MagicMissileV2Settings];
type MagicMissileToggleKey = { [K in keyof MagicMissileV2Settings]: MagicMissileV2Settings[K] extends boolean ? K : never }[keyof MagicMissileV2Settings];
const MAGIC_MISSILE_V2_SLIDERS: { key: MagicMissileNumericKey; label: string; min: number; max: number; step: number; integer?: boolean }[] = [
  { key: "missileCount", label: "Mísseis no editor", min: 1, max: 3, step: 1, integer: true },
  { key: "missileScale", label: "Escala do projétil", min: 0.08, max: 0.55, step: 0.01 },
  { key: "formationSpacing", label: "Espaçamento da formação", min: 0.1, max: 0.8, step: 0.01 },
  { key: "launchInterval", label: "Intervalo de lançamento", min: 0.03, max: 0.18, step: 0.005 },
  { key: "projectileSpeed", label: "Velocidade", min: 4, max: 24, step: 0.5 },
  { key: "acceleration", label: "Aceleração", min: 0.5, max: 3.5, step: 0.05 },
  { key: "trajectoryCurvature", label: "Curvatura", min: 0, max: 1.4, step: 0.02 },
  { key: "trajectoryHeight", label: "Altura da trajetória", min: 0, max: 1.8, step: 0.02 },
  { key: "seekingStrength", label: "Busca do alvo", min: 0, max: 1, step: 0.02 },
  { key: "turbulence", label: "Turbulência", min: 0, max: 0.5, step: 0.01 },
  { key: "shellDistortion", label: "Distorção da carapaça", min: 0, max: 1, step: 0.02 },
  { key: "trailLength", label: "Comprimento da trilha", min: 0.1, max: 0.8, step: 0.01 },
  { key: "trailThickness", label: "Espessura da trilha", min: 0.02, max: 0.2, step: 0.005 },
  { key: "trailFragmentation", label: "Fragmentação da trilha", min: 0, max: 1, step: 0.02 },
  { key: "particleCount", label: "Partículas por míssil", min: 0, max: 80, step: 1, integer: true },
  { key: "emissive", label: "Emissão HDR", min: 0, max: 12, step: 0.1 },
  { key: "travelLightIntensity", label: "Luz em voo", min: 0, max: 14, step: 0.25 },
  { key: "travelLightRadius", label: "Raio da luz em voo", min: 0.5, max: 8, step: 0.1 },
  { key: "impactSize", label: "Tamanho do impacto", min: 0.1, max: 0.9, step: 0.01 },
  { key: "impactLightIntensity", label: "Luz do impacto", min: 0, max: 32, step: 0.5 },
  { key: "impactLightRadius", label: "Raio da luz de impacto", min: 0.5, max: 8, step: 0.1 },
  { key: "finalImpactMultiplier", label: "Multiplicador final", min: 1, max: 1.5, step: 0.01 },
];

function mountVfxPreview(canvas: HTMLCanvasElement, state: MutableRefObject<PreviewState>, controls: MutableRefObject<PreviewControls | null>): () => void {
  let disposed = false;
  let raf = 0;
  let last = performance.now();
  let simulationClock = 0;
  let emitter: ParticleEmitter | null = null;
  let impact: FireballImpactVFX | null = null;
  let impactV2: FireballExplosionV2 | null = null;
  let phantasmal: PhantasmalForceVFX | null = null;
  let bless: BlessVFX | null = null;
  let magicMissileV2: MagicMissileV2VFX | null = null;
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

  // A simple posed 3D combatant gives the inward field a real front/behind target in the
  // editor preview, matching the spatial relationship used on the live battlefield.
  const subject = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x77736f, roughness: 0.78, metalness: 0.22 });
  const darkArmor = new THREE.MeshStandardMaterial({ color: 0x29272a, roughness: 0.88, metalness: 0.12 });
  const makeBodyPart = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    subject.add(mesh);
  };
  makeBodyPart(new THREE.CylinderGeometry(0.2, 0.24, 0.52, 8), armor, 0, 0.68, 0);
  makeBodyPart(new THREE.SphereGeometry(0.18, 12, 10), darkArmor, 0, 1.06, 0);
  makeBodyPart(new THREE.CylinderGeometry(0.075, 0.11, 0.43, 7), darkArmor, -0.13, 0.23, 0, 1, 1, 1);
  makeBodyPart(new THREE.CylinderGeometry(0.075, 0.11, 0.43, 7), darkArmor, 0.13, 0.23, 0, 1, 1, 1);
  makeBodyPart(new THREE.CylinderGeometry(0.07, 0.09, 0.46, 7), armor, -0.28, 0.72, 0, 1, 1, 1);
  makeBodyPart(new THREE.CylinderGeometry(0.07, 0.09, 0.46, 7), armor, 0.28, 0.72, 0, 1, 1, 1);
  baseScene.add(subject);
  const phantasmalTarget = new THREE.Vector3(0, 0.78, 0);
  phantasmal = new PhantasmalForceVFX(baseScene);
  phantasmal.setSettings(state.current.phantasmalSettings);
  phantasmal.hide();
  bless = new BlessVFX(baseScene);
  bless.setSettings(state.current.blessSettings);
  bless.hide();
  magicMissileV2 = new MagicMissileV2VFX(baseScene);
  magicMissileV2.setSettings(state.current.magicMissileV2Settings);
  magicMissileV2.hide();
  const previewBless = () => bless?.castSpell({
    id: "bless-preview",
    center: new THREE.Vector3(0, 0.18, 0.08),
    radiusWorld: 2.1,
    allies: [
      { id: "preview-near", position: new THREE.Vector3(0.56, -0.1, 0.05), distanceHexes: 1 },
      { id: "preview-mid", position: new THREE.Vector3(-0.92, 0.42, 0.1), distanceHexes: 2 },
      { id: "preview-edge", position: new THREE.Vector3(0.42, -1.16, 0.12), distanceHexes: 3 },
    ],
    onApply: () => {},
    onComplete: () => { state.current.playing = state.current.looping; },
  });
  const previewMagicMissileV2 = (target = new THREE.Vector3(0.95, 0.82, 0.12)) => magicMissileV2?.castSpell({
    id: "magic-missile-v2-preview",
    origin: new THREE.Vector3(-1.15, 1.18, 0.1),
    target,
    missileCount: state.current.magicMissileV2Settings.missileCount,
    onImpact: () => {},
    onComplete: () => { state.current.playing = state.current.looping; },
  });

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
      if (state.current.mode === "phantasmal" && phantasmal) {
        phantasmal.restartAt(phantasmalTarget, 1, { onComplete: () => { state.current.playing = state.current.looping; } });
        return;
      }
      if (state.current.mode === "bless") { previewBless(); return; }
      if (state.current.mode === "magic-missile-v2") { previewMagicMissileV2(); return; }
      if (state.current.mode === "impact-v2" && impactV2) { impactV2.restart(); return; }
      if (state.current.mode === "impact" && impact) { impact.restart(state.current.impactSettings); return; }
      if (!emitter) return;
      simulationClock = 0;
      emitter.reset(state.current.settings, true);
    },
    frameStep: () => {
      if (state.current.mode === "phantasmal" && phantasmal) { phantasmal.update(1 / 24); return; }
      if (state.current.mode === "bless" && bless) { bless.update(1 / 24); return; }
      if (state.current.mode === "magic-missile-v2" && magicMissileV2) { magicMissileV2.update(1 / 24); return; }
      if (state.current.mode === "impact-v2" && impactV2) { impactV2.update(1 / 24, state.current.looping); return; }
      if (state.current.mode === "impact" && impact) { impact.update(1 / Math.max(1, state.current.impactSettings.flipbookFps), state.current.impactSettings, state.current.looping, camera); return; }
      if (!emitter) return;
      const s = state.current.settings;
      emitter.update(1 / Math.max(1, s.flipbookFps), s, state.current.looping);
      simulationClock += 1 / Math.max(1, s.flipbookFps);
      if (flipbook) emitter.material.uniforms.uFlipbook!.value = flipbook;
    },
    setPhantasmalSettings: (next) => phantasmal?.setSettings(next),
    setBlessSettings: (next) => bless?.setSettings(next),
    setMagicMissileV2Settings: (next) => magicMissileV2?.setSettings(next),
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
    if (state.current.mode === "phantasmal" && phantasmal) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(top, false)[0];
      if (!hit) return;
      const position = hit.point.clone().setY(0.78);
      phantasmal.restartAt(position, 1, { onComplete: () => { state.current.playing = state.current.looping; } });
      state.current.playing = true;
      return;
    }
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
    if (state.current.mode === "magic-missile-v2" && magicMissileV2) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(top, false)[0];
      if (!hit) return;
      previewMagicMissileV2(hit.point.clone().setY(0.82));
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
    if (state.current.mode === "phantasmal") {
      camera.position.set(3.2, 3.1, 5.8);
      camera.lookAt(0, 0.62, 0);
    } else if (state.current.mode === "bless" || state.current.mode === "magic-missile-v2") {
      camera.position.set(0.15, 2.7, 5.7);
      camera.lookAt(0, 0.15, 0);
    } else {
      camera.position.set(2.25, 2.75, 3.35);
      camera.lookAt(0, 0.48, 0);
    }
    bloomPass.enabled = state.current.mode === "bless" ? state.current.blessSettings.bloom : state.current.mode === "magic-missile-v2" ? state.current.magicMissileV2Settings.bloom : state.current.bloomEnabled;
    if (state.current.mode !== "phantasmal") phantasmal?.hide();
    else if (phantasmal && state.current.playing) phantasmal.update(dt);
    if (state.current.mode !== "bless") bless?.hide();
    else if (bless && state.current.playing) bless.update(dt);
    if (state.current.mode !== "magic-missile-v2") magicMissileV2?.hide();
    else if (magicMissileV2 && state.current.playing) magicMissileV2.update(dt);
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
    phantasmal?.dispose();
    bless?.dispose();
    magicMissileV2?.dispose();
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
    for (const part of subject.children) {
      if (part instanceof THREE.Mesh) part.geometry.dispose();
    }
    stoneMat.dispose();
    stoneMat2.dispose();
    armor.dispose();
    darkArmor.dispose();
  };
}

export function VfxDebugPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PreviewControls | null>(null);
  const [settings, setSettings] = useState(DEFAULT_FIRE_EMITTER);
  const [impactSettings, setImpactSettings] = useState(DEFAULT_IMPACT_SETTINGS);
  const [phantasmalSettings, setPhantasmalSettings] = useState(() => getActivePhantasmalForceSettings());
  const [blessSettings, setBlessSettings] = useState(() => getActiveBlessVfxSettings());
  const [magicMissileV2Settings, setMagicMissileV2Settings] = useState(() => getActiveMagicMissileV2Settings());
  const [mode, setMode] = useState<"flame" | "impact" | "impact-v2" | "phantasmal" | "bless" | "magic-missile-v2">("flame");
  const [playing, setPlaying] = useState(true);
  const [looping, setLooping] = useState(true);
  const [bloomEnabled, setBloomEnabled] = useState(false);
  const stateRef = useRef<PreviewState>({ settings, impactSettings, phantasmalSettings, blessSettings, magicMissileV2Settings, mode, playing, looping, bloomEnabled });
  stateRef.current = { settings, impactSettings, phantasmalSettings, blessSettings, magicMissileV2Settings, mode, playing, looping, bloomEnabled };

  const switchMode = (next: "flame" | "impact" | "impact-v2" | "phantasmal" | "bless" | "magic-missile-v2") => {
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

  const updatePhantasmalSetting = (key: keyof PhantasmalForceSettings, value: number) => {
    const next = { ...stateRef.current.phantasmalSettings, [key]: value };
    stateRef.current.phantasmalSettings = next;
    setActivePhantasmalForceSettings(next);
    runtimeRef.current?.setPhantasmalSettings(next);
    setPhantasmalSettings(next);
  };

  const updateBlessSetting = <K extends keyof BlessVfxSettings>(key: K, value: BlessVfxSettings[K]) => {
    const next = { ...stateRef.current.blessSettings, [key]: value };
    stateRef.current.blessSettings = next;
    setActiveBlessVfxSettings(next);
    runtimeRef.current?.setBlessSettings(next);
    setBlessSettings(next);
  };

  const updateMagicMissileV2Setting = <K extends keyof MagicMissileV2Settings>(key: K, value: MagicMissileV2Settings[K]) => {
    const next = { ...stateRef.current.magicMissileV2Settings, [key]: value };
    stateRef.current.magicMissileV2Settings = next;
    setActiveMagicMissileV2Settings(next);
    runtimeRef.current?.setMagicMissileV2Settings(next);
    setMagicMissileV2Settings(next);
  };

  const restart = () => { stateRef.current.playing = true; setPlaying(true); runtimeRef.current?.restart(); };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const savedImpactSettings = getActiveImpactSettings();
    const savedPhantasmalSettings = getActivePhantasmalForceSettings();
    const savedBlessSettings = getActiveBlessVfxSettings();
    const savedMagicMissileV2Settings = getActiveMagicMissileV2Settings();
    stateRef.current.impactSettings = savedImpactSettings;
    stateRef.current.phantasmalSettings = savedPhantasmalSettings;
    stateRef.current.blessSettings = savedBlessSettings;
    stateRef.current.magicMissileV2Settings = savedMagicMissileV2Settings;
    setImpactSettings(savedImpactSettings);
    setPhantasmalSettings(savedPhantasmalSettings);
    setBlessSettings(savedBlessSettings);
    setMagicMissileV2Settings(savedMagicMissileV2Settings);
    return mountVfxPreview(canvas, stateRef, runtimeRef);
  }, []);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-bg/40 p-4" aria-label="VFX debug editor">
      <div>
        <p className="text-sm uppercase tracking-[0.14em] text-muted">Laboratório VFX · etapa {mode === "flame" ? "01" : mode === "phantasmal" ? "03" : mode === "bless" ? "04" : mode === "magic-missile-v2" ? "05" : "02"}</p>
        <label className="mt-2 flex flex-col gap-1 text-sm">
          <span className="text-muted">Efeito</span>
          <select aria-label="Selecionar efeito VFX" value={mode} onChange={(event) => switchMode(event.target.value as "flame" | "impact" | "impact-v2" | "phantasmal" | "bless" | "magic-missile-v2")} className="min-h-11 rounded-md border border-border bg-bg px-3 py-2 font-display text-lg text-fg focus:border-accent focus:outline-none">
            <option value="flame">Emissor de fogo estacionário</option>
            <option value="impact">Explosão de impacto Fireball · original</option>
            <option value="impact-v2">Explosão V2 · novas folhas de fogo e fumaça</option>
            <option value="phantasmal">Força Fantasmal · 3D compressão espectral</option>
            <option value="bless">Bless · onda dourada 3D e luz real</option>
            <option value="magic-missile-v2">Míssil Mágico V2 · projéteis arcanos 3D</option>
          </select>
        </label>
        <p className="text-sm text-muted mt-1">{mode === "flame" ? "Chama contínua ancorada em um hex de batalha." : mode === "impact-v2" ? "Nova versão com os flipbooks de fogo e fumaça anexados. A explosão original continua disponível acima." : mode === "phantasmal" ? "Força 3D que envolve o alvo, comprime energia espectral para dentro e libera uma onda real no espaço. Clique no hex para reposicionar." : mode === "bless" ? "Bless reúne energia no conjurador, propaga a onda por três hexes e envolve cada aliado na ordem em que ela chega. A luz real e o bônus são os mesmos usados no combate." : mode === "magic-missile-v2" ? "Projéteis violetas em trajetórias curvas 3D, com trilhas procedurais, impactos sincronizados e luz real. Clique no tabuleiro para trocar o alvo. Magic Missile V1 continua reservado aos inimigos." : "Clique no hex para posicionar e repetir a explosão original. Câmera fixa; sem projétil ou AOE. Ajustes salvos automaticamente neste navegador e aplicados às próximas conjurações de Fireball."}</p>
      </div>
      <canvas ref={canvasRef} onPointerDown={() => { if (mode !== "flame") { stateRef.current.playing = true; setPlaying(true); } }} className={`w-full h-80 rounded-lg border border-border bg-black/40 ${mode !== "flame" ? "cursor-crosshair" : ""}`} aria-label="3D spell effect preview" />
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
      </> : mode === "impact-v2" ? <p className="rounded-md border border-border px-3 py-3 text-sm text-muted">V2 usa as três folhas animadas de fogo e a folha de fumaça enviadas nesta conversa. Clique no hex para reposicionar e reiniciar.</p> : mode === "phantasmal" ? <>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => updatePhantasmalSetting("seed", Math.floor(Math.random() * 999999) + 1)} className="min-h-11 rounded-md border border-accent bg-accent/10 px-3 py-2 hover:bg-accent/20">Sortear semente · {phantasmalSettings.seed}</button>
          <button type="button" onClick={() => { const defaults = { ...DEFAULT_PHANTASMAL_FORCE_SETTINGS }; stateRef.current.phantasmalSettings = defaults; setPhantasmalSettings(defaults); setActivePhantasmalForceSettings(defaults); runtimeRef.current?.setPhantasmalSettings(defaults); restart(); }} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Restaurar valores padrão</button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PHANTASMAL_SLIDERS.map(({ key, label, min, max, step, integer }) => (
            <label key={key} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
              <span className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><output className="tabular-nums text-muted">{integer ? Math.round(phantasmalSettings[key]) : phantasmalSettings[key].toFixed(2)}</output></span>
              <input aria-label={label} type="range" min={min} max={max} step={step} value={phantasmalSettings[key]} onChange={(event) => updatePhantasmalSetting(key, Number(event.target.value))} />
            </label>
          ))}
        </div>
      </> : mode === "magic-missile-v2" ? <>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => updateMagicMissileV2Setting("seed", Math.floor(Math.random() * 999999) + 1)} className="min-h-11 rounded-md border border-accent bg-accent/10 px-3 py-2 hover:bg-accent/20">Sortear semente · {magicMissileV2Settings.seed}</button>
          <button type="button" onClick={() => { const defaults = { ...DEFAULT_MAGIC_MISSILE_V2_SETTINGS }; stateRef.current.magicMissileV2Settings = defaults; setMagicMissileV2Settings(defaults); setActiveMagicMissileV2Settings(defaults); runtimeRef.current?.setMagicMissileV2Settings(defaults); restart(); }} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Restaurar valores padrão</button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MAGIC_MISSILE_V2_SLIDERS.map(({ key, label, min, max, step, integer }) => (
            <label key={key} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
              <span className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><output className="tabular-nums text-muted">{integer ? Math.round(magicMissileV2Settings[key]) : magicMissileV2Settings[key].toFixed(2)}</output></span>
              <input aria-label={label} type="range" min={min} max={max} step={step} value={magicMissileV2Settings[key]} onChange={(event) => updateMagicMissileV2Setting(key, Number(event.target.value))} />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([ ["geometry", "Geometria dos projéteis"], ["trails", "Trilhas 3D"], ["particles", "Partículas instanciadas"], ["emissiveEnabled", "Emissão HDR"], ["lights", "Luzes dinâmicas reais"], ["bloom", "Bloom"] ] as [MagicMissileToggleKey, string][]).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={magicMissileV2Settings[key]} onChange={(event) => updateMagicMissileV2Setting(key, event.target.checked)} /></label>
          ))}
        </div>
      </> : mode === "bless" ? <>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => updateBlessSetting("seed", Math.floor(Math.random() * 999999) + 1)} className="min-h-11 rounded-md border border-accent bg-accent/10 px-3 py-2 hover:bg-accent/20">Sortear semente · {blessSettings.seed}</button>
          <button type="button" onClick={() => { const defaults = { ...DEFAULT_BLESS_VFX_SETTINGS }; stateRef.current.blessSettings = defaults; setBlessSettings(defaults); setActiveBlessVfxSettings(defaults); runtimeRef.current?.setBlessSettings(defaults); restart(); }} className="min-h-11 rounded-md border border-border px-3 py-2 hover:border-accent">Restaurar valores padrão</button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BLESS_SLIDERS.map(({ key, label, min, max, step, integer }) => (
            <label key={key} className="flex flex-col gap-1 rounded-md border border-border px-3 py-2">
              <span className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><output className="tabular-nums text-muted">{integer ? Math.round(blessSettings[key]) : blessSettings[key].toFixed(2)}</output></span>
              <input aria-label={label} type="range" min={min} max={max} step={step} value={blessSettings[key]} onChange={(event) => updateBlessSetting(key, Number(event.target.value))} />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([ ["geometry", "Geometria 3D"], ["particles", "Partículas"], ["emissiveEnabled", "Emissivo"], ["lights", "Luzes dinâmicas"], ["bloom", "Bloom"] ] as [BlessToggleKey, string][]).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><span>{label}</span><input type="checkbox" checked={blessSettings[key]} onChange={(event) => updateBlessSetting(key, event.target.checked)} /></label>
          ))}
        </div>
      </> : null}
      {mode !== "bless" && mode !== "magic-missile-v2" && <label className="flex min-h-11 items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><span>Bloom de pós-processamento</span><input type="checkbox" checked={bloomEnabled} onChange={(event) => { stateRef.current.bloomEnabled = event.target.checked; setBloomEnabled(event.target.checked); }} /></label>}
      <p className="text-xs leading-relaxed text-muted">{mode === "flame" ? "Flipbook com 16 quadros · partículas instanciadas · suavização por profundidade · luz real no terreno" : mode === "impact-v2" ? "Versão adicional · sprites anexados em flipbook · fogo, fumaça e luz · a explosão Etapa 02 permanece preservada" : mode === "phantasmal" ? "Tendril meshes com profundidade real · partículas instanciadas · PointLight violeta com sombras · semente determinística; ajustes persistem e valem no combate" : mode === "bless" ? "Onda radius-3 · chegada sincronizada por aliado · PointLights reais no caster e na equipe · as configurações persistem e também regem conjurações de combate" : mode === "magic-missile-v2" ? "Procedural 3D e splines no espaço do mundo · PointLights reais durante o voo e em cada impacto · controles salvos e usados na magia do jogador; inimigos mantêm V1" : "Timeline de impacto original · partículas em um draw call · mesma semente reproduz o mesmo padrão · bloom começa desligado para avaliar a estrutura"}</p>
    </section>
  );
}
