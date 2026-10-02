"""Build a tileable PBR water set in Blender and a reusable water study scene."""
from pathlib import Path
import math
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
TEXTURE_DIR = ROOT / "public" / "game" / "textures" / "water-v2"
TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
SIZE = 1024
TAU = math.tau
def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


# Periodic domain warping bends the wind ripples into irregular lake wavelets.
axis = (np.arange(SIZE, dtype=np.float32) + 0.5) / SIZE
u, v = np.meshgrid(axis, axis)
u = u + 0.018*np.sin(TAU*(3*u+2*v)) + 0.009*np.sin(TAU*(7*u-3*v))
v = v + 0.025*np.sin(TAU*(2*u-3*v)) + 0.008*np.sin(TAU*(5*u+6*v))
rng = np.random.default_rng(8721)
height = np.zeros((SIZE, SIZE), dtype=np.float32)
for i in range(48):
    fx = int(rng.integers(3, 40))
    fy = int(rng.integers(-12, 13))
    amplitude = 0.028 / (1 + (fx/9)**1.7)
    phase = TAU*(fx*u+fy*v) + rng.uniform(0, TAU)
    height += amplitude*(np.sin(phase) + 0.18*np.sin(2*phase))
dx = (np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*SIZE/2
dy = (np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*SIZE/2
nx, ny = -dx*0.035, -dy*0.035
length = np.sqrt(nx*nx+ny*ny+1)
crest = np.clip((height+0.025)*9,0,1)
# Broken silver-blue ridges, restrained enough to leave room for real lighting.
ridge = np.clip((dy*0.035+0.08)*2,0,1)**2
shade = np.clip(0.85+height*3,0.65,1.2)

def array_image(name, rgb, noncolor=False):
    image = bpy.data.images.new(name, width=SIZE, height=SIZE, alpha=False)
    if noncolor:
        image.colorspace_settings.name = "Non-Color"
    rgba = np.ones((SIZE,SIZE,4),dtype=np.float32)
    rgba[:,:,:3] = rgb
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(TEXTURE_DIR/name)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image

color = np.stack([0.022*shade+ridge*0.045, 0.052*shade+ridge*0.065,
                  0.066*shade+ridge*0.080],axis=-1)
color_map = array_image("water-color.png",color)
normal_map = array_image("water-normal.png",np.stack([nx/length*.5+.5,ny/length*.5+.5,1/length*.5+.5],axis=-1),True)
rough = np.clip(0.48-crest*0.12+ridge*0.06,0.32,0.55)
rough_map = array_image("water-roughness.png",np.repeat(rough[:,:,None],3,axis=2),True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for data in (bpy.data.materials, bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
    for block in list(data):
        if block.users == 0:
            data.remove(block)

material = bpy.data.materials.new("Ember Ashes | Lake Water V2")
material.use_nodes = True
nodes = material.node_tree.nodes
links = material.node_tree.links
nodes.clear()
output = nodes.new("ShaderNodeOutputMaterial")
output.location = (650, 100)
principled = nodes.new("ShaderNodeBsdfPrincipled")
principled.location = (350, 100)
principled.inputs["Metallic"].default_value = 0.04
principled.inputs["Roughness"].default_value = 0.32
principled.inputs["IOR"].default_value = 1.333
texcoord = nodes.new("ShaderNodeTexCoord")
texcoord.location = (-800, 100)
uvmap = nodes.new("ShaderNodeVectorMath")
uvmap.operation = "SCALE"
uvmap.inputs["Scale"].default_value = 4.0
uvmap.location = (-600, 100)
links.new(texcoord.outputs["UV"], uvmap.inputs[0])

for name, image, location, color_space in [
    ("Color | deep teal and wave glints", color_map, (-350, 360), "sRGB"),
    ("Normal | fine overlapping wavelets", normal_map, (-350, 70), "Non-Color"),
    ("Roughness | glossy ripples", rough_map, (-350, -220), "Non-Color"),
]:
    node = nodes.new("ShaderNodeTexImage")
    node.name = name
    node.label = name
    node.image = image
    node.location = location
    node.extension = "REPEAT"
    node.image.colorspace_settings.name = color_space
    links.new(uvmap.outputs["Vector"], node.inputs["Vector"])
    if image == color_map:
        links.new(node.outputs["Color"], principled.inputs["Base Color"])
    elif image == normal_map:
        normal = nodes.new("ShaderNodeNormalMap")
        normal.location = (0, 0)
        normal.inputs["Strength"].default_value = 4.05
        links.new(node.outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], principled.inputs["Normal"])
    else:
        links.new(node.outputs["Color"], principled.inputs["Roughness"])
links.new(principled.outputs["BSDF"], output.inputs["Surface"])

# The scene contains both the seamless maps and an animated Ocean modifier, so it stays
# useful for editing and rendering in Blender after the game textures are exported.
bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
ocean = bpy.context.object
ocean.name = "Water Surface | animated ocean study"
ocean.data.name = "Water Surface Mesh"
ocean.data.materials.append(material)
subd = ocean.modifiers.new("Smooth wave crests", "SUBSURF")
subd.subdivision_type = "CATMULL_CLARK"
subd.levels = 2
wave = ocean.modifiers.new("Ocean waves | animate Time", "OCEAN")
wave.geometry_mode = "GENERATE"
wave.resolution = 12
wave.viewport_resolution = 8
wave.spatial_size = 50
wave.wave_scale = 0.08
wave.choppiness = 0.45
wave.depth = 80
wave.time = 1.0
wave.keyframe_insert(data_path="time", frame=1)
wave.time = 4.0
wave.keyframe_insert(data_path="time", frame=100)

bpy.ops.object.camera_add(location=(12, -17, 21))
camera = bpy.context.object
camera.name = "Water | camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 32
look_at(camera, (0, 0, 0))
bpy.context.scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(-7, -3, 12))
key = bpy.context.object
key.name = "Water | broad softbox"
key.data.energy = 2600
key.data.shape = "DISK"
key.data.size = 18
look_at(key, (0, 0, 0))
bpy.ops.object.light_add(type="AREA", location=(6, 7, 8))
fill = bpy.context.object
fill.name = "Water | cool fill"
fill.data.energy = 1100
fill.data.color = (0.45, 0.75, 1.0)
fill.data.size = 10
look_at(fill, (0, 0, 0))

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.render.resolution_x = 1100
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "AgX"
scene.view_settings.exposure = 0.8
world = bpy.data.worlds.new("Water V2 | overcast sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.42, 0.48, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65
scene.world = world
scene.render.filepath = str(ROOT / "assets" / "blender" / "game-water-v2-preview.png")
scene.frame_set(32)
scene.render.image_settings.color_mode = "RGBA"
blend_path = ROOT / "assets" / "blender" / "ember-ashes-water-v2.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)
print("Wrote Blender water study:", blend_path)
print("Wrote game PBR maps:", TEXTURE_DIR)
