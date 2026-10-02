"""Export only the approved trees, excluding preview cameras, lights and ground."""
from pathlib import Path
import math
import bpy

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"public/game/models/trees"
OUT.mkdir(parents=True,exist_ok=True)
for source, prefix, target in [("realistic-tree.blend","Tree |","broadleaf"),("snowy-pine.blend","Snowy pine |","snowy-pine")]:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/"assets/blender"/source))
    bpy.ops.object.select_all(action="DESELECT")
    selected=[o for o in bpy.context.scene.objects if o.type=="MESH" and o.name.startswith(prefix)]
    for obj in selected:
        obj.select_set(True)
        if "trunk" in obj.name:
            # Preserve bark ridges as vertex color; procedural Blender nodes aren't glTF materials.
            color=obj.data.color_attributes.new(name="BarkColor",type="FLOAT_COLOR",domain="CORNER")
            for polygon in obj.data.polygons:
                for loop in polygon.loop_indices:
                    p=obj.data.vertices[obj.data.loops[loop].vertex_index].co
                    shade=.7+.22*math.sin(p.x*88+p.y*73+math.sin(p.z*4))+.08*math.sin(p.z*37)
                    color.data[loop].color=(.14*shade,.085*shade,.045*shade,1)
            mat=bpy.data.materials.new("Game bark | vertex ridges")
            mat.use_nodes=True
            bsdf=mat.node_tree.nodes.get("Principled BSDF")
            bsdf.inputs["Roughness"].default_value=.95
            node=mat.node_tree.nodes.new("ShaderNodeVertexColor")
            node.layer_name="BarkColor"
            mat.node_tree.links.new(node.outputs["Color"],bsdf.inputs["Base Color"])
            obj.data.materials.clear()
            obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active=selected[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT/(target+".glb")),use_selection=True,export_format="GLB",export_yup=True)
