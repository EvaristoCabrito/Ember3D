import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** These meshes use Z as up; Three's default hemisphere assumes Y is up. */
export function lightTacticsMaterial(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_pars_begin>",
      THREE.ShaderChunk.lights_pars_begin.replace(
        "float dotNL = dot( normal, hemiLight.direction );",
        "float dotNL = dot( normal, (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz );"));
  };
  material.customProgramCacheKey = () => "tactics-z-up-lighting-v1";
}

const TREES = new Set(["dead-tree", "dead-tree-large", "wilds-twisted-tree", "wilds-gibbet-tree", "wilds-snowy-dead-tree", "wilds-ancestral-tree", "dense-forest"]);
const ROCKS = new Set(["spike-rocks", "spike-rocks-2", "rocky-outcrop", "boulder-pile", "large-boulder", "mossy-rocks", "twin-spires"]);
const HOUSES = new Set(["small-house", "stone-hut"]);

/** First tactics-view models; each owns its materials so occlusion fading is per prop. */
export function tacticsProp(id: string, w: number, h: number, stone: THREE.Texture, timber: THREE.Texture): THREE.Mesh | null {
  // Keep authored tree artwork; generic branch models do not match these maps.
  if (TREES.has(id)) return null;
  if (!TREES.has(id) && !ROCKS.has(id) && !HOUSES.has(id)) return null;
  const parts: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const add = (geometry: THREE.BufferGeometry, color: number, map?: THREE.Texture) => {
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    const material = new THREE.MeshStandardMaterial({ color, ...(map ? { map } : {}), roughness: 1, flatShading: true, transparent: true });
    lightTacticsMaterial(material);
    materials.push(material);
  };
  if (TREES.has(id)) {
    const trunkH = h * 0.75;
    add(new THREE.CylinderGeometry(w * 0.035, w * 0.075, trunkH, 7).rotateX(Math.PI / 2).translate(0, 0, trunkH / 2), 0x80664d, timber);
    for (let i = 0; i < 7; i++) {
      const az = i * 2.399;
      const start = new THREE.Vector3(0, 0, trunkH * (0.3 + i * 0.08));
      const end = new THREE.Vector3(Math.cos(az) * w * 0.35, Math.sin(az) * w * 0.35, start.z + h * 0.24);
      const direction = end.clone().sub(start);
      const branch = new THREE.CylinderGeometry(w * 0.008, w * 0.023, direction.length(), 5);
      branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      branch.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
      add(branch, 0x80664d, timber);
    }
    if (id === "dense-forest" || id === "wilds-ancestral-tree") {
      for (let i = 0; i < 3; i++) add(new THREE.IcosahedronGeometry(1, 1).scale(w * 0.3, w * 0.25, h * 0.24).translate((i - 1) * w * 0.2, 0, h * 0.72), 0x4e6035);
    }
  } else if (ROCKS.has(id)) {
    for (let i = 0; i < 3; i++) {
      const radius = w * (i === 0 ? 0.32 : 0.22);
      const height = h * (id.includes("spike") || id.includes("spire") ? 0.8 : 0.35);
      add(new THREE.IcosahedronGeometry(1, 1).scale(radius, radius * 0.8, height / 2).rotateZ(i * 1.2).translate((i - 1) * w * 0.2, i === 1 ? w * 0.1 : 0, height / 2), id === "mossy-rocks" ? 0x879379 : 0xb8b0a2, stone);
    }
  } else {
    const depth = w * 0.65, wallH = h * 0.55, roofH = h * 0.25;
    add(new THREE.BoxGeometry(w, depth, wallH).translate(0, 0, wallH / 2), 0xb6aaa0, stone);
    add(new THREE.CylinderGeometry(0, 1, roofH, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(w * 0.78, depth * 0.78, 1).translate(0, 0, wallH + roofH / 2), 0x655043, timber);
  }
  // Indexed primitives must all have the same attribute set for merging.
  const geometry = mergeGeometries(parts, true)!;
  parts.forEach(part => part.dispose());
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.tacticsModel = true;
  return mesh;
}
