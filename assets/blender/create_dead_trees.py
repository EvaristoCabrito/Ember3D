"""3D dead trees modeled after the Wisp Forest 2D art: dead oak, broken snag, twisted stump.

  - Dead oak      (wilds-dead-oak):     gnarled multi-stem trunk, slender sprawling roots,
                                        bare forked branches, fine hanging moss, mossy bark.
  - Dead snag     (dead-tree):          tall broken trunk, splintered top, broken limb stubs,
                                        deep furrowed bark with pale weathered flakes.
  - Twisted stump (wilds-twisted-tree): tall hollow trunk split into two jagged prongs,
                                        roots, layered shelf mushrooms, moss.

Bark detail is real geometry: rings every few centimetres, carved plates and furrows
stretched along the grain. Furrow depth also drives the vertex color (dark crevices,
grey-brown ridges, patchy moss), which is how the existing 3D trees reach the game
(ThreeTrees reads COLOR_0). Run:
    blender -b --factory-startup --python assets/blender/create_dead_trees.py
Writes public/game/models/trees/{dead-oak,dead-snag,twisted-stump}.glb, 2D cutout sprites
public/game/decorations/tree-3d-{dead-oak,dead-snag,twisted-stump}.png, preview renders and
assets/blender/dead-trees.blend.
"""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "public" / "game" / "models" / "trees"
SPRITES = ROOT / "public" / "game" / "decorations"
HERE = ROOT / "assets" / "blender"
MODELS.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
UP = Vector((0, 0, 1))


def resample(points, spacing):
    """Catmull-Rom resample so rings sit every `spacing` units (dense bark detail)."""
    out, ts = [], []
    last = len(points) - 1
    for i in range(last):
        p0 = points[max(0, i - 1)]; p1 = points[i]; p2 = points[i + 1]; p3 = points[min(last, i + 2)]
        seg = max(1, int((p2 - p1).length / spacing))
        for s in range(seg):
            t = s / seg
            t2, t3 = t * t, t * t * t
            v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(v); ts.append((i + t) / last)
    out.append(points[-1]); ts.append(1.0)
    return out, ts


