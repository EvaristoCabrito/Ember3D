"""A volumetric fireball projectile study, without an impact or explosion."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

material = bpy.data.materials.new("Fireball | animated turbulent flame volume")
material.use_nodes = True
nodes = material.node_tree.nodes
links = material.node_tree.links
nodes.clear()
out = nodes.new("ShaderNodeOutputMaterial")
volume = nodes.new("ShaderNodeVolumePrincipled")
volume.inputs["Color"].default_value = (.15,.035,.004,1)
coord = nodes.new("ShaderNodeTexCoord")
mapping = nodes.new("ShaderNodeVectorMath")
mapping.operation = "MULTIPLY"
mapping.inputs[1].default_value = (2.3,2,2)
links.new(coord.outputs["Generated"],mapping.inputs[0])
noise = nodes.new("ShaderNodeTexNoise")
noise.noise_dimensions = "4D"
noise.inputs["Scale"].default_value = 2.2
noise.inputs["Detail"].default_value = 5
noise.inputs["Roughness"].default_value = .75
noise.inputs["Distortion"].default_value = 1.6
links.new(mapping.outputs[0],noise.inputs["Vector"])
noise.inputs["W"].default_value = 0
noise.inputs["W"].keyframe_insert("default_value",frame=1)
noise.inputs["W"].default_value = 4
noise.inputs["W"].keyframe_insert("default_value",frame=72)

# A radial envelope dissolves the flame's silhouette instead of exposing a mesh shell.
center = nodes.new("ShaderNodeVectorMath")
center.operation = "SUBTRACT"
center.inputs[1].default_value = (.5,.5,.5)
links.new(coord.outputs["Generated"],center.inputs[0])
distance = nodes.new("ShaderNodeVectorMath")
distance.operation = "LENGTH"
links.new(center.outputs[0],distance.inputs[0])
envelope = nodes.new("ShaderNodeMapRange")
envelope.inputs["From Min"].default_value = .12
envelope.inputs["From Max"].default_value = .52
envelope.inputs["To Min"].default_value = 1
envelope.inputs["To Max"].default_value = 0
links.new(distance.outputs["Value"],envelope.inputs["Value"])
flame = nodes.new("ShaderNodeValToRGB")
flame.color_ramp.elements[0].position = .53
flame.color_ramp.elements[1].position = .72
links.new(noise.outputs["Fac"],flame.inputs[0])
mask = nodes.new("ShaderNodeMath")
mask.operation = "MULTIPLY"
links.new(flame.outputs[0],mask.inputs[0])
links.new(envelope.outputs[0],mask.inputs[1])
density = nodes.new("ShaderNodeMath")
density.operation = "MULTIPLY"
density.inputs[1].default_value = 2.5
links.new(mask.outputs[0],density.inputs[0])
links.new(density.outputs[0],volume.inputs["Density"])
heat = nodes.new("ShaderNodeValToRGB")
heat.color_ramp.elements[0].position = .25
heat.color_ramp.elements[0].color = (.6,.008,.0002,1)
heat.color_ramp.elements[1].position = .8
heat.color_ramp.elements[1].color = (1,.8,.22,1)
heat.color_ramp.elements.new(.52).color = (1,.12,.003,1)
links.new(noise.outputs["Fac"],heat.inputs[0])
links.new(heat.outputs[0],volume.inputs["Emission Color"])
strength = nodes.new("ShaderNodeMath")
strength.operation = "MULTIPLY"
strength.inputs[1].default_value = 38
links.new(mask.outputs[0],strength.inputs[0])
links.new(strength.outputs[0],volume.inputs["Emission Strength"])
links.new(volume.outputs[0],out.inputs["Volume"])

# Round leading head with a long tapered wake; the volume shader breaks up both.
verts, faces = [], []
for ring in range(65):
    t = ring/64
    x = -3.8 + 4.7*t
    radius = .9*math.sin(math.pi*t)**.65*(.3+.7*t)
    for segment in range(64):
        a = math.tau*segment/64
        flutter = 1+.12*math.sin(a*5+t*24)+.07*math.sin(a*9-t*17)
        verts.append((x,radius*math.cos(a)*flutter,radius*math.sin(a)*flutter))
        if ring:
            p=(ring-1)*64+segment
            q=(ring-1)*64+(segment+1)%64
            faces.append((p,q,q+64,p+64))
mesh = bpy.data.meshes.new("Fireball volume envelope")
mesh.from_pydata(verts,[],faces)
obj = bpy.data.objects.new("Fireball | flying flame and wake",mesh)
bpy.context.collection.objects.link(obj)
mesh.materials.append(material)

# A cooler, wider wake carries soot after the bright flame has faded.
smoke = material.copy()
smoke.name = "Smoke | soft turbulent soot wake"
sv = next(n for n in smoke.node_tree.nodes if n.bl_idname == "ShaderNodeVolumePrincipled")
for socket in ["Emission Color", "Emission Strength"]:
    for link in list(socket_link for socket_link in smoke.node_tree.links if socket_link.to_socket == sv.inputs[socket]):
        smoke.node_tree.links.remove(link)
sv.inputs["Emission Strength"].default_value = 0
sv.inputs["Color"].default_value = (.09,.075,.065,1)
for link in list(smoke.node_tree.links):
    if link.to_socket == sv.inputs["Density"]:
        link.from_node.inputs[1].default_value = 1.8
smoke_obj = obj.copy()
smoke_obj.data = mesh.copy()
smoke_obj.name = "Fireball | trailing smoke"
bpy.context.collection.objects.link(smoke_obj)
smoke_obj.data.materials.clear()
smoke_obj.data.materials.append(smoke)
smoke_obj.location = (-1.8,0,.18)
smoke_obj.scale = (1.1,1.4,1.4)

bpy.ops.object.light_add(type="AREA",location=(-2,-3,4))
light = bpy.context.object
light.data.energy = 600
light.data.size = 5
light.rotation_euler = (Vector((-2,0,0))-light.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.light_add(type="POINT",location=(.2,0,0))
bpy.context.object.data.energy = 90
bpy.context.object.data.color = (1,.15,.015)

scene=bpy.context.scene
world=bpy.data.worlds.new("Dark backdrop")
world.use_nodes=True
world.node_tree.nodes["Background"].inputs[0].default_value=(.003,.006,.012,1)
world.node_tree.nodes["Background"].inputs[1].default_value=.2
scene.world=world
bpy.ops.object.camera_add(location=(1,-9,3))
camera=bpy.context.object
camera.rotation_euler=(Vector((-2,0,0))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=8.8
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=48
scene.render.resolution_x=1200
scene.render.resolution_y=720
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.view_settings.view_transform="AgX"
scene.frame_start=1
scene.frame_end=72
scene.render.fps=24
tree=bpy.data.node_groups.new("Fireball | soft glow","CompositorNodeTree")
tree.interface.new_socket(name="Image",in_out="OUTPUT",socket_type="NodeSocketColor")
scene.compositing_node_group=tree
render=tree.nodes.new("CompositorNodeRLayers")
glare=tree.nodes.new("CompositorNodeGlare")
glare.inputs["Type"].default_value="Fog Glow"
glare.inputs["Strength"].default_value=.25
output=tree.nodes.new("NodeGroupOutput")
tree.links.new(render.outputs["Image"],glare.inputs["Image"])
tree.links.new(glare.outputs["Image"],output.inputs["Image"])
scene.frame_set(24)
scene.render.filepath=str(OUT/"fireball-projectile-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"fireball-projectile.blend"))
bpy.ops.render.render(write_still=True)
