import * as THREE from "three";

export interface LandscapeSurface {
  geometry: THREE.BufferGeometry;
  minX: number; minY: number; maxX: number; maxY: number;
  heightAt(x: number, y: number): number;
}

/** Continuous triangular landscape; gameplay hexes supply heights, never mesh topology. */
export function buildLandscape(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  spacing: number, baseDepth: number,
  elevation: (x: number, y: number) => number,
  land: (x: number, y: number) => boolean,
): LandscapeSurface {
  const { minX, minY, maxX, maxY } = bounds;
  const cols = Math.max(1, Math.ceil((maxX - minX) / spacing));
  const rows = Math.max(1, Math.ceil((maxY - minY) / spacing));
  const dx = (maxX - minX) / cols, dy = (maxY - minY) / rows;
  const vertices: number[] = [], uv: number[] = [], heights: number[] = [], indices: number[] = [];
  const edgeCounts = new Map<string, { a: number; b: number; count: number }>();
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const x = minX + col * dx, y = minY + row * dy;
    const z = elevation(x, y);
    heights.push(z); vertices.push(x, y, z); uv.push(col / cols, row / rows);
  }
  const triangle = (a: number, b: number, c: number) => {
    const x = (vertices[a * 3] + vertices[b * 3] + vertices[c * 3]) / 3;
    const y = (vertices[a * 3 + 1] + vertices[b * 3 + 1] + vertices[c * 3 + 1]) / 3;
    if (!land(x, y)) return;
    indices.push(a, b, c);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = `${Math.min(u, v)}:${Math.max(u, v)}`;
      const edge = edgeCounts.get(key);
      if (edge) edge.count++;
      else edgeCounts.set(key, { a: u, b: v, count: 1 });
    }
  };
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const a = row * (cols + 1) + col, b = a + 1, d = a + cols + 1, c = d + 1;
    triangle(a, b, d); triangle(b, c, d);
  }
  const topCount = indices.length;
  // Only the landscape's outside boundary gets a cliff face, down to the board underside.
  for (const edge of edgeCounts.values()) {
    if (edge.count !== 1) continue;
    const { a, b } = edge;
    const i = vertices.length / 3;
    vertices.push(vertices[a*3], vertices[a*3+1], heights[a], vertices[b*3], vertices[b*3+1], heights[b],
      vertices[a*3], vertices[a*3+1], -baseDepth, vertices[b*3], vertices[b*3+1], -baseDepth);
    const length = Math.hypot(vertices[a*3]-vertices[b*3], vertices[a*3+1]-vertices[b*3+1]) / spacing;
    uv.push(0, heights[a]/spacing, length, heights[b]/spacing, 0, -baseDepth/spacing, length, -baseDepth/spacing);
    indices.push(i, i+2, i+1, i+1, i+2, i+3);
  }
  // A matching bottom cap closes each top triangle. It shares no vertices with the top.
  const bottomStart = vertices.length / 3;
  for (let i = 0; i < heights.length; i++) {
    vertices.push(vertices[i*3], vertices[i*3+1], -baseDepth); uv.push(0, 0);
  }
  for (let i = 0; i < topCount; i += 3) indices.push(bottomStart+indices[i], bottomStart+indices[i+2], bottomStart+indices[i+1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, topCount, 0);
  geometry.addGroup(topCount, indices.length - topCount, 1);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const heightAt = (x: number, y: number) => {
    const gx = THREE.MathUtils.clamp((x-minX)/dx, 0, cols-0.000001);
    const gy = THREE.MathUtils.clamp((y-minY)/dy, 0, rows-0.000001);
    const col = Math.floor(gx), row = Math.floor(gy), u = gx-col, v = gy-row;
    const a = row*(cols+1)+col, b = a+1, d = a+cols+1, c = d+1;
    // Match the actual triangle, so feet and cursor outlines stay on the rendered surface.
    return u+v <= 1 ? heights[a]+(heights[b]-heights[a])*u+(heights[d]-heights[a])*v
      : heights[c]+(heights[d]-heights[c])*(1-u)+(heights[b]-heights[c])*(1-v);
  };
  return { geometry, heightAt, ...bounds };
}