class Builder:
    """Accumulates tube/strip geometry with a per-vertex color."""

    def __init__(self, palette):
        self.verts, self.faces, self.colors = [], [], []
        self.p = palette

    def bark_color(self, pos, normal, crevice, moss_amount):
        """crevice 0 = top of a bark plate, 1 = bottom of a furrow."""
        p = self.p
        tint = noise.noise(pos * 0.8 + Vector((4, 2, 8)))
        col = [p["bark"][i] * (1.35 - 1.2 * crevice) * (0.9 + 0.22 * tint) for i in range(3)]
        if p.get("pale"):
            flake = max(0.0, noise.noise(pos * 2.6 + Vector((7, 1, 3))) - 0.3) * 2.4 * (1 - crevice)
            flake = min(1.0, flake)
            col = [c * (1 - flake) + p["pale"][i] * flake for i, c in enumerate(col)]
        up = max(0.0, normal.dot(UP))
        low = max(0.0, 1 - pos.z / p.get("moss_height", 1.5))
        patch = noise.noise(pos * 1.6 + Vector((3, 9, 1))) + 0.35 * noise.noise(pos * 6.0)
        moss = moss_amount * (0.7 * up + 0.5 * low) * max(0.0, (patch + 0.05) * 2.4)
        moss = min(0.85, moss * (1 - 0.4 * crevice))
        mc = [p["moss"][i] * (0.8 + 0.4 * max(0.0, noise.noise(pos * 9))) for i in range(3)]
        return [c * (1 - moss) + mc[i] * moss for i, c in enumerate(col)]

    def tube(self, points, radii, segments=14, gnarl=0.18, moss=1.0, cap_top=True, jag=None,
             bark_depth=0.10, prongs=None, plates=None, plate_len=0.33, twist=0.0):
        """A bark-covered tube along points.
        jag=(depth, seed): splintered top rim. prongs=(angle, depth): split the top into two
        tall prongs, the taller one facing `angle` (hollow twisted-stump look)."""
        r_max = max(radii)
        # Dense enough to carve bark: ~2.5 cm between vertices on trunks, fewer on twigs.
        spacing = max(0.02, min(0.045, r_max * 0.12))
        segments = max(segments, min(72, int(math.tau * r_max / 0.025)))
        pts, ts = resample(points, spacing)
        rad = []
        for t in ts:  # interpolate radii along the resampled path
            f = t * (len(radii) - 1)
            i = min(int(f), len(radii) - 2)
            w = f - i
            rad.append(radii[i] * (1 - w) + radii[i + 1] * w)
        offset = len(self.verts)
        n = len(pts)
        prong_rows = max(1, int(n * 0.4))
        dist = 0.0
        for j, p in enumerate(pts):
            if j:
                dist += (pts[j] - pts[j - 1]).length
            tangent = (pts[min(j + 1, n - 1)] - pts[max(0, j - 1)]).normalized()
            ref = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((1, 0, 0))
            side = tangent.cross(ref).normalized()
            up = tangent.cross(side).normalized()
            r0 = rad[j]
            depth = min(bark_depth * r0, 0.08)
            for k in range(segments):
                a = math.tau * k / segments
                radial = side * math.cos(a) + up * math.sin(a)
                # Bark plates: ridged noise stretched along the grain (vertical furrows).
                # Cracked bark: furrows are the zero-crossings of noise stretched along the
                # grain (~25 plates around a trunk, each ~3x longer than wide), plus a finer
                # second crack network and a little grain noise on the plates.
                # Bark style: `plates` cracks around the trunk, each `plate_len` long, with
                # an optional spiral (twist, radians per unit of length).
                around = plates or max(5.0, min(40.0, math.tau * r_max * 10))
                ring = around / math.tau
                ga = a + twist * dist
                q = Vector((math.cos(ga) * ring, math.sin(ga) * ring, dist / plate_len))
                crack = max(0.0, 1 - abs(noise.noise(q + Vector((0, 0, 3.7)))) * 5)
                crack2 = max(0.0, 1 - abs(noise.noise(q * 2.3 + Vector((5, 1, 0)))) * 7) * 0.55
                grain = 0.15 * (0.5 + 0.5 * noise.noise(q * 6))
                crevice = max(0.0, min(1.0, max(crack, crack2) + grain))
                knot = noise.noise(p * 0.9 + radial * 0.6)
                r = r0 * (1 + gnarl * knot) - depth * crevice
                v = p + radial * r
                if jag is not None and j == n - 1:
                    jd, seed = jag
                    spike = abs(noise.noise(Vector((a * 2.1, seed, 0.0)))) * 1.3 + 0.6 * abs(math.sin(a * 5 + seed))
                    v = v + tangent * (jd * spike - jd * 0.7)
                if prongs and j >= n - 1 - prong_rows:
                    pa, pd = prongs
                    frac = (j - (n - 1 - prong_rows)) / prong_rows
                    # Two prongs: a tall one facing pa, a shorter one opposite it.
                    keep = max(max(0.0, math.cos(a - pa)) ** 1.5, 0.62 * max(0.0, math.cos(a - pa - math.pi)) ** 1.5)
                    v = v - tangent * (1 - keep) * pd * frac
                self.verts.append(v)
                self.colors.append(self.bark_color(v, radial, crevice, moss))
                if j:
                    a0 = offset + (j - 1) * segments + k
                    b0 = offset + (j - 1) * segments + (k + 1) % segments
                    self.faces.append((a0, b0, b0 + segments, a0 + segments))
        self.faces.append(tuple(offset + k for k in reversed(range(segments))))
        if cap_top:
            self.faces.append(tuple(offset + (n - 1) * segments + k for k in range(segments)))
        return offset

    def strip(self, points, width, color):
        """A thin hanging moss strand (two-sided ribbon)."""
        offset = len(self.verts)
        side = Vector((random.uniform(-1, 1), random.uniform(-1, 1), 0)).normalized()
        shade = 0.75 + 0.45 * random.random()
        for j, p in enumerate(points):
            w = width * (1 - 0.8 * j / len(points))
            for s in (-1, 1):
                self.verts.append(p + side * w * s)
                self.colors.append([c * shade * (1.1 - 0.3 * j / len(points)) for c in color])
            if j:
                a = offset + (j - 1) * 2
                self.faces.append((a, a + 1, a + 3, a + 2))

    def shelf(self, center, outward, size, color):
        """A bracket (shelf) mushroom: layered, slightly drooping half-disc with a pale rim."""
        offset = len(self.verts)
        side = outward.cross(UP).normalized()
        rings, spokes = 7, 13
        for i in range(rings + 1):
            t = i / rings
            for k in range(spokes):
                a = math.pi * k / (spokes - 1) - math.pi / 2
                dir_ = outward * math.cos(a) + side * math.sin(a)
                r = size * (0.2 + 0.8 * t) * (1 + 0.08 * math.sin(k * 2.3 + i))
                droop = -0.22 * size * t * t
                v = center + dir_ * r + UP * (droop + 0.07 * size * (1 - t) + 0.015 * math.sin(i * 2.5))
                self.verts.append(v)
                band = 0.7 + 0.3 * (i % 2)
                rim = 1.0 + 0.4 * max(0.0, t - 0.8) * 5
                self.colors.append([min(1.0, c * band * rim) for c in color])
                if i and k:
                    a0 = offset + (i - 1) * spokes + k - 1
                    self.faces.append((a0, a0 + 1, a0 + spokes + 1, a0 + spokes))

    def build(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        mesh.update()
        col = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
        for i, c in enumerate(self.colors):
            col.data[i].color = (*[max(0.0, min(1.0, x)) for x in c], 1.0)
        for poly in mesh.polygons:
            poly.use_smooth = True
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        mat = bpy.data.materials.new(name + " | vertex bark")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = 0.93
        vc = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Col"
        mat.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        mesh.materials.append(mat)
        return obj


def bend(start, direction, length, steps, wander, rise=0.0, seed=0.0):
    """A gnarled path: a direction that keeps drifting, like a dead limb grown in fits."""
    pts = [start.copy()]
    d = direction.normalized()
    step = length / steps
    for i in range(steps):
        jitter = Vector((noise.noise(Vector((seed, i * 0.7, 1))), noise.noise(Vector((seed, i * 0.7, 5))),
                         noise.noise(Vector((seed, i * 0.7, 9))) * 0.5))
        d = (d + jitter * wander + UP * rise).normalized()
        pts.append(pts[-1] + d * step)
    return pts


def roots(b, trunk_r, count, reach, seed, height=0.6, moss=1.0):
    """Slender roots that leave the trunk, dive to the ground and snake outward."""
    for i in range(count):
        a = math.tau * i / count + random.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0))
        lateral = Vector((-out.y, out.x, 0))
        r_len = reach * random.uniform(0.55, 1.3)
        h0 = height * random.uniform(0.45, 1.0)
        thick = trunk_r * random.uniform(0.3, 0.46)
        pts = []
        for s in range(9):
            t = s / 8
            wave = math.sin(t * 7.5 + i * 1.7 + seed) * 0.18 * r_len * t
            z = h0 * max(0.0, 1 - t * 2.6) ** 1.6 + 0.04 * math.sin(t * 9 + i) * (1 - t) - 0.05 * t
            pts.append(out * (trunk_r * 0.15 + (trunk_r * 0.6 + r_len) * t) + lateral * wave + UP * (z + h0 * 0.35 * max(0.0, 1 - t * 4)))
        b.tube(pts, [thick, thick * 0.86, thick * 0.7, thick * 0.56, thick * 0.44, thick * 0.32, thick * 0.21, thick * 0.11, 0.01],
               segments=12, gnarl=0.22, moss=moss)
        if random.random() < 0.55:
            k0 = random.randint(3, 5)
            fa = a + random.choice((-1, 1)) * random.uniform(0.35, 0.8)
            fout = Vector((math.cos(fa), math.sin(fa), 0))
            fpts = [pts[k0]]
            for s in range(1, 5):
                fpts.append(pts[k0] + fout * r_len * 0.18 * s + UP * (-0.012 * s) + lateral * 0.05 * math.sin(s * 2))
            b.tube(fpts, [thick * 0.4, thick * 0.3, thick * 0.2, thick * 0.1, 0.008], segments=8, gnarl=0.2, moss=moss)


