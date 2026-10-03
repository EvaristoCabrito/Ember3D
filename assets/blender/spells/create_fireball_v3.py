"""Reference-led 3D fireball: turbulent luminous skin, flame ribbons and sooty wake."""
from pathlib import Path
import bpy
import math
import random
from mathutils import Vector, noise

OUT=Path(__file__).resolve().parent
random.seed(29)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def fire_material(name,strength,scale):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    n,l=mat.node_tree.nodes,mat.node_tree.links; n.clear()
    out=n.new('ShaderNodeOutputMaterial'); emission=n.new('ShaderNodeEmission')
    tex=n.new('ShaderNodeTexNoise'); tex.noise_dimensions='4D'
    tex.inputs['Scale'].default_value=scale; tex.inputs['Detail'].default_value=7
    tex.inputs['Roughness'].default_value=.75; tex.inputs['Distortion'].default_value=3
    tex.inputs['W'].default_value=0; tex.inputs['W'].keyframe_insert('default_value',frame=1)
    tex.inputs['W'].default_value=3; tex.inputs['W'].keyframe_insert('default_value',frame=72)
    coord=n.new('ShaderNodeTexCoord'); l.new(coord.outputs['Generated'],tex.inputs['Vector'])
    heat=n.new('ShaderNodeValToRGB')
    for e in list(heat.color_ramp.elements)[1:]: heat.color_ramp.elements.remove(e)
    heat.color_ramp.elements[0].position=.40; heat.color_ramp.elements[0].color=(.025,.0003,0,1)
    for position,color in [(.51,(.12,.002,.0001,1)),(.59,(1,.055,.0003,1)),(.67,(1,.30,.003,1)),(.77,(1,.78,.16,1))]:
        heat.color_ramp.elements.new(position).color=color
    # Distorted cellular channels form bright flame seams around darker turbulent pockets.
    warp=n.new('ShaderNodeVectorMath'); warp.operation='SCALE'; warp.inputs['Scale'].default_value=.22
    l.new(tex.outputs['Color'],warp.inputs[0])
    add=n.new('ShaderNodeVectorMath'); add.operation='ADD'
    l.new(coord.outputs['Generated'],add.inputs[0]); l.new(warp.outputs[0],add.inputs[1])
    cells=n.new('ShaderNodeTexVoronoi'); cells.feature='DISTANCE_TO_EDGE'; cells.inputs['Scale'].default_value=7
    l.new(add.outputs[0],cells.inputs['Vector'])
    hot=n.new('ShaderNodeValToRGB')
    hot.color_ramp.elements[0].position=.009; hot.color_ramp.elements[0].color=(1,.85,.22,1)
    hot.color_ramp.elements[1].position=.14; hot.color_ramp.elements[1].color=(.025,.0004,0,1)
    hot.color_ramp.elements.new(.035).color=(1,.34,.008,1)
    hot.color_ramp.elements.new(.075).color=(.38,.018,.0002,1)
    l.new(cells.outputs['Distance'],hot.inputs[0])
    l.new(hot.outputs[0] if 'texture' in name else heat.outputs[0],emission.inputs['Color'])
    l.new(tex.outputs['Fac'],heat.inputs[0])
    emission.inputs['Strength'].default_value=strength
    l.new(emission.outputs[0],out.inputs['Surface'])
    return mat

skin=fire_material('Fireball | turbulent burning texture',5,5)
flame=fire_material('Flame ribbons | streaked heat',7,5)
ember=fire_material('Embers | orange heat',2.0,4)

bpy.ops.mesh.primitive_uv_sphere_add(segments=96,ring_count=64,radius=.87)
head=bpy.context.object; head.name='Fireball | turbulent spherical head'
for v in head.data.vertices:
    p=v.co.copy(); v.co=p*(1+.10*noise.noise_vector(p*4).x+.035*noise.noise_vector(p*13).z)
for face in head.data.polygons: face.use_smooth=True
head.data.materials.append(skin)

# Thin, tapered 3D flame sheets peel away from the moving head; varying the sheet
# normals and turbulent paths keeps them volumetric from more than one viewpoint.
for i in range(40):
    a=random.uniform(0,math.tau); length=random.uniform(1.4,4.6)
    start=random.uniform(-.1,.68); width=random.uniform(.015,.07)
    verts=[]; faces=[]
    for j in range(49):
        t=j/48; x=start-t*length
        theta=a+1.2*math.sin(t*6+i)+t*.8
        r=.72*(1-t*.65)+.12*math.sin(t*21+i)+.08*math.sin(t*37+i*.8)
        z=r*math.sin(theta)+.25*t*t
        y=r*math.cos(theta)
        # Flatten the starting point onto the head's spherical silhouette.
        if x>-.65: r=max(.15,math.sqrt(max(.01,.87*.87-x*x)))
        y=r*math.cos(theta); z=r*math.sin(theta)+.25*t*t
        w=width*(math.sin(math.pi*(.08+.92*t))**.6)*(1-t)**.6
        normal=Vector((0,math.cos(theta+.5),math.sin(theta+.5)))
        center=Vector((x,y,z))
        verts += [tuple(center-normal*w),tuple(center+normal*w)]
        if j: faces.append((j*2-2,j*2-1,j*2+1,j*2))
    mesh=bpy.data.meshes.new('Tapered turbulent flame sheet'); mesh.from_pydata(verts,[],faces)
    obj=bpy.data.objects.new('Fireball | flame tongue %02d'%i,mesh); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(flame)

