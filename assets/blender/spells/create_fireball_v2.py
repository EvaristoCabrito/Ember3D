"""Editable fireball concept; run with Blender --background --python this_file."""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
random.seed(431)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def emission(name, color, strength):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    glow = nodes.new("ShaderNodeEmission")
    glow.inputs["Color"].default_value = (*color, 1)
    glow.inputs["Strength"].default_value = strength
    mat.node_tree.links.new(glow.outputs[0], out.inputs[0])
    return mat

gold = emission("Flames | golden inner ribbons", (1, .22, .012), 5)
red = emission("Flames | crimson outer ribbons", (1, .025, .002), 2.5)
sparks = emission("Sparks | hot embers", (1, .42, .055), 9)
core = bpy.data.materials.new("Core | animated molten turbulence")
core.use_nodes = True
n = core.node_tree.nodes
l = core.node_tree.links
n.clear()
out = n.new("ShaderNodeOutputMaterial")
glow = n.new("ShaderNodeEmission")
glow.inputs["Strength"].default_value = 4
noise = n.new("ShaderNodeTexNoise")
noise.noise_dimensions = "4D"
noise.inputs["Scale"].default_value = 4.5
noise.inputs["Detail"].default_value = 5
noise.inputs["Roughness"].default_value = .7
noise.inputs["W"].default_value = 0
noise.inputs["W"].keyframe_insert("default_value", frame=1)
noise.inputs["W"].default_value = 3
noise.inputs["W"].keyframe_insert("default_value", frame=72)
ramp = n.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = .25
ramp.color_ramp.elements[0].color = (.08, .001, .0001, 1)
ramp.color_ramp.elements[1].position = .72
ramp.color_ramp.elements[1].color = (1, .8, .24, 1)
middle = ramp.color_ramp.elements.new(.50)
middle.color = (1, .09, .001, 1)
l.new(noise.outputs["Fac"], ramp.inputs[0])
l.new(ramp.outputs[0], glow.inputs[0])
l.new(glow.outputs[0], out.inputs[0])

bpy.ops.object.empty_add()
root = bpy.context.object
root.name = "Fireball V2 | projectile rig, forward +X"
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=.78)
orb = bpy.context.object
orb.name = "Molten core"
orb.parent = root
orb.data.materials.append(core)
for face in orb.data.polygons:
    face.use_smooth = True
texture = bpy.data.textures.new("Core surface turbulence", type="CLOUDS")
texture.noise_scale = .24
disp = orb.modifiers.new("Uneven flame surface", "DISPLACE")
disp.texture = texture
disp.strength = .15

def ribbon(index, material, inner=False):
    # Tapered flame geometry wraps around the leading core and streams behind it.
    verts, faces = [], []
    angle = index * 2.39996
    length = random.uniform(2.0, 4.4)
    radius = random.uniform(.65, .94)
    for j in range(49):
        t = j/48
        x = .55 - length*t
        theta = angle + 2.2*t + .2*math.sin(t*13+index)
        r = radius*(1-.55*t) + .16*math.sin(t*9+index)*t
        center = Vector((x, math.cos(theta)*r, math.sin(theta)*r))
        width = (.12 if inner else .2)*math.sin(math.pi*t)**.6 + .004
        side = Vector((0, -math.sin(theta), math.cos(theta)))
        verts.extend([center-side*width, center+side*width])
        if j:
            a = j*2
            faces.append((a-2,a-1,a+1,a))
    mesh = bpy.data.meshes.new(f"Flame ribbon {index}")
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(f"Flame {'gold' if inner else 'red'} {index:02}",mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj.data.materials.append(material)
    obj.rotation_euler.x = 0
    obj.keyframe_insert("rotation_euler",frame=1)
    obj.rotation_euler.x = math.tau
    obj.keyframe_insert("rotation_euler",frame=72)
    for f in obj.animation_data.action.layers[0].strips[0].channelbag(obj.animation_data.action_slot).fcurves:
        for k in f.keyframe_points:
            k.interpolation = "LINEAR"

for i in range(24):
    ribbon(i, gold if i%3 else red, i%3 != 0)
for i in range(65):
    x = random.uniform(-4.8,.8)
    angle = random.uniform(0,math.tau)
    r = random.uniform(.7,1.6)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.012,.038),location=(x,math.cos(angle)*r,math.sin(angle)*r))
    obj = bpy.context.object
    obj.name = f"Ember {i:02}"
    obj.parent = root
    obj.scale.x = random.uniform(2,5)
    obj.data.materials.append(sparks)
    obj.keyframe_insert("location",frame=1)
    obj.location.x -= 1.2
    obj.keyframe_insert("location",frame=72)

# Travel ends at frame 25. The game's impact layers last roughly 1.5 seconds.
for frame, x, z in [(1,-2.5,0), (13,-1.25,.45), (24,0,0)]:
    root.location = (x,0,z)
    root.keyframe_insert("location",frame=frame)
root.scale = (1,1,1)
root.keyframe_insert("scale",frame=24)
root.scale = (0,0,0)
root.keyframe_insert("scale",frame=25)

