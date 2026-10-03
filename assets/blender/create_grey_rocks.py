"""Authored grey granite outcrop study, with a reusable game mesh and preview."""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/blender'
random.seed(41)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

stone = bpy.data.materials.new('Neutral grey granite | no warm tint')
stone.use_nodes = True
n = stone.node_tree.nodes
l = stone.node_tree.links
bsdf = n.get('Principled BSDF')
bsdf.inputs['Roughness'].default_value = .93
bsdf.inputs['Specular IOR Level'].default_value = .22
tex = n.new('ShaderNodeTexNoise')
tex.inputs['Scale'].default_value = 7
tex.inputs['Detail'].default_value = 5
ramp = n.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = .15
ramp.color_ramp.elements[0].color = (.075, .08, .085, 1)
ramp.color_ramp.elements[1].position = .85
ramp.color_ramp.elements[1].color = (.24, .25, .26, 1)
l.new(tex.outputs['Fac'], ramp.inputs['Fac'])
l.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
fine = n.new('ShaderNodeTexNoise')
fine.inputs['Scale'].default_value = 115
fine.inputs['Detail'].default_value = 3
bump = n.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .25
bump.inputs['Distance'].default_value = .045
l.new(fine.outputs['Fac'], bump.inputs['Height'])
l.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

rocks = []
def rock(name, center, size, seed):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    obj = bpy.context.object
    obj.name = 'Grey rocks | ' + name
    offset = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in obj.data.vertices:
        p = v.co.copy()
        # Broad fractured planes, with smaller erosion on their edges.
        p *= 1 + .24 * noise.noise_vector(p * 2.1 + offset).x
        for axis in range(3):
            p[axis] = max(-.83, min(.83, p[axis]))
        p.z = max(-.65, min(.78, p.z))
        p += Vector((0, 0, .018 * math.sin(p.x * 29 + p.y * 8 + seed)))
        v.co = (p.x * size[0], p.y * size[1], p.z * size[2])
    obj.location = center
    obj.rotation_euler[2] = seed * .43
    obj.data.materials.append(stone)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    bevel = obj.modifiers.new('Soft fractured edges', 'BEVEL')
    bevel.width = .025
    bevel.segments = 2
    rocks.append(obj)

rock('main split face', (-.45, .25, .88), (1.12, .75, 1.25), 1)
rock('back shoulder', (.60, .55, .70), (.85, .70, .95), 2)
rock('front ledge', (.35, -.35, .40), (.96, .68, .58), 3)
rock('left fallen slab', (-1.02, -.37, .27), (.65, .46, .39), 4)
rock('right broken slab', (1.14, -.12, .24), (.55, .46, .34), 5)
for i in range(16):
    angle = i * 2.399
    radius = random.uniform(1.1, 1.7)
    s = random.uniform(.08, .22)
    rock('fragment %02d' % i, (math.cos(angle) * radius, math.sin(angle) * radius * .64, s * .58), (s * 1.4, s, s), i + 10)

bpy.ops.object.select_all(action='DESELECT')
for obj in rocks:
    obj.select_set(True)
mesh_dir = ROOT / 'public/game/models/rocks'
mesh_dir.mkdir(parents=True, exist_ok=True)
# Export a neutral-grey material; procedural detail remains in the editable Blender source.
game = bpy.data.materials.new('Grey granite game material')
game.use_nodes = True
game.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.26, .27, .28, 1)
game.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .93
for obj in rocks:
    obj.data.materials[0] = game
bpy.ops.export_scene.gltf(filepath=str(mesh_dir / 'grey-outcrop.glb'), use_selection=True, export_format='GLB')
for obj in rocks:
    obj.data.materials[0] = stone

bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = 'Preview ground'
mat = bpy.data.materials.new('Preview charcoal')
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.065, .07, .075, 1)
floor.data.materials.append(mat)
floor.location.z = -.09
world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.18, .19, .20, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .45
for loc, power, size in [((-3, -4, 7), 650, 5), ((4, 2, 5), 350, 4)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    lamp = bpy.context.object
    lamp.data.energy = power
    lamp.data.shape = 'DISK'
    lamp.data.size = size
    lamp.rotation_euler = (Vector((0, 0, .5)) - lamp.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(4, -6, 4))
cam = bpy.context.object
cam.rotation_euler = (Vector((0, 0, .7)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 4.8
scene = bpy.context.scene
scene.camera = cam
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.render.filepath = str(OUT / 'grey-rocks-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'grey-rocks.blend'))
bpy.ops.render.render(write_still=True)
