import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DecorationDef } from "../../types";

/** Remove internal caps at joins so they cannot cast a seam onto a neighboring wall. */
function omitBoxFaces(box: THREE.BoxGeometry, faces: number[]): THREE.BoxGeometry {
  const indices = Array.from(box.index!.array).filter((_, i) => !faces.includes(Math.floor(i / 6)));
  box.setIndex(indices);
  box.clearGroups();
  return box;
}

/** Solid joining walls, following the centers of neighboring architecture cells. */
export function createWallGeometry(def: DecorationDef, tile: number, rotation: number, connections: { x: number; y: number }[] = []): THREE.BufferGeometry {
  const height = tile * 0.5 * (def.heightScale ?? 1);
  let geometry: THREE.BufferGeometry;
  if (def.model3d === "wall") {
    const thickness = tile * 0.32;
    const parts: THREE.BufferGeometry[] = [];
    if (connections.length === 0) {
      const length = tile * ((rotation & 1) ? 1.5 : Math.sqrt(3));
      parts.push(new THREE.BoxGeometry(length, thickness, height).rotateZ(-rotation * Math.PI / 2).translate(0, 0, height / 2));
    } else {
      const openFaces = connections.map(({ x, y }) => Math.abs(x) > Math.abs(y) ? (x > 0 ? 0 : 1) : (y > 0 ? 2 : 3));
      parts.push(omitBoxFaces(new THREE.BoxGeometry(thickness, thickness, height), openFaces).translate(0, 0, height / 2));
      for (const connection of connections) {
        // Each neighbor contributes half a segment. A tiny overlap prevents raster seams.
        const length = Math.hypot(connection.x, connection.y) / 2 + tile * 0.01;
        parts.push(omitBoxFaces(new THREE.BoxGeometry(length, thickness, height), [0, 1])
          .rotateZ(Math.atan2(connection.y, connection.x))
          .translate(connection.x / 4, connection.y / 4, height / 2));
      }
    }
    geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
  } else {
    const width = tile * ((rotation & 1) ? 1.5 : Math.sqrt(3)), post = tile * 0.18, depth = tile * 0.32;
    const box = (w: number, h: number, z: number, x: number, elevation: number) =>
      new THREE.BoxGeometry(w, h, z).translate(x, 0, elevation);
    const parts = [
      box(post, depth, height, -(width - post) / 2, height / 2),
      box(post, depth, height, (width - post) / 2, height / 2),
      box(width - post * 2, depth, height * 0.18, 0, height * 0.91),
    ];
    if (def.model3d === "door") parts.push(box(width - post * 2, tile * 0.12, height * 0.82, 0, height * 0.41));
    geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    geometry.rotateZ(-rotation * Math.PI / 2);
  }
  // The battle camera looks down Z. Shear the vertical geometry toward screen-up to
  // present its height in the existing isometric view while preserving the ground grid.
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + positions.getZ(i) * 3.5);
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
