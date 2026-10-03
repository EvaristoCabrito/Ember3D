"""Five editable tavern props matching the supplied rustic reference."""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
random.seed(16)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, low, high, metal=0, grain=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    p = nodes.get('Principled BSDF')
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = .43 if metal else .79
    coord = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath'); mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (3, 3, .3) if grain else (5, 5, 5)
    links.new(coord.outputs['Generated'], mapping.inputs[0])
    tex = nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 4
    tex.inputs['Detail'].default_value = 5; tex.inputs['Roughness'].default_value = .75
    links.new(mapping.outputs[0], tex.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*low, 1)
    ramp.color_ramp.elements[1].color = (*high, 1)
    links.new(tex.outputs['Fac'], ramp.inputs[0]); links.new(ramp.outputs[0], p.inputs['Base Color'])
    if grain:
        wave = nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
        wave.inputs['Scale'].default_value = 4
        wave.inputs['Distortion'].default_value = 6
        wave.inputs['Detail'].default_value = 5
        links.new(mapping.outputs[0], wave.inputs['Vector'])
        streak = nodes.new('ShaderNodeMixRGB'); streak.blend_type = 'MULTIPLY'; streak.inputs[0].default_value = .65
        links.new(ramp.outputs[0], streak.inputs[1]); links.new(wave.outputs['Color'], streak.inputs[2])
        links.new(streak.outputs[0], p.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .30
    bump.inputs['Distance'].default_value = .025 if grain else .012
    links.new(wave.outputs['Fac'] if grain else tex.outputs['Fac'], bump.inputs['Height']); links.new(bump.outputs[0], p.inputs['Normal'])
    return mat

wood = material('Weathered oak | long grain', (.045,.018,.007), (.28,.135,.047), grain=True)
wood_light = material('Oak end grain', (.06,.027,.009), (.33,.18,.065), grain=True)
iron = material('Worn dark iron', (.018,.022,.026), (.115,.12,.125), metal=.85)
pewter = material('Scratched pewter', (.17,.18,.18), (.46,.48,.47), metal=.9)
wax = material('Ivory beeswax', (.46,.30,.11), (.85,.68,.38))
beer = material('Amber ale', (.045,.012,.002), (.19,.07,.012))
foam = material('Ale foam', (.48,.40,.26), (.85,.77,.56))

groups = {}
active = None
def finish(obj, name, mat, bevel=0):
    obj.name = active + ' | ' + name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Worn edges', 'BEVEL'); mod.width = bevel; mod.segments = 2
        mod = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    groups[active].append(obj)
    return obj

def box(name, loc, scale, mat=wood, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object; obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)

def cylinder(name, loc, radius, depth, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object, name, mat, .008)

def sphere(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=loc)
    obj = bpy.context.object; obj.scale=scale
    for p in obj.data.polygons: p.use_smooth=True
    return finish(obj,name,mat)

def mesh(name, verts, faces, mat, bevel=.008):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    return finish(obj,name,mat,bevel)

def lathe(name, profile, mat, segments=64):
    verts=[]; faces=[]
    for r,z in profile:
        verts.extend([(r*math.cos(i*math.tau/segments),r*math.sin(i*math.tau/segments),z) for i in range(segments)])
    for j in range(len(profile)-1):
        for i in range(segments):
            k=(i+1)%segments; a=j*segments; b=(j+1)*segments
            faces.append((a+i,a+k,b+k,b+i))
    obj=mesh(name,verts,faces,mat)
    for p in obj.data.polygons: p.use_smooth=True
    return obj

def curve(name, pts, radius, mat):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'; data.bevel_depth=radius; data.bevel_resolution=3
    spline=data.splines.new('BEZIER'); spline.bezier_points.add(len(pts)-1)
    for p,co in zip(spline.bezier_points,pts):
        p.co=co; p.handle_left_type=p.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    return finish(obj,name,mat)

def disc_planks(name, r, z, thick, count):
    # Separate plank segments follow the actual circular edge instead of a single smooth disc.
    for i in range(count):
        lo=-r+i*2*r/count+.008; hi=-r+(i+1)*2*r/count-.008
        boundary=[]
        for k in range(13):
            x=lo+(hi-lo)*k/12; boundary.append((x,-math.sqrt(max(0,r*r-x*x))))
        for k in range(12,-1,-1):
            x=lo+(hi-lo)*k/12; boundary.append((x,math.sqrt(max(0,r*r-x*x))))
        n=len(boundary); verts=[(x,y,h) for h in (z,z+thick) for x,y in boundary]
        faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
        faces += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
        mesh(name+' plank %02d'%i,verts,faces,wood_light,.009)

active='Barrel'; groups[active]=[]
levels=[(0,.52),(.12,.56),(.40,.63),(.80,.66),(1.20,.63),(1.48,.56),(1.60,.52)]
for i in range(20):
    a=i*math.tau/20+.004; b=(i+1)*math.tau/20-.004
    verts=[]
    for z,r in levels:
        verts.extend([(r*math.cos(t),r*math.sin(t),z) for t in (a,(a+b)/2,b)])
    faces=[]
    for j in range(len(levels)-1):
        for k in range(2): faces.append((j*3+k,j*3+k+1,(j+1)*3+k+1,(j+1)*3+k))
    obj=mesh('individual oak stave %02d'%i,verts,faces,wood,.009)
    mod=obj.modifiers.new('Solid staves','SOLIDIFY'); mod.thickness=.045
for z,r in [(.10,.559),(.35,.626),(1.24,.626),(1.51,.56)]:
    lathe('iron hoop',[(r-.013,z-.054),(r+.013,z-.054),(r+.013,z+.054),(r-.013,z+.054)],iron)
    for i in range(16):
        a=i*math.tau/16
        sphere('hoop rivet',(math.cos(a)*(r+.021),math.sin(a)*(r+.021),z),(.023,.023,.023),iron)
disc_planks('barrel lid',.505,1.545,.035,7)
lathe('top oak rim',[(.51,1.57),(.55,1.57),(.55,1.63),(.51,1.63)],wood)

active='Table'; groups[active]=[]
disc_planks('round tabletop',.88,1.11,.12,8)
box('square pedestal',(0,0,.58),(.24,.24,.98))
box('pedestal collar',(0,0,.27),(.36,.36,.13),wood_light)
box('upper brace',(0,0,1.03),(.60,.36,.12))
for angle in (0,math.pi/2):
    obj=box('cross foot',(0,0,.10),(1.23,.20,.17)); obj.rotation_euler.z=angle
for z in (.36,.93):
    for axis in (0,1):
        for sign in (-1,1):
            loc=[0,0,z]; loc[axis]=sign*.127
            dims=[.29,.29,.07]; dims[axis]=.023
            box('iron pedestal strap',loc,dims,iron,.004)
            sphere('strap bolt',loc,(.025,.025,.025),iron)

active='Chair'; groups[active]=[]
for x in (-.31,.31):
    for y in (-.28,.28):
        tall=y>.0
        box('back upright' if tall else 'front leg',(x,y,.85 if tall else .35),(.10,.10,1.70 if tall else .70))
for i in range(4): box('seat plank',(0,-.27+i*.18,.72),(.77,.17,.095),wood_light)
for x in (-.31,.31): box('side stretcher',(x,0,.25),(.07,.62,.08))
for y in (-.28,.28): box('cross stretcher',(0,y,.28),(.65,.07,.08))
# Separate back slats retain their open gaps, but meet the seat and upper rail.
for x in (-.20,0,.20): box('back slat',(x,.28,1.15),(.135,.085,.79),bevel=.006)
crest=box('carved top rail',(0,.28,1.60),(.64,.10,.22),wood_light)
# Diamond opening through the crest echoes the pierced reference chair.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.28,1.60))
cutter=bpy.context.object; cutter.scale=(.105,.30,.105); cutter.rotation_euler.y=math.pi/4
bpy.context.view_layer.objects.active=cutter
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.context.view_layer.objects.active=crest
for existing in list(crest.modifiers): bpy.ops.object.modifier_apply(modifier=existing.name)
mod=crest.modifiers.new('Pierced diamond','BOOLEAN'); mod.object=cutter
bpy.ops.object.modifier_apply(modifier=mod.name); bpy.data.objects.remove(cutter,do_unlink=True)
for face in crest.data.polygons: face.material_index=0
for x in (-.29,.29):
    for y in (-.27,.27): sphere('seat iron nail',(x,y,.779),(.024,.024,.012),iron)

active='Metal mug'; groups[active]=[]
lathe('hollow pewter tankard',[(0,0),(.22,0),(.23,.035),(.215,.09),(.19,.49),(.20,.54),(.18,.55),(.165,.52),(.175,.10),(0,.10)],pewter)
for z,r in [(.065,.225),(.47,.195),(.53,.205)]:
    lathe('raised metal rim',[(r,z-.014),(r+.011,z),(r,z+.014)],pewter)
curve('scroll handle',[(.18,0,.46),(.32,0,.47),(.40,0,.35),(.37,0,.15),(.23,0,.08)],.032,pewter)
for z in (.43,.12): sphere('handle fastener',(.21,0,z),(.028,.045,.04),iron)
cylinder('ale surface',(0,0,.493),.167,.008,beer)
for i in range(34):
    a=random.uniform(0,math.tau); r=random.uniform(.125,.16)
    sphere('foam bubble',(r*math.cos(a),r*math.sin(a),.502),(.013,.013,.008),foam)

active='Candlestick'; groups[active]=[]
box('wall mounting plate',(0,.18,.35),(.13,.035,.65),iron,.01)
curve('curved iron bracket',[(0,.16,.15),(0,-.04,.20),(0,-.16,.34),(0,-.28,.36)],.025,iron)
lathe('wax catch dish',[(0,.34),(.12,.34),(.19,.39),(.20,.43),(.175,.43),(.14,.38),(0,.38)],iron)
lathe('wax candle',[(0,.38),(.082,.38),(.078,.70),(.067,.74),(0,.72)],wax)
for i in range(9):
    a=i*math.tau/9
    curve('wax drip',[(.075*math.cos(a),.075*math.sin(a),.71),(.084*math.cos(a),.084*math.sin(a),random.uniform(.47,.64))],random.uniform(.006,.012),wax)
cylinder('charred wick',(0,0,.746),.006,.035,iron,12)
flame=bpy.data.materials.new('Warm flame'); flame.use_nodes=True
p=flame.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(1,.38,.015,1)
p.inputs['Emission Color'].default_value=(1,.22,.005,1); p.inputs['Emission Strength'].default_value=3
sphere('flame',(0,0,.82),(.032,.027,.078),flame)

# Keep each model in a named collection with local coordinates for editing and reuse.
placements={'Barrel':(-2.1,.35,0),'Table':(0,.25,0),'Chair':(2.0,.45,0),'Metal mug':(-1.25,-1.30,0),'Candlestick':(1.28,-1.15,0)}
for name,objects in groups.items():
    col=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(col)
    for obj in objects:
        for old in list(obj.users_collection): old.objects.unlink(obj)
        col.objects.link(obj)
        obj.location += Vector(placements[name])

bpy.ops.mesh.primitive_plane_add(size=200)
ground=bpy.context.object; ground.name='Preview floor'
floor=bpy.data.materials.new('Dark neutral studio floor'); floor.use_nodes=True
floor.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.035,.038,.04,1)
ground.data.materials.append(floor); ground.location.z=-.03
world=bpy.context.scene.world; world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.21,.23,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.4
for loc,power,size in [((-3,-4,6),1000,5),((4,1,5),650,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    lamp=bpy.context.object; lamp.data.energy=power; lamp.data.size=size
    lamp.rotation_euler=(Vector((0,0,.6))-lamp.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(5,-9,6))
cam=bpy.context.object; cam.rotation_euler=(Vector((0,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'; cam.data.ortho_scale=7.5
scene=bpy.context.scene; scene.camera=cam; scene.render.engine='CYCLES'
scene.cycles.samples=48; scene.cycles.use_denoising=True
scene.render.resolution_x=1400; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(OUT/'tavern-props-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'tavern-props.blend'))
bpy.ops.render.render(write_still=True)
