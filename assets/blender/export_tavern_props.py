"""Bake the approved Blender materials into game textures and export individual props."""
from pathlib import Path
import bpy
import sys
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/game/models/props'
OUT.mkdir(parents=True,exist_ok=True)
source=ROOT/'assets/blender/tavern-props.blend'
for name,kind in [('Barrel','tavern-barrel'),('Chair','tavern-chair'),('Candlestick','tavern-candlestick'),('Metal mug','tavern-mug'),('Table','tavern-table')]:
    if '--only' in sys.argv and kind != sys.argv[sys.argv.index('--only')+1]: continue
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene=bpy.context.scene
    objects=list(bpy.data.collections[name].objects)
    # Boolean-cut faces can inherit an empty material slot; retain the object's wood there.
    for obj in objects:
        fallback=next((m for m in obj.data.materials if m is not None),None)
        for i,mat in enumerate(obj.data.materials):
            if mat is None and fallback is not None: obj.data.materials[i]=fallback
    others=[o for o in scene.objects if o not in objects and o.type in {'MESH','CURVE'}]
    for obj in others: obj.hide_render=True
    # Render a centered transparent sprite before changing the materials for baking.
    points=[o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center=(low+high)/2
    cam=scene.camera; cam.location=center+Vector((4,-6,4))
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=max(high.z-low.z,high.x-low.x,high.y-low.y)*1.7
    scene.render.film_transparent=True
    scene.render.resolution_x=512; scene.render.resolution_y=512
    scene.cycles.samples=24
    scene.render.filepath=str(ROOT/'public/game/decorations'/f'{kind}.png')
    bpy.ops.render.render(write_still=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.hide_set(False); obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    obj=bpy.context.object
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(island_margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    image=bpy.data.images.new(kind+' albedo',width=1024,height=1024)
    for mat in obj.data.materials:
        if mat is None: continue
        node=mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image=image
        mat.node_tree.nodes.active=node
    scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False
    scene.render.bake.use_pass_color=True; scene.render.bake.margin=12
    bpy.ops.object.bake(type='DIFFUSE')
    image.filepath_raw=str(OUT/f'{kind}-color.png'); image.file_format='PNG'; image.save()
    mat=bpy.data.materials.new(kind+' baked'); mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value=.75
    bsdf.inputs['Metallic'].default_value=.8 if kind=='tavern-mug' else 0
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
    mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    obj.data.materials.clear(); obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.material_index=0
    obj.location-=Vector((center.x,center.y,low.z))
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{kind}.glb'),use_selection=True,export_format='GLB')
