"""Editable snowy evergreen with modeled needles and uneven snow on its boughs."""
from pathlib import Path
import math
import random
import bpy
from mathutils import Vector

OUT=Path(__file__).resolve().parent
random.seed(7513)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name,color,roughness=1):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=roughness
    return mat

bark=material("Pine | weathered bark",(.095,.043,.018))
nodes=bark.node_tree.nodes
links=bark.node_tree.links
noise=nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value=32
noise.inputs["Detail"].default_value=4
bump=nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value=.6
bump.inputs["Distance"].default_value=.045
links.new(noise.outputs["Fac"],bump.inputs["Height"])
links.new(bump.outputs[0],nodes.get("Principled BSDF").inputs["Normal"])
needles=[material("Pine needles | green "+str(i),c,.85) for i,c in enumerate([
    (.012,.052,.028),(.02,.078,.038),(.035,.105,.05),(.018,.06,.034)])]
snow=material("Snow | powder with fine grain",(.83,.89,.94),.88)
bsdf=snow.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Subsurface Weight"].default_value=.08
grain=snow.node_tree.nodes.new("ShaderNodeTexNoise")
grain.inputs["Scale"].default_value=180
sb=snow.node_tree.nodes.new("ShaderNodeBump")
sb.inputs["Strength"].default_value=.18
sb.inputs["Distance"].default_value=.012
snow.node_tree.links.new(grain.outputs["Fac"],sb.inputs["Height"])
snow.node_tree.links.new(sb.outputs[0],bsdf.inputs["Normal"])

woodverts,woodfaces=[],[]
nv,nf,nm=[],[],[]
sv,sf=[],[]

def branch(points,radii):
    start=len(woodverts)
    for j,p in enumerate(points):
        direction=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
        side=direction.cross(Vector((0,1,0))).normalized()
        up=direction.cross(side).normalized()
        for k in range(8):
            a=math.tau*k/8
            woodverts.append(p+(side*math.cos(a)+up*math.sin(a))*radii[j])
            if j:
                prev=start+(j-1)*8+k
                nextp=start+(j-1)*8+(k+1)%8
                woodfaces.append((prev,nextp,nextp+8,prev+8))
    woodfaces.append(tuple(start+k for k in reversed(range(8))))
    woodfaces.append(tuple(start+(len(points)-1)*8+k for k in range(8)))

def needle_cluster(p,direction):
    direction=direction.normalized()
    side=direction.cross(Vector((0,0,1))).normalized()
    up=direction.cross(side).normalized()
    for i in range(22):
        a=random.uniform(0,math.tau)
        base=p+direction*random.uniform(-.13,.13)
        tip=base+(direction*.35+side*math.cos(a)+up*math.sin(a)).normalized()*random.uniform(.10,.20)
        width=.006
        offset=len(nv)
        nv.extend([base-side*width,base+side*width,tip])
        nf.append((offset,offset+1,offset+2))
        nm.append(random.randrange(4))

def snow_strip(points,width):
    # Uneven, rounded powder ridges sit above horizontal foliage, leaving tips exposed.
    start=len(sv)
    sections=7
    for j,p in enumerate(points):
        tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized()
        side=Vector((-tangent.y,tangent.x,0)).normalized()
        fade=math.sin(math.pi*(j+.4)/(len(points)-.2))**.45
        w=width*fade*random.uniform(.85,1.12)
        for k in range(sections):
            t=k/(sections-1)*2-1
            thickness=.035+.12*max(0,1-t*t)*fade
            sv.append(p+side*w*t+Vector((0,0,thickness+random.uniform(-.018,.018))))
            if j and k:
                a=start+(j-1)*sections+k-1
                sf.append((a,a+1,a+sections+1,a+sections))
    # Close the lower surface so caps remain solid from below.
    for j in range(len(points)-1):
        a=start+j*sections
        b=a+sections
        sf.append((a,b,b+sections-1,a+sections-1))
    sf.append(tuple(start+k for k in reversed(range(sections))))
    sf.append(tuple(start+(len(points)-1)*sections+k for k in range(sections)))

