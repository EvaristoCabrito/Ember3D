import * as THREE from "three";
import { drawElevationSteps } from "../../elevationSteps";

/** One reused texture per exposed height profile, with relief beneath sprites and water. */
export class ThreeElevationSteps {
  readonly group = new THREE.Group();
  private geometry = new THREE.PlaneGeometry(1, 1);
  private materials = new Map<string, THREE.MeshBasicMaterial>();
  rebuild(cols: number, rows: number, tile: number, height: (col: number, row: number) => number): void {
    this.group.clear();
    for (const material of this.materials.values()) { material.map?.dispose(); material.dispose(); }
    this.materials.clear();
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const level = height(col, row);
      if (level <= 0) continue;
      // Edges run clockwise from the right side, matching the hex's vertex order.
      const right = row & 1;
      const neighbors = [[col+1,row],[col+right,row+1],[col+right-1,row+1],
        [col-1,row],[col+right-1,row-1],[col+right,row-1]].map(([c,r]) => height(c!,r!));
      if (neighbors.every(value => value >= level)) continue;
      const key = JSON.stringify([level, neighbors]);
      let material = this.materials.get(key);
      if (!material) {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
        drawElevationSteps(canvas.getContext("2d")!, 64, 64, 62, level, neighbors);
        const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
        material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
        this.materials.set(key, material);
      }
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.scale.set(tile * 2 * 64 / 62, tile * 2 * 64 / 62, 1);
      mesh.position.set(tile * Math.sqrt(3) * (col + 0.5*(row&1)+0.5), -tile*(2.4+1.5*row+1), 0.2);
      this.group.add(mesh);
    }
  }
  dispose(): void {
    this.group.removeFromParent(); this.group.clear(); this.geometry.dispose();
    for (const material of this.materials.values()) { material.map?.dispose(); material.dispose(); }
    this.materials.clear();
  }
}