smoke = bpy.data.materials.new("Impact | turbulent smoke volume")
smoke.use_nodes = True
sn = smoke.node_tree.nodes
sn.clear()
so = sn.new("ShaderNodeOutputMaterial")
volume = sn.new("ShaderNodeVolumePrincipled")
volume.inputs["Color"].default_value = (.12,.095,.08,1)
noise_s = sn.new("ShaderNodeTexNoise")
noise_s.inputs["Scale"].default_value = 5
density = sn.new("ShaderNodeMath")
density.operation = "MULTIPLY"
density.inputs[1].default_value = 2
smoke.node_tree.links.new(noise_s.outputs["Fac"],density.inputs[0])
smoke.node_tree.links.new(density.outputs[0],volume.inputs["Density"])
smoke.node_tree.links.new(volume.outputs[0],so.inputs["Volume"])

def burst(name, material, count, start, life, speed, size, rising=False):
    for i in range(count):
        angle = random.uniform(0,math.tau)
        direction = Vector((math.cos(angle),math.sin(angle),random.uniform(.1,1.2)))
        direction.normalize()
        velocity = direction*random.uniform(speed*.55,speed)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(0,0,0))
        obj = bpy.context.object
        obj.name = f"Impact {name} {i:03}"
        obj.data.materials.append(material)
        if material == core:
            displacement = obj.modifiers.new("Turbulent blast surface", "DISPLACE")
            displacement.texture = texture
            displacement.strength = .22
        for face in obj.data.polygons:
            face.use_smooth = True
        delay = start + random.randint(0,2)
        obj.scale = (0,0,0)
        obj.keyframe_insert("scale",frame=delay-1)
        for step in range(9):
            t = step/8
            seconds = t*life/24
            drag = (1-math.exp(-seconds*3))/3
            obj.location = velocity*drag
            obj.location.z += seconds*(.8 if rising else 0)-(.3*seconds*seconds if not rising else 0)
            radius = size*math.sin(math.pi*t)**.7*(1+t if rising else 1)
            obj.scale = (radius,radius,radius*(1.3 if rising else .9))
            frame = delay+round(t*life)
            obj.keyframe_insert("location",frame=frame)
            obj.keyframe_insert("scale",frame=frame)

burst("primary flame",core,30,25,12,7,.45)
burst("secondary flame",red,18,27,19,4,.4,True)
burst("spark",sparks,85,26,18,15,.028)
burst("ember",gold,22,28,24,6,.045)
burst("smoke",smoke,12,33,38,2,.65,True)

# A brief opening flash and expanding ground ring emphasize the area hit.
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1)
flash = bpy.context.object
flash.name = "Impact | opening flash"
flash.data.materials.append(sparks)
for frame, scale in [(24,0),(25,.5),(26,1.25),(28,0)]:
    flash.scale = (scale,scale,scale)
    flash.keyframe_insert("scale",frame=frame)
bpy.ops.mesh.primitive_torus_add(major_radius=1,minor_radius=.025,location=(0,0,-.45))
ring = bpy.context.object
ring.name = "Impact | expanding ground shockwave"
ring.data.materials.append(gold)
for frame, size, thickness in [(24,0,0),(26,.6,1),(31,2.4,.5),(36,2.9,0)]:
    ring.scale = (size,size,thickness)
    ring.keyframe_insert("scale",frame=frame)

world = bpy.data.worlds.new("Spell | dark backdrop")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (.004,.008,.018,1)
world.node_tree.nodes["Background"].inputs[1].default_value = .3
scene = bpy.context.scene
scene.world = world
bpy.ops.object.camera_add(location=(3,-10,5))
camera = bpy.context.object
camera.rotation_euler = (Vector((-1.3,0,0))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 7.6
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 1200
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
scene.view_settings.exposure = -1.3
scene.render.image_settings.file_format = "PNG"
scene.frame_start = 1
scene.frame_end = 90
scene.render.fps = 24
# Extend the projectile flight to 1.5 seconds, within the current game's travel range.
for obj in bpy.context.scene.objects:
    if not obj.animation_data or not obj.animation_data.action:
        continue
    action = obj.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            bag = strip.channelbag(obj.animation_data.action_slot)
            if not bag:
                continue
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    if key.co.x >= 24:
                        key.co.x += 12
                        key.handle_left.x += 12
                        key.handle_right.x += 12
                curve.update()
# Blender 5 uses a compositing node group assigned to the scene.
tree = bpy.data.node_groups.new("Fireball | restrained bloom", "CompositorNodeTree")
tree.interface.new_socket(name="Image",in_out="OUTPUT",socket_type="NodeSocketColor")
scene.compositing_node_group = tree
render = tree.nodes.new("CompositorNodeRLayers")
glare = tree.nodes.new("CompositorNodeGlare")
glare.inputs["Type"].default_value = "Fog Glow"
glare.inputs["Strength"].default_value = .35
output = tree.nodes.new("NodeGroupOutput")
tree.links.new(render.outputs["Image"],glare.inputs["Image"])
tree.links.new(glare.outputs["Image"],output.inputs["Image"])
scene.frame_set(24)
scene.render.filepath = str(OUT/"fireball-v2-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"fireball-v2.blend"))
bpy.ops.render.render(write_still=True)
scene.frame_set(43)
scene.render.filepath = str(OUT/"fireball-v2-impact-preview.png")
bpy.ops.render.render(write_still=True)
