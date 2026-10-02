"""Build a tileable PBR water set in Blender and a reusable water study scene."""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
TEXTURE_DIR = ROOT / "public" / "game" / "textures" / "water"
TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
SIZE = 512
TAU = math.tau
WAVES = [
    (2, 1, 0.070, 0.3), (-1, 3, 0.052, 2.1), (4, 3, 0.025, 0.8),
    (7, -4, 0.015, 1.4), (-5, 8, 0.009, 2.8), (11, 5, 0.005, 0.4),
    (-9, -7, 0.004, 1.9), (17, -12, 0.0025, 2.4),
]


def water_height(u, v):
    return sum(a * math.sin(TAU * (fx*u + fy*v) + phase) for fx, fy, a, phase in WAVES)


def write_image(name, channels, sample):
    image = bpy.data.images.new(name, width=SIZE, height=SIZE, alpha=False, float_buffer=False)
    pixels = [0.0] * (SIZE * SIZE * channels)
    index = 0
    for y in range(SIZE):
        v = (y + 0.5) / SIZE
        for x in range(SIZE):
            u = (x + 0.5) / SIZE
            values = sample(u, v)
            pixels[index:index+channels] = values
            index += channels
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(TEXTURE_DIR / name)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image


def make_color(u, v):
    height = water_height(u, v)
    crest = max(0.0, min(1.0, 0.5 + height * 9.0)) ** 3
    fine = 0.5 + 0.5 * math.sin(TAU * (11*u + 7*v) + 0.35 * math.sin(TAU * (3*u - 2*v)))
    broad = 0.5 + 0.5 * math.sin(TAU * (2*u - 3*v) + 0.6)
    sparkle = max(0.0, math.sin(TAU * (7*u - 4*v) + 1.4) * math.sin(TAU * (4*u + 3*v) + 0.8)) ** 8
    mottling = (fine - 0.5) * 0.035 + (broad - 0.5) * 0.025
    glint = 0.11 * crest + 0.16 * sparkle
    return [0.025 + mottling + glint * 0.58, 0.205 + mottling + glint * 0.91,
            0.245 + mottling + glint, 1.0]


def make_normal(u, v):
    eps = 1.0 / SIZE
    dx = (water_height(u + eps, v) - water_height(u - eps, v)) / (2 * eps)
    dy = (water_height(u, v + eps) - water_height(u, v - eps)) / (2 * eps)
    nx, ny, nz = -dx * 0.045, -dy * 0.045, 1.0
    length = math.sqrt(nx*nx + ny*ny + nz*nz)
    return [nx/length * 0.5 + 0.5, ny/length * 0.5 + 0.5, nz/length * 0.5 + 0.5, 1.0]


def make_roughness(u, v):
    height = water_height(u, v)
    sparkle = max(0.0, math.sin(TAU * (7*u - 4*v) + 1.4) * math.sin(TAU * (4*u + 3*v) + 0.8))
    value = 0.22 + 0.12 * (0.5 + 0.5 * math.sin(TAU*(2*u+v))) + 0.12*sparkle + min(0.12, abs(height))
    return [value, value, value, 1.0]


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


color_map = write_image("water-color.png", 4, make_color)
normal_map = write_image("water-normal.png", 4, make_normal)
rough_map = write_image("water-roughness.png", 4, make_roughness)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for data in (bpy.data.materials, bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
    for block in list(data):
        if block.users == 0:
            data.remove(block)

material = bpy.data.materials.new("Ember Ashes | Tiled PBR Water")
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
uvmap.inputs["Scale"].default_value = 0.5
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
        normal.inputs["Strength"].default_value = 0.55
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
wave.wave_scale = 0.55
wave.choppiness = 0.7
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
key.data.energy = 2400
key.data.shape = "DISK"
key.data.size = 9
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
scene.render.filepath = str(ROOT / "assets" / "blender" / "game-water-preview.png")
scene.frame_set(32)
scene.render.image_settings.color_mode = "RGBA"
blend_path = ROOT / "assets" / "blender" / "ember-ashes-water.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.render.render(write_still=True)
print("Wrote Blender water study:", blend_path)
print("Wrote game PBR maps:", TEXTURE_DIR)