def branches(b, origin, direction, length, radius, depth, seed, moss=0.8, strands=None):
    """Recursive bare, forked dead branches with sharp or broken tips."""
    steps = 6
    pts = bend(origin, direction, length, steps, wander=0.5, rise=0.16, seed=seed)
    radii = [radius * (1 - j / (steps + 1)) ** 1.3 + 0.004 for j in range(steps + 1)]
    b.tube(pts, radii, segments=14 if depth >= 2 else 10 if depth == 1 else 7, gnarl=0.2, moss=moss)
    if strands is not None and random.random() < 0.7:
        strands.append(pts[random.randint(2, steps)])
    if depth <= 0:
        return
    for f in range(random.randint(2, 3)):
        at = random.randint(2, steps - 1)
        d = (pts[at] - pts[at - 1]).normalized()
        turn = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.1, 0.7)))
        branches(b, pts[at], (d + turn * 0.9).normalized(), length * random.uniform(0.45, 0.7),
                 radii[at] * 0.72, depth - 1, seed + f * 13.1 + at, moss, strands)


# ---------------------------------------------------------------- dead oak
random.seed(71)
oak = Builder({"bark": (0.12, 0.10, 0.078), "moss": (0.06, 0.08, 0.03), "moss_height": 2.4})
strand_points = []
stem_r = 0.4
for s in range(3):  # three fused stems twisting around each other
    a = math.tau * s / 3 + 0.4
    pts = [Vector((math.cos(a), math.sin(a), 0)) * 0.2]
    for i in range(1, 11):
        twist = a + i * 0.3
        lean = Vector((math.cos(twist), math.sin(twist), 0)) * (0.2 + 0.06 * i)
        pts.append(lean + UP * (i * 0.45))
    oak.tube(pts, [stem_r * (1 - i / 17) ** 1.1 for i in range(11)], segments=32, gnarl=0.2, bark_depth=0.15,
             plates=30, plate_len=0.9, twist=0.35)
    top = pts[-1]
    out = Vector((math.cos(a + 2.6), math.sin(a + 2.6), 0))
    for k in range(2):
        top_r = stem_r * (1 - 10 / 17) ** 1.1 * 0.95
        branches(oak, pts[-2], out + UP * (1.1 + 0.4 * k) + Vector((random.uniform(-.5, .5), random.uniform(-.5, .5), 0)),
                 2.4 - 0.4 * k, top_r, 2, seed=s * 7 + k, moss=0.6, strands=strand_points)
    branches(oak, pts[5], out * 1.4 + UP * 0.6, 2.0, 0.1, 2, seed=s * 11 + 5, moss=0.6, strands=strand_points)
    branches(oak, pts[7], -out * 1.2 + UP * 0.8, 1.6, 0.08, 1, seed=s * 17 + 2, moss=0.6, strands=strand_points)