# Fine looping filaments add the bright interwoven curls visible in the reference.
for i in range(18):
    data=bpy.data.curves.new('Surface flame curl','CURVE'); data.dimensions='3D'
    data.bevel_depth=random.uniform(.002,.005); data.bevel_resolution=2
    spline=data.splines.new('POLY'); spline.points.add(89)
    phase=random.uniform(0,math.tau)
    for j,p in enumerate(spline.points):
        t=j/89; polar=.18+t*2.7; az=phase+t*6+.22*math.sin(t*29+i)
        radius=.89+.025*math.sin(t*41+i)
        p.co=(radius*math.cos(polar),radius*math.sin(polar)*math.cos(az),radius*math.sin(polar)*math.sin(az),1)
    obj=bpy.data.objects.new('Fireball | surface filament %02d'%i,data)
    bpy.context.collection.objects.link(obj); obj.data.materials.append(flame)

smoke=bpy.data.materials.new('Smoke | turbulent soot'); smoke.use_nodes=True
n,l=smoke.node_tree.nodes,smoke.node_tree.links; n.clear()
out=n.new('ShaderNodeOutputMaterial'); volume=n.new('ShaderNodeVolumePrincipled')
volume.inputs['Color'].default_value=(.055,.045,.04,1)
coord=n.new('ShaderNodeTexCoord'); tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=5
tex.inputs['Detail'].default_value=4; l.new(coord.outputs['Generated'],tex.inputs['Vector'])
center=n.new('ShaderNodeVectorMath'); center.operation='DISTANCE'; center.inputs[1].default_value=(.5,.5,.5)
l.new(coord.outputs['Generated'],center.inputs[0])
fade=n.new('ShaderNodeMapRange'); fade.inputs['From Min'].default_value=.15; fade.inputs['From Max'].default_value=.5
fade.inputs['To Min'].default_value=1; fade.inputs['To Max'].default_value=0
l.new(center.outputs['Value'],fade.inputs['Value'])
density=n.new('ShaderNodeMath'); density.operation='MULTIPLY'
l.new(fade.outputs[0],density.inputs[0]); l.new(tex.outputs['Fac'],density.inputs[1])
l.new(density.outputs[0],volume.inputs['Density']); l.new(volume.outputs[0],out.inputs['Volume'])
for i in range(14):
    t=i/13
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=(-.7-t*3.5,.4+.15*math.sin(i),.25+t*.5))
    obj=bpy.context.object; obj.name='Fireball | smoke puff %02d'%i
    obj.scale=(.38+t*.25,.35+t*.35,.35+t*.35); obj.data.materials.append(smoke)
for i in range(100):
    t=random.random()
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(.006,.019),location=(-.5-t*4.4,random.uniform(-1,1)*(.5+t*.5),random.uniform(-.8,.9)+t*.25))
    obj=bpy.context.object; obj.name='Fireball | flying ember %03d'%i
    obj.scale=(random.uniform(1,3),1,1); obj.data.materials.append(ember)

scene=bpy.context.scene; scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.002,.002,.002,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.1
bpy.ops.object.light_add(type='POINT',location=(0,-.3,.2))
bpy.context.object.data.energy=100; bpy.context.object.data.color=(1,.16,.015)
bpy.ops.object.camera_add(location=(.7,-10,4))
cam=bpy.context.object; cam.rotation_euler=(Vector((-1.65,0,.15))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'; cam.data.ortho_scale=6.8; scene.camera=cam
scene.render.engine='CYCLES'; scene.cycles.samples=48; scene.cycles.use_denoising=True
scene.render.resolution_x=1400; scene.render.resolution_y=850; scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'; scene.view_settings.exposure=-.35
scene.frame_start=1; scene.frame_end=72; scene.render.fps=24; scene.frame_set(20)
tree=bpy.data.node_groups.new('Fireball restrained glow','CompositorNodeTree')
tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
scene.compositing_node_group=tree
render=tree.nodes.new('CompositorNodeRLayers'); glare=tree.nodes.new('CompositorNodeGlare')
glare.inputs['Type'].default_value='Fog Glow'; glare.inputs['Strength'].default_value=.18
output=tree.nodes.new('NodeGroupOutput')
tree.links.new(render.outputs['Image'],glare.inputs['Image']); tree.links.new(glare.outputs['Image'],output.inputs['Image'])
scene.render.filepath=str(OUT/'fireball-v3-preview.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fireball-v3.blend'))
bpy.ops.render.render(write_still=True)