trunk=[Vector((.03*math.sin(i),.02*math.cos(i),i*.6)) for i in range(14)]
branch(trunk,[.23*(1-i/14)**1.3+.006 for i in range(14)])
for tier in range(18):
    z=1.05+tier*.365
    length=2.65*max(.025, (7.9-z)/6.85)**.95
    for b in range(5):
        angle=math.tau*b/5+tier*1.91+random.uniform(-.35,.35)
        d=Vector((math.cos(angle),math.sin(angle),0))
        branchlen=length*random.uniform(.7,1.16)
        origin=Vector((0,0,z+random.uniform(-.16,.16)))
        points=[origin+d*branchlen*t+Vector((0,0,-.24*math.sin(math.pi*t)+.18*t)) for t in [0,.2,.4,.6,.8,1]]
        branch(points,[.055*(1-i/6)**1.4+.003 for i in range(6)])
        for j in range(9):
            t=.15+j*.09
            p=origin+d*branchlen*t+Vector((0,0,-.24*math.sin(math.pi*t)+.18*t))
            for sign in [-1,1]:
                a=angle+sign*random.uniform(.5,1.0)
                td=Vector((math.cos(a),math.sin(a),.10))
                twiglen=(.58*(1-t)+.16)*random.uniform(.7,1.2)*min(1,branchlen/.85)
                twig=[p+td*twiglen*k/5 for k in range(6)]
                branch([twig[0],twig[-1]],[.014,.002])
                for point in twig:
                    needle_cluster(point,td)
                if random.random()<.62:
                    start=random.randint(0,2)
                    snow_strip(twig[start:random.randint(4,6)],.09*min(1,branchlen/.7))
        if tier<16 and random.random()<.7:
            snow_strip(points[random.randint(1,2):5],.12*min(1,branchlen))
# A single slender leader blends into the staggered upper boughs.
for j in range(9):
    z=7.35+j*.075
    length=.26*(1-j/10)
    for b in range(4):
        angle=j*1.8+b*math.tau/4
        direction=Vector((math.cos(angle),math.sin(angle),.7))
        base=Vector((0,0,z))
        tip=base+direction*length
        branch([base,tip],[.007,.001])
        for k in range(4):
            needle_cluster(base.lerp(tip,k/3),direction)
        if j<6 and random.random()<.5:
            snow_strip([base,base.lerp(tip,.5),tip],.035)

def mesh_object(name,verts,faces,mats):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    for mat in mats:
        mesh.materials.append(mat)
    return obj

wood=mesh_object("Snowy pine | trunk and branching boughs",woodverts,woodfaces,[bark])
for face in wood.data.polygons:
    face.use_smooth=True
foliage=mesh_object("Snowy pine | individual evergreen needles",nv,nf,needles)
for i,face in enumerate(foliage.data.polygons):
    face.material_index=nm[i]
caps=mesh_object("Snowy pine | uneven snow on branches",sv,sf,[snow])
for face in caps.data.polygons:
    face.use_smooth=True
bpy.ops.mesh.primitive_plane_add(size=200)
bpy.context.object.name="Preview | snow-covered ground"
bpy.context.object.data.materials.append(snow)

scene=bpy.context.scene
world=bpy.data.worlds.new("Winter | overcast sky")
world.use_nodes=True
world.node_tree.nodes["Background"].inputs[0].default_value=(.52,.63,.78,1)
world.node_tree.nodes["Background"].inputs[1].default_value=.55
scene.world=world
bpy.ops.object.light_add(type="AREA",location=(-5,-7,12))
light=bpy.context.object
light.data.energy=2200
light.data.size=7
light.rotation_euler=(Vector((0,0,3))-light.location).to_track_quat("-Z","Y").to_euler()
bpy.ops.object.camera_add(location=(11,-17,9))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,3.8))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=10.6
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=48
scene.render.resolution_x=1000
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.view_settings.view_transform="AgX"
scene.render.filepath=str(OUT/"snowy-pine-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"snowy-pine.blend"))
bpy.ops.render.render(write_still=True)