roots(oak, 0.75, 16, 2.4, seed=3, height=1.1)
for p in strand_points:  # fine hanging grey-green moss
    for m in range(random.randint(4, 8)):
        start = p + Vector((random.uniform(-.1, .1), random.uniform(-.1, .1), 0))
        length = random.uniform(0.2, 0.75)
        phase = random.uniform(0, 6)
        pts = [start + Vector((0.008 * math.sin(t * 6 + phase), 0.008 * math.cos(t * 5 + phase), -length * t))
               for t in [i / 7 for i in range(8)]]
        oak.strip(pts, 0.012, (0.12, 0.13, 0.095))
oak_obj = oak.build("Dead oak | gnarled trunk, roots, branches, moss")

# ---------------------------------------------------------------- dead snag
random.seed(23)
snag = Builder({"bark": (0.095, 0.08, 0.066), "moss": (0.06, 0.07, 0.035), "pale": (0.32, 0.30, 0.27), "moss_height": 1.0})
spine = [UP * 0.0]
for i in range(1, 12):
    spine.append(Vector((0.06 * math.sin(i * 0.8), 0.05 * math.cos(i * 0.6), i * 0.5)))
snag.tube(spine, [0.6 * (1 - i / 15) ** 0.9 for i in range(12)], segments=32, gnarl=0.14, moss=0.3,
          jag=(1.0, 2.0), bark_depth=0.16, plates=22, plate_len=0.28)
fork = spine[8]  # a split-off second spire, also splintered
spire = bend(fork, Vector((0.55, -0.25, 1.0)), 1.8, 4, wander=0.15, rise=0.1, seed=4)
snag.tube(spire, [0.24, 0.21, 0.17, 0.13, 0.1], segments=18, gnarl=0.16, moss=0.2, jag=(0.45, 7.0), bark_depth=0.16)
for i, (z, a, ln) in enumerate([(2.7, 0.4, 0.9), (3.6, 2.9, 1.4), (4.3, 4.6, 0.8), (2.0, 3.8, 0.55), (4.9, 1.5, 0.5)]):
    d = Vector((math.cos(a), math.sin(a), 0.45))
    pts = bend(Vector((0.0, 0.0, z)), d, ln, 3, wander=0.2, rise=0.15, seed=20 + i)
    snag.tube(pts, [0.18, 0.14, 0.1, 0.07], segments=14, gnarl=0.2, moss=0.15, jag=(0.22, 9.0 + i), bark_depth=0.14)
roots(snag, 0.62, 11, 1.3, seed=11, height=0.9, moss=0.5)
snag_obj = snag.build("Dead snag | broken trunk, splintered top, limb stubs")

