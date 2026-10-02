import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Renderer-owned cache: each placed tree has one draw and shared immutable geometry. */
export class ThreeTrees {
  private templates = new Map<string, THREE.BufferGeometry>();
  private loading = new Set<string>();
  private disposed = false;
  revision = 0;

  create(kind: "broadleaf" | "snowy-pine", tile: number): THREE.Mesh | null {
    const template = this.templates.get(kind);
    if (!template) {
      if (!this.loading.has(kind)) {
        this.loading.add(kind);
        new GLTFLoader().load(`/game/models/trees/${kind}.glb`, gltf => {
          const parts: THREE.BufferGeometry[] = [];
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const source = object.geometry;
            const geometry = source.index ? source.toNonIndexed() : source.clone();
            geometry.applyMatrix4(object.matrixWorld);
            geometry.rotateX(Math.PI / 2); // glTF Y-up -> battle Z-up.
            const position = geometry.getAttribute("position");
            const original = geometry.getAttribute("color");
            const color = (object.material as THREE.MeshStandardMaterial).color;
            const colors = new Float32Array(position.count * 3);
            for (let i = 0; i < position.count; i++) {
              colors[i * 3] = color.r * (original?.getX(i) ?? 1);
              colors[i * 3 + 1] = color.g * (original?.getY(i) ?? 1);
              colors[i * 3 + 2] = color.b * (original?.getZ(i) ?? 1);
            }
            for (const name of Object.keys(geometry.attributes)) if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
            if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
            geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
            parts.push(geometry);
            source.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(material => material.dispose());
          });
          const merged = mergeGeometries(parts);
          parts.forEach(part => part.dispose());
          if (!merged) return;
          if (this.disposed) { merged.dispose(); return; }
          merged.computeBoundingBox();
          const box = merged.boundingBox!;
          merged.translate(0, 0, -box.min.z);
          merged.scale(1 / (box.max.z - box.min.z), 1 / (box.max.z - box.min.z), 1 / (box.max.z - box.min.z));
          merged.computeBoundingSphere();
          this.templates.set(kind, merged);
          this.revision++;
        }, undefined, error => { console.error(`Could not load ${kind} tree`, error); });
      }
      return null;
    }
    const mesh = new THREE.Mesh(template, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
    mesh.scale.setScalar(tile * 4.8);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.importedTree = true;
    return mesh;
  }

  dispose(): void {
    this.disposed = true;
    for (const geometry of this.templates.values()) geometry.dispose();
    this.templates.clear();
  }
}
