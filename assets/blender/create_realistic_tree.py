"""Generate an editable broadleaf tree with bark, branches, and individual leaves."""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent
random.seed(2047)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name,color,roughness):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=roughness
    return mat

bark=material("Bark | weathered brown ridges",(.13,.075,.038),.92)
nodes=bark.node_tree.nodes
links=bark.node_tree.links
coord=nodes.new("ShaderNodeTexCoord")
scale=nodes.new("ShaderNodeVectorMath")
scale.operation="MULTIPLY"
scale.inputs[1].default_value=(9,9,1.5)
links.new(coord.outputs["Object"],scale.inputs[0])
noise=nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value=5
noise.inputs["Detail"].default_value=5
links.new(scale.outputs[0],noise.inputs["Vector"])
ramp=nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color=(.035,.019,.01,1)
ramp.color_ramp.elements[1].color=(.23,.15,.085,1)
links.new(noise.outputs["Fac"],ramp.inputs[0])
links.new(ramp.outputs[0],nodes.get("Principled BSDF").inputs["Base Color"])
bump=nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value=.7
bump.inputs["Distance"].default_value=.08
links.new(noise.outputs["Fac"],bump.inputs["Height"])
links.new(bump.outputs[0],nodes.get("Principled BSDF").inputs["Normal"])

leaves=[]
for i,color in enumerate([(.07,.16,.025),(.12,.23,.045),(.18,.29,.06),(.055,.12,.016),(.22,.30,.07)]):
    mat=material(f"Leaf | natural green {i}",color,.72)
    bsdf=mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Subsurface Weight"].default_value=.12
    leaves.append(mat)

woodverts,woodfaces=[],[]
leafverts,leaffaces,leafmats=[],[],[]

def branch(points,radii):
    offset=len(woodverts)
    for j,p in enumerate(points):
        tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
        side=tangent.cross(Vector((0,1,0))).normalized()
        up=tangent.cross(side).normalized()
        for k in range(10):
            a=math.tau*k/10
            woodverts.append(p+(side*math.cos(a)+up*math.sin(a))*radii[j]*(1+.08*math.sin(k*3+j)))
            if j:
                a0=offset+(j-1)*10+k
                b0=offset+(j-1)*10+(k+1)%10
                woodfaces.append((a0,b0,b0+10,a0+10))
    woodfaces.append(tuple(offset+k for k in reversed(range(10))))
    woodfaces.append(tuple(offset+(len(points)-1)*10+k for k in range(10)))

def leaf(p):
    direction=Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-.3,.8))).normalized()
    width=direction.cross(Vector((0,0,1))).normalized()
    length=random.uniform(.12,.23)
    offset=len(leafverts)
    leafverts.extend([p-direction*length*.5,p-width*length*.28,p+Vector((0,0,.025)),p+width*length*.28,p+direction*length*.5])
    leaffaces.extend([(offset,offset+1,offset+2),(offset+1,offset+4,offset+2),(offset+4,offset+3,offset+2),(offset+3,offset,offset+2)])
    shade=random.randrange(len(leaves))
    leafmats.extend([shade]*4)

trunk=[Vector((.10*math.sin(i*.7),.08*math.sin(i*1.1),i*.7)) for i in range(11)]
branch(trunk,[.30*(1-i/12)**1.3+.025 for i in range(11)])
# Root flares anchor the trunk naturally.
for i in range(7):
    a=math.tau*i/7
    branch([Vector((math.cos(a)*.85,math.sin(a)*.85,.015)),Vector((math.cos(a)*.38,math.sin(a)*.38,.12)),trunk[1]],[.025,.12,.14])

for i in range(28):
    z=random.uniform(2.1,6.8)
    a=i*2.39996
    length=2.9*(1-abs(z-4.3)/4.8)*random.uniform(.8,1.1)
    base=Vector((.10*math.sin(z),.06*math.cos(z),z))
    direction=Vector((math.cos(a),math.sin(a),random.uniform(.2,.65)))
    points=[base+direction*length*t+Vector((0,0,.4*t*t)) for t in [0,.2,.4,.6,.8,1]]
    branch(points,[.09*(1-j/6)**1.5+.008 for j in range(6)])
    for j in range(9):
        t=random.uniform(.35,1)
        origin=base+direction*length*t+Vector((0,0,.4*t*t))
        theta=a+random.uniform(-1.5,1.5)
        spread=random.uniform(.55,1.25)
        end=origin+Vector((math.cos(theta)*spread,math.sin(theta)*spread,random.uniform(.3,.85)))
        branch([origin,(origin+end)*.5+Vector((0,0,.08)),end],[.028,.014,.003])
        for k in range(8):
            twigbase=origin.lerp(end,k/8)
            tip=twigbase+Vector((random.uniform(-.4,.4),random.uniform(-.4,.4),random.uniform(.1,.5)))
            branch([twigbase,tip],[.007,.001])
            for n in range(11):
                p=twigbase.lerp(tip,random.random())+Vector((random.uniform(-.15,.15),random.uniform(-.15,.15),random.uniform(-.1,.15)))
                leaf(p)

def mesh_object(name,verts,faces,mats):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    for mat in mats:
        mesh.materials.append(mat)
    return obj

wood=mesh_object("Tree | trunk, roots and branching structure",woodverts,woodfaces,[bark])
for face in wood.data.polygons:
    face.use_smooth=True
foliage=mesh_object("Tree | individual folded leaves",leafverts,leaffaces,leaves)
for i,face in enumerate(foliage.data.polygons):
    face.material_index=leafmats[i]

ground=material("Ground | muted earth",(.095,.105,.073),1)
bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.name="Preview ground"
bpy.context.object.data.materials.append(ground)
world=bpy.data.worlds.new("Tree | soft daylight")
world.use_nodes=True
world.node_tree.nodes["Background"].inputs[0].default_value=(.43,.54,.66,1)
world.node_tree.nodes["Background"].inputs[1].default_value=.45
scene=bpy.context.scene
scene.world=world
bpy.ops.object.light_add(type="AREA",location=(-4,-5,11))
light=bpy.context.object
light.data.energy=2300
light.data.size=5
light.rotation_euler=(Vector((0,0,3))-light.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.camera_add(location=(11,-17,10))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,3.7))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=11.4
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=48
scene.render.resolution_x=1000
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.view_settings.view_transform="AgX"
scene.render.filepath=str(OUT/"realistic-tree-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"realistic-tree.blend"))
bpy.ops.render.render(write_still=True)