# ---------------------------------------------------------------- twisted hollow stump
random.seed(5)
stump = Builder({"bark": (0.115, 0.095, 0.072), "moss": (0.065, 0.085, 0.032), "moss_height": 2.4})
outer = [Vector((0.08 * math.sin(i * 0.9), 0.06 * math.cos(i * 0.7), i * 0.42)) for i in range(11)]
stump.tube(outer, [0.78 * (1 - i / 20) for i in range(11)], segments=32, gnarl=0.12, moss=1.0, cap_top=False,
           jag=(0.45, 3.0), prongs=(0.6, 2.4), bark_depth=0.15, plates=34, plate_len=0.8, twist=0.0)
inner = Builder({"bark": (0.04, 0.03, 0.02), "moss": (0.04, 0.04, 0.025), "moss_height": 0.1})
inner_pts = [p + UP * 0.02 for p in outer[1:]]
# Kept well inside the outer bark (incl. its furrows and wobble) so it never pokes through.
inner.tube(inner_pts, [0.46 * (1 - i / 20) for i in range(1, 11)], segments=32, gnarl=0.05, moss=0.0, cap_top=False,
           jag=(0.4, 3.0), prongs=(0.6, 2.4))
inner.faces = [tuple(reversed(f)) for f in inner.faces]  # face inward
roots(stump, 0.85, 13, 1.7, seed=8, height=1.1)
for z, a, sz in [(0.8, 3.6, 0.36), (1.05, 3.25, 0.3), (1.3, 3.9, 0.26), (0.62, 3.0, 0.32), (1.55, 3.55, 0.22), (0.7, 0.3, 0.28)]:
    out = Vector((math.cos(a), math.sin(a), 0))
    stump.shelf(out * 0.74 + UP * z, out, sz, (0.27, 0.17, 0.09))
stump_obj = stump.build("Twisted stump | hollow split trunk, roots, shelf mushrooms")
inner_obj = inner.build("Twisted stump | hollow interior")

# ---------------------------------------------------------------- export, previews, sprites
trees = [
    ("dead-oak", [oak_obj], 8.0),
    ("dead-snag", [snag_obj], 7.0),
    ("twisted-stump", [stump_obj, inner_obj], 5.4),
]
scene = bpy.context.scene
for target, objs, _ in trees:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=str(MODELS / (target + ".glb")), use_selection=True,
                              export_format="GLB", export_yup=True)
spacing = 0
for target, objs, _ in trees:  # lay them out side by side in the .blend
    for o in objs:
        o.location.x = spacing
    spacing += 9.0

ground_mat = bpy.data.materials.new("Preview ground")
ground_mat.use_nodes = True
ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.07, 0.065, 0.05, 1)
bpy.ops.mesh.primitive_plane_add(size=200, location=(9, 0, 0))
ground = bpy.context.object
ground.name = "Preview ground"
ground.data.materials.append(ground_mat)

world = bpy.data.worlds.new("Dead trees | overcast")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.46, 0.5, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
scene.world = world
bpy.ops.object.light_add(type="SUN", location=(0, 0, 20))
sun = bpy.context.object
sun.data.energy = 3.2
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))

cam_data = bpy.data.cameras.new("Dead trees | camera")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("Dead trees | camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
scene.render.engine = "CYCLES"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "AgX"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"


def frame(center_x, height, res_w, res_h):
    cam.location = Vector((center_x + 9.5, -15.0, height * 0.5 + 6.2))
    look = Vector((center_x, 0, height * 0.45))
    cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam_data.ortho_scale = height * 1.25
    scene.render.resolution_x = res_w
    scene.render.resolution_y = res_h


bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "dead-trees.blend"))
spacing = 0
for target, objs, height in trees:
    # Preview on ground (for review), then a transparent 2D cutout for the flat camera/editor.
    for other_t, other_objs, _ in trees:
        for o in other_objs:
            o.hide_render = other_t != target
    frame(spacing, height, 900, 990)
    scene.render.film_transparent = False
    ground.hide_render = False
    scene.render.filepath = str(HERE / f"{target}-preview.png")
    bpy.ops.render.render(write_still=True)
    frame(spacing, height, 384, 448)
    scene.render.film_transparent = True
    ground.hide_render = True
    scene.render.filepath = str(SPRITES / f"tree-3d-{target}.png")
    bpy.ops.render.render(write_still=True)
    spacing += 9.0
print("DEAD_TREES_DONE")
